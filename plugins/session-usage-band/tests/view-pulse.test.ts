// Pulse, trends rather than totals: each message's cost as bars, the 5h
// trail and its pace, how the charts give way, and the four sections behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { DARK } from '../hooks/palette'
import { CLEAR, HOUR, LONG, MIN, START, USAGE, breakdown, mountBand, pacing, resp, respond, setup, shown, svgAlts, svgsOf, usage } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('pulse')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'pulse', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** One main-loop message with a request in it, the ledger moving from `from` to `to`. */
const message = async ($: Engine, id: string, from: number, to: number) => {
  usage.current = { ...usage.current, cost: { usd: from } }
  await $.turn.start({ text: 'hi', turnId: id })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  usage.current = { ...usage.current, cost: { usd: to } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
}
/** A calm 5h trail, 4% then 6% twenty minutes on, then twenty messages' costs. */
const calmTrend = async ($: Engine, on: On) => {
  const clock = setup(on, { store: { layout: 'pulse' } })
  await $.session.start(START)
  for (const [pct, wait] of [[4, 20 * MIN], [6, 0]] as const) {
    usage.current = { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt: new Date(3 * HOUR).toISOString() }, ...USAGE.rateLimits.slice(1)] }
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
    await clock.advance(wait)
  }
  for (let i = 0; i < 20; i++) await message($, `t${i}`, 2.41 + i * 0.2, 2.41 + (i + 1) * 0.2)
}

test('the cost bars sit beside their numbers', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fullHistory')).shut)).toMatch(/[⠀-⣿]+.*last \$\S+/)
})
test("no history yet says so, in the band's words", async ($, on) => {
  expect(shown((await at($, on, 'emptyHistory')).open)).toMatch(/Costs show after Claude's next reply\./)
})
test('the desktop draws the cost bars as an Svg with alt text, the newest in value', LONG, async ($, on) => {
  const bars = svgsOf((await at($, on, 'fullHistory', D160)).shut).find(n => /cost of the last/.test(String(n.props?.alt)))
  const fills = [...String(bars?.props?.source).matchAll(/fill="([^"]+)"/g)].map(m => m[1])
  expect(fills.at(-1)).toBe(DARK.value)
  expect(fills.slice(0, -1).every(fill => fill === DARK.meterFill)).toBe(true)
})
test('the desktop draws the 5h trail, amber and projected when the pace fills it', LONG, async ($, on) => {
  const trail = svgsOf((await at($, on, 'fiveHourAhead', D160)).shut).find(n => /5h usage over the last hour/.test(String(n.props?.alt)))
  expect(String(trail?.props?.source)).toMatch(/stroke-dasharray/)
})
test('the amber 5h projection climbs from now to where the window lands', LONG, async ($, on) => {
  const trail = svgsOf((await at($, on, 'fiveHourAhead', D160)).shut).find(n => /5h usage/.test(String(n.props?.alt)))
  const [, from, to] = String(trail?.props?.source).match(/<line [^>]*y1="([\d.]+)"[^>]*y2="([\d.]+)"/) ?? []
  expect(Number(from)).toBeGreaterThan(Number(to))
})
test('calm gives way in spec order: context, 7d, the reset, bars 14 to 8, the trail, the bars, the cost words, then the pace', LONG, async ($, on) => {
  await calmTrend($, on)
  /** The collapsed line at `cols` on the desktop: its words, and its charts' alts. */
  const shutAt = async (cols: number) => {
    const ui = await mountBand($, 'desktop', cols)
    const tree = await ui.drawn()
    await ui.unmount()
    return { text: shown(tree), alts: svgAlts(tree).join(' / ') }
  }
  // Each width sits inside its step's band, not at its edge.
  const whole = await shutAt(150)
  const noContext = await shutAt(124)
  const noSeven = await shutAt(116)
  const noReset = await shutAt(108)
  const fewBars = await shutAt(100)
  const noTrail = await shutAt(93)
  const noBars = await shutAt(84)
  const shortCosts = await shutAt(68)
  const noPace = await shutAt(45)
  expect(whole.text).toMatch(/↻ in 2h 40m\s*context 38%\s*·\s*7d 30%/)
  expect(whole.alts).toMatch(/cost of the last 14 messages.*5h usage over the last hour/)
  expect(noContext.text).toMatch(/↻ in 2h 40m\s*7d 30%/)
  expect(noContext.text).not.toMatch(/context/)
  expect(noSeven.text).toMatch(/↻ in 2h 40m/)
  expect(noSeven.text).not.toMatch(/7d/)
  expect(noReset.text).not.toMatch(/↻/)
  expect(noReset.alts).toMatch(/cost of the last 14 messages/)
  expect(fewBars.alts).toMatch(/cost of the last 8 messages.*5h usage/)
  expect(noTrail.alts).toMatch(/cost of the last 8 messages/)
  expect(noTrail.alts).not.toMatch(/5h usage/)
  expect(noBars.alts).not.toMatch(/cost of/)
  expect(noBars.text).toMatch(/last \$0\.20 · avg \$0\.20/)
  expect(shortCosts.text).toMatch(/last \$0\.20\s*5h 6% · on pace for ~\d+%/)
  expect(shortCosts.text).not.toMatch(/avg/)
  expect(noPace.text).toMatch(/5h 6%/)
  expect(noPace.text).not.toMatch(/on pace/)
})
test('open: the cache first, then spend, context and limits', async ($, on) => {
  const t = shown((await at($, on, 'fullHistory')).open)
  const at4 = ['CACHE', 'SPEND', 'CONTEXT', 'LIMITS'].map(title => t.indexOf(title))
  expect(at4.every((i, n) => i >= 0 && (n === 0 || i > (at4[n - 1] ?? 0)))).toBe(true)
  expect(t).toMatch(/last \$0\.20 · avg \$0\.20 · max \$0\.20/)
})
test('open, the 5h chart draws the window so far and says so', LONG, async ($, on) => {
  const alts = svgAlts((await at($, on, 'fiveHourAhead', D160)).open)
  expect(alts.some(a => /^5h usage this window, \w+, full in /.test(a))).toBe(true)
})
test('open, the context chart runs to the window, a rule where it compacts', LONG, async ($, on) => {
  setup(on, { store: { layout: 'pulse' } })
  await $.session.start(START)
  const context = { ...USAGE.context, breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }) }
  usage.current = { ...USAGE, context }
  await $.session.measure({ context, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })
  for (const id of ['t1', 't2']) await message($, id, 2.41, 2.62)
  const ui = await mountBand($, 'desktop', 160)
  await ui.press({ key: 'more' })
  const chart = svgsOf(await ui.drawn()).find(n => /^context over the conversation, \w+, compacts at 160k$/.test(String(n.props?.alt)))
  await ui.unmount()
  // 160k of a 200k window: 80% of the way up a 40 px chart, 2 px in from each edge.
  expect(String(chart?.props?.source)).toMatch(/<line class="level" [^>]*y1="9\.2"/)
})
test('in ascii the charts give way to numbers', LONG, async ($, on) => {
  const trees = await drawCases($, on, { layout: 'pulse', scenario: 'fullHistory', appearance: 'dark', env: { CC_BAND_GLYPHS: 'ascii' } }, [T160])
  const t = shown(trees[caseKey(T160, 'shut')])
  expect(t).toMatch(/last \$\S+ - avg \$\S+/)
  expect(t).not.toMatch(/[⠀-⣿]/)
})
test('a message after the cache went cold is marked a re-warm', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' }, env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.session.start(START)
  await message($, 't1', 2.41, 2.62)
  await clock.advance(6 * MIN)
  await message($, 't2', 2.62, 3.1)
  const ui = await mountBand($, 'desktop', 160)
  expect(svgAlts(await ui.drawn()).some(a => /the newest a re-warm/.test(a))).toBe(true)
  await ui.unmount()
})
test('/clear empties the costs and keeps the 5h trail', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' } })
  await pacing($, clock)
  await message($, 't1', 2.41, 2.62)
  await $.session.end(CLEAR)
  const ui = await mountBand($, 'terminal', 160)
  expect(shown(await ui.drawn())).toMatch(/[⠀-⣿]+\s*! 5h/)
  await ui.press({ key: 'more' })
  expect(shown(await ui.drawn())).toMatch(/Costs show after Claude's next reply\./)
  await ui.unmount()
})
