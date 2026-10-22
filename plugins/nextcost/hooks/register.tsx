// The hooks: the one place that touches `$`. Each reads what the engine knows
// into the pure modules, and ui.render hands drawBand a snapshot of them.

import { atom, read, update } from 'claude-code'
import type { ClassicEventOf, EngineInterface, ProcessRunResult, Register, SessionRateLimit, Timer } from 'claude-code'
import { drawBand } from './band'
import {
  cache,
  cacheView,
  msLeft,
  idleCompactFrom,
  noteCompact,
  noteCompaction,
  noteConversationStart,
  noteLedger,
  noteLoad,
  noteRecalled,
  noteResume,
  noteTranscript,
  notePriceModel,
  pinTtl,
  ratePerToken,
  recordResponse,
  resetCache,
  resetConversation,
  resetForResume,
  resolveTtl,
  spentUsd,
  takeRebuilt,
  wantsRecall,
} from './cache'
import type { RecalledReply, ResumedCache, Spend, TranscriptFacts } from './cache'
import { commandPlan, parseCommand } from './command'
import { contextUsed, hostZone, parseReset, readableZone } from './format'
import { resolveGlyphs } from './glyphs'
import {
  fiveHourEtaMs,
  insights,
  noteFiveHour,
  noteTurnEnd,
  noteTurnStart,
  pushContext,
  pushCost,
  resetConversationInsights,
  resetInsights,
  trails,
} from './insights'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'
import {
  FIVE_HOUR,
  LAYOUT_KEY,
  LIMIT_SAMPLES_KEY,
  RATES_KEY,
  READ_LIMIT,
  SESSIONS_KEY,
  addSample,
  asLayoutName,
  removedLayoutOf,
  asLimitSamples,
  asSessions,
  fromStore,
  lastWriteTtl,
  mergeSamples,
  needsTranscript,
  recallOf,
  rememberRate,
  rememberReply,
  sameBucket,
  sampleOf,
  samplesUpTo,
  sessionCostRecord,
  splitLimits,
  transcriptPath,
  transcriptSpend,
} from './memory'
import type { Sample } from './memory'
import { DEFAULT_LAYOUT } from './snapshot'
import type { Glyphs, LayoutName, LimitReading } from './snapshot'
import { NO_WARNINGS, contextToasts, forgetConversation, limitToasts } from './toast'
import type { Warned } from './toast'
import { paintKey } from './words'
import { homeRelative, parseGitState, splitPath } from './workspace'
import type { Workspace } from './workspace'

const isHidden = atom({ plugin: 'nextcost', key: 'isHidden' } as const, false)
const isExpanded = atom({ plugin: 'nextcost', key: 'isExpanded' } as const, false)

/** Long enough for a large repository's status or a transcript's tail,
 *  short enough that a hung command never holds a read open for long. */
const PROCESS_TIMEOUT_MS = 3000

/** A program's run, or undefined where it couldn't run or timed out. Each
 *  call names its whole command as fixed text, so a reader (and the
 *  directory's checks) sees every program the band runs where it runs it. */
const settled = (run: Promise<ProcessRunResult>): Promise<ProcessRunResult | undefined> => run.catch(() => undefined)

/** A conversation the engine said it resumed: its session, when the engine
 *  said so, what it said of its cache, where its transcript is, and once
 *  read, what that shows. */
type Resume = Readonly<{
  sessionId: string
  at: number
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
  /** A removed layout the store still names, which the command mentions; else undefined. */
  removed: string | undefined
  /** The terminal's glyph tier, read from the environment at session.start. */
  glyphs: Glyphs
  /** Where auto-compaction runs, as the context breakdown last said; read
   *  at each measure, not on every redraw. Undefined when off or unknown. */
  compactAt: number | undefined
  /** The breakdown said auto-compaction is off. */
  autoCompactOff: boolean
  /** Idle compaction can run in this session, from this many tokens of
   *  context; undefined when it can't. Read at session.start. */
  idleCompactFrom: number | undefined
  /** A main-loop turn is under way: a compaction then is no idle one. */
  turnOpen: boolean
  /** Where the session is: its project, home-relative, and git there. Read
   *  between redraws, never while drawing, since git takes a process. */
  workspace: Workspace | undefined
  /** The limit samples of the last week, every session's: read from the store
   *  at load and at each new 15-minute bucket, written once per bucket. */
  samples: Sample[]
  /** Reads begun, so one that ends after a newer one never overwrites it. */
  reads: number
  /** The conversation the engine last said it resumed, until it ends. The
   *  engine may say so before session.start, or while it runs, and its reset
   *  forgets it, so it outlives that reset and session.start notes it again. */
  resume: Resume | undefined
  /** What the band last drew, so the timer repaints only when it would change. */
  lastPaintKey: string
  /** The limits' resets the band last drew, epoch ms, so the timer repaints
   *  as their countdowns turn. */
  resets: readonly number[]
  /** Each toast's level reached, so it speaks once per crossing. */
  warned: Warned
  tick: Timer | undefined
} = {
  palette: DARK,
  layout: DEFAULT_LAYOUT,
  removed: undefined,
  glyphs: 'unicode',
  compactAt: undefined,
  autoCompactOff: false,
  idleCompactFrom: undefined,
  turnOpen: false,
  workspace: undefined,
  samples: [],
  reads: 0,
  resume: undefined,
  lastPaintKey: '',
  resets: [],
  warned: NO_WARNINGS,
  tick: undefined,
}

/** A window the engine reports, its reset parsed once, here: past this
 *  point every reset is epoch ms. */
const limitOf = (l: SessionRateLimit): LimitReading & Readonly<{ kind: string }> => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: parseReset(l.resetsAt) })

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
  // Each argument but the path is written out, so a reader sees the whole
  // command here: 1048576 bytes is a megabyte, room for a long last reply.
  const tail = await settled($.process.run(['tail', '-c', '1048576', path], { timeoutMs: PROCESS_TIMEOUT_MS }))
  return tail?.exitCode === 0 ? tail.stdout : readWhole($, path)
}

/** What `sessionId`'s conversation spent before this process resumed it at
 *  `before`, off its transcript: its cost record, which `grep` finds at any
 *  size, and the replies logged after it, which `tail` reads from there.
 *  Where grep can't run, a transcript small enough to read is read whole.
 *  Undefined with no record, or no way to read one. */
const spendBefore = async ($: EngineInterface, path: string, sessionId: string, before: number): Promise<Spend | undefined> => {
  // `-a`: a line cut mid-character would otherwise make the file binary to
  // grep, which then prints no lines and still exits 0.
  // The pattern is COST_RECORD, written out for the same reason.
  const found = await settled($.process.run(['grep', '-a', '-b', '-F', '"type":"cost-state"', path], { timeoutMs: PROCESS_TIMEOUT_MS }))
  // grep exits 1 when nothing matches, 2 when it fails.
  if (found?.exitCode === 1) return undefined
  if (found?.exitCode !== 0) {
    const whole = await readWhole($, path)
    return whole === undefined ? undefined : transcriptSpend(whole, sessionId, before)
  }
  const record = found.isStdoutTruncated ? undefined : sessionCostRecord(found.stdout, sessionId)
  if (record === undefined) return undefined
  const rest = await settled($.process.run(['tail', '-c', `+${record.offset + 1}`, path], { timeoutMs: PROCESS_TIMEOUT_MS }))
  // Replies past what one read holds are left out rather than half-read; the record still counts.
  const tail = rest?.exitCode === 0 && !rest.isStdoutTruncated ? rest.stdout : ''
  // The record is grep's own line and the replies follow its end, so a grep
  // whose offset is the match's, not the line's (ugrep), reads the same.
  const recordEnd = tail.indexOf('\n')
  return transcriptSpend(recordEnd < 0 ? record.line : record.line + tail.slice(recordEnd), sessionId, before)
}

/** Recalls when `sessionId` last had a reply, and what a token costs on
 *  its model, as memory.ts's recallOf weighs them: the band's own store,
 *  then for what it leaves unknown, the end of the transcript `readEnd`
 *  reads. Recalled once per load or resume, and only those facts kept; the
 *  caller notes them. Never throws: unknown stays unknown. */
const recallLastReply = async (
  $: EngineInterface,
  sessionId: string,
  readEnd: () => Promise<string | undefined>,
): Promise<RecalledReply | undefined> => {
  try {
    const model = await $.session.model()
    const rates = await $.store.get(RATES_KEY)
    const sessions = await $.store.get(SESSIONS_KEY)
    const stored = fromStore({ sessions, rates }, sessionId, model)
    return recallOf(stored, needsTranscript(stored) ? await readEnd() : undefined)
  } catch {
    return undefined // nothing to recall
  }
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
      file === undefined ? undefined : spendBefore($, file, mine.sessionId, mine.at),
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
    at: now,
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
    if (rate !== null) await $.store.set(RATES_KEY, rememberRate(await $.store.get(RATES_KEY), cache.priceModel ?? (await $.session.model()), rate))
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
    const stdoutOf = async (run: Promise<ProcessRunResult>): Promise<string | undefined> => {
      const r = await settled(run)
      return r?.exitCode === 0 ? r.stdout : undefined
    }
    const [status, dirs, repo] = await Promise.all([
      // Status without the index lock, so the band never blocks a commit,
      // and without a repository's own fsmonitor, a program its config could
      // name. Untracked files follow the user's own setting.
      stdoutOf($.process.run(['git', '-c', 'core.fsmonitor=false', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'], { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS })),
      // Three lines: git-dir, common-dir, toplevel.
      stdoutOf($.process.run(['git', 'rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir', '--show-toplevel'], { cwd: root, timeoutMs: PROCESS_TIMEOUT_MS })),
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

/** The samples every session has stored; undefined when the read fails. */
const storedSamples = ($: EngineInterface): Promise<Sample[] | undefined> =>
  $.store.get(LIMIT_SAMPLES_KEY).then(asLimitSamples, () => undefined)

/** Keeps a limit sample: within the last one's bucket, in memory alone; at a
 *  new bucket, merged with what other sessions stored, then written once.
 *  Never throws: a store that fails leaves the samples in memory. */
const noteSample = async ($: EngineInterface, sample: Sample): Promise<void> => {
  const last = band.samples[band.samples.length - 1]
  const stored = last !== undefined && sameBucket(last, sample) ? undefined : await storedSamples($)
  if (stored === undefined) {
    // The same bucket, or a failed read, after which a write would overwrite
    // what other sessions stored since: memory alone until the next bucket.
    band.samples = addSample(band.samples, sample)
    return
  }
  band.samples = addSample(samplesUpTo(mergeSamples(band.samples, stored), sample.at), sample)
  await $.store.set(LIMIT_SAMPLES_KEY, band.samples).catch(() => undefined)
}

/** What the session has cost so far, if the host keeps a ledger; undefined
 *  when it has none, or the read fails. */
const ledgerUsd = async ($: EngineInterface): Promise<number | undefined> =>
  (await $.session.usage().catch(() => undefined))?.cost?.usd

/** The stored layout, or chips: a name this version doesn't know, or a value
 *  that isn't a name, draws chips. A read that fails keeps the layout drawn.
 *  Never throws. */
const readLayout = async ($: EngineInterface): Promise<void> => {
  const read = await $.store.get(LAYOUT_KEY).then(
    stored => ({ stored }),
    () => undefined,
  )
  if (read === undefined) return
  band.layout = asLayoutName(read.stored) ?? DEFAULT_LAYOUT
  band.removed = removedLayoutOf(read.stored)
}

/** What /nextcost, or its old name /usage-band, does with `args`: the plan
 *  command.ts makes of it, carried out, and what it answers. */
const runCommand = async ($: EngineInterface, args: string): Promise<{ text: string }> => {
  const plan = commandPlan(parseCommand(args), { layout: band.layout, removed: band.removed, hidden: await read($, isHidden) })
  let text = plan.reply
  if (plan.layout !== undefined) {
    const { name } = plan.layout
    band.layout = name
    band.removed = undefined
    // Remembered for the next session. A store that fails leaves this one
    // switched until the next turn reads the store back, and the reply says so.
    const saved = await $.store.set(LAYOUT_KEY, name).then(
      () => true,
      () => false,
    )
    if (!saved) text = plan.layout.unsaved
  }
  const { expanded, hidden } = plan
  if (expanded !== undefined) await update($, isExpanded, () => expanded)
  if (hidden !== undefined) await update($, isHidden, () => hidden)
  if (plan.layout !== undefined) $.ui.invalidate('ui.render')
  if (plan.readWorkspace) void readWorkspace($)
  return { text }
}

export const register: Register = on => {

  on('session.start', async ($, e, next) => {
    const id = await $.session.id().catch(() => undefined)
    resetCache()
    // A resume of another session is no longer news. It is dropped in the
    // same step as the reset, so no read of it can land in between.
    if (band.resume?.sessionId !== id) band.resume = undefined
    resetInsights()
    band.warned = NO_WARNINGS
    band.lastPaintKey = ''
    band.resets = []
    band.workspace = undefined
    const now = await $.clock.now()
    band.samples = samplesUpTo((await storedSamples($)) ?? [], now)
    band.reads++ // any read still out began before this load
    // A read that fails keeps the layout drawn: none yet, so chips.
    band.layout = DEFAULT_LAYOUT
    await readLayout($)
    notePriceModel(await $.session.model().catch(() => undefined))
    // A resume of this session, said before this load or while it runs, is
    // noted again after the reset.
    if (band.resume !== undefined) applyResume(band.resume)
    noteLoad(await ledgerUsd($))
    void readWorkspace($)
    // Loaded mid-conversation, the band has seen no reply: recall the last,
    // unless the engine said when it was.
    if (id !== undefined && wantsRecall()) {
      const path = band.resume?.path
      const readEnd = async () => {
        const file = await transcriptFile($, id, path)
        return file === undefined ? undefined : transcriptEnd($, file)
      }
      noteRecalled(await recallLastReply($, id, readEnd))
    }

    // One literal name a read: the engine lists the variables a module reads.
    // Each setting by its name, else by its name before 0.18.0.
    const appearance = (await $.env.get('NEXTCOST_APPEARANCE')) ?? (await $.env.get('CC_BAND_APPEARANCE'))
    band.palette = resolvePalette(appearance?.toLowerCase(), await $.env.get('NO_COLOR'))
    band.glyphs = resolveGlyphs({
      NEXTCOST_GLYPHS: (await $.env.get('NEXTCOST_GLYPHS')) ?? (await $.env.get('CC_BAND_GLYPHS')),
      LC_ALL: await $.env.get('LC_ALL'),
      LC_CTYPE: await $.env.get('LC_CTYPE'),
      LANG: await $.env.get('LANG'),
    })
    // Only these two keys are taken; the rest, `env` included, is dropped here.
    const { promptCacheTtl, idleCompaction } = (await $.settings.read().catch(() => undefined)) ?? {}
    const pinned = resolveTtl({
      force5m: await $.env.get('FORCE_PROMPT_CACHING_5M'),
      chosen: await $.env.get('CLAUDE_CODE_PROMPT_CACHE_TTL'),
      setting: promptCacheTtl,
      enable1h: await $.env.get('ENABLE_PROMPT_CACHING_1H'),
    })
    if (pinned !== undefined) pinTtl(pinned)
    band.turnOpen = false
    band.idleCompactFrom = idleCompactFrom({
      terminal: e.surface === 'terminal' && e.isInteractive,
      setting: idleCompaction,
      disableAuto: await $.env.get('DISABLE_AUTO_COMPACT'),
      disableAll: await $.env.get('DISABLE_COMPACT'),
      minTokens: await $.env.get('CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS'),
    })

    // One timer, repainting only when the drawing would differ: every minute
    // (the clocks, the battery, the pace tick), and as each countdown turns,
    // every second where it shows seconds.
    band.tick?.cancel()
    band.tick = $.clock.every(1000, () => {
      void (async () => {
        const now = await $.clock.now()
        const key = paintKey(now, { cacheLeft: msLeft(now), etaMs: fiveHourEtaMs(now), resets: band.resets, zone: readableZone(hostZone, now) })
        if (key !== band.lastPaintKey) {
          band.lastPaintKey = key
          $.ui.invalidate('ui.render')
        }
      })().catch(() => undefined)
    })

    $.command.register({
      name: 'nextcost',
      description: 'Show, hide, expand, collapse or restyle nextcost, what your next message costs',
      argumentHint: '[more | less | show | hide | layout <name>]',
    })
    // The command's name before 0.18.0, kept so a habit or a note still works.
    $.command.register({
      name: 'usage-band',
      description: "nextcost's old name: the same as /nextcost",
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
    resetConversationInsights()
    band.warned = forgetConversation(band.warned)
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
    // Since 2.1.299 a subagent's turn raises turn.start too, with its agentId
    // (read through `in`: older engines' types don't declare it). Its run is
    // part of the main turn that spawned it, which keeps the start cost.
    if ('agentId' in e && e.agentId !== undefined) return next(e)
    band.turnOpen = true
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
      band.turnOpen = false
      const usage = await $.session.usage().catch(() => undefined)
      const cost = usage?.cost?.usd
      const spent = noteTurnEnd(e.turnId, cost)
      // Taken every turn, so a rebuild never marks a later turn's cost.
      const reWarm = takeRebuilt()
      if (spent !== null) pushCost(spent, reWarm)
      const used = usage === undefined ? undefined : contextUsed(usage.context)
      if (used !== undefined) pushContext(used)
      void rememberTurn($, cost)
      const now = await $.clock.now()
      const sample = usage === undefined ? undefined : sampleOf(now, usage.rateLimits.map(limitOf))
      if (sample !== undefined) await noteSample($, sample)
      // Another session may have chosen a layout since.
      await readLayout($)
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
      recordResponse(result.usage, sentAt, isMain)
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
      noteCompact({ now: await $.clock.now(), turnOpen: band.turnOpen, trigger: e.trigger, sizeAfter: result.tokensAfter })
      $.ui.invalidate('ui.render')
    }
    return result
  }).catch(($, e, next) => next(e)) // a failure here must never stop a compaction

  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    for (const limit of e.rateLimits.map(limitOf)) if (limit.kind === FIVE_HOUR) noteFiveHour(now, limit.percentUsed, limit.resetsAt)
    const limits = limitToasts(band.warned, e.rateLimits)
    band.warned = limits.warned
    for (const text of limits.say) $.ui.toast(text)

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

    const context = contextToasts(band.warned, { used: contextUsed(e.context), window: e.context.window, compactAt: band.compactAt, autoCompactOff: band.autoCompactOff })
    band.warned = context.warned
    for (const text of context.say) $.ui.toast(text)

    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'nextcost' }, async ($, e) => runCommand($, e.args))
  // The old name, the same command.
  on('command.run', { command: 'usage-band' }, async ($, e) => runCommand($, e.args))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    // A failed read steps aside rather than break the prompt.
    const usage = await $.session.usage().catch(() => undefined)
    if (usage === undefined) return next(e)
    const now = await $.clock.now()
    const limits = usage.rateLimits.map(limitOf)
    const { five, seven, others } = splitLimits(limits)
    if (usage.cost !== undefined) noteLedger(usage.cost.usd)
    const contextTokens = contextUsed(usage.context) ?? 0
    band.resets = limits.flatMap(l => (l.resetsAt === undefined ? [] : [l.resetsAt]))

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
        cache: cacheView(now, usage.cost?.usd, contextTokens, { from: band.idleCompactFrom, autoCompactOff: band.autoCompactOff }),
        costUsd: spentUsd(usage.cost?.usd),
        lastTurnUsd: insights.lastTurnUsd,
        history: trails,
        context: {
          tokens: usage.context.tokens,
          window: usage.context.window,
          percent: usage.context.percent,
          compactAt: band.compactAt,
          autoCompactOff: band.autoCompactOff,
        },
        fiveHour: five ? { percentUsed: five.percentUsed, resetsAt: five.resetsAt, etaMs: fiveHourEtaMs(now) } : undefined,
        sevenDay: seven ? { percentUsed: seven.percentUsed, resetsAt: seven.resetsAt } : undefined,
        samples: band.samples,
        workspace: band.workspace,
        // Read at each instant drawn, so a daylight-saving change shows by
        // the next minute's repaint, with no reply needed.
        zone: readableZone(hostZone, now),
        otherLimits: others,
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
