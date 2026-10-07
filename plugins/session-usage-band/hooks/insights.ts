// What the band can tell you that the engine's own figures don't: what your
// last message cost, and when your pace fills the 5-hour limit.

type Sample = { t: number; pct: number }

const WINDOW_MS = 30 * 60_000
const MIN_SPAN_MS = 10 * 60_000
const MIN_RISE = 2
const STALE_MS = 15 * 60_000
// resetsAt readings of one window can differ by a few seconds.
const SAME_RESET_MS = 60_000

type InsightState = {
  turnStartCost: Map<string, number>
  samples: Sample[]
  resetsAt: string | undefined
}

const state: InsightState = {
  turnStartCost: new Map(),
  samples: [],
  resetsAt: undefined,
}

const turns: { lastTurnUsd: number | null } = { lastTurnUsd: null }

/** What the last main-loop turn cost, read-only: set by noteTurnEnd. */
export const insights: Readonly<typeof turns> = turns

/** A new conversation (/clear, resume): its turns start over, but the
 *  5-hour window is account-wide, so its pace carries on. */
export const resetConversationInsights = (): void => {
  state.turnStartCost.clear()
  turns.lastTurnUsd = null
}

export const resetInsights = (): void => {
  resetConversationInsights()
  state.samples = []
  state.resetsAt = undefined
}

export const noteTurnStart = (turnId: string, costUsd: number | undefined): void => {
  if (costUsd !== undefined) state.turnStartCost.set(turnId, costUsd)
}

/** Everything the ledger rose by during the turn: its tool calls and
 *  subagents, and any background work that ran meanwhile. */
export const noteTurnEnd = (turnId: string, costUsd: number | undefined): void => {
  const start = state.turnStartCost.get(turnId)
  state.turnStartCost.delete(turnId)
  if (start === undefined || costUsd === undefined) return
  const spent = costUsd - start
  turns.lastTurnUsd = spent > 0 ? spent : null
}

const sameReset = (a: string | undefined, b: string | undefined): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const da = Date.parse(a)
  const db = Date.parse(b)
  return !Number.isNaN(da) && !Number.isNaN(db) && Math.abs(da - db) < SAME_RESET_MS
}

export const noteFiveHour = (now: number, percentUsed: number, resetsAt: string | undefined): void => {
  const last = state.samples[state.samples.length - 1]
  if (!sameReset(resetsAt, state.resetsAt) || (last !== undefined && percentUsed < last.pct)) {
    state.samples = []
  }
  state.resetsAt = resetsAt
  state.samples.push({ t: now, pct: percentUsed })
  state.samples = state.samples.filter(s => now - s.t <= WINDOW_MS)
}

/** Time until your pace fills the 5-hour window, or null while the
 *  evidence is thin, stale, or the window resets first. */
export const fiveHourEtaMs = (now: number): number | null => {
  const first = state.samples[0]
  const last = state.samples[state.samples.length - 1]
  if (first === undefined || last === undefined || last.pct >= 100) return null
  const span = last.t - first.t
  const rise = last.pct - first.pct
  if (span < MIN_SPAN_MS || rise < MIN_RISE || now - last.t > STALE_MS) return null
  const tFull = last.t + ((100 - last.pct) * span) / rise
  if (state.resetsAt !== undefined) {
    const resetAt = Date.parse(state.resetsAt)
    if (!Number.isNaN(resetAt) && tFull >= resetAt) return null
  }
  return Math.max(0, tFull - now)
}
