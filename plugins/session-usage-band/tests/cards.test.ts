// The shared open view: chips' cards and footer, a layout's lens in each
// card's head, and no card repeating what the collapsed lines show.

import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { openBody, type OpenOptions } from '../hooks/views/cards'
import { cachePill, chipsPills, chipsView, limitPill, pillRow } from '../hooks/views/chips'
import { defineCardsView } from '../hooks/views/view'
import { canon } from './golden/hash'
import { byKey, cardOf, fact, fakeEl, shown, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
const opened = (o: Partial<OpenOptions> = {}, over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ expanded: true, maxRows: 40, ...over })
  return { type: 'Box', props: {}, children: openBody(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT, { collapsedRows: 1, ...o }) } as unknown as Node
}
/** The first body row of a card, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])

test("chips' open view is openBody's, with one collapsed row and nothing to skip", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const snap = snapOf({ expanded: true, surface })
    const kit = makeKit(fakeEl, snap)
    const read = readingsOf(snap)
    const drawn = (chipsView.draw(kit, read, NO_ACT) as unknown as Node).children?.flat().slice(1)
    expect(canon(drawn)).toEqual(canon(openBody(kit, read, NO_ACT, { collapsedRows: 1 }).filter(Boolean)))
  }
})
test('a fact the collapsed lines show is in no card', () => {
  const all = opened()
  expect([fact(all, 're-warm if cold'), fact(all, 'last message'), fact(all, 'room left')]).toEqual(['~$1.66', '$0.21', '~114k'])
  const skipped = opened({ shown: ['reWarm', 'lastMessage', 'room'] })
  expect([fact(skipped, 're-warm if cold'), fact(skipped, 'last message'), fact(skipped, 'room left')]).toEqual([undefined, undefined, undefined])
  expect(fact(opened({ shown: ['tokenSplit'] }), 'input')).toBeUndefined()
})
test("with a row each, a card's first row is one the collapsed lines left out", () => {
  const short = { maxRows: 13 }
  expect(firstRowOf(opened({}, short), 'cache')).toMatch(/^re-warm if cold/)
  expect(firstRowOf(opened({ shown: ['reWarm'] }, short), 'cache')).toMatch(/^saved by cache/)
  expect(firstRowOf(opened({ shown: ['room'] }, short), 'context')).toMatch(/^auto-compacts at/)
  expect(firstRowOf(opened({ shown: ['lastMessage'] }, short), 'spend')).toMatch(/^\S* ?input/)
})
test("a layout's lens sits in its card's head, after the title", () => {
  const tree = opened({ slots: { context: text('LENS') } })
  expect(shown(byKey(cardOf(tree, 'context'), 'head'))).toMatch(/^CONTEXT LENS/)
  expect(shown(byKey(cardOf(tree, 'cache'), 'head'))).not.toMatch(/LENS/)
})
test('the cards take only the rows the collapsed lines leave', () => {
  const lines = (count: number) => () => Array.from({ length: count }, (_, i) => text(`LINE ${i}`))
  for (const count of [1, 2]) {
    const view = defineCardsView('gauges', { desktop: count, terminal: count }, lines(count))
    // From 13 rows, where every line of cards keeps a row of body.
    for (const maxRows of [13, 14, 20, 40]) {
      const snap = snapOf({ expanded: true, maxRows, workspace: { path: '/Users/me/workspace/claude-mod', git: undefined, repoName: undefined } })
      const tree = view.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
      expect(`${count} at ${maxRows}: ${visualRows(tree, 'terminal') <= maxRows}`).toBe(`${count} at ${maxRows}: true`)
    }
  }
})
test('shut, a cards view draws its collapsed lines alone', () => {
  const snap = snapOf()
  const tree = defineCardsView('gauges', { desktop: 1, terminal: 1 }, () => [text('LINE')]).draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
  expect(shown(tree)).toBe('LINE')
})
test("a layout composes chips' pills: chips' row is its pills in a pill row", () => {
  const snap = snapOf({ columns: 200 })
  const kit = makeKit(fakeEl, snap)
  const read = readingsOf(snap)
  const row = (chipsView.draw(kit, read, NO_ACT) as unknown as Node).children?.[0]
  expect(canon(row)).toEqual(canon(pillRow(kit, read, NO_ACT, chipsPills(kit, read, 0))))
  const mine = pillRow(kit, read, NO_ACT, [limitPill(kit, read, '7d', 0, false), cachePill(kit, read, true)].filter(p => p !== undefined))
  expect(shown(mine)).toBe('7d ██░░░░ 30% │ ↻ 2d 19h ◷ cache 52m ')
  expect(byKey(mine, 'more', 'Button')?.props?.label).toBe('▵')
  expect(limitPill(kit, readingsOf(snapOf({ sevenDay: undefined })), '7d', 0, false)).toBeUndefined()
})
