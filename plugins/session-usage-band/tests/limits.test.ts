// The 5h and 7d limit chips: usage, pace, resets and their toasts.

import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  USAGE,
  PLUGIN,
  START,
  HOUR_1,
  MIN,
  HOUR,
  CLEAR,
  base,
  props,
  resp,
  respond,
  usage,
  toasts,
  textOf,
  firstRow,
  pillOf,
  shown,
  svgsOf,
  breakdown,
  type Node,
  fact,
  cardOf,
} from './helpers'

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
  const tickX = (n: Node | undefined) => Number(String(svgsOf(n).find(s => /% used/.test(String(s.props?.alt)))?.props?.source).match(/class="tick" x="(\d+)"/)?.[1])
  expect(tickX(five)).toBe(Math.round(0.4 * 44) - 1)
  expect(tickX(week)).toBe(Math.round((101 / 168) * 44) - 1)
  const alts = svgsOf(firstRow(tree)).map(s => String(s.props?.alt))
  expect(alts).toContain('five-hour')
  expect(alts).toContain('week')
  expect(alts).toContain('resets')
  await ui.unmount()
})

test('context and 5h escalate to amber at 80% and mark 95%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, {
    ...USAGE,
    context: { tokens: 164_000, window: 200_000, percent: 82 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 96, resetsAt: new Date(3600_000).toISOString() }],
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const ctx = await ui.find({ type: 'Text', text: /164k \/ 200k!$/ })
  expect(ctx?.props?.color).toBe(DARK.amberFg)
  const five = await ui.find({ type: 'Text', text: /96%!!/ })
  expect(five?.props?.color).toBe(DARK.amberFg)
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

test('the 5h pill shows your pace once there is enough evidence, and drops it when stale', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const resetsAt = new Date(3 * 3600_000).toISOString()
  const at = (pct: number) => ({ ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] })
  base(on, at(40))
  await $.session.start(START)
  const measure = async (pct: number) => {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
  }
  await measure(40)
  await clock.advance(12 * 60_000)
  await measure(46)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const five = await ui.find({ type: 'Text', text: /full in ~1h 45m/ })
  expect(five).toBeDefined()
  expect(five?.props?.color).toBe(DARK.amberFg)

  await clock.advance(16 * 60_000)
  expect(await ui.find({ type: 'Text', text: /full in/ })).toBeUndefined()
  await ui.unmount()
})

test('reset countdowns keep moving while the cache is cold', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // 5h resets at 3h
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(70 * MIN) // cold

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  expect(shown(pillOf(await ui.drawn(), '5h'))).toMatch(/1h 50m/)
  await clock.advance(45 * MIN)
  expect(shown(pillOf(await ui.drawn(), '5h'))).toMatch(/1h 05m/)
  await ui.unmount()
})

test('a window past its reset shows as reset, not as stale usage', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: new Date(HOUR).toISOString() }] })
  await $.session.start(START)
  await clock.advance(2 * HOUR)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  const five = pillOf(await ui.drawn(), '5h')
  expect(shown(five)).toMatch(/5h.*reset/)
  expect(shown(five)).not.toMatch(/92%/)
  expect(five?.props?.backgroundColor).toBe(DARK.fiveBg)
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), '5h')).toBe('reset')
  await ui.unmount()
})

test('/clear keeps the 5h pace and does not repeat its toast', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const resetsAt = new Date(3 * 3600_000).toISOString()
  const at = (pct: number) => ({ ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] })
  base(on, at(80))
  await $.session.start(START)
  const measure = async (pct: number) => {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
  }
  await measure(80)
  await clock.advance(12 * MIN)
  await measure(85)
  expect(toasts).toHaveLength(1)

  await $.session.end(CLEAR)
  await measure(85)
  expect(toasts).toHaveLength(1)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /85%! full in ~/ })).toBeDefined()
  await ui.unmount()
})

test('a failing breakdown read keeps the 5h toast', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const at85 = { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: new Date(3 * HOUR).toISOString() }] }
  base(on, at85)
  usage.breakdownFails = true
  await $.session.start(START)
  await $.session.measure({ context: at85.context, rateLimits: at85.rateLimits, cost: at85.cost, changed: [] })
  expect(toasts.some(t => /85% of your 5-hour limit/.test(t))).toBe(true)
})

test('no rate limits: the band draws without the 5h pill or limit facts', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [] })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(cardOf(tree, 'cache')).toBeDefined()
  expect(cardOf(tree, 'limits')).toBeUndefined()
  await ui.unmount()
})

test('a gateway spend limit is listed in the expanded line', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * 3600_000).toISOString() }] })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), 'spend')).toBe('92%! · resets 5h 00m') // past 80%: marked, never colour alone
  await ui.unmount()
})
