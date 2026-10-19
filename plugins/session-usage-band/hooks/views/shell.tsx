// The card shell chips' and pulse's open views share, so their cards read as
// one family: a card's ground and edge, its title and headline, its fact
// rows, and how many cards a line holds.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { SplitPart } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { CARD_TEXT } from '../layout'
import type { Tone } from '../reading'
import type { Palette } from '../palette'
import type { Role, Say } from '../words'

/** Each role's ink: text on the card ground. */
export const ROLE_INK: Readonly<Record<Role, Exclude<keyof Palette, 'filled'>>> = {
  label: 'label',
  value: 'value',
  amber: 'amberFg',
  accent5: 'fiveText',
  accent7: 'weekText',
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
  title: string
  /** Its mark, the chips' own icon, drawn on the desktop alone. */
  icon: readonly [Icon, string]
  /** Its headline, at the head's other end. */
  head: RenderElement
  /** What follows the head, line by line. */
  body: RenderChildren
  bordered: boolean
}>

/** A card: its title and headline on one line, then its body. Each grows
 *  alike from no width, so the cards of a line share it equally. */
export const cardShell = (kit: Kit, { key, title, icon: [mark, ink], head, body, bordered }: CardSpec): RenderElement => {
  const { Box, Text, Svg, palette, icon } = kit
  const titled = (
    <Box key="title" flexDirection="row" flexShrink={0}>
      {/* Desktop alone: a terminal title stays plain text. */}
      {Svg ? icon(mark, ink) : null}
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
