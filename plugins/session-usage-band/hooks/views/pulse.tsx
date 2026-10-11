// Pulse, is my spending speeding up: chips' pills with the conversation's
// history drawn inside them, each message's cost as bars beside the total
// and the last hour of the 5h limit on its own scale; open, the shared
// cards, their heads carrying the history. In the ascii tier, which has no
// braille, the charts give way to the numbers.

import type { RenderChildren } from 'claude-code'
import { barChart, barsWidth, dayCells, sparkline } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { GIVES_WAY, ROW_SLACK, SHORT_BELOW } from '../layout'
import type { Piece } from '../layout'
import type { HistoryReading, LimitView, Readings } from '../reading'
import { EMPTY } from '../words'
import type { Amber } from '../words'
import { cachePill, contextPill, costPill, limitPill, pillRow, type ChipKey } from './chips'
import { beforeLast, fitLine, layoutCacheSpec, once, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type Lens, type Lines } from './view'

/** What gives way as the row narrows, first to last: the charts, then
 *  chips' own steps from the 7d bar on, the last cost outlasting the
 *  wording; then an amber reading's chart, and the total last, so a narrow
 *  row keeps the reading's words whole. Amber words never give way. */
const ORDER = ['barsMany', 'trailChart', 'barsChart', 'weekBar', 'calmWeek', 'shortWording', 'lastCost', 'calmContext', 'calmFive', 'amberChart', 'cost'] as const
type Step = (typeof ORDER)[number]

/** The cost bars drawn collapsed, before and after they give way. */
const BARS_MANY = 14
const BARS_FEW = 8
/** A chart's height, in a pill or a card's head. */
const CHART_PX = 16
/** The 5h trail's width, and its cells in text. */
const TRAIL_PX = 64
const TRAIL_CELLS = 6
/** A lens's width before it is stretched to its slot, and its most cells in
 *  text: the 24 costs kept, two to a cell. */
const LENS_PX = 200
const LENS_CELLS = 12
/** A measured day's cell on the desktop. */
const DAY_PX = 12
/** The top of a limit's scale: its percentages run to 100. */
const PERCENT = 100
/** The cost charts' top: three times the warm average, so a warm message
 *  stands a third of the way up and a re-warm stands clipped at the top. */
const COST_SCALE = 3

/** Chips' squeeze just past `piece`: its pills drawn without it and what
 *  gives way before it. */
const past = (piece: Piece): number => GIVES_WAY.indexOf(piece) + 1

/** The newest `count` costs as bars on a track, a re-warm in value ink with
 *  its cap; `stretch`, spanning a card's head with the warm average ruled. */
const costBars = (kit: Kit, hist: HistoryReading, count: number, stretch = false): RenderChildren => {
  const { palette: p } = kit
  const values = hist.costValues.slice(-count)
  const avg = hist.warmAvgUsd
  return barChart(kit, {
    key: 'bars',
    alt: hist.costsAltOf(count),
    values,
    marked: hist.reWarms.slice(-count),
    color: p.meterFill,
    markColor: p.value,
    px: barsWidth(values.length),
    height: CHART_PX,
    max: avg === undefined ? undefined : avg * COST_SCALE,
    level: stretch ? avg : undefined,
    track: true,
    stretch,
  })
}

/** The 5h limit's last hour on a track, on its own 0 to 100 scale, in its
 *  accent; amber, in amber, climbing dashed to where the window lands, or to
 *  the top when no landing is measured. Nothing until it has two points. */
const fiveHourTrail = (kit: Kit, f: LimitView, hist: HistoryReading): RenderChildren =>
  hist.fiveHourHour.length < 2
    ? null
    : sparkline(kit, {
        key: 'trail',
        alt: hist.trailAlt,
        values: hist.fiveHourHour,
        color: f.amber === undefined ? kit.palette.fiveAccent : kit.palette.amberFg,
        px: TRAIL_PX,
        height: CHART_PX,
        max: PERCENT,
        projectTo: f.amber === undefined ? undefined : (f.projectedFrac ?? 1),
        cells: TRAIL_CELLS,
        track: true,
      })

/** An amber reading as its chip: its reason whole, led by `! ` and long
 *  until the last step, then its chart; on the desktop its icon, in amber,
 *  ahead of it. */
const amberSpec = (kit: Kit, chip: PillSpec, icon: Icon, amber: Amber, keeps: Keeps<Step>, chart: RenderChildren = null): PillSpec => {
  const { Svg, Text, palette, gap } = kit
  return {
    ...chip,
    tone: 'amber',
    body: [
      ...(Svg ? kit.icon(icon, palette.amberFg) : []),
      <Text key="amber" color={palette.amberFg}>
        {keeps.amber(amber)}
      </Text>,
      ...(chart === null ? [] : [gap('g-chart'), chart]),
    ],
  }
}

/** The cache: chips' pill; amber, its reason, long until the last step. */
const cacheSpec = (kit: Kit, read: Readings, keeps: Keeps<Step>, short: boolean): PillSpec =>
  read.cache.amber === undefined ? cachePill(kit, read, short) : { ...layoutCacheSpec(kit, read, !beforeLast(keeps)), hover: cachePill(kit, read, short).hover }

/** The total, the newest costs' bars beside it and the last one's after, as
 *  the row keeps them; with no cost yet, the band's words for that. */
const costSpec = (kit: Kit, read: Readings, keeps: Keeps<Step>, bars: RenderChildren): PillSpec | undefined => {
  const { Text, palette, gap } = kit
  const hist = read.history
  const last = hist.empty ? EMPTY.costs : hist.numbersShort
  const chip = costPill(kit, read)
  if (!keeps.has('cost')) return undefined
  return {
    ...chip,
    body: [
      ...chip.body,
      ...(bars === null ? [] : [gap('g-bars'), bars]),
      keeps.has('lastCost') && last !== '' ? <Text key="last" color={palette.label}>{` · ${last}`}</Text> : null,
    ],
  }
}

/** The context: chips' pill without its meter; amber, its reason. */
const contextSpec = (kit: Kit, read: Readings, keeps: Keeps<Step>, short: boolean): PillSpec | undefined => {
  const x = read.context
  if (!x.known) return undefined
  if (x.amber !== undefined) return amberSpec(kit, contextPill(kit, read, 0), 'context', x.amber, keeps)
  return keeps.has('calmContext') ? contextPill(kit, read, past(short ? 'shortWording' : 'contextMeter')) : undefined
}

/** Each limit's icon, the step its calm pill gives way at, and its mark's. */
const LIMIT_STEPS: Readonly<Record<ChipKey, Readonly<{ icon: Icon; calm: Step; mark: Step }>>> = {
  '5h': { icon: 'five', calm: 'calmFive', mark: 'trailChart' },
  '7d': { icon: 'week', calm: 'calmWeek', mark: 'weekBar' },
}

/** A limit: chips' chip with `mark` in its bar's place, the bar itself when
 *  there is none; amber, its reason, the mark after it while it's kept. */
const limitSpec = (kit: Kit, read: Readings, keeps: Keeps<Step>, short: boolean, key: ChipKey, mark: RenderChildren): PillSpec | undefined => {
  const w = key === '5h' ? read.fiveHour : read.sevenDay
  const steps = LIMIT_STEPS[key]
  const chip = limitPill(kit, read, key, past(keeps.has(steps.mark) ? 'fiveReset' : 'limitBars'), short, mark ?? undefined)
  if (chip === undefined || w?.amber === undefined) return keeps.has(steps.calm) ? chip : undefined
  return amberSpec(kit, chip, steps.icon, w.amber, keeps, keeps.has('amberChart') ? mark : null)
}

/** Pulse's one row: amber first, then the cache, the cost, the context and
 *  the limits as the squeeze keeps them, then ▵. */
const row: Lines = (kit, read, act) => {
  const hist = read.history
  const charts = read.frame.glyphs === 'unicode'
  // Built once: none changes with the squeeze, which only picks among them.
  const barsMany = once(() => costBars(kit, hist, BARS_MANY))
  const barsFew = once(() => costBars(kit, hist, BARS_FEW))
  const trail = charts && read.fiveHour !== undefined ? fiveHourTrail(kit, read.fiveHour, hist) : null
  return [
    fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
      const short = kit.columns < SHORT_BELOW || !keeps.has('shortWording')
      const bars = charts && !hist.empty && keeps.has('barsChart') ? (keeps.has('barsMany') ? barsMany() : barsFew()) : null
      const specs = [
        cacheSpec(kit, read, keeps, short),
        costSpec(kit, read, keeps, bars),
        contextSpec(kit, read, keeps, short),
        limitSpec(kit, read, keeps, short, '5h', trail),
        limitSpec(kit, read, keeps, short, '7d', null),
      ].filter((spec): spec is PillSpec => spec !== undefined)
      return pillRow(kit, read, act, [...specs.filter(s => s.tone === 'amber'), ...specs.filter(s => s.tone !== 'amber')])
    }),
  ]
}

/** Pulse's lens on the cards: the conversation's costs, its context and the
 *  week's measured days, each in its card's head; the cache runs in minutes,
 *  so its head stays bare. The ascii tier has no braille, so no lens. */
const lens: Lens = (kit, read) => {
  const { palette: p } = kit
  const { context: x, history: hist, week } = read
  const amberHead = read.worstLimit?.amberHead
  return {
    slots:
      read.frame.glyphs !== 'unicode'
        ? {}
        : {
            spend: hist.empty ? undefined : costBars(kit, hist, hist.costValues.length, true),
            // Its scale tops out where it compacts, ruled there.
            context:
              !x.known || hist.context.length < 2
                ? undefined
                : sparkline(kit, {
                    key: 'trail',
                    alt: hist.contextTrailAlt,
                    values: hist.context,
                    color: p.meterFill,
                    px: LENS_PX,
                    height: CHART_PX,
                    max: x.compactAt ?? x.window,
                    level: x.compactAt === undefined ? undefined : 1,
                    cells: LENS_CELLS,
                    track: true,
                    area: true,
                    stretch: true,
                  }),
            limits: week.empty
              ? undefined
              : dayCells(kit, {
                  key: 'days',
                  alt: week.measuredAlt,
                  values: week.days.map(d => (d.guess ? undefined : d.pct)),
                  color: p.meterFill,
                  cellPx: DAY_PX,
                  height: CHART_PX - 2,
                }),
          },
    heads: amberHead === undefined ? {} : { limits: amberHead },
    // The row says the last message's cost while there is one.
    shown: hist.empty ? [] : ['lastMessage'],
  }
}

export const pulseView = defineCardsView('pulse', { desktop: 1, terminal: 1 }, row, lens)
