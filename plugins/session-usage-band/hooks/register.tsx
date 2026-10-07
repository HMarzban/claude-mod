import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'

const isHidden = atom({ plugin: 'session-usage-band', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

// ── appearance ─────────────────────────────────────────────────────────
// A filled pill needs its foreground and background from one source: a theme
// key resolves against the user's theme, a hex does not, and mixing them makes
// a pill that is legible on one theme and blank on the other. Nothing in the
// API reports whether the theme is light or dark, so the palette is declared
// rather than guessed: CC_BAND_APPEARANCE = dark | light | plain.
type Palette = {
  filled: boolean
  surface: string
  value: string
  label: string
  muted: string
  warmBg: string
  warmFg: string
  soonBg: string
  soonFg: string
  coldBg: string
  coldFg: string
}

const DARK: Palette = {
  filled: true,
  surface: '#2b2b33',
  value: '#ececf2',
  label: '#7e7e8a',
  muted: '#8a8a94',
  warmBg: '#1e3324',
  warmFg: '#9fd6a3',
  soonBg: '#3a2f17',
  soonFg: '#f0c969',
  coldBg: '#2a2a2e',
  coldFg: '#9a9aa4',
}

const LIGHT: Palette = {
  filled: true,
  surface: '#ededf2',
  value: '#1d1d22',
  label: '#8b8b96',
  muted: '#7a7a86',
  warmBg: '#dff0e0',
  warmFg: '#1f5c2e',
  soonBg: '#fbeccd',
  soonFg: '#7a4e06',
  coldBg: '#e6e6ea',
  coldFg: '#5c5c66',
}

// No backgrounds at all: every colour is a theme key, so it follows whatever
// theme the user has. The safe fallback, and what NO_COLOR terminals want.
const PLAIN: Palette = {
  filled: false,
  surface: '',
  value: 'text',
  label: 'subtle',
  muted: 'subtle',
  warmBg: '',
  warmFg: 'success',
  soonBg: '',
  soonFg: 'warning',
  coldBg: '',
  coldFg: 'subtle',
}

let palette: Palette = DARK

// ── prompt cache ───────────────────────────────────────────────────────
type Ttl = '5m' | '1h'
const TTL_MS: Record<Ttl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

const MISS_MIN_TOKENS = 2000
const MISS_MIN_SHARE = 0.05
const SOON_MS = 60_000

const cache = {
  ttl: '1h' as Ttl,
  ttlPinned: false,
  requests: 0,
  read: 0,
  written: 0,
  uncached: 0,
  output: 0,
  misses: 0,
  lastAt: 0,
  window: 0,
  // What the last main-loop request left in the cache. The window also holds
  // the response, which is only written on the next request, never read.
  cached: 0,
  rebuilding: false,
}

const resetCache = (): void => {
  cache.ttl = '1h'
  cache.ttlPinned = false
  cache.requests = 0
  cache.read = 0
  cache.written = 0
  cache.uncached = 0
  cache.output = 0
  cache.misses = 0
  cache.lastAt = 0
  cache.window = 0
  cache.cached = 0
  cache.rebuilding = false
}

const recordResponse = (
  usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens: number
    cache_creation_input_tokens: number
  },
  now: number,
  isMain: boolean,
): void => {
  const read_ = usage.cache_read_input_tokens
  const written = usage.cache_creation_input_tokens
  const fresh = usage.input_tokens

  // The session's bill includes every subagent, so their tokens count toward
  // the totals the rate is solved from. Their prefixes are their own, though:
  // they say nothing about the main conversation's cache or its countdown.
  cache.read += read_
  cache.written += written
  cache.uncached += fresh
  cache.output += usage.output_tokens
  if (!isMain) return

  const prefix = cache.cached
  const gap = cache.requests > 0 ? now - cache.lastAt : 0

  if (prefix > 0 && !cache.rebuilding && gap <= TTL_MS[cache.ttl]) {
    const shortfall = prefix - read_
    if (shortfall >= MISS_MIN_TOKENS && shortfall > prefix * MISS_MIN_SHARE) {
      if (!cache.ttlPinned && cache.ttl === '1h' && read_ === 0 && gap > TTL_MS['5m']) {
        cache.ttl = '5m'
      } else {
        cache.misses += 1
      }
    }
  }

  cache.requests += 1
  cache.window = fresh + read_ + written + usage.output_tokens
  cache.cached = read_ + written
  cache.lastAt = now
  cache.rebuilding = false
}

/** What a cold cache would cost, in dollars.
 *
 *  No pricing table is available to a mod, so the rate is solved from the
 *  session's own bill. Anthropic models hold the same ratios between the four
 *  rates — a cache write is 1.25x base input, a cache read 0.1x, output 5x —
 *  so one unknown remains:
 *
 *    cost = r * (uncached + 1.25*written + 0.1*read + 5*output)
 *
 *  Solve for r, then price the re-warm as a cache write of the whole window.
 *  It self-calibrates to whatever model and plan are in force, and it is an
 *  estimate on top of an estimate (the session cost is itself computed at list
 *  price), so it is always shown with a "~" and never without one. */
const WRITE_MULT = 1.25
const READ_MULT = 0.1
const OUTPUT_MULT = 5

const reWarmUsd = (sessionCost: number | undefined): number | null => {
  if (!sessionCost || sessionCost <= 0) return null
  const weighted =
    cache.uncached + WRITE_MULT * cache.written + READ_MULT * cache.read + OUTPUT_MULT * cache.output
  if (weighted <= 0) return null
  const rate = sessionCost / weighted
  const usd = rate * WRITE_MULT * cache.window
  return Number.isFinite(usd) && usd > 0 ? usd : null
}

const fmtEstimate = (usd: number): string => (usd < 0.01 ? '~<$0.01' : `~$${usd.toFixed(2)}`)

const hitRatio = (): number | null => {
  const total = cache.read + cache.written + cache.uncached
  return total > 0 ? cache.read / total : null
}

const msLeft = (now: number): number =>
  cache.requests === 0 ? TTL_MS[cache.ttl] : Math.max(0, cache.lastAt + TTL_MS[cache.ttl] - now)

// ── formatting ─────────────────────────────────────────────────────────
// Widths are fixed: in a monospace row a changing digit count is motion.
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

const fmtTokens = (n: number): string => {
  const v = Math.max(0, Math.round(n))
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `${Math.round(v / 1000)}k`
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

const fmtCost = (usd: number): string => (usd >= 1000 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

const fmtElapsed = (ms: number): string => {
  const secs = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

/** Above ten minutes, whole minutes; below, M:SS. The countdown is still for
 *  most of its life and only starts ticking when ticking means something. */
const fmtCountdown = (ms: number): string => {
  const secs = Math.max(0, Math.round(ms / 1000))
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600)
    return `${h}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}m`
  }
  if (secs >= 600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

const fmtResetsIn = (iso: string | undefined, now: number): string | null => {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const delta = Math.floor((at - now) / 1000)
  if (delta <= 0) return 'now'
  const h = Math.floor(delta / 3600)
  const m = Math.floor((delta % 3600) / 60)
  const d = Math.floor(h / 24)
  if (d) return `${d}d ${h % 24}h`
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

const WINDOW_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

// Three discrete theme-keyed bands, not a hex gradient: a gradient needs
// 24-bit colour, cannot be contrast-checked at every stop, and carries
// severity by hue alone.
const severity = (frac: number): 'success' | 'warning' | 'error' =>
  frac >= 0.9 ? 'error' : frac >= 0.7 ? 'warning' : 'success'

/** A mark that survives red/green colour blindness and NO_COLOR alike. */
const severityMark = (frac: number): string => (frac >= 0.95 ? '!!' : frac >= 0.8 ? '!' : '')

export const register: Register = on => {
  // What the band last drew, so a timer only repaints when it would change.
  let lastPaintKey = ''
  const warned = new Set<string>()

  on('session.start', async ($, e, next) => {
    resetCache()

    const appearance = (await $.env.get('CC_BAND_APPEARANCE'))?.toLowerCase()
    const noColor = await $.env.get('NO_COLOR')
    palette = noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK

    const force5m = await $.env.get('FORCE_PROMPT_CACHING_5M')
    const chosen = await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL')
    const enable1h = await $.env.get('ENABLE_PROMPT_CACHING_1H')
    if (force5m === '1') {
      cache.ttl = '5m'
      cache.ttlPinned = true
    } else if (chosen === '5m' || chosen === '1h') {
      cache.ttl = chosen
      cache.ttlPinned = true
    } else if (enable1h === '1') {
      cache.ttl = '1h'
      cache.ttlPinned = true
    }

    // One timer, but it only repaints when the text would actually differ, so
    // the band is still for most of a warm cache and ticks in its last minute.
    $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const left = msLeft(now)
        const key = `${fmtCountdown(left)}|${left > 0}`
        if (key !== lastPaintKey) {
          lastPaintKey = key
          $.ui.invalidate('ui.render')
        }
      })()
    })

    $.command.register({
      name: 'usage-band',
      description: 'Show, hide, expand or collapse the session usage band',
    })
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    const isMain = e.agentId === undefined
    if (result?.usage) {
      recordResponse(result.usage, await $.clock.now(), isMain)
      $.ui.invalidate('ui.render')
    }
    if (isMain && result?.stopReason === 'compaction') {
      cache.rebuilding = true
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const note = (key: string, frac: number, text: string): void => {
      if (frac >= 0.9 && !warned.has(key)) {
        warned.add(key)
        $.ui.toast(text)
      } else if (frac < 0.85) {
        warned.delete(key)
      }
    }

    if (e.context.percent !== undefined) {
      note(
        'context',
        e.context.percent / 100,
        `Context is at ${Math.round(e.context.percent)}%. The next few messages will trigger a compaction.`,
      )
    }
    for (const limit of e.rateLimits) {
      if (limit.kind === 'five_hour') {
        note('five_hour', limit.percentUsed / 100, `5-hour limit is at ${Math.round(limit.percentUsed)}%.`)
      }
    }

    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e, next) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'more' || arg === 'less') {
      const want = arg === 'more'
      await update($, isExpanded, () => want)
      await update($, isHidden, () => false)
      return { text: want ? 'Usage band expanded.' : 'Usage band collapsed.' }
    }

    const hidden = await read($, isHidden)
    if (arg === 'show' || arg === 'hide') {
      await update($, isHidden, () => arg === 'hide')
      return { text: arg === 'hide' ? 'Usage band hidden. /usage-band shows it again.' : 'Usage band shown.' }
    }

    await update($, isHidden, () => !hidden)
    return {
      text: hidden
        ? 'Usage band shown. /usage-band more shows every row.'
        : 'Usage band hidden. /usage-band shows it again.',
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const usage = await $.session.usage()
    const now = await $.clock.now()
    const expanded = await read($, isExpanded)

    const { Box, Button, Text } = $.ui.resolve(e)
    const cols = e.props.bodyColumns
    const wide = cols >= 100
    const mid = cols >= 68

    const p = palette

    /** A pill carries its own foreground and background, never one of each. */
    const pill = (key: string, bg: string, fg: string, padX: number, body: RenderChildren[]) =>
      p.filled ? (
        <Box key={key} backgroundColor={bg} paddingX={padX}>
          {body}
        </Box>
      ) : (
        <Box key={key} paddingRight={1}>
          <Text color={fg}>[</Text>
          {body}
          <Text color={fg}>]</Text>
        </Box>
      )

    // Two glyphs only: partial blocks jitter across fonts and read as noise to
    // a screen reader. The number beside the bar always carries the value.
    const bar = (frac: number, width: number, key: string) => {
      const filled = Math.round(clamp01(frac) * width)
      return (
        <Text key={key} color={severity(frac)}>
          {'█'.repeat(filled)}
          <Text dimColor>{'░'.repeat(width - filled)}</Text>
        </Text>
      )
    }

    // ---- the cache pill: the hero -------------------------------------
    const left = msLeft(now)
    const warm = left > 0
    const soon = warm && left <= SOON_MS
    const ratio = hitRatio()

    const reWarm = reWarmUsd(usage.cost?.usd)
    // The money is the point, so narrow widths shorten the wording around it
    // rather than dropping it.
    const reWarmText = (): string => {
      const tokens = fmtTokens(cache.window)
      if (reWarm === null) return mid ? `${tokens} to re-warm` : tokens
      return mid ? `${tokens} (${fmtEstimate(reWarm)}) to re-warm` : `${tokens} ${fmtEstimate(reWarm)}`
    }

    const cacheBody: RenderChildren[] = []
    let cacheBg = p.warmBg
    let cacheFg = p.warmFg

    if (cache.requests === 0) {
      cacheBody.push(
        <Text key="cw" color={p.coldFg}>
          {'◷'} cache warming
        </Text>,
      )
      cacheBg = p.coldBg
      cacheFg = p.coldFg
    } else if (soon) {
      cacheBg = p.soonBg
      cacheFg = p.soonFg
      cacheBody.push(
        <Text key="cs" color={p.soonFg}>
          {'◷'} {fmtCountdown(left)} {'·'} {reWarmText()}
        </Text>,
      )
    } else if (warm) {
      cacheBody.push(
        <Text key="cwm" color={p.warmFg}>
          {'◷'} cache {fmtCountdown(left)}
        </Text>,
      )
      if (wide && ratio !== null) {
        cacheBody.push(
          <Text key="ch" color={p.warmFg}>
            {' · hit '}
            {Math.round(ratio * 100)}%
          </Text>,
        )
      }
    } else {
      // Cold is a price, not an error: neutral, no hue, no alarm.
      cacheBg = p.coldBg
      cacheFg = p.coldFg
      cacheBody.push(
        <Text key="cc" color={p.coldFg}>
          {'◷'} cold {'·'} {reWarmText()}
        </Text>,
      )
    }

    // ---- row 1 ---------------------------------------------------------
    const pills: RenderChildren[] = [pill('cache', cacheBg, cacheFg, p.filled ? 2 : 1, cacheBody)]

    pills.push(
      pill('cost', p.surface, p.value, 1, [
        <Text key="cost" color={p.value} bold>
          {fmtCost(usage.cost?.usd ?? 0)}
        </Text>,
      ]),
    )

    if (cache.requests > 0) {
      const sent = cache.uncached + cache.written
      const tokenBody: RenderChildren[] = mid
        ? [
            <Text key="t1" color={p.label}>
              sent{' '}
            </Text>,
            <Text key="t2" color={p.value}>
              {fmtTokens(sent)}
            </Text>,
            <Text key="t3" color={p.label}>
              {' · back '}
            </Text>,
            <Text key="t4" color={p.value}>
              {fmtTokens(cache.output)}
            </Text>,
            <Text key="t5" color={p.label}>
              {' · cached '}
            </Text>,
            <Text key="t6" color={p.value}>
              {fmtTokens(cache.read)}
            </Text>,
          ]
        : [
            <Text key="t0" color={p.value}>
              {'Σ'}
              {fmtTokens(sent + cache.output + cache.read)}
            </Text>,
          ]
      pills.push(pill('tokens', p.surface, p.value, 1, tokenBody))
    }

    if (mid || !soon) {
      pills.push(
        pill('elapsed', p.surface, p.muted, 1, [
          <Text key="el" color={p.muted}>
            {fmtElapsed(now - usage.startedAt)}
          </Text>,
        ]),
      )
    }

    // Context sits outside the pills: it is the one figure that resets, so it
    // is not session economics.
    const pct = usage.context.percent
    const ctx: RenderChildren[] = []
    if (pct !== undefined) {
      const frac = clamp01(pct / 100)
      const mark = severityMark(frac)
      ctx.push(
        <Text key="ctxl" color={p.label}>
          {'  ctx '}
        </Text>,
      )
      if (wide) {
        ctx.push(bar(frac, 8, 'ctxbar'), <Text key="ctxsp"> </Text>)
      }
      ctx.push(
        <Text key="ctxv" color={severity(frac)}>
          {String(Math.round(pct)).padStart(3)}%{mark}
        </Text>,
      )
    }

    // ---- expanded rows -------------------------------------------------
    const limits: RenderChildren[] = []
    if (expanded) {
      for (const limit of usage.rateLimits) {
        const label = WINDOW_LABEL[limit.kind] ?? limit.kind
        const lf = clamp01(limit.percentUsed / 100)
        if (limits.length) {
          limits.push(
            <Text key={`lg-${limit.kind}`} color={p.label}>
              {'   '}
            </Text>,
          )
        }
        limits.push(
          <Text key={`ll-${limit.kind}`} color={p.label}>
            {label}{' '}
          </Text>,
          bar(lf, 8, `lb-${limit.kind}`),
          <Text key={`lp-${limit.kind}`} color={severity(lf)}>
            {' '}
            {String(Math.round(limit.percentUsed)).padStart(3)}%{severityMark(lf)}
          </Text>,
        )
        const resets = fmtResetsIn(limit.resetsAt, now)
        if (resets) {
          limits.push(
            <Text key={`lr-${limit.kind}`} color={p.label}>
              {' resets '}
              {resets}
            </Text>,
          )
        }
      }
    }

    const cacheDetail: RenderChildren[] = []
    if (expanded && cache.requests > 0) {
      cacheDetail.push(
        <Text key="d1" color={p.label}>
          cache window{' '}
        </Text>,
        <Text key="d2" color={p.muted}>
          {cache.ttl}
          {cache.ttlPinned ? '' : '?'}
        </Text>,
      )
      if (ratio !== null) {
        cacheDetail.push(
          <Text key="d3" color={p.label}>
            {' · hit '}
          </Text>,
          <Text key="d4" color={p.muted}>
            {Math.round(ratio * 100)}%
          </Text>,
        )
      }
      cacheDetail.push(
        <Text key="d5" color={p.label}>
          {' · cold starts '}
        </Text>,
        <Text key="d6" color={p.muted}>
          {cache.misses}
        </Text>,
        <Text key="d7" color={p.label}>
          {' · '}
          {cache.requests} req
        </Text>,
      )
      if (!warm) {
        cacheDetail.push(
          <Text key="d8" color={p.label}>
            {' · next message re-reads '}
            {fmtTokens(cache.window)} at full price
            {reWarm === null ? '' : ` (${fmtEstimate(reWarm)})`}
            {', then cheap again'}
          </Text>,
        )
      }
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="nowrap" columnGap={wide ? 2 : 1} overflow="hidden">
          {pills}
          {ctx}
        </Box>
        {limits.length ? <Box>{limits}</Box> : null}
        {cacheDetail.length ? <Box>{cacheDetail}</Box> : null}
        <Box>
          <Button
            key="size"
            label={expanded ? 'Less' : 'More'}
            onPress={() => update($, isExpanded, current => !current)}
          />
          <Text> </Text>
          <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
        </Box>
      </Box>
    )
  })
}
