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
| Task 10c | 356 pass, 0 fail, 27 files | `claude plugin test plugins/session-usage-band` |

## Rulings
<!-- One line each: `Ruling: <what> — <why> — <fallback taken or not>`. -->
Ruling: `noWorkspace` keeps the held workspace read (`engine.hold` that never resolves) — the open draw after ▿ returns and the test passes, so no act waits on the held read — fallback (`rootFails`) not taken.
Ruling: `forgetTurn` kept as a guard — index.d.ts:12643 says a subagent's run raises no turn.start, so no subagent entry is written today; 50eaa33 corrects 1987ba7's body — kept per plan, no fallback.
Pending maintainer: whether a nested subagent's turn.complete can carry its parent's turnId (TurnStepInput.turnId's doc implies distinct ids but never says so); if it can, `forgetTurn` would drop the parent's start cost and 'last message' would go stale.

## Freezes
- P1 freeze (Task 14):
- P2.0 re-freeze (Task 16):

## Time zone
- Kit, TZ=UTC: · kit, TZ=Asia/Tehran: · live session:
- Task 10c, `tools/test-only.sh zone` (`ZONE offset=` at 2026-10-09T12:00Z): unset TZ 210 · `TZ=UTC` 210 · `TZ=Asia/Tehran` 210. The kit reports this machine's zone (+03:30) and ignores `TZ` in the environment it is started from.
- pending maintainer: the offset a live session reports (`utcOffsetMin` in the snapshot), to confirm the engine's sandbox gives the local zone and not 0.
