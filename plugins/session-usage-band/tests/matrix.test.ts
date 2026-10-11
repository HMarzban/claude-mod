// Every invariant check, proven on a tree that breaks it.

import { test, expect } from 'claude-code/testing'
import type { RenderChildren } from 'claude-code'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import type { Node } from './helpers'
import { invariantErrors, visualRows, type InvariantContext } from './matrix'

const t = (s: string, props: Record<string, unknown> = {}) => ({ type: 'Text', props, children: [s] })
const toggle = (label = '▿') => ({ type: 'Button', props: { label } })
const row = (...kids: unknown[]) => ({ type: 'Box', props: { flexDirection: 'row' }, children: kids })
const svg = (props: Record<string, unknown>) => ({ type: 'Svg', props: { source: '<svg/>', height: 12, ...props } })
const view = (lines: unknown[], rest: unknown[] = []) => ({
  type: 'Box',
  props: { flexDirection: 'column' },
  children: [{ type: 'Box', props: { key: 'collapsed', flexDirection: 'column', paddingX: 1 }, children: lines }, ...rest],
})
const CTX: InvariantContext = {
  layout: 'ledger',
  surface: 'terminal',
  appearance: 'dark',
  cols: 120,
  maxRows: 40,
  scenario: 'calm',
  glyphs: 'unicode',
  expanded: false,
}
/** The names of the checks a tree fails. */
const failed = (tree: unknown, over: Partial<InvariantContext> = {}): string[] =>
  invariantErrors(tree as Node, { ...CTX, ...over }).map(e => e.split(':')[0] ?? '')
const GOOD = view([row(t('cache 52m left'), toggle())])

test('visualRows counts terminal lines and desktop rows of 24 px', () => {
  const two = { type: 'Box', props: { flexDirection: 'column' }, children: [t('a'), t('b')] }
  expect(visualRows(two, 'terminal')).toBe(2)
  const tile = { type: 'Box', props: { flexDirection: 'column' }, children: [t('52m'), t('cache'), svg({ width: 40, height: 4, alt: 'x' })] }
  expect(visualRows(tile, 'desktop')).toBe(2) // 24 + 24 + 4 = 52 px
  expect(visualRows(row(t('a'), svg({ width: 30, height: 30, alt: 'r' })), 'desktop')).toBe(1) // 30 px
  const aired = { type: 'Box', props: { flexDirection: 'column' }, children: [t('a'), { type: 'Box', props: { marginTop: 1 }, children: [t('b')] }] }
  expect(visualRows(aired, 'terminal')).toBe(3)
})
test('a good tree passes every check', () => {
  expect(failed(GOOD)).toEqual([])
})
test('rows: the collapsed part takes the rows its view declares', () => {
  expect(failed(view([row(t('a')), row(t('b'), toggle())]))).toContain('rows')
})
test('toggle: ▿ shut, ▵ open, once', () => {
  expect(failed(view([row(t('a'))]))).toContain('toggle')
  expect(failed(GOOD, { expanded: true })).toContain('toggle')
  expect(failed(view([row(t('a'), toggle(), toggle())]))).toContain('toggle')
  expect(failed(view([row(t('a'), toggle('v'))]), { glyphs: 'ascii' })).not.toContain('toggle')
})
test('width: no wider than the row less its slack on the terminal, the row on the desktop, except all-amber below 60', () => {
  expect(failed(view([row(t('x'.repeat(130)), toggle())]))).toContain('width')
  const wide = view([row(t('x'.repeat(100)), toggle())])
  const terminal = cellsOf(wide.children[0] as RenderChildren, TERMINAL)
  expect(failed(wide, { cols: terminal + ROW_SLACK })).not.toContain('width')
  expect(failed(wide, { cols: terminal + ROW_SLACK - 1 })).toContain('width')
  const desktop = Math.ceil(cellsOf(wide.children[0] as RenderChildren, DESKTOP))
  expect(failed(wide, { surface: 'desktop', cols: desktop })).not.toContain('width')
  const clipped = view([row(t(`! 30s left · re-warm ~$1.66 ${'x'.repeat(60)}`), toggle())])
  expect(failed(clipped, { scenario: 'lastMinute', cols: 50 })).not.toContain('width')
  // One amber reading still fits: only all-amber, which lastMinute stands for, clips.
  expect(failed(view([row(t(`! 5h 82% ${'x'.repeat(60)}`), toggle())]), { scenario: 'limit80', cols: 50 })).toContain('width')
})
test('whitespace: none alone on the desktop', () => {
  const spaced = view([{ type: 'Box', props: { flexDirection: 'row' }, children: [t('a'), ' ', toggle()] }])
  expect(failed(spaced, { surface: 'desktop' })).toContain('whitespace')
})
test('svgPlacement: Svg only where it draws', () => {
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]))).toContain('svgPlacement')
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]), { surface: 'desktop', appearance: 'plain' })).toContain('svgPlacement')
})
test('svgProps: every Svg has an alt and a width', () => {
  expect(failed(view([row(t('a'), svg({ width: 20 }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
  expect(failed(view([row(t('a'), svg({ alt: 'x' }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
})
test('svgProps: no Svg has an id, a gradient, a pattern or a clipPath', () => {
  const desk = { surface: 'desktop' } as const
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x', id: 'bar' }), toggle())]), desk)).toContain('svgProps')
  for (const mark of ['<clipPath id="c"/>', '<linearGradient/>', '<radialGradient/>', '<pattern/>', '<rect id="x"/>'])
    expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x', source: `<svg>${mark}</svg>` }), toggle())]), desk)).toContain('svgProps')
  const plain = svg({ width: 20, alt: 'x', source: '<svg><rect width="2" stroke-width="2"/></svg>' })
  expect(failed(view([row(t('a'), plain, toggle())]), desk)).not.toContain('svgProps')
})
test('colour: nothing is red', () => {
  expect(failed(view([row(t('a', { color: '#ff0000' }), toggle())]))).toContain('colour')
  const redFill = svg({ width: 20, alt: 'x', source: '<svg><rect fill="#e5484d"/></svg>' })
  expect(failed(view([row(t('a'), redFill, toggle())]), { surface: 'desktop' })).toContain('colour')
  expect(failed(view([row(t('a', { color: 'error' }), toggle())]), { appearance: 'plain' })).toContain('colour')
  for (const red of ['red', 'redBright', 'rgb(220, 38, 38)', '#f00', '#ff000080'])
    expect(failed(view([row(t('a', { color: red }), toggle())]))).toContain('colour')
  expect(failed(view([row({ type: 'Box', props: { hover: { color: '#ff0000' } }, children: [t('a')] }, toggle())]))).toContain('colour')
  for (const paint of ['fill="red"', "fill='red'", 'fill="rgb(220,38,38)"', 'stroke="#f00"', 'style="stop-color: #e5484d"'])
    expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x', source: `<svg><rect ${paint}/></svg>` }), toggle())]), { surface: 'desktop' }))
      .toContain('colour')
  expect(failed(view([row({ type: 'Box', props: { key: 'error' }, children: [t('a')] }, toggle())]))).not.toContain('colour')
  expect(failed(view([row(t('PR #100'), toggle('#200'))]))).not.toContain('colour')
  const text = svg({ width: 20, alt: 'PR #100', source: '<svg><text fill="#e5e5e5">#823 52m&#8230;&#8212;</text></svg>' })
  expect(failed(view([row(t('a'), text, toggle())]), { surface: 'desktop' })).not.toContain('colour')
  expect(failed(view([row(t('a', { color: '#e5e5e5' }), toggle())]))).not.toContain('colour')
  expect(failed(view([row(t('a', { backgroundColor: '#7a4e06' }), toggle())]))).not.toContain('colour')
})
test('wording: never suggests sending a message', () => {
  expect(failed(view([row(t('send a message to keep it warm'), toggle())]))).toContain('wording')
})
test("amber: each of the scenario's triggers has its words", () => {
  expect(failed(GOOD, { scenario: 'lastMinute' })).toContain('amber')
  expect(failed(view([row(t('! 30s left · re-warm ~$1.66'), toggle())]), { scenario: 'lastMinute' })).not.toContain('amber')
})
test("amber: another limit's words are owed only open, where it is drawn", () => {
  expect(failed(GOOD, { scenario: 'gatewaySpend' })).not.toContain('amber')
  const open = view([row(t('a'), toggle('▵'))], [t('spend 92%')])
  expect(failed(open, { scenario: 'gatewaySpend', expanded: true })).toContain('amber')
  expect(failed(view([row(t('a'), toggle('▵'))], [t('! spend 92%')]), { scenario: 'gatewaySpend', expanded: true })).not.toContain('amber')
})
test('estimate: a price or a fill time carries ~', () => {
  expect(failed(view([row(t('re-warm $1.66'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('next message $1.66'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('5h full 14:20'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('7d on pace for 50%'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('last message $0.21'), toggle())]))).not.toContain('estimate')
  expect(failed(view([row(t('! FULL ~14:20'), toggle())]))).not.toContain('estimate')
})
test('projection: a landing of 100% or more says full before reset', () => {
  expect(failed(view([row(t('7d ~112% at reset'), toggle())]), { scenario: 'sevenFullBeforeReset' })).toContain('projection')
  expect(failed(view([row(t('7d full before reset'), toggle())]), { scenario: 'sevenFullBeforeReset' })).not.toContain('projection')
})
test('unknown: context not reported never reads 0%', () => {
  for (const said of ['context 0%', 'ctx 0%', 'CONTEXT 0%']) expect(failed(view([row(t(said), toggle())]), { scenario: 'warming' })).toContain('unknown')
  expect(failed(view([row(t('context –'), toggle())]), { scenario: 'warming' })).not.toContain('unknown')
})
test('empty: no NaN, undefined, null or empty Text', () => {
  for (const said of ['context NaN%', '↻ undefined', 'null left', '↻ UNDEFINED'])
    expect(failed(view([row(t(said), toggle())]))).toContain('empty')
  expect(failed(view([row(t('a'), svg({ width: 20, alt: '5h undefined' }), toggle())]), { surface: 'desktop' })).toContain('empty')
  expect(failed(view([row(t('a'), t(''), toggle())]))).toContain('empty')
  // In the ascii tier a glyph-only Text, such as an icon's `↻ `, maps to nothing.
  expect(failed(view([row(t('a'), t(''), toggle('v'))]), { glyphs: 'ascii' })).not.toContain('empty')
})
test("emptyState: open, each empty state follows its own section's name", () => {
  const open = (body: unknown[], said = 'cache 52m left') => view([row(t(said), toggle('▵'))], body)
  expect(failed(open([t('none reported')]), { expanded: true })).toContain('emptyState')
  expect(failed(open([t('CONTEXT'), t('none reported')]), { expanded: true })).toContain('emptyState')
  expect(failed(open([t('LIMITS'), t('none reported'), t('Context'), t('not reported')]), { expanded: true })).not.toContain('emptyState')
  // The collapsed part says its own: week's `5h · 7d none reported`.
  expect(failed(open([t('LIMITS')], '5h · 7d none reported'), { expanded: true })).not.toContain('emptyState')
})
test("glyphs: the tier's own, and ASCII alone in the ascii tier", () => {
  expect(failed(view([row(t('◐ cache'), toggle())]))).toContain('glyphs')
  expect(failed(view([row(t('cache · 52m'), toggle('v'))]), { glyphs: 'ascii' })).toContain('glyphs')
})
test('size: at most 400 nodes shut, 1,500 open', () => {
  expect(failed(view([row(...Array.from({ length: 400 }, (_, i) => t(String(i % 10))), toggle())]))).toContain('size')
})
test('height: open, the view fits maxRows', () => {
  expect(failed(view([row(t('a'), toggle('▵'))], [t('b'), t('c')]), { expanded: true, maxRows: 2 })).toContain('height')
})
