// One source for each figure: a pace, a tone, a read price, the context in
// use. Where the band says a thing twice, it says it the same way.

import type { SessionRateLimit } from 'claude-code'
import { test, expect, type Plugin } from 'claude-code/testing'
import { contextUsed } from '../hooks/format'
import { DARK } from '../hooks/palette'
import {
  DESKTOP_START,
  TURN_DONE,
  TURN_START,
  BUILD_155K,
  LONG,
  START,
  USAGE,
  byKey,
  cardOf,
  engine,
  fact,
  pacing,
  pillOf,
  cardText,
  hoverCardOf,
  respond,
  shown,
  svgsOf,
  usage,
  type Node,
  setup,
  mountBand,
} from './helpers'

test("the Limits card says the 5h chip's pace in the chip's own words, and in its colour", LONG, async ($, on) => {
  const clock = setup(on)
  await pacing($, clock)
  const ui = await mountBand($, 'terminal', 160)
  const eta = shown(pillOf(await ui.drawn(), '5h')).match(/full in (~\d+[hm](?: \d+m)?)/)?.[1]
  expect(eta).toBeDefined()
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  // The 5h is the worst window, so its pace leads the card, beside its reset.
  expect(fact(tree, 'resets')).toMatch(new RegExp(` · full in ${eta}$`))
  const row = byKey(cardOf(tree, 'limits'), 'fact:5h')
  const value = (row?.children ?? []).filter(Boolean).at(-1) as Node | undefined
  expect(value?.props?.color).toBe(DARK.amberFg) // amber on the card, as on the chip
  await ui.unmount()
})

test('the warm cache says what reading costs on the model in force', async ($, on) => {
  setup(on) // claude-opus-5-5, which reads its cache at 5% of input
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'desktop', 160)
  const hover = cardText(hoverCardOf(await ui.drawn(), 'cache'))
  expect(hover).toMatch(/bills input at 5%/)
  expect(hover).not.toMatch(/10%/)
  await ui.unmount()
})

test('a model named with its context size, as /model shows a 1M window, is priced as the model', async ($, on) => {
  setup(on)
  engine.model = 'claude-opus-5-5[1m]'
  await $.session.start(START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'desktop', 160)
  expect(cardText(hoverCardOf(await ui.drawn(), 'cache'))).toMatch(/bills input at 5%/)
  await ui.unmount()
})

test('a session named by an alias is priced at the model its replies are billed under', async ($, on) => {
  setup(on)
  engine.model = 'opus[1m]' // as /model may name it; each reply names the model itself
  await $.session.start(START)
  await $.turn.start(TURN_START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'desktop', 160)
  expect(cardText(hoverCardOf(await ui.drawn(), 'cache'))).toMatch(/bills input at 5%/)
  await ui.unmount()
})

test('the context in use: tokens, else the percent of the window, else unknown', () => {
  expect(contextUsed({ tokens: 76_000, percent: 40, window: 200_000 })).toBe(76_000)
  expect(contextUsed({ tokens: undefined, percent: 40, window: 200_000 })).toBe(80_000)
  expect(contextUsed({ tokens: undefined, percent: undefined, window: 200_000 })).toBeUndefined()
})

// A band hook that throws before next() is skipped, and what lies beneath
// draws in its place, as empty as a band that stepped aside. So above the
// band, this draws its link's outcome in place of the drawing unless it returned.
const tracer = {
  name: 'band-tracer',
  tier: 'prepend',
  register(on) {
    on('ui.render', { component: 'AbovePrompt' }, async (_$, e, next) => {
      const drawn = await next(e)
      const outcome = next.trace.find(t => t.plugin === 'nextcost')?.outcome ?? 'absent'
      return outcome === 'returned' ? drawn : { type: 'Text', children: [outcome] }
    })
  },
} satisfies Plugin

test('a usage read that fails mid-turn never breaks the turn or the band', { plugins: [tracer] }, async ($, on) => {
  setup(on)
  await $.session.start(START)
  usage.fails = true
  await $.turn.start(TURN_START)
  await respond($, BUILD_155K)
  await $.turn.complete(TURN_DONE)
  // While the read fails, the band steps aside rather than break the prompt.
  const failing = await mountBand($, 'terminal', 140)
  expect(shown(await failing.drawn())).toBe('')
  await failing.unmount()
  usage.fails = false
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache 1h 00m/)
  await ui.unmount()
})

test('a reading that throws never throws out of the band: it steps aside, by its own catch', { plugins: [tracer] }, async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond($, BUILD_155K)
  // A window the engine reports with no kind, as its JSON could arrive: the readings can't name it.
  const nameless: SessionRateLimit = JSON.parse('{"kind":null,"percentUsed":50}')
  usage.current = { ...USAGE, rateLimits: [...USAGE.rateLimits, nameless] }
  // The tracer draws the band's outcome: its own catch stood, rather than the engine skipping it.
  const ui = await mountBand($, 'terminal', 140)
  expect(shown(await ui.drawn())).toBe('caught')
  await ui.unmount()
})

test('no drawing names an SVG id: ids are page-wide, and two bands could share a page', async ($, on) => {
  setup(on)
  await $.session.start(DESKTOP_START)
  await respond($, BUILD_155K)
  const ui = await mountBand($, 'desktop', 160)
  await ui.press({ key: 'more' })
  const named = svgsOf(await ui.drawn()).filter(n => / id="/.test(String(n.props?.source)))
  expect(named.map(n => n.props?.alt)).toEqual([])
  await ui.unmount()
})
