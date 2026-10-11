// What a layout is, and how a new one is made: its name, the rows it
// declares, its collapsed lines and its body, drawn in the shared frame.
// Views import View from here, never from ./index, so no cycle forms.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions, LayoutName } from '../snapshot'
import { cardsView, type OpenOptions } from './cards'
import { openView, panel, type Strip } from './frame'

export type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{ name: LayoutName; rows: Rows; draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement }>
/** A view's collapsed lines, top to bottom; the last ends with the toggle. */
export type Lines = (kit: Kit, read: Readings, act: BandActions) => RenderElement[]
/** A view's expanded body, given the rows it may take. */
export type Body = (kit: Kit, read: Readings) => (bodyRows: number) => RenderChildren[]
/** What a view brings to the shared cards: its mark in each card's head, and
 *  the facts its collapsed lines already show. */
export type Lens = (kit: Kit, read: Readings) => Omit<OpenOptions, 'collapsedRows'>

/** The rows a view declares where it is drawn: the desktop's only where Svg
 *  draws; desktop plain draws text, as the terminal does. */
export const rowsOf = (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>): number =>
  kit.Svg ? view.rows.desktop : view.rows.terminal

/** A new layout: its lines in a panel on the card ground, and the frame beneath when open. */
export const defineView = (name: LayoutName, rows: Rows, lines: Lines, body: Body, strip?: Strip): View => {
  const view: View = {
    name,
    rows,
    draw: (kit, read, act) =>
      openView(kit, read, act, panel(kit, 'collapsed', lines(kit, read, act)), rowsOf(view, kit), body(kit, read), strip),
  }
  return view
}

/** A layout in the shared language: its collapsed lines on the band's
 *  ground, and chips' cards and footer beneath when open, through its lens.
 *  Each layout moves here from `defineView` in turn. */
export const defineCardsView = (name: LayoutName, rows: Rows, lines: Lines, lens: Lens = () => ({})): View => {
  const view: View = {
    name,
    rows,
    draw: (kit, read, act) => cardsView(kit, read, act, lines(kit, read, act), { ...lens(kit, read), collapsedRows: rowsOf(view, kit) }),
  }
  return view
}
