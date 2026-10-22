// What /nextcost reads off its arguments and the plan it makes: the reply,
// the layout it saves, the atoms it sets and whether it reads the workspace.

import { test, expect } from 'claude-code/testing'
import { REPLY, commandPlan, parseCommand } from '../hooks/command'
import type { CommandState } from '../hooks/command'

const SHOWN: CommandState = { layout: 'chips', removed: undefined, hidden: false }
const LIST = 'Choose one: chips (at a glance), pulse (trends), departures (times).'
const plan = (args: string, state: CommandState = SHOWN) => commandPlan(parseCommand(args), state)

test('a bare word in any case and spacing, nothing for a toggle, and anything else none', () => {
  expect(parseCommand('')).toBe('toggle')
  expect(parseCommand('  ')).toBe('toggle')
  expect(parseCommand(' More ')).toBe('more')
  expect(['less', 'show', 'hide'].map(parseCommand)).toEqual(['less', 'show', 'hide'])
  expect(parseCommand('sideways')).toBeUndefined()
  expect(parseCommand('more less')).toBeUndefined()
})

test('layout takes what follows it, or nothing', () => {
  expect(parseCommand('layout')).toEqual({ layout: '' })
  expect(parseCommand(' Layout  Pulse ')).toEqual({ layout: 'Pulse ' })
  expect(parseCommand('layouts')).toBeUndefined()
})

test('more and less set the open view and show the band; only more reads the workspace', () => {
  expect(plan('more')).toEqual({ reply: REPLY.expanded, expanded: true, hidden: false, readWorkspace: true })
  expect(plan('less')).toEqual({ reply: REPLY.collapsed, expanded: false, hidden: false, readWorkspace: false })
})

test('show and hide set the band alone; a toggle turns it over and says how back', () => {
  expect(plan('show')).toEqual({ reply: REPLY.shown, hidden: false, readWorkspace: false })
  expect(plan('hide')).toEqual({ reply: REPLY.hidden, hidden: true, readWorkspace: false })
  expect(plan('')).toEqual({ reply: REPLY.hidden, hidden: true, readWorkspace: false })
  expect(plan('', { ...SHOWN, hidden: true })).toEqual({ reply: REPLY.shownFirst, hidden: false, readWorkspace: false })
})

test('anything else is the usage line, and changes nothing', () => {
  expect(plan('sideways')).toEqual({ reply: REPLY.usage, readWorkspace: false })
})

test('layout alone names the layout drawn and lists them, a removed one stored too', () => {
  expect(plan('layout', { ...SHOWN, layout: 'pulse' })).toEqual({ reply: `nextcost layout: pulse. ${LIST}`, readWorkspace: false })
  expect(plan('layout', { ...SHOWN, removed: 'gauges' }).reply).toBe(`nextcost layout: chips (gauges was removed in 0.14.0). ${LIST}`)
})

test('a layout by name switches, saves, shows the band, and says how back', () => {
  const reply = 'nextcost layout: pulse. /nextcost layout chips goes back.'
  expect(plan('layout Pulse')).toEqual({
    reply,
    layout: { name: 'pulse', unsaved: `${reply} It couldn't be saved, so it lasts until Claude's next reply.` },
    hidden: false,
    readWorkspace: false,
  })
  expect(plan('layout chips', { ...SHOWN, layout: 'pulse' }).reply).toBe('nextcost layout: chips.')
})

test('a removed or unknown name changes nothing and lists the names', () => {
  expect(plan('layout week')).toEqual({ reply: `week was removed in 0.14.0. ${LIST}`, readWorkspace: false })
  expect(plan('layout sparkle-sparkle-sparkle-sparkle')).toEqual({ reply: `Unknown layout "sparkle-sp…e-sparkle". ${LIST}`, readWorkspace: false })
  expect(plan('layout pulse extra').layout).toBeUndefined()
})
