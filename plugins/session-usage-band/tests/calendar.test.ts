import { test, expect } from 'claude-code/testing'
import { weekOf } from '../hooks/calendar'
import { weekWords } from '../hooks/words'

const H = 3600_000
const T0 = Date.UTC(2026, 9, 6, 8, 40) // Tue 08:40 UTC, the 7d window's start
const s = (hours: number, seven: number, five = 0) => ({ at: T0 + hours * H, fivePct: five, sevenPct: seven, fiveResetAt: T0 + (Math.floor(hours / 5) + 1) * 5 * H, sevenResetAt: T0 + 168 * H })
const seven = (percentUsed: number, projectedPct: number) => ({ percentUsed, projectedPct, resetsAt: T0 + 168 * H })

test("a day cell is that day's rise in the weekly limit", () => {
  const wk = weekOf({ samples: [s(0, 0), s(15, 6), s(39, 15), s(63, 26), s(77, 30)], seven: seven(30, 50), five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.map(d => d.initial).join('')).toBe('TWTFSSM')
  expect(wk.days.slice(0, 4).map(d => d.text)).toEqual(['6%', '9%', '11%', '4%'])
  expect(wk.days[3]?.today).toBe(true)
  expect(wk.days.slice(4).every(d => d.future && d.guess)).toBe(true)
  expect(Math.abs((wk.days[4]?.pct ?? 0) - (50 - 30) / 3)).toBeLessThan(1e-5)
  expect(wk.days[4]?.text).toBe('~7%')
  expect(wk.busiest).toBe('Thu')
})
test('a sample from another window is ignored', () => {
  const stale = { ...s(15, 50), sevenResetAt: T0 - H }
  const wk = weekOf({ samples: [s(0, 0), s(10, 5), stale], seven: seven(5, 20), five: undefined, now: T0 + 20 * H, utcOffsetMin: 0 })
  expect(Math.max(...wk.days.map(d => (d.guess ? 0 : (d.pct ?? 0))))).toBeLessThan(50)
})
test('a flat week names no busiest day', () => {
  expect(weekOf({ samples: [s(0, 5), s(15, 5.4), s(39, 5.4)], seven: seven(5.4, 5.4), five: undefined, now: T0 + 39 * H, utcOffsetMin: 0 }).busiest).toBeUndefined()
})
test('no samples: every past cell is unknown, never 0%', () => {
  const wk = weekOf({ samples: [], seven: seven(30, 50), five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.slice(1, 4).every(d => d.pct === undefined && d.text === '')).toBe(true)
})
test('the hour cells are the five hours before the 5h reset, with the fill marked', () => {
  const five = { percentUsed: 40, projectedPct: 100, resetsAt: T0 + 5 * H, fullAt: T0 + 4.2 * H }
  const wk = weekOf({ samples: [s(0, 0, 0), s(0.9, 1, 10), s(1.9, 2, 25), s(2.4, 3, 40)], seven: undefined, five, now: T0 + 2.5 * H, utcOffsetMin: 0 })
  expect(wk.hours.map(c => c.label)).toEqual(['08', '09', '10', '11', '12'])
  expect(wk.hours.map(c => c.startClock)).toEqual(['08:40', '09:40', '10:40', '11:40', '12:40'])
  // Each hour is said from where it starts, not from its clock hour.
  expect(weekWords(wk, undefined, undefined).hoursAlt).toBe('5-hour limit by hour: 08:40 10%, 09:40 15%, 10:40 15%, 11:40 about 30%, 12:40 about 30%')
  expect(wk.hours.slice(0, 3).map(c => c.text)).toEqual(['10%', '15%', '15%'])
  expect(wk.hours[2]?.now).toBe(true)
  expect(wk.hours.findIndex(c => c.fullMark)).toBe(4)
})
test('a landing of exactly 100 fills on the last day', () => {
  const wk = weekOf({ samples: [], seven: seven(30, 100), five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.findIndex(d => d.fullMark)).toBe(6)
})
test('a measured fill marks its hour over the guess', () => {
  const five = { percentUsed: 40, projectedPct: 100, resetsAt: T0 + 5 * H, fullAt: T0 + 3.5 * H }
  const wk = weekOf({ samples: [], seven: undefined, five, now: T0 + 2.5 * H, utcOffsetMin: 0 })
  expect(wk.hours.findIndex(c => c.fullMark)).toBe(3)
})
test('the days are cut at local midnight, so today is the day it is', () => {
  // The reset at 20:00: before 20:00 a cut at the reset's clock time named
  // yesterday as today. The 4-hour start of the window folds into Wednesday.
  const R = Date.UTC(2026, 9, 13, 20)
  const at = (day: number, hour: number) => Date.UTC(2026, 9, day, hour)
  const sample = (ms: number, sevenPct: number) => ({ at: ms, fivePct: 0, sevenPct, fiveResetAt: ms + H, sevenResetAt: R })
  const samples = [sample(at(6, 23), 2), sample(at(7, 22), 5), sample(at(8, 1), 7), sample(at(8, 14), 12)]
  const weekAt = (now: number, utcOffsetMin = 0) => weekOf({ samples: samples.filter(x => x.at <= now), seven: { percentUsed: 12, projectedPct: 30, resetsAt: R }, five: undefined, now, utcOffsetMin })
  const today = (now: number, utcOffsetMin = 0) => weekAt(now, utcOffsetMin).days.filter(d => d.today).map(d => `${d.initial}${d.date}`)
  const wk = weekAt(at(8, 15))
  expect(wk.days.map(d => `${d.initial}${d.date}`)).toEqual(['W7', 'T8', 'F9', 'S10', 'S11', 'M12', 'T13'])
  expect(today(at(8, 15))).toEqual(['T8'])
  // Each day's own rise: Wednesday's 22:00 sample counts on Wednesday.
  expect(wk.days.slice(0, 2).map(d => d.text)).toEqual(['5%', '7%'])
  expect(wk.busiest).toBe('Thu')
  expect(today(at(7, 21))).toEqual(['W7'])
  expect(today(at(13, 10))).toEqual(['T13'])
  // Today in the window's first hours: the other partial day folds instead.
  expect(today(at(6, 21))).toEqual(['T6'])
  // The same instants an hour and a half east, at 03:30 local.
  expect(today(at(8, 2), 90)).toEqual(['T8'])
})
test('a sample exactly at local midnight closes the day before and opens the day it starts', () => {
  // An hour and a half east, Tuesday's window part ends at Wednesday 00:00 local, 22:30 UTC.
  const midnight = Date.UTC(2026, 9, 6, 22, 30)
  const sample = (at: number, sevenPct: number) => ({ at, fivePct: 0, sevenPct, fiveResetAt: at + H, sevenResetAt: T0 + 168 * H })
  const samples = [sample(T0, 0), sample(midnight, 6), sample(midnight + 12 * H, 9)]
  const wk = weekOf({ samples, seven: seven(9, 20), five: undefined, now: midnight + 14 * H, utcOffsetMin: 90 })
  expect(wk.days.slice(0, 2).map(d => `${d.initial}${d.date} ${d.text}`)).toEqual(['T6 6%', 'W7 3%'])
})
test("on the reset's own day, before it resets, today is that day", () => {
  const R = T0 + 168 * H // Tue 08:40
  const wk = weekOf({ samples: [], seven: seven(80, 90), five: undefined, now: R - 6 * H, utcOffsetMin: 0 })
  expect(wk.days.filter(d => d.today).map(d => `${d.initial}${d.date}`)).toEqual(['T13'])
  expect(wk.days).toHaveLength(7)
})
