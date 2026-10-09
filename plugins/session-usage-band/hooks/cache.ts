// The prompt cache, as the band models it from each response's token counts.

import type { ModelUsage } from 'claude-code'
import type { BandSnapshot } from './snapshot'

type CacheView = BandSnapshot['cache']

export type Ttl = '5m' | '1h'
export const TTL_MS: Readonly<Record<Ttl, number>> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }


// A response that read this much less than the cache held, both in tokens and
// as a share of it, missed the cache.
const MISS_MIN_TOKENS = 2000
const MISS_MIN_SHARE = 0.05

type CacheState = {
  ttl: Ttl
  /** Set by the environment, so never inferred. */
  ttlPinned: boolean
  /** Main-loop requests this conversation. */
  requests: number
  // Every token since the conversation began, subagents included.
  read: number
  written: number
  uncached: number
  output: number
  /** Requests that missed a cache that should have been warm. */
  misses: number
  /** When the last main-loop request was sent. */
  lastAt: number
  /** The last main-loop request's whole window, its response included. */
  window: number
  /** What that request left in the cache; the response is only written on
   *  the next request, never read. */
  cached: number
  /** The next request rebuilds the cache on purpose (a compaction). */
  rebuilding: boolean
  /** The model the last main-loop request ran on; a switch rebuilds the cache. */
  model: string | undefined
  /** The ledger when this conversation's first turn began, so spend from
   *  before it (a /clear, a resume, a reload) can't inflate the rate the
   *  re-warm price is solved from. */
  costBase: number
  baselined: boolean
  /** The conversation is known to start here (a new session, a /clear), so
   *  its cache is warming; after a reload mid-conversation it is unmeasured. */
  knownFresh: boolean
  /** Before this band's first reply: when the conversation's last reply was,
   *  and the base rate per token on its model, as recalled. */
  recall: Readonly<{ lastAt: number; rate: number | null }> | undefined
  /** The model /model has in force, as it names it: perhaps an alias. */
  priceModel: string | undefined
  /** The model the main loop's last reply was billed under, as the API names
   *  it. Where known, the tokens are priced at it. */
  billedModel: string | undefined
}

const INITIAL: Readonly<CacheState> = {
  ttl: '1h',
  ttlPinned: false,
  requests: 0,
  read: 0,
  written: 0,
  uncached: 0,
  output: 0,
  misses: 0,
  lastAt: 0,
  window: 0,
  cached: 0,
  rebuilding: false,
  model: undefined,
  costBase: 0,
  baselined: false,
  knownFresh: false,
  recall: undefined,
  priceModel: undefined,
  billedModel: undefined,
}

const state: CacheState = { ...INITIAL }

/** The model, read-only: only this module's functions change it. */
export const cache: Readonly<CacheState> = state

export const resetCache = (): void => {
  Object.assign(state, INITIAL)
}

/** A new conversation in the same process (/clear, resume): the billing mode
 *  and its TTL carry over, everything measured starts again. The baseline is
 *  provisional until the next turn starts and takes the ledger then. */
export const resetConversation = (costNow: number): void => {
  const { ttl, ttlPinned, priceModel, billedModel } = state
  Object.assign(state, INITIAL, { ttl, ttlPinned, priceModel, billedModel, costBase: costNow, knownFresh: true })
}

/** What the band recalls of the conversation's last reply, before its own. */
export const noteRecall = (lastAt: number, rate: number | null): void => {
  state.recall = { lastAt, rate }
}

/** Whether the cache stands as recalled: no reply seen yet, a conversation
 *  that didn't start here, and something to recall. */
const isRecalled = (): boolean => state.requests === 0 && !state.knownFresh && state.recall !== undefined

/** At load: a ledger that has spent nothing is a new conversation. */
export const noteLoad = (costNow: number | undefined): void => {
  state.knownFresh = !costNow
}

/** The TTL the environment pins, if it pins one. */
export const resolveTtl = (env: {
  force5m: string | undefined
  chosen: string | undefined
  enable1h: string | undefined
}): Ttl | undefined => {
  if (env.force5m === '1') return '5m'
  if (env.chosen === '5m' || env.chosen === '1h') return env.chosen
  if (env.enable1h === '1') return '1h'
  return undefined
}

export const pinTtl = (ttl: Ttl): void => {
  state.ttl = ttl
  state.ttlPinned = true
}

/** A compaction replaces the conversation with a summary: the next request
 *  rebuilds the cache on purpose, at the summary's size. */
export const noteCompaction = (sizeAfter: number | undefined): void => {
  state.rebuilding = true
  if (sizeAfter !== undefined) {
    state.window = sizeAfter
    state.cached = 0
  }
}

/** The engine may reset the ledger on /clear: once it reads below the
 *  baseline, it counts this conversation alone, so the baseline is 0. */
export const noteLedger = (costNow: number): void => {
  if (costNow < state.costBase) state.costBase = 0
}

/** The ledger as this conversation's first turn starts: its baseline. */
export const noteConversationStart = (costNow: number): void => {
  if (state.baselined) return
  state.costBase = costNow
  state.baselined = true
}

export const recordResponse = (
  usage: Pick<ModelUsage, 'input_tokens' | 'output_tokens' | 'cache_read_input_tokens' | 'cache_creation_input_tokens'>,
  sentAt: number,
  isMain: boolean,
  model: string | undefined,
): void => {
  const hit = usage.cache_read_input_tokens
  const written = usage.cache_creation_input_tokens
  const fresh = usage.input_tokens

  // The session's bill includes every subagent, so their tokens count toward
  // the totals the rate is solved from. Their prefixes are their own, though:
  // they say nothing about the main conversation's cache or its countdown.
  state.read += hit
  state.written += written
  state.uncached += fresh
  state.output += usage.output_tokens
  if (!isMain) return

  const prefix = state.cached
  const gap = state.requests > 0 ? sentAt - state.lastAt : 0
  // Another model has its own cache: reading nothing after a switch is no miss.
  const switched = state.model !== undefined && model !== undefined && model !== state.model

  if (prefix > 0 && !state.rebuilding && !switched && gap <= TTL_MS[state.ttl]) {
    const shortfall = prefix - hit
    if (shortfall >= MISS_MIN_TOKENS && shortfall > prefix * MISS_MIN_SHARE) {
      // An assumed hour that read nothing after five idle minutes was five.
      if (!state.ttlPinned && state.ttl === '1h' && hit === 0 && gap > TTL_MS['5m']) {
        state.ttl = '5m'
      } else {
        state.misses += 1
      }
    }
  }

  state.requests += 1
  state.window = fresh + hit + written + usage.output_tokens
  state.cached = hit + written
  state.lastAt = sentAt
  state.rebuilding = false
  state.model = model ?? state.model
}

// The price of each kind of token against base input. Writes and output hold
// one ratio across Anthropic's models; reads do not. Claude Code's own ledger
// prices every cache write at 1.25×, whatever its lifetime, so the band does
// too, to agree with the cost it shows.
const WRITE_MULT = 1.25
const OUTPUT_MULT = 5
/** A cache read against base input, by model; 0.1× elsewhere. Per Anthropic's
 *  list prices as of 2026-10: Opus 5.5 reads at $0.20 on $4.00 input, Fable
 *  and Mythos 5.1 at $0.25 on $10.00. */
const READ_MULT_BY_MODEL: Readonly<Record<string, number>> = {
  'claude-opus-5-5': 0.05,
  'claude-fable-5-1': 0.025,
  'claude-mythos-5-1': 0.025,
}
const DEFAULT_READ_MULT = 0.1

/** The model a name bills as. `/model` names a 1M context window with a
 *  suffix, `claude-opus-5-5[1m]`, and the cost record names the model alone. */
export const modelName = (model: string): string => model.replace(/\[[^\]]*\]$/, '')

/** What a cache read costs against base input on `model`. */
export const readMultiplier = (model: string | undefined): number =>
  (model === undefined ? undefined : READ_MULT_BY_MODEL[modelName(model)]) ?? DEFAULT_READ_MULT

export const notePriceModel = (model: string | undefined): void => {
  state.priceModel = model
}

export const noteBilledModel = (model: string): void => {
  state.billedModel = model
}

/** The model the tokens are priced at: the one replies are billed under, else
 *  what /model names, which may be an alias such as `opus[1m]`. */
export const pricedModel = (): string | undefined =>
  state.billedModel ?? (state.priceModel === undefined ? undefined : modelName(state.priceModel))

/** A cache read's price against input, on the model in force. */
export const readShare = (): number => readMultiplier(pricedModel())

/** Tokens weighted by their price against base input on `model`: the one
 *  unknown left is the base rate itself. */
export const weightedTokens = (
  t: Readonly<{ uncached: number; written: number; read: number; output: number }>,
  model: string | undefined,
): number => t.uncached + WRITE_MULT * t.written + readMultiplier(model) * t.read + OUTPUT_MULT * t.output

/** The base rate per token, in dollars.
 *
 *  No pricing table is available to a mod, so the rate is solved from the
 *  session's own bill, which leaves one unknown:
 *
 *    cost = r * (uncached + 1.25*written + read multiplier*read + 5*output)
 *
 *  It self-calibrates to whatever model and plan are in force, and it is an
 *  estimate on top of an estimate (the session cost is itself computed at list
 *  price), so what it prices is always shown with a "~". Call noteLedger first. */
export const ratePerToken = (sessionCost: number | undefined): number | null => {
  if (!sessionCost || sessionCost <= 0) return null
  const weighted = weightedTokens(state, pricedModel())
  if (weighted <= 0) return null
  const billed = sessionCost - state.costBase
  if (billed <= 0) return null
  const rate = billed / weighted
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/** What writing `tokens` to the cache costs at a base `rate` per token. */
export const reWarmAt = (rate: number, tokens: number): number => rate * WRITE_MULT * tokens

/** What a cold cache would cost to rebuild: a cache write of the whole window. */
export const reWarmUsd = (sessionCost: number | undefined): number | null => {
  const rate = ratePerToken(sessionCost)
  return rate === null ? null : reWarmAt(rate, state.window)
}

/** What reading from the cache saved against paying full input price for
 *  the same tokens: the rest of the base rate on every cache read. */
export const savedUsd = (sessionCost: number | undefined): number | null => {
  const rate = ratePerToken(sessionCost)
  return rate === null || state.read <= 0 ? null : rate * (1 - readShare()) * state.read
}

export const hitRatio = (): number | null => {
  const total = state.read + state.written + state.uncached
  return total > 0 ? state.read / total : null
}

/** The cache's time left: from the last reply this band saw, else the one
 *  it recalls; a full lifetime before either. */
export const msLeft = (now: number): number => {
  const from = state.requests > 0 ? state.lastAt : isRecalled() ? state.recall?.lastAt : undefined
  return from === undefined ? TTL_MS[state.ttl] : Math.max(0, from + TTL_MS[state.ttl] - now)
}

/** The cache as the band shows it, at `now`: measured once a reply has been
 *  seen, recalled before that. `contextTokens` is the context as it stands,
 *  which a recalled cold cache would rebuild. */
export const cacheView = (now: number, sessionCost: number | undefined, contextTokens: number): CacheView => {
  const recalled = isRecalled()
  const rate = state.recall?.rate ?? null
  return {
    requests: state.requests,
    msLeft: msLeft(now),
    ttl: state.ttl,
    ttlPinned: state.ttlPinned,
    window: recalled ? contextTokens : state.window,
    hitRatio: hitRatio(),
    misses: state.misses,
    reWarmUsd: recalled ? (rate === null ? null : reWarmAt(rate, contextTokens)) : reWarmUsd(sessionCost),
    recalled,
    idleMs: recalled && state.recall !== undefined ? now - state.recall.lastAt : null,
    savedUsd: savedUsd(sessionCost),
    readShare: readShare(),
    fresh: state.knownFresh,
    tokens: { sent: state.uncached + state.written, back: state.output, cached: state.read },
  }
}
