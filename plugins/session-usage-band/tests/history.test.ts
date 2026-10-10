import { test, expect } from 'claude-code/testing'
import { recordResponse, resetCache, takeRebuilt } from '../hooks/cache'
import { COST_TRAIL, CONTEXT_TRAIL, FIVE_HOUR_TRAIL, noteFiveHourTrail, pushContext, pushCost, resetConversationInsights, resetInsights, trails } from '../hooks/insights'
import { HOUR, MIN, resp } from './helpers'

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
