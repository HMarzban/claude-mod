// Pulse open: a stack of full-width bands under the collapsed row, each its
// chart on the left and its words on the right, in the one order: Cache,
// Spend, Context, Limits (5h and 7d side by side), then the other limits as
// words (spec §4.2). Each band fits its room: its words first, phrase by
// phrase, then its chart in what they leave, none under the least. Short of
// rows, the bands give way by STEPS; the footer, with the strip in its row,
// stays.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, chartFit, dayCells, dayCellsFit, sparkline } from '../charts'
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
 *  rows; or its words alone. */
type Size = 'chart' | 'two' | 'words'
type Step = Readonly<Partial<Record<Band, Size>>>

/** What the stack draws at each step, first to last (spec §4.2's give-way):
 *  every band; Other gone; Context gone; Limits at two rows, then words;
 *  Spend to words; Cache gone; nothing. The stack takes the first whose
 *  bands, as they draw, fit. */
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

/** On the desktop a row is 24 px: a chart of two rows is 40 px and one of
 *  three 64, each with 8 px of air above it, so its band is whole rows. */
const SPEND_ROWS = 2
const CONTEXT_ROWS = 2
const CHART_PX = { 2: 40, 3: 64 } as const
const DAY_PX = { 2: 38, 3: 62 } as const
const AIR_PX = 8
/** The widest each chart is drawn: a line or the beats, the cache's drain,
 *  and a day cell. */
const LINE_PX = 240
const DRAIN_PX = 120
const DAY_CELL_PX = 18
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

/** The columns a band's name takes before its words, a column apart. */
const nameRoom = (kit: Kit, name: string | undefined): number => (name === undefined ? 0 : cellsIn(kit, name) + 1)

/** A band: its chart, if drawn, then its name in a label's ink, if it has
 *  one, and its words in their ink, on one line. */
const band = (kit: Kit, key: string, chart: RenderChildren, name: string | undefined, words: string, amber: boolean): RenderElement => {
  const { Box, Text, palette, onTone, oneLine } = kit
  return (
    <Box key={key} flexDirection="row" columnGap={1}>
      {chart === null ? null : <Box key="chart" flexShrink={0}>{chart}</Box>}
      <Box key="words" flexShrink={0} flexDirection="row" columnGap={1}>
        {name === undefined ? null : <Text key="name" color={palette.label}>{name}</Text>}
        {oneLine({ key: 'w', color: onTone(amber ? 'amber' : 'calm', palette.value) }, words)}
      </Box>
    </Box>
  )
}

/** A chart's rows: on the desktop its own, in text the line it shares. */
const rowsOf = (kit: Kit, drawn: boolean, rows: number): number => (kit.Svg && drawn ? rows : 1)

/** A limit's half of the Limits band in `room` columns: its chart, at
 *  `size`, beside its words. */
const limitHalf = (kit: Kit, read: Readings, l: LimitView, size: Size, room: number): Drawn => {
  const { Svg, palette } = kit
  const { week } = read
  // The name leads the words: what is left of the room is theirs.
  const left = room - nameRoom(kit, l.bandName)
  const words = fitWords(kit, l.bandWords, left)
  const tall = size === 'two' ? 2 : 3
  const ink = l.tone === 'amber' ? palette.amberFg : l.key === '5h' ? palette.fiveAccent : palette.weekAccent
  const charts = read.frame.glyphs === 'unicode' && size !== 'words'
  let chart: RenderChildren = null
  if (charts && l.key === '5h' && week.fiveHourWindow.values.length > 1) {
    const px = chartFit(kit, left, words, LINE_PX, week.fiveHourWindow.values.length)
    if (px !== undefined)
      chart = sparkline(kit, { key: 'trail', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, color: ink, px, height: CHART_PX[tall], air: AIR_PX, max: 100 })
  }
  // The day cells are the desktop's: in text the 7d is words.
  if (charts && Svg && l.key === '7d' && week.daysDrawn.measured) {
    const days = week.daysDrawn
    const px = chartFit(kit, left, words, LINE_PX, days.values.length)
    const cellPx = px === undefined ? undefined : dayCellsFit(px, days.values.length, DAY_CELL_PX)
    if (cellPx !== undefined)
      chart = dayCells(kit, { key: 'days', alt: week.daysAlt, values: days.values, guess: days.guess, today: days.today, color: ink, cellPx, height: DAY_PX[tall], air: AIR_PX, max: 100 })
  }
  return { el: band(kit, l.key, chart, l.bandName, words, l.amber !== undefined), rows: rowsOf(kit, chart !== null, tall) }
}

/** Limits: 5h and 7d side by side, each in half the room, while their
 *  words fit there; else 5h over 7d, each in the whole room. In text at
 *  full size always 5h's line over 7d's. */
const limitsBand = (kit: Kit, read: Readings, size: Size, room: number): Drawn | undefined => {
  const { Box } = kit
  const halves = [read.fiveHour, read.sevenDay].filter((l): l is LimitView => l !== undefined)
  if (halves.length === 0) return undefined
  const half = (room - 2) / 2
  const across = halves.length === 1 || ((kit.Svg !== undefined || size === 'words') && halves.every(l => nameRoom(kit, l.bandName) + cellsIn(kit, l.bandWords.join(DOT)) <= half))
  const drawn = halves.map(l => limitHalf(kit, read, l, size, across && halves.length > 1 ? half : room))
  const el = (
    <Box key="band:limits" flexDirection={across ? 'row' : 'column'} columnGap={2}>
      {drawn.map(d => d.el)}
    </Box>
  )
  return { el, rows: across ? Math.max(...drawn.map(d => d.rows)) : drawn.reduce((n, d) => n + d.rows, 0) }
}

/** The bands of one step, in the one order, each as it draws in `room`;
 *  a band with nothing to say is left out. */
const bands = (kit: Kit, read: Readings, step: Step, room: number): Drawn[] => {
  const { Text, palette } = kit
  const { cache, context, history: hist } = read
  const charts = read.frame.glyphs === 'unicode'
  const drawn: Drawn[] = []
  if (step.cache !== undefined) {
    const left = room - nameRoom(kit, cache.bandName)
    const words = fitWords(kit, cache.bandWords, left)
    const px = charts ? chartFit(kit, left, words, DRAIN_PX, 2) : undefined
    // Inked by its mood: amber in its last minute, warm green while warm, a
    // label's ink cold, unmeasured or warming.
    const ink = cache.tone === 'amber' ? palette.amberFg : cache.mood === 'warm' ? palette.warm : palette.label
    const chart = px === undefined ? null : sparkline(kit, { key: 'drain', alt: cache.heartAlt, values: [1, cache.charge], color: ink, px, height: 16, max: 1 })
    drawn.push({ el: band(kit, 'band:cache', chart, cache.bandName, words, cache.amber !== undefined), rows: 1 })
  }
  if (step.spend !== undefined) {
    const left = room - nameRoom(kit, hist.spendBandName)
    const words = fitWords(kit, hist.spendBandWords, left)
    const px = charts && step.spend === 'chart' && !hist.empty ? chartFit(kit, left, words, LINE_PX, BEATS) : undefined
    // No cost yet: the words for that in the trace's place, while they fit.
    const empty = step.spend === 'chart' && hist.empty && cellsIn(kit, words) + 1 + cellsIn(kit, EMPTY.costs) <= left
    const chart = empty ? <Text key="empty" color={palette.label}>{EMPTY.costs}</Text>
      : px === undefined ? null
      : barChart(kit, { key: 'beats', alt: hist.costsAltOf(BEATS), values: hist.costValues.slice(-BEATS), marked: hist.reWarms.slice(-BEATS), level: hist.warmAvgUsd, color: palette.value, markColor: palette.value, px, height: CHART_PX[SPEND_ROWS], air: AIR_PX, max: hist.beatsTop })
    drawn.push({ el: band(kit, 'band:spend', chart, hist.spendBandName, words, false), rows: rowsOf(kit, px !== undefined, SPEND_ROWS) })
  }
  if (step.context !== undefined) {
    const left = room - nameRoom(kit, context.bandName)
    const words = fitWords(kit, context.bandWords, left)
    const px = charts && hist.context.length > 1 ? chartFit(kit, left, words, LINE_PX, hist.context.length) : undefined
    const chart = px === undefined ? null
      : sparkline(kit, { key: 'trail', alt: hist.contextTrailAlt, values: hist.context, color: palette.label, px, height: CHART_PX[CONTEXT_ROWS], air: AIR_PX, max: context.compactAt ?? context.window, level: context.compactAt === undefined ? undefined : 1 })
    drawn.push({ el: band(kit, 'band:context', chart, context.bandName, words, context.amber !== undefined), rows: rowsOf(kit, chart !== null, CONTEXT_ROWS) })
  }
  const limits = step.limits === undefined ? undefined : limitsBand(kit, read, step.limits, room)
  if (limits !== undefined) drawn.push(limits)
  const others = read.limits.filter(l => l.key === 'other')
  if (step.other !== undefined && others.length > 0)
    drawn.push({ el: band(kit, 'band:other', null, undefined, fitWords(kit, others.flatMap(l => l.bandWords), room), others.some(l => l.amber !== undefined)), rows: 1 })
  return drawn
}

/** The first step whose bands, as drawn, fit `rows`: Other kept at every
 *  step while it is amber (spec §2.1: an amber reading never gives way);
 *  none when not even that fits. */
const fitted = (kit: Kit, read: Readings, rows: number, room: number): Drawn[] => {
  const amberOther = read.limits.some(l => l.key === 'other' && l.amber !== undefined)
  for (const step of STEPS) {
    const drawn = bands(kit, read, amberOther ? { ...step, other: 'words' } : step, room)
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
