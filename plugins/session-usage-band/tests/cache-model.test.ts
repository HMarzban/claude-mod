// The cache model as the band shows it: TTL inference, rebuilds, subagents, the re-warm rate.

import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import {
  USAGE,
  PLUGIN,
  SUMMARY,
  START,
  HOUR_1,
  MIN,
  base,
  props,
  resp,
  respond,
  inAgent,
  textOf,
  pillOf,
  shown,
  rebuilds,
  engine,
  fact,
  cardOf,
} from './helpers'

test('an assumed hour is corrected to 5m when a gap past 5m rebuilt the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, {})
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(12 * 60_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'lifetime')).toBe('5m')
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test('a prefix the cache should have served but did not is an unexpected rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(1)
  await ui.unmount()
})

test('a warm follow-up to a long answer is not a rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 5_000))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(300, 80_000, 7_000, 400))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'lifetime')).toBe('1h')
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test("a subagent's steps leave the main countdown and window alone", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } }) // no ledger: the pill names the window in tokens
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await clock.advance(50 * 60_000)
  await respond(inAgent(e => $.turn.step(e)), resp(500, 0, 12_000, 800))
  await clock.advance(9 * 60_000 + 30_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /0:30 left · re-warm 153k tokens/ })).toBeDefined()
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(0)
  await ui.unmount()
})

test("a subagent's tokens still count toward the rate the re-warm is solved from", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(inAgent(e => $.turn.step(e)), resp(3_000, 20_000, 10_000, 4_000))
  await clock.advance(61 * 60_000)

  // weighted = 13k + 1.25*110k + 0.1*20k + 5*6k = 182.5k; 1.25*112k*2.41/182.5k = 1.85
  // (without the subagent's tokens it would be 2.33)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.85/ })).toBeDefined()
  await ui.unmount()
})

test("the re-warm estimate is solved from every response's tokens", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  await respond(e => $.turn.step(e), resp(1_000, 110_000, 2_000, 1_000))
  await clock.advance(61 * 60_000)

  // weighted = 15k + 1.25*108k + 0.1*210k + 5*6k = 201k; 1.25*114k*2.41/201k = 1.71
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.71/ })).toBeDefined()
  await ui.unmount()
})

test('a compaction is an expected rebuild', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await $.session.compact({ trigger: 'manual', messages: SUMMARY })
  await respond(e => $.turn.step(e), resp(500, 0, 20_000, 300)) // reads nothing: the prefix changed

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(cardOf(tree, 'cache')).toBeDefined()
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test('after a compaction the cold price is for the compacted size', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } }) // no ledger: the pill names tokens
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await $.session.compact({ trigger: 'auto', messages: SUMMARY })
  await clock.advance(61 * MIN)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/next message 20k tokens/)
  await ui.unmount()
})

test('a model switch is an expected rebuild and keeps the assumed hour', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, {}) // TTL unpinned
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(6 * MIN)
  await respond(e => $.turn.step({ ...e, model: 'claude-sonnet-5-5' }), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'lifetime')).toBe('1h (assumed)')
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})


/** Rebuilds counted after a 150k prefix, a compaction, then a request that
 *  reads nothing: 0 when the compaction was noted, 1 when it wasn't. */
const rebuildsAfterCompaction = async (
  $: Engine,
  compact: { trigger?: 'manual' | 'auto' | 'precompute'; agentId?: string } = {},
): Promise<number> => {
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await $.session.compact({ trigger: 'manual', messages: SUMMARY, ...compact })
  await respond(e => $.turn.step(e), resp(500, 0, 20_000, 300))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  await ui.press({ key: 'more' })
  const n = rebuilds(await ui.drawn())
  await ui.unmount()
  return n
}

test('a compaction result that carries an empty skip is still a compaction', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  engine.compact = { messages: SUMMARY, tokensAfter: 20_000, skip: undefined }
  expect(await rebuildsAfterCompaction($)).toBe(0)
})

test('a skipped compaction rebuilds nothing, so a later miss still counts', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  engine.compact = { skip: 'nothing to compact' }
  expect(await rebuildsAfterCompaction($)).toBe(1)
})

test('a precomputed compaction installs nothing yet', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  expect(await rebuildsAfterCompaction($, { trigger: 'precompute' })).toBe(1)
})

test("a subagent's compaction leaves the main cache alone", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  expect(await rebuildsAfterCompaction($, { agentId: 'agent-1' })).toBe(1)
})

test('a step that stops for compaction makes the next rebuild expected', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  engine.stop = 'compaction'
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  engine.stop = 'end_turn'
  await respond(e => $.turn.step(e), resp(500, 0, 20_000, 300))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(0)
  await ui.unmount()
})

test('switching model and back within a pinned hour is no miss', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(30_000)
  await respond(e => $.turn.step({ ...e, model: 'claude-sonnet-5-5' }), resp(82_500, 0, 82_500, 300))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(500, 82_500, 1_000, 300))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(0)
  await ui.unmount()
})
