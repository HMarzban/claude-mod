// tests/soak.test.ts — six hours in coarse ticks: what the band writes and
// redraws stays bounded.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { CLEAR, LONG, MIN, START, engine, mountBand, resp, respond, setup, shown, turn, usage, walk } from './helpers'

const HOUR = 60 * MIN
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
const nodes = (tree: unknown): number => { let n = 0; walk(tree, () => { n++ }); return n }
/** The limits rising with every turn, the 5h window rolling over every five hours. */
const rising = (i: number, now: number): void => {
  usage.current = { ...usage.current, rateLimits: [
    { kind: 'five_hour', percentUsed: Math.min(99, (now % (5 * HOUR)) / (5 * HOUR) * 60), resetsAt: new Date((Math.floor(now / (5 * HOUR)) + 1) * 5 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: 30 + i * 0.01, resetsAt: new Date(67 * HOUR).toISOString() },
  ] }
}

test('six hours, a thousand turns, three clears: writes, size and trees stay bounded', { timeoutMs: 180_000 }, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  let cost = 2.41
  let commands = 0
  for (let i = 0; i < 1000; i++) {
    rising(i, i * 21_600)
    await turn($, `t${i}`, cost, (cost += 0.01))
    await clock.advance(21_600) // 1,000 × 21.6 s = 6 h
    if (i % 333 === 332) await $.session.end(CLEAR)
    if (i % 167 === 0) { await run($, `layout ${LAYOUT_NAMES[(i / 167) % LAYOUT_NAMES.length]}`); commands++ }
  }
  const sampleWrites = engine.storeSets.filter(k => k === 'limitSamples').length
  await run($, 'layout pulse'); commands++
  const first = await mountBand($, 'desktop', 160)
  const before = nodes(await first.drawn())
  await first.unmount()
  for (let i = 1000; i < 1050; i++) { rising(i, i * 21_600); await turn($, `t${i}`, cost, (cost += 0.01)); await clock.advance(21_600) }
  const second = await mountBand($, 'desktop', 160)
  const after = nodes(await second.drawn())
  await second.unmount()
  expect(sampleWrites).toBeLessThanOrEqual(25) // 24 buckets in 6 h, and the first
  expect(engine.storeSets.filter(k => k === 'layout').length).toBe(commands)
  expect(JSON.stringify(engine.store).length).toBeLessThan(100_000)
  expect(after).toBe(before)
})

test('a calm ten-minute walk repaints once a minute, not once a second', LONG, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 120)
  await clock.settle()
  const before = engine.invalidates
  await clock.advance(10 * MIN)
  expect(engine.invalidates - before).toBeLessThanOrEqual(11)
  await ui.unmount()
})

test('with the cache cold, a reset countdown repaints as its minute turns', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'ledger' } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 120)
  // Cold at 60 minutes; the 5h window resets at 3 hours.
  await clock.advance(61 * MIN)
  expect(shown(await ui.drawn())).toMatch(/resets in 1h 59m/)
  await clock.advance(1000)
  expect(shown(await ui.drawn())).toMatch(/resets in 1h 58m/)
  await ui.unmount()
})
