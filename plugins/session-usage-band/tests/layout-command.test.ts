// /usage-band layout: listing, switching and remembering a layout, and
// reading it back from the store, whatever the store holds.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { asLayoutName, removedLayoutOf } from '../hooks/memory'
import { START, engine, mountBand, resp, respond, setup, shown, turn } from './helpers'

const run = async ($: Engine, args: string): Promise<string> => {
  const r = await $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  return String((r as { text?: string }).text ?? '')
}
const drawnText = async ($: Engine): Promise<string> => {
  const ui = await mountBand($, 'terminal', 110)
  const t = shown(await ui.drawn())
  await ui.unmount()
  return t
}
/** The band as drawn, then as chips draws it once the command chooses chips. */
const drawnBesideChips = async ($: Engine): Promise<readonly [string, string]> => {
  const drawn = await drawnText($)
  await run($, 'layout chips')
  return [drawn, await drawnText($)]
}
const LIST = 'Choose one: chips (at a glance), pulse (trends), departures (times).'

test('asLayoutName takes a name in any case and spacing, and nothing else', () => {
  expect(asLayoutName('  Pulse ')).toBe('pulse')
  expect(asLayoutName('pulse extra')).toBeUndefined()
  for (const v of [42, null, {}, [], 'sparkle', '', 'ledger']) expect(asLayoutName(v)).toBeUndefined()
})
test('removedLayoutOf knows the six removed names, in any case', () => {
  expect(removedLayoutOf(' Week ')).toBe('week')
  expect(removedLayoutOf('pulse')).toBeUndefined()
})
test('a removed name stored draws chips, the list says so, and nothing is written', async ($, on) => {
  setup(on, { store: { layout: 'gauges' } }); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: chips (gauges was removed in 0.14.0). ${LIST}`)
  expect(engine.storeSets).not.toContain('layout')
  const [drawn, chips] = await drawnBesideChips($)
  expect(drawn).toBe(chips)
})
test('choosing a removed name changes nothing and says so', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout week')).toBe(`week was removed in 0.14.0. ${LIST}`)
  expect(engine.storeSets).not.toContain('layout')
})
test('a switch clears the removed note', async ($, on) => {
  setup(on, { store: { layout: 'rings' } }); await $.session.start(START)
  await run($, 'layout pulse')
  expect(await run($, 'layout')).toBe(`Usage band layout: pulse. ${LIST}`)
})
test('/usage-band layout lists the layouts and names the current one', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: chips. ${LIST}`)
})
test('/usage-band layout <name> saves it once, says how back, and chips says nothing more', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout Pulse')).toBe('Usage band layout: pulse. /usage-band layout chips goes back.')
  expect(engine.store.layout).toBe('pulse')
  expect(engine.storeSets.filter(k => k === 'layout')).toHaveLength(1)
  expect(await run($, 'layout chips')).toBe('Usage band layout: chips.')
})
test('an unknown name changes nothing and lists the names', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout sparkle-sparkle-sparkle-sparkle')).toMatch(/^Unknown layout ".{1,20}"\. Choose one: chips \(/)
  expect(engine.storeSets).not.toContain('layout')
})
test('extra words after the name are unknown', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout  Pulse  extra')).toMatch(/^Unknown layout/)
  expect(engine.storeSets).not.toContain('layout')
})
test('nothing stored, nothing written', async ($, on) => {
  setup(on); await $.session.start(START)
  await drawnText($)
  expect(engine.storeSets).not.toContain('layout')
})
test('a stored layout is read when the session starts', async ($, on) => {
  setup(on, { store: { layout: 'departures' } }); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: departures. ${LIST}`)
})
test("a stored layout this version doesn't know draws chips", async ($, on) => {
  setup(on, { store: { layout: 'sparkle' } }); await $.session.start(START)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
  const [drawn, chips] = await drawnBesideChips($)
  expect(drawn).toBe(chips)
})
test("a stored layout that isn't a string draws chips", async ($, on) => {
  setup(on, { store: { layout: 42 } }); await $.session.start(START)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
  const [drawn, chips] = await drawnBesideChips($)
  expect(drawn).toBe(chips)
})
test('setting a layout shows a hidden band and asks for a redraw', async ($, on) => {
  setup(on); await $.session.start(START)
  await run($, 'hide')
  const before = engine.invalidates
  await run($, 'layout pulse')
  expect(engine.invalidates).toBeGreaterThan(before)
  // The band shows again: this checks it draws, not which layout.
  expect(await drawnText($)).toMatch(/\$2\.41/)
})
test('a store that fails to write still switches the layout, and says until when', async ($, on) => {
  setup(on); engine.storeFails = true; await $.session.start(START)
  expect(await run($, 'layout pulse')).toBe(
    "Usage band layout: pulse. /usage-band layout chips goes back. It couldn't be saved, so it lasts until Claude's next reply.",
  )
  expect(await run($, 'layout')).toMatch(/^Usage band layout: pulse\./)
  // As it says: the next reply reads the store back, which holds none.
  await respond($, resp(41_000, 0, 155_000, 12_000))
  await turn($, 'x', 2.41, 2.5)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
})
test('chips that fails to write says so too', async ($, on) => {
  setup(on); engine.storeFails = true; await $.session.start(START)
  expect(await run($, 'layout chips')).toBe("Usage band layout: chips. It couldn't be saved, so it lasts until Claude's next reply.")
})
test('the usage line keeps its bracket and adds the layout hint', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'nope')).toBe('Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>')
})
test("another session's layout is read after this session's next turn", async ($, on) => {
  setup(on); await $.session.start(START)
  await respond($, resp(41_000, 0, 155_000, 12_000))
  engine.storeGets.length = 0
  engine.store.layout = 'pulse'
  await turn($, 'x', 2.41, 2.5)
  expect(engine.storeGets).toContain('layout')
  expect(await run($, 'layout')).toMatch(/^Usage band layout: pulse\./)
})
test('a store read that fails after a turn keeps the layout drawn', async ($, on) => {
  setup(on); await $.session.start(START)
  await run($, 'layout pulse')
  engine.storeReadFails = true
  await turn($, 'x', 2.41, 2.5)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: pulse\./)
})
test('a store read that fails as a new session starts draws chips, not the last session\'s layout', async ($, on) => {
  setup(on); await $.session.start(START)
  await run($, 'layout pulse')
  engine.storeReadFails = true
  await $.session.start(START)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
})
