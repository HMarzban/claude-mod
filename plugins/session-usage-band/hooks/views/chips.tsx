// Chips: a row of pills, and the shared cards beneath it when open. Its pill
// builders, their hover strings, LIMITS and its row are exported, so a layout
// composes chips' pills, tints and icons rather than drawing its own. They
// draw from the readings' words; only the context's pill and hover read
// raw facts (`read.chips.raw`).

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import { fmtTokens, severityMark } from '../format'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import { GIVES_WAY, ROW_SLACK, SHORT_BELOW, cellsOf, keeps, spansOf, squeezeToFit } from '../layout'
import type { Piece } from '../layout'
import type { Palette } from '../palette'
import type { LimitKey, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { toggleButton } from './frame'
import { batteryIcon, cacheHover, pill, resetClause, textBattery } from './parts'
import type { PillSpec } from './parts'
import { defineCardsView } from './view'

// ---- limits ---------------------------------------------------------------

export type ChipKey = Exclude<LimitKey, 'other'>
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
export const shortAt = (kit: Kit, squeeze: number): boolean => kit.columns < SHORT_BELOW || !keeps(squeeze, 'shortWording')

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
    return { key: 'cache', tone, body: [batteryIcon(kit, charge, tone, copy.alt), ...words('c', ` ${text}`)], hover: cacheHover(read) }
  }
  if (palette.filled) {
    return {
      key: 'cache',
      tone,
      body: textBattery(kit, charge, tone, [[`◷ ${text.slice(0, text.length - figure.length)}`, false], [figure, true]]),
      hover: cacheHover(read),
      paintsOwnBg: true,
    }
  }
  const dot = mood === 'warm' || mood === 'expiring' ? palette.warm : palette.cold
  return {
    key: 'cache',
    tone,
    body: [tone === 'amber' ? null : <Text key="dot" color={dot}>{'● '}</Text>, ...words('c', tone === 'amber' ? `◷ ${text}` : text)],
    hover: cacheHover(read),
  }
}

/** The session's cost; its card names the last message's. */
export const costPill = (kit: Kit, read: Readings): PillSpec => {
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
export const tokensPill = (kit: Kit, read: Readings): PillSpec => {
  const { Text, palette, icon } = kit
  return {
    key: 'tokens',
    tone: 'calm',
    body: [...icon('tokens', palette.label), <Text key="v" color={palette.value}>{read.spend.tokensText}</Text>],
    hover: read.chips.reading.tokenBreakdown,
  }
}

/** The context pill's hover card: how much of the window is used, and where it compacts. */
export const contextHover = (read: Readings): string => {
  const ctx = read.chips.raw.context
  const { pct, toCompact } = read.context
  return ctx.compactAt === undefined || toCompact === undefined
    ? `${fmtTokens(read.context.used)} of ${fmtTokens(ctx.window)} (${pct}); older turns get summarized near full`
    : `${fmtTokens(read.context.used)} of ${fmtTokens(ctx.compactAt)} (${pct}); auto-compacts in ~${fmtTokens(toCompact)}`
}

/** The context's fill on a meter, counting down to compaction once near it. */
export const contextPill = (kit: Kit, read: Readings, squeeze: number): PillSpec => {
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
export const limitHover = (read: Readings, key: ChipKey): string | undefined => {
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

export const chipsView = defineCardsView({ desktop: 1, terminal: 1 }, (kit, read, act) => ({ lines: [chipsRow(kit, read, act)] }))
