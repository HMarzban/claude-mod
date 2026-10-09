// An old session reopened, or the band reloaded mid-session: the band has
// seen no reply yet, so it recalls when the last one was and what tokens
// cost on this model, and says whether the cache is cold and what the next
// message will cost.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { FRESH, HOUR, MIN, START, cardOf, engine, fact, pillOf, resp, respond, shown, transcriptOf, usage, setup, mountBand } from './helpers'

const ENV = { ENABLE_PROMPT_CACHING_1H: '1', HOME: '/Users/me' }
const MODEL = 'claude-opus-5-5'
/** $2.41 over 76k of context at 1.25× a write: what USAGE implies for the rate. */
const RATE = 0.00001

const mounted = async ($: Engine, open = false) => {
  const ui = await mountBand($, 'terminal', 140)
  if (open) await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

test('reloaded ten minutes after a reply, the band counts down from that reply', async ($, on) => {
  setup(on, { env: ENV, store: { sessions: { s1: { lastAt: 0 } } }, now: 10 * MIN })
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('reopened two days later, the cache is cold and the next message has a price', async ($, on) => {
  setup(on, { env: ENV, store: { sessions: { s1: { lastAt: 0 } }, rates: { [MODEL]: RATE } }, now: 48 * HOUR })
  await $.session.start(START)
  // 1.25 × 76k tokens × the rate
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold · next message ~\$0\.95/)
  const tree = await mounted($, true)
  expect(shown(cardOf(tree, 'cache'))).toMatch(/^CACHECold/)
  expect(fact(tree, 'idle for')).toBe('2d 0h')
  expect(fact(tree, 'next message')).toBe('~$0.95')
})

test('with no rate known for the model yet, it names the tokens instead of guessing a price', async ($, on) => {
  setup(on, { env: ENV, store: { sessions: { s1: { lastAt: 0 } }, rates: { 'claude-sonnet-5-5': RATE } }, now: 48 * HOUR })
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold · next message 76k tokens/)
})

test('a session from before the band reads its last reply off its transcript, never the file time', async ($, on) => {
  setup(on, { env: ENV, now: 3 * HOUR })
  engine.transcript = transcriptOf(0)
  await $.session.start(START)
  expect(engine.ran.find(argv => argv[0] === 'tail')?.at(-1)).toBe('/Users/me/.claude/projects/-Users-me-workspace-claude-mod/s1.jsonl')
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
})

test("its price comes from the transcript's own cost record, per model", async ($, on) => {
  setup(on, { env: ENV, now: 3 * HOUR })
  // Opus 5.5 reads its cache at 0.05× input: $20 over 1M input + 1.25 × 400k
  // written + 0.05 × 20M read + 5 × 100k output = 3M weighted tokens
  engine.transcript = transcriptOf(0, {
    'claude-opus-5-5': { inputTokens: 1_000_000, cacheCreationInputTokens: 400_000, cacheReadInputTokens: 20_000_000, outputTokens: 100_000, costUSD: 20 },
  })
  await $.session.start(START)
  // 1.25 × 76k × $20 / 3M
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/next message ~\$0\.63/)
})

test('a transcript of any size is read from its end, the last megabyte alone', async ($, on) => {
  setup(on, { env: ENV, now: 3 * HOUR })
  engine.transcript = transcriptOf(0)
  engine.transcriptBytes = 40 * 1024 * 1024
  await $.session.start(START)
  expect(engine.ran).toContainEqual(['tail', '-c', String(1024 * 1024), '/Users/me/.claude/projects/-Users-me-workspace-claude-mod/s1.jsonl'])
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
})

test('without tail, a small transcript is read whole; a big one leaves the cache unmeasured', async ($, on) => {
  setup(on, { env: ENV, now: 3 * HOUR })
  engine.tailFails = true
  engine.transcript = transcriptOf(0)
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  engine.transcriptBytes = 5 * 1024 * 1024
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache –/)
})

test('with nothing to recall, the cache stays unmeasured', async ($, on) => {
  setup(on, { env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache –/)
})

test('a brand-new session ignores anything remembered', async ($, on) => {
  setup(on, { usage: FRESH, env: ENV, store: { sessions: { s1: { lastAt: 0 } } }, now: 10 * MIN })
  await $.session.start(START)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache warming/)
})

test('after each turn the band remembers the reply and the rate it solved', async ($, on) => {
  const clock = setup(on, { env: ENV })
  await $.session.start(START)
  await clock.advance(5 * MIN)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  usage.current = { ...usage.current, cost: { usd: 2.83 } } // the turn cost $0.42
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const sessions = engine.store.sessions as Record<string, { lastAt: number }>
  expect(sessions.s1?.lastAt).toBe(5 * MIN)
  const rates = engine.store.rates as Record<string, number>
  expect(rates[MODEL]).toBeGreaterThan(0)
})

test('the band remembers at most 50 sessions, the oldest replies going first', async ($, on) => {
  const older = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`old${i}`, { lastAt: -1000 + i }]))
  const clock = setup(on, { env: ENV, store: { sessions: older } })
  await $.session.start(START)
  await clock.advance(MIN)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.settle()
  const kept = Object.keys(engine.store.sessions as Record<string, unknown>)
  expect(kept).toHaveLength(50)
  expect(kept).toContain('s1')
  expect(kept).not.toContain('old0')
})
