// The snapshot register.tsx reads for the band, and what the band can do
// back: the one contract between the engine side and the drawing.

import type { RenderSurface } from 'claude-code'
import type { Ttl } from './cache'
import type { Zone } from './format'
import type { Trails } from './insights'
import type { Sample } from './memory'
import type { Palette } from './palette'
import type { Workspace } from './workspace'

/** The glyph tier: the band's own glyphs, or ascii alone where a terminal
 *  draws ambiguous-width glyphs two columns wide. */
export type Glyphs = 'unicode' | 'ascii'

/** Every layout the band can be drawn in. */
export const LAYOUT_NAMES = ['chips', 'pulse', 'departures'] as const
export type LayoutName = (typeof LAYOUT_NAMES)[number]
/** The layout drawn until /nextcost layout chooses another. */
export const DEFAULT_LAYOUT: LayoutName = 'chips'

/** A limit window's use, and when it resets, epoch ms; undefined without a readable time. */
export type LimitReading = Readonly<{ percentUsed: number; resetsAt: number | undefined }>

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
    /** When the cache goes or went cold, epoch ms; null when not known. */
    coldAt: number | null
    ttl: Ttl
    /** The TTL is known, not assumed: pinned by the environment, or seen on
     *  the transcript's last cache write before this band's first reply. */
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
    /** Claude Code compacted the conversation while it sat idle: the cache
     *  is gone, and the next message writes the summary. */
    compacted: boolean
    /** Claude Code may compact this conversation when it sits idle on the
     *  hour's cache: a terminal session, idle compaction on, and the context
     *  past its threshold. */
    idleCompacts: boolean
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
  /** This conversation's message costs and context. */
  history: Trails
  context: Readonly<{
    tokens: number | undefined
    window: number
    percent: number | undefined
    /** Where auto-compaction runs, when it is on. */
    compactAt: number | undefined
    /** Auto-compaction is off, as the engine said; false while unknown. */
    autoCompactOff: boolean
  }>
  fiveHour: (LimitReading & { etaMs: number | null }) | undefined
  sevenDay: LimitReading | undefined
  /** The newest limit samples, a week's worth of 15-minute buckets, every
   *  session's, oldest first. Sparse use may stretch them back past a week. */
  samples: readonly Sample[]
  /** Any other window the engine reports, such as a gateway's spend_limit. */
  otherLimits: ReadonlyArray<LimitReading & { kind: string }>
  /** The project, home-relative, and git there; undefined until first read. */
  workspace: Workspace | undefined
  /** The layout chosen with /nextcost layout. */
  layout: LayoutName
  /** The glyph tier, resolved once per session. */
  glyphs: Glyphs
  /** The local zone, its offset read at each instant drawn; undefined when
   *  the clock gives no offset, and the band counts down instead. */
  zone: Zone | undefined
}>

export type BandActions = Readonly<{
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}>
