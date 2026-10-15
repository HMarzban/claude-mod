// The shared open view: chips' cards and footer, a layout's lens in each
// card's head, and no card repeating what the collapsed lines show.

import { test, expect } from 'claude-code/testing'
import type { RenderChildren, RenderElement } from 'claude-code'
import { fixedZone } from '../hooks/format'
import { makeKit } from '../hooks/kit'
import { DESKTOP, HOTKEY_MARK, TERMINAL, cellsOf } from '../hooks/layout'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { openBody } from '../hooks/views/cards'
import { cachePill, chipsPills, chipsView, limitPill, pillRow } from '../hooks/views/chips'
import { cardsView } from '../hooks/views/cards'
import type { View } from '../hooks/views/view'
import { canon } from './golden/hash'
import { BARE, DARK, PLAIN } from '../hooks/palette'
import { boldOf, byKey, cardFirstRow, cardHead, cardOf, fact, fakeEl, shown, walk, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
/** Cards beneath `count` collapsed lines, as a layout of that many rows would draw them. */
const linesView = (count: number): View => ({
  rows: { desktop: count, terminal: count },
  draw: (kit, read, act) => cardsView(kit, read, act, Array.from({ length: count }, (_, i) => text(`LINE ${i}`)), { collapsedRows: count }),
})
const opened = (over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ expanded: true, maxRows: 40, ...over })
  return { type: 'Box', props: {}, children: openBody(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT, { collapsedRows: 1 }) } as unknown as Node
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
test('the cards take only the rows the collapsed lines leave', () => {
    for (const surface of ['terminal', 'desktop'] as const) {
    for (const count of [1, 2]) {
      const view = linesView(count)
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
test('short of a row for a fact under each head, the cards give way whole, so the buttons stay in view', () => {
  const view = linesView(2)
  for (const maxRows of [4, 6, 7]) {
    const snap = snapOf({ expanded: true, maxRows })
    const tree = view.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
    expect([maxRows, byKey(tree, 'cards'), visualRows(tree, 'terminal') <= maxRows, byKey(tree, 'hide', 'Button') !== undefined]).toEqual([maxRows, undefined, true, true])
  }
})
test('with the cards given way, a window only they draw still says it needs you, on the row they would start on', () => {
  const view = linesView(2)
  const spend = { otherLimits: [{ kind: 'spend_limit' as const, percentUsed: 92, resetsAt: undefined }] }
  const draw = (maxRows: number, over = {}) => {
    const snap = snapOf({ expanded: true, maxRows, ...over })
    return view.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
  }
  const tree = draw(6, spend)
  expect([shown(byKey(tree, 'alert', 'Box')), visualRows(tree, 'terminal')]).toEqual(['! spend 92%', 6])
  expect(byKey(byKey(tree, 'alert', 'Box'), 'alert', 'Text')?.props?.color).toBe(DARK.amberFg)
  // Calm, or with no row for it, there is none.
  expect([byKey(draw(6), 'alert'), byKey(draw(4, spend), 'alert')]).toEqual([undefined, undefined])
})
test('shut, a cards view draws its collapsed lines alone', () => {
  const snap = snapOf()
  const tree = linesView(1).draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
  expect(shown(tree)).toBe('LINE 0')
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
  expect(['cache', 'spend', 'context', 'limits'].map(name => boldOf(cardHead(tree, name)))).toEqual([['52m'], ['$3.19'], ['40%'], ['30%']])
  expect(shown(cardHead(tree, 'limits'))).toBe('LIMITS7d 30%')
  const label = byKey(cardHead(tree, 'cache'), 'say1', 'Text')
  expect([shown(label), label?.props?.color]).toEqual([' left', DARK.label])
})
test("LIMITS leads with the worst window's reset and pace, never the collapsed row's value", () => {
  const zoned = { zone: fixedZone(0), maxRows: 13 }
  expect(cardFirstRow(opened(zoned), 'limits')).toBe('resetsSat 19:00 · on pace for ~50%')
  expect(cardFirstRow(opened({ maxRows: 13 }), 'limits')).toBe('resetsin 2d 19h · on pace for ~50%')
  // Taller, every window follows; the worst's own reset line isn't said twice.
  const tall = opened({ zone: fixedZone(0) })
  expect([fact(tall, '5h'), fact(tall, '7d'), fact(tall, '5h pace'), fact(tall, '7d pace')]).toEqual(['4%', '30%', '5h resets 3h 00m · on pace for ~10%', undefined])
})
test('every line of cards shares one top edge: each card top-aligned, its head row level with its neighbours\'', () => {
  for (const columns of [120, 160]) {
    const lines = (byKey(opened({ columns }), 'cards', 'Box')?.children ?? []) as Node[]
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.props?.alignItems).toBe('flex-start')
  }
})
test("the footer's hint gives way where it and both buttons run past the band; the buttons always stay", () => {
  // A terminal's footer at 60 columns would be 62 cells; the desktop's measure holds it to 55.
  for (const [surface, columns] of [['terminal', 60], ['desktop', 50]] as const) {
    const footer = (at: number) => byKey(opened({ surface, columns: at }), 'actions', 'Box')
    expect(shown(footer(95))).toMatch(/Bring it back with \/usage-band/)
    const narrow = footer(columns)
    expect(shown(narrow)).not.toMatch(/Bring it back/)
    expect([byKey(narrow, 'collapse', 'Button'), byKey(narrow, 'hide', 'Button')].map(b => b?.props?.label)).toEqual(['Collapse', 'Hide band'])
    expect(cellsOf(narrow as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL) + 2 * HOTKEY_MARK).toBeLessThanOrEqual(columns)
  }
})
test("the footer's hint and the strip's words are inked in the theme's legible grey, on any host's ground", () => {
  const hint = byKey(byKey(opened(), 'actions', 'Box'), 'hint', 'Box')
  const inks: unknown[] = []
  walk(hint, n => {
    if (n.type === 'Text') inks.push(n.props?.color)
  })
  expect([...new Set(inks)]).toEqual([BARE.label])
  // `subtle` is 2.07:1 on Claude Code's dark terminal ground; `inactive` about 5.8:1.
  expect(BARE.label).toBe('inactive')
  expect(PLAIN.label).toBe('subtle')
})
