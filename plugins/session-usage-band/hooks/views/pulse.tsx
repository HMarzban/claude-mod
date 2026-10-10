// Pulse, trends rather than totals: each message's cost as bars, and which
// way the 5-hour limit is heading. In the ascii tier the charts give way to
// numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, sparkline } from '../charts'
import type { Kit } from '../kit'
import { SHORT_BELOW } from '../layout'
import type { HistoryReading, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Say } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, layoutCachePill, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last; `costWords`, `pace`
 *  and `calmFive` are the narrow-width ruling's. Amber never does. */
const ORDER = ['calmContext', 'calmSeven', 'reset', 'barsMany', 'trailChart', 'barsChart', 'costWords', 'pace', 'calmFive'] as const
type Piece = (typeof ORDER)[number]

/** The bars drawn collapsed, before and after they give way. */
const BARS_MANY = 14
const BARS_FEW = 8
/** A bar and the air after it, as `barChart` draws them. */
const BAR_STEP_PX = 6
/** Tall enough that the desktop line is two rows (24 px each, rounded). */
const CHART_PX = 36
/** An open chart: two desktop rows. */
const OPEN_CHART_PX = 40
const TRAIL_PX = 92
const OPEN_TRAIL_PX = 180
/** The top of a limit's scale: its percentages run to 100. */
const PERCENT = 100

/** Between the phrases of one reading. */
const DOT = [' · ', 'label'] as const

/** Phrases one after another, a dot between each; the empty ones left out. */
const dotted = (...says: ReadonlyArray<Say | undefined>): Say =>
  says.filter((s): s is Say => s !== undefined && s.length > 0).flatMap((s, i) => (i === 0 ? s : [DOT, ...s]))

/** A piece built the first time it is asked for, then kept. */
const once = <T,>(build: () => T): (() => T) => {
  let built: T | undefined
  return () => (built ??= build())
}

/** An amber reading's reason, long until every calm piece has gone. */
const amberSay = (amber: Amber, keeps: Keeps<Piece>): Say => [[keeps.amber(amber), 'amber']]

/** The newest `count` costs as bars: the newest in `value`, a re-warm capped. */
const costBars = (kit: Kit, hist: HistoryReading, count: number, height: number): RenderChildren => {
  const { palette: p } = kit
  const values = hist.costValues.slice(-count)
  return barChart(kit, {
    key: 'bars',
    alt: hist.costsAltOf(count),
    values,
    marked: hist.reWarms.slice(-count),
    color: p.meterFill,
    markColor: p.value,
    newestColor: p.value,
    px: values.length * BAR_STEP_PX,
    height,
  })
}

/** The 5h trail on the limit's own scale, in its accent or, amber, in amber;
 *  `projected`, it gains a dashed line to where the window lands. */
const fiveHourTrail = (kit: Kit, f: LimitView, values: readonly number[], alt: string, px: number, height: number, projected: boolean): RenderChildren =>
  sparkline(kit, {
    key: 'trail',
    alt,
    values,
    color: f.amber !== undefined ? kit.palette.amberFg : accentOf(kit, f),
    px,
    height,
    max: PERCENT,
    projectTo: projected ? f.projectedFrac : undefined,
  })

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg } = kit
  const c = read.cache
  const x = read.context
  const f = read.fiveHour
  const w = read.sevenDay
  const hist = read.history
  // In the ascii tier braille would be dropped glyphs: the numbers stand alone.
  const charts = read.frame.glyphs === 'unicode'
  // Built once: none of these changes with the squeeze, and each size of the
  // pill and the bars is built the first time the squeeze asks for it.
  const toggle = toggleButton(kit, read, act)
  const pillLong = once(() => layoutCachePill(kit, read, false))
  const pillShort = once(() => layoutCachePill(kit, read, true))
  const barsMany = once(() => costBars(kit, hist, BARS_MANY, CHART_PX))
  const barsFew = once(() => costBars(kit, hist, BARS_FEW, CHART_PX))
  // Escalation: an amber trail gains its projection.
  const trail =
    !charts || f === undefined || hist.fiveHourHour.length < 2
      ? null
      : fiveHourTrail(kit, f, hist.fiveHourHour, hist.trailAlt, TRAIL_PX, CHART_PX, f.amber !== undefined)
  const total = words(kit, 'total', [[read.spend.totalText, 'value']], true)
  // The total over its numbers on the desktop, so the line stays two rows
  // once the charts give way; beside them on a text surface.
  const costs = (numbers: string): RenderElement => (
    <Box key="costs" flexDirection={Svg ? 'column' : 'row'} columnGap={1}>
      {total}
      {words(kit, 'numbers', [[numbers, 'label']])}
    </Box>
  )
  const costsLong = costs(hist.empty ? EMPTY.costs : hist.numbersText)
  const costsShort = Svg ? costs(hist.empty ? EMPTY.costsShort : hist.numbersShort) : total
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const reset = f?.resetGlyph !== undefined && keeps.has('reset') ? [[f.resetGlyph, 'label'] as const] : undefined
      const five =
        f === undefined
          ? undefined
          : f.amber !== undefined
            ? dotted(amberSay(f.amber, keeps), reset)
            : keeps.has('calmFive')
              ? dotted(f.say, keeps.has('pace') && f.pace !== '' ? [[f.pace, 'label']] : undefined, reset)
              : undefined
      // Unreported, the context says nothing collapsed; open, its section says so.
      const readings = dotted(
        !x.known ? undefined : x.amber !== undefined ? amberSay(x.amber, keeps) : keeps.has('calmContext') ? x.say : undefined,
        w === undefined ? undefined : w.amber !== undefined ? amberSay(w.amber, keeps) : keeps.has('calmSeven') ? w.say : undefined,
      )
      // An amber pill shortens at the amber step; a calm one, as chips' does, below SHORT_BELOW.
      const pillIsLong = c.amber !== undefined ? beforeLast(keeps) : kit.columns >= SHORT_BELOW
      return line(kit, 'line', [
        pillIsLong ? pillLong() : pillShort(),
        charts && !hist.empty && keeps.has('barsChart') ? (keeps.has('barsMany') ? barsMany() : barsFew()) : null,
        keeps.has('costWords') ? costsLong : costsShort,
        // An amber trail stays until the amber step, a calm one gives way in turn.
        (f?.amber !== undefined ? beforeLast(keeps) : keeps.has('trailChart')) ? trail : null,
        five === undefined ? null : words(kit, '5h', five),
        readings.length === 0 ? null : words(kit, 'readings', readings),
      ], toggle, 1)
    }),
  ]
}

/** A limit as a sentence: its reason while amber, else its value; then its
 *  reset and its pace, unless the reason is a measured fill, which says it. */
const limitSentence = (kit: Kit, l: LimitView): RenderElement => {
  const tail = [l.resetWords, l.fullIn === undefined ? l.pace : undefined].filter((t): t is string => t !== undefined && t !== '')
  return words(kit, l.name, dotted(l.amber !== undefined ? [[l.amber.long, 'amber']] : l.say, ...tail.map((t): Say => [[t, 'label']])))
}

/** The facts behind ▿: the cache, then each history with the facts beside it. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Svg, palette: p } = kit
  const c = read.cache
  const x = read.context
  const s = read.spend
  const f = read.fiveHour
  const hist = read.history
  const charts = read.frame.glyphs === 'unicode'
  const room = gridRoom(kit, bodyRows)
  // An open chart takes two desktop rows; braille takes one line.
  const chartRows = Svg ? 2 : 1
  const sentence = (key: string, text: string | undefined): RenderChildren => (text === undefined ? null : words(kit, key, [[text, 'value']]))
  return grid(kit, [
    section(kit, 'cache', 'CACHE', [
      sentence('now', c.value),
      sentence('rewarm', c.reWarmText),
      fact(kit, 'saved', 'saved', c.savedText),
      fact(kit, 'hit', 'hit rate', c.hitText),
      fact(kit, 'lasts', 'lasts', c.lastsText),
    ], room),
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, [
      charts && !hist.empty ? costBars(kit, hist, hist.costValues.length, OPEN_CHART_PX) : null,
    ], [
      sentence('costs', hist.empty ? EMPTY.costs : hist.numbersText),
      sentence('total', `${s.totalText} this session`),
      sentence('tokens', `${s.tokensText} tokens`),
    ], chartRows), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [sentence('none', EMPTY.context)] : chartsIfRoom(room, [
      charts && hist.context.length > 1 ? sparkline(kit, { key: 'trail', alt: x.alt, values: hist.context, color: p.meterFill, px: OPEN_TRAIL_PX, height: OPEN_CHART_PX }) : null,
    ], [
      sentence('pct', `${x.valueText} ${x.towardText}`),
      sentence('in', x.compactsAtText === undefined ? `${x.inContextText} in context` : `${x.inContextText} in context, compacts at ${x.compactsAtText}`),
    ], chartRows), room),
    // What needs you leads, so a body short of rows keeps it.
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [sentence('none', EMPTY.limits)] : chartsIfRoom(room, [
      charts && f !== undefined && hist.fiveHourValues.length > 1 ? fiveHourTrail(kit, f, hist.fiveHourValues, hist.trailAlt, OPEN_TRAIL_PX, OPEN_CHART_PX, true) : null,
    ], [
      ...read.limits.filter(l => l.amber !== undefined).map(l => limitSentence(kit, l)),
      ...read.limits.filter(l => l.amber === undefined).map(l => limitSentence(kit, l)),
    ], chartRows), room),
  ], bodyRows)
}

export const pulseView = defineView('pulse', { desktop: 2, terminal: 1 }, lines, body)
