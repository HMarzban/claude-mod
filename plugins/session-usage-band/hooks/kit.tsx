// The drawing kit: what every part of the band draws with, made once per
// draw from the surface's element table and the snapshot. JSX compiles to the
// global h(), so nothing here, or anywhere, is named h.

import type { ElementTable, RenderChildren } from 'claude-code'
import { ALT, GLYPH, ICON_PATHS, ICON_PX } from './icons'
import type { Icon } from './icons'
import { DESKTOP, TERMINAL } from './layout'
import type { Tone } from './reading'
import type { BandSnapshot } from './snapshot'

/** Where a hover card sits in its row, which has `room` columns: from
 *  `left`, its piece's first column, slid left only as far as it must to end
 *  within the room; or ending where its piece ends, `right` columns short of
 *  the row's right edge, as wide as the room left of that end allows. */
export type CardPlace = Readonly<{ left: number; room: number }> | Readonly<{ right: number; room: number }>

/** The columns a card `cells` wide takes at `place`: its own width or the
 *  room it has, whichever is less, and none where a row has no room. */
const cardSpan = (place: CardPlace, cells: number) => {
  const room = Math.floor(place.room)
  if ('right' in place) {
    const right = Math.round(place.right)
    return { right, width: Math.max(0, Math.min(cells, room - right)) }
  }
  const width = Math.max(0, Math.min(cells, room))
  return { left: Math.max(0, Math.min(Math.round(place.left), room - width)), width }
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

  // A piece and its hover card share a hover scope, so the card can sit
  // apart from the piece, after every piece in their row: a placed Box paints
  // over those before it, so inside its own piece the pieces after would
  // paint over it. The pointer on a showing card keeps it showing, so a card
  // is as wide as its text and sits at its piece: moving onto a piece it does
  // not cover switches cards. Plain has no background to cover the row with,
  // so no cards and no scopes.
  const scopeOf = (key: string) => `band-${key}`

  /** The props that make a keyed Box reveal the hover card drawn for `key`. */
  const hoverable = (key: string) => (palette.filled ? { hover: { scope: scopeOf(key) } } : {})

  /** The one-line explanation `key`'s piece reveals, for after the pieces of
   *  its row, placed as `place` says. It has no key: a keyed Box is its own
   *  hover scope, and a hidden one could never be hovered. A card with no
   *  room past its padding for one character isn't drawn. */
  const hoverCard = (key: string, text: string, place: CardPlace): RenderChildren => {
    if (!palette.filled) return null
    const span = cardSpan(place, text.length + 2)
    if (span.width < 3) return null
    return (
      <Box
        position="absolute"
        top={0}
        {...span}
        display="none"
        hover={{ display: 'flex', scope: scopeOf(key) }}
        backgroundColor={palette.tooltipBg}
        paddingX={1}
      >
        <Text color={palette.value} wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
  }

  /** A column of air. The desktop drops a string child that is only spaces,
   *  so there the gap is an empty Box; a text surface keeps its space. */
  const gap = (key: string): RenderChildren => (Svg ? <Box key={key} width={1} flexShrink={0} /> : ' ')

  /** An icon and the gap after it: an Svg on desktop, a glyph elsewhere. */
  const icon = (name: Icon, color: string, alt: string = ALT[name]): RenderChildren[] => {
    if (Svg) {
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 16 16">${ICON_PATHS[name](color)}</svg>`
      return [<Svg key={`i-${name}`} source={source} alt={alt} width={ICON_PX} height={ICON_PX} />, gap(`g-${name}`)]
    }
    return GLYPH[name] ? [<Text key={`i-${name}`} color={color}>{`${GLYPH[name]} `}</Text>] : []
  }

  return { Box, Button, Text, Svg, palette, measure, columns: snap.columns, onTone, hoverable, hoverCard, gap, icon }
}

export type Kit = ReturnType<typeof makeKit>
