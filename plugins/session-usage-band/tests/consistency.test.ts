// One source for each figure: a pace, a tone, a read price, the context in
// use. Where the band says a thing twice, it says it the same way.

import { test, expect } from 'claude-code/testing'
import { contextUsed } from '../hooks/format'
import { DARK } from '../hooks/palette'
import {
  LONG,
  START,
  byKey,
  cardOf,
  fact,
  pacing,
  pillOf,
  resp,
  respond,
  shown,
  svgsOf,
  textOf,
  usage,
  type Node,
  setup,
  mountBand,
} from './helpers'

test("the Limits card says the 5h chip's pace in the chip's own words, and in its colour", LONG, async ($, on) => {
  const clock = setup(on)
  await pacing($, clock)
  const ui = await mountBand($, 'terminal', 160)
  const eta = shown(pillOf(await ui.drawn(), '5h')).match(/full in (~\d+[hm](?: \d+m)?)/)?.[1]
  expect(eta).toBeDefined()
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, '5h pace')).toMatch(new RegExp(`full in ${eta}`))
  const row = byKey(cardOf(tree, 'limits'), 'fact:5h')
  const value = (row?.children ?? []).filter(Boolean).at(-1) as Node | undefined
  expect(value?.props?.color).toBe(DARK.amberFg) // amber on the card, as on the chip
  await ui.unmount()
})

test('the warm cache says what reading costs on the model in force', async ($, on) => {
  setup(on) // claude-opus-5-5, which reads its cache at 5% of input
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'desktop', 160)
  const hover = textOf(pillOf(await ui.drawn(), 'cache'))
  expect(hover).toMatch(/bills input at 5%/)
  expect(hover).not.toMatch(/10%/)
  await ui.unmount()
})

test('the context in use: tokens, else the percent of the window, else unknown', () => {
  expect(contextUsed({ tokens: 76_000, percent: 40, window: 200_000 })).toBe(76_000)
  expect(contextUsed({ tokens: undefined, percent: 40, window: 200_000 })).toBe(80_000)
  expect(contextUsed({ tokens: undefined, percent: undefined, window: 200_000 })).toBeUndefined()
})

test('a usage read that fails mid-turn never breaks the turn or the band', async ($, on) => {
  setup(on)
  await $.session.start(START)
  usage.fails = true
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  usage.fails = false
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache 1h 00m/)
  await ui.unmount()
})

test('no drawing names an SVG id: ids are page-wide, and two bands could share a page', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'desktop', 160)
  await ui.press({ key: 'more' })
  const named = svgsOf(await ui.drawn()).filter(n => / id="/.test(String(n.props?.source)))
  expect(named.map(n => n.props?.alt)).toEqual([])
  await ui.unmount()
})
