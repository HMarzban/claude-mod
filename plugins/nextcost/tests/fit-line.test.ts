// The collapsed rows' give-way, and the line pulse and departures lay.

import { test, expect } from 'claude-code/testing'
import { ROW_SLACK } from '../hooks/layout'
import { fitLine, line, type Keeps } from '../hooks/views/frame'
import type { Amber } from '../hooks/words'
import { byKey, shown, type Node } from './helpers'
import { kitOf } from './matrix'

const kit = (columns = 120) => kitOf({ columns })
/** One cut line of plain text. */
const words = (k: ReturnType<typeof kit>, key: string, text: string) => k.oneLine({ key }, text)
const A: Amber = { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
/** A line in `room` columns: the band's row is its room and the slack. */
const said = (room: number) => {
  const k = kit(room + ROW_SLACK)
  return shown(fitLine(k, { calm: ['extra', 'more'], amber: ['amberShort'] } as const, keeps => line(k, [
    words(k, 'a', keeps.amber(A)),
    keeps.has('more') ? words(k, 'm', 'more words') : null,
    keeps.has('extra') ? words(k, 'e', 'extra words') : null,
  ], null, 2)))
}
/** The Keeps a line is built with at each step, first to last, where none fits. */
const steps = () => {
  const k = kit(ROW_SLACK)
  const seen: Keeps<'x' | 'amberShort' | 'pad'>[] = []
  fitLine(k, { calm: ['x'], amber: ['amberShort'], last: ['pad'] } as const, keeps => {
    seen.push(keeps)
    return line(k, [words(k, 'w', 'wide words')], null, 2)
  })
  return seen
}

test('a line drops its calm pieces in order, and shortens amber only after the last', () => {
  expect(said(60)).toMatch(/extra words/)
  expect(said(50)).not.toMatch(/extra words/)
  expect(said(50)).toMatch(/more words/)
  expect(said(35)).toMatch(/^! 47s left · re-warm/)
  expect(said(35)).not.toMatch(/more words/)
  expect(said(20)).toBe('! 47s')
})
test('amber steps come after every calm one, and any last step after them', () => {
  const at = steps()
  expect(at.map(k => [k.has('x'), k.has('amberShort'), k.has('pad')])).toEqual([
    [true, true, true],
    [false, true, true],
    [false, false, true],
    [false, false, false],
  ])
})
test('an amber piece is kept whole at every step; its part and its long words until amber gives way', () => {
  const at = steps()
  expect(at.map(k => [k.calm('x', 'calm'), k.calm('x', 'amber')])).toEqual([[true, true], [false, true], [false, true], [false, true]])
  expect(at.map(k => [k.part('x', 'calm'), k.part('x', 'amber')])).toEqual([[true, true], [false, true], [false, false], [false, false]])
  expect(at.map(k => k.amber(A))).toEqual([A.long, A.long, A.short, A.short])
})
test("a line's order is typed: a piece it doesn't name doesn't compile", () => {
  const k = kit()
  fitLine(k, { calm: ['x'], amber: ['amberShort'] } as const, keeps => {
    // @ts-expect-error: 'amberShrot' is no piece of this order.
    keeps.has('amberShrot')
    return line(k, [], null, 2)
  })
})
test('each piece of a line keeps its width; words truncate, never wrap', () => {
  const k = kit()
  const tree = line(k, [words(k, 'a', 'cache 52m')], null, 2) as unknown as Node
  expect((tree.children?.[0] as Node).props?.flexShrink).toBe(0)
  expect(byKey(tree, 'a', 'Text')?.props?.wrap).toBe('truncate-end')
  expect(shown(tree)).toBe('cache 52m')
})
