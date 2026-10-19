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

/** A projection's dash, in every chart: where a mark is heading. */
const PROJECTION_DASH = 'stroke-dasharray="3 2"'
/** A guess's dash: a day cell or a slice whose value is yet to come. */
const GUESS_DASH = 'stroke-dasharray="2 2"'
/** A stretched bar's lines keep their stroke at any scale. */
const KEEP_STROKE = ' vector-effect="non-scaling-stroke"'

/** The largest value, 0 for none: the top of a chart's scale. */
const topOf = (values: ReadonlyArray<number | undefined>): number => Math.max(0, ...values.filter(v => v !== undefined))

/** Marks wrapped in an Svg of this size, one unit to a pixel; `attrs` adds
 *  to the root tag. */
const svgOf = (width: number, height: number, marks: string, attrs = ''): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${attrs}>${marks}</svg>`

/** Marks set `air` px down, below the air above them. */
const airOf = (marks: string, air: number): string => (air > 0 ? `<g transform="translate(0 ${air})">${marks}</g>` : marks)

// ---- braille --------------------------------------------------------------

/** Values as braille, two to a cell: the left column takes dots 7,3,2,1 from
 *  the bottom, the right 8,6,5,4. East-Asian-Neutral, so one column wide
 *  everywhere, as btop and termui draw their graphs. A value draws at least
 *  `floor` dots, so a chart's line or bars never vanish at the bottom; an
 *  undefined one, none. */
const LEFT = [0x40, 0x04, 0x02, 0x01] as const
const RIGHT = [0x80, 0x20, 0x10, 0x08] as const
export const braille = (values: ReadonlyArray<number | undefined>, max: number, floor = 0): string => {
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

// ---- meter ----------------------------------------------------------------

type MeterOptions = Readonly<{
  key?: string
  label: string
  frac: number
  tone: Tone
  accent: string
  size?: BarSize
  /** An Svg with no width, capped by its slot: chips' cards' heads and
   *  bodies alone, since spec §2.9 bars it from every collapsed line. */
  stretch?: boolean
  /** What the fill is: what's used or what's left. */
  reads?: 'used' | 'left'
}>

/** A bar: `frac` filled toward its cap, the fill ending bare, since the
 *  number beside it says where. `label` names it for a reader, and `reads`
 *  says what the fill is. A stretched bar has no width of its own: drawn
 *  wider than any slot, the slot caps it, so it spans its card. */
export const meter = (kit: Kit, o: MeterOptions): RenderChildren => {
  const { Svg, Text, palette, onTone } = kit
  const { key = 'meter', label, frac, tone, accent, size = CHIP_BAR, stretch = false, reads = 'used' } = o
  const fill = onTone(tone, accent)
  const alt = `${label} ${Math.round(clamp01(frac) * 100)}% ${reads}`
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
    const marks =
      `<rect x="${0.5 * k}" y="1.5" width="${width - k}" height="5" rx="${2.5 * k}" ry="2.5" fill="${palette.meterTrack}" stroke="${palette.trackStroke}"${keep}/>` +
      (fillWidth > 0 ? `<rect class="fill" y="1" width="${fillWidth}" height="6" rx="${3 * k}" ry="3" fill="${fill}"/>` : '')
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
  return (
    <Text key={key} color={fill}>
      {'█'.repeat(filled)}
      {filled < size.cells ? <Text key="track" color={palette.meterTrack}>{'░'.repeat(size.cells - filled)}</Text> : null}
    </Text>
  )
}

// ---- split bar ------------------------------------------------------------

/** A part of a split bar: its amount, its colour and, in text, its fill. */
export type SplitPart = Readonly<{ n: number; color: string; mark: string }>

type SplitBarOptions = Readonly<{
  key?: string
  alt: string
  parts: readonly SplitPart[]
  size: BarSize
}>

/** A bar split into parts, each its share of the whole, in its own colour
 *  and, in text, its own fill; nothing while the whole is none. */
export const splitBar = (kit: Kit, o: SplitBarOptions): RenderChildren => {
  const { Svg, Text, palette } = kit
  const { key = 'split', alt, parts, size } = o
  const total = parts.reduce((sum, { n }) => sum + n, 0)
  if (total <= 0) return null
  const shown = parts.filter(({ n }) => n > 0)
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

// ---- sparkline ------------------------------------------------------------

type SparklineOptions = Readonly<{
  key: string
  alt: string
  values: readonly number[]
  color: string
  px: number
  height: number
  /** The top of the scale, by default the largest value: a percentage
   *  passes 100, so its line and its projection share one scale. */
  max?: number
  /** Now's index: the points after it are drawn dashed, as a projection, and
   *  a rule in label ink marks now. */
  nowAt?: number
  /** The first point drawn, on the same x scale: those before it aren't
   *  known, so none is drawn, and in text their cells are blank. */
  from?: number
  /** A line to read against, as a fraction of the scale's top, such as compaction. */
  level?: number
  /** Px of air above the chart, inside its Svg: a band's room past its chart. */
  air?: number
  /** Px kept above the scale's top inside the chart, so a level drawn there
   *  sits inside its own chart, clear of the band above. */
  headroom?: number
}>

/** The air a line keeps from the chart's edges. */
const SPARK_AIR = 2

/** A line over time, ending bare at its newest point. Text draws it in
 *  braille on its floor, on one line that a row too narrow cuts. */
export const sparkline = (kit: Kit, o: SparklineOptions): RenderChildren => {
  const { Svg, palette, oneLine } = kit
  const { key, alt, values, color, px, height, max, nowAt, level, air = 0, headroom = 0, from = 0 } = o
  const top = max ?? topOf(values)
  if (!Svg) return oneLine({ key, color }, braille(values.map((v, i) => (i < from ? undefined : v)), top, 1))
  const end = px - SPARK_AIR
  const x = (i: number) => (values.length <= 1 ? end : tenth(SPARK_AIR + (i * (end - SPARK_AIR)) / (values.length - 1)))
  const y = (frac: number) => tenth(height - SPARK_AIR - clamp01(frac) * (height - 2 * SPARK_AIR - headroom))
  const points = values.map((v, i) => [x(i), y(top > 0 ? v / top : 0)] as const)
  let marks = ''
  // Solid up to now; from now on, dashed.
  const solid = nowAt === undefined ? points.slice(from) : points.slice(from, nowAt + 1)
  if (solid.length > 1) marks += `<polyline points="${solid.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`
  if (nowAt !== undefined) {
    const ahead = points.slice(Math.max(from, nowAt))
    if (ahead.length > 1) marks += `<polyline class="ahead" points="${ahead.map(p => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${PROJECTION_DASH}/>`
    marks += `<line class="now" x1="${x(nowAt)}" y1="0" x2="${x(nowAt)}" y2="${height}" stroke="${palette.label}" stroke-width="1"/>`
  }
  if (level !== undefined) marks += `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1" ${PROJECTION_DASH}/>`
  return <Svg key={key} source={svgOf(px, height + air, airOf(marks, air))} alt={alt} width={px} height={height + air} />
}

// ---- bar chart ------------------------------------------------------------

type BarChartOptions = Readonly<{
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
  /** Px of air above the chart, inside its Svg: a band's room past its chart. */
  air?: number
}>

/** A marked beat's cap, and the air beneath it: room every beat leaves on top. */
const CAP_ROOM = 3

/** A beat per value, oldest first: one ECG path, a marked value capped flat
 *  across its peak. Text draws bars in braille, two to a cell, a cell
 *  holding a marked one in the mark's colour. */
export const barChart = (kit: Kit, o: BarChartOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, values, marked, color, markColor, px, height, max, level, air = 0 } = o
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
  const step = px / Math.max(1, values.length)
  const base = height - 4
  const d = values.map((v, i) => {
    const x0 = tenth(i * step), peak = tenth(x0 + step * 0.45), dip = tenth(x0 + step * 0.6), x1 = tenth(x0 + step)
    const capped = marked[i] === true
    // A tiny cost is a flat tick: its peak never drops below the baseline.
    const at = capped ? CAP_ROOM : Math.min(base, y(v))
    // A re-warm is capped flat across its peak: its shape says what it is.
    const peaks = capped ? `L${tenth(peak - 1.5)},${at}L${tenth(peak + 1.5)},${at}` : `L${peak},${at}`
    return `${i === 0 ? 'M' : 'L'}${x0},${base}${peaks}L${dip},${Math.min(height - 1, base + 3)}L${x1},${base}`
  }).join('')
  const rule = level === undefined ? '' : `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1" stroke-dasharray="1 2"/>`
  const beats = `<path class="beats" d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`
  return <Svg key={key} source={svgOf(px, height + air, airOf(rule + beats, air))} alt={alt} width={px} height={height + air} />
}

/** The beats' empty state, before a cost: a flat line on the baseline
 *  every beat starts and ends on, `beats` wide, dim, in `color`. Text draws
 *  braille's floor, a cell for two beats. */
export const flatBeats = (kit: Kit, o: Readonly<{ key: string; alt: string; beats: number; color: string; px: number; height: number; air?: number }>): RenderChildren => {
  const { Svg, oneLine } = kit
  const { key, alt, beats, color, px, height, air = 0 } = o
  if (!Svg) return oneLine({ key, color }, braille(Array.from({ length: beats }, () => 0), 1, 1))
  const base = height - 4
  const flat = `<line class="flat" x1="1" y1="${base}" x2="${px - 1}" y2="${base}" stroke="${color}" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>`
  return <Svg key={key} source={svgOf(px, height + air, airOf(flat, air))} alt={alt} width={px} height={height + air} />
}

// ---- heartbeat ------------------------------------------------------------

/** The cache's heartbeat, 12px: a dot while warm or in its last minute, a
 *  flat line when cold, hollow before it's measured. It stays still: its
 *  source changes only with its state, so its frame never reloads per tick. */
export const heartbeat = (kit: Kit, o: Readonly<{ key: string; alt: string; state: 'still' | 'beat' | 'flat' | 'hollow'; color: string }>): RenderChildren => {
  const { Svg, palette } = kit
  if (!Svg) return null
  const { key, alt, state, color } = o
  const body =
    state === 'flat' ? `<line x1="0" y1="6" x2="12" y2="6" stroke="${palette.label}" stroke-width="1.4" stroke-linecap="round"/>`
    : state === 'hollow' ? `<circle cx="6" cy="6" r="3.5" fill="none" stroke="${color}" stroke-width="1.2"/>`
    : `<circle cx="6" cy="6" r="3.5" fill="${color}"/>`
  return <Svg key={key} source={svgOf(12, 12, body)} alt={alt} width={12} height={12} />
}

// ---- track ----------------------------------------------------------------

type TrackOptions = Readonly<{
  key: string
  alt: string
  /** The share of the span gone, 0 to 1. */
  frac: number
  color: string
  px: number
  height: number
  /** Px of air above the chart, inside its Svg. */
  air?: number
  /** Its length in text. */
  cells: number
}>

/** A track's thickness, and how far now's rule stands past it either side. */
const TRACK_PX = 6
const NOW_REACH = 7

/** A span of time as a track, its start at the left and its end at the
 *  right, `frac` of it gone, filled in `color`, and a rule across it at now
 *  in value ink: the cache's hour from its last reply to cold. Text draws
 *  braille, a gone cell raised above the floor the rest keep. */
export const track = (kit: Kit, o: TrackOptions): RenderChildren => {
  const { Svg, palette } = kit
  const { key, alt, frac, color, px, height, air = 0, cells } = o
  const gone = clamp01(frac)
  if (!Svg) {
    const raised = Math.round(gone * cells)
    const glyphs: Array<readonly [string, string]> = Array.from({ length: cells }, (_, i) => (i < raised ? ['⣤', color] : ['⣀', palette.meterTrack]))
    return textRuns(kit, key, glyphs)
  }
  const y = tenth((height - TRACK_PX) / 2)
  // A sliver under the track's thickness reads as nothing: any time gone shows as a nub.
  const fill = gone > 0 ? `<rect class="fill" x="0" y="${y}" width="${tenth(Math.max(TRACK_PX, gone * px))}" height="${TRACK_PX}" rx="3" fill="${color}"/>` : ''
  const now = tenth(Math.min(px - 1, Math.max(1, gone * px)))
  const marks =
    `<rect class="track" x="0.5" y="${tenth(y + 0.5)}" width="${px - 1}" height="${TRACK_PX - 1}" rx="2.5" fill="${palette.meterTrack}" stroke="${palette.trackStroke}"/>` +
    fill +
    `<line class="now" x1="${now}" y1="${tenth(y - NOW_REACH)}" x2="${now}" y2="${tenth(y + TRACK_PX + NOW_REACH)}" stroke="${palette.value}" stroke-width="1.5" stroke-linecap="round"/>`
  return <Svg key={key} source={svgOf(px, height + air, airOf(marks, air))} alt={alt} width={px} height={height + air} />
}

// ---- day cells ------------------------------------------------------------

type DayCellsOptions = Readonly<{
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
  /** Px of air above the cells, inside their Svg: a band's room past its chart. */
  air?: number
  /** The Svg's width, the cells left-aligned in it, where wider than they are. */
  px?: number
}>

const DAY_GAP = 3
/** Room around the cells for today's outline. */
const DAY_EDGE = 1
/** The narrowest day cell drawn. */
const DAY_MIN_PX = 6

/** The widest cell, up to `most`, at which `count` day cells fit in `px`;
 *  none under DAY_MIN_PX. */
export const dayCellsFit = (px: number, count: number, most: number): number | undefined => {
  const cell = Math.min(most, Math.floor((px - 2 * DAY_EDGE + DAY_GAP) / count) - DAY_GAP)
  return cell >= DAY_MIN_PX ? cell : undefined
}
/** Today's dash, finer than a guess's. */
const TODAY_DASH = 'stroke-dasharray="2 1.6"'

/** A cell per day or hour, filled from the bottom by its share of the
 *  scale, as the week boards draw it: a measured day solid in `color`;
 *  today dashed in value ink on a lighter ground; a day to come dashed and
 *  dim on the track; one with nothing yet a plain edge in the track's grey.
 *  Text draws a braille height per cell. */
export const dayCells = (kit: Kit, o: DayCellsOptions): RenderChildren => {
  const { Svg, Text, palette } = kit
  const { key, alt, values, guess = [], today, color, cellPx, height, max, air = 0, px } = o
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
  const step = cellPx + DAY_GAP
  const width = Math.max(px ?? 0, values.length * step - DAY_GAP + 2 * DAY_EDGE)
  const tall = height + 2 * DAY_EDGE
  const marks = values.map((v, i) => {
    const x = DAY_EDGE + i * step
    const measured = v !== undefined && !isGuess(i)
    const fillPx = !measured || top <= 0 ? 0 : tenth(clamp01(v / top) * (height - 2))
    const ground = isToday(i)
      ? `<rect class="ground" x="${x}" y="${DAY_EDGE}" width="${cellPx}" height="${height}" rx="3" fill="${palette.trackStroke}" opacity="0.45"/>`
      : isGuess(i)
        ? `<rect class="ground" x="${x}" y="${DAY_EDGE}" width="${cellPx}" height="${height}" rx="3" fill="${palette.meterTrack}"/>`
        : ''
    // A guess fills toward its value, dimmed, so the cells say what is to come.
    const guessPx = !isGuess(i) || v === undefined || top <= 0 ? 0 : tenth(clamp01(v / top) * (height - 2))
    const filled =
      fillPx > 0 ? `<rect class="fill" x="${x + 1}" y="${tenth(DAY_EDGE + height - 1 - fillPx)}" width="${cellPx - 2}" height="${fillPx}" rx="2" fill="${color}"/>`
      : guessPx > 0 ? `<rect class="guess" x="${x + 1}" y="${tenth(DAY_EDGE + height - 1 - guessPx)}" width="${cellPx - 2}" height="${guessPx}" rx="2" fill="${color}" opacity="0.45"/>`
      : ''
    const [stroke, dash] = isToday(i)
      ? [palette.value, ` ${TODAY_DASH}`]
      : isGuess(i)
        ? [palette.trackStroke, ` ${GUESS_DASH} opacity="0.75"`]
        : [v === undefined ? palette.meterTrack : color, '']
    const edge = `<rect class="edge" x="${x + 0.5}" y="${DAY_EDGE + 0.5}" width="${cellPx - 1}" height="${height - 1}" rx="3" fill="none" stroke="${stroke}"${dash}/>`
    return ground + filled + edge
  })
  return <Svg key={key} source={svgOf(width, tall + air, airOf(marks.join(''), air))} alt={alt} width={width} height={tall + air} />
}
