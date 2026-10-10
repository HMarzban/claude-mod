// Departures, the band as a split-flap board: the cache's flight calm and
// amber, how the line gives way as it narrows, and the board behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('departures')

const T160: Mount = { surface: 'terminal', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'departures', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('warm, the cache departs in minutes, never "52M"', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/CACHE\s*DEPARTS(\s*\d{2}:\d{2})?\s*IN 1H 00 MIN/)
  expect(t).not.toMatch(/\b\d+M\b/)
})
test('the last minute is LAST CALL, with the price and no "send"', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', T160, '5m')).shut)
  expect(t).toMatch(/LAST CALL\s*30s\s*RE-WARM ~\$/)
  expect(t).not.toMatch(/send|keep warm/i)
})
test('cold, it has departed and names the re-warm', LONG, async ($, on) => {
  expect(shown((await at($, on, 'cold', T160, '5m')).shut)).toMatch(/DEPARTED(\s*\d{2}:\d{2})?\s*RE-WARM ~\$/)
})
test('working, it is boarding with no time', async ($, on) => {
  const t = shown((await at($, on, 'working')).shut)
  expect(t).toMatch(/CACHE\s*BOARDING/)
  expect(t).not.toMatch(/BOARDING\s*IN \d/)
})
test('calm, the line reads as the spec draws it', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/CACHE\s*DEPARTS(\s*\d{2}:\d{2})?\s*IN 1H 00 MIN\s*5H\s*4%\s*~\d+% AT ↻\s*7D\s*30%\s*\$2\.41/)
})
test('calm gives way in spec order: the 5h projection, the minutes, 7d, 5h as one flap, then the cost', async ($, on) => {
  // On the desktop every step shows; each width sits inside its step's band,
  // not at its edge. shown() joins flaps with no space, so `5H4%` is two flaps
  // and `5H 4%` one.
  const mounts = [120, 72, 60, 50, 45, 42].map((cols): Mount => ({ surface: 'desktop', cols }))
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, noProjection, noMinutes, noSeven, fiveShort, noCost] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/IN 1H 00 MIN\s*5H4%\s*~\d+% AT ↻\s*7D30%\s*\$2\.41/)
  expect(noProjection).toMatch(/IN 1H 00 MIN\s*5H4%\s*7D30%/)
  expect(noProjection).not.toMatch(/AT ↻/)
  expect(noMinutes).toMatch(/DEPARTS \d{2}:\d{2}\s*5H4%\s*7D30%/)
  expect(noMinutes).not.toMatch(/IN 1H/)
  expect(noSeven).toMatch(/5H4%\s*\$2\.41/)
  expect(noSeven).not.toMatch(/7D/)
  expect(fiveShort).toMatch(/5H 4%\s*\$2\.41/)
  expect(noCost).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*5H 4%$/)
})
test('at 40 columns a limit at 80% keeps its short reason once every calm piece has gone', async ($, on) => {
  expect(shown((await at($, on, 'limit80', { surface: 'terminal', cols: 40 })).shut)).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*! 5h 82%$/)
})
test('at 40 columns the context near compaction keeps its short reason', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction', { surface: 'terminal', cols: 40 })).shut)).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*! ctx \d+%$/)
})
test('at 40 columns LAST CALL keeps its seconds and lets its price go', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)
  expect(t).toMatch(/^CACHE\s*LAST CALL\s*30s$/)
})
test('a measured fill is ! FULL', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! FULL/)
})
test('82% is ! NEAR LIMIT', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/! NEAR LIMIT/)
})
test('context near compaction gets a flap of its own', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).shut)).toMatch(/! COMPACTS IN ~10K/)
})
test('open, the board has its header and every row', async ($, on) => {
  const t = shown((await at($, on, 'calm')).open)
  expect(t).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  for (const item of ['CACHE', 'CONTEXT', '5H', '7D', 'SPEND']) expect(t).toContain(item)
})
test('open, the workspace heads the board on a flap', async ($, on) => {
  expect(shown((await at($, on, 'calm')).open)).toMatch(/claude-mod, branch main, clean/)
})
test('open with no limits, the board says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*NONE REPORTED/)
})
test('open with no context, the board says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*NOT REPORTED/)
})
test('open, the context near compaction reads its board words', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).open)).toMatch(/CONTEXT\s*! COMPACTS IN ~10K/)
})
