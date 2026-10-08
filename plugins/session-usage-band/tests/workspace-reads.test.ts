// When the band asks git: at start, after each main turn and on opening the
// cards; never while it draws, and never in a way that can break the band.

import { test, expect, mock } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { GIT_DIRS_ARGV, GIT_STATUS_ARGV } from '../hooks/workspace'
import { CLEAR, GIT_CLEAN, GIT_MAIN_TREE, HOUR_1, PLUGIN, START, base, engine, props, settle, shown, turn, walk, type Node } from './helpers'

const gitRuns = () => engine.ran.filter(argv => argv[0] === 'git').length

test('at start the band asks git twice: its status, and where its folders are', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  expect(engine.ran).toContainEqual([...GIT_STATUS_ARGV])
  expect(engine.ran).toContainEqual([...GIT_DIRS_ARGV])
})

test('drawing never runs git', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  const before = gitRuns()
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  for (let i = 0; i < 3; i++) await ui.drawn()
  expect(gitRuns()).toBe(before)
  await ui.unmount()
})

test("a main turn reads git again; a subagent's turn doesn't", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  const start = gitRuns()
  await turn($, 't1', 0, 0.1, { agentId: 'agent-1' })
  await settle()
  expect(gitRuns()).toBe(start)
  await turn($, 't2', 0.1, 0.2)
  await settle()
  expect(gitRuns()).toBe(start + 2)
})

test('opening the cards reads git again, so they never show a stale branch', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await settle()
  const closed = gitRuns()
  await ui.press({ key: 'more' })
  await settle()
  expect(gitRuns()).toBe(closed + 2)
  await ui.press({ key: 'more' }) // closing reads nothing
  await settle()
  expect(gitRuns()).toBe(closed + 2)
  await ui.unmount()
})

test('git failing to run never breaks the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  engine.git = 'fail'
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(await ui.drawn()).toBeDefined()
  await ui.unmount()
})

/** The strip's text once the cards are open. */
const stripText = async ($: Engine, open = true): Promise<string> => {
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(140) })
  if (open) await ui.press({ key: 'more' })
  await settle()
  let strip: Node | undefined
  walk(await ui.drawn(), n => {
    if (n.type === 'Box' && n.props?.key === 'strip') strip = n
  })
  await ui.unmount()
  return shown(strip)
}

test('a slow read that ends after a newer one never overwrites it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  let release = (): void => undefined
  engine.hold = new Promise<void>(resolve => {
    release = resolve
  })
  await turn($, 't1', 0, 0.1) // read A: main, held
  await settle() // A reaches git and waits there
  engine.hold = undefined
  engine.git = { status: GIT_CLEAN.replace('branch.head main', 'branch.head feature'), dirs: GIT_MAIN_TREE }
  const fresh = await stripText($) // read B: feature, lands first
  expect(fresh).toMatch(/on feature/)
  release()
  await settle()
  expect(await stripText($, false)).toMatch(/on feature/)
})

test('a read that fails keeps the last good git reading', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  engine.git = 'fail'
  await turn($, 't1', 0, 0.1)
  await settle()
  expect(await stripText($)).toMatch(/on main/)
})

test('two presses at once leave the cards as they were', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  await Promise.all([ui.press({ key: 'more' }), ui.press({ key: 'more' })])
  let open = false
  walk(await ui.drawn(), n => {
    if (n.type === 'Box' && n.props?.key === 'cards') open = true
  })
  expect(open).toBe(false)
  await ui.unmount()
})

test('/usage-band more reads git, like the toggle', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  const before = gitRuns()
  await $.command.run({ command: 'usage-band', args: 'more', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  await settle()
  expect(gitRuns()).toBe(before + 2)
})

test('a new conversation reads git again, since a resume may be another project', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await settle()
  const before = gitRuns()
  await $.session.end(CLEAR)
  await settle()
  expect(gitRuns()).toBe(before + 2)
})
