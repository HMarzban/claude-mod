// The band's charts: each draws an Svg on the desktop, with its alt and
// width, and text elsewhere. Every builder takes the kit first and a key.

import type { RenderChildren } from 'claude-code'
import { clamp01 } from './format'
import type { Kit } from './kit'
import { CHIP_BAR } from './layout'
import type { BarSize } from './layout'
import type { SliceMark, SliceRow, Tone } from './reading'

/** One decimal: enough for an Svg coordinate, short enough to read. */
const tenth = (n: number): number => Math.round(n * 10) / 10

/** A projection's dash, in every chart: where a mark is heading. */
const PROJECTION_DASH = 'stroke-dasharray="3 2"'
/** A guess's dash: a day cell or a slice whose value is yet to come. */
const GUESS_DASH = 'stroke-dasharray="2 2"'
/** A stretched chart's lines keep their stroke at any scale. */
const KEEP_STROKE = ' vector-effect="non-scaling-stroke"'

/** The largest value, 0 for none: the top of a chart's scale. */
const topOf = (values: ReadonlyArray<number | undefined>): number => Math.max(0, ...values.filter(v => v !== undefined))

/** Marks wrapped in an Svg of this size, one unit to a pixel; `attrs` adds
 *  to the root tag. */
const svgOf = (width: number, height: number, marks: string, attrs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${attrs}>${marks}</svg>`

// ---- braille --------------------------------------------------------------

/** Values as braille, two to a cell: the left column takes dots 7,3,2,1 from
 *  the bottom, the right 8,6,5,4. East-Asian-Neutral, so one column wide
 *  everywhere, as btop and termui draw their graphs. A value draws at least
 *  `floor` dots, so a chart's line or bars never vanish at the bottom. */
const LEFT = [0x40, 0x04, 0x02, 0x01] as const
const RIGHT = [0x80, 0x20, 0x10, 0x08] as const
export const braille = (values: readonly number[], max: number, floor = 0): string => {
  const level = (v: number | undefined) => (v === undefined || max <= 0 ? 0 : Math.max(floor, Math.min(4, Math.round((v / max) * 4))))
  let out = ''
  for (let i = 0; i < values.length; i += 2) {
    let bits = 0
    for (let d = 0; d < level(values[i]); d++) bits |= LEFT[d] ?? 0
    for (let d = 0; d < level(values[i + 1]); d++) bits |= RIGHT[d] ?? 0
    out += String.fromCodePoint(0x2800 + bits)
  }
  return out
}

/** A line chart in text: braille against the top of its scale, by default
 *  its largest value, on its floor. It never wraps: a row too narrow cuts it. */
const brailleText = (kit: Kit, key: string, values: readonly number[], color: string, top = topOf(values)): RenderChildren =>
  kit.oneLine({ key, color }, braille(values, top, 1))

/** Text cells, each a glyph and its ink, under one Text keyed `key`:
 *  neighbouring cells in one ink share a Text. */
const textRuns = (kit: Kit, key: string, cells: ReadonlyArray<readonly [string, string]>, color?: string): RenderChildren => {
  const { Text } = kit
  const runs: Array<{ text: string; ink: string }> = []
  for (const [text, ink] of cells) {
    const last = runs.at(-1)
    if (last?.ink === ink) last.text += text
    else runs.push({ text, ink })
  }
  const children = runs.map((run, i) => (
    <Text key={`run-${i}`} color={run.ink}>
      {run.text}
    </Text>
  ))
  return color === undefined ? <Text key={key}>{children}</Text> : <Text key={key} color={color}>{children}</Text>
}

/** The root of a chart that spans its slot: as wide as the band, so the slot
 *  caps it, its marks drawn to `width` and stretched to the slot. */
const stretchedOf = (kit: Kit, width: number, height: number, marks: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${kit.columns * kit.measure.pxPerCell}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${marks}</svg>`

/** A chart's ground: the track a meter runs on, behind the marks. */
const trackOf = (kit: Kit, width: number, height: number): string =>
  `<rect class="track" width="${width}" height="${height}" rx="3" fill="${kit.palette.meterTrack}" opacity="0.5"/>`

// ---- meter ----------------------------------------------------------------

/** The ground a slim bar's notch is knocked out of, either side of it. */
const SLIM_RING = 1.5

export type MeterOptions = Readonly<{
  key?: string
  label: string
  frac: number
  tone: Tone
  accent: string
  size?: BarSize
  /** An Svg with no width, capped by its slot: the shared cards' heads and
   *  bodies alone, since spec §2.9 bars it from every collapsed line. */
  stretch?: boolean
  /** What the fill is: what's used or what's left. */
  reads?: 'used' | 'left'
  /** A notch across the bar at this fraction, in label ink: a line the fill
   *  is measured against, such as how much of its window has gone. */
  tick?: number
  /** The ground the bar sits on, which knocks its notch out: the card's by default. */
  ground?: string
  /** Where the fill is heading, drawn dashed from its end. */
  projectTo?: number
  /** A projection's cell in text, `▒` unless said; dashed, `╌`. */
  dash?: string
  /** On the desktop, a card head's 4px bar, as gauges' board draws it: its
   *  track and fill 4px, its projection fainter, its notch 2×8 ringed in the
   *  ground. A stretched bar alone. */
  slim?: boolean
}>

/** A bar: `frac` filled toward its cap, the fill ending bare, since the
 *  number beside it says where. `label` names it for a reader, and `reads`
 *  says what the fill is. A stretched
 *  bar has no width of its own: drawn wider than any slot, the slot caps it,
 *  so it spans its card. */
export const meter = (kit: Kit, o: MeterOptions): RenderChildren => {
  const { Svg, Text, palette, onTone } = kit
  const { key = 'meter', label, frac, tone, accent, size = CHIP_BAR, stretch = false, reads = 'used', tick, projectTo, ground = palette.cardBg, dash = '▒', slim = false } = o
  const fill = onTone(tone, accent)
  const alt = `${label} ${Math.round(clamp01(frac) * 100)}% ${reads}`
  if (Svg && slim) {
    // Drawn at the slot's estimate, one unit to a pixel there, and stretched to it.
    const width = size.px
    const fillWidth = frac > 0 ? Math.max(4, Math.round(clamp01(frac) * width)) : 0
    const tickX = tick === undefined ? undefined : Math.max(SLIM_RING, Math.min(width - 2 - SLIM_RING, tenth(clamp01(tick) * width - 1)))
    const marks =
      `<rect class="track" y="2" width="${width}" height="4" rx="2" fill="${palette.meterTrack}"/>` +
      (projectTo === undefined
        ? ''
        : `<line class="projection" x1="${fillWidth}" y1="4" x2="${Math.round(clamp01(projectTo) * width)}" y2="4" stroke="${fill}" stroke-width="2" ${PROJECTION_DASH} opacity="0.75"${KEEP_STROKE}/>`) +
      (fillWidth > 0 ? `<rect class="fill" y="2" width="${fillWidth}" height="4" rx="2" fill="${fill}"/>` : '') +
      (tickX === undefined
        ? ''
        : `<rect class="knockout" x="${tenth(tickX - SLIM_RING)}" y="0" width="${2 + 2 * SLIM_RING}" height="8" fill="${ground}"/>` +
          `<rect class="tick" x="${tickX}" y="0" width="2" height="8" rx="1" fill="${palette.label}"/>`)
    return <Svg key={key} source={svgOf(width, 8, marks, ' preserveAspectRatio="none"')} alt={alt} height={8} />
  }
  if (Svg) {
    // Never name a local `h`: JSX compiles to the global h().
    const tall = 8
    // Twice the estimate, so the slot always caps it; corners in kind, so
    // they round true at the scale it lands on.
    const k = stretch ? 2 : 1
    const width = size.px * k
    const keep = stretch ? KEEP_STROKE : ''
    // A sliver under 6px reads as a dot or nothing: any use shows as a nub.
    // No clipPath: ids are document-wide where Svgs share a page, so a
    // rounded fill draws its own ends.
    const fillWidth = frac > 0 ? Math.max(6 * k, Math.round(clamp01(frac) * width)) : 0
    const tickX = tick === undefined ? undefined : Math.max(0, Math.min(width - 2 * k, tenth(clamp01(tick) * width - k)))
    const marks =
      `<rect x="${0.5 * k}" y="1.5" width="${width - k}" height="5" rx="${2.5 * k}" ry="2.5" fill="${palette.meterTrack}" stroke="${palette.trackStroke}"${keep}/>` +
      (projectTo === undefined
        ? ''
        : `<line class="projection" x1="${fillWidth}" y1="4" x2="${Math.round(clamp01(projectTo) * width)}" y2="4" stroke="${fill}" stroke-width="2" ${PROJECTION_DASH}${keep}/>`) +
      (fillWidth > 0 ? `<rect class="fill" y="1" width="${fillWidth}" height="6" rx="${3 * k}" ry="3" fill="${fill}"/>` : '') +
      // Knocked out of the ground a pixel either side, so it reads over the
      // fill and the track alike.
      (tickX === undefined
        ? ''
        : `<rect class="knockout" x="${tenth(tickX - k)}" y="-1" width="${4 * k}" height="${tall + 2}" fill="${ground}"/>` +
          `<rect class="tick" x="${tickX}" y="-1" width="${2 * k}" height="${tall + 2}" fill="${palette.label}"/>`)
    const source = svgOf(width, tall, marks, stretch ? ' preserveAspectRatio="none"' : '')
    return stretch ? (
      <Svg key={key} source={source} alt={alt} height={tall} />
    ) : (
      <Svg key={key} source={source} alt={alt} width={width} height={tall} />
    )
  }
  // Two glyphs only: partial blocks jitter across fonts and read as noise to
  // a screen reader. The number beside a meter carries the value.
  const filled = Math.round(clamp01(frac) * size.cells)
  // With neither mark, the two runs chips has always drawn.
  if (tick === undefined && projectTo === undefined) {
    return (
      <Text key={key} color={fill}>
        {'█'.repeat(filled)}
        {filled < size.cells ? <Text key="track" color={palette.meterTrack}>{'░'.repeat(size.cells - filled)}</Text> : null}
      </Text>
    )
  }
  // A projection takes the track's cells up to where it lands, and a tick the
  // one cell it falls in, so the bar keeps its width.
  const ahead = projectTo === undefined ? filled : Math.max(filled, Math.round(clamp01(projectTo) * size.cells))
  const tickAt = tick === undefined ? -1 : Math.min(size.cells - 1, Math.floor(clamp01(tick) * size.cells))
  const cells = Array.from({ length: size.cells }, (_, i): readonly [string, string] =>
    i === tickAt ? ['│', palette.label] : i < filled ? ['█', fill] : i < ahead ? [dash, fill] : ['░', palette.meterTrack],
  )
  return textRuns(kit, key, cells, fill)
}

// ---- split bar ------------------------------------------------------------

/** A part of a split bar: its amount, its colour and, in text, its fill. */
export type SplitPart = Readonly<{ n: number; color: string; mark: string }>

export type SplitBarOptions = Readonly<{
  key?: string
  alt: string
  parts: readonly SplitPart[]
  size: BarSize
  /** On the desktop, a card head's 4px bar on the track, as gauges' board
   *  draws it, each part at least a 2px sliver. */
  slim?: boolean
}>

/** A slim split's least part, so a small share still shows. */
const SLIVER_PX = 2

/** A bar split into parts, each its share of the whole, in its own colour
 *  and, in text, its own fill; nothing while the whole is none. */
export const splitBar = (kit: Kit, o: SplitBarOptions): RenderChildren => {
  const { Svg, Text, palette } = kit
  const { key = 'split', alt, parts, size, slim = false } = o
  const total = parts.reduce((sum, { n }) => sum + n, 0)
  if (total <= 0) return null
  const shown = parts.filter(({ n }) => n > 0)
  if (Svg && slim) {
    // Drawn at the slot's estimate and stretched to it; the slivers take
    // their 2px from the largest part.
    const width = size.px
    const widths = shown.map(({ n }) => Math.max(SLIVER_PX, (n / total) * width))
    const over = widths.reduce((sum, w) => sum + w, 0) - width
    const largest = widths.indexOf(Math.max(...widths))
    let x = 0
    // The ends round off, half the bar's height, as its track's do.
    const r = 2
    const segments = shown.map(({ color }, i) => {
      const x0 = tenth(x)
      x += i === largest ? (widths[i] ?? 0) - over : (widths[i] ?? 0)
      const x1 = tenth(x)
      const rounds = x1 - x0 >= r
      if (i === 0 && i < shown.length - 1 && rounds) return `<path class="part" d="M${x0 + r} 2H${x1}V6H${x0 + r}A${r} ${r} 0 0 1 ${x0 + r} 2Z" fill="${color}"/>`
      if (i === shown.length - 1 && i > 0 && rounds) return `<path class="part" d="M${x0} 2H${tenth(x1 - r)}A${r} ${r} 0 0 1 ${tenth(x1 - r)} 6H${x0}Z" fill="${color}"/>`
      return `<rect class="part" x="${x0}" y="2" width="${tenth(x1 - x0)}" height="4"${shown.length === 1 ? ` rx="${r}"` : ''} fill="${color}"/>`
    })
    const track = `<rect class="track" y="2" width="${width}" height="4" rx="${r}" fill="${palette.meterTrack}"/>`
    return <Svg key={key} source={svgOf(width, 8, track + segments.join(''), ' preserveAspectRatio="none"')} alt={alt} height={8} />
  }
  if (Svg) {
    // Drawn wider than any card and capped by it, like a stretched meter.
    // No clipPath, whose id would be page-wide: the end segments draw their
    // own rounded ends, as paths, the inner ones square.
    const width = size.px * 2
    const R = 6
    let x = 0
    const segments = shown.map(({ n, color }, i) => {
      const x0 = x
      x += (n / total) * width
      const first = i === 0
      const last = i === shown.length - 1
      // Each ends a pixel short of the next, so the ground divides them.
      const x1 = last ? x : Math.max(x0, x - 1)
      const f = (v: number) => v.toFixed(1)
      if (x1 - x0 < 2 * R || first === last) {
        return `<rect x="${f(x0)}" y="1" width="${f(x1 - x0)}" height="6"${first && last ? ` rx="${R}" ry="3"` : ''} fill="${color}"/>`
      }
      return first
        ? `<path d="M${f(x0 + R)} 1H${f(x1)}V7H${f(x0 + R)}A${R} 3 0 0 1 ${f(x0 + R)} 1Z" fill="${color}"/>`
        : `<path d="M${f(x0)} 1H${f(x1 - R)}A${R} 3 0 0 1 ${f(x1 - R)} 7H${f(x0)}Z" fill="${color}"/>`
    })
    return <Svg key={key} source={svgOf(width, 8, segments.join(''), ' preserveAspectRatio="none"')} alt={alt} height={8} />
  }
  let used = 0
  return (
    <Text key={key}>
      {parts.map(({ n, color, mark }, i) => {
        const count = i === parts.length - 1 ? size.cells - used : Math.round((n / total) * size.cells)
        used += count
        return (
          <Text key={`s${i}`} color={color}>
            {mark.repeat(Math.max(0, count))}
          </Text>
        )
      })}
    </Text>
  )
}

// ---- ring -----------------------------------------------------------------

export type RingOptions = Readonly<{
  key: string
  alt: string
  frac: number
  color: string
  px: number
  /** How much of its window has gone, as a notch across the ring; none on an empty ring. */
  notch?: number
  /** Where the fill is heading, its arc drawn dashed from the fill's end. */
  projectTo?: number
  /** The ground the ring sits on, which the notch is knocked out of: the card's unless said. */
  ground?: string
  /** A column of air after it, as an icon has: a spacer on the desktop, the
   *  glyph's own space elsewhere, since the desktop drops a bare one. */
  air?: boolean
}>

/** A text ring's glyphs, empty to full by quarters; the ascii tier's are
 *  wider than one cell, so a ring draws them itself, measured as drawn. */
const RING_GLYPHS = {
  unicode: ['○', '◔', '◑', '◕', '●'],
  ascii: ['( )', '(.)', '(o)', '(O)', '(@)'],
} as const

/** A ring filled clockwise from the top, its fill ending bare, since the
 *  figure beside it says where. Text has no rings: there it is a glyph to the
 *  nearest quarter, too small to carry a notch. */
export const ring = (kit: Kit, o: RingOptions): RenderChildren => {
  const { Svg, Text, palette, glyphs, gap } = kit
  const { key, alt, frac, color, px, notch, projectTo, ground = palette.cardBg, air = false } = o
  if (!Svg) return <Text key={key} color={color}>{`${RING_GLYPHS[glyphs][Math.round(clamp01(frac) * 4)]}${air ? ' ' : ''}`}</Text>
  // 2.5 px of stroke on a 6 px radius at 16 px, in proportion elsewhere.
  const stroke = tenth((px * 5) / 32)
  const mid = px / 2
  const r = (px * 3) / 8
  const circumference = 2 * Math.PI * r
  const arc = clamp01(frac) * circumference
  /** The point `f` of the way round, clockwise from the top, `out` past the radius. */
  const at = (f: number, out = 0) => `${tenth(mid + (r + out) * Math.sin(2 * Math.PI * f))} ${tenth(mid - (r + out) * Math.cos(2 * Math.PI * f))}`
  const circle = (extra: string) => `<circle cx="${mid}" cy="${mid}" r="${r}" fill="none" stroke-width="${stroke}"${extra}/>`
  let marks = circle(` stroke="${palette.meterTrack}"`)
  // A thin dashed arc on the track, a little faint, ending just short of a
  // whole turn, where an arc's ends would meet: 1.2 px wide at 16 px.
  const to = projectTo === undefined ? undefined : Math.min(clamp01(projectTo), 0.999)
  if (to !== undefined && to > frac) {
    marks += `<path class="projection" d="M${at(frac)}A${r} ${r} 0 ${to - frac > 0.5 ? 1 : 0} 1 ${at(to)}" fill="none" stroke="${color}" stroke-width="${tenth((px * 3) / 40)}" stroke-dasharray="1.3 1.3" opacity="0.85"/>`
  }
  if (arc > 0) marks += circle(` stroke="${color}" stroke-dasharray="${tenth(arc)} ${tenth(circumference)}" transform="rotate(-90 ${mid} ${mid})"`)
  if (notch !== undefined && frac > 0) {
    // In label ink across the ring and a pixel past it, knocked out of the
    // ground either side, so it reads over the fill and the track alike.
    const across = (width: number, ink: string, cls: string) =>
      `<path class="${cls}" d="M${at(notch, -stroke / 2 - 1)}L${at(notch, stroke / 2 + 0.4)}" stroke="${ink}" stroke-width="${width}"/>`
    marks += across(3.5, ground, 'knockout') + across(1.5, palette.label, 'notch')
  }
  const drawn = <Svg key={key} source={svgOf(px, px, marks)} alt={alt} width={px} height={px} />
  return air ? [drawn, gap(`${key} air`)] : drawn
}

// ---- sparkline ------------------------------------------------------------

export type SparklineOptions = Readonly<{
  key: string
  alt: string
  values: readonly number[]
  color: string
  px: number
  height: number
  /** The top of the scale, by default the largest value: a percentage
   *  passes 100, so its line and its projection share one scale. */
  max?: number
  /** Where the line is heading, as a fraction of the scale's top, drawn dashed. */
  projectTo?: number
  /** The most cells the text form takes: a longer trail is drawn at the
   *  highest of each run of points, so the whole of it shows in the room. */
  cells?: number
  /** On a track, as a pill's chart is; `area` shades beneath the line too. */
  track?: boolean
  area?: boolean
  /** Spanning its slot, as a card head's lens does, rather than `px` wide. */
  stretch?: boolean
  /** Rising across the chart, from its lowest point to its highest, under a
   *  1px cap in label ink at the top: where it is headed, as pulse's board
   *  draws the context. `max` gives way to it. */
  rise?: boolean
}>

/** The air a line keeps from the chart's edges. */
const SPARK_AIR = 2
/** A rising line's air beneath it, and the room above it its cap keeps, as
 *  pulse's board draws them: 14.6 down to 3.6 of 16. */
const RISE_FLOOR = 1.4
const RISE_ROOF = 3.6
/** The width a projection takes beyond the newest point. */
const SPARK_AHEAD = 20

/** `values` cut into at most `count` runs, each drawn at its highest. */
const peaksOf = (values: readonly number[], count: number): number[] =>
  values.length <= count
    ? [...values]
    : Array.from({ length: count }, (_, i) => Math.max(...values.slice(Math.floor((i * values.length) / count), Math.floor(((i + 1) * values.length) / count))))

/** A line over time, ending bare at its newest point. Text draws it in braille. */
export const sparkline = (kit: Kit, o: SparklineOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, values, color, px, height, max, projectTo, cells, track = false, area = false, stretch = false, rise = false } = o
  const top = max ?? topOf(values)
  if (!Svg) return brailleText(kit, key, cells === undefined ? values : peaksOf(values, 2 * cells), color, top)
  const end = px - SPARK_AIR - (projectTo === undefined ? 0 : SPARK_AHEAD)
  const x = (i: number) => (values.length <= 1 ? end : tenth(SPARK_AIR + (i * (end - SPARK_AIR)) / (values.length - 1)))
  const y = (frac: number) => tenth(height - SPARK_AIR - clamp01(frac) * (height - 2 * SPARK_AIR))
  // Risen, the lowest point sits on the floor and the highest under the cap.
  const low = Math.min(...values)
  const span = Math.max(...values) - low
  const risen = (v: number) => tenth(height - RISE_FLOOR - (span > 0 ? (v - low) / span : 0) * (height - RISE_FLOOR - RISE_ROOF))
  const points = values.map((v, i) => [x(i), rise ? risen(v) : y(top > 0 ? v / top : 0)] as const)
  const line = points.map(p => p.join(',')).join(' ')
  const keep = stretch ? KEEP_STROKE : ''
  // Beneath the line, so the line reads over it.
  let marks = track ? trackOf(kit, px, height) : ''
  if (area && points.length > 1) marks += `<polygon class="area" points="${points[0]?.[0]},${height} ${line} ${points.at(-1)?.[0]},${height}" fill="${color}" opacity="0.16"/>`
  if (rise) marks += `<line class="cap" x1="0" y1="0.5" x2="${px}" y2="0.5" stroke="${palette.label}" stroke-width="1"${keep}/>`
  if (points.length > 1) marks += `<polyline points="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"${keep}/>`
  const newest = points.at(-1)
  if (newest !== undefined && projectTo !== undefined) {
    const [nx, ny] = newest
    marks += `<line x1="${nx}" y1="${ny}" x2="${px - SPARK_AIR}" y2="${y(projectTo)}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" ${PROJECTION_DASH}${keep}/>`
  }
  return stretch ? (
    <Svg key={key} source={stretchedOf(kit, px, height, marks)} alt={alt} height={height} />
  ) : (
    <Svg key={key} source={svgOf(px, height, marks)} alt={alt} width={px} height={height} />
  )
}

// ---- bar chart ------------------------------------------------------------

export type BarChartOptions = Readonly<{
  key: string
  alt: string
  values: readonly number[]
  /** Bars to set apart, as a re-warm is: their own colour and a cap. */
  marked: readonly boolean[]
  color: string
  markColor: string
  px: number
  height: number
  /** The top of the scale, by default the largest value: a bar past it
   *  stands full, so one tall bar can't flatten the rest. */
  max?: number
  /** A value the bars are read against, such as their average: a rule across. */
  level?: number
  /** On a track, as a pill's chart is. */
  track?: boolean
  /** Spanning its slot, as a card head's lens does, rather than `px` wide. */
  stretch?: boolean
}>

const BAR_PX = 4
const BAR_GAP = 2
/** A marked bar's cap and the air beneath it: room every bar leaves on top. */
const CAP_PX = 2
const CAP_ROOM = CAP_PX + 1

/** The px `count` bars take, each with the air after it: a bar chart's `px`. */
export const barsWidth = (count: number): number => count * (BAR_PX + BAR_GAP)

/** A bar per value, oldest first. Text draws them in braille, two to a cell,
 *  a cell holding a marked bar in the mark's colour. */
export const barChart = (kit: Kit, o: BarChartOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, values, marked, color, markColor, px, height, max, level, track = false, stretch = false } = o
  const top = max ?? topOf(values)
  if (!Svg) {
    const cells = Array.from({ length: Math.ceil(values.length / 2) }, (_, c): readonly [string, string] => {
      const i = 2 * c
      return [braille(values.slice(i, i + 2), top, 1), marked[i] === true || marked[i + 1] === true ? markColor : color]
    })
    return textRuns(kit, key, cells, color)
  }
  const room = height - CAP_ROOM
  const y = (v: number) => height - (top > 0 ? Math.max(1, Math.round(Math.min(1, v / top) * room)) : 1)
  const marks = values.map((v, i) => {
    const x = barsWidth(i)
    const barTop = y(v)
    const isMarked = marked[i] === true
    const bar = `<rect class="bar" x="${x}" y="${barTop}" width="${BAR_PX}" height="${height - barTop}" rx="1" fill="${isMarked ? markColor : color}"/>`
    return isMarked ? `${bar}<rect class="cap" x="${x}" y="${barTop - CAP_ROOM}" width="${BAR_PX}" height="${CAP_PX}" rx="1" fill="${markColor}"/>` : bar
  })
  const keep = stretch ? KEEP_STROKE : ''
  const rule = level === undefined ? '' : `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1"${keep}/>`
  const drawn = (track ? trackOf(kit, px, height) : '') + marks.join('') + rule
  return stretch ? (
    <Svg key={key} source={stretchedOf(kit, px, height, drawn)} alt={alt} height={height} />
  ) : (
    <Svg key={key} source={svgOf(px, height, drawn)} alt={alt} width={px} height={height} />
  )
}

// ---- day cells ------------------------------------------------------------

export type DayCellsOptions = Readonly<{
  key: string
  alt: string
  /** A value per cell; undefined for one with nothing to show yet. */
  values: ReadonlyArray<number | undefined>
  /** Cells whose value is a guess, as a day to come is. */
  guess?: readonly boolean[]
  /** The cell outlined as now; none when absent. */
  today?: number
  /** A measured cell's fill and edge. */
  color: string
  cellPx: number
  height: number
  /** The top of the scale, by default the largest value: a limit's percent passes 100. */
  max?: number
  /** Spanning its slot, as a card head's lens does, rather than its cells' width. */
  stretch?: boolean
  /** The air between cells, 3px unless said. */
  gapPx?: number
}>

const DAY_GAP = 3
/** Room around the cells for today's outline. */
const DAY_EDGE = 1
/** Today's dash, finer than a guess's. */
const TODAY_DASH = 'stroke-dasharray="2 1.6"'

/** A cell per day or hour, filled from the bottom by its share of the
 *  scale, as the week boards draw it: a measured day solid in `color`;
 *  today dashed in value ink on a lighter ground; a day to come dashed and
 *  dim on the track; one with nothing yet a plain edge in the track's grey.
 *  Text draws a braille height per cell. */
export const dayCells = (kit: Kit, o: DayCellsOptions): RenderChildren => {
  const { Svg, Text, palette } = kit
  const { key, alt, values, guess = [], today, color, cellPx, height, max, stretch = false, gapPx = DAY_GAP } = o
  const top = max ?? topOf(values)
  const isGuess = (i: number) => guess[i] === true
  const isToday = (i: number) => today !== undefined && i === today
  if (!Svg) {
    // Cell i sits at column 2i + 1, so a line of labels spaced alike sits
    // under it; today's brackets take the spaces either side, and a closing
    // space keeps the line 2n + 1 wide wherever today falls.
    const cells = values.map((v, i) => (isToday(i) ? '[' : isToday(i - 1) ? ']' : ' ') + (v === undefined || isGuess(i) ? '·' : braille([v, 0], top)))
    return (
      <Text key={key} color={color}>
        {cells.join('') + (isToday(values.length - 1) ? ']' : ' ')}
      </Text>
    )
  }
  const step = cellPx + gapPx
  const width = values.length * step - gapPx + 2 * DAY_EDGE
  const tall = height + 2 * DAY_EDGE
  const keep = stretch ? KEEP_STROKE : ''
  const marks = values.map((v, i) => {
    const x = DAY_EDGE + i * step
    const measured = v !== undefined && !isGuess(i)
    const fillPx = !measured || top <= 0 ? 0 : tenth(clamp01(v / top) * (height - 2))
    const ground = isToday(i)
      ? `<rect class="ground" x="${x}" y="${DAY_EDGE}" width="${cellPx}" height="${height}" rx="3" fill="${palette.trackStroke}" opacity="0.45"/>`
      : isGuess(i)
        ? `<rect class="ground" x="${x}" y="${DAY_EDGE}" width="${cellPx}" height="${height}" rx="3" fill="${palette.meterTrack}"/>`
        : ''
    const filled = fillPx > 0 ? `<rect class="fill" x="${x + 1}" y="${tenth(DAY_EDGE + height - 1 - fillPx)}" width="${cellPx - 2}" height="${fillPx}" rx="2" fill="${color}"/>` : ''
    const [stroke, dash] = isToday(i)
      ? [palette.value, ` ${TODAY_DASH}`]
      : isGuess(i)
        ? [palette.trackStroke, ` ${GUESS_DASH} opacity="0.75"`]
        : [v === undefined ? palette.meterTrack : color, '']
    const edge = `<rect class="edge" x="${x + 0.5}" y="${DAY_EDGE + 0.5}" width="${cellPx - 1}" height="${height - 1}" rx="3" fill="none" stroke="${stroke}"${dash}${keep}/>`
    return ground + filled + edge
  })
  return stretch ? (
    <Svg key={key} source={svgOf(width, tall, marks.join(''), ' preserveAspectRatio="none"')} alt={alt} height={tall} />
  ) : (
    <Svg key={key} source={svgOf(width, tall, marks.join(''))} alt={alt} width={width} height={tall} />
  )
}

// ---- slice cells ----------------------------------------------------------

export type SliceCellsOptions = Readonly<{
  key: string
  alt: string
  row: SliceRow
  color: string
  /** Text's inks for a guess and for none left: the window's tint, dim and dimmer. */
  guess: string
  spent: string
  /** The ground the notch is knocked out of: its pill's or its card's. */
  ground: string
  cellPx: number
  /** A day: two text cells, a space apart. An hour: one, none between. */
  wide: boolean
  /** On the desktop, led by its own air, as much as makes it whole columns
   *  wide, in place of a column's gap before it, so the measure counts it
   *  as it is drawn. */
  air?: boolean
}>

const SLICE_GAP = 3
const SLICE_PX = 16
/** A text cell's height in eighths, from ▁ to █. */
const HEIGHTS = '▁▂▃▄▅▆▇█'

/** A cell per slice of a window, filled toward its cap: solid while
 *  measured, dashed while guessed, the guess that fills it outlined in full
 *  and those after it empty; a slice not known yet a plain grey outline; a
 *  label-grey notch where now falls. Text draws a height per cell, a
 *  measured 0% its empty track as a meter's, a dot where not known, the
 *  notch at the edge of the slice nearest now. */
export const sliceCells = (kit: Kit, o: SliceCellsOptions): RenderChildren => {
  const { Svg, palette, glyphs, measure } = kit
  const { key, alt, row, color, guess, spent, ground, cellPx, wide, air = false } = o
  const { marks, notch } = row
  if (Svg) {
    const step = cellPx + SLICE_GAP
    const width = marks.length * step - SLICE_GAP
    const lead = air ? Math.ceil((width + 1) / measure.pxPerCell) * measure.pxPerCell - width : 0
    const cells = marks.map(({ kind, pct }, i) => {
      const x = lead + i * step
      const share = clamp01(pct / 100)
      if (kind === 'unknown') return `<rect x="${x + 0.5}" y="2.5" width="${cellPx - 1}" height="11" rx="2.5" fill="none" stroke="${palette.trackStroke}"/>`
      if (kind === 'measured') {
        const tall = tenth(share * 12)
        return (
          `<rect x="${x}" y="2" width="${cellPx}" height="12" rx="2.5" fill="${color}" fill-opacity="0.35"/>` +
          (tall > 0 ? `<rect x="${x}" y="${tenth(14 - tall)}" width="${cellPx}" height="${tall}" rx="2" fill="${color}"/>` : '')
        )
      }
      // A guess or what is left is dashed; only the fill day's edge is full.
      const edge = `<rect x="${x + 0.5}" y="2.5" width="${cellPx - 1}" height="11" rx="2.5" fill="none" stroke="${color}"${kind === 'fills' ? '' : ' stroke-opacity="0.55"'} ${GUESS_DASH}/>`
      const tall = tenth(share * 9)
      const guess = (kind === 'guess' || kind === 'fills') && tall > 0 ? `<rect x="${x + 2}" y="${tenth(12.5 - tall)}" width="${cellPx - 4}" height="${tall}" rx="1" fill="${color}" fill-opacity="0.45"/>` : ''
      return edge + guess
    })
    const at = notch === undefined ? undefined : lead + Math.max(1, Math.min(width - 1, tenth(Math.floor(notch) * step + (notch - Math.floor(notch)) * cellPx)))
    // Knocked out of the ground a pixel either side, so it reads over a fill.
    const mark =
      at === undefined
        ? ''
        : `<rect x="${tenth(at - 2)}" y="0" width="4" height="${SLICE_PX}" rx="1.5" fill="${ground}"/><rect x="${tenth(at - 1)}" y="0" width="2" height="${SLICE_PX}" rx="1" fill="${palette.label}"/>`
    return <Svg key={key} source={svgOf(lead + width, SLICE_PX, cells.join('') + mark)} alt={alt} width={lead + width} height={SLICE_PX} />
  }
  const ascii = glyphs === 'ascii'
  /** A cell's glyph and ink: a height measured or guessed, an empty track
   *  at 0%, a dash where none is left, a dot where not known; in ascii, a
   *  dash in the dot's ink, as the week board's map draws it. */
  const glyphOf = ({ kind, pct }: SliceMark): readonly [string, string] => {
    const height = HEIGHTS[Math.max(0, Math.round(clamp01(pct / 100) * 8) - 1)] ?? '▁'
    if (kind === 'measured') return pct <= 0 ? [ascii ? '-' : '░', palette.meterTrack] : [ascii ? '#' : height, color]
    if (kind === 'guess' || kind === 'fills') return [ascii ? '+' : height, guess]
    if (kind === 'spent') return [ascii ? '.' : '╌', spent]
    return [ascii ? '-' : '·', palette.trackStroke]
  }
  const edge = notch === undefined ? undefined : Math.round(notch)
  const notchMark: readonly [string, string] = [ascii ? '|' : '▏', palette.label]
  // The notch takes the space at its edge, or adds a cell where there is none.
  const parts: Array<readonly [string, string]> = []
  marks.forEach((m, i) => {
    const [glyph, ink] = glyphOf(m)
    if (i === edge) parts.push(notchMark)
    else if (wide && i > 0) parts.push([' ', parts.at(-1)?.[1] ?? ink])
    parts.push([wide ? glyph + glyph : glyph, ink])
  })
  if (edge === marks.length) parts.push(notchMark)
  return textRuns(kit, key, parts)
}
