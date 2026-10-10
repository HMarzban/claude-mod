// Ledger, the band in words alone: `·`-separated, with `! ` leading what
// needs you. The reference view: every other layout follows its shape.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber } from '../words'
import { toggleButton, type Strip } from './frame'
import { amberWords, emptyWords, fitLine, grid, gridRoom, limitSentence, line, lineRoom, section, separatedBy, words, type Keeps, type SentenceStyle } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last; `cacheWords` is the
 *  narrow-width ruling's. Amber never does. */
const ORDER = ['resetWords', 'resetTimes', 'calmSeven', 'calmContext', 'cost', 'calmFive', 'cacheWords'] as const
type Piece = (typeof ORDER)[number]

/** A reading that can turn amber: its reason while amber, else its calm piece. */
const amberOr = (kit: Kit, key: string, amber: Amber | undefined, keeps: Keeps<Piece>, calm: RenderChildren): RenderChildren =>
  amber !== undefined ? amberWords(kit, key, amber, keeps) : calm

/** A limit: amber, its reason; calm, its value and its reset as the squeeze allows. */
const limitPiece = (kit: Kit, l: LimitView, step: Piece, keeps: Keeps<Piece>): RenderChildren => {
  if (l.amber !== undefined) return amberWords(kit, l.name, l.amber, keeps)
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
  // Cold, the short words keep the price: `cold ~$2.13`.
  const calmCacheShort = words(kit, 'cache', c.sayShort)
  const calmContext = words(kit, 'ctx', x.say)
  const separated = separatedBy(kit, '·', 4)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const pieces = [
        amberOr(kit, 'cache', c.amber, keeps, keeps.has('cacheWords') ? calmCache : calmCacheShort),
        keeps.has('cost') ? cost : null,
        // Unreported, the context says nothing collapsed; open, its section says so.
        x.known ? amberOr(kit, 'ctx', x.amber, keeps, keeps.has('calmContext') ? calmContext : null) : null,
        read.fiveHour === undefined ? null : limitPiece(kit, read.fiveHour, 'calmFive', keeps),
        read.sevenDay === undefined ? null : limitPiece(kit, read.sevenDay, 'calmSeven', keeps),
      ].filter((p): p is RenderElement => p !== null)
      return line(kit, 'line', separated(pieces), toggle, 1)
    }),
  ]
}

/** Ledger's limit sentences: `5h 4%, resets in 3h 00m, on pace for ~10%`. */
const SENTENCE: SentenceStyle = { lead: 'text', reset: 'resetWords', sep: ', ' }

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
      sentence('reWarm', c.reWarmText),
      c.savedText === undefined || c.hitText === undefined ? null : sentence('saved', `saved ${c.savedText}, ${c.hitText} hit rate`),
      sentence('lasts', `lasts ${c.lastsText}`),
    ], room),
    section(kit, 'spend', 'SPEND', [
      sentence('total', `${s.totalText} this session`),
      s.lastText === undefined ? null : sentence('last', `last message ${s.lastText}`),
      sentence('tokens', `${s.tokensText} tokens: ${s.split.map(part => `${part.text} ${part.label}`).join(', ')}`),
    ], room),
    section(kit, 'context', 'CONTEXT', !x.known ? [emptyWords(kit, 'none', EMPTY.context)] : [
      sentence('pct', `${x.valueText} ${x.towardText}`),
      sentence('in', x.compactsAtText === undefined ? `${x.inContextText} in context` : `${x.inContextText} in context, compacts at ${x.compactsAtText}`),
      x.roomText === undefined ? null : sentence('room', `${x.roomText} room in a ${x.windowText} window`),
    ], room),
    // What needs you leads, so a body short of rows keeps it; an amber
    // closest limit is named by its own sentence.
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [emptyWords(kit, 'none', EMPTY.limits)] : [
      ...read.limits.filter(l => l.amber !== undefined).map(l => limitSentence(kit, l, SENTENCE)),
      read.worstLimit === undefined || read.worstLimit.amber !== undefined ? null : sentence('closest', `closest is ${read.worstLimit.text}`),
      ...read.limits.filter(l => l.amber === undefined).map(l => limitSentence(kit, l, SENTENCE)),
    ], room),
  ], bodyRows)
}

/** Ledger's own strip: the workspace as a sentence. */
const strip: Strip = (kit, read) => (read.workspaceText === undefined ? null : words(kit, 'workspace', [[read.workspaceText, 'label']]))

export const ledgerView = defineView('ledger', { desktop: 1, terminal: 1 }, lines, body, strip)
