// What the band remembers across sessions, and what it reads back from a
// transcript: the store's entries taken as untrusted data, the newest
// sessions and a week of limit samples kept, where a transcript lives, its
// last reply and its rate.

import { test, expect } from 'claude-code/testing'
import {
  MAX_SAMPLES,
  MAX_SESSIONS,
  addSample,
  asLimitSamples,
  asRates,
  asSessions,
  fromStore,
  mergeSamples,
  needsTranscript,
  recallOf,
  rememberRate,
  rememberReply,
  sampleOf,
} from '../hooks/memory'
import { lastReplyAt, lastReplyModel, rateFromTranscript, transcriptPath } from '../hooks/transcript'
import { HOUR } from './helpers'

const iso = (ms: number): string => new Date(ms).toISOString()
const jsonl = (...lines: unknown[]): string => lines.map(line => (typeof line === 'string' ? line : JSON.stringify(line))).join('\n') + '\n'
const reply = (ms: number) => ({ type: 'assistant', timestamp: iso(ms), message: { role: 'assistant', model: 'claude-opus-5-5', content: [] } })
const prompt = (ms: number) => ({ type: 'user', timestamp: iso(ms), message: { role: 'user', content: 'hi' } })

/** A cost record as Claude Code writes one: $20 over 1M input, 400k written,
 *  20M read and 100k output, per model named. */
const costState = (...models: string[]) => ({
  type: 'cost-state',
  totalCostUSD: 20,
  modelUsage: Object.fromEntries(
    models.map(model => [model, { inputTokens: 1_000_000, cacheCreationInputTokens: 400_000, cacheReadInputTokens: 20_000_000, outputTokens: 100_000, costUSD: 20 }]),
  ),
})
const near = (a: number | null, b: number): boolean => a !== null && Math.abs(a - b) < 1e-15

// ── the store, as untrusted data ───────────────────────────────────────

test('remembered sessions keep only entries with a finite reply time', () => {
  const stored = {
    good: { lastAt: 5 },
    extra: { lastAt: 1, note: 'kept as stored' },
    text: { lastAt: 'yesterday' },
    infinite: { lastAt: Infinity },
    nan: { lastAt: NaN },
    missing: {},
    none: null,
    list: [],
    bare: 7,
  }
  expect(asSessions(stored)).toEqual({ good: { lastAt: 5 }, extra: { lastAt: 1, note: 'kept as stored' } })
})

test('remembered sessions that are not a record are none', () => {
  for (const stored of [undefined, null, 'sessions', 3, [{ lastAt: 1 }]]) expect(asSessions(stored)).toEqual({})
})

test('remembered rates keep only positive finite numbers', () => {
  const stored = { opus: 0.00001, zero: 0, negative: -1, infinite: Infinity, nan: NaN, text: '0.00001', none: null }
  expect(asRates(stored)).toEqual({ opus: 0.00001 })
})

test('remembered rates that are not a record are none', () => {
  for (const stored of [undefined, null, 'rates', 3, [0.00001]]) expect(asRates(stored)).toEqual({})
})

// ── the sessions kept ──────────────────────────────────────────────────

const fifty = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`s${i}`, { lastAt: i }]))

test('a new reply joins the newest 50 sessions, and the oldest is forgotten', () => {
  const kept = rememberReply(fifty, 'new', 100)
  expect(Object.keys(kept)).toHaveLength(50)
  expect(kept.new).toEqual({ lastAt: 100 })
  expect(kept.s0).toBeUndefined()
  expect(kept.s1).toEqual({ lastAt: 1 })
})

test('a reply older than all 50 kept is itself the one forgotten', () => {
  const kept = rememberReply(fifty, 'old', -5)
  expect(Object.keys(kept)).toHaveLength(50)
  expect(kept.old).toBeUndefined()
  expect(kept.s0).toEqual({ lastAt: 0 })
})

test("a session's newer reply replaces its older one", () => {
  expect(rememberReply({ a: { lastAt: 1 }, b: { lastAt: 2 } }, 'a', 9)).toEqual({ a: { lastAt: 9 }, b: { lastAt: 2 } })
})

test('a stored record past the cap is written back as its newest sessions, malformed entries dropped', () => {
  const stored = { ...Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`s${i}`, { lastAt: i }])), infinite: { lastAt: Infinity }, text: { lastAt: '999' } }
  const kept = rememberReply(asSessions(stored), 'new', 1_000)
  expect(Object.keys(kept)).toHaveLength(MAX_SESSIONS)
  expect([kept.new, kept.s451, kept.s450, kept.infinite, kept.text]).toEqual([{ lastAt: 1_000 }, { lastAt: 451 }, undefined, undefined, undefined])
})

test('the sessions kept stay under 4,000 bytes of JSON, at UUIDs and 13-digit times', () => {
  const at = Date.UTC(2026, 9, 6)
  const uuid = (i: number) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`
  let kept = {}
  for (let i = 0; i < 2 * MAX_SESSIONS; i++) kept = rememberReply(kept, uuid(i), at + i)
  expect(Object.keys(kept)).toHaveLength(MAX_SESSIONS)
  expect(JSON.stringify(kept).length).toBeLessThan(4_000)
})

// ── the limit samples kept ─────────────────────────────────────────────

const T0 = Date.UTC(2026, 9, 6, 8, 40) // Tue 08:40 UTC, the 7d window's start
const s = (hours: number, seven: number, five = 0) => ({ at: T0 + hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: T0 + (Math.floor(hours / 5) + 1) * 5 * HOUR, sevenResetAt: T0 + 168 * HOUR })

test('one sample per 15-minute bucket, the latest winning, capped', () => {
  const held = addSample(addSample([], s(0, 1)), { ...s(0, 2), at: T0 + 60_000 })
  expect(held).toHaveLength(1)
  expect(held[0]?.sevenPct).toBe(2)
  let all = held
  // At their widest: 99.9, as the engine gives a limit at most one decimal, at 13-digit times.
  for (let i = 1; i < 800; i++) all = addSample(all, s(i * 0.25, 99.9, 99.9))
  // 800 buckets, so the oldest 128 go.
  expect(all).toHaveLength(MAX_SAMPLES)
  expect([all[0]?.at, all.at(-1)?.at]).toEqual([T0 + 128 * 0.25 * HOUR, T0 + 799 * 0.25 * HOUR])
  expect(JSON.stringify(all).length).toBeLessThan(75_000)
})

test('an earlier sample in the same bucket never replaces a later one', () => {
  expect(addSample([{ ...s(0, 2), at: T0 + 60_000 }], s(0, 1)).map(x => x.sevenPct)).toEqual([2])
})

test('merging keeps one sample per bucket, the later winning, sorted', () => {
  expect(mergeSamples([s(0, 1), s(1, 2)], [{ ...s(0, 5), at: T0 + 60_000 }, s(0.5, 3)]).map(x => x.sevenPct)).toEqual([5, 3, 2])
})

test('the store is data, not trusted', () => {
  expect(asLimitSamples([s(0, 1), { at: 'x' }, { ...s(1, 1), fivePct: Infinity }, { ...s(2, 1), sevenPct: '5' }, null, 42])).toHaveLength(1)
  for (const stored of [undefined, null, 'limitSamples', 3, {}]) expect(asLimitSamples(stored)).toEqual([])
})

test('a stored list past the cap is read as its newest week, malformed entries dropped', () => {
  const read = asLimitSamples([...Array.from({ length: 800 }, (_, i) => s(i * 0.25, 1)), { ...s(300, 1), fiveResetAt: NaN }])
  expect(read).toHaveLength(MAX_SAMPLES)
  expect([read[0]?.at, read.at(-1)?.at]).toEqual([T0 + 128 * 0.25 * HOUR, T0 + 799 * 0.25 * HOUR])
})

test('a sample needs both windows and their resets', () => {
  const both = [
    { kind: 'five_hour', percentUsed: 4, resetsAt: T0 + 3 * HOUR },
    { kind: 'seven_day', percentUsed: 30, resetsAt: T0 + 67 * HOUR },
  ]
  expect(sampleOf(T0, both)).toEqual({ at: T0, fivePct: 4, sevenPct: 30, fiveResetAt: T0 + 3 * HOUR, sevenResetAt: T0 + 67 * HOUR })
  expect(sampleOf(T0, both.slice(0, 1))).toBeUndefined()
})

// ── where a transcript lives ───────────────────────────────────────────

test("a transcript lives under home's projects, in a folder named for the root with every other character a dash", () => {
  expect(transcriptPath('/Users/me', '/Users/me/workspace/claude-mod', 's1')).toBe('/Users/me/.claude/projects/-Users-me-workspace-claude-mod/s1.jsonl')
  expect(transcriptPath('/Users/me', '/Users/me/my.proj_x 2', 's1')).toBe('/Users/me/.claude/projects/-Users-me-my-proj-x-2/s1.jsonl')
})

test("home's trailing slashes are trimmed", () => {
  expect(transcriptPath('/Users/me/', '/p', 's1')).toBe('/Users/me/.claude/projects/-p/s1.jsonl')
  expect(transcriptPath('/Users/me//', '/p', 's1')).toBe('/Users/me/.claude/projects/-p/s1.jsonl')
})

// ── the last reply ─────────────────────────────────────────────────────

test("the last reply is the last assistant line's time, past the lines Claude Code adds after it", () => {
  const transcript = jsonl(prompt(1_000), reply(5_000), { type: 'last-prompt', lastPrompt: 'hi' }, { type: 'cost-state', totalCostUSD: 1, modelUsage: {} })
  expect(lastReplyAt(transcript)).toBe(5_000)
})

test('the last reply is the last in the file, not the latest time in it', () => {
  expect(lastReplyAt(jsonl(reply(9_000), reply(2_000)))).toBe(2_000)
})

test('lines that are not assistant replies, even ones naming "assistant", are skipped', () => {
  const transcript = jsonl(reply(5_000), prompt(9_000), { type: 'last-prompt', lastPrompt: 'assistant' })
  expect(lastReplyAt(transcript)).toBe(5_000)
})

test('an unparseable line, or a reply with no readable time, is skipped', () => {
  const transcript = jsonl(reply(5_000), '{"type":"assistant", "timestamp": broken', { type: 'assistant', timestamp: 'not a time' }, { type: 'assistant', timestamp: 7_000 })
  expect(lastReplyAt(transcript)).toBe(5_000)
})

test("the last reply's model is the one the API billed it under, past lines that name none", () => {
  const sonnet = { ...reply(1_000), message: { role: 'assistant', model: 'claude-sonnet-5-5', content: [] } }
  expect(lastReplyModel(jsonl(sonnet, reply(2_000), prompt(3_000), { type: 'assistant', timestamp: iso(4_000), message: { role: 'assistant' } }))).toBe('claude-opus-5-5')
  expect(lastReplyModel(jsonl(prompt(1_000)))).toBeUndefined()
})

test("a subagent's reply is not the conversation's last: its own cache says nothing of the main loop's", () => {
  const subagent = { ...reply(9_000), isSidechain: true }
  expect(lastReplyAt(jsonl(reply(5_000), subagent))).toBe(5_000)
})

test("a subagent's reply names neither the main loop's model nor its last prompt", () => {
  const subagent = { ...haikuReply(150_000), timestamp: iso(9_000), isSidechain: true }
  expect(lastReplyModel(jsonl(reply(5_000), subagent))).toBe('claude-opus-5-5')
  // A subagent's prompt over Haiku's tier says nothing of the main loop's: the record counts at the lower tier.
  const transcript = jsonl(costState('claude-haiku-5-5'), haikuReply(60_000), subagent)
  expect(near(rateFromTranscript(transcript, 'claude-haiku-5-5'), 20 / 4_000_000)).toBe(true)
})

test('a transcript with no reply has no last reply', () => {
  expect(lastReplyAt('')).toBeUndefined()
  expect(lastReplyAt(jsonl(prompt(1_000)))).toBeUndefined()
})

// ── the rate ───────────────────────────────────────────────────────────

test("the rate is the cost record's dollars over its weighted tokens, reads at Opus 5.5's 0.05×", () => {
  // 1M + 1.25 × 400k + 0.05 × 20M + 5 × 100k = 3M weighted tokens
  expect(near(rateFromTranscript(jsonl(costState('claude-opus-5-5')), 'claude-opus-5-5'), 20 / 3_000_000)).toBe(true)
})

test('on a model without a read price of its own, reads weigh 0.1×', () => {
  // Sonnet 5 reads at $0.20 on $2 input. 1M + 1.25 × 400k + 0.1 × 20M + 5 × 100k = 4M weighted tokens
  expect(near(rateFromTranscript(jsonl(costState('claude-sonnet-5')), 'claude-sonnet-5'), 20 / 4_000_000)).toBe(true)
})

test("Sonnet 5.5 reads its cache at 0.05×, as Anthropic's pricing lists it ($0.10 on $2 input)", () => {
  // 1M + 1.25 × 400k + 0.05 × 20M + 5 × 100k = 3M weighted tokens
  expect(near(rateFromTranscript(jsonl(costState('claude-sonnet-5-5')), 'claude-sonnet-5-5'), 20 / 3_000_000)).toBe(true)
})

/** A Haiku 5.5 reply whose request sent `prompt` input tokens. */
const haikuReply = (prompt: number) => ({
  type: 'assistant',
  timestamp: iso(1_000),
  message: { role: 'assistant', model: 'claude-haiku-5-5', content: [], usage: { input_tokens: 1_000, cache_read_input_tokens: prompt - 1_000, cache_creation_input_tokens: 0, output_tokens: 500 } },
})

test('on Haiku 5.5, a session whose last prompt was over 100k counts its cost record at the upper tier, 5×', () => {
  // 1M + 1.25 × 400k + 0.1 × 20M + 5 × 100k = 4M weighted tokens, at 5× the lower tier's rate
  const transcript = jsonl(costState('claude-haiku-5-5'), haikuReply(150_000))
  expect(near(rateFromTranscript(transcript, 'claude-haiku-5-5'), 20 / 4_000_000 / 5)).toBe(true)
})

test('on Haiku 5.5, a session whose last prompt was under 100k counts its cost record at the lower tier', () => {
  const transcript = jsonl(costState('claude-haiku-5-5'), haikuReply(60_000))
  expect(near(rateFromTranscript(transcript, 'claude-haiku-5-5'), 20 / 4_000_000)).toBe(true)
})

test('the last cost record is the one read', () => {
  const earlier = { ...costState(), modelUsage: { 'claude-opus-5-5': { inputTokens: 3_000_000, costUSD: 30 } } }
  const transcript = jsonl(earlier, reply(1_000), costState('claude-opus-5-5'))
  expect(near(rateFromTranscript(transcript, 'claude-opus-5-5'), 20 / 3_000_000)).toBe(true)
})

test('a model the last cost record does not name has no rate, whatever an earlier record says', () => {
  expect(rateFromTranscript(jsonl(costState('claude-sonnet-5-5')), 'claude-opus-5-5')).toBeNull()
  expect(rateFromTranscript(jsonl(costState('claude-opus-5-5'), costState('claude-sonnet-5-5')), 'claude-opus-5-5')).toBeNull()
})

test('a model named with its context size finds its cost record, which names the model alone', () => {
  expect(near(rateFromTranscript(jsonl(costState('claude-opus-5-5')), 'claude-opus-5-5[1m]'), 20 / 3_000_000)).toBe(true)
})

test('no cost record, nothing spent or nothing counted is no rate', () => {
  expect(rateFromTranscript(jsonl(prompt(1_000), reply(2_000)), 'claude-opus-5-5')).toBeNull()
  expect(rateFromTranscript(jsonl({ type: 'cost-state', modelUsage: { 'claude-opus-5-5': { inputTokens: 1_000, costUSD: 0 } } }), 'claude-opus-5-5')).toBeNull()
  expect(rateFromTranscript(jsonl({ type: 'cost-state', modelUsage: { 'claude-opus-5-5': { costUSD: 3 } } }), 'claude-opus-5-5')).toBeNull()
})

test('a later line that merely names cost-state, such as a prompt quoting it, never hides the real record', () => {
  const transcript = jsonl(costState('claude-opus-5-5'), { type: 'last-prompt', lastPrompt: 'cost-state' })
  expect(near(rateFromTranscript(transcript, 'claude-opus-5-5'), 20 / 3_000_000)).toBe(true)
})

test('an unreadable last cost line falls back to the record before it', () => {
  const transcript = jsonl(costState('claude-opus-5-5'), '{"type":"cost-state", broken')
  expect(near(rateFromTranscript(transcript, 'claude-opus-5-5'), 20 / 3_000_000)).toBe(true)
})

// ── the recall ─────────────────────────────────────────────────────────

const OPUS_RATE = 0.00001

test('the store recalls a session\'s last reply and the rate under the model /model names, its window aside', () => {
  const stored = fromStore({ sessions: { s1: { lastAt: 5_000 } }, rates: { 'claude-opus-5-5': OPUS_RATE } }, 's1', 'claude-opus-5-5[1m]')
  expect(needsTranscript(stored)).toBe(false)
  expect(recallOf(stored, undefined)).toEqual({ lastAt: 5_000, rate: OPUS_RATE, billed: undefined })
})

test('what the store leaves unknown, the transcript gives: its last reply, and the rate stored for the model it was billed under', () => {
  const stored = fromStore({ sessions: {}, rates: { 'claude-opus-5-5': OPUS_RATE } }, 's1', 'opus')
  expect(needsTranscript(stored)).toBe(true)
  expect(recallOf(stored, jsonl(reply(7_000)))).toEqual({ lastAt: 7_000, rate: OPUS_RATE, billed: 'claude-opus-5-5' })
})

test("with no rate stored for either, the rate is solved from the transcript's cost record", () => {
  const stored = fromStore({ sessions: { s1: { lastAt: 5_000 } }, rates: 'not rates' }, 's1', 'claude-opus-5-5')
  const recalled = recallOf(stored, jsonl(reply(7_000), costState('claude-opus-5-5')))
  // The store's time stands over the transcript's.
  expect(recalled.lastAt).toBe(5_000)
  expect(near(recalled.rate, 20 / 3_000_000)).toBe(true)
})

test('no transcript to read leaves unknown what the store does', () => {
  expect(recallOf(fromStore({ sessions: undefined, rates: undefined }, 's1', 'opus'), undefined)).toEqual({ lastAt: undefined, rate: null, billed: undefined })
})

test('a rate is kept beside the others stored, and over its own', () => {
  expect(rememberRate({ 'claude-sonnet-5-5': 2, 'claude-opus-5-5': 1, bad: -1 }, 'claude-opus-5-5', 3)).toEqual({ 'claude-sonnet-5-5': 2, 'claude-opus-5-5': 3 })
})
