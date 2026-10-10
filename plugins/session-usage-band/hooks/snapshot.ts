// The snapshot register.tsx reads for the band, and what the band can do
// back: the one contract between the engine side and the drawing.

import type { RenderSurface } from 'claude-code'
import type { Ttl } from './cache'
import type { Palette } from './palette'
import type { Workspace } from './workspace'

/** The glyph tier: the band's own glyphs, or ascii alone where a terminal
 *  draws ambiguous-width glyphs two columns wide. */
export type Glyphs = 'unicode' | 'ascii'

/** Every layout the band can be drawn in. */
export const LAYOUT_NAMES = ['chips', 'gauges', 'ledger', 'rings', 'pulse', 'tiles', 'week', 'departures', 'forecast'] as const
export type LayoutName = (typeof LAYOUT_NAMES)[number]
/** Chips, the band as it has always been, until the command chooses another. */
export const DEFAULT_LAYOUT: LayoutName = 'chips'

export type LimitReading = Readonly<{ percentUsed: number; resetsAt: string | undefined }>

/** Everything the band shows, read by register.tsx. */
export type BandSnapshot = Readonly<{
  surface: RenderSurface
  columns: number
  /** Rows the band may take before it scrolls. */
  maxRows: number
  isWorking: boolean
  expanded: boolean
  palette: Readonly<Palette>
  now: number
  cache: Readonly<{
    requests: number
    msLeft: number
    ttl: Ttl
    /** The TTL is known, not assumed: pinned by the environment, or seen on
     *  the conversation's last cache write. */
    ttlPinned: boolean
    window: number
    hitRatio: number | null
    misses: number
    reWarmUsd: number | null
    /** What reading from the cache saved against full input price. */
    savedUsd: number | null
    /** A cache read's price against input, on the model in force. */
    readShare: number
    /** The conversation is known to start here; else, before its first
     *  reply, the band has not measured the cache yet. */
    fresh: boolean
    /** Before the first reply the band saw, the cache is as recalled: from
     *  the session's last reply, remembered or read off its transcript. */
    recalled: boolean
    /** How long since that recalled reply. */
    idleMs: number | null
    /** A resumed conversation's spend and tokens from before this process
     *  are counted, as its transcript records them. */
    recovered: boolean
    /** Every token since the conversation began, subagents included. */
    tokens: Readonly<{ sent: number; back: number; cached: number }>
  }>
  costUsd: number
  lastTurnUsd: number | null
  context: Readonly<{
    tokens: number | undefined
    window: number
    percent: number | undefined
    /** Where auto-compaction runs, when it is on. */
    compactAt: number | undefined
  }>
  fiveHour: (LimitReading & { etaMs: number | null }) | undefined
  sevenDay: LimitReading | undefined
  /** Any other window the engine reports, such as a gateway's spend_limit. */
  otherLimits: ReadonlyArray<LimitReading & { kind: string }>
  /** The project, home-relative, and git there; undefined until first read. */
  workspace: Workspace | undefined
  /** The layout chosen with /usage-band layout. */
  layout: LayoutName
  /** The glyph tier, resolved once per session. */
  glyphs: Glyphs
  /** The local zone's offset from UTC, in east-positive minutes; undefined
   *  when it can't be read. */
  utcOffsetMin: number | undefined
}>

export type BandActions = Readonly<{
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}>
