// Shared fixtures and helpers for the band's tests: the engine beneath the
// plugin, canned usage, and readers for the drawn tree.

import type {
  HookStream,
  ModelUsage,
  On,
  SessionCompactResult,
  SessionContextBreakdown,
  SessionUsage,
  TurnStepChunk,
  TurnStepInput,
  TurnStepResult,
  TurnStopReason,
} from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'

export const PLUGIN = 'session-usage-band'

export const props = (cols: number, isWorking = false) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 14,
  bodyColumns: cols,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

export const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 76_000, window: 200_000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(3 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(67 * 3600_000).toISOString() },
  ],
  cost: { usd: 2.41 },
}

export const FRESH: SessionUsage = {
  startedAt: 0,
  context: { window: 200_000 },
  rateLimits: [],
  cost: { usd: 0 },
}

/** What the engine reports right now; a test swaps `current` to move cost or
 *  limits, or sets `breakdownFails` to make the context breakdown read throw. */
export const usage: { current: SessionUsage; breakdownFails: boolean } = { current: USAGE, breakdownFails: false }

/** The size the engine reports for the conversation after a compaction. */
export const COMPACTED_TO = 20_000

/** A compacted conversation: the summary message alone. */
export const SUMMARY = [{ role: 'user' as const, text: 'summary', toolUses: [] }]

/** How the engine beneath answers, for tests that need it otherwise: what a
 *  compaction returns, why a step stops, and a gate that holds a step open. */
export const engine: { compact: SessionCompactResult; stop: TurnStopReason; gate: Promise<void> | undefined } = {
  compact: { messages: SUMMARY, tokensAfter: COMPACTED_TO },
  stop: 'end_turn',
  gate: undefined,
}

/** Every toast the plugin raised since `base` ran. */
export const toasts: string[] = []

let nextUsage: ModelUsage | null = null

/** Everything beneath the plugin: the engine's own answers. */
export const base = (on: On, initial: SessionUsage = USAGE): void => {
  usage.current = initial
  usage.breakdownFails = false
  toasts.length = 0
  nextUsage = null
  engine.compact = { messages: SUMMARY, tokensAfter: COMPACTED_TO }
  engine.stop = 'end_turn'
  engine.gate = undefined
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', ($, e) => {
    if (e.breakdown !== undefined && usage.breakdownFails) throw new Error('breakdown unavailable')
    return { value: usage.current }
  })
  on('session.compact', () => engine.compact)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('turn.step', async function* ($, e) {
    if (engine.gate !== undefined) await engine.gate
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: engine.stop,
      usage: nextUsage === null ? null : { ...nextUsage, model: e.model },
    }
  })
}

export const resp = (input: number, read: number, write: number, output: number): ModelUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

export type Step = (e: TurnStepInput) => HookStream<TurnStepChunk, TurnStepResult>

export const respond = async (step: Step, u: ModelUsage): Promise<void> => {
  nextUsage = u
  const stream = step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _chunk of stream) {
    // drain so the hook's result settles
  }
  await stream.result
}

export const inAgent =
  (step: Step): Step =>
  e =>
    step({ ...e, agentId: 'agent-1' })

export type Node = {
  type?: string
  props?: Record<string, unknown>
  hover?: Record<string, unknown>
  children?: unknown[]
}

/** All text beneath a node, hidden cards included. */
export const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : n !== null && typeof n === 'object'
      ? ((n as Node).children ?? []).map(textOf).join('')
      : ''

export const walk = (n: unknown, visit: (node: Node) => void): void => {
  if (n === null || typeof n !== 'object') return
  visit(n as Node)
  for (const k of (n as Node).children ?? []) walk(k, visit)
}

/** Rows of the band: the root Box's children. */
export const rowCount = (tree: unknown): number => {
  const t = tree as Node
  return t.type === 'Box' ? (t.children ?? []).length : 0
}

/** Cells a drawn row needs, as the terminal lays it out: text, padding, gaps
 *  and Button labels; hidden cards take none; an Svg takes a cell per 8px.
 *  Kept apart from band.tsx's own measure on purpose, so the fit tests check
 *  the drawing against an independent count rather than against itself. */
export const widthOf = (n: unknown): number => {
  if (typeof n === 'string' || typeof n === 'number') return [...String(n)].length
  if (n === null || typeof n !== 'object') return 0
  const node = n as Node
  if (node.props?.position === 'absolute') return 0
  if (node.type === 'Button') return [...String(node.props?.label ?? '')].length
  if (node.type === 'Svg') return Math.ceil(Number(node.props?.width ?? 64) / 8)
  const kids = (node.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
  const pad = typeof node.props?.paddingX === 'number' ? 2 * node.props.paddingX : 0
  const gap = typeof node.props?.columnGap === 'number' ? node.props.columnGap * Math.max(0, kids.length - 1) : 0
  return kids.map(widthOf).reduce((a, b) => a + b, 0) + pad + gap
}

/** The band's first row: the pills. */
export const firstRow = (tree: unknown): unknown => ((tree as Node).children ?? [])[0]

// ── constants ──────────────────────────────────────────────────────────

export const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
/** Pins the 1-hour TTL, so tests don't depend on the assumed one. */
export const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }
export const MIN = 60_000
export const HOUR = 60 * MIN
export const CLEAR = { reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as const

// ── readers for the drawn tree ─────────────────────────────────────────

/** The pill Box drawn under `key` in the first row. */
export const pillOf = (tree: unknown, key: string): Node | undefined => {
  let found: Node | undefined
  walk(firstRow(tree), n => {
    if (found === undefined && n.type === 'Box' && n.props?.key === key) found = n
  })
  return found
}

/** A node's visible text: hover cards, at any depth, left out. */
export const shown = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : n !== null && typeof n === 'object' && (n as Node).props?.position !== 'absolute'
      ? ((n as Node).children ?? []).map(shown).join('')
      : ''

/** A text battery's segments: its own Texts that carry a background. */
export const segments = (pill: Node | undefined): Array<{ text: string; bg: unknown }> =>
  ((pill?.children ?? []) as Node[])
    .filter(k => k?.type === 'Text' && k.props?.backgroundColor !== undefined)
    .map(k => ({ text: textOf(k), bg: k.props?.backgroundColor }))

export const svgsOf = (n: unknown): Node[] => {
  const out: Node[] = []
  walk(n, k => {
    if (k.type === 'Svg') out.push(k)
  })
  return out
}

export const svgAlts = (tree: unknown): string[] => svgsOf(tree).map(n => String(n.props?.alt))

/** The desktop battery icon in the cache pill. */
export const batteryOf = (tree: unknown): Node | undefined =>
  svgsOf(pillOf(tree, 'cache')).find(n => /battery|warming/.test(String(n.props?.alt)))

/** The battery icon's charge bar width, in px. */
export const fillWidth = (svg: Node | undefined): number => {
  const m = String(svg?.props?.source).match(/<rect class="charge" [^>]*width="([\d.]+)"/)
  return m ? Number(m[1]) : 0
}

/** Each pill's hidden hover card, as [pill key, card] pairs. */
export const cards = (tree: unknown): Array<[string, Node]> => {
  const out: Array<[string, Node]> = []
  walk(tree, n => {
    for (const k of n.children ?? []) {
      const child = k as Node
      if (child?.props?.position === 'absolute') out.push([String(n.props?.key), child])
    }
  })
  return out
}

/** The value a card row shows for `label` in the expanded view. */
export const fact = (tree: unknown, label: string): string | undefined => {
  let found: string | undefined
  walk(tree, n => {
    if (found === undefined && n.type === 'Box' && n.props?.key === `fact:${label}`) {
      const kids = n.children ?? []
      found = textOf(kids[kids.length - 1])
    }
  })
  return found
}

/** A card of the expanded view: cache, spend, context or limits. */
export const cardOf = (tree: unknown, name: string): Node | undefined => {
  let found: Node | undefined
  walk(tree, n => {
    if (found === undefined && n.type === 'Box' && n.props?.key === `card:${name}`) found = n
  })
  return found
}

/** The cache card's rebuild count, 0 when the row is absent. */
export const rebuilds = (tree: unknown): number => Number(fact(tree, 'rebuilds') ?? 0)

/** Text meters drawn: six cells of █, ░ and the ┃ tick. An empty meter's
 *  inner track Text is six cells too, so it's told apart by its colour. */
const METER = /^[█░┃]{6}$/
export const textMeters = async (ui: {
  findAll: (q: { type: string; text: RegExp }) => Promise<Array<{ props?: Record<string, unknown> }>>
}): Promise<number> => (await ui.findAll({ type: 'Text', text: METER })).filter(t => t.props?.color !== DARK.meterTrack).length

// ── driving the engine ─────────────────────────────────────────────────

/** One main-loop turn (or, with `agentId`, a subagent's) that moves the
 *  ledger from `from` to `to`. */
export const turn = async (
  $: Engine,
  id: string,
  from: number,
  to: number,
  extra: { agentId?: string; isAborted?: boolean; reason?: 'answer' | 'aborted' | 'error' } = {},
): Promise<void> => {
  usage.current = { ...usage.current, cost: { usd: from } }
  if (extra.agentId === undefined) await $.turn.start({ text: 'hi', turnId: id })
  usage.current = { ...usage.current, cost: { usd: to } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer', ...extra })
}

/** Starts the session and feeds a 5h pace: 40% then 50% twelve minutes on,
 *  with 4h to the reset, at 60% context. */
export const pacing = async ($: Engine, clock: MockClock): Promise<void> => {
  const resetsAt = new Date(4 * HOUR).toISOString()
  const at = (pct: number): SessionUsage => ({
    ...USAGE,
    context: { tokens: 120_000, window: 200_000, percent: 60 },
    rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }],
  })
  usage.current = at(40)
  await $.session.start(START)
  for (const [pct, wait] of [
    [40, 12 * MIN],
    [50, 0],
  ] as const) {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
    await clock.advance(wait)
  }
}

/** A context breakdown carrying only what the band reads. The full type holds
 *  the grid and every category, which no test here needs. */
export const breakdown = (fields: Pick<SessionContextBreakdown, 'isAutoCompactEnabled'> & { autoCompactThreshold?: number }): SessionContextBreakdown =>
  fields as SessionContextBreakdown
