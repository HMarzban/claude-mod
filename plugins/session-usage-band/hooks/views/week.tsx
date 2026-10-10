// Week: a stub that declares its rows and draws chips until it is built.

import { drawChips } from './chips'
import type { View } from './view'

export const weekView: View = { name: 'week', rows: { desktop: 2, terminal: 2 }, draw: drawChips }
