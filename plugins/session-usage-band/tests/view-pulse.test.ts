// Pulse, is my spending speeding up: chips' pills with history inside them,
// the cost bars beside the total and the 5h trail on its own scale; how the
// row gives way and amber leads; and the shared cards it opens into, their
// heads carrying the conversation's history.

import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import type { Sample } from '../hooks/memory'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { EMPTY } from '../hooks/words'
import { CLEAR, HOUR, LONG, MIN, START, byKey, cardOf, fakeEl, firstRow, mountBand, pacing, resp, respond, setup, shown, svgAlts, svgsOf, usage, walk, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('pulse')

/** Twenty-four messages, $0.20 each but a $0.84 re-warm seven from the end
 *  and a last of $0.21. */
const COSTS = Array.from({ length: 24 }, (_, i) => ({ usd: i === 23 ? 0.21 : i === 17 ? 0.84 : 0.2, reWarm: i === 17 }))
/** The last hour of the 5h limit, a reading every five minutes, 2% to 4%. */
const FIVE_HOUR = Array.from({ length: 12 }, (_, i) => ({ at: (i - 11) * 5 * MIN, pct: 2 + i / 5.5 }))
const HISTORY = { costs: COSTS, context: [40_000, 60_000, 76_000], fiveHour: FIVE_HOUR }
/** The 7d window measured across yesterday, 20% to 30%. */
const SAMPLES: Sample[] = [-30 * HOUR, -HOUR].map((at, i) => ({ at, fivePct: 4, sevenPct: 20 + 10 * i, fiveResetAt: 3 * HOUR, sevenResetAt: 67 * HOUR }))

/** The band as pulse draws it at 160 columns, with history. */
const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'pulse', columns: 160, maxRows: 40, history: HISTORY, samples: SAMPLES, ...over }), NO_ACT) as unknown as Node
const rowOf = (over: Partial<BandSnapshot> = {}): Node => firstRow(band(over)) as Node
/** The row's pills, by key, in order. */
const pillKeys = (row: Node): unknown[] => (row.children ?? []).filter(k => (k as Node | null)?.props?.flexShrink === 0 && (k as Node).props?.key !== undefined).map(k => (k as Node).props?.key)
const pillOf = (row: Node, key: string): Node | undefined => byKey(row, key, 'Box')
/** The bold Texts of a node, as they read. */
const boldOf = (n: Node | undefined): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}
const BRAILLE = /[⠀-⣿]+/
/** The Svgs that chart a reading: the bars, a trail, a meter, the day cells. */
const chartsOf = (n: unknown): Node[] => svgsOf(n).filter(s => /^(cost of|5h usage|context|7d|weekly)/.test(String(s.props?.alt)) && !/^context$/.test(String(s.props?.alt)))
/** Each card's first row past its head, as it reads. */
const firstRowOf = (tree: Node, name: string): string => shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(Boolean)[1])

test("collapsed is one row of chips' pills: cache, the cost with its bars, context, 5h on its trail, 7d on its bar, then ▵", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = rowOf({ surface })
    expect(pillKeys(row)).toEqual(['cache', 'cost', 'ctx', '5h', '7d'])
    expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▵')
  }
  const text = shown(rowOf())
  expect(text).toMatch(/◷ cache 52m .*\$3\.19 [⠀-⣿]{7} · last \$0\.21◔ 40% full5h [⠀-⣿]{6} 4%7d █+░+ 30%$/)
  // No tokens and no resets: the cards say them.
  expect(text).not.toMatch(/Σ|↻/)
  expect(chartsOf(rowOf({ surface: 'desktop' })).map(s => String(s.props?.alt))).toEqual([
    'cost of the last 14 messages, steady, average $0.20, max $0.84 re-warm',
    '5h usage over the last hour, rising',
    '7d 30% used',
  ])
})
test('one bold per reading, on its figure: the total, 5h and 7d', () => {
  for (const surface of ['terminal', 'desktop'] as const) expect(boldOf(rowOf({ surface }))).toEqual(['$3.19', ' 4%', ' 30%'])
})
test('no thumb or knob ends a fill or a line, shut or open', () => {
  for (const expanded of [false, true]) {
    const sources = chartsOf(band({ surface: 'desktop', expanded })).map(s => String(s.props?.source))
    expect(sources.length).toBeGreaterThanOrEqual(3)
    for (const source of sources) expect(source).not.toMatch(/class="tick"|<circle/)
  }
})
test('the cost bars sit on a track, warm in grey, a re-warm in value ink with a cap, scaled to three times the warm average', () => {
  const bars = chartsOf(rowOf({ surface: 'desktop' })).find(s => /^cost of/.test(String(s.props?.alt)))
  const source = String(bars?.props?.source)
  expect(source).toMatch(/<rect class="track"/)
  const heights = [...source.matchAll(/<rect class="bar" [^>]*height="(\d+)" [^>]*fill="([^"]+)"/g)].map(m => [Number(m[1]), m[2]])
  // The warm average is about $0.20, so its bars stand a third of the 13 px
  // the cap leaves, and the re-warm, past the top, stands full.
  expect(heights.map(([tall]) => tall)).toEqual([4, 4, 4, 4, 4, 4, 4, 13, 4, 4, 4, 4, 4, 5])
  expect(heights.map(([, fill]) => fill === DARK.value)).toEqual(heights.map((_, i) => i === 7))
  expect(source.match(/class="cap"/g)?.length).toBe(1)
  // In text the re-warm's cell is in value ink, the rest in the bars' grey.
  const cells = ((byKey(pillOf(rowOf(), 'cost'), 'bars', 'Text')?.children ?? []) as Node[]).map(k => [shown(k), k.props?.color])
  expect(cells).toEqual([['⣀⣀⣀', DARK.meterFill], ['⣸', DARK.value], ['⣀⣀⣀', DARK.meterFill]])
})
test('the 5h trail runs 0 to 100 on a track, so a flat 0% sits on the floor', () => {
  const flat = { fiveHour: { percentUsed: 0, resetsAt: new Date(5 * HOUR).toISOString(), etaMs: null }, history: { ...HISTORY, fiveHour: FIVE_HOUR.map(p => ({ ...p, pct: 0 })) } }
  const trail = chartsOf(rowOf({ surface: 'desktop', ...flat })).find(s => /^5h usage/.test(String(s.props?.alt)))
  const source = String(trail?.props?.source)
  expect(source).toMatch(/<rect class="track"/)
  const [, points = ''] = source.match(/<polyline points="([^"]+)"/) ?? []
  expect(new Set(points.split(' ').map(p => p.split(',')[1]))).toEqual(new Set(['14']))
  expect(shown(byKey(pillOf(rowOf(flat), '5h'), 'trail', 'Text'))).toBe('⣀'.repeat(6))
})
test("the charts give way first; then 7d's bar, 7d, the wording, the last cost, context and 5h", () => {
  /** Whether a pill says `re`, in its text or its charts' alts. */
  const says = (key: string, re: RegExp) => (row: Node): boolean => {
    const p = pillOf(row, key)
    return p !== undefined && re.test([shown(p), ...svgAlts(p)].join(' '))
  }
  /** What each step leaves in the row, in the order they give way. */
  const kept: ReadonlyArray<readonly [string, (row: Node) => boolean]> = [
    ['barsMany', says('cost', /cost of the last 14|[⠀-⣿]{7}/)],
    ['trailChart', says('5h', /5h usage|[⠀-⣿]/)],
    ['barsChart', says('cost', /cost of|[⠀-⣿]/)],
    ['weekBar', says('7d', /7d \d+% used|[█░]/)],
    ['calmWeek', says('7d', /7d/)],
    ['shortWording', says('ctx', / full/)],
    ['lastCost', says('cost', /last \$/)],
    ['calmContext', says('ctx', /%/)],
    ['calmFive', says('5h', /5h/)],
  ]
  for (const surface of ['terminal', 'desktop'] as const) {
    const widths = Array.from({ length: 121 }, (_, i) => 160 - i)
    const rows = widths.map(columns => rowOf({ surface, columns }))
    // Each piece's widest row without it; every one is there at 160.
    const gone = kept.map(([name, has]) => [name, widths.find((_, i) => !has(rows[i] as Node)) ?? 0] as const)
    expect(gone.filter(([, at]) => at === 160)).toEqual([])
    const order = [...gone].sort((a, b) => b[1] - a[1]).map(([name]) => name)
    expect(`${surface}: ${order.join(' ')}`).toBe(`${surface}: ${kept.map(([name]) => name).join(' ')}`)
    // Calm, the cache and the total outlast the rest.
    expect(pillKeys(rows.at(-1) as Node).slice(0, 2)).toEqual(['cache', 'cost'])
  }
})
test("amber moves to the front, whole and led by '! ', and outlasts every calm piece", () => {
  const pace = { fiveHour: { percentUsed: 50, resetsAt: new Date(4 * HOUR).toISOString(), etaMs: 40 * MIN } }
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = rowOf({ surface, ...pace })
    expect(pillKeys(row)).toEqual(['5h', 'cache', 'cost', 'ctx', '7d'])
    expect(shown(pillOf(row, '5h'))).toMatch(/^! 5h full in ~40m/)
    expect(pillKeys(rowOf({ surface, columns: 40, ...pace }))[0]).toBe('5h')
  }
  // Narrow, its trail gives way, then the total, and the reason stays whole.
  expect(pillKeys(rowOf({ columns: 50, ...pace }))).toEqual(['5h', 'cache', 'cost'])
  expect([pillKeys(rowOf({ columns: 40, ...pace })), shown(pillOf(rowOf({ columns: 40, ...pace }), '5h'))]).toEqual([['5h', 'cache'], '! 5h full in ~40m'])
  // Amber, the trail is drawn in amber and climbs dashed to where it lands.
  const trail = chartsOf(pillOf(rowOf({ surface: 'desktop', ...pace }), '5h')).find(s => /^5h usage/.test(String(s.props?.alt)))
  expect(String(trail?.props?.source)).toMatch(new RegExp(`stroke="${DARK.amberFg}"[^>]*stroke-dasharray`))
  const lastMinute = rowOf({ cache: { ...snapOf().cache, msLeft: 30_000 } })
  expect(shown(pillOf(lastMinute, 'cache'))).toMatch(/^ ?! 30s left · re-warm ~\$1\.66/)
  const near = rowOf({ context: { tokens: 180_000, window: 200_000, percent: 90, compactAt: 190_000, autoCompactOff: false } })
  expect(pillKeys(near)[0]).toBe('ctx')
  expect(shown(pillOf(near, 'ctx'))).toMatch(/! context 95% · compacts in ~10k/)
})
test('open, ▿ ends the row nearest the prompt', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = rowOf({ surface, expanded: true })
    expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▿')
  }
})
test("open is the four cards, spend's bars, context's trail and the measured days in their heads; the cache's bare", () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const open = band({ surface, expanded: true })
    expect(['cache', 'spend', 'context', 'limits'].map(name => cardOf(open, name) !== undefined)).toEqual([true, true, true, true])
    const slot = (name: string) => byKey(byKey(cardOf(open, name), 'head'), 'slot', 'Box')
    expect(slot('cache')).toBeUndefined()
    if (surface === 'terminal') {
      expect(['spend', 'context', 'limits'].map(name => BRAILLE.test(shown(slot(name))))).toEqual([true, true, true])
      continue
    }
    expect(['spend', 'context', 'limits'].map(name => svgAlts(slot(name)))).toEqual([
      ['cost of the last 24 messages, steady, average $0.20, max $0.84 re-warm'],
      ['context over the conversation, rising, compacts at 190k'],
      ['weekly limit by day, measured: Wednesday 10%'],
    ])
    // Each fits its slot: none is drawn wider than the band, nor taller than 16 px.
    for (const name of ['spend', 'context', 'limits']) for (const s of svgsOf(slot(name))) expect(Number(s.props?.height)).toBeLessThanOrEqual(16)
  }
})
test("the spend lens rules the warm average and scales as the row's bars do; the context lens tops out where it compacts", () => {
  const open = band({ surface: 'desktop', expanded: true })
  const bars = String(svgsOf(byKey(cardOf(open, 'spend'), 'head')).find(s => /^cost of/.test(String(s.props?.alt)))?.props?.source)
  expect(bars).toMatch(/<line class="level" [^>]*stroke="[^"]+"/)
  expect(bars).toMatch(/preserveAspectRatio="none"/)
  const trail = String(svgsOf(byKey(cardOf(open, 'context'), 'head')).find(s => /^context over/.test(String(s.props?.alt)))?.props?.source)
  // The newest point, 76k of the 190k it compacts at, and the rule at the top, 2 px in.
  expect(trail).toMatch(/<line class="level" [^>]*y1="2"/)
  expect(trail).not.toMatch(/<circle/)
})
test('no card opens on a row the collapsed one shows', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const open = band({ surface, expanded: true, maxRows: 13, columns: 120, utcOffsetMin: 0 })
    expect(['cache', 'spend', 'context', 'limits'].map(name => firstRowOf(open, name))).toEqual([
      're-warm if cold~$1.66',
      expect.stringMatching(/input18k$/),
      'room left~114k',
      'resetsSat 19:00 · on pace for ~50%',
    ])
  }
})
test('open fits the band from 13 rows, each card keeping a row of its own', () => {
  for (const maxRows of [13, 16, 40]) {
    const open = band({ expanded: true, maxRows, columns: 120 })
    expect(visualRows(open, 'terminal')).toBeLessThanOrEqual(maxRows)
    for (const name of ['cache', 'spend', 'context', 'limits']) expect(((cardOf(open, name)?.children ?? []) as Node[]).flat().filter(Boolean).length).toBeGreaterThan(1)
  }
})
test("an amber limit heads LIMITS led by '! ', bold on its figure alone", () => {
  const head = byKey(cardOf(band({ expanded: true, otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] }), 'limits'), 'head')
  expect(shown(head)).toMatch(/! spend 92%$/)
  expect(boldOf(head)).toEqual(['92%'])
})
test('in ascii the charts give way to the numbers, shut and open', () => {
  for (const expanded of [false, true]) {
    const tree = band({ glyphs: 'ascii', expanded })
    expect(shown(tree)).not.toMatch(BRAILLE)
    expect(shown(firstRow(tree))).toMatch(/\$3\.19, last \$0\.21/)
    for (const name of ['spend', 'context', 'limits']) expect(byKey(byKey(cardOf(tree, name), 'head'), 'slot', 'Box')).toBeUndefined()
  }
})
test("no history yet says so in the cost pill, in the band's words and a label's ink", () => {
  const cost = pillOf(rowOf({ history: { costs: [], context: [], fiveHour: [] }, lastTurnUsd: null }), 'cost')
  expect(shown(cost)).toBe(`$3.19 · ${EMPTY.costs}`)
  expect(byKey(cost, 'last', 'Text')?.props?.color).toBe(DARK.label)
})
test('a message after the cache went cold is marked a re-warm', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' }, env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.session.start(START)
  for (const [id, from, to, wait] of [['t1', 2.41, 2.62, 6 * MIN], ['t2', 2.62, 3.1, 0]] as const) {
    usage.current = { ...usage.current, cost: { usd: from } }
    await $.turn.start({ text: 'hi', turnId: id })
    await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
    usage.current = { ...usage.current, cost: { usd: to } }
    await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
    await clock.advance(wait)
  }
  const ui = await mountBand($, 'desktop', 160)
  expect(svgAlts(await ui.drawn()).some(a => /the newest a re-warm$/.test(a))).toBe(true)
  await ui.unmount()
})
test('/clear empties the costs and keeps the 5h trail', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' } })
  await pacing($, clock)
  await $.session.end(CLEAR)
  const ui = await mountBand($, 'terminal', 160)
  const row = firstRow(await ui.drawn()) as Node
  await ui.unmount()
  expect(shown(pillOf(row, '5h'))).toMatch(/^! 5h full in ~\S+ [⠀-⣿]+$/)
  expect(shown(pillOf(row, 'cost')).endsWith(` · ${EMPTY.costs}`)).toBe(true)
})
