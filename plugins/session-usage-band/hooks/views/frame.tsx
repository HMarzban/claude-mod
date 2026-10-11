// What every layout's frame shares: the toggle on the row nearest the
// prompt, and the rows the shared cards are given beneath the collapsed lines.

import type { RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'

/** The rows a body gets: the band's, less the collapsed rows, a row of air
 *  above the body and above the buttons, the buttons, and the strip. */
export const bodyRowsFor = (maxRows: number, collapsedRows: number, stripRows: number): number =>
  Math.max(0, maxRows - collapsedRows - 3 - stripRows)

/** ▵ while shut, ▿ while open: chips' own toggle, at the end of its row.
 *  It points the way the band will move, since the band is anchored to the
 *  prompt and grows upward when it opens, so in every layout it sits on the
 *  row nearest the prompt, the bottom of its line. It comes after the row's
 *  hover cards and, placed relative, stacks over them on the desktop too, so
 *  it stays pressable where the measure sets a card long. */
export const toggleButton = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Box, Button, Svg } = kit
  return (
    <Box flexShrink={0} position="relative" alignSelf="flex-end">
      {/* A Button holds text alone, so its icon is a glyph. The outlined
          triangles are measured centred in the line, within half a pixel,
          and wider than tall like a disclosure icon; arrowhead chevrons sit
          5 px low. On the desktop in a native frame like Collapse's, in the
          terminal bare. */}
      <Button
        key="more"
        label={read.frame.expanded ? '▿' : '▵'}
        {...(Svg ? { variant: 'secondary' as const } : { plain: true as const })}
        onPress={act.toggleExpanded}
      />
    </Box>
  )
}
