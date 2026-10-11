// Ledger, the band in plain words: one sentence, its readings named and
// ranked, how it gives way as it narrows, what needs you leading it, and the
// shared cards behind ▵, which never repeat what the sentence says.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { drawBand } from '../hooks/band'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { HOUR, MIN, byKey, cardOf, fakeEl, firstRow, hostClock, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, visualRows, type Mount } from './matrix'

viewSuite('ledger')

/** The band drawn as ledger at 160 columns, the zone's offset known. */
const drawn = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'ledger', columns: 160, utcOffsetMin: 0, ...over }), NO_ACT) as unknown as Node
/** The collapsed row as it reads; the toggle is a Button, its label no text. */
const rowText = (over: Partial<BandSnapshot> = {}): string => shown(firstRow(drawn(over)))
/** The bold Texts of a node, as they read. */
const boldOf = (n: unknown): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}
/** A card's first body row, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])
/** Open at 120 columns and 13 rows: two cards to a line, three rows of body each. */
const opened = (over: Partial<BandSnapshot> = {}): Node => drawn({ expanded: true, columns: 120, maxRows: 13, ...over })

const CALM = 'cache 52m left │ spent $3.19 │ context 40% full │ 5h 4% │ 7d 30% · on pace for ~50% · ↻ Sat 19:00'
const COLD: BandSnapshot['cache'] = { ...snapOf().cache, msLeft: -MIN }
const LAST_MINUTE: BandSnapshot['cache'] = { ...snapOf().cache, msLeft: 30_000 }
const FIVE_82: BandSnapshot['fiveHour'] = { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null }
const FIVE_FILLING: BandSnapshot['fiveHour'] = { percentUsed: 50, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN }
const NEAR_COMPACTION: BandSnapshot['context'] = { tokens: 150_000, window: 200_000, percent: 75, compactAt: 160_000, autoCompactOff: false }

test('one sentence: each reading named, │ between them, the closest limit with its pace and reset', () => {
  expect(rowText()).toBe(CALM)
})
test('mounted, it reads the same on both surfaces', async ($, on) => {
  const mounts: Mount[] = [{ surface: 'terminal', cols: 160 }, { surface: 'desktop', cols: 160 }]
  const trees = await drawCases($, on, { layout: 'ledger', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  for (const m of mounts)
    expect(shown(firstRow(trees[caseKey(m, 'shut')]))).toBe(
      `cache 1h 00m left │ spent $2.41 │ context 38% full │ 5h 4% │ 7d 30% · on pace for ~50% · ↻ ${hostClock(67 * HOUR, 0)}`,
    )
})
test('one bold per reading, on its figure; names, qualifiers and separators in label ink', () => {
  const row = firstRow(drawn())
  expect(boldOf(row)).toEqual(['52m', '$3.19', '40%', '4%', '30%'])
  const inks = new Set<unknown>()
  walk(row, n => {
    if (n.type === 'Text' && n.props?.bold !== true && typeof n.children?.[0] === 'string') inks.add(n.props?.color)
  })
  expect([...inks]).toEqual([DARK.label])
})
test('a cold cache says its price, bold on the price alone', () => {
  const row = firstRow(drawn({ cache: COLD }))
  expect(shown(row)).toMatch(/^cache cold · re-warm ~\$1\.66 │ spent/)
  expect(boldOf(row)[0]).toBe('~$1.66')
})
test('no pills, bars or icons: one ground on the desktop, bare words in a terminal', () => {
  const desktop = firstRow(drawn({ surface: 'desktop' }))
  expect(svgsOf(desktop)).toEqual([])
  expect(byKey(desktop, 'sentence', 'Box')?.props?.backgroundColor).toBe(DARK.surface)
  expect(byKey(firstRow(drawn()), 'sentence', 'Box')?.props?.backgroundColor).toBeUndefined()
  expect(rowText()).not.toMatch(/[█░▓▒●◷]/)
})
test('the toggle is last on the row: ▵ shut, ▿ open', () => {
  for (const [expanded, mark] of [[false, '▵'], [true, '▿']] as const) {
    const kids = ((firstRow(drawn({ expanded })) as Node).children ?? []) as Node[]
    expect(byKey(kids.at(-1), 'more', 'Button')?.props?.label).toBe(mark)
  }
})
test('narrowing, the ↻ clock gives way first, then the pace, the calm 7d, the context, the cost', () => {
  const at = (columns: number) => rowText({ columns })
  expect(at(95)).toBe('cache 52m left │ spent $3.19 │ context 40% full │ 5h 4% │ 7d 30% · on pace for ~50%')
  expect(at(80)).toBe('cache 52m left │ spent $3.19 │ context 40% full │ 5h 4% │ 7d 30%')
  expect(at(65)).toBe('cache 52m left │ spent $3.19 │ context 40% full │ 5h 4%')
  expect(at(48)).toBe('cache 52m left │ spent $3.19 │ 5h 4%')
  expect(at(40)).toBe('cache 52m left │ 5h 4%')
})
test('amber leads, whole and on its own ground', () => {
  expect(rowText({ fiveHour: FIVE_82 })).toBe('! 5h 82% │ cache 52m left │ spent $3.19 │ context 40% full │ 7d 30%')
  expect(rowText({ fiveHour: FIVE_FILLING })).toMatch(/^! 5h full in ~40m │ cache 52m left │/)
  expect(rowText({ context: NEAR_COMPACTION })).toMatch(/^! context 94% · compacts in ~10k │ cache 52m left │ spent \$3\.19 │ 5h 4%/)
  const amber: Node[] = []
  walk(firstRow(drawn({ fiveHour: FIVE_82 })), n => {
    if (n.type === 'Text' && n.props?.color === DARK.amberFg) amber.push(n)
  })
  expect(amber.map(n => [shown(n), n.props?.backgroundColor])).toEqual([['! 5h 82%', DARK.amberBg]])
})
test('at 40 columns a cold cache says its short words, so an amber limit fits beside it', () => {
  expect(rowText({ columns: 40, cache: COLD, fiveHour: FIVE_82 })).toBe('! 5h 82% │ cold ~$1.66')
})
test('the ascii tier: | between readings, commas within, resets in words', () => {
  expect(rowText({ glyphs: 'ascii' })).toBe('cache 52m left | spent $3.19 | context 40% full | 5h 4% | 7d 30%, on pace for ~50%, resets Sat 19:00')
})
test('one row on both surfaces, shut and open', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const expanded of [false, true]) expect(visualRows(firstRow(drawn({ surface, expanded })), surface)).toBe(1)
})

test('open: the four shared cards, their heads with no lens, then Collapse and Hide band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const tree = opened({ surface })
    for (const name of ['cache', 'spend', 'context', 'limits']) {
      expect(cardOf(tree, name)).toBeDefined()
      expect(byKey(cardOf(tree, name), 'slot', 'Box')).toBeUndefined()
    }
    expect([byKey(tree, 'collapse', 'Button')?.props?.label, byKey(tree, 'hide', 'Button')?.props?.label]).toEqual(['Collapse', 'Hide band'])
  }
})
test('open, no fill ends in a thumb', () => {
  const sources = svgsOf(opened({ surface: 'desktop', maxRows: 40 })).map(n => String(n.props?.source))
  expect(sources.length).toBeGreaterThan(0)
  for (const source of sources) expect(source).not.toMatch(/class="thumb"/)
})
test("open, LIMITS skips the closest limit's pace and reset the sentence says", () => {
  expect(firstRowOf(opened(), 'limits')).toMatch(/^5h/)
  // At 80 columns the sentence gives both up, so the card says them.
  expect(firstRowOf(opened({ columns: 80 }), 'limits')).toBe('resetsSat 19:00 · on pace for ~50%')
  // A filling limit's warning says its pace; its reset is still the card's.
  expect(firstRowOf(opened({ fiveHour: FIVE_FILLING }), 'limits')).toBe('resets03:00')
})
test('open, the other cards each lead with what the sentence left out', () => {
  const calm = opened()
  expect([firstRowOf(calm, 'cache'), firstRowOf(calm, 'spend'), firstRowOf(calm, 'context')]).toEqual(['re-warm if cold~$1.66', 'last message$0.21', 'room left~114k'])
  // A price the sentence says, cold or in the last minute, is not said twice.
  expect(firstRowOf(opened({ cache: COLD }), 'cache')).toMatch(/^saved by cache/)
  expect(firstRowOf(opened({ cache: LAST_MINUTE }), 'cache')).toMatch(/^saved by cache/)
  // Nor the room an amber context names.
  expect(firstRowOf(opened({ context: NEAR_COMPACTION }), 'context')).toMatch(/^auto-compacts at/)
})
test('open, the row stays the sentence and the band fits its rows', async ($, on) => {
  const mounts: Mount[] = (['terminal', 'desktop'] as const).flatMap(surface => [13, 40].map(maxRows => ({ surface, cols: 120, maxRows })))
  const trees = await drawCases($, on, { layout: 'ledger', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  for (const m of mounts) {
    const tree = trees[caseKey(m, 'open')]
    expect(shown(firstRow(tree))).toMatch(/^cache 1h 00m left │ spent \$2\.41 │/)
    expect(`${caseKey(m, 'open')} ${visualRows(tree, m.surface) <= (m.maxRows ?? 40)}`).toBe(`${caseKey(m, 'open')} true`)
  }
})
