// What a layout is: the rows it declares and how it draws.
// Views import View from here, never from ./index, so no cycle forms.

import type { RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'

type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{
  rows: Rows
  /** The fewest columns it draws in; below them the band draws chips. */
  minColumns?: number
  draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement
}>
/** The rows a view declares where it is drawn: the desktop's only where Svg
 *  draws; desktop plain draws text, as the terminal does. */
export const rowsOf = (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>): number =>
  kit.Svg ? view.rows.desktop : view.rows.terminal
