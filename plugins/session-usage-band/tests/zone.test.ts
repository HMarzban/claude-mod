import { test, expect } from 'claude-code/testing'
import { fixedZone, hostZone } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { snapOf } from './matrix'

const T = Date.UTC(2026, 9, 9, 12)
test('the host zone is east-positive minutes, as the clock reports each instant', () => {
  expect(hostZone(T)).toBe(-new Date(T).getTimezoneOffset())
  expect(Object.is(hostZone(T), -0)).toBe(false)
})
test('the zone reaches the readings', () => {
  expect(readingsOf(snapOf({ zone: fixedZone(210) })).frame.zone?.(T)).toBe(210)
})
test("the kit's zone, for the ledger", () => {
  console.log(`ZONE offset=${hostZone(T)}`)
})
