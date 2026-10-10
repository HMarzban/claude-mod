// The phrasebook: every phrase a new layout draws, built from facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import {
  fmtBoardLeft,
  fmtClock,
  fmtCost,
  fmtDayClock,
  fmtEstimate,
  fmtEta,
  fmtEtaSpoken,
  fmtLeft,
  fmtLeftShort,
  fmtLeftSpoken,
  fmtSmallCost,
  fmtTokens,
} from './format'
import type { ResetIn } from './format'
// Types alone, erased at runtime, so reading.ts may import this file's values.
import type { CacheFacts, CacheMood, ContextFacts, Frame, LimitFacts, SpendFacts } from './reading'
import type { BandSnapshot } from './snapshot'
import { gitSummary } from './workspace'
import type { Workspace } from './workspace'

/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>

const pct = (frac: number): string => `${Math.round(frac * 100)}%`

/** What an amber reading says, long and short, always led by one `! `. */
export const AMBER = {
  cache: (left: string, leftShort: string, estimate: string): Amber => ({ long: `! ${left} · re-warm ${estimate}`, short: `! ${leftShort}` }),
  context: (frac: number, toCompact: number): Amber => ({ long: `! context ${pct(frac)} · compacts in ~${fmtTokens(toCompact)}`, short: `! ctx ${pct(frac)}` }),
  contextNoCompaction: (frac: number): Amber => ({ long: `! context ${pct(frac)}`, short: `! ctx ${pct(frac)}` }),
  limit: (name: string, percentUsed: number): Amber => {
    const said = `! ${name} ${Math.round(percentUsed)}%`
    return { long: said, short: said }
  },
  limitPace: (name: string, eta: string): Amber => ({ long: `! ${name} full in ${eta}`, short: `! ${name} ${eta}` }),
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  /** Pulse's, where the full sentence won't fit. */
  costsShort: 'No costs yet.',
  history: 'History fills in as you use Claude.',
  context: 'not reported',
  limits: 'none reported',
} as const

/** A reset as a duration: words in sentences, the glyph on tight rows. */
export const resetPhrase = (r: ResetIn, form: 'words' | 'glyph'): string =>
  r.kind === 'passed' ? 'reset' : form === 'words' ? `resets in ${r.text}` : `↻ in ${r.text}`

/** A window's pace in words: a measured fill first, then the average's landing. */
export const paceText = (p: Readonly<{ etaMs: number | null; projectedPct: number | undefined }>): string =>
  p.etaMs !== null
    ? `full in ${fmtEta(p.etaMs)}`
    : p.projectedPct === undefined
      ? ''
      : p.projectedPct >= 100
        ? 'full before reset'
        : `on pace for ~${Math.round(p.projectedPct)}%`

/** What a screen reader hears for a drawn reading: `<name> <value>, <state>,
 *  <more>`, in words. A caller passes "about" and "resets in", never ~ or ↻. */
export const altOf = (name: string, value: string, state?: string, more?: string): string =>
  [`${name} ${value}`, state, more].filter((s): s is string => s !== undefined && s !== '').join(', ')

// ---- the words of each section, from its facts ------------------------------

/** The cache's state as a view names it: `expiring` is `cooling`. */
export type CacheCondition = 'not measured' | 'warming' | 'warm' | 'cooling' | 'cold'

export type CacheWords = Readonly<{
  condition: CacheCondition
  /** The value after `cache `: `52m left`, `warm` while Claude works, `–`, `warming` or `cold`. */
  value: string
  /** The countdown, `52m left` or `47s left`; empty while not counting. */
  left: string
  /** The countdown alone, `52m` or `47s`; empty while not counting. */
  leftShort: string
  say: Say
  sayShort: Say
  /** `say` and `sayShort` as plain text: `cache 52m left`, `cache 52m`. */
  text: string
  textShort: string
  /** The last minute: `! 47s left · re-warm ~$1.66`, then `! 47s`. */
  amber: Amber | undefined
  /** `re-warm ~$1.66 if it goes cold`, or cold, `next message ~$1.66`; undefined until the price is known. */
  reWarmText: string | undefined
  /** When it goes cold, `14:32`, while counting and the offset is known. */
  coldAtClock: string | undefined
  /** When it went cold, `13:28`: undefined until the snapshot carries that
   *  time, since a cold cache's time left is 0. */
  coldSinceClock: string | undefined
  /** What the cache saved, `~$11.40`, and its hit rate, `96%`, once measured. */
  savedText: string | undefined
  hitText: string | undefined
  /** How long it lasts idle: `1h idle`, or `1h idle · assumed` while the hour is a guess. */
  lastsText: string
  /** Unexpected rebuilds, `2`, when there were any. */
  rebuildsText: string | undefined
  /** The board's status: `DEPARTS`, `LAST CALL`, `DEPARTED`, `BOARDING`, `WARMING` or `NOT MEASURED`. */
  board: string
  /** The board's countdown: `IN 52 MIN`, `47s` in the last minute; empty while not counting. */
  boardLeft: string
  alt: string
}>

export type ContextWords = Readonly<{
  /** `38%`, `context 38%` and `ctx 38%`. */
  valueText: string
  text: string
  textShort: string
  say: Say
  sayShort: Say
  /** `! context 93% · compacts in ~14k` / `! ctx 93%`; compaction off, `! context 85%`. */
  amber: Amber | undefined
  /** `! COMPACTS IN ~14K`, or compaction off, `! CONTEXT 85%`. */
  boardAmber: string | undefined
  /** What the share is of: `toward compaction`, or `of the window` when compaction is off. */
  towardText: string
  /** Tokens in context, where it compacts, the room before then, and the window: `76k`, `190k`, `~114k`, `200k`. */
  inContextText: string
  compactsAtText: string | undefined
  roomText: string | undefined
  windowText: string
  alt: string
}>

export type SpendSplit = Readonly<{ label: 'input' | 'output' | 'cache reads'; tokens: number; text: string; frac: number }>

export type SpendWords = Readonly<{
  /** `$3.19`, the last message's `$0.21`, and the tokens, `225k`. */
  totalText: string
  lastText: string | undefined
  tokensText: string
  /** The tokens by kind, each with its share of the total. */
  split: readonly SpendSplit[]
}>

export type LimitWords = Readonly<{
  /** `5h 4%`, or once its window has passed, `5h reset`. */
  text: string
  say: Say
  /** `on pace for ~10%`, `full in ~40m`, `full before reset`, or empty. */
  pace: string
  /** `resets in 3h 00m` and `↻ in 3h 00m`; undefined once passed. */
  resetWords: string | undefined
  resetGlyph: string | undefined
  /** `16:40`, or `Mon 08:40` past today, when the offset is known. */
  resetClock: string | undefined
  /** Where the window lands at its reset: `~10%`. */
  projectedText: string | undefined
  /** A measured fill, `~40m`, and when, `~14:20` (the offset known). */
  fullIn: string | undefined
  fullAtClock: string | undefined
  /** `! 5h 82%`, or with a measured fill, `! 5h full in ~40m` / `! 5h ~40m`. */
  amber: Amber | undefined
  /** `! NEAR LIMIT`, `! FULL ~14:20`, or without the offset, `! FULL IN ~40M`. */
  boardAmber: string | undefined
  /** `~10% AT ↻`, or `RESET`. */
  boardShort: string | undefined
  alt: string
}>

/** A phrase's segments as one plain string. */
const joined = (say: Say): string => say.map(([text]) => text).join('')

/** The cache's condition for each mood, as a view names it. */
const CONDITION: Readonly<Record<CacheMood, CacheCondition>> = {
  unmeasured: 'not measured',
  warming: 'warming',
  warm: 'warm',
  expiring: 'cooling',
  cold: 'cold',
}

/** The board's status for each mood; working, a warm cache is `BOARDING`. */
const BOARD: Readonly<Record<CacheMood, string>> = {
  unmeasured: 'NOT MEASURED',
  warming: 'WARMING',
  warm: 'DEPARTS',
  expiring: 'LAST CALL',
  cold: 'DEPARTED',
}

/** The cache in words, from its facts: it counts down only while `coldInMs` is set. */
export const cacheWords = (f: CacheFacts, c: BandSnapshot['cache'], frame: Frame): CacheWords => {
  const counting = f.coldInMs !== undefined
  const working = f.mood === 'warm' && !counting
  const left = counting ? fmtLeft(f.coldInMs) : ''
  const leftShort = counting ? fmtLeftShort(f.coldInMs) : ''
  const off = frame.utcOffsetMin
  // Spoken, a price is never marked ~: the alt says "about".
  const price = c.reWarmUsd !== null ? fmtSmallCost(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const value = f.mood === 'unmeasured' ? '–' : f.mood === 'warming' ? 'warming' : f.mood === 'cold' ? 'cold' : working ? 'warm' : left
  const say: Say =
    f.mood === 'cold' ? [['cache ', 'label'], ['cold', 'value'], [' · re-warm ', 'label'], [f.estimate, 'value']] : [['cache ', 'label'], [value, 'value']]
  const sayShort: Say =
    f.mood === 'cold'
      ? [['cold ', 'label'], [f.estimate, 'value']]
      : f.mood === 'warming'
        ? [['warming', 'value']]
        : [['cache ', 'label'], [counting ? leftShort : value, 'value']]
  return {
    condition: CONDITION[f.mood],
    value,
    left,
    leftShort,
    say,
    sayShort,
    text: joined(say),
    textShort: joined(sayShort),
    amber: f.mood === 'expiring' ? AMBER.cache(left, leftShort, f.estimate) : undefined,
    reWarmText: !f.known ? undefined : f.mood === 'cold' ? `next message ${f.estimate}` : `re-warm ${f.estimate} if it goes cold`,
    coldAtClock: counting && off !== undefined ? fmtClock(frame.now + f.coldInMs, off) : undefined,
    coldSinceClock: undefined,
    savedText: f.measured && c.savedUsd !== null ? fmtEstimate(c.savedUsd) : undefined,
    hitText: f.hitFrac === undefined ? undefined : pct(f.hitFrac),
    // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
    lastsText: `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`,
    rebuildsText: c.misses > 0 ? String(c.misses) : undefined,
    board: working ? 'BOARDING' : BOARD[f.mood],
    boardLeft: !counting ? '' : f.mood === 'expiring' ? leftShort : fmtBoardLeft(f.coldInMs),
    alt:
      f.mood === 'unmeasured'
        ? 'cache not measured yet'
        : f.mood === 'warming'
          ? 'cache warming'
          : f.mood === 'cold'
            ? altOf('cache', 'cold', `re-warm about ${price}`)
            : counting
              ? altOf('cache', fmtLeftSpoken(f.coldInMs), CONDITION[f.mood], f.mood === 'expiring' ? `re-warm about ${price}` : undefined)
              : altOf('cache', 'warm', 'Claude is working'),
  }
}

/** The context in words, measured toward compaction when it is on. */
export const contextWords = (f: ContextFacts): ContextWords => {
  const towardText = f.compactAt !== undefined ? 'toward compaction' : 'of the window'
  const roomText = f.toCompact === undefined ? undefined : `~${fmtTokens(f.toCompact)}`
  const say: Say = [['context ', 'label'], [f.pct, 'value']]
  const sayShort: Say = [['ctx ', 'label'], [f.pct, 'value']]
  const amber = f.tone !== 'amber' ? undefined : f.toCompact !== undefined ? AMBER.context(f.frac, f.toCompact) : AMBER.contextNoCompaction(f.frac)
  return {
    valueText: f.pct,
    text: joined(say),
    textShort: joined(sayShort),
    say,
    sayShort,
    amber,
    boardAmber: f.tone !== 'amber' ? undefined : roomText !== undefined ? `! COMPACTS IN ${roomText.toUpperCase()}` : `! CONTEXT ${f.pct}`,
    towardText,
    inContextText: fmtTokens(f.used),
    compactsAtText: f.compactAt === undefined ? undefined : fmtTokens(f.compactAt),
    roomText,
    windowText: fmtTokens(f.window),
    alt: altOf('context', `${Math.round(f.frac * 100)} percent ${towardText}`, f.tone === 'amber' ? 'near the limit' : 'fine'),
  }
}

/** The session's cost and tokens in words, the tokens split by kind. */
export const spendWords = (f: SpendFacts): SpendWords => ({
  totalText: fmtCost(f.totalUsd),
  lastText: f.lastTurnUsd === null ? undefined : fmtSmallCost(f.lastTurnUsd),
  tokensText: fmtTokens(f.total),
  split: (
    [
      ['input', f.sent],
      ['output', f.back],
      ['cache reads', f.cached],
    ] as const
  ).map(([label, tokens]) => ({ label, tokens, text: fmtTokens(tokens), frac: f.total > 0 ? tokens / f.total : 0 })),
})

/** A limit window in words; once it has passed, only that it reset. */
export const limitWords = (f: LimitFacts, frame: Frame): LimitWords => {
  const off = frame.utcOffsetMin
  const live = !f.passed
  const projected = live ? f.projectedPct : undefined
  const projectedText = projected === undefined ? undefined : `~${Math.round(projected)}%`
  const etaMs = live ? f.etaMs : null
  const fullIn = etaMs !== null ? fmtEta(etaMs) : undefined
  const fullAtClock = etaMs !== null && off !== undefined ? `~${fmtClock(frame.now + etaMs, off)}` : undefined
  const say: Say = [[`${f.name} `, 'label'], [live ? f.value : 'reset', 'value']]
  return {
    text: joined(say),
    say,
    pace: live ? paceText(f) : '',
    resetWords: f.reset?.kind === 'in' ? resetPhrase(f.reset, 'words') : undefined,
    resetGlyph: f.reset?.kind === 'in' ? resetPhrase(f.reset, 'glyph') : undefined,
    resetClock: f.resetInMs !== undefined && off !== undefined ? fmtDayClock(frame.now + f.resetInMs, off, frame.now) : undefined,
    projectedText,
    fullIn,
    fullAtClock,
    amber: f.tone !== 'amber' ? undefined : fullIn !== undefined ? AMBER.limitPace(f.name, fullIn) : AMBER.limit(f.name, f.percentUsed),
    boardAmber:
      f.tone !== 'amber'
        ? undefined
        : fullIn === undefined
          ? '! NEAR LIMIT'
          : fullAtClock !== undefined
            ? `! FULL ${fullAtClock}`
            : `! FULL IN ${fullIn.toUpperCase()}`,
    boardShort: f.passed ? 'RESET' : projectedText !== undefined ? `${projectedText} AT ↻` : undefined,
    alt: altOf(
      `${f.name} limit`,
      live ? `${Math.round(f.percentUsed)} percent used` : 'reset',
      f.tone === 'amber' ? 'needs attention' : 'fine',
      etaMs !== null ? `full in ${fmtEtaSpoken(etaMs)}` : projected !== undefined ? `about ${Math.round(projected)} percent at its reset` : undefined,
    ),
  }
}

/** Where the session is, as one line: the path, then git in words. */
export const workspaceWords = (ws: Workspace | undefined): string | undefined =>
  ws === undefined ? undefined : ws.git === undefined ? ws.path : `${ws.path}, ${gitSummary(ws.git)}`
