// Pulse's charts, built once for the row's tiles and the open cards: the
// beats, the 5h window's trail and the 7d's day cells, each at the size its
// caller gives it, and nothing where it has nothing to draw.

import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { beatsChart, weekCells, windowTrail } from '../hooks/views/pulse-charts'
import { EMPTY } from '../hooks/words'
import { SAMPLES, fakeEl, type Node } from './helpers'
import { CALM_LIMITS, HISTORY, NO_HISTORY, snapOf } from './matrix'

/** The kit and readings for a desktop snapshot some way in, with `over`. */
const drawnAt = (over: Partial<BandSnapshot> = {}) => {
  const snap = snapOf({ surface: 'desktop', history: HISTORY, samples: SAMPLES, ...CALM_LIMITS, ...over })
  return { kit: makeKit(fakeEl, snap), read: readingsOf(snap) }
}
const SIZE = { key: 'chart', px: 120, height: 20 } as const
const props = (chart: unknown) => (chart as Node).props ?? {}

test('the beats: the newest `count` costs, said in the alt; flat and said as none before any cost', () => {
  const { kit, read } = drawnAt()
  expect(props(beatsChart(kit, read, { ...SIZE, count: 3 })).alt).toBe(read.history().costsAltOf(3))
  const none = drawnAt({ history: NO_HISTORY })
  expect(props(beatsChart(none.kit, none.read, { ...SIZE, count: 3 })).alt).toBe(EMPTY.costsAlt)
})

test('the beats draw their warm average as a rule only when asked, and take the air given', () => {
  const { kit, read } = drawnAt()
  expect(String(props(beatsChart(kit, read, { ...SIZE, count: 5 })).source)).not.toContain('class="level"')
  const open = props(beatsChart(kit, read, { ...SIZE, count: 5, level: true, air: 4 }))
  expect(String(open.source)).toContain('class="level"')
  expect(open.height).toBe(24)
})

test("the 5h window's trail draws from two points, and nothing short of them", () => {
  const { kit, read } = drawnAt()
  expect(read.week().fiveHourWindow.values.length).toBeGreaterThan(1)
  expect(props(windowTrail(kit, read, 'calm', SIZE)).alt).toBe(read.week().windowAlt)
  const bare = drawnAt({ samples: [], fiveHour: undefined })
  expect(bare.read.week().fiveHourWindow.values.length).toBeLessThan(2)
  expect(windowTrail(bare.kit, bare.read, 'calm', SIZE)).toBeNull()
})

test("the 7d's day cells are the desktop's, once the week is measured", () => {
  const { kit, read } = drawnAt()
  expect(props(weekCells(kit, read, 'calm', { key: 'days', cellPx: 4, height: 14 })).alt).toBe(read.week().daysAlt)
  const text = drawnAt({ surface: 'terminal' })
  expect(weekCells(text.kit, text.read, 'calm', { key: 'days', cellPx: 4, height: 14 })).toBeNull()
  const unmeasured = drawnAt({ samples: [], sevenDay: undefined })
  expect(unmeasured.read.week().daysDrawn.measured).toBe(false)
  expect(weekCells(unmeasured.kit, unmeasured.read, 'calm', { key: 'days', cellPx: 4, height: 14 })).toBeNull()
})
