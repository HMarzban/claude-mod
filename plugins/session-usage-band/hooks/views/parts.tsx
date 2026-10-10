// The pieces several views draw: the pill a chip sits in; the cache's
// battery, an icon on the desktop and the pill itself in a terminal; the
// cache pill the new views share; and the lines, sections and grid every new
// view is laid out with.

import type { RenderChildren, RenderElement } from 'claude-code'
import { clamp01 } from '../format'
import { asciiText } from '../glyphs'
import type { Kit } from '../kit'
import { ROW_SLACK, isDrawn, keepsIn, squeezeToFit } from '../layout'
import type { Palette } from '../palette'
import type { LimitKey, LimitView, Readings, Tone } from '../reading'
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

/** The desktop's battery: an outline, its cap, and the charge filling it. */
export const batteryIcon = (kit: Kit, charge: number, tone: Tone, alt: string): RenderChildren => {
  const { Svg, palette, onTone } = kit
  if (!Svg) return null
  const outline = onTone(tone, palette.label)
  const fill = onTone(tone, palette.warm)
  const width = Math.round(clamp01(charge) * 15 * 10) / 10
  const source =
    '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="12" viewBox="0 0 22 12">' +
    `<rect x="0.75" y="0.75" width="18.5" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
    `<rect x="19.75" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
    `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>` +
    '</svg>'
  return <Svg key="battery" source={source} alt={alt} width={22} height={12} />
}

/** On a text surface the battery is the pill itself: its charge painted as
 *  the background of the leading characters, draining right to left. `text`
 *  arrives in the glyphs it is drawn in, so the cut falls where it shows. */
export const textBattery = (kit: Kit, charge: number, tone: Tone, text: string): RenderChildren[] => {
  const { Text, palette, onTone } = kit
  const chars = [...` ${text} `]
  const cut = Math.round(clamp01(charge) * chars.length)
  const fg = onTone(tone, palette.value)
  return [
    cut > 0 ? (
      <Text key="bf" color={fg} backgroundColor={onTone(tone, palette.batteryFill, palette.batteryAmber)}>
        {chars.slice(0, cut).join('')}
      </Text>
    ) : null,
    cut < chars.length ? (
      <Text key="be" color={fg} backgroundColor={onTone(tone, palette.surface, palette.amberBg)}>
        {chars.slice(cut).join('')}
      </Text>
    ) : null,
  ]
}

/** The cache as a pill for a new view (pulse, week): chips' battery and
 *  ground, the readings' words, and no hover card; amber, its reason. */
export const layoutCachePill = (kit: Kit, read: Readings, short: boolean): RenderElement => {
  const { Text, Svg, palette, onTone } = kit
  const c = read.cache
  const text = c.amber !== undefined ? (short ? c.amber.short : c.amber.long) : short ? c.textShort : c.text
  const fg = onTone(c.tone, palette.value)
  // The ascii text is mapped before the battery's cut, as chips maps its own on a terminal.
  const body = Svg
    ? [batteryIcon(kit, c.charge, c.tone, c.alt), <Text key="c" color={fg}>{` ${text}`}</Text>]
    : palette.filled
      ? textBattery(kit, c.charge, c.tone, read.frame.glyphs === 'ascii' ? asciiText(text) : text)
      : [<Text key="c" color={fg}>{text}</Text>]
  return pill(kit, { key: 'cache', tone: c.tone, body, paintsOwnBg: !Svg && palette.filled })
}

// ---- what every new view draws its lines and sections with ------------------

/** What a line's build may ask at its squeeze. */
export type Keeps<P extends string> = Readonly<{
  /** Whether a calm, optional piece is still kept. */
  has: (p: P) => boolean
  /** Whether a piece of this tone is kept: an amber one always is. */
  calm: (p: P, tone: Tone) => boolean
  /** An amber reading's words: long until the last step, then short. */
  amber: (a: Amber) => string
}>

/** The step `fitLine` appends to every order: amber turns short. */
const AMBER_STEP = 'amberShort'
/** Asks a `Keeps` which of an amber reading's forms it would pick. */
const AMBER_PROBE: Amber = { long: 'long', short: 'short' }

/** Columns a collapsed line may take: the row's, less the slack and the panel's padding. */
export const lineRoom = (kit: Kit): number => kit.columns - ROW_SLACK - 2

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
 *  fits. The amber step is always last, so amber shortens only once every
 *  calm piece has gone. */
export const fitLine = <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: Keeps<P>) => RenderElement): RenderElement => {
  const steps: ReadonlyArray<P | typeof AMBER_STEP> = [...order, AMBER_STEP]
  const at = keepsIn(steps)
  return squeezeToFit(
    squeeze =>
      build({
        has: p => at(squeeze, p),
        calm: (p, tone) => tone === 'amber' || at(squeeze, p),
        amber: a => (at(squeeze, AMBER_STEP) ? a.long : a.short),
      }),
    steps.length,
    room,
    kit.measure,
  )
}

/** True until the amber step: an amber reading's chart stays while this holds. */
export const beforeLast = <P extends string>(keeps: Keeps<P>): boolean => keeps.amber(AMBER_PROBE) === AMBER_PROBE.long

/** An amber reading's reason, long until every calm piece has gone. */
export const amberSay = <P extends string>(amber: Amber, keeps: Keeps<P>): Say => [[keeps.amber(amber), 'amber']]

/** The same reason as its own words. */
export const amberWords = <P extends string>(kit: Kit, key: string, amber: Amber, keeps: Keeps<P>): RenderElement =>
  words(kit, key, amberSay(amber, keeps))

/** What needs you first: the amber items, then the calm, each in its order. */
export const amberFirst = <T extends Readonly<{ amber: Amber | undefined }>>(items: readonly T[]): T[] => [
  ...items.filter(i => i.amber !== undefined),
  ...items.filter(i => i.amber === undefined),
]

/** Lays `glyph` between a line's pieces; the separators, up to `most`, are
 *  built once, before the squeeze. */
export const separatedBy = (kit: Kit, glyph: string, most: number): ((pieces: readonly RenderElement[]) => RenderChildren[]) => {
  const seps = Array.from({ length: most }, (_, i) => words(kit, `sep${i + 1}`, [[glyph, 'label']]))
  return pieces => pieces.flatMap((p, i) => (i === 0 ? [p] : [seps[i - 1] ?? null, p]))
}

/** A piece built the first time it is asked for, then kept. */
export const once = <T,>(build: () => T): (() => T) => {
  let built: T | undefined
  return () => (built ??= build())
}

/** Each role's ink: text on the card ground. */
export const ROLE_INK: Readonly<Record<Role, Exclude<keyof Palette, 'filled'>>> = {
  label: 'label',
  value: 'value',
  amber: 'amberFg',
  accent5: 'fiveText',
  accent7: 'weekAccent',
}

/** A phrase in its roles' colours, one Text, truncated rather than wrapped. */
export const words = (kit: Kit, key: string, say: Say, bold = false): RenderElement => {
  const { Text, palette } = kit
  return (
    <Text key={key} bold={bold} wrap="truncate-end">
      {say.map(([text, role], i) => (
        <Text key={String(i)} color={palette[ROLE_INK[role]]}>
          {text}
        </Text>
      ))}
    </Text>
  )
}

/** How a view writes a limit's sentence: what leads it while calm, its
 *  value alone (`5h 4%` in `value`) or its words (`5h` a label), which
 *  reset phrase it says, and what joins the phrases. */
export type SentenceStyle = Readonly<{ lead: 'text' | 'say'; reset: 'resetWords' | 'resetGlyph'; sep: ', ' | ' · ' }>

/** A limit as a sentence: its reason while amber, else its value; then its
 *  reset and its pace, unless the reason is a measured fill, which says it. */
export const limitSentence = (kit: Kit, l: LimitView, style: SentenceStyle): RenderElement => {
  const lead: Say = l.amber !== undefined ? [[l.amber.long, 'amber']] : style.lead === 'say' ? l.say : [[l.text, 'value']]
  const tail = [l[style.reset], l.fullIn === undefined ? l.pace : undefined].filter((t): t is string => t !== undefined && t !== '')
  return words(kit, l.name, [...lead, ...tail.map((t): Say[number] => [`${style.sep}${t}`, 'label'])])
}

/** `label value`, or nothing while the value is unknown. */
export const fact = (kit: Kit, key: string, label: string, value: string | undefined): RenderChildren =>
  value === undefined ? null : words(kit, key, [[`${label} `, 'label'], [value, 'value']])

/** A titled column: its title, then as many of its rows as `room` holds. */
export const section = (kit: Kit, key: string, title: string, rows: readonly RenderChildren[], room: number): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="column" flexGrow={1} width={0} minWidth={0}>
      {words(kit, 'title', [[title, 'label']], true)}
      {rows.filter(isDrawn).slice(0, Math.max(0, room))}
    </Box>
  )
}

/** Cells between a grid line's sections. */
const GRID_GAP = 2

/** Sections to a line: all of them from 100 columns, or until two lines each
 *  keep a row under their titles (5 rows, with the row of air); else two. */
const perLineOf = (kit: Kit, bodyRows: number, count: number): number =>
  kit.columns >= 100 || bodyRows < 5 ? count : Math.min(2, count)

/** Cells each section has across its line, `GRID_GAP` apart. */
export const sectionCells = (kit: Kit, bodyRows: number, count = 4): number => {
  const perLine = perLineOf(kit, bodyRows, count)
  return Math.floor((lineRoom(kit) - GRID_GAP * (perLine - 1)) / perLine)
}

/** Rows each section holds under its title, with a row of air between lines. */
export const gridRoom = (kit: Kit, bodyRows: number, count = 4): number => {
  const lines = Math.ceil(count / perLineOf(kit, bodyRows, count))
  return Math.max(0, Math.floor((bodyRows - (lines - 1)) / lines) - 1)
}

/** Sections laid out in lines, sharing each line's width equally. */
export const grid = (kit: Kit, sections: readonly RenderElement[], bodyRows: number): RenderElement[] => {
  const { Box } = kit
  const perLine = perLineOf(kit, bodyRows, sections.length)
  return Array.from({ length: Math.ceil(sections.length / perLine) }, (_, i) => (
    <Box key={`line${i}`} flexDirection="row" columnGap={GRID_GAP} {...(i > 0 ? { marginTop: 1 } : {})}>
      {sections.slice(i * perLine, (i + 1) * perLine)}
    </Box>
  ))
}

/** A section's rows with its charts first, when they fit; short of rows, facts win. */
export const chartsIfRoom = (room: number, charts: readonly RenderChildren[], facts: readonly RenderChildren[], chartRows = 1): RenderChildren[] => {
  const drawnCharts = charts.filter(isDrawn)
  const drawnFacts = facts.filter(isDrawn)
  return drawnCharts.length * chartRows + drawnFacts.length <= room ? [...drawnCharts, ...drawnFacts] : drawnFacts
}

/** A limit's accent: its window's, or the meter's for any other. */
export const accentOf = (kit: Kit, limit: Readonly<{ key: LimitKey }>): string =>
  limit.key === '5h' ? kit.palette.fiveAccent : limit.key === '7d' ? kit.palette.weekAccent : kit.palette.meterFill
