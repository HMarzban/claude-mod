// The band's measures: the columns a drawn piece takes, a wide character
// two, as the band counts them and as the fit tests' own count does; and the
// clips that cut a line to its columns.

import { test, expect } from 'claude-code/testing'
import { DESKTOP, TERMINAL, cellsOf, clipMiddle, clipToTiles, clipWords, textCells } from '../hooks/layout'
import { widthOf } from './helpers'

test('a column Box is as wide as its widest row', () => {
  const col = {
    type: 'Box',
    props: { flexDirection: 'column' },
    children: [
      { type: 'Text', props: {}, children: ['abcdef'] },
      { type: 'Text', props: {}, children: ['abc'] },
    ],
  }
  expect(cellsOf(col as never, TERMINAL)).toBe(6)
})

test('a wide character takes two columns, in every measure; an ambiguous glyph one', () => {
  expect([textCells('設計メモ'), textCells('main'), textCells('│ · …'), textCells('한글'), textCells('ＡＢ')]).toEqual([8, 4, 5, 4, 4])
  expect([cellsOf('設計', TERMINAL), cellsOf('設計', DESKTOP)]).toEqual([4, 3])
})
test("the fit tests' own count takes a wide character as two columns, as the terminal draws it", () => {
  expect([widthOf('日本'), widthOf('😀a'), widthOf({ type: 'Button', props: { label: '日本' } })]).toEqual([4, 3, 4])
})

test('a line too long is cut at its last whole word, with a `.`, within the room', () => {
  expect(clipWords('$0.41 spent during your last message, subagents included', 50)).toBe('$0.41 spent during your last message, subagents.')
  expect(clipWords('76k of 200k (38%); older turns get summarized near full', 20)).toBe('76k of 200k (38%).')
  expect(clipWords('Resets in 3h 00m', 16)).toBe('Resets in 3h 00m')
  expect(clipWords('Resets in 3h 00m', 13)).toBe('Resets in 3h.')
  // A first word longer than the room is cut where the room ends.
  expect(clipWords('uncommitted', 6)).toBe('uncom.')
})

test('a name that fits is kept whole', () => {
  expect(clipMiddle('abcdef', 10)).toBe('abcdef')
  expect(clipMiddle('abcdef', 6)).toBe('abcdef')
  expect(clipMiddle('', 0)).toBe('')
})

test('a name too long is cut in the middle to exactly the room, the head getting the odd character', () => {
  expect(clipMiddle('abcdef', 5)).toBe('ab…ef')
  expect(clipMiddle('abcdef', 4)).toBe('ab…f')
  expect(clipMiddle('abcdef', 3)).toBe('a…f')
  expect(clipMiddle('abcdef', 2)).toBe('a…')
  expect(clipMiddle('claude/a-rather-long-feature-branch', 15)).toBe('claude/…-branch')
})

test('with room for one character the name is an ellipsis, and with none it is empty', () => {
  expect(clipMiddle('abcdef', 1)).toBe('…')
  expect(clipMiddle('abcdef', 0)).toBe('')
  expect(clipMiddle('abcdef', -1)).toBe('')
})

test('a name is clipped by the columns it takes, never through a character: a wide one takes two', () => {
  expect(clipMiddle('😀😀😀😀', 5)).toBe('😀…😀')
  // A column the head can't use goes to the end.
  expect(clipMiddle('😀😀😀😀', 3)).toBe('…😀')
  expect(clipMiddle('日本語のブランチ名', 9)).toBe('日本…チ名')
  expect(clipMiddle('日本語', 6)).toBe('日本語')
})

test('a line too long is cut by the columns it takes, a wide character two', () => {
  expect(clipWords('日本語 の ブランチ', 8)).toBe('日本語.')
  expect(clipWords('こんにちは世界', 6)).toBe('こん.')
  expect(clipWords('日本語', 6)).toBe('日本語')
})
test('clipToTiles cuts with an ellipsis and leaves a short one whole', () => {
  expect(clipToTiles('IN 38 MIN · RE-WARM', 6)).toBe('IN 38…')
  expect(clipToTiles('IN 38 MIN', 40)).toBe('IN 38 MIN')
  // A wide character is never split, and a column or less holds nothing.
  expect(clipToTiles('日本語', 4)).toBe('日…')
  expect(clipToTiles('IN 38 MIN', 1)).toBe('')
})
