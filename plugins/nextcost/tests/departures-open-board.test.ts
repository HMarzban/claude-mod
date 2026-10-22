// Departures' open board: one board with a title and the time now, quiet
// headings, flaps only where there are characters, plain remarks, a rule
// between lines on the desktop, and the footer every layout draws.

import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { fixedZone } from '../hooks/format'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { HOUR, LONG, MIN, byKey, fakeEl, flapWords, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

/** 20:06 UTC, the viewer at +00:30: their clock reads 20:36. */
const NOW = 20 * HOUR + 6 * MIN
const ZONE = fixedZone(30)
const at = (pct: number, h: number) => ({ percentUsed: pct, resetsAt: NOW + h * HOUR })
const WS = { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } as BandSnapshot['workspace']
const OTHER = [{ kind: 'spend_limit', ...at(40, 5) }, { kind: 'credit_limit', ...at(20, 9) }] as BandSnapshot['otherLimits']
/** 7D amber at 85%, as spec §3's scenario has it. */
const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({
    layout: 'departures', columns: 120, maxRows: 13, expanded: true, now: NOW, zone: ZONE,
    fiveHour: { ...at(26, 3), etaMs: null }, sevenDay: at(85, 67), cache: { ...snapOf().cache, coldAt: NOW + 59 * MIN }, ...over,
  }), NO_ACT) as unknown as Node
const boardOf = (n: Node): Node | undefined => byKey(n, 'board', 'Box')
const linesOf = (n: Node): Node[] => ((boardOf(n)?.children ?? []) as Node[]).filter(l => l !== null && typeof l === 'object')
const readingLines = (n: Node): Node[] => linesOf(n).filter(l => !['row:header', 'row:headings'].includes(String(l.props?.key)))
const texts = (n: unknown): Node[] => {
  const out: Node[] = []
  walk(n, k => {
    if (k.type === 'Text') out.push(k)
  })
  return out
}
const SURFACES = ['terminal', 'desktop'] as const

test("the header says DEPARTURES, plain and dim, and NOW with the time on the viewer's clock", () => {
  for (const surface of SURFACES) {
    const header = byKey(boardOf(band({ surface })), 'row:header', 'Box')
    expect(shown(header)).toMatch(/^DEPARTURES\s*NOW\s*20:36$/)
    expect(svgsOf(byKey(header, 'line', 'Box'))).toHaveLength(0)
    const [title, now, time] = texts(header)
    expect([title?.props?.color, now?.props?.color, time?.props?.color]).toEqual([DARK.flapDim, DARK.flapDim, DARK.flapText])
  }
  // Another zone, another clock; no zone, no clock.
  expect(shown(byKey(band({ zone: fixedZone(-300) }), 'row:header', 'Box'))).toMatch(/NOW\s*15:06/)
  expect(shown(byKey(band({ zone: undefined }), 'row:header', 'Box'))).toBe('DEPARTURES')
})

test('the column headings are quiet plain text, never flaps', () => {
  for (const surface of SURFACES) {
    const headings = byKey(boardOf(band({ surface })), 'row:headings', 'Box')
    expect(shown(headings)).toMatch(/^ITEM\s*STATUS\s*TIME\s*REMARKS$/)
    expect(svgsOf(headings)).toHaveLength(0)
    for (const t of texts(headings)) expect([t.props?.color, t.props?.backgroundColor]).toEqual([DARK.flapDim, undefined])
  }
})

test('remarks are plain dim text, not flaps; ITEM, STATUS and TIME are flaps', () => {
  const desktop = band({ surface: 'desktop' })
  const cache = byKey(boardOf(desktop), 'row:cache', 'Box')
  expect(flapWords(cache)).toMatch(/^CACHE\s*DEPARTS\s*21:35\b/)
  expect(flapWords(cache)).not.toMatch(/RE-WARM/)
  const remark = texts(cache).find(t => /RE-WARM/.test(shown(t)))
  expect(remark?.props?.color).toBe(DARK.flapDim)
  expect(remark?.props?.backgroundColor).toBeUndefined()
  // In a terminal the flaps are text on their tiles' ground; the remark has none.
  const terminal = byKey(boardOf(band({ surface: 'terminal' })), 'row:cache', 'Box')
  for (const t of texts(terminal)) {
    const said = shown(t)
    expect(`${said} ${t.props?.backgroundColor === DARK.flapBg}`).toBe(`${said} ${/^(CACHE|DEPARTS|21:35)$/.test(said)}`)
  }
})

test('flaps only where there are characters: no blank tile, no empty run of tiles', () => {
  for (const columns of [60, 94, 160]) {
    // The desktop: a tile per character of ITEM, STATUS and TIME, none for a space.
    for (const line of readingLines(band({ surface: 'desktop', columns, otherLimits: OTHER, maxRows: 40 }))) {
      const svg = svgsOf(line).find(s => /class="tile"/.test(String(s.props?.source)))
      const source = String(svg?.props?.source)
      const tiles = [...source.matchAll(/class="tile"/g)].length
      const glyphs = [...source.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1] ?? '').filter(g => g.trim() !== '')
      expect(`${columns} ${line.props?.key} ${tiles}`).toBe(`${columns} ${line.props?.key} ${glyphs.length}`)
    }
    // A terminal: a tile's ground only under characters.
    walk(boardOf(band({ surface: 'terminal', columns, otherLimits: OTHER, maxRows: 40 })), n => {
      if (n.type === 'Text' && n.props?.backgroundColor === DARK.flapBg) expect(shown(n)).toMatch(/^\S(.*\S)?$/)
    })
  }
})

test("no TIME is a dim dash in plain text, in TIME's column", () => {
  for (const surface of SURFACES) {
    const spend = byKey(boardOf(band({ surface })), 'row:spend', 'Box')
    const dash = texts(spend).find(t => shown(t) === '–')
    expect(dash?.props?.color).toBe(DARK.flapDim)
    expect(flapWords(spend)).not.toMatch(/[–-]$/)
  }
})

test("the columns line up: each line's ITEM, STATUS and TIME as wide as the headings', so REMARKS start in one column", () => {
  for (const [surface, palette] of [['terminal', DARK], ['terminal', PLAIN], ['desktop', PLAIN], ['desktop', DARK]] as const)
    for (const columns of [60, 94, 160]) {
      const open = band({ surface, palette, columns, otherLimits: OTHER, maxRows: 40 })
      const at = `${surface} ${palette.filled ? 'filled' : 'plain'} ${columns}`
      const widths = (n: Node | undefined) => ((n?.children ?? []) as Node[]).map(c => c.props?.width)
      const headings = widths(byKey(boardOf(open), 'row:headings', 'Box')).filter(w => w !== undefined)
      expect(headings).toHaveLength(3)
      const lines = readingLines(open)
      expect(lines.length).toBeGreaterThan(5)
      // The desktop's flaps are one Svg a line, its width checked below.
      if (surface === 'terminal' || !palette.filled) for (const line of lines) {
        const flaps = widths(byKey(line, 'flaps', 'Box'))
        const time = byKey(line, 'time', 'Box')?.props?.width
        expect(`${at} ${line.props?.key} ${[...flaps, ...(time === undefined ? [] : [time])]}`).toBe(`${at} ${line.props?.key} ${headings}`)
      }
      // As drawn: the flaps, and TIME's dash where a line has none, end in one column.
      const ends = lines.map(l => cellsOf(((byKey(l, 'line', 'Box')?.children ?? []) as Node[]).filter(k => k.props?.key !== 'remarks') as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL))
      expect(`${at} ${new Set(ends).size}`).toBe(`${at} 1`)
    }
  // The desktop's Svg spans its columns at 10 px each.
  const open = band({ surface: 'desktop', columns: 94 })
  const [item, status, time] = ((byKey(boardOf(open), 'row:headings', 'Box')?.children ?? []) as Node[]).map(c => Number(c.props?.width))
  expect(Number(svgsOf(byKey(open, 'row:cache', 'Box'))[0]?.props?.width)).toBe(10 * ((item ?? 0) + (status ?? 0) + (time ?? 0)))
})

test('a thin rule between lines on the desktop, under the header too; none in a terminal', () => {
  const lines = linesOf(band({ surface: 'desktop' }))
  const ruled = lines.map(l => svgsOf(l).some(s => /class="rule"/.test(String(s.props?.source))))
  // Header, headings, CACHE … 7D: a rule under each but the headings and the last.
  expect(ruled).toEqual([true, false, true, true, true, true, false])
  for (const s of svgsOf(boardOf(band({ surface: 'desktop' }))).filter(s => /class="rule"/.test(String(s.props?.source)))) expect(s.props?.height).toBe(1)
  expect(svgsOf(boardOf(band({ surface: 'terminal' })))).toHaveLength(0)
})

test('each rule spans the board to its right edge, as the header does, at every width', LONG, () => {
  for (let columns = 60; columns <= 200; columns++) {
    const open = band({ surface: 'desktop', columns, otherLimits: OTHER, maxRows: 40 })
    const board = boardOf(open)
    // Nothing in the board narrows a line: its lines stretch across it.
    expect(`${columns} ${board?.props?.alignItems ?? 'stretch'}`).toBe(`${columns} stretch`)
    const inner = 10 * (columns - ROW_SLACK - 2)
    for (const l of linesOf(open)) {
      expect(l.props?.width).toBeUndefined()
      for (const rule of svgsOf(l).filter(s => /class="rule"/.test(String(s.props?.source)))) {
        const source = String(rule.props?.source)
        const drawn = Number(source.match(/<svg[^>]* width="(\d+(?:\.\d+)?)"/)?.[1])
        // No width of its own: drawn past the board's estimate, its slot caps
        // it, so it ends where the board's inner width does.
        const at = `${columns} ${l.props?.key}`
        expect(`${at} ${rule.props?.width} ${/preserveAspectRatio="none"/.test(source)} ${drawn >= 2 * inner}`).toBe(`${at} undefined true true`)
      }
    }
  }
})

test('the footer is the one every layout draws: the workspace strip, Collapse and Hide band; no hint, no workspace on the board', () => {
  for (const surface of SURFACES) {
    const open = band({ surface, workspace: WS })
    const actions = byKey(open, 'actions', 'Box')
    const kids = (actions?.children ?? []) as Node[]
    expect(kids.filter(k => Number(k.props?.flexGrow) > 0).map(k => k.props?.key)).toEqual(['strip'])
    expect(shown(actions)).toMatch(/claude-mod[\s\S]*main[\s\S]*clean/)
    expect(['collapse', 'hide'].map(k => byKey(actions, k, 'Button') !== undefined)).toEqual([true, true])
    expect(shown(open)).not.toMatch(/Bring it back/)
    expect(`${shown(boardOf(open))} ${flapWords(boardOf(open))}`).not.toMatch(/claude-mod|CLAUDE-MOD|CLEAN/)
  }
})

test('short of rows, the remarks go first on the desktop, then the lines in the spec order; an amber line never goes', LONG, () => {
  const ORDER = ['row:other:0', 'row:headings', 'row:spend', 'row:context', 'row:header', 'row:5h']
  for (const surface of SURFACES) {
    let gone = 0
    let remarked = true
    for (let rows = 16; rows >= 4; rows--) {
      const open = band({ surface, maxRows: rows, workspace: WS, otherLimits: OTHER })
      const at = `${surface} ${rows}`
      expect(`${at} ${visualRows(open, surface) <= rows}`).toBe(`${at} true`)
      expect(byKey(open, 'collapse', 'Button')).toBeDefined()
      const keys = linesOf(open).map(l => String(l.props?.key))
      // 7D is amber at 85%: its line stays while the body has a row.
      if (rows >= 5) expect(`${at} ${keys.includes('row:7d')}`).toBe(`${at} true`)
      const present = ORDER.map(k => keys.includes(k))
      const first = present.indexOf(true)
      gone = Math.max(gone, first === -1 ? ORDER.length : first)
      expect(`${at} ${present.slice(gone).every(Boolean) || present.every(p => !p)}`).toBe(`${at} true`)
      const hasRemarks = readingLines(open).some(l => byKey(l, 'remarks') !== undefined)
      // Once gone, the remarks stay gone; on the desktop they go before any line.
      if (readingLines(open).length === 0) continue
      if (!hasRemarks) remarked = false
      else expect(`${at} remarks back`).toBe(`${at} ${remarked ? 'remarks back' : 'never'}`)
      if (surface === 'desktop' && keys.length < 9) expect(`${at} ${hasRemarks}`).toBe(`${at} false`)
    }
    // The terminal's remarks take no row of their own, so they never need to go.
    if (surface === 'terminal') expect(remarked).toBe(true)
  }
})

test('plain has no grounds; the ascii tier draws ASCII alone', () => {
  for (const surface of SURFACES) {
    const plain = boardOf(band({ surface, palette: PLAIN, workspace: WS }))
    expect(plain?.props?.backgroundColor).toBeUndefined()
    walk(plain, n => expect(n.props?.backgroundColor).toBeUndefined())
    expect(svgsOf(plain)).toHaveLength(0)
    expect(shown(plain)).toMatch(/\[CACHE\]/)
  }
  const ascii = band({ surface: 'terminal', glyphs: 'ascii', otherLimits: OTHER, maxRows: 40, columns: 60 })
  expect(shown(boardOf(ascii))).toMatch(/^[\x20-\x7e]*$/)
  expect(shown(boardOf(ascii))).toMatch(/SPEND\s*\$3\.19\s*-/)
})

test('every board line fits its room at every width from 60 to 200, dark and plain, calm and amber', LONG, () => {
  const NEAR = { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false }
  const amber = { context: NEAR, cache: { ...snapOf().cache, msLeft: 40_000, ttl: '5m' as const } }
  for (const surface of SURFACES)
    for (let columns = 60; columns <= 200; columns++)
      for (const palette of [DARK, PLAIN])
        for (const over of [{}, amber]) {
          const open = band({ surface, columns, palette, workspace: WS, otherLimits: OTHER, maxRows: 40, ...over })
          const lines = linesOf(open)
          expect(lines.length).toBeGreaterThan(5)
          for (const l of lines) {
            const cells = cellsOf(l as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL)
            const key = `${surface} ${columns} ${palette.filled ? 'filled' : 'plain'} ${l.props?.key}`
            expect(`${key} ${cells <= columns - ROW_SLACK - 2}`).toBe(`${key} true`)
          }
        }
})
