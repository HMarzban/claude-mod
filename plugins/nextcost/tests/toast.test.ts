// When a toast speaks and what it says: once per threshold crossed, again
// only after the figure has fallen back below the re-arm share.

import { test, expect } from 'claude-code/testing'
import { NO_WARNINGS, contextToasts, forgetConversation, limitToasts } from '../hooks/toast'
import type { ContextNow, Toasts, Warned } from '../hooks/toast'

/** The 5-hour limit at each percent in turn: what each step says. */
const fiveHourSays = (percents: readonly number[], from: Warned = NO_WARNINGS): string[][] => {
  let warned = from
  return percents.map(percentUsed => {
    const t: Toasts = limitToasts(warned, [{ kind: 'five_hour', percentUsed }])
    warned = t.warned
    return [...t.say]
  })
}

/** The context at each step in turn, on a 200k window unless the step says otherwise: what each step says. */
const contextSays = (steps: ReadonlyArray<Partial<ContextNow>>, from: Warned = NO_WARNINGS): string[][] => {
  let warned = from
  return steps.map(step => {
    const t = contextToasts(warned, { used: undefined, window: 200_000, compactAt: undefined, autoCompactOff: false, ...step })
    warned = t.warned
    return [...t.say]
  })
}

test('crossing a threshold speaks once, at the level reached', () => {
  expect(fiveHourSays([50, 82, 85, 96])).toEqual([[], ["You've used 82% of your 5-hour limit."], [], ["You've used 96% of your 5-hour limit."]])
})

test('jumping two thresholds at once speaks once, at the higher', () => {
  expect(fiveHourSays([97])).toEqual([["You've used 97% of your 5-hour limit."]])
})

test('falling back holds the level until under the re-arm share, then re-arms', () => {
  expect(fiveHourSays([96, 78, 81, 70, 81])).toEqual([["You've used 96% of your 5-hour limit."], [], [], [], ["You've used 81% of your 5-hour limit."]])
})

test('only the 5-hour window speaks', () => {
  expect(limitToasts(NO_WARNINGS, [{ kind: 'seven_day', percentUsed: 99 }]).say).toEqual([])
})

test('the context speaks its fill toward the window, and that compaction is off when it is', () => {
  expect(contextSays([{ used: 164_000 }])).toEqual([['Context is 82% full.']])
  expect(contextSays([{ used: 164_000, autoCompactOff: true }])).toEqual([
    ['Context is 82% full and auto-compaction is off, so the conversation will run out of room.'],
  ])
})

test('near compaction the context speaks the room before it', () => {
  expect(contextSays([{ used: 176_000, compactAt: 190_000 }])).toEqual([['Auto-compaction in ~14k tokens.']])
})

test('a context the engine reports none of says nothing and keeps the levels', () => {
  const t = contextToasts(NO_WARNINGS, { used: undefined, window: 200_000, compactAt: undefined, autoCompactOff: false })
  expect(t).toEqual({ warned: NO_WARNINGS, say: [] })
})

test("a conversation's end forgets the context's level, not the 5-hour limit's", () => {
  const five = limitToasts(NO_WARNINGS, [{ kind: 'five_hour', percentUsed: 85 }]).warned
  const both = contextToasts(five, { used: 170_000, window: 200_000, compactAt: undefined, autoCompactOff: false }).warned
  const forgot = forgetConversation(both)
  expect(contextSays([{ used: 170_000 }], forgot)).toEqual([['Context is 85% full.']])
  expect(fiveHourSays([86], forgot)).toEqual([[]])
})
