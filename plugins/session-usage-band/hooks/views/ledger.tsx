// Ledger, the band in plain words: one sentence, each reading named and bold
// on its figure alone, `│` between readings and `·` within one, what needs
// you moved to the front. Behind ▵, the shared cards, with no lens: none
// repeats a fact the sentence says.

import type { RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { Amber, Say } from '../words'
import { cardsView, type Fact } from './cards'
import { toggleButton } from './frame'
import { ROLE_INK, amberFirst, amberSay, beforeLast, fitLine, type Keeps } from './parts'
import { rowsOf, type View } from './view'

/** What gives way as the row narrows, first to last: the closest limit's ↻
 *  clock and pace words, the calm readings, then the cold cache's long
 *  words. Amber never does. */
const ORDER = ['reset', 'pace', 'calmSeven', 'calmContext', 'cost', 'calmFive', 'cacheWords'] as const
type Piece = (typeof ORDER)[number]

/** A reading in the sentence: its words, its warning if it has one, and the
 *  card facts its words say, which the cards then skip. */
type Part = Readonly<{ say: Say; amber: Amber | undefined; says: readonly Fact[] }>

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

/** A limit: its warning, or its value; the closest, LIMITS' headline, adds
 *  the pace and the reset LIMITS' lead row would say. */
const limitPart = (read: Readings, l: LimitView | undefined, step: Piece, keeps: Keeps<Piece>): Part | null => {
  if (l === undefined) return null
  const closest = l === read.worstLimit
  if (l.amber !== undefined) return warning(l.amber, keeps, closest && l.fullIn !== undefined ? ['pace'] : [])
  if (!keeps.has(step)) return null
  if (!closest) return { say: l.say, amber: undefined, says: [] }
  const pace = keeps.has('pace') && l.pace !== '' ? l.pace : undefined
  const reset = keeps.has('reset') ? l.resetAtGlyph : undefined
  const tail = [pace, reset].filter((t): t is string => t !== undefined)
  return {
    say: [...l.say, ...tail.map((t): Say[number] => [` · ${t}`, 'label'])],
    amber: undefined,
    says: [...(pace === undefined ? [] : (['pace'] as const)), ...(reset === undefined ? [] : (['reset'] as const))],
  }
}

/** The readings in order, what needs you first. */
const partsOf = (read: Readings, keeps: Keeps<Piece>): Part[] =>
  amberFirst(
    [
      cachePart(read, keeps),
      keeps.has('cost') ? { say: read.spend.sentence, amber: undefined, says: [] } : null,
      contextPart(read, keeps),
      limitPart(read, read.fiveHour, 'calmFive', keeps),
      limitPart(read, read.sevenDay, 'calmSeven', keeps),
    ].filter((p): p is Part => p !== null),
  )

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
          {' │ '}
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
 *  desktop the sentence sits on one pill's ground; a terminal draws it bare,
 *  on the band's own. */
const fitted = (kit: Kit, read: Readings, act: BandActions): Readonly<{ row: RenderElement; shown: readonly Fact[] }> => {
  const { Box, Svg, palette } = kit
  const toggle = toggleButton(kit, read, act)
  let shown: readonly Fact[] = []
  const row = fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const parts = partsOf(read, keeps)
    // The line drawn is the last one built.
    shown = parts.flatMap(part => part.says)
    return (
      <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
        <Box key="sentence" flexShrink={1} minWidth={0} {...(Svg ? { backgroundColor: palette.surface, paddingX: 1 } : {})}>
          {sentence(kit, parts)}
        </Box>
        <Box flexGrow={1} />
        {toggle}
      </Box>
    )
  })
  return { row, shown }
}

/** Fitted once, so the cards skip what that very row says. */
export const ledgerView: View = {
  name: 'ledger',
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { row, shown } = fitted(kit, read, act)
    // Each window says its reset at its clock time, as the sentence does.
    return cardsView(kit, read, act, [row], { shown, windowResets: 'clock', collapsedRows: rowsOf(ledgerView, kit) })
  },
}
