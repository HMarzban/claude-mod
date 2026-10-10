// Departures, the band as a split-flap board. The cache is a flight that
// departs; its last minute is LAST CALL, said with its price and nothing
// more. The board speaks in capitals: it upper-cases whole phrases from the
// readings, its own style, and never takes one apart.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { CacheReading, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton, type Strip } from './frame'
import { beforeLast, fitLine, line, lineRoom, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last. Amber never does. */
const ORDER = ['fiveProjection', 'boardMinutes', 'calmSeven', 'calmFiveGroup', 'cost', 'calmFive'] as const
type Piece = (typeof ORDER)[number]

/** Each ink a flap is drawn in, made for the flap ground. */
const INK = { text: 'flapText', dim: 'flapDim', warm: 'flapWarm', amber: 'flapAmber', five: 'flapFive', week: 'flapWeek', coin: 'flapCoin' } as const
type Ink = keyof typeof INK

/** The board's fixed columns, ITEM, STATUS and TIME, in cells of text; REMARKS takes the rest. */
const COLUMNS = [10, 18, 14] as const

const up = (text: string): string => text.toUpperCase()

/** How far a flap's text sits in from its edge: its padding, on the filled
 *  desktop alone. On the terminal the 1-column gap between flaps shows the
 *  ground; plain has none, and brackets would cost the line the room a
 *  single amber reason needs at 40 columns. */
const inset = (kit: Kit): number => (kit.Svg === undefined ? 0 : 1)

/** One flap: the flap ground and an ink made for it. */
const flap = (kit: Kit, key: string, text: string, ink: Ink = 'text'): RenderElement => {
  const { Box, Text, palette } = kit
  return (
    <Box key={key} flexShrink={0} {...(palette.filled ? { backgroundColor: palette.flap, paddingX: inset(kit) } : {})}>
      <Text color={palette[INK[ink]]} bold wrap="truncate-end">
        {text}
      </Text>
    </Box>
  )
}

/** Flaps that read as one entry on the board. */
const group = (kit: Kit, key: string, flaps: readonly RenderChildren[]): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>
      {flaps}
    </Box>
  )
}

/** The cache's status: its board word, then the clock time it goes or went cold, when known. */
const cacheStatus = (c: CacheReading): string => {
  const clock = c.condition === 'cooling' ? undefined : (c.coldAtClock ?? c.coldSinceClock)
  return clock === undefined ? c.board : `${c.board} ${clock}`
}

/** Amber in its last minute, warm while it departs or boards, else quiet. */
const cacheInk = (c: CacheReading): Ink => (c.amber !== undefined ? 'amber' : c.condition === 'warm' ? 'warm' : 'dim')

/** A limit's ink: its window's accent, or the board's text for any other. */
const limitInk = (l: LimitView): Ink => (l.key === '5h' ? 'five' : l.key === '7d' ? 'week' : 'text')

/** A limit's flaps, built once: whole, without its calm projection, and as
 *  one flap; amber, its short reason for the amber step. */
const limitEntries = (kit: Kit, l: LimitView) => {
  const value = up(l.valueText)
  const name = flap(kit, 'name', up(l.name), limitInk(l))
  const valueFlap = flap(kit, 'value', value)
  const status = l.boardAmber !== undefined ? flap(kit, 'status', l.boardAmber, 'amber') : l.passed || l.boardShort === undefined ? null : flap(kit, 'status', l.boardShort, 'dim')
  return {
    whole: group(kit, l.name, [name, valueFlap, status]),
    bare: group(kit, l.name, [name, valueFlap, l.boardAmber === undefined ? null : status]),
    short: group(kit, l.name, [flap(kit, 'name', `${up(l.name)} ${value}`, limitInk(l))]),
    amberShort: l.amber === undefined ? undefined : flap(kit, l.name, l.amber.short, 'amber'),
  }
}
type LimitEntries = ReturnType<typeof limitEntries>

/** A limit on the line: amber, its board words until the amber step, then
 *  its short reason, which names the window; calm, what the squeeze keeps. */
const limitPiece = (e: LimitEntries, keeps: Keeps<Piece>, calm: RenderChildren): RenderChildren =>
  e.amberShort === undefined ? calm : beforeLast(keeps) ? e.bare : e.amberShort

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const c = read.cache
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  // Built once: the squeeze only chooses among them.
  const label = flap(kit, 'label', 'CACHE')
  const status = flap(kit, 'status', cacheStatus(c), cacheInk(c))
  const left = c.boardLeft === '' ? null : flap(kit, 'left', c.boardLeft, c.amber !== undefined ? 'amber' : 'text')
  const reWarm = c.condition === 'cooling' || c.condition === 'cold' ? flap(kit, 'reWarm', `RE-WARM ${up(c.estimate)}`, c.amber !== undefined ? 'amber' : 'text') : null
  const five = read.fiveHour === undefined ? undefined : limitEntries(kit, read.fiveHour)
  const seven = read.sevenDay === undefined ? undefined : limitEntries(kit, read.sevenDay)
  // The line shows no calm context, so its trigger gets a flap of its own.
  const context =
    x.boardAmber === undefined || x.amber === undefined
      ? undefined
      : { long: flap(kit, 'ctx', x.boardAmber, 'amber'), short: flap(kit, 'ctx', x.amber.short, 'amber') }
  const cost = flap(kit, 'cost', read.spend.totalText, 'coin')
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps =>
      line(
        kit,
        'line',
        [
          group(kit, 'cache', [
            label,
            status,
            // The minutes give way to the clock time alone; with no clock they
            // stay until the last calm step, so an amber reason still fits.
            // LAST CALL keeps its seconds.
            c.amber !== undefined || keeps.has(c.coldAtClock === undefined ? 'calmFive' : 'boardMinutes') ? left : null,
            c.amber === undefined || beforeLast(keeps) ? reWarm : null,
          ]),
          five === undefined
            ? null
            : limitPiece(five, keeps, !keeps.has('calmFive') ? null : !keeps.has('calmFiveGroup') ? five.short : keeps.has('fiveProjection') ? five.whole : five.bare),
          seven === undefined ? null : limitPiece(seven, keeps, keeps.has('calmSeven') ? seven.bare : null),
          context === undefined ? null : beforeLast(keeps) ? context.long : context.short,
          keeps.has('cost') ? cost : null,
        ],
        toggle,
        1,
      ),
    ),
  ]
}

/** A row of the board, and whether it is amber, so a board short of rows keeps it. */
type BoardRow = Readonly<{ amber: boolean; line: RenderElement }>

/** One board line: three fixed columns, each as wide as its text and a
 *  flap's two edges and clipping what outgrows that, then REMARKS, which
 *  truncates first. */
const boardLine = (kit: Kit, key: string, [item, status, time, remarks]: readonly [RenderElement, RenderElement, RenderElement, RenderElement]): RenderElement => {
  const { Box } = kit
  const edges = 2 * inset(kit)
  return (
    <Box key={key} flexDirection="row" columnGap={1} overflow="hidden">
      <Box key="item" width={COLUMNS[0] + edges} flexShrink={0} overflow="hidden">
        {item}
      </Box>
      <Box key="status" width={COLUMNS[1] + edges} flexShrink={0} overflow="hidden">
        {status}
      </Box>
      <Box key="time" width={COLUMNS[2] + edges} flexShrink={0} overflow="hidden">
        {time}
      </Box>
      <Box key="remarks" flexGrow={1} width={0} minWidth={0} overflow="hidden">
        {remarks}
      </Box>
    </Box>
  )
}

/** The rows a board of `room` rows keeps, in board order: calm rows go from
 *  the bottom first, and amber ones only once no calm row is left. */
const fitRows = (rows: readonly BoardRow[], room: number): RenderElement[] => {
  const calm = rows.filter(r => !r.amber).slice(0, Math.max(0, room - rows.filter(r => r.amber).length))
  return rows
    .filter(r => r.amber || calm.includes(r))
    .slice(0, room)
    .map(r => r.line)
}

/** The board behind ▿: a header, then CACHE, CONTEXT, the limits and SPEND. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const c = read.cache
  const x = read.context
  const s = read.spend
  const { Box } = kit
  // Each title sits over its column's text, as far in as a flap's.
  const head = (key: string, title: string) => (
    <Box key={key} paddingLeft={inset(kit)}>
      {words(kit, 'title', [[title, 'label']], true)}
    </Box>
  )
  /** A row of flaps; a time or remarks not known read `–`. */
  const row = (key: string, item: readonly [string, Ink?], status: readonly [string, Ink], time: string | undefined, remarks: readonly (string | undefined)[]): BoardRow => {
    const said = remarks.filter((r): r is string => r !== undefined && r !== '')
    return {
      amber: status[1] === 'amber',
      line: boardLine(kit, key, [
        flap(kit, 'item', ...item),
        flap(kit, 'status', ...status),
        flap(kit, 'time', time ?? '–'),
        flap(kit, 'remarks', said.length === 0 ? '–' : up(said.join(' · ')), 'dim'),
      ]),
    }
  }
  const limitRow = (l: LimitView): BoardRow => {
    const reset = l.resetClock === undefined ? l.resetGlyph : `↻ ${l.resetClock}`
    return row(
      l.name,
      [up(l.name), limitInk(l)],
      [l.boardAmber ?? l.boardShort ?? l.value, l.boardAmber !== undefined ? 'amber' : 'text'],
      reset === undefined ? undefined : up(reset),
      l.passed ? [] : [`${l.value} used`],
    )
  }
  const rows: BoardRow[] = [
    row('cache', ['CACHE'], [cacheStatus(c), cacheInk(c)], c.boardLeft === '' ? undefined : c.boardLeft, [
      c.known ? `re-warm ${c.estimate}` : undefined,
      c.savedText === undefined ? undefined : `saved ${c.savedText}`,
      c.hitText === undefined ? undefined : `${c.hitText} hit rate`,
    ]),
    x.known
      ? row('context', ['CONTEXT'], [x.boardAmber ?? x.valueText, x.boardAmber !== undefined ? 'amber' : 'text'], up(`${x.inContextText} of ${x.windowText}`), [
          x.towardText,
          x.compactsAtText === undefined ? x.compactionOffText : `compacts at ${x.compactsAtText}`,
          x.roomText === undefined ? undefined : `room ${x.roomText}`,
        ])
      : row('context', ['CONTEXT'], [up(EMPTY.context), 'dim'], undefined, []),
    ...(read.limits.length === 0 ? [row('limits', ['LIMITS'], [up(EMPTY.limits), 'dim'], undefined, [])] : read.limits.filter(l => l.key !== 'other').map(limitRow)),
    row('spend', ['SPEND'], [s.totalText, 'coin'], s.lastText === undefined ? undefined : `LAST ${s.lastText}`, [
      `${s.tokensText} tokens`,
      ...s.split.map(part => `${part.text} ${part.label}`),
    ]),
    ...read.limits.filter(l => l.key === 'other').map(limitRow),
  ]
  return [boardLine(kit, 'head', [head('item', 'ITEM'), head('status', 'STATUS'), head('time', 'TIME'), head('remarks', 'REMARKS')]), ...fitRows(rows, bodyRows - 1)]
}

/** Departures' own strip: the workspace on a flap, heading the board. */
const strip: Strip = (kit, read) => {
  const { Box } = kit
  return read.workspaceText === undefined ? null : (
    <Box key="board" flexGrow={1} width={0} minWidth={0} overflow="hidden">
      {flap(kit, 'workspace', read.workspaceText, 'dim')}
    </Box>
  )
}

export const departuresView = defineView('departures', { desktop: 1, terminal: 1 }, lines, body, strip)
