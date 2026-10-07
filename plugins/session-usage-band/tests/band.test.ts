import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  FRESH,
  PLUGIN,
  type Node,
  USAGE,
  base,
  inAgent,
  props,
  resp,
  respond,
  rowCount,
  textOf,
  toasts,
  usage,
  walk,
} from './helpers'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }

/** The unexpected-rebuild count in the expanded line, 0 when it's absent. */
const rebuilds = (tree: unknown): number => {
  const m = textOf(tree).match(/(\d+) unexpected rebuild/)
  return m ? Number(m[1]) : 0
}

/** Text meters drawn: six cells of █ and ░. An empty meter's inner track
 *  Text is six cells too, so it's excluded by its track colour. */
const METER = /^[█░]{6}$/
const textMeters = async (ui: { findAll: (q: { type: string; text: RegExp }) => Promise<Array<{ props?: Record<string, unknown> }>> }) =>
  (await ui.findAll({ type: 'Text', text: METER })).filter(t => t.props?.color !== DARK.meterTrack).length

const turn = async (
  $: { turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> } },
  id: string,
  from: number,
  to: number,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  usage.current = { ...usage.current, cost: { usd: from } }
  if (!('agentId' in extra)) await $.turn.start({ text: 'hi', turnId: id } as never)
  usage.current = { ...usage.current, cost: { usd: to } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer', ...extra } as never)
}

// ── the collapsed row ──────────────────────────────────────────────────

test('the collapsed band is one row', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /4%/ })).toBeDefined()
  await ui.unmount()
})

test('pills carry their own foreground and background, never one of each', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let pills = 0
  walk(await ui.drawn(), n => {
    const bg = n.props?.backgroundColor
    if (typeof bg !== 'string') return
    pills += 1
    expect(bg.startsWith('#')).toBe(true)
    walk(n, t => {
      if (t.type === 'Text' && typeof t.props?.color === 'string') expect(t.props.color.startsWith('#')).toBe(true)
    })
  })
  expect(pills).toBeGreaterThan(2)
  await ui.unmount()
})

test('CC_BAND_APPEARANCE=plain drops every background for theme keys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let backgrounds = 0
  walk(await ui.drawn(), n => {
    if (n.props?.backgroundColor !== undefined) backgrounds += 1
  })
  expect(backgrounds).toBe(0)
  expect(await ui.find({ type: 'Text', text: /\[/ })).toBeDefined()
  await ui.unmount()
})

test('before the first response the band says warming rather than a false zero', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, FRESH)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\b0%/ })).toBeUndefined()
  await ui.unmount()
})

test('the calm band uses no amber', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  walk(await ui.drawn(), n => {
    expect(n.props?.color).not.toBe(DARK.amberFg)
    expect(n.props?.backgroundColor).not.toBe(DARK.amberBg)
  })
  await ui.unmount()
})

// ── the cache pill ─────────────────────────────────────────────────────

test('the countdown is still while warm, then names the stakes in its last minute', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /re-warm/ })).toBeUndefined()

  await clock.advance(15_000)
  expect(await ui.find({ type: 'Text', text: /cache 59m/ })).toBeDefined()

  await clock.advance(60 * 60_000 - 45_000) // 30s left
  const soon = await ui.find({ type: 'Text', text: /0:30 left · re-warm ~\$/ })
  expect(soon).toBeDefined()
  expect(soon?.props?.color).toBe(DARK.amberFg)

  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold · next message ~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a cold cache is neutral, never amber or red', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))
  await clock.advance(10 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cold = await ui.find({ type: 'Text', text: /cache cold/ })
  expect(cold).toBeDefined()
  expect(cold?.props?.color).not.toBe(DARK.amberFg)
  expect(cold?.props?.color).not.toBe('error')
  await ui.unmount()
})

test("while a turn runs, 'cache warm' replaces the calm countdown", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110, true) })
  expect(await ui.find({ type: 'Text', text: /^cache warm$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache 1h/ })).toBeUndefined()

  await clock.advance(60 * 60_000 - 30_000) // a tool call outlasting the TTL
  expect(await ui.find({ type: 'Text', text: /0:30 left/ })).toBeDefined()
  await ui.unmount()
})

test('the re-warm estimate appears only where it is actionable', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await clock.advance(60 * 60_000 - 40_000)
  expect(await ui.find({ type: 'Text', text: /re-warm ~\$/ })).toBeDefined()
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold .*~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a narrow band shortens the wording but keeps the money', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(60 * 60_000 - 40_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(64) })
  const pill = await ui.find({ type: 'Text', text: /~\$/ })
  expect(pill).toBeDefined()
  expect(pill?.text).not.toMatch(/re-warm/)
  await ui.unmount()
})

test('with nothing billed yet the cold pill names the tokens instead', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache cold · next message 112k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await ui.unmount()
})

// ── the cache model through the band ───────────────────────────────────

test('an assumed hour is corrected to 5m when a gap past 5m rebuilt the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, {})
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(12 * 60_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(textOf(tree)).toMatch(/cache lifetime 5m(?! \(assumed\))/)
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test('a prefix the cache should have served but did not is an unexpected rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(1)
  await ui.unmount()
})

test('a warm follow-up to a long answer is not a rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 5_000))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(300, 80_000, 7_000, 400))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(textOf(tree)).toMatch(/cache lifetime 1h/)
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test("a subagent's steps leave the main countdown and window alone", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } }) // no ledger: the pill names the window in tokens
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await clock.advance(50 * 60_000)
  await respond(inAgent(e => $.turn.step(e)), resp(500, 0, 12_000, 800))
  await clock.advance(9 * 60_000 + 30_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /0:30 left · re-warm 153k tokens/ })).toBeDefined()
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(0)
  await ui.unmount()
})

test("a subagent's tokens still count toward the rate the re-warm is solved from", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(inAgent(e => $.turn.step(e)), resp(3_000, 20_000, 10_000, 4_000))
  await clock.advance(61 * 60_000)

  // weighted = 13k + 1.25*110k + 0.1*20k + 5*6k = 182.5k; 1.25*112k*2.41/182.5k = 1.85
  // (without the subagent's tokens it would be 2.33)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.85/ })).toBeDefined()
  await ui.unmount()
})

test("the re-warm estimate is solved from every response's tokens", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  await respond(e => $.turn.step(e), resp(1_000, 110_000, 2_000, 1_000))
  await clock.advance(61 * 60_000)

  // weighted = 15k + 1.25*108k + 0.1*210k + 5*6k = 201k; 1.25*114k*2.41/201k = 1.71
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.71/ })).toBeDefined()
  await ui.unmount()
})

// ── cost, context and limits ───────────────────────────────────────────

test("last turn's cost follows the main turn and ignores subagents'", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()

  await turn($, 't1', 2.0, 2.41)
  expect(await ui.find({ type: 'Text', text: /last \$0\.41/ })).toBeDefined()

  await turn($, 't2', 2.41, 3.0, { agentId: 'agent-1' })
  expect(await ui.find({ type: 'Text', text: /last \$0\.41/ })).toBeDefined()

  await turn($, 't3', 3.0, 3.5, { isAborted: true, reason: 'aborted' })
  expect(await ui.find({ type: 'Text', text: /last \$0\.50/ })).toBeDefined()
  await ui.unmount()
})

test("no cost ledger hides last turn's cost", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { startedAt: 0, context: { window: 200_000 }, rateLimits: [] })
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()
  await ui.unmount()
})

test('context and 5h escalate to amber at 80% and mark 95%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, {
    ...USAGE,
    context: { tokens: 164_000, window: 200_000, percent: 82 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 96, resetsAt: new Date(3600_000).toISOString() }],
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const ctx = await ui.find({ type: 'Text', text: /82%!$/ })
  expect(ctx?.props?.color).toBe(DARK.amberFg)
  const five = await ui.find({ type: 'Text', text: /96%!!/ })
  expect(five?.props?.color).toBe(DARK.amberFg)
  await ui.unmount()
})

test('the 5h pill shows your pace once there is enough evidence, and drops it when stale', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const resetsAt = new Date(3 * 3600_000).toISOString()
  const at = (pct: number) => ({ ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] })
  base(on, at(40))
  await $.session.start(START)
  const measure = async (pct: number) => {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
  }
  await measure(40)
  await clock.advance(12 * 60_000)
  await measure(46)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const five = await ui.find({ type: 'Text', text: /full in ~1h 45m/ })
  expect(five).toBeDefined()
  expect(five?.props?.color).toBe(DARK.amberFg)

  await clock.advance(16 * 60_000)
  expect(await ui.find({ type: 'Text', text: /full in/ })).toBeUndefined()
  await ui.unmount()
})

test('toasts fire once per threshold crossing and re-arm below 75%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const at = async (percent: number) =>
    $.session.measure({ context: { window: 200_000, percent }, rateLimits: [], changed: [] })

  await at(82)
  await at(84)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/Context is 82% full/)
  await at(96)
  expect(toasts).toHaveLength(2)
  await at(70)
  await at(81)
  expect(toasts).toHaveLength(3)
})

test('no rate limits: the band draws without the 5h pill or limit facts', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [] })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
  await ui.press({ key: 'more' })
  const text = textOf(await ui.drawn())
  expect(text).toMatch(/cache lifetime/)
  expect(text).not.toMatch(/limit|resets in/)
  await ui.unmount()
})

// ── width ──────────────────────────────────────────────────────────────

test('narrow widths drop pills in priority order', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const at = async (cols: number) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(cols) })

  let ui = await at(110)
  expect(await textMeters(ui)).toBe(2)
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeDefined()
  await ui.unmount()

  ui = await at(90) // the 5h pill goes first
  expect(await textMeters(ui)).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
  await ui.unmount()

  ui = await at(75) // then the context meter, keeping its %
  expect(await textMeters(ui)).toBe(0)
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeDefined()
  await ui.unmount()

  ui = await at(60) // then last $x; cache and cost stay
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
  await ui.unmount()
})

test('an escalated 5h pill never drops', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }] })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(70) })
  expect(await ui.find({ type: 'Text', text: /85%!/ })).toBeDefined()
  await ui.unmount()
})

test('a very narrow band still draws one row with cache and cost', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(30) })
  expect(rowCount(await ui.drawn())).toBe(1)
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

// ── expanded line, commands, sites ─────────────────────────────────────

test('⋯ toggles the expanded line, and Hide hides the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(2)
  const text = textOf(await ui.drawn())
  expect(text).toMatch(/of input served from cache/)
  expect(text).toMatch(/cache lifetime 1h/)
  expect(text).toMatch(/7d limit 30%, resets in 2d 19h/)
  expect(text).toMatch(/5h limit 4%, resets in 3h 00m/)
  expect(text).toMatch(/1 model call\b/)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

test('/usage-band more, less, hide and show drive the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const run = (args: string): Promise<unknown> =>
    $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })

  await run('more')
  expect(textOf(await ui.drawn())).toMatch(/cache lifetime/)
  await run('less')
  expect(textOf(await ui.drawn())).not.toMatch(/cache lifetime/)
  await run('hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await run('show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props(110), hasSurvey: true },
  })
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeUndefined()
  await ui.unmount()
})

test('the band draws on every surface that renders', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(110) })
    expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
    await ui.unmount()
  }
})

// ── desktop meters ─────────────────────────────────────────────────────

test('desktop draws SVG meters; the terminal and plain draw text ones', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  const svgs = await desk.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(2)
  expect(svgs[0]?.props?.width).toBe(44)
  expect(svgs[0]?.props?.height).toBe(6)
  expect(svgs[0]?.props?.alt).toBe('38%')
  expect(String(svgs[0]?.props?.source)).toContain(DARK.meterTrack)
  expect(await textMeters(desk)).toBe(0)
  await desk.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await term.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await textMeters(term)).toBe(2)
  await term.unmount()
})

test('plain appearance keeps text meters on desktop', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  await ui.unmount()
})

// ── hover explanations ─────────────────────────────────────────────────

/** Each pill's hidden card: [pill key, card] pairs from the first row. */
const cards = (tree: unknown): Array<[string, Node]> => {
  const out: Array<[string, Node]> = []
  walk(tree, n => {
    for (const k of n.children ?? []) {
      const child = k as Node
      if (child?.props?.position === 'absolute') out.push([String(n.props?.key), child])
    }
  })
  return out
}

test('every pill explains itself on hover, inside its own hover scope', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  const found = cards(await ui.drawn())
  expect(found.map(([key]) => key).join(',')).toBe('cache,cost,ctx,5h')
  for (const [, card] of found) {
    expect(card.props?.display).toBe('none')
    expect(card.hover?.display).toBe('flex')
    expect(card.props?.backgroundColor).toBe(DARK.cardBg)
    expect(textOf(card).length).toBeLessThan(60)
  }
  expect(found[0]?.[1].props?.left).toBe(0)
  expect(found[3]?.[1].props?.right).toBe(0) // the rightmost opens leftward
  expect(textOf(found[0]?.[1])).toBe('Warm cache bills input at 10%; expires 1h after a reply')
  expect(textOf(found[1]?.[1])).toBe('$0.41 spent during your last message, subagents included')
  expect(textOf(found[2]?.[1])).toBe('Conversation fill; near full, older turns get summarized')
  expect(textOf(found[3]?.[1])).toBe('5-hour limit across all your Claude use; resets in 3h 00m')
  await ui.unmount()
})

test('the rightmost visible pill anchors right when narrower widths drop pills', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(90) })
  const found = cards(await ui.drawn())
  expect(found.map(([key]) => key).join(',')).toBe('cache,cost,ctx')
  expect(found[2]?.[1].props?.right).toBe(0)
  await ui.unmount()
})

test('a cold cache explains what the next message rebuilds', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cache = cards(await ui.drawn()).find(([key]) => key === 'cache')
  expect(textOf(cache?.[1])).toMatch(/^Cold: next message rebuilds 112k tokens \(~\$\d+\.\d\d\)$/)
  await ui.unmount()
})

test('plain appearance draws no hover cards', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(cards(await ui.drawn())).toHaveLength(0)
  await ui.unmount()
})
