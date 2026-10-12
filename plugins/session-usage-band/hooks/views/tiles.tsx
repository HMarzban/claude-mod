// Tiles, everything side by side at the same size: one row of equal tiles,
// each its figure, its label and, where there's a cap, its mark, in chips'
// order and tints; and chips' cards beneath it when open, a mark in each
// head but the spend's.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK, cellsOf } from '../layout'
import type { BarSize } from '../layout'
import type { CacheReading, ContextReading, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import type { ReadingAmber, Say } from '../words'
import { limitTint, pillRow, type ChipKey } from './chips'
import { GLYPH } from '../icons'
import { accentOf, amberFirst, batteryMark, fitLine, words, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type CardOptions } from './view'

/** What gives way as the row narrows, first to last: the board's tokens,
 *  resets, bar length and calm 7d, then chips' calm context and 5h around
 *  the marks, the tiles' even widths, then the calm spend, so a tile goes
 *  before a figure loses its name, and last the labels. On the desktop a
 *  reset's ↻ goes before its words. Amber never does. */
const ORDER = ['tokens', 'resetGlyph', 'resets', 'barLength', 'calmSeven', 'calmContext', 'marks', 'calmFive', 'evenWidths', 'calmCost', 'labels'] as const
type Piece = (typeof ORDER)[number]

/** A tile's mark at its lengths, longest first, a cell shorter each: the
 *  row takes the longest it holds before a word gives way, and the shortest
 *  once the bar length has. A card head's mark. */
const MARKS: readonly BarSize[] = [
  { px: 40, cells: 6 },
  { px: 32, cells: 5 },
  { px: 24, cells: 4 },
]
const SHORT_MARK: BarSize = { px: 24, cells: 4 }
const SLOT: BarSize = { px: 64, cells: 6 }

/** A tile, built once: the squeeze picks its label, its mark's size, and
 *  whether a calm tile with a give-way step stays. */
type Tile = Readonly<{
  key: string
  tone: Tone
  amber: ReadingAmber | undefined
  /** Its ground while calm, the surface's unless tinted. */
  bg?: string
  figure: RenderElement
  /** Its name, or amber, its reason in its place. */
  label: (keeps: Keeps<Piece>) => RenderElement
  /** Its mark at a length; none where there's no cap. */
  mark: (size: BarSize) => RenderChildren
  step?: Piece
}>

/** The columns every tile shares, or none once the tiles hug their text. */
type Columns = Readonly<{ figure: number; label: number; mark: number }> | undefined

/** A mark built at most once at each length, when first asked for. */
const bySize = (make: (size: BarSize) => RenderChildren): ((size: BarSize) => RenderChildren) => {
  const built = new Map<number, RenderChildren>()
  return size => {
    if (!built.has(size.cells)) built.set(size.cells, make(size))
    return built.get(size.cells)
  }
}
const NO_MARK = (): RenderChildren => null

/** A tile's figure: its one bold, amber or calm. */
const figureOf = (kit: Kit, text: string, tone: Tone): RenderElement => words(kit, 'fig', [[text, tone === 'amber' ? 'amber' : 'value']], true)

/** A tile's name, or amber, its reason beside the figure in its place:
 *  `! cache`, `! 5h ~1h`. */
const nameOf = (amber: ReadingAmber | undefined, name: Say[number]): Say[number] => (amber === undefined ? name : [amber.beside, 'amber'])

/** The cache's countdown alone while it counts, else its condition. */
const cacheFigure = (c: CacheReading): string => (c.leftShort === '' ? c.value : c.leftShort)

/** The context's fill toward its cap. */
const contextMark = (kit: Kit, x: ContextReading, size: BarSize): RenderChildren =>
  meter(kit, { key: 'bar', label: 'context', frac: x.frac, tone: x.tone, accent: kit.palette.meterFill, size })

/** A window's fill, its notch where time has gone and the fill has begun,
 *  knocked out of `ground`, and its projection dashed. */
const limitMark = (kit: Kit, l: LimitView, size: BarSize, ground: string): RenderChildren =>
  meter(kit, {
    key: 'bar',
    label: l.name,
    frac: l.frac,
    tone: l.tone,
    accent: accentOf(kit, l),
    size,
    tick: l.frac > 0 ? l.gone : undefined,
    projectTo: l.projectedFrac,
    ground,
    dash: '╌',
  })

/** A limit's tile, in its chip's tint, its name in its accent, then its
 *  reset whole as the board says it: the 5h counting down, the 7d at its
 *  clock time. On the desktop ↻ goes first, then the reset whole. */
const limitTile = (kit: Kit, l: LimitView, key: ChipKey): Tile => {
  const { Svg, palette, onTone } = kit
  const bg = limitTint(palette, key).bg
  const name = nameOf(l.amber, [l.name, key === '5h' ? 'accent5' : 'accent7'])
  const named = words(kit, 'label', [name])
  const when = l.resetSaid
  const reset = when === undefined ? named : words(kit, 'label', [name, [` ${GLYPH.reset} ${when}`, 'label']])
  const bare = when === undefined ? named : words(kit, 'label', [name, [` ${when}`, 'label']])
  return {
    key,
    tone: l.tone,
    amber: l.amber,
    bg,
    figure: figureOf(kit, l.valueText, l.tone),
    label: keeps => (!keeps.has('resets') ? named : Svg && !keeps.has('resetGlyph') ? bare : reset),
    mark: l.passed ? NO_MARK : bySize(size => limitMark(kit, l, size, onTone(l.tone, bg, palette.amberBg))),
    step: key === '5h' ? 'calmFive' : 'calmSeven',
  }
}

/** The tiles in chips' order, the tokens last, what needs you first. */
const tilesOf = (kit: Kit, read: Readings): Tile[] => {
  const { cache: c, context: x, spend: s } = read
  const label = (amber: ReadingAmber | undefined, text: string) => {
    const said = words(kit, 'label', [nameOf(amber, [text, 'label'])])
    return () => said
  }
  const tiles: Array<Tile | undefined> = [
    {
      key: 'cache',
      tone: c.tone,
      amber: c.amber,
      figure: figureOf(kit, cacheFigure(c), c.tone),
      label: label(c.amber, 'cache'),
      mark: c.known ? bySize(size => batteryMark(kit, c.charge, c.tone, c.alt, size)) : NO_MARK,
    },
    { key: 'cost', tone: 'calm', amber: undefined, figure: figureOf(kit, s.totalText, 'calm'), label: label(undefined, 'spent'), mark: NO_MARK, step: 'calmCost' },
    // Unreported, the context has no tile, and open no card.
    x.known
      ? { key: 'ctx', tone: x.tone, amber: x.amber, figure: figureOf(kit, x.valueText, x.tone), label: label(x.amber, 'context'), mark: bySize(size => contextMark(kit, x, size)), step: 'calmContext' }
      : undefined,
    read.fiveHour === undefined ? undefined : limitTile(kit, read.fiveHour, '5h'),
    read.sevenDay === undefined ? undefined : limitTile(kit, read.sevenDay, '7d'),
    c.measured
      ? { key: 'tokens', tone: 'calm', amber: undefined, figure: figureOf(kit, s.tokensText, 'calm'), label: label(undefined, 'tokens'), mark: NO_MARK, step: 'tokens' }
      : undefined,
  ]
  return amberFirst(tiles.filter((t): t is Tile => t !== undefined))
}

/** A Box's width, when it has one. */
const sized = (width: number | undefined) => (width === undefined ? {} : { width })
/** A Box's least width, when it has one: it grows past it, never shrinks. */
const least = (minWidth: number | undefined) => (minWidth === undefined ? {} : { minWidth })

/** A tile at a squeeze, its mark at `size`, in columns `cols`: its figure
 *  right-aligned, then its label, an amber one's kept, then its mark, or the
 *  room for one. In its equal width the figure and the label never shrink
 *  and the mark gives way first, so where a bold or a font runs wider than
 *  the measure no figure or word is cut. */
const tileSpec = (kit: Kit, t: Tile, keeps: Keeps<Piece>, cols: Columns, size: BarSize): PillSpec => {
  const { Box } = kit
  const labelled = keeps.calm('labels', t.tone)
  const marked = cols !== undefined && keeps.has('marks')
  const mark = marked ? (
    <Box key="mark" justifyContent="flex-end" width={cols.mark} flexShrink={1} minWidth={0} overflow="hidden">
      {t.mark(size)}
    </Box>
  ) : null
  const width = cols === undefined ? undefined : cols.figure + (labelled ? 1 + cols.label : 0) + (marked ? 1 + cols.mark : 0)
  return {
    key: t.key,
    tone: t.tone,
    bg: t.bg,
    body: [
      <Box key="tile" flexDirection="row" alignItems="center" columnGap={1} {...sized(width)}>
        <Box key="fig" justifyContent="flex-end" flexShrink={0} {...least(cols?.figure)}>
          {t.figure}
        </Box>
        {labelled ? (
          <Box key="label" flexShrink={0} {...least(cols?.label)}>
            {t.label(keeps)}
          </Box>
        ) : null}
        {mark}
      </Box>,
    ],
  }
}

/** Tiles' one row, squeezed until it fits: each tile as wide as the widest
 *  figure, label and mark the row keeps, as the measure gives them, so they
 *  all shrink together; its marks the longest the row holds. */
const tilesRow = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Svg, measure } = kit
  const tiles = tilesOf(kit, read)
  const room = kit.columns - ROW_SLACK
  const widest = (els: readonly RenderChildren[]) => Math.max(0, ...els.map(el => cellsOf(el, measure)))
  return fitLine(kit, ORDER, room, keeps => {
    const kept = tiles.filter(t => t.step === undefined || keeps.calm(t.step, t.tone))
    const rowAt = (size: BarSize) => {
      const cols: Columns = keeps.has('evenWidths')
        ? { figure: widest(kept.map(t => t.figure)), label: widest(kept.map(t => t.label(keeps))), mark: Svg ? size.px / measure.pxPerCell : size.cells }
        : undefined
      return pillRow(kit, read, act, kept.map(t => tileSpec(kit, t, keeps, cols, size)))
    }
    // A cell shorter at a time before a word gives way; held by none, the
    // longest, so the squeeze moves on.
    const sizes = keeps.has('barLength') ? MARKS : [SHORT_MARK]
    let first: RenderElement | undefined
    for (const size of sizes) {
      const row = rowAt(size)
      if (cellsOf(row, measure) <= room) return row
      first ??= row
    }
    return first ?? rowAt(SHORT_MARK)
  })
}

/** Each card's head: the tile's mark at the card's size, at the head's end. */
const lens = (kit: Kit, read: Readings): CardOptions => {
  const { Box, palette } = kit
  const { cache: c, context: x, worstLimit: worst } = read
  const slot = (mark: RenderChildren) => (
    <Box key="lens" flexGrow={1} justifyContent="flex-end">
      {mark}
    </Box>
  )
  return {
    slotsReplaceBars: true,
    slots: {
      ...(c.known ? { cache: slot(batteryMark(kit, c.charge, c.tone, c.alt, SLOT)) } : {}),
      ...(x.known ? { context: slot(contextMark(kit, x, SLOT)) } : {}),
      ...(worst === undefined ? {} : { limits: slot(limitMark(kit, worst, SLOT, palette.cardBg)) }),
    },
  }
}

export const tilesView = defineCardsView({ desktop: 1, terminal: 1 }, (kit, read, act) => ({ lines: [tilesRow(kit, read, act)], open: () => lens(kit, read) }))
