// The week's calendar: each day's rise in the weekly limit and each hour's in
// the 5-hour one, read off the limit samples, with a guess for the slices
// ahead. Pure, so the cells can be checked without the store.

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
  /** The local clock hour it starts at: '08' */
  label: string
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
  /** The short name of the largest known day: 'Thu'. */
  busiest: string | undefined
}>

type Known<C> = C & Readonly<{ pct: number }>
/** A cell measured: neither a guess nor unknown. */
export const isKnown = <C extends DayCell | HourCell>(c: C): c is Known<C> => !c.guess && c.pct !== undefined

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS
// resetsAt readings of one window can differ by a few seconds.
const SAME_RESET_MS = 60_000

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** How a window is cut: what a sample says of it, and its slices. */
type Cut = Readonly<{ pct: (s: Sample) => number; reset: (s: Sample) => number; len: number; count: number }>

const BY_DAY: Cut = { pct: s => s.sevenPct, reset: s => s.sevenResetAt, len: DAY_MS, count: 7 }
const BY_HOUR: Cut = { pct: s => s.fivePct, reset: s => s.fiveResetAt, len: HOUR_MS, count: 5 }

/** A slice of a window, before it is named as a day or an hour. */
type Slice = Readonly<{ start: number; pct: number | undefined; text: string; guess: boolean; current: boolean; future: boolean; fullMark: boolean }>

/** Each slice's rise, from the window's own samples; undefined where unknown or ahead. */
const risesOf = (samples: readonly Sample[], cut: Cut, resetAt: number, start: number, now: number): Array<number | undefined> => {
  const own = samples.filter(s => Math.abs(cut.reset(s) - resetAt) < SAME_RESET_MS)
  const lastWhere = (keep: (s: Sample) => boolean) => own.reduce<Sample | undefined>((found, s) => (keep(s) ? s : found), undefined)
  return Array.from({ length: cut.count }, (_, i) => {
    const from = start + i * cut.len
    if (from > now) return undefined
    const inside = lastWhere(s => s.at > from && s.at < from + cut.len && s.at <= now)
    const before = lastWhere(s => s.at <= from)
    // The window's first slice starts from 0, the window's own start.
    const base = before !== undefined ? cut.pct(before) : i === 0 ? 0 : undefined
    return inside === undefined || base === undefined ? undefined : Math.max(0, cut.pct(inside) - base)
  })
}

/** The slice the window fills in: the one holding a measured fill, else the
 *  first ahead where the guesses' running total reaches 100. */
const fullIndexOf = (w: WindowNow, start: number, len: number, current: number, ahead: number): number | undefined => {
  if (w.fullAt !== undefined) return Math.floor((w.fullAt - start) / len)
  const landing = w.projectedPct
  if (landing === undefined || landing < 100 || landing <= w.percentUsed) return undefined
  // The share of the slices ahead the guesses take to reach 100: exactly 1 at a landing of 100.
  const k = Math.ceil(((100 - w.percentUsed) / (landing - w.percentUsed)) * ahead)
  return k >= 1 ? current + k : undefined
}

/** A window's slices: measured up to now, guessed ahead. */
const slicesOf = (samples: readonly Sample[], w: WindowNow | undefined, cut: Cut, now: number): Slice[] => {
  if (w?.resetsAt === undefined || w.resetsAt <= now) return []
  const start = w.resetsAt - cut.count * cut.len
  const current = Math.floor((now - start) / cut.len)
  const ahead = cut.count - 1 - current
  const step = w.projectedPct === undefined || ahead <= 0 ? undefined : Math.max(0, w.projectedPct - w.percentUsed) / ahead
  const fullIndex = fullIndexOf(w, start, cut.len, current, ahead)
  return risesOf(samples, cut, w.resetsAt, start, now).map((rise, i) => {
    const future = i > current
    const guess = future && step !== undefined
    const pct = guess ? step : rise
    return {
      start: start + i * cut.len,
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
  const days = slicesOf(o.samples, o.seven, BY_DAY, o.now).map(({ start, current, ...slice }): DayCell => {
    const at = local(start)
    const name = WEEKDAYS[at.getUTCDay()] ?? ''
    return { ...slice, initial: name.slice(0, 1), name, date: String(at.getUTCDate()), today: current }
  })
  const hours = slicesOf(o.samples, o.five, BY_HOUR, o.now).map(
    ({ start, current, ...slice }): HourCell => ({ ...slice, label: String(local(start).getUTCHours()).padStart(2, '0'), now: current }),
  )
  const busiest = days.filter(isKnown).reduce<Known<DayCell> | undefined>((top, d) => (top === undefined || d.pct > top.pct ? d : top), undefined)
  return { days, hours, busiest: busiest?.name.slice(0, 3) }
}
