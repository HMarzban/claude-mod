# Three layouts: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

v2 · reviewed for code truth, spec coverage and architecture.

Status: Implemented in 0.14.0. The boxes below were left unticked; the work shipped in PR #7.

**Goal:** Cut the band's nine layouts to three (chips, pulse and departures). Each draws its own collapsed row and its own open view.

**Architecture:** The layers don't change: `register → snapshot → reading/words → views`.
- The shared footer moves from `cards.tsx` to `frame.tsx`.
- The board's words are `boardWords` in `words.ts`, built from facts and the words that already exist.
- Svg geometry lives in `charts.tsx` and a new `flaps.tsx`, never in `views/`, so it stays clear of the views gate.
- Pulse and departures are rewritten, each with its open view in a file of its own. Six views are deleted, and `cards.tsx` becomes chips' alone.

**Tech stack:** a Claude Code mod in TypeScript/TSX, on the engine's `claude-code` and `claude-code/testing`. From the repo root:
- `claude plugin test plugins/session-usage-band` runs the whole suite;
- `tools/test-only.sh <glob>…` runs one test file, for red and green steps;
- `tsc -p plugins/session-usage-band` type-checks;
- `claude plugin validate plugins/session-usage-band` checks the manifest;
- `tools/views-gate.sh` runs the views gate.

**Spec:** `design/2026-10-12-three-layouts-spec.md` (v2.1). This plan cites it as S§n. Read it first.

## Global constraints

- **One order.** Pulse and departures draw Cache, Spend, Context, 5h, 7d, then `otherLimits` when open. Amber never moves a reading.
- **Chips' golden hashes** (`tests/golden/chips.ts`) pass after every task, unchanged. `GOLDEN_SCENARIOS` becomes a frozen, explicit list in Task 3, so a scenario added after that is never golden.
- **Amber words start `! `**, except the board's `LAST CALL`. Cache amber is `cache.tone === 'amber'`, the last minute. Nothing is red.
- **`~` marks estimates only.** Measured times carry no `~`, and `≈` is never used. On the board a minute count reads `IN 38 MIN`, never `38M`.
- **Svg** draws on the desktop only.
  - Every Svg has `alt` and `width`.
  - No Svg has an `id`, a gradient, a pattern, a clipPath or `preserveAspectRatio="none"`.
  - Svg text uses `system-ui, sans-serif`, except the flaps, which use `ui-monospace, monospace`.
- **Glyphs** come from the tier allowlist (old spec §3.2). New views draw no `▁–▇`, `○◐◑◕`, `▮▯▰▱`, emoji or `—`. TIME's placeholder is `-`.
- **The views gate.**
  - `views/*.tsx` outside chips, parts and frame contains no `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` or `../format`.
  - Pulse and departures never import `./cards` or `./chips`, and never call a pill, battery or meter helper. Task 7 adds this check to the gate.
- **Commits.**
  - Every commit runs the whole suite and passes.
  - Messages use conventional prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`. Never `feat!:`.
  - Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Version** 0.14.0, in `plugins/session-usage-band/.claude-plugin/plugin.json` only.
- **Rollback.** Task 3 is one commit that can be reverted alone. A stored removed name stays in the store, so reverting to 0.13.2 brings back the user's layout.

## Review focus

Each of these is pinned by a test in the task named.

1. **A stored removed layout across an upgrade.** It draws chips, the list reply names the removed layout, and nothing is written (Task 3).
2. **The board on a light theme.** Every board ink holds 4.5:1 on `flapBg` in LIGHT (Task 6).
3. **An unknown zone.** No board cell, remark or alt holds a clock time, and no cell is empty (Tasks 4 and 7).
4. **Degenerate traces.** A trace with one cost, with every cost a re-warm, or with every cost 0 shows no NaN, and its scale is never 0 (Tasks 5 and 8).
5. **Narrow rows at full amber.** At 40 columns the row fits its width, measured rather than inferred from "ends in ▵". CACHE and 7D stay on the board. Pulse keeps every reading's words (Tasks 7 and 9).

---

### Task 0: Two questions for the user, asked together

Both answers come from the user's desktop, so ask them in one message and nothing waits twice.

**Files:**
- Create, throwaway: `/Users/macbook/.claude/dev-mods/<session-id>/heartbeat-spike/{.claude-plugin/plugin.json,hooks/hooks.json,hooks/register.tsx}`
- Create, throwaway: a scratch worktree of `main` (`git worktree add ../claude-mod-main main`)

**Produces:**
- **Decision A:** does motion ship (`MOTION = true | false`)? Recorded in S§4.1.
- **Decision B:** can the demo renderer gate the sign-off? Recorded as Task 12's first line.

- [ ] **Step 1: Write the spike mod.** Load the `plugin-authoring` skill first. `$.clock.every(ms, fn)` exists. The mod draws a CSS dot and a SMIL dot side by side:

```json
{ "name": "heartbeat-spike", "version": "0.1.0", "description": "Throwaway: does an interactive Svg keep its animation across band redraws?" }
```

```json
{ "modules": ["./register.tsx"] }
```

```tsx
import type { Register } from 'claude-code'

const CSS = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><style>@keyframes b{0%,100%{r:3.5}30%{r:5.5}}circle{animation:b .6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){circle{animation:none}}</style><circle cx="6" cy="6" r="3.5" fill="#F5B14C"/></svg>`
const SMIL = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="3.5" fill="#7FCF8A"><animate attributeName="r" values="3.5;5.5;3.5" dur="0.6s" repeatCount="indefinite"/></circle></svg>`

export const register: Register = on => {
  let tick = 0
  on('session.start', async ($, e, next) => {
    // Redraw every second, as the band does in the cache's last minute.
    $.clock.every(1000, () => { tick++; $.ui.invalidate('ui.render') })
    return next(e)
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text, Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="row" columnGap={1}>
        <Svg source={CSS} alt="css beat" width={12} height={12} isInteractive />
        <Svg source={SMIL} alt="smil beat" width={12} height={12} isInteractive />
        <Text>{`tick ${tick}`}</Text>
      </Box>
    )
  })
}
```

- [ ] **Step 2: Render the reported bugs from `main`.** In the scratch worktree, add a capture under `tools/demos/capture/` that draws:
  - pulse open at 120 columns, with the `fullHistory` scenario (the SPEND card);
  - week collapsed, with the `calm` scenario and samples (the 7d cells).

  Run `tools/demos/build.sh capture`, render with `render_desk.py`, and Read the PNGs.
- [ ] **Step 3: Ask the user, in one message, with the PNGs attached via SendUserFile:**
  1. "A spike mod draws two dots above your prompt. Please send a 5-second screen recording: do both pulse smoothly while `tick` counts? Then turn on macOS Reduce Motion: does the left one stop?"
  2. "Here are my renders of the SPEND card and the 7d cells from your screenshots 5, 7 and 9. Do they show the same misplaced marks your desktop does?"
- [ ] **Step 4: Record the decisions.**
  - Motion ships only if the CSS dot pulses smoothly across ticks and stops under Reduce Motion. SMIL alone can't honour Reduce Motion.
  - Edit S§4.1 to "Motion ships." or "The mark ships still; motion is a follow-up release."
  - Write decision B as Task 12's first line.
  - With no answer by the start of Task 5, both default to the safe side: the mark is still, and the user's desktop screenshots are the final gate.
  - Delete the spike folder and the worktree (`git worktree remove ../claude-mod-main`).

```bash
git add design/2026-10-12-three-layouts-spec.md design/2026-10-12-three-layouts-plan.md
git commit -m "docs: record the heartbeat spike and the demo's reach"
```

---

### Task 1: Root-cause and fix the misdrawn marks pulse reuses

This is S§6.2's "Fix before reuse".

**Files:**
- Modify: `plugins/session-usage-band/hooks/charts.tsx` (`barChart`, `dayCells`)
- Test: `plugins/session-usage-band/tests/charts.test.ts`

**Consumes:** Task 0's renders.

**Produces:** `barChart` and `dayCells` that draw true to their values at the sizes pulse uses: beats at 84×20 and 240×40, and day cells at `cellPx` 4 and 18.

- [ ] **Step 1: Find the cause.** For each reported mark, open its Svg `source` in the Task 0 capture and compare its geometry with the value it shows. Check these candidates in order, and write down the one that holds:
  1. **Stretch.** A card lens draws with `preserveAspectRatio="none"` (`stretchedOf`, and `dayCells`' stretch branch). That squashes bars into a sliver, and slides a notch off its cell when the slot is wider than the markup.
  2. **Geometry.** A fill's or notch's x is off by a gap or an edge (`dayCells`' `DAY_EDGE`/`step`, or `sliceCells`' `notch` formula).
  3. **Sizing.** A `width` is set while the height is left to the markup.
- [ ] **Step 2: Write the failing test for the cause found.**

  **If the cause is stretch:**

```ts
test('no chart the new layouts draw stretches: every Svg has its own width and keeps its aspect', () => {
  for (const layout of ['pulse', 'departures'] as const) for (const expanded of [false, true]) {
    const tree = drawBand(fakeEl, snapOf({ layout, surface: 'desktop', columns: 160, maxRows: 13, expanded }), NO_ACT)
    for (const s of svgsOf(tree)) {
      expect(typeof s.props?.width).toBe('number')
      expect(String(s.props?.source)).not.toMatch(/preserveAspectRatio="none"/)
    }
  }
})
```

  The old pulse's card lens stretches, so this test turns green only when pulse is rebuilt. Commit it as `test.skip('…', …)` with a comment "turns on in Task 9", and Task 9 removes the `skip`.

  **If the cause is geometry:** draw `dayCells` with `values: [50, 100]`, `today: 1`, `cellPx: 18` and `height: 56`. Parse each `class="fill"` rect and assert:
  - its x lies inside its own cell's edge rect;
  - its height is `value/100 × (height − 2)`, within 0.1.

  **If the cause is sizing:** assert that `height` is set on every chart Svg the two views draw.
- [ ] **Step 3: Run** `tools/test-only.sh charts`. Expected: FAIL (or skipped, for stretch).
- [ ] **Step 4: Fix it at the cause,** in `charts.tsx`. For stretch, the primitive needs no fix: the new views never pass `stretch`, and Task 11 deletes the option once nothing uses it.
- [ ] **Step 5: Run** `tools/test-only.sh charts golden-hash golden-a golden-b`. Expected: PASS, with chips unchanged. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "fix: chart marks drawn true to their values at every size the layouts use"
```

---

### Task 2: Move the footer into the frame

**Files:**
- Modify: `plugins/session-usage-band/hooks/views/frame.tsx`
- Modify: `plugins/session-usage-band/hooks/views/cards.tsx:444-488`
- Test: `plugins/session-usage-band/tests/frame.test.ts`

**Produces:**
- `footer(kit: Kit, act: BandActions, strip?: RenderElement): RenderElement`. Given a strip, the strip sits in the footer row; otherwise the hint does, while it fits. Then air, then Collapse and Hide band.
- `footerRoom(kit: Kit): number`: the columns the buttons, their hotkey marks and gaps take.

- [ ] **Step 1: Write the failing tests** in `tests/frame.test.ts`. Merge these names into the file's existing imports; never import a binding twice.

```ts
import { footer, footerRoom } from '../hooks/views/frame'

const kit120 = () => makeKit(fakeEl, snapOf({ surface: 'terminal', columns: 120, expanded: true }))
test('footer without a strip: the hint, air, then Collapse (c) and Hide band (h)', () => {
  const tree = footer(kit120(), NO_ACT) as unknown as Node
  expect(byKey(tree, 'collapse', 'Button')?.props?.hotkey).toBe('c')
  expect(byKey(tree, 'hide', 'Button')?.props?.hotkey).toBe('h')
  expect(shown(tree)).toContain('Bring it back with /usage-band')
})
test('footer with a strip draws the strip in place of the hint', () => {
  const k = kit120()
  const strip = k.oneLine({ key: 'strip', color: '#fff' }, 'claude-mod') as RenderElement
  const text = shown(footer(k, NO_ACT, strip))
  expect(text).toContain('claude-mod')
  expect(text).not.toContain('Bring it back')
})
test('footerRoom counts the buttons, their marks and gaps', () => {
  expect(footerRoom(kit120())).toBeGreaterThan(20)
})
```

- [ ] **Step 2: Run** `tools/test-only.sh frame`. Expected: FAIL, because `footer` isn't exported.
- [ ] **Step 3: Implement.** In `frame.tsx`, import `cellsOf`, `HOTKEY_MARK` and `ROW_SLACK` from `../layout` and `BARE` from `../palette`, then add:

```tsx
const NO_PRESS: BandActions = { toggleExpanded: async () => undefined, hide: async () => undefined }

const buttonsOf = (kit: Kit, act: BandActions): RenderElement[] => {
  const { Button } = kit
  return [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
}

/** The columns the buttons take with their hotkey marks and gaps: what a
 *  strip in the footer leaves out of its room. */
export const footerRoom = (kit: Kit): number => cellsOf(buttonsOf(kit, NO_PRESS), kit.measure) + 2 * HOTKEY_MARK + 2

/** The open view's last row: the strip, given one, else the hint while it
 *  fits; air; then Collapse and Hide band. */
export const footer = (kit: Kit, act: BandActions, strip?: RenderElement): RenderElement => {
  const { Box, Text, Svg, measure, columns, icon } = kit
  const buttons = buttonsOf(kit, act)
  const hint = (
    <Box key="hint" flexDirection="row">
      {Svg ? icon('info', BARE.icon) : null}
      <Text color={BARE.label}>Bring it back with /usage-band</Text>
    </Box>
  )
  const hinted = cellsOf(hint, measure) + cellsOf(buttons, measure) + 2 * HOTKEY_MARK + buttons.length + 1 <= columns - ROW_SLACK
  return (
    <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
      {strip ?? (hinted ? hint : null)}
      {strip === undefined ? <Box flexGrow={1} /> : null}
      {buttons}
    </Box>
  )
}
```

  In `cards.tsx` `openBody`:
  - delete `buttons`, `hint`, `hinted` and the actions row;
  - the footer strip's room becomes `columns - ROW_SLACK - (stripPlace === 'footer' ? footerRoom(kit) : 0)`;
  - the last element becomes `footer(kit, act, stripPlace === 'footer' && strip !== null ? strip : undefined)`;
  - drop the imports only the moved code used.
- [ ] **Step 4: Run** `tools/test-only.sh frame cards golden-hash golden-a golden-b`. Expected: PASS, every chips hash unchanged. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "refactor: the open view's footer lives in the frame, for every layout"
```

---

### Task 3: Remove six layouts; the command names what was removed

**Files:**
- Delete:
  - `hooks/views/{gauges,ledger,rings,tiles,week,forecast}.tsx`
  - `tests/view-{gauges,ledger,rings,tiles,week,forecast}.test.ts`
- Modify:
  - `hooks/snapshot.ts:17`
  - `hooks/views/index.ts`
  - `hooks/memory.ts:53-59`
  - `hooks/register.tsx`: the band type at 134, its initializer at 164, `readLayout` at 410-419, and `LAYOUT_LIST`, `layoutReply` and the command at 421-450
  - `tests/cases.ts:153`
  - `tests/layout-command.test.ts`
  - `tests/suite.test.ts:7-16`
  - `tests/views.test.ts:34-42`
  - `tests/matrix.test.ts:19,170`
  - `tools/demos/stills.py:117-124`, so `tools/demos/build.sh` keeps working

**Produces:**
- `LAYOUT_NAMES = ['chips', 'pulse', 'departures'] as const`.
- In memory.ts: `REMOVED_LAYOUTS`, `REMOVED_IN = '0.14.0'`, and `removedLayoutOf(v: unknown): string | undefined`.
- `band.removed: string | undefined`.

- [ ] **Step 1: Freeze golden.** In `tests/cases.ts`, replace `SCENARIO_NAMES.filter(s => s !== 'coldLimit80')` with an explicit list of today's 20 names: every key of `SCENARIOS` but `coldLimit80`, in their current order. Comment it: "Frozen: golden's capture holds these. A scenario added later is never golden." Then run `tools/test-only.sh golden-hash golden-a golden-b`. Expected: PASS.
- [ ] **Step 2: Write the failing tests** in `tests/layout-command.test.ts`. Add `removedLayoutOf` to the existing `../hooks/memory` import.

```ts
const LIST = 'Choose one: chips (at a glance), pulse (trends), departures (times).'

test('asLayoutName takes a name in any case and spacing, and nothing else', () => {
  expect(asLayoutName('  Pulse ')).toBe('pulse')
  expect(asLayoutName('pulse extra')).toBeUndefined()
  for (const v of [42, null, {}, [], 'sparkle', '', 'ledger']) expect(asLayoutName(v)).toBeUndefined()
})
test('removedLayoutOf knows the six removed names, in any case', () => {
  expect(removedLayoutOf(' Week ')).toBe('week')
  expect(removedLayoutOf('pulse')).toBeUndefined()
})
test('a removed name stored draws chips, the list says so, and nothing is written', async ($, on) => {
  setup(on, { store: { layout: 'gauges' } }); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: chips (gauges was removed in 0.14.0). ${LIST}`)
  expect(engine.storeSets).not.toContain('layout')
  const [drawn, chips] = await drawnBesideChips($)
  expect(drawn).toBe(chips)
})
test('choosing a removed name changes nothing and says so', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout week')).toBe(`week was removed in 0.14.0. ${LIST}`)
  expect(engine.storeSets).not.toContain('layout')
})
test('a switch clears the removed note', async ($, on) => {
  setup(on, { store: { layout: 'rings' } }); await $.session.start(START)
  await run($, 'layout pulse')
  expect(await run($, 'layout')).toBe(`Usage band layout: pulse. ${LIST}`)
})
```

  Three more edits in that file:
  - In the unknown-name test, change `/…Choose one: chips, /` to `/…Choose one: chips \(/`.
  - The stored-layout test stores `'departures'` and expects `Usage band layout: departures. ${LIST}`.
  - Replace every other `'ledger'` with `'pulse'`.
- [ ] **Step 3: Run** `tools/test-only.sh layout-command`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - snapshot.ts: `export const LAYOUT_NAMES = ['chips', 'pulse', 'departures'] as const`.
  - memory.ts, beside `asLayoutName`:

```ts
/** Layouts this version removed: a stored one draws chips, and the command names it. */
export const REMOVED_LAYOUTS = ['gauges', 'ledger', 'rings', 'tiles', 'week', 'forecast'] as const
export const REMOVED_IN = '0.14.0'
/** A removed layout's name, from the store or the command, trimmed and lowercased; else undefined. */
export const removedLayoutOf = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (REMOVED_LAYOUTS as readonly string[]).includes(word) ? word : undefined
}
```

  - register.tsx:
    - Add `removed: string | undefined` to the band type, and `removed: undefined` to its initializer.
    - In `readLayout`, after the `band.layout` line, add `if (read !== undefined) band.removed = removedLayoutOf(read.stored)`.
    - Replace `LAYOUT_LIST` and `layoutReply` with:

```ts
const LAYOUT_PURPOSE: Readonly<Record<LayoutName, string>> = { chips: 'at a glance', pulse: 'trends', departures: 'times' }
const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.map(n => `${n} (${LAYOUT_PURPOSE[n]})`).join(', ')}.`
const layoutReply = (name: LayoutName, removed?: string): string =>
  `Usage band layout: ${name}${removed === undefined ? '' : ` (${removed} was removed in ${REMOVED_IN})`}.`
```

    - In the handler: an empty argument returns `${layoutReply(band.layout, band.removed)} ${LAYOUT_LIST}`.
    - Before the unknown branch: `const gone = removedLayoutOf(arg); if (gone !== undefined) return `${gone} was removed in ${REMOVED_IN}. ${LAYOUT_LIST}``.
    - After `band.layout = name`, set `band.removed = undefined`.
  - views/index.ts: drop the six imports and their entries.
  - stills.py:117-124: keep only `chips`, `pulse` and `departures`.
  - Delete the 12 files.
- [ ] **Step 5: Fix the remaining tests.**
  - `suite.test.ts:7-16`: list the three layouts.
  - `views.test.ts:34-42`: use `{ ...VIEWS, pulse: marker }`.
  - `matrix.test.ts:19,170`: use `pulse` or `departures` where a removed name was.
  - Run `tsc -p plugins/session-usage-band`, and fix whatever it names.
  - **Leave these alone:** the `week` icon (`icons.ts:12,70,84,105` and `chips.tsx:47`), and the `week`/`daysAlt` readings in `charts.test.ts`, `limits.test.ts` and `readings.test.ts`. They are chips' icon and readings pulse keeps, and touching them moves golden.
- [ ] **Step 6: Run** the whole suite, `tools/views-gate.sh` and `python3 tools/demos/stills.py --help` (it must import cleanly). Then commit:

```bash
git add -A plugins/session-usage-band tools/demos/stills.py
git commit -m "feat: keep three layouts; a removed one draws chips and the command says so"
```

---

### Task 4: The cache's cold-at time and the board's words

**Files:**
- Modify: `hooks/cache.ts` (one `coldAtOf`, which `msLeft` derives from) and `hooks/snapshot.ts` (`cache.coldAt`)
- Modify: `hooks/format.ts` (export `secondsLeft`, `minutesLeft` and `etaMinutes`, unchanged)
- Modify: `hooks/words.ts` (`boardWords` and its types, `remarksFit`, `padTo`, and `CacheWords.heartAlt`)
- Modify: `hooks/workspace.ts` (`stripWords`)
- Modify: `hooks/reading.ts` (`Readings.board`, built lazily)
- Modify: `tests/matrix.ts` (`snapOf`'s cache gains `coldAt: null`)
- Test: `tests/cache-view.test.ts`, `tests/board.test.ts` (new), `tests/workspace.test.ts`

**Produces:**
- `BandSnapshot['cache']['coldAt']: number | null`.
- `CacheWords.heartAlt: string`, one per mood: `'cache warm'`, `'cache in its last minute'`, `'cache cold'`, `'cache not measured yet'`, `'cache warming'`.
- `stripWords(ws: Workspace): readonly string[]`, for example `['claude-mod', 'main', 'clean']`.
- In words.ts:

```ts
export type BoardKey = 'cache' | 'spend' | 'context' | '5h' | '7d' | 'other'
export type BoardRow = Readonly<{
  key: BoardKey
  item: string        // CACHE | SPEND | CONTEXT | 5H | 7D | an other limit's name, upper-case
  status: string      // DEPARTS | LAST CALL | DEPARTED | BOARDING | CHECK-IN | $0.24 | 8% USED | 26% | ! NEAR LIMIT
  time: string        // 17:24 | SAT 13:30 | IN 38 MIN | IN 1H 04M | PASSED | -
  remarks: string
  cell: string        // collapsed, long: DEPARTS 17:24 | 26% ↻ 17:50 | 85% ↻ SAT 13:30 ! NEAR LIMIT
  cellShort: string   // collapsed, short: 17:24 | ! 47S | 26%
  /** Limits only: the cell without its reset. */
  cellNoReset?: string
  tone: Tone
  alt: string         // in words, never capitals or ↻: the reading's existing alt
}>
export type Board = Readonly<{ header: readonly string[] | undefined; rows: readonly BoardRow[] }>
export type BoardFacts = Readonly<{
  frame: Frame
  cache: CacheFacts & CacheWords
  spend: SpendFacts & SpendWords
  context: ContextFacts & ContextWords
  limits: readonly (LimitFacts & LimitWords)[]
  workspace: Workspace | undefined
  coldAt: number | null
}>
export const boardWords: (r: BoardFacts) => Board
/** REMARKS cut to `tiles` characters, `…` last where cut. */
export const remarksFit: (remarks: string, tiles: number) => string
/** `text` padded with spaces to `n` characters; longer text is left whole. */
export const padTo: (text: string, n: number) => string
```

  The types are imported type-only, as `usedSoFar` already imports `LimitView`.
- `Readings.board: Board`, built on first read, as `history` and `week` are.

- [ ] **Step 1: Write the failing tests.**

  In `tests/cache-view.test.ts`, add `noteResume` to the existing `../hooks/cache` import:

```ts
test('coldAt: null before a reply, the reply plus the lifetime after, null once a resume is called expired', () => {
  resetCache()
  expect(cacheView(0, undefined, 0).coldAt).toBeNull()
  recordResponse({ input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 1000 }, 5 * MIN, true)
  const v = cacheView(10 * MIN, undefined, 0)
  expect(v.coldAt).toBe(10 * MIN + v.msLeft)
  resetCache()
  noteResume({ lastAt: 0, expired: true, reWarmUsd: 0.5 })
  expect(cacheView(MIN, undefined, 0).coldAt).toBeNull()
  expect(cacheView(MIN, undefined, 0).msLeft).toBe(0)
})
```

  `recordResponse` is declared at `cache.ts:242`. Pass the trailing arguments its signature requires, as this file's other tests do.

  In `tests/workspace.test.ts`:

```ts
test('stripWords: folder, branch, clean or changed; the folder alone without git', () => {
  expect(stripWords({ path: '/Users/me/claude-mod', git: { branch: 'main', changed: 0 } } as Workspace)).toEqual(['claude-mod', 'main', 'clean'])
  expect(stripWords({ path: '/Users/me/claude-mod', git: { branch: undefined, changed: 3 } } as Workspace)).toEqual(['claude-mod', 'detached', '3 changed'])
  expect(stripWords({ path: '/Users/me/claude-mod', git: undefined } as Workspace)).toEqual(['claude-mod'])
})
```

  Create `tests/board.test.ts`. `snapOf` defaults to `zone: undefined`, so these tests set UTC. Its context is the snapshot's `{ tokens, percent, window, compactAt, … }`.

```ts
import { test, expect } from 'claude-code/testing'
import { fixedZone } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { padTo, remarksFit } from '../hooks/words'
import { HOUR, MIN } from './helpers'
import { snapOf } from './matrix'

const UTC = fixedZone(0)
const cacheAt = (over: object) => ({ ...snapOf().cache, ...over })
const board = (over: object = {}) => readingsOf(snapOf({ zone: UTC, ...over })).board
const row = (over: object, key: string) => board(over).rows.find(r => r.key === key)
const limit = (pct: number, resetH: number) => ({ percentUsed: pct, resetsAt: new Date(resetH * HOUR).toISOString(), etaMs: null })
const CLOCK = /\d\d:\d\d/

test('rows run in the one order', () => {
  expect(board({ fiveHour: limit(26, 3), sevenDay: limit(41, 67) }).rows.map(r => r.key)).toEqual(['cache', 'spend', 'context', '5h', '7d'])
})
test('a warm cache departs at its cold-at clock; the countdown is measured, so no ~', () => {
  const r = row({ cache: cacheAt({ requests: 1, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')
  expect([r?.status, r?.time, r?.cell, r?.cellShort, r?.tone]).toEqual(['DEPARTS', '00:38', 'DEPARTS 00:38', '00:38', 'calm'])
  expect(r?.remarks).toMatch(/^IN 38 MIN · RE-WARM ~\$\d/)
  expect(r?.alt).not.toMatch(/[A-Z]{2,}|↻/)
})
test('an hour out, the countdown is IN 1H 04M', () => {
  expect(row({ zone: undefined, cache: cacheAt({ requests: 1, msLeft: 64 * MIN, coldAt: 64 * MIN }) }, 'cache')?.time).toBe('IN 1H 04M')
})
test('a calm last call names its clock; the last minute is amber seconds', () => {
  const calm = row({ cache: cacheAt({ requests: 1, ttl: '1h', msLeft: 5 * MIN, coldAt: 5 * MIN }) }, 'cache')
  expect([calm?.cell, calm?.tone]).toEqual(['LAST CALL 00:05', 'calm'])
  const amber = row({ cache: cacheAt({ requests: 1, msLeft: 47_000, coldAt: 47_000 }) }, 'cache')
  expect([amber?.cell, amber?.cellShort, amber?.tone]).toEqual(['LAST CALL 47S', '! 47S', 'amber'])
})
test('cold has departed: at its time when known, without it when not', () => {
  expect(row({ now: HOUR, cache: cacheAt({ requests: 1, msLeft: 0, coldAt: 10 * MIN }) }, 'cache')?.cell).toMatch(/^DEPARTED 00:10 · RE-WARM ~\$/)
  expect(row({ cache: cacheAt({ requests: 1, msLeft: 0, coldAt: null }) }, 'cache')?.cell).toMatch(/^DEPARTED · RE-WARM ~\$/)
})
test('working boards; unmeasured and warming check in; recalled carries ~', () => {
  expect(row({ isWorking: true, cache: cacheAt({ requests: 1, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')?.cell).toBe('BOARDING')
  expect(row({ cache: cacheAt({ requests: 0, recalled: false, fresh: false }) }, 'cache')?.cell).toBe('CHECK-IN')
  expect(row({ cache: cacheAt({ requests: 0, recalled: false, fresh: true }) }, 'cache')?.cell).toBe('CHECK-IN')
  expect(row({ cache: cacheAt({ requests: 0, recalled: true, msLeft: 38 * MIN, coldAt: 38 * MIN }) }, 'cache')?.cell).toBe('DEPARTS ~00:38')
})
test('context: USED when calm; amber says COMPACTS IN, its short form CONTEXT; never CTX', () => {
  expect(row({}, 'context')?.status).toMatch(/^\d+% USED$/)
  const near = row({ context: { ...snapOf().context, tokens: 150_000, window: 200_000, compactAt: 160_000 } }, 'context')
  expect(near?.cell).toMatch(/^! COMPACTS IN ~\d+K$/)
  expect(near?.cellShort).toMatch(/^! CONTEXT \d+%$/)
  const off = row({ context: { ...snapOf().context, tokens: 170_000, window: 200_000, compactAt: undefined } }, 'context')
  expect(off?.cell).toMatch(/^! CONTEXT \d+%$/)
  expect(`${near?.cell}${near?.cellShort}${near?.status}${off?.cell}`).not.toMatch(/CTX/)
})
test('limits: the reset stays, an amber remark replaces a calm one, cellNoReset drops only the reset', () => {
  const seven = row({ sevenDay: limit(85, 67) }, '7d')
  expect(seven?.cell).toMatch(/^85% ↻ \S+ \d\d:\d\d ! NEAR LIMIT$/)
  expect(seven?.cellNoReset).toBe('85% ! NEAR LIMIT')
  expect(seven?.tone).toBe('amber')
})
test('a 5h pace that fills says when, by clock or, with no zone, by countdown', () => {
  const pace = { fiveHour: { ...limit(20, 3), etaMs: 40 * MIN } }
  expect(row(pace, '5h')?.cell).toMatch(/! FULL ~\d\d:\d\d$/)
  expect(row({ ...pace, zone: undefined }, '5h')?.cell).toMatch(/! FULL IN ~40 MIN$/)
})
test('a passed reset says PASSED', () => {
  expect(row({ now: 4 * HOUR, fiveHour: limit(4, 3) }, '5h')?.time).toBe('PASSED')
})
test('an unknown zone: no clock anywhere on the board, and no empty time', () => {
  for (const r of board({ zone: undefined, fiveHour: limit(26, 3), sevenDay: limit(85, 67) }).rows) {
    for (const text of [r.time, r.cell, r.remarks, r.alt]) expect(text).not.toMatch(CLOCK)
    expect(r.time).not.toBe('')
    expect(`${r.cell}${r.remarks}`).not.toMatch(/undefined|NaN/)
  }
})
test('no workspace leaves the header out; a workspace heads it in capitals', () => {
  expect(board({ workspace: undefined }).header).toBeUndefined()
  expect(board({ workspace: { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } }).header).toEqual(['CLAUDE-MOD', 'MAIN', 'CLEAN'])
})
test('remarksFit cuts with an ellipsis and leaves a short one whole; padTo pads', () => {
  expect(remarksFit('IN 38 MIN · RE-WARM', 6)).toBe('IN 38…')
  expect(remarksFit('IN 38 MIN', 40)).toBe('IN 38 MIN')
  expect(padTo('5H', 4)).toBe('5H  ')
  expect(padTo('CONTEXT', 4)).toBe('CONTEXT')
})
```

  The snapshot's `fiveHour` is `LimitReading & { etaMs: number | null }` (`snapshot.ts:76`), so `etaMs` is set directly.
- [ ] **Step 2: Run** `tools/test-only.sh cache-view board workspace`. Expected: FAIL.
- [ ] **Step 3: Implement.**

  **cache.ts.** Use one function, so `coldAt` and `msLeft` never disagree:

```ts
/** When the cache goes or went cold: measured from the last reply, else
 *  recalled; null with nothing to go by, or a resume the engine called expired. */
const coldAtOf = (): number | null => {
  const measured = measuredColdAt()
  if (measured !== null) return measured
  if (state.resumedCache?.expired === true) return null
  const recalled = isRecalled() ? recalledAt() : undefined
  return recalled === undefined ? null : recalled + TTL_MS[effectiveTtl()]
}

export const msLeft = (now: number): number => {
  if (state.requests === 0 && state.resumedCache?.expired === true) return 0
  const at = coldAtOf()
  return at === null ? TTL_MS[effectiveTtl()] : Math.max(0, at - now)
}
```

  Then:
  - add `coldAt: coldAtOf(),` to `cacheView`;
  - add `coldAt: number | null` to the snapshot's cache type, documented "When the cache goes or went cold, epoch ms; null when not known";
  - add `coldAt: null` to `snapOf`'s cache.

  `tools/test-only.sh cache-view cache-model` stays green, because `msLeft`'s behaviour is unchanged.

  **workspace.ts**, beside `gitSummary`, which already says git facts in words:

```ts
/** The strip's facts as words, for a surface that draws them its own way:
 *  the folder, then the branch and whether anything changed. */
export const stripWords = (ws: Workspace): readonly string[] => {
  const { name } = splitPath(ws.path)
  const git = ws.git
  return git === undefined ? [name] : [name, git.branch ?? 'detached', git.changed ? `${git.changed} changed` : 'clean']
}
```

  **words.ts.** Add to `cacheWords`' return, and to `CacheWords` with the doc "The cache's mood for a reader, unchanged as it counts down: the heartbeat's alt":

```ts
heartAlt: f.mood === 'cold' ? 'cache cold' : f.mood === 'expiring' ? 'cache in its last minute' : f.mood === 'unmeasured' ? 'cache not measured yet' : f.mood === 'warming' ? 'cache warming' : 'cache warm',
```

  **words.ts**, the board. Each form is built from facts with `format.ts`, then upper-cased once, at the end. No formatted text is post-processed:

```ts
// ---- the departures board ----------------------------------------------------

const NONE = '-'
/** A measured span on the board: `47S`, `38 MIN`, `1H 04M`. Never `38M`. */
const boardSpan = (ms: number): string =>
  ms < MINUTE_MS ? `${secondsLeft(ms)}S` : ms < HOUR_MS ? `${minutesLeft(ms)} MIN` : fmtCountdown(ms)
/** A projection on the board: `~40 MIN`, `~1H 15M`. */
const boardEta = (ms: number): string => (etaMinutes(ms) < 60 ? `~${etaMinutes(ms)} MIN` : fmtEta(ms))

const cacheBoard = (r: BoardFacts): BoardRow => {
  const c = r.cache
  const zone = r.frame.zone
  const at = (cell: Omit<BoardRow, 'key' | 'item' | 'alt'>): BoardRow => ({ key: 'cache', item: 'CACHE', alt: c.alt, ...cell })
  const reWarm = `RE-WARM ${c.estimate}`
  if (c.mood === 'unmeasured' || c.mood === 'warming') return at({ status: 'CHECK-IN', time: NONE, remarks: '', cell: 'CHECK-IN', cellShort: 'CHECK-IN', tone: 'calm' })
  if (r.frame.isWorking) return at({ status: 'BOARDING', time: NONE, remarks: '', cell: 'BOARDING', cellShort: 'BOARDING', tone: 'calm' })
  const clock = r.coldAt === null || zone === undefined ? undefined : `${c.measured ? '' : '~'}${fmtClock(r.coldAt, zone)}`
  if (c.mood === 'cold')
    return at({ status: 'DEPARTED', time: clock ?? NONE, remarks: reWarm, cell: clock === undefined ? `DEPARTED · ${reWarm}` : `DEPARTED ${clock} · ${reWarm}`, cellShort: reWarm, tone: 'calm' })
  const left = c.coldInMs ?? 0
  if (c.tone === 'amber') {
    const secs = boardSpan(left)
    return at({ status: 'LAST CALL', time: secs, remarks: reWarm, cell: `LAST CALL ${secs}`, cellShort: `! ${secs}`, tone: 'amber' })
  }
  const status = c.lastCall ? 'LAST CALL' : 'DEPARTS'
  const countdown = `IN ${boardSpan(left)}`
  const time = clock ?? countdown
  return at({ status, time, remarks: `${clock === undefined ? '' : `${countdown} · `}${reWarm} IF MISSED`, cell: `${status} ${time}`, cellShort: time, tone: 'calm' })
}

const spendBoard = (r: BoardFacts): BoardRow => ({
  key: 'spend', item: 'SPEND', status: r.spend.totalText, time: NONE,
  remarks: r.spend.lastText === undefined ? '' : `LAST ${r.spend.lastText}`,
  cell: r.spend.totalText, cellShort: r.spend.totalText, tone: 'calm', alt: `spent ${r.spend.totalText} this session`,
})

const contextBoard = (r: BoardFacts): BoardRow => {
  const x = r.context
  const base = { key: 'context', item: 'CONTEXT', time: NONE, alt: x.alt } as const
  if (!x.known) return { ...base, status: 'NOT REPORTED', remarks: '', cell: 'NOT REPORTED', cellShort: 'NOT REPORTED', tone: 'calm' }
  const remarks = [x.roomText === undefined ? '' : `${x.roomText} LEFT`, x.compactsAtText ?? ''].filter(Boolean).join(' · ')
  if (x.tone === 'calm') return { ...base, status: `${x.valueText} USED`, remarks, cell: x.valueText, cellShort: x.valueText, tone: 'calm' }
  // Near compaction the board names the event; with compaction off, the fill.
  const short = `! CONTEXT ${x.valueText}`
  const long = x.toCompact === undefined ? short : `! COMPACTS IN ~${fmtTokens(x.toCompact)}`
  return { ...base, status: long, remarks, cell: long, cellShort: short, tone: 'amber' }
}

const limitBoard = (r: BoardFacts, l: LimitFacts & LimitWords): BoardRow => {
  const { zone, now } = r.frame
  const time = l.passed ? 'PASSED' : l.resetInMs === undefined ? NONE : zone === undefined ? `IN ${boardSpan(l.resetInMs)}` : fmtDayClock(now + l.resetInMs, zone, now)
  // Amber from the pace, not from crossing the warning line: say when it fills.
  const byPace = l.key === '5h' && l.tone === 'amber' && l.etaMs !== null && l.percentUsed < WARN_AT * 100
  const amber = l.tone !== 'amber' ? undefined : byPace && l.etaMs !== null ? (zone === undefined ? `! FULL IN ${boardEta(l.etaMs)}` : `! FULL ~${fmtClock(now + l.etaMs, zone)}`) : '! NEAR LIMIT'
  const calm = l.fillText ?? l.pace
  const tail = (amber ?? calm) === '' ? '' : ` ${amber ?? calm}`
  return {
    key: l.key, item: l.key === 'other' ? l.name : l.key, status: amber ?? l.valueText, time,
    remarks: amber === undefined ? calm : [l.valueText, calm].filter(Boolean).join(' · '),
    cell: `${l.valueText}${time === NONE ? '' : ` ↻ ${time}`}${tail}`, cellShort: l.valueText, cellNoReset: `${l.valueText}${tail}`,
    tone: l.tone, alt: l.alt,
  }
}

const upRow = (row: BoardRow): BoardRow => ({
  ...row, item: row.item.toUpperCase(), status: row.status.toUpperCase(), time: row.time.toUpperCase(),
  remarks: row.remarks.toUpperCase(), cell: row.cell.toUpperCase(), cellShort: row.cellShort.toUpperCase(),
  ...(row.cellNoReset === undefined ? {} : { cellNoReset: row.cellNoReset.toUpperCase() }),
})

/** The departures board: a row per reading in the one order, in the
 *  board's capitals; alts stay in words. */
export const boardWords = (r: BoardFacts): Board => {
  const of = (key: LimitKey) => r.limits.filter(l => l.key === key).map(l => limitBoard(r, l))
  return {
    header: r.workspace === undefined ? undefined : stripWords(r.workspace).map(w => w.toUpperCase()),
    rows: [cacheBoard(r), spendBoard(r), contextBoard(r), ...of('5h'), ...of('7d'), ...of('other')].map(upRow),
  }
}

export const remarksFit = (remarks: string, tiles: number): string =>
  remarks.length <= tiles ? remarks : tiles <= 1 ? '' : `${remarks.slice(0, tiles - 1)}…`

export const padTo = (text: string, n: number): string => (text.length >= n ? text : text + ' '.repeat(n - text.length))
```

  The fields this code reads are all verified in the code:
  - `CacheFacts`/`CacheWords`: `mood`, `tone`, `measured`, `lastCall`, `coldInMs`, `estimate`, `alt`.
  - `SpendWords`: `totalText`, `lastText`.
  - `ContextFacts`/`ContextWords`: `known`, `tone`, `toCompact`, `valueText`, `roomText`, `compactsAtText`, `alt`.
  - `LimitFacts`/`LimitWords`: `key`, `name`, `tone`, `percentUsed`, `etaMs`, `passed`, `resetInMs`, `valueText`, `fillText`, `pace`, `alt`.

  `WARN_AT`, `MINUTE_MS`, `HOUR_MS`, `fmtClock`, `fmtDayClock`, `fmtCountdown`, `fmtEta` and `fmtTokens` come from format.ts, alongside the three newly exported helpers.

  **reading.ts.**
  - Hoist the `cache`, `spend` and `context` spreads (lines 435-437) into consts: `cacheRead`, `spendRead` and `contextRead`.
  - Add `let board: Board | undefined`.
  - Add the getter `get board() { return (board ??= boardWords({ frame, cache: cacheRead, spend: spendRead, context: contextRead, limits, workspace: snap.workspace, coldAt: c.coldAt })) }`.
  - Add `board: Board` to `Readings`, with its doc comment.
- [ ] **Step 4: Run** `tools/test-only.sh cache-view cache-model board workspace readings golden-hash`. Expected: PASS. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat: the departures board's words, from the readings, with the cache's cold-at time"
```

---

### Task 5: Chart primitives

**Files:**
- Modify: `hooks/charts.tsx` (`barChart` gains `shape`, `sparkline` gains `nowAt` and `level`, and a new `heartbeat` and `MOTION`)
- Create: `hooks/flaps.tsx`
- Test: `tests/charts.test.ts`, `tests/flaps.test.ts` (new)

**Consumes:** Task 0's decision A, and Task 1's fixed primitives.

**Produces:**
- **`barChart(kit, { …, shape?: 'bars' | 'beats' })`.** `'beats'` draws one ECG path, with a marked value capped flat across its peak. The text form is unchanged.
- **`sparkline(kit, { …, nowAt?: number; level?: number })`.**
  - Points after `nowAt` are drawn dashed, and a label-ink rule marks now.
  - `level` is a dashed rule across the chart, as a fraction of the scale's top.
  - `nowAt` and `projectTo` exclude each other.
- **`MOTION: boolean`**, set from decision A.
- **`heartbeat(kit, { key, alt, state: 'still' | 'beat' | 'flat' | 'hollow', color }): RenderChildren`.** A 12 px Svg on the desktop, `null` elsewhere. A `beat` animates only when `MOTION` is true.
- **`flaps(kit, { key, alt, runs: readonly (readonly [text: string, ink: string])[], bg, seam }): RenderChildren`.**
  - Desktop: one Svg, 20 px tall. Each character sits on its own tile with a seam, runs are a blank tile apart, and every tile, a space included, carries its `<text>`.
  - Filled terminal: a Box of one `Text` per run on `bg`.
  - Plain: a Box of one `Text` per run as `[RUN]`, with no ground.
- **`flapsWidth(runs): number`.**

- [ ] **Step 1: Write the failing tests.**

  `tests/flaps.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'
import { flaps, flapsWidth } from '../hooks/flaps'
import { makeKit } from '../hooks/kit'
import { PLAIN } from '../hooks/palette'
import { fakeEl, shown, svgsOf, type Node } from './helpers'
import { snapOf } from './matrix'

const RUNS = [['CACHE', '#7FCF8A'], ['LAST CALL 47S', '#F5B14C']] as const
const draw = (surface: 'desktop' | 'terminal', plain = false) =>
  flaps(makeKit(fakeEl, snapOf({ surface, ...(plain ? { palette: PLAIN } : {}) })), { key: 'f', alt: 'cache in its last minute', runs: RUNS, bg: '#262626', seam: '#0E0E0E' })

test('desktop: one Svg, a tile and a seam per character and blank, monospace, no id', () => {
  const svgs = svgsOf(draw('desktop'))
  expect(svgs).toHaveLength(1)
  const src = String(svgs[0]?.props?.source)
  expect(src.match(/class="tile"/g)).toHaveLength('CACHE'.length + 1 + 'LAST CALL 47S'.length)
  expect(src.match(/class="seam"/g)?.length).toBe(src.match(/class="tile"/g)?.length)
  expect(src).toMatch(/ui-monospace, monospace/)
  expect(src).not.toMatch(/\bid=|preserveAspectRatio="none"/)
  expect(svgs[0]?.props?.width).toBe(flapsWidth(RUNS))
  expect(Number(svgs[0]?.props?.height)).toBeLessThanOrEqual(20)
})
test('desktop: every tile carries its text, spaces too, so the words read whole', () => {
  const src = String(svgsOf(draw('desktop'))[0]?.props?.source)
  expect([...src.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('')).toBe('CACHE LAST CALL 47S')
})
test('terminal: a Text per run on its ground; plain: bracketed, no ground', () => {
  const runs = (n: unknown) => ((n as Node).children as Node[]).map(k => [shown(k), k.props?.backgroundColor])
  expect(runs(draw('terminal'))).toEqual([['CACHE', '#262626'], ['LAST CALL 47S', '#262626']])
  expect(runs(draw('terminal', true))).toEqual([['[CACHE]', undefined], ['[LAST CALL 47S]', undefined]])
})
test('flap text is escaped', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  const src = String(svgsOf(flaps(k, { key: 'f', alt: 'a', runs: [['<&>', '#fff']], bg: '#222', seam: '#000' }))[0]?.props?.source)
  expect(src).toMatch(/&lt;[\s\S]*&amp;[\s\S]*&gt;/)
})
```

  `tests/charts.test.ts`. Add `MOTION` and `heartbeat` to its `../hooks/charts` import:

```ts
const desk = () => makeKit(fakeEl, snapOf({ surface: 'desktop' }))
test('beats: one path; no NaN with one value, all re-warms, or all zero', () => {
  for (const [values, marked] of [[[0.2], [false]], [[0.8, 0.9], [true, true]], [[0, 0], [false, false]]] as const) {
    const src = String(svgsOf(barChart(desk(), { key: 'b', alt: 'a', values, marked, color: '#fff', markColor: '#fff', px: 84, height: 20, shape: 'beats' }))[0]?.props?.source)
    expect(src).toMatch(/<path class="beats"/)
    expect(src).not.toMatch(/NaN|Infinity/)
  }
})
test('beats: a re-warm is capped flat, a warm beat peaks to a point', () => {
  const tops = (marked: boolean) => {
    const d = String(svgsOf(barChart(desk(), { key: 'b', alt: 'a', values: [0.5], marked: [marked], color: '#fff', markColor: '#fff', px: 20, height: 20, max: 1, shape: 'beats' }))[0]?.props?.source).match(/ d="([^"]+)"/)?.[1] ?? ''
    const ys = [...d.matchAll(/L([\d.]+),([\d.]+)/g)].map(m => Number(m[2]))
    return ys.filter(y => y === Math.min(...ys)).length
  }
  expect(tops(true)).toBe(2)
  expect(tops(false)).toBe(1)
})
test('sparkline: nowAt draws a now rule and the points after it dashed; level, a dashed rule', () => {
  const src = String(svgsOf(sparkline(desk(), { key: 's', alt: 'a', values: [1, 2, 3, 4, 5], color: '#fff', px: 60, height: 16, max: 10, nowAt: 2, level: 0.8 }))[0]?.props?.source)
  expect(src).toMatch(/class="now"/)
  expect(src).toMatch(/class="ahead"[^>]*stroke-dasharray/)
  expect(src).toMatch(/class="level"[^>]*stroke-dasharray/)
})
test('heartbeat per state; a beat moves only where motion ships', () => {
  const of = (state: 'still' | 'beat' | 'flat' | 'hollow') => svgsOf(heartbeat(desk(), { key: 'h', alt: 'cache warm', state, color: '#F5B14C' }))[0]
  expect(String(of('flat')?.props?.source)).toMatch(/<line/)
  expect(String(of('hollow')?.props?.source)).toMatch(/fill="none"/)
  expect(String(of('still')?.props?.source)).not.toMatch(/animation|<style/)
  expect(of('beat')?.props?.isInteractive).toBe(MOTION ? true : undefined)
  expect(heartbeat(makeKit(fakeEl, snapOf({ surface: 'terminal' })), { key: 'h', alt: 'a', state: 'beat', color: '#fff' })).toBeNull()
})
```

  If decision A is "motion ships", add `expect(String(of('beat')?.props?.source)).toMatch(/prefers-reduced-motion:reduce/)`.
- [ ] **Step 2: Run** `tools/test-only.sh flaps charts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `charts.tsx`:

```tsx
/** Whether the heartbeat moves: the spike's answer (spec §4.1). */
export const MOTION: boolean = false
```

  Set `MOTION` from decision A. If the answer is still, also leave out `BEAT_STYLE` and the `moves` branch below, so no code is dead.

  In `barChart`, add `shape?: 'bars' | 'beats'` to its options, and put this before the bars are built:

```tsx
if (o.shape === 'beats') {
  const step = px / Math.max(1, values.length)
  const base = height - 4
  const d = values.map((v, i) => {
    const x0 = tenth(i * step), peak = tenth(x0 + step * 0.45), dip = tenth(x0 + step * 0.6), x1 = tenth(x0 + step)
    const capped = marked[i] === true
    const top = capped ? CAP_ROOM : y(v)
    // A re-warm is capped flat across its peak: its shape says what it is.
    const crest = capped ? `L${tenth(peak - 1.5)},${top}L${tenth(peak + 1.5)},${top}` : `L${peak},${top}`
    return `${i === 0 ? 'M' : 'L'}${x0},${base}${crest}L${dip},${Math.min(height - 1, base + 3)}L${x1},${base}`
  }).join('')
  const rule = level === undefined ? '' : `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1" stroke-dasharray="1 2"/>`
  const beats = `<path class="beats" d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`
  return <Svg key={key} source={svgOf(px, height, rule + beats)} alt={alt} width={px} height={height} />
}
```

  The degenerate cases are already safe: `y()` returns `height - 1` when `top <= 0`, and `step` never divides by zero.

  In `sparkline`, add two documented options:
  - `nowAt?: number`, "Now's index: the points after it are drawn dashed, as a projection; it excludes `projectTo`".
  - `level?: number`, "A line to read against, as a fraction of the scale's top, such as compaction".

  When `nowAt` is set:
  - draw `points.slice(0, nowAt + 1)` as the solid polyline;
  - draw `points.slice(nowAt)` as `<polyline class="ahead" … ${PROJECTION_DASH}/>`;
  - add `<line class="now" x1="${x(nowAt)}" y1="0" x2="${x(nowAt)}" y2="${height}" stroke="${palette.label}" stroke-width="1"/>`.

  When `level` is set, add `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1" ${PROJECTION_DASH}/>`.

  `heartbeat`:

```tsx
const BEAT_STYLE = '<style>@keyframes b{0%,100%{r:3.5}30%{r:5.5}}circle{animation:b .6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){circle{animation:none}}</style>'

/** The cache's heartbeat: a still dot while warm, beating in its last minute
 *  where motion ships, a flat line when cold, hollow before it's measured.
 *  Its source changes only with its state, so its frame never reloads per tick. */
export const heartbeat = (kit: Kit, o: Readonly<{ key: string; alt: string; state: 'still' | 'beat' | 'flat' | 'hollow'; color: string }>): RenderChildren => {
  const { Svg, palette } = kit
  if (!Svg) return null
  const { key, alt, state, color } = o
  const body =
    state === 'flat' ? `<line x1="0" y1="6" x2="12" y2="6" stroke="${palette.label}" stroke-width="1.4" stroke-linecap="round"/>`
    : state === 'hollow' ? `<circle cx="6" cy="6" r="3.5" fill="none" stroke="${color}" stroke-width="1.2"/>`
    : `<circle cx="6" cy="6" r="3.5" fill="${color}"/>`
  const moves = state === 'beat' && MOTION
  return <Svg key={key} source={svgOf(12, 12, (moves ? BEAT_STYLE : '') + body)} alt={alt} width={12} height={12} {...(moves ? { isInteractive: true } : {})} />
}
```

  `hooks/flaps.tsx`:

```tsx
// The split-flap board's tiles: each character on its own tile with a seam
// across its middle, in a monospace face, on the desktop; a run of text on
// its ground in a terminal; bracketed in plain. Pixel geometry lives here,
// outside views/, which the gate keeps free of it.

import type { RenderChildren } from 'claude-code'
import type { Kit } from './kit'

type Run = readonly [text: string, ink: string]
const TILE_PX = 10
const TILE_GAP = 1
const FLAP_PX = 20
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The runs as tiles: each run's characters, a blank tile between runs. */
const tilesOf = (runs: readonly Run[]): Array<readonly [string, string]> =>
  runs.flatMap(([text, ink], i) => [...(i === 0 ? [] : [[' ', ink] as const]), ...[...text].map(ch => [ch, ink] as const)])

export const flapsWidth = (runs: readonly Run[]): number => tilesOf(runs).length * (TILE_PX + TILE_GAP) - TILE_GAP

export const flaps = (kit: Kit, o: Readonly<{ key: string; alt: string; runs: readonly Run[]; bg: string; seam: string }>): RenderChildren => {
  const { Svg, Text, Box, palette } = kit
  const { key, alt, runs, bg, seam } = o
  if (!Svg) {
    return (
      <Box key={key} flexDirection="row" columnGap={1}>
        {runs.map(([text, ink], i) =>
          palette.filled
            ? <Text key={String(i)} color={ink} backgroundColor={bg}>{text}</Text>
            : <Text key={String(i)} color={palette.value}>{`[${text}]`}</Text>)}
      </Box>
    )
  }
  const width = flapsWidth(runs)
  const marks = tilesOf(runs).map(([ch, ink], i) => {
    const x = i * (TILE_PX + TILE_GAP)
    const glyph = `<text x="${x + TILE_PX / 2}" y="14.5" text-anchor="middle" xml:space="preserve" font-family="ui-monospace, monospace" font-size="12" font-weight="600" fill="${ink}">${escape(ch)}</text>`
    return `<rect class="tile" x="${x}" y="0" width="${TILE_PX}" height="${FLAP_PX}" rx="1.5" fill="${bg}"/>${glyph}<rect class="seam" x="${x}" y="9.5" width="${TILE_PX}" height="1" fill="${seam}"/>`
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FLAP_PX}" viewBox="0 0 ${width} ${FLAP_PX}">${marks.join('')}</svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={FLAP_PX} />
}
```

- [ ] **Step 4: Run** `tools/test-only.sh flaps charts golden-hash`. Expected: PASS, with chips unchanged because `shape` defaults to `'bars'`. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat: beats, a now mark, the heartbeat and split-flap tiles for the new layouts"
```

---

### Task 6: The board's palette

**Files:**
- Modify: `hooks/palette.ts` (the `Palette` type, `DARK`, `LIGHT` and `PLAIN`)
- Test: `tests/design.test.ts`

**Produces:** the palette keys `boardBg`, `flapBg`, `flapSeam`, `flapItemCache`, `flapItemSpend`, `flapItemContext`, `flapItem5h`, `flapItem7d`, `flapText`, `flapDim` and `flapAmber`.

- [ ] **Step 1: Write the failing test** in `tests/design.test.ts`, with its existing `contrast` helper:

```ts
const BOARD_INKS = ['flapItemCache', 'flapItemSpend', 'flapItemContext', 'flapItem5h', 'flapItem7d', 'flapText', 'flapDim', 'flapAmber'] as const
test('the board is dark in dark and light alike, and every ink reads on its tiles', () => {
  for (const p of [DARK, LIGHT]) for (const ink of BOARD_INKS) expect(contrast(p[ink], p.flapBg)).toBeGreaterThanOrEqual(4.5)
  for (const k of ['boardBg', 'flapBg', 'flapSeam', ...BOARD_INKS] as const) expect(LIGHT[k]).toBe(DARK[k])
  // The seam is decoration (spec §5.1): it differs from the tile, with no contrast target.
  expect(DARK.flapSeam).not.toBe(DARK.flapBg)
  expect(DARK.flapItem5h).toBe(DARK.fiveAccent)
  expect(DARK.flapItem7d).toBe(DARK.weekAccent)
})
```

- [ ] **Step 2: Run** `tools/test-only.sh design`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the 11 keys to the type, each with a one-line doc. DARK and LIGHT get these values; measured on `#262626`, the inks give 7.0 to 13.1:

```ts
boardBg: '#141414', flapBg: '#262626', flapSeam: '#0E0E0E',
flapItemCache: '#7FD48A', flapItemSpend: '#E8C25A', flapItemContext: '#9DB4D0',
flapItem5h: '#7fcf8a', flapItem7d: '#a99cf0',
flapText: '#F2EEE3', flapDim: '#B9B4A8', flapAmber: '#F5B14C',
```

  `#7fcf8a` and `#a99cf0` are DARK's `fiveAccent` and `weekAccent`. In PLAIN, every ink key maps to its `value`, and `boardBg`, `flapBg` and `flapSeam` map to its `surface`. Plain's flaps paint no ground (Task 5), so plain's ground values are never drawn.
- [ ] **Step 4: Run** `tools/test-only.sh design golden-hash`. Expected: PASS. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat: the departures board's palette, dark in every appearance but plain"
```

---

### Task 7: Rebuild departures

**Files:**
- Rewrite: `hooks/views/departures.tsx` (the collapsed row and the view)
- Create: `hooks/views/departures-board.tsx` (the open board)
- Modify:
  - `tests/helpers.ts` (`flapWords`)
  - `tests/cases.ts` (`CaseOptions.usage`, and export `withLimits`)
  - `tests/matrix.ts` (the board's words, the keyed order check and the alt rule)
  - `tools/views-gate.sh` (the look check)
  - `hooks/words.ts` (delete the words only the old departures read)
- Rewrite: `tests/view-departures.test.ts`
- Test: `tests/matrix.test.ts`

**Consumes:** `read.board` (Task 4); `flaps` and `flapsWidth` (Task 5); the board palette (Task 6); `footer`, `toggleButton` and `bodyRowsFor` (Task 2).

**Produces:** `departuresView: View`, with rows `{ desktop: 1, terminal: 1 }`. Its groups are keyed by reading. The open board's rows are keyed `row:<key>`, `row:header`, `row:headings` and `row:other:<i>`, inside `Box key="board"`.

- [ ] **Step 1: Teach the harness, test first.** In `tests/matrix.test.ts`:

```ts
test('the order check catches 7d before the cache', () => {
  const box = (key: string): Node => ({ type: 'Box', props: { key }, children: [] }) as Node
  const tree = { type: 'Box', props: { flexDirection: 'row' }, children: [box('7d'), box('cache')] } as Node
  expect(orderErrors(tree, { has7d: true })).toEqual(['order: 7d before cache'])
})
test('flapWords reads a flap Svg with its spaces', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  expect(flapWords(flaps(k, { key: 'f', alt: 'a', runs: [['CACHE', '#fff'], ['LAST CALL 47S', '#fff']], bg: '#222', seam: '#000' }))).toBe('CACHE LAST CALL 47S')
})
```

  Then make them pass:
  - **`helpers.ts`.** Add `flapWords(n): string`. For each Svg, join the contents of its `<text>` runs. Join the Svgs with a space.
  - **`matrix.ts`.**
    - Export `orderErrors(row, { has7d })`. It collects, in document order, the Box keys on the collapsed row that are among `cache`, `spend`, `context`, `5h` and `7d`. It reports `order: <a> before <b>` when they are not an ordered subsequence of that list, `order: no cache` when `cache` is missing, and `order: no 7d` when `has7d` and `7d` is missing.
    - In `invariantErrors`, run `orderErrors` for pulse and departures only.
    - Check words against `shown(tree) + ' ' + flapWords(tree)` everywhere words are checked today: amber, NaN, glyphs and `~`.
    - For departures, no Svg alt may match `/↻|\b[A-Z]{2,}\b/` once `5h` and `7d` are removed from it.
    - Narrow `clipsByDesign` to `layout === 'chips'`.
  - **`AMBER_WORDS`.** Add the board's forms. Each one names its reading:

```ts
cacheLastMinute: /…existing…|CACHE LAST CALL \d+S|CACHE ! \d+S/,
nearCompaction: /…existing…|CONTEXT ! (COMPACTS IN ~\d+K|CONTEXT \d+%)/,
contextNoCompaction: /…existing…|CONTEXT ! CONTEXT \d+%/,
limit80: /…existing…|5H \d+%[^!]*! (NEAR LIMIT|FULL ~\d\d:\d\d|FULL IN ~)/,
fiveHourAhead: /…existing…|5H \d+%[^!]*! FULL (~\d\d:\d\d|IN ~)/,
```

  - **`cases.ts`.** Add `usage?: SessionUsage` to `CaseOptions`, and use `o.usage ?? s.usage` in `drawCases`. Golden passes no `usage`, so it is unchanged. Export `withLimits`.
  - **`tools/views-gate.sh`.** Append:

```bash
if grep -nE "from '\./(cards|chips)'|[pP]ill\(|[bB]attery|meter\(" "$ROOT"/plugins/session-usage-band/hooks/views/{pulse,pulse-open,departures,departures-board}.tsx 2>/dev/null; then
  echo "views-gate: pulse and departures draw their own look (see above)" >&2
  exit 1
fi
```

- [ ] **Step 2: Write the failing view tests** in `tests/view-departures.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'
import { drawBand } from '../hooks/band'
import { fixedZone } from '../hooks/format'
import { ROW_SLACK, TERMINAL, cellsOf } from '../hooks/layout'
import { DARK, LIGHT, PLAIN } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'
import { USAGE, drawCases, withLimits } from './cases'
import { HOUR, byKey, fakeEl, firstRow, flapWords, shown, svgsOf, type Node } from './helpers'
import { NO_ACT, snapOf, viewSuite, visualRows } from './matrix'

viewSuite('departures')

const at = (pct: number, h: number) => ({ percentUsed: pct, resetsAt: new Date(h * HOUR).toISOString() })
const LIMITS = { fiveHour: { ...at(26, 3), etaMs: null }, sevenDay: at(85, 67) }
const WS = { path: '/u/claude-mod', git: { branch: 'main', changed: 0 } } as BandSnapshot['workspace']
const OTHER = [{ kind: 'spend_limit', ...at(40, 5) }] as BandSnapshot['otherLimits']
const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, maxRows: 13, zone: fixedZone(0), ...LIMITS, ...over }), NO_ACT) as unknown as Node
const words = (n: unknown) => `${shown(n)} ${flapWords(n)}`
const toggleOf = (row: Node) => byKey(row.children?.at(-1), 'more', 'Button')?.props?.label

test('collapsed: one row, a group per reading in the one order, then ▵', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = firstRow(band({ surface })) as Node
    expect(['cache', 'spend', 'context', '5h', '7d'].map(k => byKey(row, k, 'Box') !== undefined)).toEqual([true, true, true, true, true])
    expect(toggleOf(row)).toBe('▵')
    expect(visualRows(row, surface)).toBe(1)
  }
})
test('desktop: one flap Svg per reading, each at most 20 px tall, its alt in words', () => {
  const svgs = svgsOf(firstRow(band({ surface: 'desktop' })))
  expect(svgs).toHaveLength(5)
  for (const s of svgs) {
    expect(Number(s.props?.height)).toBeLessThanOrEqual(20)
    expect(String(s.props?.alt).replace(/5h|7d/g, '')).not.toMatch(/↻|\b[A-Z]{2,}\b/)
  }
})
test('at 40 columns, cache in its last minute and 7d at 82%: CACHE and 7D stay, and the row fits', async ($, on) => {
  const drawn = await drawCases($, on, { scenario: 'lastMinute', appearance: 'dark', layout: 'departures', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [{ surface: 'terminal', cols: 40 }])
  const row = firstRow(Object.values(drawn)[0]) as Node
  expect(words(row)).toMatch(/CACHE[\s\S]*7D/)
  expect(cellsOf(row, TERMINAL)).toBeLessThanOrEqual(40 - ROW_SLACK)
  expect(toggleOf(row)).toBe('▵')
})
test('at 40 columns calm: CACHE and 7D only', () => {
  const row = firstRow(band({ surface: 'terminal', columns: 40, sevenDay: at(41, 67) })) as Node
  expect(['spend', 'context', '5h'].map(k => byKey(row, k, 'Box'))).toEqual([undefined, undefined, undefined])
  expect(words(row)).toMatch(/CACHE[\s\S]*7D 41%/)
})
test('an unknown zone: no clock time on the row or the board', () => {
  for (const expanded of [false, true]) expect(words(band({ surface: 'terminal', zone: undefined, expanded }))).not.toMatch(/\d\d:\d\d/)
})
test('open: the workspace header, ITEM STATUS TIME REMARKS, the rows in order, the footer off the board', () => {
  const open = band({ surface: 'terminal', expanded: true, workspace: WS })
  const text = words(open)
  expect(text).toMatch(/CLAUDE-MOD\s*MAIN\s*CLEAN/)
  expect(text).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  expect(text).toMatch(/CACHE[\s\S]*SPEND[\s\S]*CONTEXT[\s\S]*5H[\s\S]*7D/)
  expect(byKey(byKey(open, 'board', 'Box'), 'collapse', 'Button')).toBeUndefined()
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
})
test('the board has its dark ground in dark and light, none in plain', () => {
  for (const [palette, ground] of [[DARK, DARK.boardBg], [LIGHT, LIGHT.boardBg], [PLAIN, undefined]] as const)
    expect(byKey(band({ surface: 'terminal', expanded: true, palette }), 'board', 'Box')?.props?.backgroundColor).toBe(ground)
})
test('open at 13 rows with an other limit: the band takes all 13', () => {
  expect(visualRows(band({ surface: 'desktop', expanded: true, workspace: WS, otherLimits: OTHER }), 'desktop')).toBe(13)
})
test('open: as rows run out, the board gives way in the spec order and the footer stays', () => {
  const ORDER = ['row:other:0', 'row:headings', 'row:spend', 'row:context', 'row:header', 'row:5h']
  let gone = 0
  for (let rows = 13; rows >= 4; rows--) {
    const open = band({ surface: 'terminal', expanded: true, maxRows: rows, workspace: WS, otherLimits: OTHER })
    expect(byKey(open, 'collapse', 'Button')).toBeDefined()
    expect(visualRows(open, 'terminal')).toBeLessThanOrEqual(rows)
    const present = ORDER.map(k => byKey(byKey(open, 'board', 'Box'), k, 'Box') !== undefined)
    const first = present.indexOf(true)
    gone = Math.max(gone, first === -1 ? ORDER.length : first)
    expect(present.slice(gone).every(Boolean) || present.every(p => !p)).toBe(true)
  }
})
```

- [ ] **Step 3: Run** `tools/test-only.sh view-departures matrix`. Expected: FAIL.
- [ ] **Step 4: Implement `departures.tsx`:**

```tsx
// Departures, the split-flap board: each reading a line of the board, in the
// one order. Collapsed, each reading's ITEM and cell as one group of tiles;
// open, the board itself (departures-board.tsx). The words are the board's
// (words.ts boardWords); this file only lays tiles.

import type { RenderElement } from 'claude-code'
import { flaps } from '../flaps'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Palette } from '../palette'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import type { BoardKey, BoardRow } from '../words'
import { openBoard } from './departures-board'
import { toggleButton } from './frame'
import { fitLine, line } from './parts'
import type { View } from './view'

/** Each reading's ITEM ink: its own, as an airline's code has its colour. */
export const ITEM_INK: Readonly<Record<BoardKey, keyof Palette>> = {
  cache: 'flapItemCache', spend: 'flapItemSpend', context: 'flapItemContext', '5h': 'flapItem5h', '7d': 'flapItem7d', other: 'flapText',
}

/** What gives way as the row narrows, first to last (spec §5.2). Amber
 *  never does; CACHE and 7D never go. */
const ORDER = ['reset5h', 'reset7d', 'spend', 'context', 'remark5h', 'long'] as const
type Piece = (typeof ORDER)[number]

/** A reading as one group of tiles: its ITEM, then its cell. */
const group = (kit: Kit, row: BoardRow, cell: string): RenderElement => {
  const { Box, palette } = kit
  const ink = row.tone === 'amber' ? palette.flapAmber : palette.flapText
  return (
    <Box key={row.key} flexShrink={0}>
      {flaps(kit, { key: 'flaps', alt: row.alt, runs: [[row.item, String(palette[ITEM_INK[row.key]])], [cell, ink]], bg: palette.flapBg, seam: palette.flapSeam })}
    </Box>
  )
}

/** A row's cell as the squeeze keeps it, chosen among its forms, never cut. */
const cellOf = (row: BoardRow, has: (p: Piece) => boolean): string => {
  const noReset = row.cellNoReset ?? row.cell
  if (row.key === '5h') return has('reset5h') ? row.cell : has('remark5h') || row.tone === 'amber' ? noReset : row.cellShort
  if (row.key === '7d') return has('reset7d') ? row.cell : has('long') || row.tone === 'amber' ? noReset : row.cellShort
  return has('long') || row.tone === 'amber' ? row.cell : row.cellShort
}

/** Whether a reading keeps its group at a squeeze. */
const keeps = (row: BoardRow, has: (p: Piece) => boolean): boolean =>
  row.key === 'other' ? false
  : row.tone === 'amber' ? true
  : row.key === 'spend' ? has('spend')
  : row.key === 'context' ? has('context')
  : true

const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, kit.columns - ROW_SLACK, k =>
    line(kit, 'row', read.board.rows.filter(r => keeps(r, k.has)).map(r => group(kit, r, cellOf(r, k.has))), toggleButton(kit, read, act)))

export const departuresView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { Box } = kit
    return (
      <Box flexDirection="column">
        {collapsed(kit, read, act)}
        {read.frame.expanded ? openBoard(kit, read, act) : null}
      </Box>
    )
  },
}
```

  `departures-board.tsx` exports `openBoard(kit, read, act): RenderElement[]`, which returns `[board, footer(kit, act)]`.
  - **Columns.** ITEM, STATUS and TIME are each as wide as their longest text among the rows shown, plus one. REMARKS takes what is left. The view does no arithmetic: this task adds two helpers, each test-first.
    - In words.ts, `boardColumns(rows: readonly BoardRow[], room: number): Readonly<{ item: number; status: number; time: number; remarks: number }>`. Its test is `boardColumns([{ item: 'CACHE', status: 'DEPARTS', time: '17:24', … }, { item: '5H', status: '26%', time: 'SAT 13:30', … }], 60)` → `{ item: 6, status: 8, time: 10, remarks: 36 }`.
    - In flaps.tsx, `boardRoom(kit: Kit): number`, the columns the board's rows can hold: `(columns − ROW_SLACK − 2) × 10 / 11` tiles on the desktop, where a tile's pitch is 11 px against the 10 px column; in a terminal, `columns − ROW_SLACK − 2` cells. Test both surfaces at 120 columns.
    - The remarks are `remarksFit(row.remarks, cols.remarks)`.
  - **TIME folded into REMARKS.** When `cols.remarks < 8`, the row passes `remarksFit(`${row.time} · ${row.remarks}`, …)` and TIME is `-`.
  - **Rows.** Each row is a `Box` keyed `row:<key>` holding one `flaps` group, whose runs are `[padTo(item, c0), padTo(status, c1), padTo(time, c2), remarks]`. The other limits are keyed `row:other:<i>`.
  - **Header and headings.** `row:header` is one run, `read.board.header.join('   ')`, in `flapDim`, and is left out when `header` is undefined. `row:headings` is `ITEM STATUS TIME REMARKS`, padded the same way, in `flapDim`.
  - **Give-way.** The body takes `bodyRowsFor(read.frame.maxRows, 1, 0)` rows, since the header stands in for the strip. Rows give way in S§5.3's order: other, headings, spend, context, header, 5h, then the whole board.
  - **The board itself.** `<Box key="board" flexDirection="column" marginTop={1} paddingX={1} backgroundColor={palette.filled ? palette.boardBg : undefined}>`. `footer(kit, act)` sits outside it.
- [ ] **Step 5: Delete the words only the old departures read.** Run `tsc`. Delete `DEPARTURES`, `departsDot`, `departs`, `alike`, the `departure`, `departureLens`, `departureHead` and `departureReset` fields, and `usedSoFar`, wherever tsc now shows no reader. Delete the tests that pinned them.
- [ ] **Step 6: Run** `tools/test-only.sh view-departures board flaps matrix golden-hash`, then `tools/views-gate.sh`. Expected: PASS, and the gate prints nothing. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band tools/views-gate.sh
git commit -m "feat: departures is a split-flap board, collapsed and open"
```

---

### Task 8: Pulse's figures, from the readings

**Files:**
- Modify: `hooks/words.ts` (`HistoryWords.avgText`, `WeekWords.windowAlt`)
- Modify: `hooks/reading.ts` (`HistoryReading.beatsTop`, `WeekReading.fiveHourWindow`)
- Modify: `tests/helpers.ts` (move `SAMPLES` here from `tests/view-pulse.test.ts:25` and import it there)
- Test: `tests/readings.test.ts`

**Produces:**
- `HistoryWords.avgText: string | undefined`, for example `'avg ~$0.02'`.
- `HistoryReading.beatsTop: number`. It is `max(2 × warmAvgUsd, the largest warm cost)`; with no warm cost, the largest cost; with no cost, or every cost 0, it is 1. It is never 0.
- `WeekReading.fiveHourWindow: Readonly<{ values: readonly number[]; nowAt: number | undefined }>`. These are the 5h window's cumulative percents per hour slice, from `hourRow`. `values` is empty when no slice is measured.
- `WeekWords.windowAlt: string`, for example `'5h window from start to reset, 26% used, on pace for about 33%'`, or `''` with no 5h window.
- The existing `WeekWords.daysAlt` (`words.ts:736,800`) is reused unchanged.

- [ ] **Step 1: Write the failing tests** in `tests/readings.test.ts`:

```ts
const costs = (list: Array<[number, boolean]>) => readingsOf(snapOf({ history: { costs: list.map(([usd, reWarm]) => ({ usd, reWarm })), context: [], fiveHour: [] } })).history
const FIVE = { percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null }

test('avgText is the warm average, as an estimate; none before a cost', () => {
  expect(costs([[0.02, false], [0.9, true], [0.02, false]]).avgText).toBe('avg ~$0.02')
  expect(costs([]).avgText).toBeUndefined()
})
test('beatsTop is never 0 and leaves re-warms out', () => {
  expect(costs([]).beatsTop).toBe(1)
  expect(costs([[0, false], [0, false]]).beatsTop).toBe(1)
  expect(costs([[0.02, false], [0.9, true]]).beatsTop).toBe(0.04)
  expect(costs([[0.9, true]]).beatsTop).toBe(0.9)
})
test('fiveHourWindow climbs slice by slice and marks now', () => {
  const w = readingsOf(snapOf({ samples: SAMPLES, zone: fixedZone(0), fiveHour: FIVE })).week.fiveHourWindow
  expect(w.values.length).toBe(5)
  expect(w.nowAt).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < w.values.length; i++) expect(w.values[i]).toBeGreaterThanOrEqual(w.values[i - 1] ?? 0)
})
test('fiveHourWindow is empty with no 5h window, or no slice measured', () => {
  expect(readingsOf(snapOf({ samples: [], fiveHour: undefined })).week.fiveHourWindow.values).toEqual([])
  expect(readingsOf(snapOf({ samples: [], zone: fixedZone(0), fiveHour: FIVE })).week.fiveHourWindow.values).toEqual([])
})
test('windowAlt speaks the whole window, not the last hour', () => {
  expect(readingsOf(snapOf({ samples: SAMPLES, zone: fixedZone(0), fiveHour: FIVE })).week.windowAlt).toMatch(/^5h window from start to reset, 4% used/)
})
```

- [ ] **Step 2: Run** `tools/test-only.sh readings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **words.ts.**
    - In `historyWords`: `avgText: avg === undefined ? undefined : `avg ${fmtEstimate(avg)}``.
    - In `weekWords`, add `windowAlt`. Build it from the 5h `LimitView`'s `valueText`, and from `projectedPct` spoken as `on pace for about ${Math.round(projectedPct)}%`. Don't use `paceText`, which says `~`.
    - Document both fields in their types.
  - **reading.ts.**
    - In `historyFacts`, compute `beatsTop` as its interface says.
    - In `weekFacts`, compute `fiveHourWindow` from `hourRow`:
      - walk `hourRow.marks`, keeping a running total of `pct`;
      - `values` is the totals when any mark is `measured`, otherwise `[]`;
      - `nowAt` is `undefined` when `hourRow.notch` is undefined, otherwise `Math.floor(hourRow.notch)`.
- [ ] **Step 4: Run** `tools/test-only.sh readings insights golden-hash`. Expected: PASS. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat: pulse's average, scale and 5h window, from the readings"
```

---

### Task 9: Rebuild pulse

**Files:**
- Rewrite: `hooks/views/pulse.tsx` (the collapsed row and the view)
- Create: `hooks/views/pulse-open.tsx` (the open stack)
- Rewrite: `tests/view-pulse.test.ts` (keep its `COSTS`, `FIVE_HOUR` and `HISTORY` fixtures; `SAMPLES` now comes from helpers)
- Modify: `tests/charts.test.ts` (drop the `skip` on Task 1's stretch test, if it has one)

**Consumes:**
- Task 5: `barChart` with `shape: 'beats'`, `sparkline` with `nowAt` and `level`, `dayCells`, `heartbeat`.
- Task 4: `cache.heartAlt`.
- Task 8: `history.avgText`, `history.beatsTop`, `week.fiveHourWindow` and `week.windowAlt`. Also the existing `week.days` and `week.daysAlt`.
- Task 2: `footer`, `footerRoom`, `toggleButton` and `bodyRowsFor`.

**Produces:** `pulseView: View`, with rows `{ desktop: 1, terminal: 1 }`. Its groups are keyed `cache`, `spend`, `context`, `5h` and `7d`. Its open bands are keyed `band:cache`, `band:spend`, `band:context`, `band:limits` and `band:other`.

- [ ] **Step 1: Write the failing view tests** in `tests/view-pulse.test.ts`. Add `drawCases`, `withLimits` and `USAGE` from `./cases`, and `cellsOf`, `ROW_SLACK` and `TERMINAL` from `../hooks/layout`, to its imports.

```ts
viewSuite('pulse')

const CLASS = (alt: string) => (/^cache/.test(alt) ? 'cache' : /^cost of/.test(alt) ? 'cost' : /^context/.test(alt) ? 'context' : /^5h/.test(alt) ? '5h' : /^weekly/.test(alt) ? '7d' : alt)
const LIMITS = { fiveHour: { percentUsed: 26, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null }, sevenDay: { percentUsed: 41, resetsAt: new Date(67 * HOUR).toISOString() } }
const OTHER = [{ kind: 'spend_limit', percentUsed: 40, resetsAt: new Date(5 * HOUR).toISOString() }] as BandSnapshot['otherLimits']
const beatOf = (tree: unknown) => svgsOf(firstRow(tree)).find(s => /^cache/.test(String(s.props?.alt)))

test('collapsed desktop: one row; its charts in the one order', () => {
  const row = rowOf({ surface: 'desktop', ...LIMITS })
  expect(svgAlts(row).map(CLASS)).toEqual(['cache', 'cost', 'context', '5h', '7d'])
  expect(visualRows(row, 'desktop')).toBe(1)
})
test('collapsed terminal: every reading in words, in order, then ▵', () => {
  const row = rowOf({ surface: 'terminal', ...LIMITS })
  expect(shown(row)).toMatch(/cache[\s\S]*\$3\.19[\s\S]*context[\s\S]*5h[\s\S]*7d/)
  expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▵')
})
test('no chips pill or battery: no group has a ground, and no battery alt', () => {
  const row = rowOf({ surface: 'desktop', ...LIMITS })
  expect(['cache', 'spend', 'context', '5h', '7d'].map(k => byKey(row, k, 'Box')?.props?.backgroundColor)).toEqual([undefined, undefined, undefined, undefined, undefined])
  expect(svgAlts(row).some(a => /battery/.test(a))).toBe(false)
})
test('the beats: 14 wide, a path', () => {
  const beats = svgsOf(rowOf({ surface: 'desktop', ...LIMITS })).find(s => /^cost of the last 14/.test(String(s.props?.alt)))
  expect(String(beats?.props?.source)).toMatch(/<path class="beats"/)
})
test('the heartbeat per mood, its source unchanged as the last minute counts down', async ($, on) => {
  const src: Record<string, string> = {}
  for (const scenario of ['calm', 'cold', 'unmeasured', 'warming'] as const) {
    const drawn = await drawCases($, on, { scenario, appearance: 'dark', layout: 'pulse' }, [{ surface: 'desktop', cols: 160 }])
    src[scenario] = String(beatOf(Object.values(drawn)[0])?.props?.source)
  }
  expect(src.calm).toMatch(/<circle[^>]*fill="#/)
  expect(src.cold).toMatch(/<line/)
  expect(src.unmeasured).toMatch(/fill="none"/)
  expect(src.warming).toMatch(/fill="none"/)
  const tick = (msLeft: number) => beatOf(band({ surface: 'desktop', ...LIMITS, cache: { ...snapOf().cache, requests: 1, msLeft, coldAt: msLeft } }))
  expect([tick(40_000)?.props?.source, tick(40_000)?.props?.alt]).toEqual([tick(39_000)?.props?.source, tick(39_000)?.props?.alt])
})
test('recalled carries ~ on its time; working shows no countdown', async ($, on) => {
  const recalled = await drawCases($, on, { scenario: 'recalled', appearance: 'dark', layout: 'pulse' }, [{ surface: 'terminal', cols: 160 }])
  expect(shown(firstRow(Object.values(recalled)[0]))).toMatch(/cache[^·]*~/)
  const working = await drawCases($, on, { scenario: 'working', appearance: 'dark', layout: 'pulse' }, [{ surface: 'terminal', cols: 160 }])
  expect(shown(firstRow(Object.values(working)[0]))).not.toMatch(/\d+m left|\d+s left/)
})
test("no costs yet says so in the trace's place", () => {
  expect(shown(rowOf({ history: { costs: [], context: [], fiveHour: [] } }))).toContain(EMPTY.costs)
})
test('no limits: no 5h or 7d; no samples: 5h and 7d in words only', () => {
  expect(shown(rowOf({ fiveHour: undefined, sevenDay: undefined }))).not.toMatch(/5h|7d/)
  const bare = rowOf({ surface: 'desktop', ...LIMITS, samples: [] })
  expect(svgAlts(bare).map(CLASS)).not.toContain('5h')
  expect(shown(bare)).toMatch(/5h 26%[\s\S]*7d 41%/)
})
test('at 40 and 45 columns, full amber: every reading keeps its words, and the row fits', async ($, on) => {
  for (const cols of [40, 45]) {
    const drawn = await drawCases($, on, { scenario: 'lastMinute', appearance: 'dark', layout: 'pulse', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [{ surface: 'terminal', cols }])
    const row = firstRow(Object.values(drawn)[0]) as Node
    expect(shown(row)).toMatch(/cache[\s\S]*\$[\s\S]*context[\s\S]*5h[\s\S]*7d/)
    expect(cellsOf(row, TERMINAL)).toBeLessThanOrEqual(cols - ROW_SLACK)
  }
})
test('one cost, or every cost a re-warm: no NaN', () => {
  for (const costs of [[{ usd: 0.2, reWarm: false }], [{ usd: 0.8, reWarm: true }, { usd: 0.9, reWarm: true }]]) {
    const src = svgsOf(rowOf({ surface: 'desktop', ...LIMITS, history: { ...HISTORY, costs } })).map(s => String(s.props?.source)).join('')
    expect(src).not.toMatch(/NaN|Infinity/)
  }
})
test('terminal: braille beside the numbers', () => {
  expect(shown(rowOf({ surface: 'terminal', ...LIMITS }))).toMatch(/[⠀-⣿]+ ?\$3\.19/)
})
test('open: the bands in order, their words, the footer; all 13 rows with an other limit', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 13, ...LIMITS, otherLimits: OTHER })
  expect(['band:cache', 'band:spend', 'band:context', 'band:limits', 'band:other'].map(k => byKey(open, k, 'Box') !== undefined)).toEqual([true, true, true, true, true])
  expect(shown(open)).toMatch(/avg ~\$/)
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
  expect(visualRows(open, 'desktop')).toBe(13)
})
test('open: as rows run out, the bands give way in the spec order and the footer stays', () => {
  const ORDER = ['band:other', 'band:context', 'band:limits', 'band:spend', 'band:cache']
  let gone = 0
  for (let rows = 13; rows >= 4; rows--) {
    const open = band({ surface: 'desktop', expanded: true, maxRows: rows, ...LIMITS, otherLimits: OTHER })
    expect(byKey(open, 'collapse', 'Button')).toBeDefined()
    expect(visualRows(open, 'desktop')).toBeLessThanOrEqual(rows)
    const present = ORDER.map(k => byKey(open, k, 'Box') !== undefined)
    const first = present.indexOf(true)
    gone = Math.max(gone, first === -1 ? ORDER.length : first)
    expect(present.slice(gone).every(Boolean) || present.every(p => !p)).toBe(true)
  }
  // Limits shrinks to two rows, then to words, before Spend goes to words.
  const svgsIn = (rows: number, key: string) => svgsOf(byKey(band({ surface: 'desktop', expanded: true, maxRows: rows, ...LIMITS }), key, 'Box')).length
  expect(svgsIn(13, 'band:limits')).toBe(2)
  expect(svgsIn(9, 'band:limits')).toBe(0)
  expect(svgsIn(9, 'band:spend')).toBe(1)
})
```

  The last three assertions depend on the row arithmetic. At `maxRows` 9 the body has 5 rows: Cache 1 and Spend 2 fit, Context has gone, and Limits has gone to words (1). If the real step counts differ, set the `rows` values from the give-way table in Step 3, keeping these three facts:
  - at full size, Limits draws two charts;
  - at the step where Limits is words, it draws no chart;
  - at that same step, Spend still draws its chart.
- [ ] **Step 2: Run** `tools/test-only.sh view-pulse`. Expected: FAIL.
- [ ] **Step 3: Implement `pulse.tsx`:**

```tsx
// Pulse, the session's trace: each message a beat, the cache a heartbeat,
// context and the 5h window as lines over time, the week by day, in the one
// order. Open, a stack of charts with their words (pulse-open.tsx).

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, dayCells, heartbeat, sparkline } from '../charts'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton } from './frame'
import { fitLine, line } from './parts'
import { openStack } from './pulse-open'
import type { View } from './view'

/** What gives way as the row narrows, first to last (spec §4.1). Every
 *  reading's words stay. */
const ORDER = ['last', 'contextTrail', 'beats14', 'fiveTrail', 'sevenDays', 'beats'] as const
/** The beats' width: 6 px a beat. */
const BEATS_PX = { 14: 84, 8: 48 } as const

/** The heartbeat's state for the cache's mood. */
export const heartState = (read: Readings): 'still' | 'beat' | 'flat' | 'hollow' =>
  read.cache.mood === 'cold' ? 'flat'
  : read.cache.mood === 'unmeasured' || read.cache.mood === 'warming' ? 'hollow'
  : read.cache.tone === 'amber' ? 'beat'
  : 'still'

/** A reading's words in its tone's ink. */
export const said = (kit: Kit, key: string, text: string, amber: boolean): RenderChildren => {
  const { Text, palette, onTone } = kit
  return <Text key={key} color={onTone(amber ? 'amber' : 'calm', palette.value)}>{text}</Text>
}

/** A reading as one keyed group: its chart, if kept, then its words. */
const group = (kit: Kit, key: string, chart: RenderChildren, words: RenderChildren): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>{chart}{words}</Box>
}

const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const { palette } = kit
    const { cache, context, fiveHour, sevenDay, history: h, week } = read
    const n = keeps.has('beats14') ? 14 : 8
    const cacheGroup = group(kit, 'cache',
      heartbeat(kit, { key: 'beat', alt: cache.heartAlt, state: heartState(read), color: cache.tone === 'amber' ? palette.amberFg : palette.warm }),
      said(kit, 'w', cache.amber?.long ?? cache.text, cache.amber !== undefined))
    const spendGroup = group(kit, 'spend',
      h.empty || !keeps.has('beats') ? null
        : barChart(kit, { key: 'beats', shape: 'beats', alt: h.costsAltOf(n), values: h.costValues.slice(-n), marked: h.reWarms.slice(-n), color: palette.value, markColor: palette.value, px: BEATS_PX[n], height: 20, max: h.beatsTop }),
      h.empty ? said(kit, 'w', EMPTY.costs, false) : said(kit, 'w', keeps.has('last') ? `${read.spend.totalText} · ${h.numbersShort}` : read.spend.totalText, false))
    const contextGroup = group(kit, 'context',
      keeps.has('contextTrail') && h.context.length > 1
        ? sparkline(kit, { key: 'trail', alt: h.contextTrailAlt, values: h.context, color: palette.label, px: 36, height: 16, max: context.compactAt ?? context.window })
        : null,
      said(kit, 'w', context.amber?.long ?? `context ${context.valueText}`, context.amber !== undefined))
    const fiveGroup = fiveHour === undefined ? null : group(kit, '5h',
      keeps.has('fiveTrail') && week.fiveHourWindow.values.length > 1
        ? sparkline(kit, { key: 'trail', alt: week.windowAlt, values: week.fiveHourWindow.values, nowAt: week.fiveHourWindow.nowAt, color: palette.fiveAccent, px: 48, height: 16, max: 100 })
        : null,
      said(kit, 'w', fiveHour.amber?.long ?? `5h ${fiveHour.valueText}`, fiveHour.amber !== undefined))
    const sevenGroup = sevenDay === undefined ? null : group(kit, '7d',
      keeps.has('sevenDays') && week.days.some(d => d.pct !== undefined && !d.guess)
        ? dayCells(kit, { key: 'days', alt: week.daysAlt, values: week.days.map(d => d.pct), guess: week.days.map(d => d.guess), today: week.days.findIndex(d => d.today), color: palette.weekAccent, cellPx: 4, height: 14, max: 100 })
        : null,
      said(kit, 'w', sevenDay.amber?.long ?? `7d ${sevenDay.valueText}`, sevenDay.amber !== undefined))
    return line(kit, 'row', [cacheGroup, spendGroup, contextGroup, fiveGroup, sevenGroup], toggleButton(kit, read, act))
  })

export const pulseView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { Box } = kit
    return (
      <Box flexDirection="column">
        {collapsed(kit, read, act)}
        {read.frame.expanded ? openStack(kit, read, act) : null}
      </Box>
    )
  },
}
```

  `pulse-open.tsx` exports `openStack(kit, read, act): RenderElement[]`, which returns `[stack, footer(kit, act, strip)]`.
  - **The strip** is `drawStrip(kit, ws, 'footer', 0, kit.columns - ROW_SLACK - footerRoom(kit))`, drawn only when `read.workspace` is set.
  - **The stack** is a column of bands. Each band is a `Box` keyed `band:<name>`, drawn as a row: the chart with `flexGrow={1}`, then its words with `flexShrink={0}`. The words are a list of phrases with `undefined` filtered out, joined with `const DOT = ' · '`, declared in this file. The bands:

  | Band | Rows | Chart | Words |
  | --- | --- | --- | --- |
  | `band:cache` | 1 | `sparkline` of `[1, cache.charge]`, 120 px wide and 16 tall, `max: 1`, which drains with the cache. `alt: cache.heartAlt`. | `[cache.text, cache.coldAtText, cache.gaugeMore]` |
  | `band:spend` | 2 | Beats of the last 24, `level: h.warmAvgUsd`, `px: 240`, `height: 40`, `max: h.beatsTop`, `alt: h.costsAltOf(24)`. With `h.empty`, `EMPTY.costs` instead. | `[spend.totalText, h.numbersShort, h.avgText]` |
  | `band:context` | 2 | `sparkline` of `h.context`, `px: 240`, `height: 40`, `max: context.compactAt ?? context.window`, `level: context.compactAt === undefined ? undefined : 1`, `alt: h.contextTrailAlt` | `[context.valueText, context.roomText === undefined ? undefined : `${context.roomText} left`, context.compactsAtText]` |
  | `band:limits` | 3 | Two `Box`es, each with `flexGrow={1}`. 5h: `sparkline` of `week.fiveHourWindow` with `nowAt`, `height: 64`, `max: 100`, `alt: week.windowAlt`. 7d: `dayCells`, `cellPx: 18`, `height: 56`, `alt: week.daysAlt`. | 5h: `[fiveHour.valueText, fiveHour.pace, fiveHour.resetAtGlyph]`. 7d: `[sevenDay.valueText, sevenDay.fillText, sevenDay.resetAtGlyph]` |
  | `band:other` | 1 | none | `read.limits.filter(l => l.key === 'other').map(l => l.text)`, joined by `DOT` |

  - **Sizes.** On the desktop a row is 24 px: a 2-row chart is 40 px plus air, and a 3-row chart is 64 px. In the terminal each band is one line, braille beside its words, except Limits, which takes 2.
  - **Give-way.** The steps, as rows used by the bands:

  | Step | What it drops | Rows |
  | --- | --- | --- |
  | 0 | nothing: Cache, Spend, Context, Limits and Other | 1+2+2+3+1 = 9 |
  | 1 | Other | 8 |
  | 2 | Context | 6 |
  | 3 | Limits to 2 rows | 5 |
  | 4 | Limits to words | 4 |
  | 5 | Spend to words | 3 |
  | 6 | Cache | 2 |
  | 7 | the stack | 0 |

  The stack takes the first step whose rows fit within `bodyRowsFor(read.frame.maxRows, 1, 0)`. The table is a `const STEPS` in the file, so no arithmetic sits in the view: each step lists its bands and their sizes.
- [ ] **Step 4:** Drop the `skip` from Task 1's stretch test, if it has one.
- [ ] **Step 5: Run** `tools/test-only.sh view-pulse charts matrix golden-hash`, then `tools/views-gate.sh`. Expected: PASS, and the gate prints nothing. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat: pulse draws the session as a trace, collapsed and open"
```

---

### Task 10: The cards are chips' alone

**Files:**
- Modify: `hooks/views/cards.tsx`, `hooks/views/view.ts`, `hooks/views/chips.tsx`
- Modify: `tests/cards.test.ts`
- Modify: `CONTRIBUTING.md:126-127`

**Produces:** `OpenOptions = Readonly<{ collapsedRows: number }>`. `defineCardsView` and `CardOptions` are gone, and `chipsView` calls `cardsView` directly.

- [ ] **Step 1: Remove** every `OpenOptions` field except `collapsedRows`, and everything only they reach: `WindowFact`, `SlotForms`, `Slots`, `isForms`, `Lead`, `Leads`, `FactLead`, `isLead`, `leadOf`, `saidOf`, the compact-split branch, and `cardResetLess`'s `'clock'` form. Keep `Fact` if `factRow` still takes it. Remove `defineCardsView` and `CardOptions` from view.ts. `tsc -p plugins/session-usage-band` then names every reader left behind; each one is dead.
- [ ] **Step 2: In `tests/cards.test.ts`,** delete only the tests that pass the removed options. Every chips case stays.
- [ ] **Step 3: In `CONTRIBUTING.md:126-127`,** replace "made with `defineCardsView`" with "which draws its own collapsed row and open view, and shares only `views/frame.tsx` (the toggle, `bodyRowsFor` and `footer`)". Also name the gate's new look check there.
- [ ] **Step 4: Run** `tools/test-only.sh cards chips golden-hash golden-a golden-b`. Expected: PASS, every chips hash unchanged. Then run the whole suite and commit:

```bash
git add -A plugins/session-usage-band CONTRIBUTING.md
git commit -m "refactor: the shared cards are chips' alone"
```

---

### Task 11: Sweep what nothing uses

**Files:** whatever the sweep finds in `plugins/session-usage-band/hooks/`.

- [ ] **Step 1: List** the exports used in no other file, and the leftover options and fields:

```bash
cd plugins/session-usage-band
for f in hooks/*.ts hooks/*.tsx hooks/views/*.ts hooks/views/*.tsx; do
  for name in $(grep -oE '^export (const|type|function) [A-Za-z0-9_]+' "$f" | awk '{print $3}'); do
    others=$(grep -rlw "$name" hooks tests | grep -vx "$f" | wc -l | tr -d ' ')
    own=$(grep -cw "$name" "$f")
    [ "$others" -eq 0 ] && echo "$f $name (uses in its own file: $((own - 1)))"
  done
done
grep -nE 'stretch|slim|tick\b|projectTo|weekGuess|weekSpent|fiveGuess|fiveSpent' hooks/*.ts hooks/*.tsx hooks/views/*.tsx
```

- [ ] **Step 2: Act on each hit.**
  - **Used in its own file:** drop the `export` only. `AMBER_STEP` and `fitSqueeze` are in this group; `fitLine` needs them.
  - **Used nowhere:** delete it. An export only tests use is dead too: delete it and its test.
  - **Options and fields from the grep** (`stretch`, `slim`, `meter`'s `tick`/`projectTo`, `sliceCells`, `ring`, and the four `week*`/`five*` tokens): delete each one that no caller passes or reads.

  After each file, run `tsc` and `tools/test-only.sh golden-hash golden-a golden-b`. A chips hash that moves means the deletion reached chips: undo it.
- [ ] **Step 3: Gates.** The whole suite, `tsc -p plugins/session-usage-band`, `claude plugin validate plugins/session-usage-band` and `tools/views-gate.sh` must all be clean. Then commit:

```bash
git add -A plugins/session-usage-band
git commit -m "refactor: drop what only the removed layouts used"
```

---

### Task 12: Sign off by screenshot

Decision B (Task 0): the demo renderer cannot gate — it reproduces the stretch only partly and not the notch — so the user's desktop screenshots are the final gate.

**Files:**
- Create: `tools/demos/capture/signoff.test.ts`, a capture rather than a test
- Output: `tools/demos/out/signoff/*.png`, not committed

`tools/demos/capture/desktop.test.ts` already loops over `LAYOUT_NAMES` (line 158), so it needs no change.

- [ ] **Step 1: Write `signoff.test.ts`.** For each layout (chips, pulse, departures) × surface (desktop, terminal) × shut and open, it draws these cases with `drawCases`, passing `usage` where a case needs limits:

  | Case | Scenarios and usage |
  | --- | --- |
  | low | `calm`, `withLimits(3, 10)` |
  | high | `calm`, `withLimits(70, 78)` |
  | near | `lastMinute` with `withLimits(30, 85)`; `nearCompaction`; `fiveHourAhead`. One image each, since no scenario raises all four. |
  | empty | `emptyHistory`, `noLimits`, `noWorkspace` |
  | edges | `unmeasured`, `warming`, `cold`, `recalled`, `working`, `resetPassed`, `compactionOff`, `gatewaySpend`, `fullHistory` (a re-warm in the trace) |
  | unknown zone | `drawBand` with `snapOf({ layout, surface, zone: undefined, …LIMITS })` directly, since `drawCases` uses the host's zone |

  - Low and near are also drawn in `light` and `plain`, at 40, 80 and 200 columns.
  - Each tree is printed as `capture/desktop.test.ts` prints.
  - `invariantErrors` runs on each tree first. Any error stops the capture before any PNG is made, listing every failing case.
- [ ] **Step 2: Render.** Run `tools/demos/build.sh capture`, then `render_desk.py` and `render.py`, into `tools/demos/out/signoff/`.
- [ ] **Step 3: Read every PNG** with the Read tool. A PNG passes when:
  - its order is Cache, Spend, Context, 5h, 7d;
  - amber shows only on the near cases' readings;
  - nothing reads NaN or `undefined`, and no cell is empty;
  - no row wraps;
  - each mark sits where its value says: a 26% line about a quarter up, today's day cell outlined on the right day, a re-warm's beat flat-topped.

  Each failure is fixed in the task that owns its code, with a test, and the PNGs are rendered again.
- [ ] **Step 4: Ask the user.** With SendUserFile, send the three collapsed PNGs from the low case, unlabelled, and the near set. Ask them to:
  - name each layout (the distinctness gate);
  - if decision B says the demo can't gate, take one desktop screenshot per layout, shut and open.

  Wait for the answer before Task 13.
- [ ] **Step 5:**

```bash
git add tools/demos/capture/signoff.test.ts
git commit -m "test: sign-off captures for the three layouts"
```

---

### Task 13: Docs and release

**Files:**
- `plugins/session-usage-band/README.md`: the layouts table, the gallery's alt text, and the week and forecast paragraphs near lines 190 and 217, which are removed
- `README.md` at the root: the layout count
- `CONTRIBUTING.md`: the module table gains `words.ts`' board words, `flaps.tsx`, `pulse-open.tsx` and `departures-board.tsx`, and drops the removed views
- `tools/demos/site/template.html`, lines 561-700 and 869-876: the picker, the noscript list and the descriptions
- `design/2026-10-09-band-layouts-spec.md`: its status line becomes "Superseded in part by 2026-10-12-three-layouts-spec.md"
- `plugins/session-usage-band/CHANGELOG.md`
- `plugins/session-usage-band/.claude-plugin/plugin.json`

- [ ] **Step 1: Update the docs above.** Describe each layout by S§1's Answers.
- [ ] **Step 2: Add the CHANGELOG entry,** in the file's style (`## [x.y.z] - date`, no em dashes):

```markdown
## [0.14.0] - 2026-10-12

### Removed
- Six layouts: gauges, ledger, rings, tiles, week and forecast. A saved one draws chips, and `/usage-band layout` says so. Week's day cells now live in pulse, and forecast's clock times in departures.

### Changed
- Pulse is rebuilt as the session's trace: each message a beat, a heartbeat for the cache, context and the 5h window over time, and the week by day. Open, it is a stack of charts.
- Departures is rebuilt as a split-flap board. Open, each reading is a line: item, status, time and remarks.
- Pulse and departures draw their readings in one order: cache, spend, context, 5h, 7d.
```

- [ ] **Step 3: Version and images.** Set `"version": "0.14.0"` in `plugin.json`. Run `tools/demos/build.sh`, then Read `docs/band-layouts-dark.png` and `docs/band-layouts-light.png`: each must show three layouts.
- [ ] **Step 4: Gates.** The whole suite, `tsc`, `claude plugin validate` and `tools/views-gate.sh`.
- [ ] **Step 5: Release.**

```bash
git add -A
git commit -m "chore: release 0.14.0"
```

  Then merge `three-layouts` into `main`, tag `v0.14.0`, publish the GitHub release with the CHANGELOG entry, and update the local marketplace install, as the repo's release memory says. Because the plugin's version changed, the user reloads with `/reload-plugins` and restarts.
