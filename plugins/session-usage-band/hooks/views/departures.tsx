// Departures, the countdown board: how long until each thing goes. Every
// reading is a countdown in chips' pills and tints, soonest first, `›`
// reading "then"; compaction counts messages, not minutes, so it follows the
// clocks, and the spend, with no clock, waits after the board. Amber jumps
// the queue. Open, it is the shared cards, each lens its card's place in the
// queue, each first row one the row left out.

import type { RenderChildren, RenderElement } from 'claude-code'
import { asciiText } from '../glyphs'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { DEPARTURES, usedSoFar } from '../words'
import type { Countdown, Departure } from '../words'
import type { CardName, Fact } from './cards'
import { LIMITS, costPill, tokensPill } from './chips'
import type { ChipKey } from './chips'
import { toggleButton } from './frame'
import { batteryIcon, beforeLast, line, pill, settleLine, textBattery } from './parts'
import type { BoldRuns, Keeps } from './parts'
import { defineCardsView } from './view'
import type { Lens, Lines } from './view'

/** What gives way as the row narrows, first to last; amber never does. The
 *  tokens go first, as on chips' row, then the pills' icons, the coin with
 *  them, before the reset after a fill, a fact; the cache, the board's
 *  lead, stays. */
const ORDER = ['tokens', 'icons', 'reset', 'calmContext', 'calmSeven', 'cost', 'calmFive', 'shortWording'] as const
type Piece = (typeof ORDER)[number]

/** A stop's pill as a squeeze keeps it, and the card facts its words say there. */
type Drawn = Readonly<{ pill: RenderElement; says: readonly Fact[] }>

/** A reading in the queue: the card it opens into, its tone, how long until
 *  it goes (none for what has no clock), what its place is for, and its pill
 *  as a squeeze keeps it, or nothing once it has given way. */
type Stop = Readonly<{
  card: CardName
  tone: Tone
  inMs: number | undefined
  lens: string
  limit?: LimitView
  draw: (keeps: Keeps<Piece>) => Drawn | null
}>

/** Long words until the row is out of room: an amber reading's at the amber
 *  step, a calm one's at `shortWording`. */
const formOf = (d: Departure, tone: Tone, keeps: Keeps<Piece>): Countdown =>
  (tone === 'amber' ? beforeLast(keeps) : keeps.has('shortWording')) ? d.long : d.short

/** A countdown in one ink, bold on its figure alone. */
const said = (kit: Kit, cd: Countdown, ink: string): RenderChildren[] => {
  const { Text } = kit
  return [
    cd.words === '' ? null : <Text key="w" color={ink}>{cd.words}</Text>,
    cd.figure === '' ? null : (
      <Text key="f" color={ink} bold>
        {cd.figure}
      </Text>
    ),
    cd.after === '' ? null : <Text key="a" color={ink}>{cd.after}</Text>,
  ]
}

/** The cache as chips draws it, a draining battery, saying its countdown;
 *  amber on its last call. */
const cacheStop = (kit: Kit, read: Readings): Stop => {
  const { Svg, palette, onTone, gap } = kit
  const c = read.cache
  const tone: Tone = c.lastCall ? 'amber' : 'calm'
  const cachePill = (cd: Countdown): RenderElement => {
    if (Svg) return pill(kit, { key: 'cache', tone, body: [batteryIcon(kit, c.charge, tone, c.alt), gap('g-battery'), ...said(kit, cd, onTone(tone, palette.value))] })
    if (!palette.filled) return pill(kit, { key: 'cache', tone, body: said(kit, cd, onTone(tone, palette.value)) })
    // The ascii words are mapped before the battery's cut, as chips maps its own.
    const runs: BoldRuns = [[`◷ ${cd.words}`, false], [cd.figure, true], [cd.after, false]]
    const drawn: BoldRuns = read.frame.glyphs === 'ascii' ? runs.map(([text, bold]) => [asciiText(text), bold]) : runs
    return pill(kit, { key: 'cache', tone, body: textBattery(kit, c.charge, tone, drawn), paintsOwnBg: true })
  }
  const draw = (keeps: Keeps<Piece>): Drawn => {
    const cd = formOf(c.departure, tone, keeps)
    // Cold, both forms say the price; a last call, its long form alone.
    const saysReWarm = c.mood === 'cold' || (c.lastCall && cd === c.departure.long)
    return { pill: cachePill(cd), says: saysReWarm ? ['reWarm'] : [] }
  }
  // A cache with no countdown, working, cold or not yet measured, still leads.
  return { card: 'cache', tone, inMs: c.coldInMs ?? 0, lens: c.departureLens, draw }
}

/** A limit in its chip's tint: when it resets, or when it fills and then,
 *  after `↻`, the reset, in label ink as chips says it; amber on its last
 *  call, though calm by its percent. The worst window's pill may say what
 *  LIMITS' first row would. */
const limitStop = (kit: Kit, key: ChipKey, l: LimitView, worst: boolean): Stop => {
  const { Text, palette, onTone, icon } = kit
  const spec = LIMITS[key]
  const tint = spec.tint(palette)
  const tone: Tone = l.lastCall ? 'amber' : l.tone
  const draw = (keeps: Keeps<Piece>): Drawn | null => {
    if (!keeps.calm(key === '5h' ? 'calmFive' : 'calmSeven', tone)) return null
    const resetInk = onTone(tone, palette.label)
    const aside = l.departureReset !== undefined && (tone === 'amber' ? beforeLast(keeps) : keeps.has('reset'))
    const reset = aside ? [<Text key="d" color={palette.label}>{' │ '}</Text>, ...icon('reset', resetInk), <Text key="r" color={resetInk}>{l.departureReset}</Text>] : []
    // With no reset aside, the countdown is the reset itself; a fill, or a
    // full window's 100%, says its pace.
    const saysPace = l.fullInMs !== undefined || l.frac === 1
    const says: Fact[] = !worst ? [] : [...(aside || l.departureReset === undefined ? (['reset'] as const) : []), ...(saysPace ? (['pace'] as const) : [])]
    return {
      pill: pill(kit, {
        key,
        tone,
        bg: tint.bg,
        body: [...(keeps.has('icons') ? icon(spec.icon, onTone(tone, tint.accent)) : []), ...said(kit, formOf(l.departure, tone, keeps), onTone(tone, tint.fg)), ...reset],
      }),
      says,
    }
  }
  return { card: 'limits', tone, inMs: l.passed ? undefined : (l.fullInMs ?? l.resetInMs), lens: l.departureLens, limit: l, draw }
}

/** The context counting down to compaction, in messages once its pace is known. */
const contextStop = (kit: Kit, read: Readings, d: Departure): Stop => {
  const { palette, onTone, icon } = kit
  const x = read.context
  const { tone } = x
  const draw = (keeps: Keeps<Piece>): Drawn | null => {
    if (!keeps.calm('calmContext', tone)) return null
    const cd = formOf(d, tone, keeps)
    // Calm, it says the room until it counts messages; amber, in its long form.
    const saysRoom = tone === 'amber' ? cd === d.long && x.roomText !== undefined : x.msgsHead === undefined
    return {
      pill: pill(kit, {
        key: 'ctx',
        tone,
        body: [...(keeps.has('icons') ? icon('context', onTone(tone, palette.label)) : []), ...said(kit, cd, onTone(tone, palette.value))],
      }),
      says: saysRoom ? ['room'] : [],
    }
  }
  return { card: 'context', tone, inMs: undefined, lens: DEPARTURES.compacts, draw }
}

/** The board's queue: amber first, then soonest first, what has no clock last. */
const queueOf = (kit: Kit, read: Readings): Stop[] => {
  const { fiveHour, sevenDay, worstLimit } = read
  const d = read.context.departure
  const stops = [
    cacheStop(kit, read),
    ...(fiveHour === undefined ? [] : [limitStop(kit, '5h', fiveHour, fiveHour === worstLimit)]),
    ...(sevenDay === undefined ? [] : [limitStop(kit, '7d', sevenDay, sevenDay === worstLimit)]),
    ...(d === undefined ? [] : [contextStop(kit, read, d)]),
  ]
  const rank = (s: Stop) => (s.tone === 'amber' ? 0 : 1)
  return stops.sort((a, b) => rank(a) - rank(b) || (a.inMs ?? Number.MAX_SAFE_INTEGER) - (b.inMs ?? Number.MAX_SAFE_INTEGER))
}

/** The one row: the queue, `›` between its stops; air, the spend and the
 *  tokens; then the toggle. With it, the card facts the row says at the
 *  squeeze it settled on. */
const settle = (kit: Kit, read: Readings, act: BandActions, queue: readonly Stop[]): Readonly<{ row: RenderElement; says: readonly Fact[] }> => {
  const { Box, Text, palette } = kit
  // Built once: the squeeze only chooses among them.
  const seps = queue.slice(1).map((_, i) => <Text key={`sep${i}`} color={palette.label}>›</Text>)
  const cost = costPill(kit, read)
  const tokens = tokensPill(kit, read)
  const air = <Box key="air" />
  // The coin goes with the other icons: the figure alone stays.
  const spend = [air, pill(kit, { key: cost.key, tone: cost.tone, body: cost.body })]
  const spendBare = [air, pill(kit, { key: cost.key, tone: cost.tone, body: cost.body.slice(-1) })]
  // The ascii tier drops `Σ`, so the tokens say their unit.
  const unit = read.frame.glyphs === 'ascii' ? <Text key="unit" color={palette.value}>{DEPARTURES.tokensUnit}</Text> : null
  const tokensPiece = pill(kit, { key: tokens.key, tone: tokens.tone, body: [...tokens.body, unit] })
  const toggle = toggleButton(kit, read, act)
  const drawnAt = (keeps: Keeps<Piece>) => queue.map(s => s.draw(keeps)).filter(s => s !== null)
  const { line: row, keeps } = settleLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const pills = drawnAt(keeps).map(s => s.pill)
    return line(
      kit,
      'row',
      [
        ...pills.flatMap((s, i) => (i === 0 ? [s] : [seps[i - 1] ?? null, s])),
        ...(keeps.has('cost') ? (keeps.has('icons') ? spend : spendBare) : []),
        read.cache.measured && keeps.has('tokens') ? tokensPiece : null,
      ],
      toggle,
      1,
    )
  })
  return { row, says: drawnAt(keeps).flatMap(s => s.says) }
}

const lines: Lines = (kit, read, act) => [settle(kit, read, act, queueOf(kit, read)).row]

/** A card's places in the queue: each number on a chip's ground, then what goes. */
const placesOf = (kit: Kit, stops: readonly (readonly [number, Stop])[]): RenderChildren => {
  const { Box, Text, palette } = kit
  if (stops.length === 0) return undefined
  return (
    <Box key="queue" flexDirection="row" columnGap={1}>
      {stops.flatMap(([n, s]) => [
        <Box key={`n${n}`} flexShrink={0} {...(palette.filled ? { backgroundColor: palette.surface, paddingX: 1 } : {})}>
          <Text color={palette.label}>{String(n)}</Text>
        </Box>,
        <Text key={`l${n}`} color={palette.label}>
          {s.lens}
        </Text>,
      ])}
    </Box>
  )
}

/** Each card's place in the queue, LIMITS headed by its soonest window
 *  unless another needs you, and no card repeating what the row says at
 *  the squeeze it settled on. */
const lens: Lens = (kit, read, act) => {
  const { Text, palette } = kit
  const { context: x, worstLimit: worst } = read
  const queue = queueOf(kit, read)
  const placed = queue.map((s, i) => [i + 1, s] as const)
  const places = (card: CardName) => placesOf(kit, placed.filter(([, s]) => s.card === card))
  const soonest = placed.find(([, s]) => s.limit !== undefined)?.[1].limit
  const lead = usedSoFar(read.limits)
  // Another window is never on the row: an amber one keeps LIMITS'
  // headline, where the cards say it.
  const otherAmber = worst?.key === 'other' && worst.tone === 'amber'
  // CONTEXT's first row, while the row counts messages, says the room and where it compacts.
  const shown: Fact[] = [...settle(kit, read, act, queue).says, ...(x.roomLead === undefined ? [] : (['room', 'compactsAt'] as const))]
  return {
    slots: {
      cache: places('cache'),
      spend: <Text key="clock" color={palette.label}>{DEPARTURES.noClock}</Text>,
      context: places('context'),
      limits: places('limits'),
    },
    heads: {
      ...(x.msgsHead === undefined ? {} : { context: x.msgsHead }),
      ...(soonest?.departureHead === undefined || otherAmber ? {} : { limits: soonest.departureHead }),
    },
    lead: {
      ...(x.roomLead === undefined ? {} : { context: x.roomLead }),
      ...(lead === undefined ? {} : { limits: lead }),
    },
    shown,
    // The row says each reset as a countdown, so a window's own line says its clock.
    windowResets: 'clock',
  }
}

export const departuresView = defineCardsView('departures', { desktop: 1, terminal: 1 }, lines, lens)
