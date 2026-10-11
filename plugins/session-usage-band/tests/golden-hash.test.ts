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
