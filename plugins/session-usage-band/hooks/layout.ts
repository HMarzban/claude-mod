// How the band measures and fits a line: what gives way as it narrows, and
// how many columns a drawn tree takes on each surface.

import type { RenderChildren, RenderElement } from 'claude-code'

/** What the row gives up as it narrows, least important first. The row is
 *  measured after each step; an amber piece holds out until the end. */
export const GIVES_WAY = [
  'tokens',
  'weekReset',
  'fiveReset',
  'contextMeter',
  'calmWeek',
  'limitBars',
  'shortWording',
  'calmContext',
  'calmFive',
  'amberWeekReset',
  'amberFiveReset',
] as const
export type Piece = (typeof GIVES_WAY)[number]

/** For a give-way order: whether a line squeezed `squeeze` steps still keeps `piece`. */
export const keepsIn =
  <P extends string>(order: readonly P[]) =>
  (squeeze: number, piece: P): boolean =>
    squeeze <= order.indexOf(piece)

export const keeps = keepsIn<Piece>(GIVES_WAY)

/** What the workspace strip gives up as it narrows, least important first.
 *  The path, the branch and the change count's word shorten; the extras go
 *  whole, and the path's hover card still says everything. Uncommitted
 *  changes never go: they are what a narrow line must still say. */
export const STRIP_GIVES_WAY = [
  'clean',
  'parent',
  'changedWord',
  'branchLong',
  'worktreeOf',
  'aheadBehind',
  'branchShort',
  'worktree',
  'nameLong',
  'nameShort',
] as const
export const stripKeeps = keepsIn<(typeof STRIP_GIVES_WAY)[number]>(STRIP_GIVES_WAY)

/** Below this, the cache and context wording turns short whatever the squeeze. */
export const SHORT_BELOW = 68
export const METER_CELLS = 6
export const METER_PX = 44
/** The longest line a card holds unwrapped, in characters:
 *  `resets 2d 19h · full before reset`. */
export const CARD_TEXT = 33
/** Columns a framed Button's padding and edges take beyond its label. */
export const BUTTON_CHROME = 3
/** Columns a Button's hotkey mark takes beside its label. */
export const HOTKEY_MARK = 2
/** Room the band keeps free, so a row measured a little short never wraps. */
export const ROW_SLACK = 4

/** A bar's length: px on desktop, cells elsewhere. */
export type BarSize = Readonly<{ px: number; cells: number }>
export const CHIP_BAR: BarSize = { px: METER_PX, cells: METER_CELLS }

/** How a surface lays text out against its bodyColumns: the terminal one cell
 *  a character; the desktop's proportional font runs about three quarters of
 *  a column, at roughly 10px a column. */
export type Measure = Readonly<{ text: number; pxPerCell: number }>
export const TERMINAL: Measure = { text: 1, pxPerCell: 8 }
export const DESKTOP: Measure = { text: 0.75, pxPerCell: 10 }

export const isList = (n: RenderChildren): n is readonly RenderChildren[] => Array.isArray(n)

/** Whether `n` is a Box placed out of the flow: a hover card. */
const isPlaced = (n: RenderChildren): boolean =>
  typeof n === 'object' && n !== null && !isList(n) && n.type === 'Box' && n.props?.position === 'absolute'

/** Columns a drawn tree takes: text, padding, gaps and Button labels. Hidden
 *  cards take none, nor a gap; an Svg takes its width in columns, rounded up. */
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
      const kids = (n.children ?? []).filter(k => k !== null && k !== undefined && !isPlaced(k))
      const pad = typeof n.props?.paddingX === 'number' ? 2 * n.props.paddingX : 0
      const gap = typeof n.props?.columnGap === 'number' ? n.props.columnGap * Math.max(0, kids.length - 1) : 0
      const own = kids.reduce((sum: number, k) => sum + cellsOf(k, m), 0) + pad + gap
      return n.type === 'Box' && typeof n.props?.minWidth === 'number' ? Math.max(n.props.minWidth, own) : own
    }
    default:
      return 0
  }
}

/** The column each of a row's drawn pieces starts at, the pieces `gap`
 *  columns apart. */
export const startsOf = (pieces: readonly RenderChildren[], gap: number, m: Measure): number[] => {
  let at = 0
  return pieces.map(piece => {
    const start = at
    at += cellsOf(piece, m) + gap
    return start
  })
}

/** The first squeeze at which `build` fits `room` columns, or the last tried:
 *  a line drops its pieces in the order its give-way table names them. */
export const squeezeToFit = (build: (squeeze: number) => RenderElement, steps: number, room: number, m: Measure): RenderElement => {
  let line = build(0)
  for (let squeeze = 1; squeeze <= steps && cellsOf(line, m) > room; squeeze++) line = build(squeeze)
  return line
}
