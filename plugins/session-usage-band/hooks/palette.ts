// A filled pill needs its foreground and background from one source: a theme
// key resolves against the user's theme, a hex does not, and mixing them makes
// a pill that is legible on one theme and blank on the other. Nothing in the
// API reports whether the theme is light or dark, so the palette is declared
// rather than guessed: CC_BAND_APPEARANCE = dark | light | plain.
export type Palette = {
  filled: boolean
  surface: string
  value: string
  label: string
  /** A warm cache: the battery's charge, and the dot in plain appearance. */
  warm: string
  /** A cold cache's dot in plain appearance. */
  cold: string
  amberBg: string
  amberFg: string
  meterTrack: string
  meterFill: string
  /** The expanded view's cards: fill, edge, and their values. */
  cardBg: string
  cardBorder: string
  cardValue: string
  /** Hover explanations, a step above the cards. */
  tooltipBg: string
  /** A bar track's edge, so the track reads against any ground. */
  trackStroke: string
  /** The cache battery's charge, calm and in its last minute. */
  batteryFill: string
  batteryAmber: string
  /** The cost pill's coin. */
  coin: string
  /** The 5-hour and 7-day chips' tints: background, text, and bar and icons. */
  fiveBg: string
  fiveFg: string
  fiveAccent: string
  weekBg: string
  weekFg: string
  weekAccent: string
}

export const DARK: Readonly<Palette> = {
  filled: true,
  surface: '#2b2b33',
  value: '#ececf2',
  label: '#9a9aa4',
  warm: '#7fcf8a',
  cold: '#6f6f7a',
  amberBg: '#3a2f17',
  amberFg: '#f0c969',
  meterTrack: '#45454f',
  meterFill: '#b8b8c2',
  cardBg: '#2a2a31',
  cardBorder: '#76767f',
  cardValue: '#c4c4cc',
  tooltipBg: '#303037',
  trackStroke: '#7c7c86',
  batteryFill: '#24402b',
  batteryAmber: '#5a4719',
  coin: '#c9a54a',
  fiveBg: '#1e3324',
  fiveFg: '#cfe8d3',
  fiveAccent: '#7fcf8a',
  weekBg: '#2a2540',
  weekFg: '#d9d3f5',
  weekAccent: '#a99cf0',
}

export const LIGHT: Readonly<Palette> = {
  filled: true,
  surface: '#ededf2',
  value: '#1d1d22',
  label: '#63636e',
  warm: '#2f8a45',
  cold: '#a0a0aa',
  amberBg: '#fbeccd',
  amberFg: '#7a4e06',
  meterTrack: '#d6d6de',
  meterFill: '#55555f',
  cardBg: '#f4f4f7',
  cardBorder: '#9a9aa4',
  cardValue: '#3a3a42',
  tooltipBg: '#ffffff',
  trackStroke: '#9a9aa4',
  batteryFill: '#cfe8d3',
  batteryAmber: '#f3d9a0',
  coin: '#9a7414',
  fiveBg: '#dff0e0',
  fiveFg: '#1f5c2e',
  fiveAccent: '#2f8a45',
  weekBg: '#e8e4fa',
  weekFg: '#3c3489',
  weekAccent: '#6b5fd3',
}

// No backgrounds at all: every colour is a theme key, so it follows whatever
// theme the user has. The safe fallback, and what NO_COLOR terminals want.
export const PLAIN: Readonly<Palette> = {
  filled: false,
  surface: '',
  value: 'text',
  label: 'subtle',
  warm: 'success',
  cold: 'subtle',
  amberBg: '',
  amberFg: 'warning',
  meterTrack: 'subtle',
  meterFill: 'text',
  cardBg: '',
  cardBorder: 'subtle',
  cardValue: 'text',
  tooltipBg: '',
  trackStroke: 'subtle',
  batteryFill: '',
  batteryAmber: '',
  coin: 'warning',
  fiveBg: '',
  fiveFg: 'text',
  fiveAccent: 'success',
  weekBg: '',
  weekFg: 'text',
  weekAccent: 'text',
}

/** The palette CC_BAND_APPEARANCE names; NO_COLOR forces plain. */
export const resolvePalette = (appearance: string | undefined, noColor: string | undefined): Readonly<Palette> =>
  noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK

/** Colours for what sits on the band's bare ground, which is the host's and
 *  may be dark or light whatever the palette says. Text there takes theme
 *  keys; an icon needs hex, so these hold 3:1 on dark and light grounds
 *  alike. The branch icon is the band's one blue: it means git, never a
 *  status. */
export const BARE = {
  value: 'text',
  label: 'subtle',
  icon: '#80808a',
  branch: '#5c85d6',
} as const
