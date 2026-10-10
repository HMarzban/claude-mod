// The week's calendar: each day's rise in the weekly limit and each hour's in
// the 5-hour one, read off the limit samples, with a guess for the slices
// ahead. Pure, so the cells can be checked without the store.

import { DAY_MS, fmtClock } from './format'
import type { Sample } from './memory'

export type DayCell = Readonly<{
  /** 'T' */
  initial: string
  /** 'Tuesday' */
  name: string
  /** The day of the month: '6' */
  date: string
  /** The day's rise in points, or its guess; undefined when unknown. */
  pct: number | undefined
  /** '6%' | '~7%' (a guess) | '' (unknown) */
  text: string
  guess: boolean
  today: boolean
  future: boolean
  /** The day the guess fills the limit. */
  fullMark: boolean
}>

export type HourCell = Readonly<{
  /** The local clock hour it starts in: '08' */
  label: string
  /** The local time it starts at, as the 5h reset sets it: '08:40' */
  startClock: string
  pct: number | undefined
  text: string
  guess: boolean
  now: boolean
  future: boolean
  /** The hour the limit fills: a measured fill, else the guess. */
  fullMark: boolean
}>

/** A window as it stands now (epoch ms): its use, where its pace lands, its reset, and a measured fill. */
export type WindowNow = Readonly<{ percentUsed: number; projectedPct: number | undefined; resetsAt: number | undefined; fullAt?: number }>

export type Week = Readonly<{
  /** The 7d window's seven days, oldest first; empty without a reset. */
  days: readonly DayCell[]
  /** The five hours before the 5h reset; empty without one. */
  hours: readonly HourCell[]
  /** The short name of the known day that rose most: 'Thu'; undefined when none drew above 0%. */
  busiest: string | undefined
}>

type Known<C> = C & Readonly<{ pct: number }>
/** A cell measured: neither a guess nor unknown. */
export const isKnown = <C extends DayCell | HourCell>(c: C): c is Known<C> => !c.guess && c.pct !== undefined

const HOUR_MS = 3600_000
// resetsAt readings of one window can differ by a few seconds.
const SAME_RESET_MS = 60_000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** How a window is cut: what a sample says of it, and its slices' edges,
 *  oldest first. */
type Cut = Readonly<{ pct: (s: Sample) => number; reset: (s: Sample) => number; bounds: (resetAt: number, now: number, utcOffsetMin: number) => number[] }>

/** The 7d window at local midnights. A reset off midnight leaves a part day
 *  at each end; the one today isn't in, else the shorter, folds into its
 *  neighbour, so seven days remain and today names itself. */
const dayBounds = (resetAt: number, now: number, utcOffsetMin: number): number[] => {
  const start = resetAt - 7 * DAY_MS
  const sinceMidnight = (((resetAt + utcOffsetMin * 60_000) % DAY_MS) + DAY_MS) % DAY_MS
  if (sinceMidnight === 0) return Array.from({ length: 8 }, (_, i) => start + i * DAY_MS)
  const lastMidnight = resetAt - sinceMidnight
  const firstMidnight = lastMidnight - 6 * DAY_MS
  const midnights = Array.from({ length: 7 }, (_, i) => firstMidnight + i * DAY_MS)
  const foldFirst = now >= lastMidnight || (now >= firstMidnight && firstMidnight - start <= sinceMidnight)
  return [start, ...(foldFirst ? midnights.slice(1) : midnights.slice(0, -1)), resetAt]
}

const BY_DAY: Cut = { pct: s => s.sevenPct, reset: s => s.sevenResetAt, bounds: dayBounds }
const BY_HOUR: Cut = { pct: s => s.fivePct, reset: s => s.fiveResetAt, bounds: resetAt => Array.from({ length: 6 }, (_, i) => resetAt - (5 - i) * HOUR_MS) }

/** A slice of a window, before it is named as a day or an hour. */
type Slice = Readonly<{ start: number; end: number; pct: number | undefined; text: string; guess: boolean; current: boolean; future: boolean; fullMark: boolean }>

/** Each slice's rise, from the window's own samples; undefined where unknown or ahead. */
const risesOf = (samples: readonly Sample[], cut: Cut, resetAt: number, bounds: readonly number[], now: number): Array<number | undefined> => {
  const own = samples.filter(s => Math.abs(cut.reset(s) - resetAt) < SAME_RESET_MS)
  const lastWhere = (keep: (s: Sample) => boolean) => own.reduce<Sample | undefined>((found, s) => (keep(s) ? s : found), undefined)
  return bounds.slice(0, -1).map((from, i) => {
    const to = bounds[i + 1] ?? from
    if (from > now) return undefined
    const inside = lastWhere(s => s.at > from && s.at < to && s.at <= now)
    const before = lastWhere(s => s.at <= from)
    // The window's first slice starts from 0, the window's own start.
    const base = before !== undefined ? cut.pct(before) : i === 0 ? 0 : undefined
    return inside === undefined || base === undefined ? undefined : Math.max(0, cut.pct(inside) - base)
  })
}

/** The slice the window fills in: the one holding a measured fill, else the
 *  first ahead where the guesses' running total reaches 100. */
const fullIndexOf = (w: WindowNow, bounds: readonly number[], current: number, ahead: number): number | undefined => {
  const at = w.fullAt
  if (at !== undefined) return bounds.findIndex((from, i) => from <= at && at < (bounds[i + 1] ?? from))
  const landing = w.projectedPct
  if (landing === undefined || landing < 100 || landing <= w.percentUsed) return undefined
  // The share of the slices ahead the guesses take to reach 100: exactly 1 at a landing of 100.
  const k = Math.ceil(((100 - w.percentUsed) / (landing - w.percentUsed)) * ahead)
  return k >= 1 ? current + k : undefined
}

/** A window's slices: measured up to now, guessed ahead. */
const slicesOf = (samples: readonly Sample[], w: WindowNow | undefined, cut: Cut, now: number, utcOffsetMin: number): Slice[] => {
  if (w?.resetsAt === undefined || w.resetsAt <= now) return []
  const bounds = cut.bounds(w.resetsAt, now, utcOffsetMin)
  const current = bounds.findIndex((from, i) => from <= now && now < (bounds[i + 1] ?? from))
  const ahead = bounds.length - 2 - current
  const step = w.projectedPct === undefined || ahead <= 0 ? undefined : Math.max(0, w.projectedPct - w.percentUsed) / ahead
  const fullIndex = fullIndexOf(w, bounds, current, ahead)
  return risesOf(samples, cut, w.resetsAt, bounds, now).map((rise, i) => {
    const future = i > current
    const guess = future && step !== undefined
    const pct = guess ? step : rise
    const start = bounds[i] ?? 0
    return {
      start,
      end: bounds[i + 1] ?? start,
      pct,
      text: pct === undefined ? '' : `${guess ? '~' : ''}${Math.round(pct)}%`,
      guess,
      current: i === current,
      future,
      fullMark: i === fullIndex,
    }
  })
}

/** The week's day and hour cells, named in the local zone (`utcOffsetMin`,
 *  east positive). `samples` are sorted by time, as mergeSamples keeps them. */
export const weekOf = (o: Readonly<{ samples: readonly Sample[]; seven: WindowNow | undefined; five: WindowNow | undefined; now: number; utcOffsetMin: number }>): Week => {
  const local = (ms: number): Date => new Date(ms + o.utcOffsetMin * 60_000)
  const days = slicesOf(o.samples, o.seven, BY_DAY, o.now, o.utcOffsetMin).map(({ start, end, current, ...slice }): DayCell => {
    // A day with a part day folded in is named by its whole day.
    const at = local(Math.max(start, end - DAY_MS))
    const name = WEEKDAYS[at.getUTCDay()] ?? ''
    return { ...slice, initial: name.slice(0, 1), name, date: String(at.getUTCDate()), today: current }
  })
  const hours = slicesOf(o.samples, o.five, BY_HOUR, o.now, o.utcOffsetMin).map(
    ({ start, end: _end, current, ...slice }): HourCell => ({
      ...slice,
      label: String(local(start).getUTCHours()).padStart(2, '0'),
      startClock: fmtClock(start, o.utcOffsetMin),
      now: current,
    }),
  )
  const busiest = days.filter(isKnown).filter(d => Math.round(d.pct) > 0).reduce<Known<DayCell> | undefined>((top, d) => (top === undefined || d.pct > top.pct ? d : top), undefined)
  return { days, hours, busiest: busiest?.name.slice(0, 3) }
}
