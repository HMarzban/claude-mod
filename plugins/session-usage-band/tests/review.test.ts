import { test, expect, mock } from 'claude-code/testing'
import { PLUGIN, USAGE, base, firstRow, props, resp, respond, textOf, toasts, usage, widthOf } from './helpers'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }
const CLEAR = { reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as const
const MIN = 60_000

// ── the cost baseline ──────────────────────────────────────────────────

test('a ledger reset on /clear keeps the re-warm price right after the new conversation outspends the old', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // $2.41 when /clear runs
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)

  usage.current = { ...USAGE, cost: { usd: 0.59 } } // the engine reset the ledger
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  usage.current = { ...USAGE, cost: { usd: 3.0 } } // now past the old $2.41
  await respond(e => $.turn.step(e), resp(1_000, 112_000, 2_000, 1_000))
  await clock.advance(61 * MIN)

  // all $3.00 is this conversation's: 1.25 * 116k * 3.00 / 164.7k = 2.64
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$2\.64/ })).toBeDefined()
  await ui.unmount()
})

test('a session resumed or reloaded with spend on the ledger prices the re-warm from spend since', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 20 } }) // the ledger carries an earlier run's $20
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  usage.current = { ...USAGE, cost: { usd: 20.3 } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await clock.advance(61 * MIN)

  // $0.30 since start: 1.25 * 112k * 0.30 / 145k = 0.29
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.29/ })).toBeDefined()
  await ui.unmount()
})

// ── the row always fits ────────────────────────────────────────────────

const pacing = async (
  $: { session: { start: (e: never) => Promise<unknown>; measure: (e: never) => Promise<unknown> } },
  clock: { advance: (ms: number) => Promise<unknown> },
) => {
  const resetsAt = new Date(4 * 3600_000).toISOString()
  const at = (pct: number) => ({
    ...USAGE,
    context: { tokens: 120_000, window: 200_000, percent: 60 },
    rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }],
  })
  usage.current = at(40)
  await $.session.start(START as never)
  for (const [pct, wait] of [[40, 12 * MIN], [50, 0]] as const) {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] } as never)
    await clock.advance(wait)
  }
}

for (const cols of [60, 70, 84]) {
  test(`a 5h pill amber from its pace fits one row at ${cols} columns and keeps its warning`, async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.env(on, HOUR_1)
    base(on)
    await pacing($ as never, clock)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
    usage.current = { ...usage.current, cost: { usd: 2.83 } }
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(cols) })
    const row = firstRow(await ui.drawn())
    expect(widthOf(row)).toBeLessThanOrEqual(cols)
    expect(textOf(row)).toMatch(/50%.*~\d+[hm]/) // the pace warning survives
    expect(textOf(row)).toMatch(/\$2\.83/)
    await ui.unmount()
  })

  test(`an amber 5h pill fits beside an expiring cache at ${cols} columns`, async ($, on) => {
    const clock = mock.clock(on, { now: 0 })
    mock.env(on, HOUR_1)
    base(on, {
      ...USAGE,
      context: { tokens: 120_000, window: 200_000, percent: 60 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: new Date(4 * 3600_000).toISOString() }],
    })
    await $.session.start(START)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
    usage.current = { ...usage.current, cost: { usd: 2.83 } }
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(60 * MIN - 30_000)

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(cols) })
    const row = firstRow(await ui.drawn())
    expect(widthOf(row)).toBeLessThanOrEqual(cols)
    expect(textOf(row)).toMatch(/0:30/)
    expect(textOf(row)).toMatch(/85%!/)
    expect(textOf(row)).toMatch(/\$2\.83/)
    await ui.unmount()
  })
}

test('a 30-column band fits one row with cache and cost', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(30) })
  const row = firstRow(await ui.drawn())
  expect(widthOf(row)).toBeLessThanOrEqual(30)
  expect(textOf(row)).toMatch(/cache/)
  expect(textOf(row)).toMatch(/\$2\.41/)
  await ui.unmount()
})

// ── account-wide state survives /clear ─────────────────────────────────

test('/clear keeps the 5h pace and does not repeat its toast', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const resetsAt = new Date(3 * 3600_000).toISOString()
  const at = (pct: number) => ({ ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] })
  base(on, at(80))
  await $.session.start(START)
  const measure = async (pct: number) => {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
  }
  await measure(80)
  await clock.advance(12 * MIN)
  await measure(85)
  expect(toasts).toHaveLength(1)

  await $.session.end(CLEAR)
  await measure(85)
  expect(toasts).toHaveLength(1)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /85%! full in ~/ })).toBeDefined()
  await ui.unmount()
})

// ── other limit windows ────────────────────────────────────────────────

test('a gateway spend limit is listed in the expanded line', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * 3600_000).toISOString() }] })
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(textOf(await ui.drawn())).toMatch(/spend limit 92%, resets in 5h 00m/)
  await ui.unmount()
})
