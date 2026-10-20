// What a layout is: the rows it declares, its collapsed row and what opens
// beneath it; frame.tsx's drawView puts them together. Views import View
// from here, never from ./index, so no cycle forms.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'

type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{
  rows: Rows
  /** The fewest columns it draws in; below them the band draws chips. */
  minColumns?: number
  /** Its collapsed row, `toggle` at its end: the row nearest the prompt. */
  collapsed: (kit: Kit, read: Readings, toggle: RenderElement) => RenderElement
  /** What opens beneath the collapsed lines, given the rows they take. */
  open: (kit: Kit, read: Readings, act: BandActions, collapsedRows: number) => RenderChildren
}>
/** The rows a view declares where it is drawn: the desktop's only where Svg
 *  draws; desktop plain draws text, as the terminal does. */
export const rowsOf = (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>): number =>
  kit.Svg ? view.rows.desktop : view.rows.terminal
