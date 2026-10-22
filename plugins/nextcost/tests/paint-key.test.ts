// The paint key: whenever a time the band draws would read differently, the
// key the 1-second tick compares has changed too, and it changes at no other
// second but the minute's.

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
    r.cache.idleText,
    r.chips.cache.pill(false),
    r.chips.cache.hover,
    r.limits.map(l => [l.text, l.resetWhen, l.resetAndPace, l.fillText, l.alt]),
    r.board().rows.map(row => [row.status, row.time, row.cell, row.cellShort, row.remarks]),
  ])
}

/** Walks the clock a second at a time over the first 13 minutes, and lists
 *  each instant where a drawn time changed but the key did not (missed),
 *  and where the key changed but no drawn time did, nor the minute the key
 *  turns with for the clocks and the battery (needless). */
const walk = (snapAt: (now: number) => BandSnapshot, keyAt: (now: number) => string): Readonly<{ missed: number[]; needless: number[] }> => {
  const missed: number[] = []
  const needless: number[] = []
  for (let now = SEC; now <= 13 * MIN; now += SEC) {
    const timesMoved = drawnTimes(snapAt(now)) !== drawnTimes(snapAt(now - SEC))
    const keyMoved = keyAt(now) !== keyAt(now - SEC)
    const minuteTurned = Math.ceil(now / MIN) !== Math.ceil((now - SEC) / MIN)
    if (timesMoved && !keyMoved) missed.push(now)
    if (keyMoved && !timesMoved && !minuteTurned) needless.push(now)
  }
  return { missed, needless }
}

/** No instant missed, and no needless repaint. */
const EXACT = { missed: [], needless: [] }

test('a countdown counts seconds in its last minute, chips its seconds to ten minutes, then whole minutes', () => {
  expect([59 * SEC, 60 * SEC, 9 * MIN + 59 * SEC, 10 * MIN].map(grainOf)).toEqual(['seconds', 'close', 'close', 'minutes'])
})

test("the key moves whenever the cache's countdown does, to cold and past it, and at no other second", () => {
  const coldAt = 12 * MIN + 400
  const snapAt = (now: number): BandSnapshot => {
    const snap = snapOf({ now, fiveHour: undefined, sevenDay: undefined })
    return { ...snap, cache: { ...snap.cache, coldAt, leftMs: Math.max(0, coldAt - now) } }
  }
  const keyAt = (now: number): string => paintKey(now, { cacheLeft: Math.max(0, coldAt - now), idleMs: null, etaMs: null, resets: [], zone: undefined })
  expect(walk(snapAt, keyAt)).toEqual(EXACT)
})

/** A 5-hour reset half a minute off the minute, so its countdown never
 *  turns with the clock's, and the cache cold, so its countdown never moves
 *  the key: the walk past it. */
const resetWalk = (zone: Zone | undefined): ReturnType<typeof walk> => {
  const resetsAt = 12 * MIN + 30 * SEC
  const snapAt = (now: number): BandSnapshot => {
    const snap = snapOf({ now, fiveHour: { percentUsed: 4, resetsAt: resetsAt, etaMs: null }, sevenDay: undefined, zone })
    return { ...snap, cache: { ...snap.cache, coldAt: 0, leftMs: 0 } }
  }
  const keyAt = (now: number): string => paintKey(now, { cacheLeft: 0, idleMs: null, etaMs: null, resets: [resetsAt], zone })
  return walk(snapAt, keyAt)
}

test("with no zone known, the key moves whenever a limit's reset countdown does, its last minute's seconds too, and at no other second", () => {
  expect(resetWalk(undefined)).toEqual(EXACT)
})

test("with a zone known, the key moves whenever a card's reset span does, and at no other second", () => {
  expect(resetWalk(fixedZone(0))).toEqual(EXACT)
})

test("a recalled cold cache moves the key whenever its idle time turns, and at no other second", () => {
  // Its last reply three hours ago, 25 s off the minute, so the idle time
  // never turns with the clock's minute.
  const lastAt = -3 * 60 * MIN + 25 * SEC
  const snapAt = (now: number): BandSnapshot => {
    const snap = snapOf({ now, fiveHour: undefined, sevenDay: undefined })
    return { ...snap, cache: { ...snap.cache, requests: 0, fresh: false, recalled: true, coldAt: lastAt + 60 * MIN, leftMs: 0, idleMs: now - lastAt } }
  }
  const keyAt = (now: number): string => paintKey(now, { cacheLeft: 0, idleMs: now - lastAt, etaMs: null, resets: [], zone: undefined })
  expect(walk(snapAt, keyAt)).toEqual(EXACT)
})
