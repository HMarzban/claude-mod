// The pro-design pass: contrast, chips that never break, context toward
// compaction, honest early states, a tidy card grid and clear card copy.

import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  CLEAR,
  FRESH,
  HOUR_1,
  PLUGIN,
  START,
  USAGE,
  base,
  breakdown,
  cardOf,
  fact,
  firstRow,
  pillOf,
  props,
  resp,
  respond,
  shown,
  svgsOf,
  walk,
  type Node,
} from './helpers'

/** WCAG 2.x contrast ratio of two hex colours. */
const contrast = (a: string, b: string): number => {
  const lum = (hex: string): number => {
    const [r, g, bl] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (bl ?? 0)
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05)
}
/** What the desktop app paints behind the band, measured from screenshots. */
const BAND = '#212121'

const withCompaction = (tokens: number) => ({
  ...USAGE,
  context: { tokens, window: 200_000, percent: (tokens / 2000), breakdown: breakdown({ autoCompactThreshold: 160_000, isAutoCompactEnabled: true }) },
})
const measureContext = async ($: Engine, tokens: number) =>
  $.session.measure({ context: { tokens, window: 200_000, percent: tokens / 2000 }, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })

// ── contrast ───────────────────────────────────────────────────────────

test('labels and values meet WCAG text contrast on every surface they sit on', () => {
  for (const bg of [DARK.surface, DARK.amberBg, DARK.cardBg, DARK.fiveBg, DARK.weekBg]) {
    expect(contrast(DARK.label, bg)).toBeGreaterThanOrEqual(4.5)
  }
  expect(contrast(DARK.cardValue, DARK.cardBg)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(DARK.value, DARK.cardBg)).toBeGreaterThanOrEqual(4.5)
})

test('card edges and bar tracks meet WCAG non-text contrast', () => {
  expect(contrast(DARK.cardBorder, BAND)).toBeGreaterThanOrEqual(3)
  for (const bg of [DARK.surface, DARK.amberBg, DARK.cardBg, DARK.fiveBg, DARK.weekBg]) {
    expect(contrast(DARK.trackStroke, bg)).toBeGreaterThanOrEqual(3)
  }
  expect(DARK.tooltipBg).not.toBe(DARK.cardBg) // hover cards stand above the cards
})

// ── the chip row ───────────────────────────────────────────────────────

test('chips never shrink, so their text never wraps', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95) })
  const pills = ((firstRow(await ui.drawn()) as Node).children ?? []).filter(k => (k as Node).props?.key !== undefined && ['cache', 'cost', 'tokens', 'ctx', '5h', '7d'].includes(String((k as Node).props?.key)))
  expect(pills.length).toBeGreaterThan(3)
  for (const p of pills) expect((p as Node).props?.flexShrink).toBe(0)
  await ui.unmount()
})

test('expanding leaves the chip row exactly as it was; only the toggle turns to ▴, never a Control-key glyph', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(152_000))
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 152_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95) })
  const toggle = async () => {
    let label: unknown
    walk(firstRow(await ui.drawn()), n => {
      if (n.type === 'Button' && n.props?.key === 'more') label = n.props?.label
    })
    return label
  }
  const before = shown(firstRow(await ui.drawn()))
  expect(await toggle()).toBe('▾')
  await ui.press({ key: 'more' })
  expect(shown(firstRow(await ui.drawn()))).toBe(before)
  expect(await toggle()).toBe('▴')
  await ui.unmount()
})

// ── context toward compaction ──────────────────────────────────────────

test('with compaction known, the context chip measures toward it, with no tick', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(100_000))
  await $.session.start({ ...START, surface: 'desktop' })
  await measureContext($, 100_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(140) })
  const ctx = pillOf(await ui.drawn(), 'ctx')
  expect(shown(ctx)).toMatch(/63% full$/)
  const bar = svgsOf(ctx).find(n => /used/.test(String(n.props?.alt)))
  expect(String(bar?.props?.alt)).toMatch(/^context 63% used/)
  expect(String(bar?.props?.source)).not.toContain('class="tick"')
  await ui.unmount()
})

test('near compaction the chip says how full and how far to go', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(152_000))
  await $.session.start(START)
  await measureContext($, 152_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  expect(shown(pillOf(await ui.drawn(), 'ctx'))).toMatch(/95% full · compacts in ~8\.0k/)
  await ui.unmount()
})

test('the context card leads with how full it is toward compaction', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(152_000))
  await $.session.start(START)
  await measureContext($, 152_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
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
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // $2.41 already spent
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache –/)
  await ui.press({ key: 'more' })
  const card = shown(cardOf(await ui.drawn(), 'cache'))
  expect(card).toMatch(/Not measured yet/)
  expect(card).toMatch(/Countdown starts with Claude's next reply/)
  expect(shown(cardOf(await ui.drawn(), 'spend'))).toMatch(/Breakdown counts from your next message/)
  await ui.unmount()
})

test('a brand-new session, or one after /clear, is warming', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, FRESH)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache warming/)
  await ui.press({ key: 'more' })
  expect(shown(cardOf(await ui.drawn(), 'cache'))).toMatch(/First message builds the cache/)
  await ui.unmount()
})

test('after /clear the new conversation is warming even with spend on the ledger', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(CLEAR)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache warming/)
  await ui.unmount()
})

// ── card copy ──────────────────────────────────────────────────────────

test('the cache card leads with the stake: re-warm cost, savings, hit rate, expiry', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(shown(cardOf(tree, 'cache'))).toMatch(/^CACHE1h 00m left/)
  // rate = 2.41 / (14k + 1.25*106k + 0.1*100k + 5*5k) = 2.41 / 181.5k
  expect(fact(tree, 're-warm if cold')).toBe('~$1.88') // 1.25 * 113k * rate
  expect(fact(tree, 'saved by cache')).toBe('~$1.20') // 0.9 * 100k * rate
  expect(fact(tree, 'hit rate')).toBe('45%')
  expect(fact(tree, 'expires')).toBe('1h idle')
  await ui.unmount()
})

test('the spend card names its split like a legend: input, output, cache reads', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(fact(tree, 'input')).toBe('120k')
  expect(fact(tree, 'output')).toBe('5.0k')
  expect(fact(tree, 'cache reads')).toBe('100k')
  await ui.unmount()
})

test('the limits card puts each value beside its bar and says the pace in words', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // 5h 4%, 2h of 5h gone; 7d 30%, 101h of 168h gone
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
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
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const lines = async (cols: number) => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(cols) })
    let grid: Node | undefined
    walk(await ui.drawn(), n => {
      if (n.type === 'Box' && n.props?.key === 'cards') grid = n
    })
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
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95) })
    await ui.press({ key: 'more' })
    await ui.unmount()
  })()
  expect(await lines(95)).toEqual([['cache', 'spend'], ['context', 'limits']])
  expect(await lines(140)).toEqual([['cache', 'spend', 'context', 'limits']])
})

test('the expanded band fits the rows it is given: cards drop their least facts first', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(100_000))
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const rowsOf = async (maxRows: number) => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(95, false, maxRows) })
    if (maxRows === 40) await ui.press({ key: 'more' })
    const tree = await ui.drawn()
    await ui.unmount()
    // two lines of cards, each its tallest card plus its border, a row between
    // them; the chip row and the buttons, each with a row of air before the next
    const tallest = (names: string[]) => Math.max(...names.map(n => (cardOf(tree, n)?.children ?? []).filter(Boolean).length)) + 2
    return { total: 5 + tallest(['cache', 'spend']) + tallest(['context', 'limits']), tree }
  }
  const roomy = await rowsOf(40)
  expect(fact(roomy.tree, 'model window')).toBe('200k')
  const tight = await rowsOf(18)
  expect(tight.total).toBeLessThanOrEqual(18)
  expect(fact(tight.tree, 're-warm if cold')).toBeDefined() // the stake stays
  expect(fact(tight.tree, 'model window')).toBeUndefined() // the least goes first
})

test('desktop cards have a visible rounded border; terminal cards a fill only', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await desk.press({ key: 'more' })
  const d = cardOf(await desk.drawn(), 'cache')
  expect(d?.props?.borderStyle).toBe('round')
  expect(d?.props?.borderColor).toBe(DARK.cardBorder)
  expect(d?.props?.backgroundColor).toBe(DARK.cardBg)
  await desk.unmount()
  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const t = cardOf(await term.drawn(), 'cache')
  expect(t?.props?.borderStyle).toBeUndefined()
  expect(t?.props?.backgroundColor).toBe(DARK.cardBg)
  await term.unmount()
})

test('the buttons: Collapse without a Ctrl-like glyph, Hide band, and how to bring it back', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
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
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(100_000))
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(140) })
  await ui.press({ key: 'more' })
  const ids = svgsOf(await ui.drawn()).flatMap(n => [...String(n.props?.source).matchAll(/ id="([^"]+)"/g)].map(m => m[1]))
  expect(new Set(ids).size).toBe(ids.length)
  await ui.unmount()
})

test('the desktop gets no whitespace-only strings, which it drops, so every gap is a spacer', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, withCompaction(100_000))
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await measureContext($, 100_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(160) })
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
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(95) })
    if (surface === 'desktop') await ui.press({ key: 'more' })
    let grid: Node | undefined
    let actions: Node | undefined
    walk(await ui.drawn(), n => {
      if (n.type === 'Box' && n.props?.key === 'cards') grid = n
      if (n.type === 'Box' && n.props?.key === 'actions') actions = n
    })
    expect(grid?.props?.rowGap).toBe(1)
    expect(actions?.props?.marginTop).toBe(1)
    await ui.unmount()
  }
})

test('each desktop card title, and the hint, leads with an icon; terminal titles stay text', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  const headOf = (name: string) => ((cardOf(tree, name)?.children ?? []) as Node[]).find(k => k?.props?.key === 'head')
  const expected: Record<string, string> = { cache: 'cache', spend: 'cost', context: 'context', limits: 'limits' }
  for (const [name, alt] of Object.entries(expected)) {
    expect(svgsOf(headOf(name)).map(n => n.props?.alt)).toEqual([alt])
  }
  let actions: Node | undefined
  walk(tree, n => {
    if (n.type === 'Box' && n.props?.key === 'actions') actions = n
  })
  expect(svgsOf(actions).map(n => n.props?.alt)).toEqual(['info'])
  await ui.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(shown(cardOf(await term.drawn(), 'cache'))).toMatch(/^CACHE/)
  await term.unmount()
})

test('the toggle is a framed native button on the desktop, a plain glyph in the terminal', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const toggleOf = async (surface: 'desktop' | 'terminal') => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(110) })
    let found: Node | undefined
    walk(firstRow(await ui.drawn()), n => {
      if (n.type === 'Button' && n.props?.key === 'more') found = n
    })
    await ui.unmount()
    return found
  }
  const desk = await toggleOf('desktop')
  expect(desk?.props?.variant).toBe('secondary')
  expect(desk?.props?.plain).toBeUndefined()
  const term = await toggleOf('terminal')
  expect(term?.props?.plain).toBe(true)
  expect(term?.props?.label).toBe('▾')
})
