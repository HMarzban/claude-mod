import { test, expect } from 'claude-code/testing'
import { flaps, flapsWidth } from '../hooks/flaps'
import { makeKit } from '../hooks/kit'
import { PLAIN } from '../hooks/palette'
import { fakeEl, shown, svgsOf, type Node } from './helpers'
import { snapOf } from './matrix'

const RUNS = [['CACHE', '#7FCF8A'], ['LAST CALL 47S', '#F5B14C']] as const
const draw = (surface: 'desktop' | 'terminal', plain = false) =>
  flaps(makeKit(fakeEl, snapOf({ surface, ...(plain ? { palette: PLAIN } : {}) })), { key: 'f', alt: 'cache in its last minute', runs: RUNS, bg: '#262626', seam: '#0E0E0E' })

test('desktop: one Svg, a tile and a seam per character and blank, monospace, no id', () => {
  const svgs = svgsOf(draw('desktop'))
  expect(svgs).toHaveLength(1)
  const src = String(svgs[0]?.props?.source)
  expect(src.match(/class="tile"/g)).toHaveLength('CACHE'.length + 1 + 'LAST CALL 47S'.length)
  expect(src.match(/class="seam"/g)?.length).toBe(src.match(/class="tile"/g)?.length)
  expect(src).toMatch(/ui-monospace, monospace/)
  expect(src).not.toMatch(/\bid=|preserveAspectRatio="none"/)
  expect(svgs[0]?.props?.width).toBe(flapsWidth(RUNS))
  expect(Number(svgs[0]?.props?.height)).toBeLessThanOrEqual(20)
})
test('desktop: every tile carries its text, spaces too, so the words read whole', () => {
  const src = String(svgsOf(draw('desktop'))[0]?.props?.source)
  expect([...src.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('')).toBe('CACHE LAST CALL 47S')
})
test('terminal: a Text per run on its ground; plain: bracketed, no ground', () => {
  const runs = (n: unknown) => ((n as Node).children as Node[]).map(k => [shown(k), k.props?.backgroundColor])
  expect(runs(draw('terminal'))).toEqual([['CACHE', '#262626'], ['LAST CALL 47S', '#262626']])
  expect(runs(draw('terminal', true))).toEqual([['[CACHE]', undefined], ['[LAST CALL 47S]', undefined]])
})
test('flap text is escaped', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  const src = String(svgsOf(flaps(k, { key: 'f', alt: 'a', runs: [['<&>', '#fff']], bg: '#222', seam: '#000' }))[0]?.props?.source)
  expect(src).toMatch(/&lt;[\s\S]*&amp;[\s\S]*&gt;/)
})
