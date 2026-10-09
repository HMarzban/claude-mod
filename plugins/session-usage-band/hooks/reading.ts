// What the band reads off its snapshot before it draws anything: the cache's
// mood and every word about it, the context's fill, a limit's tone and pace.
// Pure, so each can be checked without mounting the band.

import { TTL_MS } from './cache'
import { COMPACT_NEAR, SOON_MS, WARN_AT, clamp01, contextUsed, fmtCountdown, fmtEstimate, fmtTokens, resetIn } from './format'
import type { BandSnapshot, LimitReading } from './snapshot'

export type Tone = 'calm' | 'amber'

// ---- the cache --------------------------------------------------------------

type Cache = BandSnapshot['cache']

/** Unmeasured: loaded mid-conversation, before its next reply. */
export type CacheMood = 'unmeasured' | 'warming' | 'warm' | 'expiring' | 'cold'

export const cacheMood = (c: Cache): CacheMood =>
  c.requests === 0 && !c.recalled
    ? c.fresh
      ? 'warming'
      : 'unmeasured'
    : c.msLeft <= 0
      ? 'cold'
      : c.msLeft <= SOON_MS
        ? 'expiring'
        : 'warm'

/** The battery's charge: the share of the lifetime left, full while Claude
 *  works, empty when there is nothing to count. */
export const cacheCharge = (c: Cache, mood: CacheMood, isWorking: boolean): number =>
  mood === 'unmeasured' || mood === 'warming' || mood === 'cold' ? 0 : mood === 'warm' && isWorking ? 1 : c.msLeft / TTL_MS[c.ttl]

/** What the next message costs to rebuild the cache: dollars when a rate is
 *  known, else the tokens it writes. */
export const reWarmEstimate = (c: Cache): string => (c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`)

/** Every word the band says about the cache, for one mood: the pill, its
 *  hover, the card's headline and note, and the battery's name. One table,
 *  so a mood's wording changes in one place. */
export type CacheCopy = Readonly<{
  pill: (short: boolean) => string
  hover: string
  head: string
  note: string | undefined
  alt: string
}>

export const cacheCopy = (c: Cache, mood: CacheMood, isWorking: boolean): CacheCopy => {
  const estimate = reWarmEstimate(c)
  // What a warm read costs against input on the model in force: 5% on Opus 5.5.
  const readPct = `${+(c.readShare * 100).toFixed(1)}%`
  const left = fmtCountdown(c.msLeft)
  const charge = cacheCharge(c, mood, isWorking)
  const battery = charge <= 0 ? 'cache battery empty' : `cache battery ${Math.round(clamp01(charge) * 100)}% left`
  const warmHover = `Warm cache bills input at ${readPct}; expires ${c.ttl} after a reply`
  switch (mood) {
    case 'unmeasured':
      return {
        pill: () => 'cache –',
        hover: "Not measured since the band loaded; the countdown starts with Claude's next reply",
        head: 'Not measured yet',
        note: "Countdown starts with Claude's next reply.",
        alt: 'cache not measured yet',
      }
    case 'warming':
      return {
        pill: () => 'cache warming',
        hover: `Your first message builds the cache; after that it bills input at ${readPct}`,
        head: 'Warming',
        note: 'First message builds the cache.',
        alt: 'cache warming',
      }
    case 'expiring':
      return {
        pill: short => (short ? `${left} ${estimate}` : `${left} left · re-warm ${estimate}`),
        hover: warmHover,
        head: `${left} left`,
        note: undefined,
        alt: battery,
      }
    case 'cold':
      return {
        // Cold is a price, not an error: neutral, no hue, no alarm.
        pill: short => (short ? `cold ${estimate}` : `cache cold · next message ${estimate}`),
        hover: `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`,
        head: 'Cold',
        note: undefined,
        alt: battery,
      }
    case 'warm':
      return {
        // Mid-turn every step restarts the TTL, so a countdown would only bounce.
        pill: () => (isWorking ? 'cache warm' : `cache ${left}`),
        hover: warmHover,
        head: isWorking ? 'Warm' : `${left} left`,
        note: undefined,
        alt: battery,
      }
  }
}

// ---- the context ------------------------------------------------------------

/** The context's fill, measured toward auto-compaction when it is known:
 *  full means compacting, and no tick is needed to show where. */
export const contextReading = (ctx: BandSnapshot['context']) => {
  const used = contextUsed(ctx) ?? 0
  const frac = clamp01(used / (ctx.compactAt ?? ctx.window))
  const nearCompact = ctx.compactAt !== undefined && frac >= COMPACT_NEAR
  const tone: Tone = nearCompact || (ctx.compactAt === undefined && frac >= WARN_AT) ? 'amber' : 'calm'
  return {
    known: ctx.percent !== undefined || ctx.tokens !== undefined,
    used,
    frac,
    pct: `${Math.round(frac * 100)}%`,
    toCompact: ctx.compactAt === undefined ? undefined : Math.max(0, ctx.compactAt - used),
    nearCompact,
    tone,
  }
}

// ---- the limits -------------------------------------------------------------

/** A window past its reset: its last reading is from before it. */
export const hasReset = (reading: LimitReading, now: number): boolean => resetIn(reading.resetsAt, now)?.kind === 'passed'

/** The share of a window gone, from its length and its reset. */
export const windowGone = (reading: LimitReading, windowMs: number | undefined, now: number): number | undefined => {
  const at = reading.resetsAt === undefined ? NaN : Date.parse(reading.resetsAt)
  return windowMs === undefined || Number.isNaN(at) || at <= now ? undefined : clamp01(1 - (at - now) / windowMs)
}

/** A limit's tone, the one rule chip and card share: amber at WARN_AT, or
 *  when a pace (`etaMs`) would fill it before it resets; calm once reset. */
export const limitTone = (reading: LimitReading, now: number, etaMs: number | null = null): Tone =>
  !hasReset(reading, now) && (clamp01(reading.percentUsed / 100) >= WARN_AT || etaMs !== null) ? 'amber' : 'calm'
