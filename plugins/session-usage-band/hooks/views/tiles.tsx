// Tiles, the band as type: a bold value over a small label, and on the
// desktop a thin underline beneath each but the cost's. No pills.

import type { RenderChildren, RenderElement } from 'claude-code'
import { UNDERLINE_PX, underline } from '../charts'
import type { Kit } from '../kit'
import { ROW_PX } from '../layout'
import type { CacheReading, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Role, type Say } from '../words'
import { toggleButton } from './frame'
import { accentOf, amberFirst, amberWords, beforeLast, fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last. Amber never does.
 *  Spec §6 ends at the context tile; at 40 columns an amber 5h or context
 *  tile fits only once the cost's has gone too. */
const ORDER = ['underline', 'resetText', 'calmSeven', 'calmContext', 'cost'] as const
type Piece = (typeof ORDER)[number]
/** An underline's length. */
const UNDER_PX = 64

/** A value over its label, and on the desktop its underline beneath. */
const stack = (kit: Kit, key: string, value: RenderElement, label: RenderElement, bar: RenderChildren): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="column" flexShrink={0}>
      {value}
      {label}
      {bar}
    </Box>
  )
}

/** The cache as a tile says it: the countdown alone while it counts, else its condition. */
const cacheValue = (c: CacheReading): string => (c.leftShort === '' ? c.value : c.leftShort)

/** A tile's value: bold, amber while its reading is. */
const valueOf = (kit: Kit, text: string, amber: Amber | undefined): RenderElement =>
  words(kit, 'v', [[text, amber !== undefined ? 'amber' : 'value']], true)

/** A tile's underline, amber while its reading is. */
const barOf = (kit: Kit, alt: string, frac: number, color: string, amber: Amber | undefined, dashed = false): RenderChildren =>
  underline(kit, { key: 'u', alt, frac, color: amber !== undefined ? kit.palette.amberFg : color, px: UNDER_PX, dashed })

/** A collapsed tile, built once: the squeeze picks its calm label, and
 *  whether a calm tile with a give-way step stays. */
type Tile = Readonly<{
  key: string
  value: RenderElement
  label: (keeps: Keeps<Piece>) => RenderElement
  bar: RenderChildren
  amber: Amber | undefined
  tone: Tone
  step?: Piece
}>

/** A tile at a squeeze: amber, its reason, its underline until the amber
 *  step; calm, its label, its underline until the first step. */
const drawTile = (kit: Kit, t: Tile, keeps: Keeps<Piece>): RenderChildren => {
  if (t.step !== undefined && !keeps.calm(t.step, t.tone)) return null
  return t.amber !== undefined
    ? stack(kit, t.key, t.value, amberWords(kit, 'l', t.amber, keeps), beforeLast(keeps) ? t.bar : null)
    : stack(kit, t.key, t.value, t.label(keeps), keeps.has('underline') ? t.bar : null)
}

/** A limit's name in its accent; a limit with none has the label's. */
const nameRole = (l: LimitView): Role => (l.key === '5h' ? 'accent5' : l.key === '7d' ? 'accent7' : 'label')

/** A limit's label: its name, then its reset when it has one. */
const limitLabel = (l: LimitView): Say =>
  l.resetGlyph === undefined ? [[l.name, nameRole(l)]] : [[l.name, nameRole(l)], [` ${l.resetGlyph}`, 'label']]

/** A limit's tile: its name in its accent, and its reset while the squeeze allows. */
const limitTile = (kit: Kit, l: LimitView, step?: Piece): Tile => {
  const named = words(kit, 'l', [[l.name, nameRole(l)]])
  const reset = words(kit, 'l', limitLabel(l))
  return {
    key: l.name,
    value: valueOf(kit, l.passed ? 'reset' : l.value, l.amber),
    label: keeps => (keeps.has('resetText') ? reset : named),
    bar: barOf(kit, l.alt, l.frac, accentOf(kit, l), l.amber),
    amber: l.amber,
    tone: l.tone,
    step,
  }
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  // Cold is a price, so its label names it.
  const cacheLabel = words(kit, 'l', [[c.condition === 'cold' && c.reWarmText !== undefined ? c.reWarmText : 'cache', 'label']])
  const contextLabel = words(kit, 'l', [['context', 'label']])
  const costLabel = words(kit, 'l', [['this session', 'label']])
  const cache: Tile = {
    key: 'cache',
    value: valueOf(kit, cacheValue(c), c.amber),
    label: () => cacheLabel,
    bar: barOf(kit, c.alt, c.charge, p.warm, c.amber),
    amber: c.amber,
    tone: c.tone,
  }
  const cost: Tile = { key: 'cost', value: valueOf(kit, read.spend.totalText, undefined), label: () => costLabel, bar: null, amber: undefined, tone: 'calm', step: 'cost' }
  // Unreported, the context has no tile; open, its group says so.
  const context: Tile | undefined = !x.known ? undefined : {
    key: 'ctx',
    value: valueOf(kit, x.valueText, x.amber),
    label: () => contextLabel,
    bar: barOf(kit, x.alt, x.frac, p.meterFill, x.amber),
    amber: x.amber,
    tone: x.tone,
    step: 'calmContext',
  }
  const five = read.fiveHour === undefined ? undefined : limitTile(kit, read.fiveHour)
  const seven = read.sevenDay === undefined ? undefined : limitTile(kit, read.sevenDay, 'calmSeven')
  const tiles = [cache, cost, context, five, seven].filter((t): t is Tile => t !== undefined)
  return [fitLine(kit, ORDER, lineRoom(kit), keeps => line(kit, 'line', tiles.map(t => drawTile(kit, t, keeps)), toggle, 3))]
}

/** A reading's headline, where a group has no row for its tiles: its reason while amber. */
const headOf = (text: string, amber: Amber | undefined): Say[number] => (amber !== undefined ? [amber.long, 'amber'] : [text, 'value'])

/** Tiles side by side, one row of a group; nothing when none is known. */
const pair = (kit: Kit, key: string, tiles: readonly RenderChildren[]): RenderChildren => {
  const { Box } = kit
  const drawn = tiles.filter(t => t !== null)
  return drawn.length === 0 ? null : (
    <Box key={key} flexDirection="row" columnGap={2}>
      {drawn}
    </Box>
  )
}

/** The facts behind ▿: four groups of tiles, two by two. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const s = read.spend
  // What needs you leads, so a group short of rows keeps it.
  const limits = amberFirst(read.limits)
  const room = gridRoom(kit, bodyRows)
  // A pair is two lines tall: a group holds as many as fit under its title,
  // and short of one, says its headline in a line. A desktop pair's
  // underlines add 4 px, so they go first: they stay while the deepest
  // group's pairs fit its room with them. Only the limits hold more than two.
  const pairs = Math.floor(room / 2)
  const deepest = Math.min(pairs, Math.max(2, read.limits.length))
  const barred = deepest * (2 * ROW_PX + UNDERLINE_PX) <= room * ROW_PX
  /** A tile, or nothing while its value is unknown; amber, its label is the
   *  reason, then what it `keeps`. */
  const tile = (key: string, value: string | undefined, label: string | Say, bar: RenderChildren = null, amber?: Amber, keeps: Say = []): RenderChildren => {
    if (value === undefined) return null
    const said: Say = amber !== undefined ? [[amber.long, 'amber'], ...keeps] : typeof label === 'string' ? [[label, 'label']] : label
    return stack(kit, key, valueOf(kit, value, amber), words(kit, 'l', said), barred ? bar : null)
  }
  const group = (key: string, title: string, rows: readonly RenderChildren[], headline: Say): RenderElement =>
    section(kit, key, title, pairs > 0 ? rows : [words(kit, 'head', headline)], pairs > 0 ? pairs : room)
  /** A group with nothing known: its empty words, in a line either way. */
  const emptyGroup = (key: string, title: string, text: string): RenderElement => {
    const said: Say = [[text, 'label']]
    return group(key, title, [words(kit, 'none', said)], said)
  }
  return grid(kit, [
    group('cache', 'CACHE', [
      pair(kit, 'a', [
        tile('left', cacheValue(c), c.leftShort === '' ? 'cache' : 'left', barOf(kit, c.alt, c.charge, p.warm, c.amber), c.amber),
        tile('reWarm', c.known ? c.estimate : undefined, c.condition === 'cold' ? 'next message' : 're-warm if cold'),
      ]),
      pair(kit, 'b', [tile('saved', c.savedText, 'saved'), tile('hit', c.hitText, 'hit rate')]),
    ], [headOf(c.text, c.amber)]),
    group('spend', 'SPEND', [
      pair(kit, 'a', [tile('total', s.totalText, 'this session'), tile('last', s.lastText, 'last message')]),
      pair(kit, 'b', [tile('tokens', s.tokensText, 'tokens'), tile('reads', s.split.find(part => part.label === 'cache reads')?.text, 'cache reads')]),
    ], [[`${s.totalText} this session`, 'value']]),
    !x.known ? emptyGroup('context', 'CONTEXT', EMPTY.context) : group('context', 'CONTEXT', [
      pair(kit, 'a', [
        tile('pct', x.valueText, x.towardText, barOf(kit, x.alt, x.frac, p.meterFill, x.amber), x.amber),
        tile('in', x.inContextText, 'in context'),
      ]),
      pair(kit, 'b', [tile('room', x.roomText, 'room left'), tile('window', x.windowText, 'window')]),
    ], [headOf(x.text, x.amber)]),
    limits.length === 0 ? emptyGroup('limits', 'LIMITS', EMPTY.limits) : group('limits', 'LIMITS', limits.map(l => {
      // The landing's dashed underline, drawn where the landing has a figure.
      const landingBar = l.projectedAlt === undefined || l.projectedFrac === undefined ? null : barOf(kit, l.projectedAlt, l.projectedFrac, accentOf(kit, l), undefined, true)
      return pair(kit, l.name, [
        // Amber, a limit still says when it resets.
        tile('now', l.passed ? 'reset' : l.value, limitLabel(l), barOf(kit, l.alt, l.frac, accentOf(kit, l), l.amber), l.amber, l.resetGlyph === undefined ? [] : [[` ${l.resetGlyph}`, 'label']]),
        l.projectedText !== undefined
          ? tile('then', l.projectedText, `${l.name} at its reset`, landingBar)
          : // A landing past the top has no figure: its pace says it fills first,
            // unless the reason is a measured fill, which says it.
            tile('then', l.fullIn === undefined && l.pace !== '' ? l.pace : undefined, `${l.name} at this pace`),
      ])
    }), limits.flatMap((l, i): Say => (i === 0 ? [headOf(l.text, l.amber)] : [[' · ', 'label'], headOf(l.text, l.amber)]))),
  ], bodyRows)
}

export const tilesView = defineView('tiles', { desktop: 2, terminal: 2 }, lines, body)
