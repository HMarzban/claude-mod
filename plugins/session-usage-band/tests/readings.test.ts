import { test, expect } from 'claude-code/testing'
import { fmtClock } from '../hooks/format'
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
  const c = readingsOf(snapOf({ cache: cacheAt(-MIN) })).cache
  expect([c.text, c.textShort, c.reWarmText, c.board]).toEqual(['cache cold · re-warm ~$1.66', 'cold ~$1.66', 'next message ~$1.66', 'DEPARTED'])
  expect(c.alt).toBe('cache cold, re-warm about $1.66')
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
test('a passed window has no reset words', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR }))
  expect([r.fiveHour?.text, r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.boardShort]).toEqual(['5h reset', undefined, undefined, 'RESET'])
})
test('a passed window has no fill time', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR, fiveHour: { percentUsed: 84, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: 0 } }))
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock]).toEqual([undefined, undefined])
  expect(r.fiveHour?.alt).not.toMatch(/full in/)
})
test('context speaks toward compaction, or of the window when it is off', () => {
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000 } })).context
  expect(near.amber).toEqual({ long: '! context 93% · compacts in ~14k', short: '! ctx 93%' })
  expect([near.boardAmber, near.towardText, near.roomText]).toEqual(['! COMPACTS IN ~14K', 'toward compaction', '~14k'])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined } })).context
  expect([off.amber?.long, off.boardAmber, off.towardText]).toEqual(['! context 85%', '! CONTEXT 85%', 'of the window'])
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
