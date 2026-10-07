import type { ElementTable, RenderChildren, RenderElement } from 'claude-code'
import { SOON_MS } from './cache'
import type { Ttl } from './cache'
import {
  clamp01,
  fmtCost,
  fmtCountdown,
  fmtEstimate,
  fmtEta,
  fmtResetsIn,
  fmtSmallCost,
  fmtTokens,
  severityMark,
} from './format'
import type { Palette } from './palette'

/** Everything the band shows, read by register.tsx; drawing never touches $. */
export type BandSnapshot = {
  surface: 'terminal' | 'desktop' | 'vscode' | 'mobile'
  columns: number
  isWorking: boolean
  expanded: boolean
  palette: Palette
  now: number
  cache: {
    requests: number
    msLeft: number
    ttl: Ttl
    ttlPinned: boolean
    window: number
    hitRatio: number | null
    misses: number
    reWarmUsd: number | null
  }
  costUsd: number
  lastTurnUsd: number | null
  contextPercent: number | undefined
  fiveHour: { percentUsed: number; resetsAt: string | undefined; etaMs: number | null } | undefined
  sevenDay: { percentUsed: number; resetsAt: string | undefined } | undefined
}

export type BandActions = {
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}

// The minimum width, in bodyColumns, each optional piece needs.
const SHOW_FIVE_HOUR = 100
const SHOW_CONTEXT_METER = 84
const SHOW_LAST_COST = 68
const AMBER_AT = 0.8
const METER_CELLS = 6

type Tone = 'calm' | 'amber'

export const drawBand = (el: ElementTable, s: BandSnapshot, act: BandActions): RenderElement => {
  const { Box, Button, Text } = el
  const p = s.palette
  const c = s.cache
  const short = s.columns < SHOW_LAST_COST
  // Svg draws on the desktop alone (other surfaces hold the element but drop
  // it), and its markup takes hex: theme keys can't reach inside it, so plain
  // appearance keeps the text meter.
  const Svg = s.surface === 'desktop' && p.filled && 'Svg' in el ? el.Svg : undefined

  type PillSpec = { key: string; tone: Tone; body: RenderChildren[]; card: string }

  // A pill carries its own foreground and background, never one of each.
  // Its card is a child, so the engine counts the pointer on the card as on
  // the pill and reading it keeps the pill hovered. The card has no key: a
  // keyed Box is its own hover scope, and a hidden one could never be
  // hovered. One line, since a collapsed band is one row. Plain has no
  // background to cover the row with, so no cards; the expanded line says it.
  const pill = ({ key, tone, body, card }: PillSpec, anchor: 'left' | 'right') => {
    const fg = tone === 'amber' ? p.amberFg : p.value
    if (!p.filled) {
      return (
        <Box key={key}>
          <Text color={fg}>[</Text>
          {body}
          <Text color={fg}>]</Text>
        </Box>
      )
    }
    return (
      <Box key={key} backgroundColor={tone === 'amber' ? p.amberBg : p.surface} paddingX={1}>
        {body}
        <Box
          position="absolute"
          top={0}
          {...(anchor === 'left' ? { left: 0 } : { right: 0 })}
          width={Math.min(card.length + 2, s.columns)}
          display="none"
          hover={{ display: 'flex' }}
          backgroundColor={p.cardBg}
          paddingX={1}
        >
          <Text color={p.value} wrap="truncate-end">
            {card}
          </Text>
        </Box>
      </Box>
    )
  }

  const meter = (key: string, frac: number, tone: Tone) => {
    const fill = tone === 'amber' ? p.amberFg : p.meterFill
    if (Svg) {
      // Never name a local `h`: JSX compiles to the global h().
      const width = 44
      const height = 6
      const fillWidth = Math.round(clamp01(frac) * width)
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
        `<rect width="${width}" height="${height}" rx="3" fill="${p.meterTrack}"/>` +
        (fillWidth > 0 ? `<rect width="${fillWidth}" height="${height}" rx="3" fill="${fill}"/>` : '') +
        '</svg>'
      return <Svg key={key} source={source} alt={`${Math.round(clamp01(frac) * 100)}%`} width={width} height={height} />
    }
    // Two glyphs only: partial blocks jitter across fonts and read as noise to
    // a screen reader. The number beside a meter always carries the value.
    const filled = Math.round(clamp01(frac) * METER_CELLS)
    return (
      <Text key={key} color={fill}>
        {'█'.repeat(filled)}
        <Text color={p.meterTrack}>{'░'.repeat(METER_CELLS - filled)}</Text>
      </Text>
    )
  }

  const pills: PillSpec[] = []

  // ---- cache: the only pill that counts down --------------------------
  const estimate = c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const warm = c.msLeft > 0
  const soon = c.requests > 0 && warm && c.msLeft <= SOON_MS
  const cacheCard =
    c.requests > 0 && !warm
      ? `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`
      : `Warm cache bills input at 10%; expires ${c.ttl} after a reply`
  const dot = (color: string) => (
    <Text key="dot" color={color}>
      {'● '}
    </Text>
  )
  if (c.requests === 0) {
    pills.push({ key: 'cache', tone: 'calm', body: [dot(p.dotCold), <Text key="c" color={p.value}>{'cache warming'}</Text>], card: cacheCard })
  } else if (soon) {
    const text = short
      ? `◷ ${fmtCountdown(c.msLeft)} ${estimate}`
      : `◷ ${fmtCountdown(c.msLeft)} left · re-warm ${estimate}`
    pills.push({ key: 'cache', tone: 'amber', body: [<Text key="c" color={p.amberFg}>{text}</Text>], card: cacheCard })
  } else if (!warm) {
    // Cold is a price, not an error: neutral, no hue, no alarm.
    const text = short ? `cold ${estimate}` : `cache cold · next message ${estimate}`
    pills.push({ key: 'cache', tone: 'calm', body: [dot(p.dotCold), <Text key="c" color={p.value}>{text}</Text>], card: cacheCard })
  } else {
    // Mid-turn every step restarts the TTL, so a countdown would only bounce.
    const text = s.isWorking ? 'cache warm' : `cache ${fmtCountdown(c.msLeft)}`
    pills.push({ key: 'cache', tone: 'calm', body: [dot(p.dotWarm), <Text key="c" color={p.value}>{text}</Text>], card: cacheCard })
  }

  // ---- cost -------------------------------------------------------------
  const costBody: RenderChildren[] = [
    <Text key="v" color={p.value} bold>
      {fmtCost(s.costUsd)}
    </Text>,
  ]
  if (s.lastTurnUsd !== null && s.columns >= SHOW_LAST_COST) {
    costBody.push(<Text key="l" color={p.label}>{` last ${fmtSmallCost(s.lastTurnUsd)}`}</Text>)
  }
  pills.push({
    key: 'cost',
    tone: 'calm',
    body: costBody,
    card:
      s.lastTurnUsd === null
        ? 'What this session has cost so far'
        : `${fmtSmallCost(s.lastTurnUsd)} spent during your last message, subagents included`,
  })

  // ---- context ----------------------------------------------------------
  if (s.contextPercent !== undefined) {
    const frac = clamp01(s.contextPercent / 100)
    const tone: Tone = frac >= AMBER_AT ? 'amber' : 'calm'
    const fg = tone === 'amber' ? p.amberFg : p.value
    const withMeter = s.columns >= SHOW_CONTEXT_METER
    pills.push({
      key: 'ctx',
      tone,
      body: [
        <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
          {'context '}
        </Text>,
        withMeter ? meter('m', frac, tone) : null,
        <Text key="v" color={fg}>
          {`${withMeter ? ' ' : ''}${Math.round(s.contextPercent)}%${severityMark(frac)}`}
        </Text>,
      ],
      card: 'Conversation fill; near full, older turns get summarized',
    })
  }

  // ---- 5h limit ---------------------------------------------------------
  if (s.fiveHour) {
    const fiveHour = s.fiveHour
    const frac = clamp01(fiveHour.percentUsed / 100)
    const eta = fiveHour.etaMs
    const tone: Tone = frac >= AMBER_AT || eta !== null ? 'amber' : 'calm'
    if (tone === 'amber' || s.columns >= SHOW_FIVE_HOUR) {
      const fg = tone === 'amber' ? p.amberFg : p.value
      const reset = fmtResetsIn(fiveHour.resetsAt, s.now)
      pills.push({
        key: '5h',
        tone,
        body: [
          <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
            {'5h '}
          </Text>,
          meter('m', frac, tone),
          <Text key="v" color={fg}>
            {` ${Math.round(fiveHour.percentUsed)}%${severityMark(frac)}${eta === null ? '' : ` full in ${fmtEta(eta)}`}`}
          </Text>,
        ],
        card:
          reset === null || reset === 'now'
            ? 'Your 5-hour limit, across all your Claude use'
            : `5-hour limit across all your Claude use; resets in ${reset}`,
      })
    }
  }

  // ---- the expanded line: every fact, in words --------------------------
  const facts: string[] = []
  if (c.requests > 0 && c.hitRatio !== null) facts.push(`${Math.round(c.hitRatio * 100)}% of input served from cache`)
  if (c.misses > 0) facts.push(`${c.misses} unexpected rebuild${c.misses === 1 ? '' : 's'}`)
  // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
  facts.push(`cache lifetime ${c.ttl}${!c.ttlPinned && c.ttl === '1h' ? ' (assumed)' : ''}`)
  if (s.sevenDay) {
    const r = fmtResetsIn(s.sevenDay.resetsAt, s.now)
    facts.push(`7d limit ${Math.round(s.sevenDay.percentUsed)}%${r === null ? '' : r === 'now' ? ', resetting now' : `, resets in ${r}`}`)
  }
  if (s.fiveHour) {
    const r = fmtResetsIn(s.fiveHour.resetsAt, s.now)
    if (r !== null) facts.push(r === 'now' ? '5h resetting now' : `5h resets in ${r}`)
  }
  if (c.requests > 0) facts.push(`${c.requests} model call${c.requests === 1 ? '' : 's'}`)

  return (
    <Box flexDirection="column">
      <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
        {pills.map((spec, i) => pill(spec, i === pills.length - 1 ? 'right' : 'left'))}
        <Box flexGrow={1} />
        <Button key="more" label="⋯" plain dimColor onPress={act.toggleExpanded} />
      </Box>
      {s.expanded ? (
        <Box key="facts" flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color={p.label} wrap="wrap">
            {facts.join(' · ')}
          </Text>
          <Button key="hide" label="Hide" plain dimColor onPress={act.hide} />
        </Box>
      ) : null}
    </Box>
  )
}
