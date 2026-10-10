// The registry and the dispatch: every layout name has its view, a view's
// rows follow where Svg draws, and drawBand draws the stored layout from 40
// columns, chips below them or in place of a view that throws.

import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { DARK, PLAIN } from '../hooks/palette'
import { readingsOf } from '../hooks/reading'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { VIEWS } from '../hooks/views/index'
import { rowsOf, type View } from '../hooks/views/view'
import { EMPTY } from '../hooks/words'
import { fakeEl, shown, walk } from './helpers'
import { NO_ACT, snapOf } from './matrix'

const marker: View = { name: 'ledger', rows: { desktop: 1, terminal: 1 }, draw: () => ({ type: 'Text', props: {}, children: ['LEDGER'] }) as unknown as RenderElement }
const boom: View = { ...marker, draw: () => { throw new Error('boom') } }

test('every layout name has a view of that name', () => {
  expect(Object.keys(VIEWS).sort()).toEqual([...LAYOUT_NAMES].sort())
  for (const name of LAYOUT_NAMES) expect(VIEWS[name].name).toBe(name)
})
test('the rows a view declares follow where Svg draws', () => {
  const rows = { rows: { desktop: 2, terminal: 1 } }
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'desktop' })))).toBe(2)
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'desktop', palette: PLAIN })))).toBe(1)
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'terminal' })))).toBe(1)
})
test('drawn outside a mount, the band reads as it does mounted', () => {
  expect(shown(drawBand(fakeEl, snapOf(), NO_ACT))).toMatch(/cache 52m/)
})
test('the stored layout draws, from 40 columns', () => {
  expect(shown(drawBand(fakeEl, snapOf({ layout: 'ledger', columns: 40 }), NO_ACT, { ...VIEWS, ledger: marker }))).toBe('LEDGER')
})
test('below 40 columns every layout draws chips', () => {
  const band = shown(drawBand(fakeEl, snapOf({ layout: 'ledger', columns: 39 }), NO_ACT, { ...VIEWS, ledger: marker }))
  expect(band).not.toMatch(/LEDGER/)
  expect(band).toMatch(/cache 52m/)
})
test('a view that throws falls back to chips', () => {
  expect(shown(drawBand(fakeEl, snapOf({ layout: 'ledger' }), NO_ACT, { ...VIEWS, ledger: boom }))).toMatch(/\$3\.19/)
})
test('every new view draws its empty states in a label\'s ink', () => {
  // Departures writes them on its board, upper case, in the board's ink.
  // At 40 columns pulse's desktop says its short costs.
  const layouts = LAYOUT_NAMES.filter(name => name !== 'chips' && name !== 'departures')
  const phrases = Object.values(EMPTY)
  const inks: string[] = []
  for (const layout of layouts)
    for (const surface of ['terminal', 'desktop'] as const)
      for (const expanded of [false, true])
        for (const columns of [160, 40]) {
          const snap = snapOf({
            layout, surface, expanded, columns, maxRows: 40,
            lastTurnUsd: null,
            context: { tokens: undefined, window: 200_000, percent: undefined, compactAt: undefined, autoCompactOff: false },
            fiveHour: undefined, sevenDay: undefined,
          })
          walk(VIEWS[layout].draw(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT), n => {
            const text = (n.children ?? []).every(k => typeof k === 'string') ? (n.children ?? []).join('') : ''
            if (n.type === 'Text' && phrases.some(e => text.includes(e))) inks.push(`${layout} ${surface} ${columns}${expanded ? ' open' : ''} "${text}" ${String(n.props?.color === DARK.label ? 'label' : n.props?.color)}`)
          })
        }
  expect(new Set(inks.map(i => i.split(' ')[0]))).toEqual(new Set(layouts))
  expect(phrases.filter(e => !inks.some(i => i.includes(e)))).toEqual([])
  expect(inks.filter(i => !i.endsWith(' label'))).toEqual([])
})
