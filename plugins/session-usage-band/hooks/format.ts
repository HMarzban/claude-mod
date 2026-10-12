// Numbers, times and escalation marks, as the band words them.

/** The cache's last minute: the one span where acting changes the bill. */
export const SOON_MS = 60_000
/** Departures' last call: an hour's cache this near cold, or a limit this near full, leads its row in amber. */
export const LAST_CALL_MS = 10 * 60_000

/** At this share a pill turns amber and gains `!`, and a toast speaks. */
export const WARN_AT = 0.8
/** At this share the mark becomes `!!`, and a toast speaks again. */
export const SEVERE_AT = 0.95
/** Within this share of the compaction point, context counts down to it. */
export const COMPACT_NEAR = 0.9

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/** A share as a whole percent: 0.38 is `38%`. */
export const fmtPct = (frac: number): string => `${Math.round(frac * 100)}%`

export const fmtTokens = (n: number): string => {
  const v = Math.max(0, Math.round(n))
  // Each unit from where the one below would round up to it: 9,999 is 10k,
  // not 10.0k; 999,999 is 1.0M, not 1000k; 999.95M is 1.0B, not 1000.0M.
  if (v >= 999_950_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 999_500) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 9_950) return `${Math.round(v / 1000)}k`
  if (v >= 1_000) return `${(v / 1000).toFixed(1)}k`
  return String(v)
}

/** Whole dollars from $1,000, and from what would round to it. */
const WHOLE_FROM = 999.995

/** Whole dollars grouped by thousands, `1,027`: by hand, since the sandbox's
 *  locale formatting can't be relied on. */
const wholeDollars = (usd: number): string => String(Math.round(usd)).replace(/\B(?=(\d{3})+$)/g, ',')

export const fmtCost = (usd: number): string => (usd >= WHOLE_FROM ? `$${wholeDollars(usd)}` : `$${usd.toFixed(2)}`)

/** A small figure honestly: under a cent is not $0.00. */
export const fmtSmallCost = (usd: number): string => (usd < 0.01 ? '<$0.01' : fmtCost(usd))

/** An estimate is always marked as one. */
export const fmtEstimate = (usd: number): string => `~${fmtSmallCost(usd)}`

/** The countdowns' seconds, drawn and spoken alike. */
const wholeSeconds = (ms: number): number => Math.max(0, Math.round(ms / 1000))

/** From an hour, `1h 05m`; from ten minutes, whole minutes; below, `M:SS`.
 *  The countdown is still for most of its life and ticks only when ticking
 *  means something. */
export const fmtCountdown = (ms: number): string => {
  const secs = wholeSeconds(ms)
  if (secs >= 3600) {
    const hours = Math.floor(secs / 3600)
    return `${hours}h ${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}m`
  }
  if (secs >= 600) return `${Math.floor(secs / 60)}m`
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

/** How far off a reset is: the time left, or that it has already passed. */
export type ResetIn = { kind: 'in'; text: string } | { kind: 'passed' }

/** A span coarsely, to the minute: `2d 4h`, `3h 05m`, `12m`, `<1m`. */
const fmtSpan = (ms: number): string => {
  const mins = Math.floor(Math.max(0, ms) / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days) return `${days}d ${hours % 24}h`
  if (hours) return `${hours}h ${String(mins % 60).padStart(2, '0')}m`
  return mins > 0 ? `${mins}m` : '<1m'
}

/** When `iso` comes, from `now`; undefined without a readable time. */
export const resetIn = (iso: string | undefined, now: number): ResetIn | undefined => {
  if (!iso) return undefined
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return undefined
  const left = at - now
  return left <= 0 ? { kind: 'passed' } : { kind: 'in', text: fmtSpan(left) }
}

/** The words for escalation: colour is never the only signal. */
export const severityMark = (frac: number): string => (frac >= SEVERE_AT ? '!!' : frac >= WARN_AT ? '!' : '')

/** A day's minutes, from which a projection is said in days. */
const DAY_MINUTES = 24 * 60

/** A projection's whole minutes: 5-minute steps under an hour, 15 from one. */
const etaMinutes = (ms: number): number => {
  const mins = Math.max(0, ms) / 60_000
  return mins < 57.5 ? Math.max(5, Math.round(mins / 5) * 5) : Math.round(mins / 15) * 15
}

/** A projection, never a countdown: `~40m`, `~1h`, `~1h 15m`. */
export const fmtEta = (ms: number): string => {
  const mins = etaMinutes(ms)
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return hours === 0 ? `~${mins}m` : rest ? `~${hours}h ${rest}m` : `~${hours}h`
}

/** From this far off, departures' projection says its day, not its minutes. */
const DAYS_FROM_MINUTES = 12 * 60

/** Departures' projection: from 12 hours, whole days to the nearest, at
 *  least one, `~1d`, since its minute would claim too much; nearer, as
 *  `fmtEta`. */
export const fmtEtaDays = (ms: number): string => {
  const mins = etaMinutes(ms)
  return mins >= DAYS_FROM_MINUTES ? `~${Math.max(1, Math.round(mins / DAY_MINUTES))}d` : fmtEta(ms)
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

/** `text` at most `room` characters, cut at its last whole word with a `.`
 *  in place of the punctuation it ended on; a first word longer than the
 *  room is cut where the room ends. */
export const clipWords = (text: string, room: number): string => {
  if (text.length <= room) return text
  const space = text.lastIndexOf(' ', room - 1)
  const kept = space > 0 ? text.slice(0, space).replace(/[\s,;:]+$/, '') : text.slice(0, room - 1)
  return `${kept}.`
}

/** How long ago, coarsely: `2d 4h`, `3h 05m`, `12m`; under a minute is `now`. */
export const fmtAgo = (ms: number): string => (ms < 60_000 ? 'now' : fmtSpan(ms))

export const HOUR_MS = 3600_000
export const DAY_MS = 24 * HOUR_MS
/** The 5-hour limit's window. */
export const FIVE_HOUR_MS = 5 * HOUR_MS
/** The weekly limit's window. */
export const SEVEN_DAY_MS = 7 * DAY_MS
// resetsAt readings of one window can differ by a few seconds.
export const SAME_RESET_MS = 60_000

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** A zone: its offset from UTC at an instant, east-positive minutes. Read
 *  per instant, so a reset past a daylight-saving change says its own clock. */
export type Zone = (ms: number) => number
/** A zone from a clock's minutes behind UTC at each instant, as
 *  getTimezoneOffset reports them (`0 -` keeps a UTC offset +0). */
export const zoneOf =
  (behind: (ms: number) => number): Zone =>
  ms =>
    0 - behind(ms)
/** This machine's zone, as its clock reports each instant. */
export const hostZone: Zone = zoneOf(ms => new Date(ms).getTimezoneOffset())
/** `zone`, or undefined where its offset at `now` can't be read, so the band
 *  counts down instead. */
export const readableZone = (zone: Zone, now: number): Zone | undefined => (Number.isFinite(zone(now)) ? zone : undefined)
/** A zone whose offset never changes. */
export const fixedZone =
  (min: number): Zone =>
  () =>
    min

/** `ms` as local wall time, to be read through the UTC getters. */
const wallTime = (ms: number, zone: Zone): number => ms + zone(ms) * 60_000
const hhmm = (wall: number): string => {
  const at = new Date(wall)
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`
}

/** A local 24-hour clock time: `14:32`. */
export const fmtClock = (ms: number, zone: Zone): string => hhmm(wallTime(ms, zone))

/** The local day `ms` falls on, counted from the epoch. */
export const dayOf = (ms: number, zone: Zone): number => Math.floor(wallTime(ms, zone) / DAY_MS)

/** The first instant of local day `day`: the earliest of three passes that
 *  lands on the day, at the offset in force there and an hour before. Where
 *  midnight falls in a spring-forward gap, one lands in the day before, and
 *  the day starts at the gap's end; where it comes twice, at a fall back to
 *  00:00, the hour before finds the first. */
export const midnightOf = (day: number, zone: Zone): number => {
  const at = (offsetAt: number): number => day * DAY_MS - zone(offsetAt) * 60_000
  const first = at(day * DAY_MS)
  const landed = [first, at(first), at(first - HOUR_MS)].filter(t => dayOf(t, zone) === day)
  return landed.length === 0 ? first : Math.min(...landed)
}

/** Whether `ms` falls on the same local day as `now`, each under its own offset. */
const isToday = (ms: number, zone: Zone, now: number): boolean => dayOf(ms, zone) === dayOf(now, zone)

/** The weekday `ms` falls on, `Sat`; a week or more on `next Sat`, so it
 *  never reads as today's. */
const weekdayOf = (ms: number, zone: Zone, now: number): string => {
  const day = WEEKDAYS[new Date(wallTime(ms, zone)).getUTCDay()]?.slice(0, 3) ?? ''
  return dayOf(ms, zone) - dayOf(now, zone) >= 7 ? `next ${day}` : day
}

/** A clock time, with its weekday when it isn't today: `16:40`, `Mon 08:40`, `next Sat 13:30`. */
export const fmtDayClock = (ms: number, zone: Zone, now: number): string =>
  isToday(ms, zone, now) ? fmtClock(ms, zone) : `${weekdayOf(ms, zone, now)} ${fmtClock(ms, zone)}`

/** A projection's day, which its minute would claim too much for: its
 *  weekday, `Mon`, a week on `next Sun`, or today its clock time, `16:40`. */
export const fmtDay = (ms: number, zone: Zone, now: number): string => (isToday(ms, zone, now) ? fmtClock(ms, zone) : weekdayOf(ms, zone, now))

/** Whole seconds left, never 0 while any remain. */
const secondsLeft = (ms: number): number => Math.max(1, Math.ceil(ms / 1000))
/** Whole minutes left: rounded up under ten minutes, then as `fmtCountdown`
 *  counts them. */
const minutesLeft = (ms: number): number => (ms < 600_000 ? Math.ceil(ms / 60_000) : Math.floor(wholeSeconds(ms) / 60))

/** The cache's last minute in words, where a `0:47` would read as a clock. */
export const fmtSecondsLeft = (ms: number): string => `${secondsLeft(ms)}s left`

/** The countdown alone, for a tile or a pill: `1h 00m`, `52m`, `10m`, `47s`. */
export const fmtLeftShort = (ms: number): string =>
  ms < 60_000 ? `${secondsLeft(ms)}s` : ms < 600_000 ? `${minutesLeft(ms)}m` : fmtCountdown(ms)

/** A countdown in words: `1h 00m left`, `52m left`, `10m left`, `47s left`. */
export const fmtLeft = (ms: number): string => `${fmtLeftShort(ms)} left`

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`

/** Whole minutes spelled out: `40 minutes`, `1 hour`, `1 hour 5 minutes`. */
const spokenMinutes = (mins: number): string => {
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return [hours > 0 ? plural(hours, 'hour') : '', rest > 0 || hours === 0 ? plural(rest, 'minute') : ''].filter(Boolean).join(' ')
}

/** The same countdown as a screen reader should hear it: `1 hour 5 minutes left`. */
export const fmtLeftSpoken = (ms: number): string =>
  `${ms < 60_000 ? plural(secondsLeft(ms), 'second') : spokenMinutes(minutesLeft(ms))} left`

/** A projection spelled out, rounded as `fmtEta` rounds it: `about 40 minutes`. */
export const fmtEtaSpoken = (ms: number): string => `about ${spokenMinutes(etaMinutes(ms))}`

/** The context in use: its token count, else its percent of the window;
 *  undefined when the engine reports neither. */
export const contextUsed = (ctx: Readonly<{ tokens?: number; percent?: number; window: number }>): number | undefined =>
  ctx.tokens ?? (ctx.percent === undefined ? undefined : (ctx.percent / 100) * ctx.window)
