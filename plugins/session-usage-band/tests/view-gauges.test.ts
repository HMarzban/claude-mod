// Gauges, two rows of labelled bars: the cache row and the three cells, how
// they give way as they narrow, and the four panels behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, byKey, shown, svgAlts, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('gauges')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'gauges', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('row one is the cache with its time-left bar; row two the three cells', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/cache.*1h 00m left · re-warm ~\$\S+\s*\$2\.41 · \S+ tokens/)
  expect(t).toMatch(/context.*38%.*5h.*4%.*7d.*30%/)
})
test('5h and 7d bars carry a tick for the window gone; context has none', async ($, on) => {
  const ticked = svgsOf((await at($, on, 'calm', D160)).shut).filter(n => /class="tick"/.test(String(n.props?.source)))
  expect(ticked.map(n => String(n.props?.alt).split(' ')[0])).toEqual(['5h', '7d'])
})
test('unmeasured, the cache draws no bar', async ($, on) => {
  const trees = await drawCases($, on, { layout: 'gauges', scenario: 'unmeasured', appearance: 'dark', ttl: '1h' }, [D160, T160])
  expect(svgAlts(trees[caseKey(D160, 'shut')]).filter(alt => alt.startsWith('cache'))).toEqual([])
  expect(shown(trees[caseKey(T160, 'shut')])).toMatch(/^cache\s*–/)
})
test('warming, the cache draws no bar', async ($, on) => {
  expect(svgAlts((await at($, on, 'warming', D160)).shut).filter(alt => alt.startsWith('cache'))).toEqual([])
})
test('narrow, calm cells become text', async ($, on) => {
  expect(shown((await at($, on, 'calm', { surface: 'terminal', cols: 50 })).shut)).toMatch(/5h 4%/)
})
test('each row gives way in its own spec order', async ($, on) => {
  // Each width sits inside its step's band, not at its edge. Each row squeezes
  // on its own, so row two's resets can go while row one keeps its tokens.
  const mounts = [160, 95, 80, 65, 50].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'gauges', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, noResets, costRight, joined, text] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/\$2\.41 · \S+ tokens/)
  expect(whole).toMatch(/4% ↻ in 3h 00m\s*7d[█░│]{12}30% ↻ in 2d 19h/)
  expect(noResets).toMatch(/\$2\.41 · \S+ tokens/)
  expect(noResets).not.toMatch(/↻/)
  expect(costRight).toMatch(/cache[█░]{24}1h 00m left · re-warm ~\$[\d.]+\$2\.41context[█░]{12}38%/)
  expect(costRight).not.toMatch(/tokens/)
  expect(joined).toMatch(/cache[█░]{6}1h 00m left · re-warm ~\$[\d.]+ · \$2\.41context[█░]{6}38%/)
  expect(text).toMatch(/cache[█░]{6}1h 00m left · \$2\.41context 38%\s*5h 4%\s*7d 30%/)
})
test('at 40 columns amber still speaks, short', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)
  expect(t).toMatch(/^cache\s*! 30s/)
  expect(t).not.toMatch(/left/)
})
test('amber, the cost joins the reason as the calm sentence does, and goes before the reason shortens', LONG, async ($, on) => {
  const mounts = [60, 50, 40].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'gauges', scenario: 'lastMinute', appearance: 'dark', ttl: '5m' }, mounts)
  const [mid, held, narrow] = mounts.map(m => shown(byKey(trees[caseKey(m, 'shut')], 'cache', 'Box')))
  expect(mid).toMatch(/! 30s left · re-warm ~\$[\d.]+ · \$2\.41/)
  expect(held).toMatch(/! 30s left · re-warm ~\$[\d.]+$/)
  expect(narrow).toMatch(/^cache\s*! 30s$/)
})
test('a measured pace speaks in amber words', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! 5h full in ~/)
})
test('the last minute speaks in amber words, its price kept', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/cache.*! 30s left · re-warm ~\$/)
})
test('a cold cache says its price', LONG, async ($, on) => {
  expect(shown((await at($, on, 'cold', T160, '5m')).shut)).toMatch(/cache.*cold · re-warm ~\$/)
})
test('open, the limits carry a dashed projection and their pace', async ($, on) => {
  const { open } = await at($, on, 'calm', D160)
  expect(shown(open)).toMatch(/on pace for ~\d+%/)
  expect(svgsOf(open).some(n => /stroke-dasharray="3 2"/.test(String(n.props?.source)))).toBe(true)
})
test('open, an amber limit keeps its reset and its pace', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).open)).toMatch(/LIMITS.*! 5h 82% · resets in 3h 00m · full before reset/)
})
test('open, an amber limit leads the calm ones', async ($, on) => {
  expect(shown((await at($, on, 'gatewaySpend')).open)).toMatch(/LIMITS.*! spend 92% · resets in 5h 00m\s*5h 4%/)
})
test('open, each limit says when it resets, even where the row has no room for it', async ($, on) => {
  expect(shown((await at($, on, 'calm', { surface: 'terminal', cols: 80 })).open)).toMatch(/LIMITS.*5h 4% · resets in 3h 00m · on pace for ~10%/)
})
test('open, the spend panel says the session\'s tokens', async ($, on) => {
  expect(shown((await at($, on, 'calm', { surface: 'terminal', cols: 80 })).open)).toMatch(/SPEND.*tokens 208k/)
})
test('open, a limit filling before its reset says so once', LONG, async ($, on) => {
  const limits = shown((await at($, on, 'fiveHourAhead')).open).split('LIMITS')[1] ?? ''
  expect(limits).toMatch(/! 5h full in ~1h · resets in/)
  expect(limits.match(/full in/g)?.length).toBe(1)
})
test('open, a share\'s bar says its share, neither used nor left', async ($, on) => {
  expect(svgAlts((await at($, on, 'calm', D160)).open).filter(alt => /^(hit rate|input|output|cache reads) /.test(alt))).toEqual(['hit rate 0%', 'input 94%', 'output 6%', 'cache reads 0%'])
})
test('open, the context says its share beside its bar', async ($, on) => {
  expect(shown((await at($, on, 'calm')).open)).toMatch(/CONTEXT.*38% of the window/)
})
test('open with no limits, the panel says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*none reported/)
})
test('open with no context, the panel says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*not reported/)
})
