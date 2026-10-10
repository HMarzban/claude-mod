// Rings, a ring per reading: one for each reading and none for the cost, the
// terminal's meters, the reason as the label, and the four panels behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { DARK } from '../hooks/palette'
import { byKey, LONG, shown, svgAlts, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('rings')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'rings', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** Each ring's reading, as its alt names it. */
const ringAlts = (tree: unknown) => svgsOf(tree).filter(n => /<circle/.test(String(n.props?.source))).map(n => String(n.props?.alt).split(' ')[0])

test('the desktop draws a ring per reading, and none for the cost', async ($, on) => {
  expect(ringAlts((await at($, on, 'calm', D160)).shut)).toEqual(['cache', 'context', '5h', '7d'])
})
test('the terminal shows a meter, the value and the label on one row', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/█+░*\s*1h 00m\s*cache/)
})
test('amber makes the label the reason', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! 5h full in ~/)
})
test('amber turns the ring amber too, shut and open', async ($, on) => {
  const { shut, open } = await at($, on, 'limit80', D160)
  const fives = [shut, open].flatMap(t => svgsOf(t).filter(n => String(n.props?.alt).startsWith('5h ')))
  // Shut, the line's; open, the line's and the panel's.
  expect(fives.length).toBe(3)
  for (const n of fives) expect(String(n.props?.source)).toContain(`stroke="${DARK.amberFg}"`)
})
test('working, the value says warm and the label only cache', async ($, on) => {
  expect(shown((await at($, on, 'working')).shut)).toMatch(/warm\s*cache(?! warm)/)
})
test('warming, the value says warming and the label only cache', async ($, on) => {
  expect(shown((await at($, on, 'warming')).shut)).toMatch(/warming\s*cache(?! warming)/)
})
test('a passed window says reset on the line, and its big ring draws no figure', async ($, on) => {
  const { shut, open } = await at($, on, 'resetPassed', D160)
  expect(shown(shut)).toMatch(/reset\s*5h/)
  const five = svgsOf(byKey(open, 'rings')).find(n => String(n.props?.alt).startsWith('5h '))
  expect(five).toBeDefined()
  expect(String(five?.props?.source)).not.toContain('<text')
})
test('open, a share\'s bar says its share, neither used nor left', async ($, on) => {
  expect(svgAlts((await at($, on, 'calm', D160)).open).filter(alt => /^(hit rate|input|output|cache reads) /.test(alt))).toEqual(['input 94%', 'output 6%', 'cache reads 0%'])
})
test('a cold cache keeps its price once the labels shorten', LONG, async ($, on) => {
  const mounts = [{ surface: 'terminal', cols: 40 }, { surface: 'terminal', cols: 80 }, { surface: 'desktop', cols: 80 }] as const
  const trees = await drawCases($, on, { layout: 'rings', scenario: 'cold', appearance: 'dark', ttl: '5m' }, mounts)
  for (const m of mounts) expect(`${m.surface} ${m.cols}: ${shown(byKey(trees[caseKey(m, 'shut')], 'cache', 'Box'))}`).toMatch(/: [░]*cold~\$[\d.]+$/)
})
test('at 45 columns the last minute\'s meter goes before its reason shortens', LONG, async ($, on) => {
  const m: Mount = { surface: 'terminal', cols: 45 }
  expect(shown(byKey((await at($, on, 'lastMinute', m, '5m')).shut, 'line', 'Box'))).toMatch(/^30s! 30s left · re-warm ~\$[\d.]+$/)
})
test('open, the limits panel shows the 7d ring beside the 5h', async ($, on) => {
  expect(ringAlts(byKey((await at($, on, 'calm', D160)).open, 'rings'))).toEqual(['5h', '7d'])
})
test('open with no context, it says so and never "in context 0"', async ($, on) => {
  const t = shown((await at($, on, 'warming')).open)
  expect(t).toMatch(/CONTEXT\s*not reported/)
  expect(t).not.toMatch(/in context 0/)
})
test('calm gives way in spec order: the long labels, the reset text, 7d, the cost, the context, then the marks', async ($, on) => {
  // Each width sits inside its step's band, not at its edge.
  const mounts = [150, 130, 110, 90, 70, 52, 42].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'rings', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, names, noResets, noSeven, noCost, noContext, noMarks] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/1h 00m\s*cache warm.*38%\s*context.*4%\s*5h limit ↻ in 3h 00m.*30%\s*7d limit ↻ in 2d 19h\s*\$2\.41\s*this session/)
  expect(names).toMatch(/1h 00m\s*cache█.*38%\s*ctx.*4%\s*5h ↻ in 3h 00m.*30%\s*7d ↻ in 2d 19h/)
  expect(names).not.toMatch(/warm|limit/)
  expect(noResets).toMatch(/30%\s*7d\s*\$2\.41/)
  expect(noResets).not.toMatch(/↻/)
  expect(noSeven).toMatch(/4%\s*5h\s*\$2\.41/)
  expect(noSeven).not.toMatch(/7d/)
  expect(noCost).toMatch(/38%\s*ctx.*4%\s*5h$/)
  expect(noCost).not.toMatch(/\$/)
  expect(noContext).toMatch(/^█+░*\s*1h 00m\s*cache░+\s*4%\s*5h$/)
  expect(noMarks).toBe('1h 00mcache4%5h')
})
test('open, an amber limit keeps its reset and its pace', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).open)).toMatch(/! 5h 82%\s*·\s*↻ in 3h 00m\s*·\s*full before reset/)
})
test('open, a limit filling before its reset says so once', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).open)).toMatch(/! 5h full in ~1h\s*·\s*↻ in \d+h \d+m(?!\s*·\s*full)/)
})
