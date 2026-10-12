// Pulse open: a stack of full-width bands under the collapsed row, each its
// chart on the left and its words on the right, in the one order: Cache,
// Spend, Context, Limits (5h and 7d side by side), then the other limits as
// words (spec §4.2). Short of rows, the bands give way by STEPS; the footer,
// with the strip in its row, stays.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, dayCells, sparkline } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Readings } from '../reading'
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
 *  Spend to words; Cache gone; nothing. The stack takes the first that fits. */
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

/** The rows each band takes at each size: on the desktop a row is 24 px, a
 *  two-row chart 40 px and a three-row one 64, each with 8 px of air above
 *  it; in text each band is a line of braille beside its words, Limits two,
 *  5h's over 7d's, until it is words. */
const ROWS: Readonly<Record<'desktop' | 'terminal', Readonly<Record<Band, Readonly<Record<Size, number>>>>>> = {
  desktop: {
    cache: { chart: 1, two: 1, words: 1 },
    spend: { chart: 2, two: 2, words: 1 },
    context: { chart: 2, two: 2, words: 1 },
    limits: { chart: 3, two: 2, words: 1 },
    other: { chart: 1, two: 1, words: 1 },
  },
  terminal: {
    cache: { chart: 1, two: 1, words: 1 },
    spend: { chart: 1, two: 1, words: 1 },
    context: { chart: 1, two: 1, words: 1 },
    limits: { chart: 2, two: 2, words: 1 },
    other: { chart: 1, two: 1, words: 1 },
  },
}
/** A chart's px by its rows, and the air above it that makes them whole. */
const CHART_PX = { 2: 40, 3: 64 } as const
const AIR_PX = 8
const DAY_PX = { 2: 38, 3: 62 } as const

/** Phrases joined by DOT, the missing and the empty left out. */
const phrases = (parts: ReadonlyArray<string | undefined>): string => parts.filter(p => p !== undefined && p !== '').join(DOT)

/** A band: its chart, growing to fill the row, then its words in their ink,
 *  kept whole on one line. */
const band = (kit: Kit, key: string, chart: RenderChildren, words: string, amber: boolean): RenderElement => {
  const { Box, palette, onTone, oneLine } = kit
  return (
    <Box key={key} flexDirection="row" columnGap={1} overflow="hidden">
      {chart === null ? null : <Box key="chart" flexGrow={1}>{chart}</Box>}
      <Box key="words" flexShrink={0}>{oneLine({ key: 'w', color: onTone(amber ? 'amber' : 'calm', palette.value) }, words)}</Box>
    </Box>
  )
}

/** The bands of one step, in the one order. */
const bands = (kit: Kit, read: Readings, step: Step): RenderElement[] => {
  const { Svg, Box, Text, palette } = kit
  const { cache, context, fiveHour, sevenDay, history: hist, week } = read
  const charts = read.frame.glyphs === 'unicode'
  const drawn: RenderElement[] = []
  if (step.cache !== undefined) {
    const chart = charts ? sparkline(kit, { key: 'drain', alt: cache.heartAlt, values: [1, cache.charge], color: cache.tone === 'amber' ? palette.amberFg : palette.warm, px: 120, height: 16, max: 1 }) : null
    const words = cache.amber === undefined
      ? phrases([cache.textMarked, cache.coldAtText, cache.mood === 'cold' ? undefined : cache.gaugeMore])
      : phrases([`cache ${cache.amber.long}`, cache.coldAtText])
    drawn.push(band(kit, 'band:cache', chart, words, cache.amber !== undefined))
  }
  if (step.spend !== undefined) {
    const chart = step.spend === 'words' ? null
      : hist.empty ? <Text key="empty" color={palette.label}>{EMPTY.costs}</Text>
      : charts ? barChart(kit, { key: 'beats', shape: 'beats', alt: hist.costsAltOf(24), values: hist.costValues.slice(-24), marked: hist.reWarms.slice(-24), level: hist.warmAvgUsd, color: palette.value, markColor: palette.value, px: 240, height: CHART_PX[2], air: AIR_PX, max: hist.beatsTop })
      : null
    drawn.push(band(kit, 'band:spend', chart, phrases([read.spend.totalText, hist.empty ? undefined : hist.numbersShort, hist.avgText]), false))
  }
  if (step.context !== undefined) {
    const chart = charts && hist.context.length > 1
      ? sparkline(kit, { key: 'trail', alt: hist.contextTrailAlt, values: hist.context, color: palette.label, px: 240, height: CHART_PX[2], air: AIR_PX, max: context.compactAt ?? context.window, level: context.compactAt === undefined ? undefined : 1 })
      : null
    const room = context.roomText === undefined ? undefined : `${context.roomText} left`
    const words = context.amber === undefined
      ? phrases([`context ${context.valueText}`, room, context.compactsAtText === undefined ? undefined : `compacts at ${context.compactsAtText}`])
      : phrases([context.amber.long, room])
    drawn.push(band(kit, 'band:context', chart, words, context.amber !== undefined))
  }
  if (step.limits !== undefined && (fiveHour !== undefined || sevenDay !== undefined)) {
    const size = step.limits
    const rows = size === 'two' ? 2 : 3
    const five = fiveHour === undefined ? null : band(kit, '5h',
      charts && size !== 'words' && week.fiveHourWindow.values.length > 1
        ? sparkline(kit, { key: 'trail', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, color: fiveHour.tone === 'amber' ? palette.amberFg : palette.fiveAccent, px: 240, height: CHART_PX[rows], air: AIR_PX, max: 100 })
        : null,
      // A measured fill is already in the amber words.
      phrases([fiveHour.amber?.long ?? fiveHour.text, fiveHour.amber !== undefined && fiveHour.fullIn !== undefined ? undefined : fiveHour.pace, fiveHour.resetAtGlyph]),
      fiveHour.amber !== undefined)
    // The day cells are the desktop's, as on the row: in text the 7d is words.
    const seven = sevenDay === undefined ? null : band(kit, '7d',
      Svg && size !== 'words' && week.days.some(d => d.pct !== undefined && !d.guess)
        ? dayCells(kit, { key: 'days', alt: week.daysAlt, values: week.days.map(d => d.pct), guess: week.days.map(d => d.guess), today: week.days.findIndex(d => d.today), color: sevenDay.tone === 'amber' ? palette.amberFg : palette.weekAccent, cellPx: 18, height: DAY_PX[rows], air: AIR_PX, max: 100 })
        : null,
      phrases([sevenDay.amber?.long ?? sevenDay.text, sevenDay.fillText, sevenDay.resetAtGlyph]),
      sevenDay.amber !== undefined)
    // Side by side on the desktop, and as words; in text 5h's line over 7d's.
    const across = Svg !== undefined || size === 'words'
    drawn.push(
      <Box key="band:limits" flexDirection={across ? 'row' : 'column'} columnGap={2}>
        {[five, seven].map((b, i) => (b === null ? null : <Box key={i === 0 ? 'five' : 'seven'} flexGrow={1}>{b}</Box>))}
      </Box>,
    )
  }
  const others = read.limits.filter(l => l.key === 'other')
  if (step.other !== undefined && others.length > 0)
    drawn.push(band(kit, 'band:other', null, phrases(others.map(l => l.amber?.long ?? l.text)), others.some(l => l.amber !== undefined)))
  return drawn
}

/** The step that fits `rows`, Other kept at every step while it is amber
 *  (spec §2.1: an amber reading never gives way), and counted. */
const stepFor = (read: Readings, surface: 'desktop' | 'terminal', rows: number): Step => {
  const others = read.limits.filter(l => l.key === 'other')
  const amberOther = others.some(l => l.amber !== undefined)
  const fits = (step: Step): boolean => {
    const kept: Step = amberOther ? { ...step, other: 'words' } : others.length === 0 ? { ...step, other: undefined } : step
    const used = (Object.entries(kept) as Array<[Band, Size | undefined]>).reduce((n, [b, size]) => (size === undefined ? n : n + ROWS[surface][b][size]), 0)
    return used <= rows
  }
  const step = STEPS.find(fits)
  return step === undefined ? {} : amberOther ? { ...step, other: 'words' } : step
}

/** Pulse open: the stack, its bands fitted to the body's rows, then the
 *  footer, the strip in its row. */
export const openStack = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg } = kit
  const ws = read.workspace
  const strip = ws === undefined ? undefined : drawStrip(kit, ws, 'footer', 0, kit.columns - ROW_SLACK - footerRoom(kit))
  const drawn = bands(kit, read, stepFor(read, Svg ? 'desktop' : 'terminal', bodyRowsFor(read.frame.maxRows, 1, 0)))
  const stack = drawn.length === 0 ? null : <Box key="stack" flexDirection="column" marginTop={1}>{drawn}</Box>
  return [stack, footer(kit, act, strip)].filter(e => e !== null)
}
