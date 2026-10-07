import { atom, read, update } from 'claude-code'
import type { Register, RenderChildren } from 'claude-code'
import { SOON_MS, cache, hitRatio, msLeft, recordResponse, resetCache, reWarmUsd } from './cache'
import {
  WINDOW_LABEL,
  clamp01,
  fmtCost,
  fmtCountdown,
  fmtElapsed,
  fmtEstimate,
  fmtResetsIn,
  fmtTokens,
  severity,
  severityMark,
} from './format'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'

const isHidden = atom({ plugin: 'session-usage-band', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

let palette: Palette = DARK


export const register: Register = on => {
  // What the band last drew, so a timer only repaints when it would change.
  let lastPaintKey = ''
  const warned = new Set<string>()

  on('session.start', async ($, e, next) => {
    resetCache()

    const appearance = (await $.env.get('CC_BAND_APPEARANCE'))?.toLowerCase()
    const noColor = await $.env.get('NO_COLOR')
    palette = resolvePalette(appearance, noColor)

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
