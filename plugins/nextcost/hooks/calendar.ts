// The week's calendar: each day's rise in the weekly limit and each hour's in
// the 5-hour one, read off the limit samples, with a guess for the slices
// ahead, and the cells as drawn, each guess stopped at the cap. Pure, so the
// cells can be checked without the store.

import { DAY_MS, HOUR_MS, WEEKDAYS, dayOf, fmtClock, midnightOf, sameReset } from './format'
import type { Zone } from './format'
import type { Sample } from './memory'

export type DayCell = Readonly<{
  /** 'Tuesday' */
  name: string
  /** The day of the month: '6' */
  date: string
  /** The day's rise in points, or its guess; undefined when unknown. */
  pct: number | undefined
  guess: boolean
  today: boolean
  future: boolean
  /** The day the guess fills the limit. */
  fullMark: boolean
}>

export type HourCell = Readonly<{
  /** The local time it starts at, as the 5h reset sets it: '08:40' */
  startClock: string
  pct: number | undefined
  guess: boolean
  now: boolean
  future: boolean
  /** The hour the limit fills: a measured fill, else the guess. */
  fullMark: boolean
}>

/** A window as it stands now (epoch ms): its use, where its pace lands, its
 *  reset, when it fills, measured or at the average's pace, and the share of
 *  it gone, where known. */
export type WindowNow = Readonly<{ percentUsed: number; projectedPct: number | undefined; resetsAt: number | undefined; fullAt?: number; gone?: number }>

export type Week = Readonly<{
  /** The 7d window's seven days, oldest first; empty without a reset. */
  days: readonly DayCell[]
  /** The five hours before the 5h reset; empty without one. */
  hours: readonly HourCell[]
}>

/** How a window is cut: what a sample says of it, and its slices' edges,
 *  oldest first. */
type Cut = Readonly<{ pct: (s: Sample) => number; reset: (s: Sample) => number; bounds: (resetAt: number, now: number, zone: Zone) => number[] }>

/** The 7d window cut at each local midnight inside it, each found in the
 *  offset in force there, so a 23- or 25-hour day stays one day. A reset off
 *  midnight, or a change of offset in the week, leaves a part day at one end
 *  or both; the one today isn't in, else the shorter, folds into its
 *  neighbour until seven days remain, so today names itself unless its own
 *  part is the last left to fold. Each part folds once, so two whole days
 *  never share a cell. */
const dayBounds = (resetAt: number, now: number, zone: Zone): number[] => {
  const start = resetAt - 7 * DAY_MS
  const bounds = [start]
  for (let day = dayOf(start, zone) + 1; midnightOf(day, zone) < resetAt; day++) bounds.push(midnightOf(day, zone))
  bounds.push(resetAt)
  const edge = (i: number): number => bounds[i] ?? resetAt
  const isMidnight = (t: number): boolean => midnightOf(dayOf(t, zone), zone) === t
  let firstPart = !isMidnight(start)
  let lastPart = !isMidnight(resetAt)
  while (bounds.length > 8) {
    const last = bounds.length - 1
    const foldFirst = firstPart && (!lastPart || now >= edge(last - 1) || (now >= edge(1) && edge(1) - edge(0) <= edge(last) - edge(last - 1)))
    bounds.splice(foldFirst ? 1 : last - 1, 1)
    if (foldFirst) firstPart = false
    else lastPart = false
  }
  return bounds
}

const BY_DAY: Cut = { pct: s => s.sevenPct, reset: s => s.sevenResetAt, bounds: dayBounds }
const BY_HOUR: Cut = { pct: s => s.fivePct, reset: s => s.fiveResetAt, bounds: resetAt => Array.from({ length: 6 }, (_, i) => resetAt - (5 - i) * HOUR_MS) }

/** A slice of a window, before it is named as a day or an hour. */
type Slice = Readonly<{ start: number; end: number; pct: number | undefined; guess: boolean; current: boolean; future: boolean; fullMark: boolean }>

/** Each slice's rise, from the window's own samples; undefined where unknown or ahead. */
const risesOf = (samples: readonly Sample[], cut: Cut, resetAt: number, bounds: readonly number[], now: number): Array<number | undefined> => {
  const own = samples.filter(s => sameReset(cut.reset(s), resetAt))
  const lastWhere = (keep: (s: Sample) => boolean) => own.reduce<Sample | undefined>((found, s) => (keep(s) ? s : found), undefined)
  return bounds.slice(0, -1).map((from, i) => {
    const to = bounds[i + 1] ?? from
    if (from > now) return undefined
    // A sample on an edge closes the slice before it and opens the one after.
    const inside = lastWhere(s => s.at > from && s.at <= to && s.at <= now)
    const before = lastWhere(s => s.at <= from)
    // The window's first slice starts from 0, the window's own start.
    const base = before !== undefined ? cut.pct(before) : i === 0 ? 0 : undefined
    return inside === undefined || base === undefined ? undefined : Math.max(0, cut.pct(inside) - base)
  })
}

/** The slice holding the fill, found by its time; a fill at the reset
 *  itself is the last slice's. */
const fullIndexOf = (fullAt: number | undefined, bounds: readonly number[]): number | undefined => {
  if (fullAt === undefined) return undefined
  const at = Math.min(fullAt, (bounds.at(-1) ?? fullAt) - 1)
  const i = bounds.findIndex((from, j) => from <= at && at < (bounds[j + 1] ?? from))
  return i < 0 ? undefined : i
}

/** A window's slices: measured up to now, guessed ahead. */
const slicesOf = (samples: readonly Sample[], w: WindowNow | undefined, cut: Cut, now: number, zone: Zone): Slice[] => {
  if (w?.resetsAt === undefined || w.resetsAt <= now) return []
  const bounds = cut.bounds(w.resetsAt, now, zone)
  const current = bounds.findIndex((from, i) => from <= now && now < (bounds[i + 1] ?? from))
  const ahead = bounds.length - 2 - current
  const step = w.projectedPct === undefined || ahead <= 0 ? undefined : Math.max(0, w.projectedPct - w.percentUsed) / ahead
  const fullIndex = fullIndexOf(w.fullAt, bounds)
  return risesOf(samples, cut, w.resetsAt, bounds, now).map((rise, i) => {
    const future = i > current
    const guess = future && step !== undefined
    const pct = guess ? step : rise
    const start = bounds[i] ?? 0
    return {
      start,
      end: bounds[i + 1] ?? start,
      pct,
      guess,
      current: i === current,
      future,
      fullMark: i === fullIndex,
    }
  })
}

/** The local day holding most of a slice: a part day folded in never names it. */
const wholeDayOf = (start: number, end: number, zone: Zone): number => {
  let best = dayOf(start, zone)
  let most = 0
  for (let day = best; day <= dayOf(end - 1, zone); day++) {
    const held = Math.min(end, midnightOf(day + 1, zone)) - Math.max(start, midnightOf(day, zone))
    if (held > most) {
      best = day
      most = held
    }
  }
  return best
}

/** The week's day and hour cells, each named in the offset in force at it.
 *  `samples` are sorted by time, as mergeSamples keeps them. */
export const weekOf = (o: Readonly<{ samples: readonly Sample[]; seven: WindowNow | undefined; five: WindowNow | undefined; now: number; zone: Zone }>): Week => {
  const days = slicesOf(o.samples, o.seven, BY_DAY, o.now, o.zone).map(({ start, end, current, ...slice }): DayCell => {
    // A local day read through the UTC getters.
    const at = new Date(wholeDayOf(start, end, o.zone) * DAY_MS)
    const name = WEEKDAYS[at.getUTCDay()] ?? ''
    return { ...slice, name, date: String(at.getUTCDate()), today: current }
  })
  // An hour each in absolute time, so a fall back names its hour twice and a spring forward skips one.
  const hours = slicesOf(o.samples, o.five, BY_HOUR, o.now, o.zone).map(({ start, end: _end, current, ...slice }): HourCell => ({ ...slice, startClock: fmtClock(start, o.zone), now: current }))
  return { days, hours }
}

// ---- as drawn ---------------------------------------------------------------

/** How week draws a slice: measured, a guess, the guess that fills the
 *  limit, none left after it, or not known. */
type SliceKind = 'measured' | 'guess' | 'fills' | 'spent' | 'unknown'
/** A slice as drawn: its kind and its rise in points toward the cap. */
export type SliceMark = Readonly<{ kind: SliceKind; pct: number }>
/** A window's slices as drawn, and where now falls among them, counted in
 *  slices: 0.5 is halfway through the first. Undefined where not known. */
type SliceRow = Readonly<{ marks: readonly SliceMark[]; notch: number | undefined }>

/** The week's day and hour cells, and as drawn: each window's slices
 *  capped (`dayMarks` the 7d's), and what the charts draw of them. */
export type DrawnWeek = Week &
  Readonly<{
    dayMarks: readonly SliceMark[]
    /** The 5h window's cumulative percent at the end of each hour slice, from
     *  the hours as drawn, each guess stopped at the cap, its level at now's slice the window's `percentUsed`; empty
     *  where no slice is measured. `nowAt` is the slice now falls in (counted
     *  from 0), the last at the very end; undefined where not known or with no
     *  values. `from` is the first value drawn: those before it are hours
     *  before the first sample, whose level isn't known. */
    fiveHourWindow: Readonly<{ values: readonly number[]; nowAt: number | undefined; from: number }>
    /** The 7d's days as day cells draw them, from their capped marks,
     *  so the guesses never pass what is left: each value (undefined where
     *  unknown), whether it is a guess, and today's index. The day that fills
     *  the limit is a guess of what is left, or today, once a reading falls
     *  inside it, its rise so far, measured. `measured` while any day is. */
    daysDrawn: Readonly<{ values: ReadonlyArray<number | undefined>; guess: readonly boolean[]; today: number | undefined; measured: boolean }>
  }>

/** A window's slices with each guess stopped at the cap: the slice marked
 *  full takes what is left, today's on top of its rise so far, and none is
 *  left after it, so the cells and their words agree. weekOf keeps every
 *  slice's guess. */
export const cappedMarks = (cells: ReadonlyArray<DayCell | HourCell>, percentUsed: number): SliceMark[] => {
  const full = cells.findIndex(c => c.fullMark)
  let left = Math.max(0, 100 - percentUsed)
  return cells.map((c, i): SliceMark => {
    if (full >= 0 && i > full) return { kind: 'spent', pct: 0 }
    // The fill takes what is left, though the step's guess may say less or more.
    if (i === full) return { kind: 'fills', pct: (c.guess ? 0 : (c.pct ?? 0)) + left }
    if (c.pct === undefined) return { kind: 'unknown', pct: 0 }
    if (!c.guess) return { kind: 'measured', pct: c.pct }
    if (left <= 0) return { kind: 'spent', pct: 0 }
    const pct = Math.min(c.pct, left)
    left -= pct
    return { kind: 'guess', pct }
  })
}

/** Now's slice among `count`, from its notch counted in slices: the slice
 *  it falls in, the last one at the window's very end, so a now rule never
 *  falls past the chart; undefined with no notch or no slice. */
export const windowNowAt = (notch: number | undefined, count: number): number | undefined =>
  notch === undefined || count === 0 ? undefined : Math.min(Math.floor(notch), count - 1)

/** The 5h window's climb: each hour's rise added to the ones before it, set
 *  so its level now is the window's `percentUsed`, as its words say. Before
 *  the first measured hour the level isn't known (the window opened on
 *  another device, or the band came mid-window): the line starts at that
 *  hour's start, `from`, the level there what the hours since leave of
 *  `percentUsed`. Measured from the window's start, the past stays as
 *  measured and a reading newer than the last sample lifts now on. A fill
 *  marked in now's hour keeps its climb to the cap past `percentUsed`. */
const fiveHourClimb = (row: SliceRow, hours: readonly HourCell[], percentUsed: number): DrawnWeek['fiveHourWindow'] => {
  const first = row.marks.findIndex(m => m.kind === 'measured')
  if (first < 0) return { values: [], nowAt: undefined, from: 0 }
  const nowAt = windowNowAt(row.notch, row.marks.length)
  let climb = 0
  const rises = row.marks.map(m => (climb += m.pct))
  // The level measured up to now: a fill's own rise, without what it takes of the cap.
  let measured = 0
  for (const [i, m] of row.marks.entries()) {
    if (nowAt === undefined || i > nowAt) break
    measured += m.kind !== 'fills' ? m.pct : hours[i]?.guess === false ? (hours[i]?.pct ?? 0) : 0
  }
  const lift = nowAt === undefined ? 0 : percentUsed - measured
  const from = first > 0 ? first - 1 : 0
  const liftFrom = first > 0 ? from : (nowAt ?? rises.length)
  return { values: rises.map((v, i) => (i < liftFrom ? v : v + lift)), nowAt, from }
}

/** The week's cells from the limit samples, and as drawn. */
export const drawnWeekOf = (o: Parameters<typeof weekOf>[0]): DrawnWeek => {
  const week = weekOf(o)
  const { days, hours } = week
  const today = days.findIndex(d => d.today)
  const fivePct = o.five?.percentUsed ?? 0
  // The hours are an hour each up to the reset, so the share of the window
  // gone places now among them; at 0% the 5h has no notch.
  const gone = o.five?.gone
  const hourNotch = gone === undefined || fivePct === 0 || hours.length === 0 ? undefined : gone * hours.length
  const dayMarks = cappedMarks(days, o.seven?.percentUsed ?? 0)
  const hourRow: SliceRow = { marks: cappedMarks(hours, fivePct), notch: hourNotch }
  // Today's fill is its rise so far, measured; another day's, or today's
  // with no reading inside it yet, the guess of what is left, as the alt
  // says it: never a measured 0.
  const measuredFill = (i: number) => days[i]?.guess === false && days[i]?.pct !== undefined
  const values = dayMarks.map((m, i) => (m.kind === 'unknown' ? undefined : m.kind === 'fills' && measuredFill(i) ? (days[i]?.pct ?? 0) : m.pct))
  const guess = dayMarks.map((m, i) => m.kind === 'guess' || m.kind === 'spent' || (m.kind === 'fills' && !measuredFill(i)))
  return {
    ...week,
    dayMarks,
    fiveHourWindow: fiveHourClimb(hourRow, hours, fivePct),
    daysDrawn: { values, guess, today: today < 0 ? undefined : today, measured: values.some((v, i) => v !== undefined && !guess[i]) },
  }
}
