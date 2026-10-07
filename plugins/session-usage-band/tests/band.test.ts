import { test, expect, mock } from 'claude-code/testing'
import type {
  SessionUsage,
  ModelUsage,
  TurnStepInput,
  TurnStepChunk,
  TurnStepResult,
  HookStream,
  On,
} from 'claude-code'

const PLUGIN = 'session-usage-band'

const props = (cols: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows: 14,
  bodyColumns: cols,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 76_000, window: 200_000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 25, resetsAt: new Date(3 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 27 },
  ],
  cost: { usd: 2.41 },
}

const FRESH: SessionUsage = {
  startedAt: 0,
  context: { window: 200_000 },
  rateLimits: [],
  cost: { usd: 0 },
}

let nextUsage: ModelUsage | null = null

/** Everything beneath the plugin: the engine's own answers. */
const base = (on: On, usage: SessionUsage = USAGE): void => {
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage }))
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: nextUsage === null ? null : { ...nextUsage, model: e.model },
    }
  })
}

const resp = (input: number, read: number, write: number, output: number): ModelUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

type Step = (e: TurnStepInput) => HookStream<TurnStepChunk, TurnStepResult>

const respond = async (step: Step, usage: ModelUsage): Promise<void> => {
  nextUsage = usage
  const stream = step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _chunk of stream) {
    // drain so the hook's result settles
  }
  await stream.result
}

/** The cold-start count from the expanded cache row. A bare /^0$/ would also
 *  match the token pill's "cached 0". */
const coldStarts = async (ui: { drawn: () => Promise<unknown> }): Promise<number | undefined> => {
  const text = (n: unknown): string => {
    if (typeof n === 'string') return n
    const t = n as { text?: string; children?: unknown[] } | null
    return t?.text ?? (t?.children ?? []).map(text).join('')
  }
  const match = text(await ui.drawn()).match(/cold starts (\d+)/)
  return match ? Number(match[1]) : undefined
}

// ── the collapsed band ─────────────────────────────────────────────────

test('the collapsed band is one pill row plus the buttons', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const tree = await ui.drawn()
  expect(tree.type === 'Box' ? (tree.children ?? []).length : 0).toBe(2)

  // every figure the user asked for
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined() // countdown
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined() // cost
  expect(await ui.find({ type: 'Text', text: /196k/ })).toBeDefined() // tokens sent
  expect(await ui.find({ type: 'Text', text: /12k/ })).toBeDefined() // tokens back
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined() // context

  await ui.unmount()
})

test('pills carry their own foreground and background, never one of each', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const tree = await ui.drawn()
  const row = tree.type === 'Box' ? (tree.children ?? [])[0] : undefined

  let pills = 0
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
    const bg = n.props?.backgroundColor
    if (typeof bg === 'string') {
      pills += 1
      // a hex background must never be paired with a theme-key foreground
      expect(bg.startsWith('#')).toBe(true)
      const texts: string[] = []
      const colors = (c: unknown): void => {
        if (typeof c !== 'object' || c === null) return
        const t = c as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
        if (t.type === 'Text' && typeof t.props?.color === 'string') texts.push(t.props.color)
        for (const k of t.children ?? []) colors(k)
      }
      for (const k of n.children ?? []) colors(k)
      for (const c of texts) expect(c.startsWith('#')).toBe(true)
    }
    for (const k of n.children ?? []) walk(k)
  }
  walk(row)
  expect(pills).toBeGreaterThan(2)

  await ui.unmount()
})

test('CC_BAND_APPEARANCE=plain drops every background for theme keys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const tree = await ui.drawn()

  const backgrounds: unknown[] = []
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const n = node as { props?: Record<string, unknown>; children?: unknown[] }
    if (n.props?.backgroundColor !== undefined) backgrounds.push(n.props.backgroundColor)
    for (const k of n.children ?? []) walk(k)
  }
  walk(tree)
  expect(backgrounds.length).toBe(0)
  expect(await ui.find({ type: 'Text', text: /\[/ })).toBeDefined() // bracketed instead

  await ui.unmount()
})

test('before the first response the band says warming rather than a false zero', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on, FRESH)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /%/ })).toBeUndefined()
  await ui.unmount()
})

// ── the cache countdown ────────────────────────────────────────────────

test('the countdown is still while warm, then names the stakes in its last minute', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })

  // warm: no stakes number, it would be trivia
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /re-warm/ })).toBeUndefined()

  await clock.advance(15_000) // whole minutes count down, never "60m"
  expect(await ui.find({ type: 'Text', text: /cache 59m/ })).toBeDefined()

  await clock.advance(60 * 60_000 - 45_000) // 30s left
  expect(await ui.find({ type: 'Text', text: /0:30/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /187k .*to re-warm/ })).toBeDefined()

  await clock.advance(60_000) // cold
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /187k .*to re-warm/ })).toBeDefined()

  await ui.unmount()
})

test('a cold cache is neutral, never an error colour', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))
  await clock.advance(10 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cold = await ui.find({ type: 'Text', text: /cold/ })
  expect(cold).toBeDefined()
  expect(cold?.props?.color).not.toBe('error')
  await ui.unmount()
})

test('an assumed hour is corrected to 5m when a gap past 5m rebuilt the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, {})
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(12 * 60_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'size' })
  expect(await ui.find({ type: 'Text', text: /5m/ })).toBeDefined()
  expect(await coldStarts(ui)).toBe(0)
  await ui.unmount()
})

test('a prefix the cache should have served but did not counts as a cold start', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'size' })
  expect(await coldStarts(ui)).toBe(1)
  await ui.unmount()
})

test('a warm follow-up to a long answer is not a cold start', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 5_000))
  await clock.advance(30_000)
  // reads everything the last request cached; the 5k answer is written now
  await respond(e => $.turn.step(e), resp(300, 80_000, 7_000, 400))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'size' })
  expect(await coldStarts(ui)).toBe(0)
  await ui.unmount()
})

// ── subagents ──────────────────────────────────────────────────────────

const inAgent = (step: Step): Step => e => step({ ...e, agentId: 'agent-1' })

test("a subagent's steps leave the main countdown and window alone", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await clock.advance(50 * 60_000)
  await respond(inAgent(e => $.turn.step(e)), resp(500, 0, 12_000, 800))
  await clock.advance(9 * 60_000 + 30_000) // the main cache has 30s left

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /0:30/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /153k .*to re-warm/ })).toBeDefined()
  await ui.press({ key: 'size' })
  expect(await coldStarts(ui)).toBe(0)
  await ui.unmount()
})

test("a subagent's tokens still count toward the session totals", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(inAgent(e => $.turn.step(e)), resp(3_000, 20_000, 10_000, 4_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /123k/ })).toBeDefined() // sent
  expect(await ui.find({ type: 'Text', text: /6\.0k/ })).toBeDefined() // back
  expect(await ui.find({ type: 'Text', text: /20k/ })).toBeDefined() // cached
  await ui.unmount()
})

// ── totals, expansion, commands ────────────────────────────────────────

test('token totals accumulate sent, returned and cache-served separately', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  await respond(e => $.turn.step(e), resp(1_000, 110_000, 2_000, 1_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /123k/ })).toBeDefined() // sent
  expect(await ui.find({ type: 'Text', text: /6\.0k/ })).toBeDefined() // back
  expect(await ui.find({ type: 'Text', text: /210k/ })).toBeDefined() // cached
  await ui.unmount()
})

test('narrow widths collapse the token pill rather than wrapping the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(60) })
  const tree = await ui.drawn()
  expect(tree.type === 'Box' ? (tree.children ?? []).length : 0).toBe(2) // still one row + buttons
  expect(await ui.find({ type: 'Text', text: /Σ/ })).toBeDefined() // summed, not split
  expect(await ui.find({ type: 'Text', text: /sent/ })).toBeUndefined()
  await ui.unmount()
})

test('More adds the limit and cache rows, Less takes them away', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const rowCount = async (): Promise<number> => {
    const tree = await ui.drawn()
    return tree.type === 'Box' ? (tree.children ?? []).length : 0
  }

  expect(await rowCount()).toBe(2)
  expect(await ui.find({ type: 'Text', text: /resets/ })).toBeUndefined()

  await ui.press({ key: 'size' })
  expect(await rowCount()).toBe(4) // pills, limits, cache detail, buttons
  expect(await ui.find({ type: 'Text', text: /resets/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache window/ })).toBeDefined()

  await ui.press({ key: 'size' })
  expect(await rowCount()).toBe(2)
  await ui.unmount()
})

test('/usage-band more, less, hide and show drive the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const run = (args: string): Promise<unknown> =>
    $.command.run({
      command: 'usage-band',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: 110 },
    })

  await run('more')
  expect(await ui.find({ type: 'Text', text: /cache window/ })).toBeDefined()
  await run('less')
  expect(await ui.find({ type: 'Text', text: /cache window/ })).toBeUndefined()

  await run('hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await run('show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()

  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

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
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(110) })
    expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
    await ui.unmount()
  }
})

// ── the re-warm cost estimate ──────────────────────────────────────────

test('the re-warm estimate appears only where it is actionable, at any width', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

  // A session whose own bill lets the rate be solved: with cost $2.41 and
  // weighted tokens = 10k + 1.25*100k + 0.1*0 + 5*2k = 145k, the rate is
  // ~$1.662e-5, so re-warming the 112k window costs ~1.25 * 112k * rate.
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })

  // warm: the figure would be trivia
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()

  await clock.advance(60 * 60_000 - 40_000) // last minute
  const soon = await ui.find({ type: 'Text', text: /~\$/ })
  expect(soon).toBeDefined()
  expect(soon?.text).toMatch(/to re-warm/)

  await clock.advance(60_000) // cold
  expect(await ui.find({ type: 'Text', text: /cold .*~\$/ })).toBeDefined()

  await ui.unmount()
})

test('a narrow band shortens the wording but keeps the money', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(60 * 60_000 - 40_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(64) })
  const pill = await ui.find({ type: 'Text', text: /~\$/ })
  expect(pill).toBeDefined()
  expect(pill?.text).not.toMatch(/to re-warm/) // wording dropped, figure kept
  await ui.unmount()
})

test('with nothing billed yet there is no estimate to show', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on, { ...USAGE, cost: { usd: 0 } })

  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(60 * 60_000 + 60_000) // cold

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await ui.unmount()
})
