// The states every layout is drawn in, and the one way to draw them: one
// setup and one drive per test, then each mount drawn shut and open.
// P0 needs SCENARIOS and drawCases; P1 adds the snapshot builder and the
// invariant checks.

import type { On, RenderChildren, SessionUsage } from 'claude-code'
import { expect, type Engine, type MockClock } from 'claude-code/testing'
import {
  HOUR, HOUR_1, MIN, START, USAGE, FRESH, breakdown, engine, firstRow, mountBand, pacing, resp, respond, setup, shown, turn, walk, type Node,
} from './helpers'
import { DESKTOP, ROW_PX, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK } from '../hooks/palette'
import type { BandActions, BandSnapshot, LayoutName } from '../hooks/snapshot'
import { VIEWS } from '../hooks/views/index'
import { rowsOf } from '../hooks/views/view'

export type Appearance = 'dark' | 'light' | 'plain'
export type Surface = 'terminal' | 'desktop'
export type Ttl = '1h' | '5m'
export type AmberReason = 'cacheLastMinute' | 'nearCompaction' | 'contextNoCompaction' | 'limit80' | 'fiveHourAhead'

const TTL_MS: Readonly<Record<Ttl, number>> = { '1h': HOUR, '5m': 5 * MIN }

export type Scenario = Readonly<{
  usage?: SessionUsage
  store?: Record<string, unknown>
  env?: Record<string, string>
  now?: number
  /** Changes to the fake engine before the session starts. */
  prepare?: () => void
  /** Drives the session into its state. `ttlMs` is the cache's lifetime, so a
   *  walk to the last minute or past it holds under either TTL. */
  drive: ($: Engine, clock: MockClock, ttlMs: number) => Promise<void>
  isWorking?: boolean
  amber: readonly AmberReason[]
}>

const started = async ($: Engine): Promise<void> => { await $.session.start(START) }
const replied = async ($: Engine): Promise<void> => {
  await started($)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
}
const withLimits = (five: number, seven: number, fiveResetH = 3, sevenResetH = 67): SessionUsage['rateLimits'] => [
  { kind: 'five_hour', percentUsed: five, resetsAt: new Date(fiveResetH * HOUR).toISOString() },
  { kind: 'seven_day', percentUsed: seven, resetsAt: new Date(sevenResetH * HOUR).toISOString() },
]
/** The context at `tokens`, with auto-compaction at `compactAt`, or off. */
const contextAt = (tokens: number, compactAt: number | undefined): SessionUsage['context'] => ({
  tokens,
  window: 200_000,
  percent: tokens / 2000,
  breakdown: breakdown(compactAt === undefined ? { isAutoCompactEnabled: false } : { autoCompactThreshold: compactAt, isAutoCompactEnabled: true }),
})
/** A reply, then a measure: the band reads the compaction breakdown there. */
const measured = (context: SessionUsage['context']) => async ($: Engine): Promise<void> => {
  await replied($)
  await $.session.measure({ context, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })
}
const NEAR = contextAt(150_000, 160_000)
const OFF = contextAt(170_000, undefined)

export const SCENARIOS = {
  calm: { drive: replied, amber: [] },
  unmeasured: { drive: started, amber: [] },
  warming: { usage: FRESH, drive: started, amber: [] },
  // Its last reply 20 minutes ago, as the band remembered it; HOME lets it
  // look for the transcript's cost record too.
  recalled: { store: { sessions: { s1: { lastAt: 0 } } }, now: 20 * MIN, env: { HOME: '/Users/me' }, drive: started, amber: [] },
  cold: { drive: async ($, clock, ttlMs) => { await replied($); await clock.advance(ttlMs + MIN) }, amber: [] },
  lastMinute: { drive: async ($, clock, ttlMs) => { await replied($); await clock.advance(ttlMs - 30_000) }, amber: ['cacheLastMinute'] },
  working: { drive: replied, isWorking: true, amber: [] },
  nearCompaction: { usage: { ...USAGE, context: NEAR }, drive: measured(NEAR), amber: ['nearCompaction'] },
  compactionOff: { usage: { ...USAGE, context: OFF }, drive: measured(OFF), amber: ['contextNoCompaction'] },
  limit80: { usage: { ...USAGE, rateLimits: withLimits(82, 30) }, drive: replied, amber: ['limit80'] },
  fiveHourAhead: { drive: async ($, clock) => { await pacing($, clock) }, amber: ['fiveHourAhead'] },
  sevenFullBeforeReset: { usage: { ...USAGE, rateLimits: withLimits(4, 79, 3, 50) }, drive: replied, amber: [] },
  noLimits: { usage: { ...USAGE, rateLimits: [] }, drive: replied, amber: [] },
  gatewaySpend: {
    usage: { ...USAGE, rateLimits: [...withLimits(4, 30), { kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] },
    drive: replied,
    amber: [],
  },
  resetPassed: { now: 4 * HOUR, drive: replied, amber: [] },
  // A git read that never answers: the strip stays empty, as before the first read.
  noWorkspace: { prepare: () => { engine.hold = new Promise(() => undefined) }, drive: replied, amber: [] },
  notARepo: { prepare: () => { engine.git = 'none' }, drive: replied, amber: [] },
  gitFails: { prepare: () => { engine.git = 'fail' }, drive: replied, amber: [] },
  emptyHistory: { usage: FRESH, drive: started, amber: [] },
  fullHistory: {
    drive: async $ => {
      await replied($)
      for (let i = 1; i <= 30; i++) await turn($, `t${i}`, 2.41 + (i - 1) * 0.2, 2.41 + i * 0.2)
    },
    amber: [],
  },
} as const satisfies Record<string, Scenario>

export type ScenarioName = keyof typeof SCENARIOS
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[]

export type Mount = Readonly<{ surface: Surface; cols: number; maxRows?: number }>
export type State = 'shut' | 'open'
export type CaseOptions = Readonly<{
  scenario: ScenarioName
  appearance: Appearance
  env?: Record<string, string>
  /** A layout to store before the session starts; none, as a new user. */
  layout?: string
  /** The cache's lifetime: 5m walks a twelfth of the clock 1h does. */
  ttl?: Ttl
}>

/** Where a drawn case was mounted, and whether it was open. */
export const caseKey = (m: Mount, state: State): string => `${m.surface}|${m.cols}|${m.maxRows ?? 40}|${state}`

/** One setup and one drive, then for each mount, always in this order: draw
 *  it shut, press ▿, draw it open, press ▵, let it go. */
export const drawCases = async ($: Engine, on: On, o: CaseOptions, mounts: readonly Mount[]): Promise<Readonly<Record<string, Node>>> => {
  const s: Scenario = SCENARIOS[o.scenario]
  const ttl = o.ttl ?? '1h'
  const env = {
    ...HOUR_1,
    ...(o.appearance === 'dark' ? {} : { CC_BAND_APPEARANCE: o.appearance }),
    // Forcing 5m wins over HOUR_1 (resolveTtl reads it first).
    ...(ttl === '5m' ? { FORCE_PROMPT_CACHING_5M: '1' } : {}),
    ...s.env,
    ...o.env,
  }
  const store = { ...(s.store ?? {}), ...(o.layout === undefined ? {} : { layout: o.layout }) }
  const clock = setup(on, { usage: s.usage, store, env, now: s.now })
  s.prepare?.()
  await s.drive($, clock, TTL_MS[ttl])
  await clock.settle()
  const trees: Record<string, Node> = {}
  for (const m of mounts) {
    const ui = await mountBand($, m.surface, m.cols, { maxRows: m.maxRows, isWorking: s.isWorking })
    trees[caseKey(m, 'shut')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    trees[caseKey(m, 'open')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return trees
}

/** Golden's grid: two surfaces at three widths, each drawn shut and open, in
 *  dark and plain. 20 scenarios × 2 appearances × 6 mounts × 2 = 480 cases. */
export const GOLDEN_APPEARANCES: readonly Appearance[] = ['dark', 'plain']
export const GOLDEN_MOUNTS: readonly Mount[] = (['terminal', 'desktop'] as const).flatMap(surface => [40, 95, 200].map(cols => ({ surface, cols })))
export const goldenKey = (scenario: ScenarioName, appearance: Appearance, drawn: string): string => `${scenario}|${appearance}|${drawn}`

/** A snapshot for pure tests: a calm session at 120 columns, 52 minutes of
 *  cache left, 38% context with compaction at 190k, 5h at 4% and 7d at 30%. */
export const snapOf = (over: Partial<BandSnapshot> = {}): BandSnapshot => ({
  surface: 'terminal', columns: 120, maxRows: 13, isWorking: false, expanded: false, palette: DARK, now: 0,
  cache: {
    requests: 1, msLeft: 52 * MIN, ttl: '1h', ttlPinned: true, window: 155_000, hitRatio: 0.96, misses: 0, reWarmUsd: 1.66,
    savedUsd: 11.4, readShare: 0.05, fresh: true, recalled: false, idleMs: null, tokens: { sent: 18_000, back: 9_000, cached: 198_000 },
  },
  costUsd: 3.19, lastTurnUsd: 0.21,
  context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: 190_000 },
  fiveHour: { percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 30, resetsAt: new Date(67 * HOUR).toISOString() },
  otherLimits: [], workspace: undefined, layout: 'chips', glyphs: 'unicode', utcOffsetMin: undefined,
  ...over,
})

/** Actions for a draw outside a mount: one function each, so props compare equal. */
export const NO_ACT: BandActions = { toggleExpanded: async () => undefined, hide: async () => undefined }

/** Every layout's words for each amber trigger. `·` reads `-` in the ascii tier. */
export const AMBER_WORDS: Readonly<Record<AmberReason, RegExp>> = {
  cacheLastMinute: /! \d+s( left)?|LAST CALL|! cooling [·-] \d+s left/,
  nearCompaction: /! context \d+%|! ctx \d+%|! COMPACTS IN ~/,
  contextNoCompaction: /! context \d+%|! ctx \d+%|! CONTEXT \d+%/,
  limit80: /! 5h|! NEAR LIMIT/,
  fiveHourAhead: /! 5h|! FULL/,
}

const visible = (k: unknown): boolean => k !== null && k !== undefined && k !== false
/** Height in lines (terminal) or px (desktop): a Text or Button is a row, an
 *  Svg its height (none on the terminal), a column sums with its gaps, a row
 *  takes its tallest; a top margin adds its rows. */
const heightOf = (n: unknown, px: boolean): number => {
  const unit = px ? ROW_PX : 1
  if (typeof n === 'string' || typeof n === 'number') return unit
  if (n === null || typeof n !== 'object') return 0
  const node = n as Node
  if (node.props?.position === 'absolute' || node.props?.display === 'none') return 0
  const margin = (typeof node.props?.marginTop === 'number' ? node.props.marginTop : 0) * unit
  if (node.type === 'Svg') return px ? Number(node.props?.height ?? ROW_PX) + margin : 0
  if (node.type === 'Text' || node.type === 'Button') return unit + margin
  const kids = (node.children ?? []).filter(visible)
  if (kids.length === 0) return margin
  const sizes = kids.map(k => heightOf(k, px))
  if (node.props?.flexDirection !== 'column') return Math.max(...sizes) + margin
  const gap = (typeof node.props?.rowGap === 'number' ? node.props.rowGap : 0) * (kids.length - 1) * unit
  return sizes.reduce((a, b) => a + b, 0) + gap + margin
}
/** Rows a drawn tree takes: lines on the terminal; on the desktop its height
 *  over ROW_PX, to the nearest row. */
export const visualRows = (tree: unknown, surface: Surface): number =>
  surface === 'desktop' ? Math.round(heightOf(tree, true) / ROW_PX) : heightOf(tree, false)

export type InvariantContext = Readonly<{
  layout: LayoutName
  surface: Surface
  appearance: Appearance
  cols: number
  maxRows: number
  scenario: ScenarioName
  glyphs: 'unicode' | 'ascii'
  expanded: boolean
}>

const HEX = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi
/** A hex colour (`fff`, `ffff`, `ffffff` or `ffffff80`) whose hue lies
 *  within 15° of pure red at more than half saturation. Amber sits near 40°. */
const isRedHex = (hex: string): boolean => {
  const digits = hex.length <= 4 ? [...hex.slice(0, 3)].map(c => c + c) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
  const [r = 0, g = 0, b = 0] = digits.map(d => parseInt(d, 16))
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  // With red the largest, the hue is 60° × (g − b) / chroma, either side of 0°.
  return max === r && chroma > max / 2 && Math.abs((60 * (g - b)) / chroma) <= 15
}
/** The red in a prop's value: the theme's error key, or a red hex anywhere in
 *  it (an Svg's source included). */
const redIn = (value: string): string | undefined =>
  value === 'error' ? value : [...value.matchAll(HEX)].find(m => isRedHex(m[1] ?? ''))?.[0]

/** What each glyph tier may draw (spec §3.2): the unicode tier's glyphs and braille, or ASCII alone. */
const UNICODE_TIER = /^[\x20-\x7e█░▒│·↻Σ◷◔▿▵…±●■–↑↓\u2800-\u28ff]*$/
const ASCII_TIER = /^[\x20-\x7e]*$/

/** Each failed check as `<check>: <why>`; none when the tree keeps the spec
 *  §2 contract: the checks spec §7 lists, §9's node budget and §2.6's open height. */
export const invariantErrors = (tree: Node, ctx: InvariantContext): string[] => {
  const errors: string[] = []
  const fail = (check: string, why: string): void => {
    errors.push(`${check}: ${why}`)
  }
  const collapsed = firstRow(tree)
  const svgDraws = ctx.surface === 'desktop' && ctx.appearance !== 'plain'
  const ascii = ctx.glyphs === 'ascii' && ctx.surface === 'terminal'
  const amber: readonly AmberReason[] = SCENARIOS[ctx.scenario].amber

  const declared = rowsOf(VIEWS[ctx.layout], { Svg: svgDraws })
  const rows = visualRows(collapsed, ctx.surface)
  if (rows !== declared) fail('rows', `${rows} drawn, ${declared} declared`)

  const mark = ctx.expanded ? (ascii ? '^' : '▵') : ascii ? 'v' : '▿'
  let toggles = 0
  walk(collapsed, n => {
    if (n.type === 'Button' && n.props?.label === mark) toggles++
  })
  if (toggles !== 1) fail('toggle', `${toggles} ${mark} in the collapsed part`)

  // All-amber below 60 columns clips by design, ▿ pinned at the end.
  const clipsByDesign = ctx.cols < 60 && amber.length > 0
  const width = cellsOf(collapsed as RenderChildren, ctx.surface === 'desktop' ? DESKTOP : TERMINAL)
  if (!clipsByDesign && width > ctx.cols) fail('width', `${width} columns at ${ctx.cols}`)

  let nodes = 0
  const svgs: Node[] = []
  walk(tree, n => {
    nodes++
    if (n.type === 'Svg') svgs.push(n)
    for (const v of Object.values(n.props ?? {})) {
      const red = typeof v === 'string' ? redIn(v) : undefined
      if (red !== undefined) fail('colour', `red ${red}`)
    }
    if (ctx.surface === 'desktop')
      for (const k of n.children ?? []) if (typeof k === 'string' && /^\s+$/.test(k)) fail('whitespace', `a whitespace-only child of a ${n.type}`)
  })
  if (!svgDraws && svgs.length > 0) fail('svgPlacement', `${svgs.length} Svg where none draws`)
  for (const s of svgs)
    if (typeof s.props?.alt !== 'string' || s.props.alt === '' || typeof s.props?.width !== 'number') fail('svgProps', 'an Svg without an alt or a width')

  const text = shown(tree)
  if (/send|keep (it )?warm/i.test(text)) fail('wording', 'suggests sending a message')
  for (const reason of amber) if (!AMBER_WORDS[reason].test(text)) fail('amber', `no words for ${reason}`)
  if (/re-warm \$/i.test(text) || /full (in |at )?\d/i.test(text)) fail('estimate', 'an estimate without ~')
  if (!(ascii ? ASCII_TIER : UNICODE_TIER).test(text)) fail('glyphs', 'a glyph outside the tier')

  if (nodes > (ctx.expanded ? 1500 : 400)) fail('size', `${nodes} nodes`)
  if (ctx.expanded) {
    const tall = visualRows(tree, ctx.surface)
    if (tall > ctx.maxRows) fail('height', `${tall} rows at maxRows ${ctx.maxRows}`)
  }
  return errors
}

/** Fails the test with every broken check named. */
export const expectInvariants = (tree: Node, ctx: InvariantContext): void => {
  expect(invariantErrors(tree, ctx)).toEqual([])
}
