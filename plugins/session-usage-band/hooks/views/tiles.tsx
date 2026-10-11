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
import type { Amber, Say } from '../words'
import { limitTint, pillRow, type ChipKey } from './chips'
import { accentOf, amberFirst, batteryMark, fitLine, once, words, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type Lens } from './view'

/** What gives way as the row narrows, first to last: the board's tokens,
 *  resets, bar length and calm 7d, then chips' calm context and 5h around
 *  the marks, and last the tiles' even widths and labels. Amber never does. */
const ORDER = ['tokens', 'resets', 'barLength', 'calmSeven', 'calmContext', 'marks', 'calmFive', 'evenWidths', 'labels'] as const
type Piece = (typeof ORDER)[number]

/** A tile's mark, then once the bar length gives way; a card head's. */
const MARK: BarSize = { px: 40, cells: 6 }
const SHORT_MARK: BarSize = { px: 24, cells: 4 }
const SLOT: BarSize = { px: 64, cells: 6 }

/** A tile, built once: the squeeze picks its label, its mark's size, and
 *  whether a calm tile with a give-way step stays. */
type Tile = Readonly<{
  key: string
  tone: Tone
  amber: Amber | undefined
  /** Amber, its reason, across its figure's and label's columns. */
  reason: (keeps: Keeps<Piece>) => RenderElement | undefined
  /** Its ground while calm, the surface's unless tinted. */
  bg?: string
  figure: RenderElement
  label: (keeps: Keeps<Piece>) => RenderElement
  /** Its mark, full or short; none where there's no cap. */
  mark: (short: boolean) => RenderChildren
  step?: Piece
}>

/** The columns every tile shares, or none once the tiles hug their text. */
type Columns = Readonly<{ figure: number; label: number; mark: number }> | undefined

/** A mark built at most once at each size, when first asked for. */
const bySize = (make: (size: BarSize) => RenderChildren): ((short: boolean) => RenderChildren) => {
  const full = once(() => make(MARK))
  const short = once(() => make(SHORT_MARK))
  return isShort => (isShort ? short() : full())
}
const NO_MARK = (): RenderChildren => null
const NO_REASON = (): undefined => undefined

/** A tile's figure: its one bold. */
const figureOf = (kit: Kit, text: string): RenderElement => words(kit, 'fig', [[text, 'value']], true)

/** An amber reading's reason, short since a tile holds no more, bold as its
 *  figure would be; a limit's reset after it, in label ink, while resets stay. */
const reasonOf = (kit: Kit, amber: Amber | undefined, reset?: string): Tile['reason'] => {
  if (amber === undefined) return NO_REASON
  const { Text, palette, oneLine } = kit
  const said = (resets: boolean) =>
    oneLine({ key: 'fig' }, [
      <Text key="why" color={palette.amberFg} bold>
        {amber.short}
      </Text>,
      resets ? <Text key="reset" color={palette.label}>{` ${reset}`}</Text> : null,
    ])
  const bare = said(false)
  const withReset = reset === undefined ? bare : said(true)
  return keeps => (keeps.has('resets') ? withReset : bare)
}

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
    tickInk: kit.palette.label,
    ground,
    dash: '╌',
  })

/** A limit's tile, in its chip's tint, its name in its accent. */
const limitTile = (kit: Kit, l: LimitView, key: ChipKey): Tile => {
  const { palette, onTone } = kit
  const bg = limitTint(palette, key).bg
  const name: Say[number] = [l.name, key === '5h' ? 'accent5' : 'accent7']
  const named = words(kit, 'label', [name])
  const reset = l.resetShort === undefined ? named : words(kit, 'label', [name, [` ${l.resetShort}`, 'label']])
  return {
    key,
    tone: l.tone,
    amber: l.amber,
    reason: reasonOf(kit, l.amber, l.resetShort),
    bg,
    figure: figureOf(kit, l.valueText),
    label: keeps => (keeps.has('resets') ? reset : named),
    mark: l.passed ? NO_MARK : bySize(size => limitMark(kit, l, size, onTone(l.tone, bg, palette.amberBg))),
    step: key === '5h' ? 'calmFive' : 'calmSeven',
  }
}

/** The tiles in chips' order, the tokens last, what needs you first. */
const tilesOf = (kit: Kit, read: Readings): Tile[] => {
  const { cache: c, context: x, spend: s } = read
  const label = (text: string) => {
    const said = words(kit, 'label', [[text, 'label']])
    return () => said
  }
  const tiles: Array<Tile | undefined> = [
    {
      key: 'cache',
      tone: c.tone,
      amber: c.amber,
      reason: reasonOf(kit, c.amber),
      figure: figureOf(kit, cacheFigure(c)),
      label: label('cache'),
      mark: c.known ? bySize(size => batteryMark(kit, c.charge, c.tone, c.alt, size)) : NO_MARK,
    },
    { key: 'cost', tone: 'calm', amber: undefined, reason: NO_REASON, figure: figureOf(kit, s.totalText), label: label('spent'), mark: NO_MARK },
    // Unreported, the context has no tile, and open no card.
    x.known
      ? { key: 'ctx', tone: x.tone, amber: x.amber, reason: reasonOf(kit, x.amber), figure: figureOf(kit, x.valueText), label: label('context'), mark: bySize(size => contextMark(kit, x, size)), step: 'calmContext' }
      : undefined,
    read.fiveHour === undefined ? undefined : limitTile(kit, read.fiveHour, '5h'),
    read.sevenDay === undefined ? undefined : limitTile(kit, read.sevenDay, '7d'),
    c.measured ? { key: 'tokens', tone: 'calm', amber: undefined, reason: NO_REASON, figure: figureOf(kit, s.tokensText), label: label('tokens'), mark: NO_MARK, step: 'tokens' } : undefined,
  ]
  return amberFirst(tiles.filter((t): t is Tile => t !== undefined))
}

/** A Box's width, when it has one. */
const sized = (width: number | undefined) => (width === undefined ? {} : { width })

/** A tile at a squeeze, in columns `cols`: amber, its reason across its
 *  figure's and label's; calm, its figure right-aligned, then its label;
 *  then its mark, or the room for one. */
const tileSpec = (kit: Kit, t: Tile, keeps: Keeps<Piece>, cols: Columns): PillSpec => {
  const { Box } = kit
  const reason = t.reason(keeps)
  const text =
    reason !== undefined
      ? [
          <Box key="fig" {...sized(cols === undefined ? undefined : cols.figure + 1 + cols.label)}>
            {reason}
          </Box>,
        ]
      : [
          <Box key="fig" justifyContent="flex-end" {...sized(cols?.figure)}>
            {t.figure}
          </Box>,
          keeps.has('labels') ? (
            <Box key="label" {...sized(cols?.label)}>
              {t.label(keeps)}
            </Box>
          ) : null,
        ]
  const mark =
    cols === undefined || !keeps.has('marks') ? null : (
      <Box key="mark" justifyContent="flex-end" width={cols.mark}>
        {t.mark(!keeps.has('barLength'))}
      </Box>
    )
  return {
    key: t.key,
    tone: t.tone,
    bg: t.bg,
    body: [
      <Box key="tile" flexDirection="row" alignItems="center" columnGap={1}>
        {text}
        {mark}
      </Box>,
    ],
  }
}

/** Tiles' one row, squeezed until it fits: each tile as wide as the widest
 *  figure, label and mark the row keeps, so they all shrink together. */
const tilesRow = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Svg, measure } = kit
  const tiles = tilesOf(kit, read)
  const widest = (els: readonly RenderChildren[]) => Math.ceil(Math.max(0, ...els.map(el => cellsOf(el, measure))))
  return fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const kept = tiles.filter(t => t.step === undefined || keeps.calm(t.step, t.tone))
    const calm = kept.filter(t => t.amber === undefined)
    const size = keeps.has('barLength') ? MARK : SHORT_MARK
    const figure = widest(calm.map(t => t.figure))
    const label = keeps.has('labels') ? widest(calm.map(t => t.label(keeps))) : 0
    // The widest reason sets the label's room too, so no amber tile is wider.
    const span = widest(kept.map(t => t.reason(keeps)))
    const cols: Columns = keeps.has('evenWidths')
      ? { figure, label: Math.max(label, span - figure - 1), mark: Svg ? Math.ceil(size.px / measure.pxPerCell) : size.cells }
      : undefined
    return pillRow(kit, read, act, kept.map(t => tileSpec(kit, t, keeps, cols)))
  })
}

/** Each card's head: the tile's mark at the card's size, at the head's end. */
const lens: Lens = (kit, read) => {
  const { Box, palette } = kit
  const { cache: c, context: x, worstLimit: worst } = read
  const slot = (mark: RenderChildren) => (
    <Box key="lens" flexGrow={1} justifyContent="flex-end">
      {mark}
    </Box>
  )
  return {
    slots: {
      ...(c.known ? { cache: slot(batteryMark(kit, c.charge, c.tone, c.alt, SLOT)) } : {}),
      ...(x.known ? { context: slot(contextMark(kit, x, SLOT)) } : {}),
      ...(worst === undefined ? {} : { limits: slot(limitMark(kit, worst, SLOT, palette.cardBg)) }),
    },
  }
}

export const tilesView = defineCardsView('tiles', { desktop: 1, terminal: 1 }, (kit, read, act) => [tilesRow(kit, read, act)], lens)
