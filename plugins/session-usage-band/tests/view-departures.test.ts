// Departures, the countdown board: every reading a countdown in chips'
// pills, soonest first with › between them and amber leading, giving way by
// width; behind ▵ the shared cards, each lens its card's place in the queue.

import { test, expect } from 'claude-code/testing'
import type { RenderChildren } from 'claude-code'
import { drawBand } from '../hooks/band'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { HOUR, LONG, MIN, byKey, cardOf, fakeEl, firstRow, shown, walk, type Node } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, visualRows, type Mount } from './matrix'

viewSuite('departures')

type Over = Partial<BandSnapshot>
const draw = (over: Over = {}): Node => drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, ...over }), NO_ACT) as unknown as Node
const rowOf = (over: Over = {}): Node => firstRow(draw(over)) as Node
/** The row's pieces in order, each as `key text`: a pill by its key, `›` by
 *  its own, the air before the spend as `air`. */
const piecesOf = (row: Node): string[] =>
  ((row.children ?? []) as Node[])
    .filter(k => /^p\d+$/.test(String(k?.props?.key)))
    .map(piece => {
      const inner = (piece.children ?? [])[0] as Node | undefined
      const key = String(inner?.props?.key ?? '')
      return key.startsWith('sep') ? '›' : key === 'air' ? 'air' : `${key} ${shown(inner).trim()}`
    })
/** The row's pills by key. */
const keysOf = (row: Node): string[] => piecesOf(row).map(p => p.split(' ')[0] ?? '')
/** Each pill's bold text, joined: its figure. */
const boldOf = (row: Node): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const piece of (row.children ?? []) as Node[]) {
    const pill = (piece?.children ?? [])[0] as Node | undefined
    const key = String(pill?.props?.key ?? '')
    walk(pill, n => {
      if (n.type === 'Text' && n.props?.bold === true) out[key] = `${out[key] ?? ''}${shown(n)}`
    })
  }
  return out
}
/** A context trail growing 6.5k a message: 114k to compaction is 18 messages. */
const TRAIL: Over = { history: { costs: [], context: [50_000, 56_500, 63_000, 69_500, 76_000], fiveHour: [] } }
/** 7d at 79% with its reset 50h off: on its average it fills in ~1d, before then. */
const SEVEN_FILLS: Over = { sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } }

test("calm, every reading is a countdown in chips' pills, soonest first, › between the clocks", () => {
  const row = rowOf()
  expect(piecesOf(row)).toEqual([
    'cache ◷ cache 52m', '›', '5h 5h resets 3h 00m', '›', '7d 7d resets 2d 19h', '›', 'ctx ◔ compacts in ~114k', 'air', 'cost $3.19', 'tokens Σ 225k',
  ])
  expect(byKey(row, '5h', 'Box')?.props?.backgroundColor).toBe(DARK.fiveBg)
  expect(byKey(row, '7d', 'Box')?.props?.backgroundColor).toBe(DARK.weekBg)
})
test('the clocks sort by time left: a 5h reset in 20m runs before the cache', () => {
  expect(keysOf(rowOf({ fiveHour: { percentUsed: 4, resetsAt: new Date(20 * MIN).toISOString(), etaMs: null } }))).toEqual(['5h', '›', 'cache', '›', '7d', '›', 'ctx', 'air', 'cost', 'tokens'])
})
test('a 7d that fills before its reset says when on its average, then the reset after ↻', () => {
  const row = rowOf(SEVEN_FILLS)
  expect(piecesOf(row)[4]).toBe('7d 7d full ~1d │ ↻ 2d 2h')
  // The reset is a qualifier, in label ink, as chips' is.
  expect(byKey(byKey(row, '7d', 'Box'), 'r', 'Text')?.props?.color).toBe(DARK.label)
})
test('compaction counts the messages left at the trail\'s pace, after the clocks', () => {
  expect(piecesOf(rowOf(TRAIL))[6]).toBe('ctx ◔ compacts ~18 msgs')
})
for (const surface of ['terminal', 'desktop'] as const)
  test(`on the ${surface}, each pill is bold on its figure alone`, () => {
    expect(boldOf(rowOf({ surface, ...TRAIL, ...SEVEN_FILLS }))).toEqual({ cache: '52m', '5h': '3h 00m', '7d': '~1d', ctx: '~18', cost: '$3.19' })
  })
test('under 10 minutes the cache is its last call: amber, first, with its price', () => {
  const soon = { fiveHour: { percentUsed: 4, resetsAt: new Date(4 * MIN).toISOString(), etaMs: null } }
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = rowOf({ surface, ...soon, cache: { ...snapOf().cache, msLeft: 6 * MIN } })
    expect(piecesOf(row)[0]).toMatch(/^cache (◷ )?! last call · cache 6m · re-warm ~\$1\.66$/)
    expect(boldOf(row).cache).toBe('6m')
  }
  expect(byKey(rowOf({ surface: 'desktop', cache: { ...snapOf().cache, msLeft: 6 * MIN } }), 'cache', 'Box')?.props?.backgroundColor).toBe(DARK.amberBg)
  // At 10 minutes it still counts calm.
  expect(piecesOf(rowOf({ cache: { ...snapOf().cache, msLeft: 10 * MIN } }))[0]).toBe('cache ◷ cache 10m')
})
test('a 5-minute cache is always under 10 minutes, so its last call is its last minute', () => {
  const at = (msLeft: number) => piecesOf(rowOf({ cache: { ...snapOf().cache, ttl: '5m', msLeft } }))[0]
  expect(at(4 * MIN)).toBe('cache ◷ cache 4m')
  expect(at(30_000)).toBe('cache ◷ ! last call · cache 30s · re-warm ~$1.66')
})
/** 5h at 82% with half an hour to go: on its average it lands at ~91%, short of full. */
const FIVE_82: Over = { fiveHour: { percentUsed: 82, resetsAt: new Date(30 * MIN).toISOString(), etaMs: null } }
test('a limit at 82% is amber and leads, its reset after ↻', () => {
  const row = rowOf(FIVE_82)
  expect(piecesOf(row)[0]).toBe('5h ! 5h 82% │ ↻ 30m')
  expect(byKey(row, '5h', 'Box')?.props?.backgroundColor).toBe(DARK.amberBg)
})
test('a limit at 82% that fills before its reset on its average says when', () => {
  expect(piecesOf(rowOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))[0]).toBe('5h ! 5h full ~25m │ ↻ 3h 00m')
})
test('a measured fill is amber, says when it fills, then its reset', () => {
  expect(piecesOf(rowOf({ fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } }))[0]).toBe('5h ! 5h full ~40m │ ↻ 3h 00m')
})
test('context near compaction is amber and leads with its reason', () => {
  const row = rowOf({ context: { tokens: 150_000, window: 200_000, percent: 75, compactAt: 160_000, autoCompactOff: false } })
  expect(piecesOf(row)[0]).toBe('ctx ◔ ! context 94% · compacts in ~10k')
})
test('a cold cache has gone: it leads with its re-warm, its figure the price', () => {
  const row = rowOf({ cache: { ...snapOf().cache, msLeft: 0 } })
  expect(piecesOf(row)[0]).toBe('cache ◷ cache cold · re-warm ~$1.66')
  expect(boldOf(row).cache).toBe('~$1.66')
})
test('no fill on the band ends in a thumb or a notch', () => {
  for (const tree of [draw({ surface: 'desktop' }), draw({ surface: 'desktop', expanded: true })])
    walk(tree, n => {
      if (n.type === 'Svg') expect(String(n.props?.source)).not.toMatch(/class="(tick|knockout|thumb)"/)
    })
})
for (const surface of ['terminal', 'desktop'] as const)
  test(`on the ${surface}, the toggle ends the row: ▵ shut, ▿ open`, () => {
    for (const expanded of [false, true]) {
      const kids = (rowOf({ surface, expanded }).children ?? []) as Node[]
      expect(byKey(kids.at(-1), 'more', 'Button')?.props?.label).toBe(expanded ? '▿' : '▵')
    }
  })
test('as the row narrows it gives way in order, and always fits', () => {
  // What each width keeps: the tokens go first, then the 7d's reset, the
  // context's icon, the context, the 7d, the spend and last the 5h.
  const ladder = ['tokens', 'reset', 'icon', 'ctx', '7d', 'cost', '5h'] as const
  const has = (row: Node): Record<(typeof ladder)[number], boolean> => {
    const keys = keysOf(row)
    const text = shown(row)
    return { tokens: keys.includes('tokens'), reset: text.includes('↻ 2d 2h'), icon: text.includes('◔'), ctx: keys.includes('ctx'), '7d': keys.includes('7d'), cost: keys.includes('cost'), '5h': keys.includes('5h') }
  }
  const dropped: string[][] = []
  for (let columns = 160; columns >= 40; columns--) {
    const row = rowOf({ columns, ...TRAIL, ...SEVEN_FILLS })
    expect(cellsOf(row as RenderChildren, TERMINAL)).toBeLessThanOrEqual(columns - ROW_SLACK)
    const kept = has(row)
    const gone = ladder.filter(p => !kept[p])
    expect(gone).toEqual(ladder.slice(0, gone.length))
    dropped.push(gone)
  }
  expect(dropped[0]).toEqual([])
  expect(dropped.at(-1)).toEqual([...ladder])
})
test('on the desktop the row gives way by its own measure, in the same order', () => {
  const ladder = ['tokens', 'ctx', '7d', 'cost', '5h'] as const
  for (let columns = 160; columns >= 40; columns -= 5) {
    const row = rowOf({ surface: 'desktop', columns })
    expect(cellsOf(row as RenderChildren, DESKTOP)).toBeLessThanOrEqual(columns)
    const keys = keysOf(row)
    const gone = ladder.filter(p => !keys.includes(p))
    expect(gone).toEqual(ladder.slice(0, gone.length))
  }
})
test('at 40 columns an amber reading holds out, in its short words', () => {
  const at40 = (over: Over) => piecesOf(rowOf({ columns: 40, ...over }))
  expect(at40(FIVE_82)).toEqual(['5h ! 5h 82%', '›', 'cache ◷ cache 52m'])
  expect(at40({ cache: { ...snapOf().cache, msLeft: 30_000 } })).toEqual(['cache ◷ ! last call · cache 30s'])
  expect(at40({ fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } })).toEqual(['5h ! 5h ~40m', '›', 'cache ◷ cache 52m'])
})

// ---- open: the shared cards ------------------------------------------------

const headOf = (tree: Node, name: string): string => shown(byKey(cardOf(tree, name), 'head'))
/** A card's first body row, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])

test("open, the four cards in chips' order, each head led by its place in the queue", () => {
  const tree = draw({ expanded: true, ...TRAIL })
  expect(((byKey(tree, 'cards:0', 'Box')?.children ?? []) as Node[]).map(c => c.props?.key)).toEqual(['card:cache', 'card:spend', 'card:context', 'card:limits'])
  expect(['cache', 'spend', 'context', 'limits'].map(name => headOf(tree, name))).toEqual([
    'CACHE1goes cold52m left',
    'SPENDno clock$3.19',
    'CONTEXT4compacts~18 msgs',
    'LIMITS25h resets37d resets5h in 3h 00m',
  ])
})
test("open, each card's first row is one the row left out", () => {
  // Six rows leave each card one row of body, which a fact takes over its bar.
  const tree = draw({ expanded: true, maxRows: 6, ...TRAIL })
  const row = shown(firstRow(tree))
  const firsts = ['cache', 'spend', 'context', 'limits'].map(name => firstRowOf(tree, name))
  expect(firsts).toEqual(['re-warm if cold~$1.66', 'last message$0.21', 'room left · auto-compacts at 190k~114k', 'used so far5h 4% · 7d 30%'])
  for (const value of ['~$1.66', '$0.21', '~114k', '4% · 7d 30%']) expect(row).not.toContain(value)
  // Without a trail the row says the room, so the card leads with where it compacts.
  expect(firstRowOf(draw({ expanded: true, maxRows: 6 }), 'context')).toBe('auto-compacts at190k')
  // Cold, the row says the re-warm, so the card says what it saved.
  expect(firstRowOf(draw({ expanded: true, maxRows: 6, cache: { ...snapOf().cache, msLeft: 0 } }), 'cache')).toBe('saved by cache~$11.40')
})
test('open, an amber limit the row never shows keeps the LIMITS headline', () => {
  const tree = draw({ expanded: true, otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] })
  expect(headOf(tree, 'limits')).toBe('LIMITS25h resets37d resetsspend 92%!')
})
test('open, LIMITS heads with the soonest window, a fill by when it fills', () => {
  expect(headOf(draw({ expanded: true, fiveHour: undefined, ...SEVEN_FILLS }), 'limits')).toBe('LIMITS27d fills7d full ~1d')
})
for (const surface of ['terminal', 'desktop'] as const)
  test(`open on the ${surface}, the cards keep within the band's rows`, () => {
    for (const maxRows of [10, 13, 20, 40]) {
      const tree = draw({ surface, expanded: true, maxRows, ...TRAIL })
      // A desktop card's edge takes a row above and below, which visualRows leaves out.
      const edges = surface === 'desktop' ? 2 * (byKey(tree, 'cards')?.children ?? []).length : 0
      expect(`${maxRows}: ${visualRows(tree, surface) + edges <= maxRows}`).toBe(`${maxRows}: true`)
    }
  })

// ---- ascii ------------------------------------------------------------------

test('in ascii, › reads >, ◷ and ↻ go, the tokens say their unit, and the toggle is ^', () => {
  const row = rowOf({ glyphs: 'ascii', ...SEVEN_FILLS })
  const text = shown(row)
  expect(piecesOf(row)).toEqual(['cache cache 52m', '›', '5h 5h resets 3h 00m', '›', '7d 7d full ~1d | 2d 2h', '›', 'ctx compacts in ~114k', 'air', 'cost $3.19', 'tokens 225k tok'])
  expect(text).not.toMatch(/[^\x20-\x7e]/)
  expect(text).toMatch(/>/)
  expect(byKey(row, 'more', 'Button')?.props?.label).toBe('^')
})
test('in ascii, the last call reads with commas', () => {
  expect(piecesOf(rowOf({ glyphs: 'ascii', cache: { ...snapOf().cache, msLeft: 6 * MIN } }))[0]).toBe('cache ! last call, cache 6m, re-warm ~$1.66')
})

// ---- a session, end to end ---------------------------------------------------

test('a real session in its last minute reads its last call first, on both surfaces', LONG, async ($, on) => {
  const mounts: Mount[] = [{ surface: 'terminal', cols: 160 }, { surface: 'desktop', cols: 160 }]
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'lastMinute', appearance: 'dark', ttl: '5m' }, mounts)
  for (const m of mounts) expect(piecesOf(firstRow(trees[caseKey(m, 'shut')]) as Node)[0]).toMatch(/^cache (◷ )?! last call · cache 30s · re-warm ~\$\d+\.\d{2}$/)
})
