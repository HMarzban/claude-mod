// What the band remembers across sessions, and what it reads back from a
// transcript: the store's entries taken as untrusted data, the newest
// sessions kept, where a transcript lives, its last reply and its rate.

import { test, expect } from 'claude-code/testing'
import { asRates, asSessions, lastReplyAt, lastReplyModel, rateFromTranscript, rememberReply, transcriptPath } from '../hooks/memory'

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
  // 1M + 1.25 × 400k + 0.1 × 20M + 5 × 100k = 4M weighted tokens
  expect(near(rateFromTranscript(jsonl(costState('claude-sonnet-5-5')), 'claude-sonnet-5-5'), 20 / 4_000_000)).toBe(true)
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
