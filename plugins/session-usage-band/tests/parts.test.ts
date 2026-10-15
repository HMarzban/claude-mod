// The shared view helpers: lines and their squeeze, words, and a limit's accent.

import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { accentOf, beforeLast, fitLine, line, words, type Keeps } from '../hooks/views/parts'
import type { Amber } from '../hooks/words'
import { byKey, fakeEl, shown, walk, type Node } from './helpers'
import { snapOf } from './matrix'

const kit = (columns = 120) => makeKit(fakeEl, snapOf({ columns }))
const A: Amber = { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
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
