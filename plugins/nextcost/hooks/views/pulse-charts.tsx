// Pulse's charts, each built in one place at the size its caller gives it:
// the row's tiles draw them small, the open cards a row or two tall. The
// beats, the 5h window's trail and the 7d by day. They are the desktop's
// and the unicode tier's; ascii draws the words.

import type { RenderChildren } from 'claude-code'
import { barChart, dayCells, flatBeats, sparkline } from '../charts'
import type { Kit } from '../kit'
import type { Readings, Tone } from '../reading'
import { EMPTY } from '../words'
import { limitAccent } from './shell'

/** Whether pulse's charts draw: the desktop's, and the unicode tier's
 *  braille; the ascii tier draws the words alone. */
export const chartsDraw = (kit: Kit): boolean => kit.glyphs === 'unicode'

/** Where a chart is drawn: its key, its px wide and tall, and the px of air
 *  above it inside its Svg. */
type ChartAt = Readonly<{ key: string; px: number; height: number; air?: number }>

/** The newest `count` messages' costs as beats on their own top, re-warms
 *  set apart; with `level`, a rule at the warm average. No cost yet:
 *  `count` beats flat in a label's ink. */
export const beatsChart = (kit: Kit, read: Readings, o: ChartAt & Readonly<{ count: number; level?: boolean }>): RenderChildren => {
  const { palette } = kit
  const hist = read.history()
  const { key, px, height, air, count } = o
  return hist.empty
    ? flatBeats(kit, { key, alt: EMPTY.costsAlt, beats: count, color: palette.label, px, height, air })
    : barChart(kit, { key, alt: hist.costsAltOf(count), values: hist.costValues.slice(-count), marked: hist.reWarms.slice(-count), levelValue: o.level ? hist.warmAvgUsd : undefined, color: palette.value, px, height, air, max: hist.beatsTop })
}

/** The 5h window's trail in its accent, or amber's, solid to now and dashed
 *  past it; nothing short of two points. */
export const windowTrail = (kit: Kit, read: Readings, tone: Tone, o: ChartAt): RenderChildren => {
  const { palette, onTone } = kit
  const { fiveHourWindow, windowAlt } = read.week()
  const { key, px, height, air } = o
  return fiveHourWindow.values.length > 1
    ? sparkline(kit, { key, alt: windowAlt, values: fiveHourWindow.values, nowAt: fiveHourWindow.nowAt, from: fiveHourWindow.from, color: onTone(tone, limitAccent(palette, '5h')), px, height, air, max: 100 })
    : null
}

/** The 7d by day in its accent, or amber's, `cellPx` a cell: the desktop's
 *  alone, and only once measured. */
export const weekCells = (kit: Kit, read: Readings, tone: Tone, o: Readonly<{ key: string; cellPx: number; height: number; air?: number }>): RenderChildren => {
  const { Svg, palette, onTone } = kit
  const { daysDrawn, daysAlt } = read.week()
  const { key, cellPx, height, air } = o
  return Svg && daysDrawn.measured
    ? dayCells(kit, { key, alt: daysAlt, values: daysDrawn.values, guess: daysDrawn.guess, today: daysDrawn.today, color: onTone(tone, limitAccent(palette, '7d')), cellPx, height, air, max: 100 })
    : null
}
