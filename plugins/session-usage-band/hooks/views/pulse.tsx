// Pulse, the session's trace: each message a beat, the cache a heartbeat,
// context and the 5h window as lines over time, the week by day, in the one
// order. Open, a stack of charts with their words (pulse-open.tsx). The
// charts are the desktop's and the unicode tier's; ascii draws the words.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, dayCells, flatBeats, heartbeat, sparkline } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton } from './frame'
import { beforeLast, fitLine, line, type Keeps } from './parts'
import { openStack } from './pulse-open'
import type { View } from './view'

/** What gives way as the row narrows, first to last (spec §4.1, §2.1),
 *  calm only: the last cost, the context trail, the trace from 14 beats to
 *  8, the 5h trail, the 7d cells, the trace; then whole readings, spend,
 *  context and 5h, so at 40 columns the row is the cache and the 7d; then
 *  their short forms. An amber reading keeps its group, its chart and its
 *  long words until fitLine's amber step, last of all. The cache and the 7d
 *  never go. */
const ORDER = ['last', 'contextTrail', 'beats14', 'fiveTrail', 'sevenDays', 'beats', 'spend', 'context', 'five', 'short'] as const
type Piece = (typeof ORDER)[number]
/** The beats' width: 6 px a beat. */
const BEATS_PX = { 14: 84, 8: 48 } as const

/** The heartbeat's state for the cache's mood. */
const heartState = (read: Readings): 'still' | 'beat' | 'flat' | 'hollow' =>
  read.cache.mood === 'cold' ? 'flat'
  : read.cache.mood === 'unmeasured' || read.cache.mood === 'warming' ? 'hollow'
  : read.cache.tone === 'amber' ? 'beat'
  : 'still'

/** A reading's words in its tone's ink. */
const said = (kit: Kit, key: string, text: string, amber: boolean): RenderElement => {
  const { Text, palette, onTone } = kit
  return <Text key={key} color={onTone(amber ? 'amber' : 'calm', palette.value)}>{text}</Text>
}

/** A reading as one keyed group: its chart, if kept, then its words. */
const group = (kit: Kit, key: string, chart: RenderChildren, words: RenderChildren): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>{chart}{words}</Box>
}

/** Whether a reading's chart is kept: a calm one while its step holds, an
 *  amber one until the amber step. */
const chartKept = (k: Keeps<Piece>, piece: Piece, tone: Tone): boolean => k.has(piece) || (tone === 'amber' && beforeLast(k))

/** A calm reading's words, long until the short step. */
const calmWords = (k: Keeps<Piece>, long: string, short: string): string => (k.has('short') ? long : short)

const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, kit.columns - ROW_SLACK, k => {
    const { Svg, Text, palette } = kit
    const { cache, context, fiveHour, sevenDay, history: hist, week } = read
    const charts = read.frame.glyphs === 'unicode'
    const n = k.has('beats14') ? 14 : 8
    const cacheGroup = group(kit, 'cache',
      heartbeat(kit, { key: 'beat', alt: cache.heartAlt, state: heartState(read), color: cache.tone === 'amber' ? palette.amberFg : palette.warm }),
      said(kit, 'w', cache.amber === undefined ? calmWords(k, cache.textMarked, cache.textShortMarked) : k.amber(cache.amber), cache.amber !== undefined))
    // No message's cost: the trace flat, in a label's ink, only beside `no
    // costs yet`, while the total is $0, and the two give way together;
    // alone it would read as $0 a message. A known total says itself alone.
    const noted = hist.costsNote !== undefined && k.has('last')
    const trace = !k.has('beats') || !charts ? null
      : hist.empty ? (noted ? flatBeats(kit, { key: 'beats', alt: EMPTY.costsAlt, beats: n, color: palette.label, px: BEATS_PX[n], height: 20 }) : null)
      : barChart(kit, { key: 'beats', alt: hist.costsAltOf(n), values: hist.costValues.slice(-n), marked: hist.reWarms.slice(-n), color: palette.value, markColor: palette.value, px: BEATS_PX[n], height: 20, max: hist.beatsTop })
    const total = said(kit, 'w', k.has('last') && !hist.empty ? [read.spend.totalText, hist.numbersShort].join(' · ') : read.spend.totalText, false)
    // Spend is never amber: it gives way whole at its step.
    const spendGroup = !k.has('spend') ? null : group(kit, 'spend', trace,
      noted ? <Text key="w">{total}<Text key="none" color={palette.label}>{` · ${hist.costsNote}`}</Text></Text> : total)
    const contextGroup = !k.calm('context', context.tone) ? null : group(kit, 'context',
      charts && chartKept(k, 'contextTrail', context.tone) && hist.context.length > 1
        ? sparkline(kit, { key: 'trail', alt: hist.contextTrailAlt, values: hist.context, color: palette.label, px: 36, height: 16, max: context.compactAt ?? context.window })
        : null,
      said(kit, 'w', context.amber === undefined ? context.text : k.amber(context.amber), context.amber !== undefined))
    const fiveGroup = fiveHour === undefined || !k.calm('five', fiveHour.tone) ? null : group(kit, '5h',
      charts && chartKept(k, 'fiveTrail', fiveHour.tone) && week.fiveHourWindow.values.length > 1
        ? sparkline(kit, { key: 'trail', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, color: fiveHour.tone === 'amber' ? palette.amberFg : palette.fiveAccent, px: 48, height: 16, max: 100 })
        : null,
      said(kit, 'w', fiveHour.amber === undefined ? fiveHour.text : k.amber(fiveHour.amber), fiveHour.amber !== undefined))
    // The 7d's cells are the desktop's: in text it is words (spec §4.1).
    const sevenGroup = sevenDay === undefined ? null : group(kit, '7d',
      Svg && chartKept(k, 'sevenDays', sevenDay.tone) && week.daysDrawn.measured
        ? dayCells(kit, { key: 'days', alt: week.daysAlt, values: week.daysDrawn.values, guess: week.daysDrawn.guess, today: week.daysDrawn.today, color: sevenDay.tone === 'amber' ? palette.amberFg : palette.weekAccent, cellPx: 4, height: 14, max: 100 })
        : null,
      said(kit, 'w', sevenDay.amber === undefined ? sevenDay.text : k.amber(sevenDay.amber), sevenDay.amber !== undefined))
    return line(kit, 'row', [cacheGroup, spendGroup, contextGroup, fiveGroup, sevenGroup], toggleButton(kit, read, act), 1)
  })

export const pulseView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { Box } = kit
    return (
      <Box flexDirection="column">
        {collapsed(kit, read, act)}
        {read.frame.expanded ? openStack(kit, read, act) : null}
      </Box>
    )
  },
}
