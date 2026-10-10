// Rings: a stub that declares its rows and draws chips until it is built.

import { drawChips } from './chips'
import type { View } from './view'

export const ringsView: View = { name: 'rings', rows: { desktop: 2, terminal: 1 }, draw: drawChips }
