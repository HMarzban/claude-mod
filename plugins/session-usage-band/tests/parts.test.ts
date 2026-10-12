// The shared view helpers: lines and their squeeze, words, the layouts' cache pill and the battery.

import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { DARK, PLAIN } from '../hooks/palette'
import { readingsOf, type Readings } from '../hooks/reading'
import { accentOf, amberFirst, batteryBar, beforeLast, cacheHover, fitLine, layoutCacheSpec, line, once, pill, words, type Keeps } from '../hooks/views/parts'
import type { Amber } from '../hooks/words'
import { byKey, fakeEl, shown, walk, type Node } from './helpers'
import { snapOf } from './matrix'

const kit = (columns = 120) => makeKit(fakeEl, snapOf({ columns }))
const A: Amber = { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
/** A cache with 47s left, amber on its last call. */
const lastCall = { cache: { ...snapOf().cache, msLeft: 47_000 } }
const amberOf = (read: Readings): Amber => {
  if (read.cache.amber === undefined) throw new Error('the cache is calm')
  return read.cache.amber
}
/** The layouts' amber cache pill, drawn. */
const cachePill = (k: ReturnType<typeof kit>, read: Readings, short: boolean) => pill(k, layoutCacheSpec(k, read, amberOf(read), short))
const said = (k: ReturnType<typeof kit>, room: number) =>
  shown(fitLine(k, ['extra', 'more'] as const, room, keeps => line(k, 'l', [
    words(k, 'a', [[keeps.amber(A), 'amber']]),
    keeps.has('more') ? words(k, 'm', [['more words', 'value']]) : null,
    keeps.has('extra') ? words(k, 'e', [['extra words', 'value']]) : null,
  ])))

test('a line drops its calm pieces in order, and shortens amber only after the last', () => {
  const k = kit()
  expect(said(k, 60)).toMatch(/extra words/)
  expect(said(k, 50)).not.toMatch(/extra words/)
  expect(said(k, 50)).toMatch(/more words/)
  expect(said(k, 35)).toMatch(/^! 47s left · re-warm/)
  expect(said(k, 35)).not.toMatch(/more words/)
  expect(said(k, 20)).toBe('! 47s')
})
test('at the last step nothing calm is kept, amber is short, and an amber tone still counts', () => {
  const k = kit()
  let last: Keeps<'x'> | undefined
  fitLine(k, ['x'] as const, 0, keeps => { last = keeps; return line(k, 'l', [words(k, 'w', [['wide words', 'value']])]) })
  expect(last?.has('x')).toBe(false)
  expect(last?.calm('x', 'calm')).toBe(false)
  expect(last?.calm('x', 'amber')).toBe(true)
  expect(last?.amber(A)).toBe('! 47s')
  expect(last === undefined ? true : beforeLast(last)).toBe(false)
})
test('each piece of a line keeps its width; words truncate, never wrap', () => {
  const k = kit()
  const tree = line(k, 'l', [words(k, 'a', [['cache ', 'label'], ['52m', 'value']])]) as unknown as Node
  expect((tree.children?.[0] as Node).props?.flexShrink).toBe(0)
  expect(byKey(tree, 'a', 'Text')?.props?.wrap).toBe('truncate-end')
  expect(shown(tree)).toBe('cache 52m')
})
test('words colour each segment by its role', () => {
  const colours: unknown[] = []
  walk(words(kit(), 'w', [['5h ', 'label'], ['82%', 'amber']]), n => { if (n.props?.color !== undefined) colours.push(n.props.color) })
  expect(colours).toEqual([DARK.label, DARK.amberFg])
})
test("a limit's accent is its window's", () => {
  expect(accentOf(kit(), { key: '5h' })).toBe(DARK.fiveAccent)
  expect(accentOf(kit(), { key: '7d' })).toBe(DARK.weekAccent)
  expect(accentOf(kit(), { key: 'other' })).toBe(DARK.meterFill)
})
test("the layouts' amber cache pill speaks the readings' words, with chips' hover", () => {
  const snap = snapOf(lastCall)
  const k = makeKit(fakeEl, snap)
  const read = readingsOf(snap)
  const long = cachePill(k, read, false)
  expect(shown(long)).toMatch(/^\s*! 47s left · re-warm ~\$1\.66/)
  expect(shown(long)).not.toMatch(/\b0:\d\d/)
  expect(shown(cachePill(k, read, true))).toMatch(/! 47s\s*$/)
  expect(layoutCacheSpec(k, read, amberOf(read), false).hover).toBe(cacheHover(read))
})
test('in the ascii tier the cache pill draws its words in ascii', () => {
  const snap = snapOf({ ...lastCall, glyphs: 'ascii' })
  expect(shown(cachePill(makeKit(fakeEl, snap), readingsOf(snap), false))).toBe(' ! 47s left, re-warm ~$1.66 ')
})
test('off the terminal the ascii tier leaves the cache pill unmapped', () => {
  const snap = snapOf({ ...lastCall, surface: 'mobile', glyphs: 'ascii' })
  expect(shown(cachePill(makeKit(fakeEl, snap), readingsOf(snap), false))).toBe(' ! 47s left · re-warm ~$1.66 ')
})
test('what needs you comes first, each part in its order; a piece is built once', () => {
  const items = [{ n: 1, amber: undefined }, { n: 2, amber: A }, { n: 3, amber: undefined }, { n: 4, amber: A }]
  expect(amberFirst(items).map(i => i.n)).toEqual([2, 4, 1, 3])
  let builds = 0
  const piece = once(() => ++builds)
  expect([piece(), piece(), builds]).toEqual([1, 1, 1])
})
test("a battery the length of a bar: its outline on the desktop, painted cells in a terminal, glyphs where there is no ground", () => {
  const size = { px: 90, cells: 12 }
  const desk = batteryBar(makeKit(fakeEl, snapOf({ surface: 'desktop' })), 0.5, 'calm', 'cache battery 50% left', size) as Node
  expect([desk.type, desk.props?.width, desk.props?.alt]).toEqual(['Svg', 90, 'cache battery 50% left'])
  expect(String(desk.props?.source)).toMatch(/<rect class="charge" x="2.5" y="2.5" width="41.5"/)
  const cells = batteryBar(kit(), 0.5, 'calm', 'cache', size) as Node
  expect([shown(cells), byKey(cells, 'charge', 'Text')?.props?.backgroundColor, byKey(cells, 'drained', 'Text')?.props?.backgroundColor]).toEqual([' '.repeat(12), DARK.warm, DARK.meterTrack])
  expect(shown(byKey(cells, 'charge', 'Text'))).toBe(' '.repeat(6))
  expect(shown(batteryBar(makeKit(fakeEl, snapOf({ palette: PLAIN })), 0.5, 'calm', 'cache', size))).toBe('██████░░░░░░')
})
