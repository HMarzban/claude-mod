// Ledger, the band in words alone: `·`-separated, with `! ` leading what
// needs you. The reference view: every other layout follows its shape.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber } from '../words'
import { toggleButton, type Strip } from './frame'
import { fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last. Amber never does. */
const ORDER = ['resetWords', 'resetTimes', 'calmSeven', 'calmContext', 'cost', 'calmFive'] as const
type Piece = (typeof ORDER)[number]

/** A reading that can turn amber: its reason while amber, else its calm piece. */
const amberOr = (kit: Kit, key: string, amber: Amber | undefined, keeps: Keeps<Piece>, calm: RenderChildren): RenderChildren =>
  amber !== undefined ? words(kit, key, [[keeps.amber(amber), 'amber']]) : calm

/** A limit: amber, its reason; calm, its value and its reset as the squeeze allows. */
const limitPiece = (kit: Kit, l: LimitView, step: Piece, keeps: Keeps<Piece>): RenderChildren => {
  if (l.amber !== undefined) return words(kit, l.name, [[keeps.amber(l.amber), 'amber']])
  if (!keeps.has(step)) return null
  const reset = keeps.has('resetTimes') ? (keeps.has('resetWords') ? l.resetWords : l.resetGlyph) : undefined
  return words(kit, l.name, reset === undefined ? l.say : [...l.say, [`, ${reset}`, 'label']])
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const c = read.cache
  const x = read.context
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  const cost = words(kit, 'cost', [[read.spend.totalText, 'value']])
  const calmCache = words(kit, 'cache', c.say)
  const calmContext = words(kit, 'ctx', x.say)
  const seps = [1, 2, 3, 4].map(i => words(kit, `sep${i}`, [['·', 'label']]))
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const pieces = [
        amberOr(kit, 'cache', c.amber, keeps, calmCache),
        keeps.has('cost') ? cost : null,
        // Unreported, the context says nothing collapsed; open, its section says so.
        x.known ? amberOr(kit, 'ctx', x.amber, keeps, keeps.has('calmContext') ? calmContext : null) : null,
        read.fiveHour === undefined ? null : limitPiece(kit, read.fiveHour, 'calmFive', keeps),
        read.sevenDay === undefined ? null : limitPiece(kit, read.sevenDay, 'calmSeven', keeps),
      ].filter((p): p is RenderElement => p !== null)
      return line(kit, 'line', pieces.flatMap((p, i) => (i === 0 ? [p] : [seps[i - 1] ?? null, p])), toggle, 1)
    }),
  ]
}

/** A limit as a sentence: its reason while amber, else its value; then its
 *  reset and its pace, unless the reason is a measured fill, which says it. */
const limitSentence = (kit: Kit, l: LimitView): RenderElement => {
  const tail = [l.resetWords, l.fullIn === undefined ? l.pace : undefined].filter((t): t is string => t !== undefined && t !== '')
  return words(kit, l.name, [l.amber !== undefined ? [l.amber.long, 'amber'] : [l.text, 'value'], ...tail.map(t => [`, ${t}`, 'label'] as const)])
}

/** The facts behind ▿: four columns of short sentences. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  const sentence = (key: string, text: string | undefined): RenderChildren => (text === undefined ? null : words(kit, key, [[text, 'value']]))
  return grid(kit, [
    section(kit, 'cache', 'CACHE', [
      sentence('now', c.value),
      sentence('rewarm', c.reWarmText),
      c.savedText === undefined || c.hitText === undefined ? null : sentence('saved', `saved ${c.savedText}, ${c.hitText} hit rate`),
      sentence('lasts', `lasts ${c.lastsText}`),
    ], room),
    section(kit, 'spend', 'SPEND', [
      sentence('total', `${s.totalText} this session`),
      s.lastText === undefined ? null : sentence('last', `last message ${s.lastText}`),
      sentence('tokens', `${s.tokensText} tokens: ${s.split.map(part => `${part.text} ${part.label}`).join(', ')}`),
    ], room),
    section(kit, 'context', 'CONTEXT', !x.known ? [sentence('none', EMPTY.context)] : [
      sentence('pct', `${x.valueText} ${x.towardText}`),
      sentence('in', x.compactsAtText === undefined ? `${x.inContextText} in context` : `${x.inContextText} in context, compacts at ${x.compactsAtText}`),
      x.roomText === undefined ? null : sentence('room', `${x.roomText} room in a ${x.windowText} window`),
    ], room),
    // What needs you leads, so a body short of rows keeps it; an amber
    // closest limit is named by its own sentence.
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [sentence('none', EMPTY.limits)] : [
      ...read.limits.filter(l => l.amber !== undefined).map(l => limitSentence(kit, l)),
      read.worstLimit === undefined || read.worstLimit.amber !== undefined ? null : sentence('closest', `closest is ${read.worstLimit.text}`),
      ...read.limits.filter(l => l.amber === undefined).map(l => limitSentence(kit, l)),
    ], room),
  ], bodyRows)
}

/** Ledger's own strip: the workspace as a sentence. */
const strip: Strip = (kit, read) => (read.workspaceText === undefined ? null : words(kit, 'workspace', [[read.workspaceText, 'label']]))

export const ledgerView = defineView('ledger', { desktop: 1, terminal: 1 }, lines, body, strip)
