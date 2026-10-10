// The shared view helpers: lines and their squeeze, words, facts, sections and the grid.

import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { readingsOf } from '../hooks/reading'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, layoutCachePill, line, lineRoom, section, words, type Keeps } from '../hooks/views/parts'
import type { Amber } from '../hooks/words'
import { byKey, cards, fakeEl, shown, walk, type Node } from './helpers'
import { snapOf } from './matrix'

const kit = (columns = 120) => makeKit(fakeEl, snapOf({ columns }))
const A: Amber = { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
const said = (k: ReturnType<typeof kit>, room: number) =>
  shown(fitLine(k, ['extra', 'more'] as const, room, keeps => line(k, 'l', [
    words(k, 'a', [[keeps.amber(A), 'amber']]),
    keeps.has('more') ? words(k, 'm', [['more words', 'value']]) : null,
    keeps.has('extra') ? words(k, 'e', [['extra words', 'value']]) : null,
  ])))

test("a line's room is the row's, less the slack and the panel's padding", () => {
  expect(lineRoom(kit(120))).toBe(114)
})
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
test('a fact with no value is nothing', () => {
  expect(fact(kit(), 'f', 'saved', undefined)).toBeNull()
  expect(shown(fact(kit(), 'f', 'saved', '~$11.40'))).toBe('saved ~$11.40')
})
test('a section is its title and as many rows as fit', () => {
  const k = kit()
  const rows = [fact(k, 'a', 'a', '1'), null, fact(k, 'b', 'b', '2'), fact(k, 'c', 'c', '3')]
  expect(shown(section(k, 's', 'CACHE', rows, 2))).toBe('CACHEa 1b 2')
})
test('the grid is four to a line from 100 columns, two below, one line when rows are short', () => {
  const k = (cols: number) => kit(cols)
  const four = (c: ReturnType<typeof kit>) => ['A', 'B', 'C', 'D'].map(t => section(c, t, t, [], 0))
  expect(grid(k(120), four(k(120)), 9)).toHaveLength(1)
  expect(grid(k(80), four(k(80)), 9)).toHaveLength(2)
  expect(grid(k(80), four(k(80)), 2)).toHaveLength(1)
  expect(gridRoom(k(120), 9)).toBe(8)
  expect(gridRoom(k(80), 9)).toBe(3)
  expect(gridRoom(k(80), 2)).toBe(1)
  expect(gridRoom(k(80), 9, 3)).toBe(3)
})
test('short of rows, charts go before facts', () => {
  expect(chartsIfRoom(3, ['chart'], ['a', 'b'])).toEqual(['chart', 'a', 'b'])
  expect(chartsIfRoom(2, ['chart'], ['a', 'b'])).toEqual(['a', 'b'])
  expect(chartsIfRoom(3, ['chart'], ['a', 'b'], 2)).toEqual(['a', 'b'])
})
test("a limit's accent is its window's", () => {
  expect(accentOf(kit(), { key: '5h' })).toBe(DARK.fiveAccent)
  expect(accentOf(kit(), { key: '7d' })).toBe(DARK.weekAccent)
  expect(accentOf(kit(), { key: 'other' })).toBe(DARK.meterFill)
})
test("the layouts' cache pill speaks the readings' words, with no hover", () => {
  const snap = snapOf({ cache: { ...snapOf().cache, msLeft: 47_000 } })
  const k = makeKit(fakeEl, snap)
  const long = layoutCachePill(k, readingsOf(snap), false)
  expect(shown(long)).toMatch(/! 47s left · re-warm ~\$1\.66/)
  expect(shown(layoutCachePill(k, readingsOf(snap), true))).toMatch(/! 47s\s*$/)
  expect(cards(long)).toHaveLength(0)
})
test('in the ascii tier the cache pill draws its words in ascii', () => {
  const snap = snapOf({ cache: { ...snapOf().cache, msLeft: 0 }, glyphs: 'ascii' })
  expect(shown(layoutCachePill(makeKit(fakeEl, snap), readingsOf(snap), false))).toBe(' cache cold - re-warm ~$1.66 ')
})
test('off the terminal the ascii tier leaves the cache pill unmapped', () => {
  const snap = snapOf({ surface: 'mobile', cache: { ...snapOf().cache, msLeft: 0 }, glyphs: 'ascii' })
  expect(shown(layoutCachePill(makeKit(fakeEl, snap), readingsOf(snap), false))).toBe(' cache cold · re-warm ~$1.66 ')
})
