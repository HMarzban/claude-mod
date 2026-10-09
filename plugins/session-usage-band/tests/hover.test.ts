// Hover cards: one per pill, anchored inside the band.

import { test, expect } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  START,
  resp,
  respond,
  textOf,
  cards,
  rebuilds,
  turn,
  HOUR_1,
  setup,
  mountBand,
} from './helpers'

test('every pill explains itself on hover, inside its own hover scope', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await mountBand($, 'desktop', 120)
  const found = cards(await ui.drawn())
  expect(found.map(([key]) => key).join(',')).toBe('cache,cost,tokens,ctx,5h,7d')
  for (const [, card] of found) {
    expect(card.props?.display).toBe('none')
    expect(card.hover?.display).toBe('flex')
    expect(card.props?.backgroundColor).toBe(DARK.tooltipBg)
    expect(textOf(card).length).toBeLessThan(60)
  }
  expect(found[0]?.[1].props?.left).toBe(0)
  expect(found[5]?.[1].props?.right).toBe(0) // the rightmost opens leftward
  expect(textOf(found[0]?.[1])).toBe('Warm cache bills input at 5%; expires 1h after a reply')
  expect(textOf(found[1]?.[1])).toBe('$0.41 spent during your last message, subagents included')
  expect(textOf(found[2]?.[1])).toBe('input 196k · output 12k · cache reads 0')
  expect(textOf(found[3]?.[1])).toBe('Conversation fill; near full, older turns get summarized')
  expect(textOf(found[4]?.[1])).toBe('5-hour limit across all your Claude use; resets in 3h 00m')
  expect(textOf(found[5]?.[1])).toBe('Weekly limit across all your Claude use; resets in 2d 19h')
  await ui.unmount()
})

test('the rightmost visible pill anchors right when narrower widths drop pills', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 50)
  const found = cards(await ui.drawn())
  expect(found.length).toBeLessThan(6) // some pills gave way
  expect(found[found.length - 1]?.[1].props?.right).toBe(0)
  for (const [, card] of found.slice(0, -1)) expect(card.props?.left).toBe(0)
  await ui.unmount()
})

test('a cold cache explains what the next message rebuilds', async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)
  const ui = await mountBand($, 'terminal', 110)
  const cache = cards(await ui.drawn()).find(([key]) => key === 'cache')
  expect(textOf(cache?.[1])).toMatch(/^Cold: next message rebuilds 112k tokens \(~\$\d+\.\d\d\)$/)
  await ui.unmount()
})

test('plain appearance draws no hover cards', async ($, on) => {
  setup(on, { env: { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 } })
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  expect(cards(await ui.drawn())).toHaveLength(0)
  await ui.unmount()
})
