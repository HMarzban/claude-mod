import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { fixedZone } from '../hooks/format'
import { ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK, LIGHT, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { withLimits } from './cases'
import { HOUR, USAGE, byKey, fakeEl, firstRow, flapWords, shown, svgsOf, type Node } from './helpers'
import { NO_ACT, drawCases, snapOf, viewSuite, visualRows } from './matrix'

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
  const text = words(open)
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
