// Demo capture, not a test: the band's real desktop output, for the film (every
// minute of the hour, then the last minute in seconds), the site's live band,
// its states, and every layout for the site's layouts section and gallery.
// tools/demos/build.sh copies this into the plugin's tests/ only while it runs.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LAYOUT_NAMES, type LayoutName } from '../hooks/snapshot'
import { MIN, START, breakdown, mountBand, resp, respond, setup, usage, FRESH, HOUR_1 } from './helpers'

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

// ---- every layout in a session some way in, for the site and the layouts gallery ----

/** A sample as the band stores one: both limits at `at`, with the resets that name their windows. */
const sample = (at: number, five: number, seven: number, fiveResetAt: number, sevenResetAt: number) => ({ at, fivePct: five, sevenPct: seven, fiveResetAt, sevenResetAt })

/** A session some way in: four days of the weekly limit and the 5-hour
 *  window's first hour in the store, as earlier sessions left them, then
 *  sixteen replies, each priced as Claude Code's ledger prices them: Opus
 *  5.5's $4 input, writes at 1.25×, reads at 0.05×, output at 5×. Drawn
 *  calm after the last reply, then in the cache's last minute, each
 *  collapsed and open. */
async function livedIn($: Engine, on: On, layout: LayoutName) {
  // Sixteen replies five minutes apart, from 10:00 UTC, with these outputs.
  const OUTS = [4_000, 9_000, 2_500, 14_000, 6_000, 3_000, 22_000, 5_000, 8_000, 2_000, 11_000, 4_500, 16_000, 3_500, 7_000, 9_500]
  const N = OUTS.length, GAP = 5 * MIN, T0 = 10 * 60 * MIN, END = T0 + (N - 1) * GAP
  const fiveAt = END + 150 * MIN, sevenAt = END + 67 * 60 * MIN
  const limits = (five: number, seven: number) => [
    { kind: 'five_hour' as const, percentUsed: five, resetsAt: new Date(fiveAt).toISOString() },
    { kind: 'seven_day' as const, percentUsed: seven, resetsAt: new Date(sevenAt).toISOString() },
  ]
  // The weekly limit over the four days before: [hours before the session, %].
  const days: Array<[number, number]> = [[99, 1], [94, 4], [90, 7], [84, 8], [75, 8], [70, 12], [66, 16], [62, 19], [56, 20], [50, 20], [46, 22], [42, 24], [36, 25], [28, 25], [22, 29], [18, 33], [14, 36], [8, 37]]
  const stored = [
    ...days.map(([h, seven]) => sample(T0 - h * 60 * MIN, 50, seven, T0 - h * 60 * MIN + 3 * 60 * MIN, sevenAt)),
    // the 5-hour window's readings before the session opened
    ...([[60, 5, 37], [40, 9, 38], [20, 13, 38], [5, 15, 38]] as const).map(([m, five, seven]) => sample(T0 - m * MIN, five, seven, fiveAt, sevenAt)),
  ]
  const clock = setup(on, {
    usage: { startedAt: T0, context: { tokens: 0, window: 1_000_000, percent: 0 }, rateLimits: limits(15, 38), cost: { usd: 0 } },
    store: { layout, limitSamples: stored },
    env: { ...HOUR_1, CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' },
    now: T0,
  })
  await $.session.start({ ...START, surface: 'desktop' })
  const RATE = 4 / 1e6
  let usd = 0, context = 0
  for (const [i, out] of OUTS.entries()) {
    const write = i === 0 ? 90_000 : 6_000 + out
    const read = context
    usage.current = { ...usage.current, cost: { usd } }
    await $.turn.start({ text: 'hi', turnId: `t${i}` })
    await respond(e => $.turn.step(e), resp(2_000, read, write, out))
    usd += RATE * (2_000 + 1.25 * write + 0.05 * read + 5 * out)
    context = read + write
    const five = Math.round(16 + (11 * i) / (N - 1)), seven = 38 + Math.floor((3 * i) / (N - 1))
    const ctx = { tokens: context, window: 1_000_000, percent: Math.round(context / 10_000) }
    usage.current = { ...usage.current, cost: { usd }, context: ctx, rateLimits: limits(five, seven) }
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: `t${i}`, reason: 'answer' })
    await $.session.measure({ context: ctx, rateLimits: usage.current.rateLimits, cost: usage.current.cost, changed: [] })
    if (i < N - 1) await clock.advance(GAP)
  }
  await clock.settle()
  const draw = async (name: string) => {
    const ui = await mountBand($, 'desktop', 94, { maxRows: 13 })
    console.log('STATE ' + name + ' ' + JSON.stringify(await ui.drawn()))
    await ui.press({ key: 'more' })
    console.log('STATE ' + name + 'Open ' + JSON.stringify(await ui.drawn()))
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  await draw(`layout-${layout}`)
  await clock.advance(60 * MIN - 30_000)
  await draw(`layout-${layout}-amber`)
  expect(1).toBe(1)
}

for (const layout of LAYOUT_NAMES) {
  test(`capture: the ${layout} layout, some way in`, { timeoutMs: 120_000 }, async ($, on) => livedIn($, on, layout))
}
