import { test, expect } from 'claude-code/testing'
import { fmtClock, fmtDayClock } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
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
test("chips' card keeps its own pace tail", () => {
  expect(readingsOf(snapOf()).chips.reading.windows.map(w => w.cardPace)).toEqual([' · on pace for ~10%', ' · on pace for ~50%'])
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
  expect(r.chips.reading.windows[0]?.cardPace).toBe(' · full in ~40m')
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
  expect([c.board, c.boardLeft]).toEqual(['DEPARTS', 'IN 52 MIN'])
  expect(c.alt).toBe('cache 52 minutes left, warm')
  expect([c.hitFrac, c.hitText, c.savedText, c.lastsText]).toEqual([0.96, '96%', '~$11.40', '1h idle'])
  expect(c.coldInMs).toBe(52 * MIN)
})
test('in its last minute the cache is amber, long and short', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(47_000) })).cache
  expect(c.condition).toBe('cooling')
  expect(c.amber).toEqual({ long: '! 47s left · re-warm ~$1.66', short: '! 47s' })
  expect([c.board, c.boardLeft]).toEqual(['LAST CALL', '47s'])
})
test('working, the cache shows no countdown', () => {
  const c = readingsOf(snapOf({ isWorking: true })).cache
  expect([c.text, c.board, c.left]).toEqual(['cache warm', 'BOARDING', ''])
  expect(c.coldInMs).toBeUndefined()
})
test('working, an expiring cache still counts down', () => {
  const c = readingsOf(snapOf({ isWorking: true, cache: cacheAt(47_000) })).cache
  expect(c.coldInMs).toBe(47_000)
  expect([c.condition, c.board]).toEqual(['cooling', 'LAST CALL'])
  expect(c.amber).toBeDefined()
})
test('cold is a price', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(0), utcOffsetMin: 0 })).cache
  expect([c.text, c.textShort, c.reWarmText, c.board]).toEqual(['cache cold · re-warm ~$1.66', 'cold ~$1.66', 'next message ~$1.66', 'DEPARTED'])
  expect(c.alt).toBe('cache cold, re-warm about $1.66')
  // A cold cache's time left is 0, so the snapshot doesn't say yet when it went cold.
  expect(c.coldSinceClock).toBeUndefined()
})
test('an hour left is said in full, on the board and to a reader', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(60 * MIN) })).cache
  expect(c.boardLeft).toBe('IN 1H 00 MIN')
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
  expect(r.fiveHour?.boardAmber).toBe('! NEAR LIMIT')
  expect([r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.resetInMs]).toEqual(['resets in 3h 00m', '↻ in 3h 00m', 3 * HOUR])
  expect([r.sevenDay?.projectedText, r.sevenDay?.pace, r.sevenDay?.boardShort]).toEqual(['~50%', 'on pace for ~50%', '~50% AT ↻'])
  expect(Math.abs((r.sevenDay?.projectedFrac ?? 0) - 30 / (1 - 67 / 168) / 100)).toBeLessThan(1e-5)
})
test('a measured fill is an estimate, with ~, in words and on the board', () => {
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 84, resetsAt: new Date(now + 70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  const at = fmtClock(now + 40 * MIN, 0)
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock, r.fiveHour?.boardAmber]).toEqual(['~40m', `~${at}`, `! FULL ~${at}`])
  expect(r.fiveHour?.amber).toEqual({ long: '! 5h full in ~40m', short: '! 5h ~40m' })
  expect(r.fiveHour?.alt).toBe('5h limit 84 percent used, needs attention, full in about 40 minutes')
})
test('a landing at or over 100% is full before reset, never ~112%', () => {
  const r = readingsOf(snapOf({ sevenDay: { percentUsed: 79, resetsAt: new Date(50 * HOUR).toISOString() } }))
  expect(r.sevenDay?.projectedPct ?? 0).toBeGreaterThan(100)
  expect([r.sevenDay?.tone, r.sevenDay?.pace, r.sevenDay?.projectedText, r.sevenDay?.boardShort]).toEqual(['calm', 'full before reset', undefined, 'FULL BEFORE ↻'])
  expect(r.sevenDay?.alt).toBe('7d limit 79 percent used, fine, full before its reset')
})
test('a measured fill lands at 100, so it too is full before reset', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  expect([r.fiveHour?.projectedText, r.fiveHour?.boardShort]).toEqual([undefined, 'FULL BEFORE ↻'])
})
test('a passed window has no reset words', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR }))
  expect([r.fiveHour?.text, r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.boardShort]).toEqual(['5h reset', undefined, undefined, 'RESET'])
})
test('a passed window has no fill time', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 0 } }))
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock, r.fiveHour?.projectedFrac]).toEqual([undefined, undefined, undefined])
  expect(r.fiveHour?.alt).not.toMatch(/full in/)
})
test('context speaks toward compaction, or of the window when it is off', () => {
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000, autoCompactOff: false } })).context
  expect(near.amber).toEqual({ long: '! context 93% · compacts in ~14k', short: '! ctx 93%' })
  expect([near.boardAmber, near.towardText, near.roomText]).toEqual(['! COMPACTS IN ~14K', 'toward compaction', '~14k'])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined, autoCompactOff: true } })).context
  expect([off.amber?.long, off.boardAmber, off.towardText, off.compactionOffText]).toEqual(['! context 85%', '! CONTEXT 85%', 'of the window', 'auto-compaction off'])
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
