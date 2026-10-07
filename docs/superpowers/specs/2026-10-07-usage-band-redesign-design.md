# Usage band redesign

Date: 2026-10-07 · Plugin: `plugins/session-usage-band` (0.1.1 → 0.2.0) · Status: revised after review

## Goal

Make the band:
- smaller and calmer
- self-explanatory
- polished in the Claude desktop app's Code tab
- worth two new numbers you can act on

All four goals were chosen. The visual direction was approved from an
interactive mockup.

## Principles

These settle every later decision.

1. **Calm by default.** A pill escalates only when the next few minutes of
   your behaviour change the outcome.
2. **One accent colour.** Everything is neutral grey. Amber means "act
   soon". The single exception is the cache dot: green while warm, grey
   when cold. Red is never used: a cold cache or a high meter is a price,
   not an error.
3. **Nothing is hover-only.** Hover is a faster way to read what the
   expanded line already says. Mobile, keyboard users and terminals
   without mouse support never see hover and lose nothing.
4. **Colour is never the only signal.** Escalation always adds words or
   `!` / `!!` marks.

## Scope

**In scope:**
- the redesigned band
- last turn's cost and the 5h ETA
- SVG meters on desktop
- the module split
- a `/clear` reset fix
- a README rewrite

**Removed:**
- the tokens pill (`sent · back · cached`)
- the elapsed-time pill
- the always-visible More/Hide button row
- the `Σ` narrow-width form

**Out of scope:**
- burn rate: about the same as cost ÷ elapsed time
- a cost sparkline
- any change to the 0.1.1 cache model: subagent filtering, cold-start
  detection and TTL inference move into their own file unchanged

## Verified engine constraints

Each one was checked against this build's type definitions or the
validator, on Claude Code 2.1.289/2.1.291.

| Fact | Consequence |
| --- | --- |
| The validator refuses `$` passed into a function imported from another file | Only `register.tsx` touches `$` |
| `read`/`update` need atoms declared in the same file | Atoms live in `register.tsx` |
| A pure render module given the resolved elements, a snapshot and callbacks passes validation and tests (probe run) | That's the shape of `band.tsx` |
| On a positioned Box, "the pointer on it is on its parent" | A hover card must be a child of the pill it explains (§3) |
| `turn.start` fires on the main loop only; `turn.complete` carries `agentId` on subagent turns and fires on interrupts (`isAborted`) | Shapes the last turn's cost (§2) |
| `session.measure` fires after each main turn and whenever a rate-limit window moves a whole point; `percentUsed` has at most one decimal | 5h samples arrive in whole-point steps and stop while you're idle (§2) |
| `session.start` fires once per plugin load (and on enable, worker respawn or reload), never on `/clear`; `session.end` fires on `/clear` (`reason: 'clear'`) and resume while the process carries on | Per-conversation state resets on `session.end`, not `session.start` (§5) |
| `Svg` exists in the desktop element table only; it's a leaf drawn as an image unless `isInteractive` | SVG meters on desktop only (§4) |

## 1. Layout

One row (`flexWrap: nowrap`, `overflow: hidden`, so it never wraps):

| Pill | Calm | Escalated |
| --- | --- | --- |
| Cache | green dot + `cache 52m`; `cache warm` while a turn runs | Last 60s: amber, `0:47 left · re-warm ~$0.52`. Cold: grey dot, `cache cold · next message ~$0.52`, never amber |
| Cost | `$3.19` + muted `last $0.42` | Never escalates |
| Context | muted `context`, meter, `16%` | ≥ 80%: amber with `!`; ≥ 95%: `!!` |
| 5h limit | muted `5h`, meter, `4%` | Amber when ≥ 80% (`!`, then `!!` at 95%) or when the ETA rule in §2 fires, adding `full in ~40m` |
| `⋯` | Button; toggles the expanded line | — |

- **While a turn runs** (`isWorking`), `cache warm` replaces the calm
  countdown. Each step restarts the TTL, so a countdown would only bounce
  between `1h 00m` and `59m`. The expiring and cold forms still show
  mid-turn, because a tool call that runs longer than the TTL really does
  let the cache expire.
- **Width priority, lowest first:** the 5h pill goes first, then the
  context meter (its `%` stays), then `last $x`. Cache, total cost and `⋯`
  never drop. Breakpoints start at today's 100 / 68 `bodyColumns` and are
  tuned in the probe (§6).
- **Toasts** move to the same 80% / 95% thresholds as the pills, so a toast
  and an amber pill always agree. Each toast fires once per crossing, as
  today.

### Expanded line

The second row: muted facts in plain words, then a `Hide` button.

`97% of input served from cache · 1 unexpected rebuild · cache lifetime 1h (assumed) · 7d limit 30%, resets in 2d 19h · 5h resets in 2h 36m · 34 model calls`

- "Unexpected rebuild(s)" replaces "cold starts" and shows only when the
  count is at least one.
- `(assumed)` shows until the TTL is pinned by an environment variable or
  inferred.
- `/usage-band more|less|show|hide` keep working.

## 2. New numbers

### Last turn's cost

- On `turn.start`, record the session cost for that `turnId`. On
  `turn.complete` with no `agentId`, after `await next(e)`, store
  `cost now − cost at start` as the last turn's cost. A `turnId` with no
  recorded start is ignored.
- Interrupted turns count, because that's real spend.
- Hidden until one main turn has completed. A difference ≤ 0, or no
  `cost`, also hides it.
- It means "spent during your last message". Background work that ran at
  the same time lands in it, and the hover copy says so.
- Ledger timing can't be tested here. The probe checks it against `/cost`.

### 5h limit ETA

- **Sampling.** On each `session.measure`, record `(now, percentUsed)` for
  the `five_hour` window. If `resetsAt` changes or `percentUsed` drops, the
  window has reset: clear the samples.
- **Pace.** Use the endpoint slope across samples from the last 30
  minutes: `(last.pct − first.pct) / (last.t − first.t)`. Samples arrive in
  whole-point steps, so a least-squares fit would be no more accurate.
- **Shown only when all hold:**
  - the window spans ≥ 10 minutes
  - the rise is ≥ 2 points
  - the newest sample is ≤ 15 minutes old, since samples stop while you're
    idle
  - the projected fill time is before `resetsAt`, or `resetsAt` is unknown
- **Projection.** `tFull = last.t + (100 − last.pct) / slope`, shown as
  `tFull − now`. Under 1h it rounds to 5 minutes (`~40m`); from 1h it
  rounds to 15 minutes (`~1h 45m`). The rounding alone stops jitter.
- **Scope.** 5h usage is account-wide, so the pace includes your other
  sessions and devices. The hover copy says "your pace across Claude".

## 3. Hover explanations

**Mechanism.** Each pill is a keyed Box (a hover scope) holding an
explanation card:
- `position: "absolute"`, `top: 0`, `display: "none"`,
  `hover: { display: "flex" }`, with a background so it covers what's
  beneath it
- anchored at `left: 0` with a fixed width on every pill but the last;
  the rightmost visible pill's card uses `right: 0`, so it opens leftward
  and stays inside the band

Because the pointer on a positioned card counts as on its parent pill, the
pill stays hovered while you read its card. No scope groups are needed.

**Accepted trade-off.** An open card covers the pills to its right (to its
left for the last pill). Reaching one of those means moving off the card
first.

**Acceptance (probe):** no flicker, a card stays open while the pointer is
on it, and you can move to the next pill by leaving the card.

**Fallback:** if any criterion fails, drop the cards. The expanded line
already carries the same facts (Principle 3).

**Card size.** A collapsed band is one row, so a card is one line. Its
width is its text plus 2 cells of padding, and the text uses
`wrap: "truncate-end"` so anything past the band's edge is cut off cleanly.
Copy stays under 60 characters. Cards explain what a pill means; every fact
a card mentions is also in the pill or the expanded line (Principle 3).
In `plain` appearance there are no cards, because a card needs a
background to cover the row beneath it.

**Copy** (sentence case, live numbers):

- **Cache, warm:** "Warm cache bills input at 10%; expires {ttl} after a reply"
- **Cache, cold:** "Cold: next message rebuilds {window} tokens{ (~$x)}"
- **Cost:** "{last} spent during your last message, subagents included".
  Before the first turn: "What this session has cost so far"
- **Context:** "Conversation fill; near full, older turns get summarized"
- **5h:** "5-hour limit across all your Claude use; resets in {reset}"

## 4. Surfaces and appearance

- **Desktop:** `band.tsx` narrows to the desktop element table before using
  `Svg`. Meters are 44×6 CSS px, not interactive: a rounded track in
  `meterTrack` and a fill in `meterFill`, or amber when escalated.
- **Everywhere else, and with `plain` appearance:** six-cell `█░` text
  meters, coloured by theme key.
- **Appearance** still comes from `CC_BAND_APPEARANCE` (dark | light |
  plain) and `NO_COLOR`.
  - The `DARK` and `LIGHT` palettes drop the green warm fill and gain
    `meterTrack`, `meterFill` and `dot`.
  - `PLAIN` maps amber to `warning` and the dot to `success`.
- **Known limitation, accepted:** the re-warm price assumes a cache write
  costs 1.25× base input. A 1-hour cache bills writes at 2×. The estimate
  partly corrects itself through the rate it solves from the session's
  bill, and it's always shown with `~`.

## 5. Code structure

| File | Job | Rules |
| --- | --- | --- |
| `hooks/register.tsx` | Atoms; every hook; the one place that touches `$`; builds a snapshot and callbacks for each render | Must declare the atoms, which must stay in this file |
| `hooks/cache.ts` | Cache model, moved verbatim from 0.1.1 | Pure, no `claude-code` runtime imports |
| `hooks/insights.ts` | Last turn's cost and ETA state, sampling, slope and rounding | Pure |
| `hooks/format.ts` | Formatters, including `fmtEta` | Pure |
| `hooks/palette.ts` | Palettes and appearance resolution | Pure |
| `hooks/band.tsx` | `draw(elements, snapshot, actions): RenderElement` | Never takes `$`; actions are closures made in `register.tsx` |

**Conversation lifecycle fix.** Today `/clear` leaves the band showing the
old conversation's cache countdown and totals, because only `session.start`
resets them and it doesn't fire on `/clear`.
- `session.end` (any reason) resets the cache model, the insights state,
  `warned` and `lastPaintKey`, and repaints.
- **Cost baseline.** At that reset, record the session cost as
  `costBase`. The re-warm rate is solved from `cost − costBase`, so spend
  from the cleared conversation can't inflate it. If the engine resets
  the ledger on `/clear` (cost < `costBase`), `costBase` becomes 0. The
  displayed total is whatever `/cost` reports.
- `session.start` keeps the `$.clock.every` handle and cancels any
  earlier one before arming, so a later `session.start` on the same load
  (enable, worker respawn) can't stack timers.

**Sequencing:**
1. A pure move into the new files, with all 20 tests and validation green
   and no behaviour change.
2. Feature work.

## 6. Probe (step one)

The probe needs hot reloading enabled for this session. The engine asks for
that once, when the first file is written.

A separately named throwaway mod, `usage-band-probe`, written into this
session's dev-mods folder. It hot-reloads here, with no new session, and
draws its own band beside the real one. It shows one Svg meter, three
pills with hover cards, and the live `bodyColumns`.

Acceptance:

1. The Svg meter sits centred in the row at 44×6 px, with no row-height
   change.
2. The hover criteria in §3.
3. `bodyColumns` changes sensibly as the Code tab narrows, so the
   breakpoints can be set.
4. After one message, `last $x` matches the `/cost` difference.
Not in the probe: `/clear` behaviour. Running `/clear` in the session the
probe lives in would wipe that conversation. It's checked at release in a
throwaway session instead (§8), and the tests cover both `costBase`
branches.

Results are recorded in this spec. Fallbacks:
- criterion 1 fails: desktop uses text meters
- criterion 2 fails: no hover cards
- criterion 3 is odd: breakpoints keyed to `viewport.columns` instead

The probe folder is deleted afterwards.

## 7. Testing

**Deleted:** these assert removed UI and nothing else.
- the `Σ` and `sent` assertions in "narrow widths collapse the token pill"
- the `196k` / `12k` assertions in "the collapsed band…"

**Retargeted:**
- "token totals accumulate…" and "a subagent's tokens still count…"
  assert through the re-warm `~$` figure. It depends on those totals, so
  the 0.1.1 rate-solve fix stays guarded.
- Row-count tests: collapsed is one row, expanded is two.
- "cold starts" assertions become "unexpected rebuild".
- More/Less presses use the `⋯` key.

**New:**
- **Last turn's cost:**
  - appears after one main turn
  - a subagent's `turn.complete` doesn't set it
  - an interrupted turn counts
  - hidden with no cost
  - an unmatched `turnId` is ignored
- **ETA:**
  - hidden under 10 minutes of data, under a 2-point rise, when the newest
    sample is stale, and when the reset comes first
  - rounding steps
  - clears on reset
- **Calm:**
  - no amber in the calm state
  - `cache warm` while `isWorking`
  - thresholds at 80% and 95% for both pills and toasts
- **Hover:** each pill is a keyed Box holding a `display: "none"` card with
  `hover.display: "flex"`. The last pill's card anchors `right: 0`.
- **Surfaces:** desktop draws `Svg`; the terminal and `plain` draw none.
- **Layout:** the drop order across `bodyColumns`; `⋯` toggles.
- **Lifecycle:**
  - after `session.end({ reason: 'clear' })`, the band shows `cache warming`
    and no last turn's cost
  - with the ledger not reset, the next re-warm `~$` figure is solved from
    `cost − costBase`
  - with the ledger reset, `costBase` falls back to 0

Gates: `claude plugin validate`, `claude plugin test`, and `tsc` in strict
mode with `noUncheckedIndexedAccess`.

## 8. Release

1. Bump to 0.2.0.
2. Rewrite the README to match: the layout, hover, the expanded line, the
   new numbers and the known limitation.
3. Run `claude plugin update session-usage-band@hossein-mods`. New sessions
   pick it up.
4. In a throwaway session: send one message, run `/clear`, and confirm the
   band shows `cache warming`, with no `last $x`, and a sane re-warm figure
   after the next reply.

## Review changes

Compared with the first draft:
- The hover mechanism now matches the engine's pointer rule (the first
  draft would have flickered).
- The colour rule is unified, with toast thresholds aligned to the pills.
- "Nothing is hover-only" is now a principle; the `(assumed)` flag stays
  visible.
- The test plan now names which tests are deleted and which retargeted.
- The split now follows the validator's `$` and atom rules.
- `/clear` resets the conversation state, guarded by a cost baseline;
  this was corrected after the engine docs showed `session.start` never
  fires on `/clear`.
- The ETA uses an endpoint slope, a staleness cut-off, and is labelled
  account-wide.
- Last turn's cost is keyed by `turnId`, with interrupts and background
  work defined.
- The countdown pauses while a turn runs.
- The VS Code claim is dropped.
- The write-multiplier limitation is stated.
- The probe is defined, with acceptance criteria and fallbacks.
