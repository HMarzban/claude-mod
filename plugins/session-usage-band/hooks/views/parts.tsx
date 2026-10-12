// The pieces several views draw: the pill a chip sits in; the cache's
// battery, an icon on the desktop and the pill itself in a terminal; and the
// lines the layouts squeeze to fit, with the words they're written in.

import type { RenderChildren, RenderElement } from 'claude-code'
import { clamp01 } from '../format'
import { asciiText } from '../glyphs'
import { GLYPH } from '../icons'
import type { Kit } from '../kit'
import { fitSqueeze, isDrawn, keepsIn } from '../layout'
import type { Palette } from '../palette'
import type { LimitKey, Readings, Tone } from '../reading'
import type { Amber, Role, Say } from '../words'

export type PillSpec = Readonly<{
  key: string
  tone: Tone
  body: RenderChildren[]
  /** The one-line explanation shown while the pill is hovered, on a card
   *  its row draws after every pill. */
  hover?: string
  /** The terminal battery paints its own background in its Texts. */
  paintsOwnBg?: boolean
  bg?: string
}>

/** A pill carries its own foreground and background, never one of each. It
 *  reveals its card, drawn after every pill, through the hover scope they
 *  share; one line, since a collapsed band is one row. Plain has no cards;
 *  the expanded line says it all. A pill never shrinks: the squeeze drops
 *  pieces instead, so its text never wraps. */
export const pill = (kit: Kit, { key, tone, body, hover, paintsOwnBg, bg }: PillSpec): RenderElement => {
  const { Box, Text, palette, onTone, hoverable } = kit
  if (!palette.filled) {
    const fg = onTone(tone, palette.value)
    return (
      <Box key={key} flexShrink={0}>
        <Text color={fg}>[</Text>
        {body}
        <Text color={fg}>]</Text>
      </Box>
    )
  }
  const fill = paintsOwnBg ? {} : { backgroundColor: onTone(tone, bg ?? palette.surface, palette.amberBg), paddingX: 1 }
  return (
    <Box key={key} flexShrink={0} {...fill} {...(hover === undefined ? {} : hoverable(key))}>
      {body}
    </Box>
  )
}

/** The desktop's battery: an outline, its cap, and the charge filling it,
 *  `px` wide: an icon's 22, or a bar's length. */
export const batteryIcon = (kit: Kit, charge: number, tone: Tone, alt: string, px = 22): RenderChildren => {
  const { Svg, palette, onTone } = kit
  if (!Svg) return null
  const outline = onTone(tone, palette.label)
  const fill = onTone(tone, palette.warm)
  const width = Math.round(clamp01(charge) * (px - 7) * 10) / 10
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="12" viewBox="0 0 ${px} 12">` +
    `<rect x="0.75" y="0.75" width="${px - 3.5}" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
    `<rect x="${px - 2.25}" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
    `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>` +
    '</svg>'
  return <Svg key="battery" source={source} alt={alt} width={px} height={12} />
}

/** Text in runs, each bold or not: a figure among its words. */
type BoldRuns = ReadonlyArray<readonly [text: string, bold: boolean]>

/** On a text surface the battery is the pill itself: its charge painted as
 *  the background of the leading characters, draining right to left. In the
 *  ascii tier `text` is mapped before the cut, so a dropped glyph neither
 *  leaves a gap at the cut nor takes its cells from the charge; in runs, a
 *  bold one stays bold either side of the cut. */
export const textBattery = (kit: Kit, charge: number, tone: Tone, text: string | BoldRuns): RenderChildren[] => {
  const { Text, palette, onTone, glyphs } = kit
  const given: BoldRuns = typeof text === 'string' ? [[text, false]] : text
  const runs: BoldRuns = glyphs === 'ascii' ? given.map(([run, bold]) => [asciiText(run), bold]) : given
  const pad = { ch: ' ', bold: false }
  const chars = [pad, ...runs.flatMap(([run, bold]) => [...run].map(ch => ({ ch, bold }))), pad]
  const cut = Math.round(clamp01(charge) * chars.length)
  const fg = onTone(tone, palette.value)
  /** One side of the cut: a Text for each run of one weight, or nothing. */
  const side = (key: string, part: readonly (typeof pad)[], ground: string): RenderChildren[] => {
    const pieces: Array<{ text: string; bold: boolean }> = []
    for (const { ch, bold } of part) {
      const last = pieces.at(-1)
      if (last?.bold === bold) last.text += ch
      else pieces.push({ text: ch, bold })
    }
    if (pieces.length === 0) return [null]
    return pieces.map(({ text: run, bold }, i) => (
      <Text key={i === 0 ? key : `${key}${i}`} color={fg} backgroundColor={ground} {...(bold ? { bold } : {})}>
        {run}
      </Text>
    ))
  }
  return [
    ...side('bf', chars.slice(0, cut), onTone(tone, palette.batteryFill, palette.batteryAmber)),
    ...side('be', chars.slice(cut), onTone(tone, palette.surface, palette.amberBg)),
  ]
}

/** The cache pill's hover card: what its mood means now. */
export const cacheHover = (read: Readings): string => read.chips.reading.copy.hover

// ---- what every layout squeezes its lines with ----------------------------

/** What a line's build may ask at its squeeze. */
export type Keeps<P extends string> = Readonly<{
  /** Whether a calm, optional piece is still kept. */
  has: (p: P) => boolean
  /** Whether a piece of this tone is kept: an amber one always is. */
  calm: (p: P, tone: Tone) => boolean
  /** An amber reading's words: long until the amber step, then short. */
  amber: (a: Amber) => string
}>

/** The step `fitLine` appends to every order that doesn't name it: amber turns short. */
const AMBER_STEP = 'amberShort'
/** Asks a `Keeps` which of an amber reading's forms it would pick. */
const AMBER_PROBE: Amber = { long: 'long', short: 'short' }

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

/** A line squeezed by its give-way order: the smallest squeeze at which it
 *  fits, and what that squeeze keeps. The amber step is last unless the
 *  order names it, so amber shortens only once every calm piece before it
 *  has gone. */
const fitLineKeeps = <P extends string>(
  kit: Kit,
  order: readonly P[],
  room: number,
  build: (keeps: Keeps<P>) => RenderElement,
): Readonly<{ line: RenderElement; keeps: Keeps<P> }> => {
  const steps: ReadonlyArray<P | typeof AMBER_STEP> = order.includes(AMBER_STEP as P) ? order : [...order, AMBER_STEP]
  const at = keepsIn(steps)
  const keepsAt = (squeeze: number): Keeps<P> => ({
    has: p => at(squeeze, p),
    calm: (p, tone) => tone === 'amber' || at(squeeze, p),
    amber: a => (at(squeeze, AMBER_STEP) ? a.long : a.short),
  })
  const { line, squeeze } = fitSqueeze(squeeze => build(keepsAt(squeeze)), steps.length, room, kit.measure)
  return { line, keeps: keepsAt(squeeze) }
}

/** `fitLineKeeps`' line alone. */
export const fitLine = <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: Keeps<P>) => RenderElement): RenderElement =>
  fitLineKeeps(kit, order, room, build).line

/** True until the amber step: an amber reading's chart stays while this holds. */
export const beforeLast = <P extends string>(keeps: Keeps<P>): boolean => keeps.amber(AMBER_PROBE) === AMBER_PROBE.long

/** Each role's ink: text on the card ground. */
export const ROLE_INK: Readonly<Record<Role, Exclude<keyof Palette, 'filled'>>> = {
  label: 'label',
  value: 'value',
  amber: 'amberFg',
  accent5: 'fiveText',
  accent7: 'weekText',
}

/** A phrase in its roles' colours, one line, cut rather than wrapped. */
export const words = (kit: Kit, key: string, say: Say, bold = false): RenderElement => {
  const { Text, palette, oneLine } = kit
  return oneLine(
    { key, bold },
    say.map(([text, role], i) => (
      <Text key={String(i)} color={palette[ROLE_INK[role]]}>
        {text}
      </Text>
    )),
  )
}

/** A reset after its reading: the separator in label ink, then `↻` and
 *  when, in `ink`. `↻` is a glyph on every surface, as the boards draw it,
 *  never the clock icon; elsewhere it is the reset icon's own glyph. */
export const resetClause = (kit: Kit, ink: string, when: string, separator = ' │ '): RenderElement[] => {
  const { Text, palette } = kit
  return [
    <Text key="d" color={palette.label}>
      {separator}
    </Text>,
    <Text key="i-reset" color={ink}>{`${GLYPH.reset} `}</Text>,
    <Text key="r" color={ink}>
      {when}
    </Text>,
  ]
}

/** A limit's accent: its window's, or the meter's for any other. */
export const accentOf = (kit: Kit, limit: Readonly<{ key: LimitKey }>): string =>
  limit.key === '5h' ? kit.palette.fiveAccent : limit.key === '7d' ? kit.palette.weekAccent : kit.palette.meterFill
