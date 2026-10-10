// tests/golden/suite.ts — chips draws exactly what it drew before the
// layouts work: one test per scenario and appearance, each one setup with
// six mounts drawn shut and open, every case by hash and ten by whole tree.
import { test, expect } from 'claude-code/testing'
import { GOLDEN, GOLDEN_TREES } from './chips'
import { canon, treeHash } from './hash'
import { GOLDEN_APPEARANCES, GOLDEN_MOUNTS, drawCases, goldenKey, type ScenarioName } from '../matrix'
import { LONG } from '../helpers'

export const goldenSuite = (scenarios: readonly ScenarioName[]): void => {
  for (const scenario of scenarios) for (const appearance of GOLDEN_APPEARANCES) {
    test(`chips draws as before: ${scenario}, ${appearance}`, LONG, async ($, on) => {
      const trees = await drawCases($, on, { scenario, appearance }, GOLDEN_MOUNTS)
      for (const [drawn, tree] of Object.entries(trees)) {
        const key = goldenKey(scenario, appearance, drawn)
        expect(`${key} ${treeHash(tree)}`).toBe(`${key} ${GOLDEN[key]}`)
        const whole = GOLDEN_TREES[key]
        if (whole !== undefined) expect(canon(tree)).toEqual(canon(whole))
      }
    })
  }
}
