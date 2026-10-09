// The drawing kit: what every part of the band draws with, made once per
// draw from the surface's element table and the snapshot. JSX compiles to the
// global h(), so nothing here, or anywhere, is named h.

import type { ElementTable, RenderChildren } from 'claude-code'
import { ALT, GLYPH, ICON_PATHS, ICON_PX } from './icons'
import type { Icon } from './icons'
import { DESKTOP, TERMINAL } from './layout'
import type { Tone } from './reading'
import type { BandSnapshot } from './snapshot'

export const makeKit = (el: ElementTable, snap: BandSnapshot) => {
  const { Box, Button, Text } = el
  const palette = snap.palette
  const measure = snap.surface === 'desktop' ? DESKTOP : TERMINAL
  // Svg draws on the desktop alone (other surfaces hold the element but drop
  // it), and its markup takes hex: theme keys can't reach inside it, so plain
  // appearance keeps text.
  const Svg = snap.surface === 'desktop' && palette.filled && 'Svg' in el ? el.Svg : undefined
  const onTone = (tone: Tone, calm: string, amber: string = palette.amberFg) => (tone === 'amber' ? amber : calm)

  /** A one-line explanation shown while its keyed parent is hovered. It has
   *  no key: a keyed Box is its own hover scope, and a hidden one could never
   *  be hovered. Plain has no background to cover the row with, so none. */
  const hoverCard = (text: string, anchor: 'left' | 'right'): RenderChildren =>
    palette.filled ? (
      <Box
        position="absolute"
        top={0}
        {...(anchor === 'left' ? { left: 0 } : { right: 0 })}
        width={Math.min(text.length + 2, snap.columns)}
        display="none"
        hover={{ display: 'flex' }}
        backgroundColor={palette.tooltipBg}
        paddingX={1}
      >
        <Text color={palette.value} wrap="truncate-end">
          {text}
        </Text>
      </Box>
    ) : null


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

  return { Box, Button, Text, Svg, palette, measure, columns: snap.columns, onTone, hoverCard, gap, icon }
}

export type Kit = ReturnType<typeof makeKit>
