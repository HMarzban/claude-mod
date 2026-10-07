import type { ElementTable, RenderChildren, RenderElement } from 'claude-code'
import { SOON_MS, TTL_MS } from './cache'
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
    /** Every token since the conversation began, subagents included. */
    tokens: { sent: number; back: number; cached: number }
  }
  costUsd: number
  lastTurnUsd: number | null
  context: {
    tokens: number | undefined
    window: number
    percent: number | undefined
    /** Where auto-compaction runs, when it is on. */
    compactAt: number | undefined
  }
  fiveHour: { percentUsed: number; resetsAt: string | undefined; etaMs: number | null } | undefined
  sevenDay: { percentUsed: number; resetsAt: string | undefined } | undefined
  /** Any other window the engine reports, such as a gateway's spend_limit. */
  otherLimits: Array<{ kind: string; percentUsed: number; resetsAt: string | undefined }>
}

export type BandActions = {
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}

// Below this, wording turns short. Everything else fits by measure (squeeze).
const SHORT_BELOW = 68
const FIVE_HOUR_MS = 5 * 3600_000
const WEEK_MS = 7 * 24 * 3600_000
const AMBER_AT = 0.8
// Within this share of the compaction point, the context chip counts down.
const COMPACT_NEAR = 0.9
const METER_CELLS = 6

type Tone = 'calm' | 'amber'
type Icon = 'cost' | 'tokens' | 'context' | 'five' | 'week' | 'reset'

const MAX_SQUEEZE = 9

/** How a surface lays text out against its bodyColumns: the terminal one
 *  cell a character; the desktop's proportional font runs narrower, about
 *  three quarters of a column, at roughly 10px a column. */
type Measure = { text: number; pxPerCell: number }
const TERMINAL: Measure = { text: 1, pxPerCell: 8 }
const DESKTOP: Measure = { text: 0.75, pxPerCell: 10 }

/** Columns a drawn row takes: text, padding, gaps and Button labels. Hidden
 *  cards take none; an Svg takes its width in columns, rounded up. */
const cellsOf = (n: RenderChildren, m: Measure): number => {
  if (typeof n === 'string' || typeof n === 'number') return [...String(n)].length * m.text
  if (n === null || n === undefined || typeof n === 'boolean') return 0
  if (Array.isArray(n)) return n.reduce((sum: number, k: RenderChildren) => sum + cellsOf(k, m), 0)
  const node = n as { type?: string; props?: Record<string, unknown>; children?: RenderChildren[] }
  if (node.props?.position === 'absolute') return 0
  if (node.type === 'Button') return [...String(node.props?.label ?? '')].length * m.text
  if (node.type === 'Svg') return Math.ceil(Number(node.props?.width ?? 64) / m.pxPerCell)
  const kids = (node.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
  const pad = typeof node.props?.paddingX === 'number' ? 2 * node.props.paddingX : 0
  const gap = typeof node.props?.columnGap === 'number' ? node.props.columnGap * Math.max(0, kids.length - 1) : 0
  return kids.reduce((sum: number, k) => sum + cellsOf(k, m), 0) + pad + gap
}

export const drawBand = (el: ElementTable, s: BandSnapshot, act: BandActions): RenderElement => {
  const { Box, Button, Text } = el
  const p = s.palette
  const c = s.cache
  // Svg draws on the desktop alone (other surfaces hold the element but drop
  // it), and its markup takes hex: theme keys can't reach inside it, so plain
  // appearance keeps text.
  const Svg = s.surface === 'desktop' && p.filled && 'Svg' in el ? el.Svg : undefined

  type PillSpec = { key: string; tone: Tone; body: RenderChildren[]; card: string; bare?: boolean; bg?: string; fg?: string }

  // A pill carries its own foreground and background, never one of each.
  // Its card is a child, so the engine counts the pointer on the card as on
  // the pill and reading it keeps the pill hovered. The card has no key: a
  // keyed Box is its own hover scope, and a hidden one could never be
  // hovered. One line, since a collapsed band is one row. Plain has no
  // background to cover the row with, so no cards; the expanded line says it.
  // A bare pill (the battery) paints its own background in its Texts.
  const pill = ({ key, tone, body, card, bare, bg, fg: tint }: PillSpec, anchor: 'left' | 'right') => {
    const fg = tone === 'amber' ? p.amberFg : (tint ?? p.value)
    if (!p.filled) {
      return (
        <Box key={key}>
          <Text color={fg}>[</Text>
          {body}
          <Text color={fg}>]</Text>
        </Box>
      )
    }
    const cardBox = (
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
    )
    return bare ? (
      <Box key={key}>
        {body}
        {cardBox}
      </Box>
    ) : (
      <Box key={key} backgroundColor={tone === 'amber' ? p.amberBg : (bg ?? p.surface)} paddingX={1}>
        {body}
        {cardBox}
      </Box>
    )
  }

  // Desktop icons are small SVGs; elsewhere a glyph stands in, and the cost
  // keeps its "$" in the figure either way.
  const ICON_PATHS: Record<Icon, (color: string) => string> = {
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
  const GLYPH: Record<Icon, string> = { cost: '', tokens: 'Σ ', context: '◔ ', five: '', week: '', reset: '↻ ' }
  const ALT: Record<Icon, string> = { cost: 'cost', tokens: 'tokens', context: 'context', five: 'five-hour', week: 'week', reset: 'resets' }
  const icon = (name: Icon, color: string) => {
    if (Svg) {
      const source = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${ICON_PATHS[name](color)}</svg>`
      return <Svg key={`i-${name}`} source={source} alt={ALT[name]} width={16} height={16} />
    }
    return GLYPH[name] ? (
      <Text key={`i-${name}`} color={color}>
        {GLYPH[name]}
      </Text>
    ) : null
  }

  const meter = (key: string, frac: number, tone: Tone, tick?: number, accent?: string) => {
    const fill = tone === 'amber' ? p.amberFg : (accent ?? p.meterFill)
    if (Svg) {
      // Never name a local `h`: JSX compiles to the global h().
      const width = 44
      const height = 6
      const fillWidth = Math.round(clamp01(frac) * width)
      const tickX = tick === undefined ? null : Math.min(width - 1, Math.max(1, Math.round(clamp01(tick) * width)))
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 2}" viewBox="0 0 ${width} ${height + 2}">` +
        `<rect y="1" width="${width}" height="${height}" rx="3" fill="${p.meterTrack}"/>` +
        (fillWidth > 0 ? `<rect y="1" width="${fillWidth}" height="${height}" rx="3" fill="${fill}"/>` : '') +
        (tickX === null ? '' : `<rect class="tick" x="${tickX - 1}" y="0" width="2" height="${height + 2}" fill="${p.value}" opacity=".7"/>`) +
        '</svg>'
      return <Svg key={key} source={source} alt={`${Math.round(clamp01(frac) * 100)}%`} width={width} height={height + 2} />
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

  // ---- the row's pieces, at a given degree of squeeze -------------------
  // Each level gives up one more piece, least important first, so the row
  // always fits on one line and an escalated pill is the last to lose words:
  // 1 tokens chip · 2 7d reset time · 3 5h reset time · 4 context meter ·
  // 5 a calm 7d chip · 6 the limit bars · 7 short wording · 8 a calm
  // context chip · 9 a calm 5h chip.
  const estimate = c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const warm = c.msLeft > 0
  const soon = c.requests > 0 && warm && c.msLeft <= SOON_MS
  const cacheCard =
    c.requests > 0 && !warm
      ? `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`
      : `Warm cache bills input at 10%; expires ${c.ttl} after a reply`
  const tokenTotal = c.tokens.sent + c.tokens.back + c.tokens.cached
  const tokenBreakdown = `sent ${fmtTokens(c.tokens.sent)} · back ${fmtTokens(c.tokens.back)} · from cache ${fmtTokens(c.tokens.cached)}`

  // The cache pill is a battery: its charge is the share of the TTL left, and
  // the fill is painted as the background of the leading characters, so it
  // drains right to left as the hour runs out. Amber in the last minute,
  // empty and neutral when cold.
  const battery = (text: string, charge: number, tone: Tone): RenderChildren[] => {
    const padded = ` ${text} `
    const chars = [...padded]
    const cut = Math.round(clamp01(charge) * chars.length)
    const fg = tone === 'amber' ? p.amberFg : p.value
    const fill = tone === 'amber' ? p.batteryAmber : p.batteryFill
    const rest = tone === 'amber' ? p.amberBg : p.surface
    return [
      cut > 0 ? (
        <Text key="bf" color={fg} backgroundColor={fill}>
          {chars.slice(0, cut).join('')}
        </Text>
      ) : null,
      cut < chars.length ? (
        <Text key="be" color={fg} backgroundColor={rest}>
          {chars.slice(cut).join('')}
        </Text>
      ) : null,
    ]
  }

  // The desktop's battery: an outline with a tip, its charge a bar inside.
  const batteryIcon = (charge: number, tone: Tone) => {
    if (!Svg) return null
    const outline = tone === 'amber' ? p.amberFg : p.label
    const fill = tone === 'amber' ? p.amberFg : p.dotWarm
    const inner = 15
    const width = Math.round(clamp01(charge) * inner * 10) / 10
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="12" viewBox="0 0 22 12">' +
      `<rect x="0.75" y="0.75" width="18.5" height="10.5" rx="3" fill="none" stroke="${outline}" stroke-width="1.5"/>` +
      `<rect x="19.75" y="4" width="1.75" height="4" rx="0.8" fill="${outline}"/>` +
      `<rect class="charge" x="2.5" y="2.5" width="${width}" height="7" rx="1.5" fill="${fill}"/>` +
      '</svg>'
    const alt = charge <= 0 ? 'battery empty' : `battery ${Math.round(clamp01(charge) * 100)}% left`
    return <Svg key="battery" source={source} alt={alt} width={22} height={12} />
  }

  const buildPills = (squeeze: number): PillSpec[] => {
    const pills: PillSpec[] = []
    const short = s.columns < SHORT_BELOW || squeeze >= 7

    // ---- cache: the only pill that counts down ------------------------
    const charge = c.requests === 0 ? 0 : s.isWorking && !soon && warm ? 1 : c.msLeft / TTL_MS[c.ttl]
    let cacheText: string
    let cacheTone: Tone = 'calm'
    if (c.requests === 0) {
      cacheText = 'cache warming'
    } else if (soon) {
      cacheTone = 'amber'
      cacheText = short
        ? `${fmtCountdown(c.msLeft)} ${estimate}`
        : `${fmtCountdown(c.msLeft)} left · re-warm ${estimate}`
    } else if (!warm) {
      // Cold is a price, not an error: neutral, no hue, no alarm.
      cacheText = short ? `cold ${estimate}` : `cache cold · next message ${estimate}`
    } else {
      // Mid-turn every step restarts the TTL, so a countdown would only bounce.
      cacheText = s.isWorking ? 'cache warm' : `cache ${fmtCountdown(c.msLeft)}`
    }
    if (Svg) {
      // Desktop: a normal rounded pill led by a battery icon that drains. The
      // text-background battery below would paint a square-cornered block.
      pills.push({
        key: 'cache',
        tone: cacheTone,
        body: [
          batteryIcon(charge, cacheTone),
          <Text key="c" color={cacheTone === 'amber' ? p.amberFg : p.value}>
            {` ${cacheText}`}
          </Text>,
        ],
        card: cacheCard,
      })
    } else if (p.filled) {
      pills.push({ key: 'cache', tone: cacheTone, body: battery(`◷ ${cacheText}`, charge, cacheTone), card: cacheCard, bare: true })
    } else {
      const dot = (
        <Text key="dot" color={c.requests > 0 && warm ? p.dotWarm : p.dotCold}>
          {'● '}
        </Text>
      )
      const fg = cacheTone === 'amber' ? p.amberFg : p.value
      pills.push({
        key: 'cache',
        tone: cacheTone,
        body: [cacheTone === 'amber' ? null : dot, <Text key="c" color={fg}>{cacheTone === 'amber' ? `◷ ${cacheText}` : cacheText}</Text>],
        card: cacheCard,
      })
    }

    // ---- cost ---------------------------------------------------------
    const costBody: RenderChildren[] = [
      icon('cost', p.coin),
      <Text key="v" color={p.value} bold>
        {`${Svg ? ' ' : ''}${fmtCost(s.costUsd)}`}
      </Text>,
    ]
    pills.push({
      key: 'cost',
      tone: 'calm',
      body: costBody,
      card:
        s.lastTurnUsd === null
          ? 'What this session has cost so far'
          : `${fmtSmallCost(s.lastTurnUsd)} spent during your last message, subagents included`,
    })

    // ---- tokens -------------------------------------------------------
    // No width floor: it shows whenever it fits, and is the first to go.
    if (c.requests > 0 && squeeze < 1) {
      pills.push({
        key: 'tokens',
        tone: 'calm',
        body: [
          icon('tokens', p.label),
          <Text key="v" color={p.value}>
            {`${Svg ? ' ' : ''}${fmtTokens(tokenTotal)}`}
          </Text>,
        ],
        card: tokenBreakdown,
      })
    }

    // ---- context ------------------------------------------------------
    const ctx = s.context
    if (ctx.percent !== undefined || ctx.tokens !== undefined) {
      const used = ctx.tokens ?? ((ctx.percent ?? 0) / 100) * ctx.window
      const frac = clamp01(used / ctx.window)
      const compactAt = ctx.compactAt
      const toCompact = compactAt === undefined ? null : Math.max(0, compactAt - used)
      const near = compactAt !== undefined && used >= compactAt * COMPACT_NEAR
      const tone: Tone = near || (compactAt === undefined && frac >= AMBER_AT) ? 'amber' : 'calm'
      if (tone === 'amber' || squeeze < 8) {
        const fg = tone === 'amber' ? p.amberFg : p.value
        const withMeter = squeeze < 4
        const amount =
          squeeze >= 7 || ctx.tokens === undefined
            ? `${Math.round(frac * 100)}%`
            : `${fmtTokens(ctx.tokens)} / ${fmtTokens(ctx.window)}`
        const mark = compactAt === undefined ? severityMark(frac) : ''
        const countdown = near && toCompact !== null ? ` · compacts in ~${fmtTokens(toCompact)}` : ''
        pills.push({
          key: 'ctx',
          tone,
          body: [
            icon('context', tone === 'amber' ? p.amberFg : p.label),
            Svg ? <Text key="sp"> </Text> : null,
            withMeter ? meter('m', frac, tone, compactAt === undefined ? undefined : compactAt / ctx.window) : null,
            <Text key="v" color={fg}>
              {`${withMeter ? ' ' : ''}${amount}${mark}${countdown}`}
            </Text>,
          ],
          card:
            compactAt === undefined
              ? 'Conversation fill; near full, older turns get summarized'
              : `Auto-compacts at ${fmtTokens(compactAt)}; ${fmtTokens(toCompact ?? 0)} to go`,
        })
      }
    }

    // ---- 5h and 7d limits ---------------------------------------------
    // Each chip: its usage on a bar, a tick at the share of the window gone
    // (the bar past the tick is a pace that fills it early), and the reset.
    const limitChip = (o: {
      key: '5h' | '7d'
      name: string
      icon: Icon
      percentUsed: number
      resetsAt: string | undefined
      windowMs: number
      tone: Tone
      pace: string
      showReset: boolean
      bg: string
      fg: string
      accent: string
      card: string
    }): PillSpec => {
      const frac = clamp01(o.percentUsed / 100)
      const resetAt = o.resetsAt === undefined ? NaN : Date.parse(o.resetsAt)
      const gone = Number.isNaN(resetAt) ? undefined : clamp01(1 - (resetAt - s.now) / o.windowMs)
      const reset = fmtResetsIn(o.resetsAt, s.now)
      const amber = o.tone === 'amber'
      const fg = amber ? p.amberFg : o.fg
      const accent = amber ? p.amberFg : o.accent
      return {
        key: o.key,
        tone: o.tone,
        bg: o.bg,
        fg: o.fg,
        body: [
          icon(o.icon, accent),
          <Text key="l" color={fg}>
            {`${Svg ? ' ' : ''}${o.name} `}
          </Text>,
          squeeze >= 6 ? null : meter('m', frac, o.tone, gone, o.accent),
          <Text key="v" color={fg} bold>
            {` ${Math.round(o.percentUsed)}%${severityMark(frac)}${o.pace}`}
          </Text>,
          o.showReset && reset !== null ? (
            <Text key="d" color={p.label}>
              {' │ '}
            </Text>
          ) : null,
          o.showReset && reset !== null ? icon('reset', accent) : null,
          o.showReset && reset !== null ? (
            <Text key="r" color={fg}>
              {`${Svg ? ' ' : ''}${reset === 'now' ? 'now' : reset}`}
            </Text>
          ) : null,
        ],
        card: o.card,
      }
    }

    if (s.fiveHour) {
      const fiveHour = s.fiveHour
      const frac = clamp01(fiveHour.percentUsed / 100)
      const eta = fiveHour.etaMs
      const tone: Tone = frac >= AMBER_AT || eta !== null ? 'amber' : 'calm'
      if (tone === 'amber' || squeeze < 9) {
        const reset = fmtResetsIn(fiveHour.resetsAt, s.now)
        pills.push(
          limitChip({
            key: '5h',
            name: '5h',
            icon: 'five',
            percentUsed: fiveHour.percentUsed,
            resetsAt: fiveHour.resetsAt,
            windowMs: FIVE_HOUR_MS,
            tone,
            pace: eta === null ? '' : short ? ` ${fmtEta(eta)}` : ` full in ${fmtEta(eta)}`,
            showReset: tone === 'amber' || squeeze < 3,
            bg: p.fiveBg,
            fg: p.fiveFg,
            accent: p.fiveAccent,
            card:
              reset === null || reset === 'now'
                ? 'Your 5-hour limit, across all your Claude use'
                : `5-hour limit across all your Claude use; resets in ${reset}`,
          }),
        )
      }
    }

    if (s.sevenDay) {
      const sevenDay = s.sevenDay
      const tone: Tone = clamp01(sevenDay.percentUsed / 100) >= AMBER_AT ? 'amber' : 'calm'
      if (tone === 'amber' || squeeze < 5) {
        const reset = fmtResetsIn(sevenDay.resetsAt, s.now)
        pills.push(
          limitChip({
            key: '7d',
            name: '7d',
            icon: 'week',
            percentUsed: sevenDay.percentUsed,
            resetsAt: sevenDay.resetsAt,
            windowMs: WEEK_MS,
            tone,
            pace: '',
            showReset: tone === 'amber' || squeeze < 2,
            bg: p.weekBg,
            fg: p.weekFg,
            accent: p.weekAccent,
            card:
              reset === null || reset === 'now'
                ? 'Your weekly limit, across all your Claude use'
                : `Weekly limit across all your Claude use; resets in ${reset}`,
          }),
        )
      }
    }
    return pills
  }

  const rowOf = (pills: PillSpec[]): RenderElement => (
    <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
      {pills.map((spec, i) => pill(spec, i === pills.length - 1 ? 'right' : 'left'))}
      <Box flexGrow={1} />
      <Button key="more" label="⋯" plain dimColor onPress={act.toggleExpanded} />
    </Box>
  )

  let row = rowOf(buildPills(0))
  const measure = s.surface === 'desktop' ? DESKTOP : TERMINAL
  for (let squeeze = 1; squeeze <= MAX_SQUEEZE && cellsOf(row, measure) > s.columns; squeeze++) {
    row = rowOf(buildPills(squeeze))
  }

  // ---- the expanded line: every fact, in words --------------------------
  const facts: string[] = []
  if (c.requests > 0 && c.hitRatio !== null) facts.push(`${Math.round(c.hitRatio * 100)}% of input served from cache`)
  if (c.requests > 0) facts.push(`tokens: ${tokenBreakdown}`)
  if (s.lastTurnUsd !== null) facts.push(`last message ${fmtSmallCost(s.lastTurnUsd)}`)
  if (c.misses > 0) facts.push(`${c.misses} unexpected rebuild${c.misses === 1 ? '' : 's'}`)
  // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
  facts.push(`cache lifetime ${c.ttl}${!c.ttlPinned && c.ttl === '1h' ? ' (assumed)' : ''}`)
  if (s.context.compactAt !== undefined) facts.push(`auto-compacts at ${fmtTokens(s.context.compactAt)}`)
  if (s.sevenDay) {
    const r = fmtResetsIn(s.sevenDay.resetsAt, s.now)
    facts.push(`7d limit ${Math.round(s.sevenDay.percentUsed)}%${r === null ? '' : r === 'now' ? ', resetting now' : `, resets in ${r}`}`)
  }
  if (s.fiveHour) {
    // The percentage too: below 100 columns a calm 5h pill steps aside.
    const r = fmtResetsIn(s.fiveHour.resetsAt, s.now)
    facts.push(`5h limit ${Math.round(s.fiveHour.percentUsed)}%${r === null ? '' : r === 'now' ? ', resetting now' : `, resets in ${r}`}`)
  }
  for (const limit of s.otherLimits) {
    const name = limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' ')
    const r = fmtResetsIn(limit.resetsAt, s.now)
    facts.push(`${name} limit ${Math.round(limit.percentUsed)}%${r === null ? '' : r === 'now' ? ', resetting now' : `, resets in ${r}`}`)
  }
  if (c.requests > 0) facts.push(`${c.requests} model call${c.requests === 1 ? '' : 's'}`)

  return (
    <Box flexDirection="column">
      {row}
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
