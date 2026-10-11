// Week, how the week looks: one row led by the 7d pill and its seven day
// cells, solid measured, dashed guessed, the notch in today and the day the
// guess fills it named; chips' pills after it. Open, chips' cards, LIMITS'
// head drawing the 5h by the hour and its first row the week in words.

import type { RenderChildren } from 'claude-code'
import { sliceCells } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK, SHORT_BELOW } from '../layout'
import type { LimitView, Readings, SliceRow } from '../reading'
import { WEEK, type Say } from '../words'
import { cachePill, contextPill, costPill, limitPill, pillRow, tokensPill } from './chips'
import { accentOf, beforeLast, fitLine, layoutCacheSpec, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type Lens } from './view'

/** What gives way as the row narrows, first to last: chips' pieces in
 *  week's order, and week's own; the 7d, then the cost, go last of the calm
 *  ones, so a narrow amber row still fits. Week draws no bars, so they
 *  aren't in it. An amber piece holds out, and shortens last. */
const ORDER = ['tokens', 'weekReset', 'fiveReset', 'weekPace', 'shortWording', 'calmContext', 'calmFive', 'weekCells', 'calmWeek', 'cost', 'amberWeekReset', 'amberFiveReset'] as const
type Piece = (typeof ORDER)[number]

/** A window's slices in its colour: the days in a pill, the hours in a card's head. */
const cellsOf = (kit: Kit, l: LimitView, row: SliceRow, alt: string, ground: string, wide: boolean): RenderChildren =>
  sliceCells(kit, { key: 'cells', alt, row, color: kit.onTone(l.tone, accentOf(kit, l)), ground, cellPx: wide ? 14 : 9, wide })

/** A limit's pill, week's way, on chips' tint and hover: its name, the
 *  days' cells for the 7d, its figure bold, the fill day, then its reset in
 *  label ink; amber, its reason in place of name and value. Chips' own
 *  always carries a bar and counts its reset down, so week draws its body. */
const limitSpec = (kit: Kit, read: Readings, l: LimitView, keeps: Keeps<Piece>): PillSpec | undefined => {
  const { Text, Svg, palette, onTone, gap, icon } = kit
  const seven = l.key === '7d'
  const chip = limitPill(kit, read, seven ? '7d' : '5h', 0, false)
  if (chip === undefined || l.passed) return chip
  const amber = l.amber
  const fg = onTone(l.tone, seven ? palette.weekFg : palette.fiveFg)
  const ground = onTone(l.tone, chip.bg ?? palette.surface, palette.amberBg)
  const wk = read.week
  const cells = seven && wk.days.length > 0 && (amber === undefined ? keeps.has('weekCells') : beforeLast(keeps))
  const pace = seven && keeps.has('weekPace') ? wk.fullDay : undefined
  // The 7d's reset at its clock time, as its cells read the week; the 5h's a countdown.
  const when = (seven ? l.resetClock : undefined) ?? (l.reset?.kind === 'in' ? l.reset.text : undefined)
  const resetInk = onTone(l.tone, palette.label)
  const reset = when !== undefined && keeps.has(seven ? (amber === undefined ? 'weekReset' : 'amberWeekReset') : amber === undefined ? 'fiveReset' : 'amberFiveReset')
  // A text surface's space before the cells rides on the words: alone, the desktop would drop it.
  const before = cells && !Svg ? ' ' : ''
  const named =
    amber === undefined
      ? [...icon(seven ? 'week' : 'five', onTone(l.tone, accentOf(kit, l))), <Text key="l" color={fg}>{`${l.name}${before}`}</Text>]
      : [<Text key="a" color={palette.amberFg}>{`${keeps.amber(amber)}${before}`}</Text>]
  return {
    ...chip,
    tone: l.tone,
    body: [
      ...named,
      ...(cells ? [Svg ? gap('g-cells') : null, cellsOf(kit, l, wk.dayRow, wk.daysAlt, ground, true)] : []),
      amber === undefined ? <Text key="v" color={fg} bold>{` ${l.valueMarked}`}</Text> : null,
      ...(pace === undefined ? [] : [<Text key="ps" color={resetInk}>{' · '}</Text>, <Text key="p" color={fg}>{pace}</Text>]),
      ...(reset ? [<Text key="d" color={palette.label}>{Svg ? ' · ' : ' │ '}</Text>, ...icon('reset', resetInk), <Text key="r" color={resetInk}>{when}</Text>] : []),
    ],
  }
}

/** A phrase in value ink, bold on its figure alone: `87% full`. */
const figure = (kit: Kit, say: Say, ink: string): RenderChildren[] => {
  const { Text } = kit
  return say.map(([text, role], i) => (
    <Text key={`v${i}`} color={ink} {...(role === 'value' ? { bold: true } : {})}>
      {text}
    </Text>
  ))
}

/** The context's pill: its fill as the card heads it, `87% full`, short its
 *  figure alone; amber, its reason. Chips' own carries a meter. */
const contextSpec = (kit: Kit, read: Readings, short: boolean, keeps: Keeps<Piece>): PillSpec => {
  const { Text, palette, icon } = kit
  const x = read.context
  const hover = contextPill(kit, read, 0).hover
  if (x.amber !== undefined) return { key: 'ctx', tone: 'amber', body: [<Text key="a" color={palette.amberFg}>{keeps.amber(x.amber)}</Text>], hover }
  return { key: 'ctx', tone: 'calm', body: [...icon('context', palette.label), ...figure(kit, short ? x.cardHead.slice(0, 1) : x.cardHead, palette.value)], hover }
}

/** The cache's pill: chips' while calm; amber, its reason, long until the last step. */
const cacheSpec = (kit: Kit, read: Readings, short: boolean, keeps: Keeps<Piece>): PillSpec =>
  read.cache.amber === undefined ? cachePill(kit, read, short) : { ...layoutCacheSpec(kit, read, !beforeLast(keeps)), hover: cachePill(kit, read, short).hover }

/** The row's pills at a squeeze: 7d, 5h, cache, cost, context, then the
 *  tokens, first to give way; whatever is amber moves to the front. */
const weekPills = (kit: Kit, read: Readings, keeps: Keeps<Piece>): PillSpec[] => {
  const { fiveHour, sevenDay, context } = read
  const short = kit.columns < SHORT_BELOW || !keeps.has('shortWording')
  const pills = [
    sevenDay === undefined || !keeps.calm('calmWeek', sevenDay.tone) ? undefined : limitSpec(kit, read, sevenDay, keeps),
    fiveHour === undefined || !keeps.calm('calmFive', fiveHour.tone) ? undefined : limitSpec(kit, read, fiveHour, keeps),
    cacheSpec(kit, read, short, keeps),
    keeps.has('cost') ? costPill(kit, read) : undefined,
    context.known && keeps.calm('calmContext', context.tone) ? contextSpec(kit, read, short, keeps) : undefined,
    read.cache.measured && keeps.has('tokens') ? tokensPill(kit, read) : undefined,
  ].filter((p): p is PillSpec => p !== undefined)
  return [...pills.filter(p => p.tone === 'amber'), ...pills.filter(p => p.tone !== 'amber')]
}

/** LIMITS' lens: the 5h by the hour, its cells and their name. */
const hoursLens = (kit: Kit, read: Readings, five: LimitView): RenderChildren => {
  const { Text, Svg, palette, gap, oneLine } = kit
  const cells = cellsOf(kit, five, read.week.hourRow, read.week.hoursAlt, palette.cardBg, false)
  return Svg
    ? [cells, gap('g-lens'), oneLine({ key: 'by', color: palette.label }, WEEK.byHour)]
    : oneLine({ key: 'lens' }, [cells, <Text key="by" color={palette.label}>{` ${WEEK.byHour}`}</Text>])
}

/** Open: the hours in LIMITS' head, the week in words as its first row, the
 *  context's room and compaction in one; the resets and paces the row shows
 *  go. A limit the row never draws heads LIMITS while it needs you. */
const lens: Lens = (kit, read) => {
  const { context, fiveHour, week } = read
  const room = context.roomCompactsText !== undefined && context.roomText !== undefined ? ([context.roomCompactsText, context.roomText] as const) : undefined
  const unseen = read.limits.find(l => l.key === 'other' && l.amberSay !== undefined)?.amberSay
  return {
    slots: fiveHour === undefined || week.hours.length === 0 ? {} : { limits: hoursLens(kit, read, fiveHour) },
    heads: unseen === undefined ? {} : { limits: unseen },
    lead: { ...(week.byDay === undefined ? {} : { limits: [WEEK.byDay, week.byDay] as const }), ...(room === undefined ? {} : { context: room }) },
    shown: ['reset', 'pace', ...(room === undefined ? [] : (['room', 'compactsAt'] as const))],
  }
}

export const weekView = defineCardsView(
  'week',
  { desktop: 1, terminal: 1 },
  (kit, read, act) => [fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => pillRow(kit, read, act, weekPills(kit, read, keeps)))],
  lens,
)
