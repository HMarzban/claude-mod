// The band, drawn: a pure function of the snapshot register.tsx reads.
// It never sees `$`, so everything it shows arrives in the snapshot.

import type { ElementTable, RenderChildren, RenderElement, RenderSurface } from 'claude-code'
import { SOON_MS, TTL_MS } from './cache'
import type { Ttl } from './cache'
import {
  COMPACT_NEAR,
  WARN_AT,
  clamp01,
  fmtCost,
  fmtCountdown,
  fmtEstimate,
  fmtEta,
  fmtSmallCost,
  fmtTokens,
  resetIn,
  severityMark,
} from './format'
import type { Palette } from './palette'

export type LimitReading = Readonly<{ percentUsed: number; resetsAt: string | undefined }>

/** Everything the band shows, read by register.tsx. */
export type BandSnapshot = Readonly<{
  surface: RenderSurface
  columns: number
  /** Rows the band may take before it scrolls. */
  maxRows: number
  isWorking: boolean
  expanded: boolean
  palette: Readonly<Palette>
  now: number
  cache: Readonly<{
    requests: number
    msLeft: number
    ttl: Ttl
    ttlPinned: boolean
    window: number
    hitRatio: number | null
    misses: number
    reWarmUsd: number | null
    /** What reading from the cache saved against full input price. */
    savedUsd: number | null
    /** The conversation is known to start here; else, before its first
     *  reply, the band has not measured the cache yet. */
    fresh: boolean
    /** Every token since the conversation began, subagents included. */
    tokens: Readonly<{ sent: number; back: number; cached: number }>
  }>
  costUsd: number
  lastTurnUsd: number | null
  context: Readonly<{
    tokens: number | undefined
    window: number
    percent: number | undefined
    /** Where auto-compaction runs, when it is on. */
    compactAt: number | undefined
  }>
  fiveHour: (LimitReading & { etaMs: number | null }) | undefined
  sevenDay: LimitReading | undefined
  /** Any other window the engine reports, such as a gateway's spend_limit. */
  otherLimits: ReadonlyArray<LimitReading & { kind: string }>
}>

export type BandActions = Readonly<{
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}>

// ---- layout ---------------------------------------------------------------

/** What the row gives up as it narrows, least important first. The row is
 *  measured after each step; an amber piece holds out until the end. */
const GIVES_WAY = [
  'tokens',
  'weekReset',
  'fiveReset',
  'contextMeter',
  'calmWeek',
  'limitBars',
  'shortWording',
  'calmContext',
  'calmFive',
  'amberWeekReset',
  'amberFiveReset',
] as const
type Piece = (typeof GIVES_WAY)[number]

/** Whether the row, squeezed `squeeze` steps, still keeps `piece`. */
const keeps = (squeeze: number, piece: Piece): boolean => squeeze <= GIVES_WAY.indexOf(piece)

/** Below this, the cache and context wording turns short whatever the squeeze. */
const SHORT_BELOW = 68
const METER_CELLS = 6
const METER_PX = 44
const ICON_PX = 16
/** The longest line a card holds unwrapped, in characters:
 *  `resets 2d 19h · full before reset`. */
const CARD_TEXT = 33
/** Room the band keeps free, so a row measured a little short never wraps. */
const ROW_SLACK = 4

/** A bar's length: px on desktop, cells elsewhere. */
type BarSize = Readonly<{ px: number; cells: number }>
const CHIP_BAR: BarSize = { px: METER_PX, cells: METER_CELLS }

/** How a surface lays text out against its bodyColumns: the terminal one cell
 *  a character; the desktop's proportional font runs about three quarters of
 *  a column, at roughly 10px a column. */
type Measure = Readonly<{ text: number; pxPerCell: number }>
const TERMINAL: Measure = { text: 1, pxPerCell: 8 }
const DESKTOP: Measure = { text: 0.75, pxPerCell: 10 }

const isList = (n: RenderChildren): n is readonly RenderChildren[] => Array.isArray(n)

/** Columns a drawn tree takes: text, padding, gaps and Button labels. Hidden
 *  cards take none; an Svg takes its width in columns, rounded up. */
const cellsOf = (n: RenderChildren, m: Measure): number => {
  if (n === null || n === undefined || typeof n === 'boolean') return 0
  if (typeof n === 'string' || typeof n === 'number') return [...String(n)].length * m.text
  if (isList(n)) return n.reduce((sum: number, k: RenderChildren) => sum + cellsOf(k, m), 0)
  switch (n.type) {
    case 'Button':
      return [...(n.props.label ?? '')].length * m.text
    case 'Svg':
      return Math.ceil((n.props.width ?? 64) / m.pxPerCell)
    case 'Box':
    case 'Text': {
      if (n.props?.position === 'absolute') return 0
      if (n.type === 'Box' && typeof n.props?.width === 'number') return n.props.width
      const kids = (n.children ?? []).filter(k => k !== null && k !== undefined)
      const pad = typeof n.props?.paddingX === 'number' ? 2 * n.props.paddingX : 0
      const gap = typeof n.props?.columnGap === 'number' ? n.props.columnGap * Math.max(0, kids.length - 1) : 0
      return kids.reduce((sum: number, k) => sum + cellsOf(k, m), 0) + pad + gap
    }
    default:
      return 0
  }
}

// ---- icons ----------------------------------------------------------------

type Icon = 'cost' | 'tokens' | 'context' | 'five' | 'week' | 'reset'

/** Desktop icons, as SVG bodies drawn in one colour. */
const ICON_PATHS: Readonly<Record<Icon, (color: string) => string>> = {
  cost: color =>
    `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M9.6 5.6c-.4-.5-1-.8-1.7-.8-1 0-1.7.6-1.7 1.3 0 1.7 3.6 1 3.6 2.9 0 .8-.8 1.4-1.9 1.4-.8 0-1.5-.3-1.9-.9M8 3.9v1M8 10.4v1.4" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
  tokens: color =>
    `<rect x="2.5" y="3" width="11" height="2.4" rx="1.2" fill="${color}"/>` +
    `<rect x="2.5" y="6.8" width="11" height="2.4" rx="1.2" fill="${color}" opacity=".75"/>` +
    `<rect x="2.5" y="10.6" width="11" height="2.4" rx="1.2" fill="${color}" opacity=".5"/>`,
  context: color =>
    `<rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M5.2 6h5.6M5.2 8.5h5.6M5.2 11h3.2" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
  five: color =>
    `<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<path d="M8 11.5l2.6-3.4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  week: color =>
    `<rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  reset: color =>
    `<circle cx="8" cy="8" r="5.6" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M8 5v3l2 1.4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
}

/** What stands in for an icon where there is no Svg; the cost keeps its `$`. */
const GLYPH: Readonly<Record<Icon, string>> = { cost: '', tokens: 'Σ', context: '◔', five: '', week: '', reset: '↻' }

/** An icon's name for a reader that cannot see it. */
const ALT: Readonly<Record<Icon, string>> = {
  cost: 'cost',
  tokens: 'tokens',
  context: 'context',
  five: 'five-hour',
  week: 'week',
  reset: 'resets',
}

// ---- limits ---------------------------------------------------------------

type LimitKey = '5h' | '7d'
type Tint = Readonly<{ bg: string; fg: string; accent: string }>
type LimitSpec = Readonly<{
  icon: Icon
  windowMs: number
  title: string
  calm: Piece
  reset: Piece
  amberReset: Piece
  tint: (p: Readonly<Palette>) => Tint
}>

/** The two limit chips: one shape, their own window, tint and steps. */
const LIMITS: Readonly<Record<LimitKey, LimitSpec>> = {
  '5h': {
    icon: 'five',
    windowMs: 5 * 3600_000,
    title: '5-hour limit',
    calm: 'calmFive',
    reset: 'fiveReset',
    amberReset: 'amberFiveReset',
    tint: p => ({ bg: p.fiveBg, fg: p.fiveFg, accent: p.fiveAccent }),
  },
  '7d': {
    icon: 'week',
    windowMs: 7 * 24 * 3600_000,
    title: 'Weekly limit',
    calm: 'calmWeek',
    reset: 'weekReset',
    amberReset: 'amberWeekReset',
    tint: p => ({ bg: p.weekBg, fg: p.weekFg, accent: p.weekAccent }),
  },
}

// ---- the cache ------------------------------------------------------------

/** Unmeasured: loaded mid-conversation, before its next reply. */
type CacheMood = 'unmeasured' | 'warming' | 'warm' | 'expiring' | 'cold'

const cacheMood = (c: BandSnapshot['cache']): CacheMood =>
  c.requests === 0
    ? c.fresh
      ? 'warming'
      : 'unmeasured'
    : c.msLeft <= 0
      ? 'cold'
      : c.msLeft <= SOON_MS
        ? 'expiring'
        : 'warm'

// ---- drawing --------------------------------------------------------------

type Tone = 'calm' | 'amber'

type PillSpec = Readonly<{
  key: string
  tone: Tone
  body: RenderChildren[]
  card: string
  /** The terminal battery paints its own background in its Texts. */
  paintsOwnBg?: boolean
  bg?: string
}>

export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions): RenderElement => {
  const { Box, Button, Text } = el
  const palette = snap.palette
  const c = snap.cache
  // Svg draws on the desktop alone (other surfaces hold the element but drop
  // it), and its markup takes hex: theme keys can't reach inside it, so plain
  // appearance keeps text.
  const Svg = snap.surface === 'desktop' && palette.filled && 'Svg' in el ? el.Svg : undefined
  const onTone = (tone: Tone, calm: string, amber: string = palette.amberFg) => (tone === 'amber' ? amber : calm)

  // A pill carries its own foreground and background, never one of each. Its
  // card is a child, so the engine counts the pointer on the card as on the
  // pill and reading it keeps the pill hovered. The card has no key: a keyed
  // Box is its own hover scope, and a hidden one could never be hovered. One
  // line, since a collapsed band is one row. Plain has no background to cover
  // the row with, so no cards; the expanded line says it all. A pill never
  // shrinks: the squeeze drops pieces instead, so its text never wraps.
  const pill = ({ key, tone, body, card, paintsOwnBg, bg }: PillSpec, anchor: 'left' | 'right') => {
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
      <Box key={key} flexShrink={0} {...fill}>
        {body}
        <Box
          position="absolute"
          top={0}
          {...(anchor === 'left' ? { left: 0 } : { right: 0 })}
          width={Math.min(card.length + 2, snap.columns)}
          display="none"
          hover={{ display: 'flex' }}
          backgroundColor={palette.tooltipBg}
          paddingX={1}
        >
          <Text color={palette.value} wrap="truncate-end">
            {card}
          </Text>
        </Box>
      </Box>
    )
  }

  /** A column of air. The desktop drops a string child that is only spaces,
   *  so there the gap is an empty Box; a text surface keeps its space. */
  const gap = (key: string): RenderChildren => (Svg ? <Box key={key} width={1} flexShrink={0} /> : ' ')

  /** An icon and the gap after it: an Svg on desktop, a glyph elsewhere. */
  const icon = (name: Icon, color: string): RenderChildren[] => {
    if (Svg) {
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 16 16">${ICON_PATHS[name](color)}</svg>`
      return [<Svg key={`i-${name}`} source={source} alt={ALT[name]} width={ICON_PX} height={ICON_PX} />, gap(`g-${name}`)]
    }
    return GLYPH[name] ? [<Text key={`i-${name}`} color={color}>{`${GLYPH[name]} `}</Text>] : []
  }

  /** A bar: `frac` filled, with a thumb where the fill ends, so the eye finds
   *  the number's place on it at once. `label` names it for a reader. A stretched bar has no width of its
   *  own: drawn wider than any slot, the slot caps it, so it spans its card. */
  const meter = (label: string, frac: number, tone: Tone, accent: string, size: BarSize = CHIP_BAR, stretch = false) => {
    const fill = onTone(tone, accent)
    if (Svg) {
      // Never name a local `h`: JSX compiles to the global h().
      const tall = 8
      // Twice the estimate, so the slot always caps it; corners in kind, so
      // they round true at the scale it lands on.
      const k = stretch ? 2 : 1
      const width = size.px * k
      // A sliver under 6px reads as a dot or nothing: any use shows as a nub.
      // No clipPath: ids are document-wide where Svgs share a page, so a
      // rounded fill draws its own ends.
      const fillWidth = frac > 0 ? Math.max(6 * k, Math.round(clamp01(frac) * width)) : 0
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}"${stretch ? ' preserveAspectRatio="none"' : ''}>` +
        `<rect x="${0.5 * k}" y="1.5" width="${width - k}" height="5" rx="${2.5 * k}" ry="2.5" fill="${palette.meterTrack}" stroke="${palette.trackStroke}"${stretch ? ' vector-effect="non-scaling-stroke"' : ''}/>` +
        (fillWidth > 0
          ? `<rect class="fill" y="1" width="${fillWidth}" height="6" rx="${3 * k}" ry="3" fill="${fill}"/>` +
            `<rect class="thumb" x="${Math.min(width - 2 * k, fillWidth - k)}" y="0" width="${2 * k}" height="${tall}" rx="${k}" ry="1" fill="${palette.value}"/>`
          : '') +
        '</svg>'
      const alt = `${label} ${Math.round(clamp01(frac) * 100)}% used`
      return stretch ? (
        <Svg key="meter" source={source} alt={alt} height={tall} />
      ) : (
        <Svg key="meter" source={source} alt={alt} width={width} height={tall} />
      )
    }
    // Two glyphs only: partial blocks jitter across fonts and read as noise to
    // a screen reader. The number beside a meter carries the value.
    const filled = Math.round(clamp01(frac) * size.cells)
    return (
      <Text key="meter" color={fill}>
        {'█'.repeat(filled)}
        {filled < size.cells ? <Text key="track" color={palette.meterTrack}>{'░'.repeat(size.cells - filled)}</Text> : null}
      </Text>
    )
  }

  // ---- what the pills say, whatever the squeeze ----------------------------
  const mood = cacheMood(c)
  const estimate = c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const cacheCard =
    mood === 'unmeasured'
      ? "Not measured since the band loaded; the countdown starts with Claude's next reply"
      : mood === 'warming'
        ? 'Your first message builds the cache; after that it bills input at 10%'
        : mood === 'cold'
          ? `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`
          : `Warm cache bills input at 10%; expires ${c.ttl} after a reply`
  const cacheTone: Tone = mood === 'expiring' ? 'amber' : 'calm'
  // The battery's charge is the share of the TTL left; full while Claude works.
  const charge = mood === 'unmeasured' || mood === 'warming' || mood === 'cold' ? 0 : mood === 'warm' && snap.isWorking ? 1 : c.msLeft / TTL_MS[c.ttl]
  const cacheText = (short: boolean): string => {
    switch (mood) {
      case 'unmeasured':
        return 'cache –'
      case 'warming':
        return 'cache warming'
      case 'expiring':
        return short ? `${fmtCountdown(c.msLeft)} ${estimate}` : `${fmtCountdown(c.msLeft)} left · re-warm ${estimate}`
      case 'cold':
        // Cold is a price, not an error: neutral, no hue, no alarm.
        return short ? `cold ${estimate}` : `cache cold · next message ${estimate}`
      case 'warm':
        // Mid-turn every step restarts the TTL, so a countdown would only bounce.
        return snap.isWorking ? 'cache warm' : `cache ${fmtCountdown(c.msLeft)}`
    }
  }

  const tokenBreakdown = `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`
  const tokenTotal = c.tokens.sent + c.tokens.back + c.tokens.cached

  const ctx = snap.context
  const hasContext = ctx.percent !== undefined || ctx.tokens !== undefined
  const ctxUsed = ctx.tokens ?? ((ctx.percent ?? 0) / 100) * ctx.window
  // Compaction is where the room runs out, so with it known the bar measures
  // toward it: full means compacting, and no tick is needed to show where.
  const ctxFrac = clamp01(ctxUsed / (ctx.compactAt ?? ctx.window))
  const ctxPct = `${Math.round(ctxFrac * 100)}%`
  const toCompact = ctx.compactAt === undefined ? undefined : Math.max(0, ctx.compactAt - ctxUsed)
  const nearCompact = ctx.compactAt !== undefined && ctxFrac >= COMPACT_NEAR
  const ctxTone: Tone = nearCompact || (ctx.compactAt === undefined && ctxFrac >= WARN_AT) ? 'amber' : 'calm'

  // ---- the cache pill ----------------------------------------------------
  const batteryIcon = (): RenderChildren => {
    if (!Svg) return null
    const outline = onTone(cacheTone, palette.label)
    const fill = onTone(cacheTone, palette.warm)
    const width = Math.round(clamp01(charge) * 15 * 10) / 10
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="12" viewBox="0 0 22 12">' +
      `<rect x="0.75" y="0.75" width="18.5" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
      `<rect x="19.75" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
      `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>` +
      '</svg>'
    const alt =
      mood === 'unmeasured'
        ? 'cache not measured yet'
        : mood === 'warming'
          ? 'cache warming'
          : charge <= 0
          ? 'cache battery empty'
          : `cache battery ${Math.round(clamp01(charge) * 100)}% left`
    return <Svg key="battery" source={source} alt={alt} width={22} height={12} />
  }

  // On a text surface the battery is the pill itself: its charge painted as
  // the background of the leading characters, draining right to left.
  const textBattery = (text: string): RenderChildren[] => {
    const chars = [...` ${text} `]
    const cut = Math.round(clamp01(charge) * chars.length)
    const fg = onTone(cacheTone, palette.value)
    return [
      cut > 0 ? (
        <Text key="bf" color={fg} backgroundColor={onTone(cacheTone, palette.batteryFill, palette.batteryAmber)}>
          {chars.slice(0, cut).join('')}
        </Text>
      ) : null,
      cut < chars.length ? (
        <Text key="be" color={fg} backgroundColor={onTone(cacheTone, palette.surface, palette.amberBg)}>
          {chars.slice(cut).join('')}
        </Text>
      ) : null,
    ]
  }

  const cachePill = (short: boolean): PillSpec => {
    const text = cacheText(short)
    if (Svg) {
      // A normal rounded pill led by a draining battery icon; the text-surface
      // battery would paint a square-cornered block here.
      return {
        key: 'cache',
        tone: cacheTone,
        body: [batteryIcon(), <Text key="c" color={onTone(cacheTone, palette.value)}>{` ${text}`}</Text>],
        card: cacheCard,
      }
    }
    if (palette.filled) return { key: 'cache', tone: cacheTone, body: textBattery(`◷ ${text}`), card: cacheCard, paintsOwnBg: true }
    const dot = mood === 'warm' || mood === 'expiring' ? palette.warm : palette.cold
    return {
      key: 'cache',
      tone: cacheTone,
      body: [
        cacheTone === 'amber' ? null : <Text key="dot" color={dot}>{'● '}</Text>,
        <Text key="c" color={onTone(cacheTone, palette.value)}>
          {cacheTone === 'amber' ? `◷ ${text}` : text}
        </Text>,
      ],
      card: cacheCard,
    }
  }

  // ---- a limit chip ------------------------------------------------------
  // Its usage on a bar and the reset; a pace that fills it early speaks in
  // words. A window whose reset has passed shows as reset: its last reading
  // is from before it.
  const limitChip = (key: LimitKey, reading: LimitReading, pace: string, tone: Tone, squeeze: number): PillSpec => {
    const spec = LIMITS[key]
    const tint = spec.tint(palette)
    const r = resetIn(reading.resetsAt, snap.now)
    if (r?.kind === 'passed') {
      return {
        key,
        tone: 'calm',
        bg: tint.bg,
        body: [...icon(spec.icon, tint.accent), <Text key="l" color={tint.fg}>{`${key} reset`}</Text>],
        card: `${spec.title} has reset; it updates after your next message`,
      }
    }
    const fg = onTone(tone, tint.fg)
    const accent = onTone(tone, tint.accent)
    const frac = clamp01(reading.percentUsed / 100)
    const bar = keeps(squeeze, 'limitBars') ? [gap('g-bar'), meter(key, frac, tone, tint.accent)] : []
    const reset =
      r !== undefined && keeps(squeeze, tone === 'amber' ? spec.amberReset : spec.reset)
        ? [<Text key="d" color={palette.label}>{' │ '}</Text>, ...icon('reset', accent), <Text key="r" color={fg}>{r.text}</Text>]
        : []
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
          {` ${Math.round(reading.percentUsed)}%${severityMark(frac)}${pace}`}
        </Text>,
        ...reset,
      ],
      card:
        r === undefined
          ? `Your ${spec.title.toLowerCase()}, across all your Claude use`
          : `${spec.title} across all your Claude use; resets in ${r.text}`,
    }
  }

  /** The share of a window gone, from its length and its reset. */
  const windowGone = (reading: LimitReading, windowMs: number | undefined): number | undefined => {
    const at = reading.resetsAt === undefined ? NaN : Date.parse(reading.resetsAt)
    return windowMs === undefined || Number.isNaN(at) || at <= snap.now ? undefined : clamp01(1 - (at - snap.now) / windowMs)
  }

  // A window past its reset is calm: its last reading is from before it.
  const hasReset = (reading: LimitReading): boolean => resetIn(reading.resetsAt, snap.now)?.kind === 'passed'

  // ---- the row, at a given squeeze ---------------------------------------
  const buildPills = (squeeze: number): PillSpec[] => {
    const short = snap.columns < SHORT_BELOW || !keeps(squeeze, 'shortWording')
    const pills: PillSpec[] = [
      cachePill(short),
      {
        key: 'cost',
        tone: 'calm',
        body: [...icon('cost', palette.coin), <Text key="v" color={palette.value} bold>{fmtCost(snap.costUsd)}</Text>],
        card:
          snap.lastTurnUsd === null
            ? 'What this session has cost so far'
            : `${fmtSmallCost(snap.lastTurnUsd)} spent during your last message, subagents included`,
      },
    ]

    if (c.requests > 0 && keeps(squeeze, 'tokens')) {
      pills.push({
        key: 'tokens',
        tone: 'calm',
        body: [...icon('tokens', palette.label), <Text key="v" color={palette.value}>{fmtTokens(tokenTotal)}</Text>],
        card: tokenBreakdown,
      })
    }

    if (hasContext && (ctxTone === 'amber' || keeps(squeeze, 'calmContext'))) {
      const amount =
        ctx.compactAt !== undefined
          ? keeps(squeeze, 'shortWording')
            ? `${ctxPct} full`
            : ctxPct
          : !keeps(squeeze, 'shortWording') || ctx.tokens === undefined
            ? ctxPct
            : `${fmtTokens(ctx.tokens)} / ${fmtTokens(ctx.window)}`
      const mark = ctx.compactAt === undefined ? severityMark(ctxFrac) : ''
      const countdown = nearCompact && toCompact !== undefined ? ` · compacts in ~${fmtTokens(toCompact)}` : ''
      pills.push({
        key: 'ctx',
        tone: ctxTone,
        body: [
          ...icon('context', onTone(ctxTone, palette.label)),
          ...(keeps(squeeze, 'contextMeter')
            ? [meter('context', ctxFrac, ctxTone, palette.meterFill), gap('g-bar')]
            : []),
          <Text key="v" color={onTone(ctxTone, palette.value)}>
            {`${amount}${mark}${countdown}`}
          </Text>,
        ],
        card:
          ctx.compactAt === undefined || toCompact === undefined
            ? 'Conversation fill; near full, older turns get summarized'
            : `Full toward auto-compaction at ${fmtTokens(ctx.compactAt)}; ${fmtTokens(toCompact)} to go`,
      })
    }

    if (snap.fiveHour) {
      const eta = snap.fiveHour.etaMs
      const tone: Tone =
        !hasReset(snap.fiveHour) && (clamp01(snap.fiveHour.percentUsed / 100) >= WARN_AT || eta !== null) ? 'amber' : 'calm'
      if (tone === 'amber' || keeps(squeeze, LIMITS['5h'].calm)) {
        const pace = eta === null ? '' : short ? ` ${fmtEta(eta)}` : ` full in ${fmtEta(eta)}`
        pills.push(limitChip('5h', snap.fiveHour, pace, tone, squeeze))
      }
    }

    if (snap.sevenDay) {
      const tone: Tone = !hasReset(snap.sevenDay) && clamp01(snap.sevenDay.percentUsed / 100) >= WARN_AT ? 'amber' : 'calm'
      if (tone === 'amber' || keeps(squeeze, LIMITS['7d'].calm)) pills.push(limitChip('7d', snap.sevenDay, '', tone, squeeze))
    }
    return pills
  }

  const rowOf = (pills: PillSpec[]): RenderElement => (
    <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
      {pills.map((spec, i) => pill(spec, i === pills.length - 1 ? 'right' : 'left'))}
      <Box flexGrow={1} />
      <Box flexShrink={0}>
        <Button key="more" label={snap.expanded ? '▴' : '⋯'} plain dimColor onPress={act.toggleExpanded} />
      </Box>
    </Box>
  )

  const measure = snap.surface === 'desktop' ? DESKTOP : TERMINAL
  let row = rowOf(buildPills(0))
  for (let squeeze = 1; squeeze <= GIVES_WAY.length && cellsOf(row, measure) > snap.columns - ROW_SLACK; squeeze++) {
    row = rowOf(buildPills(squeeze))
  }

  // ---- the expanded view: four cards, every fact labelled ----------------
  /** A label and its value at either end of a line; `swatch` keys a legend. */
  const factRow = (label: string, value: string, swatch?: string) => (
    <Box key={`fact:${label}`} flexDirection="row" justifyContent="space-between" columnGap={2}>
      <Text color={palette.label}>
        {swatch === undefined ? null : <Text key="sw" color={swatch}>{'■ '}</Text>}
        {label}
      </Text>
      <Text color={palette.cardValue}>{value}</Text>
    </Box>
  )
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
  const cardCount = 2 + (hasContext ? 1 : 0) + (snap.fiveHour || snap.sevenDay || snap.otherLimits.length > 0 ? 1 : 0)
  const fits = (n: number) => n * minCard + (n - 1) <= snap.columns
  const perLine = [cardCount, Math.ceil(cardCount / 2)].find(fits) ?? 1
  const lineCount = Math.ceil(cardCount / perLine)
  const LINE_GAP = 1
  // The rows a card's body may take: the band's, less the chip row, the
  // buttons and the row of air above each line of cards and the buttons,
  // shared by the lines, less a card's edge and its header. A taller band
  // would scroll, hiding the buttons.
  const bodyRows = Math.max(1, Math.floor((snap.maxRows - 4 - LINE_GAP * (lineCount - 1)) / lineCount) - edge - 1)
  const inner = Math.max(4, Math.floor((snap.columns - (perLine - 1)) / perLine) - 2 - edge)
  const cardBar: BarSize = { px: inner * measure.pxPerCell, cells: inner }
  /** A card: its title and headline on one line, then as much of its body,
   *  listed most important first, as the band has rows for. */
  const card = (name: string, title: string, head: Readonly<{ text: string; tone?: Tone }>, body: RenderChildren[]) => (
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
        <Text color={palette.label}>{title.toUpperCase()}</Text>
        <Text color={onTone(head.tone ?? 'calm', palette.value)} bold wrap="truncate-end">
          {head.text}
        </Text>
      </Box>
      {body.filter(part => part !== null && part !== undefined).slice(0, bodyRows)}
    </Box>
  )

  /** A bar split into parts, each its share of the whole, in its own colour. */
  const splitBar = (label: string, parts: ReadonlyArray<readonly [number, string]>) => {
    const total = parts.reduce((sum, [n]) => sum + n, 0)
    if (total <= 0) return null
    if (Svg) {
      // Drawn wider than any card and capped by it, like a stretched meter.
      const width = cardBar.px * 2
      let x = 0
      const rects = parts.map(([n, color]) => {
        const w = (n / total) * width
        const rect = `<rect x="${x.toFixed(1)}" y="1" width="${w.toFixed(1)}" height="6" fill="${color}"/>`
        x += w
        return rect
      })
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8" viewBox="0 0 ${width} 8" preserveAspectRatio="none"><clipPath id="band-split"><rect y="1" width="${width}" height="6" rx="6" ry="3"/></clipPath><g clip-path="url(#band-split)">${rects.join('')}</g></svg>`
      return <Svg key="split" source={source} alt={label} height={8} />
    }
    const cells = cardBar.cells
    let used = 0
    return (
      <Text key="split">
        {parts.map(([n, color], i) => {
          const count = i === parts.length - 1 ? cells - used : Math.round((n / total) * cells)
          used += count
          return (
            <Text key={`s${i}`} color={color}>
              {'█'.repeat(Math.max(0, count))}
            </Text>
          )
        })}
      </Text>
    )
  }

  const measured = c.requests > 0
  const cacheView = card(
    'cache',
    'Cache',
    {
      text:
        mood === 'unmeasured'
          ? 'Not measured yet'
          : mood === 'warming'
            ? 'Warming'
            : mood === 'cold'
              ? 'Cold'
              : mood === 'warm' && snap.isWorking
                ? 'Warm'
                : `${fmtCountdown(c.msLeft)} left`,
      tone: cacheTone,
    },
    [
      measured ? meter('cache', charge, cacheTone, palette.warm, cardBar, true) : null,
      mood === 'unmeasured' ? note("Countdown starts with Claude's next reply.") : null,
      mood === 'warming' ? note('First message builds the cache.') : null,
      measured ? factRow(mood === 'cold' ? 'next message' : 're-warm if cold', estimate) : null,
      c.misses > 0 ? factRow('unexpected rebuilds', String(c.misses)) : null,
      measured && c.savedUsd !== null ? factRow('saved by cache', fmtEstimate(c.savedUsd)) : null,
      measured && c.hitRatio !== null ? factRow('hit rate', `${Math.round(c.hitRatio * 100)}%`) : null,
      // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
      factRow('expires', `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`),
    ],
  )

  // Cache reads in the warm colour: cheap, and often most of the bar.
  const SPLIT: ReadonlyArray<readonly [string, number, string]> = [
    ['input', c.tokens.sent, palette.meterFill],
    ['output', c.tokens.back, palette.coin],
    ['cache reads', c.tokens.cached, palette.warm],
  ]
  const spendView = card('spend', 'Spend', { text: fmtCost(snap.costUsd) }, [
    measured ? splitBar('token split: input, output, cache reads', SPLIT.map(([, n, color]) => [n, color] as const)) : null,
    snap.lastTurnUsd !== null ? factRow('last message', fmtSmallCost(snap.lastTurnUsd)) : null,
    ...(measured ? SPLIT.map(([label, n, color]) => factRow(label, fmtTokens(n), color)) : [note('Breakdown counts from your next message.')]),
  ])

  const contextView = hasContext
    ? card('context', 'Context', { text: `${ctxPct} full${ctx.compactAt === undefined ? severityMark(ctxFrac) : ''}`, tone: ctxTone }, [
        meter('context', ctxFrac, ctxTone, palette.meterFill, cardBar, true),
        toCompact !== undefined ? factRow('room left', `~${fmtTokens(toCompact)}`) : null,
        ctx.compactAt !== undefined ? factRow('auto-compacts at', fmtTokens(ctx.compactAt)) : null,
        factRow('in context', fmtTokens(ctxUsed)),
        factRow('model window', fmtTokens(ctx.window)),
      ])
    : null

  type Window = Readonly<{ name: string; reading: LimitReading; windowMs: number | undefined; accent: string }>
  const windows: Window[] = [
    ...(snap.fiveHour ? [{ name: '5h', reading: snap.fiveHour, windowMs: LIMITS['5h'].windowMs, accent: palette.fiveAccent }] : []),
    ...(snap.sevenDay ? [{ name: '7d', reading: snap.sevenDay, windowMs: LIMITS['7d'].windowMs, accent: palette.weekAccent }] : []),
    ...snap.otherLimits.map(limit => ({
      name: limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' '),
      reading: limit,
      windowMs: undefined,
      accent: palette.meterFill,
    })),
  ]
  const live = windows.filter(w => !hasReset(w.reading))
  const valueOf = (reading: LimitReading) => `${Math.round(reading.percentUsed)}%${severityMark(clamp01(reading.percentUsed / 100))}`

  /** One window: its name, bar and value on a line, then its reset and pace in words. */
  const limitRows = ({ name, reading, windowMs, accent }: Window): readonly [RenderChildren, RenderChildren] => {
    const r = resetIn(reading.resetsAt, snap.now)
    if (r?.kind === 'passed') return [factRow(name, 'reset'), null]
    const frac = clamp01(reading.percentUsed / 100)
    const tone: Tone = frac >= WARN_AT ? 'amber' : 'calm'
    const gone = windowGone(reading, windowMs)
    const value = valueOf(reading)
    const room = Math.max(4, inner - [...name].length - [...value].length - 2)
    // The pace says where this rate ends the window; too early to say, it waits.
    const projected = gone === undefined || gone < 0.05 ? undefined : reading.percentUsed / gone
    const pace =
      projected === undefined ? '' : projected >= 100 ? ' · full before reset' : ` · on pace for ~${Math.round(projected)}%`
    return [
      <Box key={`fact:${name}`} flexDirection="row" columnGap={1}>
        <Text color={palette.label}>{name}</Text>
        <Box key="bar" flexGrow={1} width={0} minWidth={0}>
          {meter(name, frac, tone, accent, { px: room * measure.pxPerCell, cells: room }, true)}
        </Box>
        <Text color={onTone(tone, palette.cardValue)}>{value}</Text>
      </Box>,
      r === undefined ? null : (
        <Box key={`fact:${name} pace`}>
          <Text color={palette.label} wrap="truncate-end">{`resets ${r.text}${pace}`}</Text>
        </Box>
      ),
    ]
  }
  // The headline is the window closest to its limit.
  const worst = live.reduce<Window | undefined>((top, w) => (top === undefined || w.reading.percentUsed > top.reading.percentUsed ? w : top), undefined)
  const limitsView =
    windows.length > 0
      ? card(
          'limits',
          'Limits',
          {
            text: worst === undefined ? 'all reset' : `${worst.name} ${valueOf(worst.reading)}`,
            tone: worst !== undefined && clamp01(worst.reading.percentUsed / 100) >= WARN_AT ? 'amber' : 'calm',
          },
          // Short of rows, every window's bar before any pace line.
          (() => {
            const rows = windows.map(limitRows)
            const lines = rows.flat().filter(part => part !== null)
            return lines.length <= bodyRows ? lines : [...rows.map(([bar]) => bar), ...rows.map(([, pace]) => pace)]
          })(),
        )
      : null

  const cardViews = [cacheView, spendView, contextView, limitsView].filter(view => view !== null)

  return (
    <Box flexDirection="column">
      {row}
      {snap.expanded ? (
        <Box key="cards" flexDirection="column" rowGap={LINE_GAP} marginTop={1}>
          {Array.from({ length: lineCount }, (_, i) => (
            <Box key={`cards:${i}`} flexDirection="row" columnGap={1}>
              {cardViews.slice(i * perLine, (i + 1) * perLine)}
            </Box>
          ))}
        </Box>
      ) : null}
      {snap.expanded ? (
        <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
          <Text key="hint" color={palette.label}>
            Bring it back with /usage-band
          </Text>
          <Box flexGrow={1} />
          <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />
          <Button key="hide" label="Hide band" variant="primary" hotkey="h" onPress={act.hide} />
        </Box>
      ) : null}
    </Box>
  )
}
