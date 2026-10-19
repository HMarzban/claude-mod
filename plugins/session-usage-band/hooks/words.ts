// The phrasebook: every phrase a layout draws, built from the facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import type { Week } from './calendar'
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
  secondsLeft,
  severityMark,
  WARN_AT,
} from './format'
import { warmAverageOf } from './insights'
import type { CostEntry, Trails } from './insights'
// Types alone, erased at runtime, so reading.ts may import this file's values.
import type { CacheFacts, ContextFacts, Frame, LimitFacts, LimitKey, SliceMark, SpendFacts, Tone } from './reading'
import type { BandSnapshot } from './snapshot'

/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>
/** A value not known yet: unknown, never 0. */
const UNKNOWN = '–'

/** What leads an amber reading: its mark, then its words. */
const AMBER_LEAD = '! '

/** A phrase's segments as one plain string. */
const joined = (say: Say): string => say.map(([text]) => text).join('')
/** The phrases said, the missing and the empty left out. */
const said = (parts: ReadonlyArray<string | undefined>): string[] => parts.filter((p): p is string => p !== undefined && p !== '')

const amberOf = (say: Say, sayShort: Say): Amber => ({ long: joined(say), short: joined(sayShort) })

/** What an amber reading says, long and short, always led by one `AMBER_LEAD`. */
export const AMBER = {
  cache: (leftShort: string, estimate: string): Amber =>
    amberOf([[AMBER_LEAD, 'amber'], [leftShort, 'value'], [` left · re-warm ${estimate}`, 'amber']], [[AMBER_LEAD, 'amber'], [leftShort, 'value']]),
  context: (frac: number, toCompact: number): Amber =>
    amberOf(
      [[`${AMBER_LEAD}context `, 'amber'], [fmtPct(frac), 'value'], [` · compacts in ~${fmtTokens(toCompact)}`, 'amber']],
      [[`${AMBER_LEAD}ctx `, 'amber'], [fmtPct(frac), 'value']],
    ),
  contextNoCompaction: (frac: number): Amber =>
    amberOf([[`${AMBER_LEAD}context `, 'amber'], [fmtPct(frac), 'value']], [[`${AMBER_LEAD}ctx `, 'amber'], [fmtPct(frac), 'value']]),
  limit: (name: string, percentUsed: number): Amber => {
    const said: Say = [[`${AMBER_LEAD}${name} `, 'amber'], [`${Math.round(percentUsed)}%`, 'value']]
    return amberOf(said, said)
  },
  limitPace: (name: string, eta: string): Amber =>
    amberOf([[`${AMBER_LEAD}${name} full in `, 'amber'], [eta, 'value']], [[`${AMBER_LEAD}${name} `, 'amber'], [eta, 'value']]),
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  /** Pulse's row, beside its flat trace: the costs' empty state, short. */
  costsShort: 'no costs yet',
  /** The flat trace's alt. */
  costsAlt: 'cost per message: none yet',
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

/** The open cards' titles, in the order they are drawn. */
export const CARD_TITLES = { cache: 'Cache', spend: 'Spend', context: 'Context', limits: 'Limits' } as const

/** A card's headline, led by the amber mark while its reading is amber, so
 *  colour is never the only signal. */
export const markedHead = (say: Say, tone: Tone): Say => (tone === 'amber' ? [[AMBER_LEAD, 'amber'], ...say] : say)

/** A card's fact: its label at one end, its value at the other. */
export type Fact = Readonly<{ label: string; value: string }>

// ---- the words of each section, from its facts ------------------------------

export type CacheWords = Readonly<{
  /** The value after `cache `: `52m left`, `warm` while Claude works, `–`, `warming` or `cold`. */
  value: string
  /** The countdown, `52m left` or `47s left`; empty while not counting. */
  left: string
  say: Say
  /** The cache's mood for a reader, unchanged as it counts down: the heartbeat's alt. */
  heartAlt: string
  /** `say` as plain text: `cache 52m left`. */
  text: string
  /** Pulse's row tile's name: `cache`. */
  bandName: string
  /** The last minute: `! 47s left · re-warm ~$1.66`, then `! 47s`. */
  amber: Amber | undefined
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
  /** The cache card's line while there is nothing to count. */
  cardNote: string | undefined
  /** What a card names the re-warm estimate: `re-warm if cold`, or once
   *  cold, `next message`. */
  estimateLabel: string
  alt: string
  /** Pulse's row tile: its figure after the name, `cache`, the time marked
   *  `~` while it is recalled, not measured: `52m left`, `~40m left`, `cold ·
   *  re-warm ~$1.66`; short, `52m`, `~40m`, `cold ~$1.66`. */
  figure: string
  figureShort: string
}>

export type ContextWords = Readonly<{
  /** `38%` and `context 38%`; while not reported, `–`. */
  valueText: string
  text: string
  say: Say
  /** `! context 93% · compacts in ~14k` / `! ctx 93%`; compaction off, `! context 85%`. */
  amber: Amber | undefined
  /** Tokens in context, where it compacts, the room before then, and the window:
   *  `76k`, `190k`, `~114k`, `200k`. While not reported, `–` and no room. */
  inContextText: string
  compactsAtText: string | undefined
  roomText: string | undefined
  /** Pulse's row tile's name: `context`. */
  bandName: string
  windowText: string
  /** The context card's headline: `87% full`, marked past 80% when compaction is off. */
  cardHead: Say
  /** Pulse's context card's fact: `in context`, then phrase by phrase
   *  `76k of 200k` and `compacts at 190k`, or near it `compacts in ~10k`. */
  fact: Readonly<{ label: string; values: readonly string[] }>
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
  /** When it fills before its reset, measured or at the average's pace, as
   *  the board says it: `full ~Mon` past today, `full ~14:20` today, or with
   *  the offset unknown `full in ~13h`. */
  fillText: string | undefined
  /** Pulse's row tile's name: `5h`. */
  bandName: string
  /** Pulse's limits card's line for another window: its amber words, else
   *  `say` as plain text, its name among them. */
  line: string
  /** A measured fill, `~40m`. */
  fullIn: string | undefined
  /** `! 5h 82%`, or with a measured fill, `! 5h full in ~40m` / `! 5h ~40m`. */
  amber: Amber | undefined
  /** Pulse's limits card, under its chart: `5h resets` and `16:40`; with a
   *  measured fill, `5h full in` and `~40m`; passed, `5h` and `reset`;
   *  with no reset to come, its pace or its value. */
  fact: Fact
  alt: string
}>

/** The cache in words, from its facts: it counts down only while `coldInMs` is set. */
export const cacheWords = (f: CacheFacts, c: BandSnapshot['cache']): CacheWords => {
  const counting = f.coldInMs !== undefined
  const left = counting ? fmtLeft(f.coldInMs) : ''
  const leftShort = counting ? fmtLeftShort(f.coldInMs) : ''
  // Recalled from the session's last reply, its time is an estimate until a reply measures it.
  const recalledTime = counting && c.recalled && !f.measured
  // Spoken, a price is never marked ~: the alt says "about".
  const price = c.reWarmUsd !== null ? fmtSmallCost(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  // The card counts down as chips' row always has: `1h 05m`, `0:47`.
  const countdown: Say = [[fmtCountdown(c.msLeft), 'value'], [' left', 'label']]
  const value = counting ? left : f.mood === 'unmeasured' ? UNKNOWN : f.compacted ? 'compacted' : f.mood
  const cardHead: Say = f.mood === 'unmeasured' ? [['not measured yet', 'value']] : counting ? countdown : [[value, 'value']]
  const say: Say =
    f.compacted ? [['cache ', 'label'], ['compacted', 'value'], [' · next ', 'label'], [f.estimate, 'value']]
    : f.mood === 'cold' ? [['cache ', 'label'], ['cold', 'value'], [' · re-warm ', 'label'], [f.estimate, 'value']]
    : [['cache ', 'label'], [value, 'value']]
  const sayShort: Say =
    f.compacted
      ? [['compacted ', 'label'], [f.estimate, 'value']]
      : f.mood === 'cold'
      ? [['cold ', 'label'], [f.estimate, 'value']]
      : f.mood === 'warming'
        ? [['warming', 'value']]
        : [['cache ', 'label'], [counting ? leftShort : value, 'value']]
  return {
    value,
    left,
    say,
    heartAlt:
      f.compacted ? 'cache compacted' : f.mood === 'cold' ? 'cache cold' : f.mood === 'expiring' ? 'cache in its last minute' : f.mood === 'unmeasured' ? 'cache not measured yet' : f.mood === 'warming' ? 'cache warming' : 'cache warm',
    text: joined(say),
    bandName: 'cache',
    amber: f.mood === 'expiring' ? AMBER.cache(leftShort, f.estimate) : undefined,
    savedText: f.measured && c.savedUsd !== null ? fmtEstimate(c.savedUsd) : undefined,
    hitText: f.hitFrac === undefined ? undefined : fmtPct(f.hitFrac),
    // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
    lastsText: `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`,
    rebuildsText: c.misses > 0 ? String(c.misses) : undefined,
    idleText: c.recalled && c.idleMs !== null ? fmtAgo(c.idleMs) : undefined,
    cardHead,
    cardNote:
      f.mood === 'unmeasured' ? "Countdown starts with Claude's next reply."
      : f.mood === 'warming' ? 'First message builds the cache.'
      : f.compacted ? 'Compacted while idle: next message writes the summary.'
      : f.idleCompactSoon ? 'Claude Code may compact it at ~54m idle, before it goes cold.'
      : undefined,
    estimateLabel: f.mood === 'cold' ? 'next message' : 're-warm if cold',
    alt:
      f.mood === 'unmeasured'
        ? 'cache not measured yet'
        : f.mood === 'warming'
          ? 'cache warming'
          : f.compacted
            ? altOf('cache', 'compacted while idle', `next message about ${price}`)
          : f.mood === 'cold'
            ? altOf('cache', 'cold', `re-warm about ${price}`)
            : counting
              ? altOf('cache', fmtLeftSpoken(f.coldInMs), f.mood === 'expiring' ? 'cooling' : 'warm', f.mood === 'expiring' ? `re-warm about ${price}` : undefined)
              : altOf('cache', 'warm', 'Claude is working'),
    figure: recalledTime ? `~${left}` : joined(say.filter(([text, role]) => !(text === 'cache ' && role === 'label'))),
    figureShort: recalledTime ? `~${leftShort}` : joined(sayShort.filter(([text, role]) => !(text === 'cache ' && role === 'label'))),
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
  const warmHover = f.idleCompactSoon
    ? `${left} left; may be compacted at ~54m idle, before it goes cold`
    : `${left} left; warm cache bills input at ${readPct}, expires ${c.ttl} after a request`
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
      if (f.compacted)
        return {
          // A summary to write, not a cache lost: as calm as cold.
          pill: short => (short ? `compacted ${f.estimate}` : `cache compacted · next ${f.estimate}`),
          figure: undefined,
          hover: `Compacted while idle: next message writes the ${fmtTokens(c.window)} summary${c.reWarmUsd === null ? '' : ` (${f.estimate})`}`,
          alt: 'cache compacted',
        }
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
  const amber = f.tone !== 'amber' ? undefined : f.toCompact !== undefined ? AMBER.context(f.frac, f.toCompact) : AMBER.contextNoCompaction(f.frac)
  const cardHead: Say = [[`${f.pct}${f.compactAt === undefined ? severityMark(f.frac) : ''}`, 'value'], [' full', 'label']]
  const compactsAtText = f.compactAt === undefined ? undefined : fmtTokens(f.compactAt)
  const toCompactText = f.toCompact === undefined ? undefined : `compacts in ~${fmtTokens(f.toCompact)}`
  const inContext = f.known ? fmtTokens(f.used) : UNKNOWN
  return {
    valueText: value,
    text: joined(say),
    say,
    amber,
    inContextText: f.known ? fmtTokens(f.used) : UNKNOWN,
    compactsAtText,
    roomText,
    bandName: 'context',
    windowText: fmtTokens(f.window),
    cardHead,
    fact: {
      label: 'in context',
      values: said([
        `${inContext} of ${fmtTokens(f.window)}`,
        amber !== undefined && toCompactText !== undefined ? toCompactText : compactsAtText === undefined ? undefined : `compacts at ${compactsAtText}`,
      ]),
    },
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
  const pace = live ? paceText(f) : ''
  const resetIn = span === undefined ? undefined : `in ${span}`
  const resetWhen = resetClock ?? resetIn
  const fillInMs = live ? f.fillInMs : undefined
  // A day's window says the fill's day; a shorter one its clock too, as its reset does.
  const fillDay = f.key === '7d' ? fmtDay : fmtDayClock
  const fillAt = fillInMs === undefined ? undefined : zone !== undefined ? `~${fillDay(frame.now + fillInMs, zone, frame.now)}` : `in ${fmtEta(fillInMs)}`
  const amber = f.tone !== 'amber' ? undefined : fullIn !== undefined ? AMBER.limitPace(f.name, fullIn) : AMBER.limit(f.name, f.percentUsed)
  const fact: Fact =
    !live ? { label: f.name, value: valueText }
    : amber !== undefined && fullIn !== undefined ? { label: `${f.name} full in`, value: fullIn }
    : resetWhen !== undefined ? { label: `${f.name} resets`, value: resetWhen }
    : { label: f.name, value: pace === '' ? valueText : pace }
  const cardResetLess = (): string | undefined => {
    if (span === undefined) return undefined
    return [`resets ${span}`, pace].filter(t => t !== '').join(' · ')
  }
  return {
    valueText,
    valueMarked: `${f.value}${severityMark(f.frac)}`,
    cardResetLess,
    resetWhen,
    text: joined(say),
    say,
    pace,
    fillText: fillAt === undefined ? undefined : `full ${fillAt}`,
    bandName: f.name,
    line: amber?.long ?? joined(say),
    fullIn,
    amber,
    fact,
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
  /** The newest `count` costs for a reader, as a chart draws them: 'cost of
   *  the last 14 messages, steady, average $0.18, max $0.84 re-warm', then
   *  ', the newest a re-warm' when it was: the average leaves re-warms out. */
  costsAltOf: (count: number) => string
  /** 'context over the conversation, rising, compacts at 190k'; with compaction off, no compaction point. */
  contextTrailAlt: string
  /** Pulse's spend tile's name: `spend`. */
  spendBandName: string
  /** `no costs yet`, beside the flat trace, only while there is no cost at
   *  all: none recorded and a total of $0. A resumed conversation's total
   *  says there were costs. */
  costsNote: string | undefined
  /** Pulse's spend card's fact: `last message · avg` and `$0.21 · ~$0.20`,
   *  or before a warm cost `last message` alone; undefined before any cost. */
  costFact: Fact | undefined
}>

/** A message above this many times the warm average is rising; below the average divided by it, falling. */
const TREND_FACTOR = 1.5
/** The context trail's trend, first point to last: a compaction can leave it falling. */
const contextTrendOf = (tokens: readonly number[]): 'rising' | 'falling' | 'steady' => {
  const first = tokens[0]
  const last = tokens[tokens.length - 1]
  return first === undefined || last === undefined || last === first ? 'steady' : last > first ? 'rising' : 'falling'
}

export const historyWords = (record: Trails, context: ContextFacts, spend: Readonly<{ totalUsd: number }>): HistoryWords => {
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
  const compactsAt = context.compactAt === undefined ? '' : `, compacts at ${fmtTokens(context.compactAt)}`
  const numbersShort = lastText === undefined ? '' : `last ${lastText}`
  return {
    lastText,
    numbersShort,
    costsAltOf,
    contextTrailAlt: `context over the conversation, ${contextTrendOf(record.context)}${compactsAt}`,
    spendBandName: 'spend',
    costsNote: record.costs.length === 0 && !(spend.totalUsd > 0) ? EMPTY.costsShort : undefined,
    costFact:
      lastText === undefined ? undefined
      : avg === undefined ? { label: 'last message', value: lastText }
      : { label: 'last message · avg', value: `${lastText} · ${fmtEstimate(avg)}` },
  }
}

/** Pulse's limits card's headline: each window's name and value, `5h 26% ·
 *  7d 41%`; with neither reported, the other windows'. */
export const limitsHead = (limits: ReadonlyArray<Pick<LimitFacts, 'key' | 'name'> & Pick<LimitWords, 'valueText'>>): Say => {
  const windows = limits.filter(l => l.key !== 'other')
  return (windows.length > 0 ? windows : limits).flatMap((l, i): Say => [[`${i === 0 ? '' : ' · '}${l.name} `, 'label'], [l.valueText, 'value']])
}

/** What the week says of its slices as drawn, for a reader. */
export type WeekWords = Readonly<{
  /** 'weekly limit by day: Sunday 66%, Monday about 34% and fills it, Tuesday to Saturday none left' */
  daysAlt: string
  /** The 5h window whole, start to reset: '5h window from start to reset, 26%
   *  used, on pace for about 33%'; no pace where none is known, '' with no 5h window. */
  windowAlt: string
}>

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

/** The week in words: its days as drawn, and the 5h window whole. */
export const weekWords = (
  w: Week,
  days: readonly SliceMark[],
  five?: Pick<LimitWords, 'valueText'> & Readonly<{ projectedPct: number | undefined; passed: boolean }>,
): WeekWords => ({
  daysAlt: slicesSpoken('weekly limit by day', w.days.map(d => d.name), days),
  windowAlt:
    five === undefined || five.passed
      ? ''
      : `5h window from start to reset, ${five.valueText} used${five.projectedPct === undefined ? '' : `, on pace for about ${Math.round(five.projectedPct)}%`}`,
})

// ---- the departures board ----------------------------------------------------

export type BoardKey = 'cache' | 'spend' | 'context' | '5h' | '7d' | 'other'
export type BoardRow = Readonly<{
  key: BoardKey
  item: string        // CACHE | SPEND | CONTEXT | 5H | 7D | an other limit's name, upper-case
  status: string      // DEPARTS | LAST CALL | DEPARTED | BOARDING | CHECK-IN | $0.24 | 8% USED | 26% | ! NEAR LIMIT
  time: string        // 17:24 | SAT 13:30 | IN 38 MIN | IN 1H 04M | PASSED | -
  remarks: string
  cell: string        // collapsed, long: DEPARTS 17:24 | 26% RESET 17:50 | 85% RESET SAT 13:30 ! NEAR LIMIT
  cellShort: string   // collapsed, short: 17:24 | ! 47S | 26%
  /** Limits only: the cell without its reset. */
  cellNoReset?: string
  tone: Tone
  alt: string         // in words, never capitals or ↻: the reading's existing alt
}>
/** What the board says for a reset: the flap face has no ↻. */
const BOARD_RESET = 'RESET'
export type Board = Readonly<{
  rows: readonly BoardRow[]
  /** The time now on the viewer's clock, `20:36`, for the open board's
   *  header; none where the zone isn't known. */
  now: string | undefined
}>
type BoardFacts = Readonly<{
  frame: Frame
  cache: CacheFacts & CacheWords
  spend: SpendFacts & SpendWords
  context: ContextFacts & ContextWords
  limits: readonly (LimitFacts & LimitWords)[]
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
  if (c.compacted) {
    const next = `NEXT ${c.estimate}`
    return at({ status: 'COMPACTED', time: clock ?? NONE, remarks: next, cell: clock === undefined ? `COMPACTED · ${next}` : `COMPACTED ${clock} · ${next}`, cellShort: next, tone: 'calm' })
  }
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
  // Near compaction the board names the event; with compaction off, the
  // fill. The group's ITEM already says CONTEXT, so its cell never does.
  const short = `! ${x.valueText}`
  const long = x.toCompact === undefined ? short : `! COMPACTS IN ~${fmtTokens(x.toCompact)}`
  return { ...base, status: long, remarks, cell: long, cellShort: short, tone: 'amber' }
}

const limitBoard = (r: BoardFacts, l: LimitFacts & LimitWords): BoardRow => {
  const { zone, now } = r.frame
  // An other limit names itself a limit: `spend` alone would read as the session's SPEND.
  const item = l.key !== 'other' ? l.key : /\blimit$/.test(l.name) ? l.name : `${l.name} limit`
  // Passed, its value is that it reset: RESET PASSED says it once, and the short forms the value.
  if (l.passed) return { key: l.key, item, status: l.valueText, time: 'PASSED', remarks: '', cell: `${BOARD_RESET} PASSED`, cellShort: l.valueText, cellNoReset: l.valueText, tone: l.tone, alt: l.alt }
  const time = l.resetInMs === undefined ? NONE : zone === undefined ? `IN ${boardSpan(l.resetInMs)}` : fmtDayClock(now + l.resetInMs, zone, now)
  // Amber from the pace, not from crossing the warning line: say when it fills.
  const byPace = l.key === '5h' && l.tone === 'amber' && l.etaMs !== null && l.percentUsed < WARN_AT * 100
  const amber = l.tone !== 'amber' ? undefined : byPace && l.etaMs !== null ? (zone === undefined ? `! FULL IN ${boardEta(l.etaMs)}` : `! FULL ~${fmtClock(now + l.etaMs, zone)}`) : '! NEAR LIMIT'
  const calm = l.fillText ?? l.pace
  const tail = (amber ?? calm) === '' ? '' : ` ${amber ?? calm}`
  return {
    key: l.key, item, status: amber ?? l.valueText, time,
    // Amber from the pace, STATUS says the fill, so REMARKS doesn't again.
    remarks: amber === undefined ? calm : [l.valueText, byPace ? '' : calm].filter(Boolean).join(' · '),
    cell: `${l.valueText}${time === NONE ? '' : ` ${BOARD_RESET} ${time}`}${tail}`, cellShort: amber === undefined ? l.valueText : `! ${l.valueText}`, cellNoReset: `${l.valueText}${tail}`,
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
    rows: [cacheBoard(r), spendBoard(r), contextBoard(r), ...of('5h'), ...of('7d'), ...of('other')].map(upRow),
    now: r.frame.zone === undefined ? undefined : fmtClock(r.frame.now, r.frame.zone),
  }
}

/** REMARKS cut to `tiles` characters, `…` last where cut. */
export const remarksFit = (remarks: string, tiles: number): string =>
  remarks.length <= tiles ? remarks : tiles <= 1 ? '' : `${remarks.slice(0, tiles - 1)}…`

/** What a board line says in its four columns. */
type BoardText = Pick<BoardRow, 'item' | 'status' | 'time' | 'remarks'>

/** The board's column headings, a line of their own. */
export const BOARD_HEADINGS: BoardText = { item: 'ITEM', status: 'STATUS', time: 'TIME', remarks: 'REMARKS' }
/** The open board's title, at its header's left. */
export const BOARD_TITLE = 'DEPARTURES'
/** What leads the time now, at the header's right: `NOW 20:36`. */
export const BOARD_NOW = 'NOW'
/** What TIME says, in plain text, on a line that has none. */
export const BOARD_NO_TIME = '–'
/** The alt of a rule between the board's lines. */
export const BOARD_RULE_ALT = 'a rule between the board\'s lines'
/** A row's TIME, none where it has no time. */
export const boardTime = (row: Pick<BoardRow, 'time'>): string | undefined => (row.time === NONE ? undefined : row.time)
