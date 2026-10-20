// The suite every layout runs, checked as a list.

import { test, expect } from 'claude-code/testing'
import type { LayoutName } from '../hooks/snapshot'
import { SCENARIO_NAMES, suiteCases, type Surface } from './matrix'

const cases = suiteCases('pulse')
test('every scenario is drawn, on both surfaces', () => {
  for (const s of SCENARIO_NAMES) expect(cases.some(c => c.options.scenario === s && c.mounts.some(m => m.surface === 'terminal') && c.mounts.some(m => m.surface === 'desktop'))).toBe(true)
})
test('the open-only amber starts at a body of one row', () => {
  const lowest = (layout: LayoutName, surface: Surface) =>
    Math.min(...suiteCases(layout).filter(c => c.options.scenario === 'gatewaySpend').flatMap(c => c.mounts).flatMap(m => (m.surface === surface && m.maxRows !== undefined ? [m.maxRows] : [])))
  expect([lowest('pulse', 'terminal'), lowest('pulse', 'desktop')]).toEqual([5, 5])
  expect([lowest('departures', 'terminal'), lowest('departures', 'desktop')]).toEqual([5, 5])
})
test('light, plain and the ascii tier are each drawn', () => {
  expect(cases.some(c => c.options.appearance === 'light')).toBe(true)
  expect(cases.some(c => c.options.appearance === 'plain')).toBe(true)
  expect(cases.some(c => c.options.env?.NEXTCOST_GLYPHS === 'ascii')).toBe(true)
})
