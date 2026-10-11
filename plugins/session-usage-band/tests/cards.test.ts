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
import { DARK } from '../hooks/palette'
import { byKey, cardOf, fact, fakeEl, shown, walk, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
const opened = (o: Partial<OpenOptions> = {}, over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ expanded: true, maxRows: 40, ...over })
  return { type: 'Box', props: {}, children: openBody(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT, { collapsedRows: 1, ...o }) } as unknown as Node
}
/** The first body row of a card, past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])
const headOf = (tree: Node, name: string) => byKey(cardOf(tree, name), 'head')
/** The bold Texts of a node, as they read. */
const boldOf = (n: Node | undefined): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}

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
  expect(fact(opened({ shown: ['modelWindow'] }), 'model window')).toBeUndefined()
  // A split the collapsed lines show takes its bar with it, not its legend alone.
  const split = cardOf(opened({ shown: ['tokenSplit'] }), 'spend')
  expect([fact(split, 'input'), byKey(split, 'split')]).toEqual([undefined, undefined])
  expect(byKey(cardOf(opened(), 'spend'), 'split')).toBeDefined()
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
  expect(shown(headOf(tree, 'context'))).toBe('CONTEXTLENS40% full')
  expect(shown(headOf(tree, 'cache'))).not.toMatch(/LENS/)
})
test('a lens too wide for its head gives way before the headline does', () => {
  // The fake elements lay nothing out, so this holds the head's flex: the
  // title and the headline keep their width, the lens takes what is left.
  const head = headOf(opened({ slots: { context: text('~12 messages to compaction') } }), 'context')
  const flex = (key: string) => {
    const p = byKey(head, key, 'Box')?.props
    return [p?.flexGrow, p?.flexShrink, p?.minWidth, p?.overflow]
  }
  expect([flex('title'), flex('slot'), flex('headline')]).toEqual([
    [undefined, 0, undefined, undefined],
    [1, 1, 0, 'hidden'],
    [undefined, 0, undefined, undefined],
  ])
  expect(shown(byKey(head, 'headline', 'Box'))).toBe('40% full')
})
test("a layout's head replaces a card's headline, bold on its figure alone", () => {
  const tree = opened({ heads: { context: [['~12', 'value'], [' msgs', 'label']], limits: [['5h ', 'label'], ['in 3h 00m', 'value']] } })
  expect([shown(headOf(tree, 'context')), shown(headOf(tree, 'limits'))]).toEqual(['CONTEXT~12 msgs', 'LIMITS5h in 3h 00m'])
  expect([boldOf(headOf(tree, 'context')), boldOf(headOf(tree, 'limits'))]).toEqual([['~12'], ['in 3h 00m']])
  expect(byKey(headOf(tree, 'limits'), 'say0', 'Text')?.props?.color).toBe(DARK.label)
  expect(shown(headOf(tree, 'cache'))).toBe('CACHE52m left')
})
test("a layout's lead is its card's first row, and the card's own facts follow", () => {
  const leads = { lead: { cache: ['goes cold', 'at 16:40'], limits: ['used so far', '5h 4% · 7d 30%'] } } as const
  // At 10 rows each card keeps one row of body: the lead's.
  const short = opened(leads, { maxRows: 10 })
  expect([firstRowOf(short, 'cache'), firstRowOf(short, 'limits')]).toEqual(['goes coldat 16:40', 'used so far5h 4% · 7d 30%'])
  expect([fact(short, 're-warm if cold'), fact(short, '5h')]).toEqual([undefined, undefined])
  const tall = opened(leads)
  expect([fact(tall, 'goes cold'), fact(tall, 're-warm if cold'), fact(tall, '5h')]).toEqual(['at 16:40', '~$1.66', '4%'])
  // Context in one row: the lead says both facts it skips.
  const one = opened({ lead: { context: ['room left · auto-compacts at 190k', '~114k'] }, shown: ['room', 'compactsAt'] })
  expect([fact(one, 'room left · auto-compacts at 190k'), fact(one, 'room left'), fact(one, 'auto-compacts at')]).toEqual(['~114k', undefined, undefined])
})
test('the cards take only the rows the collapsed lines leave', () => {
  const lines = (count: number) => () => Array.from({ length: count }, (_, i) => text(`LINE ${i}`))
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const count of [1, 2]) {
      const view = defineCardsView('gauges', { desktop: count, terminal: count }, lines(count))
      // From 13 rows, where every line of cards keeps a row of body. A
      // desktop card's edge takes a row above and below, which visualRows
      // leaves out, so each line of them adds two.
      for (const maxRows of [13, 14, 20, 40]) {
        const snap = snapOf({ surface, expanded: true, maxRows, workspace: { path: '/Users/me/workspace/claude-mod', git: undefined, repoName: undefined } })
        const tree = view.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
        const edges = surface === 'desktop' ? 2 * (byKey(tree, 'cards')?.children ?? []).length : 0
        // The desktop's two lines at 13 rows, the gauges board's case, leave
        // its two lines of cards no row of body. Each card keeps one anyway,
        // as openBody holds every card to a fact at least, so the band is a
        // row over.
        const over = surface === 'desktop' && count === 2 && maxRows === 13
        const at = `${surface} ${count} at ${maxRows}`
        expect(`${at}: ${visualRows(tree, surface) + edges <= maxRows}`).toBe(`${at}: ${!over}`)
        if (over) expect(((cardOf(tree, 'cache')?.children ?? []) as Node[]).flat().filter(Boolean).length).toBe(2)
      }
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
test('a card head is bold on its figure alone, its words in label ink', () => {
  const tree = opened()
  expect(['cache', 'spend', 'context', 'limits'].map(name => boldOf(headOf(tree, name)))).toEqual([['52m'], ['$3.19'], ['40%'], ['30%']])
  expect(shown(headOf(tree, 'limits'))).toBe('LIMITS7d 30%')
  const label = byKey(headOf(tree, 'cache'), 'say1', 'Text')
  expect([shown(label), label?.props?.color]).toEqual([' left', DARK.label])
})
test("LIMITS leads with the worst window's reset and pace, never the collapsed row's value", () => {
  const zoned = { utcOffsetMin: 0, maxRows: 13 }
  expect(firstRowOf(opened({}, zoned), 'limits')).toBe('resetsSat 19:00 · on pace for ~50%')
  expect(firstRowOf(opened({}, { maxRows: 13 }), 'limits')).toBe('resetsin 2d 19h · on pace for ~50%')
  expect(firstRowOf(opened({ shown: ['pace'] }, zoned), 'limits')).toBe('resetsSat 19:00')
  expect(firstRowOf(opened({ shown: ['reset'] }, zoned), 'limits')).toBe('on pace for ~50%')
  expect(firstRowOf(opened({ shown: ['reset', 'pace'] }, zoned), 'limits')).toMatch(/^5h/)
  // Taller, every window follows; the worst's own reset line isn't said twice.
  const tall = opened({}, { utcOffsetMin: 0 })
  expect([fact(tall, '5h'), fact(tall, '7d'), fact(tall, '5h pace'), fact(tall, '7d pace')]).toEqual(['4%', '30%', 'resets 3h 00m · on pace for ~10%', undefined])
  // A layout may have each window say its reset at the clock, as the lead row does.
  expect(fact(opened({ windowResets: 'clock' }, { utcOffsetMin: 0 }), '5h pace')).toBe('resets 03:00 · on pace for ~10%')
})
test("a window's own line leaves out what the collapsed lines say of it, the worst's lead row too", () => {
  const said = (shownByWindow: OpenOptions['shownByWindow']) => {
    const tree = opened({ shownByWindow, windowResets: 'clock' }, { utcOffsetMin: 0 })
    return [fact(tree, '5h pace'), firstRowOf(tree, 'limits')]
  }
  expect(said({})).toEqual(['resets 03:00 · on pace for ~10%', 'resetsSat 19:00 · on pace for ~50%'])
  expect(said({ '5h': ['reset'] })[0]).toBe('on pace for ~10%')
  expect(said({ '5h': ['pace'] })[0]).toBe('resets 03:00')
  expect(said({ '5h': ['reset', 'pace'] })[0]).toBeUndefined()
  expect(said({ '7d': ['reset'] })[1]).toBe('on pace for ~50%')
  expect(said({ '7d': ['reset', 'pace'] })[1]).toMatch(/^5h/)
  // In the countdown form, the same.
  expect(fact(opened({ shownByWindow: { '5h': ['pace'] } }), '5h pace')).toBe('resets 3h 00m')
})
