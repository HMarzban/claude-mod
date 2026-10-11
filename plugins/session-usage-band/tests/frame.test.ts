import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { bodyRowsFor, toggleButton } from '../hooks/views/frame'
import { byKey, fakeEl, type Node } from './helpers'
import { NO_ACT, snapOf } from './matrix'

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
