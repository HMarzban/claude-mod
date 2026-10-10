// Gauges, two rows of labelled bars: the cache's bar is its time left, the
// context's ends at compaction, and the 5h and 7d bars carry a tick for how
// much of the window has gone.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, type MeterOptions } from '../charts'
import type { Kit } from '../kit'
import type { BarSize } from '../layout'
import type { ContextReading, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Say, type SpendSplit } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as each row narrows, first to last; `reWarm` is the
 *  narrow-width ruling's. Amber never does. */
const ORDER = ['tokens', 'resetTexts', 'costRight', 'bars', 'calmCells', 'reWarm'] as const
type Piece = (typeof ORDER)[number]

const CACHE_BAR: BarSize = { px: 240, cells: 24 }
const CELL_BAR: BarSize = { px: 120, cells: 12 }
/** What every bar shrinks to as the rows narrow. */
const SMALL_BAR: BarSize = { px: 60, cells: 6 }

/** The split's parts in spec §2.10's colours. */
const SPLIT_INK: Readonly<Record<SpendSplit['label'], 'meterFill' | 'label' | 'value'>> = { input: 'meterFill', output: 'label', 'cache reads': 'value' }

/** A bar in its full size and the small one, each built at most once, when first asked for. */
const twoSizes = (full: BarSize, make: (size: BarSize) => RenderChildren): ((isFull: boolean) => RenderChildren) => {
  let wide: RenderChildren | undefined
  let small: RenderChildren | undefined
  return isFull => (isFull ? (wide ??= make(full)) : (small ??= make(SMALL_BAR)))
}

/** An amber reading's reason, long until every calm piece has gone. */
const amberWords = (kit: Kit, key: string, amber: Amber, keeps: Keeps<Piece>): RenderElement =>
  words(kit, key, [[keeps.amber(amber), 'amber']])

/** Row one: the cache's name, its time-left bar and its sentence, with the
 *  cost and the tokens on the right until the cost joins the sentence. */
const cacheRow = (kit: Kit, read: Readings): RenderElement => {
  const c = read.cache
  const s = read.spend
  // Built once: the squeeze only picks among them.
  const name = words(kit, 'name', [['cache', c.amber === undefined ? 'label' : 'amber']])
  const bar = twoSizes(CACHE_BAR, size => meter(kit, { key: 'bar', label: 'cache', frac: c.charge, tone: c.tone, accent: kit.palette.warm, size, reads: 'left' }))
  const value: Say = [[c.value, 'value']]
  // Counting down or cold, the re-warm price follows the value.
  const priced: Say = c.left !== '' || c.condition === 'cold' ? [...value, [' · re-warm ', 'label'], [c.estimate, 'value']] : value
  const withCost = (say: Say): Say => [...say, [' · ', 'label'], [s.totalText, 'value']]
  const sentence = {
    priced: words(kit, 'say', priced),
    pricedCost: words(kit, 'say', withCost(priced)),
    valueCost: words(kit, 'say', withCost(value)),
  }
  const cost = words(kit, 'cost', [[s.totalText, 'value']])
  const costTokens = words(kit, 'cost', [[s.totalText, 'value'], [' · ', 'label'], [s.tokensText, 'value'], [' tokens', 'label']])
  return fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const onRight = keeps.has('costRight')
    const said =
      c.amber !== undefined
        ? amberWords(kit, 'say', c.amber, keeps)
        : onRight
          ? sentence.priced
          : keeps.has('reWarm')
            ? sentence.pricedCost
            : sentence.valueCost
    return line(
      kit,
      'cache',
      [name, c.amber === undefined || beforeLast(keeps) ? bar(keeps.has('bars')) : null, said, c.amber !== undefined && !onRight ? cost : null],
      onRight ? (keeps.has('tokens') ? costTokens : cost) : null,
      1,
    )
  })
}

/** A cell of row two, its pieces built once for the squeeze to pick from. */
type Cell = Readonly<{
  key: string
  amber: Amber | undefined
  name: RenderElement
  bar: (isFull: boolean) => RenderChildren
  value: (keeps: Keeps<Piece>) => RenderElement
  /** The cell in words alone, `5h 4%`, once calm cells become text. */
  text: RenderElement
}>

const contextCell = (kit: Kit, x: ContextReading): Cell => {
  const value = words(kit, 'value', [[x.valueText, 'value']])
  return {
    key: 'ctx',
    amber: x.amber,
    name: words(kit, 'name', [['context', 'label']]),
    // Measured toward compaction when it is on, so its end is that point: no tick.
    bar: twoSizes(CELL_BAR, size => meter(kit, { key: 'bar', label: 'context', frac: x.frac, tone: x.tone, accent: kit.palette.meterFill, size })),
    value: () => value,
    text: words(kit, 'text', x.say),
  }
}

const limitCell = (kit: Kit, l: LimitView): Cell => {
  const value = words(kit, 'value', [[l.passed ? 'reset' : l.value, 'value']])
  const withReset = l.resetGlyph === undefined ? value : words(kit, 'value', [[l.value, 'value'], [` ${l.resetGlyph}`, 'label']])
  return {
    key: l.name,
    amber: l.amber,
    name: words(kit, 'name', [[l.name, 'label']]),
    bar: twoSizes(CELL_BAR, size => meter(kit, { key: 'bar', label: l.name, frac: l.frac, tone: l.tone, accent: accentOf(kit, l), size, tick: l.gone })),
    value: keeps => (keeps.has('resetTexts') ? withReset : value),
    text: words(kit, 'text', l.say),
  }
}

/** A cell at a squeeze: amber, its bar and its reason; calm, its name, bar
 *  and value, or its words alone. */
const drawCell = (kit: Kit, cell: Cell, keeps: Keeps<Piece>): RenderElement => {
  const { Box } = kit
  const pieces =
    cell.amber !== undefined
      ? [beforeLast(keeps) ? cell.bar(keeps.has('bars')) : null, amberWords(kit, 'amber', cell.amber, keeps)]
      : keeps.has('calmCells')
        ? [cell.name, cell.bar(keeps.has('bars')), cell.value(keeps)]
        : [cell.text]
  return (
    <Box key={cell.key} flexDirection="row" columnGap={1}>
      {pieces}
    </Box>
  )
}

/** Row two: the context, 5h and 7d cells, then the toggle. */
const cellsRow = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const toggle = toggleButton(kit, read, act)
  // Unreported, the context says nothing collapsed; open, its panel says so.
  const cells = [
    read.context.known ? contextCell(kit, read.context) : undefined,
    read.fiveHour === undefined ? undefined : limitCell(kit, read.fiveHour),
    read.sevenDay === undefined ? undefined : limitCell(kit, read.sevenDay),
  ].filter((cell): cell is Cell => cell !== undefined)
  return fitLine(kit, ORDER, lineRoom(kit), keeps => line(kit, 'cells', cells.map(cell => drawCell(kit, cell, keeps)), toggle))
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => [cacheRow(kit, read), cellsRow(kit, read, act)]

/** A limit in its panel: its reason while amber, else its value; then its
 *  pace, unless the reason is a measured fill, which says it. */
const limitLine = (kit: Kit, l: LimitView): RenderElement => {
  const lead: Say = l.amber !== undefined ? [[l.amber.long, 'amber']] : l.say
  const pace = l.fullIn === undefined ? l.pace : ''
  return words(kit, l.name, pace === '' ? lead : [...lead, [` · ${pace}`, 'label']])
}

/** The facts behind ▿: four panels, each its bars over its facts while they fit. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  const bar = (key: string, label: string, frac: number, accent: string, more: Partial<Pick<MeterOptions, 'tone' | 'tick' | 'projectTo'>> = {}) =>
    meter(kit, { key, label, frac, tone: 'calm', accent, size: CELL_BAR, ...more })
  const none = (text: string) => words(kit, 'none', [[text, 'label']])
  // What needs you leads, so a panel short of rows keeps it.
  const limits = [...read.limits.filter(l => l.amber !== undefined), ...read.limits.filter(l => l.amber === undefined)]
  return grid(kit, [
    section(kit, 'cache', 'CACHE', chartsIfRoom(room, [c.hitFrac === undefined ? null : bar('hit:bar', 'hit rate', c.hitFrac, p.warm)], [
      fact(kit, 'hit', 'hit rate', c.hitText),
      fact(kit, 'saved', 'saved', c.savedText),
      fact(kit, 'lasts', 'lasts', c.lastsText),
      c.reWarmText === undefined ? null : words(kit, 'rewarm', [[c.reWarmText, 'value']]),
    ]), room),
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, s.split.map(part => bar(`${part.label}:bar`, part.label, part.frac, p[SPLIT_INK[part.label]])), [
      fact(kit, 'total', 'session', s.totalText),
      fact(kit, 'last', 'last message', s.lastText),
      ...s.split.map(part => fact(kit, part.label, part.label, part.text)),
    ]), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : chartsIfRoom(room, [bar('ctx:bar', 'context', x.frac, p.meterFill, { tone: x.tone })], [
      words(kit, 'pct', [[x.valueText, 'value'], [` ${x.towardText}`, 'label']]),
      fact(kit, 'room', 'room', x.roomText),
      fact(kit, 'at', 'compacts at', x.compactsAtText),
      fact(kit, 'window', 'window', x.windowText),
      fact(kit, 'in', 'in context', x.inContextText),
    ]), room),
    section(kit, 'limits', 'LIMITS', limits.length === 0 ? [none(EMPTY.limits)] : chartsIfRoom(
      room,
      limits.map(l => bar(`${l.name}:bar`, l.name, l.frac, accentOf(kit, l), { tone: l.tone, tick: l.gone, projectTo: l.projectedFrac })),
      limits.map(l => limitLine(kit, l)),
    ), room),
  ], bodyRows)
}

export const gaugesView = defineView('gauges', { desktop: 2, terminal: 2 }, lines, body)
