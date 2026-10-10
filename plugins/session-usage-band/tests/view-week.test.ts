// Week, the limits as days and hours: its two rows calm and amber, how they
// give way as they narrow, and LIMITS and the facts line behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionUsage } from 'claude-code'
import { DEFAULT_MAX_ROWS, HOUR, HOUR_1, LONG, START, USAGE, mountBand, setup, shown, svgAlts, svgsOf, type Node } from './helpers'
import { caseKey, drawCases, invariantErrors, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('week')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'week', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

/** A sample of the windows USAGE reports (5h resets at 3h, 7d at 67h), `hours` from now. */
const sample = (hours: number, five: number, seven: number) => ({ at: hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: 3 * HOUR, sevenResetAt: 67 * HOUR })
/** A week of samples: today is the fifth day, up 6 points, and the 5h window's first two hours are known. */
const SAMPLES = [sample(-100, 0, 5), sample(-60, 0, 10), sample(-40, 0, 15), sample(-10, 0, 22), sample(-1.5, 1, 27), sample(-0.5, 3, 28)]
type HistoryOptions = Readonly<{ env?: Record<string, string>; usage?: SessionUsage }>
/** The band with that week stored, each mount drawn shut and open. */
const withHistory = async ($: Engine, on: On, mounts: readonly Mount[], o: HistoryOptions = {}) => {
  setup(on, { store: { layout: 'week', limitSamples: SAMPLES }, env: { ...HOUR_1, ...o.env }, usage: o.usage })
  await $.session.start(START)
  const trees: Record<string, Node> = {}
  for (const m of mounts) {
    const ui = await mountBand($, m.surface, m.cols, { maxRows: m.maxRows })
    trees[caseKey(m, 'shut')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    trees[caseKey(m, 'open')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return trees
}
/** One mount's trees from `withHistory`. */
const oneWithHistory = async ($: Engine, on: On, m: Mount, o: HistoryOptions = {}) => {
  const trees = await withHistory($, on, [m], o)
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** A reset after ↻: a clock time once the offset is known, else a duration. */
const RESET = String.raw`↻ (in \d+[hd] \d+[hm]|(\w{3} )?\d{2}:\d{2})`
const BRAILLE = /[⠀-⣿]/

test('calm, with no history yet: each window, its value and reset; then the empty text, the cache pill and the cost', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(new RegExp(String.raw`^7d 30% ${RESET}\s*5h 4% ${RESET}`))
  expect(t).toMatch(/History fills in as you use Claude\.\s*cache 1h 00m left\s*\$2\.41/)
})
test('the desktop draws day cells and hour cells as Svgs', async ($, on) => {
  const alts = svgAlts((await oneWithHistory($, on, D160)).shut)
  expect(alts.some(a => /^weekly limit by day/.test(a))).toBe(true)
  expect(alts.some(a => /^5-hour limit by hour/.test(a))).toBe(true)
})
test('the terminal marks today in brackets and puts the initials beneath', async ($, on) => {
  const t = shown((await oneWithHistory($, on, T160)).shut)
  expect(t).toMatch(/\[[⠀-⣿]\]/)
  expect(t).toMatch(/[MTWFS]{7}/)
})
test('in ascii the cells become numbers, today in brackets', async ($, on) => {
  const t = shown((await oneWithHistory($, on, T160, { env: { CC_BAND_GLYPHS: 'ascii' } })).shut)
  expect(t).toMatch(/\[[A-Z] 6%\]/)
  expect(t).not.toMatch(BRAILLE)
})
test('the day a guess fills the weekly limit is marked !', async ($, on) => {
  // 70% used with 60% of the window gone lands at ~117%: the last day fills it.
  const usage: SessionUsage = {
    ...USAGE,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString() },
      { kind: 'seven_day', percentUsed: 70, resetsAt: new Date(67 * HOUR).toISOString() },
    ],
  }
  const trees = await withHistory($, on, [T160, D160], { usage })
  expect(shown(trees[caseKey(T160, 'shut')])).toMatch(/[MTWFS]{6}!/)
  const days = svgsOf(trees[caseKey(D160, 'shut')]).find(s => /^weekly limit by day/.test(String(s.props?.alt)))
  expect(String(days?.props?.source)).toMatch(/>!<\/text>/)
})
test('calm gives way in spec order: the reset text, the 5h cells, then the 7d cells with their initials', LONG, async ($, on) => {
  // The terminal's initials need row 2's room, so its 7d cells go with the 5h cells.
  const mounts = ([['terminal', 120], ['terminal', 60], ['terminal', 45], ['desktop', 120], ['desktop', 50], ['desktop', 40]] as const)
    .map(([surface, cols]): Mount => ({ surface, cols }))
  const trees = await withHistory($, on, mounts)
  const [t120, t60, t45, d120, d50, d40] = mounts.map(m => trees[caseKey(m, 'shut')])
  expect(shown(t120)).toMatch(/↻[\s\S]*↻/)
  expect(shown(t120)).toMatch(/[MTWFS]{7}/)
  expect(shown(t60)).not.toMatch(/↻/)
  expect(shown(t60)).toMatch(/^7d [⠀-⣿·[\] ]+30%\s*5h [⠀-⣿·[\] ]+4%/)
  expect(shown(t60)).toMatch(/[MTWFS]{7}/)
  expect(shown(t45)).toMatch(/^7d 30%\s*5h 4%\s*cache/)
  expect(shown(t45)).not.toMatch(BRAILLE)
  expect(svgAlts(d120).filter(a => /limit by/.test(a))).toHaveLength(2)
  expect(shown(d120)).toMatch(/↻/)
  expect(svgAlts(d50).filter(a => /limit by/.test(a))).toHaveLength(2)
  expect(shown(d50)).not.toMatch(/↻/)
  expect(svgAlts(d40).filter(a => /limit by/.test(a))).toEqual([expect.stringMatching(/^weekly limit by day/)])
  expect(shown(d40)).toMatch(/5h 4%/)
})
test('a limit at 80% says why, in words', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/! 5h 82%/)
})
test('the last minute: the cache pill says why and the price', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/! 30s left · re-warm ~\$/)
})
test('context, which week does not show, says why near compaction', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).shut)).toMatch(/! context \d+% · compacts in ~/)
})
test('no limits: two rows still, and it says so', async ($, on) => {
  const { shut, open } = await at($, on, 'noLimits')
  expect(shown(shut)).toMatch(/^limits none reported/)
  expect(shown(open)).toMatch(/LIMITS\s*none reported/)
})
test('no history: the facts stay, and the empty text says so when open', async ($, on) => {
  const trees = await drawCases($, on, { layout: 'week', scenario: 'calm', appearance: 'dark', ttl: '1h' }, [T160, D160])
  expect(shown(trees[caseKey(T160, 'shut')])).toMatch(/7d 30%/)
  expect(shown(trees[caseKey(T160, 'open')])).toMatch(/LIMITS\s*7d 30% used[\s\S]*History fills in as you use Claude\./)
  expect(svgAlts(trees[caseKey(D160, 'open')]).filter(a => /limit by/.test(a))).toEqual([])
})
test('open: large day and hour cells, a summary per window, then the facts line', async ($, on) => {
  const { open } = await oneWithHistory($, on, D160)
  const t = shown(open)
  expect(t).toMatch(/7d 30% used · on pace for ~50% by \w{3} \d{2}:\d{2} · busiest \w{3}/)
  expect(t).toMatch(/5h 4% used · on pace for ~\d+% by \d{2}:\d{2}/)
  expect(t).toMatch(/CACHE\s*\S+\s*SPEND\s*\$2\.41 this session\s*CONTEXT\s*38%/)
  const days = svgsOf(open).filter(s => /^weekly limit by day/.test(String(s.props?.alt)))
  // Open, the days ahead show their guess.
  expect(days.map(s => String(s.props?.source)).some(source => /~10%/.test(source))).toBe(true)
})
test('open, an amber other limit leads LIMITS in its words', async ($, on) => {
  expect(shown((await at($, on, 'gatewaySpend')).open)).toMatch(/LIMITS\s*! spend 92%, resets in 5h 00m/)
})
test('open with history and short of rows, it still fits', LONG, async ($, on) => {
  const mounts = [6, 7, 8, 9, 10, 13].flatMap(maxRows => (['terminal', 'desktop'] as const).map((surface): Mount => ({ surface, cols: 120, maxRows })))
  const trees = await withHistory($, on, mounts)
  for (const m of mounts) {
    const key = caseKey(m, 'open')
    const tree = trees[key]
    const errors = tree === undefined
      ? ['missing: not drawn']
      : invariantErrors(tree, { layout: 'week', surface: m.surface, appearance: 'dark', cols: m.cols, maxRows: m.maxRows ?? DEFAULT_MAX_ROWS, scenario: 'unmeasured', glyphs: 'unicode', expanded: true })
    expect(`${key} ${errors.join('; ')}`).toBe(`${key} `)
  }
})
