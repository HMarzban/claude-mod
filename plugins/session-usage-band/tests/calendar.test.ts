import { test, expect } from 'claude-code/testing'
import { MAX_SAMPLES, addSample, asLimitSamples, mergeSamples, sampleOf } from '../hooks/memory'
import { weekOf } from '../hooks/calendar'
import { weekWords } from '../hooks/words'

const H = 3600_000
const T0 = Date.UTC(2026, 9, 6, 8, 40) // Tue 08:40 UTC, the 7d window's start
const s = (hours: number, seven: number, five = 0) => ({ at: T0 + hours * H, fivePct: five, sevenPct: seven, fiveResetAt: T0 + (Math.floor(hours / 5) + 1) * 5 * H, sevenResetAt: T0 + 168 * H })
const seven = (percentUsed: number, projectedPct: number) => ({ percentUsed, projectedPct, resetsAt: T0 + 168 * H })

test('one sample per 15-minute bucket, the latest winning, appended in place, capped', () => {
  const held = addSample([], s(0, 1))
  expect(addSample(held, { ...s(0, 2), at: T0 + 60_000 })).toBe(held)
  expect(held).toHaveLength(1)
  expect(held[0]?.sevenPct).toBe(2)
  let all = held
  for (let i = 1; i < 800; i++) all = addSample(all, s(i * 0.25, i % 100))
  // 800 buckets, so the oldest 128 go.
  expect(all).toHaveLength(MAX_SAMPLES)
  expect([all[0]?.at, all.at(-1)?.at]).toEqual([T0 + 128 * 0.25 * H, T0 + 799 * 0.25 * H])
  expect(JSON.stringify(all).length).toBeLessThan(75_000)
})
test('merging keeps one sample per bucket, the later winning, sorted', () => {
  expect(mergeSamples([s(0, 1), s(1, 2)], [{ ...s(0, 5), at: T0 + 60_000 }, s(0.5, 3)]).map(x => x.sevenPct)).toEqual([5, 3, 2])
})
test('the store is data, not trusted', () => {
  expect(asLimitSamples([s(0, 1), { at: 'x' }, null, 42])).toHaveLength(1)
  expect(asLimitSamples({})).toEqual([])
})
test('a sample needs both windows and their resets', () => {
  const both = [
    { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(T0 + 3 * H).toISOString() },
    { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(T0 + 67 * H).toISOString() },
  ]
  expect(sampleOf(T0, both)).toEqual({ at: T0, fivePct: 4, sevenPct: 30, fiveResetAt: T0 + 3 * H, sevenResetAt: T0 + 67 * H })
  expect(sampleOf(T0, both.slice(0, 1))).toBeUndefined()
})
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
