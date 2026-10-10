// Week, where your limits went: the weekly limit as day cells and the 5-hour
// limit as hour cells, each filled to its rise. A terminal draws braille
// heights, and the ascii tier numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { dayCells } from '../charts'
import type { Kit } from '../kit'
import type { DayCell, HourCell, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Role, type Say } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fitLine, grid, layoutCachePill, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the rows narrow, first to last. Amber never does. The
 *  two rows give way as one, since the 7d cells' initials sit on row 2. */
const ORDER = ['emptyText', 'resetText', 'calmFiveCells', 'calmSevenCells', 'cost'] as const
type Piece = (typeof ORDER)[number]

type Cell = DayCell | HourCell
/** A day's initial, an hour's clock hour. */
const cellName = (c: Cell): string => ('initial' in c ? c.initial : c.label)
const isNow = (c: Cell): boolean => ('today' in c ? c.today : c.now)

/** A window as week draws it: its limit, its cells and their words, its
 *  accent, and the collapsed cells' width and give-way step. */
type WeekWindow = Readonly<{ limit: LimitView; cells: readonly Cell[]; alt: string; summary: string; accent: Role; cellPx: number; step: Piece }>

/** The weekly window, then the 5-hour one, each as the engine reports it. */
const windowsOf = (read: Readings): WeekWindow[] => {
  const wk = read.week
  const seven = read.sevenDay
  const five = read.fiveHour
  const windows: Array<WeekWindow | undefined> = [
    seven && { limit: seven, cells: wk.days, alt: wk.daysAlt, summary: wk.summary7 ?? seven.value, accent: 'accent7', cellPx: 16, step: 'calmSevenCells' },
    five && { limit: five, cells: wk.hours, alt: wk.hoursAlt, summary: wk.summary5 ?? five.value, accent: 'accent5', cellPx: 11, step: 'calmFiveCells' },
  ]
  return windows.filter((w): w is WeekWindow => w !== undefined)
}

/** An amber reading's reason, long until every calm piece has gone. */
const amberWords = (kit: Kit, key: string, amber: Amber, keeps: Keeps<Piece>): RenderElement =>
  words(kit, key, [[keeps.amber(amber), 'amber']])

/** A window's name, in its accent, or amber while it needs you. */
const nameOf = (kit: Kit, w: WeekWindow): RenderElement =>
  words(kit, 'name', [[w.limit.name, w.limit.amber === undefined ? w.accent : 'amber']])

/** A cell's words, the empty ones left out. */
const spoken = (parts: readonly string[]): string => parts.filter(t => t !== '').join(' ')

/** How a window's cells are drawn: their size, each cell's Svg label, and
 *  its words, which a surface without Svgs says open (`inWords`). */
type CellsForm = Readonly<{ cellPx: number; height: number; label: (c: Cell) => string; said: (c: Cell) => string; gap: string; inWords: boolean }>

/** Cells in words: each said, the current one in brackets. */
const cellsText = (cells: readonly Cell[], form: CellsForm): string =>
  cells.map(c => (isNow(c) ? `[${form.said(c)}]` : form.said(c))).join(form.gap)

/** A window's cells: day cells on the desktop, braille heights on a
 *  terminal; words in the ascii tier, and open wherever Svgs don't draw. */
const cellsChart = (kit: Kit, read: Readings, w: WeekWindow, form: CellsForm): RenderChildren => {
  const l = w.limit
  if (read.frame.glyphs === 'ascii' || (kit.Svg === undefined && form.inWords)) return words(kit, 'cells', [[cellsText(w.cells, form), l.amber === undefined ? 'value' : 'amber']])
  return dayCells(kit, {
    key: 'cells',
    alt: w.alt,
    values: w.cells.map(c => c.pct),
    guess: w.cells.map(c => c.guess),
    today: w.cells.findIndex(isNow),
    color: kit.onTone(l.tone, accentOf(kit, l)),
    cellPx: form.cellPx,
    height: form.height,
    labels: w.cells.map(form.label),
  })
}

/** Collapsed, a cell's label: its name, or `!` where the window fills. */
const markOf = (c: Cell): string => (c.fullMark ? '!' : cellName(c))
/** Collapsed cells, as tall as a row; in words, each its name and rise. */
const SMALL: Omit<CellsForm, 'cellPx'> = { height: 16, label: markOf, said: c => spoken([cellName(c), c.text]), gap: ' ', inWords: false }

/** The column of the first 7d cell on a terminal: `7d`, its gap, and the
 *  space `dayCells` leads with. It draws cell i two columns further on. */
const FIRST_CELL = 4

/** The days' initials, each beneath its cell, in fixed-width Boxes. */
const initialsOf = (kit: Kit, days: readonly DayCell[]): RenderElement => {
  const { Box } = kit
  return (
    <Box key="initials" flexDirection="row">
      <Box key="pad" width={FIRST_CELL} flexShrink={0} />
      {days.map((d, i) => (
        <Box key={`d${i}`} width={2} flexShrink={0}>
          {words(kit, 'i', [[markOf(d), d.today ? 'value' : 'label']])}
        </Box>
      ))}
    </Box>
  )
}

/** A window on row 1: its cells while they're kept, its value and its reset
 *  as the squeeze allows; amber, its reason in place of the value. */
const windowPiece = (kit: Kit, read: Readings, w: WeekWindow) => {
  const { Box } = kit
  const l = w.limit
  const chart = read.week.empty || w.cells.length === 0 ? null : cellsChart(kit, read, w, { ...SMALL, cellPx: w.cellPx })
  // Built once: the squeeze only picks among them. Beside its cells a window
  // says its value; without them, its name and value, as `say` has them.
  const name = nameOf(kit, w)
  const reset = l.resetClock === undefined ? l.resetGlyph : `↻ ${l.resetClock}`
  const phrase = (say: Say, withReset: boolean): RenderElement =>
    words(kit, 'v', withReset && reset !== undefined ? [...say, [` ${reset}`, 'label']] : say)
  const value: Say = [[l.value, 'value']]
  const calm = {
    cells: { reset: phrase(value, true), bare: phrase(value, false) },
    text: { reset: phrase(l.say, true), bare: phrase(l.say, false) },
  }
  const showsCells = (keeps: Keeps<Piece>): boolean => chart !== null && (l.amber === undefined ? keeps.has(w.step) : beforeLast(keeps))
  const draw = (keeps: Keeps<Piece>): RenderElement => {
    const cells = showsCells(keeps)
    const said = l.amber !== undefined ? amberWords(kit, 'v', l.amber, keeps) : calm[cells ? 'cells' : 'text'][keeps.has('resetText') ? 'reset' : 'bare']
    return cells ? (
      <Box key={l.key} flexDirection="row" columnGap={1}>
        {name}
        {chart}
        {said}
      </Box>
    ) : (
      said
    )
  }
  return { key: l.key, showsCells, draw }
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg } = kit
  const wk = read.week
  const x = read.context
  const windows = windowsOf(read)
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  const cost = words(kit, 'cost', [[read.spend.totalText, 'value']])
  const empty = words(kit, 'empty', [[EMPTY.history, 'label']])
  // With no 5h or 7d, row 1 says so; other limits are drawn only open (spec §2.7).
  const noWindows = words(kit, 'none', [[read.limits.length === 0 ? 'limits ' : '5h · 7d ', 'label'], [EMPTY.limits, 'value']])
  const pieces = windows.map(w => windowPiece(kit, read, w))
  const seven = pieces.find(p => p.key === '7d')
  // On the desktop the cells carry their initials, and the ascii tier names each cell.
  const initials = Svg !== undefined || read.frame.glyphs === 'ascii' ? null : initialsOf(kit, wk.days)
  let pillLong: RenderElement | undefined
  let pillShort: RenderElement | undefined
  const pill = (short: boolean): RenderElement =>
    short ? (pillShort ??= layoutCachePill(kit, read, true)) : (pillLong ??= layoutCachePill(kit, read, false))
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => (
      <Box key="rows" flexDirection="column">
        {line(kit, 'r1', windows.length === 0 ? [noWindows] : pieces.map(p => p.draw(keeps)))}
        {line(
          kit,
          'r2',
          [
            seven?.showsCells(keeps) ? initials : wk.empty && keeps.has('emptyText') ? empty : null,
            pill(!beforeLast(keeps)),
            keeps.has('cost') ? cost : null,
            // Week shows no context, so its trigger gets an amber piece of its own.
            x.amber === undefined ? null : amberWords(kit, 'ctx', x.amber, keeps),
          ],
          toggle,
        )}
      </Box>
    )),
  ]
}

/** A limit as a sentence: its reason while amber, else its value; then its
 *  reset and its pace, unless the reason is a measured fill, which says it. */
const limitSentence = (kit: Kit, l: LimitView): RenderElement => {
  const tail = [l.resetWords, l.fullIn === undefined ? l.pace : undefined].filter((t): t is string => t !== undefined && t !== '')
  return words(kit, l.name, [l.amber !== undefined ? [l.amber.long, 'amber'] : [l.text, 'value'], ...tail.map(t => [`, ${t}`, 'label'] as const)])
}

/** Open, a day cell's label is its initial, date and rise; an hour's, its clock hour and rise. */
const bigLabel = (c: Cell): string => spoken('date' in c ? [c.initial, c.date, c.text] : [c.label, c.text])
/** Open cells: two desktop rows tall, their labels included; without Svgs, a row of words. */
const BIG: CellsForm = { cellPx: 44, height: 35, label: bigLabel, said: bigLabel, gap: '  ', inWords: true }

/** LIMITS, its cells over a summary per window, then the facts line. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, Svg } = kit
  const c = read.cache
  const x = read.context
  const windows = windowsOf(read)
  // The other three sections, a phrase each.
  const facts = words(kit, 'facts', [
    ['CACHE ', 'label'],
    [c.value, 'value'],
    ['  SPEND ', 'label'],
    [`${read.spend.totalText} this session`, 'value'],
    ['  CONTEXT ', 'label'],
    [x.known ? `${x.valueText} ${x.towardText}` : EMPTY.context, 'value'],
  ])
  if (bodyRows < 2) return [facts]
  const charts = read.week.empty
    ? []
    : windows.map(w => (
        <Box key={`${w.limit.key}:cells`} flexDirection="row" columnGap={1}>
          {nameOf(kit, w)}
          {cellsChart(kit, read, w, BIG)}
        </Box>
      ))
  // What needs you leads, so a body short of rows keeps it.
  const sentences = [
    ...windows.map(w => ({
      limit: w.limit,
      row: w.limit.amber !== undefined ? limitSentence(kit, w.limit) : words(kit, w.limit.key, [[`${w.limit.name} `, 'label'], [w.summary, 'value']]),
    })),
    ...read.limits.filter(l => l.key === 'other').map(l => ({ limit: l, row: limitSentence(kit, l) })),
  ]
  const rows = [
    ...sentences.filter(s => s.limit.amber !== undefined).map(s => s.row),
    ...sentences.filter(s => s.limit.amber === undefined).map(s => s.row),
    read.limits.length === 0 ? words(kit, 'none', [[EMPTY.limits, 'value']]) : null,
    read.week.empty ? words(kit, 'empty', [[EMPTY.history, 'label']]) : null,
  ]
  // LIMITS takes the rows its title and the facts line leave; at two rows it
  // keeps one under its title, and the facts line goes.
  const room = Math.max(1, bodyRows - 2)
  const limits = grid(kit, [section(kit, 'limits', 'LIMITS', chartsIfRoom(room, charts, rows, Svg ? 2 : 1), room)], bodyRows)
  return bodyRows < 3 ? limits : [...limits, facts]
}

export const weekView = defineView('week', { desktop: 2, terminal: 2 }, lines, body)
