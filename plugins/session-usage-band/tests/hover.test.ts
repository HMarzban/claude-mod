// Hover cards: one per pill, drawn over the row its pill sits in.

import { test, expect } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  LONG,
  START,
  resp,
  respond,
  textOf,
  cards,
  firstRow,
  isCard,
  rebuilds,
  turn,
  type Node,
  HOUR_1,
  setup,
  mountBand,
} from './helpers'

/** What every hover card in `row` holds to: drawn after every piece, so it
 *  paints over them all; across the whole row, so no edge cuts it; revealed
 *  by the scope it shares with its own piece; a hidden one-line Box with no
 *  key, on the tooltip ground. */
const expectCardsOver = (row: unknown, found: Array<[string, Node]>) => {
  const kids = ((row as Node).children ?? []).filter(Boolean) as Node[]
  const first = kids.findIndex(isCard)
  expect(first).toBeGreaterThan(0)
  expect(kids.slice(first)).toEqual(found.map(([, card]) => card))
  const scopes = found.map(([, card]) => card.hover?.scope)
  expect(new Set(scopes).size).toBe(found.length)
  for (const [key, card] of found) {
    expect(key).not.toBe('')
    expect(typeof card.hover?.scope).toBe('string')
    expect(card.props).toMatchObject({ top: 0, left: 0, right: 0, display: 'none', backgroundColor: DARK.tooltipBg })
    expect(card.props?.width).toBeUndefined()
    expect(card.props?.key).toBeUndefined()
    expect(card.hover?.display).toBe('flex')
    expect((card.children as Node[] | undefined)?.[0]?.props?.wrap).toBe('truncate-end')
  }
}

test('every pill explains itself on hover, on a card drawn over the whole row', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mountBand($, surface, 160)
    const tree = await ui.drawn()
    const found = cards(tree)
    expect(found.map(([key]) => key).join(',')).toBe('cache,cost,tokens,ctx,5h,7d')
    expectCardsOver(firstRow(tree), found)
    for (const [, card] of found) expect(textOf(card).length).toBeLessThan(60)
    expect(textOf(found[0]?.[1])).toBe('Warm cache bills input at 5%; expires 1h after a reply')
    expect(textOf(found[1]?.[1])).toBe('$0.41 spent during your last message, subagents included')
    expect(textOf(found[2]?.[1])).toBe('input 196k · output 12k · cache reads 0')
    expect(textOf(found[3]?.[1])).toBe('Conversation fill; near full, older turns get summarized')
    expect(textOf(found[4]?.[1])).toBe('5-hour limit across all your Claude use; resets in 3h 00m')
    expect(textOf(found[5]?.[1])).toBe('Weekly limit across all your Claude use; resets in 2d 19h')
    await ui.unmount()
  }
})

test('a pill and its card share one hover scope, apart from every other pill', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface, 160)
    const row = firstRow(await ui.drawn()) as Node
    const pills = ((row.children ?? []) as Node[]).filter(k => k?.props?.key !== undefined && k.hover?.scope !== undefined)
    expect(pills.length).toBeGreaterThan(1)
    for (const pill of pills) {
      const card = cards(row).find(([key]) => key === pill.props?.key)?.[1]
      expect(card?.hover?.scope).toBe(pill.hover?.scope)
    }
    await ui.unmount()
  }
})

test('when narrower widths drop pills, each pill left keeps its card over the row', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 50)
  const tree = await ui.drawn()
  const found = cards(tree)
  expect(found.length).toBeLessThan(6) // some pills gave way
  expectCardsOver(firstRow(tree), found)
  await ui.unmount()
})

test('a cold cache explains what the next message rebuilds', LONG, async ($, on) => {
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
