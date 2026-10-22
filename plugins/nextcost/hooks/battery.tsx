// The cache's battery, chips' alone: an icon on the desktop, and on a text
// surface the pill itself. Pulse and departures draw their own look.

import type { RenderChildren } from 'claude-code'
import { clamp01 } from './format'
import { asciiText } from './glyphs'
import type { Kit } from './kit'
import type { Tone } from './reading'

/** The desktop's battery: an outline, its cap, and the charge filling it,
 *  `px` wide: an icon's 22, or a bar's length. */
export const batteryIcon = (kit: Kit, charge: number, tone: Tone, alt: string, px = 22): RenderChildren => {
  const { palette, onTone, svg } = kit
  const outline = onTone(tone, palette.label)
  const fill = onTone(tone, palette.warm)
  const width = Math.round(clamp01(charge) * (px - 7) * 10) / 10
  return svg(
    { key: 'battery', alt, width: px, height: 12 },
    `<rect x="0.75" y="0.75" width="${px - 3.5}" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
      `<rect x="${px - 2.25}" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
      `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>`,
  )
}

/** On a text surface the battery is the pill itself: its charge painted as
 *  the background of the leading characters, draining right to left. In the
 *  ascii tier `text` is mapped before the cut, so a dropped glyph neither
 *  leaves a gap at the cut nor takes its cells from the charge. */
export const textBattery = (kit: Kit, charge: number, tone: Tone, text: string): RenderChildren[] => {
  const { Text, palette, onTone, glyphs } = kit
  const chars = [...` ${glyphs === 'ascii' ? asciiText(text) : text} `]
  const cut = Math.round(clamp01(charge) * chars.length)
  const fg = onTone(tone, palette.value)
  /** One side of the cut: its Text, or nothing. */
  const side = (key: string, part: readonly string[], ground: string): RenderChildren =>
    part.length === 0 ? null : (
      <Text key={key} color={fg} backgroundColor={ground}>
        {part.join('')}
      </Text>
    )
  return [side('bf', chars.slice(0, cut), onTone(tone, palette.batteryFill, palette.batteryAmber)), side('be', chars.slice(cut), onTone(tone, palette.surface, palette.amberBg))]
}
