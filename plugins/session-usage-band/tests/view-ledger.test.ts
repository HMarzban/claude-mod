// Ledger, the band in words alone: its sentence calm and amber, how it gives
// way as it narrows, and the four sections behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown } from './helpers'
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
test('at 40 columns amber still leads', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)).toMatch(/^! 30s/)
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
