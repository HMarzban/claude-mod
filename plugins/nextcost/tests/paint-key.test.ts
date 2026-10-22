// The paint key: whenever a time the band draws would read differently, the
// key the 1-second tick compares has changed too.

import { test, expect } from 'claude-code/testing'
import { fixedZone, grainOf, paintKey } from '../hooks/format'
import type { Zone } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { MIN } from './helpers'
import { snapOf } from './matrix'

const SEC = 1000

/** Every time the readings say at `snap`: the cache's words, chips' pill,
 *  each limit's, and the board's rows. */
const drawnTimes = (snap: BandSnapshot): string => {
  const r = readingsOf(snap)
  return JSON.stringify([
    r.cache.figure,
    r.cache.figureShort,
    r.cache.cardHead,
    r.cache.alt,
    r.chips.cache.pill(false),
    r.chips.cache.hover,
    r.limits.map(l => [l.text, l.resetWhen, l.resetAndPace, l.fillText, l.alt]),
    r.board().rows.map(row => [row.status, row.time, row.cell, row.cellShort, row.remarks]),
  ])
}

/** Walks the clock a second at a time from `from` to `to`, and lists each
 *  instant where a drawn time changed but the key did not. */
const missed = (from: number, to: number, snapAt: (now: number) => BandSnapshot, keyAt: (now: number) => string): number[] => {
  const misses: number[] = []
  for (let now = from + SEC; now <= to; now += SEC) {
    const timesMoved = drawnTimes(snapAt(now)) !== drawnTimes(snapAt(now - SEC))
    if (timesMoved && keyAt(now) === keyAt(now - SEC)) misses.push(now)
  }
  return misses
}

test('a countdown counts seconds in its last minute, chips its seconds to ten minutes, then whole minutes', () => {
  expect([59 * SEC, 60 * SEC, 9 * MIN + 59 * SEC, 10 * MIN].map(grainOf)).toEqual(['seconds', 'close', 'close', 'minutes'])
})

test("the key moves whenever the cache's countdown does, to cold and past it", () => {
  const coldAt = 12 * MIN + 400
  const snapAt = (now: number): BandSnapshot => {
    const snap = snapOf({ now, fiveHour: undefined, sevenDay: undefined })
    return { ...snap, cache: { ...snap.cache, coldAt, leftMs: Math.max(0, coldAt - now) } }
  }
  expect(missed(0, 13 * MIN, snapAt, now => paintKey(now, { cacheLeft: Math.max(0, coldAt - now), etaMs: null, resets: [], zone: undefined }))).toEqual([])
})

/** A 5-hour reset half a minute off the minute, so its countdown never
 *  turns with the clock's, and the cache cold, so its countdown never moves
 *  the key: the instants walked past it where the key stayed. */
const resetMisses = (zone: Zone | undefined): number[] => {
  const resetsAt = 12 * MIN + 30 * SEC
  const snapAt = (now: number): BandSnapshot => {
    const snap = snapOf({ now, fiveHour: { percentUsed: 4, resetsAt: resetsAt, etaMs: null }, sevenDay: undefined, zone })
    return { ...snap, cache: { ...snap.cache, coldAt: 0, leftMs: 0 } }
  }
  return missed(0, 13 * MIN, snapAt, now => paintKey(now, { cacheLeft: 0, etaMs: null, resets: [resetsAt], zone }))
}

test("with no zone known, the key moves whenever a limit's reset countdown does, its last minute's seconds too", () => {
  expect(resetMisses(undefined)).toEqual([])
})

test("with a zone known, the key moves whenever a card's reset span does", () => {
  expect(resetMisses(fixedZone(0))).toEqual([])
})
