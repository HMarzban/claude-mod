import { test, expect } from 'claude-code/testing'
import { barChart, braille, dayCells, meter, ring, sparkline, underline } from '../hooks/charts'
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
  ['barChart', barChart(desk, { key: 'b', alt: 'cost of the last 3 messages', values: [1, 2, 9], marked: [false, false, true], color: '#888888', markColor: '#eeeeee', newestColor: '#ececf2', px: 18, height: 36 })],
  ['dayCells', dayCells(desk, { key: 'd', alt: 'weekly limit by day', values: [6, 9, 11, 4, 7, 7, 7], guess: [false, false, false, false, true, true, true], today: 3, color: '#a99cf0', cellPx: 16, height: 16, labels: ['T', 'W', 'T', 'F', 'S', 'S', 'M'] })],
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
test('a guessed day cell is dashed', () => {
  expect(svg(dayCells(desk, { key: 'd', alt: 'week', values: [6, 7], guess: [false, true], today: 0, color: '#a99cf0', cellPx: 16, height: 16 })).props.source).toMatch(/stroke-dasharray/)
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
test('in text, a ring is a meter, a line or bar chart is braille, and an underline is nothing', () => {
  expect(textOf(ring(term, { key: 'r', alt: 'cache', frac: 1, color: '#7fcf8a', px: 30 }))).toBe('█'.repeat(METER_CELLS))
  expect(textOf(sparkline(term, { key: 's', alt: '5h', values: [0, 4, 2, 4], color: '#7fcf8a', px: 90, height: 36 }))).toBe(braille([0, 4, 2, 4], 4))
  expect(textOf(barChart(term, { key: 'b', alt: 'cost', values: [1, 2], marked: [false, true], color: '#888888', markColor: '#eeeeee', px: 12, height: 36 }))).toBe(braille([1, 2], 2))
  expect(underline(term, { key: 'u', alt: 'context', frac: 0.38, color: '#b8b8c2', px: 64 })).toBe(null)
})
test("in text, day cells are a braille height each, a guess is a dot, and today is in brackets", () => {
  const cells = dayCells(term, { key: 'd', alt: 'week', values: [4, 2, undefined, 4], guess: [false, false, false, true], today: 1, color: '#a99cf0', cellPx: 16, height: 16 })
  expect(textOf(cells)).toBe(` ${braille([4, 0], 4)}[${braille([2, 0], 4)}]· · `)
})
test('in text, day cells keep one width wherever today falls', () => {
  const values = [4, 2, 3, 4]
  const widths = values.map((_, today) => textOf(dayCells(term, { key: 'd', alt: 'week', values, today, color: '#a99cf0', cellPx: 16, height: 16 })).length)
  expect(widths).toEqual(values.map(() => 2 * values.length + 1))
})
test('the weather icons draw on the desktop and leave the word to the text', () => {
  for (const [name, alt] of [['sun', 'warm'], ['cloud', 'cooling'], ['snow', 'cold']] as const) {
    expect(svg(desk.icon(name, '#7fcf8a')[0]).props.alt).toBe(alt)
    expect(term.icon(name, '#7fcf8a')).toEqual([])
  }
})
