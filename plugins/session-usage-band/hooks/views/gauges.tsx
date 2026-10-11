// Gauges: how much room is left on each meter, and is it filling faster than
// the clock? Four bars on one scale in a 2×2 grid, this conversation's cache
// and context above the account's 5h and 7d limits, each limit notched where
// its window's time has gone; then the cost, and the toggle beneath it. Open,
// the shared cards, each with its bar in its head.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, splitBar } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { BarSize } from '../layout'
import type { LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { AMBER_LEAD, type Say } from '../words'
import { cardsView, tokenPartsOf, type Fact, type Slots } from './cards'
import { LIMITS, costPill, type ChipKey } from './chips'
import { toggleButton } from './frame'
import { accentOf, batteryBar, beforeLast, fitLineKeeps, pill, type Keeps } from './parts'
import { rowsOf, type Rows, type View } from './view'

/** What the grid gives up as it narrows, first to last: the paces, gauges'
 *  question, outlast the bars' full length. An amber gauge holds its reason
 *  until the last step, when it says its figure alone. */
const ORDER = ['resets', 'room', 'reWarm', 'bars', 'paces', 'units', 'smallBars', 'names'] as const
type Piece = (typeof ORDER)[number]

/** One length for every bar, so the four line up; narrow, half of it. */
const BAR: BarSize = { px: 90, cells: 12 }
const SMALL_BAR: BarSize = { px: 45, cells: 6 }
/** A card head's bar: a few cells, and on the desktop 16px tall at most. */
const SLOT_BAR: BarSize = { px: 60, cells: 6 }

/** Words after a gauge's reading: the piece they give way as, and the card
 *  facts they say, so the cards skip them while the row keeps it. */
type Qualifier = Readonly<{ text: string; piece: Piece; facts: readonly Fact[] }>

/** A gauge's pieces, built once for the squeeze to pick from. */
type Gauge = Readonly<{
  key: string
  tone: Tone
  /** The pill's ground: a limit's tint, else the band's surface. */
  bg?: string
  icon: readonly [Icon, string]
  name: string
  /** The name on the narrowest grid. */
  short?: string
  nameInk: string
  valueInk: string
  bar: ((size: BarSize) => RenderChildren) | undefined
  say: Say
  /** Its figure alone, once the grid drops the words beside it. */
  sayShort: Say
  more: readonly Qualifier[]
  /** The card fact its name, bar and figure say: a limit's `window:5h`. */
  window?: Fact
}>

const cacheGauge = (kit: Kit, read: Readings): Gauge => {
  const { palette } = kit
  const c = read.cache
  return {
    key: 'cache',
    tone: c.tone,
    icon: ['cache', palette.warm],
    name: 'cache',
    nameInk: palette.label,
    valueInk: palette.value,
    // Its time left drains: unmeasured or warming, there is none to show.
    bar: c.known ? size => batteryBar(kit, c.charge, c.tone, c.alt, size) : undefined,
    say: c.gaugeSay,
    sayShort: c.gaugeShort,
    more: c.gaugeMore === undefined ? [] : [{ text: c.gaugeMore, piece: 'reWarm', facts: ['reWarm'] }],
  }
}

const contextGauge = (kit: Kit, read: Readings): Gauge => {
  const { palette } = kit
  const x = read.context
  return {
    key: 'ctx',
    tone: x.tone,
    icon: ['context', palette.label],
    name: 'context',
    short: 'ctx',
    nameInk: palette.label,
    valueInk: palette.value,
    // Measured toward compaction when it is on, so its end is that point.
    bar: x.known ? size => meter(kit, { key: 'bar', label: 'context', frac: x.frac, tone: x.tone, accent: palette.meterFill, size }) : undefined,
    say: x.gaugeSay,
    sayShort: x.gaugeShort,
    more: x.gaugeMore === undefined ? [] : [{ text: x.gaugeMore, piece: 'room', facts: ['room'] }],
  }
}

/** A limit in chips' tint, notched where its window's time has gone and
 *  dashed where its pace lands. Passed, its last reading is from before the
 *  reset, so it has no bar, as chips draws it. With none used, the window
 *  may not have begun, so it says no reset either: its figure alone. */
const limitGauge = (kit: Kit, read: Readings, l: LimitView, key: ChipKey): Gauge => {
  const { palette, onTone } = kit
  const spec = LIMITS[key]
  const tint = spec.tint(palette)
  // Only the worst window's also say the LIMITS card's lead row.
  const worst = l === read.worstLimit
  // Passed, `reset` is a word, not a figure, so it is not bold.
  const value: Say = [[l.valueText, l.passed ? 'label' : 'value']]
  return {
    key,
    tone: l.tone,
    bg: tint.bg,
    icon: [spec.icon, tint.accent],
    name: l.name,
    nameInk: tint.fg,
    valueInk: tint.fg,
    bar: l.passed
      ? undefined
      : size =>
          meter(kit, {
            key: 'bar',
            label: l.name,
            frac: l.frac,
            tone: l.tone,
            accent: tint.accent,
            size,
            tick: l.notch,
            projectTo: l.projectedFrac,
            ground: onTone(l.tone, tint.bg, palette.amberBg),
          }),
    say: value,
    sayShort: value,
    more: [
      ...(l.pace === '' ? [] : [{ text: l.pace, piece: 'paces', facts: [`pace:${key}` as const, ...(worst ? (['pace'] as const) : [])] } as const]),
      ...(l.resetAtGlyph === undefined || l.percentUsed === 0
        ? []
        : [{ text: l.resetAtGlyph, piece: 'resets', facts: [`reset:${key}` as const, ...(worst ? (['reset'] as const) : [])] } as const]),
    ],
    window: `window:${key}`,
  }
}

/** The qualifiers a gauge keeps at a squeeze: calm, those not yet given way;
 *  amber, its whole reason until the last step. */
const keptMore = (g: Gauge, keeps: Keeps<Piece>): readonly Qualifier[] =>
  g.tone === 'amber' ? (beforeLast(keeps) ? g.more : []) : g.more.filter(q => keeps.has(q.piece))

/** The card facts a gauge says at a squeeze: its window while its bar is
 *  kept (a passed one has none), and its kept qualifiers'. */
const factsOf = (g: Gauge, keeps: Keeps<Piece>): Fact[] => [
  ...(g.window !== undefined && (g.bar === undefined || keeps.has('smallBars')) ? [g.window] : []),
  ...keptMore(g, keeps).flatMap(q => q.facts),
]

/** A gauge's name as drawn, led by amber's mark. */
const nameOf = (g: Gauge, keeps: Keeps<Piece>): string => `${g.tone === 'amber' ? AMBER_LEAD : ''}${keeps.has('names') ? g.name : (g.short ?? g.name)}`

/** A gauge in its pill: icon, name in its column's width, bar, then its
 *  reading, bold on its figure alone. */
const gaugePill = (kit: Kit, g: Gauge, nameCells: number, keeps: Keeps<Piece>): RenderElement => {
  const { Box, Text, Svg, palette, onTone, icon } = kit
  const ink = (calm: string) => onTone(g.tone, calm)
  const bar = g.bar !== undefined && keeps.has('smallBars') ? g.bar(keeps.has('bars') ? BAR : SMALL_BAR) : null
  const said: Say = [...(keeps.has('units') ? g.say : g.sayShort), ...keptMore(g, keeps).flatMap((q): Say => [[' · ', 'label'], [q.text, 'label']])]
  return pill(kit, {
    key: g.key,
    tone: g.tone,
    bg: g.bg,
    body: [
      // Desktop alone: a terminal gauge leads with its name.
      ...(Svg ? icon(g.icon[0], ink(g.icon[1])) : []),
      // Spaced by the row's gap: the desktop drops a string of spaces.
      <Box key="gauge" flexDirection="row" columnGap={1}>
        <Box key="name" minWidth={nameCells} flexShrink={0}>
          <Text color={ink(g.nameInk)}>{nameOf(g, keeps)}</Text>
        </Box>
        {bar}
        <Text key="say">
          {said.map(([text, role], i) => (
            <Text key={`s${i}`} color={ink(role === 'value' ? g.valueInk : palette.label)} {...(role === 'value' ? { bold: true } : {})}>
              {text}
            </Text>
          ))}
        </Text>
      </Box>,
    ],
  })
}

/** The gauges in their columns: the cache over the 5h, the context over the 7d. */
const columnsOf = (kit: Kit, read: Readings): ReadonlyArray<readonly [string, readonly Gauge[]]> => {
  const limit = (l: LimitView | undefined, key: ChipKey) => (l === undefined ? [] : [limitGauge(kit, read, l, key)])
  return [
    ['first', [cacheGauge(kit, read), ...limit(read.fiveHour, '5h')]],
    ['second', [contextGauge(kit, read), ...limit(read.sevenDay, '7d')]],
  ]
}

/** The collapsed grid, squeezed until it fits, and the card facts it kept. */
const collapsed = (kit: Kit, read: Readings, act: BandActions): Readonly<{ grid: RenderElement; shown: Fact[] }> => {
  const { Box, measure } = kit
  const columns = columnsOf(kit, read)
  // The cost's hover card is chips' row's; gauges draws none.
  const cost = pill(kit, { ...costPill(kit, read), hover: undefined })
  const toggle = toggleButton(kit, read, act)
  const { line: grid, keeps: kept } = fitLineKeeps(kit, ORDER, kit.columns - ROW_SLACK, keeps => (
    <Box key="gauges" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
      {columns.map(([key, gauges]) => {
        // A column's names share their widest's width, so its bars line up;
        // its pills stretch to its widest, so their grounds end together.
        const nameCells = Math.ceil(Math.max(...gauges.map(g => [...nameOf(g, keeps)].length)) * measure.text)
        return (
          <Box key={key} flexDirection="column" alignItems="stretch" flexShrink={0}>
            {gauges.map(g => gaugePill(kit, g, nameCells, keeps))}
          </Box>
        )
      })}
      <Box key="air" flexGrow={1} />
      <Box key="end" flexDirection="column" alignItems="flex-end" flexShrink={0}>
        {cost}
        {toggle}
      </Box>
    </Box>
  ))
  return { grid, shown: columns.flatMap(([, gauges]) => gauges.flatMap(g => factsOf(g, kept))) }
}

/** Each card's head carries its gauge's bar: the battery, the token split,
 *  the context's fill, and the worst window notched and dashed. */
const slots = (kit: Kit, read: Readings): Slots => {
  const { palette } = kit
  const { cache, context } = read
  const worst = read.worstLimit
  return {
    cache: cache.known ? batteryBar(kit, cache.charge, cache.tone, cache.alt, SLOT_BAR) : undefined,
    spend: cache.measured
      ? splitBar(kit, { alt: 'token split: input, output, cache reads', parts: tokenPartsOf(kit, read).map(([, part]) => part), size: SLOT_BAR })
      : undefined,
    context: context.known ? meter(kit, { label: 'context', frac: context.frac, tone: context.tone, accent: palette.meterFill, size: SLOT_BAR, stretch: true }) : undefined,
    limits:
      worst === undefined
        ? undefined
        : meter(kit, {
            label: worst.name,
            frac: worst.frac,
            tone: worst.tone,
            accent: accentOf(kit, worst),
            size: SLOT_BAR,
            stretch: true,
            tick: worst.notch,
            projectTo: worst.projectedFrac,
          }),
  }
}

const ROWS: Rows = { desktop: 2, terminal: 2 }

/** Drawn as `defineCardsView` draws a layout, but its lens reads the squeezed
 *  grid: the cards skip only what the row kept. */
export const gaugesView: View = {
  name: 'gauges',
  rows: ROWS,
  draw: (kit, read, act) => {
    const { grid, shown } = collapsed(kit, read, act)
    // An amber window's headline is led by its mark, as its gauge is.
    const amberHead = read.worstLimit?.amberHead
    return cardsView(kit, read, act, [grid], {
      collapsedRows: rowsOf({ rows: ROWS }, kit),
      slots: slots(kit, read),
      heads: amberHead === undefined ? {} : { limits: amberHead },
      shown,
    })
  },
}
