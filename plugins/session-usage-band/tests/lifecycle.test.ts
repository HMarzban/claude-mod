import { test, expect, mock } from 'claude-code/testing'
import { PLUGIN, USAGE, base, props, resp, respond, usage } from './helpers'

const clear = { reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as const

test('/clear starts the band on a fresh conversation', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  await $.session.end(clear)

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
  await $.session.end(clear)

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
  await $.session.end(clear)

  usage.current = { ...USAGE, cost: { usd: 0.59 } } // below the $2.41 baseline: reset
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.57/ })).toBeDefined()
  await ui.unmount()
})

test('/clear keeps a TTL the environment pinned', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.session.end(clear)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(6 * 60_000) // past 5m, well inside the 1h default

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  await ui.unmount()
})
