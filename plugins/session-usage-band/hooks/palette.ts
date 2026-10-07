// ── appearance ─────────────────────────────────────────────────────────
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
  muted: string
  warmBg: string
  warmFg: string
  soonBg: string
  soonFg: string
  coldBg: string
  coldFg: string
}

export const DARK: Palette = {
  filled: true,
  surface: '#2b2b33',
  value: '#ececf2',
  label: '#7e7e8a',
  muted: '#8a8a94',
  warmBg: '#1e3324',
  warmFg: '#9fd6a3',
  soonBg: '#3a2f17',
  soonFg: '#f0c969',
  coldBg: '#2a2a2e',
  coldFg: '#9a9aa4',
}

export const LIGHT: Palette = {
  filled: true,
  surface: '#ededf2',
  value: '#1d1d22',
  label: '#8b8b96',
  muted: '#7a7a86',
  warmBg: '#dff0e0',
  warmFg: '#1f5c2e',
  soonBg: '#fbeccd',
  soonFg: '#7a4e06',
  coldBg: '#e6e6ea',
  coldFg: '#5c5c66',
}

// No backgrounds at all: every colour is a theme key, so it follows whatever
// theme the user has. The safe fallback, and what NO_COLOR terminals want.
export const PLAIN: Palette = {
  filled: false,
  surface: '',
  value: 'text',
  label: 'subtle',
  muted: 'subtle',
  warmBg: '',
  warmFg: 'success',
  soonBg: '',
  soonFg: 'warning',
  coldBg: '',
  coldFg: 'subtle',
}

/** The palette CC_BAND_APPEARANCE names; NO_COLOR forces plain. */
export const resolvePalette = (appearance: string | undefined, noColor: string | undefined): Palette =>
  noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK
