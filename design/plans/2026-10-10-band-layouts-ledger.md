# Band layouts: ledger

What the plan's steps record, in the order they happen.

## P0
- Golden capture commit: 6540ef38d729186e8ab58f9333f67b625277f38a (hooks identical to 40943d3)
- Cases hashed: 480 (expect 480) · trees kept: 10 (expect 10)
- Two captures identical: yes (`diff` empty) · capture runtime: 7s each (the whole suite plus the capture file)
- Reruns with `TZ=UTC` and `TZ=Asia/Tehran` (this machine's own zone) produced an identical `chips.ts`. Whether the kit honors `TZ` is not checked here; that is Task 14.
- Perf baseline: `design/perf-baseline.md` (`clockReal` true).
- Review fix: the first baseline had its desktop rows swapped. Being open is a stored atom, so the desktop mount started open after the terminal pass; the perf test now presses ▵ before each unmount, as `drawCases` does, and the baseline was retaken (desktop now matches terminal). `capture.sh` now runs in a scratch copy holding only what the capture imports, so a recapture never depends on the `chips.ts` it replaces. The recapture's `chips.ts` differed only in its header's commit, so the file stays as captured at 6540ef3. Capture runtime: 5s (the capture file alone).
- pending maintainer: checkpoint 1 sign-off (480 hashes, capture commit 6540ef3, two identical captures, 7s runtime for the two captures at 6540ef3; 5s with the current scratch-copy `capture.sh`).

## Test counts at each gate
| Gate | Count | Command |
| --- | --- | --- |
| Task 1 (before) | 264 pass, 0 fail, 20 files | `claude plugin test plugins/session-usage-band` |
| Task 1 | 292 pass, 0 fail, 22 files | `claude plugin test plugins/session-usage-band` |
| Task 2 | 333 pass, 0 fail, 24 files | `claude plugin test plugins/session-usage-band` |
| Task 3 | 335 pass, 0 fail, 24 files | `claude plugin test plugins/session-usage-band` |
| Task 3 (review) | 336 pass, 0 fail, 24 files | `claude plugin test plugins/session-usage-band` |
| Task 4 | 345 pass, 0 fail, 25 files | `claude plugin test plugins/session-usage-band` |
| Task 4 (review) | 346 pass, 0 fail, 25 files | `claude plugin test plugins/session-usage-band` |
| Task 5 | 352 pass, 0 fail, 26 files | `claude plugin test plugins/session-usage-band` |
| Task 5 (review) | 352 pass, 0 fail, 26 files | `claude plugin test plugins/session-usage-band` |
| Task 6 | 353 pass, 0 fail, 26 files | `claude plugin test plugins/session-usage-band` |
| Task 6 (merged) | 359 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 7 | 367 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 7 (review) | 368 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 7 (review 2) | 369 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 7 (merged) | 376 pass, 0 fail, 28 files | `claude plugin test plugins/session-usage-band` |
| Task 8 | 357 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 8 (review) | 358 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 8 (review 2) | 358 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 8 (merged) | 382 pass, 0 fail, 29 files | `claude plugin test plugins/session-usage-band` |
| Task 9a | 389 pass, 0 fail, 30 files | `claude plugin test plugins/session-usage-band` |
| Task 9a (review) | 389 pass, 0 fail, 30 files | `claude plugin test plugins/session-usage-band` |
| Task 9a (review 2) | 389 pass, 0 fail, 30 files | `claude plugin test plugins/session-usage-band` |
| Task 9a (merged) | 389 pass, 0 fail, 30 files | `claude plugin test plugins/session-usage-band` |
| Task 9b | 399 pass, 0 fail, 31 files | `claude plugin test plugins/session-usage-band` |
| Task 9b (merged) | 405 pass, 0 fail, 32 files | `claude plugin test plugins/session-usage-band` |
| Task 10a | 395 pass, 0 fail, 31 files | `claude plugin test plugins/session-usage-band` |
| Task 10a (merged) | 395 pass, 0 fail, 31 files | `claude plugin test plugins/session-usage-band` |
| Task 10b | 408 pass, 0 fail, 32 files | `claude plugin test plugins/session-usage-band` |
| Task 10c | 356 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 10c (merged) | 356 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |
| Task 12 | 354 pass, 0 fail, 26 files | `claude plugin test plugins/session-usage-band` |
| Task 12 (merged) | 358 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |

## Rulings
<!-- One line each: `Ruling: <what> — <why> — <fallback taken or not>`. -->
Ruling: `noWorkspace` keeps the held workspace read (`engine.hold` that never resolves) — the open draw after ▿ returns and the test passes, so no act waits on the held read — fallback (`rootFails`) not taken.
Ruling: `forgetTurn` kept as a guard — index.d.ts:12643 says a subagent's run raises no turn.start, so no subagent entry is written today; 50eaa33 corrects 1987ba7's body — kept per plan, no fallback.
Pending maintainer: whether a nested subagent's turn.complete can carry its parent's turnId (TurnStepInput.turnId's doc implies distinct ids but never says so); if it can, `forgetTurn` would drop the parent's start cost and 'last message' would go stale.
Ruling: `fakeEl`'s `plainNode` kept as the plan writes it — the kit's `h` calls a function component with the JSX `key` in its props and the children under `children`, so `meter(makeKit(fakeEl, snapOf()), …)` keeps key `meter` and its `track` Text (charts.test.ts pins it); the `drawBand(fakeEl, …)` and `byKey(…, 'more', 'Button')` half of the check lands with `NO_ACT` in Task 10a — no adjustment needed.
Ruling: every ascii mapping is one character at most (`↻` and `Σ` dropped, `…` becomes `.`, `±` becomes `+`), and a glyph the map drops takes one following space while any other non-ASCII character is dropped alone (`Résumé Builder` reads `Rsum Builder`), with no global collapse of double spaces; spec §3.2 updated to match — the squeeze measures before the mapping, so a mapping must never widen a row — no fallback; the cost is slightly terser ascii text, and a clipped path can read as a real one (`~/./claude-mod`, `feat/lo.ts`).
Pending maintainer: whether `…` should map to a character other than `.` in the ascii tier; `~` is no clean win, since `~/~/claude-mod` reads as a path too.
Ruling: Task 12's flap tokens taken as the plan's table, no lightness changed — every `cardBg` check passed (lowest: dark `trackStroke` 3.45:1, light `warm`/`fiveAccent` 3.95:1) and the lowest on-flap ink is light `flapDim` at 7.12:1 — no separate token added, so spec §2.10 gains none; `flapWarm`, `flapAmber`, `flapFive`, `flapWeek` and `flapCoin` extend the three spec §6 names for departures.
Ruling: `textBattery(kit, charge, tone, text)` takes `text` already in the glyphs it is drawn in, and the caller maps the ascii tier (chips passes `asciiText(label)` on a terminal in ascii) — the kit carries no glyph tier and `kit.tsx` is not Task 9a's, while the cut must fall on the mapped text — no fallback; Task 13's `layoutCachePill` must map its text the same way before it calls `textBattery`.
Ruling: `toggleButton`'s Box has no key, and chips' row draws its toggle with it — chips' wrapper never had one and golden keeps keys, so one copy stays deep-equal; no later task finds the toggle by a `toggle` key (the invariants walk for the Button's label) — no fallback.
Ruling: chips keeps its own buttons, footer-strip room and hint, and `frame()` draws its own copy as Step 5 writes it — Task 14's P1 freeze fixes `frame.tsx`'s exports at `frame`, `bodyRowsFor`, `openView`, `panel`, `toggleButton` and `Strip`, and golden guards chips' copy — no fallback; review reverted a shared `stripAndActions`.
Pending maintainer: the ascii-tier check `snap.surface === 'terminal' && snap.glyphs === 'ascii'` is in both `band.tsx` and `views/chips.tsx`; one `asciiTier(snap)` beside `asciiText` in `glyphs.ts` (not Task 9a's file) would hold it.
Pending maintainer: spec §4 file table (line 161) lists `cachePill` under `views/parts.tsx`, while the plan's Task 9a keeps it in `chips.tsx`; drop it from that row, or name Task 13's `layoutCachePill`.
Pending maintainer: plan Task 13 Step 6's `layoutCachePill` passes `text` to `textBattery` unmapped, against the `textBattery` ruling above; on a terminal in the ascii tier `asciiTree` would then map after the cut. It takes no `snap`, so it needs the ascii check passed in (or `asciiTier(snap)` once it exists) and `ascii ? asciiText(text) : text` on the filled terminal path.
Ruling: `session.start` reads the stored layout with `await readLayout($)` in place of Task 10a's `band.layout = DEFAULT_LAYOUT` reset, after `band.reads++` — `readLayout` always assigns `band.layout` (the stored name or chips), so the reset was a second write of the same field; module state still resets on every start — no fallback.
Pending maintainer: `turn.complete`'s `readLayout` can replace the layout this session draws in for a turn, three ways. A layout chosen while the store fails to write lasts only until the next main-loop turn, which finds nothing stored and falls back to chips (checked with a throwaway test: `storeFails`, `layout ledger`, one turn, `layout` answers chips). A read that fails also falls back to chips, so one flaky read draws a stored ledger as chips until the next turn. And a `/usage-band layout X` that lands while that read is out can be overwritten by the value the read began with, until the next turn. Spec §4.2 reads the store on every turn with the chips fallback, so 10b keeps that and says so in `chooseLayout`'s comment. One option for the first two is for `turn.complete` to adopt only a known stored name and otherwise keep the current layout, leaving the chips fallback to `session.start`; the third needs a count of choices that `chooseLayout` bumps and `readLayout` checks before it assigns, as `band.reads` does for the workspace, and a test of it needs `tests/helpers.ts` to hold a store read open.

## Freezes
- P1 freeze (Task 14):
- P2.0 re-freeze (Task 16):

## Time zone
- Kit, TZ=UTC: · kit, TZ=Asia/Tehran: · live session:
- Task 10c, `tools/test-only.sh zone` (`ZONE offset=` at 2026-10-09T12:00Z): unset TZ 210 · `TZ=UTC` 210 · `TZ=Asia/Tehran` 210. The kit reports this machine's zone (+03:30) and ignores `TZ` in the environment it is started from.
