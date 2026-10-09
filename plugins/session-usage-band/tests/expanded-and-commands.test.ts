// The expanded line, its buttons, /usage-band, and yielding to surveys.

import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  PLUGIN,
  START,
  HOUR_1,
  base,
  byKey,
  props,
  resp,
  respond,
  usage,
  textOf,
  rowCount,
  cardOf,
  fact,
  shown,
  turn,
  USAGE,
  HOUR,
  breakdown,
  type Node,
  svgsOf,
} from './helpers'

test('the toggle opens the cards, and Hide hides the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
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

test('/usage-band more, less, hide and show drive the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const run = (args: string): Promise<unknown> =>
    $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })

  await run('more')
  expect(cardOf(await ui.drawn(), 'cache')).toBeDefined()
  await run('less')
  expect(cardOf(await ui.drawn(), 'cache')).toBeUndefined()
  await run('hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await run('show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
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

test('/usage-band with an unknown word says how to use it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const result = await $.command.run({ command: 'usage-band', args: 'sideways', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  expect(JSON.stringify(result)).toMatch(/Usage: \/usage-band \[more \| less \| show \| hide\]/)
})


// ── the cards ──────────────────────────────────────────────────────────

test('the expanded view is four labelled cards', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  for (const [name, title] of [['cache', 'CACHE'], ['spend', 'SPEND'], ['context', 'CONTEXT'], ['limits', 'LIMITS']] as const) {
    expect(shown(cardOf(tree, name))).toMatch(new RegExp(`^${title}`))
  }
  await ui.unmount()
})

test('the cache card: time left, hit rate and expiry', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'cache'))).toMatch(/1h 00m left/)
  expect(fact(tree, 'hit rate')).toBe('45%') // 100k of 220k input
  expect(fact(tree, 'expires')).toBe('1h idle')
  expect(fact(tree, 'unexpected rebuilds')).toBeUndefined() // shown only when there is one
  await ui.unmount()
})

test('the spend card: session total, last message and the token split', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'spend'))).toMatch(/^SPEND\$2\.41/)
  expect(fact(tree, 'last message')).toBe('$0.41')
  expect(fact(tree, 'input')).toBe('120k')
  expect(fact(tree, 'output')).toBe('5.0k')
  expect(fact(tree, 'cache reads')).toBe('100k')
  await ui.unmount()
})

test('the context card: used of the window, and where compaction runs', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const near = {
    ...USAGE,
    context: { tokens: 152_000, window: 200_000, percent: 76, breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }) },
  }
  base(on, near)
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 152_000, window: 200_000, percent: 76 }, rateLimits: near.rateLimits, cost: near.cost, changed: [] })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'context'))).toMatch(/^CONTEXT95% full/)
  expect(fact(tree, 'auto-compacts at')).toBe('160k')
  expect(fact(tree, 'room left')).toBe('~8.0k')
  await ui.unmount()
})

test('the limits card: each window with its usage and reset', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, {
    ...USAGE,
    rateLimits: [...USAGE.rateLimits, { kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }],
  })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, '5h')).toBe('4%')
  expect(fact(tree, '7d')).toBe('30%')
  expect(fact(tree, 'spend')).toBe('92%!') // past 80%: marked, never colour alone
  expect(fact(tree, 'spend pace')).toBe('resets 5h 00m') // no window length, so no pace
  await ui.unmount()
})

test('Collapse and Hide are real buttons with c and h hotkeys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  const collapse = byKey(tree, 'collapse', 'Button')
  const hide = byKey(tree, 'hide', 'Button')
  expect(collapse?.props?.hotkey).toBe('c')
  expect(collapse?.props?.variant).toBe('secondary')
  expect(hide?.props?.hotkey).toBe('h')
  expect(hide?.props?.variant).toBe('primary')
  expect(String(hide?.props?.label)).toMatch(/Hide band/)

  await ui.press({ key: 'collapse' })
  expect(rowCount(await ui.drawn())).toBe(1)
  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

// ── card layout ────────────────────────────────────────────────────────

test("a card's bar stretches across the card", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95) })
  await ui.press({ key: 'more' })
  // no fixed width: the slot caps the drawing, so it spans whatever the card gets
  const bar = svgsOf(cardOf(await ui.drawn(), 'cache')).find(n => /used/.test(String(n.props?.alt)))
  expect(bar?.props?.width).toBeUndefined()
  expect(String(bar?.props?.source)).toContain('preserveAspectRatio="none"')
  await ui.unmount()

  // still expanded: the open view is the session's, not the mount's
  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(120) })
  const meter = shown(cardOf(await term.drawn(), 'cache')).match(/[█░┃]+/)?.[0] ?? ''
  expect(meter.length).toBeGreaterThan(12)
  await term.unmount()
})

test('the token split shows cache reads in the warm colour, so the bar never looks empty', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(1_000, 0, 10_000, 200))
  await respond(e => $.turn.step(e), resp(500, 900_000, 1_000, 200)) // nearly all from cache
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95) })
  await ui.press({ key: 'more' })
  const split = svgsOf(cardOf(await ui.drawn(), 'spend')).find(n => /token split/.test(String(n.props?.alt)))
  expect(String(split?.props?.source)).toContain(DARK.warm)
  expect(String(split?.props?.source)).not.toContain(`fill="${DARK.meterTrack}"`)
  await ui.unmount()
})

test('a gap separates the expanded view from the row of chips', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  // whatever comes first under the chips, the strip or, without it, the cards
  const under = ((await ui.drawn()) as Node).children?.filter(Boolean)[1] as Node | undefined
  expect(under?.props?.marginTop).toBe(1)
  await ui.unmount()
})
