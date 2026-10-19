import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { fixedZone } from '../hooks/format'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK, LIGHT, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { withLimits } from './cases'
import { HOUR, MIN, USAGE, byKey, fakeEl, firstRow, flapWords, shown, svgsOf, type Node } from './helpers'
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
test('a passed 5h reset reads 5H RESET PASSED, shut and open, on both surfaces', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const passed = { surface, now: 4 * HOUR, fiveHour: { ...at(4, 3), etaMs: null } }
    const shut = words(firstRow(band(passed)))
    expect(shut).toMatch(/5H\W*RESET PASSED/)
    expect(shut).not.toMatch(/RESET\W*RESET/)
    const open = words(band({ ...passed, expanded: true }))
    expect(open).toMatch(/5H\W*RESET\W*PASSED/)
    expect(open).not.toMatch(/RESET\W*RESET/)
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
test('at its fewest, 60 columns, cache in its last minute and 7d at 82%: CACHE and 7D stay, and the row fits', async ($, on) => {
  const drawn = await drawCases($, on, { scenario: 'lastMinute', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [{ surface: 'terminal', cols: 60 }])
  const row = firstRow(Object.values(drawn)[0]) as Node
  expect(words(row)).toMatch(/CACHE[\s\S]*7D/)
  expect(cellsOf(row as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(60 - ROW_SLACK)
  expect(toggleOf(row)).toBe('▵')
})
test('at its fewest, 60 columns, calm with a cold cache: CACHE and 7D stay, the row fits, and a reading goes only once the remarks have', () => {
  const row = firstRow(band({ surface: 'terminal', columns: 60, sevenDay: at(41, 67), cache: { ...snapOf().cache, msLeft: 0 } })) as Node
  // A terminal's flaps set ITEM and cell a gap apart, which the text holds no space for.
  expect(words(row)).toMatch(/CACHE[\s\S]*7D\W*41%/)
  expect(cellsOf(row as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(60 - ROW_SLACK)
  if (['spend', 'context', '5h'].some(k => byKey(row, k, 'Box') === undefined)) expect(words(row)).not.toMatch(/ON PACE|FULL|RESET/)
})
test('an unknown zone: no clock time on the row or the board', () => {
  for (const expanded of [false, true]) expect(words(band({ surface: 'terminal', zone: undefined, expanded }))).not.toMatch(/\d\d:\d\d/)
})
test('open: DEPARTURES and the time now head the board, then ITEM STATUS TIME REMARKS and the rows in order; the workspace in the footer, off the board', () => {
  const open = band({ surface: 'terminal', expanded: true, workspace: WS })
  // The board's own words: the collapsed row above it is already in order.
  const text = words(byKey(open, 'board', 'Box'))
  expect(text).toMatch(/^DEPARTURES\s*NOW\s*00:00/)
  expect(text).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  expect(text).toMatch(/CACHE[\s\S]*SPEND[\s\S]*CONTEXT[\s\S]*5H[\s\S]*7D/)
  expect(text).not.toMatch(/CLAUDE-MOD|claude-mod/)
  expect(words(byKey(open, 'actions', 'Box'))).toMatch(/claude-mod[\s\S]*main[\s\S]*clean/)
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
/** The calm row at each width, 160 down to its fewest, 60: spec §3's scenario, 7D amber at 85%. */
const NARROWING = Array.from({ length: 101 }, (_, i) => 160 - i)

test("a calm 5H's remark gives way before 5H does: there is a width where it reads 5H 26% alone", () => {
  const forms = NARROWING.map(columns => groupOf(firstRow(band({ surface: 'terminal', columns })), '5h'))
  expect(forms.some(f => /RESET/.test(f))).toBe(true)
  expect(forms.some(f => /ON PACE/.test(f) && !/RESET/.test(f))).toBe(true)
  expect(forms).toContain('5H26%')
})
test("an amber limit keeps its RESET while calm pieces give way, until the amber step", () => {
  let dropping = 0
  for (const columns of NARROWING) {
    const row = firstRow(band({ surface: 'terminal', columns }))
    const five = groupOf(row, '5h')
    // 5H still drawn: the amber step, which comes after it goes, is not reached.
    if (five === '') continue
    if (!/RESET/.test(five)) dropping++
    expect(`${columns} ${groupOf(row, '7d')}`).toMatch(/RESET/)
  }
  expect(dropping).toBeGreaterThan(0)
})
test("every board line fits the board's room: 60, 80 and 200 columns, dark and plain, calm and amber", () => {
  const NEAR = { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false }
  const amber = { context: NEAR, cache: { ...snapOf().cache, msLeft: 40_000, ttl: '5m' as const } }
  for (const surface of ['terminal', 'desktop'] as const)
    for (const columns of [60, 80, 200])
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
test("the low case at 100 terminal columns: readings outrank remarks, so 5H's remark gives way and SPEND stays", async ($, on) => {
  const low = { scenario: 'calm', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(3, 10) } } as const
  const drawn = await drawCases($, on, low, [100, 102].map(cols => ({ surface: 'terminal' as const, cols })))
  const rowAt = (cols: number) => firstRow(drawn[caseKey({ surface: 'terminal', cols }, 'shut')]) as Node
  const cells = (row: Node) => cellsOf(row as unknown as RenderChildren, TERMINAL)
  // At 102 the room is 98: both resets gone, both remarks kept, every group
  // and gap counted: CACHE 19, SPEND 11, CONTEXT 11, 5H 21, 7D 23, six gaps
  // of 2 (the air before ▵ takes two), and ▵ 1.
  const remarked = rowAt(102)
  expect(words(remarked)).not.toMatch(/RESET/)
  expect(['cache', 'spend', 'context', '5h', '7d'].map(k => cells(byKey(remarked, k, 'Box') as Node))).toEqual([19, 11, 11, 21, 23])
  expect(cells(remarked)).toBe(98)
  // At 100, past the 96 its room holds: 5H's remark, ` ON PACE FOR ~8%`,
  // 16 cells, goes; SPEND and 7D's remark stay, 82 cells.
  const at100 = rowAt(100)
  expect(['cache', 'spend', 'context', '5h', '7d'].every(k => byKey(at100, k, 'Box') !== undefined)).toBe(true)
  expect(words(byKey(at100, '5h', 'Box'))).not.toMatch(/ON PACE/)
  expect(words(byKey(at100, '7d', 'Box'))).toMatch(/ON PACE/)
  expect(cells(at100)).toBe(82)
})
test("below its 60 columns departures draws exactly chips' tree; at 60, the board", () => {
  const NEAR = { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false }
  const states: ReadonlyArray<Partial<BandSnapshot>> = [
    {}, { cache: { ...snapOf().cache, msLeft: 0 } }, { context: NEAR }, { cache: { ...snapOf().cache, msLeft: 40_000, ttl: '5m' } },
    { fiveHour: { ...at(82, 3), etaMs: null } }, { workspace: WS, otherLimits: OTHER },
  ]
  for (const surface of ['terminal', 'desktop'] as const)
    for (const palette of [DARK, LIGHT, PLAIN])
      for (const expanded of [false, true])
        for (const over of states) {
          const as = (layout: 'departures' | 'chips', columns: number) => band({ surface, palette, expanded, columns, ...over, layout })
          for (const columns of [40, 50, 59]) expect(as('departures', columns)).toEqual(as('chips', columns))
          expect(words(as('departures', 60))).toMatch(/CACHE/)
          expect(as('departures', 60)).not.toEqual(as('chips', 60))
        }
})
test("open: every reading line's ITEM, STATUS and TIME end where the next line's do, so REMARKS start in one column", () => {
  for (const [surface, palette] of [['desktop', DARK], ['terminal', DARK], ['terminal', PLAIN]] as const)
    for (const columns of [60, 94, 160]) {
      const board = byKey(band({ surface, palette, columns, expanded: true, workspace: WS, otherLimits: OTHER, maxRows: 40 }), 'board', 'Box')
      const lines = ((board?.children ?? []) as Node[]).filter(l => /^row:(cache|spend|context|5h|7d|other)/.test(String(l.props?.key)))
      // The flaps, and TIME's dash where a line has none, before the remark.
      const ends = lines.map(l => {
        const line = byKey(l, 'line', 'Box')
        const lead = ((line?.children ?? []) as Node[]).filter(k => k.props?.key !== 'remarks')
        return cellsOf(lead as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL)
      })
      expect(lines.length).toBeGreaterThan(5)
      expect(`${surface} ${columns} ${new Set(ends).size}`).toBe(`${surface} ${columns} 1`)
    }
})
test("desktop plain: the board's capitals measured as they draw, so a row the measure fits fits", () => {
  // SF at 15 px, measured in Chrome: a capital 9.9 px, a digit 8.8, a bracket
  // 5.5, punctuation 7.0, a space 4.2; a column is 10 px, a gap one column.
  const px = (text: string) => [...text].reduce((n, c) => n + (/[A-Z]/.test(c) ? 9.9 : /\d/.test(c) ? 8.8 : /[[\]]/.test(c) ? 5.5 : c === ' ' ? 4.2 : 7), 0)
  const pace = { fiveHour: { ...at(50, 3), etaMs: 40 * MIN } }
  for (const columns of [60, 80, 120]) {
    const row = firstRow(band({ surface: 'desktop', palette: PLAIN, columns, ...pace })) as Node
    for (const key of ['cache', 'spend', 'context', '5h', '7d']) {
      const group = byKey(row, key, 'Box')
      if (group === undefined) continue
      const runs = ((byKey(group, 'flaps', 'Box')?.children ?? []) as Node[]).map(n => shown(n))
      const drawn = runs.reduce((n, r) => n + px(r), 0) + 10 * (runs.length - 1)
      expect(`${columns} ${key} ${cellsOf(group as unknown as RenderChildren, DESKTOP) * 10 >= drawn}`).toBe(`${columns} ${key} true`)
    }
  }
})
test('give-way: readings outrank calm remarks; both remarks go before SPEND, and at 94 the low case shows all five', async ($, on) => {
  const low = { scenario: 'calm', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(3, 10) } } as const
  const widths = Array.from({ length: 31 }, (_, i) => 60 + 2 * i)
  const drawn = await drawCases($, on, low, widths.map(cols => ({ surface: 'desktop' as const, cols })))
  for (const cols of widths) {
    const row = firstRow(drawn[caseKey({ surface: 'desktop', cols }, 'shut')]) as Node
    const has = (k: string) => byKey(row, k, 'Box') !== undefined
    if (!has('spend')) expect(`${cols} ${words(row)}`).not.toMatch(/ON PACE|FULL/)
    if (cols === 94) expect(['cache', 'spend', 'context', '5h', '7d'].filter(has)).toEqual(['cache', 'spend', 'context', '5h', '7d'])
  }
})
