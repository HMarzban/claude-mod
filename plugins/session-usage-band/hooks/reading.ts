// What the band reads off its snapshot before it draws anything: the cache's
// mood and every word about it, the context's fill, a limit's tone and pace.
// Pure, so each can be checked without mounting the band.

import { TTL_MS } from './cache'
import { weekOf } from './calendar'
import type { DayCell, HourCell, Week, WindowNow } from './calendar'
import {
  COMPACT_NEAR,
  DAY_MS,
  FIVE_HOUR_MS,
  LAST_CALL_MS,
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
import { drawnTier } from './glyphs'
import type { Trails } from './insights'
import type { BandSnapshot, Glyphs, LimitReading } from './snapshot'
import { cacheWords, contextWords, historyWords, lastHourOf, limitWords, spendWords, thisWindowOf, weekWords, workspaceWords } from './words'
import type { CacheWords, ContextWords, HistoryWords, LimitWords, SpendWords, WeekWords } from './words'

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

/** Every word chips' row says about the cache, for one mood: the pill, its
 *  hover and the battery's name. One table, so a mood's wording changes in
 *  one place; the cards read theirs from `cacheWords`. */
export type CacheCopy = Readonly<{
  pill: (short: boolean) => string
  /** The countdown a calm pill ends on, `52m`: its figure, for a layout that bolds it. */
  figure: string | undefined
  hover: string
  alt: string
}>

export const cacheCopy = (c: Cache, mood: CacheMood, isWorking: boolean): CacheCopy => {
  const estimate = reWarmEstimate(c)
  // What a warm read costs against input on the model in force: 5% on Opus 5.5.
  const readPct = `${+(c.readShare * 100).toFixed(1)}%`
  const left = fmtCountdown(c.msLeft)
  const charge = cacheCharge(c, mood, isWorking)
  const battery = charge <= 0 ? 'cache battery empty' : `cache battery ${Math.round(clamp01(charge) * 100)}% left`
  const warmHover = `${left} left; warm cache bills input at ${readPct}, expires ${c.ttl} after a reply`
  switch (mood) {
    case 'unmeasured':
      return {
        pill: () => 'cache –',
        figure: undefined,
        hover: "Not measured since the band loaded; the countdown starts with Claude's next reply",
        alt: 'cache not measured yet',
      }
    case 'warming':
      return {
        pill: () => 'cache warming',
        figure: undefined,
        hover: `Your first message builds the cache; after that it bills input at ${readPct}`,
        alt: 'cache warming',
      }
    case 'expiring':
      return {
        pill: short => (short ? `${left} ${estimate}` : `${left} left · re-warm ${estimate}`),
        figure: undefined,
        hover: warmHover,
        alt: battery,
      }
    case 'cold':
      return {
        // Cold is a price, not an error: neutral, no hue, no alarm.
        pill: short => (short ? `cold ${estimate}` : `cache cold · next message ${estimate}`),
        figure: undefined,
        hover: `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`,
        alt: battery,
      }
    case 'warm':
      return {
        // Mid-turn every step restarts the TTL, so a countdown would only bounce.
        pill: () => (isWorking ? 'cache warm' : `cache ${left}`),
        figure: isWorking ? undefined : left,
        hover: warmHover,
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

/** Messages until `room` more tokens are in context, at the pace the trail
 *  has grown since its last drop, a compaction or a clear; undefined until
 *  two points show it growing. */
export const messagesTo = (trail: readonly number[], room: number | undefined): number | undefined => {
  let start = 0
  for (let i = 1; i < trail.length; i++) if ((trail[i] ?? 0) < (trail[i - 1] ?? 0)) start = i
  const first = trail[start]
  const last = trail[trail.length - 1]
  const steps = trail.length - 1 - start
  if (room === undefined || first === undefined || last === undefined || steps < 1 || last <= first) return undefined
  return Math.max(1, Math.ceil(room / ((last - first) / steps)))
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
  /** Departures' last call: under LAST_CALL_MS to cold, or for the 5-minute
   *  cache its last minute. */
  lastCall: boolean
}>

export type ContextFacts = ReturnType<typeof contextReading> &
  Readonly<{
    compactAt: number | undefined
    autoCompactOff: boolean
    window: number
    /** Messages until compaction at the conversation's pace; undefined until it shows one. */
    msgsToCompact: number | undefined
  }>

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
  /** Where a bar's notch sits: the share of the window gone, while any of
   *  it is used; with none used, the window may not have begun. */
  notch: number | undefined
  /** 100 when a 5h fill is measured; else the average's landing, once 5% of
   *  the window has gone and any of it is used. */
  projectedPct: number | undefined
  /** `projectedPct` as a share, at most 1; undefined once passed. */
  projectedFrac: number | undefined
  /** Time to the reset; undefined once it has passed. */
  resetInMs: number | undefined
  /** Time to full before the reset: a measured fill, else the average's,
   *  once it lands at 100% or more; undefined while it lands short. */
  fillInMs: number | undefined
  /** `fillInMs` while there is something left to fill: undefined once
   *  passed, or full. */
  fullInMs: number | undefined
  /** Departures' last call: under LAST_CALL_MS to full. */
  lastCall: boolean
}>

// What the views read: each section's facts, and its words beside them.
export type CacheReading = CacheFacts & CacheWords
export type ContextReading = ContextFacts & ContextWords
type SpendReading = SpendFacts & SpendWords
/** A limit window as the views read it. A view, not a reading: `LimitReading`
 *  is the snapshot's raw window. */
export type LimitView = LimitFacts & LimitWords

type ChipsReadings = Readonly<{
  /** The snapshot itself: chips' own code moved over unchanged. Only chips reads it. */
  raw: BandSnapshot
  reading: Readonly<{ copy: CacheCopy; tokenBreakdown: string }>
}>

/** The conversation's trails, their words, and the series a chart draws. */
export type HistoryReading = Trails &
  HistoryWords &
  Readonly<{
    /** No cost yet this conversation. */
    empty: boolean
    /** Each message's cost, oldest first. */
    costValues: readonly number[]
    /** Which of them were re-warms. */
    reWarms: readonly boolean[]
    /** The 5h trail's percentages. */
    fiveHourValues: readonly number[]
    /** The same over the last hour. */
    fiveHourHour: readonly number[]
    /** The same since the 5h window started; none while no window is known. */
    fiveHourWindow: readonly number[]
  }>

export type { DayCell, HourCell } from './calendar'

/** How week draws a slice: measured, a guess, the guess that fills the
 *  limit, none left after it, or not known. */
export type SliceKind = 'measured' | 'guess' | 'fills' | 'spent' | 'unknown'
/** A slice as drawn: its kind and its rise in points toward the cap. */
export type SliceMark = Readonly<{ kind: SliceKind; pct: number }>
/** A window's slices as drawn, and where now falls among them, counted in
 *  slices: 0.5 is halfway through the first. Undefined where not known. */
export type SliceRow = Readonly<{ marks: readonly SliceMark[]; notch: number | undefined }>

/** The week's day and hour cells, as calendar.ts reads them and as drawn, with their words. */
type WeekReading = Week &
  WeekWords &
  Readonly<{
    /** The days and the hours as drawn, each guess stopped at the cap. */
    dayRow: SliceRow
    hourRow: SliceRow
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
  /** Built the first time a view reads it, so chips never pays for it. */
  history: HistoryReading
  /** The week's day and hour cells; built, like history, the first time a view reads it. */
  week: WeekReading
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
    // A 5-minute cache is always under ten minutes from cold, so its last
    // call is its last minute, when chips turns amber too.
    lastCall: counting && (c.ttl === '5m' ? mood === 'expiring' : c.msLeft < LAST_CALL_MS),
  }
}

/** The context's fill, with the compaction point and the model window it is read against. */
export const contextFacts = (snap: BandSnapshot): ContextFacts => {
  const reading = contextReading(snap.context)
  return {
    ...reading,
    compactAt: snap.context.compactAt,
    autoCompactOff: snap.context.autoCompactOff,
    window: snap.context.window,
    msgsToCompact: messagesTo(snap.history.context, reading.toCompact),
  }
}

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
    // the average's landing, once 5% of the window has gone and any of it is
    // used: with none, the window may not have begun.
    const projectedPct =
      etaMs !== null ? 100 : gone === undefined || gone < 0.05 || reading.percentUsed <= 0 ? undefined : reading.percentUsed / gone
    // At the average's pace, what is left takes the time gone so far, scaled by what is left over what is used.
    const averageFill =
      projectedPct === undefined || projectedPct < 100 || gone === undefined || windowMs === undefined
        ? undefined
        : (Math.max(0, 100 - reading.percentUsed) / reading.percentUsed) * gone * windowMs
    const fillInMs = etaMs ?? averageFill
    // A full window has nothing left to fill: it says its percent, and its reset.
    const fullInMs = passed || reading.percentUsed >= 100 ? undefined : fillInMs
    return {
      name,
      key,
      etaMs,
      reset,
      gone,
      notch: reading.percentUsed > 0 ? gone : undefined,
      percentUsed: reading.percentUsed,
      frac: clamp01(reading.percentUsed / 100),
      tone: limitTone(reading, snap.now, etaMs),
      value: `${Math.round(reading.percentUsed)}%`,
      passed,
      projectedPct,
      projectedFrac: passed || projectedPct === undefined ? undefined : clamp01(projectedPct / 100),
      resetInMs: reset?.kind === 'in' ? Date.parse(reading.resetsAt ?? '') - snap.now : undefined,
      fillInMs,
      fullInMs,
      lastCall: fullInMs !== undefined && fullInMs < LAST_CALL_MS,
    }
  }
  return [
    ...(snap.fiveHour ? [one('5h', '5h', snap.fiveHour, FIVE_HOUR_MS, snap.fiveHour.etaMs)] : []),
    ...(snap.sevenDay ? [one('7d', '7d', snap.sevenDay, SEVEN_DAY_MS, null)] : []),
    ...snap.otherLimits.map(limit => one(limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' '), 'other', limit, undefined, null)),
  ]
}

/** The conversation's trails with their words and the series a chart draws. */
export const historyFacts = (trails: Trails, fiveHour: LimitView | undefined, context: ContextFacts, now: number): HistoryReading => ({
  ...trails,
  ...historyWords(trails, fiveHour, context, now),
  empty: trails.costs.length === 0,
  costValues: trails.costs.map(e => e.usd),
  reWarms: trails.costs.map(e => e.reWarm),
  fiveHourValues: trails.fiveHour.map(p => p.pct),
  fiveHourHour: lastHourOf(trails.fiveHour, now).map(p => p.pct),
  fiveHourWindow: thisWindowOf(trails.fiveHour, fiveHour, now).map(p => p.pct),
})

/** A window as the calendar reads it: its reset and a measured fill as times. */
const windowOf = (l: LimitView | undefined, now: number): WindowNow | undefined =>
  l === undefined
    ? undefined
    : {
        percentUsed: l.percentUsed,
        projectedPct: l.projectedPct,
        resetsAt: l.resetInMs === undefined ? undefined : now + l.resetInMs,
        fullAt: l.etaMs === null ? undefined : now + l.etaMs,
      }

/** A window's slices with each guess stopped at the cap: the slice calendar
 *  marks full takes what is left, and none is left after it, so the cells
 *  and their words agree. calendar.ts keeps every slice's guess. */
export const cappedMarks = (cells: ReadonlyArray<DayCell | HourCell>, percentUsed: number): SliceMark[] => {
  const full = cells.findIndex(c => c.fullMark)
  let left = Math.max(0, 100 - percentUsed)
  return cells.map((c, i): SliceMark => {
    if (full >= 0 && i > full) return { kind: 'spent', pct: 0 }
    if (c.pct === undefined) return { kind: 'unknown', pct: 0 }
    if (!c.guess) return { kind: 'measured', pct: c.pct }
    // The fill takes what is left, though the step's guess may say less or more.
    if (i === full) return { kind: 'fills', pct: left }
    if (left <= 0) return { kind: 'spent', pct: 0 }
    const pct = Math.min(c.pct, left)
    left -= pct
    return { kind: 'guess', pct }
  })
}

/** The week's cells from the limit samples, with their words. With the zone
 *  unknown, the cells are named in UTC. */
export const weekFacts = (snap: BandSnapshot, sevenDay: LimitView | undefined, fiveHour: LimitView | undefined): WeekReading => {
  const utcOffsetMin = snap.utcOffsetMin ?? 0
  const week = weekOf({ samples: snap.samples, seven: windowOf(sevenDay, snap.now), five: windowOf(fiveHour, snap.now), now: snap.now, utcOffsetMin })
  // Now sits in today's cell as far in as today has gone by the local clock.
  const today = week.days.findIndex(d => d.today)
  const todayGone = ((((snap.now + utcOffsetMin * 60_000) % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS
  // The hours are an hour each up to the reset, so the share of the window
  // gone places now among them; at 0% the 5h has no notch.
  const hourNotch = fiveHour?.gone === undefined || fiveHour.percentUsed === 0 || week.hours.length === 0 ? undefined : fiveHour.gone * week.hours.length
  const dayRow: SliceRow = { marks: cappedMarks(week.days, sevenDay?.percentUsed ?? 0), notch: today < 0 ? undefined : today + todayGone }
  const hourRow: SliceRow = { marks: cappedMarks(week.hours, fiveHour?.percentUsed ?? 0), notch: hourNotch }
  return {
    ...week,
    ...weekWords(week, { days: dayRow, hours: hourRow }),
    dayRow,
    hourRow,
  }
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
    glyphs: drawnTier(snap),
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
  const fiveHour = limits.find(l => l.key === '5h')
  const sevenDay = limits.find(l => l.key === '7d')
  let history: HistoryReading | undefined
  let week: WeekReading | undefined
  return {
    frame,
    cache: { ...cache, ...cacheWords(cache, c, frame) },
    spend: { ...spend, ...spendWords(spend) },
    context: { ...context, ...contextWords(context, frame) },
    fiveHour,
    sevenDay,
    limits,
    worstLimit,
    workspace: snap.workspace,
    workspaceText: workspaceWords(snap.workspace),
    get history() {
      return (history ??= historyFacts(snap.history, fiveHour, context, snap.now))
    },
    get week() {
      return (week ??= weekFacts(snap, sevenDay, fiveHour))
    },
    chips: {
      raw: snap,
      reading: {
        copy: cacheCopy(c, cache.mood, snap.isWorking),
        tokenBreakdown: `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`,
      },
    },
  }
}
