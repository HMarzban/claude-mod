// The expanded line, its buttons, /usage-band, and yielding to surveys.

import { test, expect, mock } from 'claude-code/testing'
import {
  PLUGIN,
  START,
  HOUR_1,
  base,
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
  walk,
  type Node,
} from './helpers'

test('⋯ toggles the expanded line, and Hide hides the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(3) // the row, the cards, the buttons

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
  for (const [name, title] of [['cache', 'Cache'], ['spend', 'Spend'], ['context', 'Context'], ['limits', 'Limits']] as const) {
    expect(shown(cardOf(tree, name))).toMatch(new RegExp(`^${title}`))
  }
  await ui.unmount()
})

test('the cache card: time left, hit rate, lifetime and calls', async ($, on) => {
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
  expect(fact(tree, 'served from cache')).toBe('45%') // 100k of 220k input
  expect(fact(tree, 'lifetime')).toBe('1h')
  expect(fact(tree, 'model calls')).toBe('2')
  expect(fact(tree, 'rebuilds')).toBeUndefined() // shown only when there is one
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
  expect(shown(cardOf(tree, 'spend'))).toMatch(/Spend\$2\.41/)
  expect(fact(tree, 'last message')).toBe('$0.41')
  expect(fact(tree, 'sent')).toBe('120k')
  expect(fact(tree, 'back')).toBe('5.0k')
  expect(fact(tree, 'from cache')).toBe('100k')
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
  expect(shown(cardOf(tree, 'context'))).toMatch(/152k of 200k/)
  expect(fact(tree, 'auto-compacts at')).toBe('160k')
  expect(fact(tree, 'to go')).toBe('8.0k')
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
  expect(fact(tree, '5h')).toBe('4% · resets 3h 00m')
  expect(fact(tree, '7d')).toBe('30% · resets 2d 19h')
  expect(fact(tree, 'spend')).toBe('92%! · resets 5h 00m') // past 80%: marked, never colour alone
  await ui.unmount()
})

test('Collapse and Hide are real buttons with c and h hotkeys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  let collapse: Node | undefined
  let hide: Node | undefined
  walk(await ui.drawn(), n => {
    if (n.type === 'Button' && n.props?.key === 'collapse') collapse = n
    if (n.type === 'Button' && n.props?.key === 'hide') hide = n
  })
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
