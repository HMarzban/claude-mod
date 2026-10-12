// Tiles as its board draws it: one row of equal tiles, figure first, a mark
// only where there's a cap, giving way from the right; open, the shared
// cards with a mark in each head but the spend's.

import { test, expect } from 'claude-code/testing'
import type { RenderChildren } from 'claude-code'
import { asciiTree } from '../hooks/glyphs'
import { makeKit } from '../hooks/kit'
import { DESKTOP, TERMINAL, cellsOf } from '../hooks/layout'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { tilesView } from '../hooks/views/tiles'
import { DAY_MS, fixedZone } from '../hooks/format'
import { HOUR, MIN, byKey, cardOf, fakeEl, firstRow, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('tiles')

/** The board's readings: 59m of cache, $1,027 spent, 87% context, 5h at 0%
 *  and 7d at 66% with 15% of its week gone, 2.1B tokens. */
const BOARD: Partial<BandSnapshot> = {
  columns: 200,
  zone: fixedZone(0),
  costUsd: 1027,
  lastTurnUsd: 0.1,
  context: { tokens: 165_300, window: 200_000, percent: 83, compactAt: 190_000, autoCompactOff: false },
  fiveHour: { percentUsed: 0, resetsAt: new Date(4 * HOUR + 55 * MIN).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 66, resetsAt: new Date(5 * DAY_MS + 22 * HOUR).toISOString() },
}
const snapAt = (over: Partial<BandSnapshot> = {}): BandSnapshot => {
  const base = snapOf(BOARD)
  return snapOf({ ...BOARD, cache: { ...base.cache, msLeft: 59 * MIN, tokens: { sent: 100_000_000, back: 50_000_000, cached: 1_950_000_000 } }, ...over })
}
const drawn = (over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapAt(over)
  return tilesView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT) as unknown as Node
}
const rowOf = (over: Partial<BandSnapshot> = {}): Node => firstRow(drawn(over)) as Node
const desk = (over: Partial<BandSnapshot> = {}): Partial<BandSnapshot> => ({ surface: 'desktop', ...over })
/** The row's tiles, each a pill that never shrinks. */
const tilesOf = (row: Node): Node[] => (row.children ?? []).filter((k): k is Node => (k as Node | null)?.props?.flexShrink === 0 && (k as Node).props?.key !== undefined)
const keysOf = (row: Node): unknown[] => tilesOf(row).map(t => t.props?.key)
const tile = (row: Node, key: string): Node | undefined => tilesOf(row).find(t => t.props?.key === key)
/** The amber readings: 5h at 82%, 5h pacing to full in an hour, the cache's last minute. */
const LIMIT_82: Partial<BandSnapshot> = { fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }
const PACING: Partial<BandSnapshot> = { fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: HOUR } }
const LAST_MINUTE: Partial<BandSnapshot> = { cache: { ...snapAt().cache, msLeft: 30_000 } }
const boldOf = (n: unknown): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}

test('the row runs cache, spend, context, 5h and 7d, then the tokens', () => {
  expect(keysOf(rowOf())).toEqual(['cache', 'cost', 'ctx', '5h', '7d', 'tokens'])
})
test("each tile leads with its figure, then its label: the 5h's reset counting down, the 7d's at its clock time", () => {
  const said = tilesOf(rowOf()).map(shown)
  const leads = [/^59m\s*cache/, /^\$1,027\s*spent$/, /^87%\s*context/, /^0%\s*5h ↻ 4h 55m/, /^66%\s*7d ↻ Tue 22:00/, /^2\.1B\s*tokens$/]
  expect(said.map((s, i) => leads[i]?.test(s))).toEqual(leads.map(() => true))
})
test('one bold per tile, on its figure, amber or calm', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(boldOf(rowOf({ surface }))).toEqual(['59m', '$1,027', '87%', '0%', '66%', '2.1B'])
    expect(boldOf(tile(rowOf({ surface, ...LIMIT_82 }), '5h'))).toEqual(['82%'])
    expect(boldOf(tile(rowOf({ surface, ...LAST_MINUTE }), 'cache'))).toEqual(['30s'])
  }
})
test('every tile is the same width, its figures right-aligned in one column', () => {
  for (const [surface, measure] of [['terminal', TERMINAL], ['desktop', DESKTOP]] as const) {
    const tiles = tilesOf(rowOf({ surface }))
    expect(new Set(tiles.map(t => cellsOf(t as unknown as RenderChildren, measure))).size).toBe(1)
    const figures = tiles.map(t => byKey(t, 'fig', 'Box')?.props)
    expect(new Set(figures.map(p => p?.minWidth)).size).toBe(1)
    expect(figures.every(p => p?.justifyContent === 'flex-end')).toBe(true)
  }
})
test('a terminal tile marks a cap with cells: the battery, a bar, a notch and a dashed projection', () => {
  const row = rowOf()
  const mark = (key: string) => shown(byKey(tile(row, key), 'mark', 'Box'))
  expect(mark('cache')).toMatch(/^█+╸$/)
  expect(mark('ctx')).toMatch(/^█+░+$/)
  // 5h at 0% has no time gone to mark; 7d's notch, then its fill, dashed to the top.
  expect(mark('5h')).toMatch(/^░+$/)
  expect(mark('7d')).toMatch(/^█*│█*╌+$/)
  expect([mark('cost'), mark('tokens')]).toEqual(['', ''])
})
test('a desktop tile marks a cap with an Svg: the battery, a bar, 7d its notch in label ink, and no thumb anywhere', () => {
  const row = rowOf({ surface: 'desktop' })
  const svgs = (key: string) => svgsOf(tile(row, key))
  expect(svgs('cache').map(n => n.props?.width)).toEqual([40])
  expect(svgs('cost')).toEqual([])
  const notch = /<rect class="tick"[^>]*fill="([^"]+)"/
  expect(svgs('5h').map(n => notch.test(String(n.props?.source)))).toEqual([false])
  const seven = String(svgs('7d')[0]?.props?.source)
  expect(notch.exec(seven)?.[1]).toBe(snapOf().palette.label)
  // Knocked out of the tile's own ground, not the card's.
  expect(seven).toMatch(new RegExp(`class="knockout"[^>]*fill="${snapOf().palette.weekBg}"`))
  expect(seven).toMatch(/class="projection"/)
  // No thumb: nothing in a mark, the row's or a card head's, paints the value's bright ink.
  const limits = byKey(cardOf(drawn(desk({ expanded: true })), 'limits'), 'slot', 'Box')
  for (const n of [...svgsOf(row), ...svgsOf(limits)]) {
    expect(String(n.props?.source)).not.toContain(`"${snapOf().palette.value}"`)
  }
})
test('the toggle ends the row: ▵ shut, ▿ open', () => {
  const last = (row: Node) => {
    let label: unknown
    walk((row.children ?? []).at(-1), n => {
      if (n.type === 'Button') label = n.props?.label
    })
    return label
  }
  expect([last(rowOf()), last(rowOf({ expanded: true }))]).toEqual(['▵', '▿'])
})
test('the row gives way from the right: tokens, resets, bar length, then the calm 7d', () => {
  const at = (columns: number) => rowOf({ columns })
  expect(keysOf(at(160))).toEqual(['cache', 'cost', 'ctx', '5h', '7d'])
  // Both resets whole at 160: the marks shorten a cell before a word gives way.
  expect(shown(at(160))).toMatch(/0%\s*5h ↻ 4h 55m\s*░{5}66%\s*7d ↻ Tue 22:00\s*█*│█*╌+$/)
  const barCells = (row: Node) => shown(byKey(tile(row, 'ctx'), 'mark', 'Box')).length
  expect(barCells(at(160))).toBe(5)
  expect(barCells(at(200))).toBe(6)
  expect(shown(at(120))).not.toMatch(/↻/)
  expect(barCells(at(120))).toBeLessThan(barCells(at(200)))
  expect(keysOf(at(95))).toEqual(['cache', 'cost', 'ctx', '5h'])
  // Every tile shrinks together, never just one.
  for (const cols of [160, 120, 95]) expect(new Set(tilesOf(at(cols)).map(t => cellsOf(t as unknown as RenderChildren, TERMINAL))).size).toBe(1)
  expect(keysOf(at(40))).toEqual(['cache', 'cost'])
})
test('an amber tile leads the row on the amber ground, its figure first, then its reason led by !', () => {
  const row = rowOf(LIMIT_82)
  expect(keysOf(row)[0]).toBe('5h')
  expect(shown(tile(row, '5h'))).toMatch(/^82%! 5h ↻ 3h 00m/)
  expect(tile(row, '5h')?.props?.backgroundColor).toBe(snapOf().palette.amberBg)
  // The figure keeps its column, the one every tile shares.
  expect(new Set(tilesOf(row).map(t => byKey(t, 'fig', 'Box')?.props?.minWidth)).size).toBe(1)
  // The calm tiles stay off amber.
  expect(boldOf(tile(row, 'cache'))).toEqual(['59m'])
})
test('narrowed, an amber tile keeps its figure and its name: a pace to full, the last minute', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const columns of [160, 60]) {
      expect(shown(tile(rowOf({ surface, columns, ...PACING }), '5h'))).toMatch(/^40%! 5h ~1h/)
      expect(shown(tile(rowOf({ surface, columns, ...LAST_MINUTE }), 'cache'))).toMatch(/^30s! cache/)
    }
})
test('at 40 columns a calm tile gives way before any label: no figure is left unnamed', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const amber of [PACING, LAST_MINUTE]) {
      const tiles = tilesOf(rowOf({ surface, columns: 40, ...amber }))
      expect(tiles.map(t => `${String(t.props?.key)} ${byKey(t, 'label', 'Box') !== undefined}`)).toEqual(tiles.map(t => `${String(t.props?.key)} true`))
    }
})
test('a cold cache says so collapsed, and its price opens', () => {
  const cold = { cache: { ...snapAt().cache, msLeft: 0 } }
  expect(shown(tile(rowOf(cold), 'cache'))).toMatch(/^cold\s*cache░+╸$/)
  expect(shown(cardOf(drawn({ ...cold, expanded: true }), 'cache'))).toMatch(/next message\s*~\$1\.66/)
})
test('in ascii the marks are # - ~ | >, and the reset glyph drops', () => {
  const t = shown(asciiTree(rowOf({ glyphs: 'ascii' })))
  expect(t).toMatch(/^[\x20-\x7e]*$/)
  expect(t).toMatch(/#+>/)
  expect(t).toMatch(/#*\|#*~+/)
  expect(t).toMatch(/5h 4h 55m/)
  expect(t).toMatch(/7d Tue 22:00/)
})
test('on the desktop at 95 columns the row holds five tiles: only the tokens and both resets give way, the 7d keeping its fill, dash and notch', () => {
  const row = rowOf(desk({ columns: 95 }))
  expect(keysOf(row)).toEqual(['cache', 'cost', 'ctx', '5h', '7d'])
  expect(shown(row)).not.toMatch(/↻/)
  const seven = String(svgsOf(tile(row, '7d'))[0]?.props?.source)
  expect(['class="fill"', 'class="projection"', 'class="tick"'].map(mark => seven.includes(mark))).toEqual([true, true, true])
  // Each tile measured as the measure gives it, its columns not each rounded up a column.
  expect(cellsOf(row as unknown as RenderChildren, DESKTOP)).toBeLessThanOrEqual(91)
  expect(byKey(tile(row, 'cost'), 'fig', 'Box')?.props?.minWidth).toBe(4.5)
})
test('a figure is never held to a width: its column is its least, and a bold wider than the measure takes from the mark', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const columns of [95, 160, 200])
      for (const amber of [{}, LIMIT_82, LAST_MINUTE]) {
        const tiles = tilesOf(rowOf({ surface, columns, ...amber }))
        const figures = tiles.map(t => byKey(t, 'fig', 'Box')?.props)
        expect(figures.map(p => [p?.width, p?.flexShrink])).toEqual(figures.map(() => [undefined, 0]))
        expect(new Set(figures.map(p => p?.minWidth)).size).toBe(1)
        expect(tiles.every(t => typeof byKey(t, 'tile', 'Box')?.props?.width === 'number')).toBe(true)
      }
})
test("on the desktop ↻ goes before a reset's words do; a reset goes whole, never cut", () => {
  const labels = (columns: number) => ['5h', '7d'].map(key => shown(byKey(tile(rowOf(desk({ columns })), key), 'label', 'Box')))
  expect(labels(200)).toEqual(['5h ↻ 4h 55m', '7d ↻ Tue 22:00'])
  const widths = Array.from({ length: 106 }, (_, i) => 200 - i)
  const bare = widths.find(columns => !labels(columns).join('').includes('↻'))
  expect(bare === undefined ? [] : labels(bare)).toEqual(['5h 4h 55m', '7d Tue 22:00'])
  for (const columns of widths) for (const label of labels(columns)) expect(`${columns} ${label}`).toMatch(/^\d+ (5h|7d)( (↻ )?(4h 55m|Tue 22:00))?$/)
})
test('inside an equal tile the mark gives way before the words: the label is never held to a width, the mark may shrink', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const t = tile(rowOf({ surface }), '7d')
    const label = byKey(t, 'label', 'Box')?.props
    const mark = byKey(t, 'mark', 'Box')?.props
    expect([label?.width, label?.flexShrink]).toEqual([undefined, 0])
    expect([mark?.flexShrink, mark?.minWidth, mark?.overflow]).toEqual([1, 0, 'hidden'])
    expect(typeof byKey(t, 'tile', 'Box')?.props?.width).toBe('number')
  }
})
test('open is the four cards, a mark in every head but the spend’s', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const open = drawn({ surface, expanded: true })
    expect(['cache', 'spend', 'context', 'limits'].map(name => cardOf(open, name) !== undefined)).toEqual([true, true, true, true])
    const slots = ['cache', 'spend', 'context', 'limits'].map(name => byKey(cardOf(open, name), 'slot', 'Box') !== undefined)
    expect(slots).toEqual([true, false, true, true])
  }
  // The limits' mark is the worst window's, notched where its week has gone.
  const slot = byKey(cardOf(drawn(desk({ expanded: true })), 'limits'), 'slot', 'Box')
  expect(svgsOf(slot).map(n => /class="tick"/.test(String(n.props?.source)))).toEqual([true])
})
test("open adds, never repeats: each card's first row is one the row left out", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    // The board's open view: 95 columns, a body short enough that each card leads with a fact.
    const open = drawn({ surface, columns: 95, expanded: true, maxRows: 13 })
    const row = shown(firstRow(open))
    const first = (name: string) => shown(((cardOf(open, name)?.children ?? []) as Node[]).filter(Boolean)[1])
    const [cache, spend, context, limits] = ['cache', 'spend', 'context', 'limits'].map(first)
    expect([cache, spend, context, limits]).toEqual([
      're-warm if cold~$1.66',
      'last message$0.10',
      'room left~25k',
      expect.stringMatching(/^resets\w{3} \d\d:\d\d · full before reset$/),
    ])
    for (const value of ['~$1.66', '$0.10', '~25k', 'full before reset', 'resets']) expect(row).not.toContain(value)
  }
})
test("open, a card's lens stands for its bar: each card with one leads with a fact, never the bar the tile and the head already draw", () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const [columns, maxRows] of [[160, 13], [95, 40]] as const) {
      const open = drawn({ surface, columns, maxRows, expanded: true })
      // The spend has no lens: its split bar is drawn nowhere else.
      for (const name of ['cache', 'context', 'limits']) {
        const first = ((cardOf(open, name)?.children ?? []) as Node[]).filter(Boolean)[1]
        expect(`${name} ${String(first?.props?.key)}`).toMatch(new RegExp(`^${name} fact:`))
        expect(svgsOf(first)).toEqual([])
      }
    }
})
test('collapsed is one row, and open keeps to the band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    expect(visualRows(rowOf({ surface }), surface)).toBe(1)
    expect(visualRows(drawn({ surface, columns: 95, expanded: true, maxRows: 13 }), surface)).toBeLessThanOrEqual(13)
  }
})
