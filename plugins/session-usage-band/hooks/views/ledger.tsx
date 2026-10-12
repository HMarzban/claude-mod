// Ledger, the band in plain words: one sentence, each reading named and bold
// on its figure alone, `│` between readings and `·` within one, what needs
// you moved to the front. Behind ▵, the shared cards, with no lens: none
// repeats a fact the sentence says.

import type { RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitKey, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { BETWEEN_READINGS, type Amber, type Say } from '../words'
import type { Fact } from './cards'
import { toggleButton } from './frame'
import { AMBER_STEP, ROLE_INK, amberFirst, amberSay, beforeLast, fitLine, type Keeps } from './parts'
import { defineCardsView } from './view'

/** What gives way as the row narrows, first to last: the closest calm
 *  limit's ↻ clock and pace words, the calm readings, the cold cache's long
 *  words, amber's long words, then an amber window's reset and pace, last
 *  of all as rings gives its own. Amber's words never go. */
const ORDER = ['reset', 'pace', 'calmSeven', 'calmContext', 'cost', 'calmFive', 'cacheWords', AMBER_STEP, 'amberWeekReset', 'amberFiveReset'] as const
type Piece = (typeof ORDER)[number]

/** A reading in the sentence: its words, its warning if it has one, the
 *  card facts its words say, which the cards then skip, and what they say of
 *  its own window. */
type Part = Readonly<{ say: Say; amber: Amber | undefined; says: readonly Fact[]; window?: readonly [LimitKey, readonly Fact[]] }>

/** A warning's words, long until every calm piece has gone. */
const warning = (amber: Amber, keeps: Keeps<Piece>, says: readonly Fact[] = []): Part => ({ say: amberSay(amber, keeps), amber, says })

const cachePart = (read: Readings, keeps: Keeps<Piece>): Part => {
  const c = read.cache
  // The long warning and a cold cache's words both say the re-warm price.
  if (c.amber !== undefined) return warning(c.amber, keeps, beforeLast(keeps) ? ['reWarm'] : [])
  return { say: keeps.has('cacheWords') ? c.sentence : c.sentenceShort, amber: undefined, says: c.mood === 'cold' ? ['reWarm'] : [] }
}

const contextPart = (read: Readings, keeps: Keeps<Piece>): Part | null => {
  const x = read.context
  // Unreported, the context says nothing collapsed; open, its card says so.
  if (!x.known) return null
  // The long warning names the room before compaction.
  if (x.amber !== undefined) return warning(x.amber, keeps, beforeLast(keeps) && x.roomText !== undefined ? ['room'] : [])
  return keeps.has('calmContext') ? { say: x.sentence, amber: undefined, says: [] } : null
}

/** The card facts a limit's words say, and what they say of its window:
 *  the worst's are LIMITS' lead row's too. */
const factsOf = (read: Readings, l: LimitView, said: readonly Fact[]): Pick<Part, 'says' | 'window'> => ({
  says: l === read.worstLimit ? said : [],
  window: [l.key, said],
})

/** A limit: its warning, with its reset and its pace while the row has room;
 *  or its value, the closest calm one with the pace and the reset LIMITS'
 *  lead row would say. */
const limitPart = (read: Readings, l: LimitView | undefined, step: Piece, keeps: Keeps<Piece>, closestCalm: LimitView | undefined): Part | null => {
  if (l === undefined) return null
  if (l.amber !== undefined) {
    // A measured fill's warning says its pace already.
    const told = keeps.has(l.key === '5h' ? 'amberFiveReset' : 'amberWeekReset')
    const pace = told && l.fullIn === undefined && l.pace !== ''
    const reset = told && l.resetAtGlyph !== undefined
    const tail = l.tail(pace, reset).map(([text]): Say[number] => [text, 'amber'])
    const said: Fact[] = [...(pace || l.fullIn !== undefined ? (['pace'] as const) : []), ...(reset ? (['reset'] as const) : [])]
    return { ...warning(l.amber, keeps), say: [...amberSay(l.amber, keeps), ...tail], ...factsOf(read, l, said) }
  }
  if (!keeps.has(step)) return null
  if (l !== closestCalm) return { say: l.say, amber: undefined, says: [] }
  const pace = keeps.has('pace') && l.pace !== ''
  const reset = keeps.has('reset') && l.resetAtGlyph !== undefined
  return {
    say: l.sentence(pace, reset),
    amber: undefined,
    ...factsOf(read, l, [...(pace ? (['pace'] as const) : []), ...(reset ? (['reset'] as const) : [])]),
  }
}

/** The calm window closest to its limit, which says its pace and reset. */
const closestCalmOf = (read: Readings): LimitView | undefined =>
  [read.fiveHour, read.sevenDay]
    .filter((l): l is LimitView => l !== undefined && !l.passed && l.amber === undefined)
    .reduce<LimitView | undefined>((top, l) => (top === undefined || l.percentUsed > top.percentUsed ? l : top), undefined)

/** The readings in order, what needs you first. */
const partsOf = (read: Readings, keeps: Keeps<Piece>): Part[] => {
  const closestCalm = closestCalmOf(read)
  return amberFirst(
    [
      cachePart(read, keeps),
      keeps.has('cost') ? { say: read.spend.sentence, amber: undefined, says: [] } : null,
      contextPart(read, keeps),
      limitPart(read, read.fiveHour, 'calmFive', keeps, closestCalm),
      limitPart(read, read.sevenDay, 'calmSeven', keeps, closestCalm),
    ].filter((p): p is Part => p !== null),
  )
}

/** The sentence as one line of text, so it reads aloud and copies whole: a
 *  figure bold in value ink, every other word in label ink, a warning on its
 *  own ground. */
const sentence = (kit: Kit, parts: readonly Part[]): RenderElement => {
  const { Text, palette, oneLine } = kit
  return oneLine(
    {},
    parts.flatMap((part, i) => [
      i === 0 ? null : (
        <Text key={`sep${i}`} color={palette.label}>
          {BETWEEN_READINGS}
        </Text>
      ),
      ...part.say.map(([text, role], j) => (
        <Text
          key={`${i}:${j}`}
          color={palette[ROLE_INK[role]]}
          bold={role === 'value'}
          {...(role === 'amber' && palette.filled ? { backgroundColor: palette.amberBg } : {})}
        >
          {text}
        </Text>
      )),
    ]),
  )
}

/** The row fitted to its width, and the facts its sentence says. On the
 *  desktop the sentence sits on one pill's ground; a terminal grounds the
 *  whole row, toggle and all; plain draws it bare. */
const fitted = (
  kit: Kit,
  read: Readings,
  act: BandActions,
): Readonly<{ row: RenderElement; shown: readonly Fact[]; shownByWindow: Partial<Record<LimitKey, readonly Fact[]>> }> => {
  const { Box, Svg, palette } = kit
  const toggle = toggleButton(kit, read, act)
  let shown: readonly Fact[] = []
  let shownByWindow: Partial<Record<LimitKey, readonly Fact[]>> = {}
  const row = fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const parts = partsOf(read, keeps)
    // The line drawn is the last one built.
    shown = parts.flatMap(part => part.says)
    shownByWindow = Object.fromEntries(parts.flatMap(part => (part.window === undefined ? [] : [part.window])))
    return (
      <Box
        key="row"
        flexDirection="row"
        flexWrap="nowrap"
        overflow="hidden"
        columnGap={1}
        {...(palette.filled && !Svg ? { backgroundColor: palette.surface } : {})}
      >
        <Box key="sentence" flexShrink={1} minWidth={0} {...(Svg ? { backgroundColor: palette.surface, paddingX: 1 } : {})}>
          {sentence(kit, parts)}
        </Box>
        <Box flexGrow={1} />
        {toggle}
      </Box>
    )
  })
  return { row, shown, shownByWindow }
}

/** Fitted once, so the cards skip what that very row says. */
export const ledgerView = defineCardsView({ desktop: 1, terminal: 1 }, (kit, read, act) => {
  const { row, shown, shownByWindow } = fitted(kit, read, act)
  // Each window says its reset at its clock time, as the sentence does.
  return { lines: [row], open: () => ({ shown, shownByWindow, windowResets: 'clock', compactSplit: true }) }
})
