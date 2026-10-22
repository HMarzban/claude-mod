// What /nextcost answers and changes, and how it reads its arguments. Pure:
// a command and the band's state make a plan, which register.tsx carries out
// against the engine and the store.

import { clipMiddle } from './format'
import { DEFAULT_LAYOUT, LAYOUT_NAMES, REMOVED_IN, asLayoutName, removedLayoutOf } from './snapshot'
import type { LayoutName } from './snapshot'

/** What /nextcost answers. */
export const REPLY = {
  shown: 'nextcost shown.',
  shownFirst: 'nextcost shown. /nextcost more shows every fact.',
  hidden: 'nextcost hidden. /nextcost shows it again.',
  expanded: 'nextcost expanded.',
  collapsed: 'nextcost collapsed.',
  usage: 'Usage: /nextcost [more | less | show | hide] · /nextcost layout <name>',
} as const

/** What /nextcost was asked: a bare word, or `layout` and what follows it. */
type BandCommand = 'toggle' | 'more' | 'less' | 'show' | 'hide' | Readonly<{ layout: string }>

/** `layout`, then what follows it, if anything. */
const LAYOUT_ARG = /^\s*layout(?:\s+(.*))?$/i

/** The command in `args`; undefined when it is none. */
export const parseCommand = (args: string): BandCommand | undefined => {
  const chosen = LAYOUT_ARG.exec(args)
  if (chosen) return { layout: chosen[1] ?? '' }
  const word = args.trim().toLowerCase()
  if (word === '') return 'toggle'
  return word === 'more' || word === 'less' || word === 'show' || word === 'hide' ? word : undefined
}

/** The layouts /nextcost layout offers. */
const LAYOUT_PURPOSE: Readonly<Record<LayoutName, string>> = { chips: 'at a glance', pulse: 'trends', departures: 'times' }
const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.map(n => `${n} (${LAYOUT_PURPOSE[n]})`).join(', ')}.`

/** What a layout reply adds when the store couldn't keep it. */
const UNSAVED = "It couldn't be saved, so it lasts until Claude's next reply."
/** That a layout is gone, and since when. */
const removedNote = (name: string): string => `${name} was removed in ${REMOVED_IN}`
/** The reply naming the layout the band draws in. */
const layoutReply = (name: LayoutName, removed?: string): string =>
  `nextcost layout: ${name}${removed === undefined ? '' : ` (${removedNote(removed)})`}.`

/** What the band holds as /nextcost runs: the layout drawn, a removed one
 *  the store still names, and whether the band is hidden. */
export type CommandState = Readonly<{ layout: LayoutName; removed: string | undefined; hidden: boolean }>

/** What /nextcost does: its reply, the layout it switches to and saves, with
 *  the reply should the save fail, the atoms' new values, and whether it
 *  reads the workspace. Undefined is unchanged. */
export type CommandPlan = Readonly<{
  reply: string
  layout?: Readonly<{ name: LayoutName; unsaved: string }>
  expanded?: boolean
  hidden?: boolean
  readWorkspace: boolean
}>

/** `/nextcost layout [name]`: lists, or switches and remembers. Only this
 *  plan writes the layout, and it shows the band. */
const layoutPlan = (arg: string, state: CommandState): CommandPlan => {
  if (arg.trim() === '') return { reply: `${layoutReply(state.layout, state.removed)} ${LAYOUT_LIST}`, readWorkspace: false }
  const name = asLayoutName(arg)
  const gone = removedLayoutOf(arg)
  if (gone !== undefined) return { reply: `${removedNote(gone)}. ${LAYOUT_LIST}`, readWorkspace: false }
  if (name === undefined) return { reply: `Unknown layout "${clipMiddle(arg.trim(), 20)}". ${LAYOUT_LIST}`, readWorkspace: false }
  const reply = name === DEFAULT_LAYOUT ? layoutReply(name) : `${layoutReply(name)} /nextcost layout ${DEFAULT_LAYOUT} goes back.`
  return { reply, layout: { name, unsaved: `${reply} ${UNSAVED}` }, hidden: false, readWorkspace: false }
}

/** What /nextcost, or its old name /usage-band, does for `command`, given `state`. */
export const commandPlan = (command: BandCommand | undefined, state: CommandState): CommandPlan => {
  if (typeof command === 'object') return layoutPlan(command.layout, state)
  switch (command) {
    case 'more':
      return { reply: REPLY.expanded, expanded: true, hidden: false, readWorkspace: true }
    case 'less':
      return { reply: REPLY.collapsed, expanded: false, hidden: false, readWorkspace: false }
    case 'show':
      return { reply: REPLY.shown, hidden: false, readWorkspace: false }
    case 'hide':
      return { reply: REPLY.hidden, hidden: true, readWorkspace: false }
    case 'toggle':
      return { reply: state.hidden ? REPLY.shownFirst : REPLY.hidden, hidden: !state.hidden, readWorkspace: false }
    case undefined:
      return { reply: REPLY.usage, readWorkspace: false }
  }
}
