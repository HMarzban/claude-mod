// The context chip, its compaction countdown and toasts, and the tokens chip.

import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  USAGE,
  PLUGIN,
  START,
  HOUR_1,
  base,
  props,
  resp,
  respond,
  toasts,
  textOf,
  pillOf,
  breakdown,
  fact,
} from './helpers'

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
      breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }),
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

test('toasts fire once per threshold crossing and re-arm below 75%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const at = async (percent: number) =>
    $.session.measure({ context: { window: 200_000, percent }, rateLimits: [], changed: [] })

  await at(82)
  await at(84)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/Context is 82% full/)
  await at(96)
  expect(toasts).toHaveLength(2)
  await at(70)
  await at(81)
  expect(toasts).toHaveLength(3)
})

test('near auto-compaction the context toast says so, as the pill does', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const near = {
    ...USAGE,
    context: {
      tokens: 146_000,
      window: 200_000,
      percent: 73,
      breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }),
    },
  }
  base(on, near)
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 146_000, window: 200_000, percent: 73 }, rateLimits: [], changed: [] })
  expect(toasts.some(t => /Auto-compaction in ~14k tokens/.test(t))).toBe(true)
})

test('with auto-compaction off the context toast says the conversation will run out of room', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const off = {
    ...USAGE,
    context: { tokens: 164_000, window: 200_000, percent: 82, breakdown: breakdown({ isAutoCompactEnabled: false }) },
  }
  base(on, off)
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 164_000, window: 200_000, percent: 82 }, rateLimits: [], changed: [] })
  expect(toasts.some(t => /82% full.*auto-compaction is off/.test(t))).toBe(true)
})

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
  expect(textOf(tokens)).toMatch(/input 120k · output 5\.0k · cache reads 100k/) // its hover card
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'input')).toBe('120k')
  expect(fact(tree, 'output')).toBe('5.0k')
  expect(fact(tree, 'cache reads')).toBe('100k')
  await ui.unmount()
})


test('auto-compaction on without a threshold gets the plain wording, not "off"', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, context: { tokens: 164_000, window: 200_000, percent: 82, breakdown: breakdown({ isAutoCompactEnabled: true }) } })
  await $.session.start(START)
  await $.session.measure({ context: { tokens: 164_000, window: 200_000, percent: 82 }, rateLimits: [], changed: [] })
  expect(toasts).toContain('Context is 82% full.')
})
