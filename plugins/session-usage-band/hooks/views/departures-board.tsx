// Departures open: the board itself, a dark ground of flap lines under the
// collapsed row. The workspace heads it, the column headings follow, then a
// line per reading in the one order and the other limits after 7D (spec
// §5.3). Short of rows, its lines give way in the spec's order; the footer,
// off the board, stays.

import type { RenderElement } from 'claude-code'
import { boardRoom, flaps } from '../flaps'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { Palette } from '../palette'
import { BOARD_HEADINGS, BOARD_HEADINGS_ALT, boardLines, remarksFit, type BoardKey, type BoardLine, type BoardRow } from '../words'
import { bodyRowsFor, footer } from './frame'

/** Each reading's ITEM ink: its own, as an airline's code has its colour. */
export const ITEM_INK: Readonly<Record<BoardKey, Exclude<keyof Palette, 'filled'>>> = {
  cache: 'flapItemCache', spend: 'flapItemSpend', context: 'flapItemContext', '5h': 'flapItem5h', '7d': 'flapItem7d', other: 'flapText',
}

/** What gives way as rows run out, first to last (spec §5.3), CACHE and 7D
 *  together as the body's last step. Calm lines alone give way (spec §2.1):
 *  an amber reading's line stays, as chips' cards leave their alert. */
const GIVE_WAY: ReadonlyArray<readonly string[]> = [['other'], ['headings'], ['spend'], ['context'], ['header'], ['5h'], ['cache', '7d']]

/** A line's runs in their inks, each it says: ITEM always; STATUS, TIME
 *  and REMARKS while they hold words. */
const runsOf = (line: BoardLine | undefined, inks: Readonly<{ item: string; status: string; time: string; remarks: string }>): ReadonlyArray<readonly [string, string]> => [
  [line?.item ?? '', inks.item],
  ...(line === undefined || line.status === '' ? [] : [[line.status, inks.status] as const]),
  ...(line?.time === undefined ? [] : [[line.time, inks.time] as const]),
  ...(line === undefined || line.remarks === '' ? [] : [[line.remarks, inks.remarks] as const]),
]

/** A reading's line: its ITEM in its own ink, STATUS amber where the
 *  reading is, TIME, then REMARKS dimmed. */
const rowLine = (kit: Kit, row: BoardRow, key: string, line: BoardLine | undefined): RenderElement => {
  const { palette } = kit
  const inks = { item: palette[ITEM_INK[row.key]], status: row.tone === 'amber' ? palette.flapAmber : palette.flapText, time: palette.flapText, remarks: palette.flapDim }
  return flapLine(kit, key, row.alt, runsOf(line, inks))
}

/** A line of flaps, kept whole on its row. */
const flapLine = (kit: Kit, key: string, alt: string, runs: ReadonlyArray<readonly [string, string]>): RenderElement => {
  const { Box, palette } = kit
  return (
    <Box key={key} flexShrink={0}>
      {flaps(kit, { key: 'flaps', alt, runs, bg: palette.flapBg, seam: palette.flapSeam })}
    </Box>
  )
}

/** The lines the board would draw with every row: each named by what gives
 *  way with it. */
const linesOf = (read: Readings): ReadonlyArray<Readonly<{ name: string; row?: BoardRow; key: string }>> => {
  const { header, rows } = read.board
  const others = rows.filter(r => r.key === 'other')
  const named = (key: BoardKey) => rows.filter(r => r.key === key).map(row => ({ name: key, row, key: `row:${key}` }))
  return [
    ...(header === undefined ? [] : [{ name: 'header', key: 'row:header' }]),
    { name: 'headings', key: 'row:headings' },
    ...named('cache'), ...named('spend'), ...named('context'), ...named('5h'), ...named('7d'),
    ...others.map((row, i) => ({ name: 'other', row, key: `row:other:${i}` })),
  ]
}

/** The lines that fit `rows`: calm ones go, in GIVE_WAY's order, until the
 *  rest fit; past the last step only amber lines are left, as many as fit. */
const fitRows = <L extends Readonly<{ name: string; row?: BoardRow }>>(lines: readonly L[], rows: number): readonly L[] => {
  let kept = lines
  for (const names of GIVE_WAY) {
    if (kept.length <= rows) return kept
    kept = kept.filter(l => !names.includes(l.name) || l.row?.tone === 'amber')
  }
  return kept.slice(0, rows)
}

/** The board, its lines fitted to the body's rows, on its dark ground;
 *  nothing when no line fits. */
const board = (kit: Kit, read: Readings): RenderElement | null => {
  const { Box, palette } = kit
  // The header stands in for the strip: the body takes the rows a strip would.
  const shown = fitRows(linesOf(read), bodyRowsFor(read.frame.maxRows, 1, 0))
  if (shown.length === 0) return null
  const room = boardRoom(kit)
  const withHeadings = shown.some(l => l.name === 'headings')
  const rows = shown.flatMap(l => (l.row === undefined ? [] : [l.row]))
  const lines = boardLines(withHeadings ? [BOARD_HEADINGS, ...rows] : rows, room)
  const lineOf = (row: BoardRow): BoardLine | undefined => lines[(withHeadings ? 1 : 0) + rows.indexOf(row)]
  const dim = palette.flapDim
  const { header = [], headerAlt = '' } = read.board
  return (
    <Box key="board" flexDirection="column" marginTop={1} paddingX={1} backgroundColor={palette.filled ? palette.boardBg : undefined}>
      {shown.map(l =>
        l.row !== undefined ? rowLine(kit, l.row, l.key, lineOf(l.row))
        : l.name === 'header' ? flapLine(kit, l.key, headerAlt, [[remarksFit(header.join('   '), room), dim]])
        : flapLine(kit, l.key, BOARD_HEADINGS_ALT, runsOf(lines[0], { item: dim, status: dim, time: dim, remarks: dim })))}
    </Box>
  )
}

/** Departures open: the board, then the footer off it. */
export const openBoard = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => [board(kit, read), footer(kit, act)].filter(e => e !== null)
