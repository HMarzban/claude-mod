// The phrasebook: every phrase a layout draws, built from the facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import type { DayCell, Week } from './calendar'
import {
  clamp01,
  etaMinutes,
  fmtAgo,
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
  HOUR_MS,
  MINUTE_MS,
  minutesLeft,
  plural,
  secondsLeft,
  severityMark,
  WARN_AT,
} from './format'
import type { Zone } from './format'
import { warmAverageOf } from './insights'
import type { CostEntry, TrailPoint, Trails } from './insights'
// Types alone, erased at runtime, so reading.ts may import this file's values.
import type { CacheFacts, ContextFacts, Frame, LimitFacts, LimitKey, LimitView, SliceMark, SliceRow, SpendFacts, Tone } from './reading'
import type { BandSnapshot } from './snapshot'
import type { Workspace } from './workspace'
import { stripWords } from './workspace'

/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>
/** A reading's amber words, as plain text and as segments, the figure their
 *  one `value`; and `beside`: its reason after its figure, drawn apart,
 *  naming the reading in place of its label: `! 5h ~1h`, `! cache`. */
export type ReadingAmber = Amber & Readonly<{ say: Say; sayShort: Say; beside: string }>
/** A reading's next change, as forecast's row says it: its words up to the
 *  figure, the figure, how far off it is, and what follows, `cold at `
 *  `16:13` `in 59m` `re-warm ~$0.80`; `brief`, where set, the words a tight
 *  row keeps in place of the lead and the rest. */
export type Ahead = Readonly<{ lead: Say; figure: string; soon?: string; tail?: string; brief?: Say }>

/** A value not known yet: unknown, never 0. */
const UNKNOWN = '–'



/** What leads an amber reading: its mark, then its words. */
export const AMBER_LEAD = '! '

/** A phrase's segments as one plain string. */
const joined = (say: Say): string => say.map(([text]) => text).join('')

const amberOf = (say: Say, sayShort: Say, beside: string): ReadingAmber => ({ long: joined(say), short: joined(sayShort), say, sayShort, beside: `${AMBER_LEAD}${beside}` })

/** What an amber reading says, long and short, always led by one `AMBER_LEAD`. */
export const AMBER = {
  cache: (leftShort: string, estimate: string): ReadingAmber =>
    amberOf([[AMBER_LEAD, 'amber'], [leftShort, 'value'], [` left · re-warm ${estimate}`, 'amber']], [[AMBER_LEAD, 'amber'], [leftShort, 'value']], 'cache'),
  context: (frac: number, toCompact: number): ReadingAmber =>
    amberOf(
      [[`${AMBER_LEAD}context `, 'amber'], [fmtPct(frac), 'value'], [` · compacts in ~${fmtTokens(toCompact)}`, 'amber']],
      [[`${AMBER_LEAD}ctx `, 'amber'], [fmtPct(frac), 'value']],
      'context',
    ),
  contextNoCompaction: (frac: number): ReadingAmber =>
    amberOf([[`${AMBER_LEAD}context `, 'amber'], [fmtPct(frac), 'value']], [[`${AMBER_LEAD}ctx `, 'amber'], [fmtPct(frac), 'value']], 'context'),
  limit: (name: string, percentUsed: number): ReadingAmber => {
    const said: Say = [[`${AMBER_LEAD}${name} `, 'amber'], [`${Math.round(percentUsed)}%`, 'value']]
    return amberOf(said, said, name)
  },
  limitPace: (name: string, eta: string): ReadingAmber =>
    amberOf([[`${AMBER_LEAD}${name} full in `, 'amber'], [eta, 'value']], [[`${AMBER_LEAD}${name} `, 'amber'], [eta, 'value']], `${name} ${eta}`),
} as const

/** A pill's label after its figure, long and short: rings' `59m cache`,
 *  then `59m`; an empty short leaves the figure alone. */
export type PillLabel = Readonly<{ long: string; short: string }>

export const PILL_LABELS = {
  cache: { long: 'cache', short: '' },
  spend: { long: 'spent', short: '' },
  context: { long: 'context', short: 'ctx' },
  tokens: { long: 'tokens', short: 'tokens' },
} as const satisfies Readonly<Record<string, PillLabel>>

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  context: 'not reported',
} as const

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

export type CacheWords = Readonly<{
  /** The value after `cache `: `52m left`, `warm` while Claude works, `–`, `warming` or `cold`. */
  value: string
  /** The countdown, `52m left` or `47s left`; empty while not counting. */
  left: string
  /** The countdown alone, `52m` or `47s`; empty while not counting. */
  leftShort: string
  say: Say
  sayShort: Say
  /** The cache's mood for a reader, unchanged as it counts down: the heartbeat's alt. */
  heartAlt: string
  /** The cache as a sentence names it, bold on its figure alone: `cache
   *  52m left`, `cache cold · re-warm ~$1.66`; cold and short of room,
   *  `cache cold ~$1.66`. Warming or working, it has no figure to bold. */
  sentence: Say
  sentenceShort: Say
  /** `say` and `sayShort` as plain text: `cache 52m left`, `cache 52m`. */
  text: string
  textShort: string
  /** `text` and `textShort` with the time marked `~` while it is recalled,
   *  not measured: `cache ~40m left`, `cache ~40m`. Pulse's row says these. */
  textMarked: string
  textShortMarked: string
  /** The last minute: `! 47s left · re-warm ~$1.66`, then `! 47s`. */
  amber: ReadingAmber | undefined
  /** `cold at 14:32`, as a lens says it, while counting and the offset is known. */
  coldAtText: string | undefined
  /** Its next change: going cold, at its clock time or in its countdown;
   *  cold, what re-warming costs; else its state, `cache warm`. */
  ahead: Ahead
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
  /** `~12 msgs`, while the pace is known: departures' CONTEXT headline. */
  msgsHead: Say | undefined
  /** Room and compaction as one row, `room left · auto-compacts at 190k`,
   *  `~114k`, while the row counts messages. */
  roomLead: readonly [string, string] | undefined
  /** Tokens in context, where it compacts, the room before then, and the window:
   *  `76k`, `190k`, `~114k`, `200k`. While not reported, `–` and no room. */
  inContextText: string
  compactsAtText: string | undefined
  roomText: string | undefined
  /** Its room and where it compacts as one row's label, long then short:
   *  `room left · auto-compacts at 190k`, `room left · compacts at 190k`. */
  roomCompacts: readonly [long: string, short: string] | undefined
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

type SpendSplit = Readonly<{ label: (typeof SPLIT_LABELS)[number]; tokens: number; text: string; frac: number }>

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
  /** A card's reset and pace, `resets 3h 00m · on pace for ~10%`; undefined
   *  without a reset to come. */
  cardResetLess: () => string | undefined
  /** When it resets, after `resets`: `16:40` or `Sat 13:30` once the offset
   *  is known, else `resetIn`; undefined without a reset to come. */
  resetWhen: string | undefined
  /** `5h 4%`, or once its window has passed, `5h reset`. */
  text: string
  say: Say
  /** `on pace for ~10%`, `full in ~40m`, `full before reset`, or empty. */
  pace: string
  /** Its reset as the boards say it after `↻`: the 5h counting down, `4h
   *  55m`; the 7d at its clock time once the offset is known, `Sat 13:30`.
   *  Undefined once passed. */
  resetSaid: string | undefined
  /** `16:40`, or `Mon 08:40` past today, when the offset is known. */
  resetClock: string | undefined
  /** After `↻`, a clock time: `↻ 16:40`, else `↻ in 3h 00m`; in the ascii
   *  tier, which drops the glyph, `resets 16:40`. Undefined once passed. */
  resetAtGlyph: string | undefined
  /** The limit as a sentence says it, bold on its figure, with its pace and
   *  its reset where asked and known: `7d 30% · on pace for ~50% · ↻ Sat 19:00`. */
  sentence: (withPace: boolean, withReset: boolean) => Say
  /** That sentence's pace and reset alone, ` · on pace for ~50% · ↻ Sat 19:00`. */
  tail: (withPace: boolean, withReset: boolean) => Say
  /** When it fills before its reset, measured or at the average's pace:
   *  `~Mon` past today, `~14:20` today, or with the offset unknown `in ~13h`. */
  fillAt: string | undefined
  /** `full ~Mon`, as a lens says it; set where `fillAt` is. */
  fillText: string | undefined
  /** `7d full ~Mon`: the same, named, beside another window's figure. */
  fillNamed: string | undefined
  /** `7d ~Mon`: named, short of room for its words. */
  fillNamedShort: string | undefined
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
  alt: string
}>

/** Between the readings of a sentence: `cache 52m left │ spent $3.19`. */
export const BETWEEN_READINGS = ' │ '

/** The cache in words, from its facts: it counts down only while `coldInMs` is set. */
export const cacheWords = (f: CacheFacts, c: BandSnapshot['cache'], frame: Frame): CacheWords => {
  const counting = f.coldInMs !== undefined
  const working = f.mood === 'warm' && !counting
  const left = counting ? fmtLeft(f.coldInMs) : ''
  const leftShort = counting ? fmtLeftShort(f.coldInMs) : ''
  // Recalled from the session's last reply, its time is an estimate until a reply measures it.
  const recalledTime = counting && c.recalled && !f.measured
  const zone = frame.zone
  // Spoken, a price is never marked ~: the alt says "about".
  const price = c.reWarmUsd !== null ? fmtSmallCost(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  // The card counts down as chips' row always has: `1h 05m`, `0:47`.
  const countdown: Say = [[fmtCountdown(c.msLeft), 'value'], [' left', 'label']]
  const value = counting ? left : f.mood === 'unmeasured' ? UNKNOWN : f.mood
  const cardHead: Say = f.mood === 'unmeasured' ? [['not measured yet', 'value']] : counting ? countdown : [[value, 'value']]
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
  const coldAtClock = counting && zone !== undefined ? fmtClock(frame.now + f.coldInMs, zone) : undefined
  const reWarm = `re-warm ${f.estimate}`
  const ahead: Ahead = counting
    ? coldAtClock !== undefined
      ? { lead: [['cold at ', 'value']], figure: coldAtClock, soon: `in ${leftShort}`, tail: reWarm }
      : { lead: [['cold in ', 'value']], figure: leftShort, tail: reWarm }
    : f.mood === 'cold'
      ? { lead: [['cold · re-warm ', 'value']], figure: f.estimate, brief: [['cold ', 'value']] }
      : { lead: [['cache ', 'label']], figure: value }
  return {
    value,
    left,
    leftShort,
    say,
    sayShort,
    heartAlt:
      f.mood === 'cold' ? 'cache cold' : f.mood === 'expiring' ? 'cache in its last minute' : f.mood === 'unmeasured' ? 'cache not measured yet' : f.mood === 'warming' ? 'cache warming' : 'cache warm',
    sentence,
    sentenceShort: f.mood === 'cold' ? [['cache cold ', 'label'], [f.estimate, 'value']] : sentence,
    text: joined(say),
    textShort: joined(sayShort),
    textMarked: recalledTime ? `cache ~${left}` : joined(say),
    textShortMarked: recalledTime ? `cache ~${leftShort}` : joined(sayShort),
    amber: f.mood === 'expiring' ? AMBER.cache(leftShort, f.estimate) : undefined,
    coldAtText: coldAtClock === undefined ? undefined : `cold at ${coldAtClock}`,
    ahead,
    savedText: f.measured && c.savedUsd !== null ? fmtEstimate(c.savedUsd) : undefined,
    hitText: f.hitFrac === undefined ? undefined : fmtPct(f.hitFrac),
    // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
    lastsText: `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`,
    rebuildsText: c.misses > 0 ? String(c.misses) : undefined,
    idleText: c.recalled && c.idleMs !== null ? fmtAgo(c.idleMs) : undefined,
    cardHead,
    gaugeSay: counting ? [[leftShort, 'value'], [' left', 'label']] : [[value, 'value']],
    gaugeShort: [[counting ? leftShort : value, 'value']],
    gaugeMore: counting || f.mood === 'cold' ? reWarm : undefined,
    cardNote:
      f.mood === 'unmeasured' ? "Countdown starts with Claude's next reply." : f.mood === 'warming' ? 'First message builds the cache.' : undefined,
    alt:
      f.mood === 'unmeasured'
        ? 'cache not measured yet'
        : f.mood === 'warming'
          ? 'cache warming'
          : f.mood === 'cold'
            ? altOf('cache', 'cold', `re-warm about ${price}`)
            : counting
              ? altOf('cache', fmtLeftSpoken(f.coldInMs), f.mood === 'expiring' ? 'cooling' : 'warm', f.mood === 'expiring' ? `re-warm about ${price}` : undefined)
              : altOf('cache', 'warm', 'Claude is working'),
  }
}

/** Every word chips' row says about the cache, for one mood: the pill, its
 *  hover and the battery's name. One table, so a mood's wording changes in
 *  one place; the cards read theirs from `cacheWords`. */
export type CacheCopy = Readonly<{
  pill: (short: boolean) => string
  /** The countdown a calm pill ends on, `52m`: its figure, for a layout that bolds it. */
  figure: string | undefined
  hover: string
  alt: string
}>

export const cacheCopy = (f: CacheFacts, c: BandSnapshot['cache'], frame: Frame): CacheCopy => {
  // What a warm read costs against input on the model in force.
  const readPct = `${+(c.readShare * 100).toFixed(1)}%`
  const left = fmtCountdown(c.msLeft)
  const battery = f.charge <= 0 ? 'cache battery empty' : `cache battery ${Math.round(clamp01(f.charge) * 100)}% left`
  const warmHover = `${left} left; warm cache bills input at ${readPct}, expires ${c.ttl} after a reply`
  switch (f.mood) {
    case 'unmeasured':
      return {
        pill: () => 'cache –',
        figure: undefined,
        hover: "Not measured since the band loaded; the countdown starts with Claude's next reply",
        alt: 'cache not measured yet',
      }
    case 'warming':
      return {
        pill: () => 'cache warming',
        figure: undefined,
        hover: `Your first message builds the cache; after that it bills input at ${readPct}`,
        alt: 'cache warming',
      }
    case 'expiring':
      return {
        pill: short => (short ? `${left} ${f.estimate}` : `${left} left · re-warm ${f.estimate}`),
        figure: undefined,
        hover: warmHover,
        alt: battery,
      }
    case 'cold':
      return {
        // Cold is a price, not an error: neutral, no hue, no alarm.
        pill: short => (short ? `cold ${f.estimate}` : `cache cold · next message ${f.estimate}`),
        figure: undefined,
        hover: `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${f.estimate})`}`,
        alt: battery,
      }
    case 'warm':
      return {
        pill: () => (frame.isWorking ? 'cache warm' : `cache ${left}`),
        figure: frame.isWorking ? undefined : left,
        hover: warmHover,
        alt: battery,
      }
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
  const msgs = f.msgsToCompact === undefined ? undefined : `~${f.msgsToCompact}`
  const msgsUnit = f.msgsToCompact === 1 ? ' msg' : ' msgs'
  const compactsAtText = f.compactAt === undefined ? undefined : fmtTokens(f.compactAt)
  const roomCompacts: ContextWords['roomCompacts'] =
    roomText === undefined || compactsAtText === undefined ? undefined : [`room left · auto-compacts at ${compactsAtText}`, `room left · compacts at ${compactsAtText}`]
  return {
    valueText: value,
    text: joined(say),
    textShort: joined(sayShort),
    say,
    sayShort,
    amber,
    inContextText: f.known ? fmtTokens(f.used) : UNKNOWN,
    compactsAtText,
    roomText,
    roomCompacts,
    windowText: fmtTokens(f.window),
    ahead: roomText === undefined ? undefined : { lead: [['compacts in ', 'value']], figure: roomText },
    cardHead,
    sentence: [['context ', 'label'], ...cardHead],
    gaugeSay: f.known ? [[f.pct, 'value'], [' full', 'label']] : [[EMPTY.context, 'label']],
    gaugeShort: f.known ? [[f.pct, 'value']] : [[UNKNOWN, 'label']],
    gaugeMore: roomText === undefined ? undefined : f.nearCompact ? `compacts in ${roomText}` : `${roomText} left`,
    msgsHead: msgs === undefined ? undefined : [[msgs, 'value'], [msgsUnit, 'label']],
    roomLead: amber !== undefined || msgs === undefined || roomText === undefined || roomCompacts === undefined ? undefined : [roomCompacts[0], roomText],
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

/** The tokens by kind as chips' hover says them: `input 41k · output 12k · cache reads 155k`. */
export const tokenBreakdownOf = (split: readonly SpendSplit[]): string => split.map(s => `${s.label} ${s.text}`).join(' · ')

/** A limit window in words; once it has passed, only that it reset. */
export const limitWords = (f: LimitFacts, frame: Frame): LimitWords => {
  const zone = frame.zone
  // The time to the reset, while one is to come.
  const span = f.reset?.kind === 'in' ? f.reset.text : undefined
  const live = !f.passed
  const projected = live ? f.projectedPct : undefined
  const fills = projected !== undefined && fillsBeforeReset(projected)
  const lands = projected !== undefined && !fills
  const landing = lands ? `about ${Math.round(projected)} percent at its reset` : undefined
  const etaMs = live ? f.etaMs : null
  const fullIn = etaMs !== null ? fmtEta(etaMs) : undefined
  const valueText = live ? f.value : 'reset'
  const say: Say = [[`${f.name} `, 'label'], [valueText, 'value']]
  const resetAt = f.resetInMs === undefined ? undefined : frame.now + f.resetInMs
  const resetClock = resetAt !== undefined && zone !== undefined ? fmtDayClock(resetAt, zone, frame.now) : undefined
  // The ascii tier drops `↻`, so a phrase whose object is the glyph says its word.
  const ascii = frame.glyphs === 'ascii'
  const resetMark = ascii ? 'resets' : '↻'
  const pace = live ? paceText(f) : ''
  const resetIn = span === undefined ? undefined : `in ${span}`
  const resetGlyph = resetIn === undefined ? undefined : `↻ ${resetIn}`
  const resetWhen = resetClock ?? resetIn
  const fillInMs = live ? f.fillInMs : undefined
  // A day's window says the fill's day; a shorter one its clock too, as its reset does.
  const fillDay = f.key === '7d' ? fmtDay : fmtDayClock
  const fillAt = fillInMs === undefined ? undefined : zone !== undefined ? `~${fillDay(frame.now + fillInMs, zone, frame.now)}` : `in ${fmtEta(fillInMs)}`
  const resetAtGlyph = resetClock === undefined ? resetGlyph : `${resetMark} ${resetClock}`
  const cardResetLess = (): string | undefined => {
    if (span === undefined) return undefined
    return [`resets ${span}`, pace].filter(t => t !== '').join(' · ')
  }
  const tail = (withPace: boolean, withReset: boolean): Say =>
    [withPace ? pace : '', withReset ? (resetAtGlyph ?? '') : ''].filter(t => t !== '').map((t): Say[number] => [` · ${t}`, 'label'])
  const standing: Say = [[`${f.value} · `, 'label']]
  // Its next change says its reset after the mark, as chips' pill does:
  // `↻ Sat 13:30`, or with the offset unknown, `↻ 5d 22h`.
  const ahead: Ahead | undefined =
    span === undefined || Math.round(f.percentUsed) === 0
      ? undefined
      : fillAt !== undefined && fillInMs !== undefined
        ? { lead: [...standing, ['full ', 'value']], figure: fillAt, soon: zone === undefined ? undefined : `in ${fmtEta(fillInMs)}`, tail: `${resetMark} ${resetClock ?? span}` }
        : {
            lead: [...standing, [`${resetMark} `, 'value']],
            figure: resetClock ?? span,
            soon: resetClock === undefined ? undefined : resetIn,
            tail: pace === '' ? undefined : pace,
          }
  return {
    valueText,
    valueMarked: `${f.value}${severityMark(f.frac)}`,
    cardResetLess,
    resetWhen,
    text: joined(say),
    say,
    pace,
    resetSaid: f.key === '7d' && span !== undefined ? (resetClock ?? span) : span,
    resetClock,
    resetAtGlyph,
    sentence: (withPace, withReset) => [...say, ...tail(withPace, withReset)],
    tail,
    fillAt,
    fillText: fillAt === undefined ? undefined : `full ${fillAt}`,
    fillNamed: fillAt === undefined ? undefined : `${f.name} full ${fillAt}`,
    fillNamedShort: fillAt === undefined ? undefined : `${f.name} ${fillAt}`,
    ahead,
    fullIn,
    amber: f.tone !== 'amber' ? undefined : fullIn !== undefined ? AMBER.limitPace(f.name, fullIn) : AMBER.limit(f.name, f.percentUsed),
    amberHead: f.tone !== 'amber' ? undefined : [[AMBER_LEAD, 'amber'], [`${f.name} `, 'label'], [valueText, 'value']],
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

/** What the history says: the costs' numbers, and each trail's trend for a reader. */
export type HistoryWords = Readonly<{
  /** '$0.21' */
  lastText: string | undefined
  /** 'last $0.21' */
  numbersShort: string
  /** 'avg ~$0.02': the warm average, said as the estimate it is; undefined before a warm cost. */
  avgText: string | undefined
  /** The newest `count` costs for a reader, as a chart draws them: 'cost of
   *  the last 14 messages, steady, average $0.18, max $0.84 re-warm', then
   *  ', the newest a re-warm' when it was: the average leaves re-warms out. */
  costsAltOf: (count: number) => string
  /** '5h usage over the last hour, steady' | '…, rising, full in about 40 minutes' */
  trailAlt: string
  /** 'context over the conversation, rising, compacts at 190k'; with compaction off, no compaction point. */
  contextTrailAlt: string
  /** '~12 messages to compaction', at the context's average rise a message
   *  since its last compaction, then shorter for a head out of room: '~12
   *  msgs to compact', '~12'; undefined until it has risen, or with
   *  compaction off. */
  toCompaction: readonly string[] | undefined
}>

/** A message above this many times the warm average is rising; below the average divided by it, falling. */
const TREND_FACTOR = 1.5
/** Points the 5h reading must rise, first point to last, to be rising. */
const TRAIL_RISE = 2

/** The points of a trail from the last hour before `now`. */
export const lastHourOf = (trail: readonly TrailPoint[], now: number): TrailPoint[] => trail.filter(p => p.at >= now - HOUR_MS)

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
  const avg = warmAverageOf(record.costs)
  const lastText = last === undefined ? undefined : fmtSmallCost(last.usd)
  const trend =
    last === undefined || avg === undefined
      ? 'steady'
      : last.usd > avg * TREND_FACTOR
        ? 'rising'
        : last.usd < avg / TREND_FACTOR
          ? 'falling'
          : 'steady'
  const costsAltOf = (count: number): string => {
    const drawn = record.costs.slice(-count)
    const drawnAvg = warmAverageOf(drawn)
    const max = drawn.reduce<CostEntry | undefined>((top, e) => (top === undefined || e.usd > top.usd ? e : top), undefined)
    return [
      `cost of ${drawn.length === 1 ? 'the last message' : `the last ${drawn.length} messages`}`,
      trend,
      drawnAvg === undefined ? '' : `average ${fmtSmallCost(drawnAvg)}`,
      max === undefined ? '' : `max ${fmtSmallCost(max.usd)}${max.reWarm ? ' re-warm' : ''}`,
      last?.reWarm ? 'the newest a re-warm' : '',
    ]
      .filter(s => s !== '')
      .join(', ')
  }
  const fullIn = fiveHour === undefined || fiveHour.etaMs === null ? '' : `, full in ${fmtEtaSpoken(fiveHour.etaMs)}`
  const compactsAt = context.compactAt === undefined ? '' : `, compacts at ${fmtTokens(context.compactAt)}`
  const messages = context.msgsToCompact
  return {
    lastText,
    numbersShort: lastText === undefined ? '' : `last ${lastText}`,
    avgText: avg === undefined ? undefined : `avg ${fmtEstimate(avg)}`,
    costsAltOf,
    trailAlt: `5h usage over the last hour, ${riseOf(lastHourOf(record.fiveHour, now))}${fullIn}`,
    contextTrailAlt: `context over the conversation, ${contextTrendOf(record.context)}${compactsAt}`,
    toCompaction:
      messages === undefined
        ? undefined
        : [`~${plural(messages, 'message')} to compaction`, `~${plural(messages, 'msg')} to compact`, `~${messages}`],
  }
}

/** What week's open view names: LIMITS' first row, and the lens in its head. */
export const WEEK = { byDay: 'by day', byHour: '5h by the hour' } as const

/** What the week says of its slices as drawn: for a reader, the day the
 *  guess fills the 7d, and the week from today in words. */
export type WeekWords = Readonly<{
  /** 'weekly limit by day: Sunday 66%, Monday about 34% and fills it, Tuesday to Saturday none left' */
  daysAlt: string
  /** The measured days alone: 'weekly limit by day, measured: Tuesday 6%, Wednesday 9%' */
  measuredAlt: string
  /** '5-hour limit by hour: 08:40 10%, 09:40 15%' */
  hoursAlt: string
  /** The 5h window whole, start to reset: '5h window from start to reset, 26%
   *  used, on pace for about 33%'; no pace where none is known, '' with no 5h window. */
  windowAlt: string
  /** 'full ~Mon': the day the guess fills the 7d; undefined unless it does. */
  fullDay: string | undefined
  /** The week from today, each form a run of days shorter, longest first:
   *  'Sun +66% · Mon ~+34% fills it · Tue–Sat none left', then without its
   *  last run, down to today's rise alone; where the guess stops at the cap,
   *  every form ends with the days none is left, 'Sun +66% · Tue–Sat none
   *  left'. None when nothing is known. */
  byDay: readonly string[]
}>

/** A slice's rise: `+66%` measured, `~+34%` a guess. */
const riseText = (m: SliceMark): string => `${m.kind === 'measured' ? '' : '~'}+${Math.round(m.pct)}%`

/** The slices known or guessed, each named, a guess said as about, the one
 *  that fills the limit so, and the run after it as none left. */
const slicesSpoken = (title: string, names: readonly string[], marks: readonly SliceMark[]): string => {
  const said = marks.flatMap((m, i) => {
    const name = names[i] ?? ''
    const pct = `${Math.round(m.pct)}%`
    return m.kind === 'measured' ? [`${name} ${pct}`] : m.kind === 'guess' ? [`${name} about ${pct}`] : m.kind === 'fills' ? [`${name} about ${pct} and fills it`] : []
  })
  const spent = names.filter((_, i) => marks[i]?.kind === 'spent')
  const none = spent.length === 0 ? [] : [`${spent.length === 1 ? spent[0] : `${spent[0]} to ${spent.at(-1)}`} none left`]
  const all = [...said, ...none]
  return `${title}: ${all.length === 0 ? 'not known yet' : all.join(', ')}`
}

/** The week from today: today's rise, then each run of days alike; a day not
 *  known is left out. Each form drops the last run of the one before, but
 *  the days none is left, which end every form. */
const byDayOf = (days: readonly DayCell[], marks: readonly SliceMark[]): string[] => {
  const today = days.findIndex(d => d.today)
  if (today < 0) return []
  const said = (m: SliceMark | undefined): string =>
    m === undefined || m.kind === 'unknown' ? '' : m.kind === 'spent' ? 'none left' : m.kind === 'fills' ? `${riseText(m)} fills it` : riseText(m)
  const runs: Array<{ from: string; to: string; text: string }> = []
  days.slice(today).forEach((d, i) => {
    const day = d.name.slice(0, 3)
    const text = said(marks[today + i])
    const last = runs.at(-1)
    if (i > 0 && last?.text === text) last.to = day
    else runs.push({ from: day, to: day, text })
  })
  const known = runs.filter(r => r.text !== '')
  const spoken = known.map(run => `${run.from === run.to ? run.from : `${run.from}–${run.to}`} ${run.text}`)
  const spent = known.at(-1)?.text === 'none left' && spoken.length > 1
  const kept = spent ? spoken.slice(0, -1) : spoken
  const tail = spent ? spoken.slice(-1) : []
  return kept.map((_, i) => [...kept.slice(0, kept.length - i), ...tail].join(' · '))
}

/** The week in words; `fill` the 7d's fill, whose own day the week names, as the forecast does. */
export const weekWords = (
  w: Week,
  rows: Readonly<{ days: SliceRow; hours: SliceRow }>,
  fill: Readonly<{ at: number; zone: Zone; now: number }> | undefined,
  five?: Pick<LimitWords, 'valueText'> & Readonly<{ projectedPct: number | undefined; passed: boolean }>,
): WeekWords => {
  const fills = fill !== undefined && rows.days.marks.some(m => m.kind === 'fills')
  return {
    daysAlt: slicesSpoken('weekly limit by day', w.days.map(d => d.name), rows.days.marks),
    measuredAlt: slicesSpoken(
      'weekly limit by day, measured',
      w.days.flatMap((d, i) => (rows.days.marks[i]?.kind === 'measured' ? [d.name] : [])),
      rows.days.marks.filter(m => m.kind === 'measured'),
    ),
    hoursAlt: slicesSpoken('5-hour limit by hour', w.hours.map(c => c.startClock), rows.hours.marks),
    windowAlt:
      five === undefined || five.passed
        ? ''
        : `5h window from start to reset, ${five.valueText} used${five.projectedPct === undefined ? '' : `, on pace for about ${Math.round(five.projectedPct)}%`}`,
    fullDay: fills ? `full ~${fmtDay(fill.at, fill.zone, fill.now)}` : undefined,
    byDay: byDayOf(w.days, rows.days.marks),
  }
}

// ---- the departures board ----------------------------------------------------

export type BoardKey = 'cache' | 'spend' | 'context' | '5h' | '7d' | 'other'
export type BoardRow = Readonly<{
  key: BoardKey
  item: string        // CACHE | SPEND | CONTEXT | 5H | 7D | an other limit's name, upper-case
  status: string      // DEPARTS | LAST CALL | DEPARTED | BOARDING | CHECK-IN | $0.24 | 8% USED | 26% | ! NEAR LIMIT
  time: string        // 17:24 | SAT 13:30 | IN 38 MIN | IN 1H 04M | PASSED | -
  remarks: string
  cell: string        // collapsed, long: DEPARTS 17:24 | 26% ↻ 17:50 | 85% ↻ SAT 13:30 ! NEAR LIMIT
  cellShort: string   // collapsed, short: 17:24 | ! 47S | 26%
  /** Limits only: the cell without its reset. */
  cellNoReset?: string
  tone: Tone
  alt: string         // in words, never capitals or ↻: the reading's existing alt
}>
export type Board = Readonly<{
  header: readonly string[] | undefined
  /** The header's facts in words, for its flaps' alt. */
  headerAlt: string | undefined
  rows: readonly BoardRow[]
}>
export type BoardFacts = Readonly<{
  frame: Frame
  cache: CacheFacts & CacheWords
  spend: SpendFacts & SpendWords
  context: ContextFacts & ContextWords
  limits: readonly (LimitFacts & LimitWords)[]
  workspace: Workspace | undefined
  coldAt: number | null
}>

const NONE = '-'
/** A measured span on the board: `47S`, `38 MIN`, `1H 04M`. Never `38M`. */
const boardSpan = (ms: number): string =>
  ms < MINUTE_MS ? `${secondsLeft(ms)}S` : ms < HOUR_MS ? `${minutesLeft(ms)} MIN` : fmtCountdown(ms)
/** A projection on the board: `~40 MIN`, `~1H 15M`. */
const boardEta = (ms: number): string => (etaMinutes(ms) < 60 ? `~${etaMinutes(ms)} MIN` : fmtEta(ms))

const cacheBoard = (r: BoardFacts): BoardRow => {
  const c = r.cache
  const zone = r.frame.zone
  const at = (cell: Omit<BoardRow, 'key' | 'item' | 'alt'>): BoardRow => ({ key: 'cache', item: 'CACHE', alt: c.alt, ...cell })
  const reWarm = `RE-WARM ${c.estimate}`
  if (c.mood === 'unmeasured' || c.mood === 'warming') return at({ status: 'CHECK-IN', time: NONE, remarks: '', cell: 'CHECK-IN', cellShort: 'CHECK-IN', tone: 'calm' })
  if (r.frame.isWorking) return at({ status: 'BOARDING', time: NONE, remarks: '', cell: 'BOARDING', cellShort: 'BOARDING', tone: 'calm' })
  const clock = r.coldAt === null || zone === undefined ? undefined : `${c.measured ? '' : '~'}${fmtClock(r.coldAt, zone)}`
  if (c.mood === 'cold')
    return at({ status: 'DEPARTED', time: clock ?? NONE, remarks: reWarm, cell: clock === undefined ? `DEPARTED · ${reWarm}` : `DEPARTED ${clock} · ${reWarm}`, cellShort: reWarm, tone: 'calm' })
  const left = c.coldInMs ?? 0
  if (c.tone === 'amber') {
    const secs = boardSpan(left)
    return at({ status: 'LAST CALL', time: secs, remarks: reWarm, cell: `LAST CALL ${secs}`, cellShort: `! ${secs}`, tone: 'amber' })
  }
  const status = c.lastCall ? 'LAST CALL' : 'DEPARTS'
  const countdown = `IN ${boardSpan(left)}`
  const time = clock ?? countdown
  return at({ status, time, remarks: `${clock === undefined ? '' : `${countdown} · `}${reWarm} IF MISSED`, cell: `${status} ${time}`, cellShort: time, tone: 'calm' })
}

const spendBoard = (r: BoardFacts): BoardRow => ({
  key: 'spend', item: 'SPEND', status: r.spend.totalText, time: NONE,
  remarks: r.spend.lastText === undefined ? '' : `LAST ${r.spend.lastText}`,
  cell: r.spend.totalText, cellShort: r.spend.totalText, tone: 'calm', alt: `spent ${r.spend.totalText} this session`,
})

const contextBoard = (r: BoardFacts): BoardRow => {
  const x = r.context
  const base = { key: 'context', item: 'CONTEXT', time: NONE, alt: x.alt } as const
  if (!x.known) return { ...base, status: 'NOT REPORTED', remarks: '', cell: 'NOT REPORTED', cellShort: 'NOT REPORTED', tone: 'calm' }
  const remarks = [x.roomText === undefined ? '' : `${x.roomText} LEFT`, x.compactsAtText === undefined ? '' : `COMPACTS AT ${x.compactsAtText}`].filter(Boolean).join(' · ')
  if (x.tone === 'calm') return { ...base, status: `${x.valueText} USED`, remarks, cell: x.valueText, cellShort: x.valueText, tone: 'calm' }
  // Near compaction the board names the event; with compaction off, the fill.
  const short = `! CONTEXT ${x.valueText}`
  const long = x.toCompact === undefined ? short : `! COMPACTS IN ~${fmtTokens(x.toCompact)}`
  return { ...base, status: long, remarks, cell: long, cellShort: short, tone: 'amber' }
}

const limitBoard = (r: BoardFacts, l: LimitFacts & LimitWords): BoardRow => {
  const { zone, now } = r.frame
  const time = l.passed ? 'PASSED' : l.resetInMs === undefined ? NONE : zone === undefined ? `IN ${boardSpan(l.resetInMs)}` : fmtDayClock(now + l.resetInMs, zone, now)
  // Amber from the pace, not from crossing the warning line: say when it fills.
  const byPace = l.key === '5h' && l.tone === 'amber' && l.etaMs !== null && l.percentUsed < WARN_AT * 100
  const amber = l.tone !== 'amber' ? undefined : byPace && l.etaMs !== null ? (zone === undefined ? `! FULL IN ${boardEta(l.etaMs)}` : `! FULL ~${fmtClock(now + l.etaMs, zone)}`) : '! NEAR LIMIT'
  const calm = l.fillText ?? l.pace
  const tail = (amber ?? calm) === '' ? '' : ` ${amber ?? calm}`
  return {
    // An other limit names itself a limit: `spend` alone would read as the session's SPEND.
    key: l.key, item: l.key !== 'other' ? l.key : /\blimit$/.test(l.name) ? l.name : `${l.name} limit`, status: amber ?? l.valueText, time,
    remarks: amber === undefined ? calm : [l.valueText, calm].filter(Boolean).join(' · '),
    cell: `${l.valueText}${time === NONE ? '' : ` ↻ ${time}`}${tail}`, cellShort: amber === undefined ? l.valueText : `! ${l.valueText}`, cellNoReset: `${l.valueText}${tail}`,
    tone: l.tone, alt: l.alt,
  }
}

const upRow = (row: BoardRow): BoardRow => ({
  ...row, item: row.item.toUpperCase(), status: row.status.toUpperCase(), time: row.time.toUpperCase(),
  remarks: row.remarks.toUpperCase(), cell: row.cell.toUpperCase(), cellShort: row.cellShort.toUpperCase(),
  ...(row.cellNoReset === undefined ? {} : { cellNoReset: row.cellNoReset.toUpperCase() }),
})

/** The departures board: a row per reading in the one order, in the
 *  board's capitals; alts stay in words. */
export const boardWords = (r: BoardFacts): Board => {
  const of = (key: LimitKey) => r.limits.filter(l => l.key === key).map(l => limitBoard(r, l))
  return {
    header: r.workspace === undefined ? undefined : stripWords(r.workspace).map(w => w.toUpperCase()),
    headerAlt: r.workspace === undefined ? undefined : `workspace ${stripWords(r.workspace).join(', ')}`,
    rows: [cacheBoard(r), spendBoard(r), contextBoard(r), ...of('5h'), ...of('7d'), ...of('other')].map(upRow),
  }
}

/** REMARKS cut to `tiles` characters, `…` last where cut. */
export const remarksFit = (remarks: string, tiles: number): string =>
  remarks.length <= tiles ? remarks : tiles <= 1 ? '' : `${remarks.slice(0, tiles - 1)}…`

/** `text` padded with spaces to `n` characters; longer text is left whole. */
export const padTo = (text: string, n: number): string => (text.length >= n ? text : text + ' '.repeat(n - text.length))

/** What a board line says in its four columns. */
type BoardText = Pick<BoardRow, 'item' | 'status' | 'time' | 'remarks'>

/** The board's column headings, a line of their own. */
export const BOARD_HEADINGS: BoardText = { item: 'ITEM', status: 'STATUS', time: 'TIME', remarks: 'REMARKS' }
/** The headings' flaps' alt. */
export const BOARD_HEADINGS_ALT = 'the board\'s columns: item, status, time and remarks'

/** The longest of the rows' texts, plus one for the air after it. */
const widestOf = (rows: readonly BoardText[], of: (r: BoardText) => string): number => Math.max(0, ...rows.map(r => of(r).length)) + 1

/** The board's columns in characters: ITEM, STATUS and TIME each as wide as
 *  its longest text among `rows`, plus one; REMARKS what is left of `room`. */
export const boardColumns = (rows: readonly BoardText[], room: number): Readonly<{ item: number; status: number; time: number; remarks: number }> => {
  const item = widestOf(rows, r => r.item)
  const status = widestOf(rows, r => r.status)
  const time = widestOf(rows, r => r.time)
  return { item, status, time, remarks: Math.max(0, room - item - status - time) }
}

/** A board line's runs: TIME none once its words lead REMARKS. */
export type BoardLine = Readonly<{ item: string; status: string; time: string | undefined; remarks: string }>

/** REMARKS narrower than this, and TIME's words lead them instead. */
const REMARKS_LEAST = 8

/** `text` cut to `n` characters, `…` last, then padded to them. */
const fitTo = (text: string, n: number): string => padTo(remarksFit(text, n), n)

/** The board's lines in `room` tiles, a blank tile between runs taken from
 *  it: ITEM, STATUS and TIME padded to their columns, REMARKS cut to theirs.
 *  Where REMARKS would have fewer than 8, TIME's words lead them and the
 *  TIME column goes (spec §5.3); past that, STATUS is cut, then ITEM, so no
 *  line is longer than the room. */
export const boardLines = (rows: readonly BoardText[], room: number): readonly BoardLine[] => {
  const whole = boardColumns(rows, room - 3)
  if (whole.remarks >= REMARKS_LEAST)
    return rows.map(r => ({ item: padTo(r.item, whole.item), status: padTo(r.status, whole.status), time: padTo(r.time, whole.time), remarks: remarksFit(r.remarks, whole.remarks) }))
  const lead = (r: BoardText): BoardText =>
    r === BOARD_HEADINGS || r.time === NONE ? r : { ...r, remarks: r.remarks === '' ? r.time : `${r.time} · ${r.remarks}` }
  const lines = rows.map(lead)
  const inner = Math.max(0, room - 2)
  const item = Math.min(widestOf(lines, r => r.item), inner)
  const status = Math.min(widestOf(lines, r => r.status), inner - item)
  const remarks = inner - item - status
  return lines.map(r => ({ item: fitTo(r.item, item), status: fitTo(r.status, status), time: undefined, remarks: remarksFit(r.remarks, remarks) }))
}
