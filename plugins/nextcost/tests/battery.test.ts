// The cache's battery, chips' alone: on the desktop an icon whose charge bar
// fills with what is left; on a text surface the pill itself, its leading
// characters on the charge's ground.

import { test, expect } from 'claude-code/testing'
import { batteryIcon, textBattery } from '../hooks/battery'
import { makeKit } from '../hooks/kit'
import { DARK, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { fakeEl, fillWidth, segments, svgRect, type Node } from './helpers'
import { snapOf } from './matrix'

const kitOf = (over: Partial<BandSnapshot> = {}) => makeKit(fakeEl, snapOf(over))
/** A text battery's segments: each side of the cut, its text and its ground. */
const sides = (charge: number, text: string, over: Partial<BandSnapshot> = {}, tone: 'calm' | 'amber' = 'calm') =>
  segments({ children: textBattery(kitOf(over), charge, tone, text) })

test('on a text surface the charge is the ground of the leading characters, the rest on the surface', () => {
  expect(sides(0.5, 'cache 50m')).toEqual([{ text: ' cache', bg: DARK.batteryFill }, { text: ' 50m ', bg: DARK.surface }])
  // Amber's grounds, in their place.
  expect(sides(0.5, 'cache 50m', {}, 'amber')).toEqual([{ text: ' cache', bg: DARK.batteryAmber }, { text: ' 50m ', bg: DARK.amberBg }])
})

test('a full or empty battery is one side alone, and a charge past either end holds at it', () => {
  expect(sides(1, '50m')).toEqual([{ text: ' 50m ', bg: DARK.batteryFill }])
  expect(sides(1.5, '50m')).toEqual([{ text: ' 50m ', bg: DARK.batteryFill }])
  expect(sides(0, '50m')).toEqual([{ text: ' 50m ', bg: DARK.surface }])
  expect(sides(-1, '50m')).toEqual([{ text: ' 50m ', bg: DARK.surface }])
})

test('in the ascii tier the text is mapped before the cut, so a dropped glyph takes none of the charge', () => {
  // `◷ ` maps to nothing, so 60% is three of ` 50m `'s five cells, where
  // cut first it would be four of ` ◷ 50m `'s seven and leave two drawn.
  expect(sides(0.6, '◷ 50m', { glyphs: 'ascii' })).toEqual([{ text: ' 50', bg: DARK.batteryFill }, { text: 'm ', bg: DARK.surface }])
  expect(sides(0.6, '◷ 50m')).toEqual([{ text: ' ◷ 5', bg: DARK.batteryFill }, { text: '0m ', bg: DARK.surface }])
})

/** The desktop's battery icon, drawn at `charge`. */
const icon = (charge: number, tone: 'calm' | 'amber' = 'calm', px?: number) =>
  batteryIcon(kitOf({ surface: 'desktop' }), charge, tone, 'cache battery', px) as Node

test("on the desktop the icon's charge bar fills what is left of its inside, 22 px wide or as long as asked", () => {
  const svg = icon(0.5)
  expect([svg.props?.alt, svg.props?.width, svg.props?.height]).toEqual(['cache battery', 22, 12])
  // The inside is the width less 7 px of outline and cap.
  expect(fillWidth(svg)).toBe(7.5)
  expect(fillWidth(icon(0.5, 'calm', 40))).toBe(16.5)
  expect([fillWidth(icon(2)), fillWidth(icon(-1))]).toEqual([15, 0])
  expect(svgRect(String(icon(0.5, 'calm', 40).props?.source), 'charge')?.x).toBe(2.5)
})

test('the icon is outlined in label ink and charged warm; amber, both turn amber', () => {
  const inks = (svg: Node) => {
    const source = String(svg.props?.source)
    return [/stroke="([^"]+)"/.exec(source)?.[1], /class="charge"[^>]*fill="([^"]+)"/.exec(source)?.[1]]
  }
  expect(inks(icon(0.5))).toEqual([DARK.label, DARK.warm])
  expect(inks(icon(0.5, 'amber'))).toEqual([DARK.amberFg, DARK.amberFg])
})

test('where Svg draws nothing, the icon is nothing', () => {
  expect(batteryIcon(kitOf(), 0.5, 'calm', 'cache battery')).toBeNull()
  expect(batteryIcon(kitOf({ surface: 'desktop', palette: PLAIN }), 0.5, 'calm', 'cache battery')).toBeNull()
})
