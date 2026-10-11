// Rings: chips' pills, each led by a 16 px ring where its reading has a cap,
// its figure before its label: the cache drains, the context, 5h and 7d fill.
// An amber reading says its reason in place of its ring.
// A limit's ring notches the time gone and dashes its projection; the
// terminal draws each ring as a glyph. Open, the shared cards, each card's
// own ring in its head.

import type { RenderChildren, RenderElement } from 'claude-code'
import { ring } from '../charts'
import type { Kit } from '../kit'
import { GIVES_WAY, ROW_SLACK, keeps, squeezed } from '../layout'
import type { CacheReading, ContextReading, LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { PILL_LABELS } from '../words'
import type { AmberSay, PillLabel, Say } from '../words'
import type { Fact, Slots } from './cards'
import { chipsPills, pillRow, shortAt } from './chips'
import { ROLE_INK, accentOf } from './parts'
import type { PillSpec } from './parts'
import { defineCardsView, type Lens } from './view'

/** Every ring, in a pill and in a card's head, at most a lens slot's 16 px. */
const RING_PX = 16

/** Where a ring sits: in a pill, on its ground with air after it; in a card's head, neither. */
type Place = Readonly<{ ground?: string; air?: boolean }>

/** The cache's ring, drained in the warm ink, empty in the cold one once cold. */
const cacheRing = (kit: Kit, c: CacheReading, place: Place = {}): RenderChildren =>
  ring(kit, { key: 'ring:cache', alt: c.alt, frac: c.charge, color: kit.onTone(c.tone, c.mood === 'cold' ? kit.palette.cold : kit.palette.warm), px: RING_PX, ...place })

const contextRing = (kit: Kit, x: ContextReading, place: Place = {}): RenderChildren =>
  ring(kit, { key: 'ring:context', alt: x.alt, frac: x.frac, color: kit.onTone(x.tone, kit.palette.meterFill), px: RING_PX, ...place })

/** A window's ring in its accent, notched where its window has gone to and
 *  dashed to where it is heading; empty once it has reset. */
const limitRing = (kit: Kit, l: LimitView, place: Place = {}): RenderChildren =>
  ring(kit, {
    key: `ring:${l.name}`,
    alt: l.alt,
    frac: l.passed ? 0 : l.frac,
    color: kit.onTone(l.tone, accentOf(kit, l)),
    px: RING_PX,
    notch: l.gone,
    projectTo: l.projectedFrac,
    ...place,
  })

/** What a window's pill says after its figure at a squeeze: its pace, unless
 *  an amber reason already says it, then its reset, each while kept. The 5h
 *  counts down to its reset; the 7d names its day and time once known. */
const limitTail = (l: LimitView, squeeze: number): Readonly<{ pace: string; reset: string | undefined }> => {
  const five = l.key === '5h'
  const step = l.tone === 'amber' ? (five ? 'amberFiveReset' : 'amberWeekReset') : five ? 'fiveReset' : 'weekReset'
  const r = l.reset
  if (!keeps(squeeze, step) || r?.kind !== 'in') return { pace: '', reset: undefined }
  return { pace: l.fullIn === undefined ? l.pace : '', reset: l.key === '7d' ? (l.resetClock ?? r.text) : r.text }
}

/** Rings' pills at a squeeze: chips' own, keeping their keys, tints, tones,
 *  hovers and give-way, each with its ring and figure in place of chips'
 *  icon and words. Amber, a reading says its reason, bold on its figure, and
 *  its words stand for its ring; a cold cache, its re-warm price; calm, its
 *  figure in bold, then its label, short once `longLabels` gives way. */
const ringsPills = (kit: Kit, read: Readings, squeeze: number): PillSpec[] => {
  const { Text, palette, onTone, icon } = kit
  const longLabels = keeps(squeeze, 'longLabels')
  const figure = (text: string, color: string) => (
    <Text key="v" color={color} bold>
      {text}
    </Text>
  )
  const label = (l: PillLabel) => {
    const text = longLabels ? l.long : l.short
    return text === '' ? null : <Text key="l" color={palette.label}>{` ${text}`}</Text>
  }
  /** A phrase in its segments, bold on its figure; amber, all in amber. */
  const said = (say: Say, tone: Tone) =>
    say.map(([text, role], i) => (
      <Text key={`say${i}`} color={tone === 'amber' ? palette.amberFg : palette[ROLE_INK[role]]} bold={role === 'value'}>
        {text}
      </Text>
    ))
  // An amber reason shortens as chips' wording does: last of all.
  const amber = (a: AmberSay) => said(shortAt(kit, squeeze) ? a.sayShort : a.say, 'amber')
  const c = read.cache
  const x = read.context
  const bodyOf = (spec: PillSpec): RenderChildren[] => {
    // A pill's ring sits on its ground, as pill() paints it.
    const place: Place = { ground: onTone(spec.tone, spec.bg ?? palette.surface, palette.amberBg), air: true }
    switch (spec.key) {
      case 'cache':
        if (c.amber !== undefined) return amber(c.amber)
        return [
          keeps(squeeze, 'cacheRing') ? cacheRing(kit, c, place) : null,
          ...(c.mood === 'cold' ? said(c.sayShort, 'calm') : [figure(c.leftShort === '' ? c.value : c.leftShort, palette.value), label(PILL_LABELS.cache)]),
        ]
      case 'cost':
        return [figure(read.spend.totalText, palette.value), label(PILL_LABELS.spend)]
      case 'ctx':
        if (x.amber !== undefined) return amber(x.amber)
        return [keeps(squeeze, 'contextMeter') ? contextRing(kit, x, place) : null, figure(x.valueText, palette.value), label(PILL_LABELS.context)]
      case 'tokens':
        return [figure(read.spend.tokensText, palette.value), label(PILL_LABELS.tokens)]
    }
    const l = spec.key === '5h' ? read.fiveHour : read.sevenDay
    if (l === undefined) return spec.body
    // Rings' window name and figure take the pill's fg, as chips' do: the
    // board's name in its accent and figure in value ink is left to both.
    const fg = onTone(l.tone, l.key === '5h' ? palette.fiveFg : palette.weekFg)
    const mark = l.amber === undefined && keeps(squeeze, 'limitBars') ? limitRing(kit, l, place) : null
    if (l.passed) return [mark, <Text key="l" color={fg}>{l.text}</Text>]
    const { pace, reset } = limitTail(l, squeeze)
    // The pace and the reset are qualifiers, in label ink.
    const ink = onTone(l.tone, palette.label)
    return [
      mark,
      ...(l.amber ? amber(l.amber) : [figure(l.valueMarked, fg), <Text key="l" color={fg}>{` ${l.name}`}</Text>]),
      pace === '' ? null : <Text key="p" color={ink}>{` │ ${pace}`}</Text>,
      ...(reset === undefined ? [] : [<Text key="d" color={palette.label}>{' │ '}</Text>, ...icon('reset', ink), <Text key="r" color={ink}>{reset}</Text>]),
    ]
  }
  // Chips' terminal cache is a battery painting its own ground; rings' is a pill, its ring the battery.
  return chipsPills(kit, read, squeeze).map(spec => ({ ...spec, body: bodyOf(spec), paintsOwnBg: false }))
}

type Fitted = Readonly<{ row: RenderElement; squeeze: number; pills: readonly PillSpec[] }>

/** Rings' row squeezed until it fits, as chips' is, with the squeeze and the pills it fits at. */
const fit = (kit: Kit, read: Readings, act: BandActions): Fitted => {
  // The last pills built are those of the row that fits.
  let pills: readonly PillSpec[] = []
  const { line, squeeze } = squeezed(s => pillRow(kit, read, act, (pills = ringsPills(kit, read, s))), GIVES_WAY.length, kit.columns - ROW_SLACK, kit.measure)
  return { row: line, squeeze, pills }
}

/** Each draw's row as fitted, so the lens reads its squeeze rather than fit
 *  the row again: a draw's readings are its own. */
const FITTED = new WeakMap<Readings, Fitted>()

/** Actions set what a press does, never a width: a lens drawn without its row fits it without them. */
const MEASURING: BandActions = { toggleExpanded: async () => undefined, hide: async () => undefined }

/** What the row says at a squeeze that a card would: the worst window's reset
 *  and pace, an amber cache's price, an amber context's room. */
const shownAt = (kit: Kit, read: Readings, squeeze: number, pills: readonly PillSpec[]): Fact[] => {
  const drawn = new Set(pills.map(spec => spec.key))
  const long = !shortAt(kit, squeeze)
  const worst = read.worstLimit
  const tail = worst !== undefined && drawn.has(worst.key) ? limitTail(worst, squeeze) : undefined
  const facts: Fact[] = []
  if (tail?.reset !== undefined) facts.push('reset')
  // An amber reason with a measured fill says the pace itself, kept or not.
  if (tail !== undefined && (tail.pace !== '' || (worst?.amber !== undefined && worst.fullIn !== undefined))) facts.push('pace')
  // A cold cache's price is on the row at every width.
  if (read.cache.mood === 'cold' || (read.cache.amber !== undefined && long)) facts.push('reWarm')
  if (read.context.amber !== undefined && long && drawn.has('ctx') && read.context.roomText !== undefined) facts.push('room')
  return facts
}

/** Each card's own ring in its head, at its end beside the headline; the
 *  spend has no cap, so no ring. */
const slotsOf = (kit: Kit, read: Readings): Slots => {
  const { Box } = kit
  const windows = [read.fiveHour, read.sevenDay].filter(l => l !== undefined)
  const atEnd = (rings: RenderChildren[]) => (
    <Box flexGrow={1} flexDirection="row" justifyContent="flex-end" columnGap={1}>
      {rings}
    </Box>
  )
  return {
    cache: atEnd([cacheRing(kit, read.cache)]),
    ...(read.context.known ? { context: atEnd([contextRing(kit, read.context)]) } : {}),
    ...(windows.length > 0 ? { limits: atEnd(windows.map(l => limitRing(kit, l))) } : {}),
  }
}

/** Open, each card's ring and what the row already says; shut, no card is
 *  drawn, so the row isn't fitted twice. */
const lens: Lens = (kit, read) => {
  if (!read.frame.expanded) return {}
  const { squeeze, pills } = FITTED.get(read) ?? fit(kit, read, MEASURING)
  return { slots: slotsOf(kit, read), shown: shownAt(kit, read, squeeze, pills) }
}

/** The row, fitted once a draw: the lens, drawn after it, reads its fit. */
const rows = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const fitted = fit(kit, read, act)
  FITTED.set(read, fitted)
  return [fitted.row]
}

export const ringsView = defineCardsView('rings', { desktop: 1, terminal: 1 }, rows, lens)
