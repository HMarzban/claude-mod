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
  dotWarm: string
  dotCold: string
  amberBg: string
  amberFg: string
  meterTrack: string
  meterFill: string
  cardBg: string
}

export const DARK: Palette = {
  filled: true,
  surface: '#2b2b33',
  value: '#ececf2',
  label: '#8a8a94',
  dotWarm: '#7fcf8a',
  dotCold: '#6f6f7a',
  amberBg: '#3a2f17',
  amberFg: '#f0c969',
  meterTrack: '#45454f',
  meterFill: '#b8b8c2',
  cardBg: '#1f1f25',
}

export const LIGHT: Palette = {
  filled: true,
  surface: '#ededf2',
  value: '#1d1d22',
  label: '#6e6e7a',
  dotWarm: '#2f8a45',
  dotCold: '#a0a0aa',
  amberBg: '#fbeccd',
  amberFg: '#7a4e06',
  meterTrack: '#d6d6de',
  meterFill: '#55555f',
  cardBg: '#ffffff',
}

// No backgrounds at all: every colour is a theme key, so it follows whatever
// theme the user has. The safe fallback, and what NO_COLOR terminals want.
export const PLAIN: Palette = {
  filled: false,
  surface: '',
  value: 'text',
  label: 'subtle',
  dotWarm: 'success',
  dotCold: 'subtle',
  amberBg: '',
  amberFg: 'warning',
  meterTrack: 'subtle',
  meterFill: 'text',
  cardBg: '',
}

/** The palette CC_BAND_APPEARANCE names; NO_COLOR forces plain. */
export const resolvePalette = (appearance: string | undefined, noColor: string | undefined): Palette =>
  noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK
