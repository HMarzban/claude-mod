// Chips, the band as it has always been: a row of pills, and four cards
// beneath it when open. It keeps its own cache pill, limit chips and cards;
// it draws from the snapshot itself (`read.chips.raw`), as it did in band.tsx.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import {
  fmtCost,
  fmtAgo,
  fmtEta,
  fmtSmallCost,
  fmtTokens,
  severityMark,
} from '../format'
import { asciiText } from '../glyphs'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import {
  CARD_TEXT,
  GIVES_WAY,
  HOTKEY_MARK,
  ROW_SLACK,
  SHORT_BELOW,
  cellsOf,
  keeps,
  squeezeToFit,
  startsOf,
} from '../layout'
import type { BarSize, Piece } from '../layout'
import { BARE } from '../palette'
import type { Palette } from '../palette'
import type { ChipsWindow, LimitKey, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { drawStrip } from '../strip'
import { paceText } from '../words'
import { toggleButton } from './frame'
import { batteryIcon, pill, textBattery } from './parts'
import type { PillSpec } from './parts'
import type { View } from './view'

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

/** The two limit chips: one shape, their own tint and steps. */
const LIMITS: Readonly<Record<ChipKey, LimitSpec>> = {
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

// ---- drawing --------------------------------------------------------------

/** The expanded view's cards, in the order they are drawn. */
type CardName = 'cache' | 'spend' | 'context' | 'limits'

const drawChips = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Box, Button, Text, Svg, palette, measure, onTone, hoverCard, gap, icon } = kit
  const snap = read.chips.raw
  const c = snap.cache
  const ascii = read.frame.glyphs === 'ascii'
  // ---- what the pills say, whatever the squeeze ----------------------------
  const { mood, estimate, tone: cacheTone, charge } = read.cache
  const { copy, tokenBreakdown } = read.chips.reading

  const ctx = snap.context
  const {
    known: hasContext,
    frac: ctxFrac,
    pct: ctxPct,
    toCompact,
    nearCompact,
    tone: ctxTone,
  } = read.context

  // ---- the cache pill ----------------------------------------------------
  const cachePill = (short: boolean): PillSpec => {
    const text = copy.pill(short)
    if (Svg) {
      // A normal rounded pill led by a draining battery icon; the text-surface
      // battery would paint a square-cornered block here.
      return {
        key: 'cache',
        tone: cacheTone,
        body: [batteryIcon(kit, charge, cacheTone, copy.alt), <Text key="c" color={onTone(cacheTone, palette.value)}>{` ${text}`}</Text>],
        hover: copy.hover,
      }
    }
    // The ascii label is mapped before the battery's cut, so a dropped glyph
    // neither leaves a gap at the cut nor takes its cells from the charge.
    if (palette.filled) {
      const label = `◷ ${text}`
      return { key: 'cache', tone: cacheTone, body: textBattery(kit, charge, cacheTone, ascii ? asciiText(label) : label), hover: copy.hover, paintsOwnBg: true }
    }
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
  const limitChip = (key: ChipKey, w: LimitView, pace: string, squeeze: number): PillSpec => {
    const spec = LIMITS[key]
    const tint = spec.tint(palette)
    const { reset: r, frac, tone } = w
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
    const bar = keeps(squeeze, 'limitBars') ? [gap('g-bar'), meter(kit, { label: key, frac, tone, accent: tint.accent })] : []
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
          {` ${w.value}${severityMark(frac)}${pace}`}
        </Text>,
        ...reset,
      ],
      hover:
        r === undefined
          ? `Your ${spec.title.toLowerCase()}, across all your Claude use`
          : `${spec.title} across all your Claude use; resets in ${r.text}`,
    }
  }

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

    if (read.cache.measured && keeps(squeeze, 'tokens')) {
      pills.push({
        key: 'tokens',
        tone: 'calm',
        body: [...icon('tokens', palette.label), <Text key="v" color={palette.value}>{fmtTokens(read.spend.total)}</Text>],
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
            ? [meter(kit, { label: 'context', frac: ctxFrac, tone: ctxTone, accent: palette.meterFill }), gap('g-bar')]
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

    const five = read.fiveHour
    if (five) {
      const eta = five.etaMs
      if (five.tone === 'amber' || keeps(squeeze, LIMITS['5h'].calm)) {
        const pace = eta === null ? '' : short ? ` ${fmtEta(eta)}` : ` ${paceText(five)}`
        pills.push(limitChip('5h', five, pace, squeeze))
      }
    }

    const seven = read.sevenDay
    if (seven && (seven.tone === 'amber' || keeps(squeeze, LIMITS['7d'].calm))) pills.push(limitChip('7d', seven, '', squeeze))
    return pills
  }

  const rowOf = (specs: PillSpec[]): RenderElement => {
    const pills = specs.map(spec => pill(kit, spec))
    const toggle = toggleButton(kit, read, act)
    // A card ends short of ▿ and the gap before it.
    const room = snap.columns - cellsOf(toggle, measure) - 1
    const starts = startsOf(pills, 1, measure)
    return (
      <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
        {pills}
        <Box flexGrow={1} />
        {specs.map(({ key, hover }, i) => (hover === undefined ? null : hoverCard(key, hover, { left: starts[i] ?? 0, room })))}
        {toggle}
      </Box>
    )
  }

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
    /** A fact the readings may not know yet: nothing until they do. */
    const knownRow = (label: string, value: string | undefined) => (value === undefined ? null : factRow(label, value))
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

    const { measured, known } = read.cache
    const cacheView = card(
      'cache',
      'Cache',
      {
        text: copy.head,
        tone: cacheTone,
      },
      known ? meter(kit, { label: 'cache', frac: charge, tone: cacheTone, accent: palette.warm, size: cardBar, stretch: true, reads: 'left' }) : null,
      [
        copy.note === undefined ? null : note(copy.note),
        known ? factRow(mood === 'cold' ? 'next message' : 're-warm if cold', estimate) : null,
        c.recalled && c.idleMs !== null ? factRow('idle for', fmtAgo(c.idleMs)) : null,
        knownRow('unexpected rebuilds', read.cache.rebuildsText),
        knownRow('saved by cache', read.cache.savedText),
        knownRow('hit rate', read.cache.hitText),
        factRow('expires', read.cache.lastsText),
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
          meter(kit, { label: 'context', frac: ctxFrac, tone: ctxTone, accent: palette.meterFill, size: cardBar, stretch: true }),
          [
          knownRow('room left', read.context.roomText),
          knownRow('auto-compacts at', read.context.compactsAtText),
          factRow('in context', read.context.inContextText),
          factRow('model window', read.context.windowText),
          ],
        )
      : null

    const { windows } = read.chips.reading
    const worst = read.worstLimit
    /** A window's bar in its chip's own accent; any other window's in the meter's. */
    const windowAccent = (w: ChipsWindow) => (w.key === 'other' ? palette.meterFill : LIMITS[w.key].tint(palette).accent)
    const valueOf = (w: LimitView) => `${w.value}${severityMark(w.frac)}`

    /** One window: its name, bar and value on a line, then its reset and pace in words. */
    const limitRows = (w: ChipsWindow): readonly [RenderChildren, RenderChildren] => {
      const { name, reset: r, frac, tone, cardPace: pace } = w
      if (r?.kind === 'passed') return [factRow(name, 'reset'), null]
      const accent = windowAccent(w)
      const value = valueOf(w)
      const room = Math.max(4, inner - [...name].length - [...value].length - 2)
      return [
        <Box key={`fact:${name}`} flexDirection="row" columnGap={1}>
          <Text color={palette.label}>{name}</Text>
          <Box key="bar" flexGrow={1} width={0} minWidth={0}>
            {meter(kit, { label: name, frac, tone, accent, size: { px: room * measure.pxPerCell, cells: room }, stretch: true })}
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
    const limitsView =
      windows.length > 0
        ? card(
            'limits',
            'Limits',
            {
              text: worst === undefined ? 'all reset' : `${worst.name} ${valueOf(worst)}`,
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

export const chipsView: View = { name: 'chips', rows: { desktop: 1, terminal: 1 }, draw: drawChips }
