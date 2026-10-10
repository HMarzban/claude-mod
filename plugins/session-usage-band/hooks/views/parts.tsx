// The pieces several views draw: the pill a chip sits in, and the cache's
// battery, as an icon on the desktop and as the pill itself in a terminal.

import type { RenderChildren, RenderElement } from 'claude-code'
import { clamp01 } from '../format'
import type { Kit } from '../kit'
import type { Tone } from '../reading'

export type PillSpec = Readonly<{
  key: string
  tone: Tone
  body: RenderChildren[]
  /** The one-line explanation shown while the pill is hovered. */
  hover?: string
  /** The terminal battery paints its own background in its Texts. */
  paintsOwnBg?: boolean
  bg?: string
}>

/** A pill carries its own foreground and background, never one of each. Its
 *  card is a child, so the engine counts the pointer on the card as on the
 *  pill and reading it keeps the pill hovered. The card has no key: a keyed
 *  Box is its own hover scope, and a hidden one could never be hovered. One
 *  line, since a collapsed band is one row. Plain has no background to cover
 *  the row with, so no cards; the expanded line says it all. A pill never
 *  shrinks: the squeeze drops pieces instead, so its text never wraps. */
export const pill = (kit: Kit, { key, tone, body, hover, paintsOwnBg, bg }: PillSpec, anchor: 'left' | 'right'): RenderElement => {
  const { Box, Text, palette, onTone, hoverCard } = kit
  if (!palette.filled) {
    const fg = onTone(tone, palette.value)
    return (
      <Box key={key} flexShrink={0}>
        <Text color={fg}>[</Text>
        {body}
        <Text color={fg}>]</Text>
      </Box>
    )
  }
  const fill = paintsOwnBg ? {} : { backgroundColor: onTone(tone, bg ?? palette.surface, palette.amberBg), paddingX: 1 }
  return (
    <Box key={key} flexShrink={0} {...fill}>
      {body}
      {hover === undefined ? null : hoverCard(hover, anchor)}
    </Box>
  )
}

/** The desktop's battery: an outline, its cap, and the charge filling it. */
export const batteryIcon = (kit: Kit, charge: number, tone: Tone, alt: string): RenderChildren => {
  const { Svg, palette, onTone } = kit
  if (!Svg) return null
  const outline = onTone(tone, palette.label)
  const fill = onTone(tone, palette.warm)
  const width = Math.round(clamp01(charge) * 15 * 10) / 10
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="12" viewBox="0 0 22 12">' +
    `<rect x="0.75" y="0.75" width="18.5" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
    `<rect x="19.75" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
    `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>` +
    '</svg>'
  return <Svg key="battery" source={source} alt={alt} width={22} height={12} />
}

/** On a text surface the battery is the pill itself: its charge painted as
 *  the background of the leading characters, draining right to left. `text`
 *  arrives in the glyphs it is drawn in, so the cut falls where it shows. */
export const textBattery = (kit: Kit, charge: number, tone: Tone, text: string): RenderChildren[] => {
  const { Text, palette, onTone } = kit
  const chars = [...` ${text} `]
  const cut = Math.round(clamp01(charge) * chars.length)
  const fg = onTone(tone, palette.value)
  return [
    cut > 0 ? (
      <Text key="bf" color={fg} backgroundColor={onTone(tone, palette.batteryFill, palette.batteryAmber)}>
        {chars.slice(0, cut).join('')}
      </Text>
    ) : null,
    cut < chars.length ? (
      <Text key="be" color={fg} backgroundColor={onTone(tone, palette.surface, palette.amberBg)}>
        {chars.slice(cut).join('')}
      </Text>
    ) : null,
  ]
}
