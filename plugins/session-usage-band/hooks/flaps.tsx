// The split-flap board's tiles: each character on its own tile with a seam
// across its middle, in a monospace face, on the desktop; a run of text on
// its ground in a terminal; bracketed in plain. Pixel geometry lives here,
// outside views/, which the gate keeps free of it.

import type { RenderChildren } from 'claude-code'
import type { Kit } from './kit'
import { ROW_SLACK } from './layout'

type Run = readonly [text: string, ink: string]
const TILE_PX = 10
const TILE_GAP = 1
const FLAP_PX = 20
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The runs as tiles: each run's characters, a blank tile between runs. */
const tilesOf = (runs: readonly Run[]): Array<readonly [string, string]> =>
  runs.flatMap(([text, ink], i) => [...(i === 0 ? [] : [[' ', ink] as const]), ...[...text].map(ch => [ch, ink] as const)])

/** The columns a board's paddingX takes, either side. */
const BOARD_PAD = 2
/** The runs on a board line, which plain brackets two columns each. */
const BOARD_RUNS = 4
/** The tiles a board row holds: its columns less the row's slack and the
 *  board's padding; on the desktop at a tile's pitch, 11 px against a 10 px
 *  column, in a terminal a cell each, less plain's brackets. */
export const boardRoom = (kit: Kit): number => {
  const columns = kit.columns - ROW_SLACK - BOARD_PAD
  if (kit.Svg) return Math.floor((columns * kit.measure.pxPerCell) / (TILE_PX + TILE_GAP))
  return kit.palette.filled ? columns : Math.max(0, columns - 2 * BOARD_RUNS)
}

/** The px the runs' tiles take: a flaps Svg's width. */
export const flapsWidth = (runs: readonly Run[]): number => tilesOf(runs).length * (TILE_PX + TILE_GAP) - TILE_GAP

export const flaps = (kit: Kit, o: Readonly<{ key: string; alt: string; runs: readonly Run[]; bg: string; seam: string }>): RenderChildren => {
  const { Svg, Text, Box, palette } = kit
  const { key, alt, runs, bg, seam } = o
  if (!Svg) {
    return (
      <Box key={key} flexDirection="row" columnGap={1}>
        {runs.map(([text, ink], i) =>
          palette.filled
            ? <Text key={String(i)} color={ink} backgroundColor={bg}>{text}</Text>
            : <Text key={String(i)} color={palette.value}>{`[${text}]`}</Text>)}
      </Box>
    )
  }
  const width = flapsWidth(runs)
  const marks = tilesOf(runs).map(([ch, ink], i) => {
    const x = i * (TILE_PX + TILE_GAP)
    const glyph = `<text x="${x + TILE_PX / 2}" y="14.5" text-anchor="middle" xml:space="preserve" font-family="ui-monospace, monospace" font-size="12" font-weight="600" fill="${ink}">${escape(ch)}</text>`
    return `<rect class="tile" x="${x}" y="0" width="${TILE_PX}" height="${FLAP_PX}" rx="1.5" fill="${bg}"/>${glyph}<rect class="seam" x="${x}" y="9.5" width="${TILE_PX}" height="1" fill="${seam}"/>`
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FLAP_PX}" viewBox="0 0 ${width} ${FLAP_PX}">${marks.join('')}</svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={FLAP_PX} />
}
