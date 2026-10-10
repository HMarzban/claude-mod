# Release 0.12.0: layouts

Task 33, Steps 1 and 2, on `feat/layouts` at 0119b9a: the production gate (spec §10) run item by item, the evidence, and the drafts for the PR and issue #1. Nothing is pushed, tagged, released or posted; Step 3 waits on the maintainer's go-ahead.

## The production gate

| Spec §10 item | State | Evidence |
| --- | --- | --- |
| validate passes, for the marketplace and the plugin | met | both pass (below) |
| the full test run is green | met | 1043 pass, 0 fail, 48 files |
| CI is green | pending a push | every CI step passes locally (below); CI runs on the PR |
| the existing suite passes with no assertion changed | met, against 0.11.13 | against main, 0.11.13's hover fix changed five files' assertions (below) |
| `tsc` is clean locally, with its output in the PR | met | no output, exit 0 |
| golden chips matches | met | `golden-a` 21 pass, `golden-b` 20, `golden-hash` 3; `chips.ts` has its two ruled commits alone |
| every view suite is green, and with it the §2 contract | met | the eight `view-*.test.ts` files, 447 pass |
| contrast meets §2.10 in every palette | met | `design.test.ts`, 29 pass |
| performance and memory within §9, with the numbers in the PR | met | every layout at most 1.11× chips; the soak's three tests pass |
| an independent reviewer read the whole branch, every Critical or Important finding fixed test first | met | Task 29: nine fixes, each RED→GREEN in the ledger |
| a final quality pass leaves no dead code, debug output, TODOs, commented-out code, names off §4.3, comments out of house style or typos | met | Task 30, and its greps re-run at 0119b9a (below) |
| CHANGELOG `0.12.0`, under Added | met, one line short | 7aebb0a, a fix to chips, has no Fixed line (below) |
| the version bump | met | `plugin.json` reads `0.12.0`; the marketplace pins no version |
| the plugin README's Layouts section, with row counts and `CC_BAND_GLYPHS` | met | `plugins/session-usage-band/README.md`, "Layouts" |
| the root README | met | the Layouts line and the gallery under "What it shows" |
| the CONTRIBUTING file table | met | every new file, and the rule for a new layout |
| the demos rebuilt | met for the gallery | the film, the terminal GIF and the site's live band predate 7aebb0a (below) |
| issue #1 updated | pending the go-ahead | draft below |
| the maintainer checks each layout on the desktop and in a terminal, collapsed and expanded | pending | checkpoint 6, below |

## Evidence

All of it at 0119b9a, from the repo root.

### Validate

```
$ claude plugin validate .
Validating marketplace manifest: /Users/macbook/workspace/claude-mod/.claude-plugin/marketplace.json
✔ Validation passed

$ claude plugin validate plugins/session-usage-band
  ❯ ./register.tsx env reads: CC_BAND_APPEARANCE, CC_BAND_GLYPHS, CLAUDE_CODE_PROMPT_CACHE_TTL, ENABLE_PROMPT_CACHING_1H, FORCE_PROMPT_CACHING_5M, HOME, LANG, LC_ALL, LC_CTYPE, NO_COLOR
  ❯ ./register.tsx state writes: session-usage-band.isExpanded, session-usage-band.isHidden
  ❯ ./register.tsx state reads: session-usage-band.isExpanded, session-usage-band.isHidden
✔ Validation passed
```

### Tests

```
$ claude plugin test plugins/session-usage-band
 1043 pass
 0 fail
Ran 1043 tests across 48 files. [23.76s]
```

Main's suite, at 40943d3 (whose hooks and tests are main's): 264 pass, 20 files.

### The views gate

```
$ tools/views-gate.sh
$ echo $?
0
```

### Type check

```
$ npx -y -p typescript@5.6.3 tsc -p plugins/session-usage-band
$ echo $?
0
```

CI can't run it: the engine writes its API types only when a signed-in session loads the plugin (spec §7).

### The existing suite

- Against 4882313, 0.11.13's tip, which descends from main: `git diff 4882313 HEAD` over main's test files removes no `expect` line. What it removes is in `helpers.ts` (the fake engine's handlers, taken into the new counters and `storeFails`) and one import line in `format.test.ts`, which gains `fmtPct`.
- Against main (0.11.12), five files' assertions changed, all in 0.11.13's hover fix (420cac0, 53126bf, ecb8939, 4882313): `hover`, `cost`, `consistency`, `context-and-tokens` and `workspace-strip`. Each card moved out of its chip, so those tests read it with `hoverCardOf` in place of `pillOf`.

### Golden

```
$ git log --format=%h -- plugins/session-usage-band/tests/golden/chips.ts
d69a9bf
93e3f31
```

93e3f31 is Task 2's capture, and d69a9bf its ruled re-capture for 0.11.13's hover fix (the ledger's golden ruling). Golden asserts 480 hashes with no stored layout and with `chips` stored.

### Performance

Every layout against chips' median in the same run, 200 redraws per case after 20 warm-up redraws; the slowest is rings, calm, terminal, open, at 1.11×, against a budget of 2×. The perf test's 28 tests also hold every layout within 400 nodes shut and 1,500 open, and with no store write while drawing.

| Layout | calm 200, terminal, shut | calm 200, terminal, open | calm 200, desktop, shut | calm 200, desktop, open | last minute 60, terminal, shut | last minute 60, terminal, open | last minute 60, desktop, shut | last minute 60, desktop, open |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| chips (ms) | 0.354 | 0.744 | 0.367 | 0.801 | 0.575 | 0.983 | 0.603 | 1.010 |
| gauges | 1.05× | 1.03× | 0.88× | 0.85× | 0.86× | 0.91× | 0.69× | 0.78× |
| ledger | 0.79× | 0.61× | 0.70× | 0.58× | 0.59× | 0.53× | 0.52× | 0.51× |
| rings | 0.90× | 1.11× | 0.80× | 0.86× | 0.77× | 0.79× | 0.61× | 0.69× |
| pulse | 0.72× | 0.76× | 0.64× | 0.68× | 0.69× | 0.65× | 0.56× | 0.62× |
| tiles | 0.76× | 0.93× | 0.76× | 0.90× | 0.55× | 0.71× | 0.51× | 0.73× |
| week | 0.83× | 0.65× | 0.67× | 0.57× | 0.50× | 0.47× | 0.41× | 0.44× |
| departures | 0.74× | 0.83× | 0.68× | 0.78× | 0.48× | 0.62× | 0.44× | 0.61× |
| forecast | 0.63× | 0.79× | 0.73× | 0.76× | 0.40× | 0.53× | 0.46× | 0.57× |

Chips before and after, calm at 200 columns (P0's baseline in `design/perf-baseline.md` against this run):

| Chips | P0 | 0.12.0 |
| --- | --- | --- |
| terminal, shut | 0.349 ms | 0.354 ms |
| terminal, open | 0.730 ms | 0.744 ms |
| desktop, shut | 0.358 ms | 0.367 ms |
| desktop, open | 0.729 ms | 0.801 ms |

Task 28 measured chips like for like, P0's own test against both hooks: within noise, at most 0.11 ms above P0 open, where P0's own two runs differ by up to 0.30 ms. The run above is the whole suite's, so its chips row is no closer comparison than that.

### Memory and repaints

- `soak.test.ts`, 3 pass: six hours, 1,000 turns, three clears and a layout switch every 167 turns, with `limitSamples` written at most 25 times, `layout` only by the command, and the store under 100,000 bytes of JSON (61,239, from a stored week of samples at the cap; see Done); a calm ten-minute walk repaints 10 times (bound 11); with the cache cold, a reset countdown repaints as its minute turns.
- The caps, asserted on insert in `history.test.ts` and `memory.test.ts`: `costTrail` 24, `contextTrail` 40, `fiveHourTrail` 300 and five hours, `limitSamples` 672 (73,249 bytes of JSON at the cap, at the engine's widest figures), `sessions` 50 (3,201 bytes).
- One timer, `band.tick`. No view keeps module state, a timer or a listener.
- Heap can't be measured in the test sandbox; the bounded structures are the proof (spec §9).

### The quality pass, re-run at 0119b9a

Task 30 ran these before its last commits; they are run again here, on the tip. Each prints nothing:

- `TODO`, `FIXME` or `XXX` in `hooks/`;
- `console.` in `hooks/`;
- `as never` or `as unknown as` in `hooks/`;
- `$` in a `hooks/` file other than `register.tsx` (120 lines there);
- a local named `h`;
- `≈`, `!!`, or `0:` and a digit in a view other than chips.

### The demos

The layouts gallery (`docs/band-layouts-{light,dark}.png`, Task 32 at 8d74d20) is drawn from the collapsed calm and last-minute states. Captured again at 0119b9a in a scratch copy, those 18 trees are identical to 8d74d20's, with the Buttons' handles set aside. So the gallery is current.

The other captures differ:
- Open departures no longer says `NO AUTO-COMPACTION` (fd0dd70).
- Open pulse joins each limit's sentence into one Text.
- Open tiles keys its re-warm Box `reWarm`.

No still draws those three states.

The film, the terminal GIF and the site's live band are chips, and 7aebb0a's minute fix moves them:
- 51 film frames draw the cache battery a step apart from the committed film.
- The cold frame's 5h card reads `resets in 1h 59m`, not `2h 00m`.

`tools/demos/build.sh` brings them up to date. It needs Chrome and ffmpeg, and rewrites every binary in `docs/`.

### The CHANGELOG

These Task 29 fixes change what users see in a layout that is new in 0.12.0, so Added covers them: 8aa0f4b, ef6ec96, db0bdf5, 3da7087, 10a5107, 800ada3, fd0dd70, 716ca55 and beb41e8.

7aebb0a fixes chips as 0.11 ships it, and the CHANGELOG has no line for it. Proposed under Fixed:

```
- A reset countdown no longer stands a minute stale while the cache is
  cold, and a calm band repaints once a minute, not twice.
```

### The rulings

The ledger's Rulings section holds 122 `Ruling:` lines, each with its why and whether a fallback was taken, and 20 `Pending maintainer:` lines, reconciled below. A reviewer meets these in the drawn band:
- Golden was re-captured once, for 0.11.13's hover fix; with the fix's own marks taken out, all 10 kept trees are deep-equal to the first capture.
- The ascii tier maps each glyph to one character at most, or drops it with its following space. A dropped `↻` where a phrase needs its noun reads `RESET` or `resets 16:40`.
- Below 60 columns, only `lastMinute`, the stand-in for all-amber, may clip. A single amber reading must still fit at 40 and 50 columns, so several views give way past spec §6's steps (gauges' `reWarm`, rings' `marks` and `calmFive`, pulse's `costWords`, `pace` and `calmFive`, departures' `cost` and `calmFive`, week's `emptyText` and `cost`).
- An unknown context reads `–`, never `0%`. A landing at 100% or more reads `full before reset`. An unmeasured cache draws no bar, so no alt says `0% left`.
- No paint key (Task 28): the repaints that change nothing cost about 0.5 ms a turn, below spec §9's bar for adopting one.
- Week's day cells are cut at local midnight. A reset off midnight folds a part day into its neighbour, so there are always seven cells.
- The light palette gains `fiveText` (4.85:1 on the card) for the 5h name drawn as words.

## Done since the gate

Open items cleared on `feat/layouts` after 0119b9a.

- **The memory caps** (Task 29's deferred `memory.test` unit), in 127a140, 7b206b4 and 0c80b5d:
  - `memory.test.ts` now holds the samples' store tests, moved from `calendar.test.ts`. It holds `limitSamples` at `MAX_SAMPLES` with every limit at 99.9 and 13-digit times: 73,249 bytes of JSON, under the test's 75,000. The engine gives a limit at most one decimal, so the 91 KB figure took floats it never sends, and `sampleOf` doesn't round.
  - A stored list past the cap reads as its newest week. A stored record past `MAX_SESSIONS` is written back as its newest 50. Malformed entries are dropped from both. Fifty sessions at UUIDs and 13-digit times are 3,201 bytes (bound 4,000).
  - The soak starts from a stored week at the cap, so its 100,000-byte bound now sees it: the list stays at 672 as each new bucket evicts the oldest, and the whole store reads 61,239 bytes.
  - With the caps lifted, each of these fails. 1046 pass, 0 fail, 48 files. Users see no change, so the CHANGELOG has no line.
- **The alt text** (Task 29's deferred `projectedAlt` and share `reads`), in bec9ac8, e17359c and 12b5c1f:
  - Open tiles' dashed underline reads `5h limit about 10 percent at its reset`, from `LimitWords.projectedAlt`, where it read `5h at its reset`.
  - `meter`'s `reads` gains `share`. Gauges' hit rate and the split bars in gauges and rings say `hit rate 96%` and `input 94%`, where they said `hit rate 0% used` and `input 94% used`.
  - A sweep of every alt the views draw, on the desktop at 200 columns in all 20 scenarios, shut and open, found no other.
  - `matrix.ts` now fails an alt that says a share is used or left, or a landing without its figure. Against the hooks before the fixes, 85 of the gauges, rings and tiles suites' 105 cases fail it.
  - 1050 pass, 0 fail, 48 files. Golden is unchanged. These layouts are new in 0.12.0, so Added covers the change and the CHANGELOG has no line.

## Pending the maintainer

### Checkpoints

The ledger records no sign-off for any of these:

1. After Task 2: 480 hashes, capture commit 6540ef3, two identical captures, 7s each.
2. The time-zone check, live (below).
3. The P1 freeze, at dc28d40.
4. The P2.0 re-freeze, at ba45eea, with the pilot's shared-file changes (the ledger marks it "review-gated").
5. After Task 22: the merges, the full gates, golden untouched.
6. Before Task 33: the hand check of every layout (below), and the go-ahead for anything outward.

### Live checks

- **The time zone.** In a live session in a non-UTC zone, `/reload-plugins`, then read `utcOffsetMin` through the temporary toast (plan, Task 14 Step 4). Remove the toast after. The kit reads 210 on this host whatever `TZ` says. If a live session reads 0, departures and forecast fall back to relative times (spec §5).
- **The desktop app's resume.** Open a past session in the desktop app. The band should show the cache cold or counting down, and the spend from the transcript, not $0.00. That needs the app to raise `classic.SessionStart` for it, which the CHANGELOG claims and only the kit has shown.
- **The hand check.** First run `claude plugin marketplace update hossein-mods && claude plugin update session-usage-band@hossein-mods`, then `/reload-plugins`. Check each layout in each of these four ways:

  | Layout | Desktop, collapsed | Desktop, expanded | Terminal, collapsed | Terminal, expanded |
  | --- | --- | --- | --- | --- |
  | chips | | | | |
  | gauges | | | | |
  | ledger | | | | |
  | rings | | | | |
  | pulse | | | | |
  | tiles | | | | |
  | week | | | | |
  | departures | | | | |
  | forecast | | | | |

  Spec §11 asks for the desktop width estimate to be checked by hand here too.
- **CI** on the PR, once pushed.

### Release decisions

- **0.11.13.** Main is at 0.11.12. 0.11.13 (216ab96, "chore: release 0.11.13", and the hover fix to 4882313) exists only on this branch and has no tag. Tag it at 216ab96 first, or let 0.12.0 carry it.
- **The CHANGELOG's Fixed line for 7aebb0a** (proposed above).
- **The demos.** Run `tools/demos/build.sh` before the release (above), or ship the film and GIF as they are.
- **Step 3, in order:**
  1. Push `feat/layouts`.
  2. Open the PR from the draft below.
  3. After the merge, run `claude plugin tag plugins/session-usage-band --push` and publish the release.
  4. Post the issue #1 update.

### Open design questions, from the ledger

Each is a `Pending maintainer:` line, or Task 29's deferred findings, still open at 0119b9a. Lines since settled are left out:
- the `layoutCachePill` mapping (ruling 174);
- `kit.gap` on a plain desktop (its ruling);
- the ascii guard and the `svgProps` id check (the P1 review);
- a failed layout read on `turn.complete` (3da7087);
- the shared `limitSentence` (Task 30).

**Behaviour**
- A layout chosen while the store fails to write lasts only until the next main-loop turn.
- A `/usage-band layout X` landing while `turn.complete`'s read is out can be overwritten until the next turn.
- A layout write that fails still replies as saved. The proposed reply adds "It couldn't be saved, so it lasts until Claude's next reply."
- Whether a nested subagent's `turn.complete` can carry its parent's `turnId`. If it can, `forgetTurn` would drop the parent's start cost.

**Give-way at narrow widths**
- At 40–50 columns an amber cache shortens to `! 30s` and loses its price while a calm piece stays, in gauges, pulse and tiles.
- Rings' cold cache loses its price with its long label.
- Gauges' warming row two draws only ▿.
- A cold cache with an amber limit at 40 columns would clip the amber in departures and ledger. No scenario holds that combination yet.
- At bodyRows 1, every section is a bare title. An open view then can't say open-only amber (`gatewaySpend`'s `! spend 92%`).

**Departures**
- Plain flaps are drawn bare, not as spec §3.1's `[ ]`, so a single amber reason fits at 40 columns.
- Its give-way runs two steps past spec §6's four (`cost`, `calmFive`).
- An amber short form is lower case on the upper-case board (`! 5h 82%`).
- Below about 50 columns the board cuts TIME mid-word. Should it drop TIME whole instead?
- With no UTC offset, TIME falls back to `↻ IN 3H 00M`, the short form spec §2.12 keeps off the board.
- `fitRows` puts an amber other-limit ahead of CACHE.
- Two rows read `SPEND` under ITEM at `gatewaySpend`.
- `coldSinceClock` stays undefined until the snapshot holds when a measured cache went cold.

**Words**
- Empty states are drawn in `value` by ledger, pulse and week, and in `label` by gauges, rings, tiles and week's history.
- `EMPTY.costsShort` reads `No costs.`, where the plan wrote `No costs yet.`.
- In the ascii tier `…` maps to `.`, which can read as part of a path.
- A view's own strip draws `workspaceText` whole and lets it clip. A short phrase (`workspaceShort`) would need a name outside spec §4.3.
- Forecast says no re-warm price on a text surface when collapsed, against §2.2's table.
- In the last minute, forecast's desktop detail says `re-warm ~$2.13` twice.
- The ink of the sparkline's `level` rule (`trackStroke`).

**The spec**
- §4 lists `cachePill` under `views/parts.tsx`. It is chips' own; the layouts share `layoutCachePill`.
- §4.1 and §5 name `avgWarmUsd`, which no reading builds. Build it, or rule it out.
- §4.1 says "The list reply comes from it" of `VIEWS`. The command's list is built from `LAYOUT_NAMES`.

**Deferred follow-ups (Task 29's minor findings)**
- `LimitWords.valueText`, for the four `l.passed ? 'reset' : l.value` copies.
- `cacheWords` taking the snapshot's cache, and `CacheFacts.estimate` and `LimitFacts.value` holding words: a pure move between the layers.

## The PR, draft

**Title:** `feat: nine layouts for the usage band, 0.12.0`

**Base:** `main` · **Head:** `feat/layouts`

````markdown
Implements #1.

`/usage-band layout <name>` draws the band in one of nine layouts. The
choice is kept for every session. Chips, the band as it was, stays the
default, and with no layout stored it draws exactly as before.

| Layout | Shows | Rows (desktop / terminal) |
| --- | --- | --- |
| `chips` | the row of chips and four cards behind ▿; the default | 1 / 1 |
| `gauges` | labelled bars, with a tick for how much of each window has gone | 2 / 2 |
| `ledger` | words alone, `! ` leading what needs you | 1 / 1 |
| `rings` | a ring per reading; a bar in the terminal | 2 / 1 |
| `pulse` | trends: each message's cost, and where the 5h limit is heading | 2 / 1 |
| `tiles` | bold values over small labels | 2 / 2 |
| `week` | the weekly limit as day cells, the 5h as hour cells | 2 / 2 |
| `departures` | a split-flap board; the cache's last minute is `LAST CALL` | 1 / 1 |
| `forecast` | now, then what changes next, at clock times | 2 / 1 |

<!-- attach docs/band-layouts-light.png and docs/band-layouts-dark.png,
     and one shot of each layout expanded, desktop and terminal -->

## What else is in it

- **Glyph tiers.** `CC_BAND_GLYPHS=ascii` draws ASCII alone, for a
  terminal that draws ambiguous-width characters wide, or for a screen
  reader. A CJK locale picks it by itself, chips included.
- **Week's samples.** The store keeps a week of 5h and 7d readings, at
  most one per 15 minutes and 672 in all.
<!-- keep or cut the desktop app after the live desktop-resume check -->
- **Fixed: a resumed session.** `--resume`, `/resume`, or a past session
  opened in the desktop app no longer reads as new. The cache shows cold
  or counting down at the price Claude Code names, and the spend starts
  from the transcript.
- **Fixed: the timer's minute.** It turns with the countdowns, so a calm
  band repaints once a minute, not twice. With the cache cold, a reset
  countdown no longer stands a minute stale.
- **Fixed: subagent turns.** A turn outside the main conversation drops
  the start cost it noted.
- **0.11.13.** This branch carries the untagged 0.11.13 hover-card fix,
  since main is at 0.11.12.

## How it's built

`register.tsx` → `snapshot.ts` → `reading.ts` + `words.ts` → `views/`.

- `$` stays in `register.tsx`.
- `readingsOf` builds every fact and phrase once per draw.
- Views never format: they lay out the words they are given. The new
  `tools/views-gate.sh` checks this in CI.
- A new layout is a name, one file made with `defineView`, one test file
  running `viewSuite`, and an entry in `VIEWS` (CONTRIBUTING.md).

## Testing

- **The suite:** 1043 pass, 0 fail, 48 files. Main has 264 in 20 files.
- **Golden:** chips' drawn trees are pinned by 480 FNV-1a hashes (20
  scenarios × 2 surfaces × 2 appearances × 3 widths × shut and open),
  with no layout stored and with `chips` stored.
- **The existing suite:** no assertion changed since 0.11.13. 0.11.13's
  hover fix changed how five test files read a hover card.
- **The views:** every view runs `viewSuite`: all 20 scenarios on both
  surfaces, widths from 40 to 200, four heights, light, plain and ascii.
  Each mount is checked against the UX contract: rows, width, no red,
  amber words, `~` on estimates, alt text, and glyphs in their tier.
- **An independent review** of the whole branch. Nine findings were
  fixed, each test first.
- **`tsc`** can't run in CI, since the engine writes its types only for a
  signed-in session. Locally,
  `npx -y -p typescript@5.6.3 tsc -p plugins/session-usage-band`
  prints nothing and exits 0.

## Performance and memory

- **Draw time.** Each layout's median draw against chips' in the same
  run, at 200 columns calm and at 60 in the last minute, on both
  surfaces, shut and open. The budget is 2×.

  | Layout | slowest case | ratio |
  | --- | --- | --- |
  | gauges | calm, terminal, shut | 1.05× |
  | ledger | calm, terminal, shut | 0.79× |
  | rings | calm, terminal, open | 1.11× |
  | pulse | calm, terminal, open | 0.76× |
  | tiles | calm, terminal, open | 0.93× |
  | week | calm, terminal, shut | 0.83× |
  | departures | calm, terminal, open | 0.83× |
  | forecast | calm, terminal, open | 0.79× |

- **Chips** reads 0.354 ms calm, terminal, shut (P0: 0.349 ms). Measured
  like for like against P0's hooks, it is within noise.
- **Tree size.** Every layout is within 400 nodes shut and 1,500 open.
- **Store writes.** None while drawing. `layout` is written only by the
  command, and `limitSamples` at most once per 15 minutes.
- **The soak.** Six hours, 1,000 turns, three clears and a layout switch
  every 167 turns, from a stored week of samples. The store stays under
  100 KB, the samples at their cap of 672, and the cost and context
  trails at theirs, 24 and 40. A unit test holds the 5h trail to 300
  readings over five hours.
- **Heap** can't be measured in the test sandbox. The caps, asserted on
  insert, are the proof.

## Checked by hand

Every layout on the desktop and in a terminal, collapsed and expanded,
and the time zone in a live session. <!-- fill in after checkpoint 6 -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
````

## Issue #1, update draft

````markdown
The layouts are in #<PR> and ship in 0.12.0.

`/usage-band layout <name>` picks one of nine: chips (the default,
unchanged), gauges, ledger, rings, pulse, tiles, week, departures and
forecast. The choice is kept for every session, and each layout opens
with ▿ to its own view of every fact. The plugin README's Layouts
section gives each one's rows on the desktop and in the terminal.

<!-- attach docs/band-layouts-light.png and docs/band-layouts-dark.png -->

As the spec asked:
- **The same readings in every layout.** The words come from one
  phrasebook, so amber, estimates (`~`), resets and alt text read the
  same everywhere.
- **Amber stays.** In every scenario the suite draws, a single amber
  reading keeps its words at 40 columns.
- **Within budget.** No layout draws slower than 1.11× chips (the budget
  is 2×). Each stays within 400 nodes shut and 1,500 open.
- **The terminal.** Charts are braille, with an ASCII tier
  (`CC_BAND_GLYPHS=ascii`, and by itself in a CJK locale).
- **Chips unchanged.** With no layout stored, chips draws exactly as it
  did: 480 golden hashes pin it.

Update with `claude plugin marketplace update hossein-mods && claude
plugin update session-usage-band@hossein-mods`, then `/reload-plugins`.
````
