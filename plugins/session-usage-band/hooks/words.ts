// The phrasebook: every phrase a new layout draws, built from facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import type { DayCell, HourCell, Week } from './calendar'
import {
  FIVE_HOUR_MS,
  fmtAgo,
  fmtBoardEta,
  fmtBoardLeft,
  fmtClock,
  fmtCost,
  fmtCountdown,
  fmtDay,
  fmtDayClock,
  fmtEstimate,
  fmtEta,
  fmtEtaSpoken,
  fmtLeft,
  fmtLeftShort,
  fmtLeftSpoken,
  fmtPct,
  fmtSmallCost,
  fmtTokens,
  isToday,
  severityMark,
} from './format'
import type { ResetIn } from './format'
import type { CostEntry, TrailPoint, Trails } from './insights'
// Types alone, erased at runtime, so reading.ts may import this file's values.
import type { CacheFacts, CacheMood, ContextFacts, Frame, LimitFacts, LimitView, SpendFacts } from './reading'
import type { BandSnapshot } from './snapshot'
import { gitSummary } from './workspace'
import type { Workspace } from './workspace'

/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>
/** A reading's amber words, and `beside`: its reason after its figure, drawn
 *  apart, naming the reading in place of its label: `! 5h ~1h`, `! cache`. */
export type ReadingAmber = Amber & Readonly<{ beside: string }>
/** A reading's next change, as forecast's row says it: its words up to the
 *  figure, the figure, how far off it is, and what follows, `cold at `
 *  `16:13` `in 59m` `re-warm ~$0.80`; `brief`, where set, the words a tight
 *  row keeps in place of the lead and the rest. */
export type Ahead = Readonly<{ lead: Say; figure: string; soon?: string; tail?: string; brief?: Say }>

/** A value not known yet: unknown, never 0. */
const UNKNOWN = '–'

/** What leads an amber reading: its mark, then its words. */
export const AMBER_LEAD = '! '

/** What an amber reading says, long and short, always led by one `AMBER_LEAD`. */
export const AMBER = {
  cache: (left: string, leftShort: string, estimate: string): ReadingAmber => ({ long: `${AMBER_LEAD}${left} · re-warm ${estimate}`, short: `${AMBER_LEAD}${leftShort}`, beside: `${AMBER_LEAD}cache` }),
  context: (frac: number, toCompact: number): ReadingAmber => ({
    long: `${AMBER_LEAD}context ${fmtPct(frac)} · compacts in ~${fmtTokens(toCompact)}`,
    short: `${AMBER_LEAD}ctx ${fmtPct(frac)}`,
    beside: `${AMBER_LEAD}context`,
  }),
  contextNoCompaction: (frac: number): ReadingAmber => ({ long: `${AMBER_LEAD}context ${fmtPct(frac)}`, short: `${AMBER_LEAD}ctx ${fmtPct(frac)}`, beside: `${AMBER_LEAD}context` }),
  limit: (name: string, percentUsed: number): ReadingAmber => {
    const said = `${AMBER_LEAD}${name} ${Math.round(percentUsed)}%`
    return { long: said, short: said, beside: `${AMBER_LEAD}${name}` }
  },
  limitPace: (name: string, eta: string): ReadingAmber => ({ long: `${AMBER_LEAD}${name} full in ${eta}`, short: `${AMBER_LEAD}${name} ${eta}`, beside: `${AMBER_LEAD}${name} ${eta}` }),
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  /** Pulse's, where the full sentence won't fit: at most 10 characters, the
   *  room a 40-column desktop line leaves it. */
  costsShort: 'No costs.',
  history: 'History fills in as you use Claude.',
  context: 'not reported',
  limits: 'none reported',
} as const

/** A reset as a duration: words in sentences, the glyph on tight rows. */
export const resetPhrase = (r: ResetIn, form: 'words' | 'glyph'): string =>
  r.kind === 'passed' ? 'reset' : form === 'words' ? `resets in ${r.text}` : `↻ in ${r.text}`

/** A landing at or over 100% is none: the window fills before it resets. */
const fillsBeforeReset = (projectedPct: number): boolean => projectedPct >= 100

/** A window's pace in words: a measured fill first, then the average's landing. */
export const paceText = (p: Readonly<{ etaMs: number | null; projectedPct: number | undefined }>): string =>
  p.etaMs !== null
    ? `full in ${fmtEta(p.etaMs)}`
    : p.projectedPct === undefined
      ? ''
      : fillsBeforeReset(p.projectedPct)
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
  /** The cache as a sentence names it, bold on its figure alone: `cache
   *  52m left`, `cache cold · re-warm ~$1.66`; cold and short of room,
   *  `cache cold ~$1.66`. Warming or working, it has no figure to bold. */
  sentence: Say
  sentenceShort: Say
  /** `say` and its short form as plain text: `cache 52m left`, `cache 52m`. */
  text: string
  textShort: string
  /** The last minute: `! 47s left · re-warm ~$1.66`, then `! 47s`. */
  amber: ReadingAmber | undefined
  /** `re-warm ~$1.66 if it goes cold`, or cold, `next message ~$1.66`; undefined until the price is known. */
  reWarmText: string | undefined
  /** When it goes cold, `14:32`, while counting and the offset is known. */
  coldAtClock: string | undefined
  /** `cold at 14:32`, as a lens says it; set where `coldAtClock` is. */
  coldAtText: string | undefined
  /** Its next change: going cold, at its clock time or in its countdown;
   *  cold, what re-warming costs; else its state, `cache warm`. */
  ahead: Ahead
  /** When it went cold, `13:28`, once measured and the offset is known. */
  coldSinceClock: string | undefined
  /** What the cache saved, `~$11.40`, and its hit rate, `96%`, once measured. */
  savedText: string | undefined
  hitText: string | undefined
  /** How long it lasts idle: `1h idle`, or `1h idle · assumed` while the hour is a guess. */
  lastsText: string
  /** Unexpected rebuilds, `2`, when there were any. */
  rebuildsText: string | undefined
  /** How long a recalled cache sat idle, `2h 05m`; undefined unless recalled. */
  idleText: string | undefined
  /** The cache card's headline: its countdown, `59m left`, else its mood. */
  cardHead: Say
  /** A gauge's reading beside its bar: `52m left`, bold on its figure, else
   *  its mood; short, its figure alone, `52m`. */
  gaugeSay: Say
  gaugeShort: Say
  /** What qualifies it: `re-warm ~$1.66`, while counting down or cold. */
  gaugeMore: string | undefined
  /** The cache card's line while there is nothing to count. */
  cardNote: string | undefined
  /** The board's status: `DEPARTS`, `LAST CALL`, `DEPARTED`, `BOARDING`, `WARMING` or `NOT MEASURED`. */
  board: string
  /** The board's countdown: `IN 52 MIN`, `47s` in the last minute; empty while not counting. */
  boardLeft: string
  alt: string
}>

export type ContextWords = Readonly<{
  /** `38%`, `context 38%` and `ctx 38%`; while not reported, `–`. */
  valueText: string
  text: string
  textShort: string
  say: Say
  sayShort: Say
  /** `! context 93% · compacts in ~14k` / `! ctx 93%`; compaction off, `! context 85%`. */
  amber: ReadingAmber | undefined
  /** `! COMPACTS IN ~14K`, or compaction off, `! CONTEXT 85%`. */
  boardAmber: string | undefined
  /** What the share is of: `toward compaction`, or `of the window` when compaction is off. */
  towardText: string
  /** Tokens in context, where it compacts, the room before then, and the window:
   *  `76k`, `190k`, `~114k`, `200k`. While not reported, `–` and no room. */
  inContextText: string
  compactsAtText: string | undefined
  roomText: string | undefined
  /** `auto-compaction off`, only when the engine says so; unknown says nothing. */
  compactionOffText: string | undefined
  windowText: string
  /** Its next change, `compacts in ~114k`; none until compaction's room is known. */
  ahead: Ahead | undefined
  /** The context card's headline: `87% full`, marked past 80% when compaction is off. */
  cardHead: Say
  /** `context 87% full`, bold on its figure alone. */
  sentence: Say
  /** A gauge's reading beside its bar: `87% full`, short `87%`; while not
   *  reported, `not reported`, short `–`. An amber gauge's mark leads it. */
  gaugeSay: Say
  gaugeShort: Say
  /** What qualifies it: its room, `~114k left`, or near compaction the
   *  reason, `compacts in ~14k`. */
  gaugeMore: string | undefined
  alt: string
}>

/** The kinds the session's tokens split into, in the order they are drawn. */
export const SPLIT_LABELS = ['input', 'output', 'cache reads'] as const

export type SpendSplit = Readonly<{ label: (typeof SPLIT_LABELS)[number]; tokens: number; text: string; frac: number }>

export type SpendWords = Readonly<{
  /** `$3.19`, the last message's `$0.21`, and the tokens, `225k`. */
  totalText: string
  lastText: string | undefined
  tokensText: string
  /** The tokens by kind, each with its share of the total. */
  split: readonly SpendSplit[]
  /** `spent $3.19`, bold on its figure alone. */
  sentence: Say
}>

export type LimitWords = Readonly<{
  /** `4%`, or once its window has passed, `reset`. */
  valueText: string
  /** `82%!`: the value with its escalation mark, colour never the only signal. */
  valueMarked: string
  /** A card's reset and pace: `resets 3h 00m · on pace for ~10%`; undefined
   *  without a reset to come. */
  cardReset: string | undefined
  /** `cardReset`, or in the clock's form `cardResetAt`, less what a layout's
   *  collapsed lines already say of the window: `resets 16:40`, or its pace
   *  alone; undefined once nothing is left. */
  cardResetLess: (form: 'countdown' | 'clock', said: Readonly<{ reset: boolean; pace: boolean }>) => string | undefined
  /** When it resets, after `resets`: `16:40` or `Sat 13:30` once the offset
   *  is known, else `in 3h 00m`; undefined without a reset to come. */
  resetWhen: string | undefined
  /** A card's reset at its clock time and pace, as LIMITS' lead row says
   *  it: `resets 16:40 · on pace for ~10%`, else `resets in 3h 00m · …`. */
  cardResetAt: string | undefined
  /** `5h 4%`, or once its window has passed, `5h reset`. */
  text: string
  say: Say
  /** `on pace for ~10%`, `full in ~40m`, `full before reset`, or empty. */
  pace: string
  /** `resets in 3h 00m` and `↻ in 3h 00m`; undefined once passed. */
  resetWords: string | undefined
  resetGlyph: string | undefined
  /** Chips' short form, `↻ 3h 00m`; undefined once passed. */
  resetShort: string | undefined
  /** `16:40`, or `Mon 08:40` past today, when the offset is known. */
  resetClock: string | undefined
  /** After `↻`, a clock time: `↻ 16:40`, else `↻ in 3h 00m`; in the ascii
   *  tier, which drops the glyph, `resets 16:40`. Undefined once passed. */
  resetAtGlyph: string | undefined
  /** The limit as a sentence says it, bold on its figure, with its pace and
   *  its reset where asked and known: `7d 30% · on pace for ~50% · ↻ Sat 19:00`. */
  sentence: (withPace: boolean, withReset: boolean) => Say
  /** Where the window lands at its reset, `~10%`; none at 100% or more,
   *  where `pace` says `full before reset`. */
  projectedText: string | undefined
  /** The landing for a reader, `5h limit about 10 percent at its reset`,
   *  set where `projectedText` is. */
  projectedAlt: string | undefined
  /** When it fills before its reset, measured or at the average's pace:
   *  `~Mon` past today, `~14:20` today, or with the offset unknown `in ~13h`. */
  fillAt: string | undefined
  /** `full ~Mon`, as a lens says it; set where `fillAt` is. */
  fillText: string | undefined
  /** `7d full ~Mon`: the same, named, beside another window's figure. */
  fillNamed: string | undefined
  /** Its next change after its name: its fill, `66% · full ~Mon · ↻ Sat
   *  13:30`, else its reset and pace, `4% · ↻ 16:40 · on pace for ~10%`;
   *  none at 0%, where nothing is moving, or once passed. */
  ahead: Ahead | undefined
  /** A measured fill, `~40m`. */
  fullIn: string | undefined
  /** `! 5h 82%`, or with a measured fill, `! 5h full in ~40m` / `! 5h ~40m`. */
  amber: ReadingAmber | undefined
  /** An amber window as a card's headline, led by its mark, `! spend 92%`. */
  amberHead: Say | undefined
  /** `! NEAR LIMIT`, `! FULL ~14:20`, or without the offset, `! FULL IN ~40 MIN`. */
  boardAmber: string | undefined
  /** `~10% AT ↻`, `FULL BEFORE ↻`, or `RESET`; in the ascii tier, `~10% AT RESET`. */
  boardShort: string | undefined
  /** The board's time of the reset: `↻ 16:40`, or without the offset `IN 3H 00 MIN`;
   *  in the ascii tier `RESET 16:40`, past today `SAT 22:30`. Undefined once passed. */
  boardTime: string | undefined
  alt: string
}>

/** Between the readings of a sentence: `cache 52m left │ spent $3.19`. */
export const BETWEEN_READINGS = ' │ '

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
  // The card counts down as chips' row always has: `1h 05m`, `0:47`.
  const countdown: Say = [[fmtCountdown(c.msLeft), 'value'], [' left', 'label']]
  const cardHead: Say =
    f.mood === 'unmeasured'
      ? [['not measured yet', 'value']]
      : f.mood === 'warming'
        ? [['warming', 'value']]
        : f.mood === 'cold'
          ? [['cold', 'value']]
          : working
            ? [['warm', 'value']]
            : countdown
  const value = f.mood === 'unmeasured' ? UNKNOWN : f.mood === 'warming' ? 'warming' : f.mood === 'cold' ? 'cold' : working ? 'warm' : left
  const say: Say =
    f.mood === 'cold' ? [['cache ', 'label'], ['cold', 'value'], [' · re-warm ', 'label'], [f.estimate, 'value']] : [['cache ', 'label'], [value, 'value']]
  const sayShort: Say =
    f.mood === 'cold'
      ? [['cold ', 'label'], [f.estimate, 'value']]
      : f.mood === 'warming'
        ? [['warming', 'value']]
        : [['cache ', 'label'], [counting ? leftShort : value, 'value']]
  const sentence: Say =
    f.mood === 'cold'
      ? [['cache cold · re-warm ', 'label'], [f.estimate, 'value']]
      : counting
        ? [['cache ', 'label'], [leftShort, 'value'], [' left', 'label']]
        : f.mood === 'warming' || working
          ? [[joined(say), 'label']]
          : say
  const coldAtClock = counting && off !== undefined ? fmtClock(frame.now + f.coldInMs, off) : undefined
  const reWarm = `re-warm ${f.estimate}`
  const ahead: Ahead = counting
    ? coldAtClock !== undefined
      ? { lead: [['cold at ', 'value']], figure: coldAtClock, soon: `in ${leftShort}`, tail: reWarm }
      : { lead: [['cold in ', 'value']], figure: leftShort, tail: reWarm }
    : f.mood === 'cold'
      ? { lead: [['cold · re-warm ', 'value']], figure: f.estimate, brief: [['cold ', 'value']] }
      : { lead: [['cache ', 'label']], figure: value }
  return {
    condition: CONDITION[f.mood],
    value,
    left,
    leftShort,
    say,
    sentence,
    sentenceShort: f.mood === 'cold' ? [['cache cold ', 'label'], [f.estimate, 'value']] : sentence,
    text: joined(say),
    textShort: joined(sayShort),
    amber: f.mood === 'expiring' ? AMBER.cache(left, leftShort, f.estimate) : undefined,
    reWarmText: !f.known ? undefined : f.mood === 'cold' ? `next message ${f.estimate}` : `re-warm ${f.estimate} if it goes cold`,
    coldAtClock,
    coldAtText: coldAtClock === undefined ? undefined : `cold at ${coldAtClock}`,
    ahead,
    coldSinceClock: f.mood === 'cold' && c.coldAt !== null && off !== undefined ? fmtClock(c.coldAt, off) : undefined,
    savedText: f.measured && c.savedUsd !== null ? fmtEstimate(c.savedUsd) : undefined,
    hitText: f.hitFrac === undefined ? undefined : fmtPct(f.hitFrac),
    // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
    lastsText: `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`,
    rebuildsText: c.misses > 0 ? String(c.misses) : undefined,
    idleText: c.recalled && c.idleMs !== null ? fmtAgo(c.idleMs) : undefined,
    cardHead,
    gaugeSay: counting ? [[leftShort, 'value'], [' left', 'label']] : [[value, 'value']],
    gaugeShort: [[counting ? leftShort : value, 'value']],
    gaugeMore: counting || f.mood === 'cold' ? `re-warm ${f.estimate}` : undefined,
    cardNote:
      f.mood === 'unmeasured' ? "Countdown starts with Claude's next reply." : f.mood === 'warming' ? 'First message builds the cache.' : undefined,
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

/** The context in words, measured toward compaction when it is on; unknown
 *  while the engine reports none, never 0%. */
export const contextWords = (f: ContextFacts): ContextWords => {
  const value = f.known ? f.pct : UNKNOWN
  const towardText = f.compactAt !== undefined ? 'toward compaction' : 'of the window'
  const roomText = !f.known || f.toCompact === undefined ? undefined : `~${fmtTokens(f.toCompact)}`
  const say: Say = [['context ', 'label'], [value, 'value']]
  const sayShort: Say = [['ctx ', 'label'], [value, 'value']]
  const amber = f.tone !== 'amber' ? undefined : f.toCompact !== undefined ? AMBER.context(f.frac, f.toCompact) : AMBER.contextNoCompaction(f.frac)
  const cardHead: Say = [[`${f.pct}${f.compactAt === undefined ? severityMark(f.frac) : ''}`, 'value'], [' full', 'label']]
  return {
    valueText: value,
    text: joined(say),
    textShort: joined(sayShort),
    say,
    sayShort,
    amber,
    boardAmber: f.tone !== 'amber' ? undefined : roomText !== undefined ? `! COMPACTS IN ${roomText.toUpperCase()}` : `! CONTEXT ${f.pct}`,
    towardText,
    inContextText: f.known ? fmtTokens(f.used) : UNKNOWN,
    compactsAtText: f.compactAt === undefined ? undefined : fmtTokens(f.compactAt),
    roomText,
    compactionOffText: f.autoCompactOff ? 'auto-compaction off' : undefined,
    windowText: fmtTokens(f.window),
    ahead: roomText === undefined ? undefined : { lead: [['compacts in ', 'value']], figure: roomText },
    cardHead,
    sentence: [['context ', 'label'], ...cardHead],
    gaugeSay: f.known ? [[f.pct, 'value'], [' full', 'label']] : [[EMPTY.context, 'label']],
    gaugeShort: f.known ? [[f.pct, 'value']] : [[UNKNOWN, 'label']],
    gaugeMore: roomText === undefined ? undefined : f.nearCompact ? `compacts in ${roomText}` : `${roomText} left`,
    alt: f.known
      ? altOf('context', `${Math.round(f.frac * 100)} percent ${towardText}`, f.tone === 'amber' ? 'near the limit' : 'fine')
      : altOf('context', EMPTY.context),
  }
}

/** The session's cost and tokens in words, the tokens split by kind. */
export const spendWords = (f: SpendFacts): SpendWords => {
  const tokensByLabel: Readonly<Record<SpendSplit['label'], number>> = { input: f.sent, output: f.back, 'cache reads': f.cached }
  const totalText = fmtCost(f.totalUsd)
  return {
    totalText,
    lastText: f.lastTurnUsd === null ? undefined : fmtSmallCost(f.lastTurnUsd),
    tokensText: fmtTokens(f.total),
    split: SPLIT_LABELS.map(label => {
      const tokens = tokensByLabel[label]
      return { label, tokens, text: fmtTokens(tokens), frac: f.total > 0 ? tokens / f.total : 0 }
    }),
    sentence: [['spent ', 'label'], [totalText, 'value']],
  }
}

/** A limit window in words; once it has passed, only that it reset. */
export const limitWords = (f: LimitFacts, frame: Frame): LimitWords => {
  const off = frame.utcOffsetMin
  const live = !f.passed
  const projected = live ? f.projectedPct : undefined
  const fills = projected !== undefined && fillsBeforeReset(projected)
  const lands = projected !== undefined && !fills
  const projectedText = lands ? `~${Math.round(projected)}%` : undefined
  const landing = lands ? `about ${Math.round(projected)} percent at its reset` : undefined
  const etaMs = live ? f.etaMs : null
  const fullIn = etaMs !== null ? fmtEta(etaMs) : undefined
  const fullAtClock = etaMs !== null && off !== undefined ? `~${fmtClock(frame.now + etaMs, off)}` : undefined
  const valueText = live ? f.value : 'reset'
  const say: Say = [[`${f.name} `, 'label'], [valueText, 'value']]
  const resetGlyph = f.reset?.kind === 'in' ? resetPhrase(f.reset, 'glyph') : undefined
  const resetAt = f.resetInMs === undefined ? undefined : frame.now + f.resetInMs
  const resetClock = resetAt !== undefined && off !== undefined ? fmtDayClock(resetAt, off, frame.now) : undefined
  const resetToday = resetAt !== undefined && off !== undefined && isToday(resetAt, off, frame.now)
  // The ascii tier drops `↻`, so a phrase whose object is the glyph says its word.
  const ascii = frame.glyphs === 'ascii'
  const boardReset = ascii ? 'RESET' : '↻'
  const resetMark = ascii ? 'resets' : '↻'
  const pace = live ? paceText(f) : ''
  const resetWhen = f.reset?.kind !== 'in' ? undefined : (resetClock ?? `in ${f.reset.text}`)
  const fillInMs = live ? f.fillInMs : undefined
  const fillAt = fillInMs === undefined ? undefined : off !== undefined ? `~${fmtDay(frame.now + fillInMs, off, frame.now)}` : `in ${fmtEta(fillInMs)}`
  const resetAtGlyph = resetClock === undefined ? resetGlyph : `${resetMark} ${resetClock}`
  const cardResetLess = (form: 'countdown' | 'clock', said: Readonly<{ reset: boolean; pace: boolean }>): string | undefined => {
    if (f.reset?.kind !== 'in') return undefined
    const parts = [said.reset ? '' : `resets ${form === 'clock' ? resetWhen : f.reset.text}`, said.pace ? '' : pace].filter(t => t !== '')
    return parts.length === 0 ? undefined : parts.join(' · ')
  }
  const nothingSaid = { reset: false, pace: false }
  const standing: Say = [[`${f.value} · `, 'label']]
  // Its next change says its reset after the mark, as chips' pill does:
  // `↻ Sat 13:30`, or with the offset unknown, `↻ 5d 22h`.
  const ahead: Ahead | undefined =
    f.reset?.kind !== 'in' || Math.round(f.percentUsed) === 0
      ? undefined
      : fillAt !== undefined && fillInMs !== undefined
        ? { lead: [...standing, ['full ', 'value']], figure: fillAt, soon: off === undefined ? undefined : `in ${fmtEta(fillInMs)}`, tail: `${resetMark} ${resetClock ?? f.reset.text}` }
        : {
            lead: [...standing, [`${resetMark} `, 'value']],
            figure: resetClock ?? f.reset.text,
            soon: resetClock === undefined ? undefined : `in ${f.reset.text}`,
            tail: pace === '' ? undefined : pace,
          }
  return {
    valueText,
    valueMarked: `${f.value}${severityMark(f.frac)}`,
    cardReset: cardResetLess('countdown', nothingSaid),
    cardResetLess,
    resetWhen,
    cardResetAt: cardResetLess('clock', nothingSaid),
    text: joined(say),
    say,
    pace,
    resetWords: f.reset?.kind === 'in' ? resetPhrase(f.reset, 'words') : undefined,
    resetGlyph,
    resetShort: f.reset?.kind === 'in' ? `↻ ${f.reset.text}` : undefined,
    resetClock,
    resetAtGlyph,
    sentence: (withPace, withReset) => [
      ...say,
      ...[withPace ? pace : '', withReset ? (resetAtGlyph ?? '') : '']
        .filter(t => t !== '')
        .map((t): Say[number] => [` · ${t}`, 'label']),
    ],
    projectedText,
    projectedAlt: landing === undefined ? undefined : altOf(`${f.name} limit`, landing),
    fillAt,
    fillText: fillAt === undefined ? undefined : `full ${fillAt}`,
    fillNamed: fillAt === undefined ? undefined : `${f.name} full ${fillAt}`,
    ahead,
    fullIn,
    amber: f.tone !== 'amber' ? undefined : fullIn !== undefined ? AMBER.limitPace(f.name, fullIn) : AMBER.limit(f.name, f.percentUsed),
    amberHead: f.tone !== 'amber' ? undefined : [[AMBER_LEAD, 'amber'], [`${f.name} `, 'label'], [valueText, 'value']],
    boardAmber:
      f.tone !== 'amber'
        ? undefined
        : etaMs === null
          ? '! NEAR LIMIT'
          : fullAtClock !== undefined
            ? `! FULL ${fullAtClock}`
            : `! FULL ${fmtBoardEta(etaMs)}`,
    boardShort: f.passed ? 'RESET' : fills ? `FULL BEFORE ${boardReset}` : projectedText !== undefined ? `${projectedText} AT ${boardReset}` : undefined,
    // In ascii, TIME's 14 cells can't hold `RESET SAT 22:30`, so past today the weekday says it alone.
    boardTime:
      resetClock !== undefined
        ? (ascii && !resetToday ? resetClock : `${boardReset} ${resetClock}`).toUpperCase()
        : f.resetInMs !== undefined
          ? fmtBoardLeft(f.resetInMs)
          : undefined,
    alt: altOf(
      `${f.name} limit`,
      live ? `${Math.round(f.percentUsed)} percent used` : 'reset',
      f.tone === 'amber' ? 'needs attention' : 'fine',
      etaMs !== null
        ? `full in ${fmtEtaSpoken(etaMs)}`
        : fills
          ? 'full before its reset'
          : landing,
    ),
  }
}

/** Where the session is, as one line: the path, then git in words. */
export const workspaceWords = (ws: Workspace | undefined): string | undefined =>
  ws === undefined ? undefined : ws.git === undefined ? ws.path : `${ws.path}, ${gitSummary(ws.git)}`

/** What the history says: the costs' numbers, and each trail's trend for a reader. */
export type HistoryWords = Readonly<{
  /** '$0.21' */
  lastText: string | undefined
  /** '$0.18': the average with re-warms left out. */
  avgText: string | undefined
  /** '$0.84 re-warm' */
  maxText: string | undefined
  /** 'last $0.21 · avg $0.18 · max $0.84 re-warm' */
  numbersText: string
  /** 'last $0.21' */
  numbersShort: string
  /** 'cost of the last 14 messages, steady' | '…, rising, the newest a re-warm' */
  costsAlt: string
  /** The same for the newest `count` alone, as a chart that draws fewer says them. */
  costsAltOf: (count: number) => string
  /** '5h usage over the last hour, steady' | '…, rising, full in about 40 minutes' */
  trailAlt: string
  /** '5h usage this window, rising, full in about 40 minutes': the same since the window started. */
  fiveHourWindowAlt: string
  /** 'context over the conversation, rising, compacts at 190k'; with compaction off, no compaction point. */
  contextTrailAlt: string
  /** '~12 messages to compaction', at the context's average rise a message
   *  since its last compaction; undefined until it has risen, or with
   *  compaction off. */
  toCompactionText: string | undefined
}>

/** A message above this many times the warm average is rising; below the average divided by it, falling. */
const TREND_FACTOR = 1.5
/** Points the 5h reading must rise, first point to last, to be rising. */
const TRAIL_RISE = 2

/** The points of a trail from the last hour before `now`. */
export const lastHourOf = (trail: readonly TrailPoint[], now: number): TrailPoint[] => trail.filter(p => p.at >= now - 3600_000)

/** The points of a trail since the 5h window started; none while no window is known. */
export const thisWindowOf = (trail: readonly TrailPoint[], fiveHour: LimitView | undefined, now: number): TrailPoint[] => {
  if (fiveHour?.resetInMs === undefined) return []
  const start = now + fiveHour.resetInMs - FIVE_HOUR_MS
  return trail.filter(p => p.at >= start)
}

/** A 5h trail's trend: rising once it has climbed `TRAIL_RISE` points. */
const riseOf = (points: readonly TrailPoint[]): 'rising' | 'steady' =>
  points.length >= 2 && (points[points.length - 1]?.pct ?? 0) - (points[0]?.pct ?? 0) >= TRAIL_RISE ? 'rising' : 'steady'

/** The context trail's trend, first point to last: a compaction can leave it falling. */
const contextTrendOf = (tokens: readonly number[]): 'rising' | 'falling' | 'steady' => {
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  return first === undefined || last === undefined || last === first ? 'steady' : last > first ? 'rising' : 'falling'
}

export const historyWords = (record: Trails, fiveHour: LimitView | undefined, context: ContextFacts, now: number): HistoryWords => {
  const last = record.costs[record.costs.length - 1]
  const warm = record.costs.filter(e => !e.reWarm)
  const avg = warm.length === 0 ? undefined : warm.reduce((sum, e) => sum + e.usd, 0) / warm.length
  const max = record.costs.reduce<CostEntry | undefined>((top, e) => (top === undefined || e.usd > top.usd ? e : top), undefined)
  const lastText = last === undefined ? undefined : fmtSmallCost(last.usd)
  const avgText = avg === undefined ? undefined : fmtSmallCost(avg)
  const maxText = max === undefined ? undefined : `${fmtSmallCost(max.usd)}${max.reWarm ? ' re-warm' : ''}`
  const trend =
    last === undefined || avg === undefined
      ? 'steady'
      : last.usd > avg * TREND_FACTOR
        ? 'rising'
        : last.usd < avg / TREND_FACTOR
          ? 'falling'
          : 'steady'
  const costsAltOf = (count: number): string => {
    const drawn = Math.min(count, record.costs.length)
    return `cost of ${drawn === 1 ? 'the last message' : `the last ${drawn} messages`}, ${trend}${last?.reWarm ? ', the newest a re-warm' : ''}`
  }
  const fullIn = fiveHour === undefined || fiveHour.etaMs === null ? '' : `, full in ${fmtEtaSpoken(fiveHour.etaMs)}`
  const fiveHourAlt = (span: string, points: readonly TrailPoint[]): string => `5h usage ${span}, ${riseOf(points)}${fullIn}`
  const compactsAt = context.compactAt === undefined ? '' : `, compacts at ${fmtTokens(context.compactAt)}`
  // A compaction drops the context, so its rise is measured since the newest drop.
  const trail = record.context
  const tokens = trail.slice(Math.max(0, trail.findLastIndex((t, i) => i > 0 && t < (trail[i - 1] ?? 0))))
  const risePerMessage = tokens.length < 2 ? 0 : ((tokens[tokens.length - 1] ?? 0) - (tokens[0] ?? 0)) / (tokens.length - 1)
  const messages = context.toCompact === undefined || risePerMessage <= 0 ? undefined : Math.max(1, Math.round(context.toCompact / risePerMessage))
  return {
    lastText,
    avgText,
    maxText,
    numbersText: [lastText && `last ${lastText}`, avgText && `avg ${avgText}`, maxText && `max ${maxText}`].filter(Boolean).join(' · '),
    numbersShort: lastText === undefined ? '' : `last ${lastText}`,
    costsAlt: costsAltOf(record.costs.length),
    costsAltOf,
    trailAlt: fiveHourAlt('over the last hour', lastHourOf(record.fiveHour, now)),
    fiveHourWindowAlt: fiveHourAlt('this window', thisWindowOf(record.fiveHour, fiveHour, now)),
    contextTrailAlt: `context over the conversation, ${contextTrendOf(record.context)}${compactsAt}`,
    toCompactionText: messages === undefined ? undefined : `~${messages} message${messages === 1 ? '' : 's'} to compaction`,
  }
}

/** What the week says: its cells for a reader, and a summary per window. */
export type WeekWords = Readonly<{
  /** 'weekly limit by day: Tuesday 6%, Wednesday 9%, Saturday about 7%' */
  daysAlt: string
  /** '5-hour limit by hour: 08:40 10%, 09:40 15%' */
  hoursAlt: string
  /** '30% used · on pace for ~50% by Mon 08:40 · busiest Thu', or once passed, 'reset' */
  summary7: string | undefined
  /** '4% used · on pace for ~10% by 16:40' */
  summary5: string | undefined
}>

/** The cells known or guessed, each named, a guess said as about. */
const cellsSpoken = <C extends DayCell | HourCell>(title: string, cells: readonly C[], name: (c: C) => string): string => {
  const said = cells.flatMap(c => (c.pct === undefined ? [] : [`${name(c)} ${c.guess ? `about ${Math.round(c.pct)}%` : c.text}`]))
  return `${title}: ${said.length === 0 ? 'not known yet' : said.join(', ')}`
}

/** A window's summary: its use and its pace, then the busiest day when given. */
const summaryOf = (l: LimitView | undefined, busiest?: string): string | undefined => {
  if (l === undefined) return undefined
  // Only a landing reads by the reset: a fill has its own time, and full before reset says it.
  const pace = l.projectedText !== undefined && l.resetClock !== undefined ? `${l.pace} by ${l.resetClock}` : l.pace
  const standing = l.reset?.kind === 'passed' ? [resetPhrase(l.reset, 'words')] : [`${l.value} used`, pace]
  return [...standing, busiest === undefined ? '' : `busiest ${busiest}`].filter(Boolean).join(' · ')
}

export const weekWords = (w: Week, seven: LimitView | undefined, five: LimitView | undefined): WeekWords => ({
  daysAlt: cellsSpoken('weekly limit by day', w.days, d => d.name),
  hoursAlt: cellsSpoken('5-hour limit by hour', w.hours, c => c.startClock),
  summary7: summaryOf(seven, w.busiest),
  summary5: summaryOf(five),
})
