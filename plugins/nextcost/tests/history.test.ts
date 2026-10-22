import { test, expect } from 'claude-code/testing'
import { newCache } from '../hooks/cache'
import type { CacheModel } from '../hooks/cache'
import { COST_TRAIL, CONTEXT_TRAIL, pushContext, pushCost, resetConversationInsights, resetInsights, trails } from '../hooks/insights'
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
test('/clear empties the conversation trails; a new session empties them too', () => {
  resetInsights()
  pushCost(1, false)
  pushContext(1000)
  resetConversationInsights()
  expect([trails.costs.length, trails.context.length]).toEqual([0, 0])
})
/** Whether the turn's end finds the cache rebuilt. */
const rebuilt = (c: CacheModel): boolean => c.turnEnded(undefined).rebuilt
const OPUS_BUILD = { ...resp(41_000, 0, 155_000, 12_000), model: 'claude-opus-5-5' }
test('a request after the TTL ran out rebuilt the cache, and the turn takes the mark once', () => {
  const c = newCache()
  c.responded(OPUS_BUILD, 0, true)
  expect(rebuilt(c)).toBe(false) // the first build is warming, not a re-warm
  c.responded(OPUS_BUILD, 61 * MIN, true)
  expect(rebuilt(c)).toBe(true)
  expect(rebuilt(c)).toBe(false)
})
test('the first reply after a resume or a reload rebuilds a cache already cold', () => {
  const resumed = newCache()
  resumed.resumed({ cache: { lastAt: 0, expired: true, reWarmUsd: 1 }, transcript: undefined })
  expect(resumed.msLeft(48 * HOUR)).toBe(0)
  resumed.responded(OPUS_BUILD, 48 * HOUR, true)
  expect(rebuilt(resumed)).toBe(true)
  const reloaded = (): CacheModel => {
    const c = newCache()
    c.loaded({ priceModel: undefined, ledger: 5 })
    c.recalled({ lastAt: 0, rate: null, billed: undefined })
    return c
  }
  const cold = reloaded()
  cold.responded(OPUS_BUILD, 3 * HOUR, true)
  expect(rebuilt(cold)).toBe(true)
  // Recalled warm, the first reply reads the cache it found.
  const warm = reloaded()
  warm.responded({ ...resp(2_000, 196_000, 4_000, 3_000), model: 'claude-opus-5-5' }, 10 * MIN, true)
  expect(rebuilt(warm)).toBe(false)
})
test('a warm read is no re-warm', () => {
  const c = newCache()
  c.responded(OPUS_BUILD, 0, true)
  rebuilt(c)
  c.responded({ ...resp(2_000, 196_000, 4_000, 3_000), model: 'claude-opus-5-5' }, MIN, true)
  expect(rebuilt(c)).toBe(false)
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
  // Each write holds one bucket more, the last one the newest.
  expect(kept).toHaveLength(writes)
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
test('a stored sample dated ahead of the clock is dropped, so one bucket writes once', async ($, on) => {
  const ahead = { at: 168 * HOUR, fivePct: 90, sevenPct: 90, fiveResetAt: 171 * HOUR, sevenResetAt: 235 * HOUR }
  const clock = setup(on, { store: { limitSamples: [ahead] } })
  await $.session.start(START)
  await turn($, 't1', 2.41, 2.5)
  await clock.advance(5 * MIN)
  await turn($, 't2', 2.5, 2.6)
  expect(engine.storeSets.filter(k => k === 'limitSamples')).toHaveLength(1)
  expect(asLimitSamples(engine.store.limitSamples).map(x => x.sevenPct)).toEqual([30])
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
