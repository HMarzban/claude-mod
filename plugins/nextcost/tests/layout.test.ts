// The band's measures: the columns a drawn piece takes, a wide character
// two, as the band counts them and as the fit tests' own count does.

import { test, expect } from 'claude-code/testing'
import { DESKTOP, TERMINAL, cellsOf, textCells } from '../hooks/layout'
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
