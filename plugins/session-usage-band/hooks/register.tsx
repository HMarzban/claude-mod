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
  notePriceModel,
  pinTtl,
  ratePerToken,
  recordResponse,
  reWarmAt,
  resetCache,
  resetConversation,
  resolveTtl,
  readShare,
  reWarmUsd,
  savedUsd,
  TTL_MS,
} from './cache'
import { COMPACT_NEAR, SEVERE_AT, WARN_AT, contextUsed, fmtCountdown, fmtEta, fmtTokens } from './format'
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
import {
  RATES_KEY,
  READ_LIMIT,
  SESSIONS_KEY,
  asRates,
  asSessions,
  lastReplyAt,
  rateFromTranscript,
  rememberReply,
  transcriptPath,
} from './memory'
import { GIT_DIRS_ARGV, GIT_STATUS_ARGV, homeRelative, parseGitState, splitPath } from './workspace'
import type { Workspace } from './workspace'

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

/** Where the session is: its project, home-relative, and git there. Read
 *  between redraws, never while drawing, since git takes a process. */
let workspace: Workspace | undefined

/** What the band recalls of a conversation it has seen no reply of yet: when
 *  its last reply was, and the rate a token costs on its model, if known. */
let recall: Readonly<{ lastAt: number; rate: number | null }> | undefined

/** The cache's time left: measured once there is a reply, else recalled. */
const cacheLeft = (now: number): number =>
  cache.requests === 0 && recall !== undefined ? Math.max(0, recall.lastAt + TTL_MS[cache.ttl] - now) : msLeft(now)

/** A transcript's end, where its last reply and cost record are: its last
 *  megabyte by `tail`, whatever its size; failing that, the whole file if it
 *  is small enough to read. */
const transcriptEnd = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  const tail = await $.process
    .run(['tail', '-c', String(TAIL_BYTES), path], { timeoutMs: PROCESS_TIMEOUT_MS })
    .catch(() => undefined)
  if (tail?.exitCode === 0) return tail.stdout
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat === undefined || stat.size > READ_LIMIT) return undefined
  const text = await $.fs.read(path).catch(() => undefined)
  return typeof text === 'string' ? text : undefined
}

/** Recalls when this session last had a reply, and what a token costs on
 *  its model: the band's own memory first; for a session from before the
 *  band, its transcript's last reply and cost record, if it is small enough
 *  to read. Read once at load, and only those two facts kept. Never throws:
 *  unknown stays unknown. */
const recallLastReply = async ($: EngineInterface): Promise<void> => {
  try {
    const id = await $.session.id()
    const model = await $.session.model()
    let lastAt = asSessions(await $.store.get(SESSIONS_KEY))[id]?.lastAt
    let rate = asRates(await $.store.get(RATES_KEY))[model] ?? null
    if (lastAt === undefined || rate === null) {
      const home = await $.env.get('HOME')
      const transcript = home ? await transcriptEnd($, transcriptPath(home, await $.session.root(), id)) : undefined
      if (transcript !== undefined) {
        lastAt ??= lastReplyAt(transcript)
        rate ??= rateFromTranscript(transcript, model)
      }
    }
    if (lastAt !== undefined) recall = { lastAt, rate }
  } catch {
    // nothing to recall
  }
}

/** Remembers this session's last reply and the rate its bill solves to, for
 *  when it is reopened or the band reloads. */
const rememberTurn = async ($: EngineInterface, costNow: number | undefined): Promise<void> => {
  if (cache.requests === 0) return
  try {
    const id = await $.session.id()
    await $.store.set(SESSIONS_KEY, rememberReply(asSessions(await $.store.get(SESSIONS_KEY)), id, cache.lastAt))
    const rate = ratePerToken(costNow)
    if (rate !== null) await $.store.set(RATES_KEY, { ...asRates(await $.store.get(RATES_KEY)), [await $.session.model()]: rate })
  } catch {
    // memory is a convenience; the band works without it
  }
}

/** How much of a transcript's end to read: room for a long last reply. */
const TAIL_BYTES = 1024 * 1024

/** Reads begun, so one that ends after a newer one never overwrites it. */
let reads = 0

/** Long enough for a large repository's status or a transcript's tail,
 *  short enough that a hung command never holds a read open for long. */
const PROCESS_TIMEOUT_MS = 3000

/** Reads the project and git into `workspace`, then redraws. It never throws:
 *  outside a repository, or with git missing or slow, the band shows the
 *  path alone. Callers don't wait on it. */
const readWorkspace = async ($: EngineInterface): Promise<void> => {
  const mine = ++reads
  try {
    const root = await $.session.root()
    const home = await $.env.get('HOME')
    const run = (argv: readonly string[]): Promise<string | undefined> =>
      $.process.run(argv, { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS }).then(
        r => (r.exitCode === 0 ? r.stdout : undefined),
        () => undefined,
      )
    const [status, dirs, repo] = await Promise.all([
      run(GIT_STATUS_ARGV),
      run(GIT_DIRS_ARGV),
      $.session.repo().catch(() => null),
    ])
    if (mine !== reads) return
    const path = homeRelative(root, home)
    workspace = {
      path,
      // A status that failed or timed out keeps the last good reading of the
      // same project, so a slow repository doesn't flicker to the path alone.
      git: status === undefined ? (workspace?.path === path ? workspace.git : undefined) : parseGitState(status, dirs ?? ''),
      // A linked worktree's main repository, by its folder's name.
      repoName: repo === null ? undefined : splitPath(repo.root).name,
    }
    $.ui.invalidate('ui.render')
  } catch {
    // keep the last reading
  }
}

/** What the session has cost so far, if the host keeps a ledger; undefined
 *  when it has none, or the read fails. */
const ledgerUsd = async ($: EngineInterface): Promise<number | undefined> =>
  (await $.session.usage().catch(() => undefined))?.cost?.usd

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
    workspace = undefined
    reads++ // any read still out began before this load
    recall = undefined
    notePriceModel(await $.session.model().catch(() => undefined))
    noteLoad(await ledgerUsd($))
    void readWorkspace($)
    // Loaded mid-conversation, the band has seen no reply: recall the last.
    if (!cache.knownFresh) await recallLastReply($)

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
        const left = cacheLeft(now)
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
    resetConversation((await ledgerUsd($)) ?? 0)
    // The context warning is this conversation's; the 5-hour one is the
    // account's, and /clear changes nothing about it.
    resetConversationInsights()
    warned.delete('context')
    lastPaintKey = ''
    // The new conversation starts here: nothing from before stands for it.
    recall = undefined
    // A resume may be another project.
    void readWorkspace($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // /model may have switched what the session's tokens are priced at.
    notePriceModel(await $.session.model().catch(() => undefined))
    const cost = await ledgerUsd($)
    noteTurnStart(e.turnId, cost)
    if (cost !== undefined) noteConversationStart(cost)
    return next(e)
  })

  // Main-loop turns only: a subagent's run is part of the turn that spawned it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const cost = await ledgerUsd($)
      noteTurnEnd(e.turnId, cost)
      void rememberTurn($, cost)
      // A turn may have switched branch, committed or moved the session.
      void readWorkspace($)
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
  }).catch(($, e, next) => next(e)) // a failure here must never stop a compaction

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
    const used = contextUsed(e.context)
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
        if (command === 'more') void readWorkspace($)
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
    // Before this conversation's first reply, what the band recalls stands in.
    const recalled = cache.requests === 0 && !cache.knownFresh && recall !== undefined
    const contextTokens = contextUsed(usage.context) ?? 0

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
          msLeft: cacheLeft(now),
          ttl: cache.ttl,
          ttlPinned: cache.ttlPinned,
          window: recalled ? contextTokens : cache.window,
          hitRatio: hitRatio(),
          misses: cache.misses,
          // Recalled, a cold cache rebuilds the context as it stands now.
          reWarmUsd: recalled ? (recall?.rate == null ? null : reWarmAt(recall.rate, contextTokens)) : reWarmUsd(usage.cost?.usd),
          recalled,
          idleMs: recalled && recall !== undefined ? now - recall.lastAt : null,
          savedUsd: savedUsd(usage.cost?.usd),
          readShare: readShare(),
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
        workspace,
        otherLimits: usage.rateLimits
          .filter(l => l.kind !== FIVE_HOUR && l.kind !== SEVEN_DAY)
          .map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
      },
      {
        toggleExpanded: async () => {
          // Opening reads git, so the cards never show a stale branch.
          if (await update($, isExpanded, current => !current)) void readWorkspace($)
        },
        hide: async () => {
          await update($, isHidden, () => true)
        },
      },
    )
  })
}
