// What the band remembers across sessions, in the plugin's own store: when
// each session last had a reply, what a token costs on each model, the
// layout the band draws in, and a week's worth of limit samples. With the
// first two a reopened session, or a reload, says whether its cache is cold
// and what the next message costs, before any reply of its own, and with the
// samples the week shows the days before this session. What the store leaves
// unknown of a last reply is recalled off the transcript (transcript.ts).

import { modelName } from './cache'
import type { RecalledReply } from './cache'
import { MINUTE_MS, SEVEN_DAY_MS } from './format'
import { splitLimits } from './snapshot'
import { isRecord, lastReplyAt, lastReplyModel, rateFromTranscript } from './transcript'

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

/** Both limits now, as one sample; undefined unless each is reported with a reset. */
export const sampleOf = (now: number, limits: ReadonlyArray<Readonly<{ kind: string; percentUsed: number; resetsAt: number | undefined }>>): Sample | undefined => {
  const { five, seven } = splitLimits(limits)
  const fiveResetAt = five?.resetsAt
  const sevenResetAt = seven?.resetsAt
  if (five === undefined || seven === undefined || fiveResetAt === undefined || sevenResetAt === undefined) return undefined
  return { at: now, fivePct: five.percentUsed, sevenPct: seven.percentUsed, fiveResetAt, sevenResetAt }
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
