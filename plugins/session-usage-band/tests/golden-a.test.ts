// tests/golden-a.test.ts — golden, scenarios 1–10. Golden doesn't cover the
// light palette, maxRows under 40, or the ascii tier.
import { test, expect } from 'claude-code/testing'
import { GOLDEN } from './golden/chips'
import { treeHash } from './golden/hash'
import { goldenSuite } from './golden/suite'
import { GOLDEN_SCENARIOS, caseKey, drawCases, goldenKey, type Mount } from './matrix'
import { LONG } from './helpers'

goldenSuite(GOLDEN_SCENARIOS.slice(0, 10))

test('chips stored explicitly draws the same as nothing stored', LONG, async ($, on) => {
  const m: Mount = { surface: 'desktop', cols: 95 }
  const trees = await drawCases($, on, { scenario: 'calm', appearance: 'dark', layout: 'chips' }, [m])
  for (const state of ['shut', 'open'] as const) expect(treeHash(trees[caseKey(m, state)])).toBe(GOLDEN[goldenKey('calm', 'dark', caseKey(m, state))])
})
