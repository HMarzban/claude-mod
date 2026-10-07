import type {
  HookStream,
  ModelUsage,
  On,
  SessionUsage,
  TurnStepChunk,
  TurnStepInput,
  TurnStepResult,
} from 'claude-code'

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

/** What the engine reports right now; a test swaps `current` to move cost or limits. */
export const usage: { current: SessionUsage } = { current: USAGE }

/** Every toast the plugin raised since `base` ran. */
export const toasts: string[] = []

let nextUsage: ModelUsage | null = null

/** Everything beneath the plugin: the engine's own answers. */
export const base = (on: On, initial: SessionUsage = USAGE): void => {
  usage.current = initial
  toasts.length = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage.current }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
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

/** Cells a drawn row needs, as the terminal lays it out: text, padding,
 *  gaps and Button labels; hidden cards take none; an Svg meter counts 8. */
export const widthOf = (n: unknown): number => {
  if (typeof n === 'string' || typeof n === 'number') return [...String(n)].length
  if (n === null || typeof n !== 'object') return 0
  const node = n as Node
  if (node.props?.position === 'absolute') return 0
  if (node.type === 'Button') return [...String(node.props?.label ?? '')].length
  if (node.type === 'Svg') return 8
  const kids = (node.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
  const pad = typeof node.props?.paddingX === 'number' ? 2 * node.props.paddingX : 0
  const gap = typeof node.props?.columnGap === 'number' ? node.props.columnGap * Math.max(0, kids.length - 1) : 0
  return kids.map(widthOf).reduce((a, b) => a + b, 0) + pad + gap
}

/** The band's first row: the pills. */
export const firstRow = (tree: unknown): unknown => ((tree as Node).children ?? [])[0]
