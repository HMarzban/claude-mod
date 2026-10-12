// The band's times in every zone: each instant read under the offset in
// force at it, across daylight-saving changes, as a person there reads their
// clock. Pure tests inject their zones, so they hold whatever the host's;
// the mounted one follows the host's own.

import { test, expect } from 'claude-code/testing'
import { drawBand, layoutAt } from '../hooks/band'
import { weekOf } from '../hooks/calendar'
import { dayOf, fixedZone, hostZone, midnightOf, type Zone } from '../hooks/format'
import type { Sample } from '../hooks/memory'
import { readingsOf } from '../hooks/reading'
import { LAYOUT_NAMES, type BandSnapshot } from '../hooks/snapshot'
import { DEFAULT_MAX_ROWS, HOUR, LONG, MIN, MODERN, START, USAGE, fact, fakeEl, hostClock, mountBand, setup, usageAt, type Node } from './helpers'
import { NO_ACT, invariantErrors, snapOf } from './matrix'

const at = Date.parse
/** A zone from its first offset and each change after, `[from, offset]`, oldest first. */
const stepped =
  (first: number, ...changes: ReadonlyArray<readonly [string, number]>): Zone =>
  ms =>
    changes.reduce((offset, [from, to]) => (ms >= at(from) ? to : offset), first)

// The real changes of 2026 and early 2027, at their UTC instants.
const NEW_YORK = stepped(-300, ['2026-03-08T07:00Z', -240], ['2026-11-01T06:00Z', -300], ['2027-03-14T07:00Z', -240])
const LONDON = stepped(0, ['2026-03-29T01:00Z', 60], ['2026-10-25T01:00Z', 0])
const BERLIN = stepped(60, ['2026-03-29T01:00Z', 120], ['2026-10-25T01:00Z', 60])
const SYDNEY = stepped(660, ['2026-04-04T16:00Z', 600], ['2026-10-03T16:00Z', 660])
const LORD_HOWE = stepped(660, ['2026-04-04T15:00Z', 630], ['2026-10-03T15:30Z', 660])
// Midnight itself skipped: Santiago-like to the west, Beirut-like to the east.
const SANTIAGO = stepped(-240, ['2026-09-06T04:00Z', -180])
const BEIRUT = stepped(120, ['2026-03-28T22:00Z', 180])
// Midnight itself twice: Amman's fall back of 2021, 01:00 to 00:00.
const AMMAN = stepped(180, ['2021-10-28T22:00Z', 120])

/** The readings at `now` in `zone`, with the 5h and 7d resetting at the instants given. */
const readAt = (now: string, zone: Zone, over: Partial<BandSnapshot> & { fiveAt?: string; sevenAt?: string; five?: number; seven?: number; etaMs?: number | null } = {}) => {
  const { fiveAt, sevenAt, five = 4, seven = 30, etaMs = null, ...rest } = over
  return readingsOf(snapOf({
    now: at(now),
    zone,
    fiveHour: fiveAt === undefined ? undefined : { percentUsed: five, resetsAt: fiveAt, etaMs },
    sevenDay: sevenAt === undefined ? undefined : { percentUsed: seven, resetsAt: sevenAt },
    ...rest,
  }))
}

// ---- the zone matrix ---------------------------------------------------------

// Thu 2026-10-08 12:00 UTC; the 5h resets at 15:00 UTC, the 7d Sun 07:00 UTC.
const NOON = '2026-10-08T12:00Z'
/** Per zone: the 5h reset, the 7d reset, cold at (52 minutes on), the first
 *  hour's start, today, and the week's first and last days, as read there. */
const MATRIX: ReadonlyArray<readonly [number, string, string, string, string, string, string]> = [
  [-720, '03:00', 'Sat 19:00', '00:52', '22:00', 'Thursday 8', 'S4…S10'],
  [-570, '05:30', 'Sat 21:30', '03:22', '00:30', 'Thursday 8', 'S4…S10'],
  [-300, '10:00', 'Sun 02:00', '07:52', '05:00', 'Thursday 8', 'S4…S10'],
  [-210, '11:30', 'Sun 03:30', '09:22', '06:30', 'Thursday 8', 'S4…S10'],
  [0, '15:00', 'Sun 07:00', '12:52', '10:00', 'Thursday 8', 'S4…S10'],
  [60, '16:00', 'Sun 08:00', '13:52', '11:00', 'Thursday 8', 'S4…S10'],
  [330, '20:30', 'Sun 12:30', '18:22', '15:30', 'Thursday 8', 'M5…S11'],
  [345, '20:45', 'Sun 12:45', '18:37', '15:45', 'Thursday 8', 'M5…S11'],
  [570, 'Fri 00:30', 'Sun 16:30', '22:22', '19:30', 'Thursday 8', 'M5…S11'],
  [765, '03:45', 'Sun 19:45', '01:37', '22:45', 'Friday 9', 'M5…S11'],
  [840, '05:00', 'Sun 21:00', '02:52', '00:00', 'Friday 9', 'M5…S11'],
]
for (const [offset, five, seven, cold, firstHour, today, days] of MATRIX) {
  test(`at UTC${offset < 0 ? '' : '+'}${offset / 60}, each clock and day reads as it does there`, () => {
    const r = readAt(NOON, fixedZone(offset), { fiveAt: '2026-10-08T15:00Z', sevenAt: '2026-10-11T07:00Z' })
    expect([r.fiveHour?.resetClock, r.sevenDay?.resetClock, r.cache.bandWords.find(w => w.startsWith('cold at'))]).toEqual([five, seven, `cold at ${cold}`])
    const wk = r.week
    expect(wk.hours[0]?.startClock).toBe(firstHour)
    expect(wk.days.filter(d => d.today).map(d => `${d.name} ${d.date}`)).toEqual([today])
    expect(`${wk.days[0]?.initial}${wk.days[0]?.date}…${wk.days[6]?.initial}${wk.days[6]?.date}`).toBe(days)
  })
}

// ---- across a daylight-saving change -----------------------------------------

test("the 7d reset says the clock in force at the reset, not at now's offset", () => {
  // New York, Thu 10:00 EDT: the reset Monday is past the fall back, 14:00 EST.
  expect(readAt('2026-10-29T14:00Z', NEW_YORK, { sevenAt: '2026-11-02T19:00Z' }).sevenDay?.resetClock).toBe('Mon 14:00')
  // London, BST to GMT: Tuesday 09:00.
  expect(readAt('2026-10-22T12:00Z', LONDON, { sevenAt: '2026-10-27T09:00Z' }).sevenDay?.resetClock).toBe('Tue 09:00')
  // Sydney in April, AEDT to AEST, and in October, back.
  expect(readAt('2026-04-02T00:00Z', SYDNEY, { sevenAt: '2026-04-06T00:00Z' }).sevenDay?.resetClock).toBe('Mon 10:00')
  expect(readAt('2026-10-01T00:00Z', SYDNEY, { sevenAt: '2026-10-05T00:00Z' }).sevenDay?.resetClock).toBe('Mon 11:00')
  // Lord Howe moves half an hour.
  expect(readAt('2026-04-02T00:00Z', LORD_HOWE, { sevenAt: '2026-04-06T00:00Z' }).sevenDay?.resetClock).toBe('Mon 10:30')
})
test('on the night the clocks change, cold at says the clock that will show', () => {
  // New York falls back at 02:00 EDT: 01:28 EDT and 52 minutes is 01:20 EST.
  expect(readAt('2026-11-01T05:28Z', NEW_YORK).cache.bandWords.find(w => w.startsWith('cold at'))).toBe('cold at 01:20')
  // And springs forward at 02:00 EST: 01:28 EST and 52 minutes is 03:20 EDT.
  expect(readAt('2026-03-08T06:28Z', NEW_YORK).cache.bandWords.find(w => w.startsWith('cold at'))).toBe('cold at 03:20')
  // Berlin, 02:30 CEST: the 5h reset and cold at, both past the fall back.
  const berlin = readAt('2026-10-25T00:30Z', BERLIN, { fiveAt: '2026-10-25T04:30Z' })
  expect([berlin.fiveHour?.resetClock, berlin.cache.bandWords.find(w => w.startsWith('cold at'))]).toEqual(['05:30', 'cold at 02:22'])
})
test('the 5h hours are named by the clock at each start: 01 twice falling back, no 02 springing forward', () => {
  const five = (resetsAt: string) => ({ percentUsed: 4, projectedPct: 10, resetsAt: at(resetsAt) })
  const fall = weekOf({ samples: [], seven: undefined, five: five('2026-11-01T08:30Z'), now: at('2026-11-01T05:30Z'), zone: NEW_YORK })
  expect(fall.hours.map(c => c.label)).toEqual(['23', '00', '01', '01', '02'])
  expect(fall.hours.map(c => c.startClock)).toEqual(['23:30', '00:30', '01:30', '01:30', '02:30'])
  const spring = weekOf({ samples: [], seven: undefined, five: five('2026-03-08T09:30Z'), now: at('2026-03-08T06:15Z'), zone: NEW_YORK })
  expect(spring.hours.map(c => c.startClock)).toEqual(['23:30', '00:30', '01:30', '03:30', '04:30'])
})

// New York, the week of the fall back: Tue 27 15:00 EDT to Tue Nov 3 14:00 EST.
const FALL_RESET = at('2026-11-03T19:00Z')
const fallSample = (iso: string, sevenPct: number): Sample => ({ at: at(iso), fivePct: 0, sevenPct, fiveResetAt: at(iso) + HOUR, sevenResetAt: FALL_RESET })
const FALL_SAMPLES = [
  fallSample('2026-10-29T01:00Z', 2), // Wed 21:00 EDT
  fallSample('2026-10-29T20:00Z', 4), // Thu 16:00
  fallSample('2026-10-30T03:30Z', 6), // Thu 23:30
  fallSample('2026-10-30T04:30Z', 11), // Fri 00:30
  fallSample('2026-10-30T20:00Z', 12), // Fri 16:00
  fallSample('2026-10-31T16:00Z', 13), // Sat 12:00
  fallSample('2026-11-01T04:30Z', 14), // Sun 00:30 EDT
  fallSample('2026-11-02T04:30Z', 15), // Sun 23:30 EST, in the 25-hour Sunday
  fallSample('2026-11-02T14:00Z', 18), // Mon 09:00 EST
]
const fallWeek = (now: string) =>
  weekOf({ samples: FALL_SAMPLES.filter(s => s.at <= at(now)), seven: { percentUsed: 18, projectedPct: 30, resetsAt: FALL_RESET }, five: undefined, now: at(now), zone: NEW_YORK })
const cellsOf = (wk: ReturnType<typeof weekOf>) => wk.days.map(d => `${d.initial}${d.date} ${d.text}`)
test("each day's rise sits in that day's own cell, the 25-hour day whole, the same on every draw", () => {
  const friday = fallWeek('2026-10-30T22:00Z') // Fri 18:00 EDT
  const monday = fallWeek('2026-11-02T15:00Z') // Mon 10:00 EST
  expect(cellsOf(friday).slice(0, 3)).toEqual(['W28 2%', 'T29 4%', 'F30 6%'])
  expect(cellsOf(monday).slice(0, 6)).toEqual(['W28 2%', 'T29 4%', 'F30 6%', 'S31 1%', 'S1 2%', 'M2 3%'])
  expect([friday.busiest, monday.busiest]).toEqual(['Fri', 'Fri'])
})
test("today's notch is as far into a 25-hour day as it has gone", () => {
  // Sun Nov 1 12:00 EST: 13 of the day's 25 hours.
  const wk = readingsOf(snapOf({ now: at('2026-11-01T17:00Z'), zone: NEW_YORK, sevenDay: { percentUsed: 14, resetsAt: new Date(FALL_RESET).toISOString() } })).week
  expect(wk.days.map(d => d.date)).toEqual(['28', '29', '30', '31', '1', '2', '3'])
  expect(Math.abs((wk.dayRow.notch ?? 0) - (4 + 13 / 25))).toBeLessThan(1e-9)
})
test('a week spring forward holds nine slices, folds to seven, and keeps each date in its cell', () => {
  // New York: the reset Sun 2027-03-21 00:30 EDT leaves half an hour at each
  // end, and the 23-hour Sunday the 14th between.
  const reset = at('2027-03-21T04:30Z')
  const sample = (iso: string, sevenPct: number): Sample => ({ at: at(iso), fivePct: 0, sevenPct, fiveResetAt: at(iso) + HOUR, sevenResetAt: reset })
  const samples = [
    sample('2027-03-14T04:45Z', 1), // Sat 13 23:45 EST, the part folded into Sunday
    sample('2027-03-15T03:30Z', 5), // Sun 14 23:30 EDT
    sample('2027-03-15T04:30Z', 11), // Mon 15 00:30 EDT
    sample('2027-03-16T00:00Z', 12), // Mon 15 20:00
    sample('2027-03-17T02:00Z', 20), // Tue 16 22:00
  ]
  const weekAt = (now: string) =>
    weekOf({ samples: samples.filter(s => s.at <= at(now)), seven: { percentUsed: 20, projectedPct: 40, resetsAt: reset }, five: undefined, now: at(now), zone: NEW_YORK })
  // Sun 14 01:00 EST, before the change, and Wed 17 noon EDT, after it.
  const early = weekAt('2027-03-14T06:00Z')
  const later = weekAt('2027-03-17T16:00Z')
  // And inside each end's half hour: Sat 13 23:45 EST and Sun 21 00:15 EDT.
  const first = weekAt('2027-03-14T04:45Z')
  const last = weekAt('2027-03-21T04:15Z')
  for (const wk of [early, later, first, last]) expect(wk.days.map(d => `${d.initial}${d.date}`)).toEqual(['S14', 'M15', 'T16', 'W17', 'T18', 'F19', 'S20'])
  expect([early, first, last].map(wk => wk.days.filter(d => d.today).map(d => d.name))).toEqual([['Sunday'], ['Sunday'], ['Saturday']])
  expect(cellsOf(later).slice(0, 3)).toEqual(['S14 5%', 'M15 7%', 'T16 8%'])
  expect(later.busiest).toBe('Tue')
})
test('a day whose midnight is skipped starts where the gap ends, to the west and the east', () => {
  for (const [zone, noon, gapEnd] of [[SANTIAGO, '2026-09-06T16:00Z', '2026-09-06T04:00Z'], [BEIRUT, '2026-03-29T10:00Z', '2026-03-28T22:00Z']] as const) {
    const day = dayOf(at(noon), zone)
    const midnight = midnightOf(day, zone)
    expect(new Date(midnight).toISOString()).toBe(new Date(at(gapEnd)).toISOString())
    expect([dayOf(midnight, zone), dayOf(midnight - 1, zone)]).toEqual([day, day - 1])
  }
  // And a day with its midnight whole, east and west of UTC.
  for (const zone of [NEW_YORK, LORD_HOWE, fixedZone(-570), fixedZone(825)]) {
    const day = dayOf(at('2026-11-01T12:00Z'), zone)
    expect([dayOf(midnightOf(day, zone), zone), dayOf(midnightOf(day, zone) - 1, zone)]).toEqual([day, day - 1])
  }
})
test('a day whose midnight comes twice starts at the first', () => {
  const day = dayOf(at('2021-10-29T10:00Z'), AMMAN)
  const midnight = midnightOf(day, AMMAN)
  expect(new Date(midnight).toISOString()).toBe('2021-10-28T21:00:00.000Z')
  expect([dayOf(midnight, AMMAN), dayOf(midnight - 1, AMMAN)]).toEqual([day, day - 1])
})

// ---- the week's words and the reset beside them ---------------------------------

test("a reset a week out on today's weekday says next, as a fill there does", () => {
  // Sat 14:00, half an hour after the weekly reset: the next is 6d 23h 30m on.
  const r = readAt('2026-10-17T14:00Z', fixedZone(0), { sevenAt: '2026-10-24T13:30Z', seven: 1 })
  expect(r.sevenDay?.resetClock).toBe('next Sat 13:30')
  expect(r.sevenDay?.resetAtGlyph).toBe('↻ next Sat 13:30')
})
test('the longest reset and fill words fit every layout at every width, shut and open, in either tier', () => {
  // Sat 14:00, the reset next Saturday; Sat 23:00 at 6%, the fill next Saturday too.
  const filling = readAt('2026-10-17T23:00Z', fixedZone(0), { sevenAt: '2026-10-24T13:30Z', seven: 6 })
  expect([filling.sevenDay?.resetClock, filling.sevenDay?.fillAt]).toEqual(['next Sat 13:30', '~next Sat'])
  for (const [iso, seven] of [['2026-10-17T14:00Z', 1], ['2026-10-17T23:00Z', 6]] as const)
    for (const layout of LAYOUT_NAMES)
      // The ascii tier says `resets` for `↻`: its longest, `resets next Sat 13:30`.
      for (const [surface, glyphs] of [['terminal', 'unicode'], ['desktop', 'unicode'], ['terminal', 'ascii']] as const)
        for (const cols of [40, 41, 50, 60, 67, 68, 80, 95, 120])
          for (const expanded of [false, true]) {
            const now = at(iso)
            const tree = drawBand(fakeEl, snapOf({
              layout, surface, glyphs, columns: cols, expanded, maxRows: DEFAULT_MAX_ROWS, now, zone: fixedZone(0),
              fiveHour: { percentUsed: 4, resetsAt: new Date(now + 3 * HOUR).toISOString(), etaMs: null },
              sevenDay: { percentUsed: seven, resetsAt: '2026-10-24T13:30Z' },
            }), NO_ACT) as unknown as Node
            // Held to the rules of the layout drawn there: chips below departures' 60.
            const errors = invariantErrors(tree, { layout: layoutAt(layout, cols), surface, appearance: 'dark', cols, maxRows: DEFAULT_MAX_ROWS, scenario: 'calm', glyphs, expanded })
            const key = `${iso} ${layout} ${surface} ${glyphs} ${cols} ${expanded ? 'open' : 'shut'}`
            expect(`${key}: ${errors.join('; ')}`).toBe(`${key}: `)
          }
})
test('a 5h fill past midnight says its day and its clock, as its reset does', () => {
  // +03:30, Sat 23:00: full Sun 01:00, before the reset at Sun 02:00.
  const r = readAt('2026-10-17T19:30Z', fixedZone(210), { fiveAt: '2026-10-17T22:30Z', five: 50, etaMs: 2 * HOUR })
  expect([r.fiveHour?.fillAt, r.fiveHour?.resetClock]).toEqual(['~Sun 01:00', 'Sun 02:00'])
})
test("the week's fill day is the forecast's, today included", () => {
  // UTC-8, Sat 09:30, 9 hours into the window at 60%: the average fills it today at 15:30.
  const today = readAt('2026-10-17T17:30Z', fixedZone(-480), { sevenAt: '2026-10-24T08:30Z', seven: 60 })
  expect(today.sevenDay?.fillAt).toBe('~15:30')
  expect(today.week.dayRow.marks[0]?.kind).toBe('fills')
  // UTC, Wed noon, a fill at Sat 01:30 in the Friday cell Saturday's morning folds into.
  const folded = readAt('2026-10-21T12:00Z', fixedZone(0), { sevenAt: '2026-10-24T06:00Z', seven: 62.4 })
  expect(folded.sevenDay?.fillAt).toBe('~Sat')
})
test('a window under a second from its reset still reads its use, not reset', () => {
  const r = readAt('2026-10-17T13:59:59.400Z', fixedZone(0), { fiveAt: '2026-10-17T14:00:00.000Z', five: 97 })
  expect([r.fiveHour?.value, r.fiveHour?.passed, r.fiveHour?.reset]).toEqual(['97%', false, { kind: 'in', text: '<1m' }])
})

// ---- on the engine -------------------------------------------------------------

/** The first minute of this host's last change of offset in [from, to);
 *  undefined where it has none. */
const lastHostChange = (from: number, to: number): number | undefined => {
  let hour: number | undefined
  for (let t = from + HOUR; t < to; t += HOUR) if (hostZone(t) !== hostZone(t - HOUR)) hour = t
  if (hour === undefined) return undefined
  let t = hour - HOUR
  while (hostZone(t) === hostZone(hour - HOUR)) t += MIN
  return t
}
test('idle, with no reply, the band reads each clock in the zone in force as the clock moves on', LONG, async ($, on) => {
  // A host's last change of offset since 2015, approached from ten minutes
  // before; a host with none, such as UTC, walks a plain day and holds as is.
  const change = lastHostChange(Date.UTC(2015, 0, 1), Date.UTC(2030, 0, 1))
  const start = (change ?? MODERN) - 10 * MIN
  const resetAt = start + 5 * HOUR
  const usage = usageAt(start, { ...USAGE, rateLimits: [...USAGE.rateLimits, { kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] })
  const clock = setup(on, { usage, now: start })
  await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), 'resets')).toBe(hostClock(resetAt, start))
  await clock.advance(20 * MIN)
  expect(fact(await ui.drawn(), 'resets')).toBe(hostClock(resetAt, start + 20 * MIN))
  await ui.unmount()
})
