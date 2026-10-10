// Rings: a small ring per reading, its value over its label beside it; on a
// limit, a dot marks how much of the window has gone. The terminal draws a
// meter, the value and the label on one line.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, ring } from '../charts'
import type { Kit } from '../kit'
import type { CacheReading, ContextReading, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber } from '../words'
import { toggleButton } from './frame'
import { accentOf, amberFirst, amberSay, beforeLast, chartsIfRoom, empty, fact, fitLine, grid, gridRoom, limitSentence, line, lineRoom, section, words, type Keeps, type SentenceStyle } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last; `marks` and
 *  `calmFive` are the narrow-width ruling's. Amber never does. */
const ORDER = ['labelsLong', 'resetText', 'calmSeven', 'cost', 'calmContext', 'marks', 'calmFive'] as const
type Piece = (typeof ORDER)[number]
/** The collapsed ring, within spec §3.1's 22–30 px, and the expanded one. */
const RING_PX = 26
const BIG_PX = 64

const cacheRing = (kit: Kit, c: CacheReading, px: number, centre?: string): RenderChildren =>
  ring(kit, { key: 'ring', alt: c.alt, frac: c.charge, color: kit.onTone(c.tone, kit.palette.warm), px, centre })

const contextRing = (kit: Kit, x: ContextReading, px: number, centre?: string): RenderChildren =>
  ring(kit, { key: 'ring', alt: x.alt, frac: x.frac, color: kit.onTone(x.tone, kit.palette.meterFill), px, centre })

/** A limit's ring in its window's accent, with a dot where the window has gone to. */
const limitRing = (kit: Kit, l: LimitView, px: number, centre?: string): RenderChildren =>
  ring(kit, { key: l.name, alt: l.alt, frac: l.frac, color: kit.onTone(l.tone, accentOf(kit, l)), px, centre, dot: l.gone })

/** A reading as the collapsed line draws it: its ring and value, built once;
 *  its label, chosen by the squeeze; and the step it gives way at, if any. */
type Figure = Readonly<{
  key: string
  tone: Tone
  amber: Amber | undefined
  ring: RenderChildren
  value: RenderElement
  label: (keeps: Keeps<Piece>) => string
  step?: Piece
}>

/** A figure's value: bold, and amber while its reading is. */
const valueWords = (kit: Kit, text: string, tone: Tone): RenderElement => words(kit, 'value', [[text, tone === 'amber' ? 'amber' : 'value']], true)

/** A figure at a squeeze: amber, its label is its reason, and its ring stays
 *  until the amber step; calm, its ring gives way at `marks`. */
const drawFigure = (kit: Kit, f: Figure, keeps: Keeps<Piece>): RenderElement => {
  const { Box, Svg } = kit
  const label = words(kit, 'label', f.amber !== undefined ? amberSay(f.amber, keeps) : [[f.label(keeps), 'label']])
  const ringKept = f.amber !== undefined ? beforeLast(keeps) : keeps.has('marks')
  return (
    <Box key={f.key} flexDirection="row" columnGap={1} alignItems="center">
      {ringKept ? f.ring : null}
      {/* The desktop puts the value over its label; text surfaces, side by side. */}
      <Box key="said" {...(Svg ? { flexDirection: 'column' as const } : { flexDirection: 'row' as const, columnGap: 1 })}>
        {f.value}
        {label}
      </Box>
    </Box>
  )
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const c = read.cache
  const x = read.context
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  // Long, the cache's label names its condition, unless its value already does
  // (warming, or warm with no countdown); cold, the price to re-warm it.
  const valueNamesCondition = c.condition === 'warming' || (c.condition === 'warm' && c.leftShort === '')
  const cacheLong = c.condition === 'cold' ? `re-warm ${c.estimate}` : valueNamesCondition ? 'cache' : `cache ${c.condition}`
  const cache: Figure = {
    key: 'cache',
    tone: c.tone,
    amber: c.amber,
    ring: cacheRing(kit, c, RING_PX),
    value: valueWords(kit, c.leftShort === '' ? c.value : c.leftShort, c.tone),
    label: keeps => (keeps.has('labelsLong') ? cacheLong : 'cache'),
  }
  // Unreported, the context says nothing collapsed; open, its section says so.
  const context: Figure | undefined = !x.known ? undefined : {
    key: 'ctx',
    tone: x.tone,
    amber: x.amber,
    ring: contextRing(kit, x, RING_PX),
    value: valueWords(kit, x.valueText, x.tone),
    label: keeps => (keeps.has('labelsLong') ? 'context' : 'ctx'),
    step: 'calmContext',
  }
  const limit = (l: LimitView | undefined, step: Piece): Figure | undefined => l === undefined ? undefined : {
    key: l.name,
    tone: l.tone,
    amber: l.amber,
    ring: limitRing(kit, l, RING_PX),
    value: valueWords(kit, l.valueText, l.tone),
    // The reset is its own step: it gives way after the long labels, whatever they say.
    label: keeps => {
      const name = keeps.has('labelsLong') ? `${l.name} limit` : l.name
      return keeps.has('resetText') && l.resetGlyph !== undefined ? `${name} ${l.resetGlyph}` : name
    },
    step,
  }
  const cost: Figure = {
    key: 'cost',
    tone: 'calm',
    amber: undefined,
    ring: null,
    value: valueWords(kit, read.spend.totalText, 'calm'),
    label: () => 'this session',
    step: 'cost',
  }
  const figures = [cache, context, limit(read.fiveHour, 'calmFive'), limit(read.sevenDay, 'calmSeven'), cost].filter((f): f is Figure => f !== undefined)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps =>
      line(kit, 'line', figures.map(f => (f.step === undefined || keeps.calm(f.step, f.tone) ? drawFigure(kit, f, keeps) : null)), toggle),
    ),
  ]
}

/** A limit as a row of its panel: `5h 4% · ↻ in 3h 00m · on pace for ~10%`. */
const SENTENCE: SentenceStyle = { lead: 'say', reset: 'resetGlyph', sep: ' · ' }

/** The facts behind ▿: four panels, each with its big ring and its facts. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, Svg, palette: p } = kit
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  // A 64 px ring takes three rows on the desktop, one meter line elsewhere.
  const ringRows = Svg ? 3 : 1
  const none = (text: string) => words(kit, 'none', empty(text))
  const windows = [read.fiveHour, read.sevenDay].filter((l): l is LimitView => l !== undefined)
  // The donut is drawn as its split bar, a meter per part in spec §2.10's
  // inks (§3.1). A ring draws one window, so 5h and 7d stand side by side.
  const splitInks = [p.meterFill, p.label, p.value] as const
  const limitRings = windows.length === 0 ? null : (
    <Box key="rings" flexDirection="row" columnGap={1}>
      {/* Passed, the ring draws no figure: `reset` overruns its hole, and the row says it. */}
      {windows.map(l => limitRing(kit, l, BIG_PX, l.passed ? undefined : l.value))}
    </Box>
  )
  return grid(kit, [
    section(kit, 'cache', 'CACHE', chartsIfRoom(room, [cacheRing(kit, c, BIG_PX, c.leftShort === '' ? undefined : c.leftShort)], [
      words(kit, 'now', [[c.value, 'value']]),
      c.reWarmText === undefined ? null : words(kit, 'reWarm', [[c.reWarmText, 'value']]),
      fact(kit, 'saved', 'saved', c.savedText),
      fact(kit, 'hit', 'hit rate', c.hitText),
      fact(kit, 'lasts', 'lasts', c.lastsText),
    ], ringRows), room),
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, s.split.map((part, i) => meter(kit, { key: `split${i}`, label: part.label, frac: part.frac, tone: 'calm', accent: splitInks[i] ?? p.meterFill, reads: 'share' })), [
      fact(kit, 'total', 'session', s.totalText),
      fact(kit, 'last', 'last message', s.lastText),
      ...s.split.map(part => fact(kit, part.label, part.label, part.text)),
    ]), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : chartsIfRoom(room, [contextRing(kit, x, BIG_PX, x.valueText)], [
      words(kit, 'pct', [[`${x.valueText} ${x.towardText}`, 'value']]),
      fact(kit, 'in', 'in context', x.inContextText),
      fact(kit, 'at', 'compacts at', x.compactsAtText),
      fact(kit, 'room', 'room', x.roomText),
    ], ringRows), room),
    // What needs you leads, so a panel short of rows keeps it.
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [none(EMPTY.limits)] : chartsIfRoom(room, [limitRings], [
      ...amberFirst(read.limits).map(l => limitSentence(kit, l, SENTENCE)),
    ], ringRows), room),
  ], bodyRows)
}

export const ringsView = defineView('rings', { desktop: 2, terminal: 1 }, lines, body)
