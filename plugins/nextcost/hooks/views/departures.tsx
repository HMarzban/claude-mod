// Departures, the split-flap board: each reading a line of the board, in the
// one order. Collapsed, each reading its own module: its ITEM and cell's
// tiles on a panel of the board's ground, the band's own background between
// modules. Open, the board itself (departures-board.tsx). The words are the
// board's (board-words.ts); this file only lays tiles.

import type { RenderElement } from 'claude-code'
import { flaps } from '../flaps'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BoardRow } from '../board-words'
import { ITEM_INK, departuresOpen } from './departures-board'
import { fitLine, groundOf, type Keeps, line, pieceGap, type PieceOf } from './frame'
import type { View } from './view'

/** What gives way as the row narrows, first to last (three-layouts spec
 *  §5.2), calm only: readings outrank calm remarks. 5h's RESET, 7d's RESET,
 *  5h's remark, 7d's remark, SPEND, CONTEXT, then 5H itself, so the
 *  narrowest row is CACHE and 7D alone, then the short forms. An amber
 *  reading keeps its whole cell, RESET too, until the amber step. Past it, last of all, the modules drop
 *  their padding, keeping their ground; plain, which has none, brackets each
 *  reading once and sets them a column apart: four amber readings at 60
 *  columns in every palette. CACHE and 7D never go. */
const ORDER = {
  calm: ['reset5h', 'reset7d', 'remark5h', 'remark7d', 'spend', 'context', 'five', 'long'],
  amber: ['amberShort'],
  last: ['padding'],
} as const
type Piece = PieceOf<typeof ORDER>

/** A reading as its own module: on the board's ground, a column of padding
 *  either side until the last step, its ITEM's tiles in its own ink, then
 *  its cell's, white or amber, the flaps' own gap between them. Plain draws
 *  no ground: the row sets its modules apart instead. */
const moduleOf = (kit: Kit, k: Keeps<Piece>, row: BoardRow, cell: string): RenderElement => {
  const { Box, palette, onTone } = kit
  const ink = onTone(row.tone, palette.flapText, palette.flapAmber)
  const ground = groundOf(kit, k, palette.boardBg)
  return (
    <Box key={row.key} flexShrink={0} {...ground}>
      {flaps(kit, { key: 'flaps', alt: row.alt, runs: [[row.item, palette[ITEM_INK[row.key]]], [cell, ink]], bg: palette.flapBg, seam: palette.flapSeam, packed: !k.has('padding') })}
    </Box>
  )
}

/** A row's cell as the squeeze keeps it, chosen among its forms, never cut.
 *  Amber: whole until the amber step, then short. A calm limit: its reset
 *  while its step holds, then its remark while its own step holds, then its
 *  value. Any other: long, then short. */
const cellOf = (row: BoardRow, k: Keeps<Piece>): string => {
  if (row.tone === 'amber') return k.amber({ long: row.cell, short: row.cellShort })
  if (row.key !== '5h' && row.key !== '7d') return k.has('long') ? row.cell : row.cellShort
  if (k.has(row.key === '5h' ? 'reset5h' : 'reset7d')) return row.cell
  return k.has(row.key === '5h' ? 'remark5h' : 'remark7d') ? (row.cellNoReset ?? row.cell) : row.cellShort
}

/** Whether a reading keeps its group at a squeeze: an amber one always; the
 *  other limits only open. */
const keeps = (row: BoardRow, k: Keeps<Piece>): boolean =>
  row.key === 'other' ? false
  : row.key === 'spend' ? k.calm('spend', row.tone)
  : row.key === 'context' ? k.calm('context', row.tone)
  : row.key === '5h' ? k.calm('five', row.tone)
  : true

/** Each kept reading's module, then its air: the row's own gap is none, so
 *  every column between modules is one the row draws and measures. */
const collapsed = (kit: Kit, read: Readings, toggle: RenderElement): RenderElement =>
  fitLine(kit, ORDER, k => {
    const modules = read.board().rows.filter(r => keeps(r, k)).flatMap((r, i) => [
      moduleOf(kit, k, r, cellOf(r, k)),
      // The band's own background between modules, and after the last, before ▵.
      kit.air(`air${i}`, pieceGap(kit, k)),
    ])
    return line(kit, modules, toggle, 0)
  })

/** The board's tiles need room: below 60 columns the band draws chips. */
const MIN_COLUMNS = 60

export const departuresView: View = {
  rows: { desktop: 1, terminal: 1 },
  minColumns: MIN_COLUMNS,
  collapsed,
  open: departuresOpen,
}
