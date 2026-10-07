export const fmtEstimate = (usd: number): string => (usd < 0.01 ? '~<$0.01' : `~$${usd.toFixed(2)}`)

// ── formatting ─────────────────────────────────────────────────────────
// Widths are fixed: in a monospace row a changing digit count is motion.
export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

export const fmtTokens = (n: number): string => {
  const v = Math.max(0, Math.round(n))
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 10_000) return `${Math.round(v / 1000)}k`
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

export const fmtCost = (usd: number): string => (usd >= 1000 ? `$${Math.round(usd)}` : `$${usd.toFixed(2)}`)

export const fmtElapsed = (ms: number): string => {
  const secs = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

/** Above ten minutes, whole minutes; below, M:SS. The countdown is still for
 *  most of its life and only starts ticking when ticking means something. */
export const fmtCountdown = (ms: number): string => {
  const secs = Math.max(0, Math.round(ms / 1000))
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600)
    return `${h}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}m`
  }
  if (secs >= 600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

export const fmtResetsIn = (iso: string | undefined, now: number): string | null => {
  if (!iso) return null
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return null
  const delta = Math.floor((at - now) / 1000)
  if (delta <= 0) return 'now'
  const h = Math.floor(delta / 3600)
  const m = Math.floor((delta % 3600) / 60)
  const d = Math.floor(h / 24)
  if (d) return `${d}d ${h % 24}h`
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}m`
}

export const WINDOW_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'spend',
}

// Three discrete theme-keyed bands, not a hex gradient: a gradient needs
// 24-bit colour, cannot be contrast-checked at every stop, and carries
// severity by hue alone.
export const severity = (frac: number): 'success' | 'warning' | 'error' =>
  frac >= 0.9 ? 'error' : frac >= 0.7 ? 'warning' : 'success'

/** A mark that survives red/green colour blindness and NO_COLOR alike. */
export const severityMark = (frac: number): string => (frac >= 0.95 ? '!!' : frac >= 0.8 ? '!' : '')
