// Pulse open: four cards in chips' grammar, in the one order, CACHE, SPEND,
// CONTEXT and LIMITS, each its title and headline, its chart and its fact,
// laid out as chips lays its cards (shell.tsx); then the footer, the strip
// in its row. The charts are pulse's own: the cache's hour as a track, each
// message's cost as a beat over their average, the context's trail under
// its compaction line, the 5h window and the 7d by day. Short of rows, the
// charts step down first, two rows to one to none; then the calm cards give
// way in pulse's order, an amber one never.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, dayCells, dayCellsFit, flatBeats, sparkline, track } from '../charts'
import type { Kit } from '../kit'
import { cellsOf } from '../layout'
import type { LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, limitsHead, markedHead } from '../words'
import { bodyRowsFor, footer } from './frame'
import { CARD_NAMES, alertLine, cardGrid, cardLine, cardShell, cardsPresent, factRow, headline, linesOf } from './shell'
import type { CardLine, CardName } from './shell'

const DOT = ' · '

/** What gives way short of rows, a card or the other limits' row in Limits. */
type Unit = 'other' | 'context' | 'limits' | 'cache' | 'spend'
const UNITS: readonly Unit[] = ['cache', 'spend', 'context', 'limits', 'other']
/** The order they give way, first to last (three-layouts spec §4.2): the
 *  other limits, Context, Limits, the cache, then Spend. A calm one gives
 *  way at its turn; an amber one only where the body can't hold every amber
 *  one, then in AMBER_SHED's order, so the view is empty only when nothing
 *  fits. */
const SHED: readonly Unit[] = ['other', 'context', 'limits', 'cache', 'spend']
const AMBER_SHED: readonly Unit[] = ['other', 'context', 'limits', 'cache']

/** A chart's rows: on the desktop two, then one, then none; in text one line. */
type ChartRows = 0 | 1 | 2
const CHART_STEPS: readonly ChartRows[] = [2, 1, 0]

/** A chart of whole rows on the desktop, 24 px each, its air above it. */
const CHART_PX: Readonly<Record<1 | 2, Readonly<{ height: number; air: number }>>> = { 1: { height: 20, air: 4 }, 2: { height: 40, air: 8 } }
/** Day cells draw a px of outline above and below their height. */
const DAY_PX: Readonly<Record<1 | 2, Readonly<{ height: number; air: number }>>> = { 1: { height: 18, air: 4 }, 2: { height: 38, air: 8 } }
/** Px kept above the context's scale, so its compaction line sits in its own chart. */
const HEADROOM_PX: Readonly<Record<1 | 2, number>> = { 1: 4, 2: 8 }
/** The widest day cell. */
const DAY_CELL_PX = 32
/** The columns between Limits' two halves. */
const HALF_GAP = 2

/** The phrases joined by DOT, as many as fit `room` from the first; the
 *  first always, which the surface cuts if it must. */
const fitWords = (kit: Kit, phrases: readonly string[], room: number): string => {
  let words = phrases[0] ?? ''
  for (const p of phrases.slice(1)) {
    const longer = `${words}${DOT}${p}`
    if (cellsOf(longer, kit.measure) > room) break
    words = longer
  }
  return words
}

/** Whether pulse's charts draw: the desktop's, and the unicode tier's
 *  braille; the ascii tier draws the words alone. */
export const chartsDraw = (kit: Kit): boolean => kit.glyphs === 'unicode'

/** Whether a fact's label and value fit `room` side by side, two columns apart. */
const factFits = (kit: Kit, label: string, value: string, room: number): boolean => cellsOf(label, kit.measure) + 2 + cellsOf(value, kit.measure) <= room

/** Everything the plan and the cards read, worked out once a draw. */
type Facts = Readonly<{
  /** Whether charts draw here, as chartsDraw says. */
  charts: boolean
  windows: readonly LimitView[]
  others: readonly LimitView[]
  amber: ReadonlySet<Unit>
  has: Readonly<Record<CardName, boolean>>
  /** Whether each card has a chart to draw, given rows for one. */
  charted: Readonly<Record<CardName, boolean>>
}>

const factsOf = (kit: Kit, read: Readings): Facts => {
  const { Svg } = kit
  const { cache, context } = read
  const week = read.week()
  const charts = chartsDraw(kit)
  const windows = [read.fiveHour, read.sevenDay].filter((l): l is LimitView => l !== undefined)
  const others = read.limits.filter(l => l.key === 'other')
  const amber = new Set<Unit>([
    ...(cache.tone === 'amber' ? (['cache'] as const) : []),
    ...(context.tone === 'amber' && context.known ? (['context'] as const) : []),
    ...(windows.some(l => l.tone === 'amber') ? (['limits'] as const) : []),
    ...(others.some(l => l.tone === 'amber') ? (['other'] as const) : []),
  ])
  return {
    charts,
    windows,
    others,
    amber,
    has: cardsPresent(read),
    charted: {
      cache: charts && !cache.untimed,
      spend: charts,
      context: charts && context.known,
      limits: charts && ((read.fiveHour !== undefined && week.fiveHourWindow.values.length > 1) || (Svg !== undefined && read.sevenDay !== undefined && week.daysDrawn.measured)),
    },
  }
}

/** What a step keeps: its units, and its charts' rows. */
type Plan = Readonly<{ kept: ReadonlySet<Unit>; chart: ChartRows }>

/** The cards a plan's units draw, in the one order. */
const cardsOf = (f: Facts, kept: ReadonlySet<Unit>): CardName[] => {
  const limits = (kept.has('limits') && f.windows.length > 0) || (kept.has('other') && f.others.length > 0)
  return CARD_NAMES.filter(c => f.has[c] && (c === 'limits' ? limits : kept.has(c)))
}

/** Whether Limits' two halves sit side by side in `room`, each fact in its half. */
const halvesAcross = (kit: Kit, f: Facts, room: number): boolean => {
  const half = f.windows.length > 1 ? Math.floor((room - HALF_GAP) / 2) : room
  return f.windows.every(l => factFits(kit, l.fact.label, l.fact.value, half))
}

/** The rows a card on `line` takes at a plan: its edge, its head, its chart and its facts. */
const cardRows = (kit: Kit, f: Facts, card: CardName, p: Plan, line: CardLine): number => {
  const chartRows = p.chart === 0 || !f.charted[card] ? 0 : kit.Svg ? p.chart : 1
  if (card !== 'limits') return line.edgeRows + 1 + chartRows + 1
  const halves = p.kept.has('limits') ? f.windows.length : 0
  const across = halvesAcross(kit, f, line.inner)
  // Side by side, one chart and one fact row; else one over the other.
  const halfRows = halves === 0 ? 0 : across ? chartRows + 1 : halves * (chartRows + 1)
  return line.edgeRows + 1 + halfRows + (p.kept.has('other') && f.others.length > 0 ? 1 : 0)
}

/** The lines of cards a plan draws, `perLine` to a line, and its rows: each
 *  line its tallest card's, a row of air between lines. */
const layoutOf = (kit: Kit, f: Facts, p: Plan) => {
  const cards = cardsOf(f, p.kept)
  const geometry = cardLine(kit, cards.length)
  const lines = linesOf(cards, geometry.perLine)
  const rows = lines.reduce((n, line) => n + Math.max(...line.map(c => cardRows(kit, f, c, p, geometry))), 0) + Math.max(0, lines.length - 1)
  return { lines, rows }
}

/** The first plan whose cards fit `body` rows: every unit with charts of
 *  two rows, then one, then none; then the calm units give way by SHED,
 *  each time from charts of two rows again. Where the amber ones alone
 *  don't fit, they give way by AMBER_SHED. */
const planFor = (kit: Kit, f: Facts, body: number): Plan | undefined => {
  for (let a = 0; a <= AMBER_SHED.length; a++) {
    const guarded = new Set([...f.amber].filter(u => !AMBER_SHED.slice(0, a).includes(u)))
    for (let s = 0; s <= SHED.length; s++) {
      const shed = SHED.slice(0, s).filter(u => !guarded.has(u))
      const kept = new Set(UNITS.filter(u => !shed.includes(u)))
      if (cardsOf(f, kept).length === 0) continue
      for (const chart of CHART_STEPS) {
        const p = { kept, chart }
        if (layoutOf(kit, f, p).rows <= body) return p
      }
    }
  }
  return undefined
}

/** The cards drawn at a plan, line by line. */
const drawCards = (kit: Kit, read: Readings, f: Facts, p: Plan): RenderElement => {
  const { Box, Svg, palette, measure, onTone, oneLine } = kit
  const { cache, context } = read
  const hist = read.history()
  const week = read.week()
  const { lines } = layoutOf(kit, f, p)
  /** The cards of a line of `count`: each `inner` columns inside, and on
   *  the desktop `px`, so a chart spans its card to where its fact row ends. */
  const cardsFor = (count: number): Readonly<Record<CardName, () => RenderElement>> => {
    const { inner, innerPx: px } = cardLine(kit, count)
    /** A chart in its card: in text clipped to the card, the desktop's its own width. */
    const plot = (chart: RenderChildren): RenderChildren => (chart === null || Svg ? chart : <Box key="plot" overflow="hidden">{chart}</Box>)
    /** A chart's size on the desktop at this plan; in text, its line. */
    const size = p.chart === 0 ? undefined : CHART_PX[p.chart]
    const daySize = p.chart === 0 ? undefined : DAY_PX[p.chart]
    const headroom = p.chart === 0 ? undefined : HEADROOM_PX[p.chart]
    /** A line of words in a label's ink, cut to its row. */
    const note = (key: string, text: string) => <Box key={key}>{oneLine({ color: palette.label }, text)}</Box>
    /** A fact, its value's phrases as many as fit beside its label. */
    const fact = (label: string, values: readonly string[], room = inner) => factRow(kit, label, fitWords(kit, values, room - cellsOf(label, kit.measure) - 2))
    /** What fills a card's height past its chart, so its fact sits on the line's last row. */
    const fill = () => <Box key="fill" flexGrow={1} />
    const card = (name: CardName, say: Parameters<typeof headline>[1], tone: Tone, body: RenderChildren[]) =>
      cardShell(kit, { key: `pulse:${name}`, name, head: headline(kit, say, tone), body })

    const cacheCard = (): RenderElement => {
      // Inked by its mood: amber in its last minute, warm green while warm, a
      // label's ink cold or compacted, the whole hour gone. Unmeasured or
      // warming, its hour isn't known: no track, and its note says when it will be.
      const ink = onTone(cache.tone, cache.mood === 'warm' ? palette.warm : palette.label)
      const chart = size === undefined || !f.charted.cache ? null : track(kit, { key: 'chart', alt: cache.alt, frac: 1 - cache.charge, color: ink, px, ...size, cells: inner })
      const said = cache.untimed && cache.cardNote !== undefined ? note('fact', cache.cardNote) : fact(cache.estimateLabel, [cache.estimate])
      return card('cache', markedHead(cache.cardHead, cache.tone), cache.tone, [plot(chart), fill(), said])
    }

    const spendCard = (): RenderElement => {
      // The beats over their average, the newest last; in text two to a cell.
      // No cost yet: the trace flat and dim, beside the note that says when
      // costs show, so it never reads as $0 a message.
      const beats = Svg ? hist.costValues.length : Math.min(hist.costValues.length, 2 * inner)
      const chart = size === undefined || !f.charted.spend ? null
        : hist.empty ? flatBeats(kit, { key: 'chart', alt: EMPTY.costsAlt, beats: 2 * inner, color: palette.label, px, ...size })
        : barChart(kit, { key: 'chart', alt: hist.costsAltOf(beats), values: hist.costValues.slice(-beats), marked: hist.reWarms.slice(-beats), levelValue: hist.warmAvgUsd, color: palette.value, px, ...size, max: hist.beatsTop })
      const cost = hist.costFact
      const said = cost === undefined ? note('fact', EMPTY.costs) : factRow(kit, cost.label, cost.value)
      return card('spend', [[read.spend.totalText, 'value']], 'calm', [plot(chart), fill(), said])
    }

    const contextCard = (): RenderElement => {
      // Its trail under the compaction line; fewer than two turns, flat at its
      // level now, which is known. In text two turns to a cell.
      const turns = Svg ? hist.context.length : 2 * inner
      const values = hist.context.length > 1 ? hist.context.slice(-turns) : Array.from({ length: Math.max(2, Svg ? 2 : turns) }, () => context.used)
      const chart = size === undefined || !f.charted.context ? null
        : sparkline(kit, { key: 'chart', alt: hist.contextTrailAlt, values, color: onTone(context.tone, palette.label), px, ...size, headroom, max: context.compactAt ?? context.window, levelFrac: context.compactAt === undefined ? undefined : 1 })
      return card('context', markedHead(context.cardHead, context.tone), context.tone, [plot(chart), fill(), fact(context.fact.label, context.fact.values)])
    }

    /** A window's half of Limits: its chart, `halfPx` wide, then its fact;
     *  side by side the halves share the line, else each takes all of it. */
    const half = (l: LimitView, halfPx: number, across: boolean): RenderElement => {
      const ink = onTone(l.tone, l.key === '5h' ? palette.fiveAccent : palette.weekAccent)
      let chart: RenderChildren = null
      if (size !== undefined && daySize !== undefined && f.charts) {
        if (l.key === '5h' && week.fiveHourWindow.values.length > 1)
          chart = sparkline(kit, { key: 'chart', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, from: week.fiveHourWindow.from, color: ink, px: halfPx, ...size, max: 100 })
        // The day cells are the desktop's: in text the 7d's half is its fact.
        const cellPx = dayCellsFit(halfPx, week.daysDrawn.values.length, DAY_CELL_PX)
        if (l.key === '7d' && Svg && week.daysDrawn.measured && cellPx !== undefined)
          chart = dayCells(kit, { key: 'chart', alt: week.daysAlt, values: week.daysDrawn.values, guess: week.daysDrawn.guess, today: week.daysDrawn.today, color: ink, cellPx, ...daySize, max: 100 })
      }
      return (
        <Box key={l.key} flexDirection="column" justifyContent="flex-end" {...(across ? { flexGrow: 1, width: 0, minWidth: 0 } : {})}>
          {plot(chart)}
          {factRow(kit, l.fact.label, l.fact.value)}
        </Box>
      )
    }

    const limitsCard = (): RenderElement => {
      const windows = p.kept.has('limits') ? f.windows : []
      const across = halvesAcross(kit, f, inner)
      const halfPx = windows.length > 1 && across ? Math.floor((px - HALF_GAP * measure.pxPerCell) / 2) : px
      const others = p.kept.has('other') ? f.others : []
      const shown = windows.length > 0 ? windows : others
      const tone: Tone = shown.some(l => l.tone === 'amber') ? 'amber' : 'calm'
      const othersAmber = others.some(l => l.tone === 'amber')
      return card('limits', markedHead(limitsHead(shown), tone), tone, [
        windows.length === 0 ? null : (
          <Box key="halves" flexDirection={across ? 'row' : 'column'} alignItems="stretch" columnGap={HALF_GAP} flexGrow={1}>
            {windows.map(l => half(l, halfPx, across))}
          </Box>
        ),
        others.length === 0 ? null : (
          <Box key="others">{oneLine({ color: onTone(othersAmber ? 'amber' : 'calm', palette.cardValue) }, others.map(l => l.line).join(DOT))}</Box>
        ),
      ])
    }

    return { cache: cacheCard, spend: spendCard, context: contextCard, limits: limitsCard }
  }
  return cardGrid(kit, lines.map(line => (cards => line.map(c => cards[c]()))(cardsFor(line.length))), { marginTop: 1, align: 'stretch' })
}

/** Pulse open: the cards, fitted to the body's rows, then the footer, the
 *  strip in its row. Short of a row for any card, an amber window only the
 *  cards draw (the row never draws the other limits) still says it needs
 *  you, on the row they would have started on. */
export const openStack = (kit: Kit, read: Readings, act: BandActions, collapsedRows: number): RenderElement[] => {
  const body = bodyRowsFor(read.frame.maxRows, collapsedRows, 0)
  const f = factsOf(kit, read)
  const p = planFor(kit, f, body)
  const cards = p !== undefined ? drawCards(kit, read, f, p) : body < 1 ? null : alertLine(kit, read)
  return [cards, footer(kit, act, read.workspace)].filter(e => e !== null)
}
