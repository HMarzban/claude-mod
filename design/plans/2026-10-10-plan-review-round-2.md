# Plan review, round 2: decisions to apply

Four reviews looked at `2026-10-10-band-layouts-plan.md`: architecture, correctness against the code, execution risk, and spec compliance with performance. This file is the editor's ruling on every finding. Apply each item to the plan, in the task named. Where the reviews conflicted, the ruling below wins.

## A. Test-kit facts, confirmed by running them (they override any plan code)

1. **One `setup(on)` per test.** A second call throws `on("clock.now") after the test first called $`.
2. **Each test file gets its own copy of every module.** `import '../hooks/x'` in a test is not the plugin's instance. So:
   - a test can't observe plugin module state such as `insights`, `VIEWS` or `band`;
   - assert through the drawn tree, through the helpers' engine fakes (`engine.*`), or by unit-testing pure functions inside the test's own module copy.
3. **One handler per event.** Registering an event twice throws (`on("store.get") registered twice`). Counters live in the helpers' existing handlers: add `engine.storeGets: string[]`, `engine.storeSets: string[]` and `engine.invalidates: number`. That last one needs a `ui.invalidate` handler in `base` that counts and passes the call through. Check whether `ui.invalidate` is hookable; if it isn't, count `ui.render` calls instead, and record the ruling.
4. **No dynamic `import()` in tests.** It stops the file loading.
5. **`toBeCloseTo` doesn't exist.** Use `expect(Math.abs(a - b)).toBeLessThan(1e-5)`.
6. **`console` isn't declared for tsc.** Add `plugins/session-usage-band/tests/globals.d.ts` with `declare const console: { log(...a: unknown[]): void }`.
7. **Engine type in tests:** use `import type { Engine } from 'claude-code/testing'`, never `Parameters<…typeof test…>`.
8. **These work, so keep them:**
   - `test(name, LONG, fn)`;
   - `$.command.run` → `{ text }`;
   - `ui.press({key})`, `redraw`, `drawn`, `unmount`;
   - `performance.now` is real time;
   - `console.log` at runtime;
   - fake element constructors: `h` calls function components and returns plain `{type, props}`, so `drawBand(fakeEl, snap, act)` can be called directly in a test.
9. **`shown()` joins children with no spaces** (it ignores `columnGap`), so view-test regexes use `\s*` around separators.

## B. Scenarios (Task 1)

- **`nearCompaction` and `compactionOff`:** drive with `replied($)`, then `$.session.measure({ context: { tokens, window: 200_000, percent, breakdown }, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })`. The breakdown is read in `session.measure` (register.tsx:339–349), not in `turn.complete`. The breakdown sets compaction off or a threshold of 160k.
- **`recalled`:** use `store: { sessions: { s1: { lastAt: 0 } } }` with `now: 20 * MIN`, which draws `cache 40m`. The transcript path needs `HOME`.
- **Reach checks:** one per scenario, one test each. Include `recalled` and `noWorkspace`, shut and open.
- **`drawAs` is replaced by `drawCases($, on, { scenario, appearance, env?, layout?, ttl? }, mounts)`:**
  - one setup and one drive, then for each mount `{ surface, cols, maxRows? }`: draw shut, press `more`, draw open, press `more`, unmount, always in that order;
  - it returns the trees keyed by `surface|cols|maxRows|shut|open`;
  - every caller uses it: golden, `viewSuite`, perf and the view tests;
  - no test calls `setup` twice;
  - add a test that a calm, cold, calm sequence through separate tests gives identical calm trees.
- **`ttl: '5m'`** sets `FORCE_PROMPT_CACHING_5M=1`. `viewSuite` uses it for `lastMinute` and `cold`, which takes 270 ticks instead of 3,600. Golden keeps the 1-hour walks.

## C. Execution scaffolding (Task 1 or Global Constraints)

- **The ledger:** Task 1 creates `design/plans/2026-10-10-band-layouts-ledger.md`. It holds the P0 commit and hash count, test counts per gate, every `Ruling:` line, the freeze notes and the time-zone result.
- **`tools/test-only.sh <glob…>`:** copies the plugin to a scratch folder with only the matching tests plus `helpers.ts`, `matrix.ts` and `globals.d.ts`, then runs `claude plugin test` there. Red and green steps use it. Every commit step runs the full suite.
- **Line numbers** refer to `git show 40943d3:plugins/session-usage-band/hooks/band.tsx`. Move code by symbol name. Corrected ranges:

  | What | Lines |
  | --- | --- |
  | `measured` | 554 |
  | `known` | 556 |
  | `windows` | 618–630 |
  | `projected` / pace | 645–653, in `limitRows` 635–668 |
  | `worst` | 677 |
  | buttons | 695–698 |
  | actions row | 716–727 |
  | cache facts | 566–573 |
- **Pure moves (Tasks 5, 7, 9):** each step that relies on golden as its guard adds: "break one moved line, watch golden fail, revert, and note it in the commit body".
- **Golden capture:**
  - `capture.sh` refuses to run if `git diff --quiet 40943d3 -- plugins/session-usage-band/hooks` fails.
  - It writes `git rev-parse HEAD` into `chips.ts`'s header.
  - Task 2 runs the capture twice and diffs the results.
  - Tasks 22 and 29 check that `git log --format=%h -- tests/golden/chips.ts` shows only Task 2's commit.
  - Golden doesn't cover light, `maxRows` under 40, or the ascii tier. Say so in `golden.test.ts`'s header.
- **Golden layout:** one test per scenario × appearance, each with one `drawCases` call and 6 mounts (2 surfaces × 3 widths), each drawn shut and open. That is 40 tests, split over `golden-a.test.ts` (scenarios 1–10) and `golden-b.test.ts` (11–20).
- **Time zone:**
  - Global constraint: view tests never assert a literal clock time; they compute the expected one with `fmtClock`/`fmtDayClock`, or match `/\d{2}:\d{2}/`.
  - Task 14 runs the suite under `TZ=UTC` and `TZ=Asia/Tehran`.
  - The manual live-session check is a maintainer checkpoint, before Task 15.
- **Maintainer checkpoints** (add a section after the file map):
  1. after Task 2: hash count, commit, two identical captures, runtime;
  2. the time-zone check;
  3. after Task 14: sign off the freeze;
  4. after the pilot (Task 16): sign off the re-freeze;
  5. after Task 22;
  6. before Task 33.
- **Pre-allowed commands** (add to Global Constraints): background agents can't answer permission prompts, so the maintainer pre-allows:
  - `claude plugin test` and `claude plugin validate`;
  - `npx -y -p typescript@5 tsc`;
  - `git worktree`, `rebase`, `merge` and `commit`;
  - `python3`;
  - `tools/golden/capture.sh` and `tools/test-only.sh`.
- **Split the big tasks:**
  - 9 → 9a (move chips into views, parts, frame scaffold) and 9b (the shared view helpers, with their tests);
  - 10 → 10a (`views/view.ts`, the registry, stubs, dispatch and fallback), 10b (command and store) and 10c (`utcOffsetMin`);
  - 11 → 11a (`visualRows`, `expectInvariants`, each check tested on a hand-built bad tree) and 11b (`viewSuite`).
  - Keep the numbering readable: use 9a/9b, 10a/10b/10c, 11a/11b.

## D. Architecture, adopted

1. **The phrasebook:** `hooks/words.ts` (pure) holds `AMBER`, `EMPTY`, `altOf`, `resetPhrase`, `paceText` and the per-section word builders `cacheWords`, `contextWords`, `limitWords` and `spendWords`.
   - `reading.ts` keeps the facts from Task 5, as `cacheFacts`, `contextFacts` and `limitFacts`, moved word for word.
   - `readingsOf` only composes them: `CacheReading = CacheFacts & CacheWords`, and so on.
   - Tasks 4 and 13 move to `words.ts`.
2. **Amber is one optional object:** `amber: Readonly<{ long: string; short: string }> | undefined`, on cache, context and each limit. It has no separate `amberShort`.
3. **Pre-coloured segments:** phrases a view recolours come as `say: ReadonlyArray<readonly [string, Role]>`, which `words()` takes directly. No view slices or replaces a phrase.
4. **`Keeps`:** `fitLine` hands its build a `Keeps<P>` object and appends `'amberShort'` itself. Views no longer list it in `ORDER`.

   ```ts
   export type Keeps<P extends string> = Readonly<{
     has: (p: P) => boolean                          // calm, optional pieces
     calm: (p: P, tone: Tone) => boolean             // tone === 'amber' || has(p)
     amber: (a: Readonly<{ long: string; short: string }>) => string   // long until the last step, then short
   }>
   ```
5. **`views/view.ts`** holds `View`, `rowsOf(view, kit)` (`kit.Svg ? rows.desktop : rows.terminal`) and `defineView(name, rows, lines, body, strip?)`. Views import `View` from `./view`, never from `./index`, which breaks the cycle. `expectInvariants` uses `rowsOf`. Chips stays a hand-written `View`.
6. **Hoist to `parts.tsx` in 9b, before the freeze:**
   - `line`, `fitLine`, `words` (with `wrap="truncate-end"` and `flexShrink={0}` on each collapsed piece);
   - `section(kit, key, title, rows, room)`, `fact(kit, key, label, value)`, `grid(kit, sections)` (4 per line at 100 columns or more, else 2), `accentOf(kit, limit)`;
   - `layoutCachePill(kit, read, short)`, built from `cache.amber`, `cache.text` and `cache.textShort`, with no hover (chips keeps its own pill);
   - `SHORT_BELOW` in place of a literal `68`.

   `frame.tsx` keeps only the scaffold: `frame`, `bodyRowsFor`, `openView(…, strip?)`, `panel` and `toggleButton`. `frame` draws the body inside `panel`, on `cardBg`.
7. **Views never read raw facts or do arithmetic on words.** Task 13 adds every field a view needs:
   - **Limits and cache:** `resetInMs`, `projectedFrac`, `hitFrac`, `fullIn` (`'~40m'`).
   - **The board:** `cache.boardLeft` (`'IN 1H 00 MIN'`), `cache.board` (status words), `context.boardAmber`, `limit.boardAmber`, `limit.boardShort`.
   - **Context:** `context.towardText` (`'toward compaction'`, or `'of the window'` when compaction is off).
   - **Clock:** `fullAtClock` with `~` (`'~14:20'`).
   - **Empty states:** `EMPTY.context` ("not reported") and `EMPTY.limits` ("none reported").
   - **Passed windows:** `resetWords` and `resetGlyph` are undefined once a window has passed.

   `raw` and `reading` move under `read.chips`, which only chips reads. Task 30 adds a grep gate over `views/*.tsx`, except `chips.tsx`, for `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` and `from '../format'`.
8. **`weekOf`** takes `{ percentUsed, projectedPct, resetsAt }`, not a `LimitView`. `reading.ts` re-exports `DayCell` and `HourCell`, so views never import `calendar.ts`. Cells carry `text` (`'6%'`, `'~7%'`, `''`) and `guess: boolean`, and `dayCells` takes per-value guess flags, drawing a guess dashed.
9. **No `readHistoryForTest`, and no test export from `register.tsx`.** The trails live in `insights.ts`:
   - unit-tested as pure functions (`pushCost` and the others, in the test's own module copy);
   - checked end to end through the drawn pulse view.
10. **`asciiText`:** a dropped glyph takes one following space with it, and there is no global double-space collapse, so deliberate padding survives. Departures' header and week's initials use fixed `width` Boxes, not spaces.
11. **`LimitView.value` is `${Math.round(pct)}%` with no severity mark.** Chips keeps `valueOf` and its mark locally.
12. **Nits to apply:**
    - drop the `squeezeRow` alias;
    - `Glyphs` lives in `snapshot.ts`;
    - drop `read.frame.columns` (use `kit.columns`);
    - comment why `fiveHourTrail` stays separate from the pace samples;
    - CONTRIBUTING's new-layout rule mentions `LAYOUT_NAMES`.

**Rejected, kept as is:** a fully declarative piece model with a generic fitter (YAGNI). `Keeps` gets the main benefit in about 10 lines.

## E. Spec compliance (the views)

- **Pulse and week** use `layoutCachePill`, never chips' `cachePill`, so there's no `0:47` and no missing `! `.
- **Every collapsed view** gets an amber-only piece for each trigger it doesn't otherwise show. That piece is never in `ORDER`.
  - Departures adds a context piece (`! COMPACTS IN ~12K` / `! CONTEXT 85%`).
  - Forecast adds the context and the limit-at-80% amber.
- **Estimates:** `! FULL ~14:20` and `~14:20 · ! 5h full`. The invariant forbids `/full (in |at )?\d/i`.
- **Departures' expanded context status** uses `context.boardAmber`.
- **No section goes missing or empty.** Every expanded view shows all four sections and `otherLimits`, with `EMPTY.*` when there's no data.
  - Tiles shows every limit, not `slice(0, 2)`.
  - Rings never prints `in context 0`.
  - Pulse gains Spend, 7d and `otherLimits`.
  - Week's empty text replaces only the cells, never the facts, and it keeps two rows with no limits.
  - Forecast keeps its Context and Limits rows, with `EMPTY.*`.
- **Expanded height:** `expectInvariants` asserts `visualRows(tree) <= maxRows` when expanded. Views drop charts and rings first when rows run short, and tiles honours `bodyRows`.
- **Amber charts** are gated by the amber step (`keeps.amber`), never by a calm step: gauges' bars, pulse's trail.
- **Alt text, fixed:**
  - the cache alt is built from the spelled-out countdown (`1 hour left`), never by `.replace` on `52m left`;
  - cold says `cache cold, re-warm about $1.66`;
  - a limit with a measured ETA says `full in about 40 minutes`.
- **Rings:** `resetText` is its own step, not tied to `labelsLong`. The expanded view shows the 7d ring. The dead `concat` goes.
- **Desktop rows:**
  - forecast wraps the icon and the head in a row Box;
  - pulse's charts are at least 36 px, so it is 2 rows as declared;
  - the newest pulse bar is drawn in `value`.
- **Week:** r2 is squeezed too, and `EMPTY.history` can give way.
- **Charts:** Task 7's tick rect has `class="tick"`.
- **Flaps (Task 12):** add on-flap ink tokens `flapWarm`, `flapAmber`, `flapFive`, `flapWeek` and `flapCoin`, each at least 4.5:1 on `flap` in both palettes, and test them. Departures uses them. On LIGHT, today's accents are only 2.3–3.9:1 on `#1d1d22`.
- **`AMBER_WORDS` (Task 11a)** lists every view's amber words now, including `LAST CALL`, `! FULL`, `! NEAR LIMIT`, `! COMPACTS IN`, `! cooling · \d+s left`, `! context`, `! ctx` and `! 5h`. Narrow-width amber runs `lastMinute`, `fiveHourAhead`, `limit80` and `nearCompaction` at 40, 50 and 60 columns.

## F. Performance, built in now

1. **The view pattern builds once.** Every piece that doesn't depend on the squeeze is built before `fitLine`, and the closure only selects. A chart that comes in two sizes builds each size at most once, lazily (`wide ??= …`). This applies to:
   - `toggleButton`;
   - pulse's pill, numbers and charts;
   - forecast's `eventsOf`;
   - gauges' meters.
2. **`readingsOf`** computes `week` and `history` as lazy getters, so chips never pays for them.
3. **`limitSamples`:**
   - held in memory from `session.start`;
   - no store I/O inside a bucket;
   - at a bucket rollover: `get` (to merge other sessions), `addSample`, `set`;
   - `addSample` has an O(1) path (append, or replace the last), and sorts only after a merge;
   - writes happen only on a new bucket, and the test varies the percentage.
4. **Histories** pass by reference. Only the push functions allocate, and nothing is sliced per draw outside the view's own selection.
5. **Perf test (Task 27):**
   - one layout per test (one setup), with chips' median recorded first in the same file;
   - add `lastMinute` at 60 columns;
   - log chips against the P0 baseline.
6. **Soak:**
   - rising `rateLimits` on every turn;
   - count `engine.storeSets` per key: `limitSamples` at most 25 over 6 hours, `layout` equal to the number of commands;
   - assert the stored JSON size and stable node counts from drawn trees;
   - the caps themselves are proven by unit tests (A.2).

   Add the calm 10-minute-walk invalidation test from §9.
7. **Drop** the binary-search item from Task 28. Note as a P4 option: the 1 Hz timer could run only in the last minute for non-chips layouts.

## G. Correctness fixes, small

- **Task 3:** the test is pure: `noteTurnStart('s', 1); forgetTurn('s'); expect(openTurns()).toBe(0)`, plus a drawn check that a subagent's turn doesn't change `last message`.
- **Task 5 test:** expect `5h 82%` (no mark). Every test's `snap()` builder is updated as Tasks 8, 10, 23 and 24 add required fields; keep one shared `snapOf()` in `tests/matrix.ts`.
- **Task 8:** the ascii-tier test is one draw. Assert pure ASCII and `widthOf(firstRow(asc)) <= 120 - ROW_SLACK`.
- **Task 10:**
  - the fallback test calls `drawBand(fakeEl, snap, act)` with a throwing view injected through a test-only registry parameter. If that would need a production change, test fallback on the pure `drawBand` with a snapshot whose `layout` names a view that throws, via `drawBand(el, snap, act, views = VIEWS)`, where the 4th parameter defaults to `VIEWS`.
  - "another session's layout" asserts `engine.storeGets` contains `layout` after `turn.complete`.
  - Delete the `band?.layout` test and the spy fallback.
- **Task 23:** the trail cap test drives more than 300 minutes, or unit-tests `noteFiveHourTrail` directly.
- **Task 24:** the test passes `{ percentUsed, projectedPct, resetsAt }`, per D.8.
- **Task 25:** rename `const h` to `hist` everywhere. Never name a local `h`.
- **Worktrees:** create them under `.claude/worktrees/<name>`, which `.gitignore` already covers. Each agent's brief adds:
  - "commit WIP before any rebase";
  - "`git diff --name-only feat/layouts...HEAD` lists exactly your two files", which Task 22 re-checks.
- **TypeScript:** pin `typescript@5.6.3` in the gate commands.

## H. P2 shape

- **P2.0 pilot:** Task 16 (ledger) runs alone on `feat/layouts`. Every change it needs in `parts.tsx`, `frame.tsx`, `view.ts`, `words.ts`, `reading.ts`, `matrix.ts` or `helpers.ts` lands there. Then re-freeze (checkpoint 4), and only then fan out Tasks 17–21.
- **Ledger's code** is rewritten fully against the new API (`defineView`, `Keeps`, `words(say)`, `section`, `grid`, `layoutCachePill`), as the reference every other view copies.
- **Tasks 17–21:**
  - Rewrite each view's code against the same API.
  - Keep each view's design.
  - Apply the E-list fixes for that view.
  - Hoist its builds (F.1).
  - Use `hist`, never `h`.
