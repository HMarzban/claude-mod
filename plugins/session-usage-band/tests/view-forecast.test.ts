// Forecast as its board draws it: each reading's next change a chips pill,
// its clock time the figure, soonest first and amber in front; open, chips'
// cards through a lens of when.

import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { forecastView } from '../hooks/views/forecast'
import { HOUR, MIN, byKey, cardOf, cardText, fakeEl, firstRow, isCard, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('forecast')

/** The board's moment, Sunday 15:14, its zone pinned to UTC. */
const NOW = Date.parse('2026-10-11T15:14:00Z')
const later = (ms: number): string => new Date(NOW + ms).toISOString()
const SEVEN_RESET = NOW + 5 * 24 * HOUR + 22 * HOUR + 16 * MIN

/** The board's session: 59 minutes of cache, $1,027 spent, the context at
 *  839k of 967k and growing 10.7k a message, the 5h at 0% and the 7d at 66%,
 *  resetting Saturday 13:30. */
const board = (over: Partial<BandSnapshot> = {}): BandSnapshot => {
  const base = snapOf()
  return snapOf({
    layout: 'forecast',
    columns: 160,
    now: NOW,
    utcOffsetMin: 0,
    cache: { ...base.cache, msLeft: 59 * MIN, reWarmUsd: 0.8, savedUsd: 1350 },
    costUsd: 1027,
    lastTurnUsd: 0.1,
    context: { tokens: 839_000, window: 1_000_000, percent: 84, compactAt: 967_000, autoCompactOff: false },
    history: { costs: [], fiveHour: [], context: Array.from({ length: 11 }, (_, i) => 732_000 + i * 10_700) },
    fiveHour: { percentUsed: 0, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null },
    sevenDay: { percentUsed: 66, resetsAt: new Date(SEVEN_RESET).toISOString() },
    samples: [{ at: NOW - HOUR, fivePct: 0, sevenPct: 60, fiveResetAt: NOW + 4 * HOUR + 55 * MIN, sevenResetAt: SEVEN_RESET }],
    ...over,
  })
}
const drawn = (snap: BandSnapshot): Node => forecastView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT) as unknown as Node
const rowOf = (snap: BandSnapshot): Node => firstRow(drawn(snap)) as Node
/** The row's pills, by key, each as it reads. */
const pillsOf = (row: Node): Array<readonly [unknown, string]> =>
  ((row.children ?? []) as Array<Node | null>)
    .filter(k => k?.props?.flexShrink === 0 && k.props?.key !== undefined)
    .map(k => [k?.props?.key, shown(k)] as const)
const boldOf = (n: unknown): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}
/** The first body row of a card, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])
const headOf = (tree: Node, name: string): string => shown(byKey(cardOf(tree, name), 'head'))

test("the row is the board's: the cache going cold, the 7d's fill day, then compaction", () => {
  expect(pillsOf(rowOf(board()))).toEqual([
    ['cache', '◷ cold at 16:13 · in 59m · re-warm ~$0.80'],
    ['7d', '7d 66% · full ~Mon · ↻ Sat 13:30'],
    ['ctx', '◔ compacts in ~128k'],
  ])
})
test('each pill is bold on its time alone', () => {
  expect(boldOf(rowOf(board()))).toEqual(['16:13', '~Mon', '~128k'])
  expect(boldOf(rowOf(board({ surface: 'desktop' })))).toEqual(['16:13', '~Mon', '~128k'])
})
test("each pill keeps chips' ground and tint: the 7d on its own", () => {
  const row = rowOf(board())
  expect(['cache', '7d', 'ctx'].map(key => byKey(row, key, 'Box')?.props?.backgroundColor)).toEqual([DARK.surface, DARK.weekBg, DARK.surface])
  expect(byKey(byKey(row, '7d', 'Box'), 'name', 'Text')?.props?.color).toBe(DARK.weekFg)
})
test('the toggle is last, ▵ shut and ▿ open', () => {
  for (const expanded of [false, true]) {
    const kids = (rowOf(board({ expanded })).children ?? []) as Node[]
    expect(byKey(kids.at(-1), 'more', 'Button')?.props?.label).toBe(expanded ? '▿' : '▵')
  }
})
test('collapsed, it is one row on both surfaces, its cache a battery on the desktop', () => {
  for (const surface of ['terminal', 'desktop'] as const) expect(visualRows(drawn(board({ surface })), surface)).toBe(1)
  const desk = rowOf(board({ surface: 'desktop' }))
  expect(svgsOf(byKey(desk, 'cache', 'Box')).map(s => s.props?.alt)).toEqual(['cache 59 minutes left, warm'])
  expect(shown(desk)).toMatch(/^cold at 16:13 · in 59m/)
})
test('a 5h at 0% gets no pill; once it moves, its reset and pace', () => {
  expect(pillsOf(rowOf(board())).map(([key]) => key)).not.toContain('5h')
  const moved = pillsOf(rowOf(board({ fiveHour: { percentUsed: 4, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } })))
  expect(moved.find(([key]) => key === '5h')?.[1]).toBe('5h 4% · ↻ 20:09')
})
test("'in' is said once, on the soonest change", () => {
  expect(shown(rowOf(board())).match(/\bin \d/g)).toEqual(['in 5'])
  // Working, the cache counts nothing down: the 7d's fill is the soonest, and the cache follows the timed pills.
  expect(pillsOf(rowOf(board({ isWorking: true })))).toEqual([
    ['7d', '7d 66% · full ~Mon · in ~13h 15m · ↻ Sat 13:30'],
    ['cache', '◷ cache warm'],
    ['ctx', '◔ compacts in ~128k'],
  ])
})
test('with the offset unknown, each time reads as a duration', () => {
  expect(pillsOf(rowOf(board({ utcOffsetMin: undefined })))).toEqual([
    ['cache', '◷ cold in 59m · re-warm ~$0.80'],
    ['7d', '7d 66% · full in ~13h 15m · ↻ 5d 22h'],
    ['ctx', '◔ compacts in ~128k'],
  ])
  const moved = { utcOffsetMin: undefined, fiveHour: { percentUsed: 4, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } }
  expect(pillsOf(rowOf(board(moved))).find(([key]) => key === '5h')?.[1]).toBe('5h 4% · ↻ 4h 55m')
})
test('a cold cache leads with its price, short once the row is tight', () => {
  const cold = { cache: { ...board().cache, msLeft: 0 } }
  expect(pillsOf(rowOf(board(cold)))[0]).toEqual(['cache', '◷ cold · re-warm ~$0.80'])
  expect(boldOf(byKey(rowOf(board(cold)), 'cache', 'Box'))).toEqual(['~$0.80'])
  expect(shown(rowOf(board({ ...cold, columns: 40 })))).toBe('◷ cold ~$0.80')
})
test('it gives way by width: the limits\' resets, the "in", the price, compaction, then the 7d', () => {
  const at = (columns: number) => shown(rowOf(board({ columns })))
  expect(at(160)).toBe('◷ cold at 16:13 · in 59m · re-warm ~$0.807d 66% · full ~Mon · ↻ Sat 13:30◔ compacts in ~128k')
  expect(at(100)).toBe('◷ cold at 16:13 · in 59m · re-warm ~$0.807d 66% · full ~Mon◔ compacts in ~128k')
  expect(at(90)).toBe('◷ cold at 16:13 · re-warm ~$0.807d 66% · full ~Mon◔ compacts in ~128k')
  expect(at(75)).toBe('◷ cold at 16:137d 66% · full ~Mon◔ compacts in ~128k')
  expect(at(50)).toBe('◷ cold at 16:137d 66% · full ~Mon')
  expect(at(40)).toBe('◷ cold at 16:13')
})
test('amber leads the row, in its own words, and holds out narrowest', () => {
  const five = { fiveHour: { percentUsed: 82, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } }
  const first = (over: Partial<BandSnapshot>) => pillsOf(rowOf(board(over)))[0]
  expect(first(five)).toEqual(['5h', '! 5h 82%'])
  expect(byKey(rowOf(board(five)), '5h', 'Box')?.props?.backgroundColor).toBe(DARK.amberBg)
  expect(first({ cache: { ...board().cache, msLeft: 30_000 } })).toEqual(['cache', '! 30s left · re-warm ~$0.80'])
  expect(first({ context: { tokens: 900_000, window: 1_000_000, percent: 90, compactAt: 967_000, autoCompactOff: false } })).toEqual(['ctx', '! context 93% · compacts in ~67k'])
  expect(first({ fiveHour: { percentUsed: 40, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: 40 * MIN } })).toEqual(['5h', '! 5h full in ~40m'])
  expect(shown(rowOf(board({ ...five, columns: 40 })))).toBe('! 5h 82%◷ cold at 16:13')
})
test('open, the four cards with the lens in each head, and no first row the row said', () => {
  // At 120 columns, two lines of cards, three rows of body each.
  const tree = drawn(board({ expanded: true, maxRows: 13, columns: 120 }))
  expect(['cache', 'spend', 'context'].map(name => headOf(tree, name))).toEqual([
    'CACHEcold at 16:1359m left',
    'SPEND$1,027',
    'CONTEXT~12 messages to compaction87% full',
  ])
  expect(headOf(tree, 'limits')).toMatch(/^LIMITS.+ full ~Mon7d 66%$/)
  // Headed by another window, the fill day names the 7d's.
  const five = drawn(board({ expanded: true, columns: 120, fiveHour: { percentUsed: 82, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } }))
  expect(headOf(five, 'limits')).toMatch(/^LIMITS.+ 7d full ~Mon5h 82%!$/)
  expect(byKey(cardOf(tree, 'limits'), 'cells')).toBeDefined()
  expect(['cache', 'spend', 'context'].map(name => firstRowOf(tree, name))).toEqual(['saved by cache~$1,350', 'last message$0.10', 'auto-compacts at967k'])
  expect(firstRowOf(tree, 'limits')).toMatch(/^5h░+0%$/)
})
for (const surface of ['terminal', 'desktop'] as const)
  test(`open four across on the ${surface}, a head's words give way whole, never cut`, () => {
    const tree = drawn(board({ surface, expanded: true }))
    expect(headOf(tree, 'context')).toBe('CONTEXT~12 msgs to compact87% full')
    expect(headOf(drawn(board({ surface, expanded: true, columns: 120 })), 'context')).toBe('CONTEXT~12 messages to compaction87% full')
    // Out of room, its fill day's figure stays, the words beside it gone whole.
    expect(headOf(tree, 'limits')).toMatch(surface === 'terminal' ? /^LIMITS.+ ~Mon7d 66%$/ : /^LIMITSfull ~Mon7d 66%$/)
    expect(headOf(tree, 'limits')).not.toMatch(/…|full ~…/)
  })
test("open on the desktop, LIMITS' day cells are its board's: today alone outlined bright, the days to come dim, none drawn full", () => {
  const source = String(svgsOf(byKey(cardOf(drawn(board({ surface: 'desktop', expanded: true })), 'limits'), 'head')).find(s => /weekly limit by day/.test(String(s.props?.alt)))?.props?.source)
  const p = DARK
  expect(source.match(new RegExp(`stroke="${p.value}"`, 'g'))).toHaveLength(1)
  expect(source).toMatch(new RegExp(`class="edge"[^>]*stroke="${p.value}" stroke-dasharray="2 1.6"`))
  // Today's rise is 60% of the cap; the six guessed days fill nothing, dashed and dim.
  expect([...source.matchAll(/class="fill"[^>]*height="([\d.]+)"/g)].map(([, h]) => h)).toEqual(['7.2'])
  expect(source.match(new RegExp(`stroke="${p.trackStroke}" stroke-dasharray="2 2" opacity="0.75"`, 'g'))).toHaveLength(6)
})
test("open on the desktop, LIMITS' lens is the week's day cells, 16px tall", () => {
  const tree = drawn(board({ surface: 'desktop', expanded: true }))
  const cells = svgsOf(byKey(cardOf(tree, 'limits'), 'head')).find(s => /weekly limit by day/.test(String(s.props?.alt)))
  expect(cells?.props?.height).toBe(16)
})
test('open, the band fits its rows and nothing ends a fill in a thumb', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const maxRows of [13, 20, 40]) {
      const tree = drawn(board({ surface, expanded: true, maxRows }))
      const edges = surface === 'desktop' ? 2 * (byKey(tree, 'cards')?.children ?? []).length : 0
      expect(`${surface} ${maxRows} ${visualRows(tree, surface) + edges <= maxRows}`).toBe(`${surface} ${maxRows} true`)
      expect(svgsOf(tree).filter(s => /class="(tick|knockout)"/.test(String(s.props?.source)))).toEqual([])
      expect(shown(tree)).not.toMatch(/[█░▒]│|│[█░▒]/)
    }
  }
})
test('in ascii, the row says its resets in words, and the whole band is ASCII', () => {
  for (const expanded of [false, true]) {
    const band = drawBand(fakeEl, board({ glyphs: 'ascii', expanded }), NO_ACT)
    expect(shown(band)).toMatch(/^[\x20-\x7e]*$/)
    expect(byKey(firstRow(band), 'more', 'Button')?.props?.label).toBe(expanded ? 'v' : '^')
    if (!expanded) expect(shown(firstRow(band))).toBe('cold at 16:13, in 59m, re-warm ~$0.807d 66%, full ~Mon, resets Sat 13:30compacts in ~128k')
  }
})

/** How many times `part` is said in `text`. */
const times = (text: string, part: string): number => text.split(part).length - 1
test("open, the row and the cards together say the 7d's reset, the re-warm price and the room left once, at any width", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const columns of [160, 95, 80, 60]) {
      const said = shown(drawn(board({ surface, columns, expanded: true, maxRows: 40 })))
      expect(`${surface} ${columns}: ${['Sat 13:30', '~$0.80', '~128k'].map(part => times(said, part))}`).toBe(`${surface} ${columns}: 1,1,1`)
    }
  }
  // Amber, the short words drop the price and the room, and the cards say them.
  const amber = { columns: 40, cache: { ...board().cache, msLeft: 30_000 }, context: { tokens: 900_000, window: 1_000_000, percent: 90, compactAt: 967_000, autoCompactOff: false } }
  const said = shown(drawn(board({ ...amber, expanded: true, maxRows: 40 })))
  expect([times(said, '~$0.80'), times(said, '~67k')]).toEqual([1, 1])
})
test('a window not the worst says its reset and pace once: its pill says them, so its line in LIMITS does not', () => {
  const open = { expanded: true, maxRows: 40 }
  const amber = shown(drawn(board({ ...open, fiveHour: { percentUsed: 82, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } })))
  expect(times(amber, 'Sat 13:30')).toBe(1)
  // A measured fill: the 5h's amber says it fills, so its line says only when it resets.
  const fill = drawn(board({ ...open, fiveHour: { percentUsed: 40, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: 40 * MIN } }))
  expect([times(shown(fill), 'full in ~40m'), shown(byKey(fill, 'fact:5h pace'))]).toEqual([1, 'resets 20:09'])
})
/** What the hover card a row's piece reveals says: the placed Box in its hover scope. */
const hoverOf = (row: unknown, key: string): string => {
  const scopeOf = (n: Node | undefined) => (n?.props?.hover as { scope?: unknown } | undefined)?.scope
  const scope = scopeOf(byKey(row, key, 'Box'))
  return scope === undefined ? '' : cardText(((row as Node).children ?? []).find(k => isCard(k) && scopeOf(k) === scope))
}
test("each pill reveals chips' card for its reading", () => {
  const moved = { fiveHour: { percentUsed: 4, resetsAt: later(4 * HOUR + 55 * MIN), etaMs: null } }
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = rowOf(board({ ...moved, surface }))
    const chips = firstRow(drawBand(fakeEl, board({ ...moved, surface, layout: 'chips' }), NO_ACT))
    for (const key of ['cache', '5h', '7d', 'ctx']) {
      const said = hoverOf(row, key)
      expect(`${surface} ${key} ${said}`).toBe(`${surface} ${key} ${hoverOf(chips, key)}`)
      expect(said).not.toBe('')
    }
  }
})
test('shut, the band reads neither the week nor the history', () => {
  const read = (snap: BandSnapshot): string[] => {
    const touched: string[] = []
    const watched = new Proxy(readingsOf(snap), {
      get: (target, name, receiver) => {
        if (name === 'week' || name === 'history') touched.push(name)
        return Reflect.get(target, name, receiver)
      },
    })
    forecastView.draw(makeKit(fakeEl, snap), watched, NO_ACT)
    return [...new Set(touched)].sort()
  }
  expect(read(board())).toEqual([])
  expect(read(board({ expanded: true }))).toEqual(['history', 'week'])
})
