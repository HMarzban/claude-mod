// Demo capture, not a test: the band's real desktop output, for the film (every
// minute of the hour, then the last minute in seconds), the site's live band,
// its states and the layouts gallery.
// tools/demos/build.sh copies this into the plugin's tests/ only while it runs.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LAYOUT_NAMES, type LayoutName } from '../hooks/snapshot'
import { caseKey, drawCases, type Mount, type ScenarioName, type Ttl } from './cases'
import { LONG, MIN, START, breakdown, mountBand, resp, respond, setup, usage, FRESH, HOUR_1 } from './helpers'

const LIMITS = [
  { kind: 'five_hour' as const, percentUsed: 55, resetsAt: new Date(3 * 60 * MIN).toISOString() },
  { kind: 'seven_day' as const, percentUsed: 70, resetsAt: new Date(3 * 24 * 60 * MIN).toISOString() },
]

/** A session that has spent $162 before its last reply, which cost $1.70. */
async function session($: Engine, on: On) {
  const clock = setup(on, { usage: { ...FRESH, cost: { usd: 162.0 }, rateLimits: LIMITS }, env: { ...HOUR_1, CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' } })
  await $.session.start({ ...START, surface: 'desktop' })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(2_000, 0, 336_000, 3_000))
  usage.current = { ...usage.current, cost: { usd: 163.7 }, context: { tokens: 341_000, window: 1_000_000, percent: 35 }, rateLimits: LIMITS }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  return { clock, ui: await mountBand($, 'desktop', 94, { maxRows: 13 }) }
}

test('capture: the film', { timeoutMs: 120_000 }, async ($, on) => {
  const { clock, ui } = await session($, on)
  const snap = async (name: string) => console.log('FILM ' + name + ' ' + JSON.stringify(await ui.drawn()))
  await clock.settle(); await snap('s0')
  for (let m = 1; m <= 59; m++) { await clock.advance(MIN - (m === 59 ? 1_000 : 0)); await snap(`s${m * 60 - (m === 59 ? 1 : 0)}`) }
  for (let s = 3545; s < 3600; s += 4) { await clock.advance(4_000); await snap(`s${s}`) }
  await clock.advance(10_000); await snap('cold')
  await ui.press({ key: 'more' }); await snap('cards')
  expect(1).toBe(1)
  await ui.unmount()
})

test('capture: the live band', { timeoutMs: 120_000 }, async ($, on) => {
  const { clock, ui } = await session($, on)
  const snap = async (name: string) => console.log('LIVE ' + name + ' ' + JSON.stringify(await ui.drawn()))
  await clock.advance(59 * MIN + 13_000); await snap('amber')
  await ui.press({ key: 'more' }); await snap('amberOpen')
  await ui.press({ key: 'collapse' })
  await clock.advance(60_000); await snap('cold')
  await ui.press({ key: 'more' }); await snap('coldOpen')
  expect(1).toBe(1)
  await ui.unmount()
})

// ---- the band's states, for the site's state switcher and the README gallery ----

type Shape = { five?: number; week?: number; tokens?: number; threshold?: number; pace?: boolean }

/** One session in a given shape, its last reply just in, drawn collapsed and open. */
async function state($: Engine, on: On, name: string, shape: Shape) {
  const fiveAt = new Date(4 * 60 * MIN).toISOString(), weekAt = new Date(3 * 24 * 60 * MIN).toISOString()
  const limits = (five: number) => [
    { kind: 'five_hour' as const, percentUsed: five, resetsAt: fiveAt },
    { kind: 'seven_day' as const, percentUsed: shape.week ?? 40, resetsAt: weekAt },
  ]
  const tokens = shape.tokens ?? 341_000
  const context = { tokens, window: 1_000_000, percent: Math.round(tokens / 10_000) }
  const clock = setup(on, { usage: { ...FRESH, cost: { usd: 162.0 }, context, rateLimits: limits(shape.pace ? 40 : shape.five ?? 30) }, env: { ...HOUR_1, CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' } })
  await $.session.start({ ...START, surface: 'desktop' })
  if (shape.pace) {
    // ten points in twelve minutes: the pace would fill the window before it resets
    const measure = async (five: number) => {
      usage.current = { ...usage.current, rateLimits: limits(five) }
      await $.session.measure({ context, rateLimits: usage.current.rateLimits, cost: usage.current.cost, changed: [] })
    }
    await measure(40); await clock.advance(12 * MIN); await measure(50)
  }
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(2_000, 0, Math.max(10_000, tokens - 5_000), 3_000))
  const ctx = shape.threshold
    ? { ...context, breakdown: breakdown({ autoCompactThreshold: shape.threshold, isAutoCompactEnabled: true }) }
    : context
  usage.current = { ...usage.current, cost: { usd: 163.7 }, context: ctx, rateLimits: limits(shape.pace ? 50 : shape.five ?? 30) }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await $.session.measure({ context: ctx, rateLimits: usage.current.rateLimits, cost: usage.current.cost, changed: [] })
  await clock.settle()
  const ui = await mountBand($, 'desktop', 94, { maxRows: 13 })
  console.log('STATE ' + name + ' ' + JSON.stringify(await ui.drawn()))
  await ui.press({ key: 'more' })
  console.log('STATE ' + name + 'Open ' + JSON.stringify(await ui.drawn()))
  expect(1).toBe(1)
  await ui.unmount()
}

test('capture: calm', async ($, on) => state($, on, 'calm', {}))
test('capture: near compaction', async ($, on) => state($, on, 'compact', { tokens: 880_000, threshold: 957_000 }))
test('capture: fast pace', async ($, on) => state($, on, 'pace', { pace: true }))
test('capture: weekly limit', async ($, on) => state($, on, 'week', { week: 83 }))
test('capture: everything at once', async ($, on) => state($, on, 'all', { tokens: 880_000, threshold: 957_000, pace: true, week: 83 }))

// ---- every layout, calm and in the cache's last minute, for the layouts gallery ----

const DEMO: Mount = { surface: 'desktop', cols: 94, maxRows: 13 }

/** One layout in one of the suite's scenarios, drawn collapsed and open. */
async function layoutState($: Engine, on: On, name: string, layout: LayoutName, scenario: ScenarioName, ttl: Ttl) {
  const trees = await drawCases($, on, { layout, scenario, appearance: 'dark', ttl }, [DEMO])
  console.log('STATE ' + name + ' ' + JSON.stringify(trees[caseKey(DEMO, 'shut')]))
  console.log('STATE ' + name + 'Open ' + JSON.stringify(trees[caseKey(DEMO, 'open')]))
  expect(1).toBe(1)
}

for (const layout of LAYOUT_NAMES) {
  test(`capture: the ${layout} layout`, async ($, on) => layoutState($, on, `layout-${layout}`, layout, 'calm', '1h'))
  test(`capture: the ${layout} layout, amber`, LONG, async ($, on) => layoutState($, on, `layout-${layout}-amber`, layout, 'lastMinute', '5m'))
}
