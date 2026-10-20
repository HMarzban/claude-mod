// When a toast speaks: once per threshold crossed, again only after the
// figure has fallen back below the re-arm share.

import { test, expect } from 'claude-code/testing'
import { escalate } from '../hooks/insights'

const LEVELS = [0.8, 0.95] as const

test('crossing a threshold speaks once, at the level reached', () => {
  expect(escalate(0, 0.5, LEVELS)).toEqual({ level: 0, speak: false })
  expect(escalate(0, 0.82, LEVELS)).toEqual({ level: 1, speak: true })
  expect(escalate(1, 0.85, LEVELS)).toEqual({ level: 1, speak: false })
  expect(escalate(1, 0.96, LEVELS)).toEqual({ level: 2, speak: true })
})

test('jumping two thresholds at once speaks once, at the higher', () => {
  expect(escalate(0, 0.97, LEVELS)).toEqual({ level: 2, speak: true })
})

test('falling back holds the level until under the re-arm share, then re-arms', () => {
  expect(escalate(2, 0.78, LEVELS)).toEqual({ level: 2, speak: false })
  expect(escalate(2, 0.7, LEVELS)).toEqual({ level: 0, speak: false })
  expect(escalate(0, 0.81, LEVELS)).toEqual({ level: 1, speak: true })
})
