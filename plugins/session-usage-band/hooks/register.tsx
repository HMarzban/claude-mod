// The hooks: the one place that touches `$`. Each reads what the engine knows
// into the pure modules, and ui.render hands drawBand a snapshot of them.

import { atom, read, update } from 'claude-code'
import type { ClassicEventOf, EngineInterface, Register, Timer } from 'claude-code'
import { drawBand } from './band'
import {
  cache,
  cacheView,
  msLeft,
  noteCompaction,
  noteConversationStart,
  noteLedger,
  noteLoad,
  notePrior,
  noteRecall,
  noteResume,
  noteTtlSeen,
  modelName,
  noteBilledModel,
  notePriceModel,
  pricedModel,
  pinTtl,
  ratePerToken,
  recordResponse,
  resetCache,
  resetConversation,
  resetForResume,
  resolveTtl,
  spentUsd,
} from './cache'
import type { ResumedCache, Spend, Ttl } from './cache'
import { COMPACT_NEAR, SEVERE_AT, WARN_AT, clipMiddle, contextUsed, fmtCountdown, fmtEta, fmtTokens, utcOffsetOf } from './format'
import { resolveGlyphs } from './glyphs'
import {
  fiveHourEtaMs,
  forgetTurn,
  insights,
  noteFiveHour,
  noteTurnEnd,
  noteTurnStart,
  escalate,
  resetConversationInsights,
  resetInsights,
} from './insights'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'
import {
  COST_RECORD,
  LAYOUT_KEY,
  RATES_KEY,
  READ_LIMIT,
  SESSIONS_KEY,
  asLayoutName,
  asRates,
  asSessions,
  lastReplyAt,
  lastReplyModel,
  lastWriteTtl,
  rateFromTranscript,
  rememberReply,
  sessionCostRecord,
  transcriptPath,
  transcriptSpend,
} from './memory'
import { DEFAULT_LAYOUT, LAYOUT_NAMES } from './snapshot'
import type { Glyphs, LayoutName } from './snapshot'
import { GIT_DIRS_ARGV, GIT_STATUS_ARGV, homeRelative, parseGitState, splitPath } from './workspace'
import type { Workspace } from './workspace'

const isHidden = atom({ plugin: 'session-usage-band', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

const FIVE_HOUR = 'five_hour'
const SEVEN_DAY = 'seven_day'

/** How much of a transcript's end to read: room for a long last reply. */
const TAIL_BYTES = 1024 * 1024

/** Long enough for a large repository's status or a transcript's tail,
 *  short enough that a hung command never holds a read open for long. */
const PROCESS_TIMEOUT_MS = 3000

/** What /usage-band answers. */
const REPLY = {
  shown: 'Usage band shown.',
  shownFirst: 'Usage band shown. /usage-band more shows every fact.',
  hidden: 'Usage band hidden. /usage-band shows it again.',
  expanded: 'Usage band expanded.',
  collapsed: 'Usage band collapsed.',
  usage: 'Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>',
} as const

/** What a resumed conversation's transcript shows: its spend before this
 *  process, and the TTL of its last cache write. */
type TranscriptFacts = Readonly<{ spend: Spend | undefined; ttl: Ttl | undefined }>

/** What the band recalls of a conversation's last reply, before its own:
 *  when it was, the base rate per token on its model, and the model it was
 *  billed under, where its transcript names one. */
type RecalledReply = Readonly<{ lastAt: number | undefined; rate: number | null; billed: string | undefined }>

/** A conversation the engine said it resumed: its session, what the engine
 *  said of its cache, where its transcript is, and once read, what that shows. */
type Resume = Readonly<{
  sessionId: string
  cache: ResumedCache | undefined
  path: string | undefined
  transcript: TranscriptFacts | undefined
}>

/** Everything the band keeps between hooks, in one place. A reload starts it
 *  over with the module; session.start resets the rest. */
const band: {
  palette: Readonly<Palette>
  /** The layout the band draws in. */
  layout: LayoutName
  /** The terminal's glyph tier, read from the environment at session.start. */
  glyphs: Glyphs
  /** Where auto-compaction runs, as the context breakdown last said; read
   *  after each turn, not on every redraw. Undefined when off or unknown. */
  compactAt: number | undefined
  /** The breakdown said auto-compaction is off. */
  autoCompactOff: boolean
  /** The local zone's offset from UTC, east-positive minutes; read at load
   *  and after each turn, so a change of zone shows by the next reply. */
  utcOffsetMin: number | undefined
  /** Where the session is: its project, home-relative, and git there. Read
   *  between redraws, never while drawing, since git takes a process. */
  workspace: Workspace | undefined
  /** Reads begun, so one that ends after a newer one never overwrites it. */
  reads: number
  /** The conversation the engine last said it resumed, until it ends. The
   *  engine may say so before session.start, or while it runs, and its reset
   *  forgets it, so it outlives that reset and session.start notes it again. */
  resume: Resume | undefined
  /** What the band last drew, so the timer repaints only when it would change. */
  lastPaintKey: string
  /** Each toast's level reached, so it speaks once per crossing. */
  warned: Map<string, number>
  tick: Timer | undefined
} = {
  palette: DARK,
  layout: DEFAULT_LAYOUT,
  glyphs: 'unicode',
  compactAt: undefined,
  autoCompactOff: false,
  utcOffsetMin: undefined,
  workspace: undefined,
  reads: 0,
  resume: undefined,
  lastPaintKey: '',
  warned: new Map(),
  tick: undefined,
}

/** Where `sessionId`'s transcript is: where the engine says, else where
 *  Claude Code keeps it for this project; undefined without either. */
const transcriptFile = async ($: EngineInterface, sessionId: string, given: string | undefined): Promise<string | undefined> => {
  if (given !== undefined) return given
  const home = await $.env.get('HOME')
  return home ? transcriptPath(home, await $.session.root(), sessionId) : undefined
}

/** A whole transcript, if it is small enough to read. */
const readWhole = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (stat === undefined || stat.size > READ_LIMIT) return undefined
  const text = await $.fs.read(path).catch(() => undefined)
  return typeof text === 'string' ? text : undefined
}

/** A transcript's end, where its last reply and cost record are: its last
 *  megabyte by `tail`, whatever its size; failing that, the whole file if it
 *  is small enough to read. */
const transcriptEnd = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  const tail = await $.process
    .run(['tail', '-c', String(TAIL_BYTES), path], { timeoutMs: PROCESS_TIMEOUT_MS })
    .catch(() => undefined)
  return tail?.exitCode === 0 ? tail.stdout : readWhole($, path)
}

/** The end of `sessionId`'s transcript (at `given`, when the engine names
 *  it); undefined where there is none to read. */
const endOf = async ($: EngineInterface, sessionId: string, given: string | undefined): Promise<string | undefined> => {
  const file = await transcriptFile($, sessionId, given)
  return file === undefined ? undefined : transcriptEnd($, file)
}

/** What `sessionId`'s conversation spent before this process, off its
 *  transcript: its cost record, which `grep` finds at any size, and the
 *  replies logged after it, which `tail` reads from there. Where grep can't
 *  run, a transcript small enough to read is read whole. Undefined with no
 *  record, or no way to read one. */
const spendBefore = async ($: EngineInterface, path: string, sessionId: string): Promise<Spend | undefined> => {
  const run = (argv: readonly string[]) => $.process.run(argv, { timeoutMs: PROCESS_TIMEOUT_MS }).catch(() => undefined)
  const found = await run(['grep', '-b', '-F', COST_RECORD, path])
  // grep exits 1 when nothing matches, 2 when it fails.
  if (found?.exitCode === 1) return undefined
  if (found?.exitCode !== 0) {
    const whole = await readWhole($, path)
    return whole === undefined ? undefined : transcriptSpend(whole, sessionId)
  }
  const record = found.isStdoutTruncated ? undefined : sessionCostRecord(found.stdout, sessionId)
  if (record === undefined) return undefined
  const rest = await run(['tail', '-c', `+${record.offset + 1}`, path])
  // Replies past what one read holds are left out rather than half-read; the record still counts.
  const tail = rest?.exitCode === 0 && !rest.isStdoutTruncated ? rest.stdout : ''
  // The record is grep's own line and the replies follow its end, so a grep
  // whose offset is the match's, not the line's (ugrep), reads the same.
  const recordEnd = tail.indexOf('\n')
  return transcriptSpend(recordEnd < 0 ? record.line : record.line + tail.slice(recordEnd), sessionId)
}

/** Recalls when `sessionId` last had a reply, and what a token costs on
 *  its model: the band's own memory first; for a session from before the
 *  band, its transcript's last reply and cost record, from the end
 *  `readEnd` reads. Recalled once per load or resume, and only those facts
 *  kept; the caller notes them. Never throws: unknown stays unknown. */
const recallLastReply = async (
  $: EngineInterface,
  sessionId: string,
  readEnd: () => Promise<string | undefined>,
): Promise<RecalledReply | undefined> => {
  try {
    const model = modelName(await $.session.model())
    const rates = asRates(await $.store.get(RATES_KEY))
    let lastAt = asSessions(await $.store.get(SESSIONS_KEY))[sessionId]?.lastAt
    let rate = rates[model] ?? null
    let billed: string | undefined
    if (lastAt === undefined || rate === null) {
      const transcript = await readEnd()
      if (transcript !== undefined) {
        lastAt ??= lastReplyAt(transcript)
        // /model may name an alias; the last reply names the model it was billed under.
        billed = lastReplyModel(transcript)
        rate ??= billed === undefined ? rateFromTranscript(transcript, model) : (rates[billed] ?? rateFromTranscript(transcript, billed))
      }
    }
    return { lastAt, rate, billed }
  } catch {
    return undefined // nothing to recall
  }
}

/** What the band recalls of the last reply, noted in the cache model. */
const noteRecalled = (recalled: RecalledReply | undefined): void => {
  if (recalled?.billed !== undefined) noteBilledModel(recalled.billed)
  if (recalled?.lastAt !== undefined) noteRecall(recalled.lastAt, recalled.rate)
}

/** What a resumed conversation's transcript shows, noted in the cache model. */
const noteTranscript = (facts: TranscriptFacts): void => {
  if (facts.spend !== undefined) notePrior(facts.spend)
  if (facts.ttl !== undefined) noteTtlSeen(facts.ttl)
}

/** A resume, applied to the cache model: the engine's word on its cache, and
 *  its transcript's once read. */
const applyResume = (resume: Resume): void => {
  noteResume(resume.cache)
  if (resume.transcript !== undefined) noteTranscript(resume.transcript)
}

/** Reads what a resumed conversation's transcript shows, keeps it with the
 *  resume and redraws; where the engine gave no idle time, recalls the last
 *  reply off the same read of its end. Callers don't wait on it, and it
 *  never throws: a read or recall that ends after the conversation ended is
 *  dropped, and failing, the ledger and the TTL stand. */
const readResumed = async ($: EngineInterface, mine: Resume): Promise<void> => {
  try {
    const file = await transcriptFile($, mine.sessionId, mine.path)
    const end = file === undefined ? Promise.resolve(undefined) : transcriptEnd($, file)
    const [recalled, spend, tail] = await Promise.all([
      mine.cache === undefined ? recallLastReply($, mine.sessionId, () => end) : undefined,
      file === undefined ? undefined : spendBefore($, file, mine.sessionId),
      end,
    ])
    if (band.resume !== mine) return
    const transcript = { spend, ttl: tail === undefined ? undefined : lastWriteTtl(tail) }
    band.resume = { ...mine, transcript }
    noteRecalled(recalled)
    noteTranscript(transcript)
    $.ui.invalidate('ui.render')
  } catch {
    // the ledger and the TTL stand
  }
}

/** A conversation resumed or forked: never new, its cache as the engine
 *  judges it, or as the band recalls it where the engine doesn't say; then,
 *  off the hook, what its transcript shows. */
const resumeConversation = async ($: EngineInterface, e: ClassicEventOf['classic.SessionStart']): Promise<void> => {
  const idleSec = e.seconds_since_last_response
  const now = await $.clock.now()
  const resume: Resume = {
    // The engine names the conversation it resumes; on a /resume, the
    // process switches to it only after this hook.
    sessionId: e.session_id || (await $.session.id()),
    cache:
      idleSec === undefined
        ? undefined
        : { lastAt: now - idleSec * 1000, expired: e.prompt_cache_likely_expired, reWarmUsd: e.estimated_cache_write_usd },
    // '' when the session keeps no local transcript.
    path: e.transcript_path === '' ? undefined : e.transcript_path,
    transcript: undefined,
  }
  band.resume = resume
  applyResume(resume)
  void readResumed($, resume)
  $.ui.invalidate('ui.render')
}

/** Remembers this session's last reply and the rate its bill solves to, for
 *  when it is reopened or the band reloads. */
const rememberTurn = async ($: EngineInterface, costNow: number | undefined): Promise<void> => {
  if (cache.requests === 0) return
  try {
    const id = await $.session.id()
    await $.store.set(SESSIONS_KEY, rememberReply(asSessions(await $.store.get(SESSIONS_KEY)), id, cache.lastAt))
    const rate = ratePerToken(costNow)
    if (rate !== null) await $.store.set(RATES_KEY, { ...asRates(await $.store.get(RATES_KEY)), [pricedModel() ?? modelName(await $.session.model())]: rate })
  } catch {
    // memory is a convenience; the band works without it
  }
}

/** Reads the project and git into `band.workspace`, then redraws. It never throws:
 *  outside a repository, or with git missing or slow, the band shows the
 *  path alone. Callers don't wait on it. */
const readWorkspace = async ($: EngineInterface): Promise<void> => {
  const mine = ++band.reads
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
    if (mine !== band.reads) return
    const path = homeRelative(root, home)
    const last = band.workspace
    band.workspace = {
      path,
      // A status that failed or timed out keeps the last good reading of the
      // same project, so a slow repository doesn't flicker to the path alone.
      git: status === undefined ? (last?.path === path ? last.git : undefined) : parseGitState(status, dirs ?? ''),
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

/** The stored layout, or chips: a name this version doesn't know, or a value
 *  that isn't a name, draws chips. Never throws. */
const readLayout = async ($: EngineInterface): Promise<void> => {
  band.layout = asLayoutName(await $.store.get(LAYOUT_KEY).catch(() => undefined)) ?? DEFAULT_LAYOUT
}

/** The layouts /usage-band layout offers. */
const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.join(', ')}.`
/** `layout`, then what follows it, if anything. */
const LAYOUT_ARG = /^\s*layout(?:\s+(.*))?$/i

/** The reply naming the layout the band draws in. */
const layoutReply = (name: LayoutName): string => `Usage band layout: ${name}.`

/** `/usage-band layout [name]`: lists, or switches and remembers. Only this writes the layout. */
const chooseLayout = async ($: EngineInterface, arg: string): Promise<string> => {
  if (arg.trim() === '') return `${layoutReply(band.layout)} ${LAYOUT_LIST}`
  const name = asLayoutName(arg)
  if (name === undefined) return `Unknown layout "${clipMiddle(arg.trim(), 20)}". ${LAYOUT_LIST}`
  band.layout = name
  // Remembered for the next session. A store that fails leaves this one
  // switched until the next turn reads the store back.
  await $.store.set(LAYOUT_KEY, name).catch(() => undefined)
  await update($, isHidden, () => false)
  $.ui.invalidate('ui.render')
  return name === DEFAULT_LAYOUT ? layoutReply(name) : `${layoutReply(name)} /usage-band layout ${DEFAULT_LAYOUT} goes back.`
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const id = await $.session.id().catch(() => undefined)
    resetCache()
    // A resume of another session is no longer news. It is dropped in the
    // same step as the reset, so no read of it can land in between.
    if (band.resume?.sessionId !== id) band.resume = undefined
    resetInsights()
    band.warned.clear()
    band.lastPaintKey = ''
    band.workspace = undefined
    band.utcOffsetMin = utcOffsetOf(await $.clock.now())
    band.reads++ // any read still out began before this load
    await readLayout($)
    notePriceModel(await $.session.model().catch(() => undefined))
    // A resume of this session, said before this load or while it runs, is
    // noted again after the reset.
    if (band.resume !== undefined) applyResume(band.resume)
    noteLoad(await ledgerUsd($))
    void readWorkspace($)
    // Loaded mid-conversation, the band has seen no reply: recall the last,
    // unless the engine said when it was.
    if (id !== undefined && !cache.knownFresh && cache.resumedCache === undefined) {
      const path = band.resume?.path
      noteRecalled(await recallLastReply($, id, () => endOf($, id, path)))
    }

    band.palette = resolvePalette((await $.env.get('CC_BAND_APPEARANCE'))?.toLowerCase(), await $.env.get('NO_COLOR'))
    band.glyphs = resolveGlyphs({
      CC_BAND_GLYPHS: await $.env.get('CC_BAND_GLYPHS'),
      LC_ALL: await $.env.get('LC_ALL'),
      LC_CTYPE: await $.env.get('LC_CTYPE'),
      LANG: await $.env.get('LANG'),
    })
    const pinned = resolveTtl({
      force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
      chosen: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
    })
    if (pinned !== undefined) pinTtl(pinned)

    // One timer, repainting only when the drawing would differ: every minute
    // (the battery, the reset countdowns, the pace tick), and every second of
    // the cache's last ten minutes, when its countdown shows seconds.
    band.tick?.cancel()
    band.tick = $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const left = msLeft(now)
        const eta = fiveHourEtaMs(now)
        const key = `${Math.floor(now / 60_000)}|${fmtCountdown(left)}|${left > 0}|${eta === null ? '-' : fmtEta(eta)}`
        if (key !== band.lastPaintKey) {
          band.lastPaintKey = key
          $.ui.invalidate('ui.render')
        }
      })().catch(() => undefined)
    })

    $.command.register({
      name: 'usage-band',
      description: 'Show, hide, expand, collapse or restyle the session usage band',
      argumentHint: '[more | less | show | hide | layout <name>]',
    })
    return next(e)
  })

  // /clear and resume end the conversation but not the process, and no
  // session.start follows, so the next conversation starts from here. A
  // resume's is under way already, and its SessionStart says what it was.
  on('session.end', async ($, e, next) => {
    band.resume = undefined // and any read of it still out is dropped
    const costNow = (await ledgerUsd($)) ?? 0
    if (e.reason === 'resume') resetForResume(costNow)
    else resetConversation(costNow)
    // The context warning is this conversation's; the 5-hour one is the
    // account's, and /clear changes nothing about it.
    resetConversationInsights()
    band.warned.delete('context')
    band.lastPaintKey = ''
    // A resume may be another project.
    void readWorkspace($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // A conversation resumed at launch (`claude --resume`, the desktop opening
  // a past session) or by /resume: the ledger may read $0, but it is no new one.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.agent_id === undefined && (e.source === 'resume' || e.source === 'fork')) await resumeConversation($, e)
    return next(e)
  }).catch(($, e, next) => next(e)) // a failure here must never stop a session starting

  on('turn.start', async ($, e, next) => {
    // /model may have switched what the session's tokens are priced at.
    notePriceModel(await $.session.model().catch(() => undefined))
    const cost = await ledgerUsd($)
    noteTurnStart(e.turnId, cost)
    if (cost !== undefined) noteConversationStart(cost)
    return next(e)
  })

  // Main-loop turns only: a subagent's run is part of the turn that spawned it.
  // It raises no turn.start; forgetTurn guards against one that does.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const cost = await ledgerUsd($)
      noteTurnEnd(e.turnId, cost)
      void rememberTurn($, cost)
      band.utcOffsetMin = utcOffsetOf(await $.clock.now())
      // Another session may have chosen a layout since.
      await readLayout($)
      // A turn may have switched branch, committed or moved the session.
      void readWorkspace($)
      $.ui.invalidate('ui.render')
    } else {
      forgetTurn(e.turnId)
    }
    return result
  })

  on('turn.step', async function* ($, e, next) {
    // The cache's TTL runs from when the request is sent, not when its reply ends.
    const sentAt = await $.clock.now()
    const result = yield* next(e)
    const isMain = e.agentId === undefined
    if (result?.usage) {
      if (isMain && result.usage.model) noteBilledModel(result.usage.model)
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
      const { level, speak } = escalate(band.warned.get(key) ?? 0, frac, levels)
      band.warned.set(key, level)
      if (speak) $.ui.toast(text(Math.round(frac * 100)))
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
        band.autoCompactOff = !breakdown.isAutoCompactEnabled
        band.compactAt = breakdown.isAutoCompactEnabled ? breakdown.autoCompactThreshold : undefined
      }
    } catch {
      // keep the last known setting
    }

    // The context toast speaks where the context pill turns amber.
    const used = contextUsed(e.context)
    if (used !== undefined) {
      const at = band.compactAt
      if (at !== undefined) {
        note('context', used / at, [COMPACT_NEAR], () => `Auto-compaction in ~${fmtTokens(Math.max(0, at - used))} tokens.`)
      } else {
        const off = band.autoCompactOff
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
    const chosen = LAYOUT_ARG.exec(e.args)
    if (chosen) return { text: await chooseLayout($, chosen[1] ?? '') }
    const command = parseCommand(e.args)
    switch (command) {
      case 'more':
      case 'less':
        await update($, isExpanded, () => command === 'more')
        await update($, isHidden, () => false)
        if (command === 'more') void readWorkspace($)
        return { text: command === 'more' ? REPLY.expanded : REPLY.collapsed }
      case 'show':
      case 'hide':
        await update($, isHidden, () => command === 'hide')
        return { text: command === 'hide' ? REPLY.hidden : REPLY.shown }
      case 'toggle': {
        const wasHidden = await read($, isHidden)
        await update($, isHidden, () => !wasHidden)
        return { text: wasHidden ? REPLY.shownFirst : REPLY.hidden }
      }
      case undefined:
        return { text: REPLY.usage }
    }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const usage = await $.session.usage()
    const now = await $.clock.now()
    const five = usage.rateLimits.find(l => l.kind === FIVE_HOUR)
    const seven = usage.rateLimits.find(l => l.kind === SEVEN_DAY)
    if (usage.cost !== undefined) noteLedger(usage.cost.usd)
    const contextTokens = contextUsed(usage.context) ?? 0

    return drawBand(
      $.ui.resolve(e),
      {
        surface: e.surface,
        columns: e.props.bodyColumns,
        maxRows: e.props.maxRows,
        isWorking: e.props.isWorking,
        expanded: await read($, isExpanded),
        palette: band.palette,
        layout: band.layout,
        glyphs: band.glyphs,
        now,
        cache: cacheView(now, usage.cost?.usd, contextTokens),
        costUsd: spentUsd(usage.cost?.usd),
        lastTurnUsd: insights.lastTurnUsd,
        context: {
          tokens: usage.context.tokens,
          window: usage.context.window,
          percent: usage.context.percent,
          compactAt: band.compactAt,
        },
        fiveHour: five ? { percentUsed: five.percentUsed, resetsAt: five.resetsAt, etaMs: fiveHourEtaMs(now) } : undefined,
        sevenDay: seven ? { percentUsed: seven.percentUsed, resetsAt: seven.resetsAt } : undefined,
        workspace: band.workspace,
        utcOffsetMin: band.utcOffsetMin,
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
