// Sign-off capture, not a test (spec §8 step 5): every layout in the
// sign-off cases, on both surfaces, shut and open, each tree printed as
// `SIGNOFF <json>` for the renderers. Every tree is held to the matrix's
// invariants first: a failing one prints `SIGNOFF-ERR <file> <errors>`, and
// whatever renders the trees refuses to while any such line exists (but
// for chips' two known gaps, printed `SIGNOFF-NOTE`; see chipsNote). Each
// test ends with `SIGNOFF-DONE <trees>`, so a test that never finished shows.
// Base width: 94 columns on the desktop (desktop.test's band), 100 on the
// terminal (terminal.test's); low and near again in light and plain at 40,
// 80 and 200. Every mount is 13 rows, where the open give-way is defined.
import type { SessionUsage } from 'claude-code'
import { test } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { DARK, LIGHT, PLAIN } from '../hooks/palette'
import type { BandSnapshot, LayoutName } from '../hooks/snapshot'
import { HOUR, SAMPLES, USAGE, byKey, fakeEl, firstRow, type Node } from './helpers'
import {
  NO_ACT, caseKey, drawCases, invariantErrors, snapOf, ttlOf, withLimits,
  type Appearance, type InvariantContext, type Mount, type ScenarioName,
} from './matrix'

const LAYOUTS: readonly LayoutName[] = ['chips', 'pulse', 'departures']
const ROWS = 13
const BASE: readonly Mount[] = [{ surface: 'desktop', cols: 94, maxRows: ROWS }, { surface: 'terminal', cols: 100, maxRows: ROWS }]
const WIDE: readonly Mount[] = (['desktop', 'terminal'] as const).flatMap(surface => [40, 80, 200].map(cols => ({ surface, cols, maxRows: ROWS })))
const STATES = ['shut', 'open'] as const

type Case = Readonly<{ name: string; scenario: ScenarioName; usage?: SessionUsage }>
const limited = (five: number, seven: number): SessionUsage => ({ ...USAGE, rateLimits: withLimits(five, seven) })

const LOW: Case = { name: 'low', scenario: 'calm', usage: limited(3, 10) }
// No scenario raises all four of near's amber, so one image each.
const NEAR: readonly Case[] = [
  { name: 'near-lastMinute', scenario: 'lastMinute', usage: limited(30, 85) },
  { name: 'near-nearCompaction', scenario: 'nearCompaction' },
  { name: 'near-fiveHourAhead', scenario: 'fiveHourAhead' },
]
const CASES: readonly Case[] = [
  LOW,
  { name: 'high', scenario: 'calm', usage: limited(70, 78) },
  ...NEAR,
  ...(['emptyHistory', 'noLimits', 'noWorkspace'] as const).map(scenario => ({ name: `empty-${scenario}`, scenario })),
  ...(['unmeasured', 'warming', 'cold', 'recalled', 'working', 'resetPassed', 'compactionOff', 'gatewaySpend', 'fullHistory'] as const)
    .map(scenario => ({ name: `edge-${scenario}`, scenario })),
]

/** The pill that says each amber reason in chips. */
const CHIPS_PILL: Readonly<Record<string, string>> = { cacheLastMinute: 'cache', nearCompaction: 'ctx', contextNoCompaction: 'ctx', fiveHourAhead: '5h', limit80: '5h' }
const AMBER_INKS: ReadonlySet<string> = new Set([DARK, LIGHT, PLAIN].flatMap(p => [p.amberBg, p.amberFg, p.batteryAmber]).filter(c => c !== '').map(c => c.toLowerCase()))
/** Whether a node paints an amber ink, in a colour prop or an Svg's source, hover cards left out. */
const paintsAmber = (n: unknown): boolean => {
  if (n === null || typeof n !== 'object') return false
  const node = n as Node
  if (node.props?.position === 'absolute') return false
  const inks = [node.props?.color, node.props?.backgroundColor, node.props?.borderColor, ...(String(node.props?.source ?? '').match(/#[0-9a-f]{6}/gi) ?? [])]
  return inks.some(c => typeof c === 'string' && AMBER_INKS.has(c.toLowerCase())) || (node.children ?? []).some(paintsAmber)
}
/** Chips never ran under viewSuite, and golden freezes it. Two of the
 *  matrix's checks miss it: its amber is its pill's paint, with words the
 *  matrix's AMBER_WORDS don't read, and below 60 columns an amber row may
 *  outgrow the band. Those errors are notes: an amber one only while the
 *  reason's pill is painted amber, a width one only below 60 columns. */
const chipsNote = (error: string, tree: Node, ctx: InvariantContext): boolean => {
  if (ctx.layout !== 'chips') return false
  if (ctx.cols < 60 && error.startsWith('width: ')) return true
  const pill = CHIPS_PILL[error.match(/^amber: no words for (\w+)$/)?.[1] ?? '']
  return pill !== undefined && paintsAmber(byKey(firstRow(tree), pill, 'Box'))
}

/** Prints one drawn tree, its invariant errors first. */
const print = (file: string, tree: Node, ctx: InvariantContext): void => {
  const errors = invariantErrors(tree, ctx)
  const notes = errors.filter(e => chipsNote(e, tree, ctx))
  const blocking = errors.filter(e => !notes.includes(e))
  if (blocking.length > 0) console.log(`SIGNOFF-ERR ${file} ${blocking.join('; ')}`)
  if (notes.length > 0) console.log(`SIGNOFF-NOTE ${file} ${notes.join('; ')}`)
  console.log('SIGNOFF ' + JSON.stringify({ file, layout: ctx.layout, surface: ctx.surface, appearance: ctx.appearance, cols: ctx.cols, expanded: ctx.expanded, tree }))
}

/** One case drawn on its mounts in one appearance, each tree printed. */
const capture = (layout: LayoutName, c: Case, appearance: Appearance, mounts: readonly Mount[], suffixed: boolean): void => {
  test(`signoff: ${layout} ${c.name} ${appearance}${suffixed ? ' wide' : ''}`, { timeoutMs: 120_000 }, async ($, on) => {
    const trees = await drawCases($, on, { layout, scenario: c.scenario, appearance, ttl: ttlOf(c.scenario), usage: c.usage }, mounts)
    let drawn = 0
    for (const m of mounts) for (const state of STATES) {
      const tree = trees[caseKey(m, state)]
      const file = `${layout}-${c.name}-${m.surface}-${state}${suffixed ? `-${appearance}-${m.cols}` : ''}`
      if (tree === undefined) { console.log(`SIGNOFF-ERR ${file} missing: not drawn`); continue }
      print(file, tree, { layout, surface: m.surface, appearance, cols: m.cols, maxRows: ROWS, scenario: c.scenario, glyphs: 'unicode', expanded: state === 'open' })
      drawn++
    }
    console.log(`SIGNOFF-DONE ${drawn}`)
  })
}

// The unknown zone: drawCases draws in the host's zone, so the band is drawn
// directly with none. 5h 26% and 7d 85%, with pulse's trails to draw.
const COSTS = Array.from({ length: 24 }, (_, i) => ({ usd: i === 23 ? 0.21 : i === 17 ? 0.84 : 0.2, reWarm: i === 17 }))
const UNZONED = {
  zone: undefined,
  fiveHour: { percentUsed: 26, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() },
  history: { costs: COSTS, context: [40_000, 60_000, 76_000] },
  samples: SAMPLES,
} satisfies Partial<BandSnapshot>

for (const layout of LAYOUTS) {
  for (const c of CASES) capture(layout, c, 'dark', BASE, false)
  for (const c of [LOW, ...NEAR]) for (const appearance of ['light', 'plain'] as const) capture(layout, c, appearance, WIDE, true)
  test(`signoff: ${layout} unknown zone`, () => {
    let drawn = 0
    for (const m of BASE) for (const state of STATES) {
      const expanded = state === 'open'
      const tree = drawBand(fakeEl, snapOf({ layout, surface: m.surface, columns: m.cols, maxRows: ROWS, expanded, ...UNZONED }), NO_ACT) as unknown as Node
      print(`${layout}-unknownzone-${m.surface}-${state}`, tree, { layout, surface: m.surface, appearance: 'dark', cols: m.cols, maxRows: ROWS, scenario: 'calm', glyphs: 'unicode', expanded })
      drawn++
    }
    console.log(`SIGNOFF-DONE ${drawn}`)
  })
}
