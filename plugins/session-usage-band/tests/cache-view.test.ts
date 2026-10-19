// The cache's view for the band, straight from the model: measured once a
// reply has been seen, recalled before that, and one rule between the two.

import { test, expect } from 'claude-code/testing'
import { cacheView, noteLoad, noteResume, notePriceModel, noteRecall, recordResponse, resetCache, resetConversation } from '../hooks/cache'
import { MIN } from './helpers'

const RATE = 0.00001

/** No idle compaction: these views are about the cache alone. */
const NO_IDLE = { from: undefined, autoCompactOff: false } as const

test('recalled, the cache counts down from the last reply and prices the whole context', () => {
  resetCache()
  noteLoad(2.41) // spend on the ledger: the conversation started before the band
  noteRecall(0, RATE)
  const view = cacheView(10 * MIN, 2.41, 76_000, NO_IDLE)
  expect(view.recalled).toBe(true)
  expect(view.msLeft).toBe(50 * MIN) // the assumed hour, from the last reply
  expect(view.window).toBe(76_000)
  expect(Math.abs((view.reWarmUsd ?? 0) - 1.25 * RATE * 76_000)).toBeLessThan(1e-9)
  expect(view.idleMs).toBe(10 * MIN)
})

test('with no rate recalled, the re-warm price is unknown, not guessed', () => {
  resetCache()
  noteLoad(2.41)
  noteRecall(0, null)
  expect(cacheView(10 * MIN, 2.41, 76_000, NO_IDLE).reWarmUsd).toBeNull()
})

test('a conversation known to start here ignores anything recalled', () => {
  resetCache()
  resetConversation(0)
  noteRecall(0, RATE)
  const view = cacheView(10 * MIN, 0, 76_000, NO_IDLE)
  expect(view.recalled).toBe(false)
  expect(view.idleMs).toBeNull()
})

test("once a reply is seen, the measured cache stands and the recall doesn't", () => {
  resetCache()
  noteLoad(2.41)
  noteRecall(0, RATE)
  recordResponse({ input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000 }, 5 * MIN, true, undefined)
  const view = cacheView(10 * MIN, 2.41, 76_000, NO_IDLE)
  expect(view.recalled).toBe(false)
  expect(view.msLeft).toBe(55 * MIN) // from the reply this band saw
  expect(view.window).toBe(81_500)
})

test('a reset forgets the recall and the model the tokens were priced at', () => {
  resetCache()
  notePriceModel('claude-opus-5-5')
  noteLoad(2.41)
  noteRecall(0, RATE)
  expect(cacheView(0, 2.41, 0, NO_IDLE).readShare).toBe(0.05)
  resetCache()
  noteLoad(2.41)
  const view = cacheView(0, 2.41, 0, NO_IDLE)
  expect(view.recalled).toBe(false)
  expect(view.readShare).toBe(0.1)
})

test('coldAt: null before a reply, the reply plus the lifetime after, null once a resume is called expired', () => {
  resetCache()
  expect(cacheView(0, undefined, 0, NO_IDLE).coldAt).toBeNull()
  recordResponse({ input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000 }, 5 * MIN, true, undefined)
  const v = cacheView(10 * MIN, undefined, 0, NO_IDLE)
  expect(v.coldAt).toBe(10 * MIN + v.msLeft)
  resetCache()
  noteResume({ lastAt: 0, expired: true, reWarmUsd: 0.5 })
  expect(cacheView(MIN, undefined, 0, NO_IDLE).coldAt).toBeNull()
  expect(cacheView(MIN, undefined, 0, NO_IDLE).msLeft).toBe(0)
})
