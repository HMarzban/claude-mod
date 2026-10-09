// Cost: last turn's cost and the baseline across /clear, resume and reload.

import { test, expect, mock } from 'claude-code/testing'
import {
  USAGE,
  PLUGIN,
  START,
  HOUR_1,
  MIN,
  CLEAR,
  base,
  props,
  resp,
  respond,
  usage,
  textOf,
  pillOf,
  turn,
} from './helpers'

test("last turn's cost follows the main turn and ignores subagents'", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const last = async () => textOf(await ui.drawn()).match(/\$(\d+\.\d\d) spent during your last message/)?.[1]
  expect(await last()).toBeUndefined()

  await turn($, 't1', 2.0, 2.41)
  expect(await last()).toBe('0.41')

  await turn($, 't2', 2.41, 3.0, { agentId: 'agent-1' })
  expect(await last()).toBe('0.41')

  await turn($, 't3', 3.0, 3.5, { isAborted: true, reason: 'aborted' })
  expect(await last()).toBe('0.50')
  await ui.unmount()
})

test("no cost ledger hides last turn's cost", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { startedAt: 0, context: { window: 200_000 }, rateLimits: [] })
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(textOf(pillOf(await ui.drawn(), 'cost'))).toMatch(/What this session has cost so far/)
  await ui.unmount()
})

test('/clear starts the band on a fresh conversation', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  await $.session.end(CLEAR)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  await ui.unmount()
})

test('spend before a /clear does not inflate the re-warm estimate', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on) // ledger at $2.41 when /clear runs
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)

  // The ledger keeps counting: $0.59 is this conversation's.
  usage.current = { ...USAGE, cost: { usd: 3.0 } }
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  // rate = 0.59 / (10k + 1.25*100k + 5*2k) ; re-warm = 1.25 * 112k * rate = 0.57
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.57/ })).toBeDefined()
  await ui.unmount()
})

test('a ledger the engine reset on /clear is used as it stands', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)

  usage.current = { ...USAGE, cost: { usd: 0.59 } } // below the $2.41 baseline: reset
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.57/ })).toBeDefined()
  await ui.unmount()
})

test('a ledger reset on /clear keeps the re-warm price right after the new conversation outspends the old', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // $2.41 when /clear runs
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)

  usage.current = { ...USAGE, cost: { usd: 0.59 } } // the engine reset the ledger
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  usage.current = { ...USAGE, cost: { usd: 3.0 } } // now past the old $2.41
  await respond(e => $.turn.step(e), resp(1_000, 112_000, 2_000, 1_000))
  await clock.advance(61 * MIN)

  // all $3.00 is this conversation's, reads at Opus 5.5's 0.05×: 1.25 * 116k * 3.00 / 159.1k = 2.73
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$2\.73/ })).toBeDefined()
  await ui.unmount()
})

test('a session resumed or reloaded with spend on the ledger prices the re-warm from spend since', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 20 } }) // the ledger carries an earlier run's $20
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  usage.current = { ...USAGE, cost: { usd: 20.3 } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(61 * MIN)

  // $0.30 since start: 1.25 * 112k * 0.30 / 145k = 0.29
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.29/ })).toBeDefined()
  await ui.unmount()
})

test('/clear keeps a TTL the environment pinned', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.session.end(CLEAR)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(6 * 60_000) // past 5m, well inside the 1h default

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  await ui.unmount()
})
