// Forecast, the band read like the weather: now, then each change ahead at
// its clock time, how it gives way as it narrows, and the outlook behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import { forecastView } from '../hooks/views/forecast'
import { HOUR, LONG, MIN, fakeEl, shown, svgsOf, weekdayLead } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('forecast')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
const T40: Mount = { surface: 'terminal', cols: 40 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'forecast', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** The weekday the 5h reset leads with on this host, '' today: calm's, 3h on
 *  and drawn at 0; cold's at 5m, drawn a minute past its 5 minutes; and
 *  fiveHourAhead's, 4h on and drawn 12 minutes in. */
const CALM_RESET_DAY = weekdayLead(3 * HOUR, 0)
const COLD_RESET_DAY = weekdayLead(3 * HOUR, 6 * MIN)
const PACED_RESET_DAY = weekdayLead(4 * HOUR, 12 * MIN)

test('now, then the changes ahead in time order, at most three', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(new RegExp(String.raw`^now\s*·\s*warm\s*│\s*\d{2}:\d{2}\s*·\s*in 1h 00m\s*·\s*cold\s*│\s*${CALM_RESET_DAY}\d{2}:\d{2}\s*·\s*5h resets`))
  expect((t.match(/│/g) ?? []).length).toBeLessThanOrEqual(3)
  // The 7d reset, 67h off, is past the day a change ahead looks to.
  expect(t).not.toMatch(/7d resets/)
})
test('only the next change says how far off it is', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut).match(/\bin \d/g)).toEqual(['in 1'])
})
test('a cold cache is no change ahead: the next one is the reset', async ($, on) => {
  expect(shown((await at($, on, 'cold', T160, '5m')).shut)).toMatch(new RegExp(String.raw`^now\s*·\s*cold[^│]*│\s*${COLD_RESET_DAY}\d{2}:\d{2}\s*·\s*in \d+h \d+m\s*·\s*5h resets`))
})
test('in the terminal, a cold cache says its price in its head', LONG, async ($, on) => {
  expect(shown((await at($, on, 'cold', T160, '5m')).shut)).toMatch(/^now · cold · re-warm ~\$\S+\s*│/)
})
test('on a plain desktop, with no detail row, a cold cache says its price in its head', LONG, async ($, on) => {
  const plain = await drawCases($, on, { layout: 'forecast', scenario: 'cold', appearance: 'plain', ttl: '5m' }, [D160])
  expect(shown(plain[caseKey(D160, 'shut')])).toMatch(/^now · cold · re-warm ~\$\S+\s*│/)
})
test('on the desktop, a cold cache says its price once, beneath now', LONG, async ($, on) => {
  const t = shown((await at($, on, 'cold', D160, '5m')).shut)
  expect(t).toMatch(/^now · cold\s*next message ~\$\S+\s*│/)
  expect(t.match(/~\$/g)).toHaveLength(1)
})
test('at 40 columns a cold cache keeps its price short, past the next change', LONG, async ($, on) => {
  expect(shown((await at($, on, 'cold', T40, '5m')).shut)).toMatch(/^now · cold ~\$[\d.]+$/)
})
test('at 40 columns an amber limit still fits beside the cold price', LONG, async ($, on) => {
  expect(shown((await at($, on, 'coldLimit80', T40, '5m')).shut)).toMatch(/^now · cold ~\$[\d.]+\s*│\s*! 5h 82%$/)
})
test('the last minute is "! cooling" with seconds', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/^! cooling · 30s left/)
})
test('at 40 columns amber still leads, short once the calm changes have given way', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T40, '5m')).shut)).toMatch(/^! 30s$/)
})
test('in the terminal, the last minute says its price in its head', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/^! cooling · 30s left · re-warm ~\$\S+\s*│/)
})
test('on a plain desktop, with no detail row, the last minute says its price in its head', LONG, async ($, on) => {
  const plain = await drawCases($, on, { layout: 'forecast', scenario: 'lastMinute', appearance: 'plain', ttl: '5m' }, [D160])
  expect(shown(plain[caseKey(D160, 'shut')])).toMatch(/^! cooling · 30s left · re-warm ~\$\S+\s*│/)
})
test('on the desktop, the last minute says its price once, beneath now', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', D160, '5m')).shut)
  expect(t).toMatch(/^! cooling · 30s left\s*re-warm ~\$\S+\s*│/)
  expect(t.match(/re-warm/g)).toHaveLength(1)
})
test('a measured fill is a change before the reset', LONG, async ($, on) => {
  const t = shown((await at($, on, 'fiveHourAhead')).shut)
  expect(t).toMatch(/~\d{2}:\d{2}\s*·\s*in ~\S+\s*·\s*! 5h full/)
  expect(t.indexOf('! 5h full')).toBeLessThan(t.indexOf('5h resets'))
  expect(t.match(/! 5h full/g)).toHaveLength(1)
})
test('a limit at 80% speaks, though it is no change', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/│\s*! 5h 82%/)
})
test('context near compaction speaks', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).shut)).toMatch(/! context 94% · compacts in ~10k/)
})
test('no weather glyphs in the terminal: the words carry it', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).not.toMatch(/[☼☁❄✱◐]/)
})
test('calm gives way in spec order: the far changes, then the "in", on the terminal', async ($, on) => {
  // Each width sits inside its step's band, not at its edge.
  const mounts = [120, 60, 40].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'forecast', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, next, bare] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/in 1h 00m\s*·\s*cold\s*│.*5h resets/)
  expect(next).toMatch(/in 1h 00m\s*·\s*cold/)
  expect(next).not.toMatch(/5h resets/)
  expect(bare).toMatch(/^now\s*·\s*warm\s*│\s*\d{2}:\d{2}\s*·\s*cold/)
  expect(bare).not.toMatch(/\bin \d/)
})
test('the desktop gives each column its detail, and the now icon its words', async ($, on) => {
  const { shut } = await at($, on, 'calm', D160)
  expect(shown(shut)).toMatch(/now\s*·\s*warm\s*1h 00m left/)
  expect(shown(shut)).toMatch(/cold\s*re-warm ~\$/)
  expect(svgsOf(shut).map(s => s.props?.alt)).toEqual(['cache 1 hour left, warm'])
})
test('narrow, the desktop detail shortens and keeps its row', () => {
  // Drawn directly, the zone pinned: on a host where the 5h reset falls
  // tomorrow, its weekday widens the column past 40, and it gives way.
  const snap = snapOf({ layout: 'forecast', surface: 'desktop', columns: 40, isWorking: true, utcOffsetMin: 0 })
  const t = shown(forecastView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT))
  expect(t).toMatch(/^now\s*·\s*warm\s*~\$\S+\s*│/)
  expect(t).not.toMatch(/re-warm/)
})
test('open, an outlook row for each reading, in spec order', async ($, on) => {
  const t = shown((await at($, on, 'calm')).open)
  expect(t).toMatch(/Cache\s*1h 00m left\S*\s*cold at \d{2}:\d{2}, then re-warm ~\$\S+\s*Context/)
  expect(t).toMatch(/Context\s*38%\S*\s*76k of a 200k window\s*5h/)
  expect(t).toMatch(new RegExp(String.raw`5h\s*4%\S*\s*on pace for ~\d+%\s*·\s*↻ ${CALM_RESET_DAY}\d{2}:\d{2}\s*7d`))
  expect(t).toMatch(/7d\s*30%\S*\s*on pace for ~\d+%\s*·\s*↻ \S+ \d{2}:\d{2}\s*Spend/)
  expect(t).toMatch(/Spend\s*\$2\.41\s*\d+k tokens/)
})
test('open, the outlook keeps the facts every view shows behind ▿, and a long name whole', () => {
  // Drawn directly: no scenario measures what the cache saved.
  const snap = snapOf({ layout: 'forecast', columns: 160, expanded: true, otherLimits: [{ kind: 'seven_day_opus', percentUsed: 12, resetsAt: undefined }] })
  const t = shown(forecastView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT))
  expect(t).toMatch(/re-warm ~\$1\.66\s*·\s*saved ~\$11\.40, 96% hit rate\s*Context/)
  expect(t).toMatch(/compacts in ~114k, at 190k\s*·\s*76k in context\s*5h/)
  expect(t).toMatch(/225k tokens: 18k input, 9\.0k output, 198k cache reads/)
  expect(t).toMatch(/seven day opus\s*12%/)
})
test('open near compaction, the reason says how close and the outcome where', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).open)).toMatch(/! context 94% · compacts in ~10k\s*·\s*\d+k in context, compacts at \d+k\s*5h/)
})
test('open, the context bar dashes to compaction, where it lands', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).open)).toMatch(/Context\s*\S+\s*█+▒+[^░]/)
})
test('open with compaction off, the context bar lands nowhere', async ($, on) => {
  expect(shown((await at($, on, 'compactionOff')).open)).toMatch(/Context\s*\S+\s*█+░+[^▒]/)
})
test('open with no context, its row says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/Context\s*not reported/)
})
test('open with no limits, their row says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/Context\s*38%.*Limits\s*none reported\s*Spend/)
})
test('open, a fill says it once, in its reason', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).open)).toMatch(new RegExp(String.raw`! 5h full in ~\S+\s*·\s*↻ ${PACED_RESET_DAY}\d{2}:\d{2}(?!.*full)`))
})
test('open and short of rows, an amber limit keeps its words', async ($, on) => {
  const mounts = ([[120, 6], [80, 7], [120, 13]] as const).flatMap(([cols, maxRows]) =>
    (['terminal', 'desktop'] as const).map((surface): Mount => ({ surface, cols, maxRows })))
  const trees = await drawCases($, on, { layout: 'forecast', scenario: 'gatewaySpend', appearance: 'dark', ttl: '1h' }, mounts)
  for (const m of mounts) expect(`${caseKey(m, 'open')} ${shown(trees[caseKey(m, 'open')])}`).toMatch(/spend\s*92%\s*\S*\s*! spend 92%/)
})
test('with the offset unknown, each change reads as a duration, and a 7d reset within a day gives way first', () => {
  // Drawn directly: no scenario puts the 7d reset within a day.
  const drawn = (columns: number) => {
    const snap = snapOf({ layout: 'forecast', columns, utcOffsetMin: undefined, sevenDay: { percentUsed: 30, resetsAt: new Date(20 * HOUR).toISOString() } })
    return shown(forecastView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT))
  }
  expect(drawn(120)).toBe('now · warm│in 52m · cold│in 3h 00m · 5h resets│in 20h 00m · 7d resets')
  expect(drawn(70)).toBe('now · warm│in 52m · cold│in 3h 00m · 5h resets')
})
test('in ascii, an outlook says when a limit resets in words', LONG, async ($, on) => {
  const trees = await drawCases($, on, { layout: 'forecast', scenario: 'calm', appearance: 'dark', ttl: '1h', env: { CC_BAND_GLYPHS: 'ascii' } }, [T160])
  const open = shown(trees[caseKey(T160, 'open')])
  expect(open).toMatch(new RegExp(String.raw`on pace for ~\d+%\s*-\s*resets ${CALM_RESET_DAY}\d{2}:\d{2}`))
})
test('open, an unmeasured cache draws no bar, so no alt says 0% left', LONG, async ($, on) => {
  const trees = await drawCases($, on, { layout: 'forecast', scenario: 'unmeasured', appearance: 'dark', ttl: '1h' }, [D160])
  expect(svgsOf(trees[caseKey(D160, 'open')]).map(n => String(n.props?.alt)).filter(a => /cache 0%/.test(a))).toEqual([])
})
