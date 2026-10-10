// The suite every layout runs, checked as a list: its first real run is the
// pilot's (Task 16), since chips and a stub draw chips' rows and words.

import { test, expect } from 'claude-code/testing'
import type { LayoutName } from '../hooks/snapshot'
import { LONG_WALKS, SCENARIO_NAMES, suiteCases, type Surface } from './matrix'

const cases = suiteCases('ledger')
test('38 cases, named apart', () => {
  expect(cases).toHaveLength(38)
  expect(new Set(cases.map(c => c.name)).size).toBe(38)
})
test('every scenario is drawn, on both surfaces', () => {
  for (const s of SCENARIO_NAMES) expect(cases.some(c => c.options.scenario === s && c.mounts.some(m => m.surface === 'terminal') && c.mounts.some(m => m.surface === 'desktop'))).toBe(true)
})
test('the long walks use the 5-minute cache', () => {
  for (const c of cases) if (LONG_WALKS.has(c.options.scenario)) expect(c.options.ttl).toBe('5m')
})
test('every width and every height is covered', () => {
  for (const cols of [40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200]) expect(cases.some(c => c.options.scenario === 'lastMinute' && c.mounts.some(m => m.cols === cols))).toBe(true)
  for (const maxRows of [4, 8, 13, 40]) expect(cases.some(c => c.mounts.some(m => m.maxRows === maxRows))).toBe(true)
  for (const s of ['fiveHourAhead', 'limit80', 'nearCompaction', 'coldLimit80']) expect(cases.some(c => c.options.scenario === s && c.mounts.some(m => m.cols === 40))).toBe(true)
  // The open-only amber short of rows, on both grids.
  for (const cols of [80, 120]) for (const maxRows of [5, 6, 7, 8, 10]) expect(cases.some(c => c.options.scenario === 'gatewaySpend' && c.mounts.some(m => m.cols === cols && m.maxRows === maxRows))).toBe(true)
})
test('the open-only amber starts at a body of one row', () => {
  const lowest = (layout: LayoutName, surface: Surface) =>
    Math.min(...suiteCases(layout).filter(c => c.options.scenario === 'gatewaySpend').flatMap(c => c.mounts).flatMap(m => (m.surface === surface && m.maxRows !== undefined ? [m.maxRows] : [])))
  expect([lowest('ledger', 'terminal'), lowest('ledger', 'desktop')]).toEqual([5, 5])
  expect([lowest('rings', 'terminal'), lowest('rings', 'desktop')]).toEqual([5, 6])
  expect([lowest('tiles', 'terminal'), lowest('tiles', 'desktop')]).toEqual([6, 6])
})
test('light, plain and the ascii tier are each drawn', () => {
  expect(cases.some(c => c.options.appearance === 'light')).toBe(true)
  expect(cases.some(c => c.options.appearance === 'plain')).toBe(true)
  expect(cases.some(c => c.options.env?.CC_BAND_GLYPHS === 'ascii')).toBe(true)
})
