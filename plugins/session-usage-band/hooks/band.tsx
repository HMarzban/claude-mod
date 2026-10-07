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

  /** A pill carries its own foreground and background, never one of each. */
  const pill = (key: string, tone: Tone, body: RenderChildren[]) => {
    const fg = tone === 'amber' ? p.amberFg : p.value
    return p.filled ? (
      <Box key={key} backgroundColor={tone === 'amber' ? p.amberBg : p.surface} paddingX={1}>
        {body}
      </Box>
    ) : (
      <Box key={key}>
        <Text color={fg}>[</Text>
        {body}
        <Text color={fg}>]</Text>
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

  const pills: RenderChildren[] = []

  // ---- cache: the only pill that counts down --------------------------
  const estimate = c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const warm = c.msLeft > 0
  const soon = c.requests > 0 && warm && c.msLeft <= SOON_MS
  const dot = (color: string) => (
    <Text key="dot" color={color}>
      {'● '}
    </Text>
  )
  if (c.requests === 0) {
    pills.push(pill('cache', 'calm', [dot(p.dotCold), <Text key="c" color={p.value}>{'cache warming'}</Text>]))
  } else if (soon) {
    const text = short
      ? `◷ ${fmtCountdown(c.msLeft)} ${estimate}`
      : `◷ ${fmtCountdown(c.msLeft)} left · re-warm ${estimate}`
    pills.push(pill('cache', 'amber', [<Text key="c" color={p.amberFg}>{text}</Text>]))
  } else if (!warm) {
    // Cold is a price, not an error: neutral, no hue, no alarm.
    const text = short ? `cold ${estimate}` : `cache cold · next message ${estimate}`
    pills.push(pill('cache', 'calm', [dot(p.dotCold), <Text key="c" color={p.value}>{text}</Text>]))
  } else {
    // Mid-turn every step restarts the TTL, so a countdown would only bounce.
    const text = s.isWorking ? 'cache warm' : `cache ${fmtCountdown(c.msLeft)}`
    pills.push(pill('cache', 'calm', [dot(p.dotWarm), <Text key="c" color={p.value}>{text}</Text>]))
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
  pills.push(pill('cost', 'calm', costBody))

  // ---- context ----------------------------------------------------------
  if (s.contextPercent !== undefined) {
    const frac = clamp01(s.contextPercent / 100)
    const tone: Tone = frac >= AMBER_AT ? 'amber' : 'calm'
    const fg = tone === 'amber' ? p.amberFg : p.value
    const withMeter = s.columns >= SHOW_CONTEXT_METER
    pills.push(
      pill('ctx', tone, [
        <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
          {'context '}
        </Text>,
        withMeter ? meter('m', frac, tone) : null,
        <Text key="v" color={fg}>
          {`${withMeter ? ' ' : ''}${Math.round(s.contextPercent)}%${severityMark(frac)}`}
        </Text>,
      ]),
    )
  }

  // ---- 5h limit ---------------------------------------------------------
  if (s.fiveHour) {
    const frac = clamp01(s.fiveHour.percentUsed / 100)
    const eta = s.fiveHour.etaMs
    const tone: Tone = frac >= AMBER_AT || eta !== null ? 'amber' : 'calm'
    if (tone === 'amber' || s.columns >= SHOW_FIVE_HOUR) {
      const fg = tone === 'amber' ? p.amberFg : p.value
      pills.push(
        pill('5h', tone, [
          <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
            {'5h '}
          </Text>,
          meter('m', frac, tone),
          <Text key="v" color={fg}>
            {` ${Math.round(s.fiveHour.percentUsed)}%${severityMark(frac)}${eta === null ? '' : ` full in ${fmtEta(eta)}`}`}
          </Text>,
        ]),
      )
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
        {pills}
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
