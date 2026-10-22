// tests/soak.test.ts — six hours in coarse ticks: what the band writes and
// redraws stays bounded.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { MAX_SAMPLES } from '../hooks/memory'
import type { Sample } from '../hooks/memory'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { BUILD_155K, CLEAR, HOUR, LONG, MIN, START, engine, mountBand, nodeCount, respond, runCommand, setup, shown, svgAlts, turn, usage, usageAt, walk } from './helpers'

/** How pulse's 5h window chart's alt begins. */
const WINDOW_ALT = '5h window from start to reset'
/** What pulse draws on both surfaces: its shut trees' nodes and, open, its
 *  text and its charts' sources, which the cost or context trail past its cap
 *  would grow, and the charts' alts. */
const pulseSize = async ($: Engine) => {
  const size = { shutNodes: 0, text: 0, source: 0, alts: [] as string[] }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface, 160)
    size.shutNodes += nodeCount(await ui.drawn())
    await ui.press({ key: 'more' })
    const open = await ui.drawn()
    size.text += shown(open).length
    // The 5h window is drawn from its start to its reset, so its markup
    // follows the window's phase, not a trail's cap: left out of the sum.
    walk(open, n => { if (!String(n.props?.alt).startsWith(WINDOW_ALT)) size.source += String(n.props?.source ?? '').length })
    size.alts.push(...svgAlts(open))
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return size
}
/** The soak's tick: 1,000 of them are six hours. */
const TICK = 21_600
/** A week of samples stored before the soak starts: limitSamples at its cap. */
const STORED_WEEK: Sample[] = Array.from({ length: MAX_SAMPLES }, (_, i) => {
  const at = (i - MAX_SAMPLES) * 15 * MIN
  return { at, fivePct: 99.9, sevenPct: 99.9, fiveResetAt: at + 5 * HOUR, sevenResetAt: 0 }
})
/** The limits rising with every turn, the 5h window rolling over every five hours. */
const rising = (i: number, now: number): void => {
  usage.current = { ...usage.current, rateLimits: [
    { kind: 'five_hour', percentUsed: Math.min(99, (now % (5 * HOUR)) / (5 * HOUR) * 60), resetsAt: new Date((Math.floor(now / (5 * HOUR)) + 1) * 5 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: 30 + i * 0.01, resetsAt: new Date(67 * HOUR).toISOString() },
  ] }
}

test('six hours, a thousand turns, three clears: writes, size and trees stay bounded', { timeoutMs: 180_000 }, async ($, on) => {
  const clock = setup(on, { store: { limitSamples: STORED_WEEK } })
  await $.session.start(START)
  await respond($, BUILD_155K)
  let cost = 2.41
  /** Turn `i`, measured after it as the engine measures every main-loop turn, then a tick on. */
  const turnAt = async (i: number): Promise<void> => {
    rising(i, i * TICK)
    await turn($, `t${i}`, cost, (cost += 0.01))
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: ['rateLimits'] })
    await clock.advance(TICK)
  }
  let commands = 0
  for (let i = 0; i < 1000; i++) {
    await turnAt(i)
    // The clears fall early in each third, so every trail is at its cap well before the end.
    if (i % 333 === 100) await $.session.end(CLEAR)
    if (i % 167 === 0) { await runCommand($, `layout ${LAYOUT_NAMES[(i / 167) % LAYOUT_NAMES.length]}`); commands++ }
  }
  const sampleWrites = engine.storeSets.filter(k => k === 'limitSamples').length
  await runCommand($, 'layout pulse'); commands++
  const before = await pulseSize($)
  for (let i = 1000; i < 1050; i++) await turnAt(i)
  const after = await pulseSize($)
  // Once per 15 minutes: 24 buckets in 6 h, and the first.
  expect(sampleWrites).toBeGreaterThanOrEqual(20)
  expect(sampleWrites).toBeLessThanOrEqual(25)
  expect(engine.storeSets.filter(k => k === 'layout').length).toBe(commands)
  // The stored week stays at its cap: each new bucket evicts the oldest.
  const samples = engine.store.limitSamples as Sample[]
  const added = samples.filter(x => x.at >= 0).length
  expect(samples).toHaveLength(MAX_SAMPLES)
  expect(added).toBeGreaterThanOrEqual(20)
  expect(samples[0]).toEqual(STORED_WEEK[added])
  expect(JSON.stringify(engine.store).length).toBeLessThan(100_000)
  // The cost and context trails at their caps: 50 more turns draw no more, give or
  // take the figures' widths. The 5h trail is windowed when drawn, so no tree shows
  // its cap; history.test.ts holds that bound.
  expect(after.shutNodes).toBe(before.shutNodes)
  expect(after.text).toBeLessThanOrEqual(1.05 * before.text)
  expect(after.source).toBeLessThanOrEqual(1.05 * before.source)
  // The measures fed the 5h window the whole way.
  expect(after.alts.some(alt => alt.startsWith(WINDOW_ALT))).toBe(true)
})

test('a calm ten-minute walk repaints once a minute, not once a second', LONG, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'terminal', 120)
  await clock.settle()
  const before = engine.invalidates
  await clock.advance(10 * MIN)
  // Ten minute turns: about ten repaints, never one a second, and never none.
  expect(engine.invalidates - before).toBeGreaterThanOrEqual(9)
  expect(engine.invalidates - before).toBeLessThanOrEqual(11)
  await ui.unmount()
})

test('with the cache cold, a reset countdown repaints as its minute turns', LONG, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'terminal', 200)
  // Cold at 60 minutes; the 5h window resets at 3 hours.
  await clock.advance(61 * MIN)
  expect(shown(await ui.drawn())).toMatch(/↻ 1h 59m/)
  await clock.advance(1000)
  expect(shown(await ui.drawn())).toMatch(/↻ 1h 58m/)
  await ui.unmount()
})

test("a reset off the minute repaints as its own minute turns, not the clock's", LONG, async ($, on) => {
  const clock = setup(on)
  // The 5h window resets half a minute past 3 hours.
  usage.current = usageAt(30_000)
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'terminal', 200)
  await clock.advance(61 * MIN)
  expect(shown(await ui.drawn())).toMatch(/↻ 1h 59m/)
  await clock.advance(31_000)
  expect(shown(await ui.drawn())).toMatch(/↻ 1h 58m/)
  await ui.unmount()
})
