// Tiles, a bold value over its label: the tiles calm and amber, the
// desktop's underlines, how they give way as the line narrows, and the four
// groups behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('tiles')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'tiles', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** A tree's underlines: its 4 px Svgs. */
const underlines = (tree: unknown) => svgsOf(tree).filter(n => Number(n.props?.height) === 4)

test('each tile is a value over its label', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/1h 00m\s*cache/)
  expect(t).toMatch(/\$2\.41\s*this session/)
  expect(t).toMatch(/38%\s*context/)
  expect(t).toMatch(/4%\s*5h ↻ in 3h 00m/)
  expect(t).toMatch(/30%\s*7d ↻ in 2d 19h/)
})
test('the desktop draws an underline under each tile but the cost', async ($, on) => {
  expect(underlines((await at($, on, 'calm', D160)).shut)).toHaveLength(4)
})
test('an amber tile turns its label into the reason', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/30s\s*! 30s left · re-warm ~\$/)
})
test('calm gives way in spec order: the underline, the reset text, 7d, then the context', async ($, on) => {
  // Each width sits inside its step's band, not at its edge.
  const terminals = [120, 65, 52, 44].map((cols): Mount => ({ surface: 'terminal', cols }))
  const desktops = [120, 68].map((cols): Mount => ({ surface: 'desktop', cols }))
  const trees = await drawCases($, on, { layout: 'tiles', scenario: 'calm', appearance: 'dark', ttl: '1h' }, [...terminals, ...desktops])
  const [barred, bare] = desktops.map(m => trees[caseKey(m, 'shut')])
  expect(underlines(barred)).toHaveLength(4)
  expect(underlines(bare)).toHaveLength(0)
  expect(shown(bare)).toMatch(/5h ↻ in 3h 00m/)
  const [whole, noResets, noSeven, noContext] = terminals.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/5h ↻ in 3h 00m\s*30%\s*7d ↻ in 2d 19h/)
  expect(noResets).toMatch(/4%\s*5h\s*30%\s*7d$/)
  expect(noSeven).toMatch(/38%\s*context\s*4%\s*5h$/)
  expect(noContext).toMatch(/^1h 00m\s*cache\s*\$2\.41\s*this session\s*4%\s*5h$/)
})
test('at 40 columns an amber tile still says why, once the cost has gone', async ($, on) => {
  const t = shown((await at($, on, 'limit80', { surface: 'terminal', cols: 40 })).shut)
  expect(t).toMatch(/82%\s*! 5h 82%/)
  expect(t).not.toMatch(/\$2\.41/)
})
test('the cache not measured yet has no re-warm price open', async ($, on) => {
  expect(shown((await at($, on, 'unmeasured')).open)).not.toMatch(/re-warm if cold/)
})
test('open, every limit has its tiles, an amber gateway spend limit first, with its reason', async ($, on) => {
  expect(shown((await at($, on, 'gatewaySpend')).open)).toMatch(/LIMITS\s*92%\s*! spend 92%.*4%\s*5h.*30%\s*7d/)
})
test('open, a projection is a dashed underline', async ($, on) => {
  expect(svgsOf((await at($, on, 'calm', D160)).open).some(n => /stroke-dasharray/.test(String(n.props?.source)))).toBe(true)
})
test('open with no context, its group says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*not reported/)
})
test('open with no limits, its group says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*none reported/)
})
