// The band, drawn: a pure function of the snapshot register.tsx reads.
// It never sees `$`, so everything it shows arrives in the snapshot. It
// builds the kit and the readings once, and draws chips from them.

import type { ElementTable, RenderElement } from 'claude-code'
import { asciiTree } from './glyphs'
import { makeKit } from './kit'
import { readingsOf } from './reading'
import type { BandActions, BandSnapshot } from './snapshot'
import { drawChips } from './views/chips'

export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  const tree = drawChips(kit, read, act)
  // Mapped last: the squeeze measured the row in the band's own glyphs, and
  // no mapping widens one.
  return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree
}
