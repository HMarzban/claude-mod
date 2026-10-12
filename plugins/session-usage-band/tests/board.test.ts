import { test, expect } from 'claude-code/testing'
import { fixedZone } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { padTo, remarksFit } from '../hooks/words'
import { HOUR, MIN } from './helpers'
import { snapOf } from './matrix'

const UTC = fixedZone(0)
const cacheAt = (over: object) => ({ ...snapOf().cache, ...over })
const board = (over: object = {}) => readingsOf(snapOf({ zone: UTC, ...over })).board
const row = (over: object, key: string) => board(over).rows.find(r => r.key === key)
const limit = (pct: number, resetH: number) => ({ percentUsed: pct, resetsAt: new Date(resetH * HOUR).toISOString(), etaMs: null })
const CLOCK = /\d\d:\d\d/

test('rows run in the one order', () => {
  expect(board({ fiveHour: limit(26, 3), sevenDay: limit(41, 67) }).rows.map(r => r.key)).toEqual(['cache', 'spend', 'context', '5h', '7d'])
})
test('a warm cache departs at its cold-at clock; the countdown is measured, so no ~', () => {
  const r = row({ cache: cacheAt({ requests: 1, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')
  expect([r?.status, r?.time, r?.cell, r?.cellShort, r?.tone]).toEqual(['DEPARTS', '00:38', 'DEPARTS 00:38', '00:38', 'calm'])
  expect(r?.remarks).toMatch(/^IN 38 MIN · RE-WARM ~\$\d/)
  expect(r?.alt).not.toMatch(/[A-Z]{2,}|↻/)
})
test('an hour out, the countdown is IN 1H 04M', () => {
  expect(row({ zone: undefined, cache: cacheAt({ requests: 1, msLeft: 64 * MIN, coldAt: 64 * MIN }) }, 'cache')?.time).toBe('IN 1H 04M')
})
test('a calm last call names its clock; the last minute is amber seconds', () => {
  const calm = row({ cache: cacheAt({ requests: 1, ttl: '1h', msLeft: 5 * MIN, coldAt: 5 * MIN }) }, 'cache')
  expect([calm?.cell, calm?.tone]).toEqual(['LAST CALL 00:05', 'calm'])
  const amber = row({ cache: cacheAt({ requests: 1, msLeft: 47_000, coldAt: 47_000 }) }, 'cache')
  expect([amber?.cell, amber?.cellShort, amber?.tone]).toEqual(['LAST CALL 47S', '! 47S', 'amber'])
})
test('cold has departed: at its time when known, without it when not', () => {
  expect(row({ now: HOUR, cache: cacheAt({ requests: 1, msLeft: 0, coldAt: 10 * MIN }) }, 'cache')?.cell).toMatch(/^DEPARTED 00:10 · RE-WARM ~\$/)
  expect(row({ cache: cacheAt({ requests: 1, msLeft: 0, coldAt: null }) }, 'cache')?.cell).toMatch(/^DEPARTED · RE-WARM ~\$/)
})
test('working boards; unmeasured and warming check in; recalled carries ~', () => {
  expect(row({ isWorking: true, cache: cacheAt({ requests: 1, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')?.cell).toBe('BOARDING')
  expect(row({ cache: cacheAt({ requests: 0, recalled: false, fresh: false }) }, 'cache')?.cell).toBe('CHECK-IN')
  expect(row({ cache: cacheAt({ requests: 0, recalled: false, fresh: true }) }, 'cache')?.cell).toBe('CHECK-IN')
  expect(row({ cache: cacheAt({ requests: 0, recalled: true, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')?.cell).toBe('DEPARTS ~00:38')
})
test('context: USED when calm; amber says COMPACTS IN, its short form CONTEXT; never CTX', () => {
  expect(row({}, 'context')?.status).toMatch(/^\d+% USED$/)
  const near = row({ context: { ...snapOf().context, tokens: 150_000, window: 200_000, compactAt: 160_000 } }, 'context')
  expect(near?.cell).toMatch(/^! COMPACTS IN ~\d+K$/)
  expect(near?.cellShort).toMatch(/^! CONTEXT \d+%$/)
  const off = row({ context: { ...snapOf().context, tokens: 170_000, window: 200_000, compactAt: undefined } }, 'context')
  expect(off?.cell).toMatch(/^! CONTEXT \d+%$/)
  expect(`${near?.cell}${near?.cellShort}${near?.status}${off?.cell}`).not.toMatch(/CTX/)
})
test('limits: the reset stays, an amber remark replaces a calm one, cellNoReset drops only the reset', () => {
  const seven = row({ sevenDay: limit(85, 67) }, '7d')
  expect(seven?.cell).toMatch(/^85% ↻ \S+ \d\d:\d\d ! NEAR LIMIT$/)
  expect(seven?.cellNoReset).toBe('85% ! NEAR LIMIT')
  expect(seven?.tone).toBe('amber')
})
test('a 5h pace that fills says when, by clock or, with no zone, by countdown', () => {
  const pace = { fiveHour: { ...limit(20, 3), etaMs: 40 * MIN } }
  expect(row(pace, '5h')?.cell).toMatch(/! FULL ~\d\d:\d\d$/)
  expect(row({ ...pace, zone: undefined }, '5h')?.cell).toMatch(/! FULL IN ~40 MIN$/)
})
test('a passed reset says PASSED', () => {
  expect(row({ now: 4 * HOUR, fiveHour: limit(4, 3) }, '5h')?.time).toBe('PASSED')
})
test('an unknown zone: no clock anywhere on the board, and no empty time', () => {
  for (const r of board({ zone: undefined, fiveHour: limit(26, 3), sevenDay: limit(85, 67) }).rows) {
    for (const text of [r.time, r.cell, r.remarks, r.alt]) expect(text).not.toMatch(CLOCK)
    expect(r.time).not.toBe('')
    expect(`${r.cell}${r.remarks}`).not.toMatch(/undefined|NaN/)
  }
})
test('no workspace leaves the header out; a workspace heads it in capitals', () => {
  expect(board({ workspace: undefined }).header).toBeUndefined()
  expect(board({ workspace: { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } }).header).toEqual(['CLAUDE-MOD', 'MAIN', 'CLEAN'])
})
test('remarksFit cuts with an ellipsis and leaves a short one whole; padTo pads', () => {
  expect(remarksFit('IN 38 MIN · RE-WARM', 6)).toBe('IN 38…')
  expect(remarksFit('IN 38 MIN', 40)).toBe('IN 38 MIN')
  expect(padTo('5H', 4)).toBe('5H  ')
  expect(padTo('CONTEXT', 4)).toBe('CONTEXT')
})
