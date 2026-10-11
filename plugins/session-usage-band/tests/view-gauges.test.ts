// Gauges, as its board draws it: four bars on one scale in a 2×2 grid, the
// conversation's cache and context above the 5h and 7d limits, the cost and
// the toggle at the end; how the grid gives way as it narrows; and the shared
// cards behind ▵, each with its bar in its head and none repeating the row.

import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { gaugesView } from '../hooks/views/gauges'
import { HOUR, MIN, byKey, cardOf, fakeEl, firstRow, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite } from './matrix'

viewSuite('gauges')

/** Gauges drawn outside a mount: calm, at 160 terminal columns, the zone UTC. */
const draw = (over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ layout: 'gauges', columns: 160, utcOffsetMin: 0, ...over })
  return gaugesView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT) as unknown as Node
}
const rowOf = (over: Partial<BandSnapshot> = {}): Node => firstRow(draw(over)) as Node
const pillText = (over: Partial<BandSnapshot>, key: string): string => shown(byKey(rowOf(over), key, 'Box'))
/** The grid's columns, top to bottom: each piece's key, the toggle's `more`. */
const columnsOf = (row: Node): unknown[][] =>
  ((row.children ?? []) as Node[]).map(col => ((col.children ?? []) as Node[]).filter(Boolean).map(k => k.props?.key ?? byKey(k, 'more', 'Button')?.props?.key))
const boldOf = (n: unknown): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}
/** A card's body rows, past its head. */
const bodyOf = (tree: Node, name: string): Node[] => ((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean).slice(1)
/** A card's first body row, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(bodyOf(tree, name)[0])
/** Whether a row draws a bar: an Svg, or a run of a bar's glyphs. */
const isBar = (row: Node | undefined): boolean => svgsOf(row).length > 0 || /[█▓▒░│]{4}/.test(shown(row))
const desktop = (over: Partial<BandSnapshot> = {}): Partial<BandSnapshot> => ({ surface: 'desktop', columns: 95, ...over })
const LAST_MINUTE = { cache: { ...snapOf().cache, msLeft: 30_000 } }
const NEAR_COMPACTION = { context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } }
const FIVE_AHEAD = { fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } }

test('collapsed, a 2×2 grid: the cache and 5h, the context and 7d, then air, the cost and the toggle', () => {
  expect(columnsOf(rowOf())).toEqual([['cache', '5h'], ['ctx', '7d'], [], ['cost', 'more']])
  expect(columnsOf(rowOf({ surface: 'desktop' }))).toEqual([['cache', '5h'], ['ctx', '7d'], [], ['cost', 'more']])
})
test('at 160 terminal columns every gauge says its name, its bar, its figure and all that qualifies it', () => {
  // A gauge's pieces are spaced by its row's gap, which draws no text.
  expect(pillText({}, 'cache')).toBe(`cache${' '.repeat(12)}52m left · re-warm ~$1.66`)
  expect(pillText({}, 'ctx')).toBe('context█████░░░░░░░40% full · ~114k left')
  expect(pillText({}, '5h')).toBe('5h▒░░░│░░░░░░░4% · on pace for ~10% · ↻ 03:00')
  expect(pillText({}, '7d')).toBe('7d████▒▒░│░░░░30% · on pace for ~50% · ↻ Sat 19:00')
  expect(pillText({}, 'cost')).toBe('$3.19')
})
test("the names share their column's width, so the bars line up", () => {
  const row = rowOf()
  const nameOf = (key: string) => byKey(byKey(row, key, 'Box'), 'name', 'Box')?.props?.minWidth
  expect([nameOf('cache'), nameOf('5h'), nameOf('ctx'), nameOf('7d')]).toEqual([5, 5, 7, 7])
  // A column's pills stretch to its widest, so their grounds end together.
  expect(byKey(row, 'first', 'Box')?.props?.alignItems).toBe('stretch')
})
test('one bold per reading, on its figure', () => {
  expect(boldOf(rowOf())).toEqual(['52m', '4%', '40%', '30%', '$3.19'])
  expect(boldOf(rowOf(desktop()))).toEqual(['52m', '4%', '40%', '30%', '$3.19'])
})
test('the qualifiers and the cache and context names read in label ink; a limit is in its tint', () => {
  const row = rowOf()
  const inks = (key: string) => {
    const out = new Set<unknown>()
    walk(byKey(byKey(row, key, 'Box'), 'say', 'Text'), k => {
      if (k.type === 'Text' && k.props?.bold !== true && (k.children ?? []).every(c => typeof c === 'string')) out.add(k.props?.color)
    })
    return [...out]
  }
  expect([inks('cache'), inks('7d')]).toEqual([[DARK.label], [DARK.label]])
  const nameInk = (key: string) => ((byKey(byKey(row, key, 'Box'), 'name', 'Box')?.children ?? [])[0] as Node | undefined)?.props?.color
  expect([nameInk('cache'), nameInk('ctx'), nameInk('5h'), nameInk('7d')]).toEqual([DARK.label, DARK.label, DARK.fiveFg, DARK.weekFg])
})
test("on the desktop the cache's bar is a battery the bars' length, and each limit's notch is label grey in its pill's ground", () => {
  const row = rowOf(desktop())
  const svgs = svgsOf(row)
  expect(byKey(byKey(row, 'cache', 'Box'), 'battery', 'Svg')?.props?.width).toBe(90)
  const notchOf = (name: string) => {
    const source = String(svgs.find(n => String(n.props?.alt).startsWith(`${name} `))?.props?.source)
    return [/class="tick"[^>]*fill="([^"]+)"/.exec(source)?.[1], /class="knockout"[^>]*fill="([^"]+)"/.exec(source)?.[1]]
  }
  expect([notchOf('5h'), notchOf('7d'), notchOf('context')]).toEqual([[DARK.label, DARK.fiveBg], [DARK.label, DARK.weekBg], [undefined, undefined]])
})
test('no bar ends in a thumb, and a 5h at 0% has no notch', () => {
  const bars = svgsOf(rowOf(desktop())).filter(n => /^(cache|context|5h|7d) /.test(String(n.props?.alt)))
  expect(bars.length).toBe(4)
  // A regression guard: the meter has never drawn a thumb.
  for (const bar of bars) expect(String(bar.props?.source)).not.toMatch(/thumb|<circle/)
  const unused = { fiveHour: { percentUsed: 0, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }
  const five = svgsOf(rowOf(desktop(unused))).find(n => String(n.props?.alt).startsWith('5h '))
  expect(String(five?.props?.source)).not.toMatch(/class="tick"/)
  // As the board draws it: nothing used, the window may not have begun, so
  // it says neither a pace nor a reset, its figure alone.
  expect(pillText(unused, '5h')).toBe('5h░░░░░░░░░░░░0%')
})
test('the toggle is last, on the bottom row: ▵ shut, ▿ open', () => {
  const end = (tree: Node) => ((firstRow(tree) as Node).children ?? []).at(-1) as Node
  expect(byKey((end(draw()).children ?? [])[1], 'more', 'Button')?.props?.label).toBe('▵')
  expect(byKey((end(draw({ expanded: true })).children ?? [])[1], 'more', 'Button')?.props?.label).toBe('▿')
})
test('on the desktop at 95 columns the resets give way first, the rest of the board kept', () => {
  const t = shown(rowOf(desktop()))
  expect(t).not.toMatch(/↻/)
  expect(t).toMatch(/re-warm ~\$1\.66.*on pace for ~10%.*~114k left.*on pace for ~50%/)
})
test('the grid gives way in its order as it narrows', () => {
  const widths = [160, 120, 100, 80, 68, 60, 50, 40]
  const marks: ReadonlyArray<readonly [string, RegExp]> = [
    ['resets', /↻/],
    ['room', /~114k left/],
    ['reWarm', /re-warm/],
    ['bars', /[█░▒│]{12}/],
    ['paces', /on pace/],
    ['units', / full/],
    ['smallBars', /[█░▒│]{6}/],
    ['names', /context/],
  ]
  // The desktop's bars are drawn, not written, so its marks are the words'.
  for (const surface of ['terminal', 'desktop'] as const) {
    const ladder = marks.filter(([name]) => surface === 'terminal' || !/bars/i.test(name))
    const kept = widths.map(columns => ladder.filter(([, re]) => re.test(shown(rowOf({ surface, columns })))).map(([name]) => name))
    // At every width what is kept is the ladder's end, and narrower keeps no more.
    for (const k of kept) expect(k).toEqual(ladder.map(([name]) => name).slice(ladder.length - k.length))
    expect(kept.map(k => k.length)).toEqual([...kept.map(k => k.length)].sort((a, b) => b - a))
    expect(kept[0]?.length).toBe(ladder.length)
  }
  expect(shown(rowOf({ columns: 40 }))).toBe('cache52m5h4%context40%7d30%$3.19')
  expect(shown(rowOf({ surface: 'desktop', columns: 40 }))).toBe('cache52m5h4%ctx40%7d30%$3.19')
})
test('amber leads its gauge with "! " on an amber ground, and holds its reason while the calm give way', () => {
  const cache = byKey(rowOf(LAST_MINUTE), 'cache', 'Box')
  expect([shown(cache), cache?.props?.backgroundColor]).toEqual([`! cache${' '.repeat(12)}30s left · re-warm ~$1.66`, DARK.amberBg])
  expect(pillText(NEAR_COMPACTION, 'ctx')).toMatch(/^! context[█░]{12}93% full · compacts in ~14k$/)
  expect(pillText(FIVE_AHEAD, '5h')).toMatch(/^! 5h[█░▒│]{12}84% · full in ~40m · ↻ 01:10$/)
  // Narrow, the calm 7d has lost its pace while the amber 5h keeps its reason.
  const narrow = rowOf({ ...FIVE_AHEAD, columns: 80 })
  expect([/full in ~40m/.test(shown(byKey(narrow, '5h', 'Box'))), /on pace/.test(shown(byKey(narrow, '7d', 'Box')))]).toEqual([true, false])
  // Narrowest, amber says its figure alone, still led by its mark.
  expect(pillText({ ...LAST_MINUTE, columns: 40 }, 'cache')).toBe('! cache30s')
})
test('unreported, the context says so in label ink; with no limits, row two holds the toggle alone', () => {
  const none = { context: { tokens: undefined, window: 200_000, percent: undefined, compactAt: undefined, autoCompactOff: false }, fiveHour: undefined, sevenDay: undefined }
  const row = rowOf(none)
  expect(shown(byKey(row, 'ctx', 'Box'))).toBe('contextnot reported')
  expect(byKey(byKey(row, 'ctx', 'Box'), 's0', 'Text')?.props?.color).toBe(DARK.label)
  expect(columnsOf(row)).toEqual([['cache'], ['ctx'], [], ['cost', 'more']])
})
test('in the ascii tier the grid draws ASCII alone, its reset in words', () => {
  const band = drawBand(fakeEl, snapOf({ layout: 'gauges', columns: 160, utcOffsetMin: 0, glyphs: 'ascii' }), NO_ACT)
  const row = shown(firstRow(band))
  expect(row).toMatch(/^[\x20-\x7e]*$/)
  expect(row).toMatch(/5h:---\|-------4%, on pace for ~10%, resets 03:00/)
  expect(byKey(band, 'more', 'Button')?.props?.label).toBe('^')
})
test("open, the four cards each carry gauges' bar in their head", () => {
  const open = draw(desktop({ expanded: true, maxRows: 13 }))
  const headAlts = (name: string) => svgsOf(byKey(cardOf(open, name), 'slot', 'Box')).map(n => String(n.props?.alt))
  expect([headAlts('cache'), headAlts('spend'), headAlts('context'), headAlts('limits')]).toEqual([
    [readingsOf(snapOf()).cache.alt],
    ['token split: input, output, cache reads'],
    ['context 40% used'],
    ['7d 30% used'],
  ])
  // The worst window's lens is notched and dashed, as its gauge is.
  const limits = String(svgsOf(byKey(cardOf(open, 'limits'), 'slot', 'Box'))[0]?.props?.source)
  expect(limits).toMatch(/class="tick"/)
  expect(limits).toMatch(/class="projection"/)
})
test('open on the desktop at 95 columns and 13 rows, each card says one new thing, and the buttons stay', () => {
  const open = draw(desktop({ expanded: true, maxRows: 13 }))
  expect(['cache', 'spend', 'context', 'limits'].map(name => firstRowOf(open, name))).toEqual([
    'saved by cache~$11.40',
    'last message$0.21',
    'auto-compacts at190k',
    'resetsSat 19:00',
  ])
  expect([byKey(open, 'collapse', 'Button')?.props?.label, byKey(open, 'hide', 'Button')?.props?.label]).toEqual(['Collapse', 'Hide band'])
})
test('open, no card repeats what the row kept: at 160 terminal columns the row draws both windows whole, so LIMITS holds its head alone', () => {
  for (const over of [{}, { maxRows: 20 }, desktop({ columns: 120, maxRows: 16 })]) expect(bodyOf(draw({ expanded: true, maxRows: 13, ...over }), 'limits').map(shown)).toEqual([])
  // On the desktop at 95 the row lost its resets: LIMITS says each, the 7d's
  // at its clock and the 5h's as a countdown, and draws neither bar again.
  expect(bodyOf(draw(desktop({ expanded: true, maxRows: 20 })), 'limits').map(shown)).toEqual(['resetsSat 19:00', 'resets 3h 00m · on pace for ~10%'])
  // A passed window the row says too: `7d reset` is not said again.
  const passed = { sevenDay: { percentUsed: 40, resetsAt: new Date(-HOUR).toISOString() } }
  expect(bodyOf(draw({ ...passed, expanded: true, maxRows: 20 }), 'limits').map(shown)).toEqual([])
  // Narrow, the row lost the re-warm price, so the cache card leads with it.
  expect(firstRowOf(draw({ expanded: true, maxRows: 16, columns: 60 }), 'cache')).toMatch(/^re-warm if cold/)
})
test("open, a card's lens is its bar: its body leads with a fact, never the bar again", () => {
  for (const over of [{ maxRows: 13 }, desktop({ maxRows: 20 })]) {
    const open = draw({ expanded: true, ...over })
    for (const name of ['cache', 'spend', 'context', 'limits']) {
      const first = bodyOf(open, name)[0]
      // LIMITS may hold its head alone, the row having drawn every window.
      if (first !== undefined || name !== 'limits') expect(`${name} ${String(first?.props?.key).startsWith('fact:') && !isBar(first)}`).toBe(`${name} true`)
    }
  }
})
test('open with an amber spend limit, LIMITS leads its headline with "! " in amber, and still says its reset: the row never draws it', () => {
  const spend = { otherLimits: [{ kind: 'spend_limit' as const, percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] }
  const open = draw(desktop({ ...spend, expanded: true, maxRows: 13 }))
  const head = byKey(byKey(cardOf(open, 'limits'), 'head', 'Box'), 'headline', 'Box')
  expect(shown(head)).toBe('! spend 92%')
  expect(byKey(head, 'say0', 'Text')?.props?.color).toBe(DARK.amberFg)
  expect(firstRowOf(open, 'limits')).toBe('resets05:00')
})
test('a passed window says `reset` in label ink, not bold: it is no figure', () => {
  const passed = rowOf({ sevenDay: { percentUsed: 40, resetsAt: new Date(-HOUR).toISOString() } })
  expect(shown(byKey(passed, '7d', 'Box'))).toBe('7dreset')
  expect(boldOf(passed)).toEqual(['52m', '4%', '40%', '$3.19'])
  expect(byKey(byKey(passed, '7d', 'Box'), 's0', 'Text')?.props?.color).toBe(DARK.label)
})
