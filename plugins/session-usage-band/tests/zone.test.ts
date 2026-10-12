import { test, expect } from 'claude-code/testing'
import { fixedZone, hostZone, readableZone, zoneOf } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { snapOf } from './matrix'

const T = Date.UTC(2026, 9, 9, 12)
test('the host zone is east-positive minutes, as the clock reports each instant', () => {
  expect(hostZone(T)).toBe(-new Date(T).getTimezoneOffset())
})
test('a clock at UTC reads +0, never -0', () => {
  expect(Object.is(zoneOf(() => 0)(T), 0)).toBe(true)
  expect(zoneOf(() => 300)(T)).toBe(-300)
})
test("a zone whose offset can't be read is none, so the band counts down", () => {
  expect(readableZone(zoneOf(() => NaN), T)).toBeUndefined()
  expect(readableZone(hostZone, T)).toBe(hostZone)
})
test('the zone reaches the readings', () => {
  expect(readingsOf(snapOf({ zone: fixedZone(210) })).frame.zone?.(T)).toBe(210)
})
test("the kit's zone, for the ledger", () => {
  console.log(`ZONE offset=${hostZone(T)}`)
})
