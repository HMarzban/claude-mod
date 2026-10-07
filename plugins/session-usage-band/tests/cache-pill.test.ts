// The cache pill: countdown, battery, cold price, wording.

import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  USAGE,
  PLUGIN,
  FRESH,
  START,
  HOUR_1,
  MIN,
  base,
  props,
  resp,
  respond,
  textOf,
  firstRow,
  pillOf,
  shown,
  segments,
  batteryOf,
  fillWidth,
  turn,
  type Node,
  engine,
} from './helpers'

test('before the first response the band says warming rather than a false zero', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, FRESH)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  expect(shown(firstRow(await ui.drawn()) as Node)).not.toMatch(/\d%/) // no figure to show yet
  await ui.unmount()
})

test('the countdown is still while warm, then names the stakes in its last minute', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /re-warm/ })).toBeUndefined()

  await clock.advance(15_000)
  expect(await ui.find({ type: 'Text', text: /cache 59m/ })).toBeDefined()

  await clock.advance(60 * 60_000 - 45_000) // 30s left
  const soon = await ui.find({ type: 'Text', text: /0:30 left · re-warm ~\$/ })
  expect(soon).toBeDefined()
  expect(soon?.props?.color).toBe(DARK.amberFg)

  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold · next message ~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a cold cache is neutral, never amber or red', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))
  await clock.advance(10 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cold = await ui.find({ type: 'Text', text: /cache cold/ })
  expect(cold).toBeDefined()
  expect(cold?.props?.color).not.toBe(DARK.amberFg)
  expect(cold?.props?.color).toBe(DARK.value)
  await ui.unmount()
})

test("while a turn runs, 'cache warm' replaces the calm countdown", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110, true) })
  expect(await ui.find({ type: 'Text', text: /◷ cache warm\s*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache 1h/ })).toBeUndefined()

  await clock.advance(60 * 60_000 - 30_000) // a tool call outlasting the TTL
  expect(await ui.find({ type: 'Text', text: /0:30 left/ })).toBeDefined()
  await ui.unmount()
})

test('the re-warm estimate appears only where it is actionable', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await clock.advance(60 * 60_000 - 40_000)
  expect(await ui.find({ type: 'Text', text: /re-warm ~\$/ })).toBeDefined()
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold .*~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a narrow band shortens the wording but keeps the money', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(60 * 60_000 - 40_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(64) })
  const pill = await ui.find({ type: 'Text', text: /~\$/ })
  expect(pill).toBeDefined()
  expect(pill?.text).not.toMatch(/re-warm/)
  await ui.unmount()
})

test('with nothing billed yet the cold pill names the tokens instead', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache cold · next message 112k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await ui.unmount()
})

test('the cache pill is a battery that drains with the hour', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/◷ cache 1h 00m/)
  expect(seg[0]?.bg).toBe(DARK.batteryFill)
  expect(seg.filter(x => x.bg === DARK.batteryFill).map(x => x.text).join('').length).toBe(seg.map(x => x.text).join('').length)

  await clock.advance(30 * MIN) // half the hour gone: about half the pill filled
  seg = segments(pillOf(await ui.drawn(), 'cache'))
  const all = seg.map(x => x.text).join('').length
  const filled = seg.filter(x => x.bg === DARK.batteryFill).map(x => x.text).join('').length
  expect(Math.abs(filled - all / 2)).toBeLessThanOrEqual(1)

  await clock.advance(31 * MIN) // cold: empty and neutral
  seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/cache cold/)
  expect(seg.some(x => x.bg === DARK.batteryFill || x.bg === DARK.batteryAmber)).toBe(false)
  await ui.unmount()
})

test('in its last minute the battery turns amber', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(60 * MIN - 30_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const seg = segments(pillOf(await ui.drawn(), 'cache'))
  expect(seg.map(x => x.text).join('')).toMatch(/0:30 left/)
  expect(seg.some(x => x.bg === DARK.amberBg)).toBe(true)
  await ui.unmount()
})

test('on desktop the cache pill is a rounded pill with a draining battery icon', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  let tree = await ui.drawn()
  expect(pillOf(tree, 'cache')?.props?.backgroundColor).toBe(DARK.surface) // a normal, rounded pill
  expect(textOf(pillOf(tree, 'cache'))).toMatch(/cache 1h 00m/)
  const full = fillWidth(batteryOf(tree))
  expect(String(batteryOf(tree)?.props?.alt)).toBe('cache battery 100% left')
  expect(String(batteryOf(tree)?.props?.source)).toContain(DARK.warm)

  await clock.advance(30 * MIN)
  tree = await ui.drawn()
  expect(fillWidth(batteryOf(tree))).toBeLessThan(full)
  // redrawn when the countdown text changes, so up to a minute behind
  expect(String(batteryOf(tree)?.props?.alt)).toMatch(/^cache battery 5[0-2]% left$/)

  await clock.advance(30 * MIN - 30_000) // last minute: amber
  tree = await ui.drawn()
  expect(pillOf(tree, 'cache')?.props?.backgroundColor).toBe(DARK.amberBg)
  expect(String(batteryOf(tree)?.props?.source)).toContain(DARK.amberFg)

  await clock.advance(60_000) // cold: empty
  tree = await ui.drawn()
  expect(String(batteryOf(tree)?.props?.alt)).toBe('cache battery empty')
  expect(fillWidth(batteryOf(tree))).toBe(0)
  await ui.unmount()
})


test('the cache lifetime runs from when the request was sent, not when its reply ended', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } })
  await $.session.start(START)
  let open: () => void = () => undefined
  engine.gate = new Promise<void>(resolve => {
    open = resolve
  })
  const step = respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  for (let i = 0; i < 50; i++) await Promise.resolve() // let the request go out
  await clock.advance(2 * MIN) // a two-minute reply
  open()
  await step
  await clock.advance(59 * MIN) // 61m after sending, 59m after the reply

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  expect(shown(pillOf(await ui.drawn(), 'cache'))).toMatch(/cache cold/)
  await ui.unmount()
})
