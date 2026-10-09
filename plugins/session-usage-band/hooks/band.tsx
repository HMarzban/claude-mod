// The band, drawn: a pure function of the snapshot register.tsx reads.
// It never sees `$`, so everything it shows arrives in the snapshot.

import type { ElementTable, RenderChildren, RenderElement } from 'claude-code'
import {
  clamp01,
  fmtCost,
  fmtEstimate,
  fmtAgo,
  fmtEta,
  fmtSmallCost,
  fmtTokens,
  resetIn,
  severityMark,
} from './format'
import type { Icon } from './icons'
import { makeKit } from './kit'
import {
  CARD_TEXT,
  CHIP_BAR,
  GIVES_WAY,
  HOTKEY_MARK,
  ROW_SLACK,
  SHORT_BELOW,
  cellsOf,
  keeps,
  squeezeToFit,
} from './layout'
import type { BarSize, Piece } from './layout'
import { BARE } from './palette'
import type { Palette } from './palette'
import {
  cacheCharge,
  cacheCopy,
  cacheMood,
  contextReading,
  hasReset as resetPassed,
  limitTone as toneOf,
  reWarmEstimate,
  windowGone as goneOf,
} from './reading'
import type { Tone } from './reading'
import type { BandActions, BandSnapshot, LimitReading } from './snapshot'
import { drawStrip } from './strip'


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

// ---- drawing --------------------------------------------------------------

/** The expanded view's cards, in the order they are drawn. */
type CardName = 'cache' | 'spend' | 'context' | 'limits'

type PillSpec = Readonly<{
  key: string
  tone: Tone
  body: RenderChildren[]
  /** The one-line explanation shown while the pill is hovered. */
  hover: string
  /** The terminal battery paints its own background in its Texts. */
  paintsOwnBg?: boolean
  bg?: string
}>

export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions): RenderElement => {
  const kit = makeKit(el, snap)
  const { Box, Button, Text, Svg, palette, measure, onTone, hoverCard, gap, icon } = kit
  const c = snap.cache
  // A pill carries its own foreground and background, never one of each. Its
  // card is a child, so the engine counts the pointer on the card as on the
  // pill and reading it keeps the pill hovered. The card has no key: a keyed
  // Box is its own hover scope, and a hidden one could never be hovered. One
  // line, since a collapsed band is one row. Plain has no background to cover
  // the row with, so no cards; the expanded line says it all. A pill never
  // shrinks: the squeeze drops pieces instead, so its text never wraps.
  const pill = ({ key, tone, body, hover, paintsOwnBg, bg }: PillSpec, anchor: 'left' | 'right') => {
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
        {hoverCard(hover, anchor)}
      </Box>
    )
  }

  /** A bar: `frac` filled, with a thumb where the fill ends, so the eye finds
   *  the number's place on it at once. `label` names it for a reader, and
   *  `reads` says whether the fill is what's used or what's left. A stretched bar has no width of its
   *  own: drawn wider than any slot, the slot caps it, so it spans its card. */
  const meter = (
    label: string,
    frac: number,
    tone: Tone,
    accent: string,
    size: BarSize = CHIP_BAR,
    stretch = false,
    reads: 'used' | 'left' = 'used',
  ) => {
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
      const alt = `${label} ${Math.round(clamp01(frac) * 100)}% ${reads}`
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
  const copy = cacheCopy(c, mood, snap.isWorking)
  const estimate = reWarmEstimate(c)
  const cacheTone: Tone = mood === 'expiring' ? 'amber' : 'calm'
  const charge = cacheCharge(c, mood, snap.isWorking)

  const tokenBreakdown = `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`
  const tokenTotal = c.tokens.sent + c.tokens.back + c.tokens.cached

  const ctx = snap.context
  const {
    known: hasContext,
    used: ctxUsed,
    frac: ctxFrac,
    pct: ctxPct,
    toCompact,
    nearCompact,
    tone: ctxTone,
  } = contextReading(ctx)

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
    const alt = copy.alt
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
    const text = copy.pill(short)
    if (Svg) {
      // A normal rounded pill led by a draining battery icon; the text-surface
      // battery would paint a square-cornered block here.
      return {
        key: 'cache',
        tone: cacheTone,
        body: [batteryIcon(), <Text key="c" color={onTone(cacheTone, palette.value)}>{` ${text}`}</Text>],
        hover: copy.hover,
      }
    }
    if (palette.filled) return { key: 'cache', tone: cacheTone, body: textBattery(`◷ ${text}`), hover: copy.hover, paintsOwnBg: true }
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
      hover: copy.hover,
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
        hover: `${spec.title} has reset; it updates after your next message`,
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
      hover:
        r === undefined
          ? `Your ${spec.title.toLowerCase()}, across all your Claude use`
          : `${spec.title} across all your Claude use; resets in ${r.text}`,
    }
  }

  const windowGone = (reading: LimitReading, windowMs: number | undefined) => goneOf(reading, windowMs, snap.now)
  const hasReset = (reading: LimitReading) => resetPassed(reading, snap.now)
  const limitTone = (reading: LimitReading, etaMs: number | null = null) => toneOf(reading, snap.now, etaMs)

  // ---- the row, at a given squeeze ---------------------------------------
  const buildPills = (squeeze: number): PillSpec[] => {
    const short = snap.columns < SHORT_BELOW || !keeps(squeeze, 'shortWording')
    const pills: PillSpec[] = [
      cachePill(short),
      {
        key: 'cost',
        tone: 'calm',
        body: [...icon('cost', palette.coin), <Text key="v" color={palette.value} bold>{fmtCost(snap.costUsd)}</Text>],
        hover:
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
        hover: tokenBreakdown,
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
        hover:
          ctx.compactAt === undefined || toCompact === undefined
            ? 'Conversation fill; near full, older turns get summarized'
            : `Full toward auto-compaction at ${fmtTokens(ctx.compactAt)}; ${fmtTokens(toCompact)} to go`,
      })
    }

    if (snap.fiveHour) {
      const eta = snap.fiveHour.etaMs
      const tone = limitTone(snap.fiveHour, eta)
      if (tone === 'amber' || keeps(squeeze, LIMITS['5h'].calm)) {
        const pace = eta === null ? '' : short ? ` ${fmtEta(eta)}` : ` full in ${fmtEta(eta)}`
        pills.push(limitChip('5h', snap.fiveHour, pace, tone, squeeze))
      }
    }

    if (snap.sevenDay) {
      const tone = limitTone(snap.sevenDay)
      if (tone === 'amber' || keeps(squeeze, LIMITS['7d'].calm)) pills.push(limitChip('7d', snap.sevenDay, '', tone, squeeze))
    }
    return pills
  }

  const rowOf = (pills: PillSpec[]): RenderElement => (
    <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
      {pills.map((spec, i) => pill(spec, i === pills.length - 1 ? 'right' : 'left'))}
      <Box flexGrow={1} />
      <Box flexShrink={0}>
        {/* A Button holds text alone, so its icon is a glyph. The outlined
            triangles are measured centred in the line, within half a pixel,
            and wider than tall like a disclosure icon; arrowhead chevrons sit
            5 px low. On the desktop in a native frame like Collapse's, in the
            terminal bare. */}
        <Button
          key="more"
          label={snap.expanded ? '▵' : '▿'}
          {...(Svg ? { variant: 'secondary' as const } : { plain: true as const, dimColor: true })}
          onPress={act.toggleExpanded}
        />
      </Box>
    </Box>
  )

  const row = squeezeToFit(squeeze => rowOf(buildPills(squeeze)), GIVES_WAY.length, snap.columns - ROW_SLACK, measure)

  // ---- the expanded view: four cards, every fact labelled ----------------
  // Built only when open: a closed band draws the row alone.
  const expandedView = (): RenderChildren[] => {
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
    // The cards present, which the grid lays out.
    const present: readonly CardName[] = [
      'cache',
      'spend',
      ...(hasContext ? (['context'] as const) : []),
      ...(snap.fiveHour || snap.sevenDay || snap.otherLimits.length > 0 ? (['limits'] as const) : []),
    ]
    const cardCount = present.length
    const fits = (n: number) => n * minCard + (n - 1) <= snap.columns
    const perLine = [cardCount, Math.ceil(cardCount / 2)].find(fits) ?? 1
    const lineCount = Math.ceil(cardCount / perLine)
    const lineGap = 1
    // The rows a card's body may take: the band's, less the chip row, the
    // buttons, the row of air above each line of cards and the buttons and,
    // when it shows, the workspace strip, shared by the lines, less a card's
    // edge and its header. A taller band would scroll, hiding the buttons.
    const bodyFor = (strip: number) =>
      Math.floor((snap.maxRows - 4 - strip - lineGap * (lineCount - 1)) / lineCount) - edge - 1
    // The strip heads the view when every card still keeps a fact of its own;
    // short of that row it takes the footer's, in place of the hint.
    const stripPlace: 'top' | 'footer' | undefined =
      snap.workspace === undefined ? undefined : bodyFor(1) >= 1 ? 'top' : 'footer'
    const bodyRows = Math.max(1, bodyFor(stripPlace === 'top' ? 1 : 0))
    const inner = Math.max(4, Math.floor((snap.columns - (perLine - 1)) / perLine) - 2 - edge)
    const cardBar: BarSize = { px: inner * measure.pxPerCell, cells: inner }
    /** As much of a card's body as the band has rows for, its facts listed
     *  most important first. Its bar repeats a chip's, so it shows only when
     *  every fact fits beside it; short of rows, a fact wins. */
    const fitBody = (bar: RenderChildren, body: RenderChildren[]): RenderChildren[] => {
      const facts = body.filter(part => part !== null && part !== undefined)
      return bar !== null && facts.length < bodyRows ? [bar, ...facts] : facts.slice(0, bodyRows)
    }
    // Each card's mark: the chips' own icons, so the band speaks one language.
    const cardIcon: Readonly<Record<CardName, readonly [Icon, string]>> = {
      cache: ['cache', palette.warm],
      spend: ['cost', palette.coin],
      context: ['context', palette.label],
      limits: ['limits', LIMITS['5h'].tint(palette).accent],
    }
    /** A card: its title and headline on one line, then its bar and body. */
    const card = (
      name: CardName,
      title: string,
      head: Readonly<{ text: string; tone?: Tone }>,
      bar: RenderChildren,
      body: RenderChildren[],
    ) => (
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
          <Text color={onTone(head.tone ?? 'calm', palette.value)} bold wrap="truncate-end">
            {head.text}
          </Text>
        </Box>
        {fitBody(bar, body)}
      </Box>
    )

    /** A bar split into parts, each its share of the whole, in its own colour. */
    const splitBar = (label: string, parts: ReadonlyArray<readonly [number, string]>) => {
      const total = parts.reduce((sum, [n]) => sum + n, 0)
      if (total <= 0) return null
      if (Svg) {
        // Drawn wider than any card and capped by it, like a stretched meter.
        // No clipPath, whose id would be page-wide: the end segments draw their
        // own rounded ends, as paths, the inner ones square.
        const width = cardBar.px * 2
        const R = 6
        const shown = parts.filter(([n]) => n > 0)
        let x = 0
        const segments = shown.map(([n, color], i) => {
          const x0 = x
          const x1 = x + (n / total) * width
          x = x1
          const f = (v: number) => v.toFixed(1)
          const first = i === 0
          const last = i === shown.length - 1
          if (x1 - x0 < 2 * R || (!first && !last)) {
            return `<rect x="${f(x0)}" y="1" width="${f(x1 - x0)}" height="6"${first && last ? ` rx="${R}" ry="3"` : ''} fill="${color}"/>`
          }
          if (first && last) return `<rect x="${f(x0)}" y="1" width="${f(x1 - x0)}" height="6" rx="${R}" ry="3" fill="${color}"/>`
          return first
            ? `<path d="M${f(x0 + R)} 1H${f(x1)}V7H${f(x0 + R)}A${R} 3 0 0 1 ${f(x0 + R)} 1Z" fill="${color}"/>`
            : `<path d="M${f(x0)} 1H${f(x1 - R)}A${R} 3 0 0 1 ${f(x1 - R)} 7H${f(x0)}Z" fill="${color}"/>`
        })
        const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="8" viewBox="0 0 ${width} 8" preserveAspectRatio="none">${segments.join('')}</svg>`
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
    // Measured, or recalled from the session's last reply: time and price known.
    const known = measured || c.recalled
    const cacheView = card(
      'cache',
      'Cache',
      {
        text: copy.head,
        tone: cacheTone,
      },
      known ? meter('cache', charge, cacheTone, palette.warm, cardBar, true, 'left') : null,
      [
        copy.note === undefined ? null : note(copy.note),
        known ? factRow(mood === 'cold' ? 'next message' : 're-warm if cold', estimate) : null,
        c.recalled && c.idleMs !== null ? factRow('idle for', fmtAgo(c.idleMs)) : null,
        c.misses > 0 ? factRow('unexpected rebuilds', String(c.misses)) : null,
        measured && c.savedUsd !== null ? factRow('saved by cache', fmtEstimate(c.savedUsd)) : null,
        measured && c.hitRatio !== null ? factRow('hit rate', `${Math.round(c.hitRatio * 100)}%`) : null,
        // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
        factRow('expires', `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`),
      ],
    )

    // Cache reads in the warm colour: cheap, and often most of the bar.
    const tokenParts: ReadonlyArray<readonly [string, number, string]> = [
      ['input', c.tokens.sent, palette.meterFill],
      ['output', c.tokens.back, palette.coin],
      ['cache reads', c.tokens.cached, palette.warm],
    ]
    const spendView = card(
      'spend',
      'Spend',
      { text: fmtCost(snap.costUsd) },
      measured ? splitBar('token split: input, output, cache reads', tokenParts.map(([, n, color]) => [n, color] as const)) : null,
      [
      snap.lastTurnUsd !== null ? factRow('last message', fmtSmallCost(snap.lastTurnUsd)) : null,
      ...(measured ? tokenParts.map(([label, n, color]) => factRow(label, fmtTokens(n), color)) : [note('Breakdown counts from your next message.')]),
      ],
    )

    const contextView = hasContext
      ? card(
          'context',
          'Context',
          { text: `${ctxPct} full${ctx.compactAt === undefined ? severityMark(ctxFrac) : ''}`, tone: ctxTone },
          meter('context', ctxFrac, ctxTone, palette.meterFill, cardBar, true),
          [
          toCompact !== undefined ? factRow('room left', `~${fmtTokens(toCompact)}`) : null,
          ctx.compactAt !== undefined ? factRow('auto-compacts at', fmtTokens(ctx.compactAt)) : null,
          factRow('in context', fmtTokens(ctxUsed)),
          factRow('model window', fmtTokens(ctx.window)),
          ],
        )
      : null

    /** A window of the Limits card. `etaMs` is the measured pace the 5h chip
     *  shows, when there is one; the card says the same. */
    type Window = Readonly<{
      name: string
      reading: LimitReading
      windowMs: number | undefined
      accent: string
      etaMs: number | null
    }>
    const windows: Window[] = [
      ...(snap.fiveHour
        ? [{ name: '5h', reading: snap.fiveHour, windowMs: LIMITS['5h'].windowMs, accent: LIMITS['5h'].tint(palette).accent, etaMs: snap.fiveHour.etaMs }]
        : []),
      ...(snap.sevenDay ? [{ name: '7d', reading: snap.sevenDay, windowMs: LIMITS['7d'].windowMs, accent: LIMITS['7d'].tint(palette).accent, etaMs: null }] : []),
      ...snap.otherLimits.map(limit => ({
        name: limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' '),
        reading: limit,
        windowMs: undefined,
        accent: palette.meterFill,
        etaMs: null,
      })),
    ]
    const live = windows.filter(w => !hasReset(w.reading))
    const valueOf = (reading: LimitReading) => `${Math.round(reading.percentUsed)}%${severityMark(clamp01(reading.percentUsed / 100))}`

    /** One window: its name, bar and value on a line, then its reset and pace in words. */
    const limitRows = ({ name, reading, windowMs, accent, etaMs }: Window): readonly [RenderChildren, RenderChildren] => {
      const r = resetIn(reading.resetsAt, snap.now)
      if (r?.kind === 'passed') return [factRow(name, 'reset'), null]
      const frac = clamp01(reading.percentUsed / 100)
      const tone = limitTone(reading, etaMs)
      const gone = windowGone(reading, windowMs)
      const value = valueOf(reading)
      const room = Math.max(4, inner - [...name].length - [...value].length - 2)
      // A measured pace, as the chip says it; else where the window's average
      // rate ends it. Too early to say, it waits.
      const projected = gone === undefined || gone < 0.05 ? undefined : reading.percentUsed / gone
      const pace =
        etaMs !== null
          ? ` · full in ${fmtEta(etaMs)}`
          : projected === undefined
            ? ''
            : projected >= 100
              ? ' · full before reset'
              : ` · on pace for ~${Math.round(projected)}%`
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
    /** Every window's rows; short of rows, each window's bar row before any
     *  pace line. */
    const limitLines = (): RenderChildren[] => {
      const rows = windows.map(limitRows)
      const lines = rows.flat().filter(part => part !== null)
      return lines.length <= bodyRows ? lines : [...rows.map(([bar]) => bar), ...rows.map(([, pace]) => pace)]
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
              tone: worst === undefined ? 'calm' : limitTone(worst.reading, worst.etaMs),
            },
            // Each window's bar is in its own row, so the card has none apart.
            null,
            limitLines(),
          )
        : null

    const cardViews = [cacheView, spendView, contextView, limitsView].filter(view => view !== null)

    const buttons = [
      <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
      <Button key="hide" label="Hide band" variant="primary" hotkey="h" onPress={act.hide} />,
    ]
    let strip: RenderElement | null = null
    if (stripPlace !== undefined && snap.workspace !== undefined) {
      // In the footer it shares the line with the buttons and their hotkey marks.
      const room =
        snap.columns - ROW_SLACK - (stripPlace === 'footer' ? cellsOf(buttons, measure) + 2 * HOTKEY_MARK + 2 : 0)
      strip = drawStrip(kit, snap.workspace, stripPlace, edge, room)
    }

    return [
      stripPlace === 'top' ? strip : null,
      <Box key="cards" flexDirection="column" rowGap={lineGap} marginTop={stripPlace === 'top' ? 0 : 1}>
        {Array.from({ length: lineCount }, (_, i) => (
          <Box key={`cards:${i}`} flexDirection="row" columnGap={1}>
            {cardViews.slice(i * perLine, (i + 1) * perLine)}
          </Box>
        ))}
      </Box>,
      <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
        {stripPlace === 'footer' ? (
          strip
        ) : (
          <Box key="hint" flexDirection="row">
            {Svg ? icon('info', BARE.icon) : null}
            <Text color={BARE.label}>Bring it back with /usage-band</Text>
          </Box>
        )}
        <Box flexGrow={1} />
        {buttons}
      </Box>,
    ]
  }

  return (
    <Box flexDirection="column">
      {row}
      {snap.expanded ? expandedView() : null}
    </Box>
  )
}
