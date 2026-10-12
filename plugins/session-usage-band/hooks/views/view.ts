// What a layout is, and how a new one is made: the rows it declares, its
// collapsed lines, and what it brings to the shared cards when open.
// Views import View from here, never from ./index, so no cycle forms.

import type { RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { cardsView, type OpenOptions } from './cards'

export type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{ rows: Rows; draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement }>
/** What a view brings to the shared cards: its mark in each card's head, a
 *  card's headline and first row in its own words, and the facts its
 *  collapsed lines already show. */
export type CardOptions = Omit<OpenOptions, 'collapsedRows'>
/** A view's collapsed lines, top to bottom, the last ending with the toggle;
 *  and its card options, asked for only while open, so they may read what
 *  fitting those lines found and a shut band builds none. */
type Build = (kit: Kit, read: Readings, act: BandActions) => Readonly<{ lines: RenderElement[]; open?: () => CardOptions }>

/** The rows a view declares where it is drawn: the desktop's only where Svg
 *  draws; desktop plain draws text, as the terminal does. */
export const rowsOf = (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>): number =>
  kit.Svg ? view.rows.desktop : view.rows.terminal

/** A layout in the shared language: its collapsed lines on the band's
 *  ground, and chips' cards and footer beneath when open. */
export const defineCardsView = (rows: Rows, build: Build): View => {
  const view: View = {
    rows,
    draw: (kit, read, act) => {
      const { lines, open } = build(kit, read, act)
      const collapsedRows = rowsOf(view, kit)
      return cardsView(kit, read, act, lines, read.frame.expanded && open !== undefined ? { ...open(), collapsedRows } : { collapsedRows })
    },
  }
  return view
}
