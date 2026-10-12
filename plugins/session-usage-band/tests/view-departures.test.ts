import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { fixedZone } from '../hooks/format'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK, LIGHT, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { withLimits } from './cases'
import { HOUR, USAGE, byKey, fakeEl, firstRow, flapWords, shown, svgsOf, type Node } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('departures')

const at = (pct: number, h: number) => ({ percentUsed: pct, resetsAt: new Date(h * HOUR).toISOString() })
const LIMITS = { fiveHour: { ...at(26, 3), etaMs: null }, sevenDay: at(85, 67) }
const WS = { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } as BandSnapshot['workspace']
// Two other limits, as spec §5.3's count at 13 rows has.
const OTHER = [{ kind: 'spend_limit', ...at(40, 5) }, { kind: 'credit_limit', ...at(20, 9) }] as BandSnapshot['otherLimits']
const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, maxRows: 13, zone: fixedZone(0), ...LIMITS, ...over }), NO_ACT) as unknown as Node
const words = (n: unknown) => `${shown(n)} ${flapWords(n)}`
const toggleOf = (row: Node) => byKey(row.children?.at(-1), 'more', 'Button')?.props?.label

test('collapsed: one row, a group per reading in the one order, then ▵', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = firstRow(band({ surface })) as Node
    expect(['cache', 'spend', 'context', '5h', '7d'].map(k => byKey(row, k, 'Box') !== undefined)).toEqual([true, true, true, true, true])
    expect(toggleOf(row)).toBe('▵')
    expect(visualRows(row, surface)).toBe(1)
  }
})
test('desktop: one flap Svg per reading, each at most 20 px tall, its alt in words', () => {
  const svgs = svgsOf(firstRow(band({ surface: 'desktop' })))
  expect(svgs).toHaveLength(5)
  for (const s of svgs) {
    expect(Number(s.props?.height)).toBeLessThanOrEqual(20)
    expect(String(s.props?.alt).replace(/5h|7d/g, '')).not.toMatch(/↻|\b[A-Z]{2,}\b/)
  }
})
test('at 40 columns, cache in its last minute and 7d at 82%: CACHE and 7D stay, and the row fits', async ($, on) => {
  const drawn = await drawCases($, on, { scenario: 'lastMinute', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [{ surface: 'terminal', cols: 40 }])
  const row = firstRow(Object.values(drawn)[0]) as Node
  expect(words(row)).toMatch(/CACHE[\s\S]*7D/)
  expect(cellsOf(row as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(40 - ROW_SLACK)
  expect(toggleOf(row)).toBe('▵')
})
test('at 40 columns calm: CACHE and 7D only', () => {
  const row = firstRow(band({ surface: 'terminal', columns: 40, sevenDay: at(41, 67) })) as Node
  expect(['spend', 'context', '5h'].map(k => byKey(row, k, 'Box'))).toEqual([undefined, undefined, undefined])
  // A terminal's flaps set ITEM and cell a gap apart, which the text holds no space for.
  expect(words(row)).toMatch(/CACHE[\s\S]*7D\W*41%/)
})
test('an unknown zone: no clock time on the row or the board', () => {
  for (const expanded of [false, true]) expect(words(band({ surface: 'terminal', zone: undefined, expanded }))).not.toMatch(/\d\d:\d\d/)
})
test('open: the workspace header, ITEM STATUS TIME REMARKS, the rows in order, the footer off the board', () => {
  const open = band({ surface: 'terminal', expanded: true, workspace: WS })
  // The board's own words: the collapsed row above it is already in order.
  const text = words(byKey(open, 'board', 'Box'))
  expect(text).toMatch(/CLAUDE-MOD\s*MAIN\s*CLEAN/)
  expect(text).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  expect(text).toMatch(/CACHE[\s\S]*SPEND[\s\S]*CONTEXT[\s\S]*5H[\s\S]*7D/)
  expect(byKey(byKey(open, 'board', 'Box'), 'collapse', 'Button')).toBeUndefined()
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
})
test('the board has its dark ground in dark and light, none in plain', () => {
  for (const [palette, ground] of [[DARK, DARK.boardBg], [LIGHT, LIGHT.boardBg], [PLAIN, undefined]] as const)
    expect(byKey(band({ surface: 'terminal', expanded: true, palette }), 'board', 'Box')?.props?.backgroundColor).toBe(ground)
})
test('open at 13 rows with the other limits: the band takes all 13 on the terminal, at most 13 on the desktop', () => {
  const open = (surface: 'terminal' | 'desktop') => visualRows(band({ surface, expanded: true, workspace: WS, otherLimits: OTHER }), surface)
  expect(open('terminal')).toBe(13)
  // The desktop's flaps are 20 px against a 24 px row, so its board is shorter.
  expect(open('desktop')).toBeLessThanOrEqual(13)
})
test('open: as rows run out, the board gives way in the spec order and the footer stays', () => {
  const ORDER = ['row:other:0', 'row:headings', 'row:spend', 'row:context', 'row:header', 'row:5h']
  let gone = 0
  for (let rows = 13; rows >= 4; rows--) {
    const open = band({ surface: 'terminal', expanded: true, maxRows: rows, workspace: WS, otherLimits: OTHER })
    expect(byKey(open, 'collapse', 'Button')).toBeDefined()
    expect(visualRows(open, 'terminal')).toBeLessThanOrEqual(rows)
    const present = ORDER.map(k => byKey(byKey(open, 'board', 'Box'), k, 'Box') !== undefined)
    const first = present.indexOf(true)
    gone = Math.max(gone, first === -1 ? ORDER.length : first)
    expect(present.slice(gone).every(Boolean) || present.every(p => !p)).toBe(true)
  }
})

/** A reading's group on the collapsed row, as its words read. */
const groupOf = (row: unknown, key: string) => words(byKey(row, key, 'Box')).trim()
/** The calm row at each width, widest first: spec §3's scenario, 7D amber at 85%. */
const NARROWING = Array.from({ length: 121 }, (_, i) => 160 - i)

test("a calm 5H's remark gives way before 5H does: there is a width where it reads 5H 26% alone", () => {
  const forms = NARROWING.map(columns => groupOf(firstRow(band({ surface: 'terminal', columns })), '5h'))
  expect(forms.some(f => /↻/.test(f))).toBe(true)
  expect(forms.some(f => /ON PACE/.test(f) && !/↻/.test(f))).toBe(true)
  expect(forms).toContain('5H26%')
})
test("an amber limit keeps its ↻ while calm pieces give way, until the amber step", () => {
  let dropping = 0
  for (const columns of NARROWING) {
    const row = firstRow(band({ surface: 'terminal', columns }))
    const five = groupOf(row, '5h')
    // 5H still drawn: the amber step, which comes after it goes, is not reached.
    if (five === '') continue
    if (!/↻/.test(five)) dropping++
    expect(`${columns} ${groupOf(row, '7d')}`).toMatch(/↻/)
  }
  expect(dropping).toBeGreaterThan(0)
})
test("every board line fits the board's room: 40, 80 and 200 columns, dark and plain, calm and amber", () => {
  const NEAR = { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false }
  const amber = { context: NEAR, cache: { ...snapOf().cache, msLeft: 40_000, ttl: '5m' as const } }
  for (const surface of ['terminal', 'desktop'] as const)
    for (const columns of [40, 80, 200])
      for (const palette of [DARK, PLAIN])
        for (const over of [{}, amber]) {
          const open = band({ surface, columns, palette, expanded: true, workspace: WS, otherLimits: OTHER, maxRows: 40, ...over })
          const board = byKey(open, 'board', 'Box')
          const lines = (board?.children ?? []) as Node[]
          expect(lines.length).toBeGreaterThan(0)
          for (const l of lines) {
            const cells = cellsOf(l as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL)
            expect(`${surface} ${columns} ${palette.filled ? 'filled' : 'plain'} ${l.props?.key} ${cells <= columns - ROW_SLACK - 2}`)
              .toBe(`${surface} ${columns} ${palette.filled ? 'filled' : 'plain'} ${l.props?.key} true`)
          }
        }
})
test('the low case at 100 terminal columns gives SPEND way rightly: with it the row is 98 cells, past the 96 its room holds', async ($, on) => {
  const low = { scenario: 'calm', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(3, 10) } } as const
  const drawn = await drawCases($, on, low, [100, 102].map(cols => ({ surface: 'terminal' as const, cols })))
  const rowAt = (cols: number) => firstRow(drawn[caseKey({ surface: 'terminal', cols }, 'shut')]) as Node
  const cells = (row: Node) => cellsOf(row as unknown as RenderChildren, TERMINAL)
  // At 102 the room is 98: both resets gone, SPEND kept. That row is the
  // one 100 columns would draw with SPEND, every group and gap counted:
  // CACHE 19, SPEND 11, CONTEXT 11, 5H 21, 7D 23, six gaps of 2 (the air
  // before ▵ takes two), and ▵ 1.
  const withSpend = rowAt(102)
  expect(byKey(withSpend, 'spend', 'Box')).toBeDefined()
  expect(words(withSpend)).not.toMatch(/↻/)
  expect(['cache', 'spend', 'context', '5h', '7d'].map(k => cells(byKey(withSpend, k, 'Box') as Node))).toEqual([19, 11, 11, 21, 23])
  expect(cells(withSpend)).toBe(98)
  expect(cells(withSpend)).toBeGreaterThan(100 - ROW_SLACK)
  // So at 100 SPEND gives way, and the row is 85 cells.
  const at100 = rowAt(100)
  expect(byKey(at100, 'spend', 'Box')).toBeUndefined()
  expect(cells(at100)).toBe(85)
})
