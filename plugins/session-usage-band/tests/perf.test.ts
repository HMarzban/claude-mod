// tests/perf.test.ts — each layout's draw time against chips', in the same
// run, its node budget, and that drawing never writes the store.
import { test, expect } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
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
/** Chips' medians, recorded by its own tests, which run first in this file. */
const CHIPS: Record<string, number> = {}
const ORDERED = ['chips', ...LAYOUT_NAMES.filter(l => l !== 'chips')] as const

for (const scenario of ['calm', 'lastMinute'] as const) for (const layout of ORDERED) {
  test(`perf: ${layout}, ${scenario}`, LONG, async ($, on) => {
    const cols = scenario === 'calm' ? 200 : 60
    const mounts: Mount[] = [{ surface: 'terminal', cols }, { surface: 'desktop', cols }]
    const trees = await drawCases($, on, { layout, scenario, appearance: 'dark', ttl: scenario === 'lastMinute' ? '5m' : '1h' }, mounts)
    for (const m of mounts) {
      expect(nodes(trees[caseKey(m, 'shut')])).toBeLessThanOrEqual(400)
      expect(nodes(trees[caseKey(m, 'open')])).toBeLessThanOrEqual(1500)
      const ui = await mountBand($, m.surface, m.cols)
      for (const state of ['shut', 'open'] as const) {
        if (state === 'open') await ui.press({ key: 'more' })
        const key = `${scenario}|${m.surface}|${cols}|${state}`
        const writes = engine.storeSets.length
        // A file's first draws run cold, so chips, the yardstick, is timed
        // after an untimed pass of its own.
        if (layout === 'chips') await medianOf(ui)
        const ms = await medianOf(ui)
        expect(engine.storeSets.length).toBe(writes)
        if (layout === 'chips') CHIPS[key] = ms
        console.log(`PERF ${layout} ${key} median=${ms.toFixed(3)}ms`)
        if (layout !== 'chips') expect(ms).toBeLessThanOrEqual(2 * (CHIPS[key] ?? 0) + 0.05)
      }
      await ui.press({ key: 'more' })
      await ui.unmount()
    }
  })
}
