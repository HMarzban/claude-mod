// tests/perf.test.ts — each layout's draw time against chips', in the same
// run, its node budget, and that drawing never writes the store.
import type { On } from 'claude-code'
import { test, expect, type Engine } from 'claude-code/testing'
import { LAYOUT_NAMES, type LayoutName } from '../hooks/snapshot'
import { LONG, engine, mountBand, walk } from './helpers'
import { caseKey, drawCases, type Mount } from './matrix'

const nodes = (tree: unknown): number => { let n = 0; walk(tree, () => { n++ }); return n }
/** What timing needs of a mounted band, on either surface. */
type Drawn = Readonly<{ redraw: () => Promise<void>; drawn: () => Promise<unknown> }>
const medianOf = async (ui: Drawn): Promise<number> => {
  for (let i = 0; i < 20; i++) await ui.redraw()
  const t: number[] = []
  for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); t.push(performance.now() - a) }
  return t.sort((x, y) => x - y)[100] ?? 0
}
const SCENARIOS = ['calm', 'lastMinute'] as const
type Scenario = (typeof SCENARIOS)[number]
/** `layout` drawn in `scenario` on both surfaces, shut and open, held to its
 *  node budgets and to no store write while drawing: each case's median, by
 *  `scenario|surface|cols|state`. */
const timed = async ($: Engine, on: On, layout: LayoutName, scenario: Scenario): Promise<Record<string, number>> => {
  const cols = scenario === 'calm' ? 200 : 60
  const mounts: Mount[] = [{ surface: 'terminal', cols }, { surface: 'desktop', cols }]
  const trees = await drawCases($, on, { layout, scenario, appearance: 'dark', ttl: scenario === 'lastMinute' ? '5m' : '1h' }, mounts)
  const medians: Record<string, number> = {}
  for (const m of mounts) {
    expect(nodes(trees[caseKey(m, 'shut')])).toBeLessThanOrEqual(400)
    expect(nodes(trees[caseKey(m, 'open')])).toBeLessThanOrEqual(1500)
    const ui = await mountBand($, m.surface, m.cols)
    for (const state of ['shut', 'open'] as const) {
      if (state === 'open') await ui.press({ key: 'more' })
      const writes = engine.storeSets.length
      medians[`${scenario}|${m.surface}|${cols}|${state}`] = await medianOf(ui)
      expect(engine.storeSets.length).toBe(writes)
    }
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return medians
}
/** Each layout's medians, by case. */
const MEDIANS: Partial<Record<LayoutName, Record<string, number>>> = {}

// A file's first draws run cold for seconds, so every layout is drawn once,
// untimed, before any is timed.
for (const layout of LAYOUT_NAMES) test(`perf: warm-up, ${layout}`, LONG, async ($, on) => { await timed($, on, layout, 'calm') })

for (const scenario of SCENARIOS) for (const layout of LAYOUT_NAMES) {
  test(`perf: ${layout}, ${scenario}`, LONG, async ($, on) => {
    const medians = await timed($, on, layout, scenario)
    for (const [key, ms] of Object.entries(medians)) console.log(`PERF ${layout} ${key} median=${ms.toFixed(3)}ms`)
    MEDIANS[layout] = { ...MEDIANS[layout], ...medians }
  })
}

test('perf: every layout draws within 2× chips', () => {
  // Two scenarios, two surfaces, shut and open.
  for (const layout of LAYOUT_NAMES) expect(Object.keys(MEDIANS[layout] ?? {})).toHaveLength(8)
  const chips = MEDIANS.chips ?? {}
  for (const layout of LAYOUT_NAMES.filter(l => l !== 'chips')) {
    for (const [key, ms] of Object.entries(MEDIANS[layout] ?? {})) {
      const yardstick = chips[key] ?? 0
      console.log(`PERF ${layout} ${key} ${(ms / yardstick).toFixed(2)}x chips`)
      expect(ms).toBeLessThanOrEqual(2 * yardstick + 0.05)
    }
  }
})
