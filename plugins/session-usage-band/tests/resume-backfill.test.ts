// A past session resumed (`claude --resume`, /resume, or opened again in the
// desktop app): its ledger may read $0, but the conversation didn't start
// here. The engine's SessionStart says how long it sat idle and what
// re-caching costs; its transcript says what it has spent.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'
import { CLEAR, HOUR, MIN, START, USAGE, cardOf, engine, fact, pillOf, setup, shown, startTurn, endTurn, mountBand, usage } from './helpers'

const ENV = { ENABLE_PROMPT_CACHING_1H: '1', HOME: '/Users/me' }
const BUILT_PATH = '/Users/me/.claude/projects/-Users-me-workspace-claude-mod/s1.jsonl'
const PATH = '/Users/me/.claude/projects/-Users-me-elsewhere/s1.jsonl'
/** A resumed session whose ledger starts again at $0. */
const RESUMED: SessionUsage = { ...USAGE, cost: { usd: 0 } }

const mounted = async ($: Engine, open = false) => {
  const ui = await mountBand($, 'terminal', 140)
  if (open) await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

/** A transcript's lines, as Claude Code writes them. */
const jsonl = (...lines: unknown[]): string => lines.map(line => JSON.stringify(line)).join('\n') + '\n'

/** One reply, logged once per content block, each line with the same usage. */
const reply = (id: string, blocks: number, usage: Record<string, unknown>, model = 'claude-opus-5-5') =>
  Array.from({ length: blocks }, (_, i) => ({
    type: 'assistant',
    timestamp: new Date(i).toISOString(),
    isSidechain: false,
    message: { id, role: 'assistant', model, content: [{ type: 'text', text: `block ${i}` }], usage },
  }))

/** $30 over 1M uncached + 1.25 × 400k written + 0.05 × 20M read + 5 × 100k
 *  output = 3M weighted tokens: $0.00001 a token on Opus 5.5. */
const RECORD = {
  type: 'cost-state',
  totalCostUSD: 30,
  startTime: 0,
  modelUsage: {
    'claude-opus-5-5': { inputTokens: 1_000_000, cacheCreationInputTokens: 400_000, cacheReadInputTokens: 20_000_000, outputTokens: 100_000, costUSD: 30 },
  },
}

/** 1,000 + 1.25 × 2,000 + 0.05 × 100,000 + 5 × 1,000 = 13,500 weighted
 *  tokens: $0.135 at the record's rate. */
const REPLY_USAGE = {
  input_tokens: 1_000,
  cache_creation_input_tokens: 2_000,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2_000 },
  cache_read_input_tokens: 100_000,
  output_tokens: 1_000,
}

/** An older record, then the last one, then two replies logged after it,
 *  the first over three content blocks. */
const TRANSCRIPT = jsonl(
  { type: 'user', message: { role: 'user', content: 'hi' } },
  { ...RECORD, totalCostUSD: 12 },
  ...reply('msg_old', 1, REPLY_USAGE),
  RECORD,
  ...reply('msg_1', 3, REPLY_USAGE),
  ...reply('msg_2', 1, REPLY_USAGE),
)

/** The engine resuming a conversation last answered `idleMs` ago. */
const resume = ($: Engine, idleMs: number, fields: { expired?: boolean; reWarmUsd?: number; path?: string; source?: 'resume' | 'fork' } = {}) =>
  $.classic.SessionStart({
    source: fields.source ?? 'resume',
    transcript_path: fields.path ?? PATH,
    seconds_since_last_response: idleMs / 1000,
    context_tokens: 76_000,
    prompt_cache_likely_expired: fields.expired ?? idleMs > HOUR,
    estimated_cache_write_usd: fields.reWarmUsd ?? 0.95,
  })

test('resumed two days on with a $0 ledger, the cache is cold at the price the engine names', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 48 * HOUR })
  await $.session.start(START)
  await resume($, 48 * HOUR, { reWarmUsd: 1.23 })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold · next message ~\$1\.23/)
  const tree = await mounted($, true)
  expect(fact(tree, 'idle for')).toBe('2d 0h')
  expect(fact(tree, 'next message')).toBe('~$1.23')
})

test('resumed ten minutes after its last reply, the cache counts down from that reply', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a forked session resumes the same way', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN, { source: 'fork' })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a cache the engine calls expired is cold, however recent the reply', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: true })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
})

test("without the engine's idle time, the band's own memory of the last reply stands in", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, store: { sessions: { s1: { lastAt: 3 * HOUR - 10 * MIN } } }, now: 3 * HOUR })
  await $.session.start(START)
  await $.classic.SessionStart({ source: 'resume', transcript_path: PATH })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test("a resumed session's spend and tokens start from its last cost record, each later reply counted once", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(engine.ran).toContainEqual(['grep', '-b', '-F', '"type":"cost-state"', PATH])
  // $30 + 2 × $0.135
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  const tree = await mounted($, true)
  expect(shown(cardOf(tree, 'spend'))).toMatch(/^SPEND\$30\.27/)
  expect(shown(cardOf(tree, 'spend'))).not.toMatch(/Breakdown counts/)
  // 1M + 400k sent, 100k back and 20M read, then 3k, 1k and 100k for each reply
  expect(fact(tree, 'input')).toBe('1.4M')
  expect(fact(tree, 'output')).toBe('102k')
  expect(fact(tree, 'cache reads')).toBe('20.2M')
})

test('the transcript the engine names is read; without one, the band finds it by the project', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN, { path: '' })
  await clock.settle()
  expect(engine.ran.find(argv => argv[0] === 'grep')?.at(-1)).toBe(BUILT_PATH)
})

test('a ledger that already counts the conversation is never added to it', async ($, on) => {
  const clock = setup(on, { usage: { ...USAGE, cost: { usd: 31 } }, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.00/)
})

test('a ledger that counts less than the transcript shows the transcript, and grows from there', async ($, on) => {
  const clock = setup(on, { usage: { ...USAGE, cost: { usd: 5 } }, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  await startTurn($, 't1', 5)
  await endTurn($, 't1', 6)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.27/)
})

test('with no transcript, a resume shows the ledger and no breakdown, as before', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(cardOf(await mounted($, true), 'spend'))).toMatch(/Breakdown counts from your next message/)
})

test('malformed lines are passed over, a record cut short included', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = `${TRANSCRIPT}{"type":"assistant","message":{"id":"msg_3"\n${JSON.stringify(RECORD).slice(0, 40)}\n`
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('without grep, a transcript small enough to read is read whole', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.grepFails = true
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('without grep, a transcript too big to read leaves the ledger as it is', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.grepFails = true
  engine.transcript = TRANSCRIPT
  engine.transcriptBytes = 5 * 1024 * 1024
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a /clear while the transcript is read leaves the new conversation alone', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  let release = (): void => undefined
  engine.hold = new Promise<void>(resolve => {
    release = resolve
  })
  await $.session.start(START)
  await resume($, 10 * MIN)
  await $.session.end(CLEAR)
  release()
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache warming/)
})

test('/resume inside a running session resumes the conversation it names', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await $.session.end({ reason: 'resume', sessionId: 's1', resume: { id: 's1' } })
  // Until the engine says more, the band knows only that it isn't new.
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache –/)
  engine.sessionId = 's2'
  await resume($, 48 * HOUR)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('a new session and a /clear read nothing and stay warming', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await $.classic.SessionStart({ source: 'startup', transcript_path: PATH })
  await $.session.end(CLEAR)
  await $.classic.SessionStart({ source: 'clear', transcript_path: PATH })
  await clock.settle()
  expect(engine.ran.filter(argv => argv[0] === 'grep' || argv[0] === 'tail')).toEqual([])
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache warming/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
})

test('a SessionStart that comes before session.start still resumes the conversation', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await resume($, 48 * HOUR)
  await $.session.start(START)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('a SessionStart while session.start runs still resumes the conversation', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await Promise.all([resume($, 48 * HOUR), $.session.start(START)])
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('a ledger the host restores after the transcript is read is never added to it', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  // The host restores the record's total only once the band has read the transcript.
  usage.current = { ...RESUMED, cost: { usd: 30 } }
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  await startTurn($, 't1', 30)
  await endTurn($, 't1', 31)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.27/)
})

test('a fork counts its own cost record, not one its parent wrote', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = jsonl(
    { ...RECORD, sessionId: 's1' },
    ...reply('msg_1', 3, REPLY_USAGE),
    ...reply('msg_2', 1, REPLY_USAGE),
    { ...RECORD, sessionId: 'parent', totalCostUSD: 50 },
  )
  await $.session.start(START)
  await resume($, 10 * MIN, { source: 'fork' })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

/** No TTL pinned, so the band has only the transcript to go by. */
const UNPINNED = { HOME: '/Users/me' }

/** A reply that wrote its cache at `ttl`. */
const wroteAt = (id: string, ttl: '5m' | '1h') =>
  reply(id, 1, {
    ...REPLY_USAGE,
    cache_creation: { ephemeral_5m_input_tokens: ttl === '5m' ? 2_000 : 0, ephemeral_1h_input_tokens: ttl === '1h' ? 2_000 : 0 },
  })

test("a resumed session's cache lasts as long as its last main-loop cache write said", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  // A subagent's reply after it, written for an hour, says nothing of the main loop's cache.
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'), ...wroteAt('msg_2', '1h').map(line => ({ ...line, isSidechain: true })))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 3:00/)
  expect(fact(await mounted($, true), 'expires')).toBe('5m idle')
})

test('an hour seen on the last cache write is no longer assumed', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '1h'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 58m/)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle')
})
