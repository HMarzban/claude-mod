// What the band remembers across sessions, in the plugin's own store: when
// each session last had a reply, what a token costs on each model, and the
// layout the band draws in. With the first two a reopened session, or a
// reload, says whether its cache is cold and what the next message costs,
// before any reply of its own. What a session has spent is read off its
// transcript, which Claude Code keeps.

import { NO_TOKENS, addTokens, modelName, weightedTokens } from './cache'
import type { Spend, TokenCounts } from './cache'
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
export type Sessions = Readonly<Record<string, Readonly<{ lastAt: number }>>>

/** The base input rate per token, solved from a session's own bill, by model. */
export type Rates = Readonly<Record<string, number>>

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

/** `sessions` with `id`'s reply at `lastAt`, the oldest dropped past MAX_SESSIONS. */
export const rememberReply = (sessions: Sessions, id: string, lastAt: number): Sessions =>
  Object.fromEntries(
    Object.entries({ ...sessions, [id]: { lastAt } })
      .sort(([, a], [, b]) => b.lastAt - a.lastAt)
      .slice(0, MAX_SESSIONS),
  )

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

/** When a transcript's last assistant reply was. Its file time won't do:
 *  Claude Code writes a cost line each time it opens a session. */
export const lastReplyAt = (transcript: string): number | undefined => {
  for (const entry of fromEnd(transcript, '"assistant"')) {
    if (entry.type !== 'assistant' || typeof entry.timestamp !== 'string') continue
    const at = Date.parse(entry.timestamp)
    if (Number.isFinite(at)) return at
  }
  return undefined
}

/** The model the transcript's last reply was billed under, as the API names it. */
export const lastReplyModel = (transcript: string): string | undefined => {
  for (const entry of fromEnd(transcript, '"assistant"')) {
    if (entry.type !== 'assistant' || !isRecord(entry.message)) continue
    const model = entry.message.model
    if (typeof model === 'string' && model !== '') return model
  }
  return undefined
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
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/** The base rate per token on `model`, solved from the transcript's last
 *  cost record. */
export const rateFromTranscript = (transcript: string, model: string): number | null => {
  for (const entry of fromEnd(transcript, '"cost-state"')) {
    if (entry.type !== 'cost-state') continue
    const usage = entry.modelUsage
    const m = isRecord(usage) ? usage[modelName(model)] : undefined
    return isRecord(m) ? recordRate(m, model) : null
  }
  return null
}

/** What marks a cost record's line, for `grep -F` to find. */
export const COST_RECORD = '"type":"cost-state"'

const isCostRecord = (line: string): boolean => line.includes(COST_RECORD) && parsed(line)?.type === 'cost-state'

/** The last well-formed cost record in `grep -b` output: the byte offset its
 *  line starts at in the file, and the line. */
export const lastCostRecord = (found: string): Readonly<{ offset: number; line: string }> | undefined => {
  const lines = found.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const [, offset, line] = /^(\d+):(.*)$/.exec(lines[i] ?? '') ?? []
    if (offset !== undefined && line !== undefined && isCostRecord(line)) return { offset: Number(offset), line }
  }
  return undefined
}

/** What a conversation had spent by the end of `transcript`: its last cost
 *  record's dollars and every model's tokens in it, then each reply logged
 *  after that record, priced at its model's rate there (a model the record
 *  doesn't name adds its tokens alone). Claude Code logs a reply once per
 *  content block, each line with the same usage, so a reply counts once by
 *  its id. Undefined without a well-formed record. */
export const transcriptSpend = (transcript: string): Spend | undefined => {
  const lines = transcript.split('\n')
  const at = lines.findLastIndex(isCostRecord)
  const record = at < 0 ? undefined : parsed(lines[at] ?? '')
  if (record === undefined) return undefined
  const models = isRecord(record.modelUsage) ? record.modelUsage : {}
  let usd = countOf(record, 'totalCostUSD')
  let tokens = Object.values(models).filter(isRecord).map(recordTokens).reduce(addTokens, NO_TOKENS)
  const counted = new Set<string>()
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (!line.includes('"assistant"')) continue
    const entry = parsed(line)
    const message = entry?.type === 'assistant' && isRecord(entry.message) ? entry.message : undefined
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
