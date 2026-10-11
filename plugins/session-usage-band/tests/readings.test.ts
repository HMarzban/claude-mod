import { test, expect } from 'claude-code/testing'
import { fmtClock, fmtDayClock } from '../hooks/format'
import { cappedMarks, readingsOf, type HourCell } from '../hooks/reading'
import { usedSoFar } from '../hooks/words'
import { HOUR, MIN } from './helpers'
import { snapOf } from './matrix'

const cacheAt = (msLeft: number) => ({ ...snapOf().cache, msLeft })
const NOTHING_SAID = { reset: false, pace: false }

test('readings name every limit with its tone, value, reset and projection', () => {
  const r = readingsOf(snapOf())
  expect(r.fiveHour?.tone).toBe('calm')
  expect(r.fiveHour?.value).toBe('4%')
  expect(r.fiveHour?.reset).toEqual({ kind: 'in', text: '3h 00m' })
  expect(Math.abs((r.sevenDay?.projectedPct ?? 0) - 30 / (1 - 67 / 168))).toBeLessThan(1e-5)
  expect(r.worstLimit?.name).toBe('7d')
  expect(r.limits.map(l => l.name)).toEqual(['5h', '7d'])
})
test("a card says each limit's reset with its pace", () => {
  expect(readingsOf(snapOf()).limits.map(l => l.cardResetLess('countdown', NOTHING_SAID))).toEqual(['resets 3h 00m · on pace for ~10%', 'resets 2d 19h · on pace for ~50%'])
})
test('a card says when a limit resets: its clock once the offset is known, else how long until; nothing once passed', () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 0 })).limits.map(l => l.resetWhen)).toEqual(['03:00', 'Sat 19:00'])
  expect(readingsOf(snapOf()).limits.map(l => l.resetWhen)).toEqual(['in 3h 00m', 'in 2d 19h'])
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.resetWhen).toBeUndefined()
})
test('a window that fills before its reset says when: a measured fill, else the average pace\'s, its day past today', () => {
  // 7d at 66% with 30h of 168 gone fills in another 30h × 34/66, 15h 27m:
  // from Sunday 20:00, Monday; from Sunday midnight, that day at 15:27.
  const sevenFrom = (now: number) => readingsOf(snapOf({ utcOffsetMin: 0, now, sevenDay: { percentUsed: 66, resetsAt: new Date(now + 138 * HOUR).toISOString() } })).sevenDay
  const seven = sevenFrom(3 * 24 * HOUR + 20 * HOUR)
  expect(Math.abs((seven?.fillInMs ?? 0) - (30 * HOUR * 34) / 66)).toBeLessThan(1e-3)
  expect([seven?.fillAt, seven?.fillText, seven?.fillNamed, seven?.ahead?.figure]).toEqual(['~Mon', 'full ~Mon', '7d full ~Mon', '~Mon'])
  expect(sevenFrom(3 * 24 * HOUR)?.fillAt).toBe('~15:27')
  expect(readingsOf(snapOf({ sevenDay: { percentUsed: 66, resetsAt: new Date(138 * HOUR).toISOString() } })).sevenDay?.fillAt).toBe('in ~15h 30m')
  // Measured, the 5h's own fill; landing short, none, and its next change is its reset.
  expect(readingsOf(snapOf({ utcOffsetMin: 0, fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } })).fiveHour?.fillAt).toBe('~00:40')
  const calm = readingsOf(snapOf({ utcOffsetMin: 0 })).fiveHour
  expect([calm?.fillInMs, calm?.ahead?.figure, calm?.ahead?.soon, calm?.ahead?.tail]).toEqual([undefined, '03:00', 'in 3h 00m', 'on pace for ~10%'])
  expect(readingsOf(snapOf({ fiveHour: { percentUsed: 0, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } })).fiveHour?.ahead).toBeUndefined()
})
test('the context says how many messages to compaction at its average rise a message', () => {
  const at = (context: readonly number[]) => readingsOf(snapOf({ history: { costs: [], fiveHour: [], context } })).history.toCompactionText
  // 114k of room at 10k a message.
  expect(at([56_000, 66_000, 76_000])).toBe('~11 messages to compaction')
  expect([at([76_000]), at([80_000, 76_000])]).toEqual([undefined, undefined])
  // Since the newest compaction: 940k of rise before it would say ~240 messages.
  const compacted = [...Array.from({ length: 95 }, (_, i) => 20_000 + i * 10_000), ...Array.from({ length: 16 }, (_, i) => 150_000 + i * 10_000)]
  const after = (context: readonly number[]) =>
    readingsOf(snapOf({ context: { tokens: 300_000, window: 1_000_000, percent: 30, compactAt: 967_000, autoCompactOff: false }, history: { costs: [], fiveHour: [], context } })).history.toCompactionText
  expect(after(compacted)).toBe('~67 messages to compaction')
  // Just compacted, nothing has risen yet.
  expect(after([...compacted.slice(0, 95), 150_000])).toBeUndefined()
})
test("a card can say each limit's reset at its clock time, with its pace, as LIMITS' lead row does", () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 0 })).limits.map(l => l.cardResetLess('clock', NOTHING_SAID))).toEqual(['resets 03:00 · on pace for ~10%', 'resets Sat 19:00 · on pace for ~50%'])
  expect(readingsOf(snapOf()).fiveHour?.cardResetLess('clock', NOTHING_SAID)).toBe('resets in 3h 00m · on pace for ~10%')
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.cardResetLess('clock', NOTHING_SAID)).toBeUndefined()
})
test('a card heads its section with one figure, the rest in words, in lowercase', () => {
  const r = readingsOf(snapOf())
  expect(r.cache.cardHead).toEqual([['52m', 'value'], [' left', 'label']])
  expect(r.context.cardHead).toEqual([['40%', 'value'], [' full', 'label']])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined, autoCompactOff: true } }))
  expect(off.context.cardHead).toEqual([['85%!', 'value'], [' full', 'label']]) // the mark rides on the figure
  const moods = [
    snapOf({ cache: { ...snapOf().cache, requests: 0, fresh: false } }),
    snapOf({ cache: { ...snapOf().cache, requests: 0, fresh: true } }),
    snapOf({ cache: cacheAt(0) }),
    snapOf({ isWorking: true }),
  ]
  expect(moods.map(m => readingsOf(m).cache.cardHead)).toEqual([[['not measured yet', 'value']], [['warming', 'value']], [['cold', 'value']], [['warm', 'value']]])
})
test('a limit at 82% reads 5h 82%, with no mark, and is amber', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect(`${r.fiveHour?.name} ${r.fiveHour?.value}`).toBe('5h 82%')
  expect(r.fiveHour?.tone).toBe('amber')
})
test('a measured 5h fill sets its projection to 100', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  expect(r.fiveHour?.projectedPct).toBe(100)
  expect(r.fiveHour?.tone).toBe('amber')
  expect(r.fiveHour?.cardResetLess('countdown', NOTHING_SAID)).toBe('resets 1h 10m · full in ~40m')
})
test('a gateway spend limit is a limit named spend', () => {
  const r = readingsOf(snapOf({ otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: undefined }] }))
  expect(r.limits.at(-1)?.name).toBe('spend')
  expect(r.limits.at(-1)?.key).toBe('other')
  expect(r.limits.at(-1)?.tone).toBe('amber')
})
test('the cache facts carry its mood, tone, charge and price', () => {
  const r = readingsOf(snapOf())
  expect(r.cache.mood).toBe('warm')
  expect(r.cache.tone).toBe('calm')
  expect(Math.abs(r.cache.charge - 52 / 60)).toBeLessThan(1e-5)
  expect(r.cache.estimate).toBe('~$1.66')
  expect(r.chips.reading.copy.pill(false)).toBe('cache 52m')
  expect(r.spend.total).toBe(225_000)
})

test('the cache speaks in words', () => {
  const c = readingsOf(snapOf()).cache
  expect(c.text).toBe('cache 52m left')
  expect(c.say).toEqual([['cache ', 'label'], ['52m left', 'value']])
  expect(c.textShort).toBe('cache 52m')
  expect(c.alt).toBe('cache 52 minutes left, warm')
  expect([c.hitFrac, c.hitText, c.savedText, c.lastsText]).toEqual([0.96, '96%', '~$11.40', '1h idle'])
  expect(c.coldInMs).toBe(52 * MIN)
})
test('in its last minute the cache is amber, long and short', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(47_000) })).cache
  expect(c.alt).toBe('cache 47 seconds left, cooling, re-warm about $1.66')
  expect([c.amber?.long, c.amber?.short, c.amber?.beside]).toEqual(['! 47s left · re-warm ~$1.66', '! 47s', '! cache'])
})
test('working, the cache shows no countdown', () => {
  const c = readingsOf(snapOf({ isWorking: true })).cache
  expect([c.text, c.left]).toEqual(['cache warm', ''])
  expect(c.coldInMs).toBeUndefined()
})
test('working, an expiring cache still counts down', () => {
  const c = readingsOf(snapOf({ isWorking: true, cache: cacheAt(47_000) })).cache
  expect(c.coldInMs).toBe(47_000)
  expect(c.alt).toMatch(/, cooling, /)
  expect(c.amber).toBeDefined()
})
test('cold is a price', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(0), utcOffsetMin: 0 })).cache
  expect([c.text, c.textShort]).toEqual(['cache cold · re-warm ~$1.66', 'cold ~$1.66'])
  expect(c.alt).toBe('cache cold, re-warm about $1.66')
})
test('an hour left is said in full to a reader', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(60 * MIN) })).cache
  expect(c.alt).toBe('cache 1 hour left, warm')
})
test('the countdown never looks like a clock', () => {
  for (const ms of [52 * MIN, 9.5 * MIN, 47_000]) {
    const { left } = readingsOf(snapOf({ cache: cacheAt(ms) })).cache
    expect(left).toMatch(/^\d+[hms].* left$/)
    expect(left).not.toMatch(/\d:\d\d/)
  }
})
test('clock times appear only when the offset is known', () => {
  expect(readingsOf(snapOf()).cache.coldAtText).toBeUndefined()
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 4, resetsAt: new Date(now + 3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.cache.coldAtText).toBe(`cold at ${fmtClock(now + 52 * MIN, 0)}`)
  expect(r.fiveHour?.resetClock).toBe(fmtClock(now + 3 * HOUR, 0))
})
test('limits speak in words, amber with one "! "', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.fiveHour?.text).toBe('5h 82%')
  expect(r.fiveHour?.say).toEqual([['5h ', 'label'], ['82%', 'value']])
  expect([r.fiveHour?.amber?.long, r.fiveHour?.amber?.short, r.fiveHour?.amber?.beside]).toEqual(['! 5h 82%', '! 5h 82%', '! 5h'])
  expect([r.fiveHour?.resetAtGlyph, r.fiveHour?.resetInMs]).toEqual(['↻ in 3h 00m', 3 * HOUR])
  expect(r.sevenDay?.pace).toBe('on pace for ~50%')
  expect(r.sevenDay?.alt).toBe('7d limit 30 percent used, fine, about 50 percent at its reset')
  expect(Math.abs((r.sevenDay?.projectedFrac ?? 0) - 30 / (1 - 67 / 168) / 100)).toBeLessThan(1e-5)
})
test('a measured fill is an estimate, with ~', () => {
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 84, resetsAt: new Date(now + 70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  expect(r.fiveHour?.fullIn).toBe('~40m')
  expect([r.fiveHour?.amber?.long, r.fiveHour?.amber?.short, r.fiveHour?.amber?.beside]).toEqual(['! 5h full in ~40m', '! 5h ~40m', '! 5h ~40m'])
  expect(r.fiveHour?.alt).toBe('5h limit 84 percent used, needs attention, full in about 40 minutes')
})
test('a landing at or over 100% is full before reset, never ~112%', () => {
  const r = readingsOf(snapOf({ sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } }))
  expect(r.sevenDay?.projectedPct ?? 0).toBeGreaterThan(100)
  expect([r.sevenDay?.tone, r.sevenDay?.pace]).toEqual(['calm', 'full before reset'])
  expect(r.sevenDay?.alt).toBe('7d limit 79 percent used, fine, full before its reset')
})
test('a measured fill lands at 100, so it too is full before reset', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  expect(r.fiveHour?.pace).toBe('full in ~40m')
})
test('a passed window has no reset words', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR }))
  expect([r.fiveHour?.text, r.fiveHour?.resetAtGlyph, r.fiveHour?.resetShort]).toEqual(['5h reset', undefined, undefined])
})
test('a limit reads its value, or once its window has passed, reset', () => {
  expect(readingsOf(snapOf()).fiveHour?.valueText).toBe('4%')
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.valueText).toBe('reset')
})
test('a passed window has no fill time', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 0 } }))
  expect([r.fiveHour?.fullIn, r.fiveHour?.projectedFrac]).toEqual([undefined, undefined])
  expect(r.fiveHour?.alt).not.toMatch(/full in/)
})
test('context speaks toward compaction, or of the window when it is off', () => {
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } })).context
  expect([near.amber?.long, near.amber?.short, near.amber?.beside]).toEqual(['! context 93% · compacts in ~14k', '! ctx 93%', '! context'])
  expect([near.alt, near.roomText]).toEqual(['context 93 percent toward compaction, near the limit', '~14k'])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined, autoCompactOff: true } })).context
  expect([off.amber?.long, off.alt]).toEqual(['! context 85%', 'context 85 percent of the window, near the limit'])
})
test('context not reported reads as unknown, never 0%', () => {
  const x = readingsOf(snapOf({ context: { tokens: undefined, window: 200_000, percent: undefined, compactAt: 190_000, autoCompactOff: false } })).context
  expect(x.known).toBe(false)
  expect([x.valueText, x.text, x.textShort, x.inContextText, x.roomText]).toEqual(['–', 'context –', 'ctx –', '–', undefined])
  expect(x.say).toEqual([['context ', 'label'], ['–', 'value']])
  expect(x.alt).toBe('context not reported')
})
test('the ascii tier is drawn on a terminal alone', () => {
  expect(readingsOf(snapOf({ glyphs: 'ascii' })).frame.glyphs).toBe('ascii')
  for (const surface of ['desktop', 'mobile', 'vscode'] as const) expect(readingsOf(snapOf({ surface, glyphs: 'ascii' })).frame.glyphs).toBe('unicode')
})
test('spend splits its tokens, each with its share', () => {
  const s = readingsOf(snapOf()).spend
  expect([s.totalText, s.lastText, s.tokensText]).toEqual(['$3.19', '$0.21', '225k'])
  expect(s.split.map(p => p.label)).toEqual(['input', 'output', 'cache reads'])
  expect(Math.abs((s.split[2]?.frac ?? 0) - 198 / 225)).toBeLessThan(1e-5)
})
test('the history speaks its numbers and its trend', () => {
  const history = { costs: [{ usd: 0.2, reWarm: false }, { usd: 0.2, reWarm: false }, { usd: 0.84, reWarm: true }], context: [], fiveHour: [] }
  const hist = readingsOf(snapOf({ history })).history
  expect(hist.numbersShort).toBe('last $0.84')
  expect(hist.warmAvgUsd).toBe(0.2)
  expect(hist.costsAltOf(3)).toBe('cost of the last 3 messages, rising, average $0.20, max $0.84 re-warm, the newest a re-warm')
  expect(hist.costsAltOf(2)).toBe('cost of the last 2 messages, rising, average $0.20, max $0.84 re-warm, the newest a re-warm')
  // A re-warm alone has no warm average.
  expect(hist.costsAltOf(1)).toBe('cost of the last message, rising, max $0.84 re-warm, the newest a re-warm')
  expect(hist.costsAltOf(14)).toBe(hist.costsAltOf(3))
  expect([hist.empty, readingsOf(snapOf()).history.empty]).toEqual([false, true])
})
test('the 5h trail is drawn and spoken over the last hour', () => {
  const fiveHour = [{ at: -3 * HOUR, pct: 80 }, { at: -90 * MIN, pct: 1 }, { at: -30 * MIN, pct: 3 }, { at: 0, pct: 4 }]
  const hist = readingsOf(snapOf({ history: { costs: [], context: [], fiveHour } })).history
  expect(hist.fiveHourHour).toEqual([3, 4])
  expect(hist.trailAlt).toBe('5h usage over the last hour, steady')
  const filling = readingsOf(snapOf({ history: { costs: [], context: [], fiveHour: fiveHour.map(p => ({ ...p, pct: p.pct * 10 })) }, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } })).history
  expect(filling.trailAlt).toBe('5h usage over the last hour, rising, full in about 40 minutes')
})
test('the context trail is spoken with where it compacts, when compaction is on', () => {
  const history = { costs: [], context: [60_000, 50_000, 76_000], fiveHour: [] }
  expect(readingsOf(snapOf({ history })).history.contextTrailAlt).toBe('context over the conversation, rising, compacts at 190k')
  const off = readingsOf(snapOf({ history: { ...history, context: [90_000, 76_000] }, context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: undefined, autoCompactOff: true } })).history
  expect(off.contextTrailAlt).toBe('context over the conversation, falling')
  expect(readingsOf(snapOf()).history.contextTrailAlt).toBe('context over the conversation, steady, compacts at 190k')
})
test('the history is read only when a view asks for it', () => {
  expect(typeof Object.getOwnPropertyDescriptor(readingsOf(snapOf()), 'history')?.get).toBe('function')
})
test('the week is read only when a view asks for it', () => {
  expect(typeof Object.getOwnPropertyDescriptor(readingsOf(snapOf()), 'week')?.get).toBe('function')
})
test('the week names its cells in words, for a reader', () => {
  const now = 77 * HOUR
  const T = (hours: number, seven: number, five = 0) => ({ at: hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: 80 * HOUR, sevenResetAt: 168 * HOUR })
  const wk = readingsOf(snapOf({
    now, utcOffsetMin: 0,
    samples: [T(0, 0), T(15, 6), T(39, 15), T(63, 26), T(75.5, 28, 4), T(76.5, 29, 12), T(77, 30, 12)],
    sevenDay: { percentUsed: 30, resetsAt: new Date(168 * HOUR).toISOString() },
    fiveHour: { percentUsed: 12, resetsAt: new Date(80 * HOUR).toISOString(), etaMs: null },
  })).week
  expect(wk.daysAlt).toMatch(/^weekly limit by day: \w+day 6%, \w+day 9%/)
  expect(wk.daysAlt).toMatch(/Monday about \d+%/)
  // The measured days alone, with no guess among them.
  expect(wk.measuredAlt).toMatch(/^weekly limit by day, measured: \w+day 6%, \w+day 9%, \w+day 11%, \w+day 4%$/)
  expect(wk.hoursAlt).toMatch(/^5-hour limit by hour: \d{2}:00 4%, \d{2}:00 8%, \d{2}:00 about \d+%/)
  expect(`${wk.daysAlt} ${wk.hoursAlt}`).not.toMatch(/[~↻]/)
})
test('with no samples and no pace yet, the week is not known yet', () => {
  // An hour into the window: too early for a landing, so no day is guessed either.
  const wk = readingsOf(snapOf({ now: HOUR, sevenDay: { percentUsed: 1, resetsAt: new Date(168 * HOUR).toISOString() } })).week
  expect(wk.daysAlt).toBe('weekly limit by day: not known yet')
})

// The week as its board draws it: Sun 15:14, the 7d at 66%, all of it risen
// today, resetting Sat 13:30; the 5h at 0%, resetting in 4h 55m.
const SUN = Date.UTC(2026, 9, 11, 15, 14)
const SAT_RESET = Date.UTC(2026, 9, 17, 13, 30)
const FIVE_RESET = SUN + (4 * 60 + 55) * MIN
const boardSample = (at: number, sevenPct: number) => ({ at, fivePct: 0, sevenPct, fiveResetAt: FIVE_RESET, sevenResetAt: SAT_RESET })
const boardWeek = (percentUsed = 66) => readingsOf(snapOf({
  now: SUN, utcOffsetMin: 0,
  samples: [boardSample(SAT_RESET - 168 * HOUR, 0), boardSample(SUN - MIN, percentUsed)],
  sevenDay: { percentUsed, resetsAt: new Date(SAT_RESET).toISOString() },
  fiveHour: { percentUsed: 0, resetsAt: new Date(FIVE_RESET).toISOString(), etaMs: null },
})).week
test('week stops its guess at the cap: the fill day takes what is left, and none is left after it', () => {
  const wk = boardWeek()
  expect(wk.dayRow.marks.map(m => `${m.kind} ${Math.round(m.pct)}`)).toEqual(['measured 66', 'fills 34', 'spent 0', 'spent 0', 'spent 0', 'spent 0', 'spent 0'])
  // calendar.ts still guesses every day ahead alike.
  expect(wk.days.slice(2).every(d => d.guess && (d.pct ?? 0) > 34)).toBe(true)
  expect(boardWeek(100).dayRow.marks.slice(1).every(m => m.kind === 'spent')).toBe(true)
})
test("the slice calendar marks full takes what is left, even where the step's guess says otherwise", () => {
  const cell = (pct: number, guess: boolean, fullMark = false): HourCell =>
    ({ label: '', startClock: '', text: '', now: false, future: guess, pct, guess, fullMark })
  const marks = (cells: HourCell[], used: number) => cappedMarks(cells, used).map(m => `${m.kind} ${m.pct}`)
  // A measured fill lands sooner than the step: its slice still fills the cap.
  expect(marks([cell(50, false), cell(10, true, true), cell(10, true)], 50)).toEqual(['measured 50', 'fills 50', 'spent 0'])
  // Or later: the guesses before it spend what is left, and it is still the fill.
  expect(marks([cell(70, false), cell(40, true), cell(40, true, true), cell(40, true)], 70)).toEqual(['measured 70', 'guess 30', 'fills 0', 'spent 0'])
})
test("week's notch sits in today's cell, as far in as today has gone; the 5h at 0% has none", () => {
  const wk = boardWeek()
  expect(Math.abs((wk.dayRow.notch ?? 0) - (15 * 60 + 14) / (24 * 60))).toBeLessThan(1e-9)
  // The 5h's first hour measured at 0%, the rest not yet.
  expect(wk.hourRow.marks.map(m => m.kind)).toEqual(['measured', 'unknown', 'unknown', 'unknown', 'unknown'])
  expect(wk.hourRow.notch).toBeUndefined()
  const five = readingsOf(snapOf({ now: 0, fiveHour: { percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } })).week
  expect(Math.abs((five.hourRow.notch ?? 0) - 2)).toBeLessThan(1e-9)
})
test("week says the fill day, and LIMITS' first row says the week from today within a card's line", () => {
  const wk = boardWeek()
  expect(wk.fullDay).toBe('full ~Mon')
  // Each form a run shorter, longest first, so a card draws the longest its line holds.
  expect(wk.byDay).toEqual(['Sun +66% · Mon ~+34% fills it · Tue–Sat none left', 'Sun +66% · Mon ~+34% fills it', 'Sun +66%'])
  expect(boardWeek(100).byDay).toEqual(['Sun +100% · Mon–Sat none left', 'Sun +100%'])
  expect(boardWeek(100).fullDay).toBeUndefined()
  expect(wk.daysAlt).toBe('weekly limit by day: Sunday 66%, Monday about 34% and fills it, Tuesday to Saturday none left')
  expect(wk.hoursAlt).toBe('5-hour limit by hour: 15:09 0%')
})
test("a week that won't fill says today's rise and the guess for the days ahead", () => {
  const now = 77 * HOUR
  const T = (hours: number, seven: number) => ({ at: hours * HOUR, fivePct: 0, sevenPct: seven, fiveResetAt: 80 * HOUR, sevenResetAt: 168 * HOUR })
  const wk = readingsOf(snapOf({
    now, utcOffsetMin: 0, samples: [T(0, 0), T(15, 6), T(39, 15), T(63, 26), T(75.5, 28), T(77, 30)],
    sevenDay: { percentUsed: 30, resetsAt: new Date(168 * HOUR).toISOString() },
  })).week
  expect(wk.fullDay).toBeUndefined()
  expect(wk.byDay[0]).toMatch(/^Sun \+4% · Mon–Wed ~\+\d+%$/)
})
// Short of `auto-`, so with its value it holds in a card's line on a terminal.
test('the context names its room and where it compacts in one row, long and short', () => {
  expect(readingsOf(snapOf()).context.roomCompacts).toEqual(['room left · auto-compacts at 190k', 'room left · compacts at 190k'])
  const off = readingsOf(snapOf({ context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: undefined, autoCompactOff: true } })).context
  expect(off.roomCompacts).toBeUndefined()
})
test("a limit's amber headline leads with its mark in amber, its figure apart", () => {
  const r = readingsOf(snapOf({ otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: undefined }] }))
  expect(r.limits.at(-1)?.amberHead).toEqual([['! ', 'amber'], ['spend ', 'label'], ['92%', 'value']])
})
test("a gauge says its figure bold, then what qualifies it, and short its figure alone", () => {
  const r = readingsOf(snapOf())
  expect([r.cache.gaugeSay, r.cache.gaugeShort, r.cache.gaugeMore]).toEqual([[['52m', 'value'], [' left', 'label']], [['52m', 'value']], 're-warm ~$1.66'])
  expect([r.context.gaugeSay, r.context.gaugeShort, r.context.gaugeMore]).toEqual([[['40%', 'value'], [' full', 'label']], [['40%', 'value']], '~114k left'])
  const cold = readingsOf(snapOf({ cache: cacheAt(0) })).cache
  expect([cold.gaugeSay, cold.gaugeMore]).toEqual([[['cold', 'value']], 're-warm ~$1.66'])
  const working = readingsOf(snapOf({ isWorking: true })).cache
  expect([working.gaugeSay, working.gaugeMore]).toEqual([[['warm', 'value']], undefined])
  // Near compaction its room is the reason; unreported, it says so, short a dash.
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } })).context
  expect(near.gaugeMore).toBe('compacts in ~14k')
  const none = readingsOf(snapOf({ context: { tokens: undefined, window: 200_000, percent: undefined, compactAt: 190_000, autoCompactOff: false } })).context
  expect([none.gaugeSay, none.gaugeShort, none.gaugeMore]).toEqual([[['not reported', 'label']], [['–', 'label']], undefined])
})
test("a limit's notch is the share of its window gone, and a window with nothing used has none, nor a pace", () => {
  const r = readingsOf(snapOf())
  expect(r.fiveHour?.notch).toBe(r.fiveHour?.gone)
  expect(r.fiveHour?.notch).toBeGreaterThan(0)
  const unused = readingsOf(snapOf({ fiveHour: { percentUsed: 0, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect([unused.fiveHour?.gone === undefined, unused.fiveHour?.notch]).toEqual([false, undefined])
  // Nor a pace: a landing of ~0% says nothing the 0% doesn't.
  expect([unused.fiveHour?.projectedPct, unused.fiveHour?.pace]).toEqual([undefined, ''])
})

// ---- departures' countdowns ---------------------------------------------------

test('a limit fills in its measured time, else on its average once it lands at 100% or more, never once passed', () => {
  const fullIn = (over: Parameters<typeof snapOf>[0]) => readingsOf(snapOf(over)).limits.map(l => l.fullInMs)
  expect(fullIn({})).toEqual([undefined, undefined])
  expect(fullIn({ fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } })[0]).toBe(40 * MIN)
  // 79% in the 118h gone of 168: the 21% left takes 118h × 21 / 79.
  const seven = fullIn({ sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } })[1] ?? 0
  expect(Math.abs(seven - (118 * HOUR * 21) / 79)).toBeLessThan(1)
  expect(fullIn({ now: 4 * HOUR, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 0 } })[0]).toBeUndefined()
  // A full window has nothing left to fill, measured or not.
  for (const etaMs of [null, 5 * MIN]) expect(fullIn({ fiveHour: { percentUsed: 100, resetsAt: new Date(2 * HOUR).toISOString(), etaMs } })[0]).toBeUndefined()
})
test('a limit under 10 minutes from full is its last call, measured or on its average, never once full', () => {
  const five = (percentUsed: number, resetInMin: number, etaMs: number | null) =>
    readingsOf(snapOf({ fiveHour: { percentUsed, resetsAt: new Date(resetInMin * MIN).toISOString(), etaMs } })).fiveHour
  const measured = five(40, 180, 6 * MIN)
  expect([measured?.lastCall, measured?.departure, measured?.departureReset]).toEqual([
    true,
    { long: { words: '! last call · 5h full ', figure: '~5m', after: '' }, short: { words: '! last call · 5h ', figure: '~5m', after: '' } },
    '3h 00m',
  ])
  expect(five(40, 180, 10 * MIN)?.lastCall).toBe(false)
  // 70% in the 20 minutes gone: the 30% left takes 20m × 30 / 70, under 9m,
  // though under 80% the window is calm.
  const average = five(70, 280, null)
  expect([average?.lastCall, average?.tone, average?.departure.long]).toEqual([true, 'calm', { words: '! last call · 5h full ', figure: '~10m', after: '' }])
  const full = five(100, 120, 5 * MIN)
  expect([full?.lastCall, full?.departure.long, full?.departureReset, full?.departureLens]).toEqual([false, { words: '! 5h ', figure: '100%', after: '' }, '2h 00m', '5h resets'])
})
test("in the ascii tier a departure's ` · ` reads ` - `, as its board draws it", () => {
  const ascii = (over: Parameters<typeof snapOf>[0]) => readingsOf(snapOf({ glyphs: 'ascii', ...over }))
  expect(ascii({ cache: { ...snapOf().cache, msLeft: 6 * MIN } }).cache.departure.long).toEqual({ words: '! last call - cache ', figure: '6m', after: ' - re-warm ~$1.66' })
  expect(ascii({ cache: { ...snapOf().cache, msLeft: 0 } }).cache.departure.long.words).toBe('cache cold - re-warm ')
  expect(ascii({ fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 6 * MIN } }).fiveHour?.departure.long.words).toBe('! last call - 5h full ')
  const near = ascii({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } }).context
  expect(near.departure?.long.after).toBe(' - compacts in ~14k')
})
test("a limit's departure: when it resets, or when it fills and then its reset, amber with one '! '", () => {
  const words = (over: Parameters<typeof snapOf>[0], key: '5h' | '7d' = '5h') => {
    const l = readingsOf(snapOf(over)).limits.find(w => w.key === key)
    return [l?.departure, l?.departureReset, l?.departureLens, l?.departureHead]
  }
  expect(words({})).toEqual([
    { long: { words: '5h resets ', figure: '3h 00m', after: '' }, short: { words: '5h resets ', figure: '3h 00m', after: '' } },
    undefined,
    '5h resets',
    [['5h in ', 'label'], ['3h 00m', 'value']],
  ])
  expect(words({ sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } }, '7d')).toEqual([
    { long: { words: '7d full ', figure: '~1d', after: '' }, short: { words: '7d ', figure: '~1d', after: '' } },
    '2d 2h',
    '7d fills',
    [['7d full ', 'label'], ['~1d', 'value']],
  ])
  expect(words({ fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } }).slice(0, 2)).toEqual([
    { long: { words: '! 5h full ', figure: '~40m', after: '' }, short: { words: '! 5h ', figure: '~40m', after: '' } },
    '3h 00m',
  ])
  // Half an hour from its reset, 82% lands at ~91%: amber on its value alone.
  expect(words({ fiveHour: { percentUsed: 82, resetsAt: new Date(30 * MIN).toISOString(), etaMs: null } }).slice(0, 2)).toEqual([
    { long: { words: '! 5h ', figure: '82%', after: '' }, short: { words: '! 5h ', figure: '82%', after: '' } },
    '30m',
  ])
  expect(words({ now: 4 * HOUR })).toEqual([{ long: { words: '5h reset', figure: '', after: '' }, short: { words: '5h reset', figure: '', after: '' } }, undefined, '5h reset', undefined])
})
test('the cache counts down to cold; under 10 minutes it is its last call, a 5-minute cache in its last minute', () => {
  const cache = (over: Partial<ReturnType<typeof snapOf>['cache']>) => readingsOf(snapOf({ cache: { ...snapOf().cache, ...over } })).cache
  expect([cache({}).lastCall, cache({}).departure.long]).toEqual([false, { words: 'cache ', figure: '52m', after: '' }])
  const soon = cache({ msLeft: 6 * MIN })
  expect([soon.lastCall, soon.tone, soon.departure]).toEqual([
    true,
    'calm',
    { long: { words: '! last call · cache ', figure: '6m', after: ' · re-warm ~$1.66' }, short: { words: '! last call · cache ', figure: '6m', after: '' } },
  ])
  expect(cache({ msLeft: 10 * MIN }).lastCall).toBe(false)
  expect([cache({ ttl: '5m', msLeft: 4 * MIN }).lastCall, cache({ ttl: '5m', msLeft: 59_000 }).lastCall]).toEqual([false, true])
  expect(cache({ msLeft: 0 }).departure).toEqual({ long: { words: 'cache cold · re-warm ', figure: '~$1.66', after: '' }, short: { words: 'cold ', figure: '~$1.66', after: '' } })
  expect([cache({}).departureLens, cache({ msLeft: 0 }).departureLens]).toEqual(['goes cold', 'went cold'])
  // A mood is no figure: nothing bold.
  expect(readingsOf(snapOf({ isWorking: true })).cache.departure.long).toEqual({ words: 'cache warm', figure: '', after: '' })
})
test('compaction is messages away at the trail\'s pace since its last drop, else tokens away', () => {
  const context = (trail: readonly number[]) => readingsOf(snapOf({ history: { costs: [], context: trail, fiveHour: [] } })).context
  // 6.5k a message: 114k is 17.5 messages, so 18.
  const paced = context([50_000, 56_500, 63_000, 69_500, 76_000])
  expect([paced.msgsToCompact, paced.departure?.long, paced.msgsHead, paced.roomLead]).toEqual([
    18,
    { words: 'compacts ', figure: '~18', after: ' msgs' },
    [['~18', 'value'], [' msgs', 'label']],
    ['room left · auto-compacts at 190k', '~114k'],
  ])
  // A compaction drops the trail: the pace counts from there.
  expect(context([150_000, 170_000, 40_000, 58_000, 76_000]).msgsToCompact).toBe(7)
  for (const trail of [[], [76_000], [76_000, 76_000]]) {
    const x = context(trail)
    expect([x.msgsToCompact, x.departure?.long, x.msgsHead, x.roomLead]).toEqual([undefined, { words: 'compacts in ', figure: '~114k', after: '' }, undefined, undefined])
  }
  const off = readingsOf(snapOf({ context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: undefined, autoCompactOff: true } })).context
  expect(off.departure).toBeUndefined()
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } })).context
  expect(near.departure).toEqual({ long: { words: '! context ', figure: '93%', after: ' · compacts in ~14k' }, short: { words: '! ctx ', figure: '93%', after: '' } })
})
test("LIMITS' first row in departures says what each window has used, each named in its accent", () => {
  expect(usedSoFar(readingsOf(snapOf()).limits)).toEqual([
    'used so far',
    [['5h ', 'accent5'], ['4%', 'value'], [' · ', 'label'], ['7d ', 'accent7'], ['30%', 'value']],
  ])
  expect(usedSoFar(readingsOf(snapOf({ now: 4 * HOUR })).limits)?.[1].map(([text]) => text).join('')).toBe('5h reset · 7d 30%')
  expect(usedSoFar([])).toBeUndefined()
})
