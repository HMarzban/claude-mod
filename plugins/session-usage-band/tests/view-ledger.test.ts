// Ledger, the band in words alone: its sentence calm and amber, how it gives
// way as it narrows, and the four sections behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderChildren } from 'claude-code'
import { ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { LONG, byKey, shown } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('ledger')

const T160: Mount = { surface: 'terminal', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'ledger', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('calm reads as one sentence of readings', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/cache 1h 00m left\s*·\s*\$2\.41\s*·\s*context 38%\s*·\s*5h 4%, resets in 3h 00m\s*·\s*7d 30%, resets in 2d 19h/)
})
test('the last minute leads with "! " and the price', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/^! 30s left · re-warm ~\$/)
})
test('narrow, the resets give way first and the cache stays', async ($, on) => {
  const t = shown((await at($, on, 'calm', { surface: 'terminal', cols: 60 })).shut)
  expect(t).toMatch(/cache 1h 00m left/)
  expect(t).not.toMatch(/resets in/)
})
test('calm gives way in spec order: the reset words, the reset times, 7d, the context, the cost, then 5h', async ($, on) => {
  // Each width sits inside its step's band, not at its edge.
  const mounts = [120, 95, 86, 60, 40].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'ledger', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, glyph, noResets, noSeven, cacheAndFive] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/5h 4%, resets in 3h 00m\s*·\s*7d 30%, resets in 2d 19h/)
  expect(whole).not.toMatch(/↻/)
  expect(glyph).toMatch(/5h 4%, ↻ in 3h 00m\s*·\s*7d 30%, ↻ in 2d 19h/)
  expect(glyph).not.toMatch(/resets in/)
  expect(noResets).toMatch(/7d 30%/)
  expect(noResets).not.toMatch(/↻|resets in/)
  expect(noSeven).toMatch(/context 38%\s*·\s*5h 4%/)
  expect(noSeven).not.toMatch(/7d/)
  expect(cacheAndFive).toMatch(/^cache 1h 00m left\s*·\s*5h 4%/)
  expect(cacheAndFive).not.toMatch(/\$2\.41|context/)
})
test('at 40 columns amber still leads', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)).toMatch(/^! 30s/)
})
test('at 40 columns a cold cache says its short words, so an amber limit fits beside it', LONG, async ($, on) => {
  const line = byKey((await at($, on, 'coldLimit80', { surface: 'terminal', cols: 40 }, '5m')).shut, 'line', 'Box')
  expect(shown(line)).toMatch(/^cold ~\$[\d.]+\s*·\s*! 5h 82%$/)
  expect(cellsOf(line as RenderChildren, TERMINAL)).toBeLessThanOrEqual(40 - ROW_SLACK - 2)
})
test('at 40 columns a warm countdown keeps its words beside an amber context', async ($, on) => {
  expect(shown(byKey((await at($, on, 'nearCompaction', { surface: 'terminal', cols: 40 })).shut, 'line', 'Box'))).toMatch(/^cache 1h 00m left·! ctx 94%$/)
})
test('a limit at 80% says why, in words', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/! 5h 82%/)
})
test('open: the workspace as a sentence, then four sections', async ($, on) => {
  const t = shown((await at($, on, 'calm')).open)
  expect(t).toMatch(/claude-mod, branch main, clean/)
  for (const title of ['CACHE', 'SPEND', 'CONTEXT', 'LIMITS']) expect(t).toContain(title)
  expect(t).toMatch(/re-warm ~\$\S+ if it goes cold/)
})
test('open with no limits, the section says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*none reported/)
})
test('open with no context, the section says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*not reported/)
})
test('open and short of rows, an amber limit keeps its words', async ($, on) => {
  // Each mount leaves LIMITS one row under its title.
  const mounts = ([[120, 7], [80, 7], [80, 10]] as const).flatMap(([cols, maxRows]) =>
    (['terminal', 'desktop'] as const).map((surface): Mount => ({ surface, cols, maxRows })))
  const trees = await drawCases($, on, { layout: 'ledger', scenario: 'gatewaySpend', appearance: 'dark', ttl: '1h' }, mounts)
  for (const m of mounts) expect(`${caseKey(m, 'open')} ${shown(trees[caseKey(m, 'open')])}`).toMatch(/LIMITS\s*! spend 92%, resets in 5h 00m/)
})
test('open, an amber limit keeps its pace', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).open)).toMatch(/! 5h 82%, resets in 3h 00m, full before reset/)
})
test('open, a limit filling before its reset says so once', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).open)).toMatch(/! 5h full in ~1h, resets in \d+h \d+m(?!, full)/)
})
