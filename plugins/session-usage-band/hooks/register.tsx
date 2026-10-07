// The hooks: the one place that touches `$`. Each reads what the engine knows
// into the pure modules, and ui.render hands drawBand a snapshot of them.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'
import { drawBand } from './band'
import {
  cache,
  hitRatio,
  msLeft,
  noteCompaction,
  noteConversationStart,
  noteLedger,
  noteLoad,
  pinTtl,
  recordResponse,
  resetCache,
  resetConversation,
  resolveTtl,
  reWarmUsd,
  savedUsd,
} from './cache'
import { COMPACT_NEAR, SEVERE_AT, WARN_AT, fmtCountdown, fmtEta, fmtTokens } from './format'
import {
  fiveHourEtaMs,
  insights,
  noteFiveHour,
  noteTurnEnd,
  noteTurnStart,
  resetConversationInsights,
  resetInsights,
} from './insights'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'

const isHidden = atom({ plugin: 'session-usage-band', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

const FIVE_HOUR = 'five_hour'
const SEVEN_DAY = 'seven_day'

// A toast speaks once per threshold crossed and again only after the figure
// falls back below this share.
const TOAST_REARM_BELOW = 0.75

let palette: Readonly<Palette> = DARK

/** Auto-compaction as the context breakdown last reported it: where it runs,
 *  or off. Read after each turn rather than on every redraw. */
let autoCompact: { at: number } | 'off' | undefined

/** What the session has cost so far, if the host keeps a ledger. */
const ledgerUsd = async ($: EngineInterface): Promise<number | undefined> => (await $.session.usage()).cost?.usd

type BandCommand = 'toggle' | 'more' | 'less' | 'show' | 'hide'

const parseCommand = (args: string): BandCommand | undefined => {
  const word = args.trim().toLowerCase()
  if (word === '') return 'toggle'
  return word === 'more' || word === 'less' || word === 'show' || word === 'hide' ? word : undefined
}

const SHOWN = 'Usage band shown. /usage-band more shows every fact.'
const HIDDEN = 'Usage band hidden. /usage-band shows it again.'

export const register: Register = on => {
  // What the band last drew, so the timer repaints only when it would change.
  let lastPaintKey = ''
  const warned = new Map<string, number>()
  let tick: Timer | undefined

  on('session.start', async ($, e, next) => {
    resetCache()
    resetInsights()
    warned.clear()
    lastPaintKey = ''
    noteLoad(await ledgerUsd($).catch(() => undefined))

    palette = resolvePalette((await $.env.get('CC_BAND_APPEARANCE'))?.toLowerCase(), await $.env.get('NO_COLOR'))
    const pinned = resolveTtl({
      force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
      chosen: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
    })
    if (pinned !== undefined) pinTtl(pinned)

    // One timer, repainting only when the drawing would differ: every minute
    // (the battery, the reset countdowns, the pace tick), and every second of
    // the cache's last ten minutes, when its countdown shows seconds.
    tick?.cancel()
    tick = $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const left = msLeft(now)
        const eta = fiveHourEtaMs(now)
        const key = `${Math.floor(now / 60_000)}|${fmtCountdown(left)}|${left > 0}|${eta === null ? '-' : fmtEta(eta)}`
        if (key !== lastPaintKey) {
          lastPaintKey = key
          $.ui.invalidate('ui.render')
        }
      })().catch(() => undefined)
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
    resetConversation((await ledgerUsd($).catch(() => undefined)) ?? 0)
    // The context warning is this conversation's; the 5-hour one is the
    // account's, and /clear changes nothing about it.
    resetConversationInsights()
    warned.delete('context')
    lastPaintKey = ''
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    const cost = await ledgerUsd($)
    noteTurnStart(e.turnId, cost)
    if (cost !== undefined) noteConversationStart(cost)
    return next(e)
  })

  // Main-loop turns only: a subagent's run is part of the turn that spawned it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      noteTurnEnd(e.turnId, await ledgerUsd($))
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('turn.step', async function* ($, e, next) {
    // The cache's TTL runs from when the request is sent, not when its reply ends.
    const sentAt = await $.clock.now()
    const result = yield* next(e)
    const isMain = e.agentId === undefined
    if (result?.usage) {
      recordResponse(result.usage, sentAt, isMain, result.usage.model)
      const cost = await ledgerUsd($)
      if (cost !== undefined) noteLedger(cost)
      $.ui.invalidate('ui.render')
    }
    if (isMain && result?.stopReason === 'compaction') noteCompaction(undefined)
    return result
  })

  // A compaction of the main conversation rebuilds the cache on purpose.
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      noteCompaction(result.tokensAfter)
      $.ui.invalidate('ui.render')
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    const note = (key: string, frac: number, levels: readonly number[], text: (pct: number) => string): void => {
      const level = levels.filter(at => frac >= at).length
      if (level > (warned.get(key) ?? 0)) {
        warned.set(key, level)
        $.ui.toast(text(Math.round(frac * 100)))
      } else if (frac < TOAST_REARM_BELOW) {
        warned.delete(key)
      }
    }

    for (const limit of e.rateLimits) {
      if (limit.kind !== FIVE_HOUR) continue
      noteFiveHour(now, limit.percentUsed, limit.resetsAt)
      note(FIVE_HOUR, limit.percentUsed / 100, [WARN_AT, SEVERE_AT], pct => `You've used ${pct}% of your 5-hour limit.`)
    }

    // Local and token-free, but it can fail; the last answer stands until a new one.
    try {
      const breakdown = (await $.session.usage({ breakdown: 'summary' })).context.breakdown
      if (breakdown !== undefined) {
        // On without a threshold says nothing about where: leave it unknown.
        autoCompact = !breakdown.isAutoCompactEnabled
          ? 'off'
          : breakdown.autoCompactThreshold !== undefined
            ? { at: breakdown.autoCompactThreshold }
            : undefined
      }
    } catch {
      // keep the last known setting
    }

    // The context toast speaks where the context pill turns amber.
    const used = e.context.tokens ?? (e.context.percent === undefined ? undefined : (e.context.percent / 100) * e.context.window)
    if (used !== undefined) {
      if (autoCompact !== undefined && autoCompact !== 'off') {
        const at = autoCompact.at
        note('context', used / at, [COMPACT_NEAR], () => `Auto-compaction in ~${fmtTokens(Math.max(0, at - used))} tokens.`)
      } else {
        const off = autoCompact === 'off'
        note('context', used / e.context.window, [WARN_AT, SEVERE_AT], pct =>
          off
            ? `Context is ${pct}% full and auto-compaction is off, so the conversation will run out of room.`
            : `Context is ${pct}% full.`,
        )
      }
    }

    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'usage-band' }, async ($, e, next) => {
    const command = parseCommand(e.args)
    switch (command) {
      case 'more':
      case 'less':
        await update($, isExpanded, () => command === 'more')
        await update($, isHidden, () => false)
        return { text: command === 'more' ? 'Usage band expanded.' : 'Usage band collapsed.' }
      case 'show':
      case 'hide':
        await update($, isHidden, () => command === 'hide')
        return { text: command === 'hide' ? HIDDEN : 'Usage band shown.' }
      case 'toggle': {
        const wasHidden = await read($, isHidden)
        await update($, isHidden, () => !wasHidden)
        return { text: wasHidden ? SHOWN : HIDDEN }
      }
      case undefined:
        return { text: 'Usage: /usage-band [more | less | show | hide]' }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const usage = await $.session.usage()
    const now = await $.clock.now()
    const five = usage.rateLimits.find(l => l.kind === FIVE_HOUR)
    const seven = usage.rateLimits.find(l => l.kind === SEVEN_DAY)
    if (usage.cost !== undefined) noteLedger(usage.cost.usd)

    return drawBand(
      $.ui.resolve(e),
      {
        surface: e.surface,
        columns: e.props.bodyColumns,
        maxRows: e.props.maxRows,
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
          savedUsd: savedUsd(usage.cost?.usd),
          fresh: cache.knownFresh,
          tokens: { sent: cache.uncached + cache.written, back: cache.output, cached: cache.read },
        },
        costUsd: usage.cost?.usd ?? 0,
        lastTurnUsd: insights.lastTurnUsd,
        context: {
          tokens: usage.context.tokens,
          window: usage.context.window,
          percent: usage.context.percent,
          compactAt: autoCompact === undefined || autoCompact === 'off' ? undefined : autoCompact.at,
        },
        fiveHour: five ? { percentUsed: five.percentUsed, resetsAt: five.resetsAt, etaMs: fiveHourEtaMs(now) } : undefined,
        sevenDay: seven ? { percentUsed: seven.percentUsed, resetsAt: seven.resetsAt } : undefined,
        otherLimits: usage.rateLimits
          .filter(l => l.kind !== FIVE_HOUR && l.kind !== SEVEN_DAY)
          .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
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
