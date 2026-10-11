import { test, expect } from 'claude-code/testing'
import { fmtClock, fmtDayClock } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { usedSoFar } from '../hooks/words'
import { HOUR, MIN } from './helpers'
import { snapOf } from './matrix'

const cacheAt = (msLeft: number) => ({ ...snapOf().cache, msLeft })

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
  expect(readingsOf(snapOf()).limits.map(l => l.cardReset)).toEqual(['resets 3h 00m · on pace for ~10%', 'resets 2d 19h · on pace for ~50%'])
})
test('a card says when a limit resets: its clock once the offset is known, else how long until; nothing once passed', () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 0 })).limits.map(l => l.resetWhen)).toEqual(['03:00', 'Sat 19:00'])
  expect(readingsOf(snapOf()).limits.map(l => l.resetWhen)).toEqual(['in 3h 00m', 'in 2d 19h'])
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.resetWhen).toBeUndefined()
})
test("a card can say each limit's reset at its clock time, with its pace, as LIMITS' lead row does", () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 0 })).limits.map(l => l.cardResetAt)).toEqual(['resets 03:00 · on pace for ~10%', 'resets Sat 19:00 · on pace for ~50%'])
  expect(readingsOf(snapOf()).fiveHour?.cardResetAt).toBe('resets in 3h 00m · on pace for ~10%')
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.cardResetAt).toBeUndefined()
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
  expect(r.fiveHour?.cardReset).toBe('resets 1h 10m · full in ~40m')
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

test('the cache speaks in words for the new views', () => {
  const c = readingsOf(snapOf()).cache
  expect(c.text).toBe('cache 52m left')
  expect(c.say).toEqual([['cache ', 'label'], ['52m left', 'value']])
  expect(c.textShort).toBe('cache 52m')
  expect(c.reWarmText).toBe('re-warm ~$1.66 if it goes cold')
  expect(c.alt).toBe('cache 52 minutes left, warm')
  expect([c.hitFrac, c.hitText, c.savedText, c.lastsText]).toEqual([0.96, '96%', '~$11.40', '1h idle'])
  expect(c.coldInMs).toBe(52 * MIN)
})
test('in its last minute the cache is amber, long and short', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(47_000) })).cache
  expect(c.condition).toBe('cooling')
  expect(c.amber).toEqual({ long: '! 47s left · re-warm ~$1.66', short: '! 47s' })
})
test('working, the cache shows no countdown', () => {
  const c = readingsOf(snapOf({ isWorking: true })).cache
  expect([c.text, c.left]).toEqual(['cache warm', ''])
  expect(c.coldInMs).toBeUndefined()
})
test('working, an expiring cache still counts down', () => {
  const c = readingsOf(snapOf({ isWorking: true, cache: cacheAt(47_000) })).cache
  expect(c.coldInMs).toBe(47_000)
  expect(c.condition).toBe('cooling')
  expect(c.amber).toBeDefined()
})
test('cold is a price', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(0), utcOffsetMin: 0 })).cache
  expect([c.text, c.textShort, c.reWarmText]).toEqual(['cache cold · re-warm ~$1.66', 'cold ~$1.66', 'next message ~$1.66'])
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
  expect(readingsOf(snapOf()).cache.coldAtClock).toBeUndefined()
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 4, resetsAt: new Date(now + 3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.cache.coldAtClock).toBe(fmtClock(now + 52 * MIN, 0))
  expect(r.fiveHour?.resetClock).toBe(fmtClock(now + 3 * HOUR, 0))
})
test('limits speak in words, amber with one "! "', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.fiveHour?.text).toBe('5h 82%')
  expect(r.fiveHour?.say).toEqual([['5h ', 'label'], ['82%', 'value']])
  expect(r.fiveHour?.amber).toEqual({ long: '! 5h 82%', short: '! 5h 82%' })
  expect([r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.resetInMs]).toEqual(['resets in 3h 00m', '↻ in 3h 00m', 3 * HOUR])
  expect([r.sevenDay?.projectedText, r.sevenDay?.pace]).toEqual(['~50%', 'on pace for ~50%'])
  expect(r.sevenDay?.projectedAlt).toBe('7d limit about 50 percent at its reset')
  expect(Math.abs((r.sevenDay?.projectedFrac ?? 0) - 30 / (1 - 67 / 168) / 100)).toBeLessThan(1e-5)
})
test('a measured fill is an estimate, with ~', () => {
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 84, resetsAt: new Date(now + 70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  const at = fmtClock(now + 40 * MIN, 0)
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock]).toEqual(['~40m', `~${at}`])
  expect(r.fiveHour?.amber).toEqual({ long: '! 5h full in ~40m', short: '! 5h ~40m' })
  expect(r.fiveHour?.alt).toBe('5h limit 84 percent used, needs attention, full in about 40 minutes')
})
test('a landing at or over 100% is full before reset, never ~112%', () => {
  const r = readingsOf(snapOf({ sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } }))
  expect(r.sevenDay?.projectedPct ?? 0).toBeGreaterThan(100)
  expect([r.sevenDay?.tone, r.sevenDay?.pace, r.sevenDay?.projectedText]).toEqual(['calm', 'full before reset', undefined])
  expect(r.sevenDay?.projectedAlt).toBeUndefined()
  expect(r.sevenDay?.alt).toBe('7d limit 79 percent used, fine, full before its reset')
})
test('a measured fill lands at 100, so it too is full before reset', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  expect([r.fiveHour?.projectedText, r.fiveHour?.pace]).toEqual([undefined, 'full in ~40m'])
})
test('a passed window has no reset words', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR }))
  expect([r.fiveHour?.text, r.fiveHour?.resetWords, r.fiveHour?.resetGlyph]).toEqual(['5h reset', undefined, undefined])
})
test('a limit reads its value, or once its window has passed, reset', () => {
  expect(readingsOf(snapOf()).fiveHour?.valueText).toBe('4%')
  expect(readingsOf(snapOf({ now: 4 * HOUR })).fiveHour?.valueText).toBe('reset')
})
test('a passed window has no fill time', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 0 } }))
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock, r.fiveHour?.projectedFrac]).toEqual([undefined, undefined, undefined])
  expect(r.fiveHour?.alt).not.toMatch(/full in/)
})
test('context speaks toward compaction, or of the window when it is off', () => {
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } })).context
  expect(near.amber).toEqual({ long: '! context 93% · compacts in ~14k', short: '! ctx 93%' })
  expect([near.towardText, near.roomText]).toEqual(['toward compaction', '~14k'])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined, autoCompactOff: true } })).context
  expect([off.amber?.long, off.towardText, off.compactionOffText]).toEqual(['! context 85%', 'of the window', 'auto-compaction off'])
  expect(near.compactionOffText).toBeUndefined()
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
test('the workspace is a sentence', () => {
  const workspace = { path: '~/workspace/claude-mod', git: { branch: 'main', commit: 'abc1234', worktree: undefined, changed: 0, ahead: 0, behind: 0 }, repoName: undefined }
  expect(readingsOf(snapOf({ workspace })).workspaceText).toBe('~/workspace/claude-mod, branch main, clean')
})
test('the history speaks its numbers and its trend', () => {
  const history = { costs: [{ usd: 0.2, reWarm: false }, { usd: 0.2, reWarm: false }, { usd: 0.84, reWarm: true }], context: [], fiveHour: [] }
  const hist = readingsOf(snapOf({ history })).history
  expect(hist.numbersText).toBe('last $0.84 · avg $0.20 · max $0.84 re-warm')
  expect(hist.numbersShort).toBe('last $0.84')
  expect(hist.costsAlt).toBe('cost of the last 3 messages, rising, the newest a re-warm')
  expect(hist.costsAltOf(2)).toBe('cost of the last 2 messages, rising, the newest a re-warm')
  expect(hist.costsAltOf(1)).toBe('cost of the last message, rising, the newest a re-warm')
  expect(hist.costsAltOf(14)).toBe(hist.costsAlt)
  expect([hist.empty, readingsOf(snapOf()).history.empty]).toEqual([false, true])
})
test('the 5h trail is drawn and spoken over the last hour, and since the window started', () => {
  // The window resets at 3h, so it started 2h before now; the first point is the window before.
  const fiveHour = [{ at: -3 * HOUR, pct: 80 }, { at: -90 * MIN, pct: 1 }, { at: -30 * MIN, pct: 3 }, { at: 0, pct: 4 }]
  const hist = readingsOf(snapOf({ history: { costs: [], context: [], fiveHour } })).history
  expect([hist.fiveHourValues, hist.fiveHourHour, hist.fiveHourWindow]).toEqual([[80, 1, 3, 4], [3, 4], [1, 3, 4]])
  expect([hist.trailAlt, hist.fiveHourWindowAlt]).toEqual(['5h usage over the last hour, steady', '5h usage this window, rising'])
  const filling = readingsOf(snapOf({ history: { costs: [], context: [], fiveHour }, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 40 * MIN } })).history
  expect(filling.fiveHourWindowAlt).toBe('5h usage this window, rising, full in about 40 minutes')
  // With no window known, there is nothing since its start to draw.
  const unknown = readingsOf(snapOf({ history: { costs: [], context: [], fiveHour }, fiveHour: undefined })).history
  expect(unknown.fiveHourWindow).toEqual([])
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
test('the week names its cells in words, for a reader and a summary', () => {
  const now = 77 * HOUR
  const T = (hours: number, seven: number, five = 0) => ({ at: hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: 80 * HOUR, sevenResetAt: 168 * HOUR })
  const wk = readingsOf(snapOf({
    now, utcOffsetMin: 0,
    samples: [T(0, 0), T(15, 6), T(39, 15), T(63, 26), T(75.5, 28, 4), T(76.5, 29, 12), T(77, 30, 12)],
    sevenDay: { percentUsed: 30, resetsAt: new Date(168 * HOUR).toISOString() },
    fiveHour: { percentUsed: 12, resetsAt: new Date(80 * HOUR).toISOString(), etaMs: null },
  })).week
  expect(wk.empty).toBe(false)
  expect(wk.daysAlt).toMatch(/^weekly limit by day: \w+day 6%, \w+day 9%/)
  expect(wk.daysAlt).toMatch(/Monday about \d+%/)
  expect(wk.hoursAlt).toMatch(/^5-hour limit by hour: \d{2}:00 4%, \d{2}:00 8%, \d{2}:00 about \d+%/)
  expect(`${wk.daysAlt} ${wk.hoursAlt}`).not.toMatch(/[~↻]/)
  // Days 6, 9, 11 and 4: the third, a Saturday from the epoch's Thursday, is the busiest.
  expect(wk.summary7).toBe(`30% used · on pace for ~65% by ${fmtDayClock(168 * HOUR, 0, now)} · busiest Sat`)
  expect(wk.summary5).toBe(`12% used · on pace for ~30% by ${fmtDayClock(80 * HOUR, 0, now)}`)
})
test('a measured fill keeps its own time, with no reset clock after it', () => {
  const wk = readingsOf(snapOf({ utcOffsetMin: 0, fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } })).week
  expect(wk.summary5).toBe('84% used · full in ~40m')
})
test('a passed window says only that it reset', () => {
  const wk = readingsOf(snapOf({ now: 170 * HOUR, utcOffsetMin: 0, sevenDay: { percentUsed: 30, resetsAt: new Date(168 * HOUR).toISOString() } })).week
  expect([wk.summary7, wk.summary5]).toEqual(['reset', 'reset'])
})
test('with no samples and no pace yet, the week is not known yet', () => {
  // An hour into the window: too early for a landing, so no day is guessed either.
  const wk = readingsOf(snapOf({ now: HOUR, sevenDay: { percentUsed: 1, resetsAt: new Date(168 * HOUR).toISOString() } })).week
  expect(wk.daysAlt).toBe('weekly limit by day: not known yet')
  expect(wk.empty).toBe(true)
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
test("LIMITS' first row in departures says what each window has used", () => {
  expect(usedSoFar(readingsOf(snapOf()).limits)).toEqual(['used so far', '5h 4% · 7d 30%'])
  expect(usedSoFar(readingsOf(snapOf({ now: 4 * HOUR })).limits)).toEqual(['used so far', '5h reset · 7d 30%'])
  expect(usedSoFar([])).toBeUndefined()
})
