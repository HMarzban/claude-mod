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

/** Below this, every layout draws chips (spec §1). */
const CHIPS_BELOW = 40

/** `views` is for a test's registry; the band draws from VIEWS. */
export const drawBand = (
  el: ElementTable,
  snap: BandSnapshot,
  act: BandActions,
  views: Readonly<Record<LayoutName, View>> = VIEWS,
): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  const view = snap.columns < CHIPS_BELOW ? views[DEFAULT_LAYOUT] : views[snap.layout]
  let tree: RenderElement
  try {
    tree = view.draw(kit, read, act)
  } catch {
    // A layout that throws never takes the band down: chips stands in.
    tree = views[DEFAULT_LAYOUT].draw(kit, read, act)
  }
  // Mapped last: the squeeze measured the row in the band's own glyphs, and
  // no mapping widens one.
  return read.frame.glyphs === 'ascii' ? asciiTree(tree) : tree
}
