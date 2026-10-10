// Forecast, the band read like the weather: now, then each change ahead at
// its clock time, soonest first; behind ▿, an outlook row for each reading.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Icon } from '../icons'
import type { Kit } from '../kit'
import type { BarSize } from '../layout'
import type { CacheReading, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type CacheCondition, type Say } from '../words'
import { toggleButton } from './frame'
import { accentOf, amberWords, emptySay, fitLine, line, lineRoom, separatedBy, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last; `nextChange` is the narrow-width ruling's. Amber never does. */
const ORDER = ['farSeven', 'farChanges', 'inX', 'detail', 'nextChange'] as const
type Piece = (typeof ORDER)[number]

/** The most changes the line looks ahead to. */
const AHEAD = 3
/** A 7d reset is a change ahead only this close; format.ts' DAY_MS, which a
 *  view doesn't import. */
const DAY_MS = 24 * 3600_000

/** The weather each condition reads as; none before the cache is measured. */
const WEATHER: Readonly<Record<CacheCondition, Icon | undefined>> = {
  'not measured': undefined,
  warming: 'sun',
  warm: 'sun',
  cooling: 'cloud',
  cold: 'snow',
}

/** A column's detail row on the desktop: long until the squeeze shortens it. */
type Detail = Readonly<{ long: string; short: string }>

/** A change ahead: when it comes, what it is, and its detail. */
type Change = Readonly<{
  key: string
  inMs: number
  /** `14:32`, or for a fill `~14:20`; undefined while the offset is unknown. */
  clock: string | undefined
  /** `in 52m`, `in ~40m`. */
  soon: string
  label: string
  /** An amber change's short form, `! 5h ~40m`; none for a calm one. */
  amberShort: string | undefined
  seven: boolean
  /** None when another column already says it. */
  detail: Detail | undefined
}>

/** A limit's reset as a change ahead, when it comes within `withinMs`. */
const resetChange = (l: LimitView | undefined, withinMs = Infinity): Change[] =>
  l?.reset?.kind !== 'in' || l.resetInMs === undefined || l.resetInMs > withinMs
    ? []
    : [{
        key: `${l.name} resets`,
        inMs: l.resetInMs,
        clock: l.resetClock,
        soon: `in ${l.reset.text}`,
        label: `${l.name} resets`,
        amberShort: undefined,
        seven: l.key === '7d',
        detail: { long: `from ${l.value}`, short: l.value },
      }]

/** The changes ahead, soonest first: the cache going cold, a measured 5h
 *  fill, the 5h reset, and the 7d reset within a day. */
const changesOf = (read: Readings): Change[] => {
  const c = read.cache
  const f = read.fiveHour
  const cold: Change[] =
    c.coldInMs === undefined
      ? []
      : [{
          key: 'cold',
          inMs: c.coldInMs,
          clock: c.coldAtClock,
          soon: `in ${c.leftShort}`,
          label: 'cold',
          amberShort: undefined,
          seven: false,
          // In the last minute, now says the price.
          detail: c.amber === undefined ? { long: `re-warm ${c.estimate}`, short: c.estimate } : undefined,
        }]
  const fill: Change[] =
    f?.fullIn === undefined || f.etaMs === null
      ? []
      : [{
          key: 'full',
          inMs: f.etaMs,
          clock: f.fullAtClock,
          soon: `in ${f.fullIn}`,
          label: `! ${f.name} full`,
          amberShort: f.amber?.short,
          seven: false,
          detail: { long: 'at this pace', short: 'pace' },
        }]
  return [...cold, ...fill, ...resetChange(f), ...resetChange(read.sevenDay, DAY_MS)].sort((a, b) => a.inMs - b.inMs).slice(0, AHEAD)
}

/** Now's detail: the countdown, else what the next message costs, else how long the cache lasts. */
const nowDetailOf = (c: CacheReading): Detail => {
  if (c.amber !== undefined) return { long: `re-warm ${c.estimate}`, short: `re-warm ${c.estimate}` }
  if (c.left !== '') return { long: c.left, short: c.leftShort }
  if (c.reWarmText !== undefined) return { long: c.reWarmText, short: c.estimate }
  return { long: `lasts ${c.lastsText}`, short: c.lastsText }
}

/** The cache's last minute, as now says it: `! cooling · 47s left`, its price
 *  beneath, or with no detail row, after it; then the readings' short form. */
const lastMinute = (kit: Kit, c: CacheReading, amber: Amber): Amber => ({
  long: kit.Svg ? `! cooling · ${c.left}` : `! cooling · ${c.left} · re-warm ${c.estimate}`,
  short: amber.short,
})

/** A change's head: its time, with how far off when it is the next, then what it is. */
const changeHead = (kit: Kit, ch: Change, next: boolean, keeps: Keeps<Piece>): RenderElement => {
  const when = ch.clock === undefined ? ch.soon : next ? `${ch.clock} · ${ch.soon}` : ch.clock
  return ch.amberShort === undefined
    ? words(kit, 'head', [[`${when} · `, 'label'], [ch.label, 'value']])
    : amberWords(kit, 'head', { long: `${when} · ${ch.label}`, short: ch.amberShort }, keeps)
}

/** A column: on the desktop its head, beside any icon, over any detail; on the terminal, the head alone. */
const column = (kit: Kit, key: string, head: RenderElement, detail: string | undefined, icon: readonly RenderChildren[] = []): RenderElement => {
  const { Box, Svg } = kit
  return Svg ? (
    <Box key={key} flexDirection="column">
      <Box key="top" flexDirection="row">
        {icon}
        {head}
      </Box>
      {detail === undefined ? null : words(kit, 'detail', [[detail, 'label']])}
    </Box>
  ) : (
    head
  )
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Svg, icon, onTone, palette } = kit
  const c = read.cache
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  const changes = changesOf(read)
  const weather = WEATHER[c.condition]
  const nowIcon = Svg && weather !== undefined ? icon(weather, onTone(c.tone, palette.warm), c.alt) : []
  const nowCalm = words(kit, 'head', [['now · ', 'label'], [c.condition, 'value']])
  const nowDetail = nowDetailOf(c)
  const cooling = c.amber === undefined ? undefined : lastMinute(kit, c, c.amber)
  // No change ahead says these, so each says itself; a measured fill is a change.
  const triggers = [read.context.amber, read.fiveHour?.fullIn === undefined ? read.fiveHour?.amber : undefined, read.sevenDay?.amber].filter(
    (a): a is Amber => a !== undefined,
  )
  const separated = separatedBy(kit, '│', 6)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const detail = (d: Detail | undefined): string | undefined => (d === undefined ? undefined : keeps.has('detail') ? d.long : d.short)
      const head = cooling === undefined ? nowCalm : amberWords(kit, 'head', cooling, keeps)
      // An amber change never gives way; the next one only once the rest have.
      const ahead = changes.filter((ch, i) => ch.amberShort !== undefined || keeps.has(i === 0 ? 'nextChange' : ch.seven ? 'farSeven' : 'farChanges'))
      const pieces = [
        column(kit, 'now', head, detail(nowDetail), nowIcon),
        ...ahead.map(ch => column(kit, ch.key, changeHead(kit, ch, ch === changes[0] && keeps.has('inX'), keeps), detail(ch.detail))),
        ...triggers.map((a, i) => amberWords(kit, `amber${i}`, a, keeps)),
      ]
      return line(kit, 'line', separated(pieces), toggle, 1)
    }),
  ]
}

/** The name column's least width and the value column's, so every row's bar
 *  lines up; a longer limit name widens the name column for every row. */
const NAME_COLS = 8
const NOW_COLS = 13
const OUTLOOK: BarSize = { px: 200, cells: 20 }
/** The fewest columns an outcome keeps beside a bar. */
const OUTCOME_COLS = 20
const OUTLOOK_GAP = 2

/** An outlook row, and whether it needs you. */
type Outlook = Readonly<{ amber: boolean; row: RenderElement }>

/** The outlook behind ▿: a row per reading, its value now, a bar to where it
 *  lands, and the outcome in words; an amber row leads its outcome with why. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette } = kit
  const c = read.cache
  const x = read.context
  const s = read.spend
  const nameCols = Math.max(NAME_COLS, ...read.limits.map(l => l.name.length))
  // The bars take their column while the rows keep room for their outcomes.
  const barred = lineRoom(kit) >= nameCols + NOW_COLS + OUTLOOK.cells + OUTCOME_COLS + 3 * OUTLOOK_GAP
  const outlook = (
    key: string,
    name: string,
    now: string | Say,
    o: Readonly<{ tone?: Tone; bar?: RenderChildren; reason?: string; outcome?: ReadonlyArray<string | undefined> }> = {},
  ): Outlook => {
    const amber = o.tone === 'amber'
    // The reason leads, in amber; the rest follow it.
    const outcome: Say = [o.reason, ...(o.outcome ?? [])]
      .filter((t): t is string => t !== undefined && t !== '')
      .map((t, i) => [i === 0 ? t : ` · ${t}`, i === 0 && o.reason !== undefined ? 'amber' : 'label'])
    return {
      amber,
      row: (
        <Box key={key} flexDirection="row" columnGap={OUTLOOK_GAP}>
          <Box key="name" width={nameCols} flexShrink={0}>
            {words(kit, 'name', [[name, 'label']], true)}
          </Box>
          <Box key="now" width={NOW_COLS} flexShrink={0}>
            {words(kit, 'now', typeof now === 'string' ? [[now, amber ? 'amber' : 'value']] : now)}
          </Box>
          {barred ? (
            <Box key="bar" width={OUTLOOK.cells} flexShrink={0}>
              {o.bar ?? null}
            </Box>
          ) : null}
          {outcome.length === 0 ? null : words(kit, 'outcome', outcome)}
        </Box>
      ),
    }
  }
  const coldAt = c.coldInMs === undefined ? undefined : c.coldAtClock !== undefined ? `cold at ${c.coldAtClock}` : `cold in ${c.leftShort}`
  // Counting down, when it goes cold and what then; else what the next message costs.
  const cacheOutcome = coldAt === undefined ? (c.reWarmText ?? `lasts ${c.lastsText}`) : c.amber !== undefined ? coldAt : `${coldAt}, then re-warm ${c.estimate}`
  const limit = (l: LimitView): Outlook =>
    outlook(`limit ${l.name}`, l.name, l.valueText, {
      tone: l.tone,
      bar: l.passed
        ? undefined
        : meter(kit, { key: 'bar', label: l.name, frac: l.frac, tone: l.tone, accent: accentOf(kit, l), size: OUTLOOK, tick: l.gone, projectTo: l.projectedFrac }),
      reason: l.amber?.long,
      // A measured fill's reason says its pace.
      outcome: [l.fullIn === undefined ? l.pace : undefined, l.resetAtGlyph],
    })
  const rows: Outlook[] = [
    outlook('cache', 'Cache', c.left !== '' ? c.left : c.condition, {
      tone: c.tone,
      // A bar only while the timing is known: unmeasured is not 0% left.
      bar: c.known ? meter(kit, { key: 'bar', label: 'cache', frac: c.charge, tone: c.tone, accent: palette.warm, size: OUTLOOK, reads: 'left' }) : undefined,
      reason: c.amber?.long,
      outcome: [cacheOutcome, c.savedText === undefined || c.hitText === undefined ? undefined : `saved ${c.savedText}, ${c.hitText} hit rate`],
    }),
    x.known
      ? outlook('context', 'Context', x.valueText, {
          tone: x.tone,
          // With compaction on, it lands where it compacts.
          bar: meter(kit, { key: 'bar', label: 'context', frac: x.frac, tone: x.tone, accent: palette.meterFill, size: OUTLOOK, projectTo: x.compactsAtText === undefined ? undefined : 1 }),
          reason: x.amber?.long,
          // Toward compaction, how close and where; near it, the reason says how close.
          outcome:
            x.roomText === undefined || x.compactsAtText === undefined
              ? [`${x.inContextText} of a ${x.windowText} window`]
              : x.amber === undefined
                ? [`compacts in ${x.roomText}, at ${x.compactsAtText}`, `${x.inContextText} in context`]
                : [`${x.inContextText} in context, compacts at ${x.compactsAtText}`],
        })
      : outlook('context', 'Context', emptySay(EMPTY.context)),
    ...read.limits.filter(l => l.key !== 'other').map(limit),
    ...(read.limits.length === 0 ? [outlook('limits', 'Limits', emptySay(EMPTY.limits))] : []),
    outlook('spend', 'Spend', s.totalText, { outcome: [s.lastText === undefined ? undefined : `last ${s.lastText}`, `${s.tokensText} tokens: ${s.split.map(part => `${part.text} ${part.label}`).join(', ')}`] }),
    ...read.limits.filter(l => l.key === 'other').map(limit),
  ]
  // What needs you is kept first, so a body short of rows still says it.
  const kept = new Set([...rows.filter(r => r.amber), ...rows.filter(r => !r.amber)].slice(0, bodyRows))
  return rows.filter(r => kept.has(r)).map(r => r.row)
}

export const forecastView = defineView('forecast', { desktop: 2, terminal: 1 }, lines, body)
