// The band, drawn: a pure function of the snapshot register.tsx reads.
// It never sees `$`, so everything it shows arrives in the snapshot. It
// builds the kit and the readings once, and draws the chosen layout from
// them, or chips in its place.

import type { ElementTable, RenderElement } from 'claude-code'
import { asciiTree } from './glyphs'
import { makeKit } from './kit'
import { readingsOf } from './reading'
import { DEFAULT_LAYOUT } from './snapshot'
import type { BandActions, BandSnapshot, LayoutName } from './snapshot'
import { VIEWS } from './views/index'
import type { View } from './views/index'
import { drawView } from './views/frame'

/** Below this, every layout draws chips (spec §1); a layout may need more. */
const CHIPS_BELOW = 40

/** The layout the band draws at `columns`: the one chosen, or chips below
 *  CHIPS_BELOW or the chosen view's own fewest columns. */
export const layoutAt = (layout: LayoutName, columns: number, views: Readonly<Record<LayoutName, View>> = VIEWS): LayoutName =>
  columns < Math.max(CHIPS_BELOW, views[layout].minColumns ?? 0) ? DEFAULT_LAYOUT : layout

/** `views` is for a test's registry; the band draws from VIEWS. */
export const drawBand = (
  el: ElementTable,
  snap: BandSnapshot,
  act: BandActions,
  views: Readonly<Record<LayoutName, View>> = VIEWS,
): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  const view = views[layoutAt(snap.layout, snap.columns, views)]
  let tree: RenderElement
  try {
    tree = drawView(view, kit, read, act)
  } catch {
    // A layout that throws never takes the band down: chips stands in.
    tree = drawView(views[DEFAULT_LAYOUT], kit, read, act)
  }
  // Mapped last: the squeeze measured the row in the band's own glyphs, and
  // no mapping widens one.
  return read.frame.glyphs === 'ascii' ? asciiTree(tree) : tree
}
