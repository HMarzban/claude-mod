// The cache's view for the band, straight from the model: measured once a
// reply has been seen, recalled before that, and one rule between the two.

import { test, expect } from 'claude-code/testing'
import { cacheView, noteLoad, notePriceModel, noteRecall, recordResponse, resetCache, resetConversation } from '../hooks/cache'

const MIN = 60_000
const RATE = 0.00001

test('recalled, the cache counts down from the last reply and prices the whole context', () => {
  resetCache()
  noteLoad(2.41) // spend on the ledger: the conversation started before the band
  noteRecall(0, RATE)
  const view = cacheView(10 * MIN, 2.41, 76_000)
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
  expect(cacheView(10 * MIN, 2.41, 76_000).reWarmUsd).toBeNull()
})

test('a conversation known to start here ignores anything recalled', () => {
  resetCache()
  resetConversation(0)
  noteRecall(0, RATE)
  const view = cacheView(10 * MIN, 0, 76_000)
  expect(view.recalled).toBe(false)
  expect(view.idleMs).toBeNull()
})

test("once a reply is seen, the measured cache stands and the recall doesn't", () => {
  resetCache()
  noteLoad(2.41)
  noteRecall(0, RATE)
  recordResponse({ input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000 }, 5 * MIN, true, undefined)
  const view = cacheView(10 * MIN, 2.41, 76_000)
  expect(view.recalled).toBe(false)
  expect(view.msLeft).toBe(55 * MIN) // from the reply this band saw
  expect(view.window).toBe(81_500)
})

test('a measured cache goes cold a lifetime after the reply this band saw; a recalled one has no such time', () => {
  resetCache()
  noteLoad(2.41)
  noteRecall(0, RATE)
  expect(cacheView(10 * MIN, 2.41, 76_000).coldAt).toBeNull()
  recordResponse({ input_tokens: 1_000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 80_000 }, 5 * MIN, true, undefined)
  expect(cacheView(90 * MIN, 2.41, 76_000).coldAt).toBe(65 * MIN)
})

test('a reset forgets the recall and the model the tokens were priced at', () => {
  resetCache()
  notePriceModel('claude-opus-5-5')
  noteLoad(2.41)
  noteRecall(0, RATE)
  expect(cacheView(0, 2.41, 0).readShare).toBe(0.05)
  resetCache()
  noteLoad(2.41)
  const view = cacheView(0, 2.41, 0)
  expect(view.recalled).toBe(false)
  expect(view.readShare).toBe(0.1)
})
