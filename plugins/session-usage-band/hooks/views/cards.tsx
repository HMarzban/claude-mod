// The open view every layout shares: chips' four cards, CACHE, SPEND,
// CONTEXT and LIMITS, and its footer of the workspace strip and the buttons.
// A layout brings a lens for each card's head, may say a card's headline and
// first row its own way, and names the facts its collapsed lines already
// show, so each card's body adds and never repeats.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, splitBar } from '../charts'
import type { SplitPart } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { CARD_TEXT, DESKTOP, HOTKEY_MARK, ROW_SLACK, cellsOf } from '../layout'
import type { BarSize } from '../layout'
import { BARE } from '../palette'
import type { LimitKey, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { drawStrip } from '../strip'
import { SPLIT_LABELS, type Say } from '../words'
import { bodyRowsFor } from './frame'
import { accentOf } from './parts'

/** The cards, in the order they are drawn. */
export type CardName = 'cache' | 'spend' | 'context' | 'limits'

/** Each body row a card may draw, by what it says. */
export type Fact =
  | 'reWarm'
  | 'idle'
  | 'rebuilds'
  | 'saved'
  | 'hitRate'
  | 'expires'
  | 'lastMessage'
  | 'tokenSplit'
  | 'room'
  | 'compactsAt'
  | 'inContext'
  | 'modelWindow'
  | 'reset'
  | 'pace'
  | WindowFact

/** What the collapsed lines draw of the 5h or 7d window, the only windows
 *  they draw: `window:5h` its name, bar and figure; `pace:5h` and
 *  `reset:5h` its words. */
type WindowFact = `${'window' | 'pace' | 'reset'}:${Exclude<LimitKey, 'other'>}`

/** A layout's mark for a card's head row: at most 16px on the desktop, a few
 *  cells in a terminal. */
export type Slots = Readonly<Partial<Record<CardName, RenderChildren>>>

/** A card's first row, as its facts are drawn: a label and its value,
 *  `used so far` and `5h 0% · 7d 66%`. */
export type Lead = readonly [label: string, value: string]

export type OpenOptions = Readonly<{
  /** The rows the collapsed lines take, so the cards take only what is left. */
  collapsedRows: number
  slots?: Slots
  /** Whether a card's lens stands for its bar, which it then draws in place
   *  of: tiles' marks read as the bar does. */
  slotsReplaceBars?: boolean
  /** A card's headline in the layout's words, in place of its own: bold on
   *  its figure, `~12 msgs`. */
  heads?: Readonly<Partial<Record<CardName, Say>>>
  /** A card's first row, before its own facts and counted with them. */
  lead?: Readonly<Partial<Record<CardName, Lead>>>
  /** What the collapsed lines already show: no card repeats it. Its reset
   *  and pace are the worst window's. */
  shown?: readonly Fact[]
  /** What the collapsed lines already say of each window, by its key: its
   *  own line and, for the worst, the lead row leave it out. */
  shownByWindow?: Readonly<Partial<Record<LimitKey, readonly Fact[]>>>
  /** How each window's own line says its reset: as a countdown, chips'
   *  `resets 3h 00m · …`, or at its clock time as the lead row does,
   *  `resets 16:40 · …`. */
  windowResets?: 'countdown' | 'clock'
  /** Short of rows for SPEND's three legend rows, one in their place: the
   *  split bar and `input · output · cache reads`, as ledger's board draws it. */
  compactSplit?: boolean
}>

/** The session's tokens split by kind, each part in its colour. Cache reads
 *  are in the warm colour: cheap, and often most of the bar. In text each
 *  part has its own fill too, since the inks sit close in lightness: colour
 *  is never the only signal. The desktop's parts are solid, divided by the
 *  ground, so its legend marks them solid. */
export const tokenPartsOf = (kit: Kit, read: Readings): ReadonlyArray<readonly [string, SplitPart]> => {
  const { Svg, palette } = kit
  const { spend } = read
  const [inputFill, outputFill, readsFill] = Svg ? ['■', '■', '■'] : read.frame.glyphs === 'ascii' ? ['#', '=', '+'] : ['█', '▓', '▒']
  return [
    ['input', { n: spend.sent, color: palette.meterFill, mark: inputFill }],
    ['output', { n: spend.back, color: palette.coin, mark: outputFill }],
    ['cache reads', { n: spend.cached, color: palette.warm, mark: readsFill }],
  ]
}

/** What opens beneath a layout's collapsed lines: as many cards to a line as
 *  hold their text, each as much of its body as the band has rows for; the
 *  workspace strip on top or in the footer; then Collapse and Hide band. */
export const openBody = (kit: Kit, read: Readings, act: BandActions, o: OpenOptions): RenderChildren[] => {
  const { Box, Button, Text, Svg, palette, measure, columns, onTone, oneLine, icon } = kit
  const { cache, spend, context } = read
  const shown = new Set(o.shown)

  /** A label and its value at either end of a line, unless the collapsed
   *  lines show it; `swatch` keys a legend in its part's colour and fill. */
  const factRow = (fact: Fact | undefined, label: string, value: string, swatch?: SplitPart) =>
    fact !== undefined && shown.has(fact) ? null : (
      <Box key={`fact:${label}`} flexDirection="row" justifyContent="space-between" columnGap={2}>
        <Text color={palette.label}>
          {swatch === undefined ? null : <Text key="sw" color={swatch.color}>{`${swatch.mark} `}</Text>}
          {label}
        </Text>
        <Text color={palette.cardValue}>{value}</Text>
      </Box>
    )
  /** A fact the readings may not know yet: nothing until they do. */
  const knownRow = (fact: Fact, label: string, value: string | undefined) => (value === undefined ? null : factRow(fact, label, value))
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
  const bordered = Svg !== undefined || !palette.filled
  const edge = bordered ? 2 : 0
  const minCard = Math.ceil(CARD_TEXT * measure.text) + 2 + edge
  // The cards present, which the grid lays out.
  const present: readonly CardName[] = [
    'cache',
    'spend',
    ...(context.known ? (['context'] as const) : []),
    ...(read.limits.length > 0 ? (['limits'] as const) : []),
  ]
  const cardCount = present.length
  const fits = (n: number) => n * minCard + (n - 1) <= columns
  const perLine = [cardCount, Math.ceil(cardCount / 2)].find(fits) ?? 1
  const lineCount = Math.ceil(cardCount / perLine)
  const lineGap = 1
  // The rows a card's body may take: the frame's, shared by the lines less
  // the row of air between them, less a card's edge and its header. A taller
  // band would scroll, hiding the buttons.
  const bodyFor = (strip: number) =>
    Math.floor((bodyRowsFor(read.frame.maxRows, o.collapsedRows, strip) - lineGap * (lineCount - 1)) / lineCount) - edge - 1
  // The strip heads the view when every card still keeps a fact of its own;
  // short of that row it takes the footer's, in place of the hint.
  const ws = read.workspace
  const stripPlace: 'top' | 'footer' | undefined = ws === undefined ? undefined : bodyFor(1) >= 1 ? 'top' : 'footer'
  const bodyRows = Math.max(1, bodyFor(stripPlace === 'top' ? 1 : 0))
  // Short of a row under each head for a fact, the cards give way whole. The
  // desktop draws a card's edge as a line of pixels, so there it never
  // counts as the row a fact needs.
  const cardsFit = bodyFor(0) + (measure === DESKTOP ? edge : 0) >= 1
  // Without them, a window only the cards draw (the collapsed lines never
  // draw the engine's other windows) still says it needs you, on the row
  // they would have started on, where the band has one.
  const alerts =
    cardsFit || bodyRowsFor(read.frame.maxRows, o.collapsedRows, 0) < 1
      ? []
      : read.limits.flatMap(l => (l.key === 'other' && l.amber !== undefined ? [l.amber.long] : []))
  const inner = Math.max(4, Math.floor((columns - (perLine - 1)) / perLine) - 2 - edge)
  const cardBar: BarSize = { px: inner * measure.pxPerCell, cells: inner }
  /** As much of a card's body as the band has rows for, its facts listed
   *  most important first. Its bar repeats a chip's, so it shows only when
   *  every fact fits beside it and no lens in its head draws it already;
   *  short of rows, a fact wins. */
  const fitBody = (bar: RenderChildren, body: RenderChildren[]): RenderChildren[] => {
    const facts = body.filter(part => part !== null && part !== undefined)
    return bar !== null && facts.length < bodyRows ? [bar, ...facts] : facts.slice(0, bodyRows)
  }
  // Each card's mark: the chips' own icons, so the band speaks one language.
  const cardIcon: Readonly<Record<CardName, readonly [Icon, string]>> = {
    cache: ['cache', palette.warm],
    spend: ['cost', palette.coin],
    context: ['context', palette.label],
    limits: ['limits', palette.fiveAccent],
  }
  /** A headline: bold on its figure alone, its words in label ink, an
   *  amber reading's lead in amber. */
  const headline = (say: Say, tone: Tone) =>
    oneLine(
      {},
      say.map(([text, role], i) =>
        role === 'value' ? (
          <Text key={`say${i}`} color={onTone(tone, palette.value)} bold>
            {text}
          </Text>
        ) : (
          <Text key={`say${i}`} color={role === 'amber' ? palette.amberFg : palette.label}>
            {text}
          </Text>
        ),
      ),
    )
  /** A card: its title, the layout's lens and its headline on one line, then
   *  its bar, the layout's lead and its body. */
  const card = (name: CardName, title: string, head: Readonly<{ say: Say; tone?: Tone }>, bar: RenderChildren, body: RenderChildren[]) => {
    const slot = o.slots?.[name]
    const lead = o.lead?.[name]
    const say = headline(o.heads?.[name] ?? head.say, head.tone ?? 'calm')
    const ownBar = slot !== undefined && o.slotsReplaceBars === true ? null : bar
    return (
      <Box
        key={`card:${name}`}
        flexDirection="column"
        flexGrow={1}
        width={0}
        minWidth={0}
        paddingX={1}
        {...(palette.filled ? { backgroundColor: palette.cardBg } : {})}
        {...(bordered ? { borderStyle: 'round', borderColor: palette.cardBorder } : {})}
      >
        <Box key="head" flexDirection="row" justifyContent="space-between" columnGap={1}>
          <Box key="title" flexDirection="row" flexShrink={0}>
            {/* Desktop alone: a terminal title stays plain text. */}
            {Svg ? icon(...cardIcon[name]) : null}
            <Text color={palette.label}>{title.toUpperCase()}</Text>
          </Box>
          {/* A lens takes the room the title and headline leave, and gives
              way before the headline's figure does. */}
          {slot === undefined
            ? say
            : [
                <Box key="slot" flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                  {slot}
                </Box>,
                <Box key="headline" flexShrink={0}>
                  {say}
                </Box>,
              ]}
        </Box>
        {fitBody(ownBar, lead === undefined ? body : [factRow(undefined, ...lead), ...body])}
      </Box>
    )
  }

  const cacheView = card(
    'cache',
    'Cache',
    { say: cache.cardHead, tone: cache.tone },
    cache.known ? meter(kit, { label: 'cache', frac: cache.charge, tone: cache.tone, accent: palette.warm, size: cardBar, stretch: true, reads: 'left' }) : null,
    [
      cache.cardNote === undefined ? null : note(cache.cardNote),
      cache.known ? factRow('reWarm', cache.mood === 'cold' ? 'next message' : 're-warm if cold', cache.estimate) : null,
      knownRow('idle', 'idle for', cache.idleText),
      knownRow('rebuilds', 'unexpected rebuilds', cache.rebuildsText),
      knownRow('saved', 'saved by cache', cache.savedText),
      knownRow('hitRate', 'hit rate', cache.hitText),
      factRow('expires', 'expires', cache.lastsText),
    ],
  )

  const tokenParts = tokenPartsOf(kit, read)
  const split = (size: BarSize) =>
    splitBar(kit, { alt: 'token split: input, output, cache reads', parts: tokenParts.map(([, part]) => part), size })
  const lastRow = spend.lastText === undefined ? null : factRow('lastMessage', 'last message', spend.lastText)
  const splitShown = cache.measured && !shown.has('tokenSplit')
  // Short of rows for the legend's three, its one line: the bar, then the
  // kinds it splits into, in order.
  const compact = splitShown && o.compactSplit === true && (lastRow === null ? 0 : 1) + tokenParts.length > bodyRows
  const legend = SPLIT_LABELS.join(' · ')
  const legendRoom = Math.max(4, inner - [...legend].length - 1)
  const tokenRows = !splitShown
    ? shown.has('tokenSplit')
      ? []
      : [note('Breakdown counts from your next message.')]
    : compact
      ? [
          <Box key="fact:split" flexDirection="row" columnGap={1}>
            <Box key="bar" flexGrow={1} width={0} minWidth={0}>
              {split({ px: legendRoom * measure.pxPerCell, cells: legendRoom })}
            </Box>
            {oneLine({ color: palette.label }, legend)}
          </Box>,
        ]
      : spend.split.map((part, i) => factRow(undefined, part.label, part.text, tokenParts[i]?.[1]))
  const spendView = card('spend', 'Spend', { say: [[spend.totalText, 'value']] }, splitShown && !compact ? split(cardBar) : null, [lastRow, ...tokenRows])

  const contextView = context.known
    ? card(
        'context',
        'Context',
        { say: context.cardHead, tone: context.tone },
        meter(kit, { label: 'context', frac: context.frac, tone: context.tone, accent: palette.meterFill, size: cardBar, stretch: true }),
        [
          knownRow('room', 'room left', context.roomText),
          knownRow('compactsAt', 'auto-compacts at', context.compactsAtText),
          factRow('inContext', 'in context', context.inContextText),
          factRow('modelWindow', 'model window', context.windowText),
        ],
      )
    : null

  const worst = read.worstLimit
  /** What the collapsed lines say of a window: its own facts, and the
   *  worst's in `shown` too. */
  const saidOf = (w: LimitView) => {
    const own = new Set(o.shownByWindow?.[w.key])
    const said = (fact: Fact) => own.has(fact) || (w === worst && shown.has(fact))
    return { reset: said('reset'), pace: said('pace') }
  }
  /** The card's first row: the worst window's reset, at its clock time once
   *  the offset is known, and its pace, where a collapsed row has its value. */
  const leadRow = (): RenderChildren => {
    if (worst === undefined) return null
    const said = saidOf(worst)
    const pace = said.pace ? '' : worst.pace
    const when = said.reset ? undefined : worst.resetWhen
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
  /** One window: its name, bar and value on a line, then its reset and pace
   *  in words, less what the collapsed lines say of it, which the lead row
   *  says for the worst. */
  const limitRows = (w: LimitView): readonly [RenderChildren, RenderChildren] => {
    const { name, frac, tone } = w
    const drew = (what: 'window' | 'pace' | 'reset') => w.key !== 'other' && shown.has(`${what}:${w.key}` as const)
    if (w.passed) return [drew('window') ? null : factRow(undefined, name, 'reset'), null]
    const value = w.valueMarked
    const reset = w.cardResetLess(o.windowResets ?? 'countdown', saidOf(w))
    const room = Math.max(4, inner - [...name].length - [...value].length - 2)
    const wordsDrawn = drew('reset') && (w.pace === '' || drew('pace'))
    return [
      drew('window') ? null : (
        <Box key={`fact:${name}`} flexDirection="row" columnGap={1}>
          <Text color={palette.label}>{name}</Text>
          <Box key="bar" flexGrow={1} width={0} minWidth={0}>
            {meter(kit, { label: name, frac, tone, accent: accentOf(kit, w), size: { px: room * measure.pxPerCell, cells: room }, stretch: true })}
          </Box>
          <Text color={onTone(tone, palette.cardValue)}>{value}</Text>
        </Box>
      ),
      w === worst || reset === undefined || wordsDrawn ? null : <Box key={`fact:${name} pace`}>{oneLine({ color: palette.label }, reset)}</Box>,
    ]
  }
  /** The lead row, then every window's rows; short of rows, each window's
   *  bar row before any pace line, and with no lead row the worst's bar
   *  last of all, since the headline says its value. */
  const limitLines = (): RenderChildren[] => {
    const lead = leadRow()
    const rows = read.limits.map(limitRows)
    const lines = rows.flat().filter(part => part !== null)
    const room = bodyRows - (lead === null ? 0 : 1) - (o.lead?.limits === undefined ? 0 : 1)
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
          'Limits',
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

  const buttons = [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
  let strip: RenderElement | null = null
  if (stripPlace !== undefined && ws !== undefined) {
    // In the footer it shares the line with the buttons and their hotkey marks.
    const room = columns - ROW_SLACK - (stripPlace === 'footer' ? cellsOf(buttons, measure) + 2 * HOTKEY_MARK + 2 : 0)
    strip = drawStrip(kit, ws, stripPlace, edge, room)
  }

  return [
    stripPlace === 'top' ? strip : null,
    cardsFit ? (
      <Box key="cards" flexDirection="column" rowGap={lineGap} marginTop={stripPlace === 'top' ? 0 : 1}>
        {Array.from({ length: lineCount }, (_, i) => (
          <Box key={`cards:${i}`} flexDirection="row" columnGap={1}>
            {cardViews.slice(i * perLine, (i + 1) * perLine)}
          </Box>
        ))}
      </Box>
    ) : alerts.length > 0 ? (
      <Box key="alert" marginTop={1}>
        {oneLine({ key: 'alert', color: palette.amberFg }, alerts.join(' · '))}
      </Box>
    ) : null,
    // A strip in the footer grows into all the room the buttons leave, at
    // least the room its cards are given; the hint leaves it to air.
    <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
      {stripPlace === 'footer' ? (
        strip
      ) : (
        <Box key="hint" flexDirection="row">
          {Svg ? icon('info', BARE.icon) : null}
          <Text color={BARE.label}>Bring it back with /usage-band</Text>
        </Box>
      )}
      {stripPlace === 'footer' && strip !== null ? null : <Box flexGrow={1} />}
      {buttons}
    </Box>,
  ]
}

/** The whole view: its collapsed lines, and the cards beneath them when open. */
export const cardsView = (kit: Kit, read: Readings, act: BandActions, lines: readonly RenderElement[], o: OpenOptions): RenderElement => {
  const { Box } = kit
  return (
    <Box flexDirection="column">
      {lines}
      {read.frame.expanded ? openBody(kit, read, act, o) : null}
    </Box>
  )
}
