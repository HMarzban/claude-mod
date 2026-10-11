// Forecast: what changes next, and at what clock time. Each reading's next
// change is one of chips' pills, its time the figure, soonest first and amber
// in front; open, chips' cards, each head saying when.

import type { RenderChildren } from 'claude-code'
import { dayCells } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { Ahead, Amber } from '../words'
import type { Fact, Slots } from './cards'
import { pillRow } from './chips'
import { ROLE_INK, batteryIcon, fitLine, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type Lens } from './view'

/** What gives way as the row narrows, first to last: the limits' tails, how
 *  far off the soonest change is, the cache's price, then the calm pills.
 *  Amber never does. */
const ORDER = ['limitTails', 'soon', 'price', 'compaction', 'calmSeven', 'calmFive'] as const
type Piece = (typeof ORDER)[number]

/** A reading's pill before the squeeze: its words, calm or amber, when its
 *  change comes, its mark and ground, and the pieces of it that give way. */
type Change = Readonly<{
  key: string
  ahead: Ahead | undefined
  amber: Amber | undefined
  /** Time to the change; undefined for one with no time, which follows the timed. */
  inMs: number | undefined
  mark: RenderChildren[]
  /** A limit's name, before its calm words, in its tint's ink; amber's words say it. */
  name?: Readonly<{ text: string; ink: string }>
  bg?: string
  /** The step its tail gives way at. */
  tail: Piece
  /** The step the whole calm pill gives way at; none for the cache, which stays. */
  calm?: Piece
}>

/** A limit window's change, on its chip's tint. */
const limitChange = (kit: Kit, l: LimitView | undefined, tint: 'five' | 'week'): Change[] => {
  const { palette, onTone, icon } = kit
  if (l === undefined) return []
  const [bg, fg, accent] = tint === 'five' ? [palette.fiveBg, palette.fiveFg, palette.fiveAccent] : [palette.weekBg, palette.weekFg, palette.weekAccent]
  const calm = tint === 'five' ? 'calmFive' : 'calmSeven'
  return [{ key: l.key, ahead: l.ahead, amber: l.amber, inMs: l.fillInMs ?? l.resetInMs, mark: icon(tint, onTone(l.tone, accent)), name: { text: l.name, ink: fg }, bg, tail: 'limitTails', calm }]
}

/** Every reading's change, in chips' order: the cache, the 5h, the 7d and
 *  the context. Other windows are drawn only open. */
const changesOf = (kit: Kit, read: Readings): Change[] => {
  const { Svg, Text, palette, onTone, gap, icon } = kit
  const c = read.cache
  const x = read.context
  // The battery on the desktop; elsewhere the cache's glyph.
  const cacheMark = Svg
    ? [batteryIcon(kit, c.charge, c.tone, c.alt), gap('g-battery')]
    : [<Text key="i-cache" color={c.coldInMs === undefined ? palette.cold : palette.warm}>{'◷ '}</Text>]
  return [
    { key: 'cache', ahead: c.ahead, amber: c.amber, inMs: c.mood === 'cold' ? 0 : c.coldInMs, mark: cacheMark, tail: 'price' },
    ...limitChange(kit, read.fiveHour, 'five'),
    ...limitChange(kit, read.sevenDay, 'week'),
    ...(x.known ? [{ key: 'ctx', ahead: x.ahead, amber: x.amber, inMs: undefined, mark: icon('context', onTone(x.tone, palette.label)), tail: 'compaction', calm: 'compaction' } as const] : []),
  ]
}

/** When a change comes, for the row's order: one with no time after the timed. */
const byWhen = (a: Change, b: Change): number => (a.inMs ?? Number.MAX_VALUE) - (b.inMs ?? Number.MAX_VALUE)

/** An amber change in its reading's words; a text surface's glyph would
 *  come before the `! ` that leads them. */
const amberPill = (kit: Kit, ch: Change, amber: Amber, keeps: Keeps<Piece>): PillSpec => {
  const { Svg, Text, palette } = kit
  return { key: ch.key, tone: 'amber', bg: ch.bg, body: [...(Svg ? ch.mark : []), <Text key="amber" color={palette.amberFg}>{keeps.amber(amber)}</Text>] }
}

/** A calm change: its lead, its figure bold, then how far off when it is the
 *  soonest, and its tail, each while kept. */
const calmPill = (kit: Kit, ch: Change, a: Ahead, keeps: Keeps<Piece>, soonest: boolean): PillSpec => {
  const { Text, palette } = kit
  const brief = a.brief !== undefined && !keeps.has('price')
  const after = brief ? [] : [soonest && keeps.has('soon') ? a.soon : undefined, keeps.has(ch.tail) ? a.tail : undefined].filter(t => t !== undefined)
  return {
    key: ch.key,
    tone: 'calm',
    bg: ch.bg,
    body: [
      ...ch.mark,
      ch.name === undefined ? null : <Text key="name" color={ch.name.ink}>{`${ch.name.text} `}</Text>,
      ...(brief ? (a.brief ?? []) : a.lead).map(([text, role], i) => (
        <Text key={`w${i}`} color={palette[ROLE_INK[role]]}>
          {text}
        </Text>
      )),
      <Text key="figure" color={palette.value} bold>
        {a.figure}
      </Text>,
      after.length === 0 ? null : <Text key="after" color={palette.label}>{after.map(t => ` · ${t}`).join('')}</Text>,
    ],
  }
}

/** The pills at a squeeze: amber first, then the calm, each soonest first;
 *  how far off is said on the soonest change alone. */
const pillsOf = (kit: Kit, changes: readonly Change[], keeps: Keeps<Piece>): PillSpec[] => {
  const amber = changes.filter((ch): ch is Change & { amber: Amber } => ch.amber !== undefined).sort(byWhen)
  const calm = changes
    .filter((ch): ch is Change & { ahead: Ahead } => ch.amber === undefined && ch.ahead !== undefined && (ch.calm === undefined || keeps.has(ch.calm)))
    .sort(byWhen)
  const soonest = [...amber, ...calm].filter(ch => ch.inMs !== undefined).sort(byWhen)[0]
  return [...amber.map(ch => amberPill(kit, ch, ch.amber, keeps)), ...calm.map(ch => calmPill(kit, ch, ch.ahead, keeps, ch === soonest))]
}

/** The one row: chips' pill row, squeezed by forecast's own order. */
const lines = (kit: Kit, read: Readings, act: BandActions) => {
  const changes = changesOf(kit, read)
  return [fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => pillRow(kit, read, act, pillsOf(kit, changes, keeps)))]
}

/** The week's day cells, 16px tall; in ascii, which has no braille, none. */
const weekCells = (kit: Kit, read: Readings): RenderChildren => {
  const { days, daysAlt } = read.week
  if (read.frame.glyphs === 'ascii' || days.length === 0) return null
  return dayCells(kit, {
    key: 'cells',
    alt: daysAlt,
    values: days.map(d => d.pct),
    guess: days.map(d => d.guess),
    today: days.findIndex(d => d.today),
    color: kit.palette.label,
    cellPx: 13,
    height: 14,
  })
}

/** Each card's head says when: the cache goes cold, how many messages to
 *  compaction, and the week's cells with the day it fills. Its body skips
 *  what the row said at its widest. */
const lens: Lens = (kit, read) => {
  const { palette, oneLine, gap } = kit
  const c = read.cache
  const worst = read.worstLimit
  const said = (text: string | undefined) => (text === undefined ? undefined : oneLine({ color: palette.label }, text))
  const cells = weekCells(kit, read)
  const fill = said(read.sevenDay?.fillText)
  const slots: Slots = {
    cache: said(c.coldAtText),
    context: said(read.history.toCompactionText),
    limits: cells === null && fill === undefined ? undefined : [cells, cells === null || fill === undefined ? null : gap('g-cells'), fill ?? null],
  }
  // The worst window's pill says its reset, and its pace too unless amber
  // says it in place of both.
  const limitFacts = (w: LimitView | undefined): Fact[] =>
    w === undefined || w.key === 'other'
      ? []
      : w.amber !== undefined
        ? w.fullIn === undefined ? [] : ['pace']
        : w.ahead === undefined ? [] : ['reset', ...(w.pace === '' ? [] : ['pace' as const])]
  const shown: Fact[] = [
    ...(c.coldInMs !== undefined || c.mood === 'cold' ? ['reWarm' as const] : []),
    ...(read.context.roomText !== undefined ? ['room' as const] : []),
    ...limitFacts(worst),
  ]
  return { slots, shown, windowResets: 'clock' }
}

export const forecastView = defineCardsView('forecast', { desktop: 1, terminal: 1 }, lines, lens)
