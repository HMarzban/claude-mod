// How the band measures a line: how many columns a drawn tree takes on each
// surface, the sizes it lays out by, and the squeeze that fits a line to its
// room by a give-way order its layout names.

import type { RenderChildren, RenderElement } from 'claude-code'

/** The longest line a card holds unwrapped, in characters: LIMITS' lead
 *  row, `resets  Mon 08:40 · full before reset`, its label two columns apart. */
export const CARD_TEXT = 37
/** Columns a framed Button's padding and edges take beyond its label. */
const BUTTON_CHROME = 3
/** Columns a Button's hotkey mark takes beside its label. */
export const HOTKEY_MARK = 2
/** Room the band keeps free, so a row measured a little short never wraps. */
export const ROW_SLACK = 4

/** A bar's length: px on desktop, cells elsewhere. */
export type BarSize = Readonly<{ px: number; cells: number }>

/** How a surface lays text out against its bodyColumns: the terminal one cell
 *  a character; the desktop's proportional font runs about three quarters of
 *  a column, at roughly 10px a column. */
type Measure = Readonly<{ text: number; pxPerCell: number }>
export const TERMINAL: Measure = { text: 1, pxPerCell: 8 }
export const DESKTOP: Measure = { text: 0.75, pxPerCell: 10 }
/** On a proportional surface the board's capitals and digits take a full
 *  column each: SF at 15 px draws a capital 9.9 px and a digit 8.8 against
 *  a 10 px column, where the measure's 0.75 fits prose's lower case (7.7
 *  px). Every other character keeps the measure's own: a bracket is 5.5 px,
 *  a space 4.2, punctuation 7.0. Monospace counts every character as one. */
const BOARD_CAPS = 1
export const boardCells = (text: string, m: Measure): number =>
  m.text >= 1 ? [...text].length * m.text : [...text].reduce((n, c) => n + (/[A-Z0-9]/.test(c) ? BOARD_CAPS : m.text), 0)

/** Columns a desktop hover card's text takes a character: about 0.8, as
 *  measured on the desktop on 0.12.0's wording (its 57-character 7d card ran
 *  about 453px), a little over the measure's 0.75 so a card never cuts its
 *  own words. */
export const DESKTOP_CARD_TEXT = 0.8

export const isList = (n: RenderChildren): n is readonly RenderChildren[] => Array.isArray(n)

/** Whether a child draws anything: null, undefined and false draw nothing. */
export const isDrawn = (child: unknown): boolean => child !== null && child !== undefined && child !== false

/** Whether `n` is a Box placed out of the flow: a hover card. */
const isPlaced = (n: RenderChildren): boolean =>
  typeof n === 'object' && n !== null && !isList(n) && n.type === 'Box' && n.props?.position === 'absolute'

/** Columns a drawn tree takes: text, padding, gaps and Button labels. A
 *  column Box takes its widest row; hidden cards take none, nor a gap; an
 *  Svg takes its width in columns, rounded up. */
export const cellsOf = (n: RenderChildren, m: Measure): number => {
  if (n === null || n === undefined || typeof n === 'boolean') return 0
  if (typeof n === 'string' || typeof n === 'number') return [...String(n)].length * m.text
  if (isList(n)) return n.reduce((sum: number, k: RenderChildren) => sum + cellsOf(k, m), 0)
  switch (n.type) {
    case 'Button':
      // A framed button's chrome: its padding and edges either side.
      return [...(n.props.label ?? '')].length * m.text + (n.props.variant === undefined ? 0 : BUTTON_CHROME)
    case 'Svg':
      return Math.ceil((n.props.width ?? 64) / m.pxPerCell)
    case 'Box':
    case 'Text': {
      if (isPlaced(n)) return 0
      if (n.type === 'Box' && typeof n.props?.width === 'number') return n.props.width
      const kids = (n.children ?? []).filter(k => isDrawn(k) && !isPlaced(k))
      const pad = typeof n.props?.paddingX === 'number' ? 2 * n.props.paddingX : 0
      const widths = kids.map(k => cellsOf(k, m))
      const own =
        n.type === 'Box' && n.props?.flexDirection === 'column'
          ? Math.max(0, ...widths) + pad
          : widths.reduce((sum, w) => sum + w, 0) +
            pad +
            (typeof n.props?.columnGap === 'number' ? n.props.columnGap * Math.max(0, kids.length - 1) : 0)
      return n.type === 'Box' && typeof n.props?.minWidth === 'number' ? Math.max(n.props.minWidth, own) : own
    }
    default:
      return 0
  }
}

/** The columns a piece takes in its row: from its first, up to its end. */
export type Span = readonly [start: number, end: number]

/** The columns each of a row's drawn pieces takes, the pieces `gap`
 *  columns apart. */
export const spansOf = (pieces: readonly RenderChildren[], gap: number, m: Measure): Span[] => {
  let at = 0
  return pieces.map(piece => {
    const start = at
    at += cellsOf(piece, m)
    const span: Span = [start, at]
    at += gap
    return span
  })
}

/** The line `build` draws at the first step of `order` at which it fits
 *  `room` columns, or at the last: a line drops its pieces in the order
 *  named, and `has` says whether a piece is still kept. */
export const squeezeToFit = <P extends string>(order: readonly P[], room: number, m: Measure, build: (has: (piece: P) => boolean) => RenderElement): RenderElement => {
  const at = (squeeze: number) => build(piece => squeeze <= order.indexOf(piece))
  let squeeze = 0
  let line = at(squeeze)
  while (squeeze < order.length && cellsOf(line, m) > room) line = at(++squeeze)
  return line
}
