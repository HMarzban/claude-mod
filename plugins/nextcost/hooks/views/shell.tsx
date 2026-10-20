// The card shell chips' and pulse's open views share, so their cards read as
// one family: which cards there are and their marks, a card's ground and
// edge, its title and headline, its fact rows, how many cards a line holds,
// the grid they sit in, and the alert drawn where none fits.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { SplitPart } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { CARD_TEXT } from '../layout'
import type { Readings, Tone } from '../reading'
import type { Palette } from '../palette'
import { CARD_TITLES } from '../words'
import type { Role, Say } from '../words'

/** Each role's ink: text on the card ground. */
export const ROLE_INK: Readonly<Record<Role, Exclude<keyof Palette, 'filled'>>> = {
  label: 'label',
  value: 'value',
  amber: 'amberFg',
  accent5: 'fiveText',
  accent7: 'weekText',
}

/** The cards, in the order they are drawn. */
export const CARD_NAMES = ['cache', 'spend', 'context', 'limits'] as const
export type CardName = (typeof CARD_NAMES)[number]

/** Each card's mark: the chips' own icons, so the band speaks one language. */
const CARD_ICONS: Readonly<Record<CardName, readonly [Icon, Exclude<keyof Palette, 'filled'>]>> = {
  cache: ['cache', 'warm'],
  spend: ['cost', 'coin'],
  context: ['context', 'label'],
  limits: ['limits', 'fiveAccent'],
}

/** The cards the readings have something for: the context once it is
 *  reported, the limits once any window is. */
export const cardsPresent = (read: Readings): Readonly<Record<CardName, boolean>> => ({
  cache: true,
  spend: true,
  context: read.context.known,
  limits: read.limits.length > 0,
})

/** `items`, `perLine` to a line. */
export const linesOf = <T,>(items: readonly T[], perLine: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / perLine) }, (_, i) => items.slice(i * perLine, (i + 1) * perLine))

/** The cards, line by line, a row of air between lines. Chips aligns a
 *  line's cards to one top edge, as a grid's, so their heads line up; pulse
 *  stretches them to the line's height, so their facts line up. */
export const cardGrid = (kit: Kit, lines: ReadonlyArray<readonly RenderChildren[]>, o: Readonly<{ marginTop: number; align: 'flex-start' | 'stretch' }>): RenderElement => {
  const { Box } = kit
  return (
    <Box key="cards" flexDirection="column" rowGap={1} marginTop={o.marginTop}>
      {lines.map((line, i) => (
        <Box key={`cards:${i}`} flexDirection="row" alignItems={o.align} columnGap={1}>
          {line}
        </Box>
      ))}
    </Box>
  )
}

/** Where no card fits, an amber window only the cards draw (the collapsed
 *  lines never draw the engine's other windows) still says it needs you, on
 *  the row they would have started on; null when none is amber. */
export const alertLine = (kit: Kit, read: Readings): RenderElement | null => {
  const { Box, palette, oneLine } = kit
  const alerts = read.limits.flatMap(l => (l.key === 'other' && l.amber !== undefined ? [l.amber.long] : []))
  return alerts.length === 0 ? null : <Box key="alert" marginTop={1}>{oneLine({ key: 'alert', color: palette.amberFg }, alerts.join(' · '))}</Box>
}

/** Whether a card draws its edge: the desktop's always, a terminal's only
 *  in plain, which has no fill to stand on; a terminal card with a fill
 *  draws none, since its border would cost two columns. */
export const cardBordered = (kit: Kit): boolean => kit.Svg !== undefined || !kit.palette.filled

/** The columns, and in text the rows, a card's edge takes. */
export const cardEdge = (kit: Kit): number => (cardBordered(kit) ? 2 : 0)

/** As many cards to a line as hold their text, else half of them, else one. */
export const cardsPerLine = (kit: Kit, count: number, edge: number): number => {
  const minCard = Math.ceil(CARD_TEXT * kit.measure.text) + 2 + edge
  const fits = (n: number) => n * minCard + (n - 1) <= kit.columns
  return [count, Math.ceil(count / 2)].find(fits) ?? 1
}

/** The columns inside a card, `perLine` to a line: its share of the line,
 *  less its padding and edge. */
export const cardInner = (kit: Kit, perLine: number, edge: number): number =>
  Math.max(4, Math.floor((kit.columns - (perLine - 1)) / perLine) - 2 - edge)

/** A desktop card's edge: a line of a pixel either side. */
const DESKTOP_EDGE_PX = 2

/** The px inside a desktop card, `perLine` to a line: its share of the
 *  line's px, less its padding and its edge's lines, so a chart drawn this
 *  wide ends where its fact row does. */
export const cardInnerPx = (kit: Kit, perLine: number): number => {
  const { columns, measure } = kit
  return Math.floor(((columns - (perLine - 1)) * measure.pxPerCell) / perLine - 2 * measure.pxPerCell - (cardBordered(kit) ? DESKTOP_EDGE_PX : 0))
}

/** A label and its value at either end of a line; `swatch` keys a legend
 *  in its part's colour and fill. A phrase's figures are in the card's
 *  value ink, its other words in their roles'. */
export const factRow = (kit: Kit, label: string, value: string | Say, swatch?: SplitPart): RenderElement => {
  const { Box, Text, palette } = kit
  return (
    <Box key={`fact:${label}`} flexDirection="row" justifyContent="space-between" columnGap={2}>
      <Text color={palette.label}>
        {swatch === undefined ? null : <Text key="sw" color={swatch.color}>{`${swatch.mark} `}</Text>}
        {label}
      </Text>
      <Text color={palette.cardValue}>
        {typeof value === 'string'
          ? value
          : value.map(([text, role], i) => (
              <Text key={String(i)} color={role === 'value' ? palette.cardValue : palette[ROLE_INK[role]]}>
                {text}
              </Text>
            ))}
      </Text>
    </Box>
  )
}

/** A headline: bold on its figure alone, its words in label ink, or
 *  amber's; amber words make the figure amber too. */
export const headline = (kit: Kit, say: Say, tone: Tone): RenderElement => {
  const { Text, palette, onTone, oneLine } = kit
  const figure = onTone(say.some(([, role]) => role === 'amber') ? 'amber' : tone, palette.value)
  return oneLine(
    {},
    say.map(([text, role], i) =>
      role === 'value' ? (
        <Text key={`say${i}`} color={figure} bold>
          {text}
        </Text>
      ) : (
        <Text key={`say${i}`} color={role === 'amber' ? palette.amberFg : palette.label}>
          {text}
        </Text>
      ),
    ),
  )
}

export type CardSpec = Readonly<{
  /** The card's key, `card:cache`. */
  key: string
  /** Which card: its title, and its mark, drawn on the desktop alone. */
  name: CardName
  /** Its headline, at the head's other end. */
  head: RenderElement
  /** What follows the head, line by line. */
  body: RenderChildren
  bordered: boolean
}>

/** A card: its title and headline on one line, then its body. Each grows
 *  alike from no width, so the cards of a line share it equally. */
export const cardShell = (kit: Kit, { key, name, head, body, bordered }: CardSpec): RenderElement => {
  const { Box, Text, Svg, palette, icon } = kit
  const title = CARD_TITLES[name]
  const [mark, ink] = CARD_ICONS[name]
  const titled = (
    <Box key="title" flexDirection="row" flexShrink={0}>
      {/* Desktop alone: a terminal title stays plain text. */}
      {Svg ? icon(mark, palette[ink]) : null}
      <Text color={palette.label}>{title.toUpperCase()}</Text>
    </Box>
  )
  return (
    <Box
      key={key}
      flexDirection="column"
      flexGrow={1}
      width={0}
      minWidth={0}
      paddingX={1}
      {...(palette.filled ? { backgroundColor: palette.cardBg } : {})}
      {...(bordered ? { borderStyle: 'round', borderColor: palette.cardBorder } : {})}
    >
      <Box key="head" flexDirection="row" justifyContent="space-between" columnGap={1}>
        {titled}
        {head}
      </Box>
      {body}
    </Box>
  )
}
