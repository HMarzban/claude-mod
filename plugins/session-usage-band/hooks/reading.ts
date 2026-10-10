// What the band reads off its snapshot before it draws anything: the cache's
// mood and every word about it, the context's fill, a limit's tone and pace.
// Pure, so each can be checked without mounting the band.

import { TTL_MS } from './cache'
import {
  COMPACT_NEAR,
  FIVE_HOUR_MS,
  SEVEN_DAY_MS,
  SOON_MS,
  WARN_AT,
  clamp01,
  contextUsed,
  fmtCountdown,
  fmtEstimate,
  fmtPct,
  fmtTokens,
  resetIn,
} from './format'
import type { ResetIn } from './format'
import type { BandSnapshot, Glyphs, LimitReading } from './snapshot'
import { cacheWords, contextWords, limitWords, spendWords, workspaceWords } from './words'
import type { CacheWords, ContextWords, LimitWords, SpendWords } from './words'

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
    pct: fmtPct(frac),
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

// ---- the facts every layout draws from ------------------------------------
// Moved from band.tsx; words.ts phrases them, and readingsOf puts the two together.

/** How the band is mounted and when: what every view lays itself out by. */
export type Frame = Readonly<{
  expanded: boolean
  maxRows: number
  now: number
  isWorking: boolean
  /** The tier drawn in: the session's on a terminal, where ambiguous-width
   *  glyphs can draw wide; the band's own glyphs on every other surface. */
  glyphs: Glyphs
  utcOffsetMin: number | undefined
}>

export type CacheFacts = Readonly<{
  mood: CacheMood
  tone: Tone
  charge: number
  estimate: string
  measured: boolean
  known: boolean
  /** The hit ratio, once measured. */
  hitFrac: number | undefined
  /** Time to cold while it counts down: expiring, or warm while Claude isn't working. */
  coldInMs: number | undefined
}>

export type ContextFacts = ReturnType<typeof contextReading> & Readonly<{ compactAt: number | undefined; window: number }>

export type SpendFacts = Readonly<{
  totalUsd: number
  lastTurnUsd: number | null
  sent: number
  back: number
  cached: number
  total: number
}>

export type LimitKey = '5h' | '7d' | 'other'

export type LimitFacts = Readonly<{
  name: string
  key: LimitKey
  percentUsed: number
  frac: number
  tone: Tone
  /** `82%`, with no severity mark: chips adds its own. */
  value: string
  etaMs: number | null
  reset: ResetIn | undefined
  passed: boolean
  gone: number | undefined
  /** 100 when a 5h fill is measured; else the average's landing, once 5% of the window has gone. */
  projectedPct: number | undefined
  /** `projectedPct` as a share, at most 1; undefined once passed. */
  projectedFrac: number | undefined
  /** Time to the reset; undefined once it has passed. */
  resetInMs: number | undefined
}>

// What the views read: each section's facts, and its words beside them.
export type CacheReading = CacheFacts & CacheWords
export type ContextReading = ContextFacts & ContextWords
export type SpendReading = SpendFacts & SpendWords
/** A limit window as the views read it. A view, not a reading: `LimitReading`
 *  is the snapshot's raw window. */
export type LimitView = LimitFacts & LimitWords

/** A window as chips' Limits card reads it: the view, and the card's pace tail. */
export type ChipsWindow = LimitView & Readonly<{ cardPace: string }>

export type ChipsReadings = Readonly<{
  /** The snapshot itself: chips' own code moved over unchanged. Only chips reads it. */
  raw: BandSnapshot
  reading: Readonly<{ copy: CacheCopy; tokenBreakdown: string; windows: readonly ChipsWindow[] }>
}>

export type Readings = Readonly<{
  frame: Frame
  cache: CacheReading
  spend: SpendReading
  context: ContextReading
  fiveHour: LimitView | undefined
  sevenDay: LimitView | undefined
  /** 5h, 7d, then every other window the engine reports. */
  limits: readonly LimitView[]
  worstLimit: LimitView | undefined
  workspace: BandSnapshot['workspace']
  /** The workspace as one line: `~/workspace/claude-mod, branch main, clean`. */
  workspaceText: string | undefined
  chips: ChipsReadings
}>

/** The cache's mood, tone, charge and re-warm price, and whether its timing is known. */
export const cacheFacts = (snap: BandSnapshot): CacheFacts => {
  const c = snap.cache
  const mood = cacheMood(c)
  // Measured: a reply seen, or a resumed conversation's tokens read off its transcript.
  const measured = c.requests > 0 || c.recovered
  // Mid-turn every step restarts the TTL, so a countdown would only bounce.
  const counting = mood === 'expiring' || (mood === 'warm' && !snap.isWorking)
  return {
    mood,
    tone: mood === 'expiring' ? 'amber' : 'calm',
    charge: cacheCharge(c, mood, snap.isWorking),
    estimate: reWarmEstimate(c),
    measured,
    // Measured, or recalled from the session's last reply: time and price known.
    known: measured || c.recalled,
    hitFrac: measured && c.hitRatio !== null ? c.hitRatio : undefined,
    coldInMs: counting ? c.msLeft : undefined,
  }
}

/** The context's fill, with the compaction point and the model window it is read against. */
export const contextFacts = (snap: BandSnapshot): ContextFacts => ({
  ...contextReading(snap.context),
  compactAt: snap.context.compactAt,
  window: snap.context.window,
})

/** The session's cost and its tokens: sent, back, read from cache, and their total. */
export const spendFacts = (snap: BandSnapshot): SpendFacts => {
  const t = snap.cache.tokens
  return { totalUsd: snap.costUsd, lastTurnUsd: snap.lastTurnUsd, sent: t.sent, back: t.back, cached: t.cached, total: t.sent + t.back + t.cached }
}

/** The facts of each window the engine reports: 5h, 7d, then the rest. */
export const limitFacts = (snap: BandSnapshot): LimitFacts[] => {
  const one = (name: string, key: LimitKey, reading: LimitReading, windowMs: number | undefined, etaMs: number | null): LimitFacts => {
    const reset = resetIn(reading.resetsAt, snap.now)
    const passed = reset?.kind === 'passed'
    const gone = windowGone(reading, windowMs, snap.now)
    // A measured fill lands it at 100, so the words and the amber agree; else
    // the average's landing, once 5% of the window has gone.
    const projectedPct = etaMs !== null ? 100 : gone === undefined || gone < 0.05 ? undefined : reading.percentUsed / gone
    return {
      name,
      key,
      etaMs,
      reset,
      gone,
      percentUsed: reading.percentUsed,
      frac: clamp01(reading.percentUsed / 100),
      tone: limitTone(reading, snap.now, etaMs),
      value: `${Math.round(reading.percentUsed)}%`,
      passed,
      projectedPct,
      projectedFrac: passed || projectedPct === undefined ? undefined : clamp01(projectedPct / 100),
      resetInMs: reset?.kind === 'in' ? Date.parse(reading.resetsAt ?? '') - snap.now : undefined,
    }
  }
  return [
    ...(snap.fiveHour ? [one('5h', '5h', snap.fiveHour, FIVE_HOUR_MS, snap.fiveHour.etaMs)] : []),
    ...(snap.sevenDay ? [one('7d', '7d', snap.sevenDay, SEVEN_DAY_MS, null)] : []),
    ...snap.otherLimits.map(limit => one(limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' '), 'other', limit, undefined, null)),
  ]
}

/** Everything a view reads, built once per draw: the frame, each section's
 *  facts and words, and chips' own inputs. */
export const readingsOf = (snap: BandSnapshot): Readings => {
  const c = snap.cache
  const frame: Frame = {
    expanded: snap.expanded,
    maxRows: snap.maxRows,
    now: snap.now,
    isWorking: snap.isWorking,
    glyphs: snap.surface === 'terminal' ? snap.glyphs : 'unicode',
    utcOffsetMin: snap.utcOffsetMin,
  }
  const cache = cacheFacts(snap)
  const spend = spendFacts(snap)
  const context = contextFacts(snap)
  const limits = limitFacts(snap).map((f): LimitView => ({ ...f, ...limitWords(f, frame) }))
  // The headline is the window closest to its limit.
  const worstLimit = limits
    .filter(l => !l.passed)
    .reduce<LimitView | undefined>((top, l) => (top === undefined || l.percentUsed > top.percentUsed ? l : top), undefined)
  return {
    frame,
    cache: { ...cache, ...cacheWords(cache, c, frame) },
    spend: { ...spend, ...spendWords(spend) },
    context: { ...context, ...contextWords(context) },
    fiveHour: limits.find(l => l.key === '5h'),
    sevenDay: limits.find(l => l.key === '7d'),
    limits,
    worstLimit,
    workspace: snap.workspace,
    workspaceText: workspaceWords(snap.workspace),
    chips: {
      raw: snap,
      reading: {
        copy: cacheCopy(c, cache.mood, snap.isWorking),
        tokenBreakdown: `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`,
        windows: limits.map((l): ChipsWindow => ({ ...l, cardPace: l.pace === '' ? '' : ` · ${l.pace}` })),
      },
    },
  }
}
