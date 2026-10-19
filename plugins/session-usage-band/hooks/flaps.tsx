// The split-flap board's tiles: each character on its own tile with a seam
// across its middle, in a monospace face, on the desktop; a run of text on
// its ground in a terminal; bracketed in plain. Pixel geometry lives here,
// outside views/, which the gate keeps free of it.

import type { RenderChildren } from 'claude-code'
import type { Kit } from './kit'
import { boardCells } from './layout'
import { BOARD_RULE_ALT } from './words'

type Run = readonly [text: string, ink: string]
const TILE_PX = 10
const TILE_GAP = 1
const FLAP_PX = 20
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The runs as tiles: each run's characters, a blank tile between runs. */
const tilesOf = (runs: readonly Run[]): Array<readonly [string, string]> =>
  runs.flatMap(([text, ink], i) => [...(i === 0 ? [] : [[' ', ink] as const]), ...[...text].map(ch => [ch, ink] as const)])

/** The px the runs' tiles take: a flaps Svg's width. */
export const flapsWidth = (runs: readonly Run[]): number => tilesOf(runs).length * (TILE_PX + TILE_GAP) - TILE_GAP

export const flaps = (kit: Kit, o: Readonly<{ key: string; alt: string; runs: readonly Run[]; bg: string; seam: string }>): RenderChildren => {
  const { Svg, Text, Box, palette } = kit
  const { key, alt, runs, bg, seam } = o
  if (!Svg) {
    // On the desktop, in plain, text set in a proportional face: its
    // capitals are measured as they draw, so the row is fitted to them.
    const said = runs.map(([text]) => (palette.filled ? text : `[${text}]`))
    const width = kit.measure.text < 1 ? Math.ceil(said.reduce((n, t) => n + boardCells(t, kit.measure), 0) + runs.length - 1) : undefined
    return (
      <Box key={key} flexDirection="row" columnGap={1} {...(width === undefined ? {} : { width })}>
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

/** A tile at `x`, as `flaps` draws one: its face, its character in `ink`,
 *  the seam across it. */
const tileAt = (x: number, ch: string, ink: string, bg: string, seam: string): string => {
  const glyph = `<text x="${x + TILE_PX / 2}" y="14.5" text-anchor="middle" xml:space="preserve" font-family="ui-monospace, monospace" font-size="12" font-weight="600" fill="${ink}">${escape(ch)}</text>`
  return `<rect class="tile" x="${x}" y="0" width="${TILE_PX}" height="${FLAP_PX}" rx="1.5" fill="${bg}"/>${glyph}<rect class="seam" x="${x}" y="9.5" width="${TILE_PX}" height="1" fill="${seam}"/>`
}
/** A blank at `x`: its glyph alone, no tile. */
const blankAt = (x: number): string => `<text x="${x + TILE_PX / 2}" y="14.5" xml:space="preserve"> </text>`
const flapsSvg = (width: number, marks: readonly string[]): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FLAP_PX}" viewBox="0 0 ${width} ${FLAP_PX}">${marks.join('')}</svg>`

// ---- the open board's columns ------------------------------------------------

/** A column of the open board's flaps: its text, in its ink, in a column
 *  `cells` wide, the air after it included. */
export type FlapColumn = Readonly<{ text: string; ink: string; cells: number }>

/** A row of text on the desktop, and a rule's px. */
const ROW_PX = 24
const RULE_PX = 1

/** The columns a run of flaps spelling `text` takes: on the desktop at a
 *  tile's pitch; in plain, bracketed and measured as it draws; in a terminal
 *  a cell a character. */
export const flapCells = (kit: Kit, text: string): number => {
  if (text === '') return 0
  if (kit.Svg) return Math.ceil(([...text].length * (TILE_PX + TILE_GAP) - TILE_GAP) / kit.measure.pxPerCell)
  return Math.ceil(boardCells(kit.palette.filled ? text : `[${text}]`, kit.measure))
}

/** A line's flaps in fixed columns, so the board's lines align: tiles only
 *  where there are characters, never a blank one, the rest of each column
 *  the board's own ground. One Svg a line on the desktop, its alt the
 *  line's in words; a run of text in each column elsewhere, bracketed in
 *  plain. */
export const flapColumns = (kit: Kit, o: Readonly<{ key: string; alt: string; columns: readonly FlapColumn[]; bg: string; seam: string }>): RenderChildren => {
  const { Svg, Text, Box, palette, measure } = kit
  const { key, alt, columns, bg, seam } = o
  if (!Svg)
    return (
      <Box key={key} flexDirection="row" flexShrink={0}>
        {columns.map((c, i) => (
          <Box key={String(i)} width={c.cells} flexShrink={0}>
            {c.text === '' ? null
            : palette.filled ? <Text color={c.ink} backgroundColor={bg}>{c.text}</Text>
            : <Text color={palette.value}>{`[${c.text}]`}</Text>}
          </Box>
        ))}
      </Box>
    )
  const marks: string[] = []
  let at = 0
  for (const c of columns) {
    // A blank, the space in a word or the air after the column, keeps its
    // glyph, so the line still reads in words, and has no tile.
    ;[...(c.text === '' ? '' : `${c.text} `)].forEach((ch, i) => {
      const x = at + i * (TILE_PX + TILE_GAP)
      marks.push(ch === ' ' ? blankAt(x) : tileAt(x, ch, c.ink, bg, seam))
    })
    at += c.cells * measure.pxPerCell
  }
  return <Svg key={key} source={flapsSvg(at, marks)} alt={alt} width={at} height={FLAP_PX} />
}

/** A thin rule across the board, on the desktop alone: a terminal's would
 *  take a row. Like a stretched meter it has no width of its own: drawn
 *  twice as wide as the board's estimate, `cells`, and capped by its slot,
 *  it spans the board's inner width to the header's right edge, however
 *  wide the desktop draws a column. */
export const boardRule = (kit: Kit, key: string, cells: number, color: string): RenderChildren => {
  const { Svg, measure } = kit
  if (!Svg) return null
  const width = 2 * Math.max(1, cells) * measure.pxPerCell
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${RULE_PX}" viewBox="0 0 ${width} ${RULE_PX}" preserveAspectRatio="none"><rect class="rule" x="0" y="0" width="${width}" height="${RULE_PX}" fill="${color}"/></svg>`
  return <Svg key={key} source={source} alt={BOARD_RULE_ALT} height={RULE_PX} />
}

/** A board line's height, in the units the board is fitted in: on the
 *  desktop px, a row of text's 24, flaps alone their 20, and its rule's 1
 *  under it; elsewhere a row a line. */
export const boardLineHeight = (kit: Kit, o: Readonly<{ text: boolean; rule: boolean }>): number =>
  kit.Svg ? (o.text ? ROW_PX : FLAP_PX) + (o.rule ? RULE_PX : 0) : 1

/** What `rows` rows hold, in those units. */
export const boardBudget = (kit: Kit, rows: number): number => (kit.Svg ? rows * ROW_PX : rows)
