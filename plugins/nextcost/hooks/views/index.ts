// Every layout by name. The compiler rejects a missing one; the command
// lists the names in LAYOUT_NAMES' order, not this one's.

import type { LayoutName } from '../snapshot'
import { chipsView } from './chips'
import { departuresView } from './departures'
import { pulseView } from './pulse'
import type { View } from './view'

export type { View } from './view'

export const VIEWS: Readonly<Record<LayoutName, View>> = {
  chips: chipsView,
  pulse: pulseView,
  departures: departuresView,
}
