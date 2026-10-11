// Hover cards: one per pill, drawn over the row at the pill it explains.

import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { DESKTOP, cellsOf } from '../hooks/layout'
import { DARK, LIGHT } from '../hooks/palette'
import {
  LONG,
  START,
  resp,
  respond,
  textOf,
  cards,
  cardText,
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

/** A card drawn inverted, so it can't pass for a chip: the tooltip ground
 *  and ink. On a text surface its two ends are half blocks in the ground's
 *  colour on the band's own background, either side of a ground two cells
 *  narrower than the card, so the ends read as rounded edges; the desktop
 *  draws the ground alone. */
const expectInvertedCard = (card: Node, surface: 'terminal' | 'desktop') => {
  const kids = (card.children ?? []) as Node[]
  if (surface === 'desktop') {
    expect(card.props?.backgroundColor).toBe(DARK.tooltipBg)
    expect(kids).toHaveLength(1)
    expect(kids[0]?.props).toMatchObject({ color: DARK.tooltipFg, wrap: 'truncate-end' })
    return
  }
  expect(card.props?.backgroundColor).toBeUndefined()
  expect(kids.map(textOf)).toEqual(['▐', cardText(card), '▌'])
  for (const cap of [kids[0], kids[2]]) {
    expect(cap?.type).toBe('Text')
    expect(cap?.props?.color).toBe(DARK.tooltipBg)
    expect(cap?.props?.backgroundColor).toBeUndefined()
  }
  const ground = kids[1]
  expect(ground?.props).toMatchObject({ backgroundColor: DARK.tooltipBg, paddingX: 1, width: Number(card.props?.width) - 2 })
  expect((ground?.children as Node[] | undefined)?.[0]?.props).toMatchObject({ color: DARK.tooltipFg, wrap: 'truncate-end' })
}

/** What every hover card in the band's `row`, `cols` wide, holds to: drawn
 *  after every pill, so it paints over them all, and before ▿, which stacks
 *  over it and so stays pressable; revealed by the scope it shares with its
 *  own pill; a hidden one-line Box with no key, on the tooltip ground in the
 *  tooltip ink, as wide as its text, ending short of ▿. The pointer on a
 *  showing card keeps it showing, so on the terminal, where cells are exact,
 *  a card starts at its own pill, slid left only as far as it must to end
 *  short of ▿: the pills to its left still switch it. */
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
    expect(card.props).toMatchObject({ top: 0, display: 'none' })
    expect(card.props?.right).toBeUndefined()
    expect(card.props?.key).toBeUndefined()
    expect(card.hover?.display).toBe('flex')
    expectInvertedCard(card, surface)
    const left = Number(card.props?.left)
    const width = Number(card.props?.width)
    expect(Number.isInteger(left) && left >= 0).toBe(true)
    if (surface === 'terminal') {
      expect(width).toBe(Math.min(cardText(card).length + 4, room))
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
    for (const [, card] of found) expect(cardText(card).length).toBeLessThan(60)
    expect(cardText(found[0]?.[1])).toBe('Warm cache bills input at 5%; expires 1h after a reply')
    expect(cardText(found[1]?.[1])).toBe('$0.41 spent during your last message, subagents included')
    expect(cardText(found[2]?.[1])).toBe('input 196k · output 12k · cache reads 0')
    expect(cardText(found[3]?.[1])).toBe('Conversation fill; near full, older turns get summarized')
    expect(cardText(found[4]?.[1])).toBe('5-hour limit across all your Claude use; resets in 3h 00m')
    expect(cardText(found[5]?.[1])).toBe('Weekly limit across all your Claude use; resets in 2d 19h')
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
  expect(cardText(cache?.[1])).toMatch(/^Cold: next message rebuilds 112k tokens \(~\$\d+\.\d\d\)$/)
  await ui.unmount()
})

test('plain appearance draws no hover cards', async ($, on) => {
  setup(on, { env: { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 } })
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  expect(cards(await ui.drawn())).toHaveLength(0)
  await ui.unmount()
})

test('every card, shut and open, fits within the band at every width from 20 to 200 and on a short band, its caps included', LONG, async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const maxRows of [40, 4]) {
      for (let cols = 20; cols <= 200; cols++) {
        const ui = await mountBand($, surface, cols, { maxRows })
        const shut = await ui.drawn()
        await ui.press({ key: 'more' })
        const open = await ui.drawn()
        await ui.press({ key: 'more' }) // being open is stored: shut it for the next mount
        for (const [, card] of [...cards(shut), ...cards(open)]) {
          const width = Number(card.props?.width)
          const from = Number(card.props?.left ?? card.props?.right)
          expect(`${surface} ${cols}x${maxRows} ${from >= 0 && from + width <= cols}`).toBe(`${surface} ${cols}x${maxRows} true`)
          expectInvertedCard(card, surface)
          expect(width).toBeGreaterThanOrEqual(surface === 'terminal' ? 5 : 3) // its edges and one character
        }
        await ui.unmount()
      }
    }
  }
})

test('in the ascii tier a card keeps its width, with a space for each cap', async ($, on) => {
  setup(on, { env: { CC_BAND_GLYPHS: 'ascii', ...HOUR_1 } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 160)
  const tree = await ui.drawn()
  const found = cards(tree)
  expect(found.map(([key]) => key)).toEqual(PILLS)
  expect(textOf(tree)).not.toMatch(/[▐▌]/)
  for (const [, card] of found) {
    const text = cardText(card)
    expect(((card.children ?? []) as Node[]).map(textOf)).toEqual([' ', text, ' '])
    expect(card.props?.width).toBe(text.length + 4)
  }
  await ui.unmount()
})

test('in the light palette a card is inverted too: a dark ground under light ink', async ($, on) => {
  setup(on, { env: { CC_BAND_APPEARANCE: 'light', ...HOUR_1 } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 160)
  for (const [, card] of cards(await ui.drawn())) {
    const [open, ground, close] = (card.children ?? []) as Node[]
    expect([open?.props?.color, close?.props?.color]).toEqual([LIGHT.tooltipBg, LIGHT.tooltipBg])
    expect(ground?.props?.backgroundColor).toBe(LIGHT.tooltipBg)
    expect((ground?.children as Node[] | undefined)?.[0]?.props?.color).toBe(LIGHT.tooltipFg)
  }
  await ui.unmount()
})
