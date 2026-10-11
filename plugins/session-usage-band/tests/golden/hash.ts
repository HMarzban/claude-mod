// A drawn tree as a short, stable fingerprint: the golden capture keeps
// hashes, not trees, so it stays small enough to commit.

/** A local clock time, `13:30` or `Sat 13:30`: never a countdown, which
 *  reads `1h 05m`, or under ten minutes `M:SS` with a one-digit minute. */
const CLOCK = /\b(?:(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat) )?\d\d:\d\d\b/g

/** `v` with object keys sorted, functions and the engine's `press` handles
 *  dropped, and every clock time read alike: handlers differ by identity
 *  between draws, the engine numbers each Button's press handle as a file's
 *  tests run, key order is not part of what is drawn, and a clock time is the
 *  host's zone's, which the kit can't pin, so a capture holds in every zone.
 *  The readings' tests hold each clock time to its zone. */
export const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon)
  if (typeof v === 'string') return v.replace(CLOCK, '⟨clock⟩')
  if (v === null || typeof v !== 'object') return v
  const o = v as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .filter(k => k !== 'press' && typeof o[k] !== 'function' && o[k] !== undefined)
      .map(k => [k, canon(o[k])]),
  )
}

/** 32-bit FNV-1a over UTF-16 code units: the sandbox has no crypto we rely on. */
export const fnv1a = (s: string): string => {
  let h32 = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h32 ^= s.charCodeAt(i)
    h32 = Math.imul(h32, 0x01000193) >>> 0
  }
  return h32.toString(16).padStart(8, '0')
}

/** A tree's fingerprint: its hash and its canonical length. */
export const treeHash = (tree: unknown): string => {
  const json = JSON.stringify(canon(tree))
  return `${fnv1a(json)}-${json.length}`
}
