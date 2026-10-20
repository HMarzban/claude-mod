// What every layout's frame shares: the toggle on the row nearest the
// prompt, the rows an open view is given beneath the collapsed lines, the
// footer, and the one-line rows pulse and departures squeeze to fit.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import { HOTKEY_MARK, ROW_SLACK, cellsOf, isDrawn, keepsIn, squeezeToFit } from '../layout'
import { BARE } from '../palette'
import type { Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { rowsOf } from './view'
import type { View } from './view'
import type { Amber } from '../words'

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

/** A view drawn: its collapsed row, the toggle at its end, and while open,
 *  what opens beneath it, given the rows the view declares where it is drawn. */
export const drawView = (view: View, kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Box } = kit
  return (
    <Box flexDirection="column">
      {view.collapsed(kit, read, toggleButton(kit, read, act))}
      {read.frame.expanded ? view.open(kit, read, act, rowsOf(view, kit)) : null}
    </Box>
  )
}

const NO_PRESS: BandActions = { toggleExpanded: async () => undefined, hide: async () => undefined }

const buttonsOf = (kit: Kit, act: BandActions): RenderElement[] => {
  const { Button } = kit
  return [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
}

/** The columns the buttons take with their hotkey marks and gaps: what a
 *  strip in the footer leaves out of its room. */
export const footerRoom = (kit: Kit): number => cellsOf(buttonsOf(kit, NO_PRESS), kit.measure) + 2 * HOTKEY_MARK + 2

/** The open view's last row: the strip, given one, else the hint while it
 *  fits; air; then Collapse and Hide band. */
export const footer = (kit: Kit, act: BandActions, strip?: RenderElement): RenderElement => {
  const { Box, Text, Svg, measure, columns, icon } = kit
  const buttons = buttonsOf(kit, act)
  const hint = (
    <Box key="hint" flexDirection="row">
      {Svg ? icon('info', BARE.icon) : null}
      <Text color={BARE.label}>Bring it back with /nextcost</Text>
    </Box>
  )
  const hinted = cellsOf(hint, measure) + cellsOf(buttons, measure) + 2 * HOTKEY_MARK + buttons.length + 1 <= columns - ROW_SLACK
  return (
    <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
      {strip ?? (hinted ? hint : null)}
      {strip === undefined ? <Box flexGrow={1} /> : null}
      {buttons}
    </Box>
  )
}

// ---- the rows pulse and departures squeeze -----------------------------------

/** What a line's build may ask at its squeeze. */
export type Keeps<P extends string> = Readonly<{
  /** Whether a calm, optional piece is still kept. */
  has: (p: P) => boolean
  /** Whether a piece of this tone is kept: an amber one always is. */
  calm: (p: P, tone: Tone) => boolean
  /** An amber reading's words: long until the `amberShort` step, then short. */
  amber: (a: Amber) => string
}>

/** One collapsed line: its pieces, each kept whole, then air, then the toggle
 *  or nothing. Never wraps; past its room it clips, as chips' row does. */
export const line = (kit: Kit, key: string, pieces: readonly RenderChildren[], end?: RenderChildren, gap = 2): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={gap}>
      {pieces.filter(isDrawn).map((piece, i) => (
        <Box key={`p${i}`} flexShrink={0}>
          {piece}
        </Box>
      ))}
      <Box key="air" flexGrow={1} />
      {end ?? null}
    </Box>
  )
}

/** A line squeezed by its give-way order to the smallest squeeze at which it
 *  fits. Every order names `amberShort`, where amber turns short, so amber
 *  shortens only once every calm piece before it has gone. */
export const fitLine = <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: Keeps<P>) => RenderElement): RenderElement => {
  const at = keepsIn(order)
  return squeezeToFit(
    squeeze =>
      build({
        has: p => at(squeeze, p),
        calm: (p, tone) => tone === 'amber' || at(squeeze, p),
        amber: a => (at(squeeze, 'amberShort' as P) ? a.long : a.short),
      }),
    order.length,
    room,
    kit.measure,
  )
}
