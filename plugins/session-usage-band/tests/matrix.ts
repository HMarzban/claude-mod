// The checks every layout is held to, over the cases in cases.ts: the
// snapshot builder for pure tests, the invariant checks and the suite every
// layout runs.

import type { RenderChildren } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import { DEFAULT_MAX_ROWS, LONG, MIN, HOUR, firstRow, shown, walk, type Node } from './helpers'
import type { Ttl } from '../hooks/cache'
import { DESKTOP, ROW_PX, TERMINAL, cellsOf, isDrawn } from '../hooks/layout'
import { DARK } from '../hooks/palette'
import type { BandActions, BandSnapshot, Glyphs, LayoutName } from '../hooks/snapshot'
import { VIEWS } from '../hooks/views/index'
import { SPLIT_LABELS } from '../hooks/words'
import { rowsOf } from '../hooks/views/view'
import { SCENARIOS, SCENARIO_NAMES, caseKey, drawCases, type AmberReason, type Appearance, type CaseOptions, type Mount, type ScenarioName, type Surface } from './cases'

export * from './cases'

/** Spec §7's all-amber: no scenario raises every reason at once, so the
 *  last minute stands for it, as the ledger rules. */
const ALL_AMBER = 'lastMinute' satisfies ScenarioName

/** A snapshot for pure tests: a calm session at 120 columns, 52 minutes of
 *  cache left, 38% context with compaction at 190k, 5h at 4% and 7d at 30%. */
export const snapOf = (over: Partial<BandSnapshot> = {}): BandSnapshot => ({
  surface: 'terminal', columns: 120, maxRows: 13, isWorking: false, expanded: false, palette: DARK, now: 0,
  cache: {
    requests: 1, msLeft: 52 * MIN, ttl: '1h', ttlPinned: true, window: 155_000, hitRatio: 0.96, misses: 0, reWarmUsd: 1.66,
    savedUsd: 11.4, readShare: 0.05, fresh: true, recalled: false, idleMs: null, coldAt: null, recovered: false, tokens: { sent: 18_000, back: 9_000, cached: 198_000 },
  },
  costUsd: 3.19, lastTurnUsd: 0.21, history: { costs: [], context: [], fiveHour: [] },
  context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: 190_000, autoCompactOff: false },
  fiveHour: { percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 30, resetsAt: new Date(67 * HOUR).toISOString() },
  samples: [], otherLimits: [], workspace: undefined, layout: 'chips', glyphs: 'unicode', utcOffsetMin: undefined,
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
  otherLimit80: /! spend \d+%|! NEAR LIMIT/,
}
/** Amber the collapsed part never shows: other limits are drawn only open (spec §2.7). */
const OPEN_ONLY: ReadonlySet<AmberReason> = new Set(['otherLimit80'])


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
  const kids = (node.children ?? []).filter(isDrawn)
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
  glyphs: Glyphs
  expanded: boolean
}>

/** A colour prop, at the top of a node's props or inside its `hover`. */
const COLOUR_PROPS: ReadonlySet<string> = new Set(['color', 'backgroundColor', 'borderColor'])
/** A paint in an Svg's source, as an attribute or a style: a hex, an `rgb()` or a name. */
const SVG_PAINT = /\b(?:fill|stroke|stop-color|color)\s*[=:]\s*["']?\s*(#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)/gi
/** The red names: the theme's error key and Ink's red keywords. */
const RED_NAME = /^(error|red|redBright)$/i
/** A hex colour, `fff` to `ffffff80`. */
const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i

/** Whether a colour's hue lies within 15° of pure red at more than half
 *  saturation. Amber sits near 40°. */
const isRed = (r: number, g: number, b: number): boolean => {
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  // With red the largest, the hue is 60° × (g − b) / chroma, either side of 0°.
  return max === r && chroma > max / 2 && Math.abs((60 * (g - b)) / chroma) <= 15
}
/** A colour's red, green and blue, when it is written in hex or `rgb()`. */
const channelsOf = (colour: string): readonly [number, number, number] | undefined => {
  const hex = colour.match(HEX)?.[1]
  if (hex !== undefined) {
    const pairs = hex.length <= 4 ? [...hex.slice(0, 3)].map(c => c + c) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)]
    const [r = 0, g = 0, b = 0] = pairs.map(pair => parseInt(pair, 16))
    return [r, g, b]
  }
  const rgb = colour.match(RGB)
  return rgb === null ? undefined : [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
}
/** Whether a colour is red: a red name, or a hex or `rgb()` of a red hue. */
const isRedColour = (colour: string): boolean => {
  const channels = channelsOf(colour)
  return RED_NAME.test(colour) || (channels !== undefined && isRed(...channels))
}
/** The colour props' values, at the top and one level into an object-valued
 *  prop such as `hover`. */
const colourProps = (props: Readonly<Record<string, unknown>>, nested = true): string[] =>
  Object.entries(props).flatMap(([key, value]) => {
    if (typeof value === 'string') return COLOUR_PROPS.has(key) ? [value] : []
    return nested && typeof value === 'object' && value !== null ? colourProps(value as Record<string, unknown>, false) : []
  })
/** Every colour a node paints: its colour props, and an Svg's paints. */
const coloursOf = (n: Node): string[] => {
  const source = n.type === 'Svg' && typeof n.props?.source === 'string' ? n.props.source : ''
  return [...colourProps(n.props ?? {}), ...[...source.matchAll(SVG_PAINT)].map(m => m[1] ?? '')]
}

/** What each glyph tier may draw (spec §3.2): the unicode tier's glyphs and braille, or ASCII alone. */
const UNICODE_TIER = /^[\x20-\x7e█░▒│·↻Σ◷◔▿▵…±●■–↑↓\u2800-\u28ff]*$/
const ASCII_TIER = /^[\x20-\x7e]*$/
/** What a value missing from a phrase leaves drawn (spec §2.8), in any case: departures upper-cases its own. */
const NOTHING = /\b(NaN|undefined|null)\b/i
/** What spec §2.9 bars from any Svg's markup: an id, a gradient, a pattern, a clipPath. */
const SVG_BARRED = /<(linearGradient|radialGradient|pattern|clipPath)\b|\bid=/
/** An alt that misstates its reading (spec §2.13): a share said as used or
 *  left, or a landing without its figure. */
const MISSTATED = new RegExp(`\\b(hit rate|${SPLIT_LABELS.join('|')}) \\d+% (used|left)|(?<!\\d percent) at its reset`)
/** A price or a fill time drawn without its `~` (spec §2.4). */
const UNMARKED = /re-warm \$|next message \$|full (in |at )?\d|on pace for \d/i

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

  // All-amber below 60 columns clips by design, ▿ pinned at the end; a
  // single amber reading still fits.
  const clipsByDesign = ctx.cols < 60 && ctx.scenario === ALL_AMBER
  const width = cellsOf(collapsed as RenderChildren, ctx.surface === 'desktop' ? DESKTOP : TERMINAL)
  if (!clipsByDesign && width > ctx.cols) fail('width', `${width} columns at ${ctx.cols}`)

  let nodes = 0
  const svgs: Node[] = []
  walk(tree, n => {
    nodes++
    if (n.type === 'Svg') svgs.push(n)
    for (const colour of coloursOf(n)) if (isRedColour(colour)) fail('colour', `red ${colour}`)
    if (ctx.surface === 'desktop') {
      for (const k of n.children ?? [])
        if (typeof k === 'string' && /^\s+$/.test(k)) fail('whitespace', `a whitespace-only child of a ${n.type}`)
    }
  })
  if (!svgDraws && svgs.length > 0) fail('svgPlacement', `${svgs.length} Svg where none draws`)
  for (const s of svgs) {
    const alt = s.props?.alt
    if (typeof alt !== 'string' || alt === '' || typeof s.props?.width !== 'number') fail('svgProps', 'an Svg without an alt or a width')
    if (s.props?.id !== undefined || SVG_BARRED.test(typeof s.props?.source === 'string' ? s.props.source : ''))
      fail('svgProps', 'an Svg with an id, a gradient, a pattern or a clipPath')
    if (typeof alt === 'string' && NOTHING.test(alt)) fail('empty', `an alt reads "${alt}"`)
    if (typeof alt === 'string' && MISSTATED.test(alt)) fail('alt', `an alt reads "${alt}"`)
  }

  const text = shown(tree)
  if (/send|keep (it )?warm/i.test(text)) fail('wording', 'suggests sending a message')
  for (const reason of amber)
    if ((ctx.expanded || !OPEN_ONLY.has(reason)) && !AMBER_WORDS[reason].test(text)) fail('amber', `no words for ${reason}`)
  if (UNMARKED.test(text)) fail('estimate', 'an estimate without ~')
  // A landing of 100% or more says `full before reset` (spec §2.1).
  if (/~\d{3,}%/.test(text)) fail('projection', 'a landing of 100% or more')
  // No scenario holds an empty context, so 0% is only ever an unreported one.
  if (/\b(context|ctx) 0%/i.test(text)) fail('unknown', 'context 0% where it is unknown')
  if (NOTHING.test(text)) fail('empty', 'NaN, undefined or null drawn')
  // In the ascii tier a glyph-only Text, such as an icon's `↻ `, maps to nothing.
  if (!ascii) {
    walk(collapsed, n => {
      if (n.type === 'Text' && shown(n) === '') fail('empty', 'an empty Text in the collapsed part')
    })
  }
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

export type SuiteCase = Readonly<{ name: string; options: CaseOptions; mounts: readonly Mount[] }>

const SUITE_WIDTHS = [40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200] as const
/** A mount on each surface, at the same width and height. */
const bothSurfaces = (cols: number, maxRows?: number): Mount[] => [{ surface: 'terminal', cols, maxRows }, { surface: 'desktop', cols, maxRows }]
/** The fewest rows that leave an open view a fact under each section title:
 *  its own rows, the air above the body and the buttons, the buttons, and a
 *  body of two rows, the strip in the footer. */
const factRows = (layout: LayoutName, surface: Surface): number => VIEWS[layout].rows[surface] + 5
/** The long walks take the 5-minute cache, a twelfth of the hour's ticks. Golden keeps the hour. */
const ttlOf = (scenario: ScenarioName): Ttl => (scenario === 'lastMinute' || scenario === 'cold' ? '5m' : '1h')

/** The suite's 35 cases, one setup each: every scenario at 120 columns; calm
 *  and the last minute in light, plain and the ascii tier, and at every
 *  width; the other amber scenarios narrow; calm and the open-only amber
 *  short of rows. */
export const suiteCases = (layout: LayoutName): SuiteCase[] => {
  const optionsOf = (scenario: ScenarioName, appearance: Appearance = 'dark', env?: Record<string, string>): CaseOptions =>
    ({ layout, scenario, appearance, ttl: ttlOf(scenario), env })
  return [
    ...SCENARIO_NAMES.map(scenario => ({ name: `${layout}: ${scenario}`, options: optionsOf(scenario), mounts: bothSurfaces(120) })),
    ...(['calm', ALL_AMBER] as const).flatMap(scenario => [
      { name: `${layout}: ${scenario}, light`, options: optionsOf(scenario, 'light'), mounts: bothSurfaces(120) },
      { name: `${layout}: ${scenario}, plain`, options: optionsOf(scenario, 'plain'), mounts: bothSurfaces(120) },
      { name: `${layout}: ${scenario}, ascii`, options: optionsOf(scenario, 'dark', { CC_BAND_GLYPHS: 'ascii' }), mounts: bothSurfaces(120) },
      ...(['terminal', 'desktop'] as const).map(surface => ({
        name: `${layout}: ${scenario}, every width, ${surface}`,
        options: optionsOf(scenario),
        mounts: SUITE_WIDTHS.map(cols => ({ surface, cols })),
      })),
    ]),
    ...(['fiveHourAhead', 'limit80', 'nearCompaction'] as const).map(scenario => ({
      name: `${layout}: ${scenario}, narrow`,
      options: optionsOf(scenario),
      mounts: [40, 50, 60].flatMap(cols => bothSurfaces(cols)),
    })),
    { name: `${layout}: calm, short of rows`, options: optionsOf('calm'), mounts: [4, 8, 13, 40].flatMap(maxRows => bothSurfaces(120, maxRows)) },
    // The open-only amber short of rows, on both grids, from the fewest rows
    // that keep a fact under each title.
    {
      name: `${layout}: gatewaySpend, short of rows`,
      options: optionsOf('gatewaySpend'),
      mounts: [80, 120].flatMap(cols => (['terminal', 'desktop'] as const).flatMap(surface =>
        [...new Set([factRows(layout, surface), 7, 8, 10])].map((maxRows): Mount => ({ surface, cols, maxRows })))),
    },
  ]
}

/** Registers one LONG test per case: one drawCases call, every tree checked
 *  shut and open, each failure named by its mount. */
export const viewSuite = (layout: LayoutName): void => {
  for (const c of suiteCases(layout)) {
    test(c.name, LONG, async ($, on) => {
      const trees = await drawCases($, on, c.options, c.mounts)
      const glyphs: Glyphs = c.options.env?.CC_BAND_GLYPHS === 'ascii' ? 'ascii' : 'unicode'
      for (const m of c.mounts) {
        for (const state of ['shut', 'open'] as const) {
          const key = caseKey(m, state)
          const tree = trees[key]
          const errors = tree === undefined
            ? ['missing: not drawn']
            : invariantErrors(tree, {
                layout, surface: m.surface, appearance: c.options.appearance, cols: m.cols, maxRows: m.maxRows ?? DEFAULT_MAX_ROWS,
                scenario: c.options.scenario, glyphs, expanded: state === 'open',
              })
          expect(`${key} ${errors.join('; ')}`).toBe(`${key} `)
        }
      }
    })
  }
}
