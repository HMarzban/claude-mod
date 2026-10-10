import { test, expect } from 'claude-code/testing'
import { ASCII_MAP, asciiText, resolveGlyphs } from '../hooks/glyphs'
import { ROW_SLACK } from '../hooks/layout'
import { caseKey, drawCases, type Mount } from './matrix'
import {
  HOUR_1, LONG, MIN, START, byKey, cards, firstRow, mountBand, pillOf, resp, respond, segments, setup, textOf, widthOf,
} from './helpers'

test('unicode by default, ascii on request or in a CJK locale', () => {
  expect(resolveGlyphs({})).toBe('unicode')
  expect(resolveGlyphs({ CC_BAND_GLYPHS: 'ascii' })).toBe('ascii')
  expect(resolveGlyphs({ LANG: 'ja_JP.UTF-8' })).toBe('ascii')
  expect(resolveGlyphs({ LANG: 'zh_CN.UTF-8', CC_BAND_GLYPHS: 'unicode' })).toBe('unicode')
})
test('LC_CTYPE alone picks the ascii tier', () => {
  expect(resolveGlyphs({ LANG: 'C', LC_CTYPE: 'ko_KR.UTF-8' })).toBe('ascii')
  expect(resolveGlyphs({ LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'ja_JP.UTF-8' })).toBe('unicode') // LC_ALL wins
})
test('the ascii tier never makes a row wider', () => {
  for (const [from, to] of Object.entries(ASCII_MAP)) expect([...to].length).toBeLessThanOrEqual([...from].length)
})
test('ascii text is pure ASCII, a dropped glyph takes its space, and padding stays', () => {
  expect(asciiText('◷ cache 52m · ↻ 3h 00m Σ 225k ↑2 ↓1 cache – ●… █░▒│▿▵■ ◔ ±')).toMatch(/^[\x20-\x7e]*$/)
  expect(asciiText('◷ cache 52m')).toBe('cache 52m')
  expect(asciiText('↻ in 3h 00m')).toBe('in 3h 00m')
  expect(asciiText('ITEM      STATUS')).toBe('ITEM      STATUS')
})
test('chips in the ascii tier draws only ASCII, within the row, shut and open', LONG, async ($, on) => {
  const m: Mount = { surface: 'terminal', cols: 120 }
  const trees = await drawCases($, on, { scenario: 'calm', appearance: 'dark', env: { CC_BAND_GLYPHS: 'ascii' } }, [m])
  const shut = trees[caseKey(m, 'shut')]
  const open = trees[caseKey(m, 'open')]
  expect(textOf(shut)).toMatch(/^[\x20-\x7e]*$/)
  expect(widthOf(firstRow(shut))).toBeLessThanOrEqual(120 - ROW_SLACK)
  expect(byKey(shut, 'more', 'Button')?.props?.label).toBe('v')
  // Opened (by key), the band stays ASCII and keeps its cards, and the toggle reads ^.
  expect(cards(open).length).toBeGreaterThan(0)
  expect(textOf(open)).toMatch(/^[\x20-\x7e]*$/)
  expect(byKey(open, 'more', 'Button')?.props?.label).toBe('^')
})
test('the ascii battery drops its glyph before the cut, so its charge and spacing hold', LONG, async ($, on) => {
  const clock = setup(on, { env: { ...HOUR_1, CC_BAND_GLYPHS: 'ascii' } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(52 * MIN) // 8 of the hour's 60 minutes left

  const ui = await mountBand($, 'terminal', 110)
  const seg = segments(pillOf(await ui.drawn(), 'cache'))
  const all = seg.map(x => x.text).join('')
  expect(all).toBe(' cache 8:00 ')
  expect(seg[0]?.text.length).toBe(Math.round((8 / 60) * all.length))
  await ui.unmount()
})
