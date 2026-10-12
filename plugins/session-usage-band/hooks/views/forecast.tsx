// Forecast: what changes next, and at what clock time. Each reading's next
// change is one of chips' pills, its time the figure, soonest first and amber
// in front; open, chips' cards, each head saying when.

import type { RenderChildren } from 'claude-code'
import { dayCells } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitKey, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { Ahead, Amber } from '../words'
import type { Fact, Slots } from './cards'
import { LIMITS, cacheHover, contextHover, limitHover, pillRow, type ChipKey } from './chips'
import { AMBER_STEP, PERCENT, ROLE_INK, batteryIcon, beforeLast, fitLine, type Keeps, type PillSpec } from './parts'
import { defineCardsView, type CardOptions } from './view'

/** What gives way as the row narrows, first to last: the limits' tails, how
 *  far off the soonest change is, the cache's price, the calm pills, amber's
 *  long words, then an amber window's pace and reset, last of all as rings
 *  gives its own. Amber's words never go. */
const ORDER = ['limitTails', 'soon', 'price', 'compaction', 'calmSeven', 'calmFive', AMBER_STEP, 'amberWeekReset', 'amberFiveReset'] as const
type Piece = (typeof ORDER)[number]

/** What of the cards a pill says: in its figure and its tail while calm,
 *  in its amber words long and short. */
type Says = Readonly<{ figure?: Fact; tail?: Fact; amberLong?: Fact; amberShort?: Fact }>

/** A reading's pill before the squeeze: its words, calm or amber, when its
 *  change comes, its mark and ground, and the pieces of it that give way. */
type Change = Readonly<{
  key: string
  /** A limit's window, whose own facts its card keeps apart. */
  window?: LimitKey
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
  /** An amber window's pace and reset after its words, the step they give
   *  way at, and the card facts they say. */
  amberTail?: Readonly<{ text: string; step: Piece; says: readonly Fact[] }>
  says: Says
  /** Chips' hover card for the same reading. */
  hover: string | undefined
}>

/** A limit window's change, on its chip's tint: its figure the fill and its
 *  tail the reset, or its figure the reset and its tail the pace. */
const limitChange = (kit: Kit, read: Readings, key: ChipKey): Change[] => {
  const { palette, onTone, icon } = kit
  const l = key === '5h' ? read.fiveHour : read.sevenDay
  if (l === undefined) return []
  const spec = LIMITS[key]
  const t = spec.tint(palette)
  const [figure, tail] = l.fillAt === undefined ? (['reset', 'pace'] as const) : (['pace', 'reset'] as const)
  // A measured fill's amber says the pace, long and short.
  const amberSays = l.fullIn === undefined ? undefined : 'pace'
  const pace = l.fullIn === undefined && l.pace !== ''
  const reset = l.resetAtGlyph !== undefined
  return [
    {
      key,
      window: key,
      ahead: l.ahead,
      amber: l.amber,
      inMs: l.fillInMs ?? l.resetInMs,
      mark: icon(spec.icon, onTone(l.tone, t.accent)),
      name: { text: l.name, ink: t.fg },
      bg: t.bg,
      tail: 'limitTails',
      calm: key === '5h' ? 'calmFive' : 'calmSeven',
      amberTail: {
        text: l.tail(pace, reset).map(([text]) => text).join(''),
        step: key === '5h' ? 'amberFiveReset' : 'amberWeekReset',
        says: [...(pace ? (['pace'] as const) : []), ...(reset ? (['reset'] as const) : [])],
      },
      says: { figure, tail, amberLong: amberSays, amberShort: amberSays },
      hover: limitHover(read, key),
    },
  ]
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
    {
      key: 'cache',
      ahead: c.ahead,
      amber: c.amber,
      inMs: c.mood === 'cold' ? 0 : c.coldInMs,
      mark: cacheMark,
      tail: 'price',
      // Cold, its figure is the price; counting down, its tail.
      says: { figure: c.mood === 'cold' ? 'reWarm' : undefined, tail: 'reWarm', amberLong: 'reWarm' },
      hover: cacheHover(read),
    },
    ...limitChange(kit, read, '5h'),
    ...limitChange(kit, read, '7d'),
    ...(x.known
      ? [
          {
            key: 'ctx',
            ahead: x.ahead,
            amber: x.amber,
            inMs: undefined,
            mark: icon('context', onTone(x.tone, palette.label)),
            tail: 'compaction',
            calm: 'compaction',
            says: { figure: 'room', amberLong: x.roomText === undefined ? undefined : 'room' },
            hover: contextHover(read),
          } as const,
        ]
      : []),
  ]
}

/** When a change comes, for the row's order: one with no time after the timed. */
const byWhen = (a: Change, b: Change): number => (a.inMs ?? Number.MAX_VALUE) - (b.inMs ?? Number.MAX_VALUE)

/** A pill as the row draws it, and what of the cards it says. */
type Drawn = Readonly<{ change: Change; spec: PillSpec; says: readonly Fact[] }>

const factsOf = (facts: ReadonlyArray<Fact | undefined>): Fact[] => facts.filter(fact => fact !== undefined)

/** An amber change in its reading's words, then a window's pace and reset
 *  while kept, in its ink; a text surface's glyph would come before the `! `
 *  that leads them. */
const amberPill = (kit: Kit, ch: Change, amber: Amber, keeps: Keeps<Piece>): Drawn => {
  const { Svg, Text, palette } = kit
  const tail = ch.amberTail !== undefined && ch.amberTail.text !== '' && keeps.has(ch.amberTail.step) ? ch.amberTail : undefined
  return {
    change: ch,
    spec: {
      key: ch.key,
      tone: 'amber',
      bg: ch.bg,
      hover: ch.hover,
      body: [
        ...(Svg ? ch.mark : []),
        <Text key="amber" color={palette.amberFg}>
          {keeps.amber(amber)}
        </Text>,
        tail === undefined ? null : <Text key="tail" color={palette.amberFg}>{tail.text}</Text>,
      ],
    },
    says: [...factsOf([beforeLast(keeps) ? ch.says.amberLong : ch.says.amberShort]), ...(tail?.says ?? [])],
  }
}

/** A calm change: its lead, its figure bold, then how far off when it is the
 *  soonest, and its tail, each while kept. */
const calmPill = (kit: Kit, ch: Change, a: Ahead, keeps: Keeps<Piece>, soonest: boolean): Drawn => {
  const { Text, palette } = kit
  const brief = a.brief !== undefined && !keeps.has('price')
  const tail = !brief && keeps.has(ch.tail) ? a.tail : undefined
  const after = brief ? [] : [soonest && keeps.has('soon') ? a.soon : undefined, tail].filter(t => t !== undefined)
  return {
    change: ch,
    spec: {
      key: ch.key,
      tone: 'calm',
      bg: ch.bg,
      hover: ch.hover,
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
    },
    says: factsOf([ch.says.figure, tail === undefined ? undefined : ch.says.tail]),
  }
}

/** The pills at a squeeze: amber first, then the calm, each soonest first;
 *  how far off is said on the soonest change alone. */
const pillsOf = (kit: Kit, changes: readonly Change[], keeps: Keeps<Piece>): Drawn[] => {
  const amber = changes.filter((ch): ch is Change & { amber: Amber } => ch.amber !== undefined).sort(byWhen)
  const calm = changes
    .filter((ch): ch is Change & { ahead: Ahead } => ch.amber === undefined && ch.ahead !== undefined && (ch.calm === undefined || keeps.has(ch.calm)))
    .sort(byWhen)
  const soonest = [...amber, ...calm].filter(ch => ch.inMs !== undefined).sort(byWhen)[0]
  return [...amber.map(ch => amberPill(kit, ch, ch.amber, keeps)), ...calm.map(ch => calmPill(kit, ch, ch.ahead, keeps, ch === soonest))]
}

/** The one row: chips' pill row, squeezed by forecast's own order, and the
 *  pills it kept. */
const fit = (kit: Kit, read: Readings, act: BandActions) => {
  const changes = changesOf(kit, read)
  // fitLine's last build is the row it returns, so its pills are what the row says.
  let drawn: readonly Drawn[] = []
  const row = fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    drawn = pillsOf(kit, changes, keeps)
    return pillRow(kit, read, act, drawn.map(d => d.spec))
  })
  return { row, drawn }
}

/** The week's day cells; in ascii, which has no braille, none. */
const weekCells = (kit: Kit, read: Readings): RenderChildren => {
  const { days, daysAlt } = read.week
  if (read.frame.glyphs === 'ascii' || days.length === 0) return null
  return dayCells(kit, {
    key: 'cells',
    alt: daysAlt,
    values: days.map(d => d.pct),
    guess: days.map(d => d.guess),
    today: days.findIndex(d => d.today),
    // A measured day in the track's edge grey, its share of the limit filled.
    color: kit.palette.trackStroke,
    max: PERCENT,
    cellPx: 13,
    height: 14,
  })
}

/** Each card's head says when: the cache goes cold, how many messages to
 *  compaction, and the week's cells with the day it fills, the 7d named
 *  beside another window's headline. Short of room, its words give way
 *  whole, down to the figure alone. Its body skips what the row says. */
const lens = (kit: Kit, read: Readings, drawn: readonly Drawn[]): CardOptions => {
  const { palette, oneLine, gap } = kit
  const said = (text: string | undefined) => (text === undefined ? undefined : oneLine({ color: palette.label }, text))
  const cells = weekCells(kit, read)
  const seven = read.sevenDay
  const named = read.worstLimit?.key !== '7d'
  const fills = (named ? [seven?.fillNamed, seven?.fillNamedShort] : [seven?.fillText, seven?.fillAt]).map(said)
  /** The week's cells beside a fill's words, or either alone. */
  const withCells = (fill: RenderChildren) => [cells, cells === null || fill === undefined ? null : gap('g-cells'), fill ?? null]
  const [fill, fillShort] = fills
  const slots: Slots = {
    cache: said(read.cache.coldAtText),
    context: read.history.toCompaction === undefined ? undefined : { forms: read.history.toCompaction.map(said) },
    limits: cells === null && fill === undefined ? undefined : { forms: [withCells(fill), withCells(fillShort), fillShort ?? null] },
  }
  return {
    slots,
    shown: drawn.flatMap(d => (d.change.window === undefined ? d.says : [])),
    shownByWindow: Object.fromEntries(drawn.flatMap(d => (d.change.window === undefined ? [] : [[d.change.window, d.says]]))),
    windowResets: 'clock',
  }
}

/** Its lens reads the row as it was squeezed, so the cards skip only what
 *  the row kept. */
export const forecastView = defineCardsView({ desktop: 1, terminal: 1 }, (kit, read, act) => {
  const { row, drawn } = fit(kit, read, act)
  return { lines: [row], open: () => lens(kit, read, drawn) }
})
