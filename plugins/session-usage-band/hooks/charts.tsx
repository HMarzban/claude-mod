// The band's charts: each draws an Svg on the desktop, with its alt and
// width, and text elsewhere. Every builder takes the kit first and a key.

import type { RenderChildren } from 'claude-code'
import { clamp01 } from './format'
import type { Kit } from './kit'
import { CHIP_BAR } from './layout'
import type { BarSize } from './layout'
import type { Tone } from './reading'

/** One decimal: enough for an Svg coordinate, short enough to read. */
const tenth = (n: number): number => Math.round(n * 10) / 10

/** What a dashed mark means in every chart: a projection or a guess. */
const DASH = 'stroke-dasharray="3 2"'

/** The largest value, 0 for none: the top of a chart's scale. */
const topOf = (values: ReadonlyArray<number | undefined>): number => Math.max(0, ...values.filter(v => v !== undefined))

/** Text set inside Svg markup, escaped. */
const svgText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// ---- braille --------------------------------------------------------------

/** Values as braille, two to a cell: the left column takes dots 7,3,2,1 from
 *  the bottom, the right 8,6,5,4. East-Asian-Neutral, so one column wide
 *  everywhere, as btop and termui draw their graphs. */
const LEFT = [0x40, 0x04, 0x02, 0x01] as const
const RIGHT = [0x80, 0x20, 0x10, 0x08] as const
export const braille = (values: readonly number[], max: number): string => {
  const level = (v: number | undefined) => (v === undefined || max <= 0 ? 0 : Math.max(0, Math.min(4, Math.round((v / max) * 4))))
  let out = ''
  for (let i = 0; i < values.length; i += 2) {
    let bits = 0
    for (let d = 0; d < level(values[i]); d++) bits |= LEFT[d] ?? 0
    for (let d = 0; d < level(values[i + 1]); d++) bits |= RIGHT[d] ?? 0
    out += String.fromCodePoint(0x2800 + bits)
  }
  return out
}

// ---- meter ----------------------------------------------------------------

export type MeterOptions = Readonly<{
  key?: string
  label: string
  frac: number
  tone: Tone
  accent: string
  size?: BarSize
  stretch?: boolean
  reads?: 'used' | 'left'
  /** A mark across the bar at this fraction: a line the fill is measured against. */
  tick?: number
  /** Where the fill is heading, drawn dashed from its end. */
  projectTo?: number
}>

/** A bar: `frac` filled, with a thumb where the fill ends, so the eye finds
 *  the number's place on it at once. `label` names it for a reader, and
 *  `reads` says whether the fill is what's used or what's left. A stretched bar has no width of its
 *  own: drawn wider than any slot, the slot caps it, so it spans its card. */
export const meter = (kit: Kit, o: MeterOptions): RenderChildren => {
  const { Svg, Text, palette, onTone } = kit
  const { key = 'meter', label, frac, tone, accent, size = CHIP_BAR, stretch = false, reads = 'used', tick, projectTo } = o
  const fill = onTone(tone, accent)
  if (Svg) {
    // Never name a local `h`: JSX compiles to the global h().
    const tall = 8
    // Twice the estimate, so the slot always caps it; corners in kind, so
    // they round true at the scale it lands on.
    const k = stretch ? 2 : 1
    const width = size.px * k
    const scaling = stretch ? ' vector-effect="non-scaling-stroke"' : ''
    // A sliver under 6px reads as a dot or nothing: any use shows as a nub.
    // No clipPath: ids are document-wide where Svgs share a page, so a
    // rounded fill draws its own ends.
    const fillWidth = frac > 0 ? Math.max(6 * k, Math.round(clamp01(frac) * width)) : 0
    const source =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}"${stretch ? ' preserveAspectRatio="none"' : ''}>` +
      `<rect x="${0.5 * k}" y="1.5" width="${width - k}" height="5" rx="${2.5 * k}" ry="2.5" fill="${palette.meterTrack}" stroke="${palette.trackStroke}"${scaling}/>` +
      (projectTo === undefined
        ? ''
        : `<line class="projection" x1="${fillWidth}" y1="4" x2="${Math.round(clamp01(projectTo) * width)}" y2="4" stroke="${fill}" stroke-width="2" ${DASH}${scaling}/>`) +
      (fillWidth > 0
        ? `<rect class="fill" y="1" width="${fillWidth}" height="6" rx="${3 * k}" ry="3" fill="${fill}"/>` +
          `<rect class="thumb" x="${Math.min(width - 2 * k, fillWidth - k)}" y="0" width="${2 * k}" height="${tall}" rx="${k}" ry="1" fill="${palette.value}"/>`
        : '') +
      // Knocked out of the ground, so it reads over the fill and the track alike.
      (tick === undefined
        ? ''
        : `<rect class="tick" x="${tenth(clamp01(tick) * width - k)}" y="-1" width="${2 * k}" height="${tall + 2}" fill="${palette.value}" stroke="${palette.cardBg}"${scaling}/>`) +
      '</svg>'
    const alt = `${label} ${Math.round(clamp01(frac) * 100)}% ${reads}`
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
    i === tickAt ? ['│', palette.value] : i < filled ? ['█', fill] : i < ahead ? ['▒', fill] : ['░', palette.meterTrack],
  )
  // Neighbouring cells in one colour share a Text.
  const runs: Array<{ text: string; color: string }> = []
  for (const [glyph, color] of cells) {
    const last = runs.at(-1)
    if (last?.color === color) last.text += glyph
    else runs.push({ text: glyph, color })
  }
  return (
    <Text key={key} color={fill}>
      {runs.map((run, i) => (
        <Text key={`run-${i}`} color={run.color}>
          {run.text}
        </Text>
      ))}
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
  /** How much of a window has gone, as a dot on the ring. */
  dot?: number
  /** A short value drawn in the ring's middle. */
  centre?: string
}>

/** A ring filled clockwise from the top. Text has no rings: there it is a meter. */
export const ring = (kit: Kit, o: RingOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, frac, color, px, dot, centre } = o
  if (!Svg) return meter(kit, { key, label: alt, frac, tone: 'calm', accent: color })
  // 4 px of stroke on the collapsed 30 px ring, in proportion elsewhere.
  const stroke = Math.round(px / 7.5)
  const mid = px / 2
  const r = (px - stroke) / 2 - 1
  const circumference = 2 * Math.PI * r
  const arc = clamp01(frac) * circumference
  const circle = (extra: string) => `<circle cx="${mid}" cy="${mid}" r="${tenth(r)}" fill="none" stroke-width="${stroke}"${extra}/>`
  let marks = circle(` stroke="${palette.meterTrack}"`)
  if (arc > 0) marks += circle(` stroke="${color}" stroke-linecap="round" stroke-dasharray="${tenth(arc)} ${tenth(circumference)}" transform="rotate(-90 ${mid} ${mid})"`)
  if (dot !== undefined) {
    const turn = 2 * Math.PI * clamp01(dot)
    const [cx, cy] = [tenth(mid + r * Math.sin(turn)), tenth(mid - r * Math.cos(turn))]
    const dotR = tenth(stroke * 0.55)
    // A ring of the ground around the dot, so it reads apart from the arc.
    marks += `<circle cx="${cx}" cy="${cy}" r="${tenth(dotR + 1)}" fill="${palette.cardBg}"/><circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${palette.value}"/>`
  }
  if (centre !== undefined) {
    marks += `<text x="${mid}" y="${mid}" text-anchor="middle" dominant-baseline="central" font-family="system-ui, sans-serif" font-size="${Math.round(px * 0.28)}" fill="${palette.value}">${svgText(centre)}</text>`
  }
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${px} ${px}">${marks}</svg>`
  return <Svg key={key} source={source} alt={alt} width={px} height={px} />
}

// ---- sparkline ------------------------------------------------------------

export type SparklineOptions = Readonly<{
  key: string
  alt: string
  values: readonly number[]
  color: string
  px: number
  height: number
  /** Where the line is heading, as a fraction of the height, drawn dashed. */
  projectTo?: number
}>

/** The newest point's dot radius, and the air it keeps from the edges. */
const SPARK_DOT = 2
/** The width a projection takes beyond the newest point. */
const SPARK_AHEAD = 20

/** A line over time, its newest point a dot. Text draws it in braille. */
export const sparkline = (kit: Kit, o: SparklineOptions): RenderChildren => {
  const { Svg, Text } = kit
  const { key, alt, values, color, px, height, projectTo } = o
  const top = topOf(values)
  if (!Svg) {
    return (
      <Text key={key} color={color}>
        {braille(values, top)}
      </Text>
    )
  }
  const end = px - SPARK_DOT - (projectTo === undefined ? 0 : SPARK_AHEAD)
  const x = (i: number) => (values.length <= 1 ? end : tenth(SPARK_DOT + (i * (end - SPARK_DOT)) / (values.length - 1)))
  const y = (frac: number) => tenth(height - SPARK_DOT - clamp01(frac) * (height - 2 * SPARK_DOT))
  const points = values.map((v, i) => [x(i), y(top > 0 ? v / top : 0)] as const)
  const newest = points.at(-1)
  let marks = ''
  if (points.length > 1) {
    marks += `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  }
  if (newest !== undefined) {
    const [nx, ny] = newest
    if (projectTo !== undefined) {
      marks += `<line x1="${nx}" y1="${ny}" x2="${px - SPARK_DOT}" y2="${y(projectTo)}" stroke="${color}" stroke-width="1.6" stroke-linecap="round" ${DASH}/>`
    }
    marks += `<circle cx="${nx}" cy="${ny}" r="${SPARK_DOT}" fill="${color}"/>`
  }
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${height}" viewBox="0 0 ${px} ${height}">${marks}</svg>`
  return <Svg key={key} source={source} alt={alt} width={px} height={height} />
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
  newestColor?: string
  px: number
  height: number
}>

const BAR_PX = 4
const BAR_GAP = 2
/** A marked bar's cap and the air beneath it: room every bar leaves on top. */
const CAP_PX = 2
const CAP_ROOM = CAP_PX + 1

/** A bar per value, oldest first. Text draws them in braille. */
export const barChart = (kit: Kit, o: BarChartOptions): RenderChildren => {
  const { Svg, Text } = kit
  const { key, alt, values, marked, color, markColor, newestColor, px, height } = o
  const top = topOf(values)
  if (!Svg) {
    return (
      <Text key={key} color={color}>
        {braille(values, top)}
      </Text>
    )
  }
  const room = height - CAP_ROOM
  const marks = values.map((v, i) => {
    const tall = top > 0 ? Math.max(1, Math.round((v / top) * room)) : 1
    const x = i * (BAR_PX + BAR_GAP)
    const y = height - tall
    const isMarked = marked[i] === true
    const ink = isMarked ? markColor : i === values.length - 1 && newestColor !== undefined ? newestColor : color
    const bar = `<rect x="${x}" y="${y}" width="${BAR_PX}" height="${tall}" rx="1" fill="${ink}"/>`
    return isMarked ? `${bar}<rect class="cap" x="${x}" y="${y - CAP_ROOM}" width="${BAR_PX}" height="${CAP_PX}" rx="1" fill="${markColor}"/>` : bar
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${height}" viewBox="0 0 ${px} ${height}">${marks.join('')}</svg>`
  return <Svg key={key} source={source} alt={alt} width={px} height={height} />
}

// ---- day cells ------------------------------------------------------------

export type DayCellsOptions = Readonly<{
  key: string
  alt: string
  /** A value per cell; undefined for one with nothing to show yet. */
  values: ReadonlyArray<number | undefined>
  /** Cells whose value is a guess, as a day to come is. */
  guess?: readonly boolean[]
  today: number
  color: string
  cellPx: number
  height: number
  labels?: readonly string[]
}>

const DAY_GAP = 3
/** Room around the cells for today's outline. */
const DAY_EDGE = 1
/** What labels add beneath the cells, and their size. */
const LABEL_ROOM = 11
const LABEL_PX = 9

/** A cell per day or hour, filled from the bottom; a guess dashed, today
 *  outlined. Text draws a braille height per cell. */
export const dayCells = (kit: Kit, o: DayCellsOptions): RenderChildren => {
  const { Svg, Text, palette } = kit
  const { key, alt, values, guess = [], today, color, cellPx, height, labels } = o
  const top = topOf(values)
  const isGuess = (i: number) => guess[i] === true
  if (!Svg) {
    // Cell i sits at column 2i + 1, so a line of labels spaced alike sits
    // under it; today's brackets take the spaces either side.
    const cells = values.map((v, i) => (i === today ? '[' : i - 1 === today ? ']' : ' ') + (v === undefined || isGuess(i) ? '·' : braille([v, 0], top)))
    return (
      <Text key={key} color={color}>
        {cells.join('') + (today === values.length - 1 ? ']' : '')}
      </Text>
    )
  }
  const step = cellPx + DAY_GAP
  const width = values.length * step - DAY_GAP + 2 * DAY_EDGE
  const tall = height + 2 * DAY_EDGE + (labels === undefined ? 0 : LABEL_ROOM)
  const marks = values.map((v, i) => {
    const x = DAY_EDGE + i * step
    const charge = v === undefined || top <= 0 ? 0 : Math.round((v / top) * (height - 2))
    const filled = charge > 0 ? `<rect x="${x + 1}" y="${DAY_EDGE + height - 1 - charge}" width="${cellPx - 2}" height="${charge}" rx="2" fill="${color}"/>` : ''
    const outline =
      i === today
        ? `<rect x="${x}" y="${DAY_EDGE}" width="${cellPx}" height="${height}" rx="3" fill="none" stroke="${palette.value}" stroke-width="2"/>`
        : `<rect x="${x + 0.5}" y="${DAY_EDGE + 0.5}" width="${cellPx - 1}" height="${height - 1}" rx="3" fill="none" stroke="${palette.trackStroke}"${v === undefined || isGuess(i) ? ' stroke-dasharray="2 2"' : ''}/>`
    const label = labels?.[i]
    const caption =
      label === undefined
        ? ''
        : `<text x="${x + cellPx / 2}" y="${tall - 1}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${LABEL_PX}" fill="${i === today ? palette.value : palette.label}">${svgText(label)}</text>`
    return filled + outline + caption
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${tall}" viewBox="0 0 ${width} ${tall}">${marks.join('')}</svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={tall} />
}

// ---- underline ------------------------------------------------------------

export type UnderlineOptions = Readonly<{
  key: string
  alt: string
  frac: number
  color: string
  px: number
  /** A projection rather than a reading. */
  dashed?: boolean
}>

const UNDERLINE_PX = 4

/** A thin bar under a tile's label. Terminal tiles have none. */
export const underline = (kit: Kit, o: UnderlineOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, frac, color, px, dashed = false } = o
  if (!Svg) return null
  const reach = Math.round(clamp01(frac) * px)
  const mid = UNDERLINE_PX / 2
  const filled =
    reach === 0
      ? ''
      : dashed
        ? `<line x1="0" y1="${mid}" x2="${reach}" y2="${mid}" stroke="${color}" stroke-width="2" ${DASH}/>`
        : `<rect class="fill" width="${reach}" height="${UNDERLINE_PX}" rx="${mid}" fill="${color}"/>`
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${UNDERLINE_PX}" viewBox="0 0 ${px} ${UNDERLINE_PX}">` +
    `<rect width="${px}" height="${UNDERLINE_PX}" rx="${mid}" fill="${palette.meterTrack}"/>${filled}</svg>`
  return <Svg key={key} source={source} alt={alt} width={px} height={UNDERLINE_PX} />
}
