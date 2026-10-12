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
 *  amber words shorten last of all, at the step fitLine appends. 5H goes
 *  after its remark, before the short forms, so at 40 columns the row is
 *  CACHE and 7D alone. CACHE and 7D never go. */
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

/** A row's cell as the squeeze keeps it, chosen among its forms, never cut:
 *  a limit's reset while its step holds, then its remark, then its value; any
 *  other reading's long form, then its short. An amber cell keeps its words
 *  until the amber step. */
const cellOf = (row: BoardRow, k: Keeps<Piece>): string => {
  const long = row.tone === 'amber' ? beforeLast(k) : k.has('long')
  if (row.key !== '5h' && row.key !== '7d') return long ? row.cell : row.cellShort
  if (k.has(row.key === '5h' ? 'reset5h' : 'reset7d')) return row.cell
  return long || (row.key === '5h' && k.has('remark5h')) ? (row.cellNoReset ?? row.cell) : row.cellShort
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
