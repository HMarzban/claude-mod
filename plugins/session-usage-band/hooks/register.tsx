import { atom, read, update } from 'claude-code'
import type { Register, Timer } from 'claude-code'
import { drawBand } from './band'
import { cache, hitRatio, msLeft, recordResponse, resetCache, resetConversation, reWarmUsd } from './cache'
import { fmtCountdown, fmtEta } from './format'
import { fiveHourEtaMs, insights, noteFiveHour, noteTurnEnd, noteTurnStart, resetInsights } from './insights'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'

const isHidden = atom({ plugin: 'session-usage-band', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

let palette: Palette = DARK

// Toasts speak at the same points the pills turn amber, so the two agree.
const TOAST_AT = 0.8
const TOAST_AGAIN_AT = 0.95
const TOAST_REARM_BELOW = 0.75

export const register: Register = on => {
  // What the band last drew, so a timer only repaints when it would change.
  let lastPaintKey = ''
  const warned = new Map<string, number>()
  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    resetCache()
    resetInsights()
    warned.clear()
    lastPaintKey = ''

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
    tick?.cancel()
    tick = $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const left = msLeft(now)
        const eta = fiveHourEtaMs(now)
        const key = `${fmtCountdown(left)}|${left > 0}|${eta === null ? '-' : fmtEta(eta)}`
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

  // /clear and resume end the conversation but not the process, and no
  // session.start follows, so the next conversation starts from here.
  on('session.end', async ($, e, next) => {
    resetConversation((await $.session.usage()).cost?.usd ?? 0)
    resetInsights()
    warned.clear()
    lastPaintKey = ''
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    noteTurnStart(e.turnId, (await $.session.usage()).cost?.usd)
    return next(e)
  })

  // Main-loop turns only: a subagent's run is part of the turn that spawned it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      noteTurnEnd(e.turnId, (await $.session.usage()).cost?.usd)
      $.ui.invalidate('ui.render')
    }
    return result
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
    const now = await $.clock.now()
    const note = (key: string, frac: number, text: (pct: number) => string): void => {
      const level = frac >= TOAST_AGAIN_AT ? 2 : frac >= TOAST_AT ? 1 : 0
      if (level > (warned.get(key) ?? 0)) {
        warned.set(key, level)
        $.ui.toast(text(Math.round(frac * 100)))
      } else if (frac < TOAST_REARM_BELOW) {
        warned.delete(key)
      }
    }

    if (e.context.percent !== undefined) {
      note('context', e.context.percent / 100, pct => `Context is ${pct}% full. Claude Code will summarize older messages soon.`)
    }
    for (const limit of e.rateLimits) {
      if (limit.kind !== 'five_hour') continue
      noteFiveHour(now, limit.percentUsed, limit.resetsAt)
      note('five_hour', limit.percentUsed / 100, pct => `You've used ${pct}% of your 5-hour limit.`)
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
    const five = usage.rateLimits.find(l => l.kind === 'five_hour')
    const seven = usage.rateLimits.find(l => l.kind === 'seven_day')

    return drawBand(
      $.ui.resolve(e),
      {
        surface: e.surface,
        columns: e.props.bodyColumns,
        isWorking: e.props.isWorking,
        expanded: await read($, isExpanded),
        palette,
        now,
        cache: {
          requests: cache.requests,
          msLeft: msLeft(now),
          ttl: cache.ttl,
          ttlPinned: cache.ttlPinned,
          window: cache.window,
          hitRatio: hitRatio(),
          misses: cache.misses,
          reWarmUsd: reWarmUsd(usage.cost?.usd),
        },
        costUsd: usage.cost?.usd ?? 0,
        lastTurnUsd: insights.lastTurnUsd,
        contextPercent: usage.context.percent,
        fiveHour: five ? { percentUsed: five.percentUsed, resetsAt: five.resetsAt, etaMs: fiveHourEtaMs(now) } : undefined,
        sevenDay: seven ? { percentUsed: seven.percentUsed, resetsAt: seven.resetsAt } : undefined,
      },
      {
        toggleExpanded: async () => {
          await update($, isExpanded, current => !current)
        },
        hide: async () => {
          await update($, isHidden, () => true)
        },
      },
    )
  })
}
