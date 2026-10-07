// The expanded line, its buttons, /usage-band, and yielding to surveys.

import { test, expect, mock } from 'claude-code/testing'
import {
  PLUGIN,
  START,
  HOUR_1,
  base,
  props,
  resp,
  respond,
  usage,
  textOf,
  rowCount,
} from './helpers'

test('⋯ toggles the expanded line, and Hide hides the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(2)
  const text = textOf(await ui.drawn())
  expect(text).toMatch(/of input served from cache/)
  expect(text).toMatch(/cache lifetime 1h/)
  expect(text).toMatch(/7d limit 30%, resets in 2d 19h/)
  expect(text).toMatch(/5h limit 4%, resets in 3h 00m/)
  expect(text).toMatch(/1 model call\b/)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

test('/usage-band more, less, hide and show drive the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const run = (args: string): Promise<unknown> =>
    $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })

  await run('more')
  expect(textOf(await ui.drawn())).toMatch(/cache lifetime/)
  await run('less')
  expect(textOf(await ui.drawn())).not.toMatch(/cache lifetime/)
  await run('hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await run('show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props(110), hasSurvey: true },
  })
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeUndefined()
  await ui.unmount()
})

test('/usage-band with an unknown word says how to use it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const result = await $.command.run({ command: 'usage-band', args: 'sideways', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  expect(JSON.stringify(result)).toMatch(/Usage: \/usage-band \[more \| less \| show \| hide\]/)
})
