// When the band speaks a toast, and what it says: the 5-hour limit's and the
// context's, each once per threshold crossed. Pure: register.tsx speaks the
// texts and keeps the levels reached.

import { SEVERE_AT, WARN_AT, contextPressure, toCompaction } from './format'
import { FIVE_HOUR } from './snapshot'
import { roomOf } from './words'

/** Each toast's level reached, by its key, so it speaks once per crossing. */
export type Warned = ReadonlyMap<string, number>
/** The levels to remember, and the texts to speak, in order. */
export type Toasts = Readonly<{ warned: Warned; say: readonly string[] }>

/** No toast has spoken. */
export const NO_WARNINGS: Warned = new Map()

/** The context's keys, one per scale it is measured on: its levels toward
 *  the window and toward compaction are not one count. */
const CONTEXT = { window: 'context', compaction: 'context toward compaction' } as const

/** A toast re-arms once its figure falls back below this share. */
const TOAST_REARM_BELOW = 0.75

/** Whether a toast speaks, and the level to remember: it speaks once per
 *  threshold crossed (at the highest reached), holds while the figure stays
 *  up, and re-arms, back to level 0, once the figure falls under the re-arm
 *  share. `prev` is the level remembered from before. */
const escalate = (prev: number, frac: number, levels: readonly number[]): Readonly<{ level: number; speak: boolean }> => {
  const level = levels.filter(at => frac >= at).length
  if (level > prev) return { level, speak: true }
  return { level: frac < TOAST_REARM_BELOW ? 0 : prev, speak: false }
}

/** One toast's figure `frac` against its `levels`, under `key`: the level
 *  it reaches, and its text when it speaks. */
const note = (warned: Warned, key: string, frac: number, levels: readonly number[], text: (pct: number) => string): Toasts => {
  const { level, speak } = escalate(warned.get(key) ?? 0, frac, levels)
  return { warned: new Map(warned).set(key, level), say: speak ? [text(Math.round(frac * 100))] : [] }
}

/** The 5-hour limit's toasts, from the windows the engine reports. */
export const limitToasts = (warned: Warned, limits: ReadonlyArray<Readonly<{ kind: string; percentUsed: number }>>): Toasts =>
  limits
    .filter(l => l.kind === FIVE_HOUR)
    .reduce<Toasts>(
      (t, l) => {
        const next = note(t.warned, FIVE_HOUR, l.percentUsed / 100, [WARN_AT, SEVERE_AT], pct => `You've used ${pct}% of your 5-hour limit.`)
        return { warned: next.warned, say: [...t.say, ...next.say] }
      },
      { warned, say: [] },
    )

/** The context as a toast reads it: the tokens in use, undefined when the
 *  engine reports none, the window, where auto-compaction runs when it is
 *  on and known, and whether it is off. */
export type ContextNow = Readonly<{ used: number | undefined; window: number; compactAt: number | undefined; autoCompactOff: boolean }>

/** The context's toast. It speaks where the context pill turns amber: by the
 *  same rule. A level counts on the scale it was reached on, so a change of
 *  scale forgets the other's and the new one starts at none. */
export const contextToasts = (warned: Warned, c: ContextNow): Toasts => {
  const { used, compactAt } = c
  if (used === undefined) return { warned, say: [] }
  const { frac, levels } = contextPressure(used, c.window, compactAt)
  const [key, other] = compactAt === undefined ? [CONTEXT.window, CONTEXT.compaction] : [CONTEXT.compaction, CONTEXT.window]
  const rebased = new Map(warned)
  rebased.delete(other)
  return note(rebased, key, frac, levels, pct =>
    compactAt !== undefined ? `Auto-compaction in ${roomOf(toCompaction(used, compactAt))} tokens.`
    : c.autoCompactOff ? `Context is ${pct}% full and auto-compaction is off, so the conversation will run out of room.`
    : `Context is ${pct}% full.`,
  )
}

/** The warnings once a conversation ends: the context's start over; the
 *  5-hour limit is the account's, and /clear changes nothing about it. */
export const forgetConversation = (warned: Warned): Warned => {
  const kept = new Map(warned)
  kept.delete(CONTEXT.window)
  kept.delete(CONTEXT.compaction)
  return kept
}
