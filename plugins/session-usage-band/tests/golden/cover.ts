// tests/golden/cover.ts — whole pieces: in the frame a hover card shows in,
// every piece of its row is covered whole or left whole, so no sliver of a
// chip reads as a value of its own.
import type { RenderChildren } from 'claude-code'
import { DESKTOP, HOTKEY_MARK, ROW_SLACK, TERMINAL, cellsOf, isDrawn } from '../../hooks/layout'
import { byKey, isCard, textOf, widthOf, type Node } from '../helpers'

type Surface = 'terminal' | 'desktop'
type Span = readonly [number, number]

/** Columns a drawn piece takes: counted exactly on the terminal; on the
 *  desktop by the band's measure, the only count it has. */
const cellsIn = (n: unknown, surface: Surface): number => (surface === 'terminal' ? widthOf(n) : cellsOf(n as RenderChildren, DESKTOP))

/** Each of `items`' columns, [start, end), from `from`, `gap` columns apart. */
const spansOf = (items: readonly unknown[], gap: number, surface: Surface, from: number): Span[] => {
  let at = from
  return items.map(n => {
    const start = at
    at += cellsIn(n, surface)
    const span: Span = [start, at]
    at += gap
    return span
  })
}

const kidsOf = (n: Node | undefined): Node[] => ((n?.children ?? []) as unknown[]).filter(isDrawn) as Node[]

/** A strip's separator: the ` · ` Text between two pieces, in either tier,
 *  which is air. */
const isSeparator = (n: Node): boolean => n.type === 'Text' && /^ [·,-] ?$/.test(textOf(n))

/** Where `card` falls short of covering a piece at `span` whole or not at
 *  all, on the side its `left` or `right` counts from; the desktop's measure
 *  is an estimate, so it is allowed half a column. */
const partly = (card: Node, span: Span, surface: Surface): boolean => {
  const from = Number(card.props?.left ?? card.props?.right)
  const to = from + Number(card.props?.width)
  const slack = surface === 'desktop' ? 0.5 : 0
  const [start, end] = span
  const apart = to <= start + slack || from >= end - slack
  const whole = from <= start + slack && to >= end - slack
  return !apart && !whole
}

/** The part of a span within `room`. */
const within = (room: number) => ([start, end]: Span): Span => [Math.min(start, room), Math.min(end, room)]

/** Each piece a card covers in part, as `<card's piece> over <piece>`, for
 *  chips' row, `cols` wide, and the workspace strip. A card ends within its
 *  room, short of ▵ in the row, so a piece that runs on past it, as an
 *  all-amber row or a narrow strip clips, is held to its part within it. A
 *  strip card is held to its own side's pieces: the fill between the sides
 *  has no width the band knows. */
export const partCovered = (tree: unknown, surface: Surface, cols: number): string[] => {
  const errors: string[] = []
  const check = (cards: readonly Node[], pieces: readonly Node[], spans: readonly Span[]) => {
    for (const card of cards)
      pieces.forEach((piece, i) => {
        const span = spans[i]
        if (span !== undefined && partly(card, span, surface))
          errors.push(`${String(card.hover?.scope)} over ${String(piece.props?.key)} [${span.join(', ')}) at ${String(card.props?.left ?? `right ${card.props?.right}`)}+${String(card.props?.width)}`)
      })
  }
  const row = kidsOf(tree as Node)[0]
  const kids = kidsOf(row)
  const pills = kids.slice(0, Math.max(0, kids.findIndex(isCard))).filter(k => k.props?.key !== undefined)
  const room = Math.floor(cols - cellsIn(kids.at(-1), surface) - 1)
  check(kids.filter(isCard), pills, spansOf(pills, 1, surface, 0).map(within(room)))

  const strip = byKey(tree, 'strip', 'Box')
  if (strip !== undefined) {
    const pad = Number(strip.props?.paddingX ?? 0)
    // In the footer the strip shares its line with the buttons, as chips gives it room.
    const actions = byKey(tree, 'actions', 'Box')
    const inFooter = byKey(actions, 'strip', 'Box') !== undefined
    const buttons = kidsOf(actions).filter(k => k.type === 'Button')
    const footer = inFooter ? cellsOf(buttons as RenderChildren[], surface === 'desktop' ? DESKTOP : TERMINAL) + 2 * HOTKEY_MARK + 2 : 0
    const stripRoom = cols - ROW_SLACK - footer
    const stripCards = kidsOf(strip).filter(isCard)
    for (const [side, anchor] of [['ws:where', 'left'], ['ws:state', 'right']] as const) {
      const box = byKey(strip, side, 'Box')
      const line = anchor === 'left' ? kidsOf(box) : kidsOf(box).reverse()
      const spans = spansOf(line, Number(box?.props?.columnGap ?? 0), surface, pad)
      const pieces = line.map((n, i) => [n, spans[i]] as const).filter(([n]) => !isSeparator(n))
      check(
        stripCards.filter(card => card.props?.[anchor] !== undefined),
        pieces.map(([n]) => n),
        pieces.map(([, span]) => within(stripRoom)(span ?? [0, 0])),
      )
    }
  }
  return errors
}
