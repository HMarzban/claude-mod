import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { bodyRowsFor, openView, panel, toggleButton, type Strip } from '../hooks/views/frame'
import { byKey, fakeEl, shown, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

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
test("the toggle is golden's Button: bare on the terminal, framed on the desktop", () => {
  const toggleOf = (over: Partial<BandSnapshot>) => {
    const snap = snapOf(over)
    return byKey(toggleButton(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT), 'more', 'Button')?.props
  }
  expect(toggleOf({})).toEqual({ key: 'more', label: '▿', plain: true, dimColor: true, onPress: NO_ACT.toggleExpanded })
  expect(toggleOf({ surface: 'desktop', expanded: true })).toEqual({ key: 'more', label: '▵', variant: 'secondary', onPress: NO_ACT.toggleExpanded })
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
  const tall = opened({ maxRows: 13, workspace: WS })
  expect(byKey(tall, 'strip', 'Box')).toBeDefined()
  expect(byKey(byKey(tall, 'actions', 'Box'), 'strip', 'Box')).toBeUndefined()
  expect(byKey(byKey(opened({ maxRows: 5, workspace: WS }), 'actions', 'Box'), 'strip', 'Box')).toBeDefined()
})
test("a view's own strip stands in for the shared one", () => {
  expect(shown(opened({ maxRows: 13, workspace: WS }, () => text('MINE')))).toMatch(/MINE/)
})
test("the frame places a view's own strip as the shared one: under a row of air on top, beside the buttons below", () => {
  const mine: Strip = () => text('MINE')
  const top = byKey(opened({ maxRows: 13, workspace: WS }, mine), 'strip', 'Box')
  expect([top?.props?.marginTop, top?.props?.paddingX, top?.props?.width]).toEqual([1, 1, undefined])
  expect(shown(top)).toBe('MINE')
  const footer = byKey(byKey(opened({ maxRows: 5, workspace: WS }, mine), 'actions', 'Box'), 'strip', 'Box')
  expect([footer?.props?.flexGrow, footer?.props?.minWidth, footer?.props?.marginTop]).toEqual([1, 0, undefined])
})
test('with the strip on top and a full body, an open view never passes maxRows', () => {
  const snap = snapOf({ expanded: true, maxRows: 8, workspace: WS })
  const kit = makeKit(fakeEl, snap)
  const tree = openView(kit, readingsOf(snap), NO_ACT, panel(kit, 'collapsed', [text('LINE')]), 1, rows =>
    Array.from({ length: rows }, (_, i) => text(`ROW ${i}`)),
  ) as unknown as Node
  expect(visualRows(tree, 'terminal')).toBeLessThanOrEqual(8)
})
