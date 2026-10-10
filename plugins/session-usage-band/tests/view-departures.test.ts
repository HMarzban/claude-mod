// Departures, the band as a split-flap board: the cache's flight calm and
// amber, how the line gives way as it narrows, and the board behind ▿.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderChildren } from 'claude-code'
import { drawBand } from '../hooks/band'
import { ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { HOUR, LONG, MIN, byKey, fakeEl, shown, walk, widthOf, type Node } from './helpers'
import { NO_ACT, caseKey, drawCases, snapOf, viewSuite, type Appearance, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('departures')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h', appearance: Appearance = 'dark') => {
  const trees = await drawCases($, on, { layout: 'departures', scenario, appearance, ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('warm, the cache departs in minutes, never "52M"', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/CACHE\s*DEPARTS(\s*\d{2}:\d{2})?\s*IN 1H 00 MIN/)
  expect(t).not.toMatch(/\b\d+M\b/)
})
test('the last minute is LAST CALL, with the price and no "send"', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', T160, '5m')).shut)
  expect(t).toMatch(/LAST CALL\s*30s\s*RE-WARM ~\$/)
  expect(t).not.toMatch(/send|keep warm/i)
})
test('cold, it has departed at a clock time and names the re-warm', LONG, async ($, on) => {
  expect(shown((await at($, on, 'cold', T160, '5m')).shut)).toMatch(/DEPARTED \d{2}:\d{2}\s*RE-WARM ~\$/)
})
test('working, it is boarding with no time', async ($, on) => {
  const t = shown((await at($, on, 'working')).shut)
  expect(t).toMatch(/CACHE\s*BOARDING/)
  expect(t).not.toMatch(/BOARDING\s*IN \d/)
})
test('calm, the line reads as the spec draws it', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/CACHE\s*DEPARTS(\s*\d{2}:\d{2})?\s*IN 1H 00 MIN\s*5H\s*4%\s*~\d+% AT ↻\s*7D\s*30%\s*\$2\.41/)
})
test('calm gives way in spec order: the 5h projection, the minutes, 7d, 5h as one flap, then the cost', async ($, on) => {
  // On the desktop every step shows; each width sits inside its step's band,
  // not at its edge. shown() joins flaps with no space, so `5H4%` is two flaps
  // and `5H 4%` one.
  const mounts = [120, 72, 60, 50, 45, 42].map((cols): Mount => ({ surface: 'desktop', cols }))
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [whole, noProjection, noMinutes, noSeven, fiveShort, noCost] = mounts.map(m => shown(trees[caseKey(m, 'shut')]))
  expect(whole).toMatch(/IN 1H 00 MIN\s*5H4%\s*~\d+% AT ↻\s*7D30%\s*\$2\.41/)
  expect(noProjection).toMatch(/IN 1H 00 MIN\s*5H4%\s*7D30%/)
  expect(noProjection).not.toMatch(/AT ↻/)
  expect(noMinutes).toMatch(/DEPARTS \d{2}:\d{2}\s*5H4%\s*7D30%/)
  expect(noMinutes).not.toMatch(/IN 1H/)
  expect(noSeven).toMatch(/5H4%\s*\$2\.41/)
  expect(noSeven).not.toMatch(/7D/)
  expect(fiveShort).toMatch(/5H 4%\s*\$2\.41/)
  expect(noCost).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*5H 4%$/)
})
test('at 40 columns a limit at 80% keeps its short reason once every calm piece has gone', async ($, on) => {
  expect(shown((await at($, on, 'limit80', { surface: 'terminal', cols: 40 })).shut)).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*! 5h 82%$/)
})
test('at 40 columns the context near compaction keeps its short reason', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction', { surface: 'terminal', cols: 40 })).shut)).toMatch(/^CACHE\s*DEPARTS \d{2}:\d{2}\s*! ctx \d+%$/)
})
test('at 40 columns LAST CALL keeps its seconds and lets its price go', LONG, async ($, on) => {
  const t = shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)
  expect(t).toMatch(/^CACHE\s*LAST CALL\s*30s$/)
})
test('on plain, each flap is drawn in [ ], until the line needs the room', async ($, on) => {
  const mounts = [T160, { surface: 'terminal', cols: 40 } as const]
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'calm', appearance: 'plain', ttl: '1h' }, mounts)
  const [wide, narrow] = mounts.map(m => trees[caseKey(m, 'shut')])
  expect(shown(byKey(wide, 'line', 'Box'))).toMatch(/^\[CACHE\]\[DEPARTS \d{2}:\d{2}\]\[IN 1H 00 MIN\]\[5H\]\[4%\]\[~\d+% AT ↻\]\[7D\]\[30%\]\[\$2\.41\]/)
  expect(shown(byKey(narrow, 'line', 'Box'))).not.toMatch(/[[\]]/)
  expect(shown(byKey(trees[caseKey(T160, 'open')], 'body', 'Box'))).toMatch(/\[CACHE\]\[DEPARTS \d{2}:\d{2}\]\[IN 1H 00 MIN\]/)
})
test('on plain, a flap shrinks to a cell narrower than its text, so the text truncates and its ] stays', async ($, on) => {
  // The board's cells and the strip constrain a flap; the line's pieces never shrink, so there it keeps its width.
  // Each bracket sits in a Box that never shrinks, so the text between is all that gives way.
  const flaps: Array<readonly [Node, Node, Node, Node]> = []
  walk((await at($, on, 'calm', T160, '1h', 'plain')).open, (n: Node) => {
    const [open, text, close] = (n.children ?? []) as Array<Node | undefined>
    if (n.type === 'Box' && n.children?.length === 3 && open && text && close && shown(open) === '[' && shown(close) === ']') flaps.push([n, open, text, close])
  })
  expect(flaps.length).toBeGreaterThan(0)
  for (const [f, open, text, close] of flaps) {
    expect([f.props?.flexShrink, f.props?.minWidth]).toEqual([1, 0])
    expect([open.type, open.props?.flexShrink, close.type, close.props?.flexShrink]).toEqual(['Box', 0, 'Box', 0])
    expect([text.type, text.props?.wrap]).toEqual(['Text', 'truncate-end'])
  }
})
test('a measured fill is ! FULL', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! FULL/)
})
test('82% is ! NEAR LIMIT', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/! NEAR LIMIT/)
})
test('context near compaction gets a flap of its own', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).shut)).toMatch(/! COMPACTS IN ~10K/)
})
test('open, the board has its header and every row', async ($, on) => {
  const t = shown(byKey((await at($, on, 'calm')).open, 'body', 'Box'))
  expect(t).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  for (const row of [/CACHE\s*DEPARTS/, /CONTEXT\s*\d+%/, /5H\s*~\d+% AT ↻/, /7D\s*~\d+% AT ↻/, /SPEND\s*\$/]) expect(t).toMatch(row)
})
/** A duration as the board may say it, `IN 52 MIN` or `IN 1H 00 MIN`: never `52M`, `3H 00M`, `2D 19H` or `~1H`. */
const SHORT_DURATION = /\b\d+[MD]\b|\b\d+H\b(?! \d+ MIN)/
for (const [scenario, ttl] of [['calm', '1h'], ['cold', '5m'], ['lastMinute', '5m']] as const)
  test(`open, ${scenario} at ${ttl} says no duration in short form`, LONG, async ($, on) => {
    expect(shown(byKey((await at($, on, scenario, T160, ttl)).open, 'body', 'Box'))).not.toMatch(SHORT_DURATION)
  })
/** Each board row's ITEM under the header: the text of every fixed ITEM cell after the first. */
const boardItems = (open: unknown): string[] => {
  const items: string[] = []
  walk(open, (n: Node) => {
    if (n.props?.key === 'item' && typeof n.props.width === 'number') items.push(shown(n))
  })
  return items.slice(1)
}
test('open short of rows, the board keeps CACHE first, then the amber other limit', async ($, on) => {
  // 8 rows leave the board two under its header; 6 leave one, which the amber limit takes.
  const mounts = [8, 6].map((maxRows): Mount => ({ surface: 'terminal', cols: 80, maxRows }))
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'gatewaySpend', appearance: 'dark', ttl: '1h' }, mounts)
  expect(mounts.map(m => boardItems(trees[caseKey(m, 'open')]))).toEqual([['CACHE', 'SPEND LIMIT'], ['SPEND LIMIT']])
})
test('open, the workspace heads the board on a flap', async ($, on) => {
  expect(shown((await at($, on, 'calm')).open)).toMatch(/claude-mod, branch main, clean/)
})
test('open with no limits, the board says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*NONE REPORTED/)
})
test('open with no context, the board says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*NOT REPORTED/)
})
test('open, the context near compaction reads its board words', async ($, on) => {
  expect(shown((await at($, on, 'nearCompaction')).open)).toMatch(/CONTEXT\s*! COMPACTS IN ~10K/)
})
/** How far in each header's title sits in its column's cell. */
const headInsets = (open: unknown): unknown[] =>
  ['item', 'status', 'time', 'remarks'].map(column => (byKey(byKey(open, 'head', 'Box'), column, 'Box')?.children?.[0] as Node | undefined)?.props?.paddingLeft)
test('open on the filled desktop, each header sits one cell in, over its padded flaps\' text', async ($, on) => {
  expect(headInsets((await at($, on, 'calm', D160)).open)).toEqual([1, 1, 1, 1])
})
test('open on plain, each header sits one cell in, over its bracketed flaps\' text', async ($, on) => {
  expect(headInsets((await at($, on, 'calm', D160, '1h', 'plain')).open)).toEqual([1, 1, 1, 1])
})
test('open on the filled terminal, a header sits at its column\'s edge, as an unpadded flap does', async ($, on) => {
  expect(headInsets((await at($, on, 'calm')).open)).toEqual([0, 0, 0, 0])
})
/** Each fixed board cell whose flap outgrows it: its text, its width and the cell's. */
const clipped = (open: unknown): string[] => {
  const out: string[] = []
  walk(open, (n: Node) => {
    if (typeof n.props?.width !== 'number' || !['item', 'status', 'time'].includes(String(n.props.key))) return
    const used = widthOf(n.children?.[0])
    if (used > n.props.width) out.push(`${shown(n)}: ${used} > ${n.props.width}`)
  })
  return out
}
for (const appearance of ['dark', 'plain'] as const)
  test(`open in ${appearance}, an amber status fits its cell, a flap's padding included`, async ($, on) => {
    const trees = await drawCases($, on, { layout: 'departures', scenario: 'nearCompaction', appearance, ttl: '1h' }, [T160, D160])
    for (const m of [T160, D160]) expect(clipped(trees[caseKey(m, 'open')])).toEqual([])
  })
test('open, an other limit\'s ITEM names it a limit, apart from the session\'s SPEND', async ($, on) => {
  const open = (await at($, on, 'gatewaySpend')).open
  expect(boardItems(open)).toEqual(['CACHE', 'CONTEXT', '5H', '7D', 'SPEND', 'SPEND LIMIT'])
  expect(clipped(open)).toEqual([])
})
test('open, an other limit that shares no name with the board\'s rows keeps its own ITEM', () => {
  const open = drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, expanded: true, otherLimits: [{ kind: 'weekly', percentUsed: 20, resetsAt: new Date(50 * HOUR).toISOString() }] }), NO_ACT)
  expect(boardItems(open)).toEqual(['CACHE', 'CONTEXT', '5H', '7D', 'SPEND', 'WEEKLY'])
})
/** The titles over the board's columns. */
const titles = (open: unknown): string[] => ((byKey(open, 'head', 'Box')?.children ?? []) as Node[]).map(shown)
test('open where TIME can\'t fit whole beside REMARKS\' least, the board drops the column and its words lead REMARKS', async ($, on) => {
  // On the terminal the fixed columns, REMARKS' 14 cells and their gaps take 62: a lineRoom of 62 at 68 columns, 61 at 67.
  const mounts = [68, 67].map((cols): Mount => ({ surface: 'terminal', cols }))
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'calm', appearance: 'dark', ttl: '1h' }, mounts)
  const [fits, narrow] = mounts.map(m => trees[caseKey(m, 'open')])
  expect(titles(fits)).toEqual(['ITEM', 'STATUS', 'TIME', 'REMARKS'])
  expect(titles(narrow)).toEqual(['ITEM', 'STATUS', 'REMARKS'])
  const remarks = (open: unknown, row: string) => shown(byKey(byKey(byKey(open, 'body', 'Box'), row, 'Box'), 'remarks', 'Box'))
  expect(remarks(fits, 'cache')).not.toMatch(/IN 1H/)
  expect(remarks(narrow, 'cache')).toMatch(/^IN 1H 00 MIN · RE-WARM/)
  expect(remarks(narrow, '5H')).toMatch(/^↻ \d{2}:\d{2} · 4% USED/)
})
test('open on a narrow board in the last minute, REMARKS leads with the seconds as TIME draws them', LONG, async ($, on) => {
  const open = (await at($, on, 'lastMinute', { surface: 'terminal', cols: 50 }, '5m')).open
  expect(shown(byKey(byKey(byKey(open, 'body', 'Box'), 'cache', 'Box'), 'remarks', 'Box'))).toMatch(/^30s · RE-WARM/)
})
/** At 40 columns a single amber reason stays whole, and the line within its room. */
const T40: Mount = { surface: 'terminal', cols: 40 }
for (const appearance of ['dark', 'plain'] as const)
  for (const [scenario, ttl, amber] of [
    ['limit80', '1h', /! 5h 82%$/],
    ['nearCompaction', '1h', /! ctx \d+%$/],
    ['fiveHourAhead', '1h', /! 5h ~1h$/],
    ['lastMinute', '5m', /LAST CALL\s*30s$/],
    ['coldLimit80', '5m', /! 5h 82%$/],
  ] as const)
    test(`${appearance} at 40 columns, ${scenario} keeps its amber whole within the line's room`, LONG, async ($, on) => {
      const line = byKey((await at($, on, scenario, T40, ttl, appearance)).shut, 'line', 'Box')
      expect(shown(line)).toMatch(amber)
      expect(cellsOf(line as RenderChildren, TERMINAL)).toBeLessThanOrEqual(T40.cols - ROW_SLACK - 2)
    })
for (const appearance of ['dark', 'plain'] as const)
  test(`${appearance} at 40 columns, a cold cache lets the time it went cold go and keeps its price`, LONG, async ($, on) => {
    const line = byKey((await at($, on, 'cold', T40, '5m', appearance)).shut, 'line', 'Box')
    expect(shown(line)).toMatch(/^\[?CACHE\]?\[?DEPARTED\]?\[?RE-WARM ~\$\d+\.\d{2}\]?$/)
    expect(cellsOf(line as RenderChildren, TERMINAL)).toBeLessThanOrEqual(T40.cols - ROW_SLACK - 2)
  })
test('cold, the 5h flap gives way before the time the cache went cold', LONG, async ($, on) => {
  // The cold line keeps its clock while it fits, 38 cells of a lineRoom of 40 at 46 columns; with `5H 4%` it is 44.
  const line = shown(byKey((await at($, on, 'cold', { surface: 'terminal', cols: 46 }, '5m')).shut, 'line', 'Box'))
  expect(line).toMatch(/^CACHE\s*DEPARTED \d{2}:\d{2}\s*RE-WARM ~\$\d+\.\d{2}$/)
})
/** With no UTC offset there is no clock time, so the minutes give way at the last calm step instead. */
for (const [scenario, over, amber] of [
  ['limit80', { fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }, /! 5h 82%$/],
  ['nearCompaction', { context: { tokens: 150_000, window: 200_000, percent: 75, compactAt: 160_000, autoCompactOff: false } }, /! ctx \d+%$/],
  ['fiveHourAhead', { fiveHour: { percentUsed: 40, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: HOUR } }, /! 5h ~1h$/],
] as const)
  test(`at 40 columns with no UTC offset, ${scenario} keeps its amber whole within the line's room`, () => {
    const line = byKey(drawBand(fakeEl, snapOf({ layout: 'departures', columns: 40, ...over }), NO_ACT), 'line', 'Box')
    expect(shown(line)).toMatch(amber)
    expect(cellsOf(line as RenderChildren, TERMINAL)).toBeLessThanOrEqual(T40.cols - ROW_SLACK - 2)
  })
test('open with no UTC offset, a limit\'s TIME says its reset in minutes, as the cache\'s does', () => {
  const t = shown(byKey(drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, expanded: true }), NO_ACT), 'body', 'Box'))
  expect(t).toMatch(/5H\s*~\d+% AT ↻\s*IN 3H 00 MIN/)
  expect(t).toMatch(/7D\s*~\d+% AT ↻\s*IN 67H 00 MIN/)
  expect(t).not.toMatch(SHORT_DURATION)
})
test('open with no UTC offset, a measured fill\'s STATUS says when in board minutes and fits its cell', () => {
  // A fill lands before its 5h reset, so `~4H 45 MIN` is as wide as its projection gets.
  const open = byKey(drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, expanded: true, fiveHour: { percentUsed: 40, resetsAt: new Date(5 * HOUR).toISOString(), etaMs: 285 * MIN } }), NO_ACT), 'body', 'Box')
  expect(shown(open)).toMatch(/5H\s*! FULL IN ~4H 45 MIN/)
  expect(shown(open)).not.toMatch(SHORT_DURATION)
  expect(clipped(open)).toEqual([])
})
test('open, a 1M window\'s ! COMPACTS IN ~100K fits its STATUS cell', () => {
  const open = byKey(drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, expanded: true, context: { tokens: 900_000, window: 1_000_000, percent: 90, compactAt: 1_000_000, autoCompactOff: false } }), NO_ACT), 'body', 'Box')
  expect(shown(open)).toMatch(/CONTEXT\s*! COMPACTS IN ~100K/)
  expect(clipped(open)).toEqual([])
})
test('open with a body of one row, the board drops its header for what needs you', async ($, on) => {
  const open = shown((await at($, on, 'gatewaySpend', { surface: 'terminal', cols: 80, maxRows: 5 })).open)
  expect(open).toMatch(/SPEND LIMIT\s*! NEAR LIMIT/)
  expect(open).not.toMatch(/ITEM/)
})
test('open, compaction not known yet says nothing of it', LONG, async ($, on) => {
  // Calm reads no breakdown: compaction is unknown, not off.
  expect(shown((await at($, on, 'calm')).open)).not.toMatch(/AUTO-COMPACTION/)
})
test('open, the board says auto-compaction is off when the engine says so', LONG, async ($, on) => {
  expect(shown((await at($, on, 'compactionOff')).open)).toMatch(/AUTO-COMPACTION OFF/)
})
test('in ascii, a landing and a fill before the reset keep their noun', LONG, async ($, on) => {
  const trees = await drawCases($, on, { layout: 'departures', scenario: 'calm', appearance: 'dark', ttl: '1h', env: { CC_BAND_GLYPHS: 'ascii' } }, [T160])
  const shut = shown(trees[caseKey(T160, 'shut')])
  expect(shut).toMatch(/~\d+% AT RESET/)
  expect(shut).not.toMatch(/\bAT\b(?! RESET)/)
})
for (const [scenario, amber] of [
  ['calm', /\$2\.41/],
  ['limit80', /! 5h 82%$/],
  ['nearCompaction', /! ctx \d+%$/],
] as const)
  test(`in ascii at 40 columns, ${scenario} stays within the line's room`, LONG, async ($, on) => {
    const trees = await drawCases($, on, { layout: 'departures', scenario, appearance: 'dark', ttl: '1h', env: { CC_BAND_GLYPHS: 'ascii' } }, [T40])
    const line = byKey(trees[caseKey(T40, 'shut')], 'line', 'Box')
    expect(shown(line)).toMatch(amber)
    expect(cellsOf(line as RenderChildren, TERMINAL)).toBeLessThanOrEqual(T40.cols - ROW_SLACK - 2)
  })
