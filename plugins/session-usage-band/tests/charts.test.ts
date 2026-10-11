import { test, expect } from 'claude-code/testing'
import { barChart, barsWidth, braille, meter, ring, sliceCells, sparkline, underline } from '../hooks/charts'
import { makeKit } from '../hooks/kit'
import { METER_CELLS } from '../hooks/layout'
import { byKey, fakeEl, textOf, type Node } from './helpers'
import { snapOf } from './matrix'

test('braille puts two values in a cell, four heights each', () => {
  expect(braille([0, 0], 4)).toBe('⠀')
  expect(braille([4, 4], 4)).toBe('⣿')
  expect(braille([1, 0], 4)).toBe('⡀')
  expect(braille([0, 1], 4)).toBe('⢀')
  expect(braille([4, 0, 2], 4)).toBe('⡇⡄')
  expect([...braille([1, 2, 3, 4, 3, 2], 4)].length).toBe(3)
})
test('braille is one column everywhere: every glyph is in U+2800–28FF', () => {
  for (const ch of braille([0, 1, 2, 3, 4, 3, 2, 1], 4)) expect((ch.codePointAt(0) ?? 0) >= 0x2800 && (ch.codePointAt(0) ?? 0) <= 0x28ff).toBe(true)
})

const desk = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
const svg = (el: unknown) => el as Node & { props: { alt: string; width: number; source: string } }
for (const [name, el] of [
  ['ring', ring(desk, { key: 'r', alt: 'cache 87 percent left', frac: 0.87, color: '#7fcf8a', px: 30, dot: 0.4 })],
  ['sparkline', sparkline(desk, { key: 's', alt: '5h usage over the last hour', values: [1, 2, 3], color: '#7fcf8a', px: 90, height: 36, projectTo: 1 })],
  ['sparkline with a level', sparkline(desk, { key: 's', alt: 'context over the conversation', values: [50, 120], color: '#b8b8c2', px: 90, height: 36, max: 200, level: 0.95 })],
  ['barChart', barChart(desk, { key: 'b', alt: 'cost of the last 3 messages', values: [1, 2, 9], marked: [false, false, true], color: '#888888', markColor: '#eeeeee', newestColor: '#ececf2', px: 18, height: 36 })],
  ['sliceCells', sliceCells(desk, { key: 'd', alt: 'weekly limit by day', row: { marks: [{ kind: 'measured', pct: 66 }, { kind: 'fills', pct: 34 }, { kind: 'spent', pct: 0 }], notch: 0.6 }, color: '#a99cf0', ground: '#2a2540', cellPx: 14, wide: true })],
  ['underline', underline(desk, { key: 'u', alt: 'context 38 percent', frac: 0.38, color: '#b8b8c2', px: 64, dashed: true })],
  ['meter with a tick and a projection', meter(desk, { key: 'm', label: '5h', frac: 0.04, tone: 'calm', accent: '#7fcf8a', tick: 0.4, projectTo: 0.1 })],
] as const) {
  test(`${name} draws one Svg with alt, width and no ids`, () => {
    const n = svg(el)
    expect(n.type).toBe('Svg')
    expect(n.props.alt.length).toBeGreaterThan(0)
    expect(n.props.width).toBeGreaterThan(0)
    expect(n.props.source).not.toMatch(/\bid=|<clipPath|<linearGradient|<pattern/)
  })
}
test("the meter's tick is a rect of class tick, and a projection is dashed", () => {
  const source = svg(meter(desk, { label: '5h', frac: 0.04, tone: 'calm', accent: '#7fcf8a', tick: 0.4, projectTo: 0.1 })).props.source
  expect(source).toMatch(/<rect class="tick"/)
  expect(source).toMatch(/stroke-dasharray="3 2"/)
})
test("the meter's tick stays inside the bar at either end", () => {
  for (const tick of [0, 1]) {
    const n = svg(meter(desk, { label: '5h', frac: 0.5, tone: 'calm', accent: '#7fcf8a', tick }))
    const x = Number(/<rect class="tick" x="([^"]+)"/.exec(n.props.source)?.[1])
    const tickWidth = Number(/<rect class="tick"[^>]* width="([^"]+)"/.exec(n.props.source)?.[1])
    expect(x).toBeGreaterThanOrEqual(0)
    expect(x + tickWidth).toBeLessThanOrEqual(n.props.width)
  }
})
test("the meter's tick has a 1 px knockout of the card's ground either side", () => {
  const source = svg(meter(desk, { label: '5h', frac: 0.5, tone: 'calm', accent: '#7fcf8a', tick: 0.5 })).props.source
  const rect = (cls: string) => {
    const tag = new RegExp(`<rect class="${cls}"[^>]*>`).exec(source)?.[0] ?? ''
    return { x: Number(/ x="([^"]+)"/.exec(tag)?.[1]), width: Number(/ width="([^"]+)"/.exec(tag)?.[1]), tag }
  }
  const tick = rect('tick')
  const knockout = rect('knockout')
  expect([knockout.x, knockout.width]).toEqual([tick.x - 1, tick.width + 2])
  expect(knockout.tag).toMatch(new RegExp(`fill="${snapOf().palette.cardBg}"`))
  expect(tick.tag).not.toMatch(/stroke=/)
  expect(source.indexOf('class="knockout"')).toBeLessThan(source.indexOf('class="tick"'))
})
test('a meter of a share says its percent alone, neither used nor left', () => {
  expect(svg(meter(desk, { label: 'hit rate', frac: 0.96, tone: 'calm', accent: '#7fcf8a', reads: 'share' })).props.alt).toBe('hit rate 96%')
})
/** The board's week: today measured, tomorrow fills the limit, none left after; now 0.6 into today. */
const WEEK_ROW = { marks: [{ kind: 'measured', pct: 66 }, { kind: 'fills', pct: 34 }, { kind: 'spent', pct: 0 }, { kind: 'guess', pct: 10 }], notch: 0.6 } as const
const slices = (kit: typeof desk, wide = true, row: Parameters<typeof sliceCells>[1]['row'] = WEEK_ROW) =>
  sliceCells(kit, { key: 'd', alt: 'week', row, color: '#a99cf0', ground: '#2a2540', cellPx: 14, wide })
test('a slice is solid while measured and dashed while guessed, filled toward its cap', () => {
  const source = svg(slices(desk)).props.source
  // Today's 66% of a 12px cell, on a dim track of its own.
  expect(source).toMatch(/<rect x="0" y="6.1" width="14" height="7.9" rx="2" fill="#a99cf0"\/>/)
  expect(source.match(/stroke-dasharray/g)).toHaveLength(3)
  // The fill day's edge alone at full colour; a guess filled at 0.45.
  expect(source.match(/stroke-opacity/g)).toHaveLength(2)
  expect(source.match(/fill-opacity="0.45"/g)).toHaveLength(2)
  expect(svg(slices(desk)).props.width).toBe(4 * 17 - 3)
})
test("a slice row's notch is label grey, knocked out of its ground, and absent where now isn't known", () => {
  const source = svg(slices(desk)).props.source
  const label = snapOf().palette.label
  expect(source).toContain(`<rect x="6.4" y="0" width="4" height="16" rx="1.5" fill="#2a2540"/><rect x="7.4" y="0" width="2" height="16" rx="1" fill="${label}"/>`)
  expect(svg(slices(desk, true, { ...WEEK_ROW, notch: undefined })).props.source).not.toContain(label)
})

const term = makeKit(fakeEl, snapOf())
test('a builder drawn outside a mount keeps its key and its children', () => {
  const n = meter(term, { label: 'context', frac: 0.5, tone: 'calm', accent: '#b8b8c2' }) as Node
  const half = Math.round(METER_CELLS / 2)
  expect(n.type).toBe('Text')
  expect(n.props?.key).toBe('meter')
  expect(byKey(n, 'track', 'Text')).toBeDefined()
  expect(textOf(n)).toBe(`${'█'.repeat(half)}${'░'.repeat(METER_CELLS - half)}`)
})
test("the text meter's tick and projection take a cell each, never widening it", () => {
  const size = { px: 80, cells: 10 }
  expect(textOf(meter(term, { label: '5h', frac: 0.2, tone: 'calm', accent: '#7fcf8a', size, tick: 0.5 }))).toBe('██░░░│░░░░')
  expect(textOf(meter(term, { label: '5h', frac: 0.2, tone: 'calm', accent: '#7fcf8a', size, projectTo: 0.5 }))).toBe('██▒▒▒░░░░░')
  expect(textOf(meter(term, { label: '5h', frac: 0.2, tone: 'calm', accent: '#7fcf8a', size, tick: 1, projectTo: 1 }))).toBe('██▒▒▒▒▒▒▒│')
})
test('each bar starts where the bars before it end, so barsWidth holds them all', () => {
  const values = [1, 2, 9]
  const source = svg(barChart(desk, { key: 'b', alt: 'cost', values, marked: [false, false, false], color: '#888888', markColor: '#eeeeee', px: barsWidth(values.length), height: 36 })).props.source
  const bars = [...source.matchAll(/<rect x="(\d+)" [^>]*width="(\d+)"/g)].map(m => ({ x: Number(m[1]), width: Number(m[2]) }))
  expect(bars.map(b => b.x)).toEqual(values.map((_, i) => barsWidth(i)))
  const last = bars.at(-1)
  expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThan(barsWidth(values.length))
})
test('in text, a ring is a meter, a line or bar chart is braille, and an underline is nothing', () => {
  expect(textOf(ring(term, { key: 'r', alt: 'cache', frac: 1, color: '#7fcf8a', px: 30 }))).toBe('█'.repeat(METER_CELLS))
  expect(textOf(sparkline(term, { key: 's', alt: '5h', values: [0, 4, 2, 4], color: '#7fcf8a', px: 90, height: 36 }))).toBe(braille([0, 4, 2, 4], 4))
  expect(textOf(barChart(term, { key: 'b', alt: 'cost', values: [1, 2], marked: [false, true], color: '#888888', markColor: '#eeeeee', px: 12, height: 36 }))).toBe(braille([1, 2], 2))
  expect(underline(term, { key: 'u', alt: 'context', frac: 0.38, color: '#b8b8c2', px: 64 })).toBe(null)
})
test("a sparkline's max sets the top of its scale, which its projection shares", () => {
  const source = svg(sparkline(desk, { key: 's', alt: '5h', values: [20, 50], color: '#7fcf8a', px: 90, height: 36, max: 100, projectTo: 1 })).props.source
  expect(Number(/<circle [^>]*cy="([^"]+)"/.exec(source)?.[1])).toBe(18)
  expect(Number(/<line [^>]*y2="([^"]+)"/.exec(source)?.[1])).toBe(2)
  expect(textOf(sparkline(term, { key: 's', alt: '5h', values: [20, 50], color: '#7fcf8a', px: 90, height: 36, max: 100 }))).toBe(braille([20, 50], 100))
})
test("a sparkline's level is a solid rule across it, beneath the line, on its scale", () => {
  const source = svg(sparkline(desk, { key: 's', alt: 'context', values: [50, 120], color: '#b8b8c2', px: 90, height: 36, max: 200, level: 0.95 })).props.source
  const rule = /<line class="level"[^>]*>/.exec(source)?.[0] ?? ''
  // 0.95 of the scale's top: 2 px of air, then 0.95 of the 32 px between.
  expect([/ x1="([^"]+)"/.exec(rule)?.[1], / x2="([^"]+)"/.exec(rule)?.[1], / y1="([^"]+)"/.exec(rule)?.[1], / y2="([^"]+)"/.exec(rule)?.[1]]).toEqual(['0', '90', '3.6', '3.6'])
  expect(rule).toMatch(new RegExp(`stroke="${snapOf().palette.trackStroke}"`))
  expect(rule).not.toMatch(/stroke-dasharray/)
  expect(source.indexOf('class="level"')).toBeLessThan(source.indexOf('<polyline'))
  expect(textOf(sparkline(term, { key: 's', alt: 'context', values: [50, 120], color: '#b8b8c2', px: 90, height: 36, max: 200, level: 0.95 }))).toBe(braille([50, 120], 200))
})
test('in text, a slice is a height toward its cap, the notch at the edge nearest now', () => {
  expect(textOf(slices(term))).toBe('▅▅▏▃▃ ╌╌ ▁▁')
  expect(textOf(slices(term, false))).toBe('▅▏▃╌▁')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: 0.2 }))).toBe('▏▅▅ ▃▃ ╌╌ ▁▁')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: 4 }))).toBe('▅▅ ▃▃ ╌╌ ▁▁▏')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: undefined }))).toBe('▅▅ ▃▃ ╌╌ ▁▁')
  // Neighbours in one ink share a Text: measured, guessed and none left, apart.
  expect(((slices(term) as Node).children ?? []).length).toBe(4)
  expect(textOf(slices(makeKit(fakeEl, snapOf({ glyphs: 'ascii' }))))).toBe('##|++ .. ++')
})
test('the weather icons draw on the desktop and leave the word to the text', () => {
  for (const [name, alt] of [['sun', 'warm'], ['cloud', 'cooling'], ['snow', 'cold']] as const) {
    expect(svg(desk.icon(name, '#7fcf8a')[0]).props.alt).toBe(alt)
    expect(term.icon(name, '#7fcf8a')).toEqual([])
  }
})
