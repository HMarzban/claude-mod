import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { HOTKEY_MARK, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { bodyRowsFor, footer, toggleButton } from '../hooks/views/frame'
import type { RenderChildren } from 'claude-code'
import { byKey, fakeEl, shown, type Node } from './helpers'
import { NO_ACT, kitOf, snapOf } from './matrix'

test('the body gets what is left of the rows, never less than none', () => {
  expect(bodyRowsFor(13, 1, 1)).toBe(8)
  expect(bodyRowsFor(13, 2, 1)).toBe(7)
  expect(bodyRowsFor(4, 2, 1)).toBe(0)
  expect(bodyRowsFor(4, 2, 0)).toBe(0)
})
test("the toggle is golden's Button: bare on the terminal at full ink, framed on the desktop", () => {
  const toggleOf = (over: Partial<BandSnapshot>) => {
    const snap = snapOf(over)
    return byKey(toggleButton(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT), 'more', 'Button')?.props
  }
  // The band's only open and close control, a thin glyph: never dimmed.
  expect(toggleOf({})).toEqual({ key: 'more', label: '▵', plain: true, onPress: NO_ACT.toggleExpanded })
  expect(toggleOf({ surface: 'desktop', expanded: true })).toEqual({ key: 'more', label: '▿', variant: 'secondary', onPress: NO_ACT.toggleExpanded })
})
test('the toggle sits on the row nearest the prompt, the way its arrow points, in every layout', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const snap = snapOf({ surface })
    expect((toggleButton(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT) as unknown as Node).props).toMatchObject({ flexShrink: 0, position: 'relative', alignSelf: 'flex-end' })
  }
})

const kit120 = () => kitOf({ surface: 'terminal', columns: 120, expanded: true })
test('footer without a strip: the hint, air, then Collapse (c) and Hide band (h)', () => {
  const tree = footer(kit120(), NO_ACT) as unknown as Node
  expect(byKey(tree, 'collapse', 'Button')?.props?.hotkey).toBe('c')
  expect(byKey(tree, 'hide', 'Button')?.props?.hotkey).toBe('h')
  expect(shown(tree)).toContain('Bring it back with /nextcost')
})
const WS = { path: '/Users/me/workspace/nextcost', git: { branch: 'feature/strip-room', commit: 'abc1234', worktree: undefined, changed: 3, ahead: 2, behind: 1 }, repoName: undefined }
test('footer with a workspace draws its strip in place of the hint', () => {
  const text = shown(footer(kit120(), NO_ACT, WS))
  expect(text).toContain('nextcost')
  expect(text).not.toContain('Bring it back')
})
test("the footer's strip squeezes to the room the buttons, their hotkey marks and the gaps leave", () => {
  for (const columns of [70, 80, 100, 120]) {
    const tree = footer(kitOf({ columns, expanded: true }), NO_ACT, WS) as unknown as Node
    expect(byKey(tree, 'strip', 'Box')).toBeDefined()
    expect(`${columns}: ${cellsOf(tree as unknown as RenderChildren, TERMINAL) + 2 * HOTKEY_MARK <= columns - ROW_SLACK}`).toBe(`${columns}: true`)
  }
})
