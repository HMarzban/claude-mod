// The snapshot register.tsx reads for the band, and what the band can do
// back: the one contract between the engine side and the drawing.

import type { RenderSurface } from 'claude-code'
import type { CacheView } from './cache'
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
  cache: CacheView
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
