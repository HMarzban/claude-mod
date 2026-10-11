// Chips' row as its board draws it: the pills in order, one bold per
// reading, a limit's reset in label ink.

import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { chipsView } from '../hooks/views/chips'
import { MIN, byKey, fakeEl, firstRow, shown, walk, type Node } from './helpers'
import { NO_ACT, snapOf } from './matrix'

const rowOf = (over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ columns: 200, ...over })
  return firstRow(chipsView.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)) as Node
}
const pillKeys = (row: Node): unknown[] => (row.children ?? []).filter(k => (k as Node | null)?.props?.flexShrink === 0 && (k as Node).props?.key !== undefined).map(k => (k as Node).props?.key)

test('the pills run cache, cost, context, 5h and 7d, then the tokens, first to give way', () => {
  expect(pillKeys(rowOf())).toEqual(['cache', 'cost', 'ctx', '5h', '7d', 'tokens'])
})
test("a limit's reset reads in label ink, its pace in its tint, and only its figure is bold", () => {
  const row = rowOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } })
  const five = byKey(row, '5h', 'Box')
  const bold: string[] = []
  walk(five, n => {
    if (n.type === 'Text' && n.props?.bold === true) bold.push(shown(n))
  })
  expect(bold).toEqual([' 84%!'])
  expect(shown(byKey(five, 'p', 'Text'))).toBe(' full in ~40m')
  const seven = byKey(row, '7d', 'Box')
  expect([shown(byKey(seven, 'r', 'Text')), byKey(seven, 'r', 'Text')?.props?.color]).toEqual(['2d 19h', DARK.label])
  expect(byKey(seven, 'i-reset', 'Text')?.props?.color).toBe(DARK.label)
})
