// The phrasebook: every phrase a new layout draws, built from facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import { fmtEta, fmtTokens } from './format'
import type { ResetIn } from './format'

/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>

const pct = (frac: number): string => `${Math.round(frac * 100)}%`

/** What an amber reading says, long and short, always led by one `! `. */
export const AMBER = {
  cache: (left: string, leftShort: string, estimate: string): Amber => ({ long: `! ${left} · re-warm ${estimate}`, short: `! ${leftShort}` }),
  context: (frac: number, toCompact: number): Amber => ({ long: `! context ${pct(frac)} · compacts in ~${fmtTokens(toCompact)}`, short: `! ctx ${pct(frac)}` }),
  contextNoCompaction: (frac: number): Amber => ({ long: `! context ${pct(frac)}`, short: `! ctx ${pct(frac)}` }),
  limit: (name: string, percentUsed: number): Amber => {
    const said = `! ${name} ${Math.round(percentUsed)}%`
    return { long: said, short: said }
  },
  limitPace: (name: string, eta: string): Amber => ({ long: `! ${name} full in ${eta}`, short: `! ${name} ${eta}` }),
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  /** Pulse's, where the full sentence won't fit. */
  costsShort: 'No costs yet.',
  history: 'History fills in as you use Claude.',
  context: 'not reported',
  limits: 'none reported',
} as const

/** A reset as a duration: words in sentences, the glyph on tight rows. */
export const resetPhrase = (r: ResetIn, form: 'words' | 'glyph'): string =>
  r.kind === 'passed' ? 'reset' : form === 'words' ? `resets in ${r.text}` : `↻ in ${r.text}`

/** A window's pace in words: a measured fill first, then the average's landing. */
export const paceText = (p: Readonly<{ etaMs: number | null; projectedPct: number | undefined }>): string =>
  p.etaMs !== null
    ? `full in ${fmtEta(p.etaMs)}`
    : p.projectedPct === undefined
      ? ''
      : p.projectedPct >= 100
        ? 'full before reset'
        : `on pace for ~${Math.round(p.projectedPct)}%`

/** What a screen reader hears for a drawn reading: `<name> <value>, <state>,
 *  <more>`, in words. A caller passes "about" and "resets in", never ~ or ↻. */
export const altOf = (name: string, value: string, state?: string, more?: string): string =>
  [`${name} ${value}`, state, more].filter((s): s is string => s !== undefined && s !== '').join(', ')
