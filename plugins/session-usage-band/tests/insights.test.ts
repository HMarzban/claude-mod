// The insights' pure logic: last turn's cost and the 5h pace ETA.

import { test, expect } from 'claude-code/testing'
import { fmtEta } from '../hooks/format'
import {
  fiveHourEtaMs,
  forgetTurn,
  insights,
  noteFiveHour,
  noteTurnEnd,
  noteTurnStart,
  openTurns,
  resetInsights,
} from '../hooks/insights'
import { endTurn, fact, mountBand, resp, respond, setup, START, startTurn } from './helpers'

const MIN = 60_000
const cents = (n: number | null): number | null => (n === null ? null : Math.round(n * 100))
const RESET_IN_3H = new Date(3 * 60 * MIN).toISOString()

test("last turn's cost is the ledger's rise across one turn", () => {
  resetInsights()
  expect(insights.lastTurnUsd).toBe(null)
  noteTurnStart('t1', 2.0)
  noteTurnEnd('t1', 2.41)
  expect(cents(insights.lastTurnUsd)).toBe(41)
})

test('a turn that never started leaves nothing to show', () => {
  resetInsights()
  noteTurnEnd('never-started', 5)
  expect(insights.lastTurnUsd).toBe(null)
})

test('a turn without a ledger leaves nothing to show', () => {
  resetInsights()
  noteTurnStart('t1', undefined)
  noteTurnEnd('t1', 3)
  expect(insights.lastTurnUsd).toBe(null)
})

test('a turn that spent nothing leaves nothing to show', () => {
  resetInsights()
  noteTurnStart('t2', 3)
  noteTurnEnd('t2', 3)
  expect(insights.lastTurnUsd).toBe(null)
})

test('the ETA needs ten minutes of evidence', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(8 * MIN, 46, RESET_IN_3H)
  expect(fiveHourEtaMs(8 * MIN)).toBe(null)
})

test('the ETA needs a two-point rise', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 41, RESET_IN_3H)
  expect(fiveHourEtaMs(12 * MIN)).toBe(null)
})

test('the ETA projects the pace from the first to the newest sample', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 46, RESET_IN_3H) // 0.5 points a minute, 54 to go
  expect(fiveHourEtaMs(12 * MIN)).toBe(108 * MIN)
  expect(fmtEta(108 * MIN)).toBe('~1h 45m')
})

test('the ETA hides when the samples go stale', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 46, RESET_IN_3H)
  expect(fiveHourEtaMs(27 * MIN)).not.toBe(null) // exactly 15 minutes: still fresh
  expect(fiveHourEtaMs(28 * MIN)).toBe(null) // 16 minutes: stale
})

test('the ETA hides when the window resets first', () => {
  resetInsights()
  const soon = new Date(30 * MIN).toISOString()
  noteFiveHour(0, 40, soon)
  noteFiveHour(12 * MIN, 46, soon) // fills at 120m, resets at 30m
  expect(fiveHourEtaMs(12 * MIN)).toBe(null)
})

test('no ETA once the window is full', () => {
  resetInsights()
  noteFiveHour(0, 90, RESET_IN_3H)
  noteFiveHour(12 * MIN, 100, RESET_IN_3H)
  expect(fiveHourEtaMs(12 * MIN)).toBe(null)
})

test('jitter in resetsAt keeps the samples; a real reset clears them', () => {
  resetInsights()
  noteFiveHour(0, 40, new Date(3 * 60 * MIN).toISOString())
  noteFiveHour(12 * MIN, 46, new Date(3 * 60 * MIN + 2_000).toISOString()) // 2s jitter
  expect(fiveHourEtaMs(12 * MIN)).not.toBe(null)
  noteFiveHour(13 * MIN, 2, new Date(8 * 60 * MIN).toISOString()) // new window
  expect(fiveHourEtaMs(13 * MIN)).toBe(null)
})

test('old samples fall out of the 30-minute window', () => {
  resetInsights()
  noteFiveHour(0, 10, RESET_IN_3H)
  noteFiveHour(40 * MIN, 12, RESET_IN_3H)
  noteFiveHour(52 * MIN, 13, RESET_IN_3H) // only 40m and 52m remain: 1 point
  expect(fiveHourEtaMs(52 * MIN)).toBe(null)
})

test('the ETA rounds to 5 minutes under an hour and 15 from an hour', () => {
  expect(fmtEta(2 * MIN)).toBe('~5m')
  expect(fmtEta(38 * MIN)).toBe('~40m')
  expect(fmtEta(58 * MIN)).toBe('~1h')
  expect(fmtEta(67 * MIN)).toBe('~1h')
  expect(fmtEta(68 * MIN)).toBe('~1h 15m')
  expect(fmtEta(130 * MIN)).toBe('~2h 15m')
})

test('a forgotten turn leaves no start cost behind', () => {
  resetInsights()
  noteTurnStart('s', 1)
  expect(openTurns()).toBe(1)
  forgetTurn('s')
  expect(openTurns()).toBe(0)
})

test('forgetting a turn keeps the other turns open', () => {
  resetInsights()
  noteTurnStart('a', 1)
  noteTurnStart('b', 2)
  forgetTurn('b')
  expect(openTurns()).toBe(1)
  noteTurnEnd('a', 1.5)
  expect(cents(insights.lastTurnUsd)).toBe(50)
})

test("a subagent's turn inside an open turn doesn't change what the last message cost", async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await startTurn($, 'main-1', 2.41)
  await endTurn($, 'sub-1', 2.5, { agentId: 'agent-1' })
  await endTurn($, 'main-1', 2.62)
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), 'last message')).toBe('$0.21')
  await ui.unmount()
})
