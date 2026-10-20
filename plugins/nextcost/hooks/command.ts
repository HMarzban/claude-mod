// What /nextcost says and how it reads its arguments. Pure: register.tsx
// runs the command against the engine and the store.

import { REMOVED_IN } from './memory'
import { LAYOUT_NAMES } from './snapshot'
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
export type BandCommand = 'toggle' | 'more' | 'less' | 'show' | 'hide' | Readonly<{ layout: string }>

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
export const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.map(n => `${n} (${LAYOUT_PURPOSE[n]})`).join(', ')}.`

/** What a layout reply adds when the store couldn't keep it. */
export const UNSAVED = "It couldn't be saved, so it lasts until Claude's next reply."
/** The reply naming the layout the band draws in. */
export const layoutReply = (name: LayoutName, removed?: string): string =>
  `nextcost layout: ${name}${removed === undefined ? '' : ` (${removed} was removed in ${REMOVED_IN})`}.`
