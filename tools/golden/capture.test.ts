// tools/golden/capture.test.ts — copied into a scratch copy of the plugin by
// capture.sh for one run; prints GOLDEN, TREE and PERF lines, never asserts.
import { test } from 'claude-code/testing'
import { GOLDEN_APPEARANCES, GOLDEN_MOUNTS, SCENARIO_NAMES, drawCases, goldenKey } from './cases'
import { canon, treeHash } from './golden/hash'
import { LONG, START, mountBand, resp, respond, setup } from './helpers'

/** The cases kept whole, so a failure can be read and diffed. */
const FULL = new Set([
  'calm|dark|terminal|40|40|open', 'calm|dark|desktop|95|40|open', 'lastMinute|dark|terminal|40|40|shut',
  'cold|dark|desktop|200|40|open', 'nearCompaction|plain|terminal|95|40|open', 'fiveHourAhead|dark|desktop|40|40|shut',
  'gatewaySpend|dark|desktop|200|40|open', 'resetPassed|dark|terminal|95|40|open', 'notARepo|plain|desktop|200|40|open',
  'working|dark|terminal|200|40|shut',
])

for (const scenario of SCENARIO_NAMES) for (const appearance of GOLDEN_APPEARANCES) {
  test(`golden ${scenario} ${appearance}`, LONG, async ($, on) => {
    const trees = await drawCases($, on, { scenario, appearance }, GOLDEN_MOUNTS)
    for (const [drawn, tree] of Object.entries(trees)) {
      const key = goldenKey(scenario, appearance, drawn)
      console.log(`GOLDEN ${key} ${treeHash(tree)}`)
      if (FULL.has(key)) console.log(`TREE ${key} ${JSON.stringify(canon(tree))}`)
    }
  })
}

test('perf baseline', LONG, async ($, on) => {
  const t0 = performance.now()
  let spin = 0
  for (let i = 0; i < 2e6; i++) spin += i
  console.log(`PERF clockReal ${performance.now() - t0 > 0} ${spin > 0}`)
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface, 200)
    for (const open of [false, true]) {
      if (open) await ui.press({ key: 'more' })
      for (let i = 0; i < 20; i++) await ui.redraw()
      const times: number[] = []
      for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); times.push(performance.now() - a) }
      times.sort((x, y) => x - y)
      console.log(`PERF chips ${surface} ${open ? 'open' : 'shut'} median=${times[100]?.toFixed(3)}ms p95=${times[190]?.toFixed(3)}ms`)
    }
    // Shut it again: being open is stored, so the next mount would start open.
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
})
