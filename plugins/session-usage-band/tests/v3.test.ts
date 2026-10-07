import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import { PLUGIN, USAGE, base, firstRow, props, resp, respond, textOf, usage, walk, type Node } from './helpers'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }
const MIN = 60_000

/** The pill Box drawn under `key` in the first row. */
const pillOf = (tree: unknown, key: string): Node | undefined => {
  let found: Node | undefined
  walk(firstRow(tree), n => {
    if (found === undefined && n.type === 'Box' && n.props?.key === key) found = n
  })
  return found
}

/** The pill's own Texts with a background: the battery's segments. */
const segments = (pill: Node | undefined): Array<{ text: string; bg: unknown }> =>
  ((pill?.children ?? []) as Node[])
    .filter(k => k?.type === 'Text' && k.props?.backgroundColor !== undefined)
    .map(k => ({ text: textOf(k), bg: k.props?.backgroundColor }))

const svgAlts = (tree: unknown): string[] => {
  const out: string[] = []
  walk(tree, n => {
    if (n.type === 'Svg') out.push(String(n.props?.alt))
  })
  return out
}

// ── the battery ────────────────────────────────────────────────────────

test('the cache pill is a battery that drains with the hour', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/◷ cache 1h 00m/)
  expect(seg[0]?.bg).toBe(DARK.batteryFill)
  expect(seg.filter(x => x.bg === DARK.batteryFill).map(x => x.text).join('').length).toBe(seg.map(x => x.text).join('').length)

  await clock.advance(30 * MIN) // half the hour gone: about half the pill filled
  seg = segments(pillOf(await ui.drawn(), 'cache'))
  const all = seg.map(x => x.text).join('').length
  const filled = seg.filter(x => x.bg === DARK.batteryFill).map(x => x.text).join('').length
  expect(Math.abs(filled - all / 2)).toBeLessThanOrEqual(1)

  await clock.advance(31 * MIN) // cold: empty and neutral
  seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/cache cold/)
  expect(seg.some(x => x.bg === DARK.batteryFill || x.bg === DARK.batteryAmber)).toBe(false)
  await ui.unmount()
})

test('in its last minute the battery turns amber', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(60 * MIN - 30_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/0:30 left/)
  expect(seg.some(x => x.bg === DARK.amberBg)).toBe(true)
  await ui.unmount()
})

// ── icons ──────────────────────────────────────────────────────────────

test('desktop draws a coin, a tokens and a context icon; the terminal uses glyphs', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(140) })
  const alts = svgAlts(await desk.drawn())
  expect(alts).toContain('cost')
  expect(alts).toContain('tokens')
  expect(alts).toContain('context')
  expect(textOf(firstRow(await desk.drawn()))).toMatch(/\$2\.41/)
  await desk.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  const tree = await term.drawn()
  expect(svgAlts(tree)).toHaveLength(0)
  expect(textOf(firstRow(tree))).toMatch(/Σ/)
  expect(textOf(firstRow(tree))).toMatch(/◔/)
  await term.unmount()
})

// ── tokens ─────────────────────────────────────────────────────────────

test('the tokens chip totals every token and breaks them down', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  const tokens = pillOf(await ui.drawn(), 'tokens')
  expect(textOf(tokens)).toMatch(/225k/)
  expect(textOf(tokens)).toMatch(/sent 120k · back 5\.0k · from cache 100k/) // its hover card
  await ui.press({ key: 'more' })
  expect(textOf(await ui.drawn())).toMatch(/tokens: sent 120k · back 5\.0k · from cache 100k/)
  await ui.unmount()
})

test('the tokens chip shows whenever it fits, even below 100 columns', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [] }) // room for it without the limit chips
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(95) })
    expect(textOf(pillOf(await ui.drawn(), 'tokens'))).toMatch(/112k/)
    await ui.unmount()
  }
})

test('the tokens chip is the first to give way on a narrower band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(62) })
  expect(pillOf(await ui.drawn(), 'tokens')).toBeUndefined()
  expect(pillOf(await ui.drawn(), 'ctx')).toBeDefined()
  await ui.unmount()
})

// ── context ────────────────────────────────────────────────────────────

test('the context chip shows tokens of the window', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(textOf(pillOf(await ui.drawn(), 'ctx'))).toMatch(/76k \/ 200k/)
  await ui.unmount()
})

test('near auto-compaction the context chip turns amber and counts down', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const near = {
    ...USAGE,
    context: {
      tokens: 152_000,
      window: 200_000,
      percent: 76,
      breakdown: { autoCompactThreshold: 160_000, isAutoCompactEnabled: true } as never,
    },
  }
  base(on, near)
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 152_000, window: 200_000, percent: 76 }, rateLimits: near.rateLimits, cost: near.cost, changed: [] })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const ctx = await ui.find({ type: 'Text', text: /compacts in ~8\.0k/ })
  expect(ctx).toBeDefined()
  expect(ctx?.props?.color).toBe(DARK.amberFg)
  await ui.unmount()
})

// ── the desktop battery ────────────────────────────────────────────────

const batteryOf = (tree: unknown): Node | undefined => {
  let found: Node | undefined
  walk(pillOf(tree, 'cache'), n => {
    if (found === undefined && n.type === 'Svg' && /^battery/.test(String(n.props?.alt))) found = n
  })
  return found
}
const fillWidth = (svg: Node | undefined): number => {
  const m = String(svg?.props?.source).match(/<rect class="charge" [^>]*width="([\d.]+)"/)
  return m ? Number(m[1]) : 0
}

test('on desktop the cache pill is a rounded pill with a draining battery icon', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  let tree = await ui.drawn()
  expect(pillOf(tree, 'cache')?.props?.backgroundColor).toBe(DARK.surface) // a normal, rounded pill
  expect(textOf(pillOf(tree, 'cache'))).toMatch(/cache 1h 00m/)
  const full = fillWidth(batteryOf(tree))
  expect(String(batteryOf(tree)?.props?.alt)).toBe('battery 100% left')
  expect(String(batteryOf(tree)?.props?.source)).toContain(DARK.dotWarm)

  await clock.advance(30 * MIN)
  tree = await ui.drawn()
  expect(fillWidth(batteryOf(tree))).toBeLessThan(full)
  // redrawn when the countdown text changes, so up to a minute behind
  expect(String(batteryOf(tree)?.props?.alt)).toMatch(/^battery 5[0-2]% left$/)

  await clock.advance(30 * MIN - 30_000) // last minute: amber
  tree = await ui.drawn()
  expect(pillOf(tree, 'cache')?.props?.backgroundColor).toBe(DARK.amberBg)
  expect(String(batteryOf(tree)?.props?.source)).toContain(DARK.amberFg)

  await clock.advance(60_000) // cold: empty
  tree = await ui.drawn()
  expect(String(batteryOf(tree)?.props?.alt)).toBe('battery empty')
  expect(fillWidth(batteryOf(tree))).toBe(0)
  await ui.unmount()
})
