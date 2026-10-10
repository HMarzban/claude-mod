# Band layouts: design spec

v3 · 2026-10-09 · issue HMarzban/claude-mod#1 · visual reference: the "Usage band layouts" canvas, Keepers row.

Status: Implemented in 0.12.0.

**Where the canvas and this spec differ, the spec wins.** The canvas is refreshed to match before P2.

Maintainer decisions:
- `LAST CALL` stays.
- New layouts draw on a filled panel.
- The names `ledger` and `week` stay.
- Terminal charts use braille, with an ASCII tier (§3.2).

## 1. What we are building

`/usage-band layout <name>` chooses one of nine layouts. **Chips**, today's band, stays the default and draws exactly what it draws today. The other eight are pure views over the same readings.

| Name | In one line | Desktop rows | Terminal rows |
| --- | --- | --- | --- |
| `chips` | Today's row of pills; four cards behind ▿ | 1 | 1 |
| `gauges` | Two rows of labelled bars; a tick marks how much of each window has gone | 2 | 2 |
| `ledger` | Words only, `·`-separated | 1 | 1 |
| `rings` | A ring per reading, with the value over the label beside it | 2 | 1 |
| `pulse` | Per-message cost bars and the 5h trend | 2 | 1 |
| `tiles` | A bold value over a label; on the desktop, a 4 px underline bar | 2 | 2 |
| `week` | The 7d window as day cells, the 5h window as hour cells | 2 | 2 |
| `departures` | A split-flap board: `CACHE · DEPARTS 14:32` | 1 | 1 |
| `forecast` | Weather-style columns: now, then each change at its clock time | 2 | 1 |

- A layout's row count depends on width only, never on state or history.
- Below 40 columns, every layout draws chips.
- **Non-goals:**
  - new palettes;
  - per-project layouts;
  - a layout env var;
  - the `/config` picker;
  - user-defined layouts;
  - toast changes;
  - a new amber trigger for the 7d pace.

## 2. The UX contract

§2 binds the eight new layouts. Chips keeps its golden output (§7), except for the glyph tier (§3.2).

1. **Quiet when fine.** Amber appears only on the triggers chips already uses:
   - the cache's last minute;
   - context within 90% of the compaction point, or at 80% of the window when compaction is off or unknown;
   - a limit at 80%;
   - a measured 5h pace (`etaMs`) that fills before its reset.

   Nothing is red. A cold cache is a price, not an error. An average-rate projection at or over 100% says `full before reset` in calm words, for 5h and 7d alike.
2. **Amber always has words.** An amber reading's text starts with `! `, once. The one exception is departures' `LAST CALL`, which is its own mark. `!!` stays in chips. The words come from `reading.ts`:

   | Trigger | Non-chips | Departures |
   | --- | --- | --- |
   | Cache, last minute | `! 47s left · re-warm ~$1.66` | `LAST CALL` · `47s` · `RE-WARM ~$1.66` |
   | Context near compaction | `! context 93% · compacts in ~12k` | `! COMPACTS IN ~12K` |
   | Context, compaction off | `! context 85%` | `! CONTEXT 85%` |
   | Limit at 80% or more | `! 5h 82%` | `! NEAR LIMIT` |
   | 5h pace fills before reset | `! 5h full in ~40m` | `! FULL ~14:20` |

3. **Never suggest sending a message** to keep the cache warm. `LAST CALL` states the moment and the price, and nothing more.
4. **Estimates carry `~`;** measured facts carry nothing. Use `~` everywhere and never `≈`.
5. **Formatting lives in one place.**
   - No view formats a number, time, duration or price; `format.ts` does.
   - Shared phrases come from `reading.ts`: amber words, pace, reset, empty states and alt text.
   - A view's own fixed labels (`CACHE`, `ITEM`, `cooling`, `DEPARTS`) live in its file.
6. **Never wraps, never scrolls.**
   - Collapsed, a layout keeps its rows at every width from 40 to 200, dropping pieces in its declared give-way order.
   - An amber piece never gives way while a calm one remains.
   - Once no calm piece is left, each amber piece switches to its short form (`! 47s`, `! ctx 93%`, `! 5h ~40m`).
   - Past that, the row clips, as chips' does, with `▿` pinned at the end.
   - `▿` never goes.
   - Expanded, a layout fits `maxRows`: it drops its least important facts first and never loses the buttons.
7. **Same facts behind ▿.**
   - Every expanded view shows the workspace strip, the Cache facts first, then Spend, Context and Limits (with `otherLimits`) in the view's order, and the `Collapse` (`c`) and `Hide band` (`h`) buttons.
   - ▿ turns to ▵, and the collapsed part above is unchanged.
   - Collapsed, `otherLimits` are not shown, as in chips.
8. **Every state is drawn.**
   - All five cache moods.
   - While Claude is working, the cache shows no countdown and no clock time.
   - A passed reset, unknown context, compaction off, no limits.
   - None of these prints NaN, `undefined` or an empty cell.
9. **Svg on the desktop only** (`kit.Svg`). Plain and the terminal draw the text form.
   - Every Svg has an `alt` and a `width`.
   - No Svg uses an `id`, a gradient, a pattern or a clipPath.
   - Text inside an Svg uses `system-ui, sans-serif`.
10. **Contrast on a known ground.**
    - Every non-chips layout draws on `palette.cardBg`, a ground we own. Plain draws on none and uses theme keys (`BARE`).
    - Text is at least 4.5:1 and marks at least 3:1 on that ground, in every palette.
    - A tick or dot has a 1 px knockout and stands taller than its track.
    - A projection is a dashed stroke at full opacity.
    - Day and hour cells show their value by fill height, outlined in `trackStroke`, never by opacity.
    - Split bars use `meterFill` (input), `label` (output) and `value` (cache reads).
    - `coin` is for the coin icon only. A re-warm is marked by its word and a capped `value` bar.
11. **Type size is the host's.** Hierarchy comes from bold, colour and position. A larger numeral appears only inside a view's own Svg, and is repeated in text and `alt`.
12. **Time words never collide.**
    - Countdowns: `52m left`, and in the last minute `47s left`; chips keeps `0:47`.
    - Clock times: `14:32`, `Mon 08:40`.
    - After ↻: `↻ in 3h 00m` for a duration, `↻ 16:40` for a time.
    - On the board: `IN 52 MIN`, never `52M`.
13. **Screen readers.** Alt text comes from `reading.ts` as `<name> <value>, <state>[, about <estimate>]`, in words ("about", "resets in"), never `~` or `↻`. Opening the view removes no fact a reader hears.
14. **Hover cards are chips-only.** Every fact a hover would explain is in the expanded view.

## 3. Drawing and glyphs

### 3.1 Canvas element to engine primitive

`Box` has no opacity, no per-side border and no dashed border, so every soft visual is an Svg on the desktop.

| Element | Desktop | Terminal (unicode tier) |
| --- | --- | --- |
| Pill, flap cell | `Box backgroundColor`, `paddingX={1}` | Same (plain uses `[` `]`) |
| Bar with thumb, tick or projection | `meter({ tick, projectTo })`, today's meter extended; with no options it is unchanged | `█░`, a tick `│`, a projection `▒` |
| Ring, donut | `ring()`, 22–30 px collapsed, 64 px expanded | A meter; a donut becomes the split bar |
| Sparkline, bar or line chart | `sparkline()`, `barChart()`, sized from free width | A braille sparkline |
| Day and hour cells | `dayCells()` | Braille heights; today in `[ ]` |
| Column separator | Text `│` | Same |

### 3.2 Glyph tiers

**The problem.** Ink measures East-Asian-*Ambiguous* glyphs as one column. A terminal that draws them wide shows two, so the row overflows. That happens in a CJK locale, or with the iTerm2 / Terminal.app "ambiguous = double width" option. Partial blocks also jitter across fonts.

From Unicode `EastAsianWidth-18.0.0.txt`:

| Class | Glyphs |
| --- | --- |
| Ambiguous | `█ ▒ │ · Σ … ±`, `▁–▇`, `○ ●`, box drawing |
| Neutral, always one column | `░ ↻ ◷ ◔ ▿ ▵`, and all braille `U+2800–28FF` |

**The fix,** as btop and termui do it. One tier is chosen per session:

| Tier | When | Glyphs |
| --- | --- | --- |
| `unicode` | the default | What the band ships today (`█ ░ │ · ↻ Σ ◷ ◔ ▿ ▵ … ±`), `▒` for a projection, and braille for charts |
| `ascii` | `CC_BAND_GLYPHS=ascii`, or a CJK locale (the first of `LC_ALL` / `LC_CTYPE` / `LANG` that is set starts `ja`, `zh` or `ko`) unless `CC_BAND_GLYPHS=unicode` | ASCII only. Charts give way to their numbers. `█#` `░-` `▒:` `│\|` `·-` `▿v` `▵^` `….` `±+` `●*` `■#` `–-` `↑+` `↓-`, and `↻` `Σ` `◷` `◔` are dropped. |

- **Never wider.** Every ascii mapping is one character at most, because the squeeze measures the row before the mapping. A glyph the map drops takes the one space after it (`◷ cache` becomes `cache`); any other non-ASCII character is dropped alone. Nothing else collapses, so deliberate padding survives.
- **Banned in every new layout:** `○◐◑◕`, weather symbols, `▮▯▰▱`, `▁–▇`, emoji and VS16. Forecast says "warm / cooling / cold" in words.
- **Braille charts:** two values per cell (left and right dot columns), four heights each.
- **Charts never stand alone.** A braille chart always sits beside its numbers, because braille reads as "braille pattern dots". The README recommends `ascii` for screen-reader users.
- **Detection gap and chips.** The double-width option in a non-CJK locale can't be detected, so the README names `CC_BAND_GLYPHS=ascii`. The tier applies to chips too. That is a fix for CJK users, and the one exception to "chips is unchanged". With no env var and a non-CJK locale, chips is identical.

## 4. Architecture

### 4.1 Layers

Each layer depends only on the one below it.

```
register.tsx   engine, atoms, store, histories
  → snapshot.ts   the contract
    → reading.ts   readingsOf(snap): every fact, phrase, tone and alt (pure)
      → views/<name>.tsx   pure drawing, with kit.tsx, charts.tsx, views/parts.tsx, views/frame.tsx
band.tsx: drawBand builds kit and readings once, calls VIEWS[layout].draw, and falls back to chips if it throws
```

| File | Role |
| --- | --- |
| `hooks/reading.ts` | Gains `readingsOf(snap): Readings`. Today's `drawBand` closures are **extracted, not rewritten**, into it. That covers cache, spend, context, each limit window (with `projectedPct`), `otherLimits`, `worstLimit`, the workspace and the alt strings. A fact that has a long and a short form carries both. |
| `hooks/charts.tsx` | `meter` (hoisted from band.tsx), `ring`, `sparkline`, `barChart`, `dayCells` and `braille`. Each takes a `key`. |
| `hooks/views/parts.tsx` | Pieces shared by several views, hoisted from band.tsx: `pill`, `batteryIcon` and `textBattery`, and `layoutCachePill`, the cache pill the new views share; chips keeps its own `cachePill`. `pill` takes an optional `hover`, and only chips passes one. |
| `hooks/views/frame.tsx` | The expanded scaffold: where the strip goes, `bodyRows = max(0, maxRows − collapsedRows − 3 − stripRows)`, and the buttons row. At `bodyRows = 0` it draws only the buttons row, with the strip in the footer if it fits. A view may draw the strip in its own style; ledger, for example, draws it as a sentence. |
| `hooks/views/index.ts` | `VIEWS: Readonly<Record<LayoutName, View>>`. The compiler rejects a missing view. The list reply comes from `LAYOUT_NAMES`, the names `VIEWS` is keyed by. |
| `hooks/views/<name>.tsx` | `export const <name>View: View`. `chips.tsx` keeps `limitChip`, `buildPills` and its `GIVES_WAY`. Its existing `format.ts` calls move over unchanged, so it is exempt from the no-`format.ts` rule. |
| `hooks/snapshot.ts` | `LAYOUT_NAMES`, `LayoutName`, `DEFAULT_LAYOUT = 'chips'`, plus the fields `layout`, `utcOffsetMin`, `glyphs` and the histories |
| `hooks/memory.ts` | `LAYOUT_KEY`, `LIMIT_SAMPLES_KEY`, `asLayoutName(v: unknown)` (it trims and lowercases a string, and serves both the command and the store), `asLimitSamples` |
| `hooks/layout.ts` | Adds `ROW_PX = 24`. `cellsOf` measures a column Box as the widest of its rows. Each collapsed row is squeezed on its own: it takes the smallest squeeze at which it fits, and a give-way step that names no piece in that row is a no-op for it. |
| `hooks/register.tsx` | `band.layout`, the command, store reads and writes, `utcOffsetMin`, `glyphs`, the histories |

```ts
type View = Readonly<{
  name: LayoutName
  rows: Readonly<{ desktop: number; terminal: number }>
  draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement
}>
```

- `read.frame` holds `expanded`, `maxRows`, `now` and `glyphs`.
- `kit` holds `columns`, `palette`, `surface` and `measure`.
- A new view never reads `snap` and never imports `format.ts`.

### 4.2 Command and persistence

| Input | Reply |
| --- | --- |
| `/usage-band layout` | `Usage band layout: chips. Choose one: chips, gauges, ledger, rings, pulse, tiles, week, departures, forecast.` |
| `/usage-band layout pulse` | `Usage band layout: pulse. /usage-band layout chips goes back.` For chips itself: `Usage band layout: chips.` |
| An unknown name | `Unknown layout "<input, clipped to 20>". Choose one: …`. Nothing changes. |
| A name the store can't save | The reply as above, then `It couldn't be saved, so it lasts until Claude's next reply.` |
| Any other word | `Usage: /usage-band [more \| less \| show \| hide] · /usage-band layout <name>`. The bracket is unchanged, so the existing test holds. |

- **Matching:** case and surrounding spaces are ignored.
- **Registration:** `argumentHint: '[more | less | show | hide | layout <name>]'`, with the description `Show, hide, expand, collapse or restyle the session usage band`.
- **Writing:** only the command writes `LAYOUT_KEY`, so an unset store never pins a default. Setting a layout shows a hidden band and calls `$.ui.invalidate('ui.render')`.
- **Reading:** into `band.layout` on `session.start` and `turn.complete`. The command updates it directly. `asLayoutName` returns `undefined` for anything unknown, and the caller falls back to chips.
- **Older versions:** both store keys are new, so 0.11.x ignores them.

### 4.3 Names

| Concept | Name |
| --- | --- |
| Readings | `Readings`, `readingsOf` |
| Layouts | `LayoutName`, `LAYOUT_NAMES`, `DEFAULT_LAYOUT`, `VIEWS`, `<name>View` |
| Store | `LAYOUT_KEY = 'layout'`, `LIMIT_SAMPLES_KEY = 'limitSamples'`, `asLayoutName`, `asLimitSamples` |
| Charts | `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `braille` |
| Time | `utcOffsetMin` (east positive), `fmtClock`, `fmtDayClock`, `fmtSecondsLeft` |
| Histories | `costTrail` `{ usd, reWarm }`, `contextTrail`, `fiveHourTrail`, samples `{ at, fivePct, sevenPct, fiveResetAt, sevenResetAt }` (epoch ms) |
| Other | `worstLimit`; `glyphs: 'unicode' \| 'ascii'` from `resolveGlyphs(env)` |
| Words | "re-warm" (code `reWarm`), "workspace strip"; `5h` and `7d` in rows, "5-hour limit" and "Weekly limit" in headings |

## 5. Data

| Data | Used by | Source | Bound |
| --- | --- | --- | --- |
| 5h and 7d `projectedPct` | gauges, rings, tiles, week, departures, forecast | Today's Limits card computes `percentUsed / gone`; it moves into `readingsOf`. With a measured 5h `etaMs` that fills before the reset, the 5h `projectedPct` is 100, so the words and amber agree. | — |
| `reWarm` | pulse | `recordResponse` sets `cache.lastRebuilt` when a turn's first main-loop request rewrote the cache: TTL expired, a miss, a compaction, a model switch. Today's `misses` counts only unexpected misses, so it isn't enough. | — |
| `costTrail` | pulse | `noteTurnEnd` pushes `{ usd, reWarm }` | 24; cleared on `session.end` and `session.start` |
| `contextTrail` | pulse (expanded) | `turn.complete` pushes the context used | 40; same clearing |
| `fiveHourTrail` | pulse | A trail beside `insights` (whose 30-minute pace samples stay untouched), at most one reading a minute. It belongs to the account, so it clears on `session.start` only. | 300 (5 h) |
| `limitSamples` | week (days and hours) | `$.store`, written on `turn.complete`, at most one per 15-minute bucket. `fivePct` is ignored when `fiveResetAt` differs from the current window, and `sevenPct` when `sevenResetAt` does. A day cell is that day's rise in `sevenPct`. The hour cells are the five hours before the 5h reset. | 672 (7 d × 96), about 67 KB, measured in a test |
| `utcOffsetMin` | departures, forecast | `-new Date(now).getTimezoneOffset()`, with `now` from `$.clock`, re-read on `turn.complete`. A real UTC offset can't be told from a missing one, so P1 tests whether the sandbox reports the local zone. If it doesn't, these two views ship relative times for everyone. | — |
| `glyphs` | all | `resolveGlyphs(env)`, at `session.start` | — |

- **Empty states:**
  - Pulse: "Costs show after Claude's next reply."
  - Week: "History fills in as you use Claude."
  - A missing sample shows as unknown, never 0%.
- **The guess for days ahead (week):** `(projectedPct − percentUsed) / days left`.
- **Concurrent sessions:** `$.store` has no compare-and-set, so two sessions can lose one sample write. The 15-minute buckets make a lost write harmless.

## 6. The layouts

**Escalation** is what amber changes. **Give-way** is what drops first as the window narrows; it lists calm pieces only. Every non-chips layout draws on `cardBg` (§2.10).

### chips
- Today's band, drawn from `Readings`. Its output must match the golden capture (§7).

### gauges
- **Collapsed:**
  - Row 1: `cache`, a time-left bar, `52m left · re-warm ~$1.66`, then on the right `$3.19 · 225k tokens`.
  - Row 2: context, 5h and 7d cells (label, bar, value), then ▿.
  - The context bar ends at compaction. Ticks are on 5h and 7d only.
- **Escalation:** the bar and its words, per §2.2.
- **Give-way:**
  1. tokens;
  2. reset texts;
  3. the cost joins the cache sentence;
  4. bars shrink to 6 cells;
  5. calm cells become text (`5h 4%`), still two rows.
- **Expanded:** four panels.
  - Cache: hit rate, saved, lasts.
  - Spend: split bar with legend, last message.
  - Context: room, compacts at, window.
  - Limits: ticked bars with a dashed projection and `on pace for ~X%`, then `otherLimits`.

### ledger
- **Collapsed:** `cache 52m left · $3.19 · context 38% · 5h 4%, resets in 3h 00m · 7d 30%, resets in 2d 19h`, then ▿.
- **Escalation:** `! ` plus the §2.2 words.
- **Give-way:**
  1. `resets in X` becomes `↻ in X`;
  2. reset times;
  3. 7d;
  4. context;
  5. the cost;
  6. 5h.
- **Expanded:** the workspace as a sentence, then CACHE, SPEND, CONTEXT and LIMITS as columns of short sentences, two by two below 100 columns.

### rings
- **Collapsed:**
  - Cache, context, 5h and 7d each get a ring, with the value over the label. On 5h and 7d, a dot marks the window gone.
  - The cost has no ring.
  - Terminal: a meter, the value and the label.
- **Escalation:** the ring and label turn amber, and the label says why (`! 5h full in ~40m`).
- **Give-way:**
  1. labels shorten to names;
  2. reset text;
  3. 7d;
  4. the cost;
  5. context.
- **Expanded:** four panels, each with a 64 px ring and its facts. The spend panel is a donut. The limits panel nests 5h outside and 7d inside.

### pulse
- **Collapsed:**
  - The cache pill.
  - The last 14 costs as bars: the newest in `value`, a re-warm capped and labelled, with the total and `last $0.21`.
  - The 5h trail over the last hour, with `on pace for ~X%` or the §2.2 words, and the reset.
  - `context 38% · 7d 30%`, then ▿.
  - Terminal: braille beside the numbers.
- **Escalation:** the trail turns amber and gains a dashed projection.
- **Give-way:**
  1. context text, then 7d text;
  2. reset;
  3. bars from 14 to 8;
  4. the trail becomes text;
  5. the bars become text.
- **Expanded:**
  - Cost per message, the last 24, with an average line and the re-warms labelled.
  - The 5h window from start to reset, with now marked and a dashed projection.
  - Context over the conversation, with the compaction line.
  - A cache panel.

### tiles
- **Collapsed:**
  - Five tiles: cache, cost, context, 5h (`↻ in 3h 00m`) and 7d. Each is a bold value over a label.
  - On the desktop, a 4 px underline bar sits under each label except the cost's. It doesn't count as a row (§7 `visualRows`).
- **Escalation:** the value and label turn amber, and the label says why.
- **Give-way:**
  1. the underline;
  2. reset text;
  3. the 7d tile;
  4. the context tile.
- **Expanded:** four groups (Cache, Spend, Context, Limits), each 2×2. A dashed underline is a projection.

### week
- **Collapsed:**
  - `7d`: seven day cells, height-filled, with today outlined heavier, days ahead dashed, and initials beneath. Then the value and `↻ Mon 08:40`.
  - `5h`: five hour cells, labelled by clock hour (`11 12 13`).
  - Row 2 holds the initials, then the cache pill, the cost and ▿.
  - Terminal: braille heights, with today in `[ ]`.
- **Escalation:** amber cells and words. The cell where the 5h pace fills is marked `!`.
- **Give-way:**
  1. reset text;
  2. 5h cells become `5h 4%`;
  3. 7d cells become `7d 30%`.
  - Once both windows are text, row 2 holds only the cache pill, the cost and ▿, so it is still two rows.
- **Expanded:** large day cells with % and date, showing the guess for days ahead as `~7%` (§5). Then hour cells with clock labels, a summary per window (used, on pace for, busiest day) and a facts line.

### departures
- **Collapsed:** `CACHE · DEPARTS 14:32 · IN 52 MIN`, then `5H · 4% · ~10% AT ↻`, then `7D · 30%`, then `$3.19`, then ▿.
- **Cache statuses:**
  - `DEPARTS hh:mm`.
  - `LAST CALL` with `47s` and `RE-WARM ~$1.66` (amber).
  - `DEPARTED hh:mm` with `RE-WARM ~$1.66`.
  - `BOARDING`, with no time, while Claude is working.
- **Limit statuses:** `~X% AT ↻` when calm; `! NEAR LIMIT` or `! FULL ~14:20` when amber.
- **Give-way:**
  1. the 5h projection;
  2. `IN 52 MIN`;
  3. 7d;
  4. 5h becomes `5H 4%`.
- **Expanded:** a header row of flaps from the workspace, then the board, ITEM · STATUS · TIME · REMARKS, with CACHE, CONTEXT, 5H, 7D, SPEND and `otherLimits`. REMARKS truncates first.
- **Colours:** new palette tokens `flap`, `flapText` and `flapDim`, contrast-tested.

### forecast
- **Collapsed:** now, plus at most three events in time order:
  - cold;
  - `! 5h full`, when the pace fills;
  - 5h resets;
  - 7d resets, only within 24 h.

  Each column has a time and condition (`now · warm`, `14:32 · cold`), with a detail row on the desktop (`52m left`, `re-warm ~$1.66`). Only the next event shows "in Xm". The terminal shows one row of columns split by `│`. "Cooling" is the `expiring` mood.
- **Escalation:** now becomes `! cooling · 47s left`, with `re-warm ~$1.66` in its detail row on the desktop, or after it where there is no detail row; short, `! 47s` (§2.6). `! 5h full` is placed in time order.
- **Give-way:**
  1. far events, 7d first;
  2. the "in Xm";
  3. the desktop detail text shortens.
- **Expanded:** an outlook row for each of Cache, Context, 5h, 7d, Spend and `otherLimits`. Each row gives the value now and the outcome in words, and every row but Spend's a range bar to where it lands (ring = now, dashed = ahead, tick = the line). Spend has nothing to land at, no line of its own (a gateway's budget is its own `otherLimits` row) and no count of messages ahead, so its row gives the total, the last message and the tokens.

## 7. Testing

- **Golden capture (P0, before any code moves).**
  - P0 writes `SCENARIOS` in `tests/matrix.ts` first; P1 adds the rest of that file.
  - `tests/golden-capture.test.ts` is outside the normal run, gated by an env var. It draws chips for 20 scenarios × 2 surfaces × {dark, plain} × widths {40, 95, 200} × collapsed and expanded, on a pinned clock. That is 480 cases.
  - It prints one FNV-1a hash per case over canonical JSON (functions dropped, keys sorted; the sandbox has no crypto). A script writes them, plus about 10 full trees so a failure can be diffed, into `tests/golden/chips.ts`, which is committed.
  - `tests/golden.test.ts` asserts them with no stored layout and with `chips` stored. The golden file is frozen.
- **`tests/matrix.ts`:**
  - **Scenarios:** calm, unmeasured, warming, recalled, cold, last minute, working, near compaction, compaction off, limit 80%, 5h ahead, 7d full before reset, no limits, gateway spend, reset passed, no workspace, not a repo, git fails, empty history, full history.
  - **Exports:** `SCENARIOS`, `AMBER_WORDS`, `drawAs`, `viewSuite`, `expectInvariants`, and `visualRows(tree, surface)`.
  - **Measures:** widths use `cellsOf(tree, DESKTOP | TERMINAL)`. For `visualRows` on the desktop, a Text line is `ROW_PX`, an Svg is its height, a column Box sums its children and a row Box takes the tallest; the total is divided by `ROW_PX`, rounded to the nearest row. The terminal counts lines.
- **`expectInvariants` checks:**
  - the declared rows;
  - ▿ or ▵;
  - width ≤ columns (skipped for all-amber below 60 columns, where the row clips);
  - no whitespace-only children on the desktop;
  - no Svg outside the desktop;
  - every Svg has an alt and a width;
  - no red;
  - no send-to-keep-warm wording;
  - amber words present;
  - estimates carry `~`;
  - glyphs in the tier's allowlist.
- **`viewSuite(layout)`:**
  - all 20 scenarios × 2 surfaces, in dark;
  - calm and all-amber in light, plain and the `ascii` tier;
  - widths 40, 41, 50, 60, 67, 68, 80, 95, 120, 160 and 200 for calm and all-amber, one `LONG` test per surface;
  - expanded at `maxRows` 4, 8, 13 and 40.
  - A view runs `viewSuite` from its own P2 or P3 task onward. Until then it is a stub that draws chips.
- **`tests/layout-command.test.ts`:**
  - list, set, case, unknown;
  - persisted across sessions;
  - a bad stored value;
  - no write when unset;
  - setting shows the band and invalidates;
  - another session's change after `turn.complete`;
  - a throwing view falls back to chips.
- **`tests/history.test.ts`:** caps, clearing on `/clear` and resume, the 15-minute buckets, reset pruning, a failing store (new `storeFails` in `helpers.ts`), and the measured size.
- **`design.test.ts`:** iterates the palettes, including the `flap*` tokens and the pill `surface`, over `cardBg` and the host grounds.
- **The existing suite** passes with no assertion changed. Report its count from a real run, never a hardcoded number.
- **`tsc`** needs a signed-in session, so CI can't run it. Run it locally and put its output in the PR.

## 8. Phases

| Phase | Work | Exit |
| --- | --- | --- |
| P0 Baseline | The golden capture; perf baseline (§9) | Committed |
| P1 Foundation, one agent, serial | Extract `readingsOf` and draw chips from it. Then: `charts.tsx`, `parts.tsx`, `frame.tsx`, `VIEWS` with 8 stubs that draw chips, the snapshot fields, the store keys and guards, the command, `glyphs`, a `utcOffsetMin` check, every shared phrase and format, `tests/matrix.ts`, `storeFails`, the `flap*` tokens. As a separate commit, `turn.start` gets the `agentId` filter `turn.complete` already has (register.tsx), with a test. | Golden and the existing suite green, unchanged; new tests green; validate and tsc clean |
| P2 Six views, in parallel | `ledger`, `tiles`, `gauges`, `rings`, `departures`, `forecast`. One agent each, in its own worktree (`layouts/<name>` off the P1 tip), touching only `views/<name>.tsx` and `tests/view-<name>.test.ts`. | Each suite green. Merged locally into `feat/layouts` in that order, running the full suite after each. |
| P3 History views, serial | The trails, `reWarm` and `limitSamples`, then `pulse` and `week` | Green |
| P4 Production | Perf pass (§9). Independent review, with fixes test-first. Final quality pass. Docs, CHANGELOG `0.12.0`, version, demos, issue #1. | §10 |

- **P1 freezes**, before P2 starts:
  - `View`, `VIEWS` and `Readings`;
  - every phrase and format;
  - `charts.tsx`, `parts.tsx` and `frame.tsx`;
  - the snapshot fields;
  - `tests/matrix.ts` and `helpers.ts`;
  - the palette tokens.

  A P2 agent that needs a change to any of these stops. The change is merged on its own, and every worktree rebases.
- **Worktrees** need a copy of the git-ignored engine types (`.claude-plugin/types/`) before `tsc` runs. If permissions refuse a worktree command, the maintainer runs it.
- **The implementation plan** for P0 and P1 is written task by task, with the tests named, before any code. The canvas is refreshed before P2.
- **Git:** everything stays on `feat/layouts` locally. Nothing is pushed or tagged without the maintainer's go-ahead.

## 9. Performance and memory (a hard gate)

**Where the time goes today.** The band redraws on every `ui.render`, which happens on:
- the timer, every minute, and every second in the cache's last ten minutes;
- every `turn.step`, subagents included;
- every git read and `session.measure`;
- every props change.

The test sandbox has no heap API, and CI is several times slower than a laptop, so every budget below is a measurement a test can make.

| What | Budget | Test |
| --- | --- | --- |
| Draw time | Each layout at most 2× chips in the same run, collapsed and expanded, at 200 columns. If P0 finds `performance.now` frozen under the mock clock, this row drops and the tree-size row stands alone. | `tests/perf.test.ts` calls `drawBand` directly 200 times after warm-up, and logs the numbers |
| Tree size | ≤ 400 nodes collapsed, ≤ 1,500 expanded | In `expectInvariants` |
| Redraws | A timer tick that changes nothing doesn't invalidate (already true; kept true) | The test counts the engine's `ui.invalidate` events over a calm 10-minute walk |
| Store writes | `limitSamples` at most once per 15 minutes; `layout` only from the command; never while drawing | The test counts store writes over a 2-hour walk |

Every measurement is made from the test side. No counters or instrumentation go into production code.

**Memory: nothing grows without a bound**
- **Caps,** enforced on insert and asserted in tests: `costTrail` 24, `contextTrail` 40, `fiveHourTrail` 300, `limitSamples` 672.
- **Clearing:** the conversation trails clear on `session.end` and `session.start`.
- **One timer.** Views are pure, with no timers, listeners or module state. Button handlers come from `BandActions`.
- **`tests/soak.test.ts`:** 6 hours in coarse ticks, 1,000 turns, 3 `/clear`s and a layout switch every hour. Every history must stay within its cap (read through the snapshot), with one timer and stored JSON under 100 KB.
- **Heap** can't be measured in the sandbox. The PR says so; the bounded structures are the proof.

**P4 performance pass**
- **Profile** every layout with the perf test, and record the numbers before and after in the PR.
- **A candidate, adopted only if the profile shows it matters:** the `turn.step`, `session.measure` and git reads invalidate even when nothing changed.
  - **The fix:** gate them by a paint key that covers every input a draw reads: working state, cache mood, countdown text, limits, context, cost, workspace, layout, expanded.
  - **The tests:** it is its own change, with a test that changing each input repaints. The golden capture can't catch this, because it checks what is drawn, not when.
- **No memo or cache** is added unless the profile shows the need.

## 10. Production gate

- [ ] **Tests:**
  - validate passes, for the marketplace and the plugin;
  - the full test run is green and CI is green;
  - the existing suite passes with no assertion changed;
  - `tsc` is clean locally, with its output in the PR.
- [ ] Golden chips matches. Every view suite is green (§7), and with it the §2 contract.
- [ ] Contrast meets §2.10 in every palette (`design.test.ts`).
- [ ] Performance and memory are within §9, with the numbers in the PR.
- [ ] An independent reviewer read the whole branch. Every Critical or Important finding was fixed test-first.
- [ ] **A final quality pass leaves none of:**
  - dead code or unused exports;
  - debug output;
  - TODOs or commented-out code;
  - names off §4.3;
  - comments out of house style;
  - typos.
- [ ] **Docs:**
  - CHANGELOG `0.12.0`, under Added;
  - the version bump;
  - the plugin README "Layouts" section, with row counts and `CC_BAND_GLYPHS`;
  - the root README;
  - the CONTRIBUTING file table;
  - the demos rebuilt;
  - issue #1 updated.
- [ ] The maintainer checks each layout on the desktop and in a terminal, collapsed and expanded. Pushing and tagging happen only on the maintainer's go-ahead.

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| The desktop width estimate runs short | Keep `ROW_SLACK`, size Svgs from free width, check by hand in P4 |
| Braille missing from a font | Common in monospace fonts and their fallbacks; `CC_BAND_GLYPHS=ascii` |
| A multi-row layout feels heavy | It's opt-in, with row counts in the README |
