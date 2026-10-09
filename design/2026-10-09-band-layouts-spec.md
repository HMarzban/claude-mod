# Band layouts: design spec (v2)

Status: v2, after four reviews (engine feasibility, UI/UX and accessibility, tests and release, architecture and naming), with the maintainer's decisions applied · 2026-10-09 · issue HMarzban/claude-mod#1 · visual spec: the "Usage band layouts" canvas, Keepers row, collapsed and expanded.

**Where the canvas and this spec differ, the spec wins.** The canvas will be refreshed to match it before P2.

Maintainer decisions:
- **LAST CALL:** stays.
- **New layouts:** draw on a filled panel.
- **Names:** `ledger` and `week` stay.
- **Terminal glyphs:** braille and an ASCII tier (§3.2).

## 1. What we are building

`/usage-band layout <name>` chooses how session-usage-band draws, from nine layouts. **Chips** is today's band and stays the default, drawing a tree deep-equal to today's. The other eight are views over the same readings.

| Name | Collapsed, one line | Desktop rows | Terminal rows |
| --- | --- | --- | --- |
| `chips` | Today's row of pills; four cards behind ▿ | 1 | 1 |
| `gauges` | Two rows of labelled bars; the tick marks how much of each window has gone | 2 | 2 |
| `ledger` | Words only, `·`-separated; `! ` leads what needs you | 1 | 1 |
| `rings` | A ring per reading, value over label beside it | 2 | 1 |
| `pulse` | Per-message cost bars and the 5h trend | 2 | 1 |
| `tiles` | A bold value over a label, with a thin underline bar on the desktop | 2 (+4 px) | 2 |
| `week` | The 7d window as day cells, the 5h window as hour cells | 2 | 2 |
| `departures` | A split-flap board: `CACHE · DEPARTS 14:32` | 1 | 1 |
| `forecast` | Weather-style columns: now, then each change at its clock time | 2 | 1 |

- A layout's row count depends on width only, never on state or history.
- Below 40 columns, every layout draws chips.

**Non-goals:**
- New palettes, beyond tokens added to the existing three.
- Per-project layouts.
- A layout env var.
- The `/config` picker.
- User-defined layouts.
- Toast changes.
- A new amber trigger for the 7d pace. It stays calm words, as chips says it today.

## 2. The UX contract (every layout, or it is not done)

1. **Quiet when fine.** Amber appears only on the triggers chips already uses:
   - the cache's last minute;
   - context near compaction (or 80% / 95% with compaction off);
   - a limit at 80%;
   - a 5h pace that fills before its reset.

   Nothing is red. A cold cache is a price, not an error. The 7d pace that would fill before its reset says `full before reset` in calm words.
2. **Words for every amber state.** In every non-chips layout, each amber reading's text starts with `! `, once. `!!` is not used outside chips. The words come from `reading.ts`:

   | Trigger | Words (non-chips) | Departures |
   | --- | --- | --- |
   | Cache, last minute | `! 47s left · re-warm ~$1.66` | `LAST CALL` · `47s` · `RE-WARM ~$1.66` |
   | Context near compaction | `! context 93% · compacts in ~12k` | `! COMPACTS IN ~12K` |
   | Limit at 80% or more | `! 5h 82%` | `! NEAR LIMIT` |
   | 5h pace fills before reset | `! 5h full in ~40m` | `! FULL ~14:20` |

3. **Never suggest sending a message** to keep the cache warm. `LAST CALL` is the maintainer's chosen exception in tone. It is shown with the price, never with a call to act.
4. **Estimates carry `~`.** This covers the re-warm, the projection, a message's price and "full in". Use `~` consistently, never `≈`. Measured facts carry neither.
5. **Formatting lives in one place.** No view formats a number, time, duration or price; `format.ts` does. Shared phrases (the amber words, pace, reset, empty states, alt text) come from `reading.ts`. A view's own fixed labels (`CACHE`, `ITEM`, `cooling`, `DEPARTS`) live in its file.
6. **Never wraps, never scrolls.**
   - A collapsed layout keeps its declared row count at every width from 40 to 200 columns, dropping pieces in its declared give-way order.
   - **An amber piece never gives way while any calm piece remains.** Give-way steps name calm pieces only.
   - `▿` never goes.
   - An expanded layout fits `snap.maxRows` (tests use 4, 8, 13 and 40). It drops its least important facts first and never pushes the buttons away.
7. **Same facts, any order.**
   - Every expanded view shows the workspace strip and the Cache, Spend, Context and Limits facts, including `otherLimits`.
   - It shows the `Collapse` (`c`) and `Hide band` (`h`) buttons, in any order the view declares. The Cache facts come first.
   - ▿ turns to ▵. The collapsed part keeps the same pieces at the same width.
8. **Every state is drawn.**
   - Every cache mood: `unmeasured`, `warming`, `warm`, `expiring` and `cold`.
   - While `isWorking`, no countdown and no clock time; the cache says `warm`, as chips does.
   - A passed reset (`5h reset`), unknown context, auto-compaction off, no limits at all, and `otherLimits`.
   - None of these may print NaN, `undefined` or an empty cell.
9. **Svg on the desktop only,** behind `kit.Svg`. Plain has no Svg and draws the text form.
   - Every Svg has a non-empty `alt`.
   - Every Svg has an explicit `width`.
   - No Svg uses an `id`, gradient, pattern or clipPath (ids are page-wide).
   - Svg text uses `font-family="system-ui, sans-serif"`.
10. **Contrast on a known ground.**
    - Every non-chips layout draws on a filled **panel**, `palette.panel` (new token = `cardBg`), so every hex is tested against a ground we own.
    - Plain has no panel and uses theme keys only (`BARE`).
    - Text is at least 4.5:1 and marks at least 3:1 on the panel in every palette.
    - Every tick or dot has a 1 px knockout in the panel colour and stands taller than its track.
    - A projection is a dashed stroke at full opacity, never a faint fill.
    - Day and hour cells encode their value by fill height, with a `trackStroke` outline, never by opacity.
    - `coin` (gold) is for the coin icon only. A re-warm is marked by its word and a capped bar in `value`.
11. **Type size is the host's.** `Text` has no size, so hierarchy comes from bold, colour and position. A larger numeral is drawn only inside a view's own Svg (a ring's centre), and is always repeated in `alt` and in text.
12. **Time words do not collide.**

    | Kind | Example | Notes |
    | --- | --- | --- |
    | Countdown | `52m left`, `47s left` | In the last minute, non-chips views write `47s`; chips keeps `0:47` |
    | Clock time | `14:32`, `Mon 08:40` | |
    | Duration after ↻ | `↻ in 3h 00m` | Never `↻ 3h 00m` |
    | Clock after ↻ | `↻ 16:40` | |
    | Minutes on the board | `IN 52 MIN` | Never `52M`, which reads as millions |

13. **Screen readers.** Alt text is generated in `reading.ts` as `<name> <value>, <state>[, about <estimate>]`. It uses the words "about" and "resets in", never `~` or `↻`. Opening the view never removes a fact from what a reader hears.

## 3. What the engine draws, and the glyph policy

### 3.1 Canvas element to engine primitive

| Canvas element | Desktop | Terminal and plain |
| --- | --- | --- |
| Pill, flap cell | `Box backgroundColor`, `paddingX={1}` | Same; plain uses `[` `]` |
| Bar with thumb, tick or projection | `charts.meter({ tick, projectTo })` (today's meter, extended; with no options it is unchanged) | `█░`; a tick is `│`; a projection is `▒` |
| Ring, donut, nested rings | `charts.ring()`, 22–30 px collapsed and 64 px expanded | A meter (`█░`); a donut becomes the split bar |
| Sparkline, bar chart, line chart | `charts.sparkline()`, `charts.barChart()`, width from `columns × pxPerCell` | Braille sparkline (§3.2) |
| Day and hour cells | `charts.dayCells()`: height-filled, outlined; today has a heavier outline; days to come are dashed | Braille heights per day (§3.2); today in `[ ]` |
| Clock times, durations | Text | Text |
| Column separators | Text `│` in label colour | Same |

`Box` has no opacity, no per-side border and no dashed border, so every soft visual is an Svg on the desktop.

### 3.2 Terminal glyph policy

**The problem.** Ink's width library (`string-width`) counts East-Asian-*Ambiguous* glyphs as one column. A terminal set to draw them wide renders two, and the row overflows. This happens in CJK locales, or in iTerm2 / Terminal.app with "ambiguous characters are double-width" turned on. Partial blocks also jitter across fonts.

The classes below are from Unicode's `EastAsianWidth-18.0.0.txt`, checked 2026-10-09:

| Class | Glyphs |
| --- | --- |
| Ambiguous (A) | `█ ▒ │ · Σ … ±`, partial blocks `▁–▇`, `○ ●`, box drawing |
| Neutral (N), one column everywhere | `░ ↻ ◷ ◔ ▿ ▵`, and **all braille `U+2800–28FF`** |

**What auto-detection misses.** The iTerm2 / Terminal.app "double-width ambiguous" toggle in a non-CJK locale can't be detected. `CC_BAND_GLYPHS=ascii` covers it, and the README says so.

**An exception to "chips is unchanged".** The `ascii` tier also applies to chips, so a CJK-locale user's chips changes. It's a fix. With no env var and a non-CJK locale, chips is byte-identical.

**The fix, done the way btop, termui and braillegraph do it.** Two glyph tiers are chosen once per session.

| Tier | When | What it may use |
| --- | --- | --- |
| `unicode` (default) | Every other case | The glyphs the band already ships (`█ ░ │ · ↻ Σ ◷ ◔ ▿ ▵ … ±`). **Braille patterns `U+2800–28FF`** for sparklines and day heights: they are East-Asian-*Neutral*, always one column. Plus `▒` for a projection. |
| `ascii` | `CC_BAND_GLYPHS=ascii`, or a CJK locale (`LC_ALL` / `LC_CTYPE` / `LANG` starting `ja`, `zh` or `ko`) unless `CC_BAND_GLYPHS=unicode` | ASCII plus braille. `█`→`#`, `░`→`-`, `▒`→`:`, `│`→`|`, `·`→`-`, `↻`→`reset`, `Σ`→`tok`, `◷`/`◔` dropped, `▿`/`▵`→`v`/`^`, `…`→`...` |

- **Banned everywhere:** circles `○◐◑◕●`, weather symbols, `▮▯▰▱`, partial blocks `▁–▇`, emoji and VS16. Forecast's "warm / cooling / cold" are words.
- **Braille sparkline.** Each braille cell holds two values (left and right dot columns), each in 4 heights: `⡀⡄⡆⡇` on the left, `⢀⢠⢰⢸` on the right, combined. This gives twice the resolution of block characters at a neutral width.
- **Screen readers.** Braille reads as "braille pattern dots…", so in the terminal every chart sits beside its numbers (`last $0.21 · avg $0.19 · max $1.66 re-warm`). The README recommends `CC_BAND_GLYPHS=ascii`, which drops the charts and keeps the numbers.
- **The tier applies to chips too.** This fixes today's band for CJK users. With no env var and a non-CJK locale, chips is unchanged.
- **Tests.** An allowlist test asserts every glyph a terminal draw emits is in its tier's set. A table test pins each listed glyph's East-Asian-Width class.

## 4. Architecture

### 4.1 Layers

Each layer depends only on the layer below it.

```
register.tsx (engine, atoms, store, histories) → snapshot.ts (contract)
  → reading.ts (readingsOf: every fact, phrase, tone and alt, pure)
    → views/<name>.tsx (pure draw) using kit.tsx + charts.tsx + views/frame.tsx
band.tsx: drawBand = build kit and readings once, then VIEWS[layout].draw, with a fallback to chips on throw
```

| File | Role |
| --- | --- |
| `hooks/reading.ts` | Gains `readingsOf(snap): Readings`. Every fact today's `drawBand` computes in closures is extracted here, not rewritten: cache (mood, copy long and short, charge, estimate, saved, hit, ttl, misses, recalled, idle), spend (total, last, split, `avgWarmUsd`), context (frac, pct, toCompact, compactAt, window, tone, mark), each limit window (frac, value, tone, reset text in both forms, pace text long and short, `projectedPct`, gone, `etaMs`), `otherLimits`, `worstLimit`, the workspace, and the alt strings. Facts with two lengths carry both. If it passes about 300 lines, split it into `readings.ts`. |
| `hooks/charts.tsx` | Svg and text builders over the kit: `meter({ tick, projectTo, key })` (today's meter, hoisted), `ring`, `sparkline`, `barChart`, `dayCells`, and the braille encoder. Every builder takes a `key`. |
| `hooks/views/index.ts` | `VIEWS: Readonly<Record<LayoutName, View>>`. The compiler rejects a missing view. The list reply and `parseLayoutName` derive from it. |
| `hooks/views/<name>.tsx` | `export const <name>View: View`. |
| `hooks/views/frame.tsx` | The expanded scaffold: workspace strip placement, the row budget `bodyRows = maxRows − collapsedRows − 3 − strip`, and the buttons row. |
| `hooks/views/chips.tsx` | Today's band, drawing from `Readings`. `limitChip` and `buildPills` stay here, tied to its `GIVES_WAY`. Shared parts (`pill`, `batteryIcon`, `textBattery`, `cachePill`) move to `charts.tsx` / `views/frame.tsx` as `parts(kit, read)`. |
| `hooks/snapshot.ts` | `LAYOUT_NAMES`, `LayoutName`, `DEFAULT_LAYOUT = 'chips'`, plus `layout`, `utcOffsetMin`, `glyphs`, and the histories (§5). |
| `hooks/memory.ts` | `LAYOUT_KEY = 'layout'`, `LIMIT_SAMPLES_KEY = 'limitSamples'`, `asLayoutName(v): LayoutName \| undefined`, `asLimitSamples(v)`. |
| `hooks/layout.ts` | Measuring, as today, plus `ROW_PX = 24`. `cellsOf` measures a column Box as the max of its rows. Each collapsed row is squeezed separately. |
| `hooks/register.tsx` | `band.layout`, the command, store reads and writes, `utcOffsetMin`, `glyphs`, the histories. |

```ts
type View = Readonly<{
  name: LayoutName
  summary: string                                     // for the list reply and the README
  rows: Readonly<{ desktop: number; terminal: number }>
  draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement
}>
```

- `Readings.frame` carries `expanded`, `maxRows`, `now` and `glyphs`.
- `kit` carries `columns`, `palette`, `surface` and `measure`.
- A view never imports `format.ts` or `reading.ts` internals, and never touches `snap`.

### 4.2 Command and persistence

| Input | Reply |
| --- | --- |
| `/usage-band layout` | `Usage band layout: chips. Choose one: chips, gauges, ledger, rings, pulse, tiles, week, departures, forecast.` |
| `/usage-band layout pulse` | `Usage band layout: pulse. /usage-band layout chips goes back.` For `chips` itself: `Usage band layout: chips.` |
| Mixed case or extra spaces | Accepted |
| Unknown name | `Unknown layout "<input clipped to 20>". Choose one: …` Nothing changes. |
| Any other word | `Usage: /usage-band [more \| less \| show \| hide] · /usage-band layout <name>` (the bracket is unchanged, so the existing assertion holds) |

- **Registration:** `argumentHint: '[more | less | show | hide | layout <name>]'` and the description `Show, hide, expand, collapse or restyle the session usage band`.
- **Writing the layout:**
  - Only an explicit command writes `LAYOUT_KEY`. With no stored layout nothing is written, so a future default is never pinned.
  - Setting a layout shows a hidden band and calls `$.ui.invalidate('ui.render')`, since the paint key ignores the layout.
- **Reading the layout:**
  - It is read on `session.start` and on `turn.complete`.
  - `asLayoutName` returns `undefined` for anything unknown. The caller defaults to chips. It never throws and never hides the band.
- **Compatibility:** the store keys are new. 0.11.x reads only `sessions` and `rates`, so a downgrade ignores them, and the keys stay in the store.

### 4.3 Naming table (final)

| Concept | Name |
| --- | --- |
| Readings model | `Readings`, `readingsOf` (in `reading.ts`) |
| Layout type, names, default | `LayoutName`, `LAYOUT_NAMES`, `DEFAULT_LAYOUT` |
| Registry, one view | `VIEWS`, `<name>View: View` |
| Store keys | `LAYOUT_KEY = 'layout'`, `LIMIT_SAMPLES_KEY = 'limitSamples'` |
| Guards | `asLayoutName`, `asLimitSamples`, `parseLayoutName` |
| Charts | `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `braille` |
| Time | `utcOffsetMin` (east positive), `fmtClock`, `fmtDayClock`, `fmtSecondsLeft` |
| Histories | `costTrail` (`{ usd, reWarm }`), `contextTrail`, `fiveHourTrail`, samples `{ at, fivePct, sevenPct, fiveResetAt, sevenResetAt }` (epoch ms) |
| Worst limit | `worstLimit` |
| Glyph tier | `glyphs: 'unicode' \| 'ascii'`, from `resolveGlyphs(env)` |
| Tests | `tests/layout-command.test.ts`, `tests/view-<name>.test.ts`, `tests/matrix.ts`, `tests/golden.test.ts` |
| Terms in copy and docs | "re-warm" (code `reWarm`); "workspace strip"; `5h` and `7d` in rows; "5-hour limit" and "Weekly limit" in headings |

## 5. Data the new layouts need

| Data | Used by | Source | Bound |
| --- | --- | --- | --- |
| 5h and 7d `projectedPct` at reset | gauges, rings, tiles, week, departures, forecast | Today's Limits card: `percentUsed / gone`, extracted. When `etaMs` exists, the 5h projection comes from the same measured rate, so "on pace for ~X%" and amber agree. | — |
| `reWarm` per turn | pulse | `cache.ts` `recordResponse` sets `cache.lastRebuilt` when the turn's first main-loop request wrote the cache because of an expired TTL, a miss, a compaction or a model switch. Today's `misses` only counts unexpected misses, so it can't be used. | — |
| `costTrail` | pulse, forecast (`avgWarmUsd`) | `noteTurnEnd` pushes `{ usd, reWarm }` | 24, in memory; cleared on `session.end` and `session.start` |
| `contextTrail` | pulse (expanded) | `turn.complete` pushes `contextUsed` | 40, in memory; same clearing |
| `fiveHourTrail` | pulse, week | A new trail beside `insights`, at most one reading a minute, the last 5 h. `insights`' 30-minute pace samples stay as they are, so the chips pace is unchanged. | 300 |
| `limitSamples` | week | `$.store`, written on `turn.complete`, deduped by 15-minute bucket. Samples whose reset time differs from the current window are dropped, which handles a reset or an account change. | 672 (7 d × 96), about 67 KB; the size is measured in a test |
| `utcOffsetMin` | forecast, departures | `-new Date(now).getTimezoneOffset()` with `now` from `$.clock`. If that throws, `$.process.run(['date', '+%z'])`. Re-read hourly, so a daylight-saving change lands. Verified in P1; if neither works, these views use relative times. | — |
| `glyphs` | all | `resolveGlyphs(env)`, §3.2 | — |

**Empty states**, worded like the band's existing copy:
- Pulse: "Costs show after Claude's next reply."
- Week: "History fills in as you use Claude."
- A missing sample is drawn as unknown, never as 0%.

**Race.** `$.store` has no compare-and-set, so two sessions appending samples can lose one write. This is accepted: dedupe by bucket makes a lost write harmless.

## 6. Each layout

Under each layout, **Escalation** says what amber does to it and **Give-way** says what drops first as the window narrows. Every layout draws on the panel (§2.10). Its row count is fixed (§1). Below 40 columns, every layout draws chips.

### chips

- Today's band, drawn from `Readings`. It produces the golden trees (§7).

### gauges

- **Collapsed:**
  - Row 1: `cache`, a time-left bar, `52m left · re-warm ~$1.66`, then right-aligned `$3.19 · 225k tokens`.
  - Row 2: context, 5h and 7d cells (label, bar, value), then ▿.
  - The context bar's full end is compaction. Ticks appear only on 5h and 7d, and mean "window gone".
- **Escalation:** the bar and its words turn amber, with the §2.2 words.
- **Give-way:**
  1. tokens;
  2. reset texts;
  3. the right-hand cost, which joins the cache sentence;
  4. bars shrink to 6 cells;
  5. calm cells become text values (`5h 4%`), still on two rows.
- **Expanded:** four panels.
  - Cache: hit rate, saved, lasts.
  - Spend: split bar and legend in neutral tones, last message.
  - Context: room before compaction, compacts at, window.
  - Limits: each window's ticked bar with a dashed projection and `on pace for ~X%`; `otherLimits` below.

### ledger

- **Collapsed:** `cache 52m left · $3.19 · context 38% · 5h 4%, resets in 3h 00m · 7d 30%, resets in 2d 19h`, then ▿.
- **Escalation:** `! ` plus the §2.2 words.
- **Give-way:**
  1. `resets in X` becomes `↻ in X`;
  2. calm reset times;
  3. calm 7d;
  4. calm context;
  5. the cost;
  6. calm 5h.
- **Expanded:**
  - A workspace sentence.
  - CACHE, SPEND, CONTEXT and LIMITS as columns of short sentences, two by two below 100 columns.

### rings

- **Collapsed:**
  - Cache, context, 5h and 7d each get a ring with the value over the label. On 5h and 7d, a dot marks the window gone.
  - Cost has no ring.
  - Terminal: a meter, the value and the label on one row.
- **Escalation:** the ring and label turn amber, and the label becomes the reason (`! 5h full in ~40m`).
- **Give-way:**
  1. labels shorten to their names;
  2. calm reset text;
  3. calm 7d;
  4. cost;
  5. calm context.
- **Expanded:** four panels, each with a 64 px ring and its facts.
  - The donut uses neutral token tones.
  - The limits panel nests 5h outside and 7d inside.
  - Every collapsed alt fact stays.

### pulse

- **Collapsed:**
  - The cache pill.
  - The last 14 costs as bars, newest in `value`, a re-warm capped and labelled, plus the total and `last $0.21`.
  - The 5h trail over the last hour, with `on pace for ~X%` or `! 5h full in ~40m` and the reset.
  - `context 38% · 7d 30%`, then ▿.
  - Terminal: a braille sparkline beside the numbers.
- **Escalation:** the 5h trail turns amber, with a dashed projection.
- **Give-way:**
  1. calm context text, then calm 7d text;
  2. reset;
  3. bar count, 14 down to 8;
  4. the trail becomes text;
  5. the bars become text.
- **Expanded:** three charts and a cache panel.
  - Cost per message: the last 24, with an average line and re-warms labelled.
  - 5h this window: start to reset, now marked, dashed projection.
  - Context over the conversation: with the compaction line.

### tiles

- **Collapsed:** five tiles: cache, cost, context, 5h (`↻ in 3h 00m`), 7d.
  - Each tile is a bold value over a label.
  - On the desktop, a 4 px underline bar sits under the label. The cost tile has none.
  - Terminal: two rows, value then label, with no underline.
- **Escalation:** the value and label turn amber, and the label becomes the reason.
- **Give-way:**
  1. the underline;
  2. calm reset text;
  3. calm 7d tile;
  4. calm context tile.
- **Expanded:** four groups (Cache, Spend, Context, Limits), each a 2×2 of tiles. A dashed underline is a projection.

### week

- **Collapsed:**
  - `7d` as 7 day cells, height-filled by that day's share. Today has a heavier outline, days to come are dashed, and the initials sit under them. Then the value and `↻ Mon 08:40`.
  - `5h` as 5 hour cells, labelled by clock hour (`11 12 13…`).
  - Then the cache pill, the cost and ▿.
  - Terminal: braille heights, with today in `[ ]`.
- **Escalation:** amber cells and words. The cell where the 5h pace fills gets `!` under it.
- **Give-way:**
  1. calm reset text;
  2. calm 5h cells become `5h 4%`;
  3. calm 7d cells become `7d 30%`.
  - The initials row stays, so the rows stay 2.
- **Expanded:**
  - Large day cells with % and dates; the days to come show the pace's guess as `~7%`.
  - Hour cells with clock labels.
  - A summary for each window: used, on pace for, busiest day.
  - One facts line.

### departures

- **Collapsed:** flaps.
  - Cache: `CACHE` · `DEPARTS 14:32` (warm colour) · `IN 52 MIN`.
  - 5h: `5H` · `4%` · `~10% AT ↻`.
  - 7d: `7D` · `30%`.
  - Cost: `$3.19`.
  - Then ▿.
- **Cache statuses:**
  - `DEPARTS hh:mm`.
  - `LAST CALL` (amber) with `47s` and `RE-WARM ~$1.66`.
  - `DEPARTED hh:mm` when cold, with `RE-WARM ~$1.66`.
  - While working: `BOARDING`, with no time.
- **Limit statuses:**
  - Calm: `~X% AT ↻`.
  - Amber: `! NEAR LIMIT` (80% or more) or `! FULL ~14:20` (the pace fills before the reset).
- **Give-way:**
  1. calm 5h projection flap;
  2. `IN 52 MIN`;
  3. calm 7d group;
  4. the calm 5h group becomes `5H 4%`.
- **Expanded:**
  - A header row of flaps from the workspace strip.
  - The board, ITEM · STATUS · TIME · REMARKS, with rows CACHE, CONTEXT, 5H, 7D, SPEND, plus `otherLimits`.
  - REMARKS truncates first.
- **Flap colours:** the `flap`, `flapText` and `flapDim` tokens, added to each palette with contrast tests. No raw hex.

### forecast

- **Collapsed:** 2 desktop rows; on the terminal, one row of columns split by `│`. Each column shows the time and condition (`now · warm`, `14:32 · cold`), and on the desktop the detail beneath it (`52m left`, `re-warm ~$1.66`).
  - The columns are now plus at most 3 events, in time order:
    - cold;
    - `! 5h full`, when the pace fills;
    - 5h resets;
    - 7d resets, only within 24 h.
  - Only the next event shows "in Xm".
  - "Cooling" means the `expiring` mood, the last minute only.
  - Desktop has icons; terminal has words only.
- **Escalation:** the "now" column becomes `! cooling · 47s left`. `! 5h full` is inserted in time order and never gives way while calm events remain.
- **Give-way:**
  1. calm far events, 7d first;
  2. the "in Xm";
  3. the desktop detail row text shortens.
  - The rows stay 2.
- **Expanded:** the outlook list, one row per reading (Cache, Context, 5h, 7d, Spend, plus `otherLimits`). Each row has:
  - its name and value now;
  - a range bar from now to where it lands: the ring marks now, the dashed run is the way ahead, and a tick is the line it must not cross;
  - the outcome in words.

## 7. Testing

- **Golden default (P0, before any code moves).**
  - `tests/golden-capture.test.ts` logs `ui.drawn()` for 20 scenarios × 2 surfaces × 3 appearances × widths {30, 40, 60, 80, 95, 120, 200} × collapsed/expanded, on a pinned clock. The scenarios come from `tests/matrix.ts`.
  - That is about 1,700 trees, too big to commit whole. For each case, commit a deterministic hash (FNV-1a over canonical JSON with sorted keys; the sandbox has no crypto) in `tests/golden/chips.ts`.
  - Also commit about 10 full trees, the expanded and narrowest cases, so a failure can be diffed.
  - Capture in batches, so the test log is never truncated.
  - `tests/golden.test.ts` asserts every hash and full tree, with no stored layout and with `chips` stored.
  - The golden file is frozen: a diff to it fails review.
- **Matrix helper (`tests/matrix.ts`, P1):**
  - `SCENARIOS` covers 20 scenarios: calm, unmeasured, warming, recalled, cold, last minute, working, near compaction, auto-compaction off, limit at 80%, 5h ahead, 7d full before reset, no limits, gateway spend, reset passed, no workspace, not a repo, git fails, empty history, full history.
  - It also exports `AMBER_WORDS`, `drawAs`, `visualRows(tree, surface)` (desktop rows = px / `ROW_PX`) and `expectInvariants`.
  - `expectInvariants` checks:
    - rows equal the declared count;
    - ▿ or ▵ present;
    - width ≤ columns;
    - no whitespace-only children on the desktop;
    - no Svg on the terminal or in plain;
    - every Svg has an alt and a width;
    - no keyed hover card;
    - no red hex;
    - no send-to-keep-warm wording;
    - amber words present;
    - estimates carry `~`;
    - terminal glyphs in their tier's allowlist.
  - `viewSuite(layout, giveWay)` registers the whole matrix for one view.
- **Per view,** `tests/view-<name>.test.ts`: `viewSuite`, plus every column from 40 to 200 in one `LONG` test per surface, plus that view's own specifics.
- **Command:** `tests/layout-command.test.ts` covers:
  - list, set, case and spaces, unknown;
  - stored then read on a new session;
  - a bad stored value;
  - no write when nothing is stored;
  - setting a layout shows a hidden band and invalidates;
  - another session's change after `turn.complete`;
  - a view that throws falls back to chips.
- **Histories:** `tests/history.test.ts` covers caps, clearing on `/clear` and resume, the 15-minute dedupe, reset-change pruning, store failure (new `storeFails` in `helpers.ts`), and the measured size.
- **Design matrix:** `design.test.ts` iterates `LAYOUT_NAMES` × palettes (including the new `panel` and `flap*` tokens) × hosts.
- **Readings parity:** `tests/readings.test.ts` checks each reading against today's chips output.
- **Existing suite:** passes with no assertion changed. Its test count is reported from a real run, never hardcoded.
- **Type check:** `tsc` runs locally on a signed-in session, and its output goes in the PR. CI cannot type-check.

## 8. Phases and how the agents work

| Phase | Work | Exit |
| --- | --- | --- |
| P0 Baseline | Golden capture. Perf baseline (§9). | Golden committed; baseline numbers recorded |
| P1 Foundation (serial, one agent) | `readingsOf` extracted, with chips drawing from it. `charts.tsx`, `frame.tsx`, `views/index.ts` with all 9 entries (8 stubs delegate to chips). Snapshot fields, store keys and guards, the command, `utcOffsetMin` and `glyphs` verified, every shared phrase and format, `tests/matrix.ts` and helpers, the `panel` and `flap*` tokens. **Pre-existing leak fix:** `turnStartCost` entries for subagent turns are never cleared (`TurnStartInput` has no `agentId`); fix it and test it. | Golden green; existing suite unchanged; new tests green; validate and tsc clean |
| P2 Views on today's data (parallel) | `ledger`, `tiles`, `gauges`, `rings`, `departures`, `forecast`. One agent per view, each in its own git worktree off the P1 tip (branch `layouts/<name>`), touching only `views/<name>.tsx` and `tests/view-<name>.test.ts`. A shared-helper change goes as its own small PR to the integration branch first, and the other agents rebase. | Each view's suite green. Merged one at a time, in that order, with the full suite run after each. |
| P3 Histories, then pulse and week (serial) | Trails, `reWarm`, `limitSamples`, then the two views | History tests and both suites green |
| P4 Production | Perf pass (§9). Independent whole-branch review, fixes test-first. Final quality pass. Docs, CHANGELOG `0.12.0`, version, demos, issue #1. | §10 |

- **Branching:** integration branch `feat/layouts` off `main`. One PR to `main` at the end. Pushing and tagging stay with the maintainer.
  - "A small PR to the integration branch" in P2 means a local merge into `feat/layouts`. Nothing is pushed without the maintainer's go-ahead.
- **Worktrees:**
  - The engine types under `.claude-plugin/types/` are generated and git-ignored, so each P2 worktree gets a copy before `tsc` runs.
  - If creating or removing a worktree is refused by permissions, the maintainer runs it.
- **Order:**
  1. P0 and P1 run serially.
  2. The implementation plan for P0 and P1 is written task by task, with the tests named, before code.
  3. Fan-out starts at P2 only, once P1 has frozen its interfaces.
- **The `turnStartCost` leak is a hypothesis.** P1 first writes a test showing whether `turn.start` fires for subagent turns, and fixes it only if it does.
- **The canvas** is refreshed to v2 before P2 starts.
- **P1 freezes** these for P2: the `View` type and `VIEWS`, `Readings` (complete), every phrase and format, `charts.tsx`, `frame.tsx`, the snapshot fields, `tests/matrix.ts` and `helpers.ts`, and the palette tokens.
- **Changelog, README and version** change in P4 only.

## 9. Performance and memory (a hard gate)

The band redraws on every `ui.render`, and today that is far more often than the timer:
- the timer, every minute, and every second in the cache's last ten;
- every `turn.step`, subagents included;
- every git read and every `session.measure`;
- every props change.

The budgets below are tied to what tests can measure. The test sandbox has no `process.memoryUsage` or `gc`, and CI is several times slower than a laptop.

| What | Budget | Test |
| --- | --- | --- |
| Draw cost | Each layout's draw is at most 2× chips' in the same run, at 200 columns, collapsed and expanded. `performance.now` is confirmed real under the mocked clock in P0; if it isn't, this row becomes the next one. | `tests/perf.test.ts`, calling `drawBand` directly, 200 draws after warm-up; numbers logged |
| Work per draw | `readingsOf` runs once per draw. Tree builds per draw ≤ (give-way steps + 1) per row. No Svg string is built outside the final tree. | Counters, asserted |
| Tree size | ≤ 400 nodes collapsed, ≤ 1,500 expanded; Svg source ≤ 8 KB per row | Asserted in the matrix |
| Redraws | A timer tick that changes nothing does not invalidate. Layouts with clock times add only what they show to the paint key. | `ui.invalidate` counted over a calm 10-minute walk |
| Store writes | `limitSamples` at most once per 15 minutes. `layout` only on the command. Never while drawing. | Write count over a 2-hour walk |

**Memory: nothing grows without a bound**
- **Capped histories:** `costTrail` 24, `contextTrail` 40, `fiveHourTrail` 300, `limitSamples` 672. Each is enforced at insertion and asserted.
- **Clearing:** the conversation trails clear on `session.end` and `session.start`.
- **One timer** (`band.tick`). Layouts add no timers, listeners or module state, and views are pure.
- **No closures kept across draws.** Button handlers come from `BandActions`, made in `register.tsx`.
- **The pre-existing `turnStartCost` leak is fixed** in P1.
- **Soak test,** `tests/soak.test.ts`: 6 hours of clock in coarse ticks, 1,000 turns, 3 `/clear`s and a layout switch every hour. At the end:
  - every history is at or under its cap;
  - one timer;
  - stored JSON under 100 KB;
  - per-draw counters unchanged from the start.
- Heap is not measurable in the sandbox. That is stated in the PR, not hidden; the bounded-structure assertions prove what can be proven.

**P4 performance pass.**
- **Measure first.** Profile every layout with the perf test.
- **The likely win** is in today's code: gate the unconditional `invalidate` calls (`turn.step`, `session.measure`, git reads) by a paint key, so a step that changes nothing doesn't redraw.
  - This changes *when* the band repaints, not *what* it draws, so the golden trees don't guard it.
  - It is its own change with its own tests. The paint key must cover every input a draw reads (`isWorking`, cache mood, the countdown text, limits, context, cost, workspace, layout, expanded), and a test proves that changing each input repaints.
- **Next options:** a binary search in `squeezeToFit` (the fit is monotone), and building Svgs once per draw.
- **No memo** is added unless the profile shows the need.
- **Record the numbers** before and after in the PR.

## 10. Production gate ("ready" means all of these)

- [ ] `claude plugin validate .` and `claude plugin validate plugins/session-usage-band` pass. CI is green on the PR.
- [ ] `claude plugin test`: everything passes. The existing suite passes with no assertion changed. The total count comes from the run. Suite time on CI is at most 2× today's.
- [ ] `tsc` is clean on a signed-in local session, with its output in the PR.
- [ ] The golden chips trees are deep-equal, with no layout stored and with `chips` stored.
- [ ] The matrix is green: 9 layouts × 3 appearances × 2 surfaces × 20 scenarios, plus both glyph tiers.
- [ ] Every column from 40 to 200 keeps the declared rows. Below 40, chips is drawn. Expanded fits maxRows 4, 8, 13 and 40, with the buttons present.
- [ ] Contrast: text ≥ 4.5:1 and marks ≥ 3:1 on the panel, in every palette. Every Svg has an alt. NO_COLOR keeps every `!`.
- [ ] No red. No send-to-keep-warm wording. Every estimate carries `~`. Terminal glyphs are in their tier's allowlist.
- [ ] Performance and memory (§9) are within budget, with the numbers in the PR.
- [ ] The store stays bounded and nothing throws when it fails. The bad-layout and view-throws fallbacks are tested. No new dependencies.
- [ ] An independent reviewer read the whole branch. Every Critical or Important finding was fixed test-first.
- [ ] **Final quality pass,** nothing left of:
  - dead code, unused exports, debug output, TODOs or commented-out code;
  - names off the §4.3 table;
  - comments out of the codebase's style;
  - typos in code, copy or docs.
- [ ] Docs, CHANGELOG `0.12.0` (Added), version, the plugin README "Layouts" section (with row counts and `CC_BAND_GLYPHS`), the root README, the CONTRIBUTING file table (`views/`, `charts.tsx`), demos rebuilt, issue #1 updated.
- [ ] The maintainer checks every layout by hand on the desktop and in a terminal, collapsed and expanded, before tagging. Pushing and tagging are the maintainer's go-ahead.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Nine views multiply the surface | One readings model. Views hold no logic. The matrix tests them all. |
| The width estimate runs short on the desktop | Keep `ROW_SLACK`. Size Svgs from measured free width. Check by hand in P4. |
| The time zone in the sandbox | Verified in P1, with a fallback to `date +%z`, then to relative times |
| Store races and stale samples | Bucket dedupe, reset-keyed pruning, caps |
| Braille glyphs missing from a font | Braille is common in monospace fonts and their fallbacks. `CC_BAND_GLYPHS=ascii` drops it. |
| Matrix runtime on CI | `LONG` budgets. Width sweeps one test per view and surface. Measured in P1. |
| A multi-row layout feels heavy | It's opt-in, with the row counts in the README |
| A parallel merge conflict | P1 freezes shared files. Views touch only their own two files. Merged one at a time. |
