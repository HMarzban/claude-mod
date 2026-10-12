# Three layouts: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the band's nine layouts to three (chips, pulse and departures). Each draws its own collapsed row and its own open view.

**Architecture:** The layers stay as they are: `register → snapshot → reading → views`.
- The shared footer moves from `cards.tsx` into `frame.tsx`.
- The board's words come from a new reading-layer module, `hooks/board.ts`.
- Svg geometry lives in `charts.tsx` and a new `hooks/flaps.tsx`, never in `views/`, which `tools/views-gate.sh` keeps free of `Math.round`.
- Pulse and departures are rewritten. Six views are deleted. `cards.tsx` becomes chips' alone.

**Tech stack:** a Claude Code mod in TypeScript and TSX, with the engine's `claude-code` and `claude-code/testing` modules.
- `claude plugin test <dir>` runs the tests.
- `tools/test-only.sh <glob>…` runs one test file in a red/green step.
- `tsc -p plugins/session-usage-band` type-checks.
- `claude plugin validate plugins/session-usage-band` checks the manifest.
- `tools/views-gate.sh` is the views gate.

**Spec:** `design/2026-10-12-three-layouts-spec.md` (v2). Read it before any task. This plan cites its sections as "S§n".

## Global constraints

- **One order** in pulse and departures: Cache, Spend, Context, 5h, 7d, then `otherLimits` when open. Amber never moves a reading.
- **Chips' golden hashes** (`tests/golden/chips.ts`, checked by `tests/golden-*.test.ts`) pass after every task. Any change that moves a chips hash is a bug in that task.
- **Amber words start `! `,** except the board's `LAST CALL`. Cache amber is `cache.tone === 'amber'`, the last minute only. Nothing is red.
- **Estimates carry `~`**, never `≈`.
- **Svg** on the desktop only, every one with `alt` and `width`. No `id`, gradient, pattern, clipPath, or `preserveAspectRatio="none"`. The board's flaps use `ui-monospace, monospace`, and other Svg text uses `system-ui, sans-serif`.
- **Glyphs** come from the tier allowlist (old spec §3.2). `▁–▇`, `○◐◑◕`, `▮▯▰▱`, emoji and `—` are banned in the new views. TIME's placeholder is `-`.
- **No view formats.** `views/*.tsx` outside chips, parts and frame never contain `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` or `../format`.
- **Commit rules:**
  - each commit runs the whole suite: `claude plugin test plugins/session-usage-band`;
  - messages are conventional: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`;
  - each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Version:** 0.14.0.

## Review focus

These are the input classes most likely to bite a real user that the spec implies but no early task's test covers. Each one has a pinning test added in the task named.

1. **A stored removed layout survives a version upgrade.** The band draws chips, and `/usage-band layout` names the old layout as removed (Task 3).
2. **The board is read on a light theme.** Every board ink holds 4.5:1 on `flapBg` in LIGHT, not only DARK (Task 6).
3. **An unknown zone,** where `zone` is `undefined`. No board cell shows a clock time; every time is a countdown, and no cell is empty (Task 7).
4. **A trace with one cost, or every cost a re-warm.** No NaN in the Svg, and the scale never divides by zero (Task 5).
5. **Narrow rows (40–45 columns) at full amber.** CACHE and 7D still show, `▵` is never clipped, and pulse keeps every reading's words (Tasks 7 and 9).

---

### Task 1: Spike the heartbeat's motion

The spike decides S§4.1's animation. Its code is thrown away.

**Files:**
- Create: `/Users/macbook/.claude/dev-mods/<session-id>/heartbeat-spike/.claude-plugin/plugin.json`
- Create: `/Users/macbook/.claude/dev-mods/<session-id>/heartbeat-spike/hooks/hooks.json`
- Create: `/Users/macbook/.claude/dev-mods/<session-id>/heartbeat-spike/hooks/register.tsx`

**Interfaces:** produces a decision only. It is recorded in S§4.1 as one of two sentences: "Motion ships" or "The mark ships still".

- [ ] **Step 1: Write the spike mod.** Load the `plugin-authoring` skill first, for its folder rules. Then write:

```json
{ "name": "heartbeat-spike", "version": "0.1.0", "description": "Throwaway: does an interactive Svg keep its CSS animation across band redraws?" }
```

```json
{ "modules": ["./register.tsx"] }
```

```tsx
import type { Register } from 'claude-code'

const BEAT = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12">
<style>
@keyframes beat { 0%,100% { r: 3.5 } 30% { r: 5.5 } }
circle { animation: beat 0.6s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { circle { animation: none; } }
</style>
<circle cx="6" cy="6" r="3.5" fill="#E8B04A"/></svg>`

export const register: Register = (on) => {
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
        <Svg source={BEAT} alt="heartbeat spike" width={12} height={12} isInteractive />
        <Text>{`tick ${tick}`}</Text>
      </Box>
    )
  })
}
```

Before relying on `$.clock.every`, check its signature: grep `.claude-plugin/types/claude-code/index.d.ts` for `every`. If the clock names it differently, use the name it gives.

- [ ] **Step 2: Have the user look at it.** Ask for a 5-second screen recording, or two screenshots a second apart, of the band on the desktop. Ask three questions:
  - Does the dot pulse?
  - Does it pulse smoothly while `tick` counts, or does the pulse restart at each tick?
  - With macOS "Reduce motion" on, is the dot still?
- [ ] **Step 3: Record the result.** Motion ships only if it pulsed, did not restart, and honoured reduced motion. Edit S§4.1's heartbeat bullet to the chosen sentence. Delete the spike folder. Then commit:

```bash
git add design/2026-10-12-three-layouts-spec.md
git commit -m "docs: record the heartbeat spike's result"
```

If the user has not answered by Task 9, the mark ships still (S§4.1), and Task 9 says so in its commit.

---

### Task 2: Move the footer into the frame

**Files:**
- Modify: `plugins/session-usage-band/hooks/views/frame.tsx`
- Modify: `plugins/session-usage-band/hooks/views/cards.tsx:439-485` (the footer block of `openBody`)
- Test: `plugins/session-usage-band/tests/frame.test.ts`

**Interfaces:** produces `footer(kit: Kit, read: Readings, act: BandActions, strip: RenderElement | null, stripInFooter: boolean): RenderElement`, the actions row: the strip in the footer (or the hint), air, then Collapse and Hide band. Also exported from `frame.tsx`:
- `FOOTER_BUTTON_KEYS = ['collapse', 'hide'] as const`;
- `footerRoom(kit: Kit): number`, the columns the buttons and their hotkey marks take, which the strip's room subtracts.

- [ ] **Step 1: Write the failing test** in `tests/frame.test.ts`:

```ts
import { footer, footerRoom } from '../hooks/views/frame'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import { fakeEl, shown, byKey } from './helpers'
import { NO_ACT, snapOf } from './matrix'

test('footer draws the hint, air, then Collapse and Hide band, with no strip', () => {
  const snap = snapOf({ surface: 'terminal', columns: 120, expanded: true })
  const tree = footer(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT, null, false) as unknown as Node
  expect(byKey(tree, 'collapse', 'Button')?.props?.hotkey).toBe('c')
  expect(byKey(tree, 'hide', 'Button')?.props?.hotkey).toBe('h')
  expect(shown(tree)).toContain('Bring it back with /usage-band')
})
test('footerRoom is the buttons, their hotkey marks and their gaps', () => {
  const snap = snapOf({ surface: 'terminal', columns: 120, expanded: true })
  expect(footerRoom(makeKit(fakeEl, snap))).toBeGreaterThan(20)
})
```

- [ ] **Step 2: Run it.** `tools/test-only.sh frame`. Expected: it FAILS, because `footer` is not exported.
- [ ] **Step 3: Implement.** Move the `buttons`, `hint`, `hinted` and actions-row code out of `openBody` verbatim, into `frame.tsx`:

```tsx
export const FOOTER_BUTTON_KEYS = ['collapse', 'hide'] as const

const buttonsOf = (kit: Kit, act: BandActions): RenderElement[] => {
  const { Button } = kit
  return [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
}

/** The columns the buttons take, with their hotkey marks and gaps: what a
 *  strip in the footer leaves out of its room. */
export const footerRoom = (kit: Kit): number => cellsOf(buttonsOf(kit, NO_PRESS), kit.measure) + 2 * HOTKEY_MARK + 2

/** The open view's last row: the strip, when it sits in the footer, else
 *  the hint while it fits; air; then Collapse and Hide band. */
export const footer = (kit: Kit, read: Readings, act: BandActions, strip: RenderElement | null, stripInFooter: boolean): RenderElement => {
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
      {stripInFooter ? strip : hinted ? hint : null}
      {stripInFooter && strip !== null ? null : <Box flexGrow={1} />}
      {buttons}
    </Box>
  )
}
```

Define `const NO_PRESS = { toggleExpanded: async () => undefined, hide: async () => undefined }` in `frame.tsx`; it's only used for measuring. In `openBody`:
- replace the strip's room `cellsOf(buttons, measure) + 2 * HOTKEY_MARK + 2` with `footerRoom(kit)`;
- replace the returned actions row with `footer(kit, read, act, strip, stripPlace === 'footer')`;
- delete the moved code.

- [ ] **Step 4: Run** `tools/test-only.sh frame golden-hash golden-a golden-b cards`. Expected: PASS, with every chips golden hash unchanged.
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add plugins/session-usage-band/hooks/views/frame.tsx plugins/session-usage-band/hooks/views/cards.tsx plugins/session-usage-band/tests/frame.test.ts
git commit -m "refactor: the open view's footer lives in the frame, for every layout"
```

---

### Task 3: Remove six layouts; the command names what was removed

**Files:**
- Delete: `hooks/views/{gauges,ledger,rings,tiles,week,forecast}.tsx`
- Delete: `tests/view-{gauges,ledger,rings,tiles,week,forecast}.test.ts`
- Modify: `hooks/snapshot.ts:17`
- Modify: `hooks/views/index.ts`
- Modify: `hooks/memory.ts:53-59`
- Modify: `hooks/register.tsx:410-450`
- Test: `tests/layout-command.test.ts`, plus every test that names a removed layout (`grep -lE "'(gauges|ledger|rings|tiles|week|forecast)'" tests/`)

**Interfaces:**
- Produces `LAYOUT_NAMES = ['chips', 'pulse', 'departures'] as const`.
- Produces, in memory.ts, `REMOVED_LAYOUTS` and `removedLayoutOf(v: unknown): string | undefined`.
- Produces `band.removed: string | undefined` in register.tsx's band state.

- [ ] **Step 1: Write the failing tests** in `tests/layout-command.test.ts`. Replace `LIST` and the `'ledger'` cases with:

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
test('a removed name stored draws chips, and the list says it was removed', async ($, on) => {
  setup(on, { store: { layout: 'gauges' } }); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: chips (gauges was removed in 0.14.0). ${LIST}`)
  const [drawn, chips] = await drawnBesideChips($)
  expect(drawn).toBe(chips)
})
test('choosing a removed name changes nothing and says so', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout week')).toBe(`week was removed in 0.14.0. ${LIST}`)
  expect(engine.storeSets).not.toContain('layout')
})
```

Change the stored-layout test to `{ store: { layout: 'departures' } }`, expecting `Usage band layout: departures. ${LIST}`.

- [ ] **Step 2: Run** `tools/test-only.sh layout-command`. Expected: FAIL, because `removedLayoutOf` is undefined and the list is old.
- [ ] **Step 3: Implement.**
  - snapshot.ts: `export const LAYOUT_NAMES = ['chips', 'pulse', 'departures'] as const`.
  - memory.ts, beside `asLayoutName`:

```ts
/** Layouts 0.14.0 removed. A stored one draws chips; the command names it. */
export const REMOVED_LAYOUTS = ['gauges', 'ledger', 'rings', 'tiles', 'week', 'forecast'] as const
/** A removed layout's name from the store or the command, trimmed and lowercased; else undefined. */
export const removedLayoutOf = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (REMOVED_LAYOUTS as readonly string[]).includes(word) ? word : undefined
}
```

  - register.tsx:
    - Add `removed: undefined as string | undefined` to the band state.
    - In the store read (line 418): `band.removed = removedLayoutOf(read.stored)`.
    - Then:

```ts
const REMOVED_IN = '0.14.0'
const LAYOUT_PURPOSE: Readonly<Record<LayoutName, string>> = { chips: 'at a glance', pulse: 'trends', departures: 'times' }
const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.map(n => `${n} (${LAYOUT_PURPOSE[n]})`).join(', ')}.`
const layoutReply = (name: LayoutName, removed?: string): string =>
  `Usage band layout: ${name}${removed === undefined ? '' : ` (${removed} was removed in ${REMOVED_IN})`}.`
```

    - In the command handler:
      - an empty argument returns `${layoutReply(band.layout, band.removed)} ${LAYOUT_LIST}`;
      - before the unknown-name branch: `const gone = removedLayoutOf(arg); if (gone !== undefined) return `${gone} was removed in ${REMOVED_IN}. ${LAYOUT_LIST}``;
      - a successful switch sets `band.removed = undefined`.
  - views/index.ts: drop the six imports and entries.
  - Delete the six view files and their six test files.
- [ ] **Step 4: Fix every remaining reference.** Run `grep -rnE "'(gauges|ledger|rings|tiles|week|forecast)'" plugins/session-usage-band/{hooks,tests}`. Each hit in a test that loops over layouts (`consistency.test.ts`, `design.test.ts`, `matrix.test.ts`, `time-zones.test.ts`, `layout.test.ts`) now uses `LAYOUT_NAMES`, or drops the case. `tsc -p plugins/session-usage-band` must be clean.
- [ ] **Step 5: Run the whole suite,** then `tools/views-gate.sh`, then commit:

```bash
git add -A plugins/session-usage-band
git commit -m "feat!: keep three layouts; a removed one draws chips and the command says so"
```

---

### Task 4: The cache's cold-at time, and the board's words

**Files:**
- Modify: `hooks/cache.ts` (`cacheView`) and `hooks/snapshot.ts` (`cache.coldAt`)
- Create: `hooks/board.ts`
- Modify: `hooks/reading.ts` (`Readings.board`, lazily)
- Modify: `hooks/workspace.ts` (`stripWords`)
- Test: `tests/board.test.ts` (new) and `tests/cache-model.test.ts`

**Interfaces:**
- Produces `BandSnapshot['cache']['coldAt']: number | null`: when the cache goes or went cold, in epoch ms; `null` when not known.
- Produces, in `hooks/board.ts`:

```ts
export type BoardKey = 'cache' | 'spend' | 'context' | '5h' | '7d' | 'other'
export type BoardRow = Readonly<{
  key: BoardKey
  item: string              // 'CACHE', 'SPEND', 'CONTEXT', '5H', '7D', or an other limit's name in capitals
  status: string            // 'DEPARTS', 'LAST CALL', 'DEPARTED', 'BOARDING', 'CHECK-IN', '$0.24', '8% USED', '26%', '! NEAR LIMIT'
  time: string              // '17:24', 'SAT 13:30', 'IN 38 MIN', or '-'
  remarks: string           // 'IN 38 MIN · RE-WARM ~$0.57 IF MISSED', or ''
  /** Collapsed, long: 'DEPARTS 17:24', '26% ↻ 17:50', '85% ↻ SAT 13:30 ! NEAR LIMIT'. */
  cell: string
  /** Collapsed, short: '17:24', '! 47S', '26%'. */
  cellShort: string
  /** Collapsed, the reset left out: '26% ON PACE ~33%', '85% ! NEAR LIMIT'; the cell itself where it has no reset. */
  cellNoReset: string
  tone: Tone
  /** In words, for a reader: 'Cache goes cold at 17:24, in 38 minutes'. */
  alt: string
}>
export type Board = Readonly<{ header: readonly string[] | undefined; rows: readonly BoardRow[] }>
export const boardOf: (r: BoardInput) => Board
/** A row's REMARKS cut to `tiles` characters, an ellipsis last where cut, so no view slices a string. */
export const remarksFit: (row: BoardRow, tiles: number) => string
```

  `BoardInput` is `Pick<Readings, 'frame' | 'cache' | 'spend' | 'context' | 'limits' | 'workspace'> & { coldAt: number | null }`.
- Produces `Readings.board: Board`, built the first time a view reads it, as `history` is.
- Produces, in `hooks/workspace.ts`, `stripWords(ws: Workspace): readonly string[]`: the folder name, then the branch (or `detached`), then `clean` or `N changed`.

- [ ] **Step 1: Write the failing tests** in `tests/board.test.ts`. Use the spec's single scenario (S§3) through `snapOf`:

```ts
import { test, expect } from 'claude-code/testing'
import { readingsOf } from '../hooks/reading'
import { fixedZone } from '../hooks/format'
import { snapOf } from './matrix'
import { MIN, HOUR } from './helpers'

const UTC = fixedZone(0)
const at = (over = {}) => readingsOf(snapOf({ zone: UTC, ...over })).board

test('rows run in the one order, cache first and 7d last, then other limits', () => {
  expect(at().rows.map(r => r.key)).toEqual(['cache', 'spend', 'context', '5h', '7d'])
})
test('a warm cache departs at its cold-at time', () => {
  const now = 0
  const row = at({ now, cache: { ...snapOf().cache, requests: 1, msLeft: 38 * MIN, coldAt: now + 38 * MIN } }).rows[0]
  expect([row.status, row.time, row.cell, row.cellShort, row.tone]).toEqual(['DEPARTS', '00:38', 'DEPARTS 00:38', '00:38', 'calm'])
  expect(row.remarks).toMatch(/^IN 38 MIN · RE-WARM ~\$\d/)
  expect(row.alt).toBe('Cache goes cold at 00:38, in 38 minutes')
})
test('the last minute is amber LAST CALL with seconds; the calm last call names the clock', () => {
  const amber = at({ cache: { ...snapOf().cache, requests: 1, msLeft: 47_000, coldAt: 47_000 } }).rows[0]
  expect([amber.cell, amber.cellShort, amber.tone]).toEqual(['LAST CALL 47S', '! 47S', 'amber'])
  const calm = at({ cache: { ...snapOf().cache, requests: 1, msLeft: 5 * MIN, coldAt: 5 * MIN, ttl: '1h' } }).rows[0]
  expect([calm.cell, calm.tone]).toEqual(['LAST CALL 00:05', 'calm'])
})
test('cold departed, at its time when known and without it when not', () => {
  const known = at({ now: HOUR, cache: { ...snapOf().cache, requests: 1, msLeft: 0, coldAt: 10 * MIN } }).rows[0]
  expect(known.cell).toMatch(/^DEPARTED 00:10 · RE-WARM ~\$/)
  const unknown = at({ cache: { ...snapOf().cache, requests: 1, msLeft: 0, coldAt: null } }).rows[0]
  expect(unknown.cell).toMatch(/^DEPARTED · RE-WARM ~\$/)
})
test('working boards, unmeasured checks in, recalled carries ~', () => {
  expect(at({ isWorking: true, cache: { ...snapOf().cache, requests: 1, msLeft: 38 * MIN, coldAt: 38 * MIN } }).rows[0].cell).toBe('BOARDING')
  expect(at({ cache: { ...snapOf().cache, requests: 0, recalled: false } }).rows[0].cell).toBe('CHECK-IN')
  expect(at({ cache: { ...snapOf().cache, requests: 0, recalled: true, msLeft: 38 * MIN, coldAt: 38 * MIN } }).rows[0].cell).toBe('DEPARTS ~00:38')
})
test('an unknown zone counts down: no clock time, no empty cell', () => {
  const rows = at({ zone: undefined }).rows
  for (const r of rows) {
    expect(r.time).not.toMatch(/^\d\d:\d\d$/)
    expect(r.time).not.toBe('')
    expect(r.cell).not.toMatch(/undefined|NaN/)
  }
})
test('limits: an amber remark replaces a calm one and the reset stays; context says USED', () => {
  const seven = at({ sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() } }).rows.find(r => r.key === '7d')
  expect(seven?.cell).toMatch(/^85% ↻ .+ ! NEAR LIMIT$/)
  expect(seven?.tone).toBe('amber')
  expect(at().rows.find(r => r.key === 'context')?.status).toMatch(/^\d+% USED$/)
})
test('no workspace leaves the header out', () => {
  expect(at({ workspace: undefined }).header).toBeUndefined()
})
```

Before writing `snapOf` overrides, check the field names of `snapOf`'s `cache`, `fiveHour` and `sevenDay` in `tests/matrix.ts:25-38` and `hooks/snapshot.ts:25-92`. Use the names they define; the overrides above follow `snapshot.ts`.

Add to `tests/cache-model.test.ts`:

```ts
test('coldAt is the last reply plus the lifetime, and null before any reply', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(cacheView(START_NOW, undefined, 0).coldAt).toBeNull()
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const v = cacheView(clock.now(), undefined, 0)
  expect(v.coldAt).toBe(clock.now() + v.msLeft)
})
```

Use that file's existing names for `START_NOW` and `clock`.

- [ ] **Step 2: Run** `tools/test-only.sh board cache-model`. Expected: FAIL, because `board` and `coldAt` don't exist.
- [ ] **Step 3: Implement.**
  - cache.ts, beside `measuredColdAt`:

```ts
/** When the cache goes or went cold: measured, else recalled; null with nothing to go by. */
const coldAtOf = (): number | null => {
  const measured = measuredColdAt()
  if (measured !== null) return measured
  const recalled = isRecalled() ? recalledAt() : undefined
  return recalled === undefined ? null : recalled + TTL_MS[effectiveTtl()]
}
```

  - Add `coldAt: coldAtOf(),` to `cacheView`'s return, and `coldAt: number | null` with its doc comment to `snapshot.ts`'s cache type. Update every test fixture `tsc` flags (`snapOf` in matrix.ts) with `coldAt: null`.
  - workspace.ts:

```ts
/** The strip's facts as words, for a surface that draws them its own way:
 *  the folder, the branch, and whether anything changed. */
export const stripWords = (ws: Workspace): readonly string[] => {
  const { name } = splitPath(ws.path)
  const git = ws.git
  if (git === undefined) return [name]
  return [name, git.branch ?? 'detached', git.changed ? `${git.changed} changed` : 'clean']
}
```

  - board.ts. All formatting happens here, from `format.ts`, so the view never formats. The forms come from S§5.2 and S§5.3:

```ts
// The departures board's words: one row per reading in the one order, each
// in the board's capitals, with its collapsed cell long and short and its
// alt in plain words. Pure, from the readings; no view formats them.

import { fmtClock, fmtDayClock, fmtEta, fmtEtaSpoken } from './format'
import type { Readings, Tone } from './reading'
import { stripWords } from './workspace'

export type BoardKey = 'cache' | 'spend' | 'context' | '5h' | '7d' | 'other'
export type BoardRow = Readonly<{ key: BoardKey; item: string; status: string; time: string; remarks: string; cell: string; cellShort: string; cellNoReset: string; tone: Tone; alt: string }>
export type Board = Readonly<{ header: readonly string[] | undefined; rows: readonly BoardRow[] }>
export type BoardInput = Pick<Readings, 'frame' | 'cache' | 'spend' | 'context' | 'limits' | 'workspace'> & Readonly<{ coldAt: number | null }>

const NONE = '-'
const up = (s: string): string => s.toUpperCase()
/** A countdown on the board: 'IN 38 MIN', 'IN 1H 04M'. */
const inMs = (ms: number): string => `IN ${up(fmtEta(ms)).replace(/(\d+)M$/, '$1 MIN')}`

const cacheRow = (r: BoardInput): BoardRow => {
  const c = r.cache
  const zone = r.frame.zone
  const now = r.frame.now
  const tilde = c.measured ? '' : '~'
  const clock = r.coldAt === null || zone === undefined ? undefined : `${tilde}${fmtClock(r.coldAt, zone)}`
  const reWarm = `RE-WARM ${up(c.estimate)}`
  const row = (status: string, time: string, remarks: string, cell: string, cellShort: string, tone: Tone, alt: string): BoardRow =>
    ({ key: 'cache', item: 'CACHE', status, time, remarks, cell, cellShort, cellNoReset: cell, tone, alt })
  if (c.mood === 'unmeasured' || c.mood === 'warming') return row('CHECK-IN', NONE, '', 'CHECK-IN', 'CHECK-IN', 'calm', 'Cache not measured yet')
  if (r.frame.isWorking) return row('BOARDING', NONE, '', 'BOARDING', 'BOARDING', 'calm', 'Cache boarding: Claude is working')
  if (c.mood === 'cold') {
    const cell = clock === undefined ? `DEPARTED · ${reWarm}` : `DEPARTED ${clock} · ${reWarm}`
    return row('DEPARTED', clock ?? NONE, reWarm, cell, reWarm, 'calm', `Cache went cold, re-warm about ${c.estimate.replace('~', '')}`)
  }
  const leftMs = c.coldInMs ?? 0
  const countdown = inMs(leftMs)
  if (c.tone === 'amber') {
    const secs = `${Math.max(1, Math.round(leftMs / 1000))}S`
    return row('LAST CALL', secs, reWarm, `LAST CALL ${secs}`, `! ${secs}`, 'amber', `Cache last call, cold in ${Math.round(leftMs / 1000)} seconds, re-warm about ${c.estimate.replace('~', '')}`)
  }
  const time = clock ?? countdown
  const status = c.lastCall ? 'LAST CALL' : 'DEPARTS'
  const spoken = `Cache goes cold${clock === undefined ? '' : ` at ${clock.replace('~', 'about ')}`}, in ${fmtEtaSpoken(leftMs).replace('about ', '')}`
  return row(status, time, `${clock === undefined ? '' : `${countdown} · `}${reWarm} IF MISSED`, `${status} ${time}`, time, 'calm', spoken)
}
```

The cache alt above uses `.replace`. That is allowed here, because `board.ts` is not in `views/`. If `fmtEtaSpoken` already reads "about 38 minutes", keep the "in 38 minutes" form the test expects, and adjust the test only if the spoken helper's wording differs. Then:

```ts
const spendRow = (r: BoardInput): BoardRow => ({
  key: 'spend', item: 'SPEND', status: up(r.spend.totalText), time: NONE,
  remarks: r.spend.lastText === undefined ? '' : `LAST ${up(r.spend.lastText)}`,
  cell: up(r.spend.totalText), cellShort: up(r.spend.totalText), cellNoReset: up(r.spend.totalText), tone: 'calm', alt: `Spent ${r.spend.totalText} this session`,
})

const contextRow = (r: BoardInput): BoardRow => {
  const x = r.context
  if (!x.known) return { key: 'context', item: 'CONTEXT', status: 'NOT REPORTED', time: NONE, remarks: '', cell: 'NOT REPORTED', cellShort: 'NOT REPORTED', cellNoReset: 'NOT REPORTED', tone: 'calm', alt: 'Context not reported' }
  const amber = x.amber
  const status = amber === undefined ? `${x.valueText} USED` : up(amber.long)
  const remarks = [x.roomText === undefined ? '' : `${up(x.roomText)} LEFT`, x.compactsAtText === undefined ? '' : up(x.compactsAtText)].filter(Boolean).join(' · ')
  const cell = amber === undefined ? x.valueText : up(amber.long)
  return { key: 'context', item: 'CONTEXT', status, time: NONE, remarks, cell, cellShort: amber === undefined ? x.valueText : up(amber.short), cellNoReset: cell, tone: amber === undefined ? 'calm' : 'amber', alt: x.alt }
}

const limitRow = (r: BoardInput, l: Readings['limits'][number]): BoardRow => {
  const zone = r.frame.zone
  const resetAt = l.resetInMs === undefined ? undefined : r.frame.now + l.resetInMs
  const time = l.passed ? 'PASSED' : resetAt === undefined ? NONE : zone === undefined ? inMs(l.resetInMs ?? 0) : up(fmtDayClock(resetAt, zone, r.frame.now))
  const amber = l.key === '5h' && l.fullInMs !== undefined && l.tone === 'amber' && zone !== undefined
    ? `! FULL ~${fmtClock(r.frame.now + l.fullInMs, zone)}`
    : l.tone === 'amber' ? '! NEAR LIMIT' : undefined
  const calm = l.fillText === undefined ? (l.pace === '' ? '' : up(l.pace)) : up(l.fillText)
  const remark = amber ?? calm
  const reset = time === NONE ? '' : ` ↻ ${time}`
  const item = l.key === 'other' ? up(l.name) : up(l.key)
  return {
    key: l.key, item, status: amber ?? l.valueText, time, remarks: amber === undefined ? calm : `${l.valueText}${calm === '' ? '' : ` · ${calm}`}`,
    cell: `${l.valueText}${reset}${remark === '' ? '' : ` ${remark}`}`, cellShort: l.valueText,
    cellNoReset: `${l.valueText}${remark === '' ? '' : ` ${remark}`}`, tone: l.tone, alt: l.alt,
  }
}

export const boardOf = (r: BoardInput): Board => {
  const windows = (key: BoardKey) => r.limits.filter(l => l.key === key).map(l => limitRow(r, l))
  return {
    header: r.workspace === undefined ? undefined : stripWords(r.workspace).map(up),
    rows: [cacheRow(r), spendRow(r), contextRow(r), ...windows('5h'), ...windows('7d'), ...windows('other')],
  }
}

export const remarksFit = (row: BoardRow, tiles: number): string =>
  row.remarks.length <= tiles ? row.remarks : tiles <= 1 ? '' : `${row.remarks.slice(0, tiles - 1)}…`
```

Add to `tests/board.test.ts`:

```ts
test('the 7d cell without its reset keeps the remark; remarksFit cuts with an ellipsis', () => {
  const seven = at({ sevenDay: { percentUsed: 85, resetsAt: new Date(67 * HOUR).toISOString() } }).rows.find(r => r.key === '7d')
  expect(seven?.cellNoReset).toBe('85% ! NEAR LIMIT')
  const cache = at().rows[0]
  expect(remarksFit(cache, 6)).toMatch(/^.{5}…$/)
  expect(remarksFit(cache, 200)).toBe(cache.remarks)
})
```

  Check each field the code reads (`c.estimate`, `c.coldInMs`, `x.valueText`, `x.roomText`, `x.compactsAtText`, `x.alt`, `l.fillText`, `l.pace`, `l.valueText`, `l.alt`, `l.resetInMs`, `l.fullInMs`) against `CacheWords`, `ContextWords` and `LimitWords` in `words.ts:131-312`. Where a name differs, use the existing one; don't add a duplicate.
  - reading.ts: add `board: Board` to `Readings` with a doc comment ("The departures board's rows; built the first time a view reads it"). In `readingsOf`, add `let board: Board | undefined` and a getter that builds the readings without `board` first, then calls `boardOf({ frame, cache: <the built cache>, spend: …, context: …, limits, workspace: snap.workspace, coldAt: c.coldAt })`. Build the three section objects once as `const`s, and use them in both the return value and the getter.
- [ ] **Step 4: Run** `tools/test-only.sh board cache-model readings golden-hash`. Expected: PASS.
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: the departures board's words, from the readings, with the cache's cold-at time"
```

---

### Task 5: Chart primitives for the two views

**Files:**
- Modify: `hooks/charts.tsx` (`barChart` gains `shape`; `sparkline` gains `nowAt`; new `heartbeat`)
- Create: `hooks/flaps.tsx`
- Test: `tests/charts.test.ts` and `tests/flaps.test.ts` (new)

**Interfaces:**
- `barChart(kit, { …, shape?: 'bars' | 'beats' })`. `'beats'` draws each value as an ECG spike: a baseline, an up-stroke to the value, a down-stroke a little below the baseline, and back. A marked value is capped flat at the top. Text is unchanged (braille).
- `sparkline(kit, { …, nowAt?: number })`. `nowAt` is the index of now in `values`: points after it are drawn dashed (a projection), and a 1 px label-ink rule marks now. Text is unchanged.
- `heartbeat(kit, { key, alt, state: 'still' | 'beat' | 'flat' | 'hollow', color, motion: boolean }): RenderChildren`: a 12 px Svg on the desktop, `isInteractive` only when `state === 'beat' && motion`; null elsewhere.
- `flaps(kit, { key, alt, text: string, ink: string, bg: string, seam: string, tilePx?: number }): RenderChildren`: on the desktop one Svg, `tilePx` (default 10) per character, 20 px tall, monospace `<text>` per tile, a 1 px seam at y = 10. In the terminal, `<Text backgroundColor={bg} color={ink}>{text}</Text>`. Also exported: `flapsWidth(text: string, tilePx = 10): number`.

- [ ] **Step 1: Write the failing tests** in `tests/flaps.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'
import { flaps, flapsWidth } from '../hooks/flaps'
import { makeKit } from '../hooks/kit'
import { fakeEl, svgsOf, shown } from './helpers'
import { snapOf } from './matrix'

const kitOn = (surface: 'desktop' | 'terminal') => makeKit(fakeEl, snapOf({ surface }))
test('desktop flaps: one Svg, a tile per character, a seam, monospace, no id', () => {
  const [svg] = svgsOf(flaps(kitOn('desktop'), { key: 'f', alt: 'Cache goes cold at 17:24', text: 'CACHE', ink: '#fff', bg: '#222', seam: '#000' }))
  const src = String(svg?.props?.source)
  expect(svg?.props?.width).toBe(flapsWidth('CACHE'))
  expect(svg?.props?.height).toBeLessThanOrEqual(20)
  expect(src.match(/<rect class="tile"/g)).toHaveLength(5)
  expect(src).toMatch(/class="seam"/)
  expect(src).toMatch(/ui-monospace, monospace/)
  expect(src).not.toMatch(/\bid=|preserveAspectRatio="none"/)
  expect(svg?.props?.alt).toBe('Cache goes cold at 17:24')
})
test('terminal flaps: the text on its ground', () => {
  expect(shown(flaps(kitOn('terminal'), { key: 'f', alt: 'x', text: 'CACHE', ink: '#fff', bg: '#222', seam: '#000' }))).toBe('CACHE')
})
test('flap text is escaped', () => {
  const [svg] = svgsOf(flaps(kitOn('desktop'), { key: 'f', alt: 'x', text: '<&>', ink: '#fff', bg: '#222', seam: '#000' }))
  expect(String(svg?.props?.source)).toMatch(/&lt;.*&amp;.*&gt;/)
})
```

Add to `tests/charts.test.ts`:

```ts
test('beats: one path, no NaN with one value or all re-warms', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  for (const [values, marked] of [[[0.2], [false]], [[0.8, 0.9], [true, true]], [[0, 0], [false, false]]] as const) {
    const [svg] = svgsOf(barChart(k, { key: 'b', alt: 'a', values, marked, color: '#fff', markColor: '#fff', px: 84, height: 20, shape: 'beats' }))
    expect(String(svg?.props?.source)).not.toMatch(/NaN|Infinity/)
    expect(String(svg?.props?.source)).toMatch(/<path class="beats"/)
  }
})
test('sparkline nowAt: a now rule, and the points after it dashed', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  const [svg] = svgsOf(sparkline(k, { key: 's', alt: 'a', values: [1, 2, 3, 4, 5], color: '#fff', px: 60, height: 16, max: 10, nowAt: 2 }))
  const src = String(svg?.props?.source)
  expect(src).toMatch(/class="now"/)
  expect(src).toMatch(/class="ahead"[^>]*stroke-dasharray/)
})
test('heartbeat: interactive only when it beats with motion; still otherwise', () => {
  const k = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
  const of = (state: 'still' | 'beat' | 'flat' | 'hollow', motion: boolean) => svgsOf(heartbeat(k, { key: 'h', alt: 'a', state, color: '#E8B04A', motion }))[0]
  expect(of('beat', true)?.props?.isInteractive).toBe(true)
  expect(of('beat', false)?.props?.isInteractive).toBeUndefined()
  expect(of('still', true)?.props?.isInteractive).toBeUndefined()
  expect(String(of('flat', false)?.props?.source)).toMatch(/<line/)
})
```

- [ ] **Step 2: Run** `tools/test-only.sh flaps charts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `charts.tsx`. The beats shape:

```tsx
// In barChart, after `const y = …`:
if (o.shape === 'beats') {
  const step = values.length <= 1 ? px : px / values.length
  const base = height - 4
  const d = values.map((v, i) => {
    const x0 = tenth(i * step), peak = tenth(x0 + step * 0.45), dip = tenth(x0 + step * 0.6), x1 = tenth(x0 + step)
    const top = marked[i] === true ? CAP_ROOM : y(v)
    // A re-warm is capped flat across its peak, so its shape says what it is.
    const crest = marked[i] === true ? `L${tenth(peak - 1.5)},${top}L${tenth(peak + 1.5)},${top}` : `L${peak},${top}`
    return `${i === 0 ? 'M' : 'L'}${x0},${base}${crest}L${dip},${Math.min(height - 1, base + 3)}L${x1},${base}`
  }).join('')
  const rule = level === undefined ? '' : `<line class="level" x1="0" y1="${y(level)}" x2="${px}" y2="${y(level)}" stroke="${palette.label}" stroke-width="1" stroke-dasharray="1 2"/>`
  const beats = `<path class="beats" d="${d}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/>`
  return <Svg key={key} source={svgOf(px, height, rule + beats)} alt={alt} width={px} height={height} />
}
```

With `top <= 0`, `y` already returns `height - 1`, so an all-zero trace is a flat line and never NaN. For a single value, `step = px`, so there is no division by `values.length - 1`.

In `sparkline`, when `nowAt` is set, split `points` at `nowAt`:
- draw `points.slice(0, nowAt + 1)` as the solid polyline;
- draw `points.slice(nowAt)` as `<polyline class="ahead" … ${PROJECTION_DASH}/>`;
- add `<line class="now" x1="${x(nowAt)}" y1="0" x2="${x(nowAt)}" y2="${height}" stroke="${palette.label}" stroke-width="1"/>`.

`projectTo` and `nowAt` are exclusive; document that in the option's comment.

`heartbeat`:

```tsx
export const heartbeat = (kit: Kit, o: Readonly<{ key: string; alt: string; state: 'still' | 'beat' | 'flat' | 'hollow'; color: string; motion: boolean }>): RenderChildren => {
  const { Svg, palette } = kit
  if (!Svg) return null
  const { key, alt, state, color, motion } = o
  const body =
    state === 'flat' ? `<line x1="0" y1="6" x2="12" y2="6" stroke="${palette.label}" stroke-width="1.4" stroke-linecap="round"/>`
    : state === 'hollow' ? `<circle cx="6" cy="6" r="3.5" fill="none" stroke="${color}" stroke-width="1.2"/>`
    : `<circle cx="6" cy="6" r="3.5" fill="${color}"/>`
  const beats = state === 'beat' && motion
  // Motion only for an amber cache, and never against reduced motion.
  const style = beats ? '<style>@keyframes b{0%,100%{r:3.5}30%{r:5.5}}circle{animation:b .6s ease-in-out infinite}@media (prefers-reduced-motion:reduce){circle{animation:none}}</style>' : ''
  return <Svg key={key} source={svgOf(12, 12, style + body)} alt={alt} width={12} height={12} {...(beats ? { isInteractive: true } : {})} />
}
```

`flaps.tsx`:

```tsx
// The split-flap board's tiles: each character on its own tile with a seam
// across its middle, in a monospace face, on the desktop; a run of text on
// its ground elsewhere. Geometry lives here, not in views/, which the gate
// keeps free of arithmetic on pixels.

import type { RenderChildren } from 'claude-code'
import type { Kit } from './kit'

const TILE_PX = 10
const TILE_GAP = 1
const FLAP_PX = 20
const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const flapsWidth = (text: string, tilePx = TILE_PX): number => text.length * (tilePx + TILE_GAP) - TILE_GAP

export const flaps = (kit: Kit, o: Readonly<{ key: string; alt: string; text: string; ink: string; bg: string; seam: string; tilePx?: number }>): RenderChildren => {
  const { Svg, Text } = kit
  const { key, alt, text, ink, bg, seam, tilePx = TILE_PX } = o
  if (!Svg) return <Text key={key} color={ink} backgroundColor={bg}>{text}</Text>
  const width = flapsWidth(text, tilePx)
  const tiles = [...text].map((ch, i) => {
    const x = i * (tilePx + TILE_GAP)
    const glyph = ch === ' ' ? '' : `<text x="${x + tilePx / 2}" y="14.5" text-anchor="middle" font-family="ui-monospace, monospace" font-size="12" font-weight="600" fill="${ink}">${escape(ch)}</text>`
    return `<rect class="tile" x="${x}" y="0" width="${tilePx}" height="${FLAP_PX}" rx="1.5" fill="${bg}"/>${glyph}<rect class="seam" x="${x}" y="9.5" width="${tilePx}" height="1" fill="${seam}"/>`
  })
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${FLAP_PX}" viewBox="0 0 ${width} ${FLAP_PX}">${tiles.join('')}</svg>`
  return <Svg key={key} source={source} alt={alt} width={width} height={FLAP_PX} />
}
```

Each tile carries its own seam; the test counts `class="tile"` only.
- [ ] **Step 4: Run** `tools/test-only.sh flaps charts golden-hash`. Expected: PASS, with chips unchanged: `barChart`'s default `shape` is `'bars'`.
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: beats, a now mark, the heartbeat and split-flap tiles for the new layouts"
```

---

### Task 6: The board's palette

**Files:**
- Modify: `hooks/palette.ts` (the `Palette` type, `DARK`, `LIGHT`, `PLAIN`)
- Test: `tests/design.test.ts`

**Interfaces:** adds these to `Palette`: `boardBg`, `flapBg`, `flapSeam`, `flapItemCache`, `flapItemSpend`, `flapItemContext`, `flapItem5h`, `flapItem7d`, `flapText`, `flapDim` and `flapAmber`.

- [ ] **Step 1: Write the failing test** in `tests/design.test.ts`, using the file's existing contrast helper (find it with `grep -n "contrast" tests/design.test.ts`):

```ts
const BOARD_INKS = ['flapItemCache', 'flapItemSpend', 'flapItemContext', 'flapItem5h', 'flapItem7d', 'flapText', 'flapDim', 'flapAmber'] as const
test('the board is dark in dark and light alike, and every ink reads on its tiles', () => {
  for (const p of [DARK, LIGHT]) {
    for (const ink of BOARD_INKS) expect(contrast(p[ink], p.flapBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(p.flapSeam, p.flapBg)).toBeGreaterThanOrEqual(3)
  }
  for (const k of ['boardBg', 'flapBg', ...BOARD_INKS] as const) expect(LIGHT[k]).toBe(DARK[k])
})
```

- [ ] **Step 2: Run** `tools/test-only.sh design`. Expected: FAIL, because the keys are missing.
- [ ] **Step 3: Implement.** Add the 11 keys to the type, each with a one-line doc comment. Give DARK and LIGHT these exact hex values:

```ts
boardBg: '#141414', flapBg: '#262626', flapSeam: '#0A0A0A',
flapItemCache: '#7FD48A', flapItemSpend: '#E8C25A', flapItemContext: '#9DB4D0',
flapItem5h: '#6FD3A8', flapItem7d: '#B7A6F2',
flapText: '#F2EEE3', flapDim: '#B9B4A8', flapAmber: '#F5B14C',
```

PLAIN maps them to its theme keys: `boardBg` and `flapBg` to its `surface`; the items, `flapText` and `flapDim` to its `value` and `label`; `flapAmber` to its `amberFg`. If the test reports a pair under 4.5:1, lighten the ink, keep its hue, and record the new value here in the plan.
- [ ] **Step 4: Run** `tools/test-only.sh design golden-hash`. Expected: PASS.
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: the departures board's palette, dark in every appearance but plain"
```

---

### Task 7: Rebuild departures

**Files:**
- Rewrite: `hooks/views/departures.tsx` (the collapsed row, and the open board in the same file while under about 300 lines; otherwise `views/departures-board.tsx`)
- Modify: `tests/cases.ts` and `tests/matrix.ts` (board forms; flap words read from `<text>`)
- Rewrite: `tests/view-departures.test.ts`

**Interfaces:**
- Consumes: `read.board` (Task 4), `flaps` and `flapsWidth` (Task 5), the palette's board keys (Task 6), and `footer`, `toggleButton` and `bodyRowsFor` (Task 2).
- Produces: `departuresView: View`, with `rows: { desktop: 1, terminal: 1 }`.

- [ ] **Step 1: Teach the matrix the board.**
  - In `tests/helpers.ts`, `shown()` leaves Svg empty. Add `flapWords(n): string`, which walks the Svgs and joins each `<text …>X</text>` run, so a test can read a flap's words.
  - In `tests/matrix.ts` `invariantErrors`, check `shown(tree) + flapWords(tree)` wherever it checks words now (amber, NaN, glyphs, `~`).
  - Extend `AMBER_WORDS`:

```ts
cacheLastMinute: /…existing…|LAST CALL \d+S|! \d+S/,
nearCompaction: /…existing…|! COMPACTS IN ~\d+K|! CONTEXT \d+%/,
contextNoCompaction: /…existing…|! CONTEXT \d+%/,
limit80: /…existing…|5H [^!]*! NEAR LIMIT|! NEAR LIMIT/,
fiveHourAhead: /…existing…|! FULL ~\d\d:\d\d/,
```

  - Add `-` (already ASCII) to the allowed TIME placeholder, and confirm `↻` is in `UNICODE_TIER` (it is).
  - Add the one-order invariant for pulse and departures. In collapsed rows, the readings' first appearances must be in order: `/cache|CACHE/` before `/\$|SPEND/` before `/context|CONTEXT/` before `/5h|5H/` before `/7d|7D/`, for each one present.
  - Add an import invariant as a plain test in `tests/views.test.ts`. Read `hooks/views/{pulse,departures}.tsx` with the test fs helper used elsewhere, or as a literal check through `tools/views-gate.sh`; whichever exists. Expect no `from './cards'` and no `pill(`.
- [ ] **Step 2: Write the failing view tests** in `tests/view-departures.test.ts`:

```ts
viewSuite('departures')

const band = (over: Partial<BandSnapshot> = {}): Node =>
  drawBand(fakeEl, snapOf({ layout: 'departures', columns: 160, maxRows: 13, zone: fixedZone(0), ...over }), NO_ACT) as unknown as Node
const words = (n: Node) => shown(n) + flapWords(n)

test('collapsed: one row of flap groups in the one order, then ▵', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const row = firstRow(band({ surface })) as Node
    expect(words(row)).toMatch(/CACHE.*DEPARTS.*SPEND.*\$.*CONTEXT.*5H.*7D/)
    expect(byKey(row.children?.at(-1), 'more', 'Button')?.props?.label).toBe('▵')
    expect(visualRows(row, surface)).toBe(1)
  }
})
test('desktop draws flaps and no chips pills; every flap Svg is at most 20 px tall', () => {
  const svgs = svgsOf(band({ surface: 'desktop' }))
  expect(svgs.length).toBeGreaterThan(4)
  for (const s of svgs) expect(Number(s.props?.height)).toBeLessThanOrEqual(20)
})
test('at 40 columns, cache in its last minute and 7d at 80%: CACHE and 7D stay and ▵ is never clipped', async ($, on) => {
  const drawn = await drawCases($, on, { layout: 'departures', scenario: 'lastMinute', usage: { ...USAGE, rateLimits: withLimits(30, 82) } }, [{ surface: 'terminal', cols: 40 }])
  for (const row of Object.values(drawn).map(t => firstRow(t) as Node)) {
    expect(words(row)).toMatch(/CACHE.*7D/)
    expect(shown(row)).toMatch(/▵$/)
  }
})
test('open: a header of the workspace, ITEM STATUS TIME REMARKS, five rows, the footer', () => {
  const open = band({ surface: 'terminal', expanded: true })
  const text = words(open)
  expect(text).toMatch(/ITEM\s+STATUS\s+TIME\s+REMARKS/)
  expect(text).toMatch(/CACHE[\s\S]*SPEND[\s\S]*CONTEXT[\s\S]*5H[\s\S]*7D/)
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
})
test('open at maxRows 4 keeps the footer; the body gives way whole', () => {
  const open = band({ surface: 'terminal', expanded: true, maxRows: 4 })
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
  expect(visualRows(open, 'terminal')).toBeLessThanOrEqual(4)
})
```

`drawCases`' options are `CaseOptions` in `tests/cases.ts:103`. Match its field names, and export `withLimits` from cases.ts if it isn't already. Drive the other states (unknown zone, no workspace) through the scenarios, not hand-made snapshots. `viewSuite('departures')` already covers every scenario, width and `maxRows`.
- [ ] **Step 3: Run** `tools/test-only.sh view-departures views matrix`. Expected: FAIL.
- [ ] **Step 4: Implement `departures.tsx`:**

```tsx
// Departures, the split-flap board: each reading a line on the board, what
// it is, its status, when, and a remark, in the one order. Collapsed, the
// board's cells in a row; open, the board itself. The words are the
// board's (hooks/board.ts); this file only lays tiles.

import type { RenderElement } from 'claude-code'
import type { BoardKey, BoardRow } from '../board'
import { flaps, flapsWidth } from '../flaps'
import type { Kit } from '../kit'
import { ROW_SLACK } from '../layout'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { bodyRowsFor, footer, toggleButton } from './frame'
import { fitLine, line } from './parts'
import type { View } from './view'

const ITEM_INK: Readonly<Record<BoardKey, 'flapItemCache' | 'flapItemSpend' | 'flapItemContext' | 'flapItem5h' | 'flapItem7d'>> =
  { cache: 'flapItemCache', spend: 'flapItemSpend', context: 'flapItemContext', '5h': 'flapItem5h', '7d': 'flapItem7d', other: 'flapItemContext' }

/** What gives way, first to last (S§5.2); amber never does, CACHE and 7D never go. */
const ORDER = ['reset5h', 'reset7d', 'spend', 'context', 'remark5h', 'short'] as const
type Piece = (typeof ORDER)[number]

const group = (kit: Kit, row: BoardRow, cell: string): RenderElement => {
  const { Box, palette } = kit
  const ink = row.tone === 'amber' ? palette.flapAmber : palette.flapText
  return (
    <Box key={row.key} flexDirection="row" columnGap={1} flexShrink={0}>
      {flaps(kit, { key: 'item', alt: row.alt, text: row.item, ink: palette[ITEM_INK[row.key]], bg: palette.flapBg, seam: palette.flapSeam })}
      {flaps(kit, { key: 'cell', alt: cell, text: cell, ink, bg: palette.flapBg, seam: palette.flapSeam })}
    </Box>
  )
}
```

The collapsed row picks among the row's `cell`, `cellNoReset` and `cellShort` (Task 4), so the view never cuts a string:

```tsx
const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => {
    const rows = read.board.rows.filter(r => r.key !== 'other')
    const shown = rows.filter(r =>
      r.key === 'cache' || r.key === '7d' || r.tone === 'amber' ||
      (r.key === 'spend' ? keeps.has('spend') : r.key === 'context' ? keeps.has('context') : true))
    const cell = (r: BoardRow) =>
      r.key === '5h' ? (keeps.has('reset5h') ? r.cell : keeps.has('remark5h') || r.tone === 'amber' ? r.cellNoReset : r.cellShort)
      : r.key === '7d' ? (keeps.has('reset7d') ? r.cell : keeps.has('short') || r.tone === 'amber' ? r.cellNoReset : r.cellShort)
      : keeps.has('short') ? r.cell : r.cellShort
    return line(kit, 'row', shown.map(r => group(kit, r, cell(r))), toggleButton(kit, read, act))
  })
```

The open board. Each board row is one `Box` row of four columns. ITEM, STATUS and TIME get fixed widths: the longest cell in that column across the rows, in tiles. REMARKS takes the rest, clipped by `flapsWidth`: drop characters from the end until it fits, done in `board.ts` as `remarksFit(row, tiles)` so no view slices strings. The header row is `read.board.header` joined by three spaces, as one flap group in `flapDim`, left out when `undefined`. The body takes `bodyRowsFor(maxRows, 1, 0)` rows (the strip is the header, so `stripRows = 0`) and gives way per S§5.3:
1. `otherLimits`;
2. the column headings;
3. SPEND;
4. CONTEXT;
5. the header;
6. 5H;
7. everything.

The footer is `footer(kit, read, act, null, false)`. The whole board sits in a `Box backgroundColor={palette.boardBg}` with `paddingX={1}`, except in plain, where `palette.filled` is false and there's no ground. The toggle and the footer stay outside that Box.

```tsx
export const departuresView: View = {
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => {
    const { Box } = kit
    return (
      <Box flexDirection="column">
        {collapsed(kit, read, act)}
        {read.frame.expanded ? board(kit, read, act) : null}
      </Box>
    )
  },
}
```

- [ ] **Step 5: Run** `tools/test-only.sh view-departures board views matrix golden-hash`, then `tools/views-gate.sh`. Expected: PASS, and the gate prints nothing.
- [ ] **Step 6: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: departures is a split-flap board, collapsed and open"
```

---

### Task 8: Pulse's words and the 5h window's points

**Files:**
- Modify: `hooks/words.ts` (`HistoryWords.avgText`)
- Modify: `hooks/reading.ts` (`HistoryReading.fiveHourWindow`)
- Test: `tests/insights.test.ts` and `tests/readings.test.ts`

**Interfaces:**
- `HistoryWords.avgText: string | undefined`: `'avg ~$0.02'`, the warm average, or `undefined` before any cost.
- `HistoryReading.beatsTop: number`: the beats' scale, `max(2 × warmAvgUsd, the largest warm cost)`, or `max(costValues)` when every cost is a re-warm, or 1 when there are none. It is never 0.
- `WeekWords.daysAlt: string`: `'7d by day: Mon 9%, Tue 15%, Wed about 7%'`, with guesses spoken as "about"; `''` without days.
- `HistoryReading.fiveHourWindow: Readonly<{ values: readonly number[]; nowAt: number | undefined; projected: boolean }>`: one point per hour slice of the 5h window, cumulative percent used, from `week.hourRow`. Guessed points count as projected. `nowAt` is the index of the slice holding now. With no samples, `values` is empty.

- [ ] **Step 1: Write the failing tests:**

```ts
test('avgText is the warm average, re-warms left out, as an estimate', () => {
  const words = historyWords({ costs: [{ usd: 0.02, reWarm: false }, { usd: 0.9, reWarm: true }, { usd: 0.02, reWarm: false }], context: [], fiveHour: [] }, undefined, CONTEXT, 0)
  expect(words.avgText).toBe('avg ~$0.02')
  expect(historyWords({ costs: [], context: [], fiveHour: [] }, undefined, CONTEXT, 0).avgText).toBeUndefined()
})
test('fiveHourWindow climbs cell by cell to now, then guesses', () => {
  const w = readingsOf(snapOf({ samples: SAMPLES_5H, zone: fixedZone(0) })).history.fiveHourWindow
  expect(w.values.length).toBe(5)
  expect(w.nowAt).toBeGreaterThanOrEqual(0)
  for (let i = 1; i < w.values.length; i++) expect(w.values[i]).toBeGreaterThanOrEqual(w.values[i - 1] ?? 0)
})
test('beatsTop is never 0 and leaves re-warms out', () => {
  const h = (costs: { usd: number; reWarm: boolean }[]) => readingsOf(snapOf({ history: { costs, context: [], fiveHour: [] } })).history.beatsTop
  expect(h([])).toBe(1)
  expect(h([{ usd: 0.02, reWarm: false }, { usd: 0.9, reWarm: true }])).toBe(0.04)
  expect(h([{ usd: 0.9, reWarm: true }])).toBe(0.9)
})
test('daysAlt speaks each day, a guess as about', () => {
  expect(readingsOf(snapOf({ samples: SAMPLES_7D, zone: fixedZone(0) })).week.daysAlt).toMatch(/^7d by day: \w{3} \d+%/)
})
test('fiveHourWindow with no samples is empty', () => {
  expect(readingsOf(snapOf({ samples: [] })).history.fiveHourWindow.values).toEqual([])
})
```

Take `CONTEXT`, `SAMPLES_5H` and `SAMPLES_7D` from the fixtures already in `tests/readings.test.ts` and `tests/calendar.test.ts`. Reuse them; don't add new ones.
- [ ] **Step 2: Run** `tools/test-only.sh insights readings`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In reading.ts' `historyFacts`, compute `beatsTop` as its interface says. In words.ts' `weekWords`, build `daysAlt` from the day cells' `name.slice(0, 3)` and `text`, with `~` spoken as "about ".
  - In words.ts: `avgText: avg === undefined ? undefined : `avg ${fmtEstimate(avg)}`` inside `historyWords`, plus its doc line in `HistoryWords`.
  - In reading.ts, `history` is built before `week`. Make the `history` getter read `this.week`, or build `fiveHourWindow` inside the `week` getter and have `history` spread it lazily. Either way, build each once. The points: walk `week.hourRow.marks`, adding each mark's `pct` to a running total. `projected` is true when any mark is `guess` or `fills`. `nowAt = Math.floor(hourRow.notch)` when the notch is defined.
- [ ] **Step 4: Run** `tools/test-only.sh insights readings golden-hash`. Expected: PASS.
- [ ] **Step 5: Commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: pulse's average and the 5h window's points, from the readings"
```

---

### Task 9: Rebuild pulse

**Files:**
- Rewrite: `hooks/views/pulse.tsx` (collapsed)
- Create: `hooks/views/pulse-open.tsx` (the open stack)
- Rewrite: `tests/view-pulse.test.ts`

**Interfaces:**
- Consumes: `barChart` with `shape: 'beats'`, `sparkline` with `nowAt`, `dayCells` and `heartbeat` (Task 5); `history.avgText` and `history.fiveHourWindow` (Task 8); `read.week.days`; and `footer`, `toggleButton` and `bodyRowsFor` (Task 2).
- Produces: `pulseView: View`, with `rows: { desktop: 1, terminal: 1 }`.
- Imports a `MOTION` constant from `pulse.tsx`. Set it per Task 1's result: `true` only if the spike said motion ships.

- [ ] **Step 1: Write the failing view tests** in `tests/view-pulse.test.ts`. Keep the file's `COSTS`, `FIVE_HOUR`, `HISTORY` and `SAMPLES` fixtures, and replace the tests:

```ts
viewSuite('pulse')

test('collapsed is one row, in the one order: heartbeat, beats, context trail, 5h window, 7d days, ▵', () => {
  const row = rowOf({ surface: 'desktop' })
  const alts = svgAlts(row)
  expect(alts.findIndex(a => /^cache/.test(a))).toBeLessThan(alts.findIndex(a => /^cost of/.test(a)))
  expect(alts.findIndex(a => /^context/.test(a))).toBeLessThan(alts.findIndex(a => /^5h/.test(a)))
  expect(alts.findIndex(a => /^5h/.test(a))).toBeLessThan(alts.findIndex(a => /^7d/.test(a)))
  expect(visualRows(row, 'desktop')).toBe(1)
})
test('no chips pill, battery or meter in pulse', () => {
  const row = rowOf({ surface: 'desktop' })
  expect(svgAlts(row).some(a => /battery/.test(a))).toBe(false)
  expect(pillKeys(row)).toEqual([])
})
test('the beats are a path, a re-warm capped flat', () => {
  const beats = svgsOf(rowOf({ surface: 'desktop' })).find(s => /^cost of/.test(String(s.props?.alt)))
  expect(String(beats?.props?.source)).toMatch(/<path class="beats"/)
})
test('the heartbeat is still while warm and flat when cold', () => {
  const warm = svgsOf(rowOf({ surface: 'desktop' })).find(s => /^cache/.test(String(s.props?.alt)))
  expect(warm?.props?.isInteractive).toBeUndefined()
  expect(String(warm?.props?.source)).toMatch(/<circle/)
})
test("no costs yet says so in the trace's place", () => {
  expect(shown(rowOf({ history: { costs: [], context: [], fiveHour: [] } }))).toContain(EMPTY.costs)
})
test('open: Cache, Spend, Context, Limits bands then the footer; fits 13 rows', () => {
  const open = band({ surface: 'desktop', expanded: true, maxRows: 13 })
  const alts = svgAlts(open)
  expect(alts.some(a => /^cost of the last 24/.test(a))).toBe(true)
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
  expect(visualRows(open, 'desktop')).toBeLessThanOrEqual(13)
})
test('open at maxRows 4 keeps the footer', () => {
  const open = band({ surface: 'terminal', expanded: true, maxRows: 4 })
  expect(byKey(open, 'collapse', 'Button')).toBeDefined()
  expect(visualRows(open, 'terminal')).toBeLessThanOrEqual(4)
})
test('one cost, or every cost a re-warm, draws no NaN', () => {
  for (const costs of [[{ usd: 0.2, reWarm: false }], [{ usd: 0.8, reWarm: true }, { usd: 0.9, reWarm: true }]]) {
    const src = svgsOf(rowOf({ surface: 'desktop', history: { ...HISTORY, costs } })).map(s => String(s.props?.source)).join('')
    expect(src).not.toMatch(/NaN|Infinity/)
  }
})
```

- [ ] **Step 2: Run** `tools/test-only.sh view-pulse`. Expected: FAIL.
- [ ] **Step 3: Implement `pulse.tsx`:**

```tsx
// Pulse, the session's trace: each message a beat, the cache a heartbeat,
// context and the 5h window as lines over time, the week as its days, in the
// one order. Open, a stack of charts with their words (pulse-open.tsx).

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

/** Set by the heartbeat spike (design/2026-10-12-three-layouts-spec.md §4.1). */
export const MOTION = false

const ORDER = ['last', 'contextTrail', 'beats14', 'fiveTrail', 'sevenDays', 'beats'] as const
/** The beats' width in px for 14 and for 8 messages, 6 px a beat. */
const BEATS_PX = { 14: 84, 8: 48 } as const

const words = (kit: Kit, key: string, text: string, amber: boolean): RenderChildren => {
  const { Text, palette, onTone } = kit
  return <Text key={key} color={onTone(amber ? 'amber' : 'calm', palette.value)}>{text}</Text>
}
```

Build the row with `fitLine(kit, ORDER, kit.columns - ROW_SLACK, keeps => line(kit, 'row', pieces, toggleButton(kit, read, act)))`, where `pieces` is:
1. **Cache:** `heartbeat(kit, { key: 'beat', alt: read.cache.alt, state, color, motion: MOTION })`.
   - `state` is `'flat'` when cold, `'hollow'` when unmeasured or warming, `'beat'` when amber, otherwise `'still'`.
   - `color` is `palette.amberFg` when amber, otherwise `palette.warm`.
   - Then `words(…, read.cache.amber?.long ?? read.cache.text, …)`.
2. **Spend:**
   - With `read.history.empty`, `EMPTY.costs` in label ink.
   - Otherwise, while `keeps.has('beats')`, `barChart(kit, { shape: 'beats', values: costValues.slice(-n), marked: reWarms.slice(-n), color: palette.value, markColor: palette.value, px: BEATS_PX[n], height: 20, max: read.history.beatsTop, alt: costsAltOf(n) })`, with `n = keeps.has('beats14') ? 14 : 8`.
   - The scale is `max: read.history.beatsTop` (Task 8), so the view does no arithmetic.
   - Then `read.spend.totalText`, and `· ${numbersShort}` while `keeps.has('last')`.
3. **Context:** while `keeps.has('contextTrail')` and `history.context.length > 1`, `sparkline(kit, { values: history.context, max: context window, px: 36, height: 16, color: palette.label, alt: history.contextTrailAlt })`. Then `read.context.amber?.long ?? `context ${read.context.valueText}``.
4. **5h,** when there is one: while `keeps.has('fiveTrail')` and `fiveHourWindow.values.length > 1`, `sparkline(kit, { values, nowAt, max: 100, px: 48, height: 16, color: palette.fiveAccent, alt: history.trailAlt })`. Then `fiveHour.amber?.long ?? `5h ${fiveHour.valueText}``.
5. **7d,** when there is one: while `keeps.has('sevenDays')` and `read.week.days.length === 7`, `dayCells(kit, { values: days.map(d => d.pct), guess: days.map(d => d.guess), today: days.findIndex(d => d.today), color: palette.weekAccent, cellPx: 4, height: 14, max: 100, alt: read.week.daysAlt })`. Then `sevenDay.amber?.long ?? `7d ${sevenDay.valueText}``.

`pulse-open.tsx` exports `openStack(kit, read, act): RenderElement`. It is a column of bands, each a row: the chart (`flexGrow={1}`), then its words (`flexShrink={0}`) in `palette.label`/`palette.value`:
- **Cache:** 1 row, the same heartbeat, then `[read.cache.text, read.cache.coldAtText, read.cache.reWarm phrase]` joined by ` · `. Use the existing words, which the implementer finds in `CacheWords`.
- **Spend:** 2 rows: beats with `level: warmAvgUsd`, the last 24 messages, `height: 40`. Words: `[totalText, numbersShort, avgText]`.
- **Context:** 2 rows: `sparkline` with `history.context`, `height: 40`, and the compaction line as `max` and a rule. Words: `[valueText, roomText + ' left', compactsAtText]`.
- **Limits:** 3 rows: two Boxes side by side, `width="50%"`.
  - 5h: `sparkline` with `nowAt`, `height: 64`, and words `[valueText, pace, '↻ ' + resetClock]`.
  - 7d: `dayCells` with `cellPx: 18`, `height: 56`, and words `[valueText, fillText, '↻ ' + resetClock]`.
- `otherLimits`: one line of words.

Each phrase comes from the readings, and the view only joins with ` · `. Use the existing `BETWEEN` constant if there is one; otherwise add `const DOT = ' · '` at the top of the file. Fit the stack with `bodyRowsFor(read.frame.maxRows, 1, 0)` and S§4.2's give-way:
1. `otherLimits`;
2. Context;
3. Limits to 2 rows;
4. Limits to words;
5. Spend to words;
6. Cache;
7. everything.

Then `footer(kit, read, act, strip, true)` with the strip in the footer row. Its room is `kit.columns - ROW_SLACK - footerRoom(kit)`, the same way `openBody` sizes it.

Pixel heights for the open charts: one desktop row is 24 px. A 2-row chart is 40 px plus air, and a 3-row chart is 64 px. `visualRows` rounds the total to rows.

```tsx
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

- [ ] **Step 4: Run** `tools/test-only.sh view-pulse views matrix golden-hash`, then `tools/views-gate.sh`. Expected: PASS.
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "feat: pulse draws the session as a trace, collapsed and open"
```

---

### Task 10: The cards are chips' alone

**Files:**
- Modify: `hooks/views/cards.tsx`, `hooks/views/view.ts` and `hooks/views/chips.tsx`
- Test: `tests/cards.test.ts`

**Interfaces:**
- `OpenOptions` becomes `{ collapsedRows: number }`.
- `defineCardsView` and `CardOptions` are deleted.
- `chipsView.draw` calls `cardsView(kit, read, act, lines, { collapsedRows })` directly.

- [ ] **Step 1: Delete the options.** Remove every `OpenOptions` field but `collapsedRows`, and the code only they reach: `Fact` (keep it if `factRow` still uses it), `WindowFact`, `SlotForms`, `Slots`, `isForms`, `Lead`, `Leads`, `FactLead`, `isLead`, `leadOf`, `saidOf`, the compact-split branch, and the `'clock'` branch of `cardResetLess`. Also remove `defineCardsView` and `CardOptions` from `view.ts`. `tsc -p plugins/session-usage-band` names every remaining reader; each one is dead.
- [ ] **Step 2: Fix the tests.** In `tests/cards.test.ts`, delete only the tests that pass the removed options. Every chips case stays.
- [ ] **Step 3: Run** `tools/test-only.sh cards golden-hash golden-a golden-b chips`. Expected: PASS, with every chips hash unchanged.
- [ ] **Step 4: Update CONTRIBUTING.md:130.** "made with `defineCardsView`" becomes "which draws its own collapsed row and open view, and shares only `views/frame.tsx` (the toggle, `bodyRowsFor` and `footer`)".
- [ ] **Step 5: Run the whole suite, then commit:**

```bash
git add -A plugins/session-usage-band CONTRIBUTING.md
git commit -m "refactor: the shared cards are chips' alone"
```

---

### Task 11: Sweep dead exports, by usage

**Files:** whatever the sweep finds in `hooks/`.

- [ ] **Step 1: List the unused exports.**

```bash
cd plugins/session-usage-band
for f in hooks/*.ts hooks/*.tsx hooks/views/*.ts hooks/views/*.tsx; do
  for name in $(grep -oE '^export (const|type|function) [A-Za-z0-9_]+' "$f" | awk '{print $3}'); do
    uses=$(grep -rwl "$name" hooks tests | grep -v "^$f$" | wc -l)
    [ "$uses" -eq 0 ] && echo "$f $name"
  done
done
```

Expected candidates, per S§6.2:
- `ring`, `sliceCells`, and `meter`'s `tick`, `projectTo` and `slim` options;
- parts' `batterySlot`, `batteryMark`, `batteryBar`, `layoutCacheSpec`, `amberSay`, `amberFirst`, `once`, `PERCENT` and `AMBER_STEP`;
- `fitSqueeze`;
- palette's `weekGuess`, `weekSpent`, `fiveGuess` and `fiveSpent`;
- words': the `gauge*` words, `sentence`, `tail`, `resetSaid`, `amberHead`, `WEEK`, `usedSoFar`, `DEPARTURES`, the `departure*` words, `msgsHead`, `roomLead`, `toCompaction` and `fillNamed*`.

An export used only by tests is dead too: delete the test along with it.
- [ ] **Step 2: Delete them,** a file at a time. After each file, run `tsc` and `tools/test-only.sh golden-hash golden-a golden-b`. A chips hash that moves means the deletion reached chips: undo it.
- [ ] **Step 3: Run the full gates:** the whole suite, `tsc -p plugins/session-usage-band`, `claude plugin validate plugins/session-usage-band` and `tools/views-gate.sh`. All must be clean.
- [ ] **Step 4: Commit:**

```bash
git add -A plugins/session-usage-band
git commit -m "refactor: drop what only the removed layouts used"
```

---

### Task 12: Sign off by screenshot

**Files:**
- Modify: `tools/demos/capture/desktop.test.ts` and `tools/demos/stills.py:117-124` (drop the removed layouts)
- Create: `tools/demos/capture/signoff.test.ts` (the S§8.5 cases)
- Output: `tools/demos/out/signoff/*.png`, which is not committed

- [ ] **Step 1: Check that the demo can see the bugs.** Check out `main` in a scratch worktree, then render the two reported states through `tools/demos`:
  - pulse open (SPEND card);
  - week collapsed (7d cells).

  Compare them with the user's screenshots 5 and 7. If the demo draws the same misplaced marks, it can gate. If it doesn't, write in the report that the final gate is the user's desktop screenshots, and ask for them in Task 13.
- [ ] **Step 2: Write `signoff.test.ts`.** It's a capture, not a test, like the other capture files. It draws each layout (chips, pulse, departures) × surface (desktop, terminal) × collapsed and open, for each case:
  - **low:** the `calm` scenario with limits at 3 and 10;
  - **high:** limits at 70 and 78;
  - **near:** `lastMinute` + `nearCompaction` + `fiveHourAhead` + 7d at 85;
  - **empty:** `emptyHistory` + `noLimits` + `noWorkspace`;
  - **edges:** each of `unmeasured`, `warming`, `cold`, `recalled`, `working`, `resetPassed`, `compactionOff` and `gatewaySpend`, plus a re-warm in the trace.

  Low and near are also shot in light and plain, at widths 40, 80 and 200. Print each tree the way `capture/desktop.test.ts` does, and render with `render_desk.py` and `render.py`.
- [ ] **Step 3: Render and read every PNG.** Open each with the Read tool. A PNG passes when:
  - the order is Cache, Spend, Context, 5h, 7d;
  - amber shows only on the near case's four readings;
  - no NaN, `undefined` or empty cell;
  - no row wraps;
  - each indicator's position matches its value (check a 26% bar at about a quarter, and 7d today's outline on the right day).

  Each failure is fixed in the task that owns its code, with a test, and the PNG is rendered again.
- [ ] **Step 4: Send the user** the three collapsed PNGs from the low case, unlabeled, and the near-case set, using SendUserFile. Ask them to:
  - name each layout (the distinctness gate);
  - take one desktop screenshot per layout, collapsed and open, if Step 1 found the demo can't gate.
- [ ] **Step 5: Commit the capture files:**

```bash
git add tools/demos
git commit -m "test: sign-off captures for the three layouts"
```

---

### Task 13: Docs, release

**Files:**
- `plugins/session-usage-band/README.md` (the layouts table and the gallery's alt text; drop the week and forecast paragraphs at about lines 190 and 217)
- the root `README.md` (the layout count)
- `CONTRIBUTING.md` (the module table)
- `tools/demos/site/template.html` (lines 561–700 and 869–876: the picker, the noscript list and the descriptions)
- `design/2026-10-09-band-layouts-spec.md` (its status line: "Superseded in part by 2026-10-12-three-layouts-spec.md")
- `plugins/session-usage-band/CHANGELOG.md`
- `plugins/session-usage-band/.claude-plugin/plugin.json` (version), and the repo's `.claude-plugin/marketplace.json` if it pins a version

- [ ] **Step 1: Update every doc above.** Describe each layout by its job, in the S§1 Answers wording.
- [ ] **Step 2: Add the CHANGELOG 0.14.0 entry:**

```markdown
## 0.14.0 — 2026-10-12

### Removed
- Six layouts: gauges, ledger, rings, tiles, week and forecast. A saved one draws chips, and `/usage-band layout` says so. Week's day cells now live in pulse, and forecast's clock times in departures.

### Changed
- Pulse and departures are rebuilt, and each has its own open view. Pulse draws the session as a trace: each message a beat, context and the 5h window over time, the week by day. Departures is a split-flap board: ITEM, STATUS, TIME and REMARKS for each reading.
- Every layout draws its readings in one order: cache, spend, context, 5h, 7d.
```

- [ ] **Step 3: Bump the version** to `0.14.0`. Run `tools/demos/build.sh` to rebuild the gallery, the site and the stills. Read `docs/band-layouts-dark.png` and `docs/band-layouts-light.png`, and check they show three layouts.
- [ ] **Step 4: Run every gate:** the whole suite, `tsc`, `claude plugin validate` and `tools/views-gate.sh`.
- [ ] **Step 5: Commit and release:**

```bash
git add -A
git commit -m "chore: release 0.14.0"
```

Then merge `three-layouts` into `main`, tag `v0.14.0`, publish the GitHub release with the CHANGELOG entry, and update the local marketplace install, following the repo's release memory ([[ship-without-asking]], [[install-reload-loop]]). The user reloads with `/reload-plugins` and restarts, because the plugin's version changed.
