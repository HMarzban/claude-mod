// Numbers, times and escalation marks, as the band words them.

/** At this share a pill turns amber and gains `!`, and a toast speaks. */
export const WARN_AT = 0.8
/** At this share the mark becomes `!!`, and a toast speaks again. */
export const SEVERE_AT = 0.95
/** Within this share of the compaction point, context counts down to it. */
export const COMPACT_NEAR = 0.9

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export const fmtTokens = (n: number): string => {
  const v = Math.max(0, Math.round(n))
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `${Math.round(v / 1000)}k`
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

export const fmtCost = (usd: number): string => (usd >= 1000 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

/** A small figure honestly: under a cent is not $0.00. */
export const fmtSmallCost = (usd: number): string => (usd < 0.01 ? '<$0.01' : fmtCost(usd))

/** An estimate is always marked as one. */
export const fmtEstimate = (usd: number): string => (usd < 0.01 ? '~<$0.01' : `~$${usd.toFixed(2)}`)

/** From an hour, `1h 05m`; from ten minutes, whole minutes; below, `M:SS`.
 *  The countdown is still for most of its life and ticks only when ticking
 *  means something. */
export const fmtCountdown = (ms: number): string => {
  const secs = Math.max(0, Math.round(ms / 1000))
  if (secs >= 3600) {
    const hours = Math.floor(secs / 3600)
    return `${hours}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}m`
  }
  if (secs >= 600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/** How far off a reset is: the time left, or that it has already passed. */
export type ResetIn = { kind: 'in'; text: string } | { kind: 'passed' }

/** When `iso` comes, from `now`; undefined without a readable time. */
export const resetIn = (iso: string | undefined, now: number): ResetIn | undefined => {
  if (!iso) return undefined
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return undefined
  const secs = Math.floor((at - now) / 1000)
  if (secs <= 0) return { kind: 'passed' }
  const hours = Math.floor(secs / 3600)
  const mins = Math.floor((secs % 3600) / 60)
  const days = Math.floor(hours / 24)
  if (days) return { kind: 'in', text: `${days}d ${hours % 24}h` }
  if (hours) return { kind: 'in', text: `${hours}h ${String(mins).padStart(2, '0')}m` }
  return { kind: 'in', text: `${mins}m` }
}

/** The words for escalation: colour is never the only signal. */
export const severityMark = (frac: number): string => (frac >= SEVERE_AT ? '!!' : frac >= WARN_AT ? '!' : '')

/** A projection, never a countdown: 5-minute steps under an hour, 15 from one. */
export const fmtEta = (ms: number): string => {
  const mins = Math.max(0, ms) / 60_000
  if (mins < 57.5) return `~${Math.max(5, Math.round(mins / 5) * 5)}m`
  const quarter = Math.round(mins / 15) * 15
  const hours = Math.floor(quarter / 60)
  const rest = quarter % 60
  return rest ? `~${hours}h ${rest}m` : `~${hours}h`
}

/** `text` at most `max` characters, cut in the middle: a branch keeps both
 *  its prefix and its end, where names differ. */
export const clipMiddle = (text: string, max: number): string => {
  const chars = [...text]
  if (chars.length <= max) return text
  if (max <= 1) return '…'.slice(0, max)
  const head = Math.ceil((max - 1) / 2)
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - (max - 1 - head)).join('')}`
}

/** How long ago, coarsely: `2d 4h`, `3h 05m`, `12m`; under a minute is `now`. */
export const fmtAgo = (ms: number): string => {
  const mins = Math.floor(Math.max(0, ms) / 60_000)
  if (mins < 1) return 'now'
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days) return `${days}d ${hours % 24}h`
  if (hours) return `${hours}h ${String(mins % 60).padStart(2, '0')}m`
  return `${mins}m`
}
