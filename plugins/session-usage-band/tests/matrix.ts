// The states every layout is drawn in, and the one way to draw them: one
// setup and one drive per test, then each mount drawn shut and open.
// P0 needs SCENARIOS and drawCases; P1 adds the snapshot builder and the
// invariant checks.

import type { On, SessionUsage } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import {
  HOUR, HOUR_1, MIN, START, USAGE, FRESH, breakdown, engine, mountBand, pacing, resp, respond, setup, turn, type Node,
} from './helpers'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'

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
  otherLimits: [], workspace: undefined, glyphs: 'unicode', utcOffsetMin: undefined,
  ...over,
})
