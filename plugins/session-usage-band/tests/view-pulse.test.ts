// Pulse, the session's trace: the cache a heartbeat, each message a beat,
// context and the 5h window as lines, the week by day, in the one order;
// open, a stack of chart bands with their words, giving way as rows run out.

import type { RenderChildren } from 'claude-code'
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { DESKTOP, ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK } from '../hooks/palette'
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
test("no costs yet: a flat trace in the beats' place, then the total and no costs yet; open, the Spend band says when they show", () => {
  const none = { history: { costs: [], context: [] } }
  for (const surface of ['desktop', 'terminal'] as const) {
    const row = rowOf({ surface, ...none })
    expect(shown(row)).not.toContain(EMPTY.costs)
    expect(shown(byKey(row, 'spend', 'Box'))).toMatch(surface === 'desktop' ? /^\$3\.19 · no costs yet$/ : /^⣀{7} ?\$3\.19 · no costs yet$/)
  }
  const flat = svgsOf(byKey(rowOf({ surface: 'desktop', ...none }), 'spend', 'Box'))
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
  const spend = byKey(rowOf({ surface: 'terminal', history: { costs: [], context: [] } }), 'spend', 'Box')
  const inks: string[] = []
  const visit = (x: unknown): void => {
    const node = x as Node | null
    if (node === null || typeof node !== 'object') return
    const text = (node.children ?? []).every(k => typeof k === 'string') ? (node.children ?? []).join('') : ''
    if (node.type === 'Text' && text !== '') inks.push(`${text}|${node.props?.color === DARK.label ? 'label' : node.props?.color === DARK.value ? 'value' : String(node.props?.color)}`)
    for (const k of node.children ?? []) visit(k)
  }
  visit(spend)
  expect(inks).toEqual(['⣀⣀⣀⣀⣀⣀⣀|label', '$3.19|value', ` · ${EMPTY.costsShort}|label`])
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
  // Limits shrinks to two rows, then to words, before Spend goes to words.
  const svgsIn = (rows: number, key: string) => svgsOf(byKey(band({ surface: 'desktop', expanded: true, maxRows: rows, ...LIMITS }), key, 'Box')).length
  expect(svgsIn(13, 'band:limits')).toBe(2)
  // At 8 rows the body has 4: Cache 1, Spend 2, Limits as words 1.
  expect(svgsIn(8, 'band:limits')).toBe(0)
  expect(svgsIn(8, 'band:spend')).toBe(1)
})
test('open on the terminal: each band a line, braille beside its words, Limits two', () => {
  const open = band({ surface: 'terminal', expanded: true, maxRows: 13, ...LIMITS, otherLimits: OTHER })
  expect(['band:cache', 'band:spend', 'band:context', 'band:limits', 'band:other'].map(k => visualRows(byKey(open, k, 'Box'), 'terminal'))).toEqual([1, 1, 1, 2, 1])
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

test('open, no limits: in a body of 6 Context stays, since Limits draws nothing', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 10, fiveHour: undefined, sevenDay: undefined })
  expect(byKey(open, 'band:limits', 'Box')).toBeUndefined()
  expect(byKey(open, 'band:context', 'Box')).toBeDefined()
})
test('open, no costs and one context point: Spend and Context are a row each, so Context stays in a body of 6', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 10, ...LIMITS, history: { costs: [], context: [76_000] } })
  expect(byKey(open, 'band:context', 'Box')).toBeDefined()
  expect(visualRows(open, 'desktop')).toBeLessThanOrEqual(10)
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

test("open: the cache's drain is inked by its mood: warm green only while warm", () => {
  const moods: ReadonlyArray<readonly [string, BandSnapshot['cache'], string]> = [
    ['warm', snapOf().cache, DARK.warm],
    ['expiring', EXPIRING, DARK.amberFg],
    ['cold', { ...snapOf().cache, msLeft: 0 }, DARK.label],
    ['unmeasured', { ...snapOf().cache, requests: 0, recalled: false, fresh: false }, DARK.label],
    ['warming', { ...snapOf().cache, requests: 0, recalled: false, fresh: true }, DARK.label],
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
