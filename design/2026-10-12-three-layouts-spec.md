# Three layouts: design spec

v1 · 2026-10-12 · replaces §1, §4.2's list, §6 and §7's per-view parts of `2026-10-09-band-layouts-spec.md`.

Status: Draft, for review.

## 1. Why

There are nine layouts, and eight of them look about 90% the same. The cause is structural, not cosmetic:

- **Open.** Every layout except chips is built by `defineCardsView` (`views/view.ts`), so it opens into chips' own four cards (`views/cards.tsx`). A layout only changes those cards' lenses, headlines and first rows.
- **Collapsed.** The same eight draw chips' pill, battery and meter parts on the same ground, in chips' tints.

Patching each layout would leave both causes in place. So we keep three layouts, and each one owns everything it draws, collapsed and open:

| Name | Identity | Answers | Desktop rows | Terminal rows |
| --- | --- | --- | --- | --- |
| `chips` | Pills you can read at a glance; four cards behind ▿. The default. | Is anything wrong right now? | 1 | 1 |
| `pulse` | A chart over time: an ECG-style trace of the session | Which way is it going, and how fast? | 1 | 1 |
| `departures` | A split-flap board, monospace and in capitals | When does each thing happen? | 1 | 1 |

`gauges`, `ledger`, `rings`, `tiles`, `week` and `forecast` are removed. Their best ideas move into the layouts we keep:

- week's day cells and gauges' pace tick go into pulse;
- forecast's clock times go into departures' TIME column.

**Non-goals:**
- any change to what chips draws;
- new readings or new stored data (every history pulse needs already exists: `costTrail`, `contextTrail`, `fiveHourTrail`, `limitSamples`);
- user-defined layouts;
- a picker.

## 2. Rules every layout keeps

The UX contract in the earlier spec, §2, still holds: quiet when fine, amber always has words, `~` on estimates, formatting in `format.ts` and `reading.ts`, never wraps, svg on the desktop only, contrast on a ground we own, and alt text. This spec adds two rules:

1. **One order.** Every layout draws its readings in this order, collapsed and open: **Cache, Spend, Context, 5h, 7d**, then `otherLimits` when open.
   - Amber never moves a reading. It changes the reading's colour and words in place.
   - Give-way drops calm pieces. It never reorders the ones that remain.
   - Cache and 7d never give way. 7d may fall back to its short text form.
2. **No shared look.** Pulse and departures import nothing from `views/cards.tsx`, and nothing of chips' that draws (`pill`, `batteryIcon`, `textBattery`, chips' tints). They share only the frame: the toggle, the buttons row, `bodyRowsFor`, and the workspace strip's facts, which each draws in its own style.

## 3. chips

Unchanged. Its golden hashes (`tests/golden/chips.ts`) must still pass, byte for byte. `cards.tsx` loses every option that only the removed layouts used (§6.2), and none of them changes chips' output.

## 4. pulse

**Purpose:** show the session as a vital sign. Each message is a beat, and the beats over time show whether spending is speeding up, whether the 5h window will fill, and how the week went.

### 4.1 Collapsed: one row

```
◉ cache 41m  ─╮╭─╮╭──╮╭─  $0.24 · last $0.03   ctx ▁▁▁ 8%   5h ⟋- - 26%   7d ▮▮▮▯▯▯▯ 41%  ▿
```

(That sketch's glyphs stand for svg marks, not characters the band draws.)

| Piece | Desktop (svg) | Terminal |
| --- | --- | --- |
| **Cache** | A 12 px heartbeat dot, then `cache 41m`. Warm: `warm` ink, one slow beat. Last minute: amber, beating faster, with `! 47s left · re-warm ~$1.66`. Cold: a flat grey line in place of the dot, then `cold · re-warm ~$0.57`. Working: steady dot, no countdown. | `cache 41m` |
| **Spend** | The trace: the last 14 messages as ECG beats, each spike's height its cost on a scale of `max(2 × warmAvg, largest warm cost)`. A re-warm's spike is capped flat at the top, so its shape says what it is without colour. Then `$0.24 · last $0.03`. | A braille trace, 2 messages per cell, then the numbers |
| **Context** | A 36 px level line: the fill as a filled run under a tick at the compaction point. Then `ctx 8%`. | `ctx 8%` |
| **5h** | A 48 px trail of the last hour, with a dashed projection to the reset at the current pace. Then `5h 26%`, or `! 5h full in ~40m`. | braille trail, then `5h 26%` |
| **7d** | Seven 4 px day columns, height-filled: measured solid, guessed dashed, today outlined. Then `7d 85%`. | `7d 85%` |

- **Animation.** Only the heartbeat dot moves, and its rate means something: slow while warm, fast in the last minute, none when cold. It ships only if the spike (§7, step 1) shows that the svg frame survives the band's redraws and that `prefers-reduced-motion` can be honoured. If either fails, the dot is static, and its size and ink carry the same states.
- **Give-way, calm pieces only, first to last:**
  1. `· last $0.03`;
  2. context's level line;
  3. the trace from 14 beats to 8;
  4. the 5h trail becomes text;
  5. the 7d columns become text;
  6. the trace becomes text.
  - The words of the cache, the cost, 5h and 7d always stay.
- **Empty:** with no costs yet, the trace is a flat line and the row reads `costs show after Claude's next reply`, the existing phrase. With no limits, 5h and 7d are left out.

### 4.2 Open: a stack of charts, no cards

Top to bottom, in the one order. Each band is the full width, with the chart on the left and its numbers on the right:

| Band | Desktop rows | Draws | Numbers beside it |
| --- | --- | --- | --- |
| Cache vitals | 1 | The heartbeat and the TTL as a draining line | `41m left · re-warm ~$0.57 · hit rate 96% · saved $1.20` |
| Spend | 3 | The last 24 messages as beats, with a dotted average line; re-warms capped and labelled `re-warm` | `$0.24 total · last $0.03 · avg ~$0.02 · 29k in · 4k out` |
| Context | 2 | The context used over the conversation, as a line under a dashed compaction ceiling | `8% · ~893k left · compacts at 967k` |
| Limits | 3 | Two charts side by side. On the left, the 5h window from its start to its reset, with now marked and a dashed projection. On the right, the 7d window as seven day columns, measured solid and guessed dashed, with today outlined. | `5h 26% · on pace for ~33% · ↻ 17:50` and `7d 85% · full ~Tue · ↻ Sat 13:30` |

- `otherLimits`, when there are any, follow as one text line.
- The footer is the workspace strip and the buttons, as today.
- **Fitting `maxRows`:** at 13 rows everything fits (1 collapsed + 9 body + 3 frame). Short of rows, the bands give way in this order:
  1. the Context band;
  2. Spend drops to 2 rows;
  3. Limits drops to 2 rows;
  4. each chart becomes its numbers alone.
- **Terminal:** the same bands as braille charts beside their numbers, one or two lines each.

## 5. departures

**Purpose:** a real split-flap departures board. Every reading is a line on the board: what it is, its status, when, and a remark. This is the board the earlier spec's §6 described; the shipped version drifted into a row of chips-style pills with `›`.

### 5.1 The board's look

- **Ground.** The board is always dark, in the dark and light appearances alike, because a departures board is a physical object. It draws on its own `boardBg` with dark flap tiles.
- **Flaps.** On the desktop, the flaps are svg: each character sits on its own tile, in a monospace face, with a 1 px seam across the middle of the tile. That seam is what says "split-flap". The terminal draws each flap group as a `Box backgroundColor` run, with a space between groups.
- **Colours.** Each reading gets an ITEM code in its own ink, the way an airline's code has its colour on a real board. All of these are new palette tokens, contrast-tested at 4.5:1 on `flapBg`:

  | Token | For |
  | --- | --- |
  | `flapItemCache` | CACHE: the warm green |
  | `flapItemSpend` | SPEND: the coin gold |
  | `flapItemContext` | CTX: a cool grey-blue |
  | `flapItem5h` | 5H: the 5h accent |
  | `flapItem7d` | 7D: the 7d accent |
  | `flapText` | Statuses and times: the board's off-white |
  | `flapDim` | Remarks |
  | `flapAmber` | Amber words. Amber is the only status colour, as everywhere: nothing is red. |

- **Plain appearance.** No svg and no board ground. Flap groups are drawn as `[CACHE]` in theme keys.

### 5.2 Collapsed: one row, fixed order

```
CACHE DEPARTS 17:24 IN 38 MIN  SPEND $0.24  CTX 8%  5H 26% ↻ 17:50  7D 41% ↻ SAT 13:30  ▿
```

- **Cache statuses** (the existing `DEPARTURES` words):
  - `DEPARTS hh:mm · IN 38 MIN`;
  - `LAST CALL · 47S · RE-WARM ~$1.66`, in amber;
  - `DEPARTED hh:mm · RE-WARM ~$0.57`;
  - `BOARDING`, with no time, while Claude is working.
- **Limits:** the value, then `↻ hh:mm` (or `↻ SAT 13:30`), then one remark:
  - `FULL ~TUE` when the projection fills before the reset;
  - `! NEAR LIMIT` at 80%;
  - `! FULL ~14:20` when the 5h pace fills.
  - An amber remark takes the place of a calm one; open, the calm one moves to REMARKS.
- **Give-way, calm pieces only, first to last:**
  1. `IN 38 MIN`;
  2. 5h's `↻`;
  3. 7d's `↻`;
  4. SPEND;
  5. CTX;
  6. 5h's remark;
  7. 5H becomes `5H 26%`.
  - CACHE and 7D never go.

### 5.3 Open: the board

```
 CLAUDE-MOD   MAIN   CLEAN                                    17:12
 ITEM   STATUS       TIME        REMARKS
 CACHE  DEPARTS      17:24       IN 38 MIN · RE-WARM ~$0.57 IF MISSED
 SPEND  $0.24        —           LAST $0.03 · 29K IN · 4K OUT
 CTX    8% FULL      —           ~893K LEFT · COMPACTS AT 967K
 5H     26%          17:50       ON PACE ~33%
 7D     ! NEAR LIMIT SAT 13:30   85% · FULL ~TUE
                                          [Collapse c]  [Hide band h]
```

- The header row is the workspace strip in flaps: folder, branch and status on the left, the time now on the right. It replaces the strip; nothing is drawn twice.
- Rows are in the one order, and `otherLimits` come after 7D.
- REMARKS truncates first. Where TIME and REMARKS can't both fit, TIME's words move to the front of REMARKS, as in the earlier spec.
- **Fitting `maxRows`:** at 13 rows, 1 collapsed + 8 board rows + 2 frame rows fit. Short of rows, `otherLimits` go first, then the column-header row, then SPEND's remarks.
- **Terminal:** the same board in text, which is the layout's natural form.

## 6. What changes in the code

### 6.1 Removed

- `views/{gauges,ledger,rings,tiles,week,forecast}.tsx` and their `tests/view-*.test.ts`.
- `LAYOUT_NAMES` becomes `['chips', 'pulse', 'departures']`. `VIEWS` follows, and so does the command's list reply.
- Chart helpers that no kept view uses (expected: `ring`, `sliceCells`, and the `meter` tick and projection options), and the `words.ts` and `reading.ts` exports that only the removed views read. A test confirms that chips' output does not change.
- **A stored removed name:** `asLayoutName` returns `undefined`, so the band draws chips. `/usage-band layout` lists the three. No toast.

### 6.2 Changed

- `cards.tsx` becomes chips' alone. Every `OpenOptions` field except `collapsedRows` goes (`slots`, `heads`, `lead`, `limitMarks`, `shown`, `shownByWindow`, `windowResets`, `clockless`, `compactSplit`, `reWarmLabel`), and so does `defineCardsView`.
- `views/view.ts` keeps `View` and `rowsOf`.
- `views/pulse.tsx` and `views/departures.tsx` are rewritten. Each has its own open view, with a sibling file if it grows past about 300 lines: `views/pulse-open.tsx` and `views/departures-board.tsx`.
- `charts.tsx` gains:
  - `trace`: ECG beats;
  - `levelLine`;
  - `trail`, drawn with a projection;
  - `dayColumns`;
  - `heartbeat`;
  - `flaps`: the split-flap tiles.

  Each one is svg on the desktop and braille or text elsewhere, and each takes `alt` and `width`.
- `palette.ts` gains the board tokens (§5.1) in DARK and LIGHT (the board is dark in both) and PLAIN.

### 6.3 Docs and release

- README's layout list, CONTRIBUTING's module table, `docs/index.html`'s layout picker and its noscript list, `band-layouts-{dark,light}.png` (rebuilt with `tools/demos`), and the old spec's status line, which points here.
- CHANGELOG, then 0.14.0.

## 7. Order of work and how it is checked

1. **Spike the heartbeat.** One svg with `isInteractive` and a CSS animation, drawn in the band. Check three things:
   - Does the beat restart on each redraw?
   - Does `<style>` survive the scrub?
   - Does `prefers-reduced-motion` reach the frame?

   The result decides §4.1's animation. It needs a desktop screenshot from you, because the demo renderer draws svg as a still image.
2. **Remove** the six layouts and the lens options; prove chips' golden output unchanged.
3. **Build departures,** then **pulse.** Each one runs `viewSuite`: every scenario, both surfaces, the light, plain and `ascii` tiers, widths 40 to 200, and open at `maxRows` 4, 8, 13 and 40. Two new invariants join them:
   - the one order;
   - that pulse and departures import nothing from `cards.tsx`.
4. **Check by eye.** Render each layout with `tools/demos` for these cases, on the desktop and in the terminal, collapsed and open, and read every PNG before calling it done:
   - low usage (cache fresh, 2% context, 5h 3%, 7d 10%);
   - high usage (5h 70%, 7d 78%);
   - near the limits (cache in its last minute, context near compaction, 5h fills before reset, 7d 85%);
   - empty (no costs, no limits, no workspace).

   The current layouts passed their tests with the ticks and rings misplaced, so the screenshots are part of the gate.
5. **Docs, CHANGELOG, 0.14.0,** then merge and release.
