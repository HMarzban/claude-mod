// Pulse open: a stack of full-width bands under the collapsed row, in the
// one order: Cache, Spend, Context, Limits (5h and 7d side by side, or one
// over the other), then the other limits as words (spec §4.2). The stack is
// a grid: every band's chart at one width, fitted once to the room, then a
// name column as wide as the longest name, then its words and any note.
// A band with too little to chart draws its chart flat, so the grid keeps
// its look. Short of rows, the calm bands give way by STEPS, an amber one
// never; the footer, with the strip in its row, stays.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, dayCells, dayCellsFit, flatBeats, sparkline, stackGrid, type StackGrid } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { drawStrip } from '../strip'
import { EMPTY } from '../words'
import { bodyRowsFor, footer, footerRoom } from './frame'

const DOT = ' · '

type Band = 'cache' | 'spend' | 'context' | 'limits' | 'other'
/** How much of a band is drawn: its chart at full size; Limits' at two
 *  rows; or one row, its chart the row's height. */
type Size = 'chart' | 'two' | 'words'
type Step = Readonly<Partial<Record<Band, Size>>>

/** What the stack draws at each step, first to last (spec §4.2's give-way):
 *  every band; Other gone; Context gone; Limits at two rows, then one;
 *  Spend to one; Cache gone; nothing. The stack takes the first whose
 *  bands, as they draw, fit; an amber band is kept at every step (fitted). */
const STEPS: readonly Step[] = [
  { cache: 'chart', spend: 'chart', context: 'chart', limits: 'chart', other: 'words' },
  { cache: 'chart', spend: 'chart', context: 'chart', limits: 'chart' },
  { cache: 'chart', spend: 'chart', limits: 'chart' },
  { cache: 'chart', spend: 'chart', limits: 'two' },
  { cache: 'chart', spend: 'chart', limits: 'words' },
  { cache: 'chart', spend: 'words', limits: 'words' },
  { spend: 'words', limits: 'words' },
  {},
]

/** On the desktop a row is 24 px: a chart of one row is 16 px; of two, 40;
 *  of three, 64; each taller than one with 8 px of air above it, so its band
 *  is whole rows. */
const CHART_PX = { 1: 16, 2: 40, 3: 64 } as const
const DAY_PX = { 1: 14, 2: 38, 3: 62 } as const
const AIR_PX = { 1: 0, 2: 8, 3: 8 } as const
type Rows = keyof typeof CHART_PX
/** The rows each size of band takes: Spend and Context two, Limits three
 *  side by side and two a line one over the other. */
const SPEND_ROWS: Readonly<Record<Size, Rows>> = { chart: 2, two: 2, words: 1 }
const CONTEXT_ROWS: Rows = 2
const ACROSS_ROWS: Readonly<Record<Size, Rows>> = { chart: 3, two: 2, words: 1 }
const OVER_ROWS: Readonly<Record<Size, Rows>> = { chart: 2, two: 1, words: 1 }
/** Px kept above the context's scale, so its compaction line sits in its own chart. */
const HEADROOM_PX = 8
/** The widest day cell. */
const DAY_CELL_PX = 32
/** The beats open: the last 24 messages. */
const BEATS = 24

/** A band as drawn, and the rows it takes. */
type Drawn = Readonly<{ el: RenderElement; rows: number }>

/** The columns text takes. */
const cellsIn = (kit: Kit, text: string): number => [...text].length * kit.measure.text

/** The phrases joined by DOT, as many as fit `room` from the first; the
 *  first always, which the surface cuts if it must. */
const fitWords = (kit: Kit, phrases: readonly string[], room: number): string => {
  let words = phrases[0] ?? ''
  for (const p of phrases.slice(1)) {
    const longer = `${words}${DOT}${p}`
    if (cellsIn(kit, longer) > room) break
    words = longer
  }
  return words
}

/** A line of the grid: its chart in the chart column, its name in the name
 *  column in a label's ink, then its words in their ink and any note in a
 *  label's. In text the chart column has its width; on the desktop every
 *  chart is the grid's width. */
const gridLine = (kit: Kit, grid: StackGrid, key: string, chart: RenderChildren, name: string | undefined, words: string, amber: boolean, note?: string): RenderElement => {
  const { Box, Text, Svg, palette, onTone, oneLine } = kit
  const column = grid.chart
  return (
    <Box key={key} flexDirection="row" columnGap={1}>
      {column === undefined ? null : <Box key="chart" flexShrink={0} {...(Svg && chart !== null ? {} : { width: column.cells })}>{chart}</Box>}
      <Box key="name" flexShrink={0} width={grid.name}>{name === undefined ? null : <Text key="name" color={palette.label}>{name}</Text>}</Box>
      <Box key="words" flexShrink={0} flexDirection="row" columnGap={1}>
        {oneLine({ key: 'w', color: onTone(amber ? 'amber' : 'calm', palette.value) }, words)}
        {note === undefined ? null : <Text key="note" color={palette.label}>{note}</Text>}
      </Box>
    </Box>
  )
}

/** A chart's rows: on the desktop its own, where drawn; in text, or with
 *  its cell empty, the line it shares with its words. */
const rowsOf = (kit: Kit, grid: StackGrid, rows: Rows, drawn = true): number => (kit.Svg && grid.chart !== undefined && drawn ? rows : 1)

/** The flat chart a band draws with too little to chart: its baseline, dim. */
const flat = (kit: Kit, grid: StackGrid, alt: string, rows: Rows): RenderChildren =>
  grid.chart === undefined ? null
  : flatBeats(kit, { key: 'flat', alt, beats: 2 * grid.chart.cells, color: kit.palette.label, px: grid.chart.px, height: CHART_PX[rows], air: AIR_PX[rows] })

/** A limit's line in `room` columns: its chart, `rows` tall, its name, its words. */
const limitLine = (kit: Kit, read: Readings, grid: StackGrid, l: LimitView, rows: Rows, room: number): Drawn => {
  const { Svg, palette } = kit
  const { week } = read
  const words = fitWords(kit, l.bandWords, room - grid.lead)
  const ink = l.tone === 'amber' ? palette.amberFg : l.key === '5h' ? palette.fiveAccent : palette.weekAccent
  const column = grid.chart
  // Without readings to chart, no chart: a flat line would read as 0%. Its
  // cell stays empty, so the grid keeps its columns (spec §4.1: words only).
  let chart: RenderChildren = null
  if (column !== undefined && l.key === '5h' && week.fiveHourWindow.values.length > 1)
    chart = sparkline(kit, { key: 'trail', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, from: week.fiveHourWindow.from, color: ink, px: column.px, height: CHART_PX[rows], air: AIR_PX[rows], max: 100 })
  // The day cells are the desktop's: in text the 7d's chart cell is empty.
  if (column !== undefined && Svg && l.key === '7d' && week.daysDrawn.measured) {
    const days = week.daysDrawn
    const cellPx = dayCellsFit(column.px, days.values.length, DAY_CELL_PX)
    if (cellPx !== undefined)
      chart = dayCells(kit, { key: 'days', alt: week.daysAlt, values: days.values, guess: days.guess, today: days.today, color: ink, cellPx, height: DAY_PX[rows], air: AIR_PX[rows], max: 100, px: column.px })
  }
  return { el: gridLine(kit, grid, l.key, chart, l.bandName, words, l.amber !== undefined), rows: rowsOf(kit, grid, rows, chart !== null) }
}

/** Limits: 5h and 7d side by side, each in half the room, while their
 *  words fit there beside the grid; else 5h over 7d, each a line of the
 *  grid in the whole room. */
const limitsBand = (kit: Kit, read: Readings, grid: StackGrid, size: Size, room: number): Drawn | undefined => {
  const { Box } = kit
  const halves = [read.fiveHour, read.sevenDay].filter((l): l is LimitView => l !== undefined)
  if (halves.length === 0) return undefined
  const half = (room - 2) / 2
  const across = halves.length === 1 || halves.every(l => grid.lead + cellsIn(kit, l.bandWords.join(DOT)) <= half)
  const rows = across ? ACROSS_ROWS[size] : OVER_ROWS[size]
  const drawn = halves.map(l => limitLine(kit, read, grid, l, rows, across && halves.length > 1 ? half : room))
  const el = (
    <Box key="band:limits" flexDirection={across ? 'row' : 'column'} columnGap={2}>
      {drawn.map(d => d.el)}
    </Box>
  )
  return { el, rows: across ? Math.max(...drawn.map(d => d.rows)) : drawn.reduce((n, d) => n + d.rows, 0) }
}

/** The bands of one step, in the one order, each a line of the grid in
 *  `room`; a band with nothing to say is left out. */
const bands = (kit: Kit, read: Readings, grid: StackGrid, step: Step, room: number): Drawn[] => {
  const { palette } = kit
  const { cache, context, history: hist } = read
  const column = grid.chart
  const left = room - grid.lead
  const drawn: Drawn[] = []
  if (step.cache !== undefined) {
    const words = fitWords(kit, cache.bandWords, left)
    // Inked by its mood: amber in its last minute, warm green while warm, a
    // label's ink cold (its line at 0, which is true). Unmeasured or warming,
    // its level isn't known: no drain, its cell empty.
    const ink = cache.tone === 'amber' ? palette.amberFg : cache.mood === 'warm' ? palette.warm : palette.label
    const unknown = cache.mood === 'unmeasured' || cache.mood === 'warming'
    const chart = column === undefined || unknown ? null : sparkline(kit, { key: 'drain', alt: cache.heartAlt, values: [1, cache.charge], color: ink, px: column.px, height: CHART_PX[1], max: 1 })
    drawn.push({ el: gridLine(kit, grid, 'band:cache', chart, cache.bandName, words, cache.amber !== undefined), rows: 1 })
  }
  if (step.spend !== undefined) {
    const rows = SPEND_ROWS[step.spend]
    const words = fitWords(kit, hist.spendBandWords, left)
    // No cost yet: after the words, the long note while it fits, else the
    // short; the chart flat only beside one, since alone it would read as $0
    // a message, else its cell empty.
    const fits = (note: string) => cellsIn(kit, words) + 1 + cellsIn(kit, note) <= left
    const note = !hist.empty ? undefined : [EMPTY.costs, EMPTY.costsShort].find(fits)
    const beats = column === undefined ? 0 : kit.Svg ? BEATS : Math.min(BEATS, 2 * column.cells)
    const chart = column === undefined ? null
      : hist.empty ? (note === undefined ? null : flat(kit, grid, EMPTY.costsAlt, rows))
      : barChart(kit, { key: 'beats', alt: hist.costsAltOf(beats), values: hist.costValues.slice(-beats), marked: hist.reWarms.slice(-beats), level: hist.warmAvgUsd, color: palette.value, markColor: palette.value, px: column.px, height: CHART_PX[rows], air: AIR_PX[rows], max: hist.beatsTop })
    drawn.push({ el: gridLine(kit, grid, 'band:spend', chart, hist.spendBandName, words, false, note), rows: rowsOf(kit, grid, rows, chart !== null) })
  }
  if (step.context !== undefined) {
    const words = fitWords(kit, context.bandWords, left)
    const turns = column === undefined ? 0 : kit.Svg ? hist.context.length : 2 * column.cells
    // Fewer than two turns: the line flat at its level now, which is known;
    // not reported, no chart, its cell empty.
    const values = hist.context.length > 1 ? hist.context.slice(-turns) : context.known ? Array.from({ length: Math.max(2, turns) }, () => context.used) : []
    const chart = column === undefined || values.length === 0 ? null
      : sparkline(kit, { key: 'trail', alt: hist.contextTrailAlt, values, color: palette.label, px: column.px, height: CHART_PX[CONTEXT_ROWS], air: AIR_PX[CONTEXT_ROWS], headroom: HEADROOM_PX, max: context.compactAt ?? context.window, level: context.compactAt === undefined ? undefined : 1 })
    drawn.push({ el: gridLine(kit, grid, 'band:context', chart, context.bandName, words, context.amber !== undefined), rows: rowsOf(kit, grid, CONTEXT_ROWS, chart !== null) })
  }
  const limits = step.limits === undefined ? undefined : limitsBand(kit, read, grid, step.limits, room)
  if (limits !== undefined) drawn.push(limits)
  const others = read.limits.filter(l => l.key === 'other')
  if (step.other !== undefined && others.length > 0)
    drawn.push({ el: gridLine(kit, grid, 'band:other', null, undefined, fitWords(kit, others.flatMap(l => l.bandWords), left), others.some(l => l.amber !== undefined)), rows: 1 })
  return drawn
}

/** The first step whose bands, as drawn, fit `rows`, every amber band kept
 *  at every step (spec §2.1: an amber reading never gives way): Cache in
 *  its last minute, Context near compaction, Limits with 5h or 7d amber, at
 *  least as words, and Other. A band the step keeps keeps the step's size.
 *  None when not even that fits. */
const fitted = (kit: Kit, read: Readings, rows: number, room: number): Drawn[] => {
  const { cache, context, history: hist, fiveHour, sevenDay } = read
  const amber: Step = {
    ...(cache.amber !== undefined ? { cache: 'chart' } : {}),
    ...(context.amber !== undefined ? { context: 'chart' } : {}),
    ...(fiveHour?.amber !== undefined || sevenDay?.amber !== undefined ? { limits: 'words' } : {}),
    ...(read.limits.some(l => l.key === 'other' && l.amber !== undefined) ? { other: 'words' } : {}),
  }
  const names = [cache.bandName, hist.spendBandName, context.bandName, ...[fiveHour, sevenDay].flatMap(l => (l === undefined ? [] : [l.bandName]))]
  const grid = stackGrid(kit, room, names, read.frame.glyphs === 'unicode')
  for (const step of STEPS) {
    const drawn = bands(kit, read, grid, { ...amber, ...step }, room)
    if (drawn.reduce((n, d) => n + d.rows, 0) <= rows) return drawn
  }
  return []
}

/** Pulse open: the stack, its bands fitted to the body's rows and the
 *  row's room, then the footer, the strip in its row. */
export const openStack = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box } = kit
  const ws = read.workspace
  const room = kit.columns - ROW_SLACK
  const strip = ws === undefined ? undefined : drawStrip(kit, ws, 'footer', 0, room - footerRoom(kit))
  const drawn = fitted(kit, read, bodyRowsFor(read.frame.maxRows, 1, 0), room)
  const stack = drawn.length === 0 ? null : <Box key="stack" flexDirection="column" marginTop={1}>{drawn.map(d => d.el)}</Box>
  return [stack, footer(kit, act, strip)].filter(e => e !== null)
}
