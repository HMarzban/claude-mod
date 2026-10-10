import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { bodyRowsFor, openView, panel, toggleButton, type Strip } from '../hooks/views/frame'
import { byKey, fakeEl, shown, type Node } from './helpers'
import { NO_ACT, snapOf } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
const opened = (over: Partial<BandSnapshot> = {}, strip?: Strip): Node => {
  const snap = snapOf({ expanded: true, ...over })
  const kit = makeKit(fakeEl, snap)
  const read = readingsOf(snap)
  return openView(kit, read, NO_ACT, panel(kit, 'collapsed', [text('LINE')]), 1, rows => [text(`BODY ${rows}`)], strip) as unknown as Node
}
const WS = { path: '/Users/me/workspace/claude-mod', git: undefined, repoName: undefined }

test('the body gets what is left of the rows, never less than none', () => {
  expect(bodyRowsFor(13, 1, 1)).toBe(8)
  expect(bodyRowsFor(13, 2, 1)).toBe(7)
  expect(bodyRowsFor(4, 2, 1)).toBe(0)
  expect(bodyRowsFor(4, 2, 0)).toBe(0)
})
test("the toggle is chips' own Button", () => {
  const snap = snapOf()
  const chips = byKey(drawBand(fakeEl, snap, NO_ACT), 'more', 'Button')
  const mine = byKey(toggleButton(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT), 'more', 'Button')
  expect(chips).toBeDefined()
  expect(mine?.props).toEqual(chips?.props)
})
test('shut, a view draws its collapsed part alone', () => {
  expect(shown(opened({ expanded: false }))).toBe('LINE')
})
test('open, the body takes the rows left, then the buttons', () => {
  const tree = opened({ maxRows: 13 })
  expect(shown(tree)).toMatch(/BODY 9/)
  expect(byKey(tree, 'collapse', 'Button')).toBeDefined()
  expect(byKey(tree, 'hide', 'Button')).toBeDefined()
})
test('short of rows the body goes, and the buttons stay', () => {
  const tree = opened({ maxRows: 4 })
  expect(shown(tree)).not.toMatch(/BODY/)
  expect(byKey(tree, 'collapse', 'Button')).toBeDefined()
})
test('the strip heads the body while the body keeps a row, then moves to the footer', () => {
  expect(byKey(opened({ maxRows: 13, workspace: WS }), 'strip', 'Box')).toBeDefined()
  expect(byKey(byKey(opened({ maxRows: 5, workspace: WS }), 'actions', 'Box'), 'strip', 'Box')).toBeDefined()
})
test("a view's own strip stands in for the shared one", () => {
  expect(shown(opened({ maxRows: 13, workspace: WS }, () => text('MINE')))).toMatch(/MINE/)
})
