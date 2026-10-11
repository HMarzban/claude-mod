// Rings: chips' pills, each led by a 16 px ring where its reading has a cap,
// its figure bold before its label; a ring's notch marks the time gone and
// its dashes the projection. Open, the shared cards, each card's own ring in
// its head, and no first row the row already said.

import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { HOUR, MIN, byKey, cardOf, fakeEl, firstRow, pillOf, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('rings')

/** The board's readings: 59m of cache, $1,027, 87% context, 5h empty, and
 *  7d at 66% with 63% of its week gone, so full before its Sat 13:30 reset. */
const BOARD: Partial<BandSnapshot> = {
  layout: 'rings',
  columns: 160,
  utcOffsetMin: 0,
  costUsd: 1027,
  lastTurnUsd: 0.1,
  cache: { ...snapOf().cache, msLeft: 59 * MIN, reWarmUsd: 0.8, tokens: { sent: 100_000_000, back: 20_000_000, cached: 1_980_000_000 } },
  context: { tokens: 839_000, window: 1_000_000, percent: 83.9, compactAt: 967_000, autoCompactOff: false },
  fiveHour: { percentUsed: 0, resetsAt: new Date(4 * HOUR + 55 * MIN).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 66, resetsAt: new Date(61.5 * HOUR).toISOString() },
}
const draw = (over: Partial<BandSnapshot> = {}): Node => drawBand(fakeEl, snapOf({ ...BOARD, ...over }), NO_ACT) as unknown as Node
const DESK95: Partial<BandSnapshot> = { surface: 'desktop', columns: 95 }
const OPEN: Partial<BandSnapshot> = { expanded: true, maxRows: 13 }

/** The row's pills by key, as drawn. */
const pillKeys = (tree: Node): unknown[] =>
  ((firstRow(tree) as Node).children ?? []).filter(k => (k as Node | null)?.props?.flexShrink === 0 && (k as Node).props?.key !== undefined).map(k => (k as Node).props?.key)
const pillText = (tree: Node, key: string): string => shown(pillOf(tree, key))
/** The rings drawn, by their keys: a card's icons are Svgs too. */
const ringsOf = (tree: unknown): Node[] => svgsOf(tree).filter(n => String(n.props?.key).startsWith('ring:'))
/** Each ring's reading, as its alt names it. */
const ringAlts = (tree: unknown): string[] => ringsOf(tree).map(n => String(n.props?.alt).split(' ')[0] ?? '')
/** A ring's markup, by its reading's name. */
const ringOf = (tree: unknown, name: string): string => String(ringsOf(tree).find(n => String(n.props?.alt).startsWith(`${name} `))?.props?.source)
const boldOf = (tree: unknown): string[] => {
  const out: string[] = []
  walk(tree, n => {
    if (n.type === 'Text' && n.props?.bold === true) out.push(shown(n))
  })
  return out
}
/** A card's first body row, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])

test("the row is chips' pills in chips' order: cache, spend, context, 5h, 7d, then the tokens", () => {
  expect(pillKeys(draw())).toEqual(['cache', 'cost', 'ctx', '5h', '7d', 'tokens'])
})
test('at 160 columns the terminal row reads as its board: each ring a glyph to the nearest quarter, its figure, then its label', () => {
  const tree = draw()
  expect(['cache', 'cost', 'ctx', '5h', '7d', 'tokens'].map(key => pillText(tree, key))).toEqual([
    '● 59m cache',
    '$1,027 spent',
    '◕ 87% context',
    '○ 0% 5h │ ↻ 4h 55m',
    '◕ 66% 7d │ full before reset │ ↻ Sat 13:30',
    '2.1B tokens',
  ])
})
test('the cache pill is a plain pill, its ring the battery: no text battery paints it', () => {
  const cache = pillOf(draw(), 'cache')
  expect(cache?.props?.backgroundColor).toBe(DARK.surface)
  walk(cache, n => expect(n.props?.backgroundColor === undefined || n === cache).toBe(true))
})
test("at 95 columns the desktop keeps a 16 px ring by each meter, none by the spend; the tokens and 7d's reset give way", () => {
  const tree = draw(DESK95)
  expect(pillKeys(tree)).toEqual(['cache', 'cost', 'ctx', '5h', '7d'])
  expect(ringAlts(firstRow(tree))).toEqual(['cache', 'context', '5h', '7d'])
  for (const n of ringsOf(firstRow(tree))) expect([n.props?.width, n.props?.height]).toEqual([16, 16])
  expect(svgsOf(pillOf(tree, 'cost'))).toEqual([])
  expect([pillText(tree, '5h'), pillText(tree, '7d')]).toEqual(['0% 5h │ 4h 55m', '66% 7d'])
})
test('collapsed is one row on either surface, the toggle last: ▵ shut, ▿ open', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const expanded of [false, true]) {
      const tree = draw({ surface, expanded })
      const row = firstRow(tree) as Node
      expect(visualRows(row, surface)).toBe(1)
      const last = (row.children ?? []).filter(Boolean).at(-1)
      expect(byKey(last, 'more', 'Button')?.props?.label).toBe(expanded ? '▿' : '▵')
    }
})
test('one bold per reading, on its figure', () => {
  expect(boldOf(firstRow(draw()))).toEqual(['59m', '$1,027', '87%', '0%', '66%', '2.1B'])
})
test('no ring draws a thumb: a label-grey notch marks the time gone, and an empty 5h has none', () => {
  const row = firstRow(draw(DESK95))
  expect(ringOf(row, '7d')).toMatch(new RegExp(`class="notch"[^>]*stroke="${DARK.label}"`))
  expect(ringOf(row, '5h')).not.toMatch(/class="notch"/)
  // The notch is knocked out of its pill's tint.
  expect(ringOf(row, '7d')).toMatch(new RegExp(`stroke="${DARK.weekBg}"`))
  for (const n of svgsOf(row)) expect(String(n.props?.source)).not.toMatch(new RegExp(`fill="${DARK.value}"`))
})
test('dashes draw a projection alone: 7d, full before reset, dashes the rest of its ring', () => {
  const row = firstRow(draw(DESK95))
  expect(ringOf(row, '7d')).toMatch(/class="projection"[^>]*stroke-dasharray/)
  for (const name of ['cache', 'context', '5h']) expect(ringOf(row, name)).not.toMatch(/class="projection"/)
})
test('the ascii tier draws each ring in brackets, drops ↻, and turns │ to |', () => {
  const tree = draw({ glyphs: 'ascii' })
  expect(['cache', 'ctx', '5h', '7d'].map(key => pillText(tree, key))).toEqual([
    '(@) 59m cache',
    '(O) 87% context',
    '( ) 0% 5h | 4h 55m',
    '(O) 66% 7d | full before reset | Sat 13:30',
  ])
  expect(byKey(tree, 'more', 'Button')?.props?.label).toBe('^')
})
test('amber leads with ! and its reason in amber, on the amber ground', () => {
  const tree = draw({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } })
  const five = pillOf(tree, '5h')
  expect(shown(five)).toBe('◕ ! 5h 82% │ full before reset │ ↻ 3h 00m')
  expect(five?.props?.backgroundColor).toBe(DARK.amberBg)
  expect(shown(byKey(five, 'amber', 'Text'))).toBe('! 5h 82%')
  expect(byKey(five, 'amber', 'Text')?.props?.color).toBe(DARK.amberFg)
  expect(pillText(draw({ cache: { ...snapOf().cache, msLeft: 30_000, reWarmUsd: 0.8 } }), 'cache')).toMatch(/^○ ! 30s left · re-warm ~\$0\.80$/)
})
test('a passed window says so in its pill, its ring empty', () => {
  const tree = draw({ surface: 'desktop', now: 5 * HOUR })
  expect(pillText(tree, '5h')).toBe('5h reset')
  expect(ringOf(firstRow(tree), '5h')).not.toMatch(/rotate\(-90/)
})
test("open, the four cards, each card's own ring in its head, and spend, with no cap, none", () => {
  const tree = draw({ ...DESK95, ...OPEN })
  const head = (name: string) => byKey(cardOf(tree, name), 'head')
  expect(['cache', 'spend', 'context', 'limits'].map(name => ringAlts(head(name)))).toEqual([['cache'], [], ['context'], ['5h', '7d']])
  expect(['cache', 'spend', 'context', 'limits'].map(name => shown(head(name)))).toEqual(['CACHE59m left', 'SPEND$1,027', 'CONTEXT87% full', 'LIMITS7d 66%'])
  // A card's notch is knocked out of the card's ground.
  expect(ringOf(head('limits'), '7d')).toMatch(new RegExp(`stroke="${DARK.cardBg}"`))
})
test('the terminal lens is each ring as its glyph', () => {
  const tree = draw(OPEN)
  expect(['cache', 'context', 'limits'].map(name => shown(byKey(byKey(cardOf(tree, name), 'head'), 'slot', 'Box')))).toEqual(['●', '◕', '○◕'])
})
test("open adds: at 95 columns each card's first row is one the row left out", () => {
  const tree = draw({ ...DESK95, ...OPEN })
  expect(['cache', 'spend', 'context', 'limits'].map(name => firstRowOf(tree, name))).toEqual([
    're-warm if cold~$0.80',
    'last message$0.10',
    'room left~128k',
    'resetsSat 13:30 · full before reset',
  ])
})
test("where the row says the worst window's reset and pace, LIMITS' first row moves on to the windows", () => {
  const tree = draw(OPEN)
  expect(firstRowOf(tree, 'limits')).toMatch(/^5h/)
  expect(shown(cardOf(tree, 'limits'))).not.toMatch(/Sat 13:30|full before reset/)
  // The 5h's reset on the row isn't the worst's: the lead row still says the 7d's.
  expect(firstRowOf(draw({ ...OPEN, columns: 100 }), 'limits')).toBe('resetsSat 13:30 · full before reset')
})
test('open, the band keeps within its rows', () => {
  for (const surface of ['terminal', 'desktop'] as const) expect(visualRows(draw({ surface, ...OPEN }), surface)).toBeLessThanOrEqual(13)
})
