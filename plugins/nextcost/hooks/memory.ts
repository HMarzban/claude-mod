// What the band remembers across sessions, in the plugin's own store: when
// each session last had a reply, what a token costs on each model, the
// layout the band draws in, and a week of limit samples. With the first two a
// reopened session, or a reload, says whether its cache is cold and what the
// next message costs, before any reply of its own, and with the samples the
// week shows the days before this session. What a session has spent, and how
// long its cache was last written for, are read off its transcript, which
// Claude Code keeps.

import { NO_TOKENS, addTokens, modelName, tierFactor, weightedTokens } from './cache'
import type { RecalledReply, Spend, TokenCounts, Ttl } from './cache'
import { MINUTE_MS, SEVEN_DAY_MS } from './format'
import { LAYOUT_NAMES } from './snapshot'
import type { LayoutName } from './snapshot'
import { stripTrailingSlashes } from './workspace'

/** Store keys. */
export const SESSIONS_KEY = 'sessions'
export const RATES_KEY = 'rates'
export const LAYOUT_KEY = 'layout'
export const LIMIT_SAMPLES_KEY = 'limitSamples'

/** Sessions kept, newest reply first; the rest are forgotten. */
export const MAX_SESSIONS = 50

/** Each session's last main-loop reply, by session id. */
type Sessions = Readonly<Record<string, Readonly<{ lastAt: number }>>>

/** The base input rate per token, solved from a session's own bill, by model. */
type Rates = Readonly<Record<string, number>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The store's sessions, keeping only well-formed entries: it is data, not trusted. */
export const asSessions = (v: unknown): Sessions =>
  isRecord(v)
    ? Object.fromEntries(
        Object.entries(v).filter(
          (entry): entry is [string, { lastAt: number }] =>
            isRecord(entry[1]) && typeof entry[1].lastAt === 'number' && Number.isFinite(entry[1].lastAt),
        ),
      )
    : {}

/** The store's rates, keeping only positive finite numbers. */
export const asRates = (v: unknown): Rates =>
  isRecord(v)
    ? Object.fromEntries(
        Object.entries(v).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] > 0),
      )
    : {}

/** A layout's name from the store or the command: trimmed, any case; anything
 *  else, a name from a newer version included, is undefined. */
export const asLayoutName = (v: unknown): LayoutName | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (LAYOUT_NAMES as readonly string[]).includes(word) ? (word as LayoutName) : undefined
}

/** Layouts this version removed: a stored one draws chips, and the command names it. */
const REMOVED_LAYOUTS = ['gauges', 'ledger', 'rings', 'tiles', 'week', 'forecast'] as const
export const REMOVED_IN = '0.14.0'
/** A removed layout's name, from the store or the command, trimmed and lowercased; else undefined. */
export const removedLayoutOf = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (REMOVED_LAYOUTS as readonly string[]).includes(word) ? word : undefined
}

/** The one key a rate is kept and found under: the model as /model names
 *  it, perhaps an alias, its window aside. A reload knows it before any
 *  reply, as the billed name it doesn't. */
const rateKey = (model: string): string => modelName(model)

/** The store's rates with `rate` kept for `model`, as /model names it. */
export const rememberRate = (stored: unknown, model: string, rate: number): Rates => ({ ...asRates(stored), [rateKey(model)]: rate })

/** `sessions` with `id`'s reply at `lastAt`, the oldest dropped past MAX_SESSIONS. */
export const rememberReply = (sessions: Sessions, id: string, lastAt: number): Sessions =>
  Object.fromEntries(
    Object.entries({ ...sessions, [id]: { lastAt } })
      .sort(([, a], [, b]) => b.lastAt - a.lastAt)
      .slice(0, MAX_SESSIONS),
  )

/** The engine's names for the two limits a sample holds. */
export const FIVE_HOUR = 'five_hour'
export const SEVEN_DAY = 'seven_day'

/** Both limits at one moment, with the resets that name their windows (epoch ms). */
export type Sample = Readonly<{ at: number; fivePct: number; sevenPct: number; fiveResetAt: number; sevenResetAt: number }>

const BUCKET_MS = 15 * MINUTE_MS
/** A week of buckets. */
export const MAX_SAMPLES = SEVEN_DAY_MS / BUCKET_MS

/** The 15-minute bucket `at` falls in. */
const bucketOf = (at: number): number => Math.floor(at / BUCKET_MS)

/** Whether two samples fall in one bucket. */
export const sameBucket = (a: Sample, b: Sample): boolean => bucketOf(a.at) === bucketOf(b.at)

/** Two lists as one: one per bucket, the later winning, sorted, capped. */
export const mergeSamples = (a: readonly Sample[], b: readonly Sample[]): Sample[] => {
  const byBucket = new Map<number, Sample>()
  for (const s of [...a, ...b]) {
    const bucket = bucketOf(s.at)
    const had = byBucket.get(bucket)
    if (had === undefined || s.at >= had.at) byBucket.set(bucket, s)
  }
  return [...byBucket.values()].sort((x, y) => x.at - y.at).slice(-MAX_SAMPLES)
}

/** `samples` with `s` added, as mergeSamples keeps them. */
export const addSample = (samples: readonly Sample[], s: Sample): Sample[] => mergeSamples(samples, [s])

/** The samples taken by `now`: one dated later, from a clock that ran ahead,
 *  would stay last and open a new bucket every turn. */
export const samplesUpTo = (samples: readonly Sample[], now: number): Sample[] => samples.filter(s => s.at <= now)

const SAMPLE_FIELDS = ['at', 'fivePct', 'sevenPct', 'fiveResetAt', 'sevenResetAt'] as const

const isSample = (v: unknown): v is Sample => isRecord(v) && SAMPLE_FIELDS.every(k => Number.isFinite(v[k]))

/** The store's samples, keeping only well-formed ones, one per bucket, sorted. */
export const asLimitSamples = (v: unknown): Sample[] => (Array.isArray(v) ? mergeSamples([], v.filter(isSample)) : [])

/** The 5-hour and 7-day windows the engine reports, and every other one. */
export const splitLimits = <L extends Readonly<{ kind: string }>>(limits: readonly L[]): Readonly<{ five: L | undefined; seven: L | undefined; others: L[] }> => ({
  five: limits.find(l => l.kind === FIVE_HOUR),
  seven: limits.find(l => l.kind === SEVEN_DAY),
  others: limits.filter(l => l.kind !== FIVE_HOUR && l.kind !== SEVEN_DAY),
})

/** Both limits now, as one sample; undefined unless each is reported with a readable reset. */
export const sampleOf = (now: number, limits: ReadonlyArray<Readonly<{ kind: string; percentUsed: number; resetsAt?: string }>>): Sample | undefined => {
  const { five, seven } = splitLimits(limits)
  const fiveResetAt = Date.parse(five?.resetsAt ?? '')
  const sevenResetAt = Date.parse(seven?.resetsAt ?? '')
  if (five === undefined || seven === undefined || !Number.isFinite(fiveResetAt) || !Number.isFinite(sevenResetAt)) return undefined
  return { at: now, fivePct: five.percentUsed, sevenPct: seven.percentUsed, fiveResetAt, sevenResetAt }
}

/** Where Claude Code keeps a session's transcript: its project folder named
 *  for the project root, every character but a letter or digit a dash. */
export const transcriptPath = (home: string, root: string, id: string): string =>
  `${stripTrailingSlashes(home)}/.claude/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${id}.jsonl`

/** The most a mod may read in one go; a larger transcript stays unread. */
export const READ_LIMIT = 4 * 1024 * 1024

const parsed = (line: string): Record<string, unknown> | undefined => {
  try {
    const v: unknown = JSON.parse(line)
    return isRecord(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** A transcript's lines from its end, parsed, the ones that name `marker`:
 *  a cheap text test first, so most lines are never parsed. */
function* fromEnd(transcript: string, marker: string): Generator<Record<string, unknown>> {
  const lines = transcript.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i] ?? ''
    if (!line.includes(marker)) continue
    const entry = parsed(line)
    if (entry !== undefined) yield entry
  }
}

/** What marks a reply's line. */
const REPLY_MARKER = '"assistant"'

/** When a transcript line was logged; undefined where it doesn't say. */
const loggedAt = (entry: Record<string, unknown>): number | undefined => {
  const at = typeof entry.timestamp === 'string' ? Date.parse(entry.timestamp) : NaN
  return Number.isFinite(at) ? at : undefined
}

/** When a transcript's last assistant reply was. Its file time won't do:
 *  Claude Code writes a cost line each time it opens a session. */
export const lastReplyAt = (transcript: string): number | undefined => {
  for (const entry of fromEnd(transcript, REPLY_MARKER)) {
    const at = entry.type === 'assistant' ? loggedAt(entry) : undefined
    if (at !== undefined) return at
  }
  return undefined
}

/** The model the transcript's last reply was billed under, as the API names it. */
export const lastReplyModel = (transcript: string): string | undefined => {
  for (const entry of fromEnd(transcript, REPLY_MARKER)) {
    if (entry.type !== 'assistant' || !isRecord(entry.message)) continue
    const model = entry.message.model
    if (typeof model === 'string' && model !== '') return model
  }
  return undefined
}

/** What the band's own store recalls of a session's last reply: when it
 *  was, and the rate on the model /model names, under the name that keys
 *  it; with every rate stored, for the model a transcript names. */
export type StoreRecall = Readonly<{ rates: Rates; model: string; lastAt: number | undefined; rate: number | null }>

/** What the store recalls of `sessionId`'s last reply, on `model` as /model names it. */
export const fromStore = (stored: Readonly<{ sessions: unknown; rates: unknown }>, sessionId: string, model: string): StoreRecall => {
  const rates = asRates(stored.rates)
  const key = rateKey(model)
  return { rates, model: key, lastAt: asSessions(stored.sessions)[sessionId]?.lastAt, rate: rates[key] ?? null }
}

/** Whether the store leaves a fact unknown that the transcript may give. */
export const needsTranscript = (r: StoreRecall): boolean => r.lastAt === undefined || r.rate === null

/** The last reply as recalled: the store's facts first; what they leave
 *  unknown off the transcript's end, when one was read: its last reply's
 *  time, and the rate on the model that reply was billed under, as stored
 *  under that name (a /model that named it in full, or a version that kept
 *  rates by the billed name) or else solved from the transcript's cost
 *  record. */
export const recallOf = (r: StoreRecall, transcript: string | undefined): RecalledReply => {
  if (transcript === undefined) return { lastAt: r.lastAt, rate: r.rate, billed: undefined }
  // /model may name an alias; the last reply names the model it was billed under.
  const billed = lastReplyModel(transcript)
  return {
    lastAt: r.lastAt ?? lastReplyAt(transcript),
    rate: r.rate ?? (billed === undefined ? rateFromTranscript(transcript, r.model) : (r.rates[rateKey(billed)] ?? rateFromTranscript(transcript, billed))),
    billed,
  }
}

/** A count the transcript gives, or 0 for anything that isn't one. */
const countOf = (record: Record<string, unknown>, key: string): number => {
  const v = record[key]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

/** One model's tokens in a cost record. */
const recordTokens = (m: Record<string, unknown>): TokenCounts => ({
  uncached: countOf(m, 'inputTokens'),
  written: countOf(m, 'cacheCreationInputTokens'),
  read: countOf(m, 'cacheReadInputTokens'),
  output: countOf(m, 'outputTokens'),
})

/** One reply's tokens, as the API reports its usage. */
const replyTokens = (usage: Record<string, unknown>): TokenCounts => ({
  uncached: countOf(usage, 'input_tokens'),
  written: countOf(usage, 'cache_creation_input_tokens'),
  read: countOf(usage, 'cache_read_input_tokens'),
  output: countOf(usage, 'output_tokens'),
})

/** The base rate per token a cost record's entry for `model` solves to: its
 *  dollars over its weighted tokens. */
const recordRate = (m: Record<string, unknown>, model: string): number | null => {
  const weighted = weightedTokens(recordTokens(m), model)
  const rate = weighted > 0 ? countOf(m, 'costUSD') / weighted : 0
  return rate > 0 ? rate : null
}

/** What marks a cost record's line, for `grep -F` to find. */
export const COST_RECORD = '"type":"cost-state"'

/** The prompt the transcript's last reply sent: every input token, cache
 *  reads and writes included, as a price tier counts it. */
const lastPrompt = (transcript: string): number | undefined => {
  for (const entry of fromEnd(transcript, REPLY_MARKER)) {
    if (entry.type !== 'assistant' || !isRecord(entry.message) || !isRecord(entry.message.usage)) continue
    const t = replyTokens(entry.message.usage)
    return t.uncached + t.read + t.written
  }
  return undefined
}

/** The base rate per token on `model`, solved from the transcript's last
 *  cost record. The record can't say which requests passed a price tier, so
 *  on a model with two the last reply's prompt stands for them all. */
export const rateFromTranscript = (transcript: string, model: string): number | null => {
  for (const entry of fromEnd(transcript, COST_RECORD)) {
    if (entry.type !== 'cost-state') continue
    const usage = entry.modelUsage
    const m = isRecord(usage) ? usage[modelName(model)] : undefined
    const rate = isRecord(m) ? recordRate(m, model) : null
    return rate === null ? null : rate / tierFactor(model, lastPrompt(transcript) ?? 0)
  }
  return null
}

/** The TTL the transcript's last main-loop cache write was made at: an hour
 *  if it wrote any for an hour, else five minutes if it wrote any. A
 *  subagent's reply says nothing of the main loop's cache. */
export const lastWriteTtl = (transcript: string): Ttl | undefined => {
  for (const entry of fromEnd(transcript, '"cache_creation"')) {
    if (entry.type !== 'assistant' || entry.isSidechain === true || !isRecord(entry.message)) continue
    const usage = entry.message.usage
    const written = isRecord(usage) ? usage.cache_creation : undefined
    if (!isRecord(written)) continue
    if (countOf(written, 'ephemeral_1h_input_tokens') > 0) return '1h'
    if (countOf(written, 'ephemeral_5m_input_tokens') > 0) return '5m'
  }
  return undefined
}

/** A line's cost record, parsed; undefined for any other line, or one cut short. */
const costRecordOf = (line: string): Record<string, unknown> | undefined => {
  if (!line.includes(COST_RECORD)) return undefined
  const entry = parsed(line)
  return entry?.type === 'cost-state' ? entry : undefined
}

/** Which of `records` a session's spend counts from: its own last one, else
 *  the last of any session's, as a fork's file may hold only its parent's.
 *  -1 with none. */
const recordFor = (records: ReadonlyArray<Record<string, unknown> | undefined>, sessionId: string): number => {
  const own = records.findLastIndex(record => record?.sessionId === sessionId)
  return own >= 0 ? own : records.findLastIndex(record => record !== undefined)
}

/** The cost record `sessionId`'s spend counts from, in `grep -b` output: the
 *  byte offset grep gives it (where its line starts, or with ugrep where the
 *  match does), and the line. */
export const sessionCostRecord = (found: string, sessionId: string): Readonly<{ offset: number; line: string }> | undefined => {
  const hits = found.split('\n').flatMap(text => {
    const [, offset, line] = /^(\d+):(.*)$/.exec(text) ?? []
    return offset === undefined || line === undefined ? [] : [{ offset: Number(offset), line }]
  })
  return hits[recordFor(hits.map(hit => costRecordOf(hit.line)), sessionId)]
}

/** What `sessionId`'s conversation had spent by `before`, off `transcript`:
 *  its cost record's dollars and every model's tokens in it, then each reply
 *  logged after that record and before `before`, priced at its model's rate
 *  there (a model the record doesn't name adds its tokens alone). A reply
 *  logged since is this process's own, which its ledger counts. Claude Code
 *  logs a reply once per content block, each line with the same usage, so a
 *  reply counts once by its id. Undefined without a well-formed record. */
export const transcriptSpend = (transcript: string, sessionId: string, before: number): Spend | undefined => {
  const lines = transcript.split('\n')
  const records = lines.map(costRecordOf)
  const at = recordFor(records, sessionId)
  const record = records[at]
  if (record === undefined) return undefined
  const models = isRecord(record.modelUsage) ? record.modelUsage : {}
  let usd = countOf(record, 'totalCostUSD')
  let tokens = Object.values(models).filter(isRecord).map(recordTokens).reduce(addTokens, NO_TOKENS)
  const counted = new Set<string>()
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.includes(REPLY_MARKER)) continue
    const entry = parsed(line)
    if (entry?.type !== 'assistant' || (loggedAt(entry) ?? -Infinity) >= before) continue
    const message = isRecord(entry.message) ? entry.message : undefined
    if (message === undefined || typeof message.id !== 'string' || counted.has(message.id) || !isRecord(message.usage)) continue
    counted.add(message.id)
    const reply = replyTokens(message.usage)
    tokens = addTokens(tokens, reply)
    const model = typeof message.model === 'string' ? message.model : undefined
    const priced = model === undefined ? undefined : models[modelName(model)]
    const rate = model !== undefined && isRecord(priced) ? recordRate(priced, model) : null
    if (rate !== null) usd += rate * weightedTokens(reply, model)
  }
  return { usd, tokens }
}
