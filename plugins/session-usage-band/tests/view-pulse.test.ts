// Pulse, the session's trace: the cache a heartbeat, each message a beat,
// context and the 5h window as lines, the week by day, in the one order;
// open, a stack of chart bands with their words, giving way as rows run out.

import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK } from '../hooks/palette'
import { sparkline } from '../hooks/charts'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { EMPTY } from '../hooks/words'
import { HOUR, MIN, SAMPLES, USAGE, byKey, fakeEl, firstRow, shown, svgAlts, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, visualRows, withLimits } from './matrix'

viewSuite('pulse')

/** Twenty-four messages, $0.20 each but a $0.84 re-warm seven from the end
 *  and a last of $0.21. */
const COSTS = Array.from({ length: 24 }, (_, i) => ({ usd: i === 23 ? 0.21 : i === 17 ? 0.84 : 0.2, reWarm: i === 17 }))
/** The last hour of the 5h limit, a reading every five minutes, 2% to 4%. */
const FIVE_HOUR = Array.from({ length: 12 }, (_, i) => ({ at: (i - 11) * 5 * MIN, pct: 2 + i / 5.5 }))
const HISTORY = { costs: COSTS, context: [40_000, 60_000, 76_000], fiveHour: FIVE_HOUR }

/** The band as pulse draws it at 160 columns, with history. */
const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'pulse', columns: 160, maxRows: 40, history: HISTORY, samples: SAMPLES, ...over }), NO_ACT) as unknown as Node
const rowOf = (over: Partial<BandSnapshot> = {}): Node => firstRow(band(over)) as Node

const CLASS = (alt: string) => (/^cache/.test(alt) ? 'cache' : /^cost of/.test(alt) ? 'cost' : /^context/.test(alt) ? 'context' : /^5h/.test(alt) ? '5h' : /^weekly/.test(alt) ? '7d' : alt)
const LIMITS = { fiveHour: { percentUsed: 26, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null }, sevenDay: { percentUsed: 41, resetsAt: new Date(67 * HOUR).toISOString() } }
const OTHER = [{ kind: 'spend_limit', percentUsed: 40, resetsAt: new Date(5 * HOUR).toISOString() }] as BandSnapshot['otherLimits']
const beatOf = (tree: unknown) => svgsOf(firstRow(tree)).find(s => /^cache/.test(String(s.props?.alt)))

test('collapsed desktop: one row; its charts in the one order', () => {
  const row = rowOf({ surface: 'desktop', ...LIMITS })
  expect(svgAlts(row).map(CLASS)).toEqual(['cache', 'cost', 'context', '5h', '7d'])
  expect(visualRows(row, 'desktop')).toBe(1)
})
test('collapsed terminal: every reading in words, in order, then ▵', () => {
  const row = rowOf({ surface: 'terminal', ...LIMITS })
  expect(shown(row)).toMatch(/cache[\s\S]*\$3\.19[\s\S]*context[\s\S]*5h[\s\S]*7d/)
  expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▵')
})
test('no chips pill or battery: no group has a ground, and no battery alt', () => {
  const row = rowOf({ surface: 'desktop', ...LIMITS })
  expect(['cache', 'spend', 'context', '5h', '7d'].map(k => byKey(row, k, 'Box')?.props?.backgroundColor)).toEqual([undefined, undefined, undefined, undefined, undefined])
  expect(svgAlts(row).some(a => /battery/.test(a))).toBe(false)
})
test('the beats: 14 wide, a path', () => {
  const beats = svgsOf(rowOf({ surface: 'desktop', ...LIMITS })).find(s => /^cost of the last 14/.test(String(s.props?.alt)))
  expect(String(beats?.props?.source)).toMatch(/<path class="beats"/)
})
// One drawCases a test: the engine's hooks are registered before its first call.
for (const [scenario, mark] of [['calm', /<circle[^>]*fill="#/], ['cold', /<line/], ['unmeasured', /fill="none"/], ['warming', /fill="none"/]] as const) {
  test(`the heartbeat per mood: ${scenario}`, async ($, on) => {
    const drawn = await drawCases($, on, { scenario, appearance: 'dark', layout: 'pulse' }, [{ surface: 'desktop', cols: 160 }])
    expect(String(beatOf(Object.values(drawn)[0])?.props?.source)).toMatch(mark)
  })
}
test('the heartbeat: its source unchanged as the last minute counts down', () => {
  const tick = (msLeft: number) => beatOf(band({ surface: 'desktop', ...LIMITS, cache: { ...snapOf().cache, requests: 1, msLeft, coldAt: msLeft } }))
  expect([tick(40_000)?.props?.source, tick(40_000)?.props?.alt]).toEqual([tick(39_000)?.props?.source, tick(39_000)?.props?.alt])
})
test('recalled carries ~ on its time', async ($, on) => {
  const recalled = await drawCases($, on, { scenario: 'recalled', appearance: 'dark', layout: 'pulse' }, [{ surface: 'terminal', cols: 160 }])
  expect(shown(firstRow(Object.values(recalled)[0]))).toMatch(/cache[^·]*~/)
})
test('working shows no countdown', async ($, on) => {
  const working = await drawCases($, on, { scenario: 'working', appearance: 'dark', layout: 'pulse' }, [{ surface: 'terminal', cols: 160 }])
  expect(shown(firstRow(Object.values(working)[0]))).not.toMatch(/\d+m left|\d+s left/)
})
test("no costs yet: the flat trace only beside `no costs yet`, while the total is $0; a known total alone, no trace", () => {
  const none = { history: { costs: [], context: [] } }
  for (const surface of ['desktop', 'terminal'] as const) {
    // A resumed conversation: its total known, no message's cost recorded.
    const resumed = byKey(rowOf({ surface, ...none }), 'spend', 'Box')
    expect(shown(resumed)).toBe('$3.19')
    expect(svgsOf(resumed)).toHaveLength(0)
    const fresh = rowOf({ surface, ...none, costUsd: 0 })
    expect(shown(byKey(fresh, 'spend', 'Box'))).toMatch(surface === 'desktop' ? /^\$0\.00 · no costs yet$/ : /^⣀{7} ?\$0\.00 · no costs yet$/)
    // As the row narrows, no step leaves the trace without its word.
    for (let columns = 160; columns >= 40; columns--) {
      const spend = byKey(rowOf({ surface, columns, ...none, costUsd: 0 }), 'spend', 'Box')
      if (spend === undefined) continue
      const traced = surface === 'desktop' ? svgsOf(spend).length > 0 : /⣀/.test(shown(spend))
      expect(`${surface} ${columns} ${traced && !shown(spend).includes(EMPTY.costsShort) ? 'bare' : 'ok'}`).toBe(`${surface} ${columns} ok`)
    }
  }
  const flat = svgsOf(byKey(rowOf({ surface: 'desktop', ...none, costUsd: 0 }), 'spend', 'Box'))
  expect(flat.map(s => s.props?.alt)).toEqual([EMPTY.costsAlt])
  expect(String(flat[0]?.props?.source)).toMatch(new RegExp(`<line class="flat"[^>]* stroke="${DARK.label}"`))
  expect(shown(byKey(band({ surface: 'desktop', expanded: true, ...none }), 'band:spend', 'Box'))).toContain(EMPTY.costs)
})
test('no limits: no 5h or 7d; no samples: 5h and 7d in words only', () => {
  expect(shown(rowOf({ fiveHour: undefined, sevenDay: undefined }))).not.toMatch(/5h|7d/)
  const bare = rowOf({ surface: 'desktop', ...LIMITS, samples: [] })
  expect(svgAlts(bare).map(CLASS)).not.toContain('5h')
  expect(shown(bare)).toMatch(/5h 26%[\s\S]*7d 41%/)
})
test('at 40 and 45 columns, full amber: the cache and the 7d stay, in order, ▵ last, and the row fits', async ($, on) => {
  const drawn = await drawCases($, on, { scenario: 'lastMinute', appearance: 'dark', layout: 'pulse', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [40, 45].map(cols => ({ surface: 'terminal' as const, cols })))
  for (const cols of [40, 45]) {
    const row = firstRow(drawn[caseKey({ surface: 'terminal', cols }, 'shut')]) as Node
    // The cache's amber words, led by '! ', then the 7d's.
    expect(shown(row)).toMatch(/^! \d+s[\s\S]*7d/)
    expect(shown(byKey(row, 'cache', 'Box'))).toMatch(/^! \d+s/)
    expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▵')
    expect(cellsOf(row as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(cols - ROW_SLACK)
  }
})
test('narrow and calm, spend gives way, then context, then 5h; the cache and 7d stay, and the row fits', () => {
  // A cold cache says its re-warm, so at 40 columns even 5h has gone.
  const cold = { ...LIMITS, cache: { ...snapOf().cache, msLeft: 0 } }
  const keys = (columns: number) => ['cache', 'spend', 'context', '5h', '7d'].filter(k => byKey(rowOf({ columns, ...cold }), k, 'Box') !== undefined)
  expect(shown(byKey(rowOf(cold), 'cache', 'Box'))).toMatch(/^cache cold/)
  expect(keys(40)).toEqual(['cache', '7d'])
  // The widest row without each group: spend's is the widest, then context's, then 5h's.
  const widths = Array.from({ length: 121 }, (_, i) => 160 - i)
  const goneAt = (k: string) => widths.find(columns => !keys(columns).includes(k)) ?? 0
  const [spend, context, five] = [goneAt('spend'), goneAt('context'), goneAt('5h')]
  expect([spend > context, context > five, five > 40]).toEqual([true, true, true])
  expect(keys(spend)).toEqual(['cache', 'context', '5h', '7d'])
  expect(keys(context)).toEqual(['cache', '5h', '7d'])
  for (const columns of widths) expect(cellsOf(rowOf({ columns, ...cold }) as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(columns - ROW_SLACK)
  // The calm session of the other tests keeps 5h at 40: only what doesn't fit goes.
  const calm = rowOf({ columns: 40, ...LIMITS })
  expect(['spend', 'context'].map(k => byKey(calm, k, 'Box'))).toEqual([undefined, undefined])
  expect(shown(calm)).toMatch(/cache[\s\S]*7d/)
  expect(cellsOf(calm as unknown as RenderChildren, TERMINAL)).toBeLessThanOrEqual(40 - ROW_SLACK)
})
test('one cost, or every cost a re-warm: no NaN', () => {
  for (const costs of [[{ usd: 0.2, reWarm: false }], [{ usd: 0.8, reWarm: true }, { usd: 0.9, reWarm: true }]]) {
    const src = svgsOf(rowOf({ surface: 'desktop', ...LIMITS, history: { ...HISTORY, costs } })).map(s => String(s.props?.source)).join('')
    expect(src).not.toMatch(/NaN|Infinity/)
  }
})
test('terminal: braille beside the numbers', () => {
  expect(shown(rowOf({ surface: 'terminal', ...LIMITS }))).toMatch(/[⠀-⣿]+ ?\$3\.19/)
})
test("terminal: the cache and the 7d in words alone, as spec §4.1's table draws them", () => {
  const row = rowOf({ surface: 'terminal', ...LIMITS })
  expect(shown(byKey(row, 'cache', 'Box'))).toMatch(/^cache 52m left$/)
  expect(shown(byKey(row, '7d', 'Box'))).toMatch(/^7d 41%$/)
})
test("no costs yet: the flat trace and its words in a label's ink, the total in a value's", () => {
  const spend = byKey(rowOf({ surface: 'terminal', history: { costs: [], context: [] }, costUsd: 0 }), 'spend', 'Box')
  const inks: string[] = []
  const visit = (x: unknown): void => {
    const node = x as Node | null
    if (node === null || typeof node !== 'object') return
    const text = (node.children ?? []).every(k => typeof k === 'string') ? (node.children ?? []).join('') : ''
    if (node.type === 'Text' && text !== '') inks.push(`${text}|${node.props?.color === DARK.label ? 'label' : node.props?.color === DARK.value ? 'value' : String(node.props?.color)}`)
    for (const k of node.children ?? []) visit(k)
  }
  visit(spend)
  expect(inks).toEqual(['⣀⣀⣀⣀⣀⣀⣀|label', '$0.00|value', ` · ${EMPTY.costsShort}|label`])
})
test('an amber reading keeps its chart past the calm ones, until the amber step', () => {
  // SAMPLES' window, so its trail is drawn.
  const pace = { fiveHour: { percentUsed: 50, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN }, sevenDay: LIMITS.sevenDay }
  // Narrow enough that every calm chart has gone.
  const widths = Array.from({ length: 121 }, (_, i) => 160 - i)
  const keeps5h = (columns: number) => svgAlts(rowOf({ surface: 'desktop', columns, ...pace })).map(CLASS).includes('5h')
  const calmGone = widths.find(columns => !svgAlts(rowOf({ surface: 'desktop', columns, ...pace })).map(CLASS).includes('cost'))
  expect(calmGone).toBeDefined()
  expect(keeps5h(calmGone ?? 0)).toBe(true)
})
test('open: the bands in order, their words, the footer; all 13 rows with an other limit', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 13, ...LIMITS, otherLimits: OTHER })
  expect(['band:cache', 'band:spend', 'band:context', 'band:limits', 'band:other'].map(k => byKey(open, k, 'Box') !== undefined)).toEqual([true, true, true, true, true])
  expect(shown(open)).toMatch(/avg ~\$/)
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
  expect(visualRows(open, 'desktop')).toBe(13)
})
test('open: as rows run out, the bands give way in the spec order and the footer stays', () => {
  // Spec §4.2: Other, Context, then Cache (step 6); Limits and Spend, as
  // words, go last, with the body.
  const ORDER = ['band:other', 'band:context', 'band:cache', 'band:limits', 'band:spend']
  let gone = 0
  for (let rows = 13; rows >= 4; rows--) {
    const open = band({ surface: 'desktop', expanded: true, maxRows: rows, ...LIMITS, otherLimits: OTHER })
    expect(byKey(open, 'collapse', 'Button')).toBeDefined()
    expect(visualRows(open, 'desktop')).toBeLessThanOrEqual(rows)
    const present = ORDER.map(k => byKey(open, k, 'Box') !== undefined)
    const first = present.indexOf(true)
    gone = Math.max(gone, first === -1 ? ORDER.length : first)
    expect(present.slice(gone).every(Boolean) || present.every(p => !p)).toBe(true)
  }
  // Limits shrinks to two rows, then to one, before Spend goes to one; a
  // band of one row keeps its chart, a row tall, so the grid keeps its look.
  const tallest = (rows: number, key: string) => Math.max(0, ...svgsOf(byKey(band({ surface: 'desktop', expanded: true, maxRows: rows, ...LIMITS }), key, 'Box')).map(s => Number(s.props?.height)))
  expect(tallest(13, 'band:limits')).toBeGreaterThan(24)
  // At 8 rows the body has 4: Cache 1, Spend 2, Limits one row 1.
  expect(tallest(8, 'band:limits')).toBeLessThanOrEqual(24)
  expect(tallest(8, 'band:spend')).toBeGreaterThan(24)
})
test('open on the terminal: each band a line, braille beside its words; Limits side by side where they fit, else two', () => {
  const open = band({ surface: 'terminal', expanded: true, maxRows: 13, ...LIMITS, otherLimits: OTHER })
  expect(['band:cache', 'band:spend', 'band:context', 'band:limits', 'band:other'].map(k => visualRows(byKey(open, k, 'Box'), 'terminal'))).toEqual([1, 1, 1, 1, 1])
  expect(visualRows(byKey(band({ surface: 'terminal', columns: 80, expanded: true, maxRows: 13, ...LIMITS }), 'band:limits', 'Box'), 'terminal')).toBe(2)
  expect(shown(byKey(open, 'band:spend', 'Box'))).toMatch(/^[⠀-⣿]+ ?spend ?\$3\.19 · last \$0\.21 · avg ~\$/)
})
test('open, an amber other limit outlasts every band', () => {
  const amber = [{ kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] as BandSnapshot['otherLimits']
  const open = band({ surface: 'terminal', expanded: true, maxRows: 5, ...LIMITS, otherLimits: amber })
  expect(shown(byKey(open, 'band:other', 'Box'))).toMatch(/! spend 92%/)
})

// ---- review round 1 -------------------------------------------------------

const BANDS = ['band:cache', 'band:spend', 'band:context', 'band:limits', 'band:other'] as const
const NEAR = { tokens: 180_000, window: 200_000, percent: 90, compactAt: 190_000, autoCompactOff: false }
const EXPIRING = { ...snapOf().cache, msLeft: 30_000, ttl: '5m' as const }
const WS = { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } as BandSnapshot['workspace']

test('open, an amber band never gives way: near compaction Context stays, an expiring Cache and an amber 7d too, where calm they go', () => {
  const AMBER_7D = { ...LIMITS, sevenDay: { ...LIMITS.sevenDay, percentUsed: 85 } }
  const cases = [
    ['band:context', { context: NEAR }],
    ['band:cache', { cache: EXPIRING }],
    ['band:limits', AMBER_7D],
  ] as const
  for (const surface of ['terminal', 'desktop'] as const)
    for (const [key, amber] of cases)
      // From a body of two rows, which holds any one band.
      for (const maxRows of [6, 7, 8]) {
        const calm = band({ surface, expanded: true, maxRows, ...LIMITS })
        const open = band({ surface, expanded: true, maxRows, ...LIMITS, ...amber })
        // Short of rows the calm band has gone; the amber one stays, and the stack still fits.
        const kept = byKey(open, key, 'Box') !== undefined || byKey(calm, key, 'Box') !== undefined
        expect(`${surface} ${key} ${maxRows} ${kept}`).toBe(`${surface} ${key} ${maxRows} true`)
        expect(visualRows(open, surface)).toBeLessThanOrEqual(maxRows)
      }
  // The calm Context does go short of rows, so the case above means something.
  expect(byKey(band({ surface: 'desktop', expanded: true, maxRows: 8, ...LIMITS }), 'band:context', 'Box')).toBeUndefined()
  expect(byKey(band({ surface: 'desktop', expanded: true, maxRows: 8, ...LIMITS, context: NEAR }), 'band:context', 'Box')).toBeDefined()
})
test('open, no limits: in a body of 6 Context stays, since Limits draws nothing', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 10, fiveHour: undefined, sevenDay: undefined })
  expect(byKey(open, 'band:limits', 'Box')).toBeUndefined()
  expect(byKey(open, 'band:context', 'Box')).toBeDefined()
})
test('open, no costs and one context point: Spend and Context keep flat charts of their rows, so the stack keeps its look', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 13, ...LIMITS, history: { costs: [], context: [76_000] } })
  for (const k of ['band:spend', 'band:context']) expect(visualRows(byKey(open, k, 'Box'), 'desktop')).toBe(2)
  expect(visualRows(band({ surface: 'desktop', expanded: true, maxRows: 10, ...LIMITS, history: { costs: [], context: [76_000] } }), 'desktop')).toBeLessThanOrEqual(10)
})
test('open: while a band is left out, the body leaves at most one row unused', () => {
  const fixtures: ReadonlyArray<Partial<BandSnapshot>> = [
    { ...LIMITS, otherLimits: OTHER },
    { fiveHour: undefined, sevenDay: undefined },
    { ...LIMITS, history: { costs: [], context: [76_000] } },
    { ...LIMITS, samples: [] },
  ]
  for (const surface of ['desktop', 'terminal'] as const)
    for (const [f, over] of fixtures.entries()) {
      const full = band({ surface, expanded: true, maxRows: 40, ...over })
      const all = BANDS.filter(k => byKey(full, k, 'Box') !== undefined)
      for (let maxRows = 4; maxRows <= 13; maxRows++) {
        const open = band({ surface, expanded: true, maxRows, ...over })
        const missing = all.filter(k => byKey(open, k, 'Box') === undefined)
        // The body's rows (bodyRowsFor: less the row, two of air and the buttons), less the stack's bands.
        const stack = byKey(open, 'stack', 'Box')
        const unused = maxRows - 4 - (stack === undefined ? 0 : visualRows(stack, surface) - 1)
        expect(`${surface} ${f} ${maxRows}: ${missing.length > 0 && unused > 1 ? `${unused} unused, ${missing.join(' ')} left out` : 'ok'}`).toBe(`${surface} ${f} ${maxRows}: ok`)
      }
    }
})
test('open: every band fits its room, nothing cut, and the 5h chart keeps its now', () => {
  const amber = { cache: EXPIRING, context: NEAR, fiveHour: { percentUsed: 50, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } }
  for (const [surface, columns] of [['desktop', 80], ['desktop', 120], ['terminal', 60], ['terminal', 80]] as const)
    for (const over of [{}, amber]) {
      const open = band({ surface, columns, expanded: true, ...LIMITS, otherLimits: OTHER, workspace: WS, ...over })
      for (const k of BANDS) {
        const b = byKey(open, k, 'Box')
        if (b === undefined) continue
        const cells = cellsOf(b as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL)
        expect(`${surface} ${columns} ${k} ${cells <= columns - ROW_SLACK}`).toBe(`${surface} ${columns} ${k} true`)
      }
      const five = svgsOf(byKey(open, 'band:limits', 'Box')).find(s => /^5h window/.test(String(s.props?.alt)))
      if (five !== undefined) expect(String(five.props?.source)).toMatch(/class="now"/)
      if (surface === 'desktop' && columns === 120) expect(five).toBeDefined()
    }
})
test("a 5h window first seen mid-window: its chart, shut and open, starts at the first hour it knows, its level now the window's", () => {
  // Samples from hour 3 on, as when the window opened on another device.
  const sample = (at: number, fivePct: number) => ({ at, fivePct, sevenPct: 30, fiveResetAt: 5 * HOUR, sevenResetAt: 67 * HOUR })
  const mid = { surface: 'desktop', now: 4.5 * HOUR, fiveHour: { percentUsed: 30, resetsAt: new Date(5 * HOUR).toISOString(), etaMs: null }, samples: [sample(3.2 * HOUR, 26), sample(4.2 * HOUR, 30)] } as const
  for (const tree of [rowOf(mid), byKey(band({ ...mid, expanded: true }), 'band:limits', 'Box')]) {
    const five = svgsOf(tree).find(s => /^5h window/.test(String(s.props?.alt)))
    const solid = /<polyline points="([^"]+)"/.exec(String(five?.props?.source))?.[1]?.split(' ') ?? []
    // Hour 3's end, then now's: two points, not five from 0%.
    expect(solid).toHaveLength(2)
  }
})
test("pulse's amber cache is led by '! ', on the row and open", () => {
  const row = rowOf({ surface: 'terminal', cache: EXPIRING })
  expect(shown(byKey(row, 'cache', 'Box'))).toMatch(/^! 30s left/)
  const open = band({ surface: 'desktop', expanded: true, cache: EXPIRING })
  expect(shown(byKey(open, 'band:cache', 'Box'))).toMatch(/^cache ?! 30s left · re-warm/)
})
test("an expiring cache's heartbeat is drawn in amber", () => {
  expect(String(beatOf(band({ surface: 'desktop', cache: EXPIRING }))?.props?.source)).toMatch(new RegExp(`fill="${DARK.amberFg}"`))
})
test("7d at 85% on a fast pace: the guessed days, drawn, never pass what is left of the week", () => {
  const snap = { surface: 'desktop' as const, fiveHour: LIMITS.fiveHour, sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() } }
  // The raw guesses would pass the 15 points left.
  const days = readingsOf(snapOf({ layout: 'pulse', samples: SAMPLES, ...snap })).week.days
  expect(days.filter(d => d.guess).reduce((n, d) => n + (d.pct ?? 0), 0)).toBeGreaterThan(15)
  for (const expanded of [false, true]) {
    const cells = svgsOf(band({ ...snap, expanded })).filter(s => /^weekly limit by day/.test(String(s.props?.alt)))
    expect(cells.length).toBeGreaterThan(0)
    for (const c of cells) {
      const source = String(c.props?.source)
      const inner = Number(/<rect class="edge"[^>]* height="([\d.]+)"/.exec(source)?.[1]) - 1
      const guessed = [...source.matchAll(/<rect class="guess"[^>]* height="([\d.]+)"/g)].reduce((n, [, h]) => n + (Number(h) / inner) * 100, 0)
      expect(guessed).toBeLessThanOrEqual(15.5)
    }
  }
})

// ---- sign-off fixes -------------------------------------------------------

test("open: the cache's drain is inked by its mood: warm green only while warm, grey cold, none unknown", () => {
  const moods: ReadonlyArray<readonly [string, BandSnapshot['cache'], string]> = [
    ['warm', snapOf().cache, DARK.warm],
    ['expiring', EXPIRING, DARK.amberFg],
    ['cold', { ...snapOf().cache, msLeft: 0 }, DARK.label],
    // Unmeasured and warming draw no drain: their level isn't known.
    ['unmeasured', { ...snapOf().cache, requests: 0, recalled: false, fresh: false }, 'undefined'],
    ['warming', { ...snapOf().cache, requests: 0, recalled: false, fresh: true }, 'undefined'],
  ]
  for (const [mood, cache, ink] of moods) {
    expect(readingsOf(snapOf({ cache })).cache.mood).toBe(mood)
    const drain = svgsOf(byKey(band({ surface: 'desktop', expanded: true, cache }), 'band:cache', 'Box'))[0]
    expect(`${mood} ${/<polyline[^>]* stroke="([^"]+)"/.exec(String(drain?.props?.source))?.[1]}`).toBe(`${mood} ${ink}`)
  }
})
test("today's fill, with no reading inside today yet, draws as the alt says it: a guess of what is left, else the 7d in words", () => {
  const at = (m: number, sevenPct: number) => ({ at: m * MIN, fivePct: 0, sevenPct, fiveResetAt: 3 * HOUR, sevenResetAt: 67 * HOUR })
  const late = [at(-120, 70), at(-90, 74), at(-60, 78), at(-30, 82), at(-5, 85)]
  const unzoned = (samples: ReturnType<typeof at>[], expanded: boolean) =>
    band({ surface: 'desktop', zone: undefined, expanded, fiveHour: LIMITS.fiveHour, sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() }, samples })
  const cellsOf7d = (tree: Node) => svgsOf(tree).filter(s => /^weekly limit by day/.test(String(s.props?.alt)))
  // No day measured: no cells, shut or open, and the 7d's words stay.
  for (const expanded of [false, true]) {
    expect(cellsOf7d(unzoned(late, expanded))).toHaveLength(0)
    expect(shown(firstRow(unzoned(late, expanded)))).toMatch(/7d 85%/)
  }
  // Wednesday measured: today's cell is a guess filling about 15 of its 100.
  for (const expanded of [false, true]) {
    const [cells] = cellsOf7d(unzoned([at(-30 * 60, 60), ...late], expanded))
    const source = String(cells?.props?.source)
    expect(cells?.props?.alt).toMatch(/Thursday about 15% and fills it/)
    const inner = Number(/<rect class="edge"[^>]* height="([\d.]+)"/.exec(source)?.[1]) - 1
    const guesses = [...source.matchAll(/<rect class="guess"[^>]* height="([\d.]+)"/g)].map(([, h]) => (Number(h) / inner) * 100)
    expect(guesses).toHaveLength(1)
    expect(Math.abs((guesses[0] ?? 0) - 15)).toBeLessThan(2)
  }
})
test('open: each band leads with its name in a label\'s ink, cache, spend, context, 5h and 7d, never said twice', () => {
  const amber = { cache: EXPIRING, context: NEAR, sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() } }
  for (const surface of ['desktop', 'terminal'] as const)
    for (const over of [{}, amber]) {
      const open = band({ surface, expanded: true, ...LIMITS, ...over })
      const names: string[] = []
      for (const k of ['band:cache', 'band:spend', 'band:context', 'band:limits']) {
        walk(byKey(open, k, 'Box'), n => {
          if (n.type === 'Text' && n.props?.key === 'name') names.push(`${(n.children ?? []).join('')}|${n.props?.color === DARK.label ? 'label' : String(n.props?.color)}`)
        })
      }
      expect(`${surface} ${names.join(' ')}`).toBe(`${surface} cache|label spend|label context|label 5h|label 7d|label`)
      expect(shown(byKey(open, 'band:context', 'Box'))).toMatch(over === amber ? /^[⠀-⣿]* ?context ?! 95% · / : /^[⠀-⣿]* ?context ?40% · /)
      expect(shown(byKey(open, 'band:limits', 'Box'))).toMatch(over === amber ? /5h ?26% ·[\s\S]*7d ?! 85% · / : /5h ?26% ·[\s\S]*7d ?41% · /)
    }
})

// ---- design round: the open stack as a grid --------------------------------

/** Each line of the open stack: a Box whose children hold a name column and
 *  its words; the columns before the words, each child's cells and the gap. */
const linesOf = (stack: unknown, surface: 'desktop' | 'terminal') => {
  const lines: Array<{ key: string; wordsAt: number; chartPx: number | undefined }> = []
  walk(stack, n => {
    const kids = (n.children ?? []) as Node[]
    const at = kids.findIndex(k => k?.props?.key === 'words')
    if (n.type !== 'Box' || at < 0 || !kids.some(k => k?.props?.key === 'name')) return
    const gap = typeof n.props?.columnGap === 'number' ? n.props.columnGap : 0
    const before = kids.slice(0, at).reduce((sum, k) => sum + cellsOf(k as unknown as RenderChildren, surface === 'desktop' ? DESKTOP : TERMINAL) + gap, 0)
    const chart = svgsOf(kids.find(k => k?.props?.key === 'chart'))[0]
    lines.push({ key: String(n.props?.key), wordsAt: before, chartPx: chart === undefined ? undefined : Number(chart.props?.width) })
  })
  return lines
}
test('open: a grid, one chart width for every band and every band\'s words at one column', () => {
  for (const [surface, columns] of [['desktop', 94], ['desktop', 160], ['terminal', 100]] as const)
    for (const over of [{}, { history: { costs: [], context: [76_000] } }, { samples: [] }]) {
      const open = band({ surface, columns, expanded: true, maxRows: 13, ...LIMITS, ...over })
      const lines = linesOf(byKey(open, 'stack', 'Box'), surface)
      expect(lines.map(l => l.key)).toEqual(['band:cache', 'band:spend', 'band:context', '5h', '7d'])
      expect(`${surface} ${columns} ${[...new Set(lines.map(l => l.wordsAt))].length}`).toBe(`${surface} ${columns} 1`)
      if (surface === 'desktop') {
        // With no samples 5h and 7d have no chart, only its cell.
        const charted = 'samples' in over ? lines.filter(l => l.key !== '5h' && l.key !== '7d') : lines
        expect(charted.every(l => l.chartPx !== undefined)).toBe(true)
        expect(`${columns} ${[...new Set(charted.map(l => l.chartPx))].join(',')}`).toBe(`${columns} 240`)
      }
    }
})
test("open: the context band's compaction line sits inside its own chart, with air above it", () => {
  const open = band({ surface: 'desktop', columns: 120, expanded: true, ...LIMITS })
  const chart = svgsOf(byKey(open, 'band:context', 'Box'))[0]
  const src = String(chart?.props?.source)
  const shift = Number(/translate\(0 ([\d.]+)\)/.exec(src)?.[1] ?? 0)
  const y = Number(/<line class="level"[^>]* y1="([\d.]+)"/.exec(src)?.[1]) + shift
  expect(y).toBeGreaterThanOrEqual(shift + 8)
  expect(y).toBeLessThan(Number(chart?.props?.height))
})
test('open: a band says its name, then its words, then its note; with no costs Spend keeps a flat chart, Context its level now', () => {
  const none = { history: { costs: [], context: [76_000] } }
  const open = band({ surface: 'desktop', columns: 160, expanded: true, ...LIMITS, ...none })
  const spend = byKey(open, 'band:spend', 'Box')
  expect(shown(spend)).toMatch(new RegExp(`^spend ?\\$3\\.19 ?${EMPTY.costs.replace('.', '\\.')}$`))
  expect(svgsOf(spend).map(s => s.props?.alt)).toEqual([EMPTY.costsAlt])
  expect(String(svgsOf(byKey(open, 'band:context', 'Box'))[0]?.props?.source)).toMatch(/<polyline points="2,([\d.]+) 238,\1"/)
})

// ---- accuracy round: no chart implies a value it doesn't have ---------------

test('open, too little history: context flat at its level now; 5h and 7d no chart, only its cell; spend its dim baseline', () => {
  const over = { ...LIMITS, samples: [], history: { costs: [], context: [76_000] } }
  const open = band({ surface: 'desktop', columns: 160, expanded: true, maxRows: 13, ...over })
  // Context: its one reading, 76k of the 190k compaction, drawn level there, not at 0.
  const context = svgsOf(byKey(open, 'band:context', 'Box'))[0]
  const kit = makeKit(fakeEl, snapOf({ surface: 'desktop', columns: 160 }))
  const want = svgsOf(sparkline(kit, { key: 'trail', alt: 'a', values: [76_000, 76_000], color: DARK.label, px: 240, height: 40, air: 8, headroom: 8, max: 190_000, level: 1 }))[0]
  const points = (svg: unknown) => /<polyline points="([^"]+)"/.exec(String((svg as Node | undefined)?.props?.source))?.[1]
  expect(points(context)).toBe(points(want))
  const [a, b] = (points(context) ?? '').split(' ').map(p => Number(p.split(',')[1]))
  expect(a).toBe(b)
  expect(a).toBeLessThan(40 - 4)
  // 5h and 7d: no Svg; the words still start at the grid's column.
  const limits = byKey(open, 'band:limits', 'Box')
  expect(svgsOf(limits)).toHaveLength(0)
  const at = linesOf(byKey(open, 'stack', 'Box'), 'desktop')
  expect(new Set(at.map(l => l.wordsAt)).size).toBe(1)
  // Spend: no message's cost known, its dim baseline.
  expect(String(svgsOf(byKey(open, 'band:spend', 'Box'))[0]?.props?.source)).toMatch(/class="flat"/)
})

// ---- review fixes -----------------------------------------------------------

test("open, no costs: Spend's flat baseline is drawn only beside a costs note, long or short, at every width", () => {
  const none = { history: { costs: [], context: [76_000] } }
  let short = 0
  for (const surface of ['desktop', 'terminal'] as const)
    for (let columns = 40; columns <= 120; columns += 4) {
      const spend = byKey(band({ surface, columns, expanded: true, maxRows: 13, ...LIMITS, ...none }), 'band:spend', 'Box')
      if (spend === undefined) continue
      const baseline = surface === 'desktop' ? svgsOf(spend).length > 0 : /⣀/.test(shown(spend))
      const note = byKey(spend, 'note', 'Text')
      const said = (note?.children ?? []).join('')
      if (said === EMPTY.costsShort) short++
      expect(`${surface} ${columns} ${baseline ? (said === EMPTY.costs || said === EMPTY.costsShort ? 'noted' : 'bare') : 'none'}`).not.toMatch(/bare$/)
    }
  expect(short).toBeGreaterThan(0)
})
test("open: an unmeasured or warming cache draws no drain, its level unknown; a cold one its line at 0", async ($, on) => {
  const moods: ReadonlyArray<readonly [string, BandSnapshot['cache'], number]> = [
    ['unmeasured', { ...snapOf().cache, requests: 0, recalled: false, fresh: false }, 0],
    ['warming', { ...snapOf().cache, requests: 0, recalled: false, fresh: true }, 0],
    ['cold', { ...snapOf().cache, msLeft: 0 }, 1],
  ]
  for (const [mood, cache, svgs] of moods) {
    const open = band({ surface: 'desktop', expanded: true, cache })
    expect(`${mood} ${svgsOf(byKey(open, 'band:cache', 'Box')).length}`).toBe(`${mood} ${svgs}`)
    // The words still start at the grid's column.
    expect(new Set(linesOf(byKey(open, 'stack', 'Box'), 'desktop').map(l => l.wordsAt)).size).toBe(1)
  }
})
test("open on the terminal, one context reading: its flat line spans the chart column, as Spend's floor does", () => {
  const open = band({ surface: 'terminal', columns: 100, expanded: true, ...LIMITS, history: { costs: [], context: [76_000] } })
  const braille = shown(byKey(open, 'band:context', 'Box')).match(/[⠀-⣿]+/)?.[0] ?? ''
  expect(braille.length).toBe(12)
})
test('open on a narrower desktop: a charted band and one with its cell empty start their words at one x', () => {
  for (const columns of [60, 66, 70]) {
    const open = band({ surface: 'desktop', columns, expanded: true, maxRows: 13, ...LIMITS, samples: [] })
    const lines = linesOf(byKey(open, 'stack', 'Box'), 'desktop')
    expect(lines.some(l => l.chartPx === undefined) && lines.some(l => l.chartPx !== undefined)).toBe(true)
    expect(`${columns} ${new Set(lines.map(l => l.wordsAt)).size}`).toBe(`${columns} 1`)
    // In px too: a chart is whole columns, as wide as an empty cell's.
    for (const l of lines) if (l.chartPx !== undefined) expect(`${columns} ${l.key} ${l.chartPx % 10}`).toBe(`${columns} ${l.key} 0`)
  }
})
