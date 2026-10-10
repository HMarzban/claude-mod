// Hover cards: one per pill, drawn over the row at the pill it explains.

import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { DESKTOP, cellsOf } from '../hooks/layout'
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
  byKey,
  widthOf,
  rebuilds,
  turn,
  type Node,
  HOUR_1,
  setup,
  mountBand,
} from './helpers'

/** What every hover card in the band's `row`, `cols` wide, holds to: drawn
 *  after every pill, so it paints over them all, and before ▿, which stacks
 *  over it and so stays pressable; revealed by the scope it shares with its
 *  own pill; a hidden one-line Box with no key, on the tooltip ground, as wide
 *  as its text, ending short of ▿. The pointer on a showing card keeps it
 *  showing, so on the terminal, where cells are exact, a card starts at its
 *  own pill, slid left only as far as it must to end short of ▿: the pills to
 *  its left still switch it. */
const expectCardsAt = (row: unknown, found: Array<[string, Node]>, cols: number, surface: 'terminal' | 'desktop') => {
  const kids = ((row as Node).children ?? []).filter(Boolean) as Node[]
  const toggle = kids[kids.length - 1]
  expect(byKey(toggle, 'more', 'Button')).toBeDefined()
  expect(toggle?.props?.position).toBe('relative')
  const first = kids.findIndex(isCard)
  expect(first).toBeGreaterThan(0)
  expect(kids.slice(first, -1)).toEqual(found.map(([, card]) => card))
  const pills = kids.slice(0, first).filter(k => k.props?.key !== undefined)
  const room = cols - widthOf(toggle) - 1
  const startOf = (key: string) => {
    const i = pills.findIndex(pill => pill.props?.key === key)
    expect(i).toBeGreaterThanOrEqual(0)
    return pills.slice(0, i).reduce((at, pill) => at + widthOf(pill) + 1, 0)
  }
  expect(new Set(found.map(([, card]) => card.hover?.scope)).size).toBe(found.length)
  for (const [key, card] of found) {
    expect(typeof card.hover?.scope).toBe('string')
    expect(card.props).toMatchObject({ top: 0, display: 'none', backgroundColor: DARK.tooltipBg })
    expect(card.props?.right).toBeUndefined()
    expect(card.props?.key).toBeUndefined()
    expect(card.hover?.display).toBe('flex')
    expect((card.children as Node[] | undefined)?.[0]?.props?.wrap).toBe('truncate-end')
    const left = Number(card.props?.left)
    const width = Number(card.props?.width)
    expect(Number.isInteger(left) && left >= 0).toBe(true)
    if (surface === 'terminal') {
      expect(width).toBe(Math.min(textOf(card).length + 2, room))
      expect(left).toBe(Math.max(0, Math.min(startOf(key), room - width)))
    } else {
      // The desktop has no exact count of its own to check against, so its
      // room comes from the band's measure.
      expect(left + width).toBeLessThanOrEqual(Math.floor(cols - cellsOf(toggle as RenderChildren, DESKTOP) - 1))
    }
  }
}

/** The pills a wide row draws once a reply has landed, in order. */
const PILLS = ['cache', 'cost', 'tokens', 'ctx', '5h', '7d']

test('every pill explains itself on hover, on a card drawn over the row at its pill', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  for (const [surface, cols] of [['desktop', 120], ['terminal', 160]] as const) {
    const ui = await mountBand($, surface, cols)
    const tree = await ui.drawn()
    const found = cards(tree)
    expect(found.map(([key]) => key)).toEqual(PILLS)
    expectCardsAt(firstRow(tree), found, cols, surface)
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

test('on a wide terminal row each card starts at its own pill, so it covers none to its left', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 160)
  const row = firstRow(await ui.drawn()) as Node
  const pills = ((row.children ?? []) as Node[]).filter(k => k?.props?.key !== undefined)
  expect(pills.map(pill => pill.props?.key)).toEqual(PILLS)
  let at = 0
  for (const pill of pills) {
    expect(cards(row).find(([key]) => key === pill.props?.key)?.[1].props?.left).toBe(at)
    at += widthOf(pill) + 1
  }
  await ui.unmount()
})

test('every pill reveals a card of its own, in the order the pills are drawn', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface, 160)
    const row = firstRow(await ui.drawn()) as Node
    const pills = ((row.children ?? []) as Node[]).filter(k => k?.props?.key !== undefined)
    expect(pills.map(pill => pill.props?.key)).toEqual(PILLS)
    expect(cards(row).map(([key]) => key)).toEqual(PILLS)
    await ui.unmount()
  }
})

test('when narrower widths drop pills, each pill left keeps its card, slid to end short of ▿', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 50)
  const tree = await ui.drawn()
  const found = cards(tree)
  expect(found.length).toBeLessThan(6) // some pills gave way
  expectCardsAt(firstRow(tree), found, 50, 'terminal')
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
