// The expanded scaffold every new view shares: the workspace strip, the
// view's own body on the card ground, and chips' buttons row. Chips keeps its
// own expanded layout, and draws its toggle from here.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import { HOTKEY_MARK, ROW_SLACK, cellsOf, isDrawn } from '../layout'
import { BARE } from '../palette'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { drawStrip, stripPlacement } from '../strip'

/** A view's own workspace strip, drawn in its style in place of the shared
 *  one. It draws only its line: the frame places it as the shared one. */
export type Strip = (kit: Kit, read: Readings, place: 'top' | 'footer', room: number) => RenderChildren

/** A view's own strip, in the shared one's place; none when it says nothing. */
const placedStrip = (kit: Kit, line: RenderChildren, place: 'top' | 'footer'): RenderElement | null => {
  const { Box } = kit
  return !isDrawn(line) ? null : (
    <Box key="strip" flexDirection="row" flexWrap="nowrap" overflow="hidden" height={1} {...stripPlacement(place, 0)}>
      {line}
    </Box>
  )
}

/** The rows a body gets: the band's, less the collapsed rows, a row of air
 *  above the body and above the buttons, the buttons, and the strip. */
export const bodyRowsFor = (maxRows: number, collapsedRows: number, stripRows: number): number =>
  Math.max(0, maxRows - collapsedRows - 3 - stripRows)

/** ▿ while shut, ▵ while open: chips' own toggle, at the end of its row. */
export const toggleButton = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Box, Button, Svg } = kit
  return (
    <Box flexShrink={0}>
      {/* A Button holds text alone, so its icon is a glyph. The outlined
          triangles are measured centred in the line, within half a pixel,
          and wider than tall like a disclosure icon; arrowhead chevrons sit
          5 px low. On the desktop in a native frame like Collapse's, in the
          terminal bare. */}
      <Button
        key="more"
        label={read.frame.expanded ? '▵' : '▿'}
        {...(Svg ? { variant: 'secondary' as const } : { plain: true as const, dimColor: true })}
        onPress={act.toggleExpanded}
      />
    </Box>
  )
}

/** A new view's ground: the card colour, so every hex it draws is tested against it. */
export const panel = (kit: Kit, key: string, children: RenderChildren[]): RenderElement => {
  const { Box, palette } = kit
  return (
    <Box key={key} flexDirection="column" paddingX={1} {...(palette.filled ? { backgroundColor: palette.cardBg } : {})}>
      {children}
    </Box>
  )
}

/** What opens beneath a view: the strip, the body in its panel, the buttons. */
export const frame = (
  kit: Kit,
  read: Readings,
  act: BandActions,
  o: Readonly<{ collapsedRows: number; body: (bodyRows: number) => RenderChildren[]; strip?: Strip }>,
): RenderChildren[] => {
  const { Box, Button, Text, Svg, icon, measure } = kit
  const ws = read.workspace
  // Chips' buttons, as its expanded view draws them.
  const buttons = [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
  // The strip heads the view while the body keeps a row under its titles;
  // short of that it takes the footer, in place of the hint.
  const place = ws === undefined ? undefined : bodyRowsFor(read.frame.maxRows, o.collapsedRows, 1) >= 2 ? 'top' : 'footer'
  const bodyRows = bodyRowsFor(read.frame.maxRows, o.collapsedRows, place === 'top' ? 1 : 0)
  // In the footer it shares the line with the buttons and their hotkey marks.
  const room = kit.columns - ROW_SLACK - (place === 'footer' ? cellsOf(buttons, measure) + 2 * HOTKEY_MARK + 2 : 0)
  const strip =
    place === undefined || ws === undefined
      ? null
      : o.strip !== undefined
        ? placedStrip(kit, o.strip(kit, read, place, room), place)
        : drawStrip(kit, ws, place, 0, room)
  return [
    place === 'top' ? strip : null,
    // The strip on top brings its own row of air (strip.tsx's stripAt draws
    // it with marginTop), so the body adds one only when the strip isn't
    // there, as chips' cards do. The frame places a view's own strip the
    // same way.
    bodyRows > 0 ? (
      <Box key="body" flexDirection="column" marginTop={place === 'top' ? 0 : 1}>
        {panel(kit, 'body', o.body(bodyRows))}
      </Box>
    ) : null,
    // Chips' actions row: the strip when it takes the footer, else the hint,
    // then Collapse and Hide band.
    <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
      {place === 'footer' ? (
        strip
      ) : (
        <Box key="hint" flexDirection="row">
          {Svg ? icon('info', BARE.icon) : null}
          <Text color={BARE.label}>Bring it back with /usage-band</Text>
        </Box>
      )}
      <Box flexGrow={1} />
      {buttons}
    </Box>,
  ]
}

/** The whole view: its collapsed panel, and the frame beneath it when open. */
export const openView = (
  kit: Kit,
  read: Readings,
  act: BandActions,
  collapsed: RenderElement,
  collapsedRows: number,
  body: (bodyRows: number) => RenderChildren[],
  strip?: Strip,
): RenderElement => {
  const { Box } = kit
  return (
    <Box flexDirection="column">
      {collapsed}
      {read.frame.expanded ? frame(kit, read, act, { collapsedRows, body, strip }) : null}
    </Box>
  )
}
