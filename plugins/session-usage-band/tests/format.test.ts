// How the band words numbers and times: tokens, dollars, countdowns,
// resets, projections, ages, clipped names and the context in use.

import { test, expect } from 'claude-code/testing'
import { clipMiddle, contextUsed, fmtAgo, fmtCost, fmtCountdown, fmtEstimate, fmtEta, fmtPct, fmtSmallCost, fmtTokens, resetIn } from '../hooks/format'

const SEC = 1000
const MIN = 60 * SEC
const HOUR = 60 * MIN
const NOW = 1_000_000
const at = (ms: number): string => new Date(NOW + ms).toISOString()

test('tokens: whole under a thousand, a tenth of a k to ten thousand, whole k above, a tenth of an M from a million', () => {
  expect(fmtTokens(0)).toBe('0')
  expect(fmtTokens(999)).toBe('999')
  expect(fmtTokens(999.4)).toBe('999') // rounded first
  expect(fmtTokens(999.5)).toBe('1.0k')
  expect(fmtTokens(1_234)).toBe('1.2k')
  expect(fmtTokens(9_949)).toBe('9.9k')
  expect(fmtTokens(10_000)).toBe('10k')
  expect(fmtTokens(76_000)).toBe('76k')
  expect(fmtTokens(999_499)).toBe('999k')
  expect(fmtTokens(1_000_000)).toBe('1.0M')
  expect(fmtTokens(1_500_000)).toBe('1.5M')
})

test('a share reads as a whole percent', () => {
  expect([fmtPct(0), fmtPct(0.38), fmtPct(0.965), fmtPct(1)]).toEqual(['0%', '38%', '97%', '100%'])
})
test('tokens never count below zero', () => {
  expect(fmtTokens(-5)).toBe('0')
})

test('dollars: cents under a thousand, whole dollars from one', () => {
  expect(fmtCost(0)).toBe('$0.00')
  expect(fmtCost(2.41)).toBe('$2.41')
  expect(fmtCost(999.99)).toBe('$999.99')
  expect(fmtCost(1000)).toBe('$1000')
  expect(fmtCost(1234.4)).toBe('$1234')
  expect(fmtCost(1234.56)).toBe('$1235')
})

test('a small cost under a cent says so, never $0.00', () => {
  expect(fmtSmallCost(0)).toBe('<$0.01')
  expect(fmtSmallCost(0.0099)).toBe('<$0.01')
  expect(fmtSmallCost(0.01)).toBe('$0.01')
  expect(fmtSmallCost(2.41)).toBe('$2.41')
})

test('an estimate is always marked as one, under a cent too', () => {
  expect(fmtEstimate(0)).toBe('~<$0.01')
  expect(fmtEstimate(0.009)).toBe('~<$0.01')
  expect(fmtEstimate(0.01)).toBe('~$0.01')
  expect(fmtEstimate(0.57)).toBe('~$0.57')
})

test('the countdown: M:SS under ten minutes, whole minutes to the hour, then hours and minutes', () => {
  expect(fmtCountdown(0)).toBe('0:00')
  expect(fmtCountdown(30 * SEC)).toBe('0:30')
  expect(fmtCountdown(61 * SEC)).toBe('1:01')
  expect(fmtCountdown(599 * SEC)).toBe('9:59')
  expect(fmtCountdown(600 * SEC)).toBe('10m')
  expect(fmtCountdown(3599 * SEC)).toBe('59m')
  expect(fmtCountdown(3600 * SEC)).toBe('1h 00m')
  expect(fmtCountdown(3900 * SEC)).toBe('1h 05m')
  expect(fmtCountdown(25 * HOUR)).toBe('25h 00m') // hours never roll into days
})

test('the countdown rounds to the second and never runs below zero', () => {
  expect(fmtCountdown(599_400)).toBe('9:59')
  expect(fmtCountdown(3_599_500)).toBe('1h 00m')
  expect(fmtCountdown(-5 * SEC)).toBe('0:00')
})

test('a reset with no readable time is unknown', () => {
  expect(resetIn(undefined, NOW)).toBeUndefined()
  expect(resetIn('', NOW)).toBeUndefined()
  expect(resetIn('soon', NOW)).toBeUndefined()
})

test('a reset at or before now has passed, as has one less than a second off', () => {
  expect(resetIn(at(-SEC), NOW)).toEqual({ kind: 'passed' })
  expect(resetIn(at(0), NOW)).toEqual({ kind: 'passed' })
  expect(resetIn(at(999), NOW)).toEqual({ kind: 'passed' })
})

test('a reset within the hour is whole minutes, cut down', () => {
  expect(resetIn(at(MIN), NOW)).toEqual({ kind: 'in', text: '1m' })
  expect(resetIn(at(5 * MIN + 59 * SEC), NOW)).toEqual({ kind: 'in', text: '5m' })
  expect(resetIn(at(59 * MIN + 59 * SEC), NOW)).toEqual({ kind: 'in', text: '59m' })
})

test('a reset within the day is hours and minutes', () => {
  expect(resetIn(at(HOUR), NOW)).toEqual({ kind: 'in', text: '1h 00m' })
  expect(resetIn(at(3 * HOUR + 5 * MIN), NOW)).toEqual({ kind: 'in', text: '3h 05m' })
  expect(resetIn(at(23 * HOUR + 59 * MIN), NOW)).toEqual({ kind: 'in', text: '23h 59m' })
})

test('a reset a day or more off is days and hours', () => {
  expect(resetIn(at(24 * HOUR), NOW)).toEqual({ kind: 'in', text: '1d 0h' })
  expect(resetIn(at(67 * HOUR), NOW)).toEqual({ kind: 'in', text: '2d 19h' })
})

test('a projection under an hour is in 5-minute steps, never under 5 minutes', () => {
  expect(fmtEta(-3 * MIN)).toBe('~5m')
  expect(fmtEta(0)).toBe('~5m')
  expect(fmtEta(7.4 * MIN)).toBe('~5m')
  expect(fmtEta(7.5 * MIN)).toBe('~10m')
  expect(fmtEta(52.4 * MIN)).toBe('~50m')
  expect(fmtEta(52.5 * MIN)).toBe('~55m')
  expect(fmtEta(57.4 * MIN)).toBe('~55m')
})

test('a projection from 57.5 minutes is in 15-minute steps, whole hours without minutes', () => {
  expect(fmtEta(57.5 * MIN)).toBe('~1h')
  expect(fmtEta(67.4 * MIN)).toBe('~1h')
  expect(fmtEta(67.5 * MIN)).toBe('~1h 15m')
  expect(fmtEta(82.4 * MIN)).toBe('~1h 15m')
  expect(fmtEta(82.5 * MIN)).toBe('~1h 30m')
  expect(fmtEta(120 * MIN)).toBe('~2h')
})

test('an age under a minute is now, then minutes, hours and minutes, days and hours', () => {
  expect(fmtAgo(-1)).toBe('now')
  expect(fmtAgo(0)).toBe('now')
  expect(fmtAgo(MIN - 1)).toBe('now')
  expect(fmtAgo(MIN)).toBe('1m')
  expect(fmtAgo(HOUR - 1)).toBe('59m')
  expect(fmtAgo(HOUR)).toBe('1h 00m')
  expect(fmtAgo(3 * HOUR + 5 * MIN)).toBe('3h 05m')
  expect(fmtAgo(24 * HOUR - 1)).toBe('23h 59m')
  expect(fmtAgo(24 * HOUR)).toBe('1d 0h')
  expect(fmtAgo(52 * HOUR)).toBe('2d 4h')
})

test('a name that fits is kept whole', () => {
  expect(clipMiddle('abcdef', 10)).toBe('abcdef')
  expect(clipMiddle('abcdef', 6)).toBe('abcdef')
  expect(clipMiddle('', 0)).toBe('')
})

test('a name too long is cut in the middle to exactly the room, the head getting the odd character', () => {
  expect(clipMiddle('abcdef', 5)).toBe('ab…ef')
  expect(clipMiddle('abcdef', 4)).toBe('ab…f')
  expect(clipMiddle('abcdef', 3)).toBe('a…f')
  expect(clipMiddle('abcdef', 2)).toBe('a…')
  expect(clipMiddle('claude/a-rather-long-feature-branch', 15)).toBe('claude/…-branch')
})

test('with room for one character the name is an ellipsis, and with none it is empty', () => {
  expect(clipMiddle('abcdef', 1)).toBe('…')
  expect(clipMiddle('abcdef', 0)).toBe('')
  expect(clipMiddle('abcdef', -1)).toBe('')
})

test('a name is clipped by characters, never through one', () => {
  expect(clipMiddle('😀😀😀😀', 3)).toBe('😀…😀')
})

test('the context in use prefers its token count, even a zero, to the percent', () => {
  expect(contextUsed({ tokens: 0, percent: 40, window: 200_000 })).toBe(0)
  expect(contextUsed({ percent: 0, window: 200_000 })).toBe(0)
  expect(contextUsed({ percent: 40, window: 200_000 })).toBe(80_000)
  expect(contextUsed({ window: 200_000 })).toBeUndefined()
})

// ── rounding at a unit's edge ──────────────────────────────────────────

test('a token count that rounds up to the next unit is written in it', () => {
  expect(fmtTokens(9_949)).toBe('9.9k')
  expect(fmtTokens(9_999)).toBe('10k') // not 10.0k, which the next unit already says
  expect(fmtTokens(999_499)).toBe('999k')
  expect(fmtTokens(999_999)).toBe('1.0M') // not 1000k
})

test('a cost that rounds to $1000 is written as whole dollars, as $1000 itself is', () => {
  expect(fmtCost(999.994)).toBe('$999.99')
  expect(fmtCost(999.995)).toBe('$1000')
  expect(fmtEstimate(1234.5)).toBe('~$1235') // estimates switch at $1000 too
  expect(fmtEstimate(12.344)).toBe('~$12.34')
})

test('a reset under a minute away says so, not 0m', () => {
  expect(resetIn(new Date(30_000).toISOString(), 0)).toEqual({ kind: 'in', text: '<1m' })
  expect(resetIn(new Date(60_000).toISOString(), 0)).toEqual({ kind: 'in', text: '1m' })
})
