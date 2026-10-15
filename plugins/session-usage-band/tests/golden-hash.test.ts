// The golden capture's fingerprint: FNV-1a, and the canonical tree it hashes.

import { test, expect } from 'claude-code/testing'
import { canon, fnv1a, treeHash } from './golden/hash'

test('fnv1a matches the published test vectors', () => {
  expect(fnv1a('')).toBe('811c9dc5')
  expect(fnv1a('a')).toBe('e40c292c')
  expect(fnv1a('foobar')).toBe('bf9cf968')
})

test('canon sorts keys and drops functions, so equal trees hash equal', () => {
  const a = { type: 'Box', props: { key: 'row', onPress: () => undefined, flexGrow: 1 }, children: ['x'] }
  const b = { children: ['x'], props: { flexGrow: 1, key: 'row' }, type: 'Box' }
  expect(canon(a)).toEqual(canon(b))
  expect(treeHash(a)).toBe(treeHash(b))
  expect(treeHash({ ...b, children: ['y'] })).not.toBe(treeHash(b))
})

test("canon drops the engine's press handles, which renumber between tests", () => {
  const a = { type: 'Button', props: { key: 'more', label: '▿', press: { plugin: 'session-usage-band', handle: 225709673 } } }
  const b = { type: 'Button', props: { key: 'more', label: '▿', press: { plugin: 'session-usage-band', handle: 225709693 } } }
  expect(treeHash(a)).toBe(treeHash(b))
})

test("canon drops the engine's own marks, which only some engine versions add", () => {
  const a = { type: 'Box', props: { flexDirection: 'column' }, children: [{ type: 'Text', props: { bold: true }, children: ['$2.41'] }] }
  const b = { ...a, part: { plugin: 'session-usage-band' }, children: [{ type: 'Text', props: { bold: true, weight: 'semibold' }, children: ['$2.41'] }] }
  expect(treeHash(a)).toBe(treeHash(b))
  // A weight the band asks for itself still counts.
  const c = { type: 'Text', props: { weight: 'semibold' }, children: ['x'] }
  expect(treeHash(c)).not.toBe(treeHash({ ...c, props: {} }))
})

test('canon reads every clock time alike, so a tree hashes the same in every zone', () => {
  const at = (when: string) => ({ type: 'Text', props: { key: 'when' }, children: [when, ' · full before reset'] })
  expect(treeHash(at('Sat 13:30'))).toBe(treeHash(at('02:00')))
  expect(treeHash(at('Sat 13:30'))).toBe(treeHash(at('Sun 23:59')))
  // A countdown is no clock: under ten minutes it reads M:SS.
  expect(treeHash(at('0:47'))).not.toBe(treeHash(at('9:47')))
  expect(treeHash(at('1h 05m'))).not.toBe(treeHash(at('Sat 13:30')))
})
