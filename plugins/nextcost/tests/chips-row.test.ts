// Chips' row, mounted: one line of pills that never shrink, their colours
// and labels, and what gives way as it narrows.

import { test, expect } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  BUILD_100K,
  DESKTOP_START,
  TURN_DONE,
  TURN_START,
  BUILD_155K,
  LONG,
  USAGE,
  START,
  MIN,
  HOUR,
  respond,
  usage,
  textOf,
  walk,
  rowCount,
  widthOf,
  firstRow,
  pillOf,
  shown,
  turn,
  pacing,
  fact,
  setup,
  mountBand,
  type Node,
} from './helpers'

test('the collapsed band is one row', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)

  const ui = await mountBand($, 'terminal', 110)
  expect(rowCount(await ui.drawn())).toBe(1)
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /76k \/ 200k/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\b4%/ })).toBeDefined()
  await ui.unmount()
})

test('chips never shrink, so their text never wraps', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'desktop', 95)
  const pills = ((firstRow(await ui.drawn()) as Node).children ?? []).filter(k => (k as Node).props?.key !== undefined && ['cache', 'cost', 'tokens', 'ctx', '5h', '7d'].includes(String((k as Node).props?.key)))
  expect(pills.length).toBeGreaterThan(3)
  for (const p of pills) expect((p as Node).props?.flexShrink).toBe(0)
  await ui.unmount()
})

test('pills carry their own foreground and background, never one of each', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)

  const ui = await mountBand($, 'terminal', 110)
  let pills = 0
  walk(await ui.drawn(), n => {
    const bg = n.props?.backgroundColor
    if (typeof bg !== 'string') return
    pills += 1
    expect(bg.startsWith('#')).toBe(true)
    walk(n, t => {
      if (t.type === 'Text' && typeof t.props?.color === 'string') expect(t.props.color.startsWith('#')).toBe(true)
    })
  })
  expect(pills).toBeGreaterThan(2)
  await ui.unmount()
})

test('the calm band uses no amber', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)

  const ui = await mountBand($, 'terminal', 110)
  walk(await ui.drawn(), n => {
    expect(n.props?.color).not.toBe(DARK.amberFg)
    expect(n.props?.backgroundColor).not.toBe(DARK.amberBg)
  })
  await ui.unmount()
})

test('cost, tokens and context drop their labels; the expanded line keeps last $', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await turn($, 't1', 2.0, 2.41)
  await respond($, BUILD_155K)

  const ui = await mountBand($, 'terminal', 160)
  const tree = await ui.drawn()
  expect(shown(pillOf(tree, 'cost'))).not.toMatch(/last/)
  expect(shown(pillOf(tree, 'tokens'))).not.toMatch(/tokens/)
  expect(shown(pillOf(tree, 'ctx'))).not.toMatch(/context/)
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), 'last message')).toBe('$0.41')
  await ui.unmount()
})

test('a 30-column band fits one row with cache and cost', LONG, async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'terminal', 30)
  const row = firstRow(await ui.drawn())
  expect(widthOf(row)).toBeLessThanOrEqual(30)
  expect(textOf(row)).toMatch(/cache/)
  expect(textOf(row)).toMatch(/\$2\.41/)
  await ui.unmount()
})

for (const cols of [60, 70, 84]) {
  test(`a 5h pill amber from its pace fits one row at ${cols} columns and keeps its warning`, LONG, async ($, on) => {
    const clock = setup(on)
    await pacing($, clock)
    await $.turn.start(TURN_START)
    await respond($, BUILD_155K)
    usage.current = { ...usage.current, cost: { usd: 2.83 } }
    await $.turn.complete(TURN_DONE)

    const ui = await mountBand($, 'terminal', cols)
    const row = firstRow(await ui.drawn())
    expect(widthOf(row)).toBeLessThanOrEqual(cols)
    expect(textOf(row)).toMatch(/50%.*~\d+[hm]/) // the pace warning survives
    expect(textOf(row)).toMatch(/\$2\.83/)
    await ui.unmount()
  })

  test(`an amber 5h pill fits beside an expiring cache at ${cols} columns`, LONG, async ($, on) => {
    const clock = setup(on, {
      usage: {
        ...USAGE,
        context: { tokens: 120_000, window: 200_000, percent: 60 },
        rateLimits: [{ kind: 'five_hour', percentUsed: 85, resetsAt: new Date(4 * 3600_000).toISOString() }],
      },
    })
    await $.session.start(START)
    await $.turn.start(TURN_START)
    await respond($, BUILD_155K)
    usage.current = { ...usage.current, cost: { usd: 2.83 } }
    await $.turn.complete(TURN_DONE)
    await clock.advance(60 * MIN - 30_000)

    const ui = await mountBand($, 'terminal', cols)
    const row = firstRow(await ui.drawn())
    expect(widthOf(row)).toBeLessThanOrEqual(cols)
    expect(textOf(row)).toMatch(/0:30/)
    expect(textOf(row)).toMatch(/85%!/)
    expect(textOf(row)).toMatch(/\$2\.83/)
    await ui.unmount()
  })
}

for (const cols of [60, 70]) {
  test(`four amber chips still fit ${cols} columns and keep the toggle`, LONG, async ($, on) => {
    const clock = setup(on, {
      usage: {
        ...USAGE,
        context: { tokens: 190_000, window: 200_000, percent: 95 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 85, resetsAt: new Date(3 * HOUR).toISOString() },
          { kind: 'seven_day', percentUsed: 88, resetsAt: new Date(96 * HOUR).toISOString() },
        ],
      },
    })
    await $.session.start(START)
    await respond($, BUILD_155K)
    await clock.advance(HOUR - 45_000) // the cache's last minute

    const ui = await mountBand($, 'terminal', cols)
    const row = firstRow(await ui.drawn())
    expect(widthOf(row)).toBeLessThanOrEqual(cols)
    expect(textOf(row)).toMatch(/85%!/)
    expect(textOf(row)).toMatch(/88%!/)
    expect(textOf(row)).not.toMatch(/ {2}\d/) // no double space where a bar was dropped
    await ui.unmount()
  })
}

test('as the band narrows, pieces give way in the agreed order', LONG, async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)

  const pieces: Record<string, (t: unknown) => boolean> = {
    tokens: t => pillOf(t, 'tokens') !== undefined,
    weekReset: t => /2d 19h/.test(shown(pillOf(t, '7d'))),
    fiveReset: t => /3h 00m/.test(shown(pillOf(t, '5h'))),
    ctxMeter: t => /[█░]{6}/.test(shown(pillOf(t, 'ctx'))),
    week: t => pillOf(t, '7d') !== undefined,
  }
  // the widest band at which each piece is gone
  const goneAt: Record<string, number> = {}
  for (let cols = 170; cols >= 40; cols -= 1) {
    const ui = await mountBand($, 'terminal', cols)
    const tree = await ui.drawn()
    for (const [name, present] of Object.entries(pieces)) {
      if (goneAt[name] === undefined && !present(tree)) goneAt[name] = cols
    }
    await ui.unmount()
  }
  const order = ['tokens', 'weekReset', 'fiveReset', 'ctxMeter', 'week'] as const
  for (const piece of order) expect(goneAt[piece]).toBeDefined()
  for (let i = 1; i < order.length; i++) {
    expect(goneAt[order[i - 1] ?? ''] ?? 0).toBeGreaterThanOrEqual(goneAt[order[i] ?? ''] ?? 0)
  }
})

test('the tokens chip shows whenever it fits, even below 100 columns', async ($, on) => {
  setup(on, { usage: { ...USAGE, rateLimits: [] } }) // room for it without the limit chips
  await $.session.start(DESKTOP_START)
  await respond($, BUILD_100K)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await mountBand($, surface, 95)
    expect(textOf(pillOf(await ui.drawn(), 'tokens'))).toMatch(/112k/)
    await ui.unmount()
  }
})

test('the tokens chip is the first to give way on a narrower band', async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_100K)
  const ui = await mountBand($, 'terminal', 62)
  expect(pillOf(await ui.drawn(), 'tokens')).toBeUndefined()
  expect(pillOf(await ui.drawn(), 'ctx')).toBeDefined()
  await ui.unmount()
})


test('a window whose reset has passed gives way like a calm one', LONG, async ($, on) => {
  const clock = setup(on, { usage: { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 92, resetsAt: new Date(HOUR).toISOString() }] } })
  await $.session.start(START)
  await respond($, BUILD_155K)
  await clock.advance(2 * HOUR)
  const ui = await mountBand($, 'terminal', 30)
  expect(widthOf(firstRow(await ui.drawn()))).toBeLessThanOrEqual(30)
  await ui.unmount()
})
