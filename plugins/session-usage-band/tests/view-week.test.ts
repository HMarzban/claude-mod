// Week, how the week looks: one row led by the 7d pill and its seven day
// cells, chips' pills after it, how it gives way as it narrows and where
// amber leads; open, chips' cards with the 5h by the hour in LIMITS' head
// and the week in words as its first row.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { drawBand } from '../hooks/band'
import { DAY_MS, utcOffsetOf } from '../hooks/format'
import { CARD_TEXT } from '../hooks/layout'
import type { Sample } from '../hooks/memory'
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { DEFAULT_MAX_ROWS, HOUR, HOUR_1, LONG, MIN, START, USAGE, byKey, cardOf, fact, fakeEl, firstRow, mountBand, pillOf, setup, shown, svgsOf, walk, type Node } from './helpers'
import { NO_ACT, caseKey, invariantErrors, snapOf, viewSuite, type Mount } from './matrix'

viewSuite('week')

// The week as its board draws it: Sun 15:14, the 7d at 66%, all of it risen
// today, resetting Sat 13:30; the 5h at 0%, resetting in 4h 55m.
const SUN = Date.UTC(2026, 9, 11, 15, 14)
const SAT_RESET = Date.UTC(2026, 9, 17, 13, 30)
const FIVE_RESET = SUN + (4 * 60 + 55) * MIN
const boardSample = (at: number, sevenPct: number): Sample => ({ at, fivePct: 0, sevenPct, fiveResetAt: FIVE_RESET, sevenResetAt: SAT_RESET })
const board = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({
    layout: 'week', columns: 160, now: SUN, utcOffsetMin: 0,
    samples: [boardSample(SAT_RESET - 168 * HOUR, 0), boardSample(SUN - MIN, 66)],
    sevenDay: { percentUsed: 66, resetsAt: new Date(SAT_RESET).toISOString() },
    fiveHour: { percentUsed: 0, resetsAt: new Date(FIVE_RESET).toISOString(), etaMs: null },
    ...over,
  }), NO_ACT) as unknown as Node
const desk = { surface: 'desktop' } as const
const ascii = { glyphs: 'ascii' } as const
const open = { expanded: true, maxRows: DEFAULT_MAX_ROWS } as const

/** The row's pills by key, in order. */
const pillKeys = (tree: Node): unknown[] =>
  ((firstRow(tree) as Node).children ?? []).filter(k => (k as Node | null)?.props?.flexShrink === 0 && (k as Node).props?.key !== undefined).map(k => (k as Node).props?.key)
/** The bold Texts beneath a node, as they read. */
const boldOf = (n: unknown): string[] => {
  const out: string[] = []
  walk(n, k => {
    if (k.type === 'Text' && k.props?.bold === true) out.push(shown(k))
  })
  return out
}
/** The label of the row's last child's Button: the toggle. */
const lastButton = (tree: Node): unknown => byKey(((firstRow(tree) as Node).children ?? []).at(-1), 'more', 'Button')?.props?.label
/** A card's first body row of words, past its head and its bar, as it reads. */
const firstRowOf = (tree: Node, name: string): string =>
  shown(((cardOf(tree, name)?.children ?? []) as Node[]).filter(k => k !== null && k !== undefined && !['meter', 'split'].includes(String(k.props?.key)))[1])
const headOf = (tree: Node, name: string) => byKey(cardOf(tree, name), 'head')
/** The week's day cells on the desktop. */
const daysSvg = (tree: Node) => svgsOf(firstRow(tree)).find(s => /^weekly limit by day/.test(String(s.props?.alt)))

test('collapsed is one row: 7d with its day cells, 5h, cache, cost, context, the tokens, then ▵', () => {
  const tree = board()
  expect(pillKeys(tree)).toEqual(['7d', '5h', 'cache', 'cost', 'ctx', 'tokens'])
  expect(shown(pillOf(tree, '7d'))).toBe('7d ▅▅▏▃▃ ╌╌ ╌╌ ╌╌ ╌╌ ╌╌ 66% · full ~Mon │ ↻ Sat 13:30')
  expect(shown(pillOf(tree, '5h'))).toBe('5h 0% │ ↻ 4h 55m')
  expect(shown(pillOf(tree, 'ctx'))).toBe('◔ 40% full')
  expect(lastButton(tree)).toBe('▵')
  expect(pillOf(tree, '7d')?.props?.backgroundColor).toBe(DARK.weekBg)
})
test('the desktop draws the week as one Svg of seven cells: solid measured, dashed guessed, the fill day in the accent', () => {
  const tree = board(desk)
  expect(shown(pillOf(tree, '7d'))).toBe('7d 66% · full ~Mon · Sat 13:30')
  expect(shown(pillOf(tree, '5h'))).toBe('5h 0% · 4h 55m')
  const days = daysSvg(tree)
  expect([days?.props?.width, days?.props?.height]).toEqual([116, 16])
  expect(days?.props?.alt).toBe('weekly limit by day: Sunday 66%, Monday about 34% and fills it, Tuesday to Saturday none left')
  const source = String(days?.props?.source)
  // Six days guessed or spent, dashed; Monday's outline alone at full accent.
  expect(source.match(/stroke-dasharray/g)).toHaveLength(6)
  expect(source.match(new RegExp(`stroke="${DARK.weekAccent}"[^>]*stroke-dasharray`, 'g'))).toHaveLength(6)
  expect(source.match(/stroke-opacity/g)).toHaveLength(5)
  // The notch in label grey, knocked out of the pill's ground.
  expect(source).toContain(`fill="${DARK.label}"`)
  expect(source).toContain(`fill="${DARK.weekBg}"`)
})
test('no bright thumb on any fill, and no outline on today', () => {
  for (const tree of [board(desk), board({ ...desk, ...open })]) {
    for (const s of svgsOf(tree).filter(n => /limit by/.test(String(n.props?.alt)))) {
      const source = String(s.props?.source)
      expect(source).not.toContain(DARK.value)
      expect(source).not.toMatch(/class="(tick|thumb)"/)
    }
  }
})
test('one bold per reading, on its figure, the cache countdown too', () => {
  // A text battery's cut may fall inside the figure, so each pill's bold is read whole.
  const bold = (tree: Node) => pillKeys(tree).map(key => boldOf(pillOf(tree, String(key))).join(''))
  expect(bold(board())).toEqual([' 66%', ' 0%', '52m', '$3.19', '40%', ''])
  expect(bold(board(desk))).toEqual([' 66%', ' 0%', '52m', '$3.19', '40%', ''])
  expect(bold(board(ascii))).toEqual([' 66%', ' 0%', '52m', '$3.19', '40%', ''])
})
test('open, ▿ is still last on the row nearest the prompt', () => {
  expect(lastButton(board(open))).toBe('▿')
})
test('in ascii the cells are #, + and ., the notch |, and every glyph ASCII', () => {
  const tree = board(ascii)
  expect(shown(pillOf(tree, '7d'))).toBe('7d ##|++ .. .. .. .. .. 66%, full ~Mon | Sat 13:30')
  expect(shown(pillOf(tree, '5h'))).toBe('5h 0% | 4h 55m')
  expect(lastButton(tree)).toBe('^')
  expect(shown(firstRow(tree))).toMatch(/^[\x20-\x7e]*$/)
  expect(shown(board({ ...ascii, ...open }))).toMatch(/^[\x20-\x7e]*$/)
})

// The give-way ladder, least needed first: the tokens, the 7d reset, the 5h
// reset, the fill day, the long wording, the context, the 5h, the cells,
// the 7d itself, then the cost.
const LADDER: ReadonlyArray<readonly [string, (t: Node) => boolean]> = [
  ['tokens', t => pillOf(t, 'tokens') !== undefined],
  ['weekReset', t => /Sat 13:30/.test(shown(pillOf(t, '7d')))],
  ['fiveReset', t => /4h 55m/.test(shown(pillOf(t, '5h')))],
  ['weekPace', t => /full ~Mon/.test(shown(pillOf(t, '7d')))],
  ['shortWording', t => /full/.test(shown(pillOf(t, 'ctx')))],
  ['calmContext', t => pillOf(t, 'ctx') !== undefined],
  ['calmFive', t => pillOf(t, '5h') !== undefined],
  ['weekCells', t => /▅|#/.test(shown(pillOf(t, '7d'))) || daysSvg(t) !== undefined],
  ['calmWeek', t => pillOf(t, '7d') !== undefined],
  ['cost', t => pillOf(t, 'cost') !== undefined],
]
test('it gives way by its ladder as it narrows, each piece before the ones it needs less than', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const lost = new Set<string>()
    for (let columns = 160; columns >= 40; columns--) {
      const tree = board({ surface, columns })
      const gone = LADDER.filter(([, has]) => !has(tree)).map(([piece]) => piece)
      // What has gone is the ladder's head, and stays gone as it narrows.
      expect(`${surface} ${columns}: ${gone.join(' ')}`).toBe(`${surface} ${columns}: ${LADDER.slice(0, gone.length).map(([piece]) => piece).join(' ')}`)
      for (const piece of lost) expect(`${surface} ${columns}: ${piece} ${gone.includes(piece)}`).toBe(`${surface} ${columns}: ${piece} true`)
      for (const piece of gone) lost.add(piece)
    }
    expect([...lost]).toEqual(LADDER.slice(0, lost.size).map(([piece]) => piece))
    expect(lost.size).toBeGreaterThan(5)
  }
})

// The board draws this at 95 columns; the desktop's measure, about 0.75 of a
// column a character and an Svg's px over ten, puts the row there at 104 of
// its 91, so both resets hold from 108.
test('the desktop row gives the tokens way first and keeps both resets while it can, as its board draws it', () => {
  const tree = board({ ...desk, columns: 108 })
  expect(pillKeys(tree)).toEqual(['7d', '5h', 'cache', 'cost', 'ctx'])
  expect(shown(pillOf(tree, '7d'))).toBe('7d 66% · full ~Mon · Sat 13:30')
  expect(shown(pillOf(tree, '5h'))).toBe('5h 0% · 4h 55m')
})
test('a week not measured yet draws no day as none left, and says it is not known', () => {
  // No samples, an hour into the window: nothing measured, too early to guess.
  const now = SAT_RESET - 167 * HOUR
  const fresh = {
    samples: [], now,
    sevenDay: { percentUsed: 1, resetsAt: new Date(SAT_RESET).toISOString() },
    fiveHour: { percentUsed: 0, resetsAt: new Date(now + 4 * HOUR).toISOString(), etaMs: null },
  }
  const text = shown(pillOf(board(fresh), '7d'))
  expect(text).not.toContain('╌')
  expect(text).toMatch(/^7d [·░▏ ]+ 1%/)
  expect(shown(pillOf(board({ ...fresh, ...ascii }), '7d'))).not.toContain('.')
  const days = daysSvg(board({ ...fresh, ...desk }))
  expect(days?.props?.alt).toBe('weekly limit by day: not known yet')
  expect(String(days?.props?.source)).not.toContain('stroke-dasharray')
})

test('amber leads the row, said with its own `! `', () => {
  const five = board({ fiveHour: { percentUsed: 82, resetsAt: new Date(FIVE_RESET).toISOString(), etaMs: null } })
  expect(pillKeys(five).slice(0, 2)).toEqual(['5h', '7d'])
  expect(shown(pillOf(five, '5h'))).toBe('! 5h 82% │ ↻ 4h 55m')
  expect(pillOf(five, '5h')?.props?.backgroundColor).toBe(DARK.amberBg)
  const paced = board({ fiveHour: { percentUsed: 60, resetsAt: new Date(FIVE_RESET).toISOString(), etaMs: 40 * MIN } })
  expect(shown(pillOf(paced, '5h'))).toMatch(/^! 5h full in ~40m/)
  const cache = board({ cache: { ...snapOf().cache, msLeft: 30_000 } })
  expect(pillKeys(cache)[0]).toBe('cache')
  expect(shown(pillOf(cache, 'cache'))).toBe(' ! 30s left · re-warm ~$1.66 ')
  const near = board({ context: { tokens: 180_000, window: 200_000, percent: 90, compactAt: 190_000, autoCompactOff: false } })
  expect(pillKeys(near)[0]).toBe('ctx')
  expect(shown(pillOf(near, 'ctx'))).toBe('! context 95% · compacts in ~10k')
  // The 7d keeps its cells while amber, its reason in place of its value.
  const seven = board({ sevenDay: { percentUsed: 85, resetsAt: new Date(SAT_RESET).toISOString() } })
  expect(shown(pillOf(seven, '7d'))).toMatch(/^! 7d 85% ▅▅▏[▁-█]{2} ╌╌ /)
  expect(pillOf(seven, '7d')?.props?.backgroundColor).toBe(DARK.amberBg)
})
test('no limits reported: no limit pills, and no LIMITS card open', () => {
  const none = { sevenDay: undefined, fiveHour: undefined }
  expect(pillKeys(board(none))).toEqual(['cache', 'cost', 'ctx', 'tokens'])
  expect(cardOf(board({ ...none, ...open }), 'limits')).toBeUndefined()
})

test("open is chips' four cards: LIMITS' head draws the 5h by the hour, and the other heads keep no lens", () => {
  const tree = board(open)
  // A terminal's lens is the five hours alone: this one measured at 0%, the four after not known yet.
  expect(shown(headOf(tree, 'limits'))).toBe('LIMITS░····7d 66%')
  expect([...shown(byKey(headOf(tree, 'limits'), 'slot'))].length).toBeLessThanOrEqual(6)
  for (const name of ['cache', 'spend', 'context']) expect(byKey(headOf(tree, name), 'slot')).toBeUndefined()
  const lens = svgsOf(headOf(board({ ...desk, ...open }), 'limits')).find(s => /^5-hour limit by hour/.test(String(s.props?.alt)))
  expect([lens?.props?.alt, lens?.props?.height]).toEqual(['5-hour limit by hour: 15:09 0%', 16])
  expect(Number(lens?.props?.width)).toBeLessThanOrEqual(62)
  expect(byKey(cardOf(board({ ...desk, ...open }), 'limits'), 'slot')).toBeDefined()
})
test('open adds, never repeats: each card leads with what the row left out', () => {
  const tree = board(open)
  expect(firstRowOf(tree, 'limits')).toBe('by daySun +66% · Mon ~+34% fills it')
  expect(firstRowOf(tree, 'context')).toBe('room left · compacts at 190k~114k')
  expect(firstRowOf(tree, 'cache')).toBe('re-warm if cold~$1.66')
  expect(firstRowOf(tree, 'spend')).toBe('last message$0.21')
  // The row shows the resets; the context's two facts are said once, in its lead.
  expect([fact(tree, 'resets'), fact(tree, 'room left'), fact(tree, 'auto-compacts at')]).toEqual([undefined, undefined, undefined])
  // Nor the 5h's reset, which its pill counts down.
  expect(byKey(cardOf(tree, 'limits'), 'fact:5h pace')).toBeUndefined()
  expect(boldOf(headOf(tree, 'limits'))).toEqual(['66%'])
})
test("on the desktop a card's first row says the board's whole words where its line holds them", () => {
  // Two cards to a line, as the board draws them at 95 columns; by the
  // desktop's measure the week's whole row holds in a card from 97.
  const two = board({ ...desk, ...open, columns: 100 })
  expect(firstRowOf(two, 'limits')).toBe('by daySun +66% · Mon ~+34% fills it · Tue–Sat none left')
  expect(firstRowOf(two, 'context')).toBe('room left · auto-compacts at 190k~114k')
  // Four to a line at 160, the week keeps the runs its line holds.
  const four = board({ ...desk, ...open })
  expect(firstRowOf(four, 'limits')).toBe('by daySun +66% · Mon ~+34% fills it')
  expect(firstRowOf(four, 'context')).toBe('room left · auto-compacts at 190k~114k')
})
test('a limit the row never draws heads LIMITS in amber while it needs you', () => {
  const tree = board({ ...open, otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: undefined }] })
  const head = byKey(headOf(tree, 'limits'), 'headline')
  expect(shown(head)).toBe('! spend 92%')
  const inks: unknown[] = []
  walk(head, k => {
    if (k.type === 'Text' && typeof k.children?.[0] === 'string') inks.push(k.props?.color)
  })
  // Its mark amber, its name in label ink, as every card's amber headline.
  expect([...new Set(inks)]).toEqual([DARK.amberFg, DARK.label])
  expect(boldOf(head)).toEqual(['92%'])
})
test("each card's first row holds within a card's line, where four cards share 160 columns", () => {
  const tree = board(open)
  for (const name of ['cache', 'spend', 'context', 'limits']) expect([...firstRowOf(tree, name)].length + 2).toBeLessThanOrEqual(CARD_TEXT)
})
test('open, it fits its rows, on both surfaces, from a body of one row up', () => {
  for (const surface of ['terminal', 'desktop'] as const)
    for (const maxRows of [6, 7, 8, 9, 10, 13, 20]) {
      for (const glyphs of ['unicode', 'ascii'] as const) {
        const tree = board({ surface, maxRows, glyphs, expanded: true, columns: 120 })
        const errors = invariantErrors(tree, { layout: 'week', surface, appearance: 'dark', cols: 120, maxRows, scenario: 'calm', glyphs, expanded: true })
        expect(`${surface} ${maxRows} ${glyphs}: ${errors.join('; ')}`).toBe(`${surface} ${maxRows} ${glyphs}: `)
      }
    }
})

// On the engine: a week of samples stored, the clock at the host's 03:30.
/** The first moment from 0 the host reads 03:30: the kit's zone is the host's. */
const NOW = (((((3 * 60 + 30) - (utcOffsetOf(0) ?? 0)) * MIN) % DAY_MS) + DAY_MS) % DAY_MS
/** A sample of the windows USAGE reports (5h resets 3h on, 7d 67h on), `hours` from NOW. */
const sample = (hours: number, five: number, seven: number): Sample =>
  ({ at: NOW + hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: NOW + 3 * HOUR, sevenResetAt: NOW + 67 * HOUR })
const SAMPLES = [sample(-100, 0, 5), sample(-60, 0, 10), sample(-40, 0, 15), sample(-10, 0, 22), sample(-1.5, 1, 27), sample(-0.5, 3, 28)]
/** The band with that week stored, each mount drawn shut and open. */
const withHistory = async ($: Engine, on: On, mounts: readonly Mount[]) => {
  const usage = { ...USAGE, rateLimits: USAGE.rateLimits.map(l => (l.resetsAt === undefined ? l : { ...l, resetsAt: new Date(NOW + Date.parse(l.resetsAt)).toISOString() })) }
  setup(on, { store: { layout: 'week', limitSamples: SAMPLES }, env: HOUR_1, usage, now: NOW })
  await $.session.start(START)
  const trees: Record<string, Node> = {}
  for (const m of mounts) {
    const ui = await mountBand($, m.surface, m.cols, { maxRows: m.maxRows })
    trees[caseKey(m, 'shut')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    trees[caseKey(m, 'open')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return trees
}
test('with a week stored, today rises in its cells and in LIMITS words, shut and open', LONG, async ($, on) => {
  const mounts = (['terminal', 'desktop'] as const).flatMap(surface => [6, 9, 13, 40].map((maxRows): Mount => ({ surface, cols: 160, maxRows })))
  const trees = await withHistory($, on, mounts)
  for (const m of mounts) {
    for (const state of ['shut', 'open'] as const) {
      const key = caseKey(m, state)
      const tree = trees[key]
      const errors = tree === undefined
        ? ['missing: not drawn']
        : invariantErrors(tree, { layout: 'week', surface: m.surface, appearance: 'dark', cols: m.cols, maxRows: m.maxRows ?? DEFAULT_MAX_ROWS, scenario: 'calm', glyphs: 'unicode', expanded: state === 'open' })
      expect(`${key} ${errors.join('; ')}`).toBe(`${key} `)
    }
  }
  // Today rose 6 points, and the 5h's last two hours are measured.
  expect(firstRowOf(trees[caseKey({ surface: 'terminal', cols: 160, maxRows: 40 }, 'open')] as Node, 'limits')).toMatch(/^by day\w{3} \+6% · /)
})

// The zone matrix: the week drawn straight from a snapshot at four zones, so
// what holds on the host holds in each of them too.
/** 12:00 UTC on a Thursday: another hour of the day in each zone. */
const NOON = Date.UTC(2026, 9, 8, 12)
const ZONES = [0, -420, 330, 840] as const
/** The last local midnight at or before `now`, `utcOffsetMin` east of UTC. */
const midnightBefore = (now: number, utcOffsetMin: number): number => now - ((((now + utcOffsetMin * MIN) % DAY_MS) + DAY_MS) % DAY_MS)
/** The week at `now`, the windows as USAGE reports them, open, on the desktop and the ascii terminal. */
const drawWeek = (now: number, utcOffsetMin: number, samples: readonly Sample[]) => {
  const snap = (over: Partial<BandSnapshot>) => snapOf({
    layout: 'week', columns: 160, maxRows: DEFAULT_MAX_ROWS, expanded: true, now, utcOffsetMin, samples, ...over,
    fiveHour: { percentUsed: 4, resetsAt: new Date(now + 3 * HOUR).toISOString(), etaMs: null },
    sevenDay: { percentUsed: 30, resetsAt: new Date(now + 67 * HOUR).toISOString() },
  })
  return { desktop: drawBand(fakeEl, snap(desk), NO_ACT) as unknown as Node, ascii: drawBand(fakeEl, snap(ascii), NO_ACT) as unknown as Node }
}
/** Today's name where it is `now`, `utcOffsetMin` east of UTC. */
const todayAt = (now: number, utcOffsetMin: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(now + utcOffsetMin * MIN).getUTCDay()] ?? ''
const zone = (off: number) => `UTC${off < 0 ? '' : '+'}${off / 60}`
for (const off of ZONES) {
  test(`at ${zone(off)}, today is the day it is, with its rise, and the days ahead are guesses`, () => {
    // One sample late yesterday and one early today, a quarter hour off the edges.
    const since = (midnightBefore(NOON, off) - NOON) / HOUR
    const at = (hours: number, five: number, seven: number): Sample =>
      ({ at: NOON + hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: NOON + 3 * HOUR, sevenResetAt: NOON + 67 * HOUR })
    const { desktop, ascii: text } = drawWeek(NOON, off, [at(since - 2.25, 0, 22), at(since + 0.25, 1, 28)])
    const today = todayAt(NOON, off)
    expect(firstRowOf(text, 'limits')).toMatch(new RegExp(`^by day${today.slice(0, 3)} \\+6%, \\w{3}(-\\w{3})? ~\\+\\d+%`))
    expect(String(daysSvg(desktop)?.props?.alt)).toMatch(new RegExp(`\\b${today} 6%, \\w+day about \\d+%`))
  })
  test(`at ${zone(off)}, a minute past midnight with no sample since, today is unknown, never 0%`, () => {
    const now = midnightBefore(NOON, off) + MIN
    const at = (hours: number, seven: number): Sample => ({ at: now + hours * HOUR, fivePct: 0, sevenPct: seven, fiveResetAt: now + 3 * HOUR, sevenResetAt: now + 67 * HOUR })
    // Yesterday is known; today has no sample yet.
    const { desktop, ascii: text } = drawWeek(now, off, [at(-26.25, 15), at(-2.25, 22)])
    const today = todayAt(now, off)
    expect(firstRowOf(text, 'limits')).not.toMatch(new RegExp(`${today.slice(0, 3)} \\+`))
    expect(String(daysSvg(desktop)?.props?.alt)).not.toMatch(new RegExp(`${today} \\d`))
    expect(shown(text)).not.toMatch(/\+0%/)
  })
}
