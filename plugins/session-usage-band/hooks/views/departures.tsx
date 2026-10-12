// Departures, the split-flap board: each reading a line of the board, in the
// one order. Collapsed, each reading's ITEM and cell as one group of tiles;
// open, the board itself (departures-board.tsx). The words are the board's
// (words.ts boardWords); this file only lays tiles.

import type { RenderElement } from 'claude-code'
import { flaps } from '../flaps'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { BoardRow } from '../words'
import { ITEM_INK, openBoard } from './departures-board'
import { toggleButton } from './frame'
import { beforeLast, fitLine, line, type Keeps } from './parts'
import type { View } from './view'

/** What gives way as the row narrows, first to last (spec §5.2), calm only:
 *  5h's ↻, 7d's ↻, SPEND, CONTEXT, 5h's remark, then 5H itself, so at 40
 *  columns the row is CACHE and 7D alone, then the short forms. An amber
 *  reading keeps its whole cell, ↻ too, until fitLine's amber step, last of
 *  all. CACHE and 7D never go. */
const ORDER = ['reset5h', 'reset7d', 'spend', 'context', 'remark5h', 'five', 'long'] as const
type Piece = (typeof ORDER)[number]

/** A reading as one group of tiles: its ITEM, then its cell. */
const group = (kit: Kit, row: BoardRow, cell: string): RenderElement => {
  const { Box, palette } = kit
  const ink = row.tone === 'amber' ? palette.flapAmber : palette.flapText
  return (
    <Box key={row.key} flexShrink={0}>
      {flaps(kit, { key: 'flaps', alt: row.alt, runs: [[row.item, palette[ITEM_INK[row.key]]], [cell, ink]], bg: palette.flapBg, seam: palette.flapSeam })}
    </Box>
  )
}

/** A row's cell as the squeeze keeps it, chosen among its forms, never cut.
 *  Amber: whole until the amber step, then short. A calm limit: its reset
 *  while its step holds, then its remark (5h's until its own step, 7d's
 *  until the short forms), then its value. Any other: long, then short. */
const cellOf = (row: BoardRow, k: Keeps<Piece>): string => {
  if (row.tone === 'amber') return beforeLast(k) ? row.cell : row.cellShort
  if (row.key !== '5h' && row.key !== '7d') return k.has('long') ? row.cell : row.cellShort
  if (k.has(row.key === '5h' ? 'reset5h' : 'reset7d')) return row.cell
  return k.has(row.key === '5h' ? 'remark5h' : 'long') ? (row.cellNoReset ?? row.cell) : row.cellShort
}

/** Whether a reading keeps its group at a squeeze: an amber one always; the
 *  other limits only open. */
const keeps = (row: BoardRow, k: Keeps<Piece>): boolean =>
  row.key === 'other' ? false
  : row.key === 'spend' ? k.calm('spend', row.tone)
  : row.key === 'context' ? k.calm('context', row.tone)
  : row.key === '5h' ? k.calm('five', row.tone)
  : true

const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, kit.columns - ROW_SLACK, k =>
    line(kit, 'row', read.board.rows.filter(r => keeps(r, k)).map(r => group(kit, r, cellOf(r, k))), toggleButton(kit, read, act)))

export const departuresView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { Box } = kit
    return (
      <Box flexDirection="column">
        {collapsed(kit, read, act)}
        {read.frame.expanded ? openBoard(kit, read, act) : null}
      </Box>
    )
  },
}
