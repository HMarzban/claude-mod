// Chips' open view: its four cards, CACHE, SPEND, CONTEXT and LIMITS, and its
// footer of the workspace strip and the buttons.

import type { RenderChildren } from 'claude-code'
import { meter, splitBar } from '../charts'
import type { SplitPart } from '../charts'
import type { Kit } from '../kit'
import { textCells } from '../layout'
import type { BarSize } from '../layout'
import type { LimitKey, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { SPLIT_LABELS, type Say } from '../words'
import { bodyRowsFor, footer, topStrip } from './frame'
import { CARD_NAMES, alertLine, cardGrid, cardLine, cardShell, cardsPresent, factRow, headline, linesOf } from './shell'
import type { CardName } from './shell'

/** A limit's accent: its window's, or the meter's for any other. Exported
 *  for its tests. */
export const accentOf = (kit: Kit, limit: Readonly<{ key: LimitKey }>): string =>
  limit.key === '5h' ? kit.palette.fiveAccent : limit.key === '7d' ? kit.palette.weekAccent : kit.palette.meterFill

const SPLIT_ALT = `token split: ${SPLIT_LABELS.join(', ')}`

/** The session's tokens split by kind, in `SPLIT_LABELS`' order, each part
 *  in its colour. Cache reads are in the warm colour: cheap, and often most
 *  of the bar. In text each part has its own fill too, since the inks sit
 *  close in lightness: colour is never the only signal. The desktop's parts
 *  are solid, divided by the ground, so its legend marks them solid. */
const tokenPartsOf = (kit: Kit, read: Readings): SplitPart[] => {
  const { Svg, palette } = kit
  const { spend } = read
  const [inputFill, outputFill, readsFill] = Svg ? ['■', '■', '■'] : kit.glyphs === 'ascii' ? ['#', '=', '+'] : ['█', '▓', '▒']
  return [
    { n: spend.sent, color: palette.meterFill, mark: inputFill },
    { n: spend.back, color: palette.coin, mark: outputFill },
    { n: spend.cached, color: palette.warm, mark: readsFill },
  ]
}

/** Chips' open view, beneath its row: as many cards to a line as hold their
 *  text, each as much of its body as the band has rows for; the workspace
 *  strip on top or in the footer; then Collapse and Hide band. */
export const openBody = (kit: Kit, read: Readings, act: BandActions, collapsedRows: number): RenderChildren[] => {
  const { Box, Text, palette, measure, onTone, oneLine } = kit
  const { cache, spend, context } = read

  /** A fact the readings may not know yet: nothing until they do. */
  const knownRow = (label: string, value: string | undefined) => (value === undefined ? null : factRow(kit, label, value))
  const note = (text: string) => (
    <Text key="note" color={palette.label} wrap="wrap">
      {text}
    </Text>
  )

  // The grid: as many cards to a line as hold their text, else two, else one.
  // Each line shares its width equally (a zero basis, grown alike), so the
  // cards align whatever their text and a line never wraps one away. A
  // desktop card has a visible edge; a terminal card is a fill, its border
  // would cost two columns. Lines keep a row of air between them.
  // The cards present, which the grid lays out.
  const hasCard = cardsPresent(read)
  const present = CARD_NAMES.filter(name => hasCard[name])
  const cardCount = present.length
  const { perLine, inner, edge, pxEdge } = cardLine(kit, cardCount)
  const lineCount = Math.ceil(cardCount / perLine)
  const lineGap = 1
  // The rows a card's body may take: the frame's, shared by the lines less
  // the row of air between them, less a card's edge and its header. A taller
  // band would scroll, hiding the buttons.
  const bodyFor = (strip: number) =>
    Math.floor((bodyRowsFor(read.frame.maxRows, collapsedRows, strip) - lineGap * (lineCount - 1)) / lineCount) - edge - 1
  // The strip heads the view when every card still keeps a fact of its own;
  // short of that row it takes the footer's, in place of the hint.
  const ws = read.workspace
  const stripPlace: 'top' | 'footer' | undefined = ws === undefined ? undefined : bodyFor(1) >= 1 ? 'top' : 'footer'
  const bodyRows = Math.max(1, bodyFor(stripPlace === 'top' ? 1 : 0))
  // Short of a row under each head for a fact, the cards give way whole. The
  // desktop draws a card's edge as a line of pixels, so there it never
  // counts as the row a fact needs.
  const cardsFit = bodyFor(0) + (pxEdge ? edge : 0) >= 1
  const cardBar: BarSize = { px: inner * measure.pxPerCell, cells: inner }
  /** As much of a card's body as the band has rows for, its facts listed
   *  most important first. Its bar repeats a chip's, so it shows only when
   *  every fact fits beside it; short of rows, a fact wins. */
  const fitBody = (bar: RenderChildren, body: RenderChildren[]): RenderChildren[] => {
    const facts = body.filter(part => part !== null && part !== undefined)
    return bar !== null && facts.length < bodyRows ? [bar, ...facts] : facts.slice(0, bodyRows)
  }
  /** A card: its title and headline on one line, then its bar and its body. */
  const card = (name: CardName, head: Readonly<{ say: Say; tone?: Tone }>, bar: RenderChildren, body: RenderChildren[]) =>
    cardShell(kit, { key: `card:${name}`, name, head: headline(kit, head.say, head.tone ?? 'calm'), body: fitBody(bar, body) })

  const cacheView = card(
    'cache',
    { say: cache.cardHead, tone: cache.tone },
    cache.known ? meter(kit, { label: 'cache', frac: cache.charge, tone: cache.tone, accent: palette.warm, size: cardBar, stretch: true, reads: 'left' }) : null,
    [
      cache.cardNote === undefined ? null : note(cache.cardNote),
      cache.known ? factRow(kit, cache.estimateLabel, cache.estimate) : null,
      knownRow('idle for', cache.idleText),
      knownRow('unexpected rebuilds', cache.rebuildsText),
      knownRow('saved by cache', cache.savedText),
      knownRow('hit rate', cache.hitText),
      factRow(kit, 'expires', cache.lastsText),
    ],
  )

  const tokenParts = tokenPartsOf(kit, read)
  const lastRow = spend.lastText === undefined ? null : factRow(kit, 'last message', spend.lastText)
  const splitShown = cache.measured
  const tokenRows = splitShown
    ? spend.split.map((part, i) => factRow(kit, part.label, part.text, tokenParts[i]))
    : [note('Breakdown counts from your next message.')]
  const spendView = card('spend', { say: [[spend.totalText, 'value']] }, splitShown ? splitBar(kit, { alt: SPLIT_ALT, parts: tokenParts, size: cardBar }) : null, [lastRow, ...tokenRows])

  const contextView = context.known
    ? card(
        'context',
        { say: context.cardHead, tone: context.tone },
        meter(kit, { label: 'context', frac: context.frac, tone: context.tone, accent: palette.meterFill, size: cardBar, stretch: true }),
        [
          knownRow('room left', context.roomText),
          knownRow('auto-compacts at', context.compactsAtText),
          factRow(kit, 'in context', context.inContextText),
          factRow(kit, 'model window', context.windowText),
        ],
      )
    : null

  const worst = read.worstLimit
  /** The card's first row: the worst window's reset, at its clock time once
   *  the offset is known, and its pace. */
  const leadRow = (): RenderChildren => {
    if (worst === undefined) return null
    const { pace, resetWhen: when } = worst
    // Its pace alone needs no label: the phrase says it is one.
    if (when === undefined) return pace === '' ? null : <Box key="fact:pace">{oneLine({ color: palette.label }, pace)}</Box>
    return (
      <Box key="fact:resets" flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text color={palette.label}>resets</Text>
        {oneLine({}, [
          <Text key="when" color={palette.cardValue}>
            {when}
          </Text>,
          pace === '' ? null : <Text key="pace" color={palette.label}>{` · ${pace}`}</Text>,
        ])}
      </Box>
    )
  }
  /** One window: its name, bar and value on a line, then its name again with
   *  its reset and pace in words, `5h resets 4h 55m`, which the lead row says
   *  for the worst. */
  const limitRows = (w: LimitView): readonly [RenderChildren, RenderChildren] => {
    const { name, frac, tone } = w
    if (w.passed) return [factRow(kit, name, 'reset'), null]
    const value = w.valueMarked
    const reset = w.cardResetLess
    const room = Math.max(4, inner - textCells(name) - textCells(value) - 2)
    const size: BarSize = { px: room * measure.pxPerCell, cells: room }
    return [
      <Box key={`fact:${name}`} flexDirection="row" columnGap={1}>
        <Text color={palette.label}>{name}</Text>
        <Box key="bar" flexGrow={1} width={0} minWidth={0}>
          {meter(kit, { label: name, frac, tone, accent: accentOf(kit, w), size, stretch: true })}
        </Box>
        <Text color={onTone(tone, palette.cardValue)}>{value}</Text>
      </Box>,
      // Named, so beneath another window's headline it reads as its own.
      w === worst || reset === undefined ? null : <Box key={`fact:${name} pace`}>{oneLine({ color: palette.label }, `${name} ${reset}`)}</Box>,
    ]
  }
  /** The lead row, then every window's rows; short of rows, each window's
   *  bar row before any pace line, and with no lead row the worst's bar
   *  last of all, since the headline says its value. */
  const limitLines = (): RenderChildren[] => {
    const lead = leadRow()
    const rows = read.limits.map(limitRows)
    const lines = rows.flat().filter(part => part !== null)
    const room = bodyRows - (lead === null ? 0 : 1)
    if (lines.length <= room) return [lead, ...lines]
    const bars = rows.map(([bar]) => bar)
    const worstAt = lead === null ? read.limits.findIndex(w => w === worst) : -1
    const worstBar = worstAt < 0 ? [] : bars.splice(worstAt, 1)
    return [lead, ...bars, ...rows.map(([, pace]) => pace), ...worstBar]
  }
  const limitsView =
    read.limits.length > 0
      ? card(
          'limits',
          {
            say: worst === undefined ? [['all reset', 'value']] : [[`${worst.name} `, 'label'], [worst.valueMarked, 'value']],
            tone: worst === undefined ? 'calm' : worst.tone,
          },
          // Each window's bar is in its own row, so the card has none apart.
          null,
          limitLines(),
        )
      : null

  const cardViews = [cacheView, spendView, contextView, limitsView].filter(view => view !== null)

  return [
    stripPlace === 'top' && ws !== undefined ? topStrip(kit, ws, edge) : null,
    cardsFit ? cardGrid(kit, linesOf(cardViews, perLine), { marginTop: stripPlace === 'top' ? 0 : 1, align: 'flex-start' })
    // Without them, the other windows' alert, where the band has a row for it.
    : bodyRowsFor(read.frame.maxRows, collapsedRows, 0) < 1 ? null
    : alertLine(kit, read),
    footer(kit, act, stripPlace === 'footer' ? ws : undefined),
  ]
}
