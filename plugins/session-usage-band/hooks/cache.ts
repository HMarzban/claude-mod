// ── prompt cache ───────────────────────────────────────────────────────
export type Ttl = '5m' | '1h'
export const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

const MISS_MIN_TOKENS = 2000
const MISS_MIN_SHARE = 0.05
export const SOON_MS = 60_000

export const cache = {
  ttl: '1h' as Ttl,
  ttlPinned: false,
  requests: 0,
  read: 0,
  written: 0,
  uncached: 0,
  output: 0,
  misses: 0,
  lastAt: 0,
  window: 0,
  // What the last main-loop request left in the cache. The window also holds
  // the response, which is only written on the next request, never read.
  cached: 0,
  rebuilding: false,
  // Session cost when this conversation began, so a /clear's earlier spend
  // can't inflate the rate the re-warm price is solved from.
  costBase: 0,
}

export const resetCache = (): void => {
  cache.ttl = '1h'
  cache.ttlPinned = false
  cache.requests = 0
  cache.read = 0
  cache.written = 0
  cache.uncached = 0
  cache.output = 0
  cache.misses = 0
  cache.lastAt = 0
  cache.window = 0
  cache.cached = 0
  cache.rebuilding = false
  cache.costBase = 0
}

/** A new conversation in the same process (/clear, resume): the billing
 *  mode and its TTL carry over, everything measured starts again. */
export const resetConversation = (costNow: number): void => {
  const { ttl, ttlPinned } = cache
  resetCache()
  cache.ttl = ttl
  cache.ttlPinned = ttlPinned
  cache.costBase = costNow
}

export const recordResponse = (
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  },
  now: number,
  isMain: boolean,
): void => {
  const read_ = usage.cache_read_input_tokens
  const written = usage.cache_creation_input_tokens
  const fresh = usage.input_tokens

  // The session's bill includes every subagent, so their tokens count toward
  // the totals the rate is solved from. Their prefixes are their own, though:
  // they say nothing about the main conversation's cache or its countdown.
  cache.read += read_
  cache.written += written
  cache.uncached += fresh
  cache.output += usage.output_tokens
  if (!isMain) return

  const prefix = cache.cached
  const gap = cache.requests > 0 ? now - cache.lastAt : 0

  if (prefix > 0 && !cache.rebuilding && gap <= TTL_MS[cache.ttl]) {
    const shortfall = prefix - read_
    if (shortfall >= MISS_MIN_TOKENS && shortfall > prefix * MISS_MIN_SHARE) {
      if (!cache.ttlPinned && cache.ttl === '1h' && read_ === 0 && gap > TTL_MS['5m']) {
        cache.ttl = '5m'
      } else {
        cache.misses += 1
      }
    }
  }

  cache.requests += 1
  cache.window = fresh + read_ + written + usage.output_tokens
  cache.cached = read_ + written
  cache.lastAt = now
  cache.rebuilding = false
}

/** What a cold cache would cost, in dollars.
 *
 *  No pricing table is available to a mod, so the rate is solved from the
 *  session's own bill. Anthropic models hold the same ratios between the four
 *  rates — a cache write is 1.25x base input, a cache read 0.1x, output 5x —
 *  so one unknown remains:
 *
 *    cost = r * (uncached + 1.25*written + 0.1*read + 5*output)
 *
 *  Solve for r, then price the re-warm as a cache write of the whole window.
 *  It self-calibrates to whatever model and plan are in force, and it is an
 *  estimate on top of an estimate (the session cost is itself computed at list
 *  price), so it is always shown with a "~" and never without one. */
const WRITE_MULT = 1.25
const READ_MULT = 0.1
const OUTPUT_MULT = 5

export const reWarmUsd = (sessionCost: number | undefined): number | null => {
  if (!sessionCost || sessionCost <= 0) return null
  const weighted =
    cache.uncached + WRITE_MULT * cache.written + READ_MULT * cache.read + OUTPUT_MULT * cache.output
  if (weighted <= 0) return null
  // A ledger below the baseline was reset by the engine, so it already
  // counts this conversation alone.
  const billed = sessionCost >= cache.costBase ? sessionCost - cache.costBase : sessionCost
  if (billed <= 0) return null
  const rate = billed / weighted
  const usd = rate * WRITE_MULT * cache.window
  return Number.isFinite(usd) && usd > 0 ? usd : null
}


export const hitRatio = (): number | null => {
  const total = cache.read + cache.written + cache.uncached
  return total > 0 ? cache.read / total : null
}

export const msLeft = (now: number): number =>
  cache.requests === 0 ? TTL_MS[cache.ttl] : Math.max(0, cache.lastAt + TTL_MS[cache.ttl] - now)
