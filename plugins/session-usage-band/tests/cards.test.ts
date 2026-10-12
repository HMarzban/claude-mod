// The shared open view: chips' cards and footer, a layout's lens in each
// card's head, and no card repeating what the collapsed lines show.

import { test, expect } from 'claude-code/testing'
import type { RenderChildren, RenderElement } from 'claude-code'
import { fixedZone } from '../hooks/format'
import { makeKit } from '../hooks/kit'
import { DESKTOP, HOTKEY_MARK, TERMINAL, cellsOf } from '../hooks/layout'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { openBody, type OpenOptions } from '../hooks/views/cards'
import { cachePill, chipsPills, chipsView, limitPill, pillRow } from '../hooks/views/chips'
import { defineCardsView } from '../hooks/views/view'
import { canon } from './golden/hash'
import { BARE, DARK, PLAIN } from '../hooks/palette'
import { boldOf, byKey, cardFirstRow, cardHead, cardOf, fact, fakeEl, shown, walk, type Node } from './helpers'
import { NO_ACT, snapOf, visualRows } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
const opened = (o: Partial<OpenOptions> = {}, over: Partial<BandSnapshot> = {}): Node => {
  const snap = snapOf({ expanded: true, maxRows: 40, ...over })
  return { type: 'Box', props: {}, children: openBody(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT, { collapsedRows: 1, ...o }) } as unknown as Node
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
  expect(cardFirstRow(opened({}, short), 'cache')).toMatch(/^re-warm if cold/)
  expect(cardFirstRow(opened({ shown: ['reWarm'] }, short), 'cache')).toMatch(/^saved by cache/)
  expect(cardFirstRow(opened({ shown: ['room'] }, short), 'context')).toMatch(/^auto-compacts at/)
  expect(cardFirstRow(opened({ shown: ['lastMessage'] }, short), 'spend')).toMatch(/^\S* ?input/)
})
test("a layout's lens sits in its card's head, after the title", () => {
  const tree = opened({ slots: { context: text('LENS') } })
  expect(shown(cardHead(tree, 'context'))).toBe('CONTEXTLENS40% full')
  expect(shown(cardHead(tree, 'cache'))).not.toMatch(/LENS/)
})
test("a lens that stands for its card's bar takes the bar's place, and only where it is set", () => {
  const firstKeys = (tree: Node) => ['cache', 'context'].map(name => String(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1]?.props?.key))
  const lens = { slots: { cache: text('LENS') } }
  for (const surface of ['terminal', 'desktop'] as const) {
    // With rows to spare, a card leads with its bar, a lens or not.
    expect(firstKeys(opened(lens, { surface }))).toEqual(['meter', 'meter'])
    expect(firstKeys(opened({ ...lens, slotsReplaceBars: true }, { surface }))).toEqual(['fact:re-warm if cold', 'meter'])
  }
})
test('a lens too wide for its head gives way before the headline does', () => {
  // The fake elements lay nothing out, so this holds the head's flex: the
  // title and the headline keep their width, the lens takes what is left.
  const head = cardHead(opened({ slots: { context: text('~12 messages to compaction') } }), 'context')
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
test("a lens in its forms gives way whole: the head draws the first that leaves its title and headline whole", () => {
  // Four cards across 160 columns leave each head 37 columns: `CONTEXT`, the headline `40% full`, a column either side of the lens.
  const forms = { slots: { context: { forms: [text('~12 messages to compaction'), text('~12 msgs to compact'), text('~12')] } } }
  expect(shown(cardHead(opened(forms, { columns: 160 }), 'context'))).toBe('CONTEXT~12 msgs to compact40% full')
  expect(shown(cardHead(opened(forms, { columns: 200 }), 'context'))).toBe('CONTEXT~12 messages to compaction40% full')
  // Held by none, the last; one that draws nothing leaves the headline alone.
  expect(shown(cardHead(opened({ slots: { context: { forms: [text('x'.repeat(40)), null] } } }, { columns: 160 }), 'context'))).toBe('CONTEXT40% full')
})
test("a lead that says the card's own facts gives way whole: held by no form, the card says them in its own rows", () => {
  const lead = { lead: { context: { forms: [['room left · auto-compacts at 190k', '~114k']], says: ['room', 'compactsAt'] } } } as const
  // Two across 120 columns, it holds; four across 160, `~114k` would be cut, so the card's own rows say it whole.
  const two = opened(lead)
  expect([fact(two, 'room left · auto-compacts at 190k'), fact(two, 'room left'), fact(two, 'auto-compacts at')]).toEqual(['~114k', undefined, undefined])
  const four = opened(lead, { columns: 160 })
  expect([fact(four, 'room left · auto-compacts at 190k'), fact(four, 'room left'), fact(four, 'auto-compacts at')]).toEqual([undefined, '~114k', '190k'])
})
test("a layout's head replaces a card's headline, bold on its figure alone", () => {
  const tree = opened({ heads: { context: [['~12', 'value'], [' msgs', 'label']], limits: [['5h ', 'label'], ['in 3h 00m', 'value']] } })
  expect([shown(cardHead(tree, 'context')), shown(cardHead(tree, 'limits'))]).toEqual(['CONTEXT~12 msgs', 'LIMITS5h in 3h 00m'])
  expect([boldOf(cardHead(tree, 'context')), boldOf(cardHead(tree, 'limits'))]).toEqual([['~12'], ['in 3h 00m']])
  expect(byKey(cardHead(tree, 'limits'), 'say0', 'Text')?.props?.color).toBe(DARK.label)
  expect(shown(cardHead(tree, 'cache'))).toBe('CACHE52m left')
})
test("a layout's lead is its card's first row, and the card's own facts follow", () => {
  const leads = { lead: { cache: ['goes cold', 'at 16:40'], limits: ['used so far', '5h 4% · 7d 30%'] } } as const
  // At 10 rows each card keeps one row of body: the lead's.
  const short = opened(leads, { maxRows: 10 })
  expect([cardFirstRow(short, 'cache'), cardFirstRow(short, 'limits')]).toEqual(['goes coldat 16:40', 'used so far5h 4% · 7d 30%'])
  expect([fact(short, 're-warm if cold'), fact(short, '5h')]).toEqual([undefined, undefined])
  const tall = opened(leads)
  expect([fact(tall, 'goes cold'), fact(tall, 're-warm if cold'), fact(tall, '5h')]).toEqual(['at 16:40', '~$1.66', '4%'])
  // Context in one row: the lead says both facts it skips.
  const one = opened({ lead: { context: ['room left · auto-compacts at 190k', '~114k'] }, shown: ['room', 'compactsAt'] })
  expect([fact(one, 'room left · auto-compacts at 190k'), fact(one, 'room left'), fact(one, 'auto-compacts at')]).toEqual(['~114k', undefined, undefined])
})
test('the cards take only the rows the collapsed lines leave', () => {
  const lines = (count: number) => () => ({ lines: Array.from({ length: count }, (_, i) => text(`LINE ${i}`)) })
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const count of [1, 2]) {
      const view = defineCardsView({ desktop: count, terminal: count }, lines(count))
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
  const view = defineCardsView({ desktop: 2, terminal: 2 }, () => ({ lines: [text('LINE 0'), text('LINE 1')] }))
  for (const maxRows of [4, 6, 7]) {
    const snap = snapOf({ expanded: true, maxRows })
    const tree = view.draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
    expect([maxRows, byKey(tree, 'cards'), visualRows(tree, 'terminal') <= maxRows, byKey(tree, 'hide', 'Button') !== undefined]).toEqual([maxRows, undefined, true, true])
  }
})
test('with the cards given way, a window only they draw still says it needs you, on the row they would start on', () => {
  const view = defineCardsView({ desktop: 2, terminal: 2 }, () => ({ lines: [text('LINE 0'), text('LINE 1')] }))
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
  const tree = defineCardsView({ desktop: 1, terminal: 1 }, () => ({ lines: [text('LINE')] })).draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT)
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
  expect(['cache', 'spend', 'context', 'limits'].map(name => boldOf(cardHead(tree, name)))).toEqual([['52m'], ['$3.19'], ['40%'], ['30%']])
  expect(shown(cardHead(tree, 'limits'))).toBe('LIMITS7d 30%')
  const label = byKey(cardHead(tree, 'cache'), 'say1', 'Text')
  expect([shown(label), label?.props?.color]).toEqual([' left', DARK.label])
})
test("LIMITS leads with the worst window's reset and pace, never the collapsed row's value", () => {
  const zoned = { zone: fixedZone(0), maxRows: 13 }
  expect(cardFirstRow(opened({}, zoned), 'limits')).toBe('resetsSat 19:00 · on pace for ~50%')
  expect(cardFirstRow(opened({}, { maxRows: 13 }), 'limits')).toBe('resetsin 2d 19h · on pace for ~50%')
  expect(cardFirstRow(opened({ shown: ['pace'] }, zoned), 'limits')).toBe('resetsSat 19:00')
  expect(cardFirstRow(opened({ shown: ['reset'] }, zoned), 'limits')).toBe('on pace for ~50%')
  expect(cardFirstRow(opened({ shown: ['reset', 'pace'] }, zoned), 'limits')).toMatch(/^5h/)
  // Taller, every window follows; the worst's own reset line isn't said twice.
  const tall = opened({}, { zone: fixedZone(0) })
  expect([fact(tall, '5h'), fact(tall, '7d'), fact(tall, '5h pace'), fact(tall, '7d pace')]).toEqual(['4%', '30%', '5h resets 3h 00m · on pace for ~10%', undefined])
  // A layout may have each window say its reset at the clock, as the lead row does.
  expect(fact(opened({ windowResets: 'clock' }, { zone: fixedZone(0) }), '5h pace')).toBe('5h resets 03:00 · on pace for ~10%')
})
test("a window's own line leaves out what the collapsed lines say of it, the worst's lead row too", () => {
  const said = (shownByWindow: OpenOptions['shownByWindow']) => {
    const tree = opened({ shownByWindow, windowResets: 'clock' }, { zone: fixedZone(0) })
    return [fact(tree, '5h pace'), cardFirstRow(tree, 'limits')]
  }
  expect(said({})).toEqual(['5h resets 03:00 · on pace for ~10%', 'resetsSat 19:00 · on pace for ~50%'])
  expect(said({ '5h': ['reset'] })[0]).toBe('5h on pace for ~10%')
  expect(said({ '5h': ['pace'] })[0]).toBe('5h resets 03:00')
  expect(said({ '5h': ['reset', 'pace'] })[0]).toBeUndefined()
  expect(said({ '7d': ['reset'] })[1]).toBe('on pace for ~50%')
  expect(said({ '7d': ['reset', 'pace'] })[1]).toMatch(/^5h/)
  // In the countdown form, the same.
  expect(fact(opened({ shownByWindow: { '5h': ['pace'] } }), '5h pace')).toBe('5h resets 3h 00m')
  // Named even with its bar row gone, so under `7d 30%` it can't read as the week's.
  expect(fact(opened({ shown: ['window:5h'] }), '5h pace')).toBe('5h resets 3h 00m · on pace for ~10%')
})
test('every line of cards shares one top edge: each card top-aligned, its head row level with its neighbours\'', () => {
  for (const columns of [120, 160]) {
    const lines = (byKey(opened({}, { columns }), 'cards', 'Box')?.children ?? []) as Node[]
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line.props?.alignItems).toBe('flex-start')
  }
})
test("the footer's hint gives way where it and both buttons run past the band; the buttons always stay", () => {
  // A terminal's footer at 60 columns would be 62 cells; the desktop's measure holds it to 55.
  for (const [surface, columns] of [['terminal', 60], ['desktop', 50]] as const) {
    const footer = (at: number) => byKey(opened({}, { surface, columns: at }), 'actions', 'Box')
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
