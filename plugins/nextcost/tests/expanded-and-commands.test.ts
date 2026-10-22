// The expanded line, its buttons, /nextcost, and yielding to surveys.

import { test, expect } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  PLUGIN,
  START,
  byKey,
  props,
  resp,
  respond,
  runCommand,
  rowCount,
  cardOf,
  fact,
  shown,
  turn,
  USAGE,
  HOUR,
  hostClock,
  MODERN,
  usageAt,
  type Node,
  svgsOf,
  walk,
  setup,
  mountBand,
  engine,
} from './helpers'

test('the toggle opens the cards, and Hide hides the band', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, resp(41_000, 0, 155_000, 12_000))

  const ui = await mountBand($, 'terminal', 110)
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(4) // the row, the workspace strip, the cards, the buttons

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

test('/nextcost more, less, hide and show drive the band', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, resp(41_000, 0, 155_000, 12_000))

  const ui = await mountBand($, 'terminal', 110)

  await runCommand($, 'more')
  expect(cardOf(await ui.drawn(), 'cache')).toBeDefined()
  await runCommand($, 'less')
  expect(cardOf(await ui.drawn(), 'cache')).toBeUndefined()
  await runCommand($, 'hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await runCommand($, 'show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props(110), hasSurvey: true },
  })
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeUndefined()
  await ui.unmount()
})

// ── the cards ──────────────────────────────────────────────────────────

test('the expanded view is four labelled cards', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  for (const [name, title] of [['cache', 'CACHE'], ['spend', 'SPEND'], ['context', 'CONTEXT'], ['limits', 'LIMITS']] as const) {
    expect(shown(cardOf(tree, name))).toMatch(new RegExp(`^${title}`))
  }
  await ui.unmount()
})

test('the spend card: session total, last message and the token split', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await turn($, 't1', 2.0, 2.41)
  await respond($, resp(10_000, 0, 100_000, 2_000))
  await respond($, resp(4_000, 100_000, 6_000, 3_000))
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'spend'))).toMatch(/^SPEND\$2\.41/)
  expect(fact(tree, 'last message')).toBe('$0.41')
  expect(fact(tree, 'input')).toBe('120k')
  expect(fact(tree, 'output')).toBe('5.0k')
  expect(fact(tree, 'cache reads')).toBe('100k')
  await ui.unmount()
})

test('the limits card: each window with its usage and reset', async ($, on) => {
  setup(on, {
    usage: usageAt(MODERN, {
      ...USAGE,
      rateLimits: [...USAGE.rateLimits, { kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }],
    }),
    now: MODERN,
  })
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, '5h')).toBe('4%')
  expect(fact(tree, '7d')).toBe('30%')
  expect(fact(tree, 'spend')).toBe('92%!') // past 80%: marked, never colour alone
  // The worst, spend, leads with its reset; no window length, so no pace.
  expect(fact(tree, 'resets')).toBe(hostClock(MODERN + 5 * HOUR, MODERN))
  expect(fact(tree, '5h pace')).toBe('5h resets 3h 00m · on pace for ~10%')
  await ui.unmount()
})

test('Collapse and Hide band are real buttons with c and h hotkeys, beside how to bring the band back', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'desktop', 110)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  const collapse = byKey(tree, 'collapse', 'Button')
  const hide = byKey(tree, 'hide', 'Button')
  // Collapse, then Hide band, each its word alone, without a Ctrl-like glyph.
  const labels: string[] = []
  walk(tree, n => {
    if (n.type === 'Button' && (n.props?.key === 'collapse' || n.props?.key === 'hide')) labels.push(String(n.props?.label))
  })
  expect(labels).toEqual(['Collapse', 'Hide band'])
  expect(shown(tree)).toMatch(/Bring it back with \/nextcost/)
  expect(collapse?.props?.hotkey).toBe('c')
  expect(collapse?.props?.variant).toBe('secondary')
  expect(hide?.props?.hotkey).toBe('h')
  // Neither is the one to press: the calm band marks no main action, least
  // of all hiding itself.
  expect(hide?.props?.variant).toBe('secondary')

  await ui.press({ key: 'collapse' })
  expect(rowCount(await ui.drawn())).toBe(1)
  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

// ── card layout ────────────────────────────────────────────────────────

test("the cache card's bar reads as the time left, as its battery does", async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond($, resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'desktop', 95)
  await ui.press({ key: 'more' })
  const alts = svgsOf(cardOf(await ui.drawn(), 'cache')).map(n => String(n.props?.alt))
  expect(alts).toContain('cache 100% left')
  expect(alts.some(alt => /used/.test(alt))).toBe(false)
  await ui.unmount()
})

test("a card's bar stretches across the card", async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond($, resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'desktop', 95)
  await ui.press({ key: 'more' })
  // no fixed width: the slot caps the drawing, so it spans whatever the card gets
  const bar = svgsOf(cardOf(await ui.drawn(), 'cache')).find(n => /left/.test(String(n.props?.alt)))
  expect(bar?.props?.width).toBeUndefined()
  expect(String(bar?.props?.source)).toContain('preserveAspectRatio="none"')
  await ui.unmount()

  // still expanded: the open view is the session's, not the mount's
  const term = await mountBand($, 'terminal', 120)
  const meter = shown(cardOf(await term.drawn(), 'cache')).match(/[█░┃]+/)?.[0] ?? ''
  expect(meter.length).toBeGreaterThan(12)
  await term.unmount()
})

test('the token split shows cache reads in the warm colour, so the bar never looks empty', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond($, resp(1_000, 0, 10_000, 200))
  await respond($, resp(500, 900_000, 1_000, 200)) // nearly all from cache
  const ui = await mountBand($, 'desktop', 95)
  await ui.press({ key: 'more' })
  const split = svgsOf(cardOf(await ui.drawn(), 'spend')).find(n => /token split/.test(String(n.props?.alt)))
  expect(String(split?.props?.source)).toContain(DARK.warm)
  expect(String(split?.props?.source)).not.toContain(`fill="${DARK.meterTrack}"`)
  await ui.unmount()
})

test('a gap separates the expanded view from the row of chips', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  // whatever comes first under the chips, the strip or, without it, the cards
  const under = ((await ui.drawn()) as Node).children?.filter(Boolean)[1] as Node | undefined
  expect(under?.props?.marginTop).toBe(1)
  await ui.unmount()
})

test('the commands are registered before the band reads a transcript to recall the last reply', async ($, on) => {
  setup(on, { env: { HOME: '/Users/me' } })
  // How many commands were registered when the recall's tail first read the transcript.
  let registeredAtRead: number | undefined
  Object.defineProperty(engine, 'transcript', {
    configurable: true,
    enumerable: true,
    get: () => {
      if (engine.ran.at(-1)?.[0] === 'tail') registeredAtRead ??= engine.commands.length
      return undefined
    },
    // The next test's reset makes it a plain field again.
    set: (value: string | undefined) => {
      Object.defineProperty(engine, 'transcript', { value, writable: true, configurable: true, enumerable: true })
    },
  })
  await $.session.start(START)
  expect(registeredAtRead).toBe(2)
  expect(engine.commands).toEqual(['nextcost', 'usage-band'])
})
