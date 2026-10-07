import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import { PLUGIN, USAGE, base, firstRow, props, resp, respond, textOf, usage, walk, type Node } from './helpers'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }

const pillOf = (tree: unknown, key: string): Node | undefined => {
  let found: Node | undefined
  walk(firstRow(tree), n => {
    if (found === undefined && n.type === 'Box' && n.props?.key === key) found = n
  })
  return found
}
const svgs = (n: unknown): Node[] => {
  const out: Node[] = []
  walk(n, k => {
    if (k.type === 'Svg') out.push(k)
  })
  return out
}
/** Visible text of a pill: its hover card left out. */
const shown = (n: Node | undefined): string =>
  ((n?.children ?? []) as Node[]).filter(k => k?.props?.position !== 'absolute').map(textOf).join('')

const turn = async ($: { turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> } }) => {
  usage.current = { ...usage.current, cost: { usd: 2.0 } }
  await $.turn.start({ text: 'hi', turnId: 't1' } as never)
  usage.current = { ...usage.current, cost: { usd: 2.41 } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as never)
}

test('the 5h and 7d chips show usage, a pace tick and the reset countdown', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // 5h 4%, resets in 3h; 7d 30%, resets in 67h
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(160) })
  const tree = await ui.drawn()
  const five = pillOf(tree, '5h')
  const week = pillOf(tree, '7d')
  expect(shown(five)).toMatch(/5h.*4%.*3h 00m/)
  expect(shown(week)).toMatch(/7d.*30%.*2d 19h/)
  expect(five?.props?.backgroundColor).toBe(DARK.fiveBg)
  expect(week?.props?.backgroundColor).toBe(DARK.weekBg)
  // the tick marks the share of the window gone: 2h of 5h, 101h of 168h
  const tickX = (n: Node | undefined) => Number(String(svgs(n).find(s => /%$/.test(String(s.props?.alt)))?.props?.source).match(/class="tick" x="(\d+)"/)?.[1])
  expect(tickX(five)).toBe(Math.round(0.4 * 44) - 1)
  expect(tickX(week)).toBe(Math.round((101 / 168) * 44) - 1)
  const alts = svgs(firstRow(tree)).map(s => String(s.props?.alt))
  expect(alts).toContain('five-hour')
  expect(alts).toContain('week')
  expect(alts).toContain('resets')
  await ui.unmount()
})

test('the 7d chip turns amber at 80%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'seven_day', percentUsed: 85, resetsAt: new Date(30 * 3600_000).toISOString() }] })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  const week = pillOf(await ui.drawn(), '7d')
  expect(week?.props?.backgroundColor).toBe(DARK.amberBg)
  expect(shown(week)).toMatch(/85%!/)
  await ui.unmount()
})

test('cost, tokens and context drop their labels; the expanded line keeps last $', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await turn($ as never)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  const tree = await ui.drawn()
  expect(shown(pillOf(tree, 'cost'))).not.toMatch(/last/)
  expect(shown(pillOf(tree, 'tokens'))).not.toMatch(/tokens/)
  expect(shown(pillOf(tree, 'ctx'))).not.toMatch(/context/)
  await ui.press({ key: 'more' })
  expect(textOf(await ui.drawn())).toMatch(/last message \$0\.41/)
  await ui.unmount()
})

test('the terminal draws the limit chips with text meters and a reset glyph', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  const tree = await ui.drawn()
  expect(shown(pillOf(tree, '5h'))).toMatch(/5h [█░]{6} 4% │ ↻ 3h 00m/)
  expect(shown(pillOf(tree, '7d'))).toMatch(/7d [█░]{6} 30% │ ↻ 2d 19h/)
  expect(svgs(tree)).toHaveLength(0)
  await ui.unmount()
})

test('as the band narrows, pieces give way in the agreed order', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const pieces: Record<string, (t: unknown) => boolean> = {
    tokens: t => pillOf(t, 'tokens') !== undefined,
    weekReset: t => /2d 19h/.test(shown(pillOf(t, '7d'))),
    fiveReset: t => /3h 00m/.test(shown(pillOf(t, '5h'))),
    ctxMeter: t => /[█░]{6}/.test(shown(pillOf(t, 'ctx'))),
    week: t => pillOf(t, '7d') !== undefined,
  }
  // the widest band at which each piece is gone
  const goneAt: Record<string, number> = {}
  for (let cols = 170; cols >= 40; cols -= 1) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(cols) })
    const tree = await ui.drawn()
    for (const [name, present] of Object.entries(pieces)) {
      if (goneAt[name] === undefined && !present(tree)) goneAt[name] = cols
    }
    await ui.unmount()
  }
  const order = ['tokens', 'weekReset', 'fiveReset', 'ctxMeter', 'week']
  for (let i = 1; i < order.length; i++) {
    expect(goneAt[order[i - 1]!]! >= goneAt[order[i]!]!).toBe(true)
  }
  expect(goneAt.tokens).toBeDefined()
})
