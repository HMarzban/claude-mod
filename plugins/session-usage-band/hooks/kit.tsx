// The drawing kit: what every part of the band draws with, made once per
// draw from the surface's element table and the snapshot. JSX compiles to the
// global h(), so nothing here, or anywhere, is named h.

import type { ElementTable, RenderChildren, RenderElement, TextProps } from 'claude-code'
import { clipWords } from './format'
import { asciiText, asciiTree, drawnTier } from './glyphs'
import { ALT, GLYPH, ICON_PATHS, ICON_PX } from './icons'
import type { Icon } from './icons'
import { DESKTOP, DESKTOP_CARD_TEXT, TERMINAL } from './layout'
import type { Span } from './layout'
import type { Tone } from './reading'
import type { BandSnapshot } from './snapshot'

/** Where a hover card sits in its row, which has `room` columns: by `left`,
 *  its piece's first column, or by `right`, how far short of the row's right
 *  edge its piece ends. `pieces` are the row's pieces, counted from the same
 *  side, at least a column apart. */
export type CardPlace = Readonly<({ left: number } | { right: number }) & { room: number; pieces: readonly Span[] }>

/** The columns a card `cells` wide takes at `place`, counted from its side.
 *  It starts a column before its piece, where a text surface's cap sits in
 *  the gap and the desktop's ground takes up the measure's error, slid back
 *  only as far as it must to end within the room. Then it covers whole
 *  pieces: each piece it enters, the column either side included, so no
 *  piece shows in part, all within the room. A row has none to give where
 *  it has no room. */
const cardSpan = (place: CardPlace, cells: number) => {
  const room = Math.floor(place.room)
  const width = Math.max(0, Math.min(cells, room))
  let from = Math.max(0, Math.min(('right' in place ? place.right : place.left) - 1, room - width))
  let to = from + width
  for (const [start, end] of place.pieces) {
    if (start < to && end > from) {
      from = Math.min(from, start - 1)
      to = Math.max(to, end + 1)
    }
  }
  // The desktop's columns are estimates: the nearest whole ones.
  const near = Math.round(Math.max(0, from))
  const span = { width: Math.max(0, Math.round(Math.min(room, to)) - near) }
  return 'right' in place ? { right: near, ...span } : { left: near, ...span }
}

export const makeKit = (el: ElementTable, snap: BandSnapshot) => {
  const { Box, Button, Text } = el
  const palette = snap.palette
  const measure = snap.surface === 'desktop' ? DESKTOP : TERMINAL
  // Svg draws on the desktop alone (other surfaces hold the element but drop
  // it), and its markup takes hex: theme keys can't reach inside it, so plain
  // appearance keeps text.
  const Svg = snap.surface === 'desktop' && palette.filled && 'Svg' in el ? el.Svg : undefined
  const onTone = (tone: Tone, calm: string, amber: string = palette.amberFg) => (tone === 'amber' ? amber : calm)
  const glyphs = drawnTier(snap)
  /** `n` in the glyphs it is drawn in: band.tsx maps the tree last, so a
   *  piece is measured here where its cards are placed. */
  const asDrawn = (n: RenderChildren): RenderChildren => (glyphs === 'ascii' ? asciiTree(n) : n)

  // A piece and its card share this hover scope; see hoverCard and
  // CONTRIBUTING's hover-card rules.
  const scopeOf = (key: string) => `band-${key}`

  /** One line of text, cut where its box ends rather than wrapped. The
   *  unicode tier leaves the cut to the surface, which ends it with `…`; the
   *  ascii tier clips it to its row instead, at its last whole word, since
   *  that `…` is East-Asian-Ambiguous: a CJK terminal, the tier's own,
   *  draws it two columns wide where Ink counts one. */
  const oneLine = ({ key, ...props }: TextProps & { key?: string }, children: RenderChildren): RenderElement => {
    const keyed = key === undefined ? {} : { key }
    if (glyphs !== 'ascii')
      return (
        <Text {...keyed} {...props} wrap="truncate-end">
          {children}
        </Text>
      )
    return (
      <Box {...keyed} height={1} overflow="hidden">
        <Text {...props}>{children}</Text>
      </Box>
    )
  }

  /** The props that make a keyed Box reveal the hover card drawn for `key`. */
  const hoverable = (key: string) => (palette.filled ? { hover: { scope: scopeOf(key) } } : {})

  /** The one-line explanation `key`'s piece reveals, for after the pieces of
   *  its row, placed as `place` says. It has no key: a keyed Box is its own
   *  hover scope, and a hidden one could never be hovered. It is inverted
   *  against the chips, and on a text surface its ends are half blocks in its
   *  ground's colour on the band's own background, so they read as rounded
   *  edges where a one-row band has no room for a border; the desktop, with
   *  or without Svg, draws the ground alone, whose own edge is sharp. Past
   *  its text, the ground runs on to the end of the last piece it covers, so
   *  the card stays one slab. A card with no room past its padding and caps
   *  for one character isn't drawn. */
  const hoverCard = (key: string, text: string, place: CardPlace): RenderChildren => {
    if (!palette.filled) return null
    const capped = snap.surface !== 'desktop'
    // The columns around the text: its padding, and a text surface's caps.
    const chrome = capped ? 4 : 2
    // Sized in the glyphs it is drawn in: the ascii tier's are narrower.
    const shown = glyphs === 'ascii' ? asciiText(text) : text
    // A text surface counts a cell a character; the desktop sizes by its font.
    const cells = (capped ? shown.length : Math.ceil(shown.length * DESKTOP_CARD_TEXT)) + chrome
    const span = cardSpan(place, cells)
    if (span.width < chrome + 1) return null
    const shell = { position: 'absolute', top: 0, ...span, display: 'none', hover: { display: 'flex', scope: scopeOf(key) } } as const
    const ground = { backgroundColor: palette.tooltipBg, paddingX: 1 }
    // The ascii tier knows its room to the cell, so it makes its own cut, at
    // its last whole word with a `.`, as oneLine clips: the surface's would
    // end in a two-column `…`.
    const room = span.width - chrome
    const words =
      glyphs === 'ascii' ? (
        <Text color={palette.tooltipFg}>{clipWords(shown, room)}</Text>
      ) : (
        <Text color={palette.tooltipFg} wrap="truncate-end">
          {text}
        </Text>
      )
    if (!capped) return <Box {...shell} {...ground}>{words}</Box>
    return (
      <Box {...shell}>
        <Text color={palette.tooltipBg}>▐</Text>
        <Box {...ground} width={span.width - 2}>
          {words}
        </Box>
        <Text color={palette.tooltipBg}>▌</Text>
      </Box>
    )
  }

  /** A column of air. The desktop drops a string child that is only spaces,
   *  plain or not, so there the gap is an empty Box; a text surface keeps
   *  its space. */
  const gap = (key: string): RenderChildren => (snap.surface === 'desktop' ? <Box key={key} width={1} flexShrink={0} /> : ' ')

  /** `columns` of air that is always an element, for a Box whose children
   *  are all elements: the desktop's an empty Box, a text surface's a Text of
   *  spaces, since a text surface draws no bare string in a Box. */
  const air = (key: string, columns = 1): RenderElement =>
    snap.surface === 'desktop' ? <Box key={key} width={columns} flexShrink={0} /> : <Text key={key}>{' '.repeat(columns)}</Text>

  /** An icon and the gap after it: an Svg on desktop, a glyph elsewhere. */
  const icon = (name: Icon, color: string, alt: string = ALT[name]): RenderChildren[] => {
    if (Svg) {
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 16 16">${ICON_PATHS[name](color)}</svg>`
      return [<Svg key={`i-${name}`} source={source} alt={alt} width={ICON_PX} height={ICON_PX} />, gap(`g-${name}`)]
    }
    return GLYPH[name] ? [<Text key={`i-${name}`} color={color}>{`${GLYPH[name]} `}</Text>] : []
  }

  return { Box, Button, Text, Svg, palette, measure, columns: snap.columns, glyphs, asDrawn, onTone, oneLine, hoverable, hoverCard, gap, air, icon }
}

export type Kit = ReturnType<typeof makeKit>
