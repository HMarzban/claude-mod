import { test, expect } from 'claude-code/testing'
import { CHART_MIN_PX, barChart, barsWidth, braille, chartFit, dayCells, dayCellsFit, heartbeat, meter, ring, sliceCells, sparkline } from '../hooks/charts'
import { makeKit } from '../hooks/kit'
import { METER_CELLS } from '../hooks/layout'
import { drawBand } from '../hooks/band'
import { byKey, fakeEl, svgsOf, textOf, type Node } from './helpers'
import { NO_ACT, snapOf } from './matrix'

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
  ['ring', ring(desk, { key: 'r', alt: '7d limit 66 percent used', frac: 0.66, color: '#a99cf0', px: 16, notch: 0.4, projectTo: 1 })],
  ['sparkline', sparkline(desk, { key: 's', alt: '5h usage over the last hour', values: [1, 2, 3], color: '#7fcf8a', px: 90, height: 36, projectTo: 1 })],
  ['barChart', barChart(desk, { key: 'b', alt: 'cost of the last 3 messages', values: [1, 2, 9], marked: [false, false, true], color: '#888888', markColor: '#eeeeee', px: 18, height: 36 })],
  ['dayCells', dayCells(desk, { key: 'd', alt: 'weekly limit by day', values: [6, 9, 11, 4, 7, 7, 7], guess: [false, false, false, false, true, true, true], today: 3, color: '#a99cf0', cellPx: 16, height: 16 })],
  ['sliceCells', sliceCells(desk, { key: 'd', alt: 'weekly limit by day', row: { marks: [{ kind: 'measured', pct: 66 }, { kind: 'fills', pct: 34 }, { kind: 'spent', pct: 0 }], notch: 0.6 }, color: '#a99cf0', guess: '#8a80d0', spent: '#7a70c0', ground: '#2a2540', cellPx: 14, wide: true })],
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
test("the meter's tick is a notch in label ink, knocked out in the ground its bar sits on", () => {
  const p = snapOf().palette
  const source = svg(meter(desk, { label: '7d', frac: 0.5, tone: 'calm', accent: '#a99cf0', tick: 0.2, ground: p.weekBg })).props.source
  expect(/<rect class="knockout"[^>]*>/.exec(source)?.[0]).toMatch(new RegExp(`fill="${p.weekBg}"`))
  expect(/<rect class="tick"[^>]*>/.exec(source)?.[0]).toMatch(new RegExp(`fill="${p.label}"`))
  const cells = meter(term, { label: '7d', frac: 0.5, tone: 'calm', accent: '#a99cf0', size: { px: 80, cells: 10 }, tick: 0.2 }) as Node
  expect(byKey(cells, 'run-1', 'Text')?.props?.color).toBe(p.label)
})
test('a guessed day cell is dashed', () => {
  expect(svg(dayCells(desk, { key: 'd', alt: 'week', values: [6, 7], guess: [false, true], today: 0, color: '#a99cf0', cellPx: 16, height: 16 })).props.source).toMatch(/stroke-dasharray/)
})
/** Each day cell's marks, by class, as `<class> <attrs that draw it>`. */
const dayMarks = (source: string): string[] =>
  [...source.matchAll(/<rect class="(\w+)"([^>]*)\/>/g)].map(([, cls, attrs]) => `${cls}${[...(attrs ?? '').matchAll(/ (height|fill|stroke|stroke-dasharray|opacity)="([^"]+)"/g)].map(([, k, v]) => ` ${k}=${v}`).join('')}`)
test("day cells as forecast's board draws them: a measured day solid, its share filled against the cap; today dashed in value ink on a lighter ground; days to come dashed and dim on the track, filled dimmed toward their guess", () => {
  const { palette: p } = desk
  const source = svg(dayCells(desk, { key: 'd', alt: 'week', values: [60, 6, 50], guess: [false, false, true], today: 1, max: 100, color: p.trackStroke, cellPx: 13, height: 14 })).props.source
  expect(dayMarks(source)).toEqual([
    // 60 of 100 fills 60% of the 12px inside its edge.
    `fill height=7.2 fill=${p.trackStroke}`,
    `edge height=13 fill=none stroke=${p.trackStroke}`,
    `ground height=14 fill=${p.trackStroke} opacity=0.45`,
    `fill height=0.7 fill=${p.trackStroke}`,
    `edge height=13 fill=none stroke=${p.value} stroke-dasharray=2 1.6`,
    `ground height=14 fill=${p.meterTrack}`,
    // 50 of 100, guessed: half the 12px, dimmed.
    `guess height=6 fill=${p.trackStroke} opacity=0.45`,
    `edge height=13 fill=none stroke=${p.trackStroke} stroke-dasharray=2 2 opacity=0.75`,
  ])
})
test("day cells as pulse's board draws them: spanning their slot 4px apart, a measured day filled, an empty one a solid edge on the track", () => {
  const { palette: p } = desk
  const cells = svg(dayCells(desk, { key: 'd', alt: 'week', values: [undefined, 10, undefined], color: p.trackStroke, cellPx: 20, height: 14, stretch: true, gapPx: 4 }))
  expect(cells.props.width).toBeUndefined()
  expect(cells.props.source).toMatch(/preserveAspectRatio="none"/)
  expect(dayMarks(cells.props.source)).toEqual([
    `edge height=13 fill=none stroke=${p.meterTrack}`,
    `fill height=12 fill=${p.trackStroke}`,
    `edge height=13 fill=none stroke=${p.trackStroke}`,
    `edge height=13 fill=none stroke=${p.meterTrack}`,
  ])
  // 4px apart, each 3px round.
  const xs = [...cells.props.source.matchAll(/class="edge" x="([\d.]+)"/g)].map(([, x]) => Number(x))
  expect([xs[1]! - xs[0]!, /class="edge"[^>]* rx="3"/.test(cells.props.source)]).toEqual([24, true])
})
// Pulse's SPEND sliver (Task 0): a card lens drawn stretched has no width of its own, so the host
// squashes its bars into whatever slot it gets. Pulse and departures draw none.
test('no chart the new layouts draw stretches: every Svg has its own width and keeps its aspect', () => {
  for (const layout of ['pulse', 'departures'] as const) for (const expanded of [false, true]) {
    const tree = drawBand(fakeEl, snapOf({ layout, surface: 'desktop', columns: 160, maxRows: 13, expanded }), NO_ACT)
    for (const s of svgsOf(tree)) {
      expect(typeof s.props?.width).toBe('number')
      expect(String(s.props?.source)).not.toMatch(/preserveAspectRatio="none"/)
    }
  }
})
// Pulse's open bands are whole rows of 24 px: a chart 40 px tall takes two
// with 8 px of air above it, inside its own Svg, the desktop's only unit finer than a row.
test('air: a chart drawn below its air, the Svg as tall as both, its marks as they were', () => {
  const charts = [
    (air?: number) => sparkline(desk, { key: 's', alt: 'a', values: [1, 2, 3], color: '#7fcf8a', px: 90, height: 40, nowAt: 1, air }),
    (air?: number) => barChart(desk, { key: 'b', alt: 'b', values: [1, 2, 9], marked: [false, false, true], color: '#888888', markColor: '#eeeeee', px: 18, height: 40, shape: 'beats', air }),
    (air?: number) => dayCells(desk, { key: 'd', alt: 'd', values: [6, 9], today: 1, color: '#a99cf0', cellPx: 18, height: 38, air }),
  ]
  for (const chart of charts) {
    const [bare, aired] = [svg(chart()), svg(chart(8))]
    expect(Number(aired.props.height)).toBe(Number(bare.props.height) + 8)
    expect(aired.props.width).toBe(bare.props.width)
    const marks = (source: string) => source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')
    expect(marks(aired.props.source)).toBe(`<g transform="translate(0 8)">${marks(bare.props.source)}</g>`)
  }
})
test('a guessed day is filled toward its guess, dimmed, behind its dashed edge; a measured one solid', () => {
  const source = svg(dayCells(desk, { key: 'd', alt: 'w', values: [50, 50, undefined], guess: [false, true, true], max: 100, color: '#a99cf0', cellPx: 10, height: 16 })).props.source
  const tall = (cls: string) => [...source.matchAll(new RegExp(`<rect class="${cls}"[^>]* height="([\\d.]+)"`, 'g'))].map(([, h]) => Number(h))
  expect([tall('fill'), tall('guess')]).toEqual([[7], [7]])
  expect(source).toMatch(/<rect class="guess"[^>]*opacity="0.45"/)
})
test("chartFit: a chart's px beside its words, up to its most, none under the least; in text its braille while it fits", () => {
  const term = makeKit(fakeEl, snapOf({ surface: 'terminal' }))
  // 40 columns, 20 characters of words at 0.75 a column: 15, the gap 1, 24 left, 240 px.
  expect(chartFit(desk, 40, 'x'.repeat(20), 400, 24)).toBe(240)
  expect(chartFit(desk, 40, 'x'.repeat(20), 120, 24)).toBe(120)
  expect(chartFit(desk, 22, 'x'.repeat(20), 400, 24)).toBe(60)
  expect(chartFit(desk, 20, 'x'.repeat(20), 400, 24)).toBeUndefined()
  expect(CHART_MIN_PX).toBe(48)
  // In text: 24 points are 12 cells.
  expect(chartFit(term, 40, 'x'.repeat(27), 240, 24)).toBe(240)
  expect(chartFit(term, 40, 'x'.repeat(28), 240, 24)).toBeUndefined()
})
test('dayCellsFit: the widest cell, up to its most, that keeps the cells within px; none under 6', () => {
  // Seven 18 px cells, 3 apart, and the outline's 1 either side: 146 px.
  expect(dayCellsFit(146, 7, 18)).toBe(18)
  expect(dayCellsFit(400, 7, 18)).toBe(18)
  expect(dayCellsFit(100, 7, 18)).toBe(11)
  expect(dayCellsFit(60, 7, 18)).toBeUndefined()
  for (const px of [60, 100, 146]) {
    const cell = dayCellsFit(px, 7, 18)
    if (cell !== undefined) expect(Number(svg(dayCells(desk, { key: 'd', alt: 'w', values: [1, 2, 3, 4, 5, 6, 7], color: '#fff', cellPx: cell, height: 16 })).props.width)).toBeLessThanOrEqual(px)
  }
})
// Guard for the day cells pulse reuses: each fill sits in its own cell and is as tall as its value.
for (const [cellPx, height] of [[18, 56], [4, 14]] as const) {
  test(`day cells at ${cellPx}x${height}: each fill lies inside its own cell's edge and is as tall as its value`, () => {
    const values = [50, 100]
    const source = svg(dayCells(desk, { key: 'd', alt: 'week', values, today: 1, max: 100, color: '#a99cf0', cellPx, height })).props.source
    const num = (tag: string, attr: string): number[] => [...source.matchAll(new RegExp(`<rect class="${tag}"[^>]* ${attr}="([\\d.]+)"`, 'g'))].map(([, v]) => Number(v))
    const [edgeX, edgeW, fillX, fillW, fillH] = [num('edge', 'x'), num('edge', 'width'), num('fill', 'x'), num('fill', 'width'), num('fill', 'height')]
    expect(fillX).toHaveLength(2)
    values.forEach((v, i) => {
      expect(fillX[i]!).toBeGreaterThanOrEqual(edgeX[i]! - 0.01)
      expect(fillX[i]! + fillW[i]!).toBeLessThanOrEqual(edgeX[i]! + edgeW[i]! + 0.01)
      expect(Math.abs(fillH[i]! - (v / 100) * (height - 2))).toBeLessThan(0.1)
    })
  })
}
/** The board's week: today measured, tomorrow fills the limit, none left after; now 0.6 into today. */
const WEEK_ROW = { marks: [{ kind: 'measured', pct: 66 }, { kind: 'fills', pct: 34 }, { kind: 'spent', pct: 0 }, { kind: 'guess', pct: 10 }], notch: 0.6 } as const
/** A week with nothing measured yet but a day at 0%, and two days not known. */
const UNKNOWN_ROW = { marks: [{ kind: 'measured', pct: 0 }, { kind: 'unknown', pct: 0 }, { kind: 'unknown', pct: 0 }], notch: undefined } as const
const slices = (kit: typeof desk, wide = true, row: Parameters<typeof sliceCells>[1]['row'] = WEEK_ROW) =>
  sliceCells(kit, { key: 'd', alt: 'week', row, color: '#a99cf0', guess: kit.palette.weekGuess, spent: kit.palette.weekSpent, ground: '#2a2540', cellPx: 14, wide })
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
  expect(textOf(meter(term, { label: '5h', frac: 0.2, tone: 'calm', accent: '#7fcf8a', size, projectTo: 0.5, dash: '╌' }))).toBe('██╌╌╌░░░░░')
})
test('each bar starts where the bars before it end, so barsWidth holds them all', () => {
  const values = [1, 2, 9]
  const source = svg(barChart(desk, { key: 'b', alt: 'cost', values, marked: [false, false, false], color: '#888888', markColor: '#eeeeee', px: barsWidth(values.length), height: 36 })).props.source
  const bars = [...source.matchAll(/<rect class="bar" x="(\d+)" [^>]*width="(\d+)"/g)].map(m => ({ x: Number(m[1]), width: Number(m[2]) }))
  expect(bars.map(b => b.x)).toEqual(values.map((_, i) => barsWidth(i)))
  const last = bars.at(-1)
  expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThan(barsWidth(values.length))
})
test('in text, a ring is its glyph to the nearest quarter, a line or bar chart is braille on its floor', () => {
  expect([0, 0.1, 0.3, 0.5, 0.66, 0.9, 1].map(frac => textOf(ring(term, { key: 'r', alt: 'cache', frac, color: '#7fcf8a', px: 16 })))).toEqual(['○', '○', '◔', '◑', '◕', '●', '●'])
  expect(textOf(sparkline(term, { key: 's', alt: '5h', values: [0, 4, 2, 4], color: '#7fcf8a', px: 90, height: 36 }))).toBe(braille([1, 4, 2, 4], 4))
  expect(textOf(barChart(term, { key: 'b', alt: 'cost', values: [1, 2], marked: [false, true], color: '#888888', markColor: '#eeeeee', px: 12, height: 36 }))).toBe(braille([1, 2], 2))
})
test("a sparkline's max sets the top of its scale, which its projection shares, and it ends bare", () => {
  const source = svg(sparkline(desk, { key: 's', alt: '5h', values: [20, 50], color: '#7fcf8a', px: 90, height: 36, max: 100, projectTo: 1 })).props.source
  expect(/<polyline points="[^"]*,([\d.]+)"/.exec(source)?.[1]).toBe('18')
  expect(Number(/<line [^>]*y2="([^"]+)"/.exec(source)?.[1])).toBe(2)
  expect(source).not.toMatch(/<circle/)
  expect(textOf(sparkline(term, { key: 's', alt: '5h', values: [20, 50], color: '#7fcf8a', px: 90, height: 36, max: 100 }))).toBe(braille([20, 50], 100, 1))
})
test('a stretched chart spans its slot: no width of its own, its marks scaled to the slot', () => {
  for (const el of [
    sparkline(desk, { key: 's', alt: 'context', values: [50, 120], color: '#b8b8c2', px: 90, height: 16, stretch: true }),
    barChart(desk, { key: 'b', alt: 'cost', values: [1, 2], marked: [false, false], color: '#888888', markColor: '#eeeeee', px: 12, height: 16, stretch: true }),
  ]) {
    const n = svg(el)
    expect(n.props.width).toBeUndefined()
    expect(n.props.source).toMatch(/preserveAspectRatio="none"/)
    expect(n.props.source).toMatch(/vector-effect="non-scaling-stroke"|<rect class="bar"/)
  }
})
test("a bar chart's max clips a taller bar to the top, a marked one capped; its level is a rule", () => {
  const source = svg(barChart(desk, { key: 'b', alt: 'cost', values: [1, 9], marked: [false, true], color: '#888888', markColor: '#eeeeee', px: 12, height: 16, max: 3, level: 1 })).props.source
  // 13 px of room under the cap's: a third of it, then all of it.
  expect([...source.matchAll(/<rect class="bar" [^>]*height="(\d+)"/g)].map(m => Number(m[1]))).toEqual([4, 13])
  expect(source).toMatch(/<rect class="cap" [^>]*y="0"/)
  expect(source).toMatch(/<line class="level" [^>]*y1="12"/)
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
test('in text, a slice is a height toward its cap, the notch at the edge nearest now', () => {
  expect(textOf(slices(term))).toBe('▅▅▏▃▃ ╌╌ ▁▁')
  expect(textOf(slices(term, false))).toBe('▅▏▃╌▁')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: 0.2 }))).toBe('▏▅▅ ▃▃ ╌╌ ▁▁')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: 4 }))).toBe('▅▅ ▃▃ ╌╌ ▁▁▏')
  expect(textOf(slices(term, true, { ...WEEK_ROW, notch: undefined }))).toBe('▅▅ ▃▃ ╌╌ ▁▁')
  expect(textOf(slices(makeKit(fakeEl, snapOf({ glyphs: 'ascii' }))))).toBe('##|++ .. ++')
})
test("in text, each kind of slice has its own ink: measured the window's, a guess its dim tint, none left a dimmer one, the notch label grey", () => {
  const { palette } = term
  // Neighbours in one ink share a Text.
  const runs = ((slices(term) as Node).children ?? []) as Node[]
  expect(runs.map(r => [textOf(r), r.props?.color])).toEqual([
    ['▅▅', '#a99cf0'],
    ['▏', palette.label],
    ['▃▃ ', palette.weekGuess],
    ['╌╌ ', palette.weekSpent],
    ['▁▁', palette.weekGuess],
  ])
  expect(palette.weekGuess).not.toBe(palette.label)
  expect(palette.weekSpent).not.toBe(palette.weekGuess)
})
test('a slice not known yet is never drawn as none left, and a measured 0% rises nowhere', () => {
  // Text: the 0% an empty track, as a text meter draws one; a dim dot per cell not known, in the track's grey.
  const runs = ((slices(term, false, UNKNOWN_ROW) as Node).children ?? []) as Node[]
  expect(textOf(slices(term, false, UNKNOWN_ROW))).toBe('░··')
  expect(runs.map(r => r.props?.color)).toEqual([term.palette.meterTrack, term.palette.trackStroke])
  expect(textOf(slices(term, true, UNKNOWN_ROW))).toBe('░░ ·· ··')
  // An idle day between two measured ones keeps its place.
  expect(textOf(slices(term, true, { marks: [{ kind: 'measured', pct: 10 }, { kind: 'measured', pct: 0 }, { kind: 'measured', pct: 5 }], notch: undefined }))).toBe('▁▁ ░░ ▁▁')
  // In ascii a day not known is a dash, as the week board's map draws its dot, never a `?` that reads as a missing glyph.
  const ascii = slices(makeKit(fakeEl, snapOf({ glyphs: 'ascii' })), false, UNKNOWN_ROW) as Node
  expect(textOf(ascii)).toBe('---')
  expect(((ascii.children ?? []) as Node[]).map(r => r.props?.color)).toEqual([term.palette.meterTrack, term.palette.trackStroke])
  // The desktop: the 0% its track alone; a day not known a solid outline, never dashed.
  const source = svg(slices(desk, true, UNKNOWN_ROW)).props.source
  expect(source).not.toContain('stroke-dasharray')
  expect(source.match(new RegExp(`fill="none" stroke="${desk.palette.trackStroke}"`, 'g'))).toHaveLength(2)
  expect(source.match(/fill-opacity="0.35"/g)).toHaveLength(1)
})

const deskKit = () => makeKit(fakeEl, snapOf({ surface: 'desktop' }))
test('beats: one path; no NaN with one value, all re-warms, or all zero', () => {
  for (const [values, marked] of [[[0.2], [false]], [[0.8, 0.9], [true, true]], [[0, 0], [false, false]]] as const) {
    const src = String(svgsOf(barChart(deskKit(), { key: 'b', alt: 'a', values, marked, color: '#fff', markColor: '#fff', px: 84, height: 20, shape: 'beats' }))[0]?.props?.source)
    expect(src).toMatch(/<path class="beats"/)
    expect(src).not.toMatch(/NaN|Infinity/)
  }
})
test('beats: a re-warm is capped flat, a warm beat peaks to a point', () => {
  const tops = (marked: boolean) => {
    const d = String(svgsOf(barChart(deskKit(), { key: 'b', alt: 'a', values: [0.5], marked: [marked], color: '#fff', markColor: '#fff', px: 20, height: 20, max: 1, shape: 'beats' }))[0]?.props?.source).match(/ d="([^"]+)"/)?.[1] ?? ''
    const ys = [...d.matchAll(/L([\d.]+),([\d.]+)/g)].map(m => Number(m[2]))
    return ys.filter(y => y === Math.min(...ys)).length
  }
  expect(tops(true)).toBe(2)
  expect(tops(false)).toBe(1)
})
test('sparkline: nowAt draws a now rule and the points after it dashed; level, a dashed rule', () => {
  const src = String(svgsOf(sparkline(deskKit(), { key: 's', alt: 'a', values: [1, 2, 3, 4, 5], color: '#fff', px: 60, height: 16, max: 10, nowAt: 2, level: 0.8 }))[0]?.props?.source)
  expect(src).toMatch(/class="now"/)
  expect(src).toMatch(/class="ahead"[^>]*stroke-dasharray/)
  expect(src).toMatch(/class="level"[^>]*stroke-dasharray/)
})
test('heartbeat per state; the beat ships still: no animation, never interactive', () => {
  const of = (state: 'still' | 'beat' | 'flat' | 'hollow') => svgsOf(heartbeat(deskKit(), { key: 'h', alt: 'cache warm', state, color: '#F5B14C' }))[0]
  expect(String(of('flat')?.props?.source)).toMatch(/<line/)
  expect(String(of('hollow')?.props?.source)).toMatch(/fill="none"/)
  expect(String(of('still')?.props?.source)).not.toMatch(/animation|<style/)
  expect(of('beat')?.props?.isInteractive).toBeUndefined()
  expect(String(of('beat')?.props?.source)).not.toMatch(/animation|<style/)
  expect(String(of('beat')?.props?.source)).toMatch(/fill="#F5B14C"/)
  expect(heartbeat(makeKit(fakeEl, snapOf({ surface: 'terminal' })), { key: 'h', alt: 'a', state: 'beat', color: '#fff' })).toBeNull()
})
test('beats: the average rule is dotted', () => {
  const src = String(svgsOf(barChart(deskKit(), { key: 'b', alt: 'a', values: [0.5, 0.7], marked: [false, false], color: '#fff', markColor: '#fff', px: 40, height: 20, max: 1, level: 0.6, shape: 'beats' }))[0]?.props?.source)
  expect(src).toMatch(/class="level"[^>]*stroke-dasharray/)
})
test('beats: a zero or tiny value is a flat tick, never a notch below the baseline', () => {
  for (const v of [0, 0.001]) {
    const src = String(svgsOf(barChart(deskKit(), { key: 'b', alt: 'a', values: [v], marked: [false], color: '#fff', markColor: '#fff', px: 20, height: 20, max: 1, shape: 'beats' }))[0]?.props?.source)
    const d = src.match(/ d="([^"]+)"/)?.[1] ?? ''
    const ys = [...d.matchAll(/[ML]([\d.]+),([\d.]+)/g)].map(m => Number(m[2]))
    expect(ys[1]).toBeLessThanOrEqual(16)
  }
})
