// Departures: a stub that declares its rows and draws chips until it is built.

import { drawChips } from './chips'
import type { View } from './view'

export const departuresView: View = { name: 'departures', rows: { desktop: 1, terminal: 1 }, draw: drawChips }
