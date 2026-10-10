import { test, expect } from 'claude-code/testing'
import { recordResponse, resetCache, takeRebuilt } from '../hooks/cache'
import { COST_TRAIL, CONTEXT_TRAIL, FIVE_HOUR_TRAIL, noteFiveHourTrail, pushContext, pushCost, resetConversationInsights, resetInsights, trails } from '../hooks/insights'
import { asLimitSamples } from '../hooks/memory'
import { HOUR, HOUR_1, LONG, MIN, START, USAGE, engine, resp, setup, turn, usage } from './helpers'

test('the cost trail keeps the last 24 messages', () => {
  resetInsights()
  for (let i = 0; i < 30; i++) pushCost(i, false)
  expect(trails.costs).toHaveLength(COST_TRAIL)
  expect([trails.costs[0]?.usd, trails.costs.at(-1)?.usd]).toEqual([6, 29])
})
test('the context trail keeps the last 40 turns', () => {
  resetInsights()
  for (let i = 0; i < 50; i++) pushContext(i * 1000)
  expect(trails.context).toHaveLength(CONTEXT_TRAIL)
})
test('the 5h trail keeps one reading a minute, the latest, over 5 hours at most', () => {
  resetInsights()
  noteFiveHourTrail(0, 1)
  noteFiveHourTrail(30_000, 2)
  expect(trails.fiveHour).toEqual([{ at: 30_000, pct: 2 }])
  for (let m = 1; m <= 400; m++) noteFiveHourTrail(m * MIN, m % 100)
  expect(trails.fiveHour.length).toBeLessThanOrEqual(FIVE_HOUR_TRAIL)
  expect(trails.fiveHour[0]?.at ?? 0).toBeGreaterThanOrEqual(400 * MIN - 5 * HOUR)
})
test('/clear empties the conversation trails and keeps the 5h one; a new session empties all', () => {
  resetInsights()
  pushCost(1, false)
  pushContext(1000)
  noteFiveHourTrail(0, 4)
  resetConversationInsights()
  expect([trails.costs.length, trails.context.length, trails.fiveHour.length]).toEqual([0, 0, 1])
  resetInsights()
  expect(trails.fiveHour).toHaveLength(0)
})
test('a request after the TTL ran out rebuilt the cache, and the turn takes the mark once', () => {
  resetCache()
  recordResponse(resp(41_000, 0, 155_000, 12_000), 0, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(false) // the first build is warming, not a re-warm
  recordResponse(resp(41_000, 0, 155_000, 12_000), 61 * MIN, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(true)
  expect(takeRebuilt()).toBe(false)
})
test('a warm read is no re-warm', () => {
  resetCache()
  recordResponse(resp(41_000, 0, 155_000, 12_000), 0, true, 'claude-opus-5-5')
  takeRebuilt()
  recordResponse(resp(2_000, 196_000, 4_000, 3_000), MIN, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(false)
})

const rising = (i: number) => {
  usage.current = { ...USAGE, rateLimits: [
    { kind: 'five_hour', percentUsed: 4 + i, resetsAt: new Date(3 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 30 + i, resetsAt: new Date(67 * 3600_000).toISOString() },
  ] }
}
test('samples are written once per new 15-minute bucket, the percentages rising', LONG, async ($, on) => {
  const clock = setup(on, { env: HOUR_1 })
  await $.session.start(START)
  for (let i = 0; i < 24; i++) {
    rising(i)
    await turn($, `t${i}`, 2.41 + i * 0.1, 2.51 + i * 0.1)
    await clock.advance(5 * MIN)
  }
  const writes = engine.storeSets.filter(k => k === 'limitSamples').length
  expect(writes).toBeGreaterThanOrEqual(8)
  expect(writes).toBeLessThanOrEqual(9)
  const kept = asLimitSamples(engine.store.limitSamples).map(x => x.sevenPct)
  expect(kept.every((pct, i) => i === 0 || pct > (kept[i - 1] ?? Infinity))).toBe(true)
})
test('a session reads the stored samples at start and at each new bucket, never within one', async ($, on) => {
  setup(on, { store: { limitSamples: [] } })
  await $.session.start(START)
  expect(engine.storeGets.filter(k => k === 'limitSamples')).toHaveLength(1)
  await turn($, 't1', 2.41, 2.5)
  await turn($, 't2', 2.5, 2.6)
  expect(engine.storeGets.filter(k => k === 'limitSamples')).toHaveLength(2)
})
test('a failing store never throws, and nothing is written', async ($, on) => {
  const clock = setup(on)
  engine.storeFails = true
  await $.session.start(START)
  await clock.settle()
  // A hook that throws is dropped silently: its closing redraw shows it ran to the end.
  const redraws = engine.invalidates
  await turn($, 't1', 2.41, 2.5)
  expect(engine.store.limitSamples).toBeUndefined()
  expect(engine.invalidates).toBeGreaterThan(redraws)
})
test('a failed read writes nothing over what other sessions stored, and the next bucket writes', LONG, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  engine.storeReadFails = true
  rising(0)
  await turn($, 't1', 2.41, 2.5)
  expect(engine.storeSets.filter(k => k === 'limitSamples')).toHaveLength(0)
  engine.storeReadFails = false
  await clock.advance(15 * MIN)
  rising(1)
  await turn($, 't2', 2.5, 2.6)
  expect(asLimitSamples(engine.store.limitSamples).map(x => x.sevenPct)).toEqual([30, 31])
})
