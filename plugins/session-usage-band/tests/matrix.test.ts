// Every invariant check, proven on a tree that breaks it.

import { test, expect } from 'claude-code/testing'
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
  expect(failed(view([row(t('a'), toggle('v'))]), { glyphs: 'ascii' })).not.toContain('toggle')
})
test('width: no wider than the columns, except all-amber below 60', () => {
  expect(failed(view([row(t('x'.repeat(130)), toggle())]))).toContain('width')
  expect(failed(view([row(t(`! 30s left · re-warm ~$1.66 ${'x'.repeat(60)}`), toggle())]), { scenario: 'lastMinute', cols: 50 })).not.toContain('width')
})
test('whitespace: none alone on the desktop', () => {
  expect(failed(view([{ type: 'Box', props: { flexDirection: 'row' }, children: [t('a'), ' ', toggle()] }]), { surface: 'desktop' })).toContain('whitespace')
})
test('svgPlacement: Svg only where it draws', () => {
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]))).toContain('svgPlacement')
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]), { surface: 'desktop', appearance: 'plain' })).toContain('svgPlacement')
})
test('svgProps: every Svg has an alt and a width', () => {
  expect(failed(view([row(t('a'), svg({ width: 20 }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
  expect(failed(view([row(t('a'), svg({ alt: 'x' }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
})
test('colour: nothing is red', () => {
  expect(failed(view([row(t('a', { color: '#ff0000' }), toggle())]))).toContain('colour')
  const redFill = svg({ width: 20, alt: 'x', source: '<svg><rect fill="#e5484d"/></svg>' })
  expect(failed(view([row(t('a'), redFill, toggle())]), { surface: 'desktop' })).toContain('colour')
  expect(failed(view([row(t('a', { color: 'error' }), toggle())]), { appearance: 'plain' })).toContain('colour')
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
test('estimate: a price or a fill time carries ~', () => {
  expect(failed(view([row(t('re-warm $1.66'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('5h full 14:20'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('! FULL ~14:20'), toggle())]))).not.toContain('estimate')
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
