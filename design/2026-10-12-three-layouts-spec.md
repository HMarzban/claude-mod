# Three layouts: design spec

v2.1 · 2026-10-12 · supersedes `2026-10-09-band-layouts-spec.md` §1, §4.2's list reply, §6 and §7's per-view parts. That spec's §2 (UX contract), §3 (glyph tiers) and §5 (data) still hold, with the amendments in §2 below.

Status: Draft, reviewed (staff engineering, PM, head of engineering).

## 1. Scope

Every layout except chips opens into chips' cards (`defineCardsView` → `cardsView`), and draws its collapsed row with chips' pill, battery and meter parts. That is why they look alike. We keep three layouts, and each one owns what it draws.

| Name | Answers | Desktop rows | Terminal rows |
| --- | --- | --- | --- |
| `chips` | Is anything wrong right now? | 1 | 1 |
| `pulse` | Is my cost per message rising, and will a limit fill before it resets? | 1 | 1 |
| `departures` | When does the cache go cold, and when does each limit reset or fill? | 1 | 1 |

Below 40 columns every layout draws chips. Below 60 columns, departures draws chips: its tiles need the room (`View.minColumns`).

- **Removed:** `gauges`, `ledger`, `rings`, `tiles`, `week` and `forecast`.
- **Chips** is unchanged, and its golden hashes must pass byte for byte.
- **No new stored data.** Every series already exists. New reading facts are listed in §6.2.
- **Non-goals:** a picker, user-defined layouts, and animation beyond §4.1's heartbeat.

## 2. Rules

1. **One order.** Pulse and departures draw **Cache, Spend, Context, 5h, 7d**, then `otherLimits` when open.
   - Amber never moves a reading.
   - Give-way drops calm pieces and never reorders the ones that remain.
   - Cache and 7d never give way. Each may fall back to its short form.
   - Chips keeps its own rules: it already leads with the cache and ends with 7d.
2. **Separate looks, shared frame.**
   - Pulse and departures import nothing from `views/cards.tsx`. They import nothing that draws from chips either: no `pill`, no battery, no chips' tints.
   - All three share `views/frame.tsx`: the toggle, `bodyRowsFor`, and `footer` (§6.2).
3. **Amendments to the old §2:**
   - §2.9 (Svg text uses `system-ui`): departures' flaps use `ui-monospace, monospace`.
   - §2.10 (non-chips draw on `cardBg`): departures draws its board on `boardBg`, in every appearance but plain. Its tokens are tested at 4.5:1 for text and 3:1 for marks. The toggle and the footer stay off the board.
   - §2.1 (quiet when fine): motion counts as loud. Only an amber reading moves (§4.1).

## 3. One scenario for every sketch

Every sketch below draws the same moment, which is also the state the review screenshots were taken in. The toggle reads ▵ because the band is collapsed.

| Reading | State |
| --- | --- |
| Cache | Warm, 38m left, cold at 17:24, re-warm ~$0.57 |
| Spend | $0.24, last message $0.03 |
| Context | 8% used, ~893k left, compacts at 967k |
| 5h | 26%, resets 17:50, on pace for ~33% |
| 7d | 85% (amber), resets Sat 13:30, full ~Tue |

## 4. pulse

### 4.1 Collapsed

```
cache 38m  ╭╮╭─╮╭╮╭  $0.24 · last $0.03   context ⠤⠴⠶ 8%   5h ⣀⣠⣤⡠⠄ 26%   ▮▮▮▮▯▯▯ ! 7d 85%  ▵
```

(The sketch's glyphs stand for svg marks on the desktop.)

| Piece | Desktop (svg) | Terminal |
| --- | --- | --- |
| **Cache** | A 12 px heartbeat mark, then the words. One state per `cache.mood`:<br>• Warm: a still dot in `warm`.<br>• Expiring (`cache.tone === 'amber'`, the last minute): an amber dot that beats.<br>• Cold: a flat grey line.<br>• Unmeasured and warming: a hollow dot.<br>Two flags change the words, not the dot: recalled (not measured) puts `~` on the time, and working drops the countdown.<br>The words are the existing cache phrases (`38m left`, `! 47s left · re-warm ~$1.66`, `cold · re-warm ~$0.57`). | The words |
| **Spend** | `barChart` drawn as beats: the last 14 messages, each spike's height its cost, a re-warm capped flat. Then `$0.24 · last $0.03`. | A braille trace beside the words |
| **Context** | `sparkline` of `history.context`, the last 40 turns, scaled to the window. Then `context 8%`. | A braille trail beside the words |
| **5h** | `sparkline` over the window from its start to its reset. Its points are built in `reading.ts` (`history.fiveHourWindow`) from `week.hourRow`'s cells, so the view only draws them: measured solid, the projection dashed, now marked. Then `5h 26%`. | A braille trail beside the words |
| **7d** | `dayCells` for the seven days: measured solid, guessed dashed, today outlined. Then `! 7d 85%`. | The words |

- **Heartbeat.** Only an amber cache moves. Its alt names the mood ("cache warm", "cache in its last minute", "cache cold"), never the countdown, so its Svg doesn't change from one second to the next. The Svg's source changes only when the cache's mood changes, never per tick, so its frame isn't reloaded each second. The mark ships still in 0.14.0, its ink and words carrying the state: the spike (§8, step 1) had no answer by the time pulse was built. Motion is a follow-up release, and ships only if the spike shows that the frame survives redraws and that `prefers-reduced-motion` reaches it.
- **Give-way, calm pieces only, first to last:**
  1. `· last $0.03`;
  2. the context trail;
  3. the trace from 14 beats to 8;
  4. the 5h trail;
  5. the 7d cells;
  6. the trace.
  - Every reading's words remain. At its narrowest the terminal row is text alone, and that is accepted.
- **Empty states:**
  - No costs yet: the trace drawn flat, a dim line in a label's ink (braille's floor in text), then the total, and `no costs yet` only while the total is $0 (a resumed conversation's total says there were costs). Open, the Spend band draws its chart flat and says `Costs show after Claude's next reply.` after its words.
  - No 5h or 7d samples: that reading is words only.
  - No limits: 5h and 7d are left out.

### 4.2 Open

A stack of full-width bands laid out as a grid: every band's chart at one width, fitted once to the room (up to 240 px, a third of the room, leaving the words 24 columns; in text 12 braille cells), then a name column in a label's ink as wide as the longest name, then the words and any note. A band with too little to chart (no costs, one context reading, no 5h or 7d readings) draws its chart flat, a dim baseline, so the grid keeps its look. The context chart keeps 8 px above its scale, so its compaction line sits inside its own chart, clear of Spend's beats. 5h and 7d sit side by side where both fit beside the grid, else one over the other, each a line of the grid two rows tall.

| Band | Rows | Chart | Words |
| --- | --- | --- | --- |
| Cache | 1 | The time left as a draining line | `38m left · cold at 17:24 · re-warm ~$0.57` |
| Spend | 2 | The last 24 messages as beats, with a dotted average line and re-warms labelled | `$0.24 · last $0.03 · avg ~$0.02` |
| Context | 2 | The last 40 turns under a dashed compaction line | `8% · ~893k left · compacts at 967k` |
| Limits | 3 | 5h on the left: start to reset, now marked, projection dashed. 7d on the right: the day cells. | `5h 26% · on pace for ~33% · ↻ 17:50`<br>`! 7d 85% · full ~Tue · ↻ Sat 13:30` |

- Each band's words lead with its name in a label's ink, `cache`, `spend`, `context`, `5h` and `7d`, and never say it again: an amber 7d reads `7d ! 85% · full ~Tue · ↻ Sat 13:30`.
- `otherLimits` follow as one line of words, and that line counts in the body.
- **Rows at `maxRows` 13:** 1 collapsed + 9 body (8 for the bands and 1 for `otherLimits`) + 3 frame. The strip sits in the footer row.
- **Give-way:**
  1. `otherLimits`;
  2. the Context band;
  3. Limits to 2 rows;
  4. Limits to one row of words;
  5. Spend to one row of words;
  6. the Cache band;
  7. the body, leaving the footer alone.
- **Terminal:** the same bands as braille beside their words, one or two lines each.

## 5. departures

### 5.1 The board

- **Ground.** The board is a dark `Box` on `boardBg` in the dark and light appearances. Plain has no board: it draws groups as `[CACHE]` in theme keys.
- **Flaps.**
  - Desktop: one Svg per reading, at most 20 px tall, holding its ITEM code and its cell as runs of tiles a blank tile apart. Each character sits on its own tile, with a 1 px seam across the tile's middle; a space is a blank tile. The group's width is its character count × the tile's pitch, and the row is fitted by those widths.
  - Terminal: each group is a `Box backgroundColor` run, with a space between groups.
- **Alt text.** Each reading's one Svg has one alt: a sentence from the readings, in words, for example "cache 38 minutes left, warm". It never uses the board's capitals or `↻`.
- **Tokens** (new). The board is dark in both palettes, so DARK and LIGHT hold the same hex values, DARK's own, not aliases of their palette's accents. `design.test.ts` checks every item ink, `flapText`, `flapDim` and `flapAmber` at 4.5:1 on `flapBg` in DARK and LIGHT. The seam is decoration, not information, so it has no contrast target; it only has to differ from the tile. PLAIN draws no board (below).

  | Token | For |
  | --- | --- |
  | `boardBg` | The board's ground |
  | `flapBg` | A flap tile |
  | `flapSeam` | The tile's split line |
  | `flapItemCache` | CACHE, a warm green |
  | `flapItemSpend` | SPEND, gold |
  | `flapItemContext` | CONTEXT, a cool grey-blue |
  | `flapItem5h` | 5H, DARK's `fiveAccent` |
  | `flapItem7d` | 7D, DARK's `weekAccent` |
  | `flapText` | Statuses and times |
  | `flapDim` | Remarks |
  | `flapAmber` | Amber words. Nothing is red. |

### 5.2 Collapsed

```
CACHE DEPARTS 17:24  SPEND $0.24  CONTEXT 8%  5H 26% RESET 17:50  7D 85% RESET SAT 13:30 ! NEAR LIMIT  ▵
```

| Reading | Long form | Short form (give-way) |
| --- | --- | --- |
| Cache, warm | `DEPARTS 17:24` | `17:24` |
| Cache, last call, calm (`cache.lastCall` and `tone === 'calm'`) | `LAST CALL 17:24`, in `flapText` | `17:24` |
| Cache, last minute (`tone === 'amber'`) | `LAST CALL 47S`, in amber | `! 47S` |
| Cache, recalled (not measured) | `DEPARTS ~17:24` | `~17:24` |
| Cache, cold | `DEPARTED 17:24 · RE-WARM ~$0.57`, or `DEPARTED · RE-WARM ~$0.57` with no known time | `RE-WARM ~$0.57` |
| Cache, working | `BOARDING` | `BOARDING` |
| Cache, unmeasured or warming | `CHECK-IN` | `CHECK-IN` |
| Context, amber | `! COMPACTS IN ~12K`; with compaction off, `! 93%` | `! 93%`: the group's CONTEXT already names it |
| A limit | The value, then `RESET 17:50` (the flap face has no `↻`), then one remark. An amber remark replaces a calm one, and `RESET` stays: `! NEAR LIMIT` (80%), or for 5h, `! FULL ~14:20` (the pace fills; `! FULL IN ~40 MIN` with the zone unknown). | `5H 26%` |
| A passed reset | `RESET PASSED` | the value |

- **Give-way, calm only, first to last:**
  1. 5h's `RESET`;
  2. 7d's `RESET`;
  3. SPEND;
  4. CONTEXT;
  5. 5h's remark;
  6. the short forms.
  - CACHE and 7D never go.
  - Below 60 columns, departures draws chips.
- **Zone unknown:** every clock time becomes a countdown, `IN 38 MIN` and `RESET IN 1H 04M`, as the earlier spec's §2.12 allows on the board.

### 5.3 Open

```
 CLAUDE-MOD   MAIN   CLEAN
 ITEM     STATUS        TIME        REMARKS
 CACHE    DEPARTS       17:24       IN 38 MIN · RE-WARM ~$0.57 IF MISSED
 SPEND    $0.24         -           LAST $0.03
 CONTEXT  8% USED       -           ~893K LEFT · COMPACTS AT 967K
 5H       26%           17:50       ON PACE ~33%
 7D       ! NEAR LIMIT  SAT 13:30   85% · FULL ~TUE
                                       [Collapse c]  [Hide band h]
```

- **Header row.** The workspace strip's facts drawn as flaps (§6.2's `stripWords`), not as a second strip. With no workspace, the header row is left out.
- **Rows.** Every line is padded to the board's width, REMARKS too, so the board is a rectangle of tiles. The one order, with `otherLimits` after 7D. TIME's placeholder is `-`. REMARKS truncates first. Where TIME and REMARKS can't both fit, TIME's words lead REMARKS.
- **Rows at `maxRows` 13:** 1 collapsed + 9 body (the header row, the column headings, five rows, two `otherLimits`) + 3 frame.
- **Give-way:**
  1. `otherLimits`;
  2. the column headings;
  3. SPEND;
  4. CONTEXT;
  5. the header row;
  6. 5H;
  7. the body, leaving the footer alone.
- **Terminal:** the same board in text.

## 6. Code

### 6.1 Layers

These are unchanged: register → snapshot → reading (facts and words) → views (drawing only), and `tools/views-gate.sh` still holds. Svg geometry needs `Math.round`, which the gate bans in views, so geometry lives outside `views/`:

| Piece | Lives in |
| --- | --- |
| `heartbeat`; the beat shape for `barChart`; a time domain and a now mark for `sparkline` | `hooks/charts.tsx` (extensions of existing primitives, not new ones) |
| `flaps`, the split-flap tiles | `hooks/flaps.tsx`, new |
| The board and pulse's open stack | `views/departures.tsx` and `views/pulse.tsx`, plus `views/pulse-open.tsx` if a file passes about 300 lines |

### 6.2 Changes

- **`snapshot.ts`:** `LAYOUT_NAMES = ['chips', 'pulse', 'departures']`.
- **`memory.ts`:** `REMOVED_LAYOUTS = ['gauges', 'ledger', 'rings', 'tiles', 'week', 'forecast']`, beside `asLayoutName`, for the command's replies (§7).
- **`cache.ts` → snapshot → `reading.ts`:** `cache.coldAt`, from the existing `measuredColdAt`; `null` where it isn't known, including a resumed cache the engine called expired. It is a reading fact, not stored. `msLeft` derives from the same function, so the two never disagree.
- **`words.ts`:**
  - Pulse's average: `avg ~$0.02`.
  - The board's statuses, short forms, remarks and alt sentences: §5.2 and §5.3's words, and `CHECK-IN`.
  - `stripWords(read)`, moved out of `drawStrip`, so departures draws the same facts in flaps.
  - The existing `fillText`, `history.*` and `week.*` words are kept and reused.
- **`reading.ts`:** `history.fiveHourWindow`, the 5h window's points from start to reset with a now index, derived from `week.hourRow`.
- **`frame.tsx`:** gains `footer(kit, read, act, strip)`: Collapse, Hide band, the hint and the strip's place, moved verbatim out of `cards.tsx`'s `openBody`. Chips' golden hashes prove the move.
- **`cards.tsx`:** becomes chips' alone. `chipsView` calls `cardsView` directly. These go: `defineCardsView`; every `OpenOptions` field but `collapsedRows` (`slots`, `slotsReplaceBars`, `heads`, `lead`, `limitMarks`, `shown`, `shownByWindow`, `windowResets`, `clockless`, `compactSplit`, `reWarmLabel`); and the code only they reach (`Fact`, `WindowFact`, `SlotForms`, `leadOf`, `saidOf`, the compact split, and the `'clock'` form of the reset).
- **Fix before reuse.** The review screenshots show two primitives drawn wrong:
  - `barChart` drew a flat sliver in the open SPEND card (screenshot 5);
  - `dayCells`' now-notch sits off its cell (screenshots 7 and 9).

  First find the root cause: is it the Svg's geometry, or how the real desktop sizes it (a `width` set and the height left to the markup)? Then write a failing test that targets that cause, then the fix.
- **Removed:** the six view files and their `tests/view-*.test.ts`.
- **The dead-export sweep** runs after pulse and departures are built (§8, step 4), by usage, never from a list. Expected to go:
  - `ring`, `sliceCells`, `meter`'s `tick`, `projectTo` and `slim` options;
  - parts' `battery*` variants, `layoutCacheSpec`, `amberSay`, `amberFirst`, `once`, `PERCENT`. `fitSqueeze` and `AMBER_STEP` stay, because `fitLine` needs them;
  - palette's `week*` and `five*` guess and spent tokens;
  - words' gauge, sentence, week and forecast phrases.

  Chips' golden hashes must hold after the sweep.

## 7. Command and migration

- **Stored values.** A stored removed name stays in the store. `asLayoutName` already returns `undefined` for it, so the band draws chips. No code migrates it.
- **Replies:**

  | Input | Reply |
  | --- | --- |
  | `/usage-band layout` | `Usage band layout: chips. Choose one: chips (at a glance), pulse (trends), departures (times).` |
  | `/usage-band layout`, with a removed name stored | `Usage band layout: chips (week was removed in 0.14.0). Choose one: …` |
  | `/usage-band layout week` | `week was removed in 0.14.0. Choose one: …` Nothing changes. |

## 8. Order of work and sign-off

1. **Spike the heartbeat** in a scratch mod: an interactive Svg with a CSS animation under `@media (prefers-reduced-motion: reduce)`. Check:
   - whether `<style>` survives;
   - whether the frame keeps its animation across the band's redraws.

   It needs one desktop screenshot or recording from you. The result decides §4.1.
2. **Frame.** Move `footer` into `frame.tsx`. Chips' golden hashes must pass.
3. **Remove** the six views and their tests. **Fix** `barChart` and `dayCells` with their failing tests first. **Build** departures, then pulse, each under `viewSuite`. Then strip `cards.tsx` to chips', which can only happen once the old pulse and departures, its last other readers, are gone. The matrix gains:
   - the board's forms: `LAST CALL`, `! NEAR LIMIT`, `! FULL ~hh:mm`, `! COMPACTS IN ~nK`, and `CONTEXT` as context's name;
   - desktop words read from a flap Svg's `<text>` runs, so its checks see them;
   - two invariants: the one order, and no import from `cards.tsx` (outside chips).
4. **Sweep** dead exports by usage (§6.2). Then the full suite, `tsc`, `claude plugin validate` and `tools/views-gate.sh`.
5. **Sign off by screenshot.** First, render one state you reported (pulse's SPEND sliver, or a misplaced day-cell notch) through `tools/demos` and compare it with your screenshot. If the demo doesn't reproduce the bug, the demo can't gate. Then your desktop screenshots of the same cases are the final gate, and I'll ask you for them. Render with `tools/demos` and read every PNG. The cases are three layouts × two surfaces × collapsed and open:

   | Case | State | Pass when |
   | --- | --- | --- |
   | Low | Fresh cache, context 2%, 5h 3%, 7d 10% | No amber, and every indicator matches its value |
   | High | 5h 70%, 7d 78%: just under the amber line | Still no amber |
   | Near the limits | Cache in its last minute, context near compaction, 5h fills before reset, 7d 85% | Amber on exactly those four, each with words |
   | Empty | No costs, no limits, no workspace | The empty phrases. No NaN and no empty cell. |
   | Edges | Every cache mood (unmeasured, warming, warm, expiring, cold), recalled, working, a re-warm in the trace, a passed reset, unknown context, compaction off, limits with no samples, `otherLimits` present | Each state drawn, per §4 and §5 |

   - In every case, the order is Cache, Spend, Context, 5h, 7d, and no row wraps.
   - Low and Near the limits are also shot in light and plain, so the dark board is seen on a light UI, at widths 40, 80 and 200.
   - **Distinctness gate**, which is your call: shown the three collapsed PNGs without labels, can you name each one?
6. **Docs and release:**
   - the plugin README's layout table, image and alt text, minus its week and forecast paragraphs;
   - the root README's count;
   - CONTRIBUTING: its module table, and the "a new layout is made with `defineCardsView`" rule, which becomes "owns its view, and shares only `frame.tsx`";
   - `tools/demos/site/template.html`, which generates `docs/index.html`;
   - `tools/demos/stills.py` and `capture/desktop.test.ts`;
   - the old spec's status line, which points here;
   - CHANGELOG 0.14.0 → *Removed:* "Six layouts: gauges, ledger, rings, tiles, week and forecast. A saved one draws chips, and `/usage-band layout` says so. Week's day cells now live in pulse, and forecast's clock times in departures." *Changed:* "Pulse and departures are rebuilt, and each has its own open view. Both draw their readings in one order: cache, spend, context, 5h, 7d."
   - Then merge, tag and release.
