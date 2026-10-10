// Every layout by name. The compiler rejects a missing one, and the
// command's list of names reads in this order.

import type { LayoutName } from '../snapshot'
import { chipsView } from './chips'
import { departuresView } from './departures'
import { forecastView } from './forecast'
import { gaugesView } from './gauges'
import { ledgerView } from './ledger'
import { pulseView } from './pulse'
import { ringsView } from './rings'
import { tilesView } from './tiles'
import type { View } from './view'
import { weekView } from './week'

export type { View } from './view'

export const VIEWS: Readonly<Record<LayoutName, View>> = {
  chips: chipsView,
  gauges: gaugesView,
  ledger: ledgerView,
  rings: ringsView,
  pulse: pulseView,
  tiles: tilesView,
  week: weekView,
  departures: departuresView,
  forecast: forecastView,
}
