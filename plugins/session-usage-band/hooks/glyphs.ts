// The terminal's glyph tier. East-Asian-Ambiguous glyphs (█ ▓ ▒ ▌ │ · Σ … ±)
// draw two columns wide in a CJK locale, or with a terminal's "ambiguous is
// wide" option, while Ink counts one, so the row would overflow. The ascii
// tier draws ASCII alone; every mapping is one character at most, so the
// squeeze, measured before it, never undercounts. Braille is Neutral width and
// stays in the unicode tier. Unicode EastAsianWidth-18.0.0, checked 2026-10-09.

import type { BandSnapshot, Glyphs } from './snapshot'

const CJK = /^(ja|zh|ko)([_.-]|$)/i

/** The tier a session draws in: as asked by CC_BAND_GLYPHS, else ascii in a
 *  CJK locale (the first of LC_ALL, LC_CTYPE and LANG that is set wins). */
export const resolveGlyphs = (env: Readonly<{ CC_BAND_GLYPHS?: string; LC_ALL?: string; LC_CTYPE?: string; LANG?: string }>): Glyphs => {
  const asked = env.CC_BAND_GLYPHS?.toLowerCase()
  if (asked === 'ascii' || asked === 'unicode') return asked
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || ''
  return CJK.test(locale) ? 'ascii' : 'unicode'
}

/** The tier the band draws in: the session's on a terminal, where
 *  ambiguous-width glyphs can draw wide; its own glyphs on every other surface. */
export const drawnTier = (snap: Pick<BandSnapshot, 'surface' | 'glyphs'>): Glyphs => (snap.surface === 'terminal' ? snap.glyphs : 'unicode')

/** Each glyph the band draws, in ASCII; an empty mapping drops the glyph. */
export const ASCII_MAP: Readonly<Record<string, string>> = {
  '█': '#', '░': '-', '▒': ':', '│': '|', '·': '-', '…': '.', '±': '+',
  '●': '*', '■': '#', '–': '-', '↑': '+', '↓': '-', '▿': 'v', '▵': '^',
  '↻': '', 'Σ': '', '◷': '', '◔': '',
  // A hover card's caps: a space each keeps its width. ▐ is Neutral, but
  // goes with ▌ so a card's two ends match.
  '▐': ' ', '▌': ' ',
}

/** `s` in ASCII: a spaced separator a comma, since ` - ` between numbers
 *  reads as a minus, and a screen reader says so; then each glyph mapped,
 *  and any other non-ASCII character dropped alone. A glyph mapped to
 *  nothing takes the one space after it, so no gap is left where it was. */
export const asciiText = (s: string): string => {
  const chars = [...s.replace(/ · /g, ', ')]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? ''
    const mapped = ASCII_MAP[ch]
    if (mapped === '' && chars[i + 1] === ' ') i++
    out += mapped ?? (ch.charCodeAt(0) < 0x80 ? ch : '')
  }
  return out
}

type Node = { props?: Record<string, unknown>; children?: unknown[] }

/** The tree with every string, and every Button label, in ASCII. A node
 *  gains no field it didn't have. */
export const asciiTree = <T>(tree: T): T => {
  const walk = (k: unknown): unknown => {
    if (typeof k === 'string') return asciiText(k)
    if (Array.isArray(k)) return k.map(walk)
    if (k === null || typeof k !== 'object') return k
    const node = k as Node
    const label = node.props?.label
    return {
      ...node,
      ...(typeof label === 'string' ? { props: { ...node.props, label: asciiText(label) } } : {}),
      ...(node.children === undefined ? {} : { children: node.children.map(walk) }),
    }
  }
  return walk(tree) as T
}
