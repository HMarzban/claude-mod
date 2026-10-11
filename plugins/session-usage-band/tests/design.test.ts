// The pro-design pass: contrast, chips that never break, context toward
// compaction, honest early states, a tidy card grid and clear card copy.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { DARK, LIGHT } from '../hooks/palette'
import { ROLE_INK } from '../hooks/views/parts'
import {
  CLEAR,
  DARK_HOSTS,
  FRESH,
  LIGHT_HOSTS,
  contrast,
  START,
  USAGE,
  breakdown,
  byKey,
  cardOf,
  fact,
  firstRow,
  pillOf,
  resp,
  respond,
  shown,
  svgsOf,
  walk,
  type Node,
  setup,
  mountBand,
} from './helpers'

const withCompaction = (tokens: number) => ({
  ...USAGE,
  context: { tokens, window: 200_000, percent: (tokens / 2000), breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }) },
})
const measureContext = async ($: Engine, tokens: number) =>
  $.session.measure({ context: { tokens, window: 200_000, percent: tokens / 2000 }, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })

// ── contrast ───────────────────────────────────────────────────────────

// Both palettes, every pair: a palette added later is checked by adding it here.
for (const [name, p, hosts] of [
  ['dark', DARK, DARK_HOSTS],
  ['light', LIGHT, LIGHT_HOSTS],
] as const) {
  const pillGrounds = [p.surface, p.amberBg, p.cardBg, p.fiveBg, p.weekBg]

  test(`${name}: labels and values meet WCAG text contrast on every surface they sit on`, () => {
    for (const bg of pillGrounds) expect(contrast(p.label, bg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.cardValue, p.cardBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.value, p.cardBg)).toBeGreaterThanOrEqual(4.5)
  })

  test(`${name}: card edges and bar tracks meet WCAG non-text contrast`, () => {
    for (const host of hosts) expect(contrast(p.cardBorder, host)).toBeGreaterThanOrEqual(3)
    for (const bg of pillGrounds) expect(contrast(p.trackStroke, bg)).toBeGreaterThanOrEqual(3)
    expect(p.tooltipBg).not.toBe(p.cardBg) // hover cards stand above the cards
  })

  test(`${name}: the new layouts' text and marks hold on the card ground and on flaps`, () => {
    expect(contrast(p.amberFg, p.cardBg)).toBeGreaterThanOrEqual(4.5)
    for (const mark of [p.meterFill, p.warm, p.fiveAccent, p.weekAccent]) expect(contrast(mark, p.cardBg)).toBeGreaterThanOrEqual(3)
    expect(contrast(p.value, p.surface)).toBeGreaterThanOrEqual(4.5)
    for (const ink of [p.flapText, p.flapDim, p.flapWarm, p.flapAmber, p.flapFive, p.flapWeek, p.flapCoin]) expect(contrast(ink, p.flap)).toBeGreaterThanOrEqual(4.5)
  })

  test(`${name}: every role a layout's words take is text that holds on the card ground`, () => {
    const low = Object.entries(ROLE_INK).filter(([, ink]) => contrast(p[ink], p.cardBg) < 4.5)
    expect(low.map(([role, ink]) => `${role} ${ink} ${contrast(p[ink], p.cardBg).toFixed(2)}`)).toEqual([])
  })
}

// ── the chip row ───────────────────────────────────────────────────────

test('chips never shrink, so their text never wraps', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'desktop', 95)
  const pills = ((firstRow(await ui.drawn()) as Node).children ?? []).filter(k => (k as Node).props?.key !== undefined && ['cache', 'cost', 'tokens', 'ctx', '5h', '7d'].includes(String((k as Node).props?.key)))
  expect(pills.length).toBeGreaterThan(3)
  for (const p of pills) expect((p as Node).props?.flexShrink).toBe(0)
  await ui.unmount()
})

test("expanding leaves the chip row exactly as it was; only the toggle's icon turns from ▿ to ▵", async ($, on) => {
  setup(on, { usage: withCompaction(152_000) })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 152_000)
  const ui = await mountBand($, 'desktop', 95)
  const toggle = async () => byKey(firstRow(await ui.drawn()), 'more', 'Button')?.props?.label
  const before = shown(firstRow(await ui.drawn()))
  expect(await toggle()).toBe('▿')
  await ui.press({ key: 'more' })
  expect(shown(firstRow(await ui.drawn()))).toBe(before)
  expect(await toggle()).toBe('▵')
  await ui.unmount()
})

// ── context toward compaction ──────────────────────────────────────────

test('with compaction known, the context chip measures toward it, with no tick', async ($, on) => {
  setup(on, { usage: withCompaction(100_000) })
  await $.session.start({ ...START, surface: 'desktop' })
  await measureContext($, 100_000)
  const ui = await mountBand($, 'desktop', 140)
  const ctx = pillOf(await ui.drawn(), 'ctx')
  expect(shown(ctx)).toMatch(/63% full$/)
  const bar = svgsOf(ctx).find(n => /used/.test(String(n.props?.alt)))
  expect(String(bar?.props?.alt)).toMatch(/^context 63% used/)
  expect(String(bar?.props?.source)).not.toContain('class="tick"')
  await ui.unmount()
})

test('near compaction the chip says how full and how far to go', async ($, on) => {
  setup(on, { usage: withCompaction(152_000) })
  await $.session.start(START)
  await measureContext($, 152_000)
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'ctx'))).toMatch(/95% full · compacts in ~8\.0k/)
  await ui.unmount()
})

test('the context card leads with how full it is toward compaction', async ($, on) => {
  setup(on, { usage: withCompaction(152_000) })
  await $.session.start(START)
  await measureContext($, 152_000)
  const ui = await mountBand($, 'terminal', 140)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'context'))).toMatch(/^CONTEXT95% full/)
  expect(fact(tree, 'in context')).toBe('152k')
  expect(fact(tree, 'auto-compacts at')).toBe('160k')
  expect(fact(tree, 'room left')).toBe('~8.0k')
  expect(fact(tree, 'model window')).toBe('200k')
  await ui.unmount()
})

// ── honest early states ────────────────────────────────────────────────

test('after a reload with spend on the ledger, the cache is not measured yet, not warming', async ($, on) => {
  setup(on) // $2.41 already spent
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache –/)
  await ui.press({ key: 'more' })
  const card = shown(cardOf(await ui.drawn(), 'cache'))
  expect(card).toMatch(/Not measured yet/)
  expect(card).toMatch(/Countdown starts with Claude's next reply/)
  expect(shown(cardOf(await ui.drawn(), 'spend'))).toMatch(/Breakdown counts from your next message/)
  await ui.unmount()
})

test('a brand-new session, or one after /clear, is warming', async ($, on) => {
  setup(on, { usage: FRESH })
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache warming/)
  await ui.press({ key: 'more' })
  expect(shown(cardOf(await ui.drawn(), 'cache'))).toMatch(/First message builds the cache/)
  await ui.unmount()
})

test('after /clear the new conversation is warming even with spend on the ledger', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache warming/)
  await ui.unmount()
})

// ── card copy ──────────────────────────────────────────────────────────

test('the cache card leads with the stake: re-warm cost, savings, hit rate, expiry', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await mountBand($, 'terminal', 140)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'cache'))).toMatch(/^CACHE1h 00m left/)
  // reads at Opus 5.5's 0.05×: rate = 2.41 / (14k + 1.25*106k + 0.05*100k + 5*5k) = 2.41 / 176.5k
  expect(fact(tree, 're-warm if cold')).toBe('~$1.93') // 1.25 * 113k * rate
  expect(fact(tree, 'saved by cache')).toBe('~$1.30') // 0.95 * 100k * rate
  expect(fact(tree, 'hit rate')).toBe('45%')
  expect(fact(tree, 'expires')).toBe('1h idle')
  await ui.unmount()
})

test('the spend card names its split like a legend: input, output, cache reads', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await mountBand($, 'terminal', 140)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'input')).toBe('120k')
  expect(fact(tree, 'output')).toBe('5.0k')
  expect(fact(tree, 'cache reads')).toBe('100k')
  await ui.unmount()
})

test('the limits card puts each value beside its bar and says the pace in words', async ($, on) => {
  setup(on) // 5h 4%, 2h of 5h gone; 7d 30%, 101h of 168h gone
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 140)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'limits'))).toMatch(/^LIMITS7d 30%/) // the window closest to trouble
  expect(fact(tree, '5h')).toBe('4%')
  expect(fact(tree, '5h pace')).toBe('resets 3h 00m · on pace for ~10%')
  expect(fact(tree, '7d pace')).toBe('resets 2d 19h · on pace for ~50%')
  await ui.unmount()
})

// ── the grid and the buttons ───────────────────────────────────────────

test('cards sit in lines that share the width equally: four across when they fit, else two by two', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const lines = async (cols: number) => {
    const ui = await mountBand($, 'desktop', cols)
    const grid = byKey(await ui.drawn(), 'cards', 'Box')
    await ui.unmount()
    return ((grid?.children ?? []) as Node[]).map(line => {
      expect(line.props?.flexWrap).not.toBe('wrap') // a line never wraps a card away
      return ((line.children ?? []) as Node[]).map(k => {
        expect(k.props?.flexGrow).toBe(1)
        expect(k.props?.width).toBe(0) // equal shares, whatever the text
        return String(k.props?.key).replace('card:', '')
      })
    })
  }
  await (async () => {
    const ui = await mountBand($, 'desktop', 95)
    await ui.press({ key: 'more' })
    await ui.unmount()
  })()
  expect(await lines(95)).toEqual([['cache', 'spend'], ['context', 'limits']])
  expect(await lines(140)).toEqual([['cache', 'spend', 'context', 'limits']])
})

test('the expanded band fits the rows it is given: cards drop their least facts first', async ($, on) => {
  setup(on, { usage: withCompaction(100_000) })
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const rowsOf = async (maxRows: number) => {
    const ui = await mountBand($, 'desktop', 95, { maxRows })
    if (maxRows === 40) await ui.press({ key: 'more' })
    const tree = await ui.drawn()
    await ui.unmount()
    // two lines of cards, each its tallest card plus its border, a row between
    // them; the chip row and the buttons, each with a row of air before the next
    const tallest = (names: string[]) => Math.max(...names.map(n => (cardOf(tree, n)?.children ?? []).filter(Boolean).length)) + 2
    const strip = byKey(tree, 'strip', 'Box') === undefined ? 0 : 1
    return { total: 5 + strip + tallest(['cache', 'spend']) + tallest(['context', 'limits']), tree }
  }
  const roomy = await rowsOf(40)
  expect(fact(roomy.tree, 'model window')).toBe('200k')
  const tight = await rowsOf(18)
  expect(tight.total).toBeLessThanOrEqual(18)
  expect(fact(tight.tree, 're-warm if cold')).toBeDefined() // the stake stays
  expect(fact(tight.tree, 'model window')).toBeUndefined() // the least goes first
})

test('desktop cards have a visible rounded border; terminal cards a fill only', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  const desk = await mountBand($, 'desktop', 110)
  await desk.press({ key: 'more' })
  const d = cardOf(await desk.drawn(), 'cache')
  expect(d?.props?.borderStyle).toBe('round')
  expect(d?.props?.borderColor).toBe(DARK.cardBorder)
  expect(d?.props?.backgroundColor).toBe(DARK.cardBg)
  await desk.unmount()
  const term = await mountBand($, 'terminal', 110)
  const t = cardOf(await term.drawn(), 'cache')
  expect(t?.props?.borderStyle).toBeUndefined()
  expect(t?.props?.backgroundColor).toBe(DARK.cardBg)
  await term.unmount()
})

test('the buttons: Collapse without a Ctrl-like glyph, Hide band, and how to bring it back', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await mountBand($, 'desktop', 110)
  await ui.press({ key: 'more' })
  const labels: string[] = []
  walk(await ui.drawn(), n => {
    if (n.type === 'Button' && (n.props?.key === 'collapse' || n.props?.key === 'hide')) labels.push(String(n.props?.label))
  })
  expect(labels).toEqual(['Collapse', 'Hide band'])
  expect(shown(await ui.drawn())).toMatch(/Bring it back with \/usage-band/)
  await ui.unmount()
})

test('every SVG id in an expanded desktop band is unique, so no bar clips to another', async ($, on) => {
  setup(on, { usage: withCompaction(100_000) })
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const ui = await mountBand($, 'desktop', 140)
  await ui.press({ key: 'more' })
  const ids = svgsOf(await ui.drawn()).flatMap(n => [...String(n.props?.source).matchAll(/ id="([^"]+)"/g)].map(m => m[1]))
  expect(new Set(ids).size).toBe(ids.length)
  await ui.unmount()
})

test('the desktop gets no whitespace-only strings, which it drops, so every gap is a spacer', async ($, on) => {
  setup(on, { usage: withCompaction(100_000) })
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const ui = await mountBand($, 'desktop', 160)
  await ui.press({ key: 'more' })
  const bare: string[] = []
  walk(await ui.drawn(), n => {
    for (const k of n.children ?? []) if (typeof k === 'string' && k.trim() === '') bare.push(`${n.type}:${String(n.props?.key)}`)
  })
  expect(bare).toEqual([])
  // and the icons and bars still have air beside them
  const five = pillOf(await ui.drawn(), '5h')
  expect(((five?.children ?? []) as Node[]).filter(k => k?.type === 'Box' && k.props?.width === 1).length).toBeGreaterThanOrEqual(2)
  await ui.unmount()
})

test('card lines have a row of air between them, and the buttons a row above', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mountBand($, surface, 95)
    if (surface === 'desktop') await ui.press({ key: 'more' })
    const tree = await ui.drawn()
    const grid = byKey(tree, 'cards', 'Box')
    const actions = byKey(tree, 'actions', 'Box')
    expect(grid?.props?.rowGap).toBe(1)
    expect(actions?.props?.marginTop).toBe(1)
    await ui.unmount()
  }
})

test('each desktop card title, and the hint, leads with an icon; terminal titles stay text', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  const ui = await mountBand($, 'desktop', 110)
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  const headOf = (name: string) => ((cardOf(tree, name)?.children ?? []) as Node[]).find(k => k?.props?.key === 'head')
  const expected: Record<string, string> = { cache: 'cache', spend: 'cost', context: 'context', limits: 'limits' }
  for (const [name, alt] of Object.entries(expected)) {
    expect(svgsOf(headOf(name)).map(n => n.props?.alt)).toEqual([alt])
  }
  const actions = byKey(tree, 'actions', 'Box')
  expect(svgsOf(actions).map(n => n.props?.alt)).toEqual(['info'])
  await ui.unmount()

  const term = await mountBand($, 'terminal', 110)
  expect(shown(cardOf(await term.drawn(), 'cache'))).toMatch(/^CACHE/)
  await term.unmount()
})

test('the toggle is a framed native button on the desktop, a plain glyph in the terminal', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const toggleOf = async (surface: 'desktop' | 'terminal') => {
    const ui = await mountBand($, surface, 110)
    const found = byKey(firstRow(await ui.drawn()), 'more', 'Button')
    await ui.unmount()
    return found
  }
  const desk = await toggleOf('desktop')
  expect(desk?.props?.variant).toBe('secondary')
  expect(desk?.props?.plain).toBeUndefined()
  const term = await toggleOf('terminal')
  expect(term?.props?.plain).toBe(true)
  expect(term?.props?.label).toBe('▿')
})

test('a card short of rows gives up its bar before a fact, since the chips already show it', async ($, on) => {
  setup(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const contextAt = async (maxRows: number) => {
    const ui = await mountBand($, 'desktop', 95, { maxRows })
    const open = byKey(await ui.drawn(), 'cards', 'Box') !== undefined
    if (!open) await ui.press({ key: 'more' })
    const tree = await ui.drawn()
    await ui.unmount()
    return tree
  }
  // 13 rows, as the desktop gives: one body row a card
  const short = await contextAt(13)
  expect(svgsOf(cardOf(short, 'context')).filter(n => /used/.test(String(n.props?.alt)))).toHaveLength(0)
  expect(fact(short, 'in context')).toBe('76k')
  expect(svgsOf(cardOf(short, 'spend')).filter(n => /token split/.test(String(n.props?.alt)))).toHaveLength(0)
  // with rows to spare the bar is back, above the facts
  const tall = await contextAt(40)
  expect(svgsOf(cardOf(tall, 'context')).filter(n => /used/.test(String(n.props?.alt)))).toHaveLength(1)
})
