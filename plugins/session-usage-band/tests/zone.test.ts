import { test, expect } from 'claude-code/testing'
import { utcOffsetOf } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { snapOf } from './matrix'

const T = Date.UTC(2026, 9, 9, 12)
test('the offset is east-positive minutes, as the clock reports the zone', () => {
  expect(utcOffsetOf(T)).toBe(-new Date(T).getTimezoneOffset())
})
test('an unreadable time has no offset', () => {
  expect(utcOffsetOf(Number.NaN)).toBeUndefined()
})
test('the offset reaches the readings', () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 210 })).frame.utcOffsetMin).toBe(210)
})
test("the kit's zone, for the ledger", () => {
  console.log(`ZONE offset=${utcOffsetOf(T)}`)
})
