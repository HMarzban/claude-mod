// Surfaces and appearance: desktop SVG, terminal text, plain theme keys.

import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  PLUGIN,
  START,
  HOUR_1,
  base,
  props,
  resp,
  respond,
  textOf,
  walk,
  firstRow,
  pillOf,
  shown,
  svgAlts,
  svgsOf,
  textMeters,
} from './helpers'

test('CC_BAND_APPEARANCE=plain drops every background for theme keys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let backgrounds = 0
  walk(await ui.drawn(), n => {
    if (n.props?.backgroundColor !== undefined) backgrounds += 1
  })
  expect(backgrounds).toBe(0)
  expect(await ui.find({ type: 'Text', text: /\[/ })).toBeDefined()
  await ui.unmount()
})

test('the band draws on every surface that renders', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(110) })
    expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
    await ui.unmount()
  }
})

test('desktop draws SVG meters; the terminal and plain draw text ones', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  const svgs = (await desk.findAll({ type: 'Svg' })).filter(n => /% used/.test(String(n.props?.alt)))
  expect(svgs).toHaveLength(3) // context, 5h and 7d
  expect(svgs[0]?.props?.width).toBe(44)
  expect(svgs[0]?.props?.height).toBe(8) // 6px bar plus room for the compaction tick
  expect(svgs[0]?.props?.alt).toBe('context 38% used')
  expect(String(svgs[0]?.props?.source)).toContain(DARK.meterTrack)
  expect(await textMeters(desk)).toBe(0)
  await desk.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await term.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await textMeters(term)).toBe(3) // context, 5h and 7d
  await term.unmount()
})

test('plain appearance keeps text meters on desktop', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  await ui.unmount()
})

test('desktop draws a coin, a tokens and a context icon; the terminal uses glyphs', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(140) })
  const alts = svgAlts(await desk.drawn())
  expect(alts).toContain('cost')
  expect(alts).toContain('tokens')
  expect(alts).toContain('context')
  expect(textOf(firstRow(await desk.drawn()))).toMatch(/\$2\.41/)
  await desk.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  const tree = await term.drawn()
  expect(svgAlts(tree)).toHaveLength(0)
  expect(textOf(firstRow(tree))).toMatch(/Σ/)
  expect(textOf(firstRow(tree))).toMatch(/◔/)
  await term.unmount()
})

test('the terminal draws the limit chips with text meters and a reset glyph', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  const tree = await ui.drawn()
  expect(shown(pillOf(tree, '5h'))).toMatch(/5h [█░┃]{6} 4% │ ↻ 3h 00m/)
  expect(shown(pillOf(tree, '7d'))).toMatch(/7d [█░┃]{6} 30% │ ↻ 2d 19h/)
  expect(svgsOf(tree)).toHaveLength(0)
  await ui.unmount()
})

test('terminal meters draw the tick too', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on) // 5h: 2h of 5h gone
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(160) })
  const meter = shown(pillOf(await ui.drawn(), '5h')).match(/[█░┃]{6}/)?.[0]
  expect(meter?.indexOf('┃')).toBe(2) // floor(0.4 * 6)
  await ui.unmount()
})
