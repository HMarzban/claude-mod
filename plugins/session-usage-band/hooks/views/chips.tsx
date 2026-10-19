// Chips: a row of pills, and its four cards beneath it when open. Its pill
// builders, their hover strings, LIMITS and its row are exported for its
// tests; pulse and departures draw their own look. They draw from the
// readings' words; only the context's pill and hover read raw facts
// (`read.chips.raw`). The pill a chip sits in and the cache's battery, an
// icon on the desktop and the pill itself in a terminal, are drawn here
// alone.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import { clamp01, fmtTokens, severityMark } from '../format'
import { asciiText } from '../glyphs'
import { GLYPH } from '../icons'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { GIVES_WAY, ROW_SLACK, SHORT_BELOW, cellsOf, keeps, spansOf, squeezeToFit } from '../layout'
import type { Piece } from '../layout'
import type { Palette } from '../palette'
import type { LimitKey, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { cardsView } from './cards'
import { toggleButton } from './frame'
import type { View } from './view'

// ---- the pill and the battery ----------------------------------------------

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

// ---- limits ---------------------------------------------------------------

type ChipKey = Exclude<LimitKey, 'other'>
type Tint = Readonly<{ bg: string; fg: string; accent: string }>
type LimitSpec = Readonly<{
  icon: Icon
  title: string
  calm: Piece
  reset: Piece
  amberReset: Piece
  tint: (p: Readonly<Palette>) => Tint
}>

/** The two limit chips: one shape, their own tint and steps. A layout's
 *  own limit pills take their icon and tint from here. */
export const LIMITS: Readonly<Record<ChipKey, LimitSpec>> = {
  '5h': {
    icon: 'five',
    title: '5-hour limit',
    calm: 'calmFive',
    reset: 'fiveReset',
    amberReset: 'amberFiveReset',
    tint: p => ({ bg: p.fiveBg, fg: p.fiveFg, accent: p.fiveAccent }),
  },
  '7d': {
    icon: 'week',
    title: 'Weekly limit',
    calm: 'calmWeek',
    reset: 'weekReset',
    amberReset: 'amberWeekReset',
    tint: p => ({ bg: p.weekBg, fg: p.weekFg, accent: p.weekAccent }),
  },
}

// ---- the pills --------------------------------------------------------------

/** Whether the row says the cache and context short at `squeeze`: always
 *  below `SHORT_BELOW` columns. */
const shortAt = (kit: Kit, squeeze: number): boolean => kit.columns < SHORT_BELOW || !keeps(squeeze, 'shortWording')

/** The cache pill: a draining battery and its countdown, or its mood. A
 *  layout that bolds each reading's figure asks for the countdown `bold`;
 *  chips' own draws it plain. */
export const cachePill = (kit: Kit, read: Readings, short: boolean, bold = false): PillSpec => {
  const { Text, Svg, palette, onTone } = kit
  const { mood, tone, charge } = read.cache
  const { copy } = read.chips.reading
  const text = copy.pill(short)
  const figure = bold && copy.figure !== undefined && text.endsWith(copy.figure) ? copy.figure : ''
  const fg = onTone(tone, palette.value)
  /** The text, its figure bold when asked: `cache ` then `52m`. */
  const words = (key: string, said: string): RenderElement[] =>
    figure === ''
      ? [<Text key={key} color={fg}>{said}</Text>]
      : [
          <Text key={key} color={fg}>
            {said.slice(0, said.length - figure.length)}
          </Text>,
          <Text key={`${key}-fig`} color={fg} bold>
            {figure}
          </Text>,
        ]
  if (Svg) {
    // A normal rounded pill led by a draining battery icon; the text-surface
    // battery would paint a square-cornered block here.
    return { key: 'cache', tone, body: [batteryIcon(kit, charge, tone, copy.alt), ...words('c', ` ${text}`)], hover: read.chips.reading.copy.hover }
  }
  if (palette.filled) {
    return {
      key: 'cache',
      tone,
      body: textBattery(kit, charge, tone, [[`◷ ${text.slice(0, text.length - figure.length)}`, false], [figure, true]]),
      hover: read.chips.reading.copy.hover,
      paintsOwnBg: true,
    }
  }
  const dot = mood === 'warm' || mood === 'expiring' ? palette.warm : palette.cold
  return {
    key: 'cache',
    tone,
    body: [tone === 'amber' ? null : <Text key="dot" color={dot}>{'● '}</Text>, ...words('c', tone === 'amber' ? `◷ ${text}` : text)],
    hover: read.chips.reading.copy.hover,
  }
}

/** The session's cost; its card names the last message's. */
const costPill = (kit: Kit, read: Readings): PillSpec => {
  const { Text, palette, icon } = kit
  const { totalText, lastText } = read.spend
  return {
    key: 'cost',
    tone: 'calm',
    body: [...icon('cost', palette.coin), <Text key="v" color={palette.value} bold>{totalText}</Text>],
    hover: lastText === undefined ? `${totalText} so far this session` : `${lastText} spent during your last message, subagents included`,
  }
}

/** The session's tokens; its card splits them by kind. */
const tokensPill = (kit: Kit, read: Readings): PillSpec => {
  const { Text, palette, icon } = kit
  return {
    key: 'tokens',
    tone: 'calm',
    body: [...icon('tokens', palette.label), <Text key="v" color={palette.value}>{read.spend.tokensText}</Text>],
    hover: read.chips.reading.tokenBreakdown,
  }
}

/** The context pill's hover card: how much of the window is used, and where it compacts. */
const contextHover = (read: Readings): string => {
  const ctx = read.chips.raw.context
  const { pct, toCompact } = read.context
  return ctx.compactAt === undefined || toCompact === undefined
    ? `${fmtTokens(read.context.used)} of ${fmtTokens(ctx.window)} (${pct}); older turns get summarized near full`
    : `${fmtTokens(read.context.used)} of ${fmtTokens(ctx.compactAt)} (${pct}); auto-compacts in ~${fmtTokens(toCompact)}`
}

/** The context's fill on a meter, counting down to compaction once near it. */
const contextPill = (kit: Kit, read: Readings, squeeze: number): PillSpec => {
  const { Text, palette, onTone, gap, icon } = kit
  const ctx = read.chips.raw.context
  const { frac, pct, toCompact, nearCompact, tone } = read.context
  const amount =
    ctx.compactAt !== undefined
      ? keeps(squeeze, 'shortWording')
        ? `${pct} full`
        : pct
      : !keeps(squeeze, 'shortWording') || ctx.tokens === undefined
        ? pct
        : `${fmtTokens(ctx.tokens)} / ${fmtTokens(ctx.window)}`
  const mark = ctx.compactAt === undefined ? severityMark(frac) : ''
  const countdown = nearCompact && toCompact !== undefined ? ` · compacts in ~${fmtTokens(toCompact)}` : ''
  return {
    key: 'ctx',
    tone,
    body: [
      ...icon('context', onTone(tone, palette.label)),
      ...(keeps(squeeze, 'contextMeter') ? [meter(kit, { label: 'context', frac, tone, accent: palette.meterFill }), gap('g-bar')] : []),
      <Text key="v" color={onTone(tone, palette.value)}>
        {`${amount}${mark}${countdown}`}
      </Text>,
    ],
    hover: contextHover(read),
  }
}

/** A limit chip's hover card: once passed, that it has reset; else its
 *  reset first, the fact the chip had, so a short row's cut only takes the
 *  description. Undefined while the engine reports no such window. */
const limitHover = (read: Readings, key: ChipKey): string | undefined => {
  const w = key === '5h' ? read.fiveHour : read.sevenDay
  if (w === undefined) return undefined
  const { title } = LIMITS[key]
  const r = w.reset
  if (r?.kind === 'passed') return `${title} has reset; it updates after your next message`
  return r === undefined ? `Your ${title.toLowerCase()}, across all your Claude use` : `Resets in ${r.text}; ${title.toLowerCase()}, all your Claude use`
}

/** A limit chip: its usage on a bar and the reset; a pace that fills it
 *  early speaks in words. A window whose reset has passed shows as reset:
 *  its last reading is from before it. Undefined while the engine reports
 *  no such window. A layout's `mark`, such as a trail, takes the bar's place. */
export const limitPill = (kit: Kit, read: Readings, key: ChipKey, squeeze: number, short: boolean, mark?: RenderChildren): PillSpec | undefined => {
  const { Text, palette, onTone, gap, icon } = kit
  const w = key === '5h' ? read.fiveHour : read.sevenDay
  if (w === undefined) return undefined
  const spec = LIMITS[key]
  const tint = spec.tint(palette)
  const { reset: r, frac, tone } = w
  if (r?.kind === 'passed') {
    return {
      key,
      tone: 'calm',
      bg: tint.bg,
      body: [...icon(spec.icon, tint.accent), <Text key="l" color={tint.fg}>{`${key} reset`}</Text>],
      hover: limitHover(read, key),
    }
  }
  const pace = w.fullIn === undefined ? '' : ` ${short ? w.fullIn : w.pace}`
  const fg = onTone(tone, tint.fg)
  const accent = onTone(tone, tint.accent)
  const bar = keeps(squeeze, 'limitBars') ? [gap('g-bar'), mark ?? meter(kit, { label: key, frac, tone, accent: tint.accent })] : []
  // The reset is a qualifier: in label ink, its figure the usage before it.
  const resetInk = onTone(tone, palette.label)
  const reset = r !== undefined && keeps(squeeze, tone === 'amber' ? spec.amberReset : spec.reset) ? resetClause(kit, resetInk, r.text) : []
  return {
    key,
    tone,
    bg: tint.bg,
    body: [
      ...icon(spec.icon, accent),
      <Text key="l" color={fg}>
        {key}
      </Text>,
      ...bar,
      <Text key="v" color={fg} bold>
        {` ${w.value}${severityMark(frac)}`}
      </Text>,
      pace === '' ? null : <Text key="p" color={fg}>{pace}</Text>,
      ...reset,
    ],
    hover: limitHover(read, key),
  }
}

/** Chips' pills at a squeeze, in its order, the tokens last: the calm ones
 *  give way by `GIVES_WAY`, the tokens first, and an amber one holds out. */
export const chipsPills = (kit: Kit, read: Readings, squeeze: number): PillSpec[] => {
  const short = shortAt(kit, squeeze)
  const calm = (tone: 'calm' | 'amber', piece: Piece) => tone === 'amber' || keeps(squeeze, piece)
  const five = read.fiveHour && calm(read.fiveHour.tone, LIMITS['5h'].calm) ? limitPill(kit, read, '5h', squeeze, short) : undefined
  const seven = read.sevenDay && calm(read.sevenDay.tone, LIMITS['7d'].calm) ? limitPill(kit, read, '7d', squeeze, short) : undefined
  return [
    cachePill(kit, read, short),
    costPill(kit, read),
    ...(read.context.known && calm(read.context.tone, 'calmContext') ? [contextPill(kit, read, squeeze)] : []),
    ...(five === undefined ? [] : [five]),
    ...(seven === undefined ? [] : [seven]),
    ...(read.cache.measured && keeps(squeeze, 'tokens') ? [tokensPill(kit, read)] : []),
  ]
}

/** Pills in a row, each revealing its card, then air and the toggle. A card
 *  ends short of ▵ and the gap before it, and covers whole pills. */
export const pillRow = (kit: Kit, read: Readings, act: BandActions, specs: readonly PillSpec[]): RenderElement => {
  const { Box, measure, asDrawn, hoverCard } = kit
  const pills = specs.map(spec => pill(kit, spec))
  const toggle = toggleButton(kit, read, act)
  const room = kit.columns - cellsOf(toggle, measure) - 1
  const pieces = spansOf(pills.map(asDrawn), 1, measure)
  return (
    <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
      {pills}
      <Box flexGrow={1} />
      {specs.map(({ key, hover }, i) => (hover === undefined ? null : hoverCard(key, hover, { left: pieces[i]?.[0] ?? 0, room, pieces })))}
      {toggle}
    </Box>
  )
}

/** Chips' one row, squeezed until it fits. */
const chipsRow = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  squeezeToFit(squeeze => pillRow(kit, read, act, chipsPills(kit, read, squeeze)), GIVES_WAY.length, kit.columns - ROW_SLACK, kit.measure)

export const chipsView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => cardsView(kit, read, act, [chipsRow(kit, read, act)], { collapsedRows: 1 }),
}
