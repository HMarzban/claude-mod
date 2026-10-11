// The band's icons: one-colour SVG bodies for the desktop, the glyphs that
// stand in for them elsewhere, and their names for a reader.

/** An icon's side, in px. */
export const ICON_PX = 16

export type Icon =
  | 'cost'
  | 'tokens'
  | 'context'
  | 'five'
  | 'week'
  | 'reset'
  | 'cache'
  | 'limits'
  | 'info'
  | 'folder'
  | 'branch'
  | 'commit'
  | 'worktree'
  | 'changes'
  | 'ahead'
  | 'behind'
  | 'sun'
  | 'cloud'
  | 'snow'

/** The 5-hour gauge, which also heads the Limits card. */
const GAUGE = (color: string): string =>
  `<path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>` +
  `<path d="M8 11.5l2.6-3.4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`

/** Desktop icons, as SVG bodies drawn in one colour. */
export const ICON_PATHS: Readonly<Record<Icon, (color: string) => string>> = {
  cost: color =>
    `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M9.6 5.6c-.4-.5-1-.8-1.7-.8-1 0-1.7.6-1.7 1.3 0 1.7 3.6 1 3.6 2.9 0 .8-.8 1.4-1.9 1.4-.8 0-1.5-.3-1.9-.9M8 3.9v1M8 10.4v1.4" fill="none" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
  tokens: color =>
    `<rect x="2.5" y="3" width="11" height="2.4" rx="1.2" fill="${color}"/>` +
    `<rect x="2.5" y="6.8" width="11" height="2.4" rx="1.2" fill="${color}" opacity=".75"/>` +
    `<rect x="2.5" y="10.6" width="11" height="2.4" rx="1.2" fill="${color}" opacity=".5"/>`,
  context: color =>
    `<rect x="2.5" y="2.5" width="11" height="11" rx="2.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M5.2 6h5.6M5.2 8.5h5.6M5.2 11h3.2" stroke="${color}" stroke-width="1.2" stroke-linecap="round"/>`,
  five: GAUGE,
  limits: GAUGE,
  // A bolt: the cache is what makes a warm reply fast and cheap.
  cache: color =>
    `<path d="M9.2 1.8 3.6 9h3.9l-.8 5.2L12.4 7H8.5z" fill="none" stroke="${color}" stroke-width="1.3" stroke-linejoin="round"/>`,
  info: color =>
    `<circle cx="8" cy="8" r="6.5" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M8 7.3v4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<circle cx="8" cy="4.9" r=".9" fill="${color}"/>`,
  folder: color =>
    `<path d="M2.5 4.5A1.5 1.5 0 0 1 4 3h2.3l1.5 1.6H12a1.5 1.5 0 0 1 1.5 1.5v5.4A1.5 1.5 0 0 1 12 13H4a1.5 1.5 0 0 1-1.5-1.5z" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  branch: color =>
    `<circle cx="4.75" cy="11.75" r="1.75" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<circle cx="11.25" cy="4.25" r="1.75" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M4.75 2.5V10M11.25 6c0 3-2.3 5.1-4.75 5.6" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  commit: color =>
    `<circle cx="8" cy="8" r="2.6" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M2.5 8h2.9M10.6 8h2.9" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  // Rounded squares, where the branch has circles, so the two stay apart at 16px.
  worktree: color =>
    `<path d="M4 2.5v7.75a1.5 1.5 0 0 0 1.5 1.5H9M4 5h5" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<rect x="9" y="3.25" width="4.5" height="3.5" rx="1.2" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<rect x="9" y="10" width="4.5" height="3.5" rx="1.2" fill="none" stroke="${color}" stroke-width="1.4"/>`,
  changes: color => `<path d="M8 2.5v7M4.5 6h7M4.5 13h7" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  ahead: color =>
    `<path d="M8 13V3.5M4.5 7 8 3.5 11.5 7" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  behind: color =>
    `<path d="M8 3v9.5M4.5 9 8 12.5 11.5 9" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // The cache as weather: warm, cooling as it nears its end, then cold.
  sun: color =>
    `<circle cx="8" cy="8" r="3" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  cloud: color =>
    `<path d="M4.5 12.5h7a3 3 0 0 0 .3-6 4 4 0 0 0-7.6 1A2.5 2.5 0 0 0 4.5 12.5z" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>`,
  snow: color =>
    `<path d="M8 1.8v12.4M2.6 4.9l10.8 6.2M2.6 11.1l10.8-6.2M6.4 2.6 8 4.2l1.6-1.6M6.4 13.4 8 11.8l1.6 1.6" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`,
  week: color =>
    `<rect x="2.5" y="3.5" width="11" height="10" rx="2" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
  reset: color =>
    `<circle cx="8" cy="8" r="5.6" fill="none" stroke="${color}" stroke-width="1.4"/>` +
    `<path d="M8 5v3l2 1.4" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/>`,
}

/** What stands in for an icon where there is no Svg; the cost keeps its `$`. */
export const GLYPH: Readonly<Record<Icon, string>> = {
  cost: '',
  tokens: 'Σ',
  context: '◔',
  five: '',
  week: '',
  reset: '↻',
  cache: '',
  limits: '',
  info: '',
  // The text strip says these in words.
  folder: '',
  branch: '',
  commit: '',
  worktree: '',
  changes: '',
  ahead: '',
  behind: '',
  // Weather symbols are wide in some fonts: the forecast says the word.
  sun: '',
  cloud: '',
  snow: '',
}

/** An icon's name for a reader that cannot see it. */
export const ALT: Readonly<Record<Icon, string>> = {
  cost: 'cost',
  tokens: 'tokens',
  context: 'context',
  five: 'five-hour',
  week: 'week',
  reset: 'resets',
  cache: 'cache',
  limits: 'limits',
  info: 'info',
  // Each reads as a phrase with the text after it: "HEAD detached at a1b2c3d".
  folder: 'folder',
  branch: 'branch',
  commit: 'HEAD',
  worktree: 'linked',
  changes: 'uncommitted',
  ahead: 'ahead',
  behind: 'behind',
  sun: 'warm',
  cloud: 'cooling',
  snow: 'cold',
}
