# Band layouts: implementation plan (P0–P4)

Revision 2 (after four reviews; see 2026-10-10-plan-review-round-2.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/usage-band layout <name>` with nine layouts, production-ready:
- **P0:** pin today's band exactly.
- **P1:** lay the foundation (facts and words, views, the command, glyph tiers, charts, the test matrix) without changing chips.
- **P2:** build ledger alone as the pilot (P2.0), re-freeze, then build five views in parallel.
- **P3:** add the histories, then pulse and week.
- **P4:** profile, review, write the docs, rebuild the demos and release.

**Architecture:**
- `register.tsx` → `snapshot.ts` → `reading.ts` (`readingsOf`: the facts, composed with the words from `words.ts`) → `views/<name>.tsx`, drawn through `VIEWS[layout]`.
- Every new view is a `defineView(…)` (`views/view.ts`) built from the shared helpers in `views/parts.tsx` and the scaffold in `views/frame.tsx`.
- Chips moves into `views/chips.tsx`, a hand-written `View`, and draws from `Readings` (its own inputs under `read.chips`).
- A golden capture taken before any code moves proves chips is unchanged.

**Tech stack:**
- Claude Code mod API (function hooks, TSX with the global `h`), TypeScript.
- `claude plugin test` for tests (`claude-code/testing`: `test`, `expect`, `mock`, and the `Engine` type).
- No new dependencies.

**Spec:** `design/2026-10-09-band-layouts-spec.md` (v3). Read it first. Where the spec and the canvas differ, the spec wins.

## Global Constraints

These come from the spec, CONTRIBUTING.md and the test kit as it actually behaves:
- **Engine access:** `$` stays in `register.tsx`. Atoms are declared there too. Never name a local `h` (histories are `hist`).
- **The desktop surface:**
  - No whitespace-only string children on the desktop.
  - Svg only behind `kit.Svg`. Every Svg has an `alt` and a `width`, and no `id`, gradient, pattern or clipPath.
  - A hover card has no key. A Button holds text alone. `Text` takes no `flexShrink`: a piece that must not shrink is wrapped in a `Box`.
- **Test first:**
  - Every change starts with a failing test that you watch fail.
  - Red and green steps run only the tests at hand: `tools/test-only.sh <glob…>` (Task 1). Every commit step runs the full suite.
  - Tests that walk the clock use `LONG` from `tests/helpers.ts`. Settle on the clock with `await clock.settle()`.
- **The test kit, as confirmed by running it** (these override any habit from other kits):
  - **One `setup(on)` per test.** A second call throws. Every drawn test goes through `drawCases` (Task 1): one setup, one drive, then every mount.
  - **Each test file has its own copy of every module.** A test never reads plugin module state (`insights`, `VIEWS`' instances, `band`). It asserts through the drawn tree, through the fake engine's counters (`engine.storeGets`, `engine.storeSets`, `engine.invalidates`), or by unit-testing pure functions in its own module copy. Module state does carry across the tests of one file, so `session.start` must reset everything the plugin keeps (one exemption, `band.resume`: Task 14b, under **The one exemption**).
  - **One handler per event.** A test never registers an event `setup` already handles. Counters live in the helpers' handlers.
  - **No dynamic `import()`** in a test; it stops the file loading.
  - **No `toBeCloseTo`.** Compare floats as `expect(Math.abs(a - b)).toBeLessThan(1e-5)`.
  - **Types:** the engine is `import type { Engine } from 'claude-code/testing'`, `on` is `import type { On } from 'claude-code'`; never `Parameters<…>`. `console` is declared in `tests/globals.d.ts`.
  - **What works:** `test(name, LONG, fn)`; `$.command.run(…)` resolving to `{ text }`; `ui.press({ key })`, `redraw`, `drawn`, `unmount`; `performance.now` is real time; `console.log` prints at runtime; `drawBand(fakeEl, snap, act)` can be called directly with the fake element table in `tests/helpers.ts`.
  - **`shown()` joins children with no spaces** (it ignores `columnGap`), so a view test's regex puts `\s*` around separators.
  - **Time zones:** a view test never asserts a literal clock time. It computes the expected one with `fmtClock` / `fmtDayClock`, or matches `/\d{2}:\d{2}/`.
- **Chips stays unchanged:** with no stored layout and no `CC_BAND_GLYPHS` in a non-CJK locale, every drawn tree is deep-equal to the golden capture. No assertion in the existing suite changes.
- **Line numbers** in this plan refer to `git show 40943d3:plugins/session-usage-band/hooks/band.tsx`. Move code by symbol name; the numbers only say where to look.
- **Pure moves (Tasks 5, 7, 9a):** each step that relies on golden as its guard also breaks one moved line on purpose, watches golden fail, reverts, and says so in the commit body.
- **Naming:** names exactly as spec §4.3.
- **Store:** the store keys are `layout` and `limitSamples`. Only the command writes `layout`.
- **Production code:** no counters or instrumentation.
- **Views never format** (spec §2.5). A view reads words from `read` and adds only its own fixed labels. Outside `chips.tsx`, `parts.tsx` and `frame.tsx` (whose moved chips code formats, by design), no file in `hooks/views/` contains `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` or `from '../format'` (Task 30's gate; P2 agents run it before reporting).
- **Commits:**
  - Conventional subjects (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work stays on branch `feat/layouts`. Nothing is pushed.
- **Gates,** run from the repo root:
  - `claude plugin validate plugins/session-usage-band`
  - `claude plugin test plugins/session-usage-band`
  - `npx -y -p typescript@5.6.3 tsc -p plugins/session-usage-band`

  The type check needs the engine types under `plugins/session-usage-band/.claude-plugin/types/`. They exist in this checkout.
- **Pre-allowed commands.** Background agents can't answer permission prompts, so before P1 the maintainer pre-allows:
  - `claude plugin test` and `claude plugin validate`;
  - `npx -y -p typescript@5.6.3 tsc`;
  - `git worktree`, `git rebase`, `git merge` and `git commit`;
  - `python3`;
  - `tools/golden/capture.sh` and `tools/test-only.sh`.
- **The ledger:** `design/plans/2026-10-10-band-layouts-ledger.md` (Task 1) holds the P0 commit and hash count, the test count at every gate, every `Ruling:` line as it is decided, the freeze notes and the time-zone result. A step that says "record" writes there.

## Review Focus

Each item is something the spec implies but no task tests directly, together with the test that pins it.

1. **A stored layout from a future version** (`"layout": "sparkle"`) draws chips and never throws. Pinned in Task 10b: `a stored layout this version doesn't know draws chips`.
2. **A corrupt store value** for `layout` (a number, an object, `null`) draws chips. Pinned in Task 10b: `a stored layout that isn't a string draws chips`.
3. **`/usage-band layout` with extra words** (`layout  Ledger  extra`) is treated as unknown, and nothing changes. Pinned in Task 10b: `extra words after the name are unknown`.
4. **A CJK locale set only in `LC_CTYPE`**, with `LANG=C`, still picks the ascii tier. Pinned in Task 8: `LC_CTYPE alone picks the ascii tier`.
5. **The ascii tier never widens a row.** Every mapping replaces a glyph with at most one character, or drops it with its following space. Pinned in Task 8: `the ascii tier never makes a row wider`.

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `tests/globals.d.ts` | create (T1) | `console` for tsc |
| `tests/helpers.ts` | modify (T1, T7) | The fake engine's counters (`storeGets`, `storeSets`, `invalidates`) and `storeFails`; `fakeEl` |
| `tests/matrix.ts` | create (T1), extend (T2, T5, T9b, T11a, T11b) | Scenarios, `drawCases`, `caseKey`, golden keys, `snapOf`, `NO_ACT`, `visualRows`, `invariantErrors`, `expectInvariants`, `AMBER_WORDS`, `suiteCases`, `viewSuite` |
| `tests/golden/hash.ts` | create (T1) | `canon`, `fnv1a`, `treeHash` |
| `tools/test-only.sh` | create (T1) | Runs a chosen few tests against a scratch copy of the plugin |
| `design/plans/2026-10-10-band-layouts-ledger.md` | create (T1) | The ledger: commits, counts, rulings, freezes, time zone |
| `tools/golden/capture.test.ts`, `tools/golden/capture.sh` | create (T2) | Golden capture, run outside the normal suite |
| `tests/golden/chips.ts`, `tests/golden/suite.ts`, `tests/golden-a.test.ts`, `tests/golden-b.test.ts` | create (T2) | The committed golden hashes and trees, and their assertion |
| `design/perf-baseline.md` | create (T2) | Chips' draw times today |
| `hooks/insights.ts`, `hooks/register.tsx` | modify (T3) | Clear subagent turn-start entries |
| `hooks/format.ts` | modify (T4, T10c, T13) | Clock times, countdowns in words, spoken durations, `utcOffsetOf`, `fmtBoardLeft` |
| `hooks/words.ts` | create (T4), extend (T13) | The phrasebook: `AMBER`, `EMPTY`, `altOf`, `resetPhrase`, `paceText`, `Role`, `Say`, `Amber`, and the word builders |
| `hooks/reading.ts` | modify (T5, T13, T23, T24) | The facts (`cacheFacts`, `contextFacts`, `spendFacts`, `limitFacts`) and `readingsOf`, which composes facts and words |
| `hooks/layout.ts` | modify (T6) | `ROW_PX`; `cellsOf` measures a column as its widest row |
| `hooks/charts.tsx`, `hooks/icons.ts` | create / modify (T7) | `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `underline`, `braille`; the weather icons |
| `hooks/glyphs.ts` | create (T8) | `resolveGlyphs`, `ASCII_MAP`, `asciiText`, `asciiTree` |
| `hooks/views/chips.tsx` | create (T9a, T10a) | Chips as a view, with its own cache pill and limit chips |
| `hooks/views/parts.tsx` | create (T9a), extend (T9b, T13) | `pill`, `batteryIcon`, `textBattery`; `Keeps`, `line`, `lineRoom`, `fitLine`, `beforeLast`, `words`, `section`, `fact`, `grid`, `gridRoom`, `chartsIfRoom`, `accentOf`; `layoutCachePill` |
| `hooks/views/frame.tsx` | create (T9a) | The scaffold only: `frame`, `bodyRowsFor`, `openView`, `panel`, `toggleButton` |
| `hooks/views/view.ts`, `hooks/views/index.ts` | create (T10a) | `View`, `rowsOf`, `defineView`; `VIEWS` |
| `hooks/band.tsx` | modify (T4, T5, T7, T8, T9a, T10a) | Down to: build kit and readings, dispatch, fall back |
| `hooks/snapshot.ts`, `hooks/memory.ts` | modify (T5, T8, T10a, T10b, T10c, T23, T24) | `Glyphs`, layout names and fields; store keys and guards; samples |
| `hooks/palette.ts`, `tests/design.test.ts` | modify (T12) | `flap`, `flapText`, `flapDim` and the on-flap inks |
| `hooks/cache.ts`, `hooks/memory.ts`, `hooks/register.tsx`, `tests/resume-backfill.test.ts` | modify / create (T14b) | A resumed session's cache verdict and re-cache price from `classic.SessionStart`, its spend and tokens from its transcript's last cost record |
| `hooks/views/ledger.tsx`, `tests/view-ledger.test.ts` | replace stub (T16) | The pilot view, on `feat/layouts` |
| `hooks/views/{tiles,gauges,rings,departures,forecast}.tsx`, `tests/view-*.test.ts` | replace stubs (T17–T21) | The five parallel P2 views |
| `hooks/cache.ts`, `hooks/insights.ts` | modify (T23) | `takeRebuilt`; the cost, context and 5h trails |
| `hooks/calendar.ts`, `hooks/memory.ts` | create / modify (T24) | `weekOf`; `limitSamples` |
| `hooks/views/{pulse,week}.tsx`, `tests/view-{pulse,week}.test.ts` | replace stubs (T25, T26) | The history views |
| `tests/perf.test.ts`, `tests/soak.test.ts` | create (T27) | Draw time, node budgets, store writes, repaints |
| READMEs, CONTRIBUTING, CHANGELOG, `plugin.json`, `tools/demos/*` | modify (T31, T32) | Docs, 0.12.0, the layouts gallery |
| `design/release-0.12.0.md` | create (T33) | Gate evidence, PR and issue drafts |

## Maintainer checkpoints

The work stops at each of these until the maintainer signs off in chat. The ledger records each sign-off.

1. **After Task 2:** the hash count (480), the commit the capture ran on, the two identical captures, and the capture's runtime.
2. **The time-zone check,** after Task 14 and before Task 15: in a live session in a non-UTC zone, `/reload-plugins` and read the band's `utcOffsetMin` through a temporary toast (Task 14, Step 4). Remove the toast. The result goes in the ledger; if the kit or the live session reports 0 in a non-UTC zone, departures and forecast fall back to relative times (spec §5).
3. **After Task 14:** sign off the P1 freeze.
4. **After the pilot (Task 16):** sign off the re-freeze, with the list of shared-file changes the pilot made. Only then do Tasks 17–21 fan out.
5. **After Task 22:** the five merges, the full gates, and the golden file untouched.
6. **Before Task 33:** the hand check of every layout, and the go-ahead for anything outward.

---

## P0: Baseline

### Task 1: Scenarios, `drawCases`, tree hashing, and the test scaffolding

**Files:**
- Create: `plugins/session-usage-band/tests/globals.d.ts`
- Create: `plugins/session-usage-band/tests/golden/hash.ts`
- Create: `plugins/session-usage-band/tests/matrix.ts`
- Create: `tools/test-only.sh`
- Create: `design/plans/2026-10-10-band-layouts-ledger.md`
- Modify: `plugins/session-usage-band/tests/helpers.ts`
- Test: `plugins/session-usage-band/tests/golden-hash.test.ts`
- Test: `plugins/session-usage-band/tests/scenarios.test.ts`

**Interfaces:**
- **Produces:**
  - `canon(v: unknown): unknown`, `fnv1a(s: string): string` (8 hex characters), `treeHash(tree: unknown): string` (`${fnv1a(json)}-${json.length}`)
  - `SCENARIOS: Readonly<Record<ScenarioName, Scenario>>`, `SCENARIO_NAMES: ScenarioName[]`
  - `drawCases($: Engine, on: On, o: CaseOptions, mounts: readonly Mount[]): Promise<Readonly<Record<string, Node>>>`, its trees keyed by `caseKey(mount, state)` = `${surface}|${cols}|${maxRows ?? 40}|${'shut' | 'open'}`
  - Types `ScenarioName`, `Scenario`, `Appearance = 'dark' | 'light' | 'plain'`, `Surface = 'terminal' | 'desktop'`, `AmberReason`, `Ttl = '1h' | '5m'`, `Mount`, `CaseOptions`, `State = 'shut' | 'open'`
  - In `helpers.ts`, on `engine`: `storeGets: string[]`, `storeSets: string[]`, `invalidates: number`, `storeFails: boolean`
  - `tools/test-only.sh <glob…>`

- [ ] **Step 1: Write the scaffolding the red steps need**

`plugins/session-usage-band/tests/globals.d.ts`:

```ts
// The sandbox has console at runtime; the es2023 lib tsc checks against
// doesn't declare it.
declare const console: { log(...a: unknown[]): void }
```

`tools/test-only.sh` (then `chmod +x tools/test-only.sh`):

```bash
#!/usr/bin/env bash
# Runs only the tests whose names match the globs given, against a scratch
# copy of the plugin: the red and green steps of a task. Every commit still
# runs the whole suite. Usage: tools/test-only.sh golden-hash 'view-ledger'
set -euo pipefail
if [ "$#" -eq 0 ]; then echo "no test globs given" >&2; exit 1; fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"
SCRATCH="$(mktemp -d)"
trap 'rm -rf "$SCRATCH"' EXIT
# Everything but the tests, hidden folders (the manifest, the types) included.
find "$PLUGIN" -mindepth 1 -maxdepth 1 ! -name tests -exec cp -R {} "$SCRATCH/" \;
mkdir -p "$SCRATCH/tests"
# The shared test modules every test file may import.
for shared in helpers.ts matrix.ts globals.d.ts; do
  if [ -f "$PLUGIN/tests/$shared" ]; then cp "$PLUGIN/tests/$shared" "$SCRATCH/tests/"; fi
done
if [ -d "$PLUGIN/tests/golden" ]; then cp -R "$PLUGIN/tests/golden" "$SCRATCH/tests/"; fi
# Every glob must match at least one file, so a typo fails instead of
# quietly running fewer tests.
for glob in "$@"; do
  matched=0
  for f in "$PLUGIN"/tests/$glob.test.ts; do
    [ -e "$f" ] || continue
    cp "$f" "$SCRATCH/tests/"
    matched=$((matched + 1))
  done
  if [ "$matched" -eq 0 ]; then echo "no test matches: $glob" >&2; exit 1; fi
done
claude plugin test "$SCRATCH"
```

`design/plans/2026-10-10-band-layouts-ledger.md`:

```markdown
# Band layouts: ledger

What the plan's steps record, in the order they happen.

## P0
- Golden capture commit:
- Cases hashed: (expect 480) · trees kept: (expect 10)
- Two captures identical: · capture runtime:

## Test counts at each gate
| Gate | Count | Command |
| --- | --- | --- |

## Rulings
<!-- One line each: `Ruling: <what> — <why> — <fallback taken or not>`. -->

## Freezes
- P1 freeze (Task 14):
- P2.0 re-freeze (Task 16):

## Time zone
- Kit, TZ=UTC: · kit, TZ=Asia/Tehran: · live session:
```

- [ ] **Step 2: Write the failing hash test**

```ts
// tests/golden-hash.test.ts
import { test, expect } from 'claude-code/testing'
import { canon, fnv1a, treeHash } from './golden/hash'

test('fnv1a matches the published test vectors', () => {
  expect(fnv1a('')).toBe('811c9dc5')
  expect(fnv1a('a')).toBe('e40c292c')
  expect(fnv1a('foobar')).toBe('bf9cf968')
})

test('canon sorts keys and drops functions, so equal trees hash equal', () => {
  const a = { type: 'Box', props: { key: 'row', onPress: () => undefined, flexGrow: 1 }, children: ['x'] }
  const b = { children: ['x'], props: { flexGrow: 1, key: 'row' }, type: 'Box' }
  expect(canon(a)).toEqual(canon(b))
  expect(treeHash(a)).toBe(treeHash(b))
  expect(treeHash({ ...b, children: ['y'] })).not.toBe(treeHash(b))
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `tools/test-only.sh golden-hash`
Expected: FAIL. The module `./golden/hash` can't be resolved.

- [ ] **Step 4: Write `tests/golden/hash.ts`**

```ts
// A drawn tree as a short, stable fingerprint: the golden capture keeps
// hashes, not trees, so it stays small enough to commit.

/** `v` with object keys sorted, and functions and the engine's `press`
 *  handles dropped: handlers differ by identity between draws, the engine
 *  numbers each Button's press handle as a file's tests run, and key order is
 *  not part of what is drawn. */
export const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon)
  if (v === null || typeof v !== 'object') return v
  const o = v as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .filter(k => k !== 'press' && typeof o[k] !== 'function' && o[k] !== undefined)
      .map(k => [k, canon(o[k])]),
  )
}

/** 32-bit FNV-1a over UTF-16 code units: the sandbox has no crypto we rely on. */
export const fnv1a = (s: string): string => {
  let h32 = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h32 ^= s.charCodeAt(i)
    h32 = Math.imul(h32, 0x01000193) >>> 0
  }
  return h32.toString(16).padStart(8, '0')
}

/** A tree's fingerprint: its hash and its canonical length. */
export const treeHash = (tree: unknown): string => {
  const json = JSON.stringify(canon(tree))
  return `${fnv1a(json)}-${json.length}`
}
```

Add to `tests/golden-hash.test.ts` (it pins the `press` filter):

```ts
test("canon drops the engine's press handles, which renumber between tests", () => {
  const a = { type: 'Button', props: { key: 'more', label: '▿', press: { plugin: 'session-usage-band', handle: 225709673 } } }
  const b = { type: 'Button', props: { key: 'more', label: '▿', press: { plugin: 'session-usage-band', handle: 225709693 } } }
  expect(treeHash(a)).toBe(treeHash(b))
})
```

Run: `tools/test-only.sh golden-hash`
Expected: PASS.

- [ ] **Step 5: Write the failing scenario tests**

Each scenario gets one test of its own, which draws it shut and open on one mount and checks it reached its state. A last group checks that module state left by one test doesn't leak into the next, and that the fake engine's new counters count.

```ts
// tests/scenarios.test.ts — every scenario reaches the state its name says,
// shut and open, and one test's state never leaks into the next.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, START, engine, mountBand, setup, shown, turn, resp, respond } from './helpers'
import { caseKey, drawCases, type Mount, type ScenarioName } from './matrix'
import { treeHash } from './golden/hash'

const WIDE: Mount = { surface: 'terminal', cols: 160 }
const drawn = async ($: Engine, on: On, scenario: ScenarioName) => {
  const trees = await drawCases($, on, { scenario, appearance: 'dark', ttl: scenario === 'lastMinute' || scenario === 'cold' ? '5m' : '1h' }, [WIDE])
  return { shut: shown(trees[caseKey(WIDE, 'shut')]), open: shown(trees[caseKey(WIDE, 'open')]) }
}
const reaches = (scenario: ScenarioName, shut: RegExp, open?: RegExp, notOpen?: RegExp) =>
  test(`${scenario} reaches its state, shut and open`, LONG, async ($, on) => {
    const t = await drawn($, on, scenario)
    expect(t.shut).toMatch(shut)
    if (open !== undefined) expect(t.open).toMatch(open)
    if (notOpen !== undefined) expect(t.open).not.toMatch(notOpen)
  })

reaches('calm', /cache 1h 00m/, /CACHE/)
reaches('unmeasured', /cache –/, /Not measured yet/)
reaches('warming', /cache warming/, /Warming/)
reaches('recalled', /cache 40m/, /CACHE/)
reaches('cold', /cache cold/, /next message/)
reaches('lastMinute', /0:30 left · re-warm ~\$/)
reaches('working', /cache warm \$/)
reaches('nearCompaction', /compacts in ~10k/, /CONTEXT/)
reaches('compactionOff', /170k \/ 200k!/, /85% full!/)
reaches('limit80', /82%!/)
reaches('fiveHourAhead', /full in ~/)
reaches('sevenFullBeforeReset', /7d \S+ 79%/, /full before reset/)
reaches('noLimits', /\$2\.41/, /CACHE/, /LIMITS/)
reaches('gatewaySpend', /\$2\.41/, /spend 92%!/)
reaches('resetPassed', /5h reset/)
reaches('noWorkspace', /\$2\.41/, /CACHE/, /claude-mod/)
reaches('notARepo', /\$2\.41/, /claude-mod/, /on main/)
reaches('gitFails', /\$2\.41/, /claude-mod/, /on main/)
reaches('emptyHistory', /cache warming/)
reaches('fullHistory', /\$8\.41/)

// Module state carries across the tests of one file: session.start must reset it.
const calm: string[] = []
const twoMounts: Mount[] = [WIDE, { surface: 'desktop', cols: 120 }]
const calmHash = async ($: Engine, on: On) =>
  Object.values(await drawCases($, on, { scenario: 'calm', appearance: 'dark' }, twoMounts)).map(treeHash).join(' ')
test('a calm draw, before a cold one', async ($, on) => { calm.push(await calmHash($, on)) })
test('a cold draw, between two calm ones', LONG, async ($, on) => { expect((await drawn($, on, 'cold')).shut).toMatch(/cache cold/) })
test('a calm draw after a cold one is the same tree', async ($, on) => { expect(await calmHash($, on)).toBe(calm[0]) })

test('the fake engine counts store reads, store writes and invalidates', async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  expect(engine.storeGets).toContain('sessions')
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await turn($, 't1', 2.41, 2.62)
  await clock.settle()
  expect(engine.storeSets).toContain('sessions')
  expect(engine.invalidates).toBeGreaterThan(0)
})
test('a failing store refuses every write, and the band carries on', async ($, on) => {
  const clock = setup(on)
  engine.storeFails = true
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await turn($, 't1', 2.41, 2.62)
  await clock.settle()
  expect(engine.storeSets).toContain('sessions')
  expect('sessions' in engine.store).toBe(false)
  const ui = await mountBand($, 'terminal', 160)
  expect(shown(await ui.drawn())).toMatch(/\$2\.62/)
  await ui.unmount()
})
```

Run: `tools/test-only.sh scenarios`
Expected: FAIL. `./matrix` can't be resolved, and `engine.storeGets` is undefined.

- [ ] **Step 6: Add the counters to `tests/helpers.ts`**

In `EngineFake`, after `store`:

```ts
  /** Every key the plugin read from its store, in order. */
  storeGets: string[]
  /** Every key the plugin asked to write to its store, refused writes included, in order. */
  storeSets: string[]
  /** When true, every store write rejects, as an unavailable store would. */
  storeFails: boolean
  /** How many times the plugin asked for a redraw (`$.ui.invalidate`). */
  invalidates: number
```

In `ENGINE_INITIAL`: `storeGets: [], storeSets: [], storeFails: false, invalidates: 0`.

In `base`, replace the two store handlers and add one for `ui.invalidate`, which no handler in `base` covers today:

```ts
  on('store.get', ($, e) => {
    engine.storeGets.push(e.key)
    return { value: engine.store[e.key] }
  })
  on('store.set', ($, e) => {
    engine.storeSets.push(e.key)
    if (engine.storeFails) throw new Error('store unavailable')
    engine.store[e.key] = JSON.parse(JSON.stringify(e.value)) as unknown
    return { value: undefined }
  })
  // A redraw asked for: counted, then passed on, so the redraw still happens.
  on('ui.invalidate', ($, e, next) => {
    engine.invalidates++
    return next(e)
  })
```

**Counting invalidates (verified in a scratch run).** The handler must call `next(e)`. A handler that answers by itself swallows the redraw, and 8 existing tests fail (cache pill, 5h pace, reset countdowns). With the pass-through, the existing suite stays green.

- [ ] **Step 7: Write `tests/matrix.ts` with the scenarios and `drawCases`**

The scenarios reuse states the existing tests already reach:
- `tests/cache-pill.test.ts` for the last minute and working;
- `tests/context-and-tokens.test.ts:27` for the compaction breakdown, which `register.tsx` reads in `session.measure` (339–349), not in `turn.complete`;
- `tests/resume.test.ts:30` for a recalled session;
- `tests/limits.test.ts:187` for spend limits;
- `tests/workspace-reads.test.ts:58` for git failing.

```ts
// The states every layout is drawn in, and the one way to draw them: one
// setup and one drive per test, then each mount drawn shut and open.
// P0 needs SCENARIOS and drawCases; P1 adds the snapshot builder and the
// invariant checks.

import type { On, SessionUsage } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import {
  HOUR, HOUR_1, MIN, START, USAGE, FRESH, breakdown, engine, mountBand, pacing, resp, respond, setup, turn, type Node,
} from './helpers'

export type Appearance = 'dark' | 'light' | 'plain'
export type Surface = 'terminal' | 'desktop'
export type Ttl = '1h' | '5m'
export type AmberReason = 'cacheLastMinute' | 'nearCompaction' | 'contextNoCompaction' | 'limit80' | 'fiveHourAhead'

const TTL_MS: Readonly<Record<Ttl, number>> = { '1h': HOUR, '5m': 5 * MIN }

export type Scenario = Readonly<{
  usage?: SessionUsage
  store?: Record<string, unknown>
  env?: Record<string, string>
  now?: number
  /** Changes to the fake engine before the session starts. */
  prepare?: () => void
  /** Drives the session into its state. `ttlMs` is the cache's lifetime, so a
   *  walk to the last minute or past it holds under either TTL. */
  drive: ($: Engine, clock: MockClock, ttlMs: number) => Promise<void>
  isWorking?: boolean
  amber: readonly AmberReason[]
}>

const started = async ($: Engine): Promise<void> => { await $.session.start(START) }
const replied = async ($: Engine): Promise<void> => {
  await started($)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
}
const withLimits = (five: number, seven: number, fiveResetH = 3, sevenResetH = 67): SessionUsage['rateLimits'] => [
  { kind: 'five_hour', percentUsed: five, resetsAt: new Date(fiveResetH * HOUR).toISOString() },
  { kind: 'seven_day', percentUsed: seven, resetsAt: new Date(sevenResetH * HOUR).toISOString() },
]
/** The context at `tokens`, with auto-compaction at `compactAt`, or off. */
const contextAt = (tokens: number, compactAt: number | undefined): SessionUsage['context'] => ({
  tokens,
  window: 200_000,
  percent: tokens / 2000,
  breakdown: breakdown(compactAt === undefined ? { isAutoCompactEnabled: false } : { autoCompactThreshold: compactAt, isAutoCompactEnabled: true }),
})
/** A reply, then a measure: the band reads the compaction breakdown there. */
const measured = (context: SessionUsage['context']) => async ($: Engine): Promise<void> => {
  await replied($)
  await $.session.measure({ context, rateLimits: USAGE.rateLimits, cost: USAGE.cost, changed: [] })
}
const NEAR = contextAt(150_000, 160_000)
const OFF = contextAt(170_000, undefined)

export const SCENARIOS = {
  calm: { drive: replied, amber: [] },
  unmeasured: { drive: started, amber: [] },
  warming: { usage: FRESH, drive: started, amber: [] },
  // Its last reply 20 minutes ago, as the band remembered it; HOME lets it
  // look for the transcript's cost record too.
  recalled: { store: { sessions: { s1: { lastAt: 0 } } }, now: 20 * MIN, env: { HOME: '/Users/me' }, drive: started, amber: [] },
  cold: { drive: async ($, clock, ttlMs) => { await replied($); await clock.advance(ttlMs + MIN) }, amber: [] },
  lastMinute: { drive: async ($, clock, ttlMs) => { await replied($); await clock.advance(ttlMs - 30_000) }, amber: ['cacheLastMinute'] },
  working: { drive: replied, isWorking: true, amber: [] },
  nearCompaction: { usage: { ...USAGE, context: NEAR }, drive: measured(NEAR), amber: ['nearCompaction'] },
  compactionOff: { usage: { ...USAGE, context: OFF }, drive: measured(OFF), amber: ['contextNoCompaction'] },
  limit80: { usage: { ...USAGE, rateLimits: withLimits(82, 30) }, drive: replied, amber: ['limit80'] },
  fiveHourAhead: { drive: async ($, clock) => { await pacing($, clock) }, amber: ['fiveHourAhead'] },
  sevenFullBeforeReset: { usage: { ...USAGE, rateLimits: withLimits(4, 79, 3, 50) }, drive: replied, amber: [] },
  noLimits: { usage: { ...USAGE, rateLimits: [] }, drive: replied, amber: [] },
  gatewaySpend: {
    usage: { ...USAGE, rateLimits: [...withLimits(4, 30), { kind: 'spend_limit', percentUsed: 92, resetsAt: new Date(5 * HOUR).toISOString() }] },
    drive: replied,
    amber: [],
  },
  resetPassed: { now: 4 * HOUR, drive: replied, amber: [] },
  // A git read that never answers: the strip stays empty, as before the first read.
  noWorkspace: { prepare: () => { engine.hold = new Promise(() => undefined) }, drive: replied, amber: [] },
  notARepo: { prepare: () => { engine.git = 'none' }, drive: replied, amber: [] },
  gitFails: { prepare: () => { engine.git = 'fail' }, drive: replied, amber: [] },
  emptyHistory: { usage: FRESH, drive: started, amber: [] },
  fullHistory: {
    drive: async $ => {
      await replied($)
      for (let i = 1; i <= 30; i++) await turn($, `t${i}`, 2.41 + (i - 1) * 0.2, 2.41 + i * 0.2)
    },
    amber: [],
  },
} as const satisfies Record<string, Scenario>

export type ScenarioName = keyof typeof SCENARIOS
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[]

export type Mount = Readonly<{ surface: Surface; cols: number; maxRows?: number }>
export type State = 'shut' | 'open'
export type CaseOptions = Readonly<{
  scenario: ScenarioName
  appearance: Appearance
  env?: Record<string, string>
  /** A layout to store before the session starts; none, as a new user. */
  layout?: string
  /** The cache's lifetime: 5m walks a twelfth of the clock 1h does. */
  ttl?: Ttl
}>

/** Where a drawn case was mounted, and whether it was open. */
export const caseKey = (m: Mount, state: State): string => `${m.surface}|${m.cols}|${m.maxRows ?? 40}|${state}`

/** One setup and one drive, then for each mount, always in this order: draw
 *  it shut, press ▿, draw it open, press ▵, let it go. */
export const drawCases = async ($: Engine, on: On, o: CaseOptions, mounts: readonly Mount[]): Promise<Readonly<Record<string, Node>>> => {
  const s: Scenario = SCENARIOS[o.scenario]
  const ttl = o.ttl ?? '1h'
  const env = {
    ...HOUR_1,
    ...(o.appearance === 'dark' ? {} : { CC_BAND_APPEARANCE: o.appearance }),
    // Forcing 5m wins over HOUR_1 (resolveTtl reads it first).
    ...(ttl === '5m' ? { FORCE_PROMPT_CACHING_5M: '1' } : {}),
    ...s.env,
    ...o.env,
  }
  const store = { ...(s.store ?? {}), ...(o.layout === undefined ? {} : { layout: o.layout }) }
  const clock = setup(on, { usage: s.usage, store, env, now: s.now })
  s.prepare?.()
  await s.drive($, clock, TTL_MS[ttl])
  await clock.settle()
  const trees: Record<string, Node> = {}
  for (const m of mounts) {
    const ui = await mountBand($, m.surface, m.cols, { maxRows: m.maxRows, isWorking: s.isWorking })
    trees[caseKey(m, 'shut')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    trees[caseKey(m, 'open')] = (await ui.drawn()) as Node
    await ui.press({ key: 'more' })
    await ui.unmount()
  }
  return trees
}
```

- **If a helper isn't exported:** `engine`, `FRESH`, `breakdown` and `pacing` are all `export const` today. If one isn't, export it.
- **If a state isn't reached:** read the drawn text (`shown(...)`) and fix the scenario's inputs, never the regex's meaning.
- **Ruling: `noWorkspace` and a held read.** Pressing ▿ starts another workspace read, and an act resolves only once the work it started settles, so with a `hold` that never resolves the open draw may never return. Step 8 shows whether it does. If the `noWorkspace` test times out, add `rootFails: boolean` to `EngineFake` (`false` in `ENGINE_INITIAL`), make the `session.root` handler `throw new Error('no root')` while it is set, and give `noWorkspace` `prepare: () => { engine.rootFails = true }`. `readWorkspace` catches the throw and the workspace stays undefined. Record which one shipped.

- [ ] **Step 8: Run the tests until they pass**

Run: `tools/test-only.sh golden-hash scenarios`
Expected: PASS, every scenario test included. Where a regex misses, read `shown(...)` and fix the scenario's inputs.

Then run the full suite: `claude plugin test plugins/session-usage-band`
Expected: PASS, the existing suite included. This holds only with the `press` filter in `canon` (Step 4) and the pass-through `ui.invalidate` handler (Step 6); without them the calm–cold–calm test and 8 existing tests fail. Record the count in the ledger.

- [ ] **Step 9: Commit**

```bash
git add tools/test-only.sh design/plans/2026-10-10-band-layouts-ledger.md plugins/session-usage-band/tests/globals.d.ts plugins/session-usage-band/tests/golden/hash.ts plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/golden-hash.test.ts plugins/session-usage-band/tests/scenarios.test.ts plugins/session-usage-band/tests/helpers.ts
git commit -m "test: scenarios for every band state, drawn one setup per test, and a stable tree hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The golden capture, its assertion, and the perf baseline

**Files:**
- Create: `tools/golden/capture.test.ts`
- Create: `tools/golden/capture.sh`
- Create: `plugins/session-usage-band/tests/golden/chips.ts` (generated)
- Create: `plugins/session-usage-band/tests/golden/suite.ts`
- Create: `plugins/session-usage-band/tests/golden-a.test.ts`, `plugins/session-usage-band/tests/golden-b.test.ts`
- Create: `design/perf-baseline.md`
- Modify: `plugins/session-usage-band/tests/matrix.ts` (golden mounts and keys)
- Modify: `.gitignore`

**Interfaces:**
- **Consumes:** `SCENARIO_NAMES`, `drawCases`, `caseKey`, `treeHash`, `canon` (Task 1).
- **Produces:**
  - `GOLDEN_APPEARANCES: readonly Appearance[]` (`['dark', 'plain']`), `GOLDEN_MOUNTS: readonly Mount[]` (terminal and desktop at 40, 95 and 200), `goldenKey(scenario, appearance, caseKey): string` = `${scenario}|${appearance}|${caseKey}`;
  - `GOLDEN: Readonly<Record<string, string>>` (480 hashes) and `GOLDEN_TREES: Readonly<Record<string, unknown>>` (10 whole trees), keyed by `goldenKey`;
  - `goldenSuite(scenarios: readonly ScenarioName[]): void`.

**What golden doesn't cover,** said in the header of both golden test files: the light palette, `maxRows` under 40, and the ascii tier. The view suites cover those for the new layouts; chips' existing tests cover them for chips.

- [ ] **Step 1: Add the golden mounts and keys to `tests/matrix.ts`**

```ts
/** Golden's grid: two surfaces at three widths, each drawn shut and open, in
 *  dark and plain. 20 scenarios × 2 appearances × 6 mounts × 2 = 480 cases. */
export const GOLDEN_APPEARANCES: readonly Appearance[] = ['dark', 'plain']
export const GOLDEN_MOUNTS: readonly Mount[] = (['terminal', 'desktop'] as const).flatMap(surface => [40, 95, 200].map(cols => ({ surface, cols })))
export const goldenKey = (scenario: ScenarioName, appearance: Appearance, drawn: string): string => `${scenario}|${appearance}|${drawn}`
```

- [ ] **Step 2: Write the capture test** (outside `tests/`, so the normal run skips it)

```ts
// tools/golden/capture.test.ts — copied into the plugin's tests/ by
// capture.sh for one run; prints GOLDEN, TREE and PERF lines, never asserts.
import { test } from 'claude-code/testing'
import { GOLDEN_APPEARANCES, GOLDEN_MOUNTS, SCENARIO_NAMES, drawCases, goldenKey } from './matrix'
import { treeHash } from './golden/hash'
import { LONG, START, mountBand, resp, respond, setup } from './helpers'

/** The cases kept whole, so a failure can be read and diffed. */
const FULL = new Set([
  'calm|dark|terminal|40|40|open', 'calm|dark|desktop|95|40|open', 'lastMinute|dark|terminal|40|40|shut',
  'cold|dark|desktop|200|40|open', 'nearCompaction|plain|terminal|95|40|open', 'fiveHourAhead|dark|desktop|40|40|shut',
  'gatewaySpend|dark|desktop|200|40|open', 'resetPassed|dark|terminal|95|40|open', 'notARepo|plain|desktop|200|40|open',
  'working|dark|terminal|200|40|shut',
])

for (const scenario of SCENARIO_NAMES) for (const appearance of GOLDEN_APPEARANCES) {
  test(`golden ${scenario} ${appearance}`, LONG, async ($, on) => {
    const trees = await drawCases($, on, { scenario, appearance }, GOLDEN_MOUNTS)
    for (const [drawn, tree] of Object.entries(trees)) {
      const key = goldenKey(scenario, appearance, drawn)
      console.log(`GOLDEN ${key} ${treeHash(tree)}`)
      if (FULL.has(key)) console.log(`TREE ${key} ${JSON.stringify(canon(tree))}`)
    }
  })
}

test('perf baseline', LONG, async ($, on) => {
  const t0 = performance.now()
  let spin = 0
  for (let i = 0; i < 2e6; i++) spin += i
  console.log(`PERF clockReal ${performance.now() - t0 > 0} ${spin > 0}`)
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await mountBand($, surface, 200)
    for (const open of [false, true]) {
      if (open) await ui.press({ key: 'more' })
      for (let i = 0; i < 20; i++) await ui.redraw()
      const times: number[] = []
      for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); times.push(performance.now() - a) }
      times.sort((x, y) => x - y)
      console.log(`PERF chips ${surface} ${open ? 'open' : 'shut'} median=${times[100]?.toFixed(3)}ms p95=${times[190]?.toFixed(3)}ms`)
    }
    await ui.unmount()
  }
})
```

- [ ] **Step 3: Write `tools/golden/capture.sh`**

This uses the same copy-in, run, grep and clean-up approach as `tools/demos/build.sh`. It refuses to run on hooks that differ from the commit before the layouts work.

```bash
#!/usr/bin/env bash
# Capture chips' golden trees from the band as it drew before the layouts
# work. Refuses to run on any other hooks. Writes tests/golden/chips.ts.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"; OUT="$HERE/out"; mkdir -p "$OUT"
if ! git -C "$ROOT" diff --quiet 40943d3 -- plugins/session-usage-band/hooks; then
  echo "capture.sh: hooks/ differs from 40943d3; the capture must come from the band before the layouts work" >&2
  exit 1
fi
COMMIT="$(git -C "$ROOT" rev-parse HEAD)"
trap 'rm -f "$PLUGIN/tests/zz-golden-capture.test.ts"' EXIT
cp "$HERE/capture.test.ts" "$PLUGIN/tests/zz-golden-capture.test.ts"
START_S=$(date +%s)
claude plugin test "$PLUGIN" > "$OUT/capture.log" 2>&1 || { tail -30 "$OUT/capture.log"; exit 1; }
echo "capture took $(( $(date +%s) - START_S ))s"
python3 - "$OUT/capture.log" "$PLUGIN/tests/golden/chips.ts" "$COMMIT" <<'EOF'
import json, re, sys
log, out, commit = open(sys.argv[1]).read().splitlines(), sys.argv[2], sys.argv[3]
golden = dict(re.match(r'GOLDEN (\S+) (\S+)$', l).groups() for l in log if l.startswith('GOLDEN '))
trees = {m.group(1): json.loads(m.group(2)) for l in log if (m := re.match(r'TREE (\S+) (.+)$', l))}
assert len(golden) == 20 * 2 * 6 * 2, f'expected 480 cases, got {len(golden)}'
assert len(trees) == 10, f'expected 10 trees, got {len(trees)}'
with open(out, 'w') as f:
    f.write(f'// Generated by tools/golden/capture.sh at {commit}, from the band as it\n')
    f.write('// drew before the layouts work. Frozen: a change here must be justified in review.\n\n')
    f.write('export const GOLDEN: Readonly<Record<string, string>> = ' + json.dumps(golden, indent=1, sort_keys=True) + '\n\n')
    f.write('export const GOLDEN_TREES: Readonly<Record<string, unknown>> = ' + json.dumps(trees, sort_keys=True) + '\n')
print(len(golden), 'cases,', len(trees), 'trees')
EOF
grep '^PERF' "$OUT/capture.log"
```

- [ ] **Step 4: Run the capture twice and compare**

```bash
chmod +x tools/golden/capture.sh
tools/golden/capture.sh && cp plugins/session-usage-band/tests/golden/chips.ts /tmp/chips-1.ts
tools/golden/capture.sh && diff /tmp/chips-1.ts plugins/session-usage-band/tests/golden/chips.ts
```

Expected: `480 cases, 10 trees` both times, the PERF lines, and no diff. A diff means a case isn't deterministic: find it, fix its scenario in `matrix.ts`, and capture again. Add `tools/golden/out/` to `.gitignore`. Record the commit, the count, the runtime and "two captures identical" in the ledger.

- [ ] **Step 5: Record the perf baseline**

Copy the PERF lines into `design/perf-baseline.md`, with the commit hash and a one-line note on `clockReal`. If `clockReal` is `false`, the spec's draw-time row drops, and the tree-size row is the budget.

- [ ] **Step 6: Write the golden suite and its two files**

```ts
// tests/golden/suite.ts — chips draws exactly what it drew before the
// layouts work: one test per scenario and appearance, each one setup with
// six mounts drawn shut and open, every case by hash and ten by whole tree.
import { test, expect } from 'claude-code/testing'
import { GOLDEN, GOLDEN_TREES } from './chips'
import { canon, treeHash } from './hash'
import { GOLDEN_APPEARANCES, GOLDEN_MOUNTS, drawCases, goldenKey, type ScenarioName } from '../matrix'
import { LONG } from '../helpers'

export const goldenSuite = (scenarios: readonly ScenarioName[]): void => {
  for (const scenario of scenarios) for (const appearance of GOLDEN_APPEARANCES) {
    test(`chips draws as before: ${scenario}, ${appearance}`, LONG, async ($, on) => {
      const trees = await drawCases($, on, { scenario, appearance }, GOLDEN_MOUNTS)
      for (const [drawn, tree] of Object.entries(trees)) {
        const key = goldenKey(scenario, appearance, drawn)
        expect(`${key} ${treeHash(tree)}`).toBe(`${key} ${GOLDEN[key]}`)
        const whole = GOLDEN_TREES[key]
        if (whole !== undefined) expect(canon(tree)).toEqual(canon(whole))
      }
    })
  }
}
```

```ts
// tests/golden-a.test.ts — golden, scenarios 1–10. Golden doesn't cover the
// light palette, maxRows under 40, or the ascii tier.
import { test, expect } from 'claude-code/testing'
import { GOLDEN } from './golden/chips'
import { treeHash } from './golden/hash'
import { goldenSuite } from './golden/suite'
import { SCENARIO_NAMES, caseKey, drawCases, goldenKey, type Mount } from './matrix'
import { LONG } from './helpers'

goldenSuite(SCENARIO_NAMES.slice(0, 10))

test('chips stored explicitly draws the same as nothing stored', LONG, async ($, on) => {
  const m: Mount = { surface: 'desktop', cols: 95 }
  const trees = await drawCases($, on, { scenario: 'calm', appearance: 'dark', layout: 'chips' }, [m])
  for (const state of ['shut', 'open'] as const) expect(treeHash(trees[caseKey(m, state)])).toBe(GOLDEN[goldenKey('calm', 'dark', caseKey(m, state))])
})
```

```ts
// tests/golden-b.test.ts — golden, scenarios 11–20. Golden doesn't cover the
// light palette, maxRows under 40, or the ascii tier.
import { goldenSuite } from './golden/suite'
import { SCENARIO_NAMES } from './matrix'

goldenSuite(SCENARIO_NAMES.slice(10))
```

- [ ] **Step 7: Run the whole suite**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS, with 41 golden tests. The golden suite is green against the code it was captured from. The stored-chips test passes too, because today's band ignores the unknown store key. Record the count in the ledger.

- [ ] **Step 8: Commit**

```bash
git add tools/golden plugins/session-usage-band/tests/golden plugins/session-usage-band/tests/golden-a.test.ts plugins/session-usage-band/tests/golden-b.test.ts plugins/session-usage-band/tests/matrix.ts design/perf-baseline.md design/plans/2026-10-10-band-layouts-ledger.md .gitignore
git commit -m "test: pin chips' drawing with a golden capture, and record its draw times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Maintainer checkpoint 1.** Report the hash count, the commit, the two identical captures and the runtime, and wait for the sign-off.

---
## P1: Foundation

P1 is one agent, serial, on `feat/layouts`. Its shared contract, frozen at Task 14, is:
- the phrasebook `hooks/words.ts` (Tasks 4, 13);
- the facts and `readingsOf` in `hooks/reading.ts` (Tasks 5, 13);
- `hooks/charts.tsx` (Task 7);
- `hooks/views/parts.tsx`, `frame.tsx`, `view.ts` and `index.ts` (Tasks 9a, 9b, 10a, 13);
- `tests/matrix.ts` and `tests/helpers.ts`;
- the palette tokens (Task 12).

### Task 3: Subagent turn starts no longer accumulate

**Files:**
- Modify: `hooks/insights.ts`, which gains `forgetTurn` and `openTurns`
- Modify: `hooks/register.tsx` (the `turn.complete` hook)
- Test: `tests/insights.test.ts`

**Interfaces:**
- **Produces:**
  - `forgetTurn(turnId: string): void`
  - `openTurns(): number`, a read-only count of turns started and not ended.

- [ ] **Step 1: Write the failing tests** (append to `tests/insights.test.ts`)

The first is pure: it runs on this test file's own copy of `insights.ts`. The second checks the effect a user would see, through the drawn band.

```ts
// Merge into the file's existing imports: `insights.test.ts` already imports
// `noteTurnStart` (line 10), and a second binding stops the file loading.
import { forgetTurn, openTurns } from '../hooks/insights'
import { fact, mountBand, resp, respond, setup, START, turn } from './helpers'

test('a forgotten turn leaves no start cost behind', () => {
  noteTurnStart('s', 1)
  forgetTurn('s')
  expect(openTurns()).toBe(0)
})

test("a subagent's turn doesn't change what the last message cost", async ($, on) => {
  setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await turn($, 'main-1', 2.41, 2.62)
  await $.turn.start({ text: 'hi', turnId: 'sub-1' })
  await turn($, 'sub-1', 2.62, 3.1, { agentId: 'agent-1' })
  const ui = await mountBand($, 'terminal', 110)
  await ui.press({ key: 'more' })
  expect(fact(await ui.drawn(), 'last message')).toBe('$0.21')
  await ui.unmount()
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh insights`
Expected: FAIL, with `forgetTurn` and `openTurns` not exported.

- [ ] **Step 3: Implement**

In `hooks/insights.ts`, after `noteTurnEnd`:

```ts
/** A turn that ends outside the main loop: its start cost is dropped, so a
 *  subagent's turns never build up. */
export const forgetTurn = (turnId: string): void => {
  state.turnStartCost.delete(turnId)
}

/** Turns started and not yet ended. */
export const openTurns = (): number => state.turnStartCost.size
```

In `hooks/register.tsx`, inside `on('turn.complete', …)`, add an `else` branch to `if (e.agentId === undefined) { … }`:

```ts
    } else {
      forgetTurn(e.turnId)
    }
```

Add `forgetTurn` to the `./insights` import.

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh insights`, then `claude plugin test plugins/session-usage-band`
Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/insights.ts plugins/session-usage-band/hooks/register.tsx plugins/session-usage-band/tests/insights.test.ts
git commit -m "fix: a subagent's turn no longer leaves its start cost behind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Time formats and the phrasebook

**Files:**
- Modify: `hooks/format.ts`
- Create: `hooks/words.ts` (pure)
- Modify: `hooks/band.tsx` (`LIMITS` uses the window constants)
- Test: `tests/phrases.test.ts` (new)

**Interfaces:**
- **Produces, in `format.ts`:**
  - `FIVE_HOUR_MS`, `SEVEN_DAY_MS`;
  - `fmtSecondsLeft(ms): string` → `47s left`;
  - `fmtLeft(ms): string` → `1h 00m left`, `52m left`, `10m left`, `47s left`;
  - `fmtLeftSpoken(ms): string` → `1 hour left`, `52 minutes left`, `47 seconds left`;
  - `fmtEtaSpoken(ms): string` → `about 40 minutes`, `about 1 hour 15 minutes`;
  - `fmtClock(ms, utcOffsetMin): string` → `14:32`;
  - `fmtDayClock(ms, utcOffsetMin, now): string` → `14:32` on the same day, `Mon 08:40` otherwise.
- **Produces, in `words.ts`:**

```ts
/** The colour a piece of a phrase is drawn in. */
export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
/** A phrase in pre-coloured segments, as `words()` draws it: a view places it, never slices it. */
export type Say = ReadonlyArray<readonly [string, Role]>
/** An amber reading's words: long while a calm piece remains to give way, then short. */
export type Amber = Readonly<{ long: string; short: string }>
export const AMBER: Readonly<{
  cache: (left: string, leftShort: string, estimate: string) => Amber
  context: (frac: number, toCompact: number) => Amber
  contextNoCompaction: (frac: number) => Amber
  limit: (name: string, percentUsed: number) => Amber
  limitPace: (name: string, eta: string) => Amber
}>
export const EMPTY: Readonly<{ costs: string; costsShort: string; history: string; context: string; limits: string }>
export const resetPhrase: (r: ResetIn, form: 'words' | 'glyph') => string   // 'resets in 3h 00m' | '↻ in 3h 00m' | 'reset'
export const paceText: (p: Readonly<{ etaMs: number | null; projectedPct: number | undefined }>) => string
export const altOf: (name: string, value: string, state?: string, more?: string) => string
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/phrases.test.ts
import { test, expect } from 'claude-code/testing'
import { fmtClock, fmtDayClock, fmtEtaSpoken, fmtLeft, fmtLeftSpoken, fmtSecondsLeft } from '../hooks/format'
import { AMBER, EMPTY, altOf, paceText, resetPhrase } from '../hooks/words'

const T = Date.UTC(2026, 9, 9, 13, 40) // a Friday, 13:40 UTC
const MIN = 60_000

test('clock times are local and 24-hour', () => {
  expect(fmtClock(T, 0)).toBe('13:40')
  expect(fmtClock(T, 120)).toBe('15:40')
  expect(fmtClock(T, -330)).toBe('08:10')
})
test('a clock time on another day names the day', () => {
  expect(fmtDayClock(T + 3 * 60 * MIN, 0, T)).toBe('16:40')
  expect(fmtDayClock(T + 67 * 60 * MIN, 0, T)).toBe('Mon 08:40')
})
test('a countdown is words, never a clock', () => {
  expect(fmtSecondsLeft(47_000)).toBe('47s left')
  expect(fmtSecondsLeft(400)).toBe('1s left')
  expect(fmtLeft(60 * MIN)).toBe('1h 00m left')
  expect(fmtLeft(52 * MIN)).toBe('52m left')
  expect(fmtLeft(9.5 * MIN)).toBe('10m left')
  expect(fmtLeft(47_000)).toBe('47s left')
  for (const ms of [60 * MIN, 52 * MIN, 9.5 * MIN, 47_000]) expect(fmtLeft(ms)).not.toMatch(/\d:\d\d/)
})
test('a screen reader hears durations spelled out', () => {
  expect(fmtLeftSpoken(60 * MIN)).toBe('1 hour left')
  expect(fmtLeftSpoken(65 * MIN)).toBe('1 hour 5 minutes left')
  expect(fmtLeftSpoken(52 * MIN)).toBe('52 minutes left')
  expect(fmtLeftSpoken(47_000)).toBe('47 seconds left')
  expect(fmtLeftSpoken(1_000)).toBe('1 second left')
  expect(fmtEtaSpoken(40 * MIN)).toBe('about 40 minutes')
  expect(fmtEtaSpoken(60 * MIN)).toBe('about 1 hour')
  expect(fmtEtaSpoken(75 * MIN)).toBe('about 1 hour 15 minutes')
})
test('a reset reads as a duration, never as a clock', () => {
  expect(resetPhrase({ kind: 'in', text: '3h 00m' }, 'words')).toBe('resets in 3h 00m')
  expect(resetPhrase({ kind: 'in', text: '3h 00m' }, 'glyph')).toBe('↻ in 3h 00m')
  expect(resetPhrase({ kind: 'passed' }, 'words')).toBe('reset')
})
test('pace speaks a measured rate first, then the average', () => {
  expect(paceText({ etaMs: 40 * MIN, projectedPct: 50 })).toBe('full in ~40m')
  expect(paceText({ etaMs: null, projectedPct: 112 })).toBe('full before reset')
  expect(paceText({ etaMs: null, projectedPct: 9.6 })).toBe('on pace for ~10%')
  expect(paceText({ etaMs: null, projectedPct: undefined })).toBe('')
})
test('every amber phrase, long and short, starts with "! " once', () => {
  const all = [
    AMBER.cache('47s left', '47s', '~$1.66'),
    AMBER.context(0.93, 12_000),
    AMBER.contextNoCompaction(0.85),
    AMBER.limit('5h', 82),
    AMBER.limitPace('5h', '~40m'),
  ]
  expect(all).toEqual([
    { long: '! 47s left · re-warm ~$1.66', short: '! 47s' },
    { long: '! context 93% · compacts in ~12k', short: '! ctx 93%' },
    { long: '! context 85%', short: '! ctx 85%' },
    { long: '! 5h 82%', short: '! 5h 82%' },
    { long: '! 5h full in ~40m', short: '! 5h ~40m' },
  ])
  for (const a of all) for (const s of [a.long, a.short]) {
    expect(s.startsWith('! ')).toBe(true)
    expect(s.match(/!/g)?.length).toBe(1)
  }
})
test('empty states read like the band', () => {
  expect(EMPTY).toEqual({
    costs: "Costs show after Claude's next reply.",
    costsShort: 'No costs yet.',
    history: 'History fills in as you use Claude.',
    context: 'not reported',
    limits: 'none reported',
  })
})
test('alt text is words: no ~ and no ↻', () => {
  const alts = [
    altOf('5h limit', '84 percent used', 'needs attention', 'full in about 40 minutes'),
    altOf('cache', '52 minutes left', 'warm'),
    altOf('cache', 'cold', 're-warm about $1.66'),
  ]
  expect(alts).toEqual(['5h limit 84 percent used, needs attention, full in about 40 minutes', 'cache 52 minutes left, warm', 'cache cold, re-warm about $1.66'])
  for (const a of alts) expect(a).not.toMatch(/[~↻]/)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh phrases`
Expected: FAIL, because `../hooks/words` is missing and the formats aren't exported.

- [ ] **Step 3: Implement in `format.ts`**

Append after `fmtAgo`:

```ts
export const FIVE_HOUR_MS = 5 * 3600_000
export const SEVEN_DAY_MS = 7 * 24 * 3600_000

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const local = (ms: number, utcOffsetMin: number): Date => new Date(ms + utcOffsetMin * 60_000)
const hhmm = (d: Date): string => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`

/** A local 24-hour clock time: `14:32`. The offset is east-positive minutes. */
export const fmtClock = (ms: number, utcOffsetMin: number): string => hhmm(local(ms, utcOffsetMin))

/** A clock time, with its weekday when it isn't today: `16:40`, `Mon 08:40`. */
export const fmtDayClock = (ms: number, utcOffsetMin: number, now: number): string => {
  const at = local(ms, utcOffsetMin)
  const today = local(now, utcOffsetMin)
  const sameDay = at.getUTCFullYear() === today.getUTCFullYear() && at.getUTCMonth() === today.getUTCMonth() && at.getUTCDate() === today.getUTCDate()
  return sameDay ? hhmm(at) : `${DAYS[at.getUTCDay()]} ${hhmm(at)}`
}

/** The cache's last minute in words, where a `0:47` would read as a clock. */
export const fmtSecondsLeft = (ms: number): string => `${Math.max(1, Math.ceil(ms / 1000))}s left`

/** A countdown in words for the new layouts: `1h 00m left`, `52m left`, `10m left`, `47s left`. */
export const fmtLeft = (ms: number): string =>
  ms < 60_000 ? fmtSecondsLeft(ms) : ms < 600_000 ? `${Math.ceil(ms / 60_000)}m left` : `${fmtCountdown(ms)} left`

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`

/** The same countdown as a screen reader should hear it: `1 hour 5 minutes left`. */
export const fmtLeftSpoken = (ms: number): string => {
  if (ms < 60_000) return `${plural(Math.max(1, Math.ceil(ms / 1000)), 'second')} left`
  if (ms < 600_000) return `${plural(Math.ceil(ms / 60_000), 'minute')} left`
  const mins = Math.floor(Math.round(ms / 1000) / 60)
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  const said = [hours > 0 ? plural(hours, 'hour') : '', rest > 0 || hours === 0 ? plural(rest, 'minute') : ''].filter(Boolean)
  return `${said.join(' ')} left`
}

/** A projection spelled out, rounded as `fmtEta` rounds it: `about 40 minutes`. */
export const fmtEtaSpoken = (ms: number): string => {
  const mins = Math.max(0, ms) / 60_000
  if (mins < 57.5) return `about ${plural(Math.max(5, Math.round(mins / 5) * 5), 'minute')}`
  const quarter = Math.round(mins / 15) * 15
  const hours = Math.floor(quarter / 60)
  const rest = quarter % 60
  return `about ${plural(hours, 'hour')}${rest ? ` ${plural(rest, 'minute')}` : ''}`
}
```

Make `band.tsx`'s `LIMITS` use `FIVE_HOUR_MS` / `SEVEN_DAY_MS` in place of its literals. The values are the same.

- [ ] **Step 4: Write `hooks/words.ts`**

```ts
// The phrasebook: every phrase a new layout draws, built from facts the
// readings hold. Pure, and the one place a layout's words are written, so
// amber, pace, resets, empty states and alt text read the same everywhere.

import { fmtEta, fmtTokens } from './format'
import type { ResetIn } from './format'

export type Role = 'label' | 'value' | 'amber' | 'accent5' | 'accent7'
export type Say = ReadonlyArray<readonly [string, Role]>
export type Amber = Readonly<{ long: string; short: string }>

const pct = (frac: number): string => `${Math.round(frac * 100)}%`

/** What an amber reading says, long and short, always led by one `! `. */
export const AMBER = {
  cache: (left: string, leftShort: string, estimate: string): Amber => ({ long: `! ${left} · re-warm ${estimate}`, short: `! ${leftShort}` }),
  context: (frac: number, toCompact: number): Amber => ({ long: `! context ${pct(frac)} · compacts in ~${fmtTokens(toCompact)}`, short: `! ctx ${pct(frac)}` }),
  contextNoCompaction: (frac: number): Amber => ({ long: `! context ${pct(frac)}`, short: `! ctx ${pct(frac)}` }),
  limit: (name: string, percentUsed: number): Amber => {
    const said = `! ${name} ${Math.round(percentUsed)}%`
    return { long: said, short: said }
  },
  limitPace: (name: string, eta: string): Amber => ({ long: `! ${name} full in ${eta}`, short: `! ${name} ${eta}` }),
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  /** Pulse's, where the full sentence won't fit. */
  costsShort: 'No costs yet.',
  history: 'History fills in as you use Claude.',
  context: 'not reported',
  limits: 'none reported',
} as const

/** A reset as a duration: words in sentences, the glyph on tight rows. */
export const resetPhrase = (r: ResetIn, form: 'words' | 'glyph'): string =>
  r.kind === 'passed' ? 'reset' : form === 'words' ? `resets in ${r.text}` : `↻ in ${r.text}`

/** A window's pace in words: a measured fill first, then the average's landing. */
export const paceText = (p: Readonly<{ etaMs: number | null; projectedPct: number | undefined }>): string =>
  p.etaMs !== null
    ? `full in ${fmtEta(p.etaMs)}`
    : p.projectedPct === undefined
      ? ''
      : p.projectedPct >= 100
        ? 'full before reset'
        : `on pace for ~${Math.round(p.projectedPct)}%`

/** What a screen reader hears for a drawn reading: `<name> <value>, <state>,
 *  <more>`, in words. A caller passes "about" and "resets in", never ~ or ↻. */
export const altOf = (name: string, value: string, state?: string, more?: string): string =>
  [`${name} ${value}`, state, more].filter((s): s is string => s !== undefined && s !== '').join(', ')
```

- [ ] **Step 5: Run the tests**

Run: `tools/test-only.sh phrases`, then `claude plugin test plugins/session-usage-band`
Expected: PASS, golden included.

- [ ] **Step 6: Commit**

```bash
git add plugins/session-usage-band/hooks/format.ts plugins/session-usage-band/hooks/words.ts plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/tests/phrases.test.ts
git commit -m "feat: clock times, spoken durations and the phrasebook the new layouts speak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: The facts, and chips draws from `readingsOf`

**Files:**
- Modify: `hooks/reading.ts`, which gains the fact builders, `Readings` and `readingsOf`
- Modify: `hooks/snapshot.ts` (`Glyphs`, and the optional `glyphs` and `utcOffsetMin`)
- Modify: `hooks/band.tsx`, where the computations move out and are replaced by reads of `read`
- Modify: `tests/matrix.ts` (`snapOf`)
- Test: `tests/readings.test.ts` (new)

**Interfaces:**
- **Consumes:** `FIVE_HOUR_MS`, `SEVEN_DAY_MS` (Task 4).
- **Produces** (exact):

```ts
// snapshot.ts
export type Glyphs = 'unicode' | 'ascii'
// BandSnapshot gains, optional until Tasks 8 and 10c: glyphs?: Glyphs; utcOffsetMin?: number

// reading.ts
export type { Glyphs } from './snapshot'
export type Frame = Readonly<{ expanded: boolean; maxRows: number; now: number; isWorking: boolean; glyphs: Glyphs; utcOffsetMin: number | undefined }>
export type CacheFacts = Readonly<{ mood: CacheMood; tone: Tone; charge: number; estimate: string; measured: boolean; known: boolean }>
export type ContextFacts = ReturnType<typeof contextReading> & Readonly<{ compactAt: number | undefined; window: number }>
export type SpendFacts = Readonly<{ totalUsd: number; lastTurnUsd: number | null; sent: number; back: number; cached: number; total: number }>
export type LimitKey = '5h' | '7d' | 'other'
export type LimitFacts = Readonly<{
  name: string; key: LimitKey; percentUsed: number; frac: number; tone: Tone
  /** `82%`, with no severity mark: chips adds its own. */
  value: string
  etaMs: number | null; reset: ResetIn | undefined; passed: boolean; gone: number | undefined
  /** 100 when a 5h fill is measured; else the average's landing, once 5% of the window has gone. */
  projectedPct: number | undefined
}>
/** A window as chips' Limits card reads it: the facts, its raw reading, and the card's pace tail. */
export type ChipsWindow = LimitFacts & Readonly<{ reading: LimitReading; windowMs: number | undefined; cardPace: string }>
export type ChipsReadings = Readonly<{
  /** The snapshot itself: chips' own code moved over unchanged. Only chips reads it. */
  raw: BandSnapshot
  reading: Readonly<{ copy: CacheCopy; tokenBreakdown: string; windows: readonly ChipsWindow[]; worst: ChipsWindow | undefined }>
}>
// What the views read. Task 13 widens each to facts & words.
export type CacheReading = CacheFacts
export type ContextReading = ContextFacts
export type SpendReading = SpendFacts
export type LimitView = LimitFacts
export type Readings = Readonly<{
  frame: Frame
  cache: CacheReading
  spend: SpendReading
  context: ContextReading
  fiveHour: LimitView | undefined
  sevenDay: LimitView | undefined
  /** 5h, 7d, then every other window the engine reports. */
  limits: readonly LimitView[]
  worstLimit: LimitView | undefined
  workspace: BandSnapshot['workspace']
  chips: ChipsReadings
}>
export const cacheFacts: (snap: BandSnapshot) => CacheFacts
export const contextFacts: (snap: BandSnapshot) => ContextFacts
export const spendFacts: (snap: BandSnapshot) => SpendFacts
export const limitFacts: (snap: BandSnapshot) => ChipsWindow[]
export const readingsOf: (snap: BandSnapshot) => Readings
// tests/matrix.ts
export const snapOf: (over?: Partial<BandSnapshot>) => BandSnapshot
```

- [ ] **Step 1: Add `snapOf` to `tests/matrix.ts`**

One snapshot builder for every pure test. As later tasks make snapshot fields required (Tasks 8, 10a, 10c, 23, 24), each adds its field here, so no test keeps its own builder.

```ts
import { DARK } from '../hooks/palette'
import type { BandSnapshot } from '../hooks/snapshot'

/** A snapshot for pure tests: a calm session at 120 columns, 52 minutes of
 *  cache left, 38% context with compaction at 190k, 5h at 4% and 7d at 30%. */
export const snapOf = (over: Partial<BandSnapshot> = {}): BandSnapshot => ({
  surface: 'terminal', columns: 120, maxRows: 13, isWorking: false, expanded: false, palette: DARK, now: 0,
  cache: {
    requests: 1, msLeft: 52 * MIN, ttl: '1h', ttlPinned: true, window: 155_000, hitRatio: 0.96, misses: 0, reWarmUsd: 1.66,
    savedUsd: 11.4, readShare: 0.05, fresh: true, recalled: false, idleMs: null, tokens: { sent: 18_000, back: 9_000, cached: 198_000 },
  },
  costUsd: 3.19, lastTurnUsd: 0.21,
  context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: 190_000 },
  fiveHour: { percentUsed: 4, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 30, resetsAt: new Date(67 * HOUR).toISOString() },
  otherLimits: [], workspace: undefined,
  ...over,
})
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/readings.test.ts
import { test, expect } from 'claude-code/testing'
import { readingsOf } from '../hooks/reading'
import { snapOf } from './matrix'

const HOUR = 3600_000

test('readings name every limit with its tone, value, reset and projection', () => {
  const r = readingsOf(snapOf())
  expect(r.fiveHour?.value).toBe('4%')
  expect(r.fiveHour?.reset).toEqual({ kind: 'in', text: '3h 00m' })
  expect(Math.abs((r.sevenDay?.projectedPct ?? 0) - 30 / (1 - 67 / 168))).toBeLessThan(1e-5)
  expect(r.worstLimit?.name).toBe('7d')
  expect(r.limits.map(l => l.name)).toEqual(['5h', '7d'])
})
test("chips' card keeps its own pace tail", () => {
  expect(readingsOf(snapOf()).chips.reading.windows.map(w => w.cardPace)).toEqual([' · on pace for ~10%', ' · on pace for ~50%'])
})
test('a limit at 82% reads 5h 82%, with no mark, and is amber', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect(`${r.fiveHour?.name} ${r.fiveHour?.value}`).toBe('5h 82%')
  expect(r.fiveHour?.tone).toBe('amber')
})
test('a measured 5h fill sets its projection to 100', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * 60_000).toISOString(), etaMs: 40 * 60_000 } }))
  expect(r.fiveHour?.projectedPct).toBe(100)
  expect(r.fiveHour?.tone).toBe('amber')
  expect(r.chips.reading.windows[0]?.cardPace).toBe(' · full in ~40m')
})
test('a gateway spend limit is a limit named spend', () => {
  const r = readingsOf(snapOf({ otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: undefined }] }))
  expect(r.limits.at(-1)?.name).toBe('spend')
  expect(r.limits.at(-1)?.key).toBe('other')
  expect(r.limits.at(-1)?.tone).toBe('amber')
})
test('the cache facts carry its mood, tone, charge and price', () => {
  const r = readingsOf(snapOf())
  expect(r.cache.mood).toBe('warm')
  expect(r.cache.tone).toBe('calm')
  expect(r.cache.estimate).toBe('~$1.66')
  expect(r.chips.reading.copy.pill(false)).toBe('cache 52m')
  expect(r.spend.total).toBe(225_000)
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `tools/test-only.sh readings`
Expected: FAIL, because `readingsOf` is not exported.

- [ ] **Step 4: Move the facts into `reading.ts`**

Add `Glyphs`, and the optional `glyphs?: Glyphs; utcOffsetMin?: number`, to `snapshot.ts`. `Glyphs` lives there because the contract owns it; `reading.ts` re-exports it.

Move each computation word for word, by symbol name:

| From `band.tsx` (40943d3) | Into |
| --- | --- |
| `mood`, `copy`, `estimate`, `cacheTone`, `charge` (182–186) | `cacheFacts`; `copy` into `read.chips.reading.copy` |
| `tokenBreakdown`, `tokenTotal` (188–189) | `read.chips.reading.tokenBreakdown`; `spendFacts().total` |
| the `contextReading` call (191–200) | `contextFacts` |
| `windowGone`, `hasReset`, `limitTone` wrappers (312–314) | gone: their callers read `tone`, `gone` and `passed` from the facts |
| `measured` (554), `known` (556) | `cacheFacts` |
| `windows` (618–630) | `limitFacts`, with `FIVE_HOUR_MS` / `SEVEN_DAY_MS` for the windows' lengths, and without `accent` |
| `projected` and the card's pace (645–653, inside `limitRows`, 635–668) | `limitFacts`: `projectedPct` and `cardPace` |
| `worst` (677), over `live` (631) | `readingsOf`: `worstLimit` and `read.chips.reading.worst` |

```ts
// ---- the facts every layout draws from ------------------------------------
// Moved from band.tsx word for word; words.ts phrases them (Task 13).

export type { Glyphs } from './snapshot'

export const cacheFacts = (snap: BandSnapshot): CacheFacts => {
  const c = snap.cache
  const mood = cacheMood(c)
  const measured = c.requests > 0
  return {
    mood,
    tone: mood === 'expiring' ? 'amber' : 'calm',
    charge: cacheCharge(c, mood, snap.isWorking),
    estimate: reWarmEstimate(c),
    measured,
    // Measured, or recalled from the session's last reply: time and price known.
    known: measured || c.recalled,
  }
}

export const contextFacts = (snap: BandSnapshot): ContextFacts => ({
  ...contextReading(snap.context),
  compactAt: snap.context.compactAt,
  window: snap.context.window,
})

export const spendFacts = (snap: BandSnapshot): SpendFacts => {
  const t = snap.cache.tokens
  return { totalUsd: snap.costUsd, lastTurnUsd: snap.lastTurnUsd, sent: t.sent, back: t.back, cached: t.cached, total: t.sent + t.back + t.cached }
}

/** Each window the engine reports, 5h, 7d, then the rest, as the Limits card read them. */
export const limitFacts = (snap: BandSnapshot): ChipsWindow[] => {
  const one = (name: string, key: LimitKey, reading: LimitReading, windowMs: number | undefined, etaMs: number | null): ChipsWindow => {
    const reset = resetIn(reading.resetsAt, snap.now)
    const gone = windowGone(reading, windowMs, snap.now)
    // A measured pace, as the chip says it; else where the window's average
    // rate ends it. Too early to say, it waits.
    const projected = gone === undefined || gone < 0.05 ? undefined : reading.percentUsed / gone
    const cardPace =
      etaMs !== null
        ? ` · full in ${fmtEta(etaMs)}`
        : projected === undefined
          ? ''
          : projected >= 100
            ? ' · full before reset'
            : ` · on pace for ~${Math.round(projected)}%`
    return {
      name, key, reading, windowMs, etaMs, reset, gone, cardPace,
      percentUsed: reading.percentUsed,
      frac: clamp01(reading.percentUsed / 100),
      tone: limitTone(reading, snap.now, etaMs),
      value: `${Math.round(reading.percentUsed)}%`,
      passed: reset?.kind === 'passed',
      // A measured fill lands it at 100, so the words and the amber agree.
      projectedPct: etaMs !== null ? 100 : projected,
    }
  }
  return [
    ...(snap.fiveHour ? [one('5h', '5h', snap.fiveHour, FIVE_HOUR_MS, snap.fiveHour.etaMs)] : []),
    ...(snap.sevenDay ? [one('7d', '7d', snap.sevenDay, SEVEN_DAY_MS, null)] : []),
    ...snap.otherLimits.map(limit => one(limit.kind === 'spend_limit' ? 'spend' : limit.kind.replace(/_/g, ' '), 'other', limit, undefined, null)),
  ]
}

export const readingsOf = (snap: BandSnapshot): Readings => {
  const c = snap.cache
  const cache = cacheFacts(snap)
  const windows = limitFacts(snap)
  // The headline is the window closest to its limit.
  const worst = windows.filter(w => !w.passed).reduce<ChipsWindow | undefined>((top, w) => (top === undefined || w.percentUsed > top.percentUsed ? w : top), undefined)
  return {
    frame: { expanded: snap.expanded, maxRows: snap.maxRows, now: snap.now, isWorking: snap.isWorking, glyphs: snap.glyphs ?? 'unicode', utcOffsetMin: snap.utcOffsetMin },
    cache,
    spend: spendFacts(snap),
    context: contextFacts(snap),
    fiveHour: windows.find(w => w.key === '5h'),
    sevenDay: windows.find(w => w.key === '7d'),
    limits: windows,
    worstLimit: worst,
    workspace: snap.workspace,
    chips: {
      raw: snap,
      reading: {
        copy: cacheCopy(c, cache.mood, snap.isWorking),
        tokenBreakdown: `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`,
        windows,
        worst,
      },
    },
  }
}
```

Add `FIVE_HOUR_MS`, `SEVEN_DAY_MS`, `fmtEta` and `type ResetIn` to the `./format` import, and `type Glyphs` to the `./snapshot` one (the re-export alone doesn't bring it into scope).

- [ ] **Step 5: Make `band.tsx` read from `read`**

At the top of `drawBand`, add `const read = readingsOf(snap)`, then replace each moved local:
- `mood` → `read.cache.mood`, `copy` → `read.chips.reading.copy`, `estimate` → `read.cache.estimate`, `cacheTone` → `read.cache.tone`, `charge` → `read.cache.charge`;
- `tokenBreakdown` → `read.chips.reading.tokenBreakdown`, `tokenTotal` → `read.spend.total`;
- the context names: `const { known: hasContext, used: ctxUsed, frac: ctxFrac, pct: ctxPct, toCompact, nearCompact, tone: ctxTone } = read.context`;
- in `buildPills`, `limitTone(snap.fiveHour, eta)` → `read.fiveHour?.tone ?? 'calm'` and `limitTone(snap.sevenDay)` → `read.sevenDay?.tone ?? 'calm'`;
- `measured` → `read.cache.measured`, `known` → `read.cache.known`;
- `windows` → `read.chips.reading.windows`. Each window's bar accent comes from a local `windowAccent = (w: ChipsWindow) => w.key === '5h' ? LIMITS['5h'].tint(palette).accent : w.key === '7d' ? LIMITS['7d'].tint(palette).accent : palette.meterFill`;
- in `limitRows`, `tone` → `w.tone` and the pace → `w.cardPace`;
- `worst` → `read.chips.reading.worst`, and its tone → `worst.tone`.

Delete only the moved lines. Leave drawing code alone.

- [ ] **Step 6: Run the tests, golden first**

Run: `tools/test-only.sh 'golden-*' readings`
Expected: PASS.

Then the guard check: change one moved line on purpose (say, `' · on pace for ~'` to `' · on pace ~'` in `cardPace`), run `tools/test-only.sh 'golden-*'`, watch it fail, and revert. A golden failure you didn't cause means a moved line changed meaning: diff it against `git show 40943d3:plugins/session-usage-band/hooks/band.tsx`, fix it, and never touch the golden file.

- [ ] **Step 7: Type-check, run everything, and commit**

Run: `npx -y -p typescript@5.6.3 tsc -p plugins/session-usage-band`, then `claude plugin test plugins/session-usage-band`
Expected: no type errors; PASS.

```bash
git add plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/hooks/snapshot.ts plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/readings.test.ts
git commit -m "refactor: every fact the band shows comes from one readings model

Golden guard checked: changing the card's pace wording turned golden red;
reverted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Rows and widths for multi-row layouts

**Files:**
- Modify: `hooks/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- **Produces:**
  - `ROW_PX = 24`;
  - `cellsOf` measures a Box with `flexDirection: 'column'` as its widest child, not their sum. Each collapsed row of a layout is squeezed on its own with the existing `squeezeToFit` (through `fitLine`, Task 9b).

- [ ] **Step 1: Write the failing test** (append to `tests/layout.test.ts`)

```ts
import { cellsOf, ROW_PX, TERMINAL } from '../hooks/layout'

test('a column Box is as wide as its widest row', () => {
  const col = { type: 'Box', props: { flexDirection: 'column' }, children: [
    { type: 'Text', props: {}, children: ['abcdef'] },
    { type: 'Text', props: {}, children: ['abc'] },
  ] }
  expect(cellsOf(col as never, TERMINAL)).toBe(6)
  expect(ROW_PX).toBe(24)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `tools/test-only.sh layout`
Expected: FAIL: 9 is not 6, and `ROW_PX` is not exported.

- [ ] **Step 3: Implement**

In `cellsOf`'s `'Box' | 'Text'` branch, after the numeric `width` check and before computing `own`:

```ts
      if (n.type === 'Box' && n.props?.flexDirection === 'column') {
        const widest = kids.reduce((max: number, k) => Math.max(max, cellsOf(k, m)), 0)
        const pad = typeof n.props?.paddingX === 'number' ? 2 * n.props.paddingX : 0
        return Math.max(typeof n.props?.minWidth === 'number' ? n.props.minWidth : 0, widest + pad)
      }
```

Then add:

```ts
/** A row's height on the desktop, for counting how many rows a layout takes. */
export const ROW_PX = 24
```

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh layout 'golden-*'`, then the full suite.
Expected: PASS. Chips never measures a column Box, so its trees don't change. If golden fails, a chips measurement did cross a column Box: find it, and fix the measurement there rather than reverting.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/layout.ts plugins/session-usage-band/tests/layout.test.ts
git commit -m "feat: measure a column as its widest row, for layouts that take two

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: The chart builders

**Files:**
- Create: `hooks/charts.tsx`
- Modify: `hooks/band.tsx` (its `meter` moves to `charts.tsx`)
- Modify: `hooks/icons.ts` (`sun`, `cloud`, `snow`)
- Modify: `tests/helpers.ts` (`fakeEl`)
- Test: `tests/charts.test.ts`

**Interfaces:**
- **Produces:** each builder takes `kit` first and returns a `RenderChildren`. On the desktop it draws an Svg with `alt` and `width`; elsewhere, text. Every builder takes a `key`.

```ts
export type MeterOptions = Readonly<{ key?: string; label: string; frac: number; tone: Tone; accent: string; size?: BarSize; stretch?: boolean; reads?: 'used' | 'left'; tick?: number; projectTo?: number }>
export const meter: (kit: Kit, o: MeterOptions) => RenderChildren
export const ring: (kit: Kit, o: Readonly<{ key: string; alt: string; frac: number; color: string; px: number; dot?: number; centre?: string }>) => RenderChildren
export const sparkline: (kit: Kit, o: Readonly<{ key: string; alt: string; values: readonly number[]; color: string; px: number; height: number; projectTo?: number }>) => RenderChildren
export const barChart: (kit: Kit, o: Readonly<{ key: string; alt: string; values: readonly number[]; marked: readonly boolean[]; color: string; markColor: string; newestColor?: string; px: number; height: number }>) => RenderChildren
export const dayCells: (kit: Kit, o: Readonly<{ key: string; alt: string; values: ReadonlyArray<number | undefined>; guess?: readonly boolean[]; today: number; color: string; cellPx: number; height: number; labels?: readonly string[] }>) => RenderChildren
export const underline: (kit: Kit, o: Readonly<{ key: string; alt: string; frac: number; color: string; px: number; dashed?: boolean }>) => RenderChildren
export const braille: (values: readonly number[], max: number) => string
// icons.ts gains 'sun', 'cloud' and 'snow' (Icon, ICON_PATHS, GLYPH '' (words carry them), ALT)
// tests/helpers.ts
export const fakeEl: ElementTable
```

- [ ] **Step 1: Add `fakeEl` to `tests/helpers.ts`**

JSX's `h` calls a function component with its props, so element constructors that return plain nodes let a test call a builder, or `drawBand`, without mounting:

```ts
import type { ElementTable } from 'claude-code'

/** Element constructors for drawing outside a mount: each returns the plain
 *  node a surface would, its children flattened. */
const plainNode = (type: string) => (p: Readonly<Record<string, unknown>> | null): Node => {
  const { children, ...props } = p ?? {}
  return { type, props, children: children === undefined ? [] : [children].flat(Infinity) }
}
export const fakeEl = { Box: plainNode('Box'), Text: plainNode('Text'), Button: plainNode('Button'), Svg: plainNode('Svg') } as unknown as ElementTable
```

**Ruling: how `h` passes children and keys.** The kit's `h` calls a function component. The fake nodes must carry the children (as `children`) and the JSX `key` (as `props.key`, which `byKey` reads). If `h` passes either otherwise, adjust `plainNode` here, once, until `shown(drawBand(fakeEl, snapOf(), NO_ACT))` (Task 10a) reads the band's text and `byKey(drawBand(fakeEl, snapOf(), NO_ACT), 'more', 'Button')` finds the toggle. Every test that draws outside a mount goes through it.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/charts.test.ts
import { test, expect } from 'claude-code/testing'
import { barChart, braille, dayCells, meter, ring, sparkline, underline } from '../hooks/charts'
import { makeKit } from '../hooks/kit'
import { fakeEl, type Node } from './helpers'
import { snapOf } from './matrix'

test('braille puts two values in a cell, four heights each', () => {
  expect(braille([0, 0], 4)).toBe('⠀')
  expect(braille([4, 4], 4)).toBe('⣿')
  expect(braille([1, 0], 4)).toBe('⡀')
  expect(braille([0, 1], 4)).toBe('⢀')
  expect(braille([4, 0, 2], 4)).toBe('⡇⡄')
  expect([...braille([1, 2, 3, 4, 3, 2], 4)].length).toBe(3)
})
test('braille is one column everywhere: every glyph is in U+2800–28FF', () => {
  for (const ch of braille([0, 1, 2, 3, 4, 3, 2, 1], 4)) expect((ch.codePointAt(0) ?? 0) >= 0x2800 && (ch.codePointAt(0) ?? 0) <= 0x28ff).toBe(true)
})

const desk = makeKit(fakeEl, snapOf({ surface: 'desktop' }))
const svg = (el: unknown) => el as Node & { props: { alt: string; width: number; source: string } }
for (const [name, el] of [
  ['ring', ring(desk, { key: 'r', alt: 'cache 87 percent left', frac: 0.87, color: '#7fcf8a', px: 30, dot: 0.4 })],
  ['sparkline', sparkline(desk, { key: 's', alt: '5h usage over the last hour', values: [1, 2, 3], color: '#7fcf8a', px: 90, height: 36, projectTo: 1 })],
  ['barChart', barChart(desk, { key: 'b', alt: 'cost of the last 3 messages', values: [1, 2, 9], marked: [false, false, true], color: '#888888', markColor: '#eeeeee', newestColor: '#ececf2', px: 18, height: 36 })],
  ['dayCells', dayCells(desk, { key: 'd', alt: 'weekly limit by day', values: [6, 9, 11, 4, 7, 7, 7], guess: [false, false, false, false, true, true, true], today: 3, color: '#a99cf0', cellPx: 16, height: 16, labels: ['T', 'W', 'T', 'F', 'S', 'S', 'M'] })],
  ['underline', underline(desk, { key: 'u', alt: 'context 38 percent', frac: 0.38, color: '#b8b8c2', px: 64, dashed: true })],
  ['meter with a tick and a projection', meter(desk, { key: 'm', label: '5h', frac: 0.04, tone: 'calm', accent: '#7fcf8a', tick: 0.4, projectTo: 0.1 })],
] as const) {
  test(`${name} draws one Svg with alt, width and no ids`, () => {
    const n = svg(el)
    expect(n.type).toBe('Svg')
    expect(n.props.alt.length).toBeGreaterThan(0)
    expect(n.props.width).toBeGreaterThan(0)
    expect(n.props.source).not.toMatch(/\bid=|<clipPath|<linearGradient|<pattern/)
  })
}
test("the meter's tick is a rect of class tick, and a projection is dashed", () => {
  const source = svg(meter(desk, { label: '5h', frac: 0.04, tone: 'calm', accent: '#7fcf8a', tick: 0.4, projectTo: 0.1 })).props.source
  expect(source).toMatch(/<rect class="tick"/)
  expect(source).toMatch(/stroke-dasharray="3 2"/)
})
test('a guessed day cell is dashed', () => {
  expect(svg(dayCells(desk, { key: 'd', alt: 'week', values: [6, 7], guess: [false, true], today: 0, color: '#a99cf0', cellPx: 16, height: 16 })).props.source).toMatch(/stroke-dasharray/)
})
```

Desktop Svg output for the meter with no options is checked by golden: its strings stay identical.

- [ ] **Step 3: Run them and watch them fail**

Run: `tools/test-only.sh charts`
Expected: FAIL, because `../hooks/charts` is missing.

- [ ] **Step 4: Implement `hooks/charts.tsx`**

1. **Move `meter`.** Move it word for word from `band.tsx` (the `meter` closure in `drawBand`, 130–179) into `charts.tsx` as `meter(kit, o)`, with `palette`, `Svg`, `Text` and `onTone` from `kit`. Keep every Svg string identical when `tick` and `projectTo` are absent, so golden holds.
2. **Add `tick` and `projectTo`** on both surfaces:
   - **desktop `tick`:** append, after the thumb, `<rect class="tick" …>` of width `2*k` at `x = tick*width − k`, `y=-1`, height `tall+2`, filled `palette.value`, with a 1 px `stroke` in the ground colour (`palette.cardBg`) for the knockout;
   - **desktop `projectTo`:** a line from the fill's end to `projectTo*width` at `y=4`, with `stroke-dasharray="3 2"` in `fill`, at full opacity;
   - **text `tick`:** `│` at its cell;
   - **text `projectTo`:** `▒` cells between the fill and `projectTo`.
3. **`ring`:**
   - **desktop:** a track circle and an arc via `stroke-dasharray`, as on the canvas Rings artboard. An optional `dot` (0–1) marks the window gone, with a ground-colour knockout ring of `r+1`. An optional `centre` is drawn as text with `font-family="system-ui, sans-serif"`.
   - **text:** `meter(kit, { key, label: alt, frac, tone: 'calm', accent: color })`.
4. **`sparkline`:**
   - **desktop:** a polyline over `px × height`, with the last point as a dot. When `projectTo` is set, a dashed line (`stroke-dasharray="3 2"`, full opacity) from the last point to `projectTo` of the height.
   - **text:** `braille(values, max(values))` in `color`.
5. **`barChart`:**
   - **desktop:** a rect per value, 4 px wide with a 2 px gap. Bars where `marked` is true (a re-warm) are filled `markColor` and get a 2 px cap above them. The last bar is filled `newestColor` when given.
   - **text:** `braille(values, max(values))`.
6. **`underline`:**
   - **desktop:** a 4 px tall Svg of width `px`: a track in `palette.meterTrack` and a fill of `frac × px` in `color`. With `dashed`, the fill is a 2 px dashed line at full opacity.
   - **text:** `null`. Terminal tiles have no underline.
7. **Icons:** add `sun`, `cloud` and `snow` to `hooks/icons.ts`, as 16-unit stroke paths copied from the canvas Forecast artboard. Give them `GLYPH` `''` (the terminal says the word) and `ALT` `'warm'`, `'cooling'` and `'cold'`.
8. **`dayCells`:**
   - **desktop:** a rect per value, outlined in `palette.trackStroke` and filled from the bottom by `value / max`. A cell whose `guess` is true, or whose value is `undefined`, draws a dashed outline (`stroke-dasharray="2 2"`); a guess still fills to its height. The `today` index gets a 2 px outline in `palette.value`.
   - **desktop `labels`:** when given, each cell's label is drawn under it as Svg text (`font-family="system-ui, sans-serif"`, 9 px). The Svg's height grows by 11 px.
   - **text:** one braille cell per value (left column only: `braille([v, 0], max)`), `·` for an `undefined` value or a guess, and today's cell wrapped in `[` `]`. Labels are not drawn in text; the view draws them on its own line.
9. **`braille`:**

```ts
/** Values as braille, two to a cell: the left column takes dots 7,3,2,1 from
 *  the bottom, the right 8,6,5,4. East-Asian-Neutral, so one column wide
 *  everywhere, as btop and termui draw their graphs. */
const LEFT = [0x40, 0x04, 0x02, 0x01] as const
const RIGHT = [0x80, 0x20, 0x10, 0x08] as const
export const braille = (values: readonly number[], max: number): string => {
  const level = (v: number | undefined) => (v === undefined || max <= 0 ? 0 : Math.max(0, Math.min(4, Math.round((v / max) * 4))))
  let out = ''
  for (let i = 0; i < values.length; i += 2) {
    let bits = 0
    for (let d = 0; d < level(values[i]); d++) bits |= LEFT[d] ?? 0
    for (let d = 0; d < level(values[i + 1]); d++) bits |= RIGHT[d] ?? 0
    out += String.fromCodePoint(0x2800 + bits)
  }
  return out
}
```

In `band.tsx`, replace the local `meter(...)` calls with `meter(kit, { label, frac, tone, accent, size, stretch, reads })`, mapping the positional arguments in order.

- [ ] **Step 5: Run the tests, golden first**

Run: `tools/test-only.sh 'golden-*' charts`
Expected: PASS. Golden is unchanged, because the meter's strings are identical with no new options.

Then the guard check: change one character of the moved meter's track `rect` (say `rx="${2.5 * k}"` to `rx="${2 * k}"`), run `tools/test-only.sh 'golden-*'`, watch it fail, and revert.

- [ ] **Step 6: Run everything and commit**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS.

```bash
git add plugins/session-usage-band/hooks/charts.tsx plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/hooks/icons.ts plugins/session-usage-band/tests/helpers.ts plugins/session-usage-band/tests/charts.test.ts
git commit -m "feat: chart builders for the layouts, with braille for the terminal

Golden guard checked: changing the moved meter's track radius turned golden
red; reverted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Glyph tiers

**Files:**
- Create: `hooks/glyphs.ts`
- Modify: `hooks/register.tsx` (resolve the tier at `session.start`)
- Modify: `hooks/snapshot.ts` (`glyphs` becomes required)
- Modify: `hooks/band.tsx` (apply `asciiTree` on the terminal)
- Modify: `tests/matrix.ts` (`snapOf` gains `glyphs: 'unicode'`)
- Test: `tests/glyphs.test.ts`

**Interfaces:**
- **Produces:**
  - `resolveGlyphs(env: Readonly<{ CC_BAND_GLYPHS?: string; LC_ALL?: string; LC_CTYPE?: string; LANG?: string }>): Glyphs`
  - `ASCII_MAP: Readonly<Record<string, string>>`
  - `asciiText(s: string): string`
  - `asciiTree(tree: RenderElement): RenderElement`

**Rulings against the spec's §3.2 table:**
- **What:** every ascii mapping is at most one character (`↻` and `Σ` are dropped, `…` becomes `.`). This replaces the spec's multi-character `reset`, `tok` and `...`.
- **Why:** the squeeze measures before the mapping, so a mapping must never widen a row.
- **Spaces:** a dropped glyph takes one following space with it (`◷ cache` becomes `cache`). There is no global collapse of double spaces, so deliberate padding survives.
- **Cost if wrong:** slightly terser ascii text.
- Update spec §3.2 in this task's commit to match, and record the ruling in the ledger.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/glyphs.test.ts
import { test, expect } from 'claude-code/testing'
import { ASCII_MAP, asciiText, resolveGlyphs } from '../hooks/glyphs'
import { ROW_SLACK } from '../hooks/layout'
import { caseKey, drawCases, type Mount } from './matrix'
import { firstRow, textOf, widthOf } from './helpers'

test('unicode by default, ascii on request or in a CJK locale', () => {
  expect(resolveGlyphs({})).toBe('unicode')
  expect(resolveGlyphs({ CC_BAND_GLYPHS: 'ascii' })).toBe('ascii')
  expect(resolveGlyphs({ LANG: 'ja_JP.UTF-8' })).toBe('ascii')
  expect(resolveGlyphs({ LANG: 'zh_CN.UTF-8', CC_BAND_GLYPHS: 'unicode' })).toBe('unicode')
})
test('LC_CTYPE alone picks the ascii tier', () => {
  expect(resolveGlyphs({ LANG: 'C', LC_CTYPE: 'ko_KR.UTF-8' })).toBe('ascii')
  expect(resolveGlyphs({ LC_ALL: 'en_US.UTF-8', LC_CTYPE: 'ja_JP.UTF-8' })).toBe('unicode') // LC_ALL wins
})
test('the ascii tier never makes a row wider', () => {
  for (const [from, to] of Object.entries(ASCII_MAP)) expect([...to].length).toBeLessThanOrEqual([...from].length)
})
test('ascii text is pure ASCII, a dropped glyph takes its space, and padding stays', () => {
  expect(asciiText('◷ cache 52m · ↻ 3h 00m Σ 225k ↑2 ↓1 cache – ●… █░▒│▿▵■')).toMatch(/^[\x20-\x7e]*$/)
  expect(asciiText('◷ cache 52m')).toBe('cache 52m')
  expect(asciiText('↻ in 3h 00m')).toBe('in 3h 00m')
  expect(asciiText('ITEM      STATUS')).toBe('ITEM      STATUS')
})
test('chips in the ascii tier draws only ASCII, within the row', async ($, on) => {
  const m: Mount = { surface: 'terminal', cols: 120 }
  const asc = (await drawCases($, on, { scenario: 'calm', appearance: 'dark', env: { CC_BAND_GLYPHS: 'ascii' } }, [m]))[caseKey(m, 'shut')]
  expect(textOf(asc)).toMatch(/^[\x20-\x7e]*$/)
  expect(widthOf(firstRow(asc))).toBeLessThanOrEqual(120 - ROW_SLACK)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh glyphs`
Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement `hooks/glyphs.ts`**

```ts
// The terminal's glyph tier. East-Asian-Ambiguous glyphs (█ ▒ │ · Σ … ±)
// draw two columns wide in a CJK locale, or with a terminal's "ambiguous is
// wide" option, while Ink counts one, so the row would overflow. The ascii
// tier draws ASCII alone; every mapping is one character at most, so the
// squeeze, measured before it, never undercounts. Braille is Neutral width and
// stays in the unicode tier. Unicode EastAsianWidth-18.0.0, checked 2026-10-09.

import type { RenderElement } from 'claude-code'
import type { Glyphs } from './snapshot'

const CJK = /^(ja|zh|ko)([_.-]|$)/i

export const resolveGlyphs = (env: Readonly<{ CC_BAND_GLYPHS?: string; LC_ALL?: string; LC_CTYPE?: string; LANG?: string }>): Glyphs => {
  const asked = env.CC_BAND_GLYPHS?.toLowerCase()
  if (asked === 'ascii' || asked === 'unicode') return asked
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || ''
  return CJK.test(locale) ? 'ascii' : 'unicode'
}

export const ASCII_MAP: Readonly<Record<string, string>> = {
  '█': '#', '░': '-', '▒': ':', '│': '|', '·': '-', '…': '.', '±': '+',
  '●': '*', '■': '#', '–': '-', '↑': '+', '↓': '-', '▿': 'v', '▵': '^',
  '↻': '', 'Σ': '', '◷': '', '◔': '',
}

/** `s` in ASCII: each glyph mapped; one with no mapping, or mapped to nothing,
 *  is dropped with the one space after it, so no gap is left where it was. */
export const asciiText = (s: string): string => {
  const chars = [...s]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? ''
    const to = ch in ASCII_MAP ? (ASCII_MAP[ch] ?? '') : ch.charCodeAt(0) < 0x80 ? ch : ''
    if (to === '' && chars[i + 1] === ' ') i++
    out += to
  }
  return out
}

/** The tree with every string, and every Button label, in ASCII. */
export const asciiTree = (n: RenderElement): RenderElement => {
  const walk = (k: unknown): unknown => {
    if (typeof k === 'string') return asciiText(k)
    if (Array.isArray(k)) return k.map(walk)
    if (k === null || typeof k !== 'object') return k
    const node = k as { props?: Record<string, unknown>; children?: unknown[] }
    const props = node.props && typeof node.props.label === 'string' ? { ...node.props, label: asciiText(node.props.label) } : node.props
    return { ...node, props, children: node.children?.map(walk) }
  }
  return walk(n) as RenderElement
}
```

**If the strip uses a glyph** missing from the table, add it to `ASCII_MAP` and to the pure-ASCII test.

- [ ] **Step 4: Wire it**

1. **`snapshot.ts`:** `glyphs: Glyphs` becomes required. `snapOf` in `tests/matrix.ts` gains `glyphs: 'unicode'`.
2. **`register.tsx`:** `band` gains `glyphs: Glyphs` (default `'unicode'`). At `session.start`, `band.glyphs = resolveGlyphs({ CC_BAND_GLYPHS: await $.env.get('CC_BAND_GLYPHS'), LC_ALL: await $.env.get('LC_ALL'), LC_CTYPE: await $.env.get('LC_CTYPE'), LANG: await $.env.get('LANG') })`. Pass `glyphs: band.glyphs` into the snapshot.
3. **`band.tsx`:** at the end of `drawBand`, `return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree`.

- [ ] **Step 5: Run the tests**

Run: `tools/test-only.sh glyphs readings 'golden-*'`, then the full suite.
Expected: PASS. Golden is unchanged, because the capture's env sets no locale and no `CC_BAND_GLYPHS`.

- [ ] **Step 6: Commit,** including the spec §3.2 update

```bash
git add plugins/session-usage-band/hooks/glyphs.ts plugins/session-usage-band/hooks/snapshot.ts plugins/session-usage-band/hooks/register.tsx plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/glyphs.test.ts design/2026-10-09-band-layouts-spec.md design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "feat: an ascii glyph tier for CJK locales and CC_BAND_GLYPHS=ascii

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
### Task 9a: Chips moves into `views/`, with the shared pills and the frame scaffold

A pure move. Chips keeps its own cache pill, limit chips and expanded cards; what the new views will share moves to `parts.tsx`, and the scaffold they draw in goes in `frame.tsx`.

**Files:**
- Create: `hooks/views/parts.tsx` (`PillSpec`, `pill`, `batteryIcon`, `textBattery`)
- Create: `hooks/views/frame.tsx` (`Strip`, `bodyRowsFor`, `toggleButton`, `panel`, `frame`, `openView`)
- Create: `hooks/views/chips.tsx` (`drawChips`)
- Modify: `hooks/band.tsx`
- Modify: `tests/matrix.ts` (`NO_ACT`)
- Test: `tests/frame.test.ts`

**Interfaces:**
- **Consumes:** `Readings` (Task 5), `meter` (Task 7), `kit`.
- **Produces:**

```ts
// parts.tsx
export type PillSpec = Readonly<{ key: string; tone: Tone; body: RenderChildren[]; hover?: string; paintsOwnBg?: boolean; bg?: string }>
export const pill: (kit: Kit, spec: PillSpec, anchor: 'left' | 'right') => RenderElement   // a hover card only when spec.hover is set
export const batteryIcon: (kit: Kit, charge: number, tone: Tone, alt: string) => RenderChildren
export const textBattery: (kit: Kit, charge: number, tone: Tone, text: string) => RenderChildren[]
// frame.tsx
export type Strip = (kit: Kit, read: Readings, place: 'top' | 'footer', room: number) => RenderChildren
export const bodyRowsFor: (maxRows: number, collapsedRows: number, stripRows: number) => number   // max(0, maxRows − collapsedRows − 3 − stripRows)
export const toggleButton: (kit: Kit, read: Readings, act: BandActions) => RenderElement          // ▿/▵ exactly as chips draws it
export const panel: (kit: Kit, key: string, children: RenderChildren[]) => RenderElement           // a column Box on cardBg (filled palettes), paddingX 1
export const frame: (kit: Kit, read: Readings, act: BandActions, o: Readonly<{ collapsedRows: number; body: (bodyRows: number) => RenderChildren[]; strip?: Strip }>) => RenderChildren[]
export const openView: (kit: Kit, read: Readings, act: BandActions, collapsed: RenderElement, collapsedRows: number, body: (bodyRows: number) => RenderChildren[], strip?: Strip) => RenderElement
// chips.tsx
export const drawChips: (kit: Kit, read: Readings, act: BandActions) => RenderElement
// tests/matrix.ts
export const NO_ACT: BandActions
```

- [ ] **Step 1: Add `NO_ACT` to `tests/matrix.ts`**

```ts
import type { BandActions } from '../hooks/snapshot'
/** Actions for a draw outside a mount: one function each, so props compare equal. */
export const NO_ACT: BandActions = { toggleExpanded: async () => undefined, hide: async () => undefined }
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/frame.test.ts
import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { bodyRowsFor, openView, panel, toggleButton, type Strip } from '../hooks/views/frame'
import { byKey, fakeEl, shown, type Node } from './helpers'
import { NO_ACT, snapOf } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] }) as unknown as RenderElement
const opened = (over: Partial<BandSnapshot> = {}, strip?: Strip): Node => {
  const snap = snapOf({ expanded: true, ...over })
  const kit = makeKit(fakeEl, snap)
  const read = readingsOf(snap)
  return openView(kit, read, NO_ACT, panel(kit, 'collapsed', [text('LINE')]), 1, rows => [text(`BODY ${rows}`)], strip) as unknown as Node
}
const WS = { path: '/Users/me/workspace/claude-mod', git: undefined, repoName: undefined }

test('the body gets what is left of the rows, never less than none', () => {
  expect(bodyRowsFor(13, 1, 1)).toBe(8)
  expect(bodyRowsFor(13, 2, 1)).toBe(7)
  expect(bodyRowsFor(4, 2, 1)).toBe(0)
  expect(bodyRowsFor(4, 2, 0)).toBe(0)
})
test("the toggle is chips' own Button", () => {
  const snap = snapOf()
  const chips = byKey(drawBand(fakeEl, snap, NO_ACT), 'more', 'Button')
  const mine = byKey(toggleButton(makeKit(fakeEl, snap), readingsOf(snap), NO_ACT), 'more', 'Button')
  expect(mine?.props).toEqual(chips?.props)
})
test('shut, a view draws its collapsed part alone', () => {
  expect(shown(opened({ expanded: false }))).toBe('LINE')
})
test('open, the body takes the rows left, then the buttons', () => {
  const tree = opened({ maxRows: 13 })
  expect(shown(tree)).toMatch(/BODY 9/)
  expect(byKey(tree, 'collapse', 'Button')).toBeDefined()
  expect(byKey(tree, 'hide', 'Button')).toBeDefined()
})
test('short of rows the body goes, and the buttons stay', () => {
  const tree = opened({ maxRows: 4 })
  expect(shown(tree)).not.toMatch(/BODY/)
  expect(byKey(tree, 'collapse', 'Button')).toBeDefined()
})
test('the strip heads the body while the body keeps a row, then moves to the footer', () => {
  expect(byKey(opened({ maxRows: 13, workspace: WS }), 'strip', 'Box')).toBeDefined()
  expect(byKey(byKey(opened({ maxRows: 5, workspace: WS }), 'actions', 'Box'), 'strip', 'Box')).toBeDefined()
})
test("a view's own strip stands in for the shared one", () => {
  expect(shown(opened({ maxRows: 13, workspace: WS }, () => text('MINE')))).toMatch(/MINE/)
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `tools/test-only.sh frame`
Expected: FAIL, because the modules are missing.

- [ ] **Step 4: Move code, by symbol name**

| From `band.tsx` (40943d3) | Into |
| --- | --- |
| `PillSpec` (88–97) and the `pill` closure (110–128) | `parts.tsx`: `PillSpec` with `hover` optional; `pill(kit, spec, anchor)` draws `hoverCard(hover, anchor)` only when `hover !== undefined` |
| `batteryIcon` and `textBattery` (203–236) | `parts.tsx`: `batteryIcon(kit, charge, tone, alt)` and `textBattery(kit, charge, tone, text)`, their closed-over `charge`, `cacheTone` and `copy.alt` now parameters |
| `cachePill` (238–263) | `chips.tsx`: chips' own pill, with its hover; it calls `batteryIcon(kit, read.cache.charge, read.cache.tone, copy.alt)` and `textBattery(kit, read.cache.charge, read.cache.tone, …)` |
| `LIMITS` (47–81), `limitChip` (269–310), `buildPills` (317–385), `rowOf` (387–405), `row` (407), `expandedView` (411–729) and the returned Box (731–736) | `chips.tsx`: `drawChips(kit, read, act)`, a body equal to today's `drawBand` minus what moved to `parts.tsx`. It reads `const snap = read.chips.raw` where it read the snapshot. |

`chips.tsx` exports only `drawChips` for now; Task 10a adds `chipsView`.

- [ ] **Step 5: Write `frame.tsx`**

```tsx
// The expanded scaffold every new view shares: the workspace strip, the
// view's own body on the card ground, and chips' buttons row. Chips keeps its
// own expanded layout.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import { HOTKEY_MARK, ROW_SLACK, cellsOf } from '../layout'
import { BARE } from '../palette'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { drawStrip } from '../strip'

/** A view's own workspace strip, drawn in its style in place of the shared one. */
export type Strip = (kit: Kit, read: Readings, place: 'top' | 'footer', room: number) => RenderChildren

/** The rows a body gets: the band's, less the collapsed rows, a row of air
 *  above the body and above the buttons, the buttons, and the strip. */
export const bodyRowsFor = (maxRows: number, collapsedRows: number, stripRows: number): number =>
  Math.max(0, maxRows - collapsedRows - 3 - stripRows)

/** ▿ while shut, ▵ while open, exactly as chips draws it. */
export const toggleButton = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const { Box, Button, Svg } = kit
  return (
    <Box key="toggle" flexShrink={0}>
      <Button key="more" label={read.frame.expanded ? '▵' : '▿'} {...(Svg ? { variant: 'secondary' as const } : { plain: true as const, dimColor: true })} onPress={act.toggleExpanded} />
    </Box>
  )
}

/** A new view's ground: the card colour, so every hex it draws is tested against it. */
export const panel = (kit: Kit, key: string, children: RenderChildren[]): RenderElement => {
  const { Box, palette } = kit
  return <Box key={key} flexDirection="column" paddingX={1} {...(palette.filled ? { backgroundColor: palette.cardBg } : {})}>{children}</Box>
}

/** What opens beneath a view: the strip, the body in its panel, the buttons. */
export const frame = (
  kit: Kit,
  read: Readings,
  act: BandActions,
  o: Readonly<{ collapsedRows: number; body: (bodyRows: number) => RenderChildren[]; strip?: Strip }>,
): RenderChildren[] => {
  const { Box, Button, Text, Svg, icon, measure } = kit
  const ws = read.workspace
  // Chips' buttons (band.tsx 695–698).
  const buttons = [
    <Button key="collapse" label="Collapse" variant="secondary" hotkey="c" onPress={act.toggleExpanded} />,
    <Button key="hide" label="Hide band" variant="secondary" hotkey="h" onPress={act.hide} />,
  ]
  // The strip heads the view while the body keeps a row; short of that it
  // takes the footer, in place of the hint.
  const place = ws === undefined ? undefined : bodyRowsFor(read.frame.maxRows, o.collapsedRows, 1) >= 1 ? 'top' : 'footer'
  const bodyRows = bodyRowsFor(read.frame.maxRows, o.collapsedRows, place === 'top' ? 1 : 0)
  // In the footer it shares the line with the buttons and their hotkey marks.
  const room = kit.columns - ROW_SLACK - (place === 'footer' ? cellsOf(buttons, measure) + 2 * HOTKEY_MARK + 2 : 0)
  const strip = place === undefined || ws === undefined ? null : o.strip !== undefined ? o.strip(kit, read, place, room) : drawStrip(kit, ws, place, 0, room)
  return [
    place === 'top' ? strip : null,
    // The strip on top brings its own row of air (strip.tsx:140), so the body
    // adds one only when the strip isn't there, as chips' cards do (band.tsx:709).
    // A view's own strip must bring its marginTop={1} too.
    bodyRows > 0 ? <Box key="body" flexDirection="column" marginTop={place === 'top' ? 0 : 1}>{panel(kit, 'body', o.body(bodyRows))}</Box> : null,
    // Chips' actions row (716–727).
    <Box key="actions" flexDirection="row" columnGap={1} marginTop={1}>
      {place === 'footer' ? (
        strip
      ) : (
        <Box key="hint" flexDirection="row">
          {Svg ? icon('info', BARE.icon) : null}
          <Text color={BARE.label}>Bring it back with /usage-band</Text>
        </Box>
      )}
      <Box flexGrow={1} />
      {buttons}
    </Box>,
  ]
}

/** The whole view: its collapsed panel, and the frame beneath it when open. */
export const openView = (
  kit: Kit,
  read: Readings,
  act: BandActions,
  collapsed: RenderElement,
  collapsedRows: number,
  body: (bodyRows: number) => RenderChildren[],
  strip?: Strip,
): RenderElement => {
  const { Box } = kit
  return <Box flexDirection="column">{collapsed}{read.frame.expanded ? frame(kit, read, act, { collapsedRows, body, strip }) : null}</Box>
}
```

- [ ] **Step 6: `band.tsx` becomes**

```ts
export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  const tree = drawChips(kit, read, act)
  return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree
}
```

- [ ] **Step 7: Run the tests, golden first**

Run: `tools/test-only.sh 'golden-*' frame`
Expected: PASS. Golden is unchanged.

Then the guard check: change one moved line on purpose (say, the plain pill's `[` to `(` in `pill`), run `tools/test-only.sh 'golden-*'`, watch it fail, and revert. If golden fails otherwise, compare the moved code with `git show 40943d3:plugins/session-usage-band/hooks/band.tsx`.

- [ ] **Step 8: Validate, type-check, run everything and commit**

Run:
- `claude plugin validate plugins/session-usage-band`, which must resolve imports from `hooks/views/`;
- the tsc command from Global Constraints;
- the full suite.

Expected: all clean. If validate can't follow the subfolder, stop and report: the spec's file layout assumes it can.

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/frame.test.ts plugins/session-usage-band/tests/matrix.ts
git commit -m "refactor: chips becomes a view, with shared pills and an expanded frame

Golden guard checked: changing the plain pill's bracket turned golden red;
reverted.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9b: The shared view helpers

Everything a new view draws its lines and sections with, in `parts.tsx`, each tested on the fake elements. They are hoisted now, before the freeze, so no P2 view writes its own.

**Files:**
- Modify: `hooks/views/parts.tsx`
- Test: `tests/parts.test.ts` (new)

**Interfaces:**
- **Consumes:** `Role`, `Say`, `Amber` (Task 4); `keepsIn`, `squeezeToFit`, `ROW_SLACK` (`layout.ts`); `LimitKey` (Task 5).
- **Produces:**

```ts
/** What a line's build may ask at its squeeze. */
export type Keeps<P extends string> = Readonly<{
  has: (p: P) => boolean                          // calm, optional pieces
  calm: (p: P, tone: Tone) => boolean             // tone === 'amber' || has(p)
  amber: (a: Readonly<{ long: string; short: string }>) => string   // long until the last step, then short
}>
export const lineRoom: (kit: Kit) => number                                   // columns − ROW_SLACK − 2 (the panel's padding)
export const line: (kit: Kit, key: string, pieces: readonly RenderChildren[], end?: RenderChildren, gap?: number) => RenderElement
export const fitLine: <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: Keeps<P>) => RenderElement) => RenderElement
export const beforeLast: <P extends string>(keeps: Keeps<P>) => boolean     // true until the amber step
export const words: (kit: Kit, key: string, say: Say, bold?: boolean) => RenderElement
export const fact: (kit: Kit, key: string, label: string, value: string | undefined) => RenderChildren
export const section: (kit: Kit, key: string, title: string, rows: readonly RenderChildren[], room: number) => RenderElement
export const gridRoom: (kit: Kit, bodyRows: number, count?: number) => number
export const grid: (kit: Kit, sections: readonly RenderElement[], bodyRows: number) => RenderElement[]
export const chartsIfRoom: (room: number, charts: readonly RenderChildren[], facts: readonly RenderChildren[], chartRows?: number) => RenderChildren[]
export const accentOf: (kit: Kit, limit: Readonly<{ key: LimitKey }>) => string
```

- **`fitLine` and amber.** A view's `ORDER` lists its calm, optional pieces only. `fitLine` appends the amber step itself, so an amber phrase is long until every calm piece has gone, then short. No view lists `'amberShort'`.
- **`beforeLast`** is how an amber reading's chart is gated: by the amber step, never by a calm step.
- **`grid`** lays sections four to a line from 100 columns, two below; and all on one line when two lines won't fit (`bodyRows < 3`), so no section goes missing. `gridRoom` is the facts each section holds under its title.
- **`chartsIfRoom`** drops the charts first when rows run short, as chips' `fitBody` does. `chartRows` is what a chart takes (2 for a desktop chart of 36 px or more).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/parts.test.ts
import { test, expect } from 'claude-code/testing'
import { makeKit } from '../hooks/kit'
import { DARK } from '../hooks/palette'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, line, section, words, type Keeps } from '../hooks/views/parts'
import type { Amber } from '../hooks/words'
import { byKey, fakeEl, shown, walk, type Node } from './helpers'
import { snapOf } from './matrix'

const kit = (columns = 120) => makeKit(fakeEl, snapOf({ columns }))
const A: Amber = { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
const said = (k: ReturnType<typeof kit>, room: number) =>
  shown(fitLine(k, ['extra', 'more'] as const, room, keeps => line(k, 'l', [
    words(k, 'a', [[keeps.amber(A), 'amber']]),
    keeps.has('more') ? words(k, 'm', [['more words', 'value']]) : null,
    keeps.has('extra') ? words(k, 'e', [['extra words', 'value']]) : null,
  ])))

test('a line drops its calm pieces in order, and shortens amber only after the last', () => {
  const k = kit()
  expect(said(k, 60)).toMatch(/extra words/)
  expect(said(k, 50)).not.toMatch(/extra words/)
  expect(said(k, 50)).toMatch(/more words/)
  expect(said(k, 35)).toMatch(/^! 47s left · re-warm/)
  expect(said(k, 35)).not.toMatch(/more words/)
  expect(said(k, 20)).toBe('! 47s')
})
test('at the last step nothing calm is kept, amber is short, and an amber tone still counts', () => {
  const k = kit()
  let last: Keeps<'x'> | undefined
  fitLine(k, ['x'] as const, 0, keeps => { last = keeps; return line(k, 'l', [words(k, 'w', [['wide words', 'value']])]) })
  expect(last?.has('x')).toBe(false)
  expect(last?.calm('x', 'calm')).toBe(false)
  expect(last?.calm('x', 'amber')).toBe(true)
  expect(last?.amber(A)).toBe('! 47s')
  expect(last === undefined ? true : beforeLast(last)).toBe(false)
})
test('each piece of a line keeps its width; words truncate, never wrap', () => {
  const k = kit()
  const tree = line(k, 'l', [words(k, 'a', [['cache ', 'label'], ['52m', 'value']])]) as unknown as Node
  expect((tree.children?.[0] as Node).props?.flexShrink).toBe(0)
  expect(byKey(tree, 'a', 'Text')?.props?.wrap).toBe('truncate-end')
  expect(shown(tree)).toBe('cache 52m')
})
test('words colour each segment by its role', () => {
  const colours: unknown[] = []
  walk(words(kit(), 'w', [['5h ', 'label'], ['82%', 'amber']]), n => { if (n.props?.color !== undefined) colours.push(n.props.color) })
  expect(colours).toEqual([DARK.label, DARK.amberFg])
})
test('a fact with no value is nothing', () => {
  expect(fact(kit(), 'f', 'saved', undefined)).toBeNull()
  expect(shown(fact(kit(), 'f', 'saved', '~$11.40'))).toBe('saved ~$11.40')
})
test('a section is its title and as many rows as fit', () => {
  const k = kit()
  const rows = [fact(k, 'a', 'a', '1'), null, fact(k, 'b', 'b', '2'), fact(k, 'c', 'c', '3')]
  expect(shown(section(k, 's', 'CACHE', rows, 2))).toBe('CACHEa 1b 2')
})
test('the grid is four to a line from 100 columns, two below, one line when rows are short', () => {
  const k = (cols: number) => kit(cols)
  const four = (c: ReturnType<typeof kit>) => ['A', 'B', 'C', 'D'].map(t => section(c, t, t, [], 0))
  expect(grid(k(120), four(k(120)), 9)).toHaveLength(1)
  expect(grid(k(80), four(k(80)), 9)).toHaveLength(2)
  expect(grid(k(80), four(k(80)), 2)).toHaveLength(1)
  expect(gridRoom(k(120), 9)).toBe(8)
  expect(gridRoom(k(80), 9)).toBe(3)
  expect(gridRoom(k(80), 2)).toBe(1)
  expect(gridRoom(k(80), 9, 3)).toBe(3)
})
test('short of rows, charts go before facts', () => {
  expect(chartsIfRoom(3, ['chart'], ['a', 'b'])).toEqual(['chart', 'a', 'b'])
  expect(chartsIfRoom(2, ['chart'], ['a', 'b'])).toEqual(['a', 'b'])
  expect(chartsIfRoom(3, ['chart'], ['a', 'b'], 2)).toEqual(['a', 'b'])
})
test("a limit's accent is its window's", () => {
  expect(accentOf(kit(), { key: '5h' })).toBe(DARK.fiveAccent)
  expect(accentOf(kit(), { key: '7d' })).toBe(DARK.weekAccent)
  expect(accentOf(kit(), { key: 'other' })).toBe(DARK.meterFill)
})
```

The widths in the first test: the long amber is 27 columns, `more words` 10 and `extra words` 11, with a gap of 2 between the line's children (its pieces and the air).

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh parts`
Expected: FAIL, because the helpers aren't exported.

- [ ] **Step 3: Implement, appending to `parts.tsx`**

```tsx
// ---- what every new view draws its lines and sections with -----------------

export type Keeps<P extends string> = Readonly<{
  has: (p: P) => boolean
  calm: (p: P, tone: Tone) => boolean
  amber: (a: Readonly<{ long: string; short: string }>) => string
}>

const AMBER_STEP = 'amberShort'
const STEP = { long: 'long', short: 'short' } as const

/** Columns a collapsed line may take: the row's, less the slack and the panel's padding. */
export const lineRoom = (kit: Kit): number => kit.columns - ROW_SLACK - 2

/** One collapsed line: its pieces, each kept whole, then air, then the toggle
 *  or nothing. Never wraps; past its room it clips, as chips' row does. */
export const line = (kit: Kit, key: string, pieces: readonly RenderChildren[], end?: RenderChildren, gap = 2): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={gap}>
      {pieces.filter(p => p !== null && p !== undefined && p !== false).map((p, i) => <Box key={`p${i}`} flexShrink={0}>{p}</Box>)}
      <Box key="air" flexGrow={1} />
      {end ?? null}
    </Box>
  )
}

/** A line squeezed by its give-way order: the smallest squeeze at which it
 *  fits. The amber step is always last, so amber shortens only once every
 *  calm piece has gone. */
export const fitLine = <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: Keeps<P>) => RenderElement): RenderElement => {
  const steps: ReadonlyArray<P | typeof AMBER_STEP> = [...order, AMBER_STEP]
  const at = keepsIn(steps)
  return squeezeToFit(
    s =>
      build({
        has: p => at(s, p),
        calm: (p, tone) => tone === 'amber' || at(s, p),
        amber: a => (at(s, AMBER_STEP) ? a.long : a.short),
      }),
    steps.length,
    room,
    kit.measure,
  )
}

/** True until the amber step: an amber reading's chart stays while this holds. */
export const beforeLast = <P extends string>(keeps: Keeps<P>): boolean => keeps.amber(STEP) === STEP.long

/** A phrase in its roles' colours, one Text, truncated rather than wrapped. */
export const words = (kit: Kit, key: string, say: Say, bold = false): RenderElement => {
  const { Text, palette } = kit
  const color: Readonly<Record<Role, string>> = { label: palette.label, value: palette.value, amber: palette.amberFg, accent5: palette.fiveAccent, accent7: palette.weekAccent }
  return (
    <Text key={key} bold={bold} wrap="truncate-end">
      {say.map(([t, role], i) => <Text key={String(i)} color={color[role]}>{t}</Text>)}
    </Text>
  )
}

/** `label value`, or nothing while the value is unknown. */
export const fact = (kit: Kit, key: string, label: string, value: string | undefined): RenderChildren =>
  value === undefined ? null : words(kit, key, [[`${label} `, 'label'], [value, 'value']])

/** A titled column: its title, then as many of its rows as `room` holds. */
export const section = (kit: Kit, key: string, title: string, rows: readonly RenderChildren[], room: number): RenderElement => {
  const { Box } = kit
  const kept = rows.filter(r => r !== null && r !== undefined && r !== false).slice(0, Math.max(0, room))
  return (
    <Box key={key} flexDirection="column" flexGrow={1} width={0} minWidth={0}>
      {words(kit, 'title', [[title, 'label']], true)}
      {kept}
    </Box>
  )
}

/** Sections to a line: all of them from 100 columns, or when two lines won't fit; else two. */
const perLineOf = (kit: Kit, bodyRows: number, count: number): number => (kit.columns >= 100 || bodyRows < 3 ? count : Math.min(2, count))

/** Rows each section holds under its title, with a row of air between lines. */
export const gridRoom = (kit: Kit, bodyRows: number, count = 4): number => {
  const lines = Math.ceil(count / perLineOf(kit, bodyRows, count))
  return Math.max(0, Math.floor((bodyRows - (lines - 1)) / lines) - 1)
}

/** Sections laid out in lines, sharing each line's width equally. */
export const grid = (kit: Kit, sections: readonly RenderElement[], bodyRows: number): RenderElement[] => {
  const { Box } = kit
  const per = perLineOf(kit, bodyRows, sections.length)
  return Array.from({ length: Math.ceil(sections.length / per) }, (_, i) => (
    <Box key={`line${i}`} flexDirection="row" columnGap={2} {...(i > 0 ? { marginTop: 1 } : {})}>
      {sections.slice(i * per, (i + 1) * per)}
    </Box>
  ))
}

/** A section's rows with its charts first, when they fit; short of rows, facts win. */
export const chartsIfRoom = (room: number, charts: readonly RenderChildren[], facts: readonly RenderChildren[], chartRows = 1): RenderChildren[] => {
  const shown = (r: RenderChildren) => r !== null && r !== undefined && r !== false
  const drawn = charts.filter(shown)
  const told = facts.filter(shown)
  return drawn.length * chartRows + told.length <= room ? [...drawn, ...told] : told
}

/** A limit's accent: its window's, or the meter's for any other. */
export const accentOf = (kit: Kit, limit: Readonly<{ key: LimitKey }>): string =>
  limit.key === '5h' ? kit.palette.fiveAccent : limit.key === '7d' ? kit.palette.weekAccent : kit.palette.meterFill
```

Add the imports: `keepsIn`, `squeezeToFit`, `ROW_SLACK` from `../layout`; `type LimitKey` from `../reading`; `type Role`, `type Say` from `../words`.

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh parts`, then the full suite.
Expected: PASS, golden included (chips draws none of these).

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/parts.tsx plugins/session-usage-band/tests/parts.test.ts
git commit -m "feat: the lines, sections and grid every new layout draws with

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10a: `View`, the registry, the stubs, and dispatch

**Files:**
- Create: `hooks/views/view.ts` (`View`, `Rows`, `Lines`, `Body`, `rowsOf`, `defineView`)
- Create: `hooks/views/index.ts` (`VIEWS`)
- Create: eight stub files `hooks/views/{gauges,ledger,rings,pulse,tiles,week,departures,forecast}.tsx`
- Modify: `hooks/views/chips.tsx` (`chipsView`)
- Modify: `hooks/snapshot.ts`: `LAYOUT_NAMES`, `LayoutName`, `DEFAULT_LAYOUT`, and the required `layout` field
- Modify: `hooks/register.tsx`: `band.layout` (default `DEFAULT_LAYOUT`), passed into the snapshot
- Modify: `hooks/band.tsx`: dispatch, the 40-column rule, and fallback
- Modify: `tests/matrix.ts` (`snapOf` gains `layout: 'chips'`)
- Test: `tests/views.test.ts` (new)

**Interfaces:**
- **Produces:**

```ts
// snapshot.ts
export const LAYOUT_NAMES = ['chips', 'gauges', 'ledger', 'rings', 'pulse', 'tiles', 'week', 'departures', 'forecast'] as const
export type LayoutName = (typeof LAYOUT_NAMES)[number]
export const DEFAULT_LAYOUT: LayoutName = 'chips'
// BandSnapshot gains: layout: LayoutName
// views/view.ts
export type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{ name: LayoutName; rows: Rows; draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement }>
export type Lines = (kit: Kit, read: Readings, act: BandActions) => RenderElement[]
export type Body = (kit: Kit, read: Readings) => (bodyRows: number) => RenderChildren[]
export const rowsOf: (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>) => number   // kit.Svg ? rows.desktop : rows.terminal
export const defineView: (name: LayoutName, rows: Rows, lines: Lines, body: Body, strip?: Strip) => View
// views/index.ts
export type { View } from './view'
export const VIEWS: Readonly<Record<LayoutName, View>>
// views/chips.tsx
export const chipsView: View      // hand-written: { name: 'chips', rows: { desktop: 1, terminal: 1 }, draw: drawChips }
// band.tsx
export const drawBand: (el: ElementTable, snap: BandSnapshot, act: BandActions, views?: Readonly<Record<LayoutName, View>>) => RenderElement   // views defaults to VIEWS
```

- **Where `View` lives.** Views import `View` from `./view`, never from `./index`, which imports them; that keeps the import graph acyclic.
- **`rowsOf`** reads `kit.Svg`, so desktop plain, which draws text, declares the terminal's rows. `expectInvariants` (Task 11a) uses the same function.
- **Stubs:** each is `export const <name>View: View = { name: '<name>', rows: { desktop: <spec §1>, terminal: <spec §1> }, draw: drawChips }`, importing `View` from `./view` and `drawChips` from `./chips`. The rows are spec §1's: gauges 2/2, ledger 1/1, rings 2/1, pulse 2/1, tiles 2/2, week 2/2, departures 1/1, forecast 2/1. `viewSuite` (Task 11b) doesn't run on them until their own task.
- **The fourth parameter** of `drawBand` exists so a test can hand it a registry with a view that throws; production never passes it.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/views.test.ts
import { test, expect } from 'claude-code/testing'
import type { RenderElement } from 'claude-code'
import { drawBand } from '../hooks/band'
import { makeKit } from '../hooks/kit'
import { PLAIN } from '../hooks/palette'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { VIEWS } from '../hooks/views/index'
import { rowsOf, type View } from '../hooks/views/view'
import { fakeEl, shown } from './helpers'
import { NO_ACT, snapOf } from './matrix'

const marker: View = { name: 'ledger', rows: { desktop: 1, terminal: 1 }, draw: () => ({ type: 'Text', props: {}, children: ['LEDGER'] }) as unknown as RenderElement }
const boom: View = { ...marker, draw: () => { throw new Error('boom') } }

test('every layout name has a view of that name', () => {
  expect(Object.keys(VIEWS).sort()).toEqual([...LAYOUT_NAMES].sort())
  for (const name of LAYOUT_NAMES) expect(VIEWS[name].name).toBe(name)
})
test('the rows a view declares follow where Svg draws', () => {
  const rows = { rows: { desktop: 2, terminal: 1 } }
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'desktop' })))).toBe(2)
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'desktop', palette: PLAIN })))).toBe(1)
  expect(rowsOf(rows, makeKit(fakeEl, snapOf({ surface: 'terminal' })))).toBe(1)
})
test('drawn outside a mount, the band reads as it does mounted', () => {
  expect(shown(drawBand(fakeEl, snapOf(), NO_ACT))).toMatch(/cache 52m/)
})
test('the stored layout draws, from 40 columns', () => {
  expect(shown(drawBand(fakeEl, snapOf({ layout: 'ledger', columns: 40 }), NO_ACT, { ...VIEWS, ledger: marker }))).toBe('LEDGER')
})
test('below 40 columns every layout draws chips', () => {
  expect(shown(drawBand(fakeEl, snapOf({ layout: 'ledger', columns: 39 }), NO_ACT, { ...VIEWS, ledger: marker }))).not.toMatch(/LEDGER/)
})
test('a view that throws falls back to chips', () => {
  expect(shown(drawBand(fakeEl, snapOf({ layout: 'ledger' }), NO_ACT, { ...VIEWS, ledger: boom }))).toMatch(/\$3\.19/)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh views`
Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Write `views/view.ts`**

```ts
// What a layout is, and how a new one is made: its name, the rows it
// declares, its collapsed lines and its body, drawn in the shared frame.
// Views import View from here, never from ./index, so no cycle forms.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions, LayoutName } from '../snapshot'
import { openView, panel, type Strip } from './frame'

export type Rows = Readonly<{ desktop: number; terminal: number }>
export type View = Readonly<{ name: LayoutName; rows: Rows; draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement }>
/** A view's collapsed lines, top to bottom; the last ends with the toggle. */
export type Lines = (kit: Kit, read: Readings, act: BandActions) => RenderElement[]
/** A view's expanded body, given the rows it may take. */
export type Body = (kit: Kit, read: Readings) => (bodyRows: number) => RenderChildren[]

/** The rows a view declares where it is drawn: the desktop's only where Svg
 *  draws; desktop plain draws text, as the terminal does. */
export const rowsOf = (view: Readonly<{ rows: Rows }>, kit: Readonly<{ Svg?: unknown }>): number => (kit.Svg ? view.rows.desktop : view.rows.terminal)

/** A new layout: its lines in a panel on the card ground, and the frame beneath when open. */
export const defineView = (name: LayoutName, rows: Rows, lines: Lines, body: Body, strip?: Strip): View => {
  const view: View = {
    name,
    rows,
    draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', lines(kit, read, act)), rowsOf(view, kit), body(kit, read), strip),
  }
  return view
}
```

- [ ] **Step 4: Write the registry, the stubs and the dispatch**

`views/index.ts`:

```ts
// Every layout by name. The compiler rejects a missing one, and the
// command's list of names reads in this order.

import type { LayoutName } from '../snapshot'
import { chipsView } from './chips'
import { departuresView } from './departures'
import { forecastView } from './forecast'
import { gaugesView } from './gauges'
import { ledgerView } from './ledger'
import { pulseView } from './pulse'
import { ringsView } from './rings'
import { tilesView } from './tiles'
import type { View } from './view'
import { weekView } from './week'

export type { View } from './view'

export const VIEWS: Readonly<Record<LayoutName, View>> = {
  chips: chipsView,
  gauges: gaugesView,
  ledger: ledgerView,
  rings: ringsView,
  pulse: pulseView,
  tiles: tilesView,
  week: weekView,
  departures: departuresView,
  forecast: forecastView,
}
```

In `chips.tsx`: `export const chipsView: View = { name: 'chips', rows: { desktop: 1, terminal: 1 }, draw: drawChips }`.

`band.tsx`:

```ts
export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions, views: Readonly<Record<LayoutName, View>> = VIEWS): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  // Below 40 columns every layout draws chips (spec §1).
  const view = snap.columns < 40 ? views[DEFAULT_LAYOUT] : views[snap.layout]
  let tree: RenderElement
  try {
    tree = view.draw(kit, read, act)
  } catch {
    // A layout that throws never takes the band down: chips stands in.
    tree = views[DEFAULT_LAYOUT].draw(kit, read, act)
  }
  return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree
}
```

`register.tsx`: `band` gains `layout: LayoutName`, `DEFAULT_LAYOUT` to start, reset at `session.start`; the snapshot gets `layout: band.layout`. Task 10b reads it from the store.

- [ ] **Step 5: Run the tests**

Run: `tools/test-only.sh views 'golden-*'`, then the full suite.
Expected: PASS. Golden draws chips, because `band.layout` is `chips`.

- [ ] **Step 6: Validate, type-check and commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/views.test.ts plugins/session-usage-band/tests/matrix.ts
git commit -m "feat: a registry of nine layouts, drawn by name, falling back to chips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10b: The command and the store

**Files:**
- Modify: `hooks/memory.ts`: `LAYOUT_KEY`, `LIMIT_SAMPLES_KEY`, `asLayoutName`
- Modify: `hooks/register.tsx`: `readLayout`, the `layout` command, the usage reply, the registration
- Test: `tests/layout-command.test.ts` (new)

**Interfaces:**
- **Consumes:** `LAYOUT_NAMES`, `LayoutName`, `DEFAULT_LAYOUT` (Task 10a); `engine.storeGets`, `engine.storeSets`, `engine.invalidates`, `engine.storeFails` (Task 1).
- **Produces:**

```ts
// memory.ts
export const LAYOUT_KEY = 'layout'
export const LIMIT_SAMPLES_KEY = 'limitSamples'
export const asLayoutName: (v: unknown) => LayoutName | undefined   // trims, lowercases; undefined unless exactly one name
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/layout-command.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { asLayoutName } from '../hooks/memory'
import { START, engine, mountBand, resp, respond, setup, shown, turn } from './helpers'

const run = async ($: Engine, args: string): Promise<string> => {
  const r = await $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  return String((r as { text?: string }).text ?? '')
}
const drawnText = async ($: Engine): Promise<string> => {
  const ui = await mountBand($, 'terminal', 110)
  const t = shown(await ui.drawn())
  await ui.unmount()
  return t
}
const LIST = 'Choose one: chips, gauges, ledger, rings, pulse, tiles, week, departures, forecast.'

test('asLayoutName takes a name in any case and spacing, and nothing else', () => {
  expect(asLayoutName('  Ledger ')).toBe('ledger')
  expect(asLayoutName('ledger extra')).toBeUndefined()
  for (const v of [42, null, {}, [], 'sparkle', '']) expect(asLayoutName(v)).toBeUndefined()
})
test('/usage-band layout lists the layouts and names the current one', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: chips. ${LIST}`)
})
test('/usage-band layout <name> saves it once, says how back, and chips says nothing more', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout Pulse')).toBe('Usage band layout: pulse. /usage-band layout chips goes back.')
  expect(engine.store.layout).toBe('pulse')
  expect(engine.storeSets.filter(k => k === 'layout')).toHaveLength(1)
  expect(await run($, 'layout chips')).toBe('Usage band layout: chips.')
})
test('an unknown name changes nothing and lists the names', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout sparkle-sparkle-sparkle-sparkle')).toMatch(/^Unknown layout ".{1,20}"\. Choose one: chips, /)
  expect(engine.storeSets).not.toContain('layout')
})
test('extra words after the name are unknown', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'layout  Ledger  extra')).toMatch(/^Unknown layout/)
  expect(engine.storeSets).not.toContain('layout')
})
test('nothing stored, nothing written', async ($, on) => {
  setup(on); await $.session.start(START)
  await drawnText($)
  expect(engine.storeSets).not.toContain('layout')
})
test('a stored layout is read when the session starts', async ($, on) => {
  setup(on, { store: { layout: 'ledger' } }); await $.session.start(START)
  expect(await run($, 'layout')).toBe(`Usage band layout: ledger. ${LIST}`)
})
test("a stored layout this version doesn't know draws chips", async ($, on) => {
  setup(on, { store: { layout: 'sparkle' } }); await $.session.start(START)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
  expect(await drawnText($)).toMatch(/\$2\.41/)
})
test("a stored layout that isn't a string draws chips", async ($, on) => {
  setup(on, { store: { layout: 42 } }); await $.session.start(START)
  expect(await run($, 'layout')).toMatch(/^Usage band layout: chips\./)
  expect(await drawnText($)).toMatch(/\$2\.41/)
})
test('setting a layout shows a hidden band and asks for a redraw', async ($, on) => {
  setup(on); await $.session.start(START)
  await run($, 'hide')
  const before = engine.invalidates
  await run($, 'layout ledger')
  expect(engine.invalidates).toBeGreaterThan(before)
  expect(await drawnText($)).toMatch(/\$2\.41/)
})
test('a store that fails to write still switches the layout', async ($, on) => {
  setup(on); engine.storeFails = true; await $.session.start(START)
  expect(await run($, 'layout ledger')).toBe('Usage band layout: ledger. /usage-band layout chips goes back.')
  expect(await run($, 'layout')).toMatch(/^Usage band layout: ledger\./)
})
test('the usage line keeps its bracket and adds the layout hint', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(await run($, 'nope')).toBe('Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>')
})
test("another session's layout is read after this session's next turn", async ($, on) => {
  setup(on); await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  engine.storeGets.length = 0
  engine.store.layout = 'ledger'
  await turn($, 'x', 2.41, 2.5)
  expect(engine.storeGets).toContain('layout')
  expect(await run($, 'layout')).toMatch(/^Usage band layout: ledger\./)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh layout-command`
Expected: FAIL, because `asLayoutName` is missing and `layout` is an unknown word.

- [ ] **Step 3: Implement**

1. **`memory.ts`:**

```ts
export const LAYOUT_KEY = 'layout'
export const LIMIT_SAMPLES_KEY = 'limitSamples'
/** A layout's name from the store or the command: trimmed, any case; anything
 *  else, a name from a newer version included, is undefined. */
export const asLayoutName = (v: unknown): LayoutName | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (LAYOUT_NAMES as readonly string[]).includes(word) ? (word as LayoutName) : undefined
}
```

2. **`register.tsx`:**

```ts
/** The stored layout, or chips: a name this version doesn't know, or a value
 *  that isn't a name, draws chips. Never throws. */
const readLayout = async ($: EngineInterface): Promise<void> => {
  band.layout = asLayoutName(await $.store.get(LAYOUT_KEY).catch(() => undefined)) ?? DEFAULT_LAYOUT
}

const LAYOUT_LIST = `Choose one: ${LAYOUT_NAMES.join(', ')}.`
const LAYOUT_ARG = /^\s*layout(?:\s+(.*))?$/i

/** `/usage-band layout [name]`: lists, or switches and remembers. Only this writes the layout. */
const chooseLayout = async ($: EngineInterface, word: string): Promise<string> => {
  if (word.trim() === '') return `Usage band layout: ${band.layout}. ${LAYOUT_LIST}`
  const name = asLayoutName(word)
  if (name === undefined) return `Unknown layout "${clipMiddle(word.trim(), 20)}". ${LAYOUT_LIST}`
  band.layout = name
  // Remembered for the next session; a store that fails leaves this one switched.
  await $.store.set(LAYOUT_KEY, name).catch(() => undefined)
  await update($, isHidden, () => false)
  $.ui.invalidate('ui.render')
  return name === DEFAULT_LAYOUT ? 'Usage band layout: chips.' : `Usage band layout: ${name}. /usage-band layout chips goes back.`
}
```

   - **`session.start`:** `await readLayout($)` after the resets.
   - **`turn.complete`:** in the main-loop branch, `await readLayout($)` before the invalidate, so another session's change shows after this session's next turn.
   - **`command.run`:** first, `const chosen = LAYOUT_ARG.exec(e.args); if (chosen) return { text: await chooseLayout($, chosen[1] ?? '') }`. The other words go through `parseCommand` as today.
   - **`REPLY.usage`:** `'Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>'`. The bracket is unchanged, so `expanded-and-commands.test.ts:80` still passes.
   - **Registration:** `argumentHint: '[more | less | show | hide | layout <name>]'` and the description `'Show, hide, expand, collapse or restyle the session usage band'` (spec §4.2).
   - Import `clipMiddle` from `./format`; `asLayoutName`, `LAYOUT_KEY` from `./memory`; `DEFAULT_LAYOUT`, `LAYOUT_NAMES`, `type LayoutName` from `./snapshot`.

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh layout-command expanded-and-commands`, then the full suite.
Expected: PASS, golden and the existing suite included.

- [ ] **Step 5: Validate, type-check and commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/layout-command.test.ts
git commit -m "feat: /usage-band layout chooses a view, kept across sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10c: The local time zone

**Files:**
- Modify: `hooks/format.ts` (`utcOffsetOf`)
- Modify: `hooks/register.tsx` (`band.utcOffsetMin`)
- Modify: `hooks/snapshot.ts` (`utcOffsetMin` becomes required, as `number | undefined`)
- Modify: `tests/matrix.ts` (`snapOf` gains `utcOffsetMin: undefined`)
- Test: `tests/zone.test.ts` (new)

**Interfaces:**
- **Produces:** `utcOffsetOf(now: number): number | undefined`, east-positive minutes; `BandSnapshot.utcOffsetMin: number | undefined`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/zone.test.ts
import { test, expect } from 'claude-code/testing'
import { utcOffsetOf } from '../hooks/format'
import { readingsOf } from '../hooks/reading'
import { snapOf } from './matrix'

const T = Date.UTC(2026, 9, 9, 12)
test('the offset is east-positive minutes, as the clock reports the zone', () => {
  expect(utcOffsetOf(T)).toBe(-new Date(T).getTimezoneOffset())
})
test('an unreadable time has no offset', () => {
  expect(utcOffsetOf(Number.NaN)).toBeUndefined()
})
test('the offset reaches the readings', () => {
  expect(readingsOf(snapOf({ utcOffsetMin: 210 })).frame.utcOffsetMin).toBe(210)
})
test("the kit's zone, for the ledger", () => {
  console.log(`ZONE offset=${utcOffsetOf(T)}`)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh zone`
Expected: FAIL, because `utcOffsetOf` is missing.

- [ ] **Step 3: Implement**

In `format.ts`:

```ts
/** This machine's offset from UTC at `now`, east-positive minutes; undefined
 *  when the time can't be read. A real UTC offset of 0 can't be told from a
 *  sandbox that reports none, which is what Task 14's check settles. */
export const utcOffsetOf = (now: number): number | undefined => {
  const off = -new Date(now).getTimezoneOffset()
  return Number.isFinite(off) ? off : undefined
}
```

In `register.tsx`: `band` gains `utcOffsetMin: number | undefined`; set it to `utcOffsetOf(await $.clock.now())` in `session.start` and in `turn.complete`'s main-loop branch; pass `utcOffsetMin: band.utcOffsetMin` into the snapshot. Make the field required in `snapshot.ts` and add `utcOffsetMin: undefined` to `snapOf`.

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh zone readings`, then the full suite.
Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/zone.test.ts plugins/session-usage-band/tests/matrix.ts
git commit -m "feat: the band knows the local time zone, for clock times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
### Task 11a: The invariant checks

**Files:**
- Modify: `tests/matrix.ts`, which gains `AMBER_WORDS`, `visualRows`, `InvariantContext`, `invariantErrors` and `expectInvariants`
- Test: `tests/matrix.test.ts` (new): every check, each on a hand-built tree that breaks it

**Interfaces:**
- **Consumes:** `rowsOf` (Task 10a), `VIEWS` (Task 10a), `cellsOf`, `ROW_PX`, `DESKTOP`, `TERMINAL` (`layout.ts`).
- **Produces:**

```ts
export const AMBER_WORDS: Readonly<Record<AmberReason, RegExp>>
export const visualRows: (tree: unknown, surface: Surface) => number
export type InvariantContext = Readonly<{ layout: LayoutName; surface: Surface; appearance: Appearance; cols: number; maxRows: number; scenario: ScenarioName; glyphs: 'unicode' | 'ascii'; expanded: boolean }>
/** Each failed check as `<check>: <why>`; none when the tree keeps the spec §2 contract. */
export const invariantErrors: (tree: Node, ctx: InvariantContext) => string[]
export const expectInvariants: (tree: Node, ctx: InvariantContext) => void   // expect(invariantErrors(tree, ctx)).toEqual([])
```

The check names are `rows`, `toggle`, `width`, `whitespace`, `svgPlacement`, `svgProps`, `colour`, `wording`, `amber`, `estimate`, `glyphs`, `size` and `height`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/matrix.test.ts — every invariant check, proven on a tree that breaks it.
import { test, expect } from 'claude-code/testing'
import type { Node } from './helpers'
import { invariantErrors, visualRows, type InvariantContext } from './matrix'

const t = (s: string, props: Record<string, unknown> = {}) => ({ type: 'Text', props, children: [s] })
const toggle = (label = '▿') => ({ type: 'Button', props: { label } })
const row = (...kids: unknown[]) => ({ type: 'Box', props: { flexDirection: 'row' }, children: kids })
const svg = (props: Record<string, unknown>) => ({ type: 'Svg', props: { source: '<svg/>', height: 12, ...props } })
const view = (lines: unknown[], rest: unknown[] = []) => ({
  type: 'Box', props: { flexDirection: 'column' },
  children: [{ type: 'Box', props: { key: 'collapsed', flexDirection: 'column', paddingX: 1 }, children: lines }, ...rest],
})
const CTX: InvariantContext = { layout: 'ledger', surface: 'terminal', appearance: 'dark', cols: 120, maxRows: 40, scenario: 'calm', glyphs: 'unicode', expanded: false }
const failed = (tree: unknown, over: Partial<InvariantContext> = {}): string[] =>
  invariantErrors(tree as Node, { ...CTX, ...over }).map(e => e.split(':')[0] ?? '')
const GOOD = view([row(t('cache 52m left'), toggle())])

test('visualRows counts terminal lines and desktop rows of 24 px', () => {
  const two = { type: 'Box', props: { flexDirection: 'column' }, children: [t('a'), t('b')] }
  expect(visualRows(two, 'terminal')).toBe(2)
  const tile = { type: 'Box', props: { flexDirection: 'column' }, children: [t('52m'), t('cache'), svg({ width: 40, height: 4, alt: 'x' })] }
  expect(visualRows(tile, 'desktop')).toBe(2) // 24 + 24 + 4 = 52 px
  expect(visualRows(row(t('a'), svg({ width: 30, height: 30, alt: 'r' })), 'desktop')).toBe(1) // 30 px
  const aired = { type: 'Box', props: { flexDirection: 'column' }, children: [t('a'), { type: 'Box', props: { marginTop: 1 }, children: [t('b')] }] }
  expect(visualRows(aired, 'terminal')).toBe(3)
})
test('a good tree passes every check', () => { expect(failed(GOOD)).toEqual([]) })
test('rows: the collapsed part takes the rows its view declares', () => {
  expect(failed(view([row(t('a')), row(t('b'), toggle())]))).toContain('rows')
})
test('toggle: ▿ shut, ▵ open, once', () => {
  expect(failed(view([row(t('a'))]))).toContain('toggle')
  expect(failed(GOOD, { expanded: true })).toContain('toggle')
  expect(failed(view([row(t('a'), toggle('v'))]), { glyphs: 'ascii' })).not.toContain('toggle')
})
test('width: no wider than the columns, except all-amber below 60', () => {
  expect(failed(view([row(t('x'.repeat(130)), toggle())]))).toContain('width')
  expect(failed(view([row(t(`! 30s left · re-warm ~$1.66 ${'x'.repeat(60)}`), toggle())]), { scenario: 'lastMinute', cols: 50 })).not.toContain('width')
})
test('whitespace: none alone on the desktop', () => {
  expect(failed(view([{ type: 'Box', props: { flexDirection: 'row' }, children: [t('a'), ' ', toggle()] }]), { surface: 'desktop' })).toContain('whitespace')
})
test('svgPlacement: Svg only where it draws', () => {
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]))).toContain('svgPlacement')
  expect(failed(view([row(t('a'), svg({ width: 20, alt: 'x' }), toggle())]), { surface: 'desktop', appearance: 'plain' })).toContain('svgPlacement')
})
test('svgProps: every Svg has an alt and a width', () => {
  expect(failed(view([row(t('a'), svg({ width: 20 }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
  expect(failed(view([row(t('a'), svg({ alt: 'x' }), toggle())]), { surface: 'desktop' })).toContain('svgProps')
})
test('colour: nothing is red', () => {
  expect(failed(view([row(t('a', { color: '#ff0000' }), toggle())]))).toContain('colour')
})
test('wording: never suggests sending a message', () => {
  expect(failed(view([row(t('send a message to keep it warm'), toggle())]))).toContain('wording')
})
test("amber: each of the scenario's triggers has its words", () => {
  expect(failed(GOOD, { scenario: 'lastMinute' })).toContain('amber')
  expect(failed(view([row(t('! 30s left · re-warm ~$1.66'), toggle())]), { scenario: 'lastMinute' })).not.toContain('amber')
})
test('estimate: a price or a fill time carries ~', () => {
  expect(failed(view([row(t('re-warm $1.66'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('5h full 14:20'), toggle())]))).toContain('estimate')
  expect(failed(view([row(t('! FULL ~14:20'), toggle())]))).not.toContain('estimate')
})
test("glyphs: the tier's own, and ASCII alone in the ascii tier", () => {
  expect(failed(view([row(t('◐ cache'), toggle())]))).toContain('glyphs')
  expect(failed(view([row(t('cache · 52m'), toggle('v'))]), { glyphs: 'ascii' })).toContain('glyphs')
})
test('size: at most 400 nodes shut, 1,500 open', () => {
  expect(failed(view([row(...Array.from({ length: 400 }, (_, i) => t(String(i % 10))), toggle())]))).toContain('size')
})
test('height: open, the view fits maxRows', () => {
  expect(failed(view([row(t('a'), toggle('▵'))], [t('b'), t('c')]), { expanded: true, maxRows: 2 })).toContain('height')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh matrix`
Expected: FAIL, because `visualRows` and `invariantErrors` are not exported.

- [ ] **Step 3: Implement in `tests/matrix.ts`**

```ts
import { DESKTOP, ROW_PX, TERMINAL, cellsOf } from '../hooks/layout'
import type { LayoutName } from '../hooks/snapshot'
import { VIEWS } from '../hooks/views/index'
import { rowsOf } from '../hooks/views/view'
import { expect } from 'claude-code/testing'
import { firstRow, shown, walk } from './helpers'

/** Every layout's words for each amber trigger. `·` reads `-` in the ascii tier. */
export const AMBER_WORDS: Readonly<Record<AmberReason, RegExp>> = {
  cacheLastMinute: /! \d+s( left)?|LAST CALL|! cooling [·-] \d+s left/,
  nearCompaction: /! context \d+%|! ctx \d+%|! COMPACTS IN ~/,
  contextNoCompaction: /! context \d+%|! ctx \d+%|! CONTEXT \d+%/,
  limit80: /! 5h|! NEAR LIMIT/,
  fiveHourAhead: /! 5h|! FULL/,
}

const visible = (k: unknown): boolean => k !== null && k !== undefined && k !== false
/** Height in lines (terminal) or px (desktop): a Text or Button is a row, an
 *  Svg its height (none on the terminal), a column sums with its gaps, a row
 *  takes its tallest; a top margin adds its rows. */
const heightOf = (n: unknown, px: boolean): number => {
  const unit = px ? ROW_PX : 1
  if (typeof n === 'string' || typeof n === 'number') return unit
  if (n === null || typeof n !== 'object') return 0
  const node = n as Node
  if (node.props?.position === 'absolute' || node.props?.display === 'none') return 0
  const margin = (typeof node.props?.marginTop === 'number' ? node.props.marginTop : 0) * unit
  if (node.type === 'Svg') return px ? Number(node.props?.height ?? ROW_PX) + margin : 0
  if (node.type === 'Text' || node.type === 'Button') return unit + margin
  const kids = (node.children ?? []).filter(visible)
  if (kids.length === 0) return margin
  const sizes = kids.map(k => heightOf(k, px))
  if (node.props?.flexDirection !== 'column') return Math.max(...sizes) + margin
  const gap = (typeof node.props?.rowGap === 'number' ? node.props.rowGap : 0) * (kids.length - 1) * unit
  return sizes.reduce((a, b) => a + b, 0) + gap + margin
}
export const visualRows = (tree: unknown, surface: Surface): number =>
  surface === 'desktop' ? Math.round(heightOf(tree, true) / ROW_PX) : heightOf(tree, false)

export type InvariantContext = Readonly<{
  layout: LayoutName
  surface: Surface
  appearance: Appearance
  cols: number
  maxRows: number
  scenario: ScenarioName
  glyphs: 'unicode' | 'ascii'
  expanded: boolean
}>

const RED = /^#(f00|ff0000|e5|dc2626)/i
const UNICODE_TIER = /^[\x20-\x7e█░▒│·↻Σ◷◔▿▵…±●■–↑↓\u2800-\u28ff]*$/
const ASCII_TIER = /^[\x20-\x7e]*$/

/** Spec §2 and §7, checked on one drawn case. */
export const invariantErrors = (tree: Node, ctx: InvariantContext): string[] => {
  const errors: string[] = []
  const fail = (check: string, why: string): void => { errors.push(`${check}: ${why}`) }
  const collapsed = firstRow(tree)
  const svgDraws = ctx.surface === 'desktop' && ctx.appearance !== 'plain'
  const ascii = ctx.glyphs === 'ascii' && ctx.surface === 'terminal'

  const declared = rowsOf(VIEWS[ctx.layout], { Svg: svgDraws ? true : undefined })
  const rows = visualRows(collapsed, ctx.surface)
  if (rows !== declared) fail('rows', `${rows} drawn, ${declared} declared`)

  const mark = ctx.expanded ? (ascii ? '^' : '▵') : ascii ? 'v' : '▿'
  let toggles = 0
  walk(collapsed, n => { if (n.type === 'Button' && n.props?.label === mark) toggles++ })
  if (toggles !== 1) fail('toggle', `${toggles} ${mark} in the collapsed part`)

  const clipsByDesign = ctx.cols < 60 && SCENARIOS[ctx.scenario].amber.length > 0
  const width = cellsOf(collapsed as never, ctx.surface === 'desktop' ? DESKTOP : TERMINAL)
  if (!clipsByDesign && width > ctx.cols) fail('width', `${width} columns at ${ctx.cols}`)

  let nodes = 0
  const svgs: Node[] = []
  walk(tree, n => {
    nodes++
    if (n.type === 'Svg') svgs.push(n)
    for (const v of Object.values(n.props ?? {})) if (typeof v === 'string' && RED.test(v)) fail('colour', `red ${v}`)
    if (ctx.surface === 'desktop') for (const k of n.children ?? []) if (typeof k === 'string' && /^\s+$/.test(k)) fail('whitespace', `a whitespace-only child of a ${n.type}`)
  })
  if (!svgDraws && svgs.length > 0) fail('svgPlacement', `${svgs.length} Svg where none draws`)
  for (const s of svgs) if (typeof s.props?.alt !== 'string' || s.props.alt === '' || typeof s.props?.width !== 'number') fail('svgProps', 'an Svg without an alt or a width')

  const text = shown(tree)
  if (/send|keep (it )?warm/i.test(text)) fail('wording', 'suggests sending a message')
  for (const reason of SCENARIOS[ctx.scenario].amber) if (!AMBER_WORDS[reason].test(text)) fail('amber', `no words for ${reason}`)
  if (/re-warm \$/i.test(text) || /full (in |at )?\d/i.test(text)) fail('estimate', 'an estimate without ~')
  if (!(ascii ? ASCII_TIER : UNICODE_TIER).test(text)) fail('glyphs', 'a glyph outside the tier')

  if (nodes > (ctx.expanded ? 1500 : 400)) fail('size', `${nodes} nodes`)
  if (ctx.expanded) {
    const tall = visualRows(tree, ctx.surface)
    if (tall > ctx.maxRows) fail('height', `${tall} rows at maxRows ${ctx.maxRows}`)
  }
  return errors
}

export const expectInvariants = (tree: Node, ctx: InvariantContext): void => {
  expect(invariantErrors(tree, ctx)).toEqual([])
}
```

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh matrix`, then the full suite.
Expected: PASS.

- [ ] **Step: Pin the frame's height** (append to `tests/frame.test.ts`, now that `visualRows` exists; add `visualRows` to its `./matrix` import)

```ts
test('with the strip on top and a full body, an open view never passes maxRows', () => {
  const snap = snapOf({ expanded: true, maxRows: 8, workspace: WS })
  const kit = makeKit(fakeEl, snap)
  const tree = openView(kit, readingsOf(snap), NO_ACT, panel(kit, 'collapsed', [text('LINE')]), 1, rows => Array.from({ length: rows }, (_, i) => text(`ROW ${i}`))) as unknown as Node
  expect(visualRows(tree, 'terminal')).toBeLessThanOrEqual(8)
})
```

Run: `tools/test-only.sh frame`
Expected: PASS. It fails if the body adds a row of air under a top strip that already brings its own (Task 9a's frame).

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/matrix.test.ts
git commit -m "test: the spec's contract as checks, each proven on a tree that breaks it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11b: `viewSuite`

**Files:**
- Modify: `tests/matrix.ts`, which gains `SuiteCase`, `suiteCases` and `viewSuite`
- Test: `tests/suite.test.ts` (new)

**Interfaces:**
- **Consumes:** `drawCases`, `caseKey` (Task 1); `invariantErrors` (Task 11a).
- **Produces:**

```ts
export type SuiteCase = Readonly<{ name: string; options: CaseOptions; mounts: readonly Mount[] }>
export const suiteCases: (layout: LayoutName) => SuiteCase[]
/** Registers one LONG test per case: one drawCases call, every tree checked. */
export const viewSuite: (layout: LayoutName) => void
```

The cases, one setup each:
- each of the 20 scenarios in dark, terminal and desktop at 120 columns (20 tests);
- calm and `lastMinute` in light, in plain and in the `ascii` tier, both surfaces at 120 (6 tests);
- calm and `lastMinute` at every width `[40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200]`, one test per surface (4 tests);
- the other amber scenarios, `fiveHourAhead`, `limit80` and `nearCompaction`, at 40, 50 and 60, both surfaces (3 tests);
- calm at `maxRows` 4, 8, 13 and 40, both surfaces at 120 (1 test).

That is 34 tests a view. `lastMinute` and `cold` use `ttl: '5m'`, so each walks 270 ticks instead of 3,600; golden keeps the hour-long walks. Every tree is checked shut and open.

**Ruling: `viewSuite`'s first run.** It can't run on chips or a stub: their rows and words are chips'. Its own test is `suiteCases`, a pure list; the pilot (Task 16) is the first real run of `viewSuite`, and any fix to `matrix.ts` it needs lands there, before the re-freeze.

- [ ] **Step 1: Write the failing test**

```ts
// tests/suite.test.ts
import { test, expect } from 'claude-code/testing'
import { SCENARIO_NAMES, suiteCases } from './matrix'

const cases = suiteCases('ledger')
test('34 cases, named apart', () => {
  expect(cases).toHaveLength(34)
  expect(new Set(cases.map(c => c.name)).size).toBe(34)
})
test('every scenario is drawn, on both surfaces', () => {
  for (const s of SCENARIO_NAMES) expect(cases.some(c => c.options.scenario === s && c.mounts.some(m => m.surface === 'terminal') && c.mounts.some(m => m.surface === 'desktop'))).toBe(true)
})
test('the long walks use the 5-minute cache', () => {
  for (const c of cases) if (c.options.scenario === 'lastMinute' || c.options.scenario === 'cold') expect(c.options.ttl).toBe('5m')
})
test('every width and every height is covered', () => {
  for (const cols of [40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200]) expect(cases.some(c => c.options.scenario === 'lastMinute' && c.mounts.some(m => m.cols === cols))).toBe(true)
  for (const maxRows of [4, 8, 13, 40]) expect(cases.some(c => c.mounts.some(m => m.maxRows === maxRows))).toBe(true)
  for (const s of ['fiveHourAhead', 'limit80', 'nearCompaction']) expect(cases.some(c => c.options.scenario === s && c.mounts.some(m => m.cols === 40))).toBe(true)
})
test('light, plain and the ascii tier are each drawn', () => {
  expect(cases.some(c => c.options.appearance === 'light')).toBe(true)
  expect(cases.some(c => c.options.appearance === 'plain')).toBe(true)
  expect(cases.some(c => c.options.env?.CC_BAND_GLYPHS === 'ascii')).toBe(true)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `tools/test-only.sh suite`
Expected: FAIL, because `suiteCases` is not exported.

- [ ] **Step 3: Implement in `tests/matrix.ts`**

```ts
import { test } from 'claude-code/testing'
import { LONG } from './helpers'

export type SuiteCase = Readonly<{ name: string; options: CaseOptions; mounts: readonly Mount[] }>

const WIDTHS = [40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200] as const
const both = (cols: number, maxRows?: number): Mount[] => [{ surface: 'terminal', cols, maxRows }, { surface: 'desktop', cols, maxRows }]
const ttlOf = (s: ScenarioName): Ttl => (s === 'lastMinute' || s === 'cold' ? '5m' : '1h')

export const suiteCases = (layout: LayoutName): SuiteCase[] => {
  const opts = (scenario: ScenarioName, appearance: Appearance = 'dark', env?: Record<string, string>): CaseOptions => ({ layout, scenario, appearance, ttl: ttlOf(scenario), env })
  return [
    ...SCENARIO_NAMES.map(scenario => ({ name: `${layout}: ${scenario}`, options: opts(scenario), mounts: both(120) })),
    ...(['calm', 'lastMinute'] as const).flatMap(scenario => [
      { name: `${layout}: ${scenario}, light`, options: opts(scenario, 'light'), mounts: both(120) },
      { name: `${layout}: ${scenario}, plain`, options: opts(scenario, 'plain'), mounts: both(120) },
      { name: `${layout}: ${scenario}, ascii`, options: opts(scenario, 'dark', { CC_BAND_GLYPHS: 'ascii' }), mounts: both(120) },
      ...(['terminal', 'desktop'] as const).map(surface => ({ name: `${layout}: ${scenario}, every width, ${surface}`, options: opts(scenario), mounts: WIDTHS.map(cols => ({ surface, cols })) })),
    ]),
    ...(['fiveHourAhead', 'limit80', 'nearCompaction'] as const).map(scenario => ({ name: `${layout}: ${scenario}, narrow`, options: opts(scenario), mounts: [40, 50, 60].flatMap(cols => both(cols)) })),
    { name: `${layout}: calm, short of rows`, options: opts('calm'), mounts: [4, 8, 13, 40].flatMap(maxRows => both(120, maxRows)) },
  ]
}

export const viewSuite = (layout: LayoutName): void => {
  for (const c of suiteCases(layout)) {
    test(c.name, LONG, async ($, on) => {
      const trees = await drawCases($, on, c.options, c.mounts)
      const glyphs = c.options.env?.CC_BAND_GLYPHS === 'ascii' ? 'ascii' : 'unicode'
      for (const m of c.mounts) for (const state of ['shut', 'open'] as const) {
        const key = caseKey(m, state)
        const tree = trees[key]
        const errors = tree === undefined ? ['missing: not drawn'] : invariantErrors(tree, { layout, surface: m.surface, appearance: c.options.appearance, cols: m.cols, maxRows: m.maxRows ?? 40, scenario: c.options.scenario, glyphs, expanded: state === 'open' })
        expect(`${key} ${errors.join('; ')}`).toBe(`${key} `)
      }
    })
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh suite matrix`, then the full suite.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/suite.test.ts
git commit -m "test: one suite every layout runs, from rows to contrast to wording

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Flap tokens, and contrast on the new grounds

**Files:**
- Modify: `hooks/palette.ts` (`flap`, `flapText`, `flapDim`, `flapWarm`, `flapAmber`, `flapFive`, `flapWeek` and `flapCoin`, in `Palette`, `DARK`, `LIGHT` and `PLAIN`)
- Test: `tests/design.test.ts`

**Why the on-flap inks.** The flap is near-black in both palettes. On LIGHT, today's accents measure only 2.3–3.9:1 on `#1d1d22`, so departures draws its coloured words in inks made for the flap.

- [ ] **Step 1: Write the failing test** (append to `tests/design.test.ts`; PLAIN is left out, its theme keys have no contrast to measure)

```ts
// `design.test.ts` already imports DARK, LIGHT (line 6) and contrast (line 12):
// no new import lines, since a second binding stops the file loading.

for (const [name, p] of [['dark', DARK], ['light', LIGHT]] as const) {
  test(`${name}: the new layouts' text and marks hold on the card ground and on flaps`, () => {
    for (const fg of [p.value, p.label, p.amberFg]) expect(contrast(fg, p.cardBg)).toBeGreaterThanOrEqual(4.5)
    for (const mark of [p.meterFill, p.trackStroke, p.warm, p.fiveAccent, p.weekAccent]) expect(contrast(mark, p.cardBg)).toBeGreaterThanOrEqual(3)
    expect(contrast(p.value, p.surface)).toBeGreaterThanOrEqual(4.5)
    for (const ink of [p.flapText, p.flapDim, p.flapWarm, p.flapAmber, p.flapFive, p.flapWeek, p.flapCoin]) expect(contrast(ink, p.flap)).toBeGreaterThanOrEqual(4.5)
  })
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `tools/test-only.sh design`
Expected: FAIL, because `p.flap` is undefined.

- [ ] **Step 3: Implement**

| Token | `DARK` | `LIGHT` | `PLAIN` |
| --- | --- | --- | --- |
| `flap` | `#111113` | `#1d1d22` | `''` |
| `flapText` | `#f2f2f5` | `#f2f2f5` | `text` |
| `flapDim` | `#a2a2ac` | `#a8a8b2` | `subtle` |
| `flapWarm` | `#7fcf8a` | `#7fcf8a` | `success` |
| `flapAmber` | `#f0c969` | `#f0c969` | `warning` |
| `flapFive` | `#7fcf8a` | `#7fcf8a` | `success` |
| `flapWeek` | `#a99cf0` | `#b9aef5` | `text` |
| `flapCoin` | `#c9a54a` | `#d9b45a` | `warning` |

Measured on the flap, every ink is at least 6.6:1 in both palettes. Give each a one-line doc comment in `Palette`. If a check on `cardBg` fails, change only that token's lightness, keeping its hue; change chips' tokens only if golden still passes, else add a separate token for the new layouts. Record any new token in spec §2.10.

- [ ] **Step 4: Run the tests**

Run: `tools/test-only.sh design 'golden-*'`, then the full suite.
Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/palette.ts plugins/session-usage-band/tests/design.test.ts
git commit -m "feat: flap colours and inks for departures, contrast checked on every new ground

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: The words the new views speak

Views never format (spec §2.5) and never do arithmetic on words. So `readingsOf` gives every fact and phrase a new view draws, ready to place, built once a draw. Chips doesn't read these fields, so golden is unaffected.

**Files:**
- Modify: `hooks/format.ts` (`fmtLeftShort`, `fmtBoardLeft`)
- Modify: `hooks/words.ts` (the word builders)
- Modify: `hooks/reading.ts` (new facts; `readingsOf` composes facts and words)
- Modify: `hooks/views/parts.tsx` (`layoutCachePill`)
- Test: `tests/readings.test.ts`, `tests/parts.test.ts`

**Interfaces:**
- **Consumes:** Task 4 (`AMBER`, `resetPhrase`, `paceText`, `altOf`, `fmtClock`, `fmtDayClock`, `fmtLeft`, `fmtLeftSpoken`, `fmtEtaSpoken`), Task 5 (the facts), Task 9a (`pill`, `batteryIcon`, `textBattery`).
- **Produces:**

```ts
// format.ts
export const fmtLeftShort: (ms: number) => string   // '1h 00m' | '52m' | '10m' | '47s'
export const fmtBoardLeft: (ms: number) => string   // 'IN 1H 00 MIN' | 'IN 52 MIN' | 'IN 10 MIN'

// reading.ts: the facts gain
//   CacheFacts: hitFrac: number | undefined (the hit ratio, once measured)
//               coldInMs: number | undefined (ms to cold, while warm or cooling and Claude isn't working)
//   LimitFacts: resetInMs: number | undefined (ms to the reset; undefined once passed)
//               projectedFrac: number | undefined (projectedPct / 100, at most 1)

// words.ts
export type CacheCondition = 'not measured' | 'warming' | 'warm' | 'cooling' | 'cold'
export type CacheWords = Readonly<{
  condition: CacheCondition
  value: string            // '52m left' | 'warm' (working) | '–' | 'warming' | 'cold'
  left: string             // '52m left' | '47s left' | '' (not counting)
  leftShort: string        // '52m' | '47s' | ''
  say: Say                 // [['cache ', 'label'], ['52m left', 'value']]; cold: … ['cold', 'value'], [' · re-warm ', 'label'], ['~$1.66', 'value']
  sayShort: Say            // [['cache ', 'label'], ['52m', 'value']] | [['warming', 'value']] | [['cold ', 'label'], ['~$1.66', 'value']]
  text: string             // say, joined: 'cache 52m left' | 'cache cold · re-warm ~$1.66'
  textShort: string        // sayShort, joined: 'cache 52m' | 'warming' | 'cold ~$1.66'
  amber: Amber | undefined // the last minute: { long: '! 47s left · re-warm ~$1.66', short: '! 47s' }
  reWarmText: string | undefined   // 're-warm ~$1.66 if it goes cold' | 'next message ~$1.66'; undefined until known
  coldAtClock: string | undefined   // '14:32' while counting, when the offset is known
  coldSinceClock: string | undefined // '13:28' when cold, when the offset is known
  savedText: string | undefined     // '~$11.40', once measured
  hitText: string | undefined       // '96%', once measured
  lastsText: string                 // '1h idle' | '1h idle · assumed'
  rebuildsText: string | undefined  // '2', when there were unexpected rebuilds
  board: string            // 'DEPARTS' | 'LAST CALL' | 'DEPARTED' | 'BOARDING' | 'WARMING' | 'NOT MEASURED'
  boardLeft: string        // 'IN 1H 00 MIN' | 'IN 52 MIN' | '47s' (cooling) | ''
  alt: string              // 'cache 1 hour left, warm' | 'cache cold, re-warm about $1.66'
}>
export type ContextWords = Readonly<{
  valueText: string; text: string; textShort: string; say: Say; sayShort: Say   // '38%', 'context 38%', 'ctx 38%'
  amber: Amber | undefined                 // '! context 93% · compacts in ~12k' / '! ctx 93%'; off: '! context 85%' / '! ctx 85%'
  boardAmber: string | undefined           // '! COMPACTS IN ~12K' | '! CONTEXT 85%'
  towardText: string                       // 'toward compaction' | 'of the window' (compaction off or unknown)
  inContextText: string; compactsAtText: string | undefined; roomText: string | undefined; windowText: string   // '76k', '190k', '~114k', '200k'
  alt: string
}>
export type SpendWords = Readonly<{
  totalText: string; lastText: string | undefined; tokensText: string   // '$3.19', '$0.21', '225k'
  split: ReadonlyArray<Readonly<{ label: 'input' | 'output' | 'cache reads'; tokens: number; text: string; frac: number }>>
}>
export type LimitWords = Readonly<{
  text: string; say: Say                   // '5h 4%' | '5h reset'
  pace: string                             // paceText: 'on pace for ~10%' | 'full in ~40m' | 'full before reset' | ''
  resetWords: string | undefined           // 'resets in 3h 00m'; undefined once passed
  resetGlyph: string | undefined           // '↻ in 3h 00m'; undefined once passed
  resetClock: string | undefined           // '16:40' | 'Mon 08:40', when the offset is known
  projectedText: string | undefined        // '~10%'
  fullIn: string | undefined               // '~40m', when a fill is measured
  fullAtClock: string | undefined          // '~14:20', when a fill is measured and the offset is known
  amber: Amber | undefined                 // '! 5h 82%' | { long: '! 5h full in ~40m', short: '! 5h ~40m' }
  boardAmber: string | undefined           // '! NEAR LIMIT' | '! FULL ~14:20' | '! FULL IN ~40M'
  boardShort: string | undefined           // '~10% AT ↻' | 'RESET'
  alt: string                              // '5h limit 84 percent used, needs attention, full in about 40 minutes'
}>
export const cacheWords: (f: CacheFacts, c: BandSnapshot['cache'], frame: Frame) => CacheWords
export const contextWords: (f: ContextFacts) => ContextWords
export const spendWords: (f: SpendFacts) => SpendWords
export const limitWords: (f: LimitFacts, frame: Frame) => LimitWords
export const workspaceWords: (ws: Workspace | undefined) => string | undefined   // '~/workspace/claude-mod, branch main, clean'

// reading.ts: what the views read becomes facts & words
export type CacheReading = CacheFacts & CacheWords
export type ContextReading = ContextFacts & ContextWords
export type SpendReading = SpendFacts & SpendWords
export type LimitView = LimitFacts & LimitWords
// Readings gains: workspaceText: string | undefined

// parts.tsx
export const layoutCachePill: (kit: Kit, read: Readings, short: boolean) => RenderElement
```

- **The board's capitals.** `boardLeft`, `board`, `boardAmber` and `boardShort` are spelled for the board because their numbers change form (`1h 00m` is `1H 00 MIN`). Departures upper-cases the rest itself, whole phrases from `read`, as its board style; it never slices one.
- **`readingsOf` builds the words once a draw.** It stays an object literal, so later readings that cost something (`history`, Task 23; `week`, Task 24) are lazy getters chips never touches.

- [ ] **Step 1: Write the failing tests** (append to `tests/readings.test.ts`)

```ts
import { fmtClock } from '../hooks/format'

const MIN = 60_000
const cacheAt = (msLeft: number) => ({ ...snapOf().cache, msLeft })

test('the cache speaks in words for the new views', () => {
  const c = readingsOf(snapOf()).cache
  expect(c.text).toBe('cache 52m left')
  expect(c.say).toEqual([['cache ', 'label'], ['52m left', 'value']])
  expect(c.textShort).toBe('cache 52m')
  expect(c.reWarmText).toBe('re-warm ~$1.66 if it goes cold')
  expect([c.board, c.boardLeft]).toEqual(['DEPARTS', 'IN 52 MIN'])
  expect(c.alt).toBe('cache 52 minutes left, warm')
  expect([c.hitFrac, c.hitText, c.savedText, c.lastsText]).toEqual([0.96, '96%', '~$11.40', '1h idle'])
  expect(c.coldInMs).toBe(52 * MIN)
})
test('in its last minute the cache is amber, long and short', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(47_000) })).cache
  expect(c.condition).toBe('cooling')
  expect(c.amber).toEqual({ long: '! 47s left · re-warm ~$1.66', short: '! 47s' })
  expect([c.board, c.boardLeft]).toEqual(['LAST CALL', '47s'])
})
test('working, the cache shows no countdown', () => {
  const c = readingsOf(snapOf({ isWorking: true })).cache
  expect([c.text, c.board, c.left]).toEqual(['cache warm', 'BOARDING', ''])
  expect(c.coldInMs).toBeUndefined()
})
test('cold is a price', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(-MIN) })).cache
  expect([c.text, c.textShort, c.reWarmText, c.board]).toEqual(['cache cold · re-warm ~$1.66', 'cold ~$1.66', 'next message ~$1.66', 'DEPARTED'])
  expect(c.alt).toBe('cache cold, re-warm about $1.66')
})
test('an hour left is said in full, on the board and to a reader', () => {
  const c = readingsOf(snapOf({ cache: cacheAt(60 * MIN) })).cache
  expect(c.boardLeft).toBe('IN 1H 00 MIN')
  expect(c.alt).toBe('cache 1 hour left, warm')
})
test('the countdown never looks like a clock', () => {
  for (const ms of [52 * MIN, 9.5 * MIN, 47_000]) expect(readingsOf(snapOf({ cache: cacheAt(ms) })).cache.left).not.toMatch(/\d:\d\d/)
})
test('clock times appear only when the offset is known', () => {
  expect(readingsOf(snapOf()).cache.coldAtClock).toBeUndefined()
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 4, resetsAt: new Date(now + 3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.cache.coldAtClock).toBe(fmtClock(now + 52 * MIN, 0))
  expect(r.fiveHour?.resetClock).toBe(fmtClock(now + 3 * HOUR, 0))
})
test('limits speak in words, amber with one "! "', () => {
  const r = readingsOf(snapOf({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * HOUR).toISOString(), etaMs: null } }))
  expect(r.fiveHour?.text).toBe('5h 82%')
  expect(r.fiveHour?.say).toEqual([['5h ', 'label'], ['82%', 'value']])
  expect(r.fiveHour?.amber).toEqual({ long: '! 5h 82%', short: '! 5h 82%' })
  expect(r.fiveHour?.boardAmber).toBe('! NEAR LIMIT')
  expect([r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.resetInMs]).toEqual(['resets in 3h 00m', '↻ in 3h 00m', 3 * HOUR])
  expect([r.sevenDay?.projectedText, r.sevenDay?.pace, r.sevenDay?.boardShort]).toEqual(['~50%', 'on pace for ~50%', '~50% AT ↻'])
  expect(Math.abs((r.sevenDay?.projectedFrac ?? 0) - 30 / (1 - 67 / 168) / 100)).toBeLessThan(1e-5)
})
test('a measured fill is an estimate, with ~, in words and on the board', () => {
  const now = Date.UTC(2026, 9, 9, 13, 40)
  const r = readingsOf(snapOf({ now, utcOffsetMin: 0, fiveHour: { percentUsed: 84, resetsAt: new Date(now + 70 * MIN).toISOString(), etaMs: 40 * MIN } }))
  const at = fmtClock(now + 40 * MIN, 0)
  expect([r.fiveHour?.fullIn, r.fiveHour?.fullAtClock, r.fiveHour?.boardAmber]).toEqual(['~40m', `~${at}`, `! FULL ~${at}`])
  expect(r.fiveHour?.amber).toEqual({ long: '! 5h full in ~40m', short: '! 5h ~40m' })
  expect(r.fiveHour?.alt).toBe('5h limit 84 percent used, needs attention, full in about 40 minutes')
})
test('a passed window has no reset words', () => {
  const r = readingsOf(snapOf({ now: 4 * HOUR }))
  expect([r.fiveHour?.text, r.fiveHour?.resetWords, r.fiveHour?.resetGlyph, r.fiveHour?.boardShort]).toEqual(['5h reset', undefined, undefined, 'RESET'])
})
test('context speaks toward compaction, or of the window when it is off', () => {
  const near = readingsOf(snapOf({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000 } })).context
  expect(near.amber).toEqual({ long: '! context 93% · compacts in ~14k', short: '! ctx 93%' })
  expect([near.boardAmber, near.towardText, near.roomText]).toEqual(['! COMPACTS IN ~14K', 'toward compaction', '~14k'])
  const off = readingsOf(snapOf({ context: { tokens: 170_000, window: 200_000, percent: 85, compactAt: undefined } })).context
  expect([off.amber?.long, off.boardAmber, off.towardText]).toEqual(['! context 85%', '! CONTEXT 85%', 'of the window'])
})
test('spend splits its tokens, each with its share', () => {
  const s = readingsOf(snapOf()).spend
  expect([s.totalText, s.lastText, s.tokensText]).toEqual(['$3.19', '$0.21', '225k'])
  expect(s.split.map(p => p.label)).toEqual(['input', 'output', 'cache reads'])
  expect(Math.abs((s.split[2]?.frac ?? 0) - 198 / 225)).toBeLessThan(1e-5)
})
test('the workspace is a sentence', () => {
  const workspace = { path: '~/workspace/claude-mod', git: { branch: 'main', commit: 'abc1234', worktree: undefined, changed: 0, ahead: 0, behind: 0 }, repoName: undefined }
  expect(readingsOf(snapOf({ workspace })).workspaceText).toBe('~/workspace/claude-mod, branch main, clean')
})
```

Append to `tests/parts.test.ts`:

```ts
import { readingsOf } from '../hooks/reading'
import { layoutCachePill } from '../hooks/views/parts'
import { cards } from './helpers'

test("the layouts' cache pill speaks the readings' words, with no hover", () => {
  const snap = snapOf({ cache: { ...snapOf().cache, msLeft: 47_000 } })
  const k = makeKit(fakeEl, snap)
  const long = layoutCachePill(k, readingsOf(snap), false)
  expect(shown(long)).toMatch(/! 47s left · re-warm ~\$1\.66/)
  expect(shown(layoutCachePill(k, readingsOf(snap), true))).toMatch(/! 47s\s*$/)
  expect(cards(long)).toHaveLength(0)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh readings parts`
Expected: FAIL, because the fields are undefined.

- [ ] **Step 3: Implement the formats** (append to `format.ts`)

```ts
/** The countdown alone, for a tile or a pill: `1h 00m`, `52m`, `10m`, `47s`. */
export const fmtLeftShort = (ms: number): string =>
  ms < 60_000 ? `${Math.max(1, Math.ceil(ms / 1000))}s` : ms < 600_000 ? `${Math.ceil(ms / 60_000)}m` : fmtCountdown(ms)

/** The countdown on a departures board: `IN 1H 00 MIN`, `IN 52 MIN`, never `52M`. */
export const fmtBoardLeft = (ms: number): string => {
  const secs = Math.round(ms / 1000)
  if (secs >= 3600) {
    const mins = Math.floor(secs / 60)
    return `IN ${Math.floor(mins / 60)}H ${String(mins % 60).padStart(2, '0')} MIN`
  }
  return `IN ${ms < 600_000 ? Math.ceil(ms / 60_000) : Math.floor(secs / 60)} MIN`
}
```

- [ ] **Step 4: Implement the word builders** (append to `words.ts`)

```ts
// ---- the words of each section, from its facts ------------------------------

const joined = (s: Say): string => s.map(([t]) => t).join('')

export const cacheWords = (f: CacheFacts, c: BandSnapshot['cache'], frame: Frame): CacheWords => {
  // Mid-turn every step restarts the TTL, so a countdown would only bounce.
  const working = f.mood === 'warm' && frame.isWorking
  const counting = (f.mood === 'warm' || f.mood === 'expiring') && !working
  const left = counting ? fmtLeft(c.msLeft) : ''
  const leftShort = counting ? fmtLeftShort(c.msLeft) : ''
  const off = frame.utcOffsetMin
  const price = c.reWarmUsd !== null ? fmtSmallCost(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const value = f.mood === 'unmeasured' ? '–' : f.mood === 'warming' ? 'warming' : f.mood === 'cold' ? 'cold' : working ? 'warm' : left
  const say: Say = f.mood === 'cold' ? [['cache ', 'label'], ['cold', 'value'], [' · re-warm ', 'label'], [f.estimate, 'value']] : [['cache ', 'label'], [value, 'value']]
  const sayShort: Say =
    f.mood === 'cold' ? [['cold ', 'label'], [f.estimate, 'value']] : f.mood === 'warming' ? [['warming', 'value']] : [['cache ', 'label'], [counting ? leftShort : value, 'value']]
  const BOARD = { unmeasured: 'NOT MEASURED', warming: 'WARMING', warm: 'DEPARTS', expiring: 'LAST CALL', cold: 'DEPARTED' } as const
  return {
    condition: f.mood === 'unmeasured' ? 'not measured' : f.mood === 'expiring' ? 'cooling' : f.mood,
    value, left, leftShort, say, sayShort,
    text: joined(say),
    textShort: joined(sayShort),
    amber: f.mood === 'expiring' ? AMBER.cache(left, leftShort, f.estimate) : undefined,
    reWarmText: !f.known ? undefined : f.mood === 'cold' ? `next message ${f.estimate}` : `re-warm ${f.estimate} if it goes cold`,
    coldAtClock: counting && off !== undefined ? fmtClock(frame.now + c.msLeft, off) : undefined,
    // Cold, the time left is past: now plus it is when the cache went cold.
    coldSinceClock: f.mood === 'cold' && off !== undefined ? fmtClock(frame.now + c.msLeft, off) : undefined,
    // The chips cache card's facts (band.tsx 566–573), as words.
    savedText: f.measured && c.savedUsd !== null ? fmtEstimate(c.savedUsd) : undefined,
    hitText: f.measured && c.hitRatio !== null ? `${Math.round(c.hitRatio * 100)}%` : undefined,
    // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
    lastsText: `${c.ttl} idle${!c.ttlPinned && c.ttl === '1h' ? ' · assumed' : ''}`,
    rebuildsText: c.misses > 0 ? String(c.misses) : undefined,
    board: working ? 'BOARDING' : BOARD[f.mood],
    boardLeft: !counting ? '' : f.mood === 'expiring' ? leftShort : fmtBoardLeft(c.msLeft),
    alt:
      f.mood === 'unmeasured' ? 'cache not measured yet'
      : f.mood === 'warming' ? 'cache warming'
      : working ? altOf('cache', 'warm', 'Claude is working')
      : f.mood === 'cold' ? altOf('cache', 'cold', `re-warm about ${price}`)
      : altOf('cache', fmtLeftSpoken(c.msLeft), f.mood === 'expiring' ? 'cooling' : 'warm', f.mood === 'expiring' ? `re-warm about ${price}` : undefined),
  }
}

export const contextWords = (f: ContextFacts): ContextWords => {
  const towardText = f.compactAt !== undefined ? 'toward compaction' : 'of the window'
  const say: Say = [['context ', 'label'], [f.pct, 'value']]
  const sayShort: Say = [['ctx ', 'label'], [f.pct, 'value']]
  const amber = f.tone !== 'amber' ? undefined : f.toCompact !== undefined ? AMBER.context(f.frac, f.toCompact) : AMBER.contextNoCompaction(f.frac)
  return {
    valueText: f.pct, say, sayShort, text: joined(say), textShort: joined(sayShort), amber, towardText,
    boardAmber: f.tone !== 'amber' ? undefined : f.toCompact !== undefined ? `! COMPACTS IN ~${fmtTokens(f.toCompact).toUpperCase()}` : `! CONTEXT ${f.pct}`,
    inContextText: fmtTokens(f.used),
    compactsAtText: f.compactAt === undefined ? undefined : fmtTokens(f.compactAt),
    roomText: f.toCompact === undefined ? undefined : `~${fmtTokens(f.toCompact)}`,
    windowText: fmtTokens(f.window),
    alt: altOf('context', `${Math.round(f.frac * 100)} percent ${towardText}`, f.tone === 'amber' ? 'near the limit' : 'fine'),
  }
}

export const spendWords = (f: SpendFacts): SpendWords => ({
  totalText: fmtCost(f.totalUsd),
  lastText: f.lastTurnUsd === null ? undefined : fmtSmallCost(f.lastTurnUsd),
  tokensText: fmtTokens(f.total),
  split: ([['input', f.sent], ['output', f.back], ['cache reads', f.cached]] as const).map(([label, tokens]) => ({ label, tokens, text: fmtTokens(tokens), frac: f.total > 0 ? tokens / f.total : 0 })),
})

export const limitWords = (f: LimitFacts, frame: Frame): LimitWords => {
  const off = frame.utcOffsetMin
  const live = !f.passed
  const fullIn = f.etaMs !== null ? fmtEta(f.etaMs) : undefined
  const fullAtClock = f.etaMs !== null && off !== undefined ? `~${fmtClock(frame.now + f.etaMs, off)}` : undefined
  const projectedText = live && f.projectedPct !== undefined ? `~${Math.round(f.projectedPct)}%` : undefined
  const say: Say = [[`${f.name} `, 'label'], [live ? f.value : 'reset', 'value']]
  return {
    say,
    text: joined(say),
    pace: live ? paceText(f) : '',
    resetWords: f.reset?.kind === 'in' ? resetPhrase(f.reset, 'words') : undefined,
    resetGlyph: f.reset?.kind === 'in' ? resetPhrase(f.reset, 'glyph') : undefined,
    resetClock: f.resetInMs !== undefined && off !== undefined ? fmtDayClock(frame.now + f.resetInMs, off, frame.now) : undefined,
    projectedText, fullIn, fullAtClock,
    amber: f.tone !== 'amber' ? undefined : fullIn !== undefined ? AMBER.limitPace(f.name, fullIn) : AMBER.limit(f.name, f.percentUsed),
    boardAmber: f.tone !== 'amber' ? undefined : fullIn === undefined ? '! NEAR LIMIT' : fullAtClock !== undefined ? `! FULL ${fullAtClock}` : `! FULL IN ${fullIn.toUpperCase()}`,
    boardShort: f.passed ? 'RESET' : projectedText !== undefined ? `${projectedText} AT ↻` : undefined,
    alt: altOf(
      `${f.name} limit`,
      live ? `${Math.round(f.percentUsed)} percent used` : 'reset',
      f.tone === 'amber' ? 'needs attention' : 'fine',
      f.etaMs !== null ? `full in ${fmtEtaSpoken(f.etaMs)}` : projectedText !== undefined ? `about ${Math.round(f.projectedPct ?? 0)} percent at its reset` : undefined,
    ),
  }
}

/** Where the session is, as one line: the path, then git in words. */
export const workspaceWords = (ws: Workspace | undefined): string | undefined =>
  ws === undefined ? undefined : ws.git === undefined ? ws.path : `${ws.path}, ${gitSummary(ws.git)}`
```

Add the types from the Interfaces block, and the imports: `fmtBoardLeft`, `fmtClock`, `fmtCost`, `fmtDayClock`, `fmtEstimate`, `fmtEtaSpoken`, `fmtLeft`, `fmtLeftShort`, `fmtLeftSpoken`, `fmtSmallCost` from `./format`; `gitSummary` and `type Workspace` from `./workspace`; `type BandSnapshot` from `./snapshot`; and, as types only (erased, so no cycle), `CacheFacts`, `ContextFacts`, `Frame`, `LimitFacts`, `SpendFacts` from `./reading`.

- [ ] **Step 5: Compose them in `reading.ts`**

- `cacheFacts` gains `hitFrac: measured && c.hitRatio !== null ? c.hitRatio : undefined` and `coldInMs`: `c.msLeft` while the mood is warm or expiring and not (warm and working), else `undefined`.
- `limitFacts`' `one` gains `resetInMs: reset?.kind === 'in' ? Date.parse(reading.resetsAt ?? '') - snap.now : undefined` and `projectedFrac: projectedPct === undefined ? undefined : clamp01(projectedPct / 100)`, using the `projectedPct` it already computes.
- Widen the four reading types to facts & words, add `workspaceText` to `Readings`, and compose:

```ts
export const readingsOf = (snap: BandSnapshot): Readings => {
  const c = snap.cache
  const frame: Frame = { expanded: snap.expanded, maxRows: snap.maxRows, now: snap.now, isWorking: snap.isWorking, glyphs: snap.glyphs, utcOffsetMin: snap.utcOffsetMin }
  const cache = cacheFacts(snap)
  const context = contextFacts(snap)
  const spend = spendFacts(snap)
  const windows = limitFacts(snap)
  const views = windows.map((w): LimitView => ({ ...w, ...limitWords(w, frame) }))
  // The headline is the window closest to its limit.
  const worst = windows.filter(w => !w.passed).reduce<ChipsWindow | undefined>((top, w) => (top === undefined || w.percentUsed > top.percentUsed ? w : top), undefined)
  return {
    frame,
    cache: { ...cache, ...cacheWords(cache, c, frame) },
    spend: { ...spend, ...spendWords(spend) },
    context: { ...context, ...contextWords(context) },
    fiveHour: views.find(v => v.key === '5h'),
    sevenDay: views.find(v => v.key === '7d'),
    limits: views,
    worstLimit: worst === undefined ? undefined : views[windows.indexOf(worst)],
    workspace: snap.workspace,
    workspaceText: workspaceWords(snap.workspace),
    chips: {
      raw: snap,
      reading: {
        copy: cacheCopy(c, cache.mood, snap.isWorking),
        tokenBreakdown: `input ${fmtTokens(c.tokens.sent)} · output ${fmtTokens(c.tokens.back)} · cache reads ${fmtTokens(c.tokens.cached)}`,
        windows,
        worst,
      },
    },
  }
}
```

(`snap.glyphs` and `snap.utcOffsetMin` are required by now: Tasks 8 and 10c.) Import `cacheWords`, `contextWords`, `spendWords`, `limitWords` and `workspaceWords` from `./words`.

- [ ] **Step 6: Add `layoutCachePill` to `parts.tsx`**

```tsx
/** The cache as a pill for a new view (pulse, week): chips' battery and
 *  ground, the readings' words, and no hover card; amber, its reason. */
export const layoutCachePill = (kit: Kit, read: Readings, short: boolean): RenderElement => {
  const { Text, Svg, palette, onTone } = kit
  const c = read.cache
  const text = c.amber !== undefined ? (short ? c.amber.short : c.amber.long) : short ? c.textShort : c.text
  const fg = onTone(c.tone, palette.value)
  const body = Svg
    ? [batteryIcon(kit, c.charge, c.tone, c.alt), <Text key="c" color={fg}>{` ${text}`}</Text>]
    : palette.filled
      ? textBattery(kit, c.charge, c.tone, text)
      : [<Text key="c" color={fg}>{text}</Text>]
  return pill(kit, { key: 'cache', tone: c.tone, body, paintsOwnBg: !Svg && palette.filled }, 'left')
}
```

- [ ] **Step 7: Run the tests**

Run: `tools/test-only.sh readings parts`, then the full suite.
Expected: PASS, golden included.

- [ ] **Step 8: Commit**

```bash
git add plugins/session-usage-band/hooks/format.ts plugins/session-usage-band/hooks/words.ts plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/hooks/views/parts.tsx plugins/session-usage-band/tests/readings.test.ts plugins/session-usage-band/tests/parts.test.ts
git commit -m "feat: the readings speak every phrase the new layouts draw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: The P1 gate

- [ ] **Step 1:** Run `claude plugin validate .`, then `claude plugin validate plugins/session-usage-band`. Expected: both pass.
- [ ] **Step 2:** Run the suite in two zones:
  - `TZ=UTC claude plugin test plugins/session-usage-band | tee /tmp/p1-utc.log`
  - `TZ=Asia/Tehran claude plugin test plugins/session-usage-band | tee /tmp/p1-tehran.log`

  Expected: both pass, with the same count. Record the count, and each run's `ZONE offset=` line (Task 10c), in the ledger. If both read 0, the kit doesn't pass the zone through; the live check (Step 4) decides.
- [ ] **Step 3:** Run `npx -y -p typescript@5.6.3 tsc -p plugins/session-usage-band`. Expected: no errors.
- [ ] **Step 4: Prepare the time-zone check (maintainer checkpoint 2).** Without committing, add ``$.ui.toast(`utcOffsetMin ${band.utcOffsetMin}`)`` at the end of `session.start` in `register.tsx`. Ask the maintainer to load it in a live session in a non-UTC zone (`claude plugin marketplace update hossein-mods && claude plugin update session-usage-band@hossein-mods`, then `/reload-plugins`) and read the toast. Then `git checkout -- plugins/session-usage-band/hooks/register.tsx`. Record the result. If the live offset is 0 in a non-UTC zone, departures and forecast use relative times only (spec §5): `coldAtClock`, `coldSinceClock`, `resetClock` and `fullAtClock` stay undefined, and record that as a ruling.
- [ ] **Step 5: Check that nothing a P2 agent needs is missing:**
  - `VIEWS` has nine entries, chips hand-written and eight stubs;
  - `views/view.ts` exports `View`, `Rows`, `Lines`, `Body`, `rowsOf` and `defineView`;
  - `readingsOf` exposes every field in Tasks 5 and 13's types;
  - `words.ts` exports `AMBER`, `EMPTY`, `altOf`, `resetPhrase`, `paceText`, `Role`, `Say`, `Amber` and the five word builders;
  - `charts.tsx` exports `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `underline` and `braille`;
  - `parts.tsx` exports `PillSpec`, `pill`, `batteryIcon`, `textBattery`, `Keeps`, `line`, `lineRoom`, `fitLine`, `beforeLast`, `words`, `fact`, `section`, `grid`, `gridRoom`, `chartsIfRoom`, `accentOf` and `layoutCachePill`;
  - `frame.tsx` exports only `frame`, `bodyRowsFor`, `openView`, `panel`, `toggleButton` and the `Strip` type;
  - `tests/matrix.ts` exports `drawCases`, `caseKey`, `snapOf`, `NO_ACT`, `invariantErrors`, `expectInvariants`, `suiteCases` and `viewSuite`.

  Write the freeze note in the ledger: these interfaces are frozen for P2.
- [ ] **Step 6:** Run `git log --oneline main..feat/layouts` and confirm one commit per task, with nothing pushed.
- [ ] **Step 7:** Commit the ledger:

```bash
git add design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "docs: the ledger at the P1 freeze

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Maintainer checkpoints 2 and 3.** Report the time-zone result and the freeze note, and wait for both sign-offs before Task 15.

### Task 14b: Resumed sessions recover their spend and cache state

**Why:** resuming an old session (`claude --resume`, `/resume`, or the desktop opening a past session) showed "cache warming", "$0.00", "Breakdown counts from your next message" and "1h idle · assumed"; only the context was right. `session.start` calls `noteLoad(await ledgerUsd($))`, and `noteLoad` sets `knownFresh = !costNow`. A resumed session's ledger can read $0, so the band took it for a new conversation and never recalled its last reply. An in-process `/resume` went `session.end` → `resetConversation` (`knownFresh: true`) and nothing after it.

**What the engine offers** (`.claude-plugin/types/claude-code/index.d.ts`, and the 2.1.296 binary):
- `classic.SessionStart` with `SessionStartHookInput`: `source` (`'startup' | 'resume' | 'clear' | 'compact' | 'fork'`), `transcript_path`, and on resume or fork `seconds_since_last_response`, `context_tokens`, `prompt_cache_likely_expired` and `estimated_cache_write_usd`. It fires with `source: 'resume'` (or `'fork'`) both at launch and for an in-process `/resume`, after `session.end` with `reason: 'resume'`. The test kit raises it as `$.classic.SessionStart({ … })` and stamps `transcript_path: ''` when none is given.
- The transcript: `type: "assistant"` lines carry `message.id`, `message.model` and `message.usage`, repeated on every content block of one reply. `type: "cost-state"` lines carry `totalCostUSD` and `modelUsage[model]`. They are cumulative across reopens, include subagent spend, and usually close a run, but a run that didn't exit cleanly leaves replies after the last one. In a 67 MB transcript the last record sat about 1.4 MB from the end, past today's 1 MiB tail.

**Decisions:**
- **Order.** Nothing guarantees one. In the 2.1.296 binary the launch-resume loader starts the SessionStart hooks at load time (`"tail"` says only where their rows land, not when they run), and both they and `session.start` wait on the same plugin-hook load, so the two dispatches race: SessionStart may come first, last, or while `session.start` runs. The band holds the resume either way. `band.resume` keeps what the engine said (the session id, its cache facts, the transcript path) and, once read, what the transcript showed. `session.start`'s reset doesn't touch it: after the reset, `session.start` applies it again when its session id is the one loading, and drops it otherwise. `session.end` drops it. A transcript read lands only while `band.resume` is still the resume that started it, so a `/clear` or another resume drops it, and `session.start` can never drop it. In the test kit, module state carries across the tests of one file, so `band.resume` can outlive a test. A later test on the same session id then has it applied again at its `session.start`. Every resume test raises its own SessionStart, which replaces it, and applying it again runs no process.
- **Which session.** During an in-process `/resume`, the 2.1.296 `resume` handler runs `co = await H7(…)`, the SessionStart hooks, and only then calls `A_(xo, "resume" | "fork", …)`, which switches the session. `Mo = K()`, read after H7, is still the old id, so `$.session.id()` in the hook names the session being left. `t7r` builds the SessionStart input from `{ id: WS(r) }` and stamps `session_id` with the resumed id on purpose; at launch that is also the id the conversation continues under (`ut`). So the resume keys on `e.session_id || $.session.id()`, and its cost record, its store lookup and a transcript path the band builds all key on that id. The test kit stamps its own session id (a UUID) unless a test gives one, so the tests' `resume` helper passes `engine.sessionId`, and the in-process tests keep `engine.sessionId` at `'s1'` while SessionStart names `'s2'`.
- **The one exemption.** `band.resume` is the one thing `session.start` doesn't reset, against the Global Constraints. In the kit, a resume said after the last test's load and one said before this test's load look the same to `session.start`: a resume with no load since. A claim flag can't tell them apart. Either the before-load case breaks, or the usual order (`session.start`, then SessionStart) still leaks. In production `session.start` runs once per module, so only the kit sees the leak. The tests stay independent of the order they run in. Every resume test raises its own SessionStart, which replaces a leaked resume. A test that counts reads counts only those after its SessionStart. "without the engine's idle time…" ends the same either way: a leaked resume with the engine's cache skips the load's recall, a $0 ledger skips it without one, and the test's own SessionStart, which has no idle time, recalls.
- **The cache.** The engine's idle time becomes the recalled reply's time, and its re-caching price is the price shown. Both are kept as `resumedCache`, beside the band's own `recall`, and stand over it. `prompt_cache_likely_expired: true` makes the cache cold. It never sets the TTL, because the engine also sets the flag for a compaction with no cached reply after it, however short the idle. The TTL comes from where the engine takes it: the last main-loop reply's `usage.cache_creation` split, read from the transcript's tail. Any `ephemeral_1h_input_tokens` gives 1h; `ephemeral_5m_input_tokens` alone gives 5m. A reply that wrote nothing is passed over, and so is a subagent's (`isSidechain`). Until this band's first reply, a TTL seen there is known, not assumed (`ttlSeen`, shown through the snapshot's `ttlPinned`, which means pinned or seen), so inference leaves it alone. It describes the recalled period, as `resumedCache` does, so it is an overlay and never written into `ttl`: `effectiveTtl()` is the pin, else `ttlSeen`, else `ttl`, and `msLeft` and `cacheView` read it. The first main-loop reply clears it, a read that lands after that reply is ignored, and `switchConversation` doesn't carry it, because the next request's TTL follows the config in force, not the transcript. A seen 5m therefore never outlives the recalled period: after the first reply, or a /clear, the band assumes the hour again, as it would have without the transcript. The environment's pin wins in either order, since `effectiveTtl` reads it first. The snapshot's field keeps the name `ttlPinned`, since every layout's view reads it. With no idle time from the engine, the band recalls as before: its store's `lastAt`, then the transcript's tail.
- **The read.** `grep -b -F '"type":"cost-state"' <path>` finds every cost record at any size; the output is small, one line per reopen. The session's own last record (by `sessionId`) gives the record and its byte offset, else the last well-formed record of any session (a fork's file may hold only its parent's). `tail -c +<offset + 1>` reads only what was logged after it. The record itself is grep's own line, and the replies are what the tail holds past its first newline: BSD and GNU grep give the offset where the line starts, but ugrep gives the match's, which starts the tail mid-line. The fallbacks:
  - grep exits 1: there is no record, so nothing is seeded.
  - grep can't run: the file is read whole if it is ≤ `READ_LIMIT`.
  - grep's output is truncated: the band gives up.
  - The tail fails or is truncated: the record alone is seeded.
- **Pricing.** Each reply after the record is priced at its model's rate in that record, through `weightedTokens`. That keeps every cache write at 1.25×, as the record's own total does, so the `ephemeral_5m`/`ephemeral_1h` split is not used.
- **Never double count.** The host restores the ledger from the log's cost state (`Jhe`), and on both the in-process `/resume` and the SDK path it does so only after the SessionStart hooks have started (`H7`). So the read may land before the restore, and the ledger at the read is no baseline. Growth counts from the conversation's own baseline instead: `costBase`, which the first `turn.start` takes, after any restore. Before that turn the band shows `max(ledger, transcript total)`; after it, `max(ledger, transcript total + ledger − costBase)`. `ratePerToken`, `costBase` and `lastTurnUsd` stay on the raw ledger.
- **Off the hook.** The transcript is read once per resume, with `void`, and redraws when it is done. Its end is read once too: `readResumed` reads it, and when the engine gave no idle time it hands that read to the recall (`recallLastReply` takes a reader, not a path, and returns what it recalls for the caller to note, so `readResumed` notes it under the same guard as the transcript: a recall still out when a /resume moves on to another session is dropped). Two cases still read the end twice. One is a load that recalled before the engine said it resumed, in the launch race with a ledger above $0. The other is a SessionStart with no idle time said before the load, whose recall the load's reset forgets. Sharing either read would mean holding the 1 MiB end for the session's life. Only the totals and the TTL are kept. The SessionStart hook waits only for the clock and the session id. The recall, when the engine gives no idle time, and the transcript read both run off it. The hook has a `.catch` that passes the event on, as `session.compact` has. `session.end` takes `resetForResume` for a resume and `resetConversation` for anything else.

**Files:**
- Modify: `hooks/cache.ts` (`TokenCounts`, `NO_TOKENS`, `addTokens`, `Spend`, `ResumedCache`; `resumed`, `resumedCache`, `prior` and `ttlSeen` in the state; `noteResume`, `notePrior`, `noteTtlSeen`, `spentUsd`; `resetForResume` beside `resetConversation`; `noteLoad` respects a resume; `msLeft`, `hitRatio`, `savedUsd` and `cacheView` read the prior spend and the engine's verdict)
- Modify: `hooks/memory.ts` (`COST_RECORD`, `sessionCostRecord`, `transcriptSpend`, `lastWriteTtl`; `rateFromTranscript` shares `recordRate`)
- Modify: `hooks/register.tsx` (`classic.SessionStart` with its `.catch`, `resumeConversation`, `applyResume`, `readResumed`, `spendBefore`, `transcriptFile`, `readWhole`, `endOf`; `recallLastReply` takes the session id and a reader of its end, and returns a `RecalledReply` that `noteRecalled` notes; `band.resume`; `session.start` applies a resume again; `session.end` takes `resetForResume` on a resume; `costUsd: spentUsd(…)`)
- Modify: `hooks/snapshot.ts` (`cache.recovered: boolean`; `ttlPinned`'s doc says it means pinned, or seen before this band's first reply), `hooks/reading.ts` (`measured` is `requests > 0 || recovered`)
- Modify: `tests/helpers.ts` (`grep`, `tail -c +N`, `grepFails`, the bottom `classic.SessionStart`; every answer is the one at the call), `tests/matrix.ts` (`snapOf` gains `recovered: false`)
- Test: `tests/resume-backfill.test.ts` (new)

**Interfaces:**
- **Produces:** `noteResume(said: ResumedCache | undefined)`, `notePrior(spend: Spend)`, `noteTtlSeen(ttl: Ttl)`, `resetForResume(costNow: number)`, `spentUsd(ledgerNow: number | undefined): number`; `transcriptSpend(transcript: string, sessionId: string): Spend | undefined`, `sessionCostRecord(grepOutput: string, sessionId: string): { offset; line } | undefined`, `lastWriteTtl(transcript: string): Ttl | undefined`; `BandSnapshot.cache.recovered`, and `BandSnapshot.cache.ttlPinned` true for a TTL seen as well as pinned.
- **Consumes:** `weightedTokens`, `modelName`, `READ_LIMIT`, `transcriptPath`, `recallLastReply($, sessionId, readEnd): Promise<RecalledReply | undefined>`.

- [ ] **Step 1: Extend the fake engine**

In `tests/helpers.ts`, `grep` answers as `grep -b -F` would, `tail` takes `-c +N`, `grepFails` and `grepMatchOffsets` (each match's offset, as ugrep gives it) join `ENGINE_INITIAL`, and `base` gives `classic.SessionStart` its bottom handler (one handler per event, so tests never register it). Every answer is the one at the call: the fake reads what it answers from before the hold, so a held read answers with what it was called with:

```diff
@@ -80,7 +80,7 @@ type EngineFake = {
   root: string
   repoRoot: string | undefined
   git: GitAnswer
-  /** While set, git answers wait on it: its answer is the one at the call. */
+  /** While set, git and grep answers wait on it: each answer is the one at the call. */
   hold: Promise<void> | undefined
   ran: string[][]
   /** The session's id and model, as the engine names them. */
@@ -92,6 +92,11 @@ type EngineFake = {
   transcriptBytes: number | undefined
   /** When set, `tail` can't run, as where the host has none. */
   tailFails: boolean
+  /** When set, `grep` can't run, as where the host has none. */
+  grepFails: boolean
+  /** When set, `grep -b` gives each match's byte offset, as ugrep does, not
+   *  its line's. */
+  grepMatchOffsets: boolean
   /** Every path the plugin asked the file system about. */
   statted: string[]
   /** The plugin's own store, JSON in and out as the engine keeps it. */
@@ -120,6 +125,8 @@ const ENGINE_INITIAL: Readonly<EngineFake> = {
   transcript: undefined,
   transcriptBytes: undefined,
   tailFails: false,
+  grepFails: false,
+  grepMatchOffsets: false,
   statted: [],
   root: PROJECT,
   repoRoot: PROJECT,
@@ -186,18 +193,33 @@ export const base = (on: On, initial: SessionUsage = USAGE, store: Readonly<Reco
     const quiet = { stderr: '', isStdoutTruncated: false, isStderrTruncated: false }
     if (e.argv[0] === 'tail') {
       if (engine.tailFails || engine.transcript === undefined) return { value: { ...quiet, exitCode: 1, stdout: '', stderr: 'tail: no such file' } }
-      const bytes = Number(e.argv[2])
-      return { value: { ...quiet, exitCode: 0, stdout: engine.transcript.slice(-bytes) } }
+      // `-c N` is the last N bytes, `-c +N` everything from byte N on.
+      const count = String(e.argv[2])
+      const stdout = count.startsWith('+') ? engine.transcript.slice(Number(count.slice(1)) - 1) : engine.transcript.slice(-Number(count))
+      return { value: { ...quiet, exitCode: 0, stdout } }
     }
-    const git = engine.git
-    const hold = engine.hold
+    const { git, transcript, grepFails, grepMatchOffsets, hold } = engine
     if (hold !== undefined) await hold
+    if (e.argv[0] === 'grep') {
+      // `grep -b -F pattern path`: each line holding the pattern, after its byte offset.
+      if (grepFails) throw new Error('grep: command not found')
+      if (transcript === undefined) return { value: { ...quiet, exitCode: 2, stdout: '', stderr: 'grep: no such file' } }
+      const pattern = String(e.argv.at(-2))
+      let offset = 0
+      const found: string[] = []
+      for (const line of transcript.split('\n')) {
+        if (line.includes(pattern)) found.push(`${grepMatchOffsets ? offset + line.indexOf(pattern) : offset}:${line}\n`)
+        offset += line.length + 1
+      }
+      return { value: { ...quiet, exitCode: found.length > 0 ? 0 : 1, stdout: found.join('') } }
+    }
     if (git === 'fail') throw new Error('git: command not found')
     if (git === 'none') return { value: { ...quiet, exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' } }
     return { value: { ...quiet, exitCode: 0, stdout: e.argv.includes('status') ? git.status : git.dirs } }
   })
   on('session.start', ($, e) => ({ cwd: e.cwd }))
   on('session.end', ($, e) => ({ sessionId: e.sessionId }))
+  on('classic.SessionStart', () => ({}))
   on('command.register', ($, e) => ({ value: { command: e.name } }))
   on('session.usage', ($, e) => {
     if (usage.fails) throw new Error('usage unavailable')
```

Add `recovered: false` to `snapOf`'s cache in `tests/matrix.ts`.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/resume-backfill.test.ts
// A past session resumed (`claude --resume`, /resume, or opened again in the
// desktop app): its ledger may read $0, but the conversation didn't start
// here. The engine's SessionStart says how long it sat idle and what
// re-caching costs; its transcript says what it has spent.

import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { SessionUsage } from 'claude-code'
import { CLEAR, HOUR, LONG, MIN, START, USAGE, cardOf, engine, fact, pillOf, resp, respond, setup, shown, startTurn, endTurn, mountBand, usage } from './helpers'

const ENV = { ENABLE_PROMPT_CACHING_1H: '1', HOME: '/Users/me' }
const BUILT_PATH = '/Users/me/.claude/projects/-Users-me-workspace-claude-mod/s1.jsonl'
const PATH = '/Users/me/.claude/projects/-Users-me-elsewhere/s1.jsonl'
/** A resumed session whose ledger starts again at $0. */
const RESUMED: SessionUsage = { ...USAGE, cost: { usd: 0 } }

const mounted = async ($: Engine, open = false) => {
  const ui = await mountBand($, 'terminal', 140)
  if (open) await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

/** A transcript's lines, as Claude Code writes them. */
const jsonl = (...lines: unknown[]): string => lines.map(line => JSON.stringify(line)).join('\n') + '\n'

/** One reply, logged once per content block, each line with the same usage. */
const reply = (id: string, blocks: number, usage: Record<string, unknown>, model = 'claude-opus-5-5') =>
  Array.from({ length: blocks }, (_, i) => ({
    type: 'assistant',
    timestamp: new Date(i).toISOString(),
    isSidechain: false,
    message: { id, role: 'assistant', model, content: [{ type: 'text', text: `block ${i}` }], usage },
  }))

/** $30 over 1M uncached + 1.25 × 400k written + 0.05 × 20M read + 5 × 100k
 *  output = 3M weighted tokens: $0.00001 a token on Opus 5.5. */
const RECORD = {
  type: 'cost-state',
  totalCostUSD: 30,
  startTime: 0,
  modelUsage: {
    'claude-opus-5-5': { inputTokens: 1_000_000, cacheCreationInputTokens: 400_000, cacheReadInputTokens: 20_000_000, outputTokens: 100_000, costUSD: 30 },
  },
}

/** 1,000 + 1.25 × 2,000 + 0.05 × 100,000 + 5 × 1,000 = 13,500 weighted
 *  tokens: $0.135 at the record's rate. */
const REPLY_USAGE = {
  input_tokens: 1_000,
  cache_creation_input_tokens: 2_000,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 2_000 },
  cache_read_input_tokens: 100_000,
  output_tokens: 1_000,
}

/** An older record, then the last one, then two replies logged after it,
 *  the first over three content blocks. */
const TRANSCRIPT = jsonl(
  { type: 'user', message: { role: 'user', content: 'hi' } },
  { ...RECORD, totalCostUSD: 12 },
  ...reply('msg_old', 1, REPLY_USAGE),
  RECORD,
  ...reply('msg_1', 3, REPLY_USAGE),
  ...reply('msg_2', 1, REPLY_USAGE),
)

/** The engine resuming a conversation last answered `idleMs` ago: by
 *  default the session's own, as at launch. */
const resume = (
  $: Engine,
  idleMs: number,
  fields: { expired?: boolean; reWarmUsd?: number; path?: string; source?: 'resume' | 'fork'; sessionId?: string } = {},
) =>
  $.classic.SessionStart({
    source: fields.source ?? 'resume',
    session_id: fields.sessionId ?? engine.sessionId,
    transcript_path: fields.path ?? PATH,
    seconds_since_last_response: idleMs / 1000,
    context_tokens: 76_000,
    prompt_cache_likely_expired: fields.expired ?? idleMs > HOUR,
    estimated_cache_write_usd: fields.reWarmUsd ?? 0.95,
  })

test('resumed two days on with a $0 ledger, the cache is cold at the price the engine names', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 48 * HOUR })
  await $.session.start(START)
  await resume($, 48 * HOUR, { reWarmUsd: 1.23 })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold · next message ~\$1\.23/)
  const tree = await mounted($, true)
  expect(fact(tree, 'idle for')).toBe('2d 0h')
  expect(fact(tree, 'next message')).toBe('~$1.23')
})

test('resumed ten minutes after its last reply, the cache counts down from that reply', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a forked session resumes the same way', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN, { source: 'fork' })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a cache the engine calls expired is cold, however recent the reply', async ($, on) => {
  setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: true })
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
})

test("without the engine's idle time, the band's own memory of the last reply stands in", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, store: { sessions: { s1: { lastAt: 3 * HOUR - 10 * MIN } } }, now: 3 * HOUR })
  await $.session.start(START)
  await $.classic.SessionStart({ source: 'resume', session_id: 's1', transcript_path: PATH })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test("a resumed session's spend and tokens start from its last cost record, each later reply counted once", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(engine.ran).toContainEqual(['grep', '-b', '-F', '"type":"cost-state"', PATH])
  // $30 + 2 × $0.135
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  const tree = await mounted($, true)
  expect(shown(cardOf(tree, 'spend'))).toMatch(/^SPEND\$30\.27/)
  expect(shown(cardOf(tree, 'spend'))).not.toMatch(/Breakdown counts/)
  // 1M + 400k sent, 100k back and 20M read, then 3k, 1k and 100k for each reply
  expect(fact(tree, 'input')).toBe('1.4M')
  expect(fact(tree, 'output')).toBe('102k')
  expect(fact(tree, 'cache reads')).toBe('20.2M')
})

test('the transcript the engine names is read; without one, the band finds it by the project', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN, { path: '' })
  await clock.settle()
  expect(engine.ran.find(argv => argv[0] === 'grep')?.at(-1)).toBe(BUILT_PATH)
})

test('a ledger that already counts the conversation is never added to it', async ($, on) => {
  const clock = setup(on, { usage: { ...USAGE, cost: { usd: 31 } }, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.00/)
})

test('a ledger that counts less than the transcript shows the transcript, and grows from there', async ($, on) => {
  const clock = setup(on, { usage: { ...USAGE, cost: { usd: 5 } }, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  await startTurn($, 't1', 5)
  await endTurn($, 't1', 6)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.27/)
})

test('with no transcript, a resume shows the ledger and no breakdown, as before', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(cardOf(await mounted($, true), 'spend'))).toMatch(/Breakdown counts from your next message/)
})

test('malformed lines are passed over, a record cut short included', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = `${TRANSCRIPT}{"type":"assistant","message":{"id":"msg_3"\n${JSON.stringify(RECORD).slice(0, 40)}\n`
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test("a grep that gives the match's offset, not its line's, still counts the record and every reply after it", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.grepMatchOffsets = true
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('without grep, a transcript small enough to read is read whole', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.grepFails = true
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('without grep, a transcript too big to read leaves the ledger as it is', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.grepFails = true
  engine.transcript = TRANSCRIPT
  engine.transcriptBytes = 5 * 1024 * 1024
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a /clear while the transcript is read leaves the new conversation alone', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  let release = (): void => undefined
  engine.hold = new Promise<void>(resolve => {
    release = resolve
  })
  await $.session.start(START)
  await resume($, 10 * MIN)
  await $.session.end(CLEAR)
  release()
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache warming/)
})

/** An in-process /resume of s2 from s1: the engine names s2 in its
 *  SessionStart, and switches the process to it only after the hooks ran. */
const RESUME_S2 = { reason: 'resume', sessionId: 's1', resume: { id: 's2' } } as const

test('/resume inside a running session resumes the conversation it names', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  // s2 forked from s1, so s1's record, copied, comes before its own.
  engine.transcript = jsonl(
    { ...RECORD, sessionId: 's1', totalCostUSD: 12 },
    ...reply('msg_old', 1, REPLY_USAGE),
    { ...RECORD, sessionId: 's2' },
    ...reply('msg_1', 3, REPLY_USAGE),
    ...reply('msg_2', 1, REPLY_USAGE),
  )
  await $.session.start(START)
  await $.session.end(RESUME_S2)
  // Until the engine says more, the band knows only that it isn't new.
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache –/)
  await resume($, 48 * HOUR, { sessionId: 's2' })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test("/resume without the engine's idle time recalls the resumed session's last reply, not the one left", async ($, on) => {
  const sessions = { s1: { lastAt: 3 * HOUR - MIN }, s2: { lastAt: 3 * HOUR - 10 * MIN } }
  const clock = setup(on, { usage: RESUMED, env: ENV, store: { sessions }, now: 3 * HOUR })
  await $.session.start(START)
  await $.session.end(RESUME_S2)
  await $.classic.SessionStart({ source: 'resume', session_id: 's2', transcript_path: PATH })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
})

test('a recall still out when /resume moves on never lands on the conversation resumed', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, store: { sessions: { s1: { lastAt: 3 * HOUR - MIN } } }, now: 3 * HOUR })
  await $.session.start(START)
  await $.classic.SessionStart({ source: 'resume', session_id: 's1', transcript_path: PATH })
  await $.session.end(RESUME_S2)
  await $.classic.SessionStart({ source: 'resume', session_id: 's2', transcript_path: PATH })
  await clock.settle()
  // s2 has nothing to recall, so its cache is unknown, not s1's.
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache –/)
})

test('a new session and a /clear read nothing and stay warming', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await $.classic.SessionStart({ source: 'startup', transcript_path: PATH })
  await $.session.end(CLEAR)
  await $.classic.SessionStart({ source: 'clear', transcript_path: PATH })
  await clock.settle()
  expect(engine.ran.filter(argv => argv[0] === 'grep' || argv[0] === 'tail')).toEqual([])
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache warming/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$0\.00/)
})

test('a SessionStart that comes before session.start still resumes the conversation', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await resume($, 48 * HOUR)
  await $.session.start(START)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('a SessionStart while session.start runs still resumes the conversation', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await Promise.all([resume($, 48 * HOUR), $.session.start(START)])
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

test('a ledger the host restores after the transcript is read is never added to it', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = TRANSCRIPT
  await $.session.start(START)
  await resume($, 10 * MIN)
  await clock.settle()
  // The host restores the record's total only once the band has read the transcript.
  usage.current = { ...RESUMED, cost: { usd: 30 } }
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
  await startTurn($, 't1', 30)
  await endTurn($, 't1', 31)
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$31\.27/)
})

test('a fork counts its own cost record, not one its parent wrote', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = jsonl(
    { ...RECORD, sessionId: 's1' },
    ...reply('msg_1', 3, REPLY_USAGE),
    ...reply('msg_2', 1, REPLY_USAGE),
    { ...RECORD, sessionId: 'parent', totalCostUSD: 50 },
  )
  await $.session.start(START)
  await resume($, 10 * MIN, { source: 'fork' })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cost'))).toMatch(/\$30\.27/)
})

/** No TTL pinned, so the band has only the transcript to go by. */
const UNPINNED = { HOME: '/Users/me' }

/** A reply that wrote its cache at `ttl`. */
const wroteAt = (id: string, ttl: '5m' | '1h') =>
  reply(id, 1, {
    ...REPLY_USAGE,
    cache_creation: { ephemeral_5m_input_tokens: ttl === '5m' ? 2_000 : 0, ephemeral_1h_input_tokens: ttl === '1h' ? 2_000 : 0 },
  })

test("a resumed session's cache lasts as long as its last main-loop cache write said", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  // A subagent's reply after it, written for an hour, says nothing of the main loop's cache.
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'), ...wroteAt('msg_2', '1h').map(line => ({ ...line, isSidechain: true })))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 3:00/)
  expect(fact(await mounted($, true), 'expires')).toBe('5m idle')
})

test('an hour seen on the last cache write is no longer assumed', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '1h'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 58m/)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle')
})

test('an hour seen on the transcript speaks only until the first reply, so inference can still correct it', LONG, async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '1h'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(12 * MIN)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))
  expect(fact(await mounted($, true), 'expires')).toBe('5m idle')
})

test('a TTL read off the transcript after the first reply is no longer news', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'))
  let release = (): void => undefined
  engine.hold = new Promise<void>(resolve => {
    release = resolve
  })
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  release()
  await clock.settle()
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle · assumed')
})

test('an hour seen on a resumed transcript is assumed again after a /clear', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '1h'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  await $.session.end(CLEAR)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle · assumed')
})

test('five minutes seen on the transcript never outlive the first reply: the hour is assumed again', LONG, async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(10 * MIN)
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 50m/)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle · assumed')
})

test('five minutes seen on a resumed transcript are forgotten at a /clear', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'))
  await $.session.start(START)
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  await $.session.end(CLEAR)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle · assumed')
})

test('the TTL the environment pins wins over one seen on the transcript, even one seen first', async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: ENV, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'))
  await resume($, 2 * MIN, { expired: false })
  await clock.settle()
  await $.session.start(START)
  await clock.settle()
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache 58m/)
  expect(fact(await mounted($, true), 'expires')).toBe('1h idle')
})

/** Whether `argv` reads a transcript's last megabyte. */
const isEndRead = (argv: string[]): boolean => argv[0] === 'tail' && argv[2] === String(1024 * 1024)

test("a resume without the engine's idle time reads its transcript's end once, for the recall and the TTL alike", async ($, on) => {
  const clock = setup(on, { usage: RESUMED, env: UNPINNED, now: 3 * HOUR })
  engine.transcript = jsonl(RECORD, ...wroteAt('msg_1', '5m'))
  await $.session.start(START)
  const before = engine.ran.length
  await $.classic.SessionStart({ source: 'resume', session_id: 's1', transcript_path: PATH })
  await clock.settle()
  expect(engine.ran.slice(before).filter(isEndRead)).toEqual([['tail', '-c', String(1024 * 1024), PATH]])
  // The recall found the reply logged at the epoch, and the TTL its write.
  expect(shown(pillOf(await mounted($), 'cache'))).toMatch(/cache cold/)
  expect(fact(await mounted($, true), 'expires')).toBe('5m idle')
})
```

- [ ] **Step 3: Run them and watch them fail**

Run: `tools/test-only.sh resume-backfill`
Expected: of the first 16 tests, 12 FAIL, with "cache warming" and "$0.00" where a resumed session should be cold and priced. The four that cover the fallbacks and the new-session path already pass. The next six came from the review of the first fix. Against that fix they fail with " ◷ cache warming " (SessionStart first), "$0.00" (the two together), "$60.27" (the ledger restored late), "$50.00" (the fork), " ◷ cache 58m " and "1h idle · assumed" (the TTLs). The second review rewrote the in-process test and added five. Against the fix before them, they fail with "$12.40" (the session left, counted), " ◷ cache 59m " (its reply, recalled), "1h idle" twice (a seen TTL that outlived the first reply, or crossed a /clear), "5m idle" (one read after the first reply) and two end reads where one is expected. The third review added three. Against the fix before them, two fail with " ◷ cache cold · next message 83k tokens " (a seen 5m written into the TTL, outliving the first reply) and "5m idle" (the same, carried across a /clear). The pin's passes, and fails with " ◷ cache 3:00 " if `effectiveTtl` reads the seen TTL over the pin. It also added the match-offset grep, which fails with "$0.00" against a tail parsed from grep's offset. And it added the recall still out at a /resume, which fails with " ◷ cache 59m " (the session left, recalled late).

- [ ] **Step 4: Implement**

In `cache.ts`, the pure accounting:

```ts
export const noteLoad = (costNow: number | undefined): void => {
  if (!state.resumed) state.knownFresh = !costNow
}

export const noteResume = (said: ResumedCache | undefined): void => {
  state.knownFresh = false
  state.resumed = true
  state.resumedCache = said
  state.prior = undefined
}

export const notePrior = (spend: Spend): void => {
  state.prior = spend
}

export const noteTtlSeen = (ttl: Ttl): void => {
  if (state.requests === 0) state.ttlSeen = ttl
}

const effectiveTtl = (): Ttl => (state.ttlPinned ? state.ttl : (state.ttlSeen ?? state.ttl))

export const spentUsd = (ledgerNow: number | undefined): number => {
  const ledger = ledgerNow ?? 0
  const prior = state.prior
  if (prior === undefined) return ledger
  const growth = state.baselined ? ledger - state.costBase : 0
  return Math.max(ledger, prior.usd + growth)
}

const allTokens = (): TokenCounts => (state.prior === undefined ? state : addTokens(state, state.prior.tokens))
```

`recalledAt()` is `resumedCache?.lastAt ?? recall?.lastAt`, and `isRecalled`, `msLeft` and `cacheView`'s `idleMs` read it. `msLeft` returns 0 for a recalled cache with `resumedCache.expired === true`. `hitRatio`, `savedUsd` and `cacheView`'s `tokens` read `allTokens()`. A recalled `reWarmUsd` is `resumedCache?.reWarmUsd ?? (rate === null ? null : reWarmAt(rate, contextTokens))`. `cacheView` adds `recovered: state.prior !== undefined`; its `ttl` is `effectiveTtl()`, as `msLeft`'s lifetime is, and its `ttlPinned` is `ttlPinned || ttlSeen !== undefined`, which is also what keeps inference off the TTL. `recordResponse` clears `ttlSeen` on every main-loop reply. `resetConversation(costNow)` (a /clear, fresh) and `resetForResume(costNow)` (not fresh) share one private `switchConversation`, which carries the TTL but not `ttlSeen`.

In `memory.ts`, `transcriptSpend(transcript, sessionId)` takes the session's own last cost record, else the last well-formed one. It sums every model's tokens in it, then adds each `assistant` line after it once by `message.id`, priced at `recordRate(modelUsage[modelName(model)], model)`. `sessionCostRecord` picks the same record from `grep -b` output, with its offset. `lastWriteTtl` walks the transcript from its end to the last main-loop reply whose `usage.cache_creation` wrote anything.

In `register.tsx`:

```ts
on('classic.SessionStart', async ($, e, next) => {
  if (e.agent_id === undefined && (e.source === 'resume' || e.source === 'fork')) await resumeConversation($, e)
  return next(e)
}).catch(($, e, next) => next(e)) // a failure here must never stop a session starting
```

`resumeConversation` builds a `Resume`: `e.session_id || $.session.id()`; the cache as `lastAt: now − seconds_since_last_response × 1000` with the engine's verdict and price, or `undefined` with no idle time; the transcript path (`''` is none); and no transcript facts yet. It keeps that in `band.resume` and applies it (`applyResume`: `noteResume`, then `notePrior` and `noteTtlSeen` from the facts once read). Then `void readResumed($, resume)`, and it invalidates. `readResumed` starts `transcriptEnd` once. With no idle time it runs `recallLastReply($, sessionId, () => end)` on that read. It runs `spendBefore` (grep, then `tail -c +N`, else `readWhole`) beside it, and waits on all three. It drops the results unless `band.resume` is still that resume. Otherwise it keeps the facts in `band.resume`, notes the recall and the facts, and invalidates. `session.start`, after its reset, applies `band.resume` again when its `sessionId` is `$.session.id()`, and drops it otherwise. It recalls the last reply only if the conversation isn't known fresh and the engine gave no `resumedCache`, reading its own end through `endOf`, and notes it with `noteRecalled`. `session.end` clears `band.resume`, then calls `resetForResume` for `reason: 'resume'` and `resetConversation` for anything else. The snapshot's `costUsd` is `spentUsd(usage.cost?.usd)`.

- [ ] **Step 5: Run the tests**

Run: `tools/test-only.sh resume-backfill resume cache-view`, then the full suite.
Expected: PASS, golden included.

- [ ] **Step 6: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/helpers.ts plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/resume-backfill.test.ts
git commit -m "fix: a resumed session recovers its spend and cache state

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## P2: The pilot, then five views in parallel

**How P2 runs**
- **Task 15** refreshes the canvas, alone.
- **Task 16 is the P2.0 pilot.** Ledger runs alone, on `feat/layouts`, with no worktree. It is the first real run of `viewSuite`. Every change it needs in `parts.tsx`, `frame.tsx`, `view.ts`, `words.ts`, `reading.ts`, `matrix.ts` or `helpers.ts` lands there, test first, as its own commit. Then the maintainer signs off the re-freeze (checkpoint 4), and only then does Task 16's last step fan out.
- **Tasks 17–21** run in parallel, one agent each, in worktrees under `.claude/worktrees/<name>` (`.gitignore` already covers that folder). Each agent touches **only** its own view file, `hooks/views/<name>.tsx` (it replaces the stub), and its own test file, `tests/view-<name>.test.ts`.
- **A frozen file needs a change** (the list in Task 14): the agent stops and reports. The change goes in through Task 15b, and every worktree rebases.
- **Task 22** merges the five views.

**The pattern every view follows** (ledger is the reference; a view must not deviate from it)
- **The view** is `export const <name>View = defineView('<name>', ROWS, lines, body[, strip])`, with `ROWS` as spec §1 declares.
- **`lines(kit, read, act)`** returns one element per collapsed row. Each row is `fitLine(kit, ORDER, lineRoom(kit), keeps => line(kit, key, pieces, end))`, squeezed on its own; the last row's `end` is `toggleButton(kit, read, act)`.
- **`ORDER`** lists the view's calm, optional pieces only, in spec §6's give-way order. Amber is never in it: an amber reading says `keeps.amber(reading.amber)`, long until every calm piece has gone, then short. A calm piece that turns amber stays, through `keeps.calm(piece, tone)`.
- **Every trigger has words.** A collapsed view that doesn't otherwise show a trigger (the cache's last minute, context near compaction or off, a limit at 80%, a measured 5h fill) adds an amber-only piece for it, outside `ORDER`.
- **An amber reading's chart** is gated by the amber step, `beforeLast(keeps)`, never by a calm step.
- **Build once.** Every piece that doesn't depend on the squeeze is built before `fitLine`, so the closure only selects. A chart that comes in two sizes builds each size at most once, when first asked for (`wide ??= …`). `toggleButton` is built once.
- **Words:** every word comes from `read`, as `say` segments or whole phrases a view places and never slices. A view adds only its own fixed labels (`CACHE`, `cooling`, `this session`, …). No `format.ts` import, no `.raw`, `.reading.`, `Date.parse`, `.replace(` or `Math.round` (Task 30's gate).
- **Expanded:** `body` shows the four sections, Cache, Spend, Context and Limits (every limit, `otherLimits` included), with `EMPTY.*` where there's no data, laid out with `section` and `grid` and fitted to `bodyRows`. Charts go through `chartsIfRoom`, so they drop before facts.
- **Desktop and plain:** Svg only through `charts.tsx`; plain and the terminal draw the builders' text forms. Desktop rows are counted at 24 px (`visualRows`), so a piece's height sets the rows it takes.
- **Locals:** never name one `h` (a history is `hist`).

**Each view's test file starts the same way:**

```ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('<name>')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
/** One scenario on one mount: its trees, shut and open. */
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: '<name>', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
```

Regexes put `\s*` around separators, because `shown()` joins children with no spaces. No test asserts a literal clock time.

### Task 15: The canvas refresh

**Files:**
- Modify: the canvas `https://claude.ai/artifact/D7zicdKoREmY44Ai1bqwFK` (Keepers row)

- [ ] **Step 1: Refresh the canvas to spec v3.** On every keeper artboard, collapsed and expanded:
  - the `cardBg` panel ground;
  - `! ` on every amber reading;
  - `47s left` instead of `0:47`;
  - `↻ in 3h 00m` vs `↻ 16:40`;
  - `IN 52 MIN`, and `~10% AT ↻` in place of `ON PACE`;
  - no gold re-warm;
  - context measured toward compaction, with no compaction tick;
  - tiles and forecast at 2 rows, and forecast at now plus at most 3 events;
  - week's hour labels as clock hours;
  - terminal glyphs from the allowlist only (braille charts, no circles or weather);
  - departures in the on-flap inks (`flapWarm`, `flapAmber`, `flapFive`, `flapWeek`, `flapCoin`).

  Publish and tell the maintainer.

### Task 15b: A shared-file change during the fan-out (only when needed)

Use this task only when a P2 agent reports a missing helper or field after the re-freeze.

- [ ] Make the change on `feat/layouts`, test first, in the file that owns it. Run the full suite, golden included, and commit it on its own.
- [ ] In every worktree, commit any work in progress first, then run `git rebase feat/layouts` and re-run that view's tests.
- [ ] Record the change in the ledger, under the re-freeze.

### Task 16: `ledger`, the P2.0 pilot

**Files:** `hooks/views/ledger.tsx` (replaces the stub), `tests/view-ledger.test.ts`, and any shared file the pilot proves needs a change (see Step 5).
**Rows:** desktop 1, terminal 1.
**Design (spec §6):** words alone, `·`-separated. Give-way: `resets in X` becomes `↻ in X`, then the reset times go, then 7d, context, the cost and 5h. Expanded: the workspace as a sentence, then CACHE, SPEND, CONTEXT and LIMITS as columns of short sentences, two by two below 100 columns.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-ledger.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('ledger')

const T160: Mount = { surface: 'terminal', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'ledger', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('calm reads as one sentence of readings', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/cache 1h 00m left\s*·\s*\$2\.41\s*·\s*context 38%\s*·\s*5h 4%, resets in 3h 00m\s*·\s*7d 30%, resets in 2d 19h/)
})
test('the last minute leads with "! " and the price', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/^! 30s left · re-warm ~\$/)
})
test('narrow, the resets give way first and the cache stays', async ($, on) => {
  const t = shown((await at($, on, 'calm', { surface: 'terminal', cols: 60 })).shut)
  expect(t).toMatch(/cache 1h 00m left/)
  expect(t).not.toMatch(/resets in/)
})
test('at 40 columns amber still leads', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', { surface: 'terminal', cols: 40 }, '5m')).shut)).toMatch(/^! 30s/)
})
test('a limit at 80% says why, in words', async ($, on) => {
  expect(shown((await at($, on, 'limit80')).shut)).toMatch(/! 5h 82%/)
})
test('open: the workspace as a sentence, then four sections', async ($, on) => {
  const t = shown((await at($, on, 'calm')).open)
  expect(t).toMatch(/claude-mod, branch main, clean/)
  for (const title of ['CACHE', 'SPEND', 'CONTEXT', 'LIMITS']) expect(t).toContain(title)
  expect(t).toMatch(/re-warm ~\$\S+ if it goes cold/)
})
test('open with no limits, the section says so', async ($, on) => {
  expect(shown((await at($, on, 'noLimits')).open)).toMatch(/LIMITS\s*none reported/)
})
test('open with no context, the section says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*not reported/)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `tools/test-only.sh view-ledger`
Expected: FAIL. The stub draws chips, so the sentences and most of the 34 suite cases fail.

- [ ] **Step 3: Implement `hooks/views/ledger.tsx`**

```tsx
// ledger: the band in words alone, `·`-separated; `! ` leads what needs you.
// The reference view: every other layout follows its shape.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton, type Strip } from './frame'
import { fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way as the line narrows, first to last. Amber never does. */
const ORDER = ['resetGlyph', 'resetTimes', 'calmSeven', 'calmContext', 'cost', 'calmFive'] as const
type Piece = (typeof ORDER)[number]

/** A limit: amber, its reason; calm, its value and its reset as the squeeze allows. */
const limitPiece = (kit: Kit, l: LimitView, step: Piece, keeps: Keeps<Piece>): RenderChildren => {
  if (l.amber !== undefined) return words(kit, l.name, [[keeps.amber(l.amber), 'amber']])
  if (!keeps.has(step)) return null
  const reset = keeps.has('resetTimes') ? (keeps.has('resetGlyph') ? l.resetWords : l.resetGlyph) : undefined
  return words(kit, l.name, reset === undefined ? l.say : [...l.say, [`, ${reset}`, 'label']])
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const c = read.cache
  const x = read.context
  // Built once: none of these changes with the squeeze.
  const toggle = toggleButton(kit, read, act)
  const cost = words(kit, 'cost', [[read.spend.totalText, 'value']])
  const calmCache = words(kit, 'cache', c.say)
  const calmContext = x.known ? words(kit, 'ctx', x.say) : null
  const seps = [1, 2, 3, 4].map(i => words(kit, `sep${i}`, [['·', 'label']]))
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const pieces = [
        c.amber !== undefined ? words(kit, 'cache', [[keeps.amber(c.amber), 'amber']]) : calmCache,
        keeps.has('cost') ? cost : null,
        !x.known ? null : x.amber !== undefined ? words(kit, 'ctx', [[keeps.amber(x.amber), 'amber']]) : keeps.has('calmContext') ? calmContext : null,
        read.fiveHour === undefined ? null : limitPiece(kit, read.fiveHour, 'calmFive', keeps),
        read.sevenDay === undefined ? null : limitPiece(kit, read.sevenDay, 'calmSeven', keeps),
      ].filter((p): p is RenderElement => p !== null)
      return line(kit, 'line', pieces.flatMap((p, i) => (i === 0 ? [p] : [seps[i - 1] ?? null, p])), toggle, 1)
    }),
  ]
}

/** The facts behind ▿: four columns of short sentences. */
const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  const say = (key: string, text: string | undefined): RenderChildren => (text === undefined ? null : words(kit, key, [[text, 'value']]))
  return grid(kit, [
    section(kit, 'cache', 'CACHE', [
      say('now', c.value),
      say('rewarm', c.reWarmText),
      c.savedText === undefined || c.hitText === undefined ? null : say('saved', `saved ${c.savedText}, ${c.hitText} hit rate`),
      say('lasts', `lasts ${c.lastsText}`),
    ], room),
    section(kit, 'spend', 'SPEND', [
      say('total', `${s.totalText} this session`),
      s.lastText === undefined ? null : say('last', `last message ${s.lastText}`),
      say('tokens', `${s.tokensText} tokens: ${s.split.map(part => `${part.text} ${part.label}`).join(', ')}`),
    ], room),
    section(kit, 'context', 'CONTEXT', !x.known ? [say('none', EMPTY.context)] : [
      say('pct', `${x.valueText} ${x.towardText}`),
      say('in', x.compactsAtText === undefined ? `${x.inContextText} in context` : `${x.inContextText} in context, compacts at ${x.compactsAtText}`),
      x.roomText === undefined ? null : say('room', `${x.roomText} room in a ${x.windowText} window`),
    ], room),
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [say('none', EMPTY.limits)] : [
      read.worstLimit === undefined ? null : say('closest', `closest is ${read.worstLimit.text}`),
      ...read.limits.map(l => say(l.name, [l.text, l.resetWords, l.pace].filter(t => t !== undefined && t !== '').join(', '))),
    ], room),
  ], bodyRows)
}

/** Ledger's own strip: the workspace as a sentence. */
const strip: Strip = (kit, read) => {
  const { Box } = kit
  return read.workspaceText === undefined ? null : (
    <Box key="strip" flexGrow={1} width={0} minWidth={0} overflow="hidden">
      {words(kit, 'workspace', [[read.workspaceText, 'label']])}
    </Box>
  )
}

export const ledgerView = defineView('ledger', { desktop: 1, terminal: 1 }, lines, body, strip)
```

Change `views/index.ts` only if the stub's export name differs (it doesn't: `ledgerView`).

- [ ] **Step 4: Run the tests until they pass**

Run: `tools/test-only.sh view-ledger`
Expected: PASS: the 34 suite cases and the eight tests above. If a suite case fails, read its message (`<case> <check>: <why>`) and fix the view. If the fix belongs in a shared file, Step 5 says how.

- [ ] **Step 5: Land each shared-file change the pilot needs, on its own**

The pilot exists to find what the shared files lack before five agents copy it. For each gap (a helper `parts.tsx` should own, a word `words.ts` should say, a check in `matrix.ts` that is wrong rather than the view):
1. write a failing test in that file's own test (`parts.test.ts`, `readings.test.ts`, `matrix.test.ts`, …);
2. change the shared file;
3. run the full suite, golden included;
4. commit it alone, as `fix:` or `feat:` with the reason in the body;
5. record it in the ledger, under "P2.0 re-freeze".

Before the re-freeze, cover the shared pieces ledger doesn't use, so the five views that do use them are not the first to find their bugs. Add one test each to `tests/frame.test.ts`, drawn with `fakeEl` and `snapOf`:
- **`layoutCachePill`:** in `lastMinute`, its text starts with `! ` and has no `0:` countdown.
- **The shared strip:** `frame` with a workspace places it at the top at `maxRows` 13, and in the footer at `maxRows` 6.
- **`meter` with `tick`:** the desktop Svg has `class="tick"`, and the terminal form contains `│`.

A change to a check in `matrix.ts` needs a reason in the ledger that the check was wrong; a check is never loosened to let a view pass.

- [ ] **Step 6: Run the gates and the view gate, then commit the view**

Run the three gates from Global Constraints, then the gate Task 30 enforces:

```bash
grep -nE '\.raw\b|\.reading\.|Date\.parse|\.replace\(|Math\.round|from '\''\.\./format'\''' plugins/session-usage-band/hooks/views/*.tsx | grep -vE '/(chips|parts|frame)\.tsx:'
```

Expected: the gates pass, and the grep prints nothing.

```bash
git add plugins/session-usage-band/hooks/views/ledger.tsx plugins/session-usage-band/tests/view-ledger.test.ts
git commit -m "feat: the ledger layout, the band in words alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Re-freeze (maintainer checkpoint 4)**

Write the re-freeze note in the ledger: the list of shared-file commits from Step 5 (or "none"), and the test count. Commit it:

```bash
git add design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "docs: the ledger at the P2.0 re-freeze

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Report it and wait for the sign-off. The shared files are then frozen for Tasks 17–21.

- [ ] **Step 8: Fan out**

Create one worktree per remaining view, off the re-frozen tip:

```bash
for v in tiles gauges rings departures forecast; do
  git worktree add -b layouts/$v .claude/worktrees/$v feat/layouts
  cp -R plugins/session-usage-band/.claude-plugin/types .claude/worktrees/$v/plugins/session-usage-band/.claude-plugin/types
done
```

If permissions refuse a worktree command, ask the maintainer to run it. Brief each agent with this text, the view's task number and name substituted:
1. "Work only in `.claude/worktrees/<name>`, on branch `layouts/<name>`. Implement Task <N> of `design/plans/2026-10-10-band-layouts-plan.md`, test first, with `hooks/views/ledger.tsx` as the reference. Touch only `hooks/views/<name>.tsx` and `tests/view-<name>.test.ts`."
2. "If you need a change to any other file, stop and report what and why; don't make it."
3. "Commit work in progress before any rebase."
4. "Before you report: run the three gates and the view grep gate in your worktree, and check that `git diff --name-only feat/layouts...HEAD` lists exactly your two files."
5. "Do not push."

**Ruling: the narrowest widths (applies to Tasks 17–21, 25 and 26).** The matrix checks every calm case from 40 columns, where a line may take 34 (`lineRoom`). Where a view's spec §6 give-way list runs out before its line fits, the view adds the fewest extra calm steps at the end of its `ORDER`, each named for what it drops, and records each as a ruling in the ledger. The code below already carries the ones the arithmetic shows: gauges' `reWarm`, rings' `marks`, and pulse's `costWords` and `pace`; week's `emptyText`, where `EMPTY.history` gives way, is in its own give-way already. If the matrix finds another, add it the same way; never loosen the check.

### Task 17: `tiles`

**Files:** `hooks/views/tiles.tsx`, `tests/view-tiles.test.ts`
**Rows:** desktop 2 (the 4 px underline doesn't count), terminal 2.
**Design (spec §6):** five tiles, cache, cost, context, 5h (`↻ in 3h 00m`) and 7d, each a bold value over a label; on the desktop a 4 px underline under each label but the cost's. Escalation: the value and label turn amber, and the label says why. Give-way: the underline, reset text, the 7d tile, the context tile. Expanded: four groups, each 2×2; a dashed underline is a projection.
**E fixes:** every limit has its tiles (no `slice(0, 2)`); the body honours `bodyRows`; an amber tile's underline is gated by the amber step.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-tiles.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('tiles')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'tiles', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('each tile is a value over its label', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/1h 00m\s*cache/)
  expect(t).toMatch(/\$2\.41\s*this session/)
  expect(t).toMatch(/4%\s*5h ↻ in 3h 00m/)
})
test('the desktop draws an underline under each tile but the cost', async ($, on) => {
  expect(svgsOf((await at($, on, 'calm', D160)).shut).filter(n => Number(n.props?.height) === 4)).toHaveLength(4)
})
test('an amber tile turns its label into the reason', LONG, async ($, on) => {
  expect(shown((await at($, on, 'lastMinute', T160, '5m')).shut)).toMatch(/! 30s left · re-warm ~\$/)
})
test('open, every limit has its tiles, a gateway spend limit too', async ($, on) => {
  expect(shown((await at($, on, 'gatewaySpend')).open)).toMatch(/92%\s*spend/)
})
test('open, a projection is a dashed underline', async ($, on) => {
  expect(svgsOf((await at($, on, 'calm', D160)).open).some(n => /stroke-dasharray/.test(String(n.props?.source)))).toBe(true)
})
test('open with no context, its group says so', async ($, on) => {
  expect(shown((await at($, on, 'warming')).open)).toMatch(/CONTEXT\s*not reported/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-tiles`. Expected: FAIL (the stub draws chips).
- [ ] **Step 3: Implement `hooks/views/tiles.tsx`**

```tsx
// tiles: type first, a bold value over a small label; on the desktop a thin
// underline bar under each but the cost's. No pills.

import type { RenderChildren, RenderElement } from 'claude-code'
import { underline } from '../charts'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Role } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way, first to last. Amber never does. */
const ORDER = ['underline', 'resetText', 'calmSeven', 'calmContext'] as const
type Piece = (typeof ORDER)[number]
const UNDER_PX = 64

/** A value over its label, and on the desktop its bar beneath. */
const stack = (kit: Kit, key: string, value: RenderElement, label: RenderElement, bar: RenderChildren): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="column" flexShrink={0}>{value}{label}{bar}</Box>
}

/** A collapsed tile: its value and bar built once; its label chosen by the squeeze. */
type Tile = Readonly<{ key: string; value: RenderElement; bar: RenderChildren; amber: Amber | undefined; calm: (keeps: Keeps<Piece>) => string; role: Role }>

const drawTile = (kit: Kit, t: Tile, keeps: Keeps<Piece>): RenderElement =>
  stack(
    kit,
    t.key,
    t.value,
    words(kit, 'l', t.amber !== undefined ? [[keeps.amber(t.amber), 'amber']] : [[t.calm(keeps), t.role]]),
    (t.amber !== undefined ? beforeLast(keeps) : keeps.has('underline')) ? t.bar : null,
  )

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  const bold = (text: string, amber: boolean) => words(kit, 'v', [[text, amber ? 'amber' : 'value']], true)
  const bar = (alt: string, frac: number, color: string, amber: boolean) => underline(kit, { key: 'u', alt, frac, color: amber ? p.amberFg : color, px: UNDER_PX })
  const cache: Tile = {
    key: 'cache',
    value: bold(c.leftShort || c.value, c.amber !== undefined),
    bar: bar(c.alt, c.charge, p.warm, c.amber !== undefined),
    amber: c.amber,
    // Cold is a price, so its label names it.
    calm: () => (c.condition === 'cold' ? `re-warm ${c.estimate}` : 'cache'),
    role: 'label',
  }
  const context: Tile | undefined = !x.known ? undefined : {
    key: 'ctx',
    value: bold(x.valueText, x.amber !== undefined),
    bar: bar(x.alt, x.frac, p.meterFill, x.amber !== undefined),
    amber: x.amber,
    calm: () => 'context',
    role: 'label',
  }
  const limit = (l: LimitView, role: Role): Tile => ({
    key: l.name,
    value: bold(l.passed ? 'reset' : l.value, l.amber !== undefined),
    bar: bar(l.alt, l.frac, accentOf(kit, l), l.amber !== undefined),
    amber: l.amber,
    calm: keeps => (keeps.has('resetText') && l.resetGlyph !== undefined ? `${l.name} ${l.resetGlyph}` : l.name),
    role,
  })
  const five = read.fiveHour === undefined ? undefined : limit(read.fiveHour, 'accent5')
  const seven = read.sevenDay === undefined ? undefined : limit(read.sevenDay, 'accent7')
  const cost = stack(kit, 'cost', bold(read.spend.totalText, false), words(kit, 'l', [['this session', 'label']]), null)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps =>
      line(kit, 'line', [
        drawTile(kit, cache, keeps),
        cost,
        context !== undefined && keeps.calm('calmContext', x.tone) ? drawTile(kit, context, keeps) : null,
        five === undefined ? null : drawTile(kit, five, keeps),
        seven !== undefined && read.sevenDay !== undefined && keeps.calm('calmSeven', read.sevenDay.tone) ? drawTile(kit, seven, keeps) : null,
      ], toggle, 3),
    ),
  ]
}

/** Tiles side by side: one row of a group, two lines tall; nothing when none is known. */
const pair = (kit: Kit, key: string, tiles: readonly RenderChildren[]): RenderChildren => {
  const { Box } = kit
  const drawn = tiles.filter(t => t !== null)
  return drawn.length === 0 ? null : <Box key={key} flexDirection="row" columnGap={2}>{drawn}</Box>
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const s = read.spend
  const tile = (key: string, value: string | undefined, label: string, bar: RenderChildren = null): RenderChildren =>
    value === undefined ? null : stack(kit, key, words(kit, 'v', [[value, 'value']], true), words(kit, 'l', [[label, 'label']]), bar)
  const room = gridRoom(kit, bodyRows)
  // A pair is two lines tall: a group holds as many as fit under its title,
  // and short of one, says its headline in a line.
  const pairs = Math.floor(room / 2)
  const group = (key: string, title: string, rows: readonly RenderChildren[], headline: string): RenderElement =>
    section(kit, key, title, pairs > 0 ? rows : [words(kit, 'head', [[headline, 'value']])], pairs > 0 ? pairs : room)
  const none = (text: string) => words(kit, 'none', [[text, 'label']])
  return grid(kit, [
    group('cache', 'CACHE', [
      pair(kit, 'a', [
        tile('left', c.leftShort || c.value, c.leftShort === '' ? 'cache' : 'left', underline(kit, { key: 'u', alt: c.alt, frac: c.charge, color: p.warm, px: UNDER_PX })),
        tile('rewarm', c.estimate, c.condition === 'cold' ? 'next message' : 're-warm if cold'),
      ]),
      pair(kit, 'b', [tile('saved', c.savedText, 'saved'), tile('hit', c.hitText, 'hit rate')]),
    ], c.text),
    group('spend', 'SPEND', [
      pair(kit, 'a', [tile('total', s.totalText, 'this session'), tile('last', s.lastText, 'last message')]),
      pair(kit, 'b', [tile('tokens', s.tokensText, 'tokens'), tile('reads', s.split[2]?.text, 'cache reads')]),
    ], `${s.totalText} this session`),
    group('context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : [
      pair(kit, 'a', [tile('pct', x.valueText, x.towardText, underline(kit, { key: 'u', alt: x.alt, frac: x.frac, color: p.meterFill, px: UNDER_PX })), tile('in', x.inContextText, 'in context')]),
      pair(kit, 'b', [tile('room', x.roomText, 'room left'), tile('window', x.windowText, 'window')]),
    ], x.known ? x.text : EMPTY.context),
    group('limits', 'LIMITS', read.limits.length === 0 ? [none(EMPTY.limits)] : read.limits.map(l =>
      pair(kit, l.name, [
        tile('now', l.passed ? 'reset' : l.value, l.resetGlyph === undefined ? l.name : `${l.name} ${l.resetGlyph}`, underline(kit, { key: 'u', alt: l.alt, frac: l.frac, color: l.amber !== undefined ? p.amberFg : accentOf(kit, l), px: UNDER_PX })),
        tile('then', l.projectedText, `${l.name} at its reset`, l.projectedFrac === undefined ? null : underline(kit, { key: 'u', alt: `${l.name} at its reset`, frac: l.projectedFrac, color: accentOf(kit, l), px: UNDER_PX, dashed: true })),
      ]),
    ), read.limits.length === 0 ? EMPTY.limits : read.limits.map(l => l.text).join(' · ')),
  ], bodyRows)
}

export const tilesView = defineView('tiles', { desktop: 2, terminal: 2 }, lines, body)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-tiles`. Then the three gates and the view grep gate (Task 16, Step 6) in the worktree.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/tiles.tsx plugins/session-usage-band/tests/view-tiles.test.ts
git commit -m "feat: the tiles layout, a bold value over its label

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: `gauges`

**Files:** `hooks/views/gauges.tsx`, `tests/view-gauges.test.ts`
**Rows:** desktop 2, terminal 2.
**Design (spec §6):** row 1 is `cache`, a time-left bar, `52m left · re-warm ~$1.66`, then on the right `$3.19 · 225k tokens`. Row 2 is the context, 5h and 7d cells (label, bar, value), then ▿; the context bar ends at compaction; ticks on 5h and 7d only. Give-way: tokens, reset texts, the cost joins the cache sentence, bars shrink to 6 cells, calm cells become text (`5h 4%`), still two rows; then, by the narrow-width ruling, the re-warm price leaves the sentence (`reWarm`). Expanded: four panels; Spend's split bar is a meter per part with its legend; Limits has ticked bars with a dashed projection and `on pace for ~X%`, then `otherLimits`.
**E and F fixes:** an amber bar is gated by the amber step; the hit-rate bar reads `hitFrac`; each bar's two sizes are built at most once.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-gauges.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('gauges')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'gauges', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}

test('row one is the cache with its time-left bar; row two the three cells', async ($, on) => {
  const t = shown((await at($, on, 'calm')).shut)
  expect(t).toMatch(/cache.*1h 00m left · re-warm ~\$\S+\s*\$2\.41 · \S+ tokens/)
  expect(t).toMatch(/context.*38%.*5h.*4%.*7d.*30%/)
})
test('5h and 7d bars carry a tick for the window gone; context has none', async ($, on) => {
  const ticked = svgsOf((await at($, on, 'calm', D160)).shut).filter(n => /class="tick"/.test(String(n.props?.source)))
  expect(ticked.map(n => String(n.props?.alt).split(' ')[0])).toEqual(['5h', '7d'])
})
test('narrow, calm cells become text', async ($, on) => {
  expect(shown((await at($, on, 'calm', { surface: 'terminal', cols: 50 })).shut)).toMatch(/5h 4%/)
})
test('a measured pace speaks in amber words', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! 5h full in ~/)
})
test('open, the limits carry a dashed projection and their pace', async ($, on) => {
  const { open } = await at($, on, 'calm', D160)
  expect(shown(open)).toMatch(/on pace for ~\d+%/)
  expect(svgsOf(open).some(n => /stroke-dasharray="3 2"/.test(String(n.props?.source)))).toBe(true)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-gauges`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/gauges.tsx`**

```tsx
// gauges: two rows of labelled bars. The cache's bar is its time left; the
// 5h and 7d bars carry a tick for how much of the window has gone.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Kit } from '../kit'
import type { BarSize } from '../layout'
import type { LimitView, Readings, Tone } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber, type Say } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way, first to last; `reWarm` is the narrow-width ruling's. Amber never does. */
const ORDER = ['tokens', 'resetText', 'costRight', 'bars', 'calmCells', 'reWarm'] as const
type Piece = (typeof ORDER)[number]
const WIDE: BarSize = { px: 240, cells: 24 }
const CELL: BarSize = { px: 120, cells: 12 }
const SMALL: BarSize = { px: 60, cells: 6 }

/** A bar in its two sizes, each built at most once, when first asked for. */
const twoSizes = (big: BarSize, make: (size: BarSize) => RenderChildren): ((isBig: boolean) => RenderChildren) => {
  let wide: RenderChildren | undefined
  let small: RenderChildren | undefined
  return isBig => (isBig ? (wide ??= make(big)) : (small ??= make(SMALL)))
}

const cacheRow = (kit: Kit, read: Readings): RenderElement => {
  const c = read.cache
  const s = read.spend
  const amber = c.amber !== undefined
  const name = words(kit, 'name', [['cache', amber ? 'amber' : 'label']])
  const bar = twoSizes(WIDE, size => meter(kit, { key: 'bar', label: 'cache', frac: c.charge, tone: c.tone, accent: kit.palette.warm, size, reads: 'left' }))
  // While warm, the time left and the re-warm price; else the cache's one word.
  const priced: Say = c.condition === 'warm' && c.left !== '' ? [[c.left, 'value'], [' · re-warm ', 'label'], [c.estimate, 'value']] : [[c.value, 'value']]
  const bare: Say = [[c.value, 'value']]
  const withCost = (say: Say): Say => [...say, [` · ${s.totalText}`, 'value']]
  const sentence = { pricedRight: words(kit, 'say', priced), pricedCost: words(kit, 'say', withCost(priced)), bareCost: words(kit, 'say', withCost(bare)) }
  const cost = words(kit, 'cost', [[s.totalText, 'value']])
  const right = words(kit, 'right', [[s.totalText, 'value']])
  const rightTokens = words(kit, 'right', [[s.totalText, 'value'], [` · ${s.tokensText} tokens`, 'label']])
  return fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const onRight = keeps.has('costRight')
    return line(kit, 'r1', [
      name,
      !amber || beforeLast(keeps) ? bar(keeps.has('bars')) : null,
      c.amber !== undefined ? words(kit, 'say', [[keeps.amber(c.amber), 'amber']]) : onRight ? sentence.pricedRight : keeps.has('reWarm') ? sentence.pricedCost : sentence.bareCost,
      amber && !onRight ? cost : null,
    ], onRight ? (keeps.has('tokens') ? rightTokens : right) : null, 1)
  })
}

/** A cell of row two: name, bar and value; amber, its bar and reason; calm and narrow, its text. */
type Cell = Readonly<{ key: string; amber: Amber | undefined; name: RenderElement; bar: (isBig: boolean) => RenderChildren; value: (keeps: Keeps<Piece>) => RenderElement; text: RenderElement }>

const drawCell = (kit: Kit, cell: Cell, keeps: Keeps<Piece>): RenderChildren[] => {
  if (cell.amber !== undefined) return [beforeLast(keeps) ? cell.bar(keeps.has('bars')) : null, words(kit, cell.key, [[keeps.amber(cell.amber), 'amber']])]
  if (!keeps.has('calmCells')) return [cell.text]
  return [cell.name, cell.bar(keeps.has('bars')), cell.value(keeps)]
}

const cellsRow = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  const limitCell = (l: LimitView): Cell => {
    const plain = words(kit, `${l.name}:v`, [[l.passed ? 'reset' : l.value, 'value']])
    const withReset = l.resetGlyph === undefined ? plain : words(kit, `${l.name}:v`, [[l.value, 'value'], [` ${l.resetGlyph}`, 'label']])
    return {
      key: l.name,
      amber: l.amber,
      name: words(kit, `${l.name}:n`, [[l.name, 'label']]),
      bar: twoSizes(CELL, size => meter(kit, { key: `${l.name}:bar`, label: l.name, frac: l.frac, tone: l.tone, accent: accentOf(kit, l), size, tick: l.gone })),
      value: keeps => (keeps.has('resetText') ? withReset : plain),
      text: words(kit, l.name, l.say),
    }
  }
  const ctxValue = words(kit, 'ctx:v', [[x.valueText, 'value']])
  const cells: Cell[] = [
    ...(x.known
      ? [{
          key: 'ctx',
          amber: x.amber,
          name: words(kit, 'ctx:n', [['context', 'label']]),
          // Measured toward compaction, so its end is the compaction point: no tick.
          bar: twoSizes(CELL, size => meter(kit, { key: 'ctx:bar', label: 'context', frac: x.frac, tone: x.tone, accent: kit.palette.meterFill, size })),
          value: () => ctxValue,
          text: words(kit, 'ctx', x.say),
        }]
      : []),
    ...(read.fiveHour === undefined ? [] : [limitCell(read.fiveHour)]),
    ...(read.sevenDay === undefined ? [] : [limitCell(read.sevenDay)]),
  ]
  return fitLine(kit, ORDER, lineRoom(kit), keeps => line(kit, 'r2', cells.flatMap(cell => drawCell(kit, cell, keeps)), toggle, 1))
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => [cacheRow(kit, read), cellsRow(kit, read, act)]

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  const bar = (key: string, label: string, frac: number, tone: Tone, accent: string, extra: Readonly<{ tick?: number; projectTo?: number }> = {}) =>
    meter(kit, { key, label, frac, tone, accent, size: CELL, ...extra })
  // The split's parts in spec §2.10's colours: input, output, cache reads.
  const SPLIT = [p.meterFill, p.label, p.value] as const
  const none = (text: string) => words(kit, 'none', [[text, 'label']])
  return grid(kit, [
    section(kit, 'cache', 'CACHE', chartsIfRoom(room, [c.hitFrac === undefined ? null : bar('hit:bar', 'hit rate', c.hitFrac, 'calm', p.warm)], [
      fact(kit, 'hit', 'hit rate', c.hitText),
      fact(kit, 'saved', 'saved', c.savedText),
      fact(kit, 'lasts', 'lasts', c.lastsText),
      c.reWarmText === undefined ? null : words(kit, 'rewarm', [[c.reWarmText, 'value']]),
    ]), room),
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, s.split.map((part, i) => bar(`split${i}`, part.label, part.frac, 'calm', SPLIT[i] ?? p.meterFill)), [
      fact(kit, 'total', 'session', s.totalText),
      fact(kit, 'last', 'last message', s.lastText),
      ...s.split.map(part => fact(kit, part.label, part.label, part.text)),
    ]), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : chartsIfRoom(room, [bar('ctx:bar', 'context', x.frac, x.tone, p.meterFill)], [
      fact(kit, 'room', 'room', x.roomText),
      fact(kit, 'at', 'compacts at', x.compactsAtText),
      fact(kit, 'window', 'window', x.windowText),
      fact(kit, 'in', 'in context', x.inContextText),
    ]), room),
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [none(EMPTY.limits)] : chartsIfRoom(
      room,
      read.limits.map(l => bar(`${l.name}:bar`, l.name, l.frac, l.tone, accentOf(kit, l), { tick: l.gone, projectTo: l.projectedFrac })),
      read.limits.map(l => words(kit, l.name, l.amber !== undefined ? [[l.amber.long, 'amber']] : l.pace === '' ? l.say : [...l.say, [` · ${l.pace}`, 'label']])),
    ), room),
  ], bodyRows)
}

export const gaugesView = defineView('gauges', { desktop: 2, terminal: 2 }, lines, body)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-gauges`, then the gates and the view grep gate. Record the `reWarm` ruling in the ledger.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/gauges.tsx plugins/session-usage-band/tests/view-gauges.test.ts
git commit -m "feat: the gauges layout, two rows of labelled bars

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: `rings`

**Files:** `hooks/views/rings.tsx`, `tests/view-rings.test.ts`
**Rows:** desktop 2, terminal 1.
**Design (spec §6):** cache, context, 5h and 7d each get a ring with the value over the label; on 5h and 7d a dot marks the window gone; the cost has no ring; the terminal draws a meter, the value and the label. Escalation: the ring and label turn amber, and the label says why. Give-way: labels shorten to names, reset text, 7d, the cost, context; then, by the narrow-width ruling, the marks (`marks`). Expanded: four panels, each with a 64 px ring and its facts.
**E fixes:** `resetText` is its own step, not tied to `labelsLong`; the expanded view shows the 7d ring; no `concat`; context that isn't reported shows `EMPTY.context`, never `in context 0`.

**Rulings (record both in the ledger):**
- **The spend donut** is drawn as its split bar, a meter per part: `ring` draws one value, and spec §3.1 allows "a donut becomes the split bar".
- **The nested 7d ring** stands beside the 5h ring: `ring` draws one window, and nesting would need a second arc in one Svg.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-rings.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown, svgsOf } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('rings')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'rings', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
const ringAlts = (tree: unknown) => svgsOf(tree).filter(n => /<circle/.test(String(n.props?.source))).map(n => String(n.props?.alt).split(' ')[0])

test('the desktop draws a ring per reading, and none for the cost', async ($, on) => {
  expect(ringAlts((await at($, on, 'calm', D160)).shut)).toEqual(['cache', 'context', '5h', '7d'])
})
test('the terminal shows a meter, the value and the label on one row', async ($, on) => {
  expect(shown((await at($, on, 'calm')).shut)).toMatch(/█+░*\s*1h 00m\s*cache/)
})
test('amber makes the label the reason', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fiveHourAhead')).shut)).toMatch(/! 5h full in ~/)
})
test('open, the limits panel shows the 7d ring beside the 5h', async ($, on) => {
  expect(ringAlts((await at($, on, 'calm', D160)).open).filter(a => a === '7d').length).toBeGreaterThanOrEqual(2)
})
test('open with no context, it says so and never "in context 0"', async ($, on) => {
  const t = shown((await at($, on, 'warming')).open)
  expect(t).toMatch(/CONTEXT\s*not reported/)
  expect(t).not.toMatch(/in context 0/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-rings`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/rings.tsx`**

```tsx
// rings: a small ring per reading, its value over its label beside it; on a
// limit, a dot marks how much of the window has gone. The terminal draws a
// meter, the value and the label on one line.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, ring } from '../charts'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY, type Amber } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way, first to last; `marks` is the narrow-width ruling's. Amber never does. */
const ORDER = ['labelsLong', 'resetText', 'calmSeven', 'cost', 'calmContext', 'marks'] as const
type Piece = (typeof ORDER)[number]
const RING_PX = 26
const BIG_PX = 64

/** A collapsed unit: its ring and value built once; its label chosen by the squeeze. */
type Unit = Readonly<{ key: string; mark: RenderChildren; value: RenderElement; amber: Amber | undefined; label: (keeps: Keeps<Piece>) => string }>

const drawUnit = (kit: Kit, u: Unit, keeps: Keeps<Piece>): RenderElement => {
  const { Box, Svg } = kit
  const label = words(kit, 'l', u.amber !== undefined ? [[keeps.amber(u.amber), 'amber']] : [[u.label(keeps), 'label']])
  // The desktop puts the value over its label; the terminal, side by side.
  const said = Svg
    ? <Box key="t" flexDirection="column">{u.value}{label}</Box>
    : <Box key="t" flexDirection="row" columnGap={1}>{u.value}{label}</Box>
  const mark = (u.amber !== undefined ? beforeLast(keeps) : keeps.has('marks')) ? u.mark : null
  return <Box key={u.key} flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>{mark}{said}</Box>
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  const value = (text: string, amber: boolean) => words(kit, 'v', [[text, amber ? 'amber' : 'value']], true)
  const mark = (alt: string, frac: number, color: string, amber: boolean, dot?: number) => ring(kit, { key: 'ring', alt, frac, color: amber ? p.amberFg : color, px: RING_PX, dot })
  const cache: Unit = {
    key: 'cache',
    mark: mark(c.alt, c.charge, p.warm, c.amber !== undefined),
    value: value(c.leftShort || c.value, c.amber !== undefined),
    amber: c.amber,
    label: keeps => (!keeps.has('labelsLong') ? 'cache' : c.condition === 'cold' ? `re-warm ${c.estimate}` : `cache ${c.condition}`),
  }
  const context: Unit | undefined = !x.known ? undefined : {
    key: 'ctx',
    mark: mark(x.alt, x.frac, p.meterFill, x.amber !== undefined),
    value: value(x.valueText, x.amber !== undefined),
    amber: x.amber,
    label: keeps => (keeps.has('labelsLong') ? 'context' : 'ctx'),
  }
  const limit = (l: LimitView): Unit => ({
    key: l.name,
    mark: mark(l.alt, l.frac, accentOf(kit, l), l.amber !== undefined, l.gone),
    value: value(l.passed ? 'reset' : l.value, l.amber !== undefined),
    amber: l.amber,
    // The reset is its own step: it gives way after the long labels, whatever they say.
    label: keeps => `${keeps.has('labelsLong') ? `${l.name} limit` : l.name}${keeps.has('resetText') && l.resetGlyph !== undefined ? ` ${l.resetGlyph}` : ''}`,
  })
  const five = read.fiveHour === undefined ? undefined : limit(read.fiveHour)
  const seven = read.sevenDay === undefined ? undefined : limit(read.sevenDay)
  const cost: Unit = { key: 'cost', mark: null, value: value(read.spend.totalText, false), amber: undefined, label: () => 'this session' }
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps =>
      line(kit, 'line', [
        drawUnit(kit, cache, keeps),
        context !== undefined && keeps.calm('calmContext', x.tone) ? drawUnit(kit, context, keeps) : null,
        five === undefined ? null : drawUnit(kit, five, keeps),
        seven !== undefined && read.sevenDay !== undefined && keeps.calm('calmSeven', read.sevenDay.tone) ? drawUnit(kit, seven, keeps) : null,
        keeps.has('cost') ? drawUnit(kit, cost, keeps) : null,
      ], toggle, 3),
    ),
  ]
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const c = read.cache
  const x = read.context
  const s = read.spend
  const room = gridRoom(kit, bodyRows)
  // A 64 px ring takes three rows on the desktop, one meter line on the terminal.
  const ringRows = kit.Svg ? 3 : 1
  const big = (key: string, alt: string, frac: number, color: string, centre?: string, dot?: number) => ring(kit, { key, alt, frac, color, px: BIG_PX, centre, dot })
  const SPLIT = [p.meterFill, p.label, p.value] as const
  const none = (text: string) => words(kit, 'none', [[text, 'label']])
  const five = read.fiveHour
  const seven = read.sevenDay
  const limitRings = five === undefined && seven === undefined ? null : (
    <Box key="rings" flexDirection="row" columnGap={1}>
      {five === undefined ? null : big('5h', five.alt, five.frac, accentOf(kit, five), five.value, five.gone)}
      {seven === undefined ? null : big('7d', seven.alt, seven.frac, accentOf(kit, seven), seven.value, seven.gone)}
    </Box>
  )
  return grid(kit, [
    section(kit, 'cache', 'CACHE', chartsIfRoom(room, [big('ring', c.alt, c.charge, p.warm, c.leftShort === '' ? undefined : c.leftShort)], [
      c.reWarmText === undefined ? null : words(kit, 'rewarm', [[c.reWarmText, 'value']]),
      fact(kit, 'saved', 'saved', c.savedText),
      fact(kit, 'hit', 'hit rate', c.hitText),
      fact(kit, 'lasts', 'lasts', c.lastsText),
    ], ringRows), room),
    // The donut, as its split bar: a meter per part (ruling above).
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, s.split.map((part, i) => meter(kit, { key: `split${i}`, label: part.label, frac: part.frac, tone: 'calm', accent: SPLIT[i] ?? p.meterFill })), [
      fact(kit, 'total', 'session', s.totalText),
      fact(kit, 'last', 'last message', s.lastText),
      ...s.split.map(part => fact(kit, part.label, part.label, part.text)),
    ]), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : chartsIfRoom(room, [big('ring', x.alt, x.frac, p.meterFill, x.valueText)], [
      fact(kit, 'in', 'in context', x.inContextText),
      fact(kit, 'at', 'compacts at', x.compactsAtText),
      fact(kit, 'room', 'room', x.roomText),
    ], ringRows), room),
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [none(EMPTY.limits)] : chartsIfRoom(room, [limitRings], read.limits.map(l => {
      const tail = [l.resetGlyph, l.pace].filter((t): t is string => t !== undefined && t !== '')
      return words(kit, l.name, l.amber !== undefined ? [[l.amber.long, 'amber']] : [...l.say, ...tail.map(t => [` · ${t}`, 'label'] as const)])
    }), ringRows), room),
  ], bodyRows)
}

export const ringsView = defineView('rings', { desktop: 2, terminal: 1 }, lines, body)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-rings`, then the gates and the view grep gate. Record the two rulings and `marks` in the ledger.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/rings.tsx plugins/session-usage-band/tests/view-rings.test.ts
git commit -m "feat: the rings layout, a ring per reading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: `departures`

**Files:** `hooks/views/departures.tsx`, `tests/view-departures.test.ts`
**Rows:** desktop 1, terminal 1.
**Design (spec §6):** `CACHE · DEPARTS 14:32 · IN 52 MIN`, then `5H · 4% · ~10% AT ↻`, then `7D · 30%`, then `$3.19`, then ▿. Cache statuses: `DEPARTS hh:mm`; `LAST CALL` with `47s` and `RE-WARM ~$1.66` (amber); `DEPARTED hh:mm` with `RE-WARM ~$1.66`; `BOARDING`, with no time, while Claude works. Limit statuses: `~X% AT ↻` calm; `! NEAR LIMIT` or `! FULL ~14:20` amber. Give-way: the 5h projection, `IN 52 MIN`, 7d, then 5h becomes `5H 4%`. Expanded: a header of flaps from the workspace, then the board, ITEM · STATUS · TIME · REMARKS, with CACHE, CONTEXT, 5H, 7D, SPEND and `otherLimits`; REMARKS truncates first.
**E fixes:** an amber-only context flap (`! COMPACTS IN ~12K` / `! CONTEXT 85%`), never in `ORDER`; the expanded context status is `context.boardAmber`; the header and columns are fixed-width Boxes; every coloured word is in an on-flap ink (Task 12).

**Ruling: the board's flap padding.** A flap is padded on the desktop only. On the terminal the 1-column gap between flaps shows the ground between cells, so the line fits 40 columns. Record it in the ledger.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-departures.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('departures')

const T160: Mount = { surface: 'terminal', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'departures', scenario, appearance: 'dark', ttl }, [m])
  return { shut: shown(trees[caseKey(m, 'shut')]), open: shown(trees[caseKey(m, 'open')]) }
}

test('warm, the cache departs in minutes, never "52M"', async ($, on) => {
  const t = (await at($, on, 'calm')).shut
  expect(t).toMatch(/CACHE\s*DEPARTS(\s*\d{2}:\d{2})?\s*IN 1H 00 MIN/)
  expect(t).not.toMatch(/\b\d+M\b/)
})
test('the last minute is LAST CALL, with the price and no "send"', LONG, async ($, on) => {
  const t = (await at($, on, 'lastMinute', T160, '5m')).shut
  expect(t).toMatch(/LAST CALL\s*30s\s*RE-WARM ~\$/)
  expect(t).not.toMatch(/send|keep warm/i)
})
test('cold, it has departed and names the re-warm', LONG, async ($, on) => {
  expect((await at($, on, 'cold', T160, '5m')).shut).toMatch(/DEPARTED(\s*\d{2}:\d{2})?\s*RE-WARM ~\$/)
})
test('working, it is boarding with no time', async ($, on) => {
  expect((await at($, on, 'working')).shut).toMatch(/CACHE\s*BOARDING/)
})
test('a measured fill is ! FULL', LONG, async ($, on) => {
  expect((await at($, on, 'fiveHourAhead')).shut).toMatch(/! FULL/)
})
test('82% is ! NEAR LIMIT', async ($, on) => {
  expect((await at($, on, 'limit80')).shut).toMatch(/! NEAR LIMIT/)
})
test('context near compaction gets a flap of its own', async ($, on) => {
  expect((await at($, on, 'nearCompaction')).shut).toMatch(/! COMPACTS IN ~10K/)
})
test('open, the board has its header and every row', async ($, on) => {
  const t = (await at($, on, 'calm')).open
  expect(t).toMatch(/ITEM\s*STATUS\s*TIME\s*REMARKS/)
  for (const item of ['CACHE', 'CONTEXT', '5H', '7D', 'SPEND']) expect(t).toContain(item)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-departures`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/departures.tsx`**

```tsx
// departures: a split-flap board. The cache is a flight that departs; its
// last minute is LAST CALL, said with its price and nothing more. The board
// speaks in capitals: this view upper-cases whole phrases from the readings,
// its own style, and never takes one apart.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton, type Strip } from './frame'
import { beforeLast, fitLine, line, lineRoom, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way, first to last. Amber never does. */
const ORDER = ['fiveProjection', 'boardMinutes', 'calmSeven', 'calmFiveGroup'] as const
type Piece = (typeof ORDER)[number]
type Ink = 'text' | 'dim' | 'warm' | 'amber' | 'five' | 'week' | 'coin'
/** The board's fixed columns, ITEM, STATUS and TIME; REMARKS takes the rest and truncates first. */
const COLUMNS = [10, 18, 14] as const
const up = (s: string): string => s.toUpperCase()

/** One flap: the flap ground, and an ink made for it. */
const flap = (kit: Kit, key: string, text: string, ink: Ink = 'text'): RenderElement => {
  const { Box, Text, Svg, palette: p } = kit
  const color: Readonly<Record<Ink, string>> = { text: p.flapText, dim: p.flapDim, warm: p.flapWarm, amber: p.flapAmber, five: p.flapFive, week: p.flapWeek, coin: p.flapCoin }
  return (
    <Box key={key} flexShrink={0} paddingX={Svg ? 1 : 0} {...(p.filled ? { backgroundColor: p.flap } : {})}>
      <Text color={color[ink]} bold wrap="truncate-end">{text}</Text>
    </Box>
  )
}
const group = (kit: Kit, key: string, flaps: readonly RenderChildren[]): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>{flaps}</Box>
}

/** The cache's status: its board word, with its clock time when known. */
const statusOf = (read: Readings): string => {
  const c = read.cache
  if (c.board === 'DEPARTS' && c.coldAtClock !== undefined) return `DEPARTS ${c.coldAtClock}`
  if (c.board === 'DEPARTED' && c.coldSinceClock !== undefined) return `DEPARTED ${c.coldSinceClock}`
  return c.board
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const c = read.cache
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  // Built once; the squeeze only chooses among them.
  const label = flap(kit, 'c', 'CACHE')
  const status = flap(kit, 's', statusOf(read), c.amber !== undefined ? 'amber' : c.board === 'DEPARTS' || c.board === 'BOARDING' ? 'warm' : 'dim')
  const left = c.boardLeft === '' ? null : flap(kit, 't', c.boardLeft, c.amber !== undefined ? 'amber' : 'text')
  const reWarm = c.condition === 'cooling' || c.condition === 'cold' ? flap(kit, 'r', `RE-WARM ${up(c.estimate)}`, c.amber !== undefined ? 'dim' : 'text') : null
  const cacheFlaps = (keeps: Keeps<Piece>): RenderChildren[] =>
    c.amber !== undefined
      ? [label, status, left, beforeLast(keeps) ? reWarm : null]
      : c.board === 'DEPARTS'
        ? [label, status, keeps.has('boardMinutes') || c.coldAtClock === undefined ? left : null]
        : [label, status, reWarm]
  const limit = (l: LimitView, ink: 'five' | 'week') => {
    const name = flap(kit, 'n', up(l.name), ink)
    const value = flap(kit, 'v', l.passed ? 'RESET' : l.value)
    const status = l.boardAmber !== undefined ? flap(kit, 's', l.boardAmber, 'amber') : !l.passed && l.boardShort !== undefined ? flap(kit, 's', l.boardShort, 'dim') : null
    return {
      amber: l.amber !== undefined,
      full: group(kit, l.name, [name, value, status]),
      bare: group(kit, l.name, [name, value, l.amber !== undefined ? status : null]),
      short: group(kit, l.name, [flap(kit, 'n', `${up(l.name)} ${l.passed ? 'RESET' : l.value}`, ink)]),
    }
  }
  const five = read.fiveHour === undefined ? undefined : limit(read.fiveHour, 'five')
  const seven = read.sevenDay === undefined ? undefined : limit(read.sevenDay, 'week')
  // The board shows no context, so its trigger gets an amber flap of its own.
  const contextAmber = x.boardAmber === undefined ? null : group(kit, 'ctx', [flap(kit, 'a', x.boardAmber, 'amber')])
  const cost = group(kit, 'cost', [flap(kit, 'v', read.spend.totalText, 'coin')])
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps =>
      line(kit, 'line', [
        group(kit, 'cache', cacheFlaps(keeps)),
        five === undefined ? null : five.amber || keeps.has('calmFiveGroup') ? (keeps.has('fiveProjection') ? five.full : five.bare) : five.short,
        seven === undefined ? null : seven.amber || keeps.has('calmSeven') ? seven.bare : null,
        contextAmber,
        cost,
      ], toggle, 1),
    ),
  ]
}

/** One board row: three fixed columns, then REMARKS. */
const boardRow = (kit: Kit, key: string, cells: readonly [RenderElement, RenderElement, RenderElement, RenderElement]): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="row" columnGap={1}>
      <Box key="a" width={COLUMNS[0]} flexShrink={0}>{cells[0]}</Box>
      <Box key="b" width={COLUMNS[1]} flexShrink={0}>{cells[1]}</Box>
      <Box key="c" width={COLUMNS[2]} flexShrink={0}>{cells[2]}</Box>
      <Box key="d" flexGrow={1} width={0} minWidth={0} overflow="hidden">{cells[3]}</Box>
    </Box>
  )
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const c = read.cache
  const x = read.context
  const s = read.spend
  const head = (t: string) => words(kit, t, [[t, 'label']], true)
  const row = (key: string, item: string, status: string, ink: Ink, time: string, remarks: string) =>
    boardRow(kit, key, [flap(kit, 'i', item), flap(kit, 's', status, ink), flap(kit, 't', time), flap(kit, 'r', remarks, 'dim')])
  const limitRow = (l: LimitView) =>
    row(
      l.name,
      up(l.name),
      l.boardAmber ?? l.boardShort ?? l.value,
      l.boardAmber !== undefined ? 'amber' : 'text',
      l.resetClock !== undefined ? `↻ ${l.resetClock}` : l.resetGlyph !== undefined ? up(l.resetGlyph) : '–',
      up(l.projectedText === undefined ? `${l.value} now` : `${l.value} now · ${l.projectedText} at reset`),
    )
  const rows: RenderElement[] = [
    row('cache', 'CACHE', statusOf(read), c.amber !== undefined ? 'amber' : 'text', c.boardLeft === '' ? '–' : c.boardLeft, c.savedText === undefined ? `RE-WARM ${up(c.estimate)}` : `RE-WARM ${up(c.estimate)} · SAVED ${up(c.savedText)}`),
    x.known
      ? row('ctx', 'CONTEXT', x.boardAmber ?? up(`${x.valueText} ${x.towardText}`), x.boardAmber !== undefined ? 'amber' : 'text', up(`${x.inContextText} of ${x.windowText}`), x.compactsAtText === undefined ? 'NO AUTO-COMPACTION' : up(`compacts at ${x.compactsAtText} · room ${x.roomText ?? '–'}`))
      : row('ctx', 'CONTEXT', up(EMPTY.context), 'dim', '–', '–'),
    ...read.limits.filter(l => l.key !== 'other').map(limitRow),
    ...(read.limits.length === 0 ? [row('limits', 'LIMITS', up(EMPTY.limits), 'dim', '–', '–')] : []),
    row('spend', 'SPEND', s.totalText, 'text', s.lastText === undefined ? '–' : `LAST ${s.lastText}`, up(`${s.tokensText} tokens`)),
    ...read.limits.filter(l => l.key === 'other').map(limitRow),
  ]
  return [boardRow(kit, 'head', [head('ITEM'), head('STATUS'), head('TIME'), head('REMARKS')]), ...rows.slice(0, Math.max(0, bodyRows - 1))]
}

/** The board's header: the workspace, on a flap. */
const strip: Strip = (kit, read) => {
  const { Box } = kit
  return read.workspaceText === undefined ? null : (
    <Box key="strip" flexGrow={1} width={0} minWidth={0} overflow="hidden">{flap(kit, 'workspace', read.workspaceText, 'dim')}</Box>
  )
}

export const departuresView = defineView('departures', { desktop: 1, terminal: 1 }, lines, body, strip)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-departures`, then the gates and the view grep gate. Record the padding ruling.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/departures.tsx plugins/session-usage-band/tests/view-departures.test.ts
git commit -m "feat: the departures layout, a split-flap board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: `forecast`

**Files:** `hooks/views/forecast.tsx`, `tests/view-forecast.test.ts`
**Rows:** desktop 2, terminal 1.
**Design (spec §6):** now, plus at most three events in time order: cold; `! 5h full` when the pace fills; 5h resets; 7d resets, only within 24 h. Each column has a time and condition (`now · warm`, `14:32 · cold`), with a detail row on the desktop (`52m left`, `re-warm ~$1.66`). Only the next event shows "in Xm". The terminal is one row of columns split by `│`. Escalation: now becomes `! cooling · 47s left`; `! 5h full` is placed in time order, as `~14:20 · ! 5h full`. Give-way: far events, 7d first; the "in Xm"; the desktop detail shortens (it never goes, so the desktop keeps its two rows). Expanded: an outlook row for each of Cache, Context, 5h, 7d, Spend and `otherLimits`: the value now, a range bar to where it lands, and the outcome in words.
**E and F fixes:** amber-only pieces for context and for a limit at 80%; the icon and the head share a row Box; `eventsOf` is built once, before `fitLine`; Context and Limits rows stay, with `EMPTY.*`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-forecast.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { LONG, shown } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('forecast')

const T160: Mount = { surface: 'terminal', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'forecast', scenario, appearance: 'dark', ttl }, [m])
  return { shut: shown(trees[caseKey(m, 'shut')]), open: shown(trees[caseKey(m, 'open')]) }
}

test('now, then events in time order, at most three', async ($, on) => {
  const t = (await at($, on, 'calm')).shut
  expect(t).toMatch(/now\s*·\s*warm/)
  expect(t.indexOf('cold')).toBeLessThan(t.indexOf('5h resets'))
  expect((t.match(/│/g) ?? []).length).toBeLessThanOrEqual(3)
})
test('the last minute is "! cooling" with seconds', LONG, async ($, on) => {
  expect((await at($, on, 'lastMinute', T160, '5m')).shut).toMatch(/! cooling · 30s left/)
})
test('a measured fill is an event before the reset', LONG, async ($, on) => {
  const t = (await at($, on, 'fiveHourAhead')).shut
  expect(t).toMatch(/~\S+\s*·\s*! 5h full/)
  expect(t.indexOf('! 5h full')).toBeLessThan(t.indexOf('5h resets'))
})
test('a limit at 80% speaks, though it is no event', async ($, on) => {
  expect((await at($, on, 'limit80')).shut).toMatch(/! 5h 82%/)
})
test('context near compaction speaks', async ($, on) => {
  expect((await at($, on, 'nearCompaction')).shut).toMatch(/! context 94% · compacts in ~10k|! ctx 94%/)
})
test('no weather glyphs in the terminal: the words carry it', async ($, on) => {
  expect((await at($, on, 'calm')).shut).not.toMatch(/[☼☁❄✱◐]/)
})
test('open, every outlook row stays, the empty ones in words', async ($, on) => {
  const t = (await at($, on, 'warming')).open
  expect(t).toMatch(/Context\s*not reported/)
  expect(t).toMatch(/Limits\s*none reported/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-forecast`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/forecast.tsx`**

```tsx
// forecast: read like the weather: now, then each change at its clock time.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Kit } from '../kit'
import type { BarSize } from '../layout'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton } from './frame'
import { accentOf, fitLine, line, lineRoom, words } from './parts'
import { defineView } from './view'

/** What gives way, first to last. Amber never does. */
const ORDER = ['farSeven', 'farEvents', 'inX', 'detail'] as const
const DAY_MS = 24 * 3600_000
const OUTLOOK: BarSize = { px: 200, cells: 20 }

type Event = Readonly<{ key: string; at: number; time: string; label: string; detail: string; detailShort: string; amber: boolean; seven: boolean }>

/** The changes ahead, soonest first, three at most. */
const eventsOf = (read: Readings): Event[] => {
  const c = read.cache
  const f = read.fiveHour
  const w = read.sevenDay
  const out: Event[] = []
  if (c.coldInMs !== undefined) out.push({ key: 'cold', at: c.coldInMs, time: c.coldAtClock ?? `in ${c.leftShort}`, label: 'cold', detail: `re-warm ${c.estimate}`, detailShort: c.estimate, amber: false, seven: false })
  if (f !== undefined && f.etaMs !== null && f.fullIn !== undefined) out.push({ key: 'full', at: f.etaMs, time: f.fullAtClock ?? `in ${f.fullIn}`, label: '! 5h full', detail: 'at this pace', detailShort: 'pace', amber: true, seven: false })
  if (f?.resetInMs !== undefined) out.push({ key: '5r', at: f.resetInMs, time: f.resetClock ?? f.resetGlyph ?? '', label: '5h resets', detail: `from ${f.value}`, detailShort: f.value, amber: false, seven: false })
  if (w?.resetInMs !== undefined && w.resetInMs <= DAY_MS) out.push({ key: '7r', at: w.resetInMs, time: w.resetClock ?? w.resetGlyph ?? '', label: '7d resets', detail: `from ${w.value}`, detailShort: w.value, amber: false, seven: true })
  return out.sort((a, b) => a.at - b.at).slice(0, 3)
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg, icon, palette: p } = kit
  const c = read.cache
  const x = read.context
  // Built once: the events, the toggle, the separators and the icon.
  const events = eventsOf(read)
  const toggle = toggleButton(kit, read, act)
  const seps = [0, 1, 2, 3, 4, 5].map(i => words(kit, `sep${i}`, [['│', 'label']]))
  const nowIcon = Svg ? icon(c.condition === 'cooling' ? 'cloud' : c.condition === 'cold' ? 'snow' : 'sun', c.amber !== undefined ? p.amberFg : p.warm) : []
  /** A column: on the desktop a head row (icon and words together) over its detail; on the terminal, the head alone. */
  const column = (key: string, head: RenderElement, iconed: boolean, detail: string): RenderElement =>
    Svg ? (
      <Box key={key} flexDirection="column" flexShrink={0}>
        <Box key="head" flexDirection="row">{iconed ? nowIcon : null}{head}</Box>
        {words(kit, 'd', [[detail, 'label']])}
      </Box>
    ) : (
      <Box key={key} flexDirection="row" flexShrink={0}>{head}</Box>
    )
  const calmNow = words(kit, 'h', [['now · ', 'label'], [c.condition, 'value']])
  const nowDetail = c.left !== '' ? c.left : c.condition === 'cold' ? `re-warm ${c.estimate}` : (c.reWarmText ?? 'no countdown yet')
  const nowDetailShort = c.leftShort !== '' ? c.leftShort : c.estimate
  // Neither is an event, so each trigger gets an amber piece of its own.
  const extras = [x.amber, read.fiveHour?.etaMs === null ? read.fiveHour.amber : undefined, read.sevenDay?.amber].filter((a): a is NonNullable<typeof a> => a !== undefined)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const kept = events.filter((e, i) => e.amber || i === 0 || keeps.has(e.seven ? 'farSeven' : 'farEvents'))
      const head = c.amber !== undefined ? words(kit, 'h', [[keeps.amber({ long: `! cooling · ${c.left}`, short: c.amber.short }), 'amber']]) : calmNow
      const pieces: RenderChildren[] = [column('now', head, true, c.amber !== undefined ? `re-warm ${c.estimate}` : keeps.has('detail') ? nowDetail : nowDetailShort)]
      kept.forEach((e, i) => {
        // Only the next event says how far off it is.
        const time = i === 0 && e.key === 'cold' && keeps.has('inX') && c.coldAtClock !== undefined ? `${e.time} · in ${c.leftShort}` : e.time
        pieces.push(seps[i] ?? null, column(e.key, words(kit, 'h', [[`${time} · `, e.amber ? 'amber' : 'label'], [e.label, e.amber ? 'amber' : 'value']]), false, keeps.has('detail') ? e.detail : e.detailShort))
      })
      extras.forEach((a, i) => pieces.push(seps[kept.length + i] ?? null, words(kit, `amber${i}`, [[keeps.amber(a), 'amber']])))
      return line(kit, 'line', pieces, toggle, 1)
    }),
  ]
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const c = read.cache
  const x = read.context
  const s = read.spend
  const row = (key: string, name: string, now: string, bar: RenderChildren, outcome: string, amber = false): RenderElement => (
    <Box key={key} flexDirection="row" columnGap={2}>
      <Box key="n" width={10} flexShrink={0}>{words(kit, 'n', [[name, amber ? 'amber' : 'value']], true)}</Box>
      <Box key="v" width={14} flexShrink={0}>{words(kit, 'v', [[now, amber ? 'amber' : 'value']])}</Box>
      {bar === null ? null : <Box key="b" flexShrink={0}>{bar}</Box>}
      {words(kit, 'o', [[outcome, 'label']])}
    </Box>
  )
  const limitRow = (l: LimitView) =>
    row(l.name, l.name, l.passed ? 'reset' : l.value, meter(kit, { key: 'b', label: l.name, frac: l.frac, tone: l.tone, accent: accentOf(kit, l), size: OUTLOOK, tick: l.gone, projectTo: l.projectedFrac }), [l.pace, l.resetClock === undefined ? l.resetGlyph : `↻ ${l.resetClock}`].filter((t): t is string => t !== undefined && t !== '').join(' · '), l.amber !== undefined)
  const rows: RenderElement[] = [
    row('cache', 'Cache', c.leftShort || c.value, meter(kit, { key: 'b', label: 'cache', frac: c.charge, tone: c.tone, accent: p.warm, size: OUTLOOK, reads: 'left' }), c.condition === 'cold' ? (c.reWarmText ?? c.estimate) : c.coldAtClock !== undefined ? `cold at ${c.coldAtClock}, then ${c.estimate}` : `then ${c.estimate}`, c.amber !== undefined),
    x.known
      ? row('ctx', 'Context', x.valueText, meter(kit, { key: 'b', label: 'context', frac: x.frac, tone: x.tone, accent: p.meterFill, size: OUTLOOK, projectTo: x.compactsAtText === undefined ? undefined : 1 }), x.compactsAtText === undefined ? 'no auto-compaction' : `compacts at ${x.compactsAtText}, ${x.roomText ?? ''} room`, x.amber !== undefined)
      : row('ctx', 'Context', EMPTY.context, null, ''),
    ...read.limits.filter(l => l.key !== 'other').map(limitRow),
    ...(read.limits.length === 0 ? [row('limits', 'Limits', EMPTY.limits, null, '')] : []),
    row('spend', 'Spend', s.totalText, null, s.lastText === undefined ? `${s.tokensText} tokens` : `last ${s.lastText} · ${s.tokensText} tokens`),
    ...read.limits.filter(l => l.key === 'other').map(limitRow),
  ]
  return rows.slice(0, Math.max(0, bodyRows))
}

export const forecastView = defineView('forecast', { desktop: 2, terminal: 1 }, lines, body)
```

The empty rows' outcome is `''`, an empty Text; it draws nothing and is never whitespace-only.

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-forecast`, then the gates and the view grep gate.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/forecast.tsx plugins/session-usage-band/tests/view-forecast.test.ts
git commit -m "feat: the forecast layout, now and each change ahead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 22: Merge P2

- [ ] **Step 1:** In each worktree, check `git diff --name-only feat/layouts...HEAD` lists exactly that view's two files. A third file means a frozen file changed: stop, and take it through Task 15b.
- [ ] **Step 2:** On `feat/layouts`, merge the views in order: tiles, gauges, rings, departures, forecast. For each, `git merge --no-ff layouts/<name> -m "merge: the <name> layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`, then run the full gates (validate, test, tsc) and the view grep gate.
- [ ] **Step 3:** Check golden is untouched: `git log --format=%h -- plugins/session-usage-band/tests/golden/chips.ts` shows only Task 2's commit.
- [ ] **Step 4:** Remove the worktrees with `git worktree remove .claude/worktrees/<name>` and the branches with `git branch -d layouts/<name>`. If permissions refuse either, ask the maintainer. Record the test count in the ledger and commit it:

```bash
git add design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "docs: the ledger after the P2 merges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Maintainer checkpoint 5.** Report the merges, the gates and the golden check, and wait for the sign-off.

---
## P3: Histories, then pulse and week (serial)

P3 runs on `feat/layouts`, one task at a time, so a task may change a shared file. Each such change is test first, and keeps golden green.

### Task 23: The conversation trails and re-warms

**Files:**
- Modify: `hooks/cache.ts` (`takeRebuilt`)
- Modify: `hooks/insights.ts` (the trails; `noteTurnEnd` returns what the turn cost)
- Modify: `hooks/register.tsx`
- Modify: `hooks/snapshot.ts` (`history`)
- Modify: `hooks/words.ts` (`historyWords`)
- Modify: `hooks/reading.ts` (`Readings.history`, a lazy getter)
- Modify: `tests/matrix.ts` (`snapOf` gains an empty `history`)
- Test: `tests/history.test.ts` (new), `tests/readings.test.ts`

**Interfaces:**
- **Produces:**

```ts
// insights.ts
export const COST_TRAIL = 24
export const CONTEXT_TRAIL = 40
export const FIVE_HOUR_TRAIL = 300
export type CostEntry = Readonly<{ usd: number; reWarm: boolean }>
export type TrailPoint = Readonly<{ at: number; pct: number }>
export type Trails = Readonly<{ costs: readonly CostEntry[]; context: readonly number[]; fiveHour: readonly TrailPoint[] }>
/** The trails, read-only: the arrays the push functions keep, passed by reference. */
export const trails: Trails
export const pushCost: (usd: number, reWarm: boolean) => void          // capped at COST_TRAIL
export const pushContext: (tokens: number) => void                     // capped at CONTEXT_TRAIL
export const noteFiveHourTrail: (now: number, pct: number) => void     // one a minute, the latest; 5 h and FIVE_HOUR_TRAIL at most
// noteTurnEnd(turnId, costUsd) now returns number | null: what the turn cost, when known and above zero
// cache.ts
/** Whether a main request rebuilt the cache since the last call (TTL run out, a miss, a compaction, a model switch); clears it. */
export const takeRebuilt: () => boolean
// snapshot.ts — BandSnapshot gains: history: Trails
// words.ts
export type HistoryWords = Readonly<{
  lastText: string | undefined; avgText: string | undefined; maxText: string | undefined   // '$0.21', '$0.18' (re-warms left out), '$0.84 re-warm'
  numbersText: string     // 'last $0.21 · avg $0.18 · max $0.84 re-warm'
  numbersShort: string    // 'last $0.21'
  costsAlt: string        // 'cost of the last 14 messages, steady' | '…, rising, the newest a re-warm'
  trailAlt: string        // '5h usage over the last hour, steady' | '…, rising, full in about 40 minutes'
}>
export const historyWords: (record: Trails, fiveHour: LimitView | undefined, now: number) => HistoryWords
// reading.ts
export type HistoryReading = Trails & HistoryWords & Readonly<{
  empty: boolean                     // no cost yet this conversation
  costValues: readonly number[]      // each message's cost, oldest first
  reWarms: readonly boolean[]        // which of them were re-warms
  fiveHourValues: readonly number[]  // the 5h trail's percentages
  fiveHourHour: readonly number[]    // the same over the last hour
}>
// Readings gains: readonly history: HistoryReading — a getter, built the first time a view reads it
```

**Why the 5h trail stays apart from the pace samples.** `insights.ts`' 30-minute pace samples are the evidence for `fiveHourEtaMs`: they start over when the reading drops or the window resets, and the ETA's rules depend on that. The trail is a five-hour record for drawing. Sharing one list would change what the ETA is computed from. The comment goes on `noteFiveHourTrail`.

**Why `takeRebuilt`.** A turn may make several requests, and the one that rebuilt the cache is usually the first. A flag that only the last request set would miss it, so `recordResponse` sets the flag and the turn takes it once.

- [ ] **Step 1: Write the failing tests**

The trails are module state, so they are tested as pure functions on this file's own copy of `insights.ts` and `cache.ts`. The drawn checks (a re-warm marked, `/clear` emptying the costs) come with pulse, in Task 25.

```ts
// tests/history.test.ts
import { test, expect } from 'claude-code/testing'
import { recordResponse, resetCache, takeRebuilt } from '../hooks/cache'
import { COST_TRAIL, CONTEXT_TRAIL, FIVE_HOUR_TRAIL, noteFiveHourTrail, pushContext, pushCost, resetConversationInsights, resetInsights, trails } from '../hooks/insights'
import { resp } from './helpers'

const MIN = 60_000
const HOUR = 60 * MIN

test('the cost trail keeps the last 24 messages', () => {
  resetInsights()
  for (let i = 0; i < 30; i++) pushCost(i, false)
  expect(trails.costs).toHaveLength(COST_TRAIL)
  expect([trails.costs[0]?.usd, trails.costs.at(-1)?.usd]).toEqual([6, 29])
})
test('the context trail keeps the last 40 turns', () => {
  resetInsights()
  for (let i = 0; i < 50; i++) pushContext(i * 1000)
  expect(trails.context).toHaveLength(CONTEXT_TRAIL)
})
test('the 5h trail keeps one reading a minute, the latest, over 5 hours at most', () => {
  resetInsights()
  noteFiveHourTrail(0, 1)
  noteFiveHourTrail(30_000, 2)
  expect(trails.fiveHour).toEqual([{ at: 30_000, pct: 2 }])
  for (let m = 1; m <= 400; m++) noteFiveHourTrail(m * MIN, m % 100)
  expect(trails.fiveHour.length).toBeLessThanOrEqual(FIVE_HOUR_TRAIL)
  expect(trails.fiveHour[0]?.at ?? 0).toBeGreaterThanOrEqual(400 * MIN - 5 * HOUR)
})
test('/clear empties the conversation trails and keeps the 5h one; a new session empties all', () => {
  resetInsights()
  pushCost(1, false)
  pushContext(1000)
  noteFiveHourTrail(0, 4)
  resetConversationInsights()
  expect([trails.costs.length, trails.context.length, trails.fiveHour.length]).toEqual([0, 0, 1])
  resetInsights()
  expect(trails.fiveHour).toHaveLength(0)
})
test('a request after the TTL ran out rebuilt the cache, and the turn takes the mark once', () => {
  resetCache()
  recordResponse(resp(41_000, 0, 155_000, 12_000), 0, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(false) // the first build is warming, not a re-warm
  recordResponse(resp(41_000, 0, 155_000, 12_000), 61 * MIN, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(true)
  expect(takeRebuilt()).toBe(false)
})
test('a warm read is no re-warm', () => {
  resetCache()
  recordResponse(resp(41_000, 0, 155_000, 12_000), 0, true, 'claude-opus-5-5')
  takeRebuilt()
  recordResponse(resp(2_000, 196_000, 4_000, 3_000), MIN, true, 'claude-opus-5-5')
  expect(takeRebuilt()).toBe(false)
})
```

Append to `tests/readings.test.ts`:

```ts
test('the history speaks its numbers and its trend', () => {
  const history = { costs: [{ usd: 0.2, reWarm: false }, { usd: 0.2, reWarm: false }, { usd: 0.84, reWarm: true }], context: [], fiveHour: [] }
  const hist = readingsOf(snapOf({ history })).history
  expect(hist.numbersText).toBe('last $0.84 · avg $0.20 · max $0.84 re-warm')
  expect(hist.numbersShort).toBe('last $0.84')
  expect(hist.costsAlt).toBe('cost of the last 3 messages, rising, the newest a re-warm')
  expect([hist.empty, readingsOf(snapOf()).history.empty]).toEqual([false, true])
})
test('the history is read only when a view asks for it', () => {
  expect(typeof Object.getOwnPropertyDescriptor(readingsOf(snapOf()), 'history')?.get).toBe('function')
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh history readings`. Expected: FAIL, because the exports are missing.
- [ ] **Step 3: Implement**
  - **`cache.ts`:** `CacheState` gains `lastRebuilt: boolean` (`false` in `INITIAL`). In `recordResponse`, for a main request, before `state.requests += 1`:

    ```ts
    // A rebuild of a cache that existed: its time ran out, it missed, a
    // compaction rebuilt it, or the model changed. The first build is warming.
    const missed = state.misses > missesBefore
    if (state.requests > 0 && (gap > TTL_MS[state.ttl] || missed || state.rebuilding || switched)) state.lastRebuilt = true
    ```

    with `const missesBefore = state.misses` read at the top of the main branch. Add:

    ```ts
    export const takeRebuilt = (): boolean => {
      const rebuilt = state.lastRebuilt
      state.lastRebuilt = false
      return rebuilt
    }
    ```
  - **`insights.ts`:**

    ```ts
    export const COST_TRAIL = 24
    export const CONTEXT_TRAIL = 40
    export const FIVE_HOUR_TRAIL = 300
    const FIVE_HOURS_MS = 5 * 3600_000

    const kept = { costs: [] as CostEntry[], context: [] as number[], fiveHour: [] as TrailPoint[] }
    export const trails: Trails = kept

    /** Keeps the newest `cap` of `list`, in place. */
    const capped = <T>(list: T[], cap: number): void => {
      if (list.length > cap) list.splice(0, list.length - cap)
    }
    export const pushCost = (usd: number, reWarm: boolean): void => {
      kept.costs.push({ usd, reWarm })
      capped(kept.costs, COST_TRAIL)
    }
    export const pushContext = (tokens: number): void => {
      kept.context.push(tokens)
      capped(kept.context, CONTEXT_TRAIL)
    }
    /** The 5h reading for the trail pulse draws: one a minute, the latest
     *  winning, five hours at most. Kept apart from the pace samples above,
     *  whose 30-minute window and restarts are the ETA's evidence. */
    export const noteFiveHourTrail = (now: number, pct: number): void => {
      const last = kept.fiveHour[kept.fiveHour.length - 1]
      if (last !== undefined && Math.floor(last.at / 60_000) === Math.floor(now / 60_000)) kept.fiveHour[kept.fiveHour.length - 1] = { at: now, pct }
      else kept.fiveHour.push({ at: now, pct })
      while ((kept.fiveHour[0]?.at ?? now) < now - FIVE_HOURS_MS) kept.fiveHour.shift()
      capped(kept.fiveHour, FIVE_HOUR_TRAIL)
    }
    ```

    `resetConversationInsights` also sets `kept.costs.length = 0` and `kept.context.length = 0`; `resetInsights` also sets `kept.fiveHour.length = 0`. `noteTurnEnd` returns `spent > 0 ? spent : null` where it sets `lastTurnUsd`, and `null` when it returns early.
  - **`register.tsx`:**
    - In `turn.complete`'s main-loop branch, read usage once (`const u = await $.session.usage().catch(() => undefined)`, `const cost = u?.cost?.usd`, in place of `ledgerUsd`), then:

      ```ts
      const spent = noteTurnEnd(e.turnId, cost)
      const reWarm = takeRebuilt()
      if (spent !== null) pushCost(spent, reWarm)
      const used = u === undefined ? undefined : contextUsed(u.context)
      if (used !== undefined) pushContext(used)
      ```
    - In `session.measure`, beside `noteFiveHour`: `noteFiveHourTrail(now, limit.percentUsed)`.
    - The snapshot gets `history: trails`, by reference.
  - **`snapshot.ts`:** `history: Trails`. **`tests/matrix.ts`:** `snapOf` gains `history: { costs: [], context: [], fiveHour: [] }`.
  - **`words.ts`:**

    ```ts
    export const historyWords = (record: Trails, fiveHour: LimitView | undefined, now: number): HistoryWords => {
      const last = record.costs[record.costs.length - 1]
      const warm = record.costs.filter(e => !e.reWarm)
      const avg = warm.length === 0 ? undefined : warm.reduce((sum, e) => sum + e.usd, 0) / warm.length
      const max = record.costs.reduce<CostEntry | undefined>((top, e) => (top === undefined || e.usd > top.usd ? e : top), undefined)
      const lastText = last === undefined ? undefined : fmtSmallCost(last.usd)
      const avgText = avg === undefined ? undefined : fmtSmallCost(avg)
      const maxText = max === undefined ? undefined : `${fmtSmallCost(max.usd)}${max.reWarm ? ' re-warm' : ''}`
      const trend = last === undefined || avg === undefined ? 'steady' : last.usd > avg * 1.5 ? 'rising' : last.usd < avg / 1.5 ? 'falling' : 'steady'
      const hour = record.fiveHour.filter(r => r.at >= now - 3600_000)
      const rise = hour.length < 2 ? 0 : (hour[hour.length - 1]?.pct ?? 0) - (hour[0]?.pct ?? 0)
      return {
        lastText, avgText, maxText,
        numbersText: [lastText && `last ${lastText}`, avgText && `avg ${avgText}`, maxText && `max ${maxText}`].filter(Boolean).join(' · '),
        numbersShort: lastText === undefined ? '' : `last ${lastText}`,
        costsAlt: `${record.costs.length === 1 ? 'cost of the last message' : `cost of the last ${record.costs.length} messages`}, ${trend}${last?.reWarm ? ', the newest a re-warm' : ''}`,
        trailAlt: `5h usage over the last hour, ${rise >= 2 ? 'rising' : 'steady'}${fiveHour !== undefined && fiveHour.etaMs !== null ? `, full in ${fmtEtaSpoken(fiveHour.etaMs)}` : ''}`,
      }
    }
    ```
  - **`reading.ts`:** a lazy getter in `readingsOf`'s returned literal, so chips never pays for it.

    **Ruling (F.4).** The getter maps the trails once per draw that reads `history` (pulse only), over at most 300 entries. That is a few microseconds, below anything the perf test can see, so the push functions don't keep parallel arrays. Task 28's profile revisits this only if pulse is over budget.

    The getter:

    ```ts
    let history: HistoryReading | undefined
    // … in the returned object:
    get history() {
      return (history ??= {
        ...snap.history,
        ...historyWords(snap.history, fiveHour, snap.now),
        empty: snap.history.costs.length === 0,
        costValues: snap.history.costs.map(e => e.usd),
        reWarms: snap.history.costs.map(e => e.reWarm),
        fiveHourValues: snap.history.fiveHour.map(r => r.pct),
        fiveHourHour: snap.history.fiveHour.filter(r => r.at >= snap.now - 3600_000).map(r => r.pct),
      })
    },
    ```

    where `fiveHour` and `sevenDay` are the composed `LimitView`s (`views.find(v => v.key === '5h')`, `'7d'`), both hoisted into `const`s; Task 24's `week` getter reads both.
- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh history readings 'golden-*'`, then the full suite. Golden is unchanged.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/history.test.ts plugins/session-usage-band/tests/readings.test.ts plugins/session-usage-band/tests/matrix.ts
git commit -m "feat: the band remembers each message's cost, the context and the 5h trend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: `limitSamples` and the calendar

**Files:**
- Modify: `hooks/memory.ts` (`Sample`, `MAX_SAMPLES`, `bucketOf`, `addSample`, `mergeSamples`, `asLimitSamples`, `sampleOf`)
- Create: `hooks/calendar.ts` (pure: `weekOf`)
- Modify: `hooks/register.tsx`
- Modify: `hooks/snapshot.ts` (`samples`)
- Modify: `hooks/words.ts` (`weekWords`)
- Modify: `hooks/reading.ts` (`Readings.week`, a lazy getter; re-exports `DayCell` and `HourCell`)
- Modify: `tests/matrix.ts` (`snapOf` gains `samples: []`)
- Test: `tests/calendar.test.ts` (new), `tests/history.test.ts`, `tests/readings.test.ts`

**Interfaces:**
- **Produces:**

```ts
// memory.ts
export type Sample = Readonly<{ at: number; fivePct: number; sevenPct: number; fiveResetAt: number; sevenResetAt: number }>
export const MAX_SAMPLES = 672
export const bucketOf: (at: number) => number                                   // its 15-minute bucket
/** Into the samples held in memory, in place: the last replaced when `s` is in its bucket, else
 *  appended (O(1)); only an out-of-order sample goes through mergeSamples. Capped. */
export const addSample: (samples: Sample[], s: Sample) => Sample[]
/** Two lists as one: one per bucket, the later winning, sorted, capped. */
export const mergeSamples: (a: readonly Sample[], b: readonly Sample[]) => Sample[]
export const asLimitSamples: (v: unknown) => Sample[]                           // the store is data, not trusted
export const sampleOf: (now: number, limits: ReadonlyArray<Readonly<{ kind: string; percentUsed: number; resetsAt?: string }>>) => Sample | undefined
// calendar.ts
export type DayCell = Readonly<{ initial: string; name: string; date: string; pct: number | undefined; text: string; guess: boolean; today: boolean; future: boolean; fullMark: boolean }>
export type HourCell = Readonly<{ label: string; pct: number | undefined; text: string; guess: boolean; now: boolean; future: boolean; fullMark: boolean }>
export type WindowNow = Readonly<{ percentUsed: number; projectedPct: number | undefined; resetsAt: number | undefined; fullAt?: number }>
export type Week = Readonly<{ days: readonly DayCell[]; hours: readonly HourCell[]; busiest: string | undefined }>
export const weekOf: (o: Readonly<{ samples: readonly Sample[]; seven: WindowNow | undefined; five: WindowNow | undefined; now: number; utcOffsetMin: number }>) => Week
// words.ts
export const weekWords: (w: Week, seven: LimitView | undefined, five: LimitView | undefined) => Readonly<{ daysAlt: string; hoursAlt: string; summary7: string | undefined; summary5: string | undefined }>
// reading.ts
export type { DayCell, HourCell } from './calendar'
export type WeekReading = Week & Readonly<{ empty: boolean; daysAlt: string; hoursAlt: string; summary7: string | undefined; summary5: string | undefined }>
// Readings gains: readonly week: WeekReading — a getter, built the first time a view reads it
// snapshot.ts — BandSnapshot gains: samples: readonly Sample[]
```

- **A cell's `text`:** `'6%'` when known, `'~7%'` for a guess, `''` when unknown. Views draw `text`, never round `pct`.
- **The days** are seven 24-hour slices of the 7d window, from `sevenResetAt − 7d`, each named by the local weekday of its start (with `utcOffsetMin`). **The hours** are the five hours before the 5h reset, labelled by their local clock hour (`'08'`).
- **A slice's `pct`** is the rise in that window's percentage from the last sample at or before the slice's start to the last sample inside it (up to now), using only samples whose reset matches the current window's within a minute. The first slice of a window starts from 0, the window's own start. With no sample at either end, it is unknown, never 0%.
- **Slices ahead** are guesses: `(projectedPct − percentUsed) / slicesLeft`, `guess: true`, drawn dashed. `fullMark` is on the first slice ahead where the running total passes 100, or, for the hours, on the slice that holds `fullAt` (a measured fill).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/calendar.test.ts
import { test, expect } from 'claude-code/testing'
import { MAX_SAMPLES, addSample, asLimitSamples, mergeSamples, sampleOf } from '../hooks/memory'
import { weekOf } from '../hooks/calendar'

const H = 3600_000
const T0 = Date.UTC(2026, 9, 6, 8, 40) // Tue 08:40 UTC, the 7d window's start
const s = (hours: number, seven: number, five = 0) => ({ at: T0 + hours * H, fivePct: five, sevenPct: seven, fiveResetAt: T0 + (Math.floor(hours / 5) + 1) * 5 * H, sevenResetAt: T0 + 168 * H })
const seven = (percentUsed: number, projectedPct: number) => ({ percentUsed, projectedPct, resetsAt: T0 + 168 * H })

test('one sample per 15-minute bucket, the latest winning, appended in place, capped', () => {
  const held = addSample([], s(0, 1))
  expect(addSample(held, { ...s(0, 2), at: T0 + 5 * 60_000 })).toBe(held)
  expect(held).toHaveLength(1)
  expect(held[0]?.sevenPct).toBe(2)
  let all = held
  for (let i = 1; i < 800; i++) all = addSample(all, s(i * 0.25, i % 100))
  expect(all.length).toBeLessThanOrEqual(MAX_SAMPLES)
  expect(JSON.stringify(all).length).toBeLessThan(75_000)
})
test('merging keeps one sample per bucket, the later winning, sorted', () => {
  expect(mergeSamples([s(0, 1), s(1, 2)], [{ ...s(0, 5), at: T0 + 60_000 }, s(0.5, 3)]).map(x => x.sevenPct)).toEqual([5, 3, 2])
})
test('the store is data, not trusted', () => {
  expect(asLimitSamples([s(0, 1), { at: 'x' }, null, 42])).toHaveLength(1)
  expect(asLimitSamples({})).toEqual([])
})
test('a sample needs both windows and their resets', () => {
  const both = [
    { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(T0 + 3 * H).toISOString() },
    { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(T0 + 67 * H).toISOString() },
  ]
  expect(sampleOf(T0, both)).toEqual({ at: T0, fivePct: 4, sevenPct: 30, fiveResetAt: T0 + 3 * H, sevenResetAt: T0 + 67 * H })
  expect(sampleOf(T0, both.slice(0, 1))).toBeUndefined()
})
test("a day cell is that day's rise in the weekly limit", () => {
  const wk = weekOf({ samples: [s(0, 0), s(15, 6), s(39, 15), s(63, 26), s(77, 30)], seven: seven(30, 50), five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.map(d => d.initial).join('')).toBe('TWTFSSM')
  expect(wk.days.slice(0, 4).map(d => d.text)).toEqual(['6%', '9%', '11%', '4%'])
  expect(wk.days[3]?.today).toBe(true)
  expect(wk.days.slice(4).every(d => d.future && d.guess)).toBe(true)
  expect(Math.abs((wk.days[4]?.pct ?? 0) - (50 - 30) / 3)).toBeLessThan(1e-5)
  expect(wk.days[4]?.text).toBe('~7%')
  expect(wk.busiest).toBe('Thu')
})
test('a sample from another window is ignored', () => {
  const stale = { ...s(10, 50), sevenResetAt: T0 - H }
  const wk = weekOf({ samples: [stale, s(0, 0), s(20, 5)], seven: seven(5, 20), five: undefined, now: T0 + 20 * H, utcOffsetMin: 0 })
  expect(Math.max(...wk.days.map(d => (d.guess ? 0 : (d.pct ?? 0))))).toBeLessThan(50)
})
test('no samples: every past cell is unknown, never 0%', () => {
  const wk = weekOf({ samples: [], seven: seven(30, 50), five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.slice(1, 4).every(d => d.pct === undefined && d.text === '')).toBe(true)
})
test('the hour cells are the five hours before the 5h reset, with the fill marked', () => {
  const five = { percentUsed: 40, projectedPct: 100, resetsAt: T0 + 5 * H, fullAt: T0 + 4.2 * H }
  const wk = weekOf({ samples: [s(0, 0, 0), s(0.9, 1, 10), s(1.9, 2, 25), s(2.4, 3, 40)], seven: undefined, five, now: T0 + 2.5 * H, utcOffsetMin: 0 })
  expect(wk.hours.map(c => c.label)).toEqual(['08', '09', '10', '11', '12'])
  expect(wk.hours.slice(0, 3).map(c => c.text)).toEqual(['10%', '15%', '15%'])
  expect(wk.hours[2]?.now).toBe(true)
  expect(wk.hours.findIndex(c => c.fullMark)).toBe(4)
})
```

Append to `tests/history.test.ts`. These drive the plugin, so they check what it writes and reads through the fake engine's counters:

```ts
import { HOUR_1, MIN as MINUTE, START, USAGE, engine, setup, turn, usage } from './helpers'
import { LONG } from './helpers'

const rising = (i: number) => {
  usage.current = { ...USAGE, rateLimits: [
    { kind: 'five_hour', percentUsed: 4 + i, resetsAt: new Date(3 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 30 + i, resetsAt: new Date(67 * 3600_000).toISOString() },
  ] }
}
test('samples are written once per new 15-minute bucket, the percentages rising', LONG, async ($, on) => {
  const clock = setup(on, { env: HOUR_1 })
  await $.session.start(START)
  for (let i = 0; i < 24; i++) {
    rising(i)
    await turn($, `t${i}`, 2.41 + i * 0.1, 2.51 + i * 0.1)
    await clock.advance(5 * MINUTE)
  }
  const writes = engine.storeSets.filter(k => k === 'limitSamples').length
  expect(writes).toBeGreaterThanOrEqual(8)
  expect(writes).toBeLessThanOrEqual(9)
})
test('a session reads the stored samples at start and at each new bucket, never within one', async ($, on) => {
  setup(on, { store: { limitSamples: [] } })
  await $.session.start(START)
  expect(engine.storeGets.filter(k => k === 'limitSamples')).toHaveLength(1)
  await turn($, 't1', 2.41, 2.5)
  await turn($, 't2', 2.5, 2.6)
  expect(engine.storeGets.filter(k => k === 'limitSamples')).toHaveLength(2)
})
test('a failing store never throws, and nothing is written', async ($, on) => {
  setup(on)
  engine.storeFails = true
  await $.session.start(START)
  await turn($, 't1', 2.41, 2.5)
  expect(engine.store.limitSamples).toBeUndefined()
})
```

Append to `tests/readings.test.ts`:

```ts
test('the week is read only when a view asks for it', () => {
  expect(typeof Object.getOwnPropertyDescriptor(readingsOf(snapOf()), 'week')?.get).toBe('function')
})
test('the week names its cells in words, for a reader and a summary', () => {
  const now = 77 * HOUR
  const T = (hours: number, seven: number) => ({ at: hours * HOUR, fivePct: 0, sevenPct: seven, fiveResetAt: 80 * HOUR, sevenResetAt: 168 * HOUR })
  const wk = readingsOf(snapOf({
    now, utcOffsetMin: 0,
    samples: [T(0, 0), T(15, 6), T(39, 15), T(63, 26), T(77, 30)],
    sevenDay: { percentUsed: 30, resetsAt: new Date(168 * HOUR).toISOString() },
  })).week
  expect(wk.empty).toBe(false)
  expect(wk.daysAlt).toMatch(/^weekly limit by day: \w+day 6%, \w+day 9%/)
  expect(wk.summary7).toMatch(/^30% used · on pace for ~\d+%/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh calendar history readings`. Expected: FAIL.
- [ ] **Step 3: Implement**
  - **`memory.ts`:**

    ```ts
    export const MAX_SAMPLES = 672
    const BUCKET_MS = 15 * 60_000
    export const bucketOf = (at: number): number => Math.floor(at / BUCKET_MS)

    export const mergeSamples = (a: readonly Sample[], b: readonly Sample[]): Sample[] => {
      const byBucket = new Map<number, Sample>()
      for (const s of [...a, ...b]) {
        const had = byBucket.get(bucketOf(s.at))
        if (had === undefined || s.at >= had.at) byBucket.set(bucketOf(s.at), s)
      }
      return [...byBucket.values()].sort((x, y) => x.at - y.at).slice(-MAX_SAMPLES)
    }

    export const addSample = (samples: Sample[], s: Sample): Sample[] => {
      const last = samples[samples.length - 1]
      if (last !== undefined && bucketOf(last.at) === bucketOf(s.at)) samples[samples.length - 1] = s
      else if (last === undefined || s.at > last.at) samples.push(s)
      else return mergeSamples(samples, [s])
      if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
      return samples
    }

    const isSample = (v: unknown): v is Sample =>
      isRecord(v) && (['at', 'fivePct', 'sevenPct', 'fiveResetAt', 'sevenResetAt'] as const).every(k => typeof v[k] === 'number' && Number.isFinite(v[k]))
    export const asLimitSamples = (v: unknown): Sample[] => (Array.isArray(v) ? mergeSamples([], v.filter(isSample)) : [])

    export const sampleOf = (now: number, limits: ReadonlyArray<Readonly<{ kind: string; percentUsed: number; resetsAt?: string }>>): Sample | undefined => {
      const five = limits.find(l => l.kind === 'five_hour')
      const seven = limits.find(l => l.kind === 'seven_day')
      const fiveResetAt = five?.resetsAt === undefined ? NaN : Date.parse(five.resetsAt)
      const sevenResetAt = seven?.resetsAt === undefined ? NaN : Date.parse(seven.resetsAt)
      if (five === undefined || seven === undefined || !Number.isFinite(fiveResetAt) || !Number.isFinite(sevenResetAt)) return undefined
      return { at: now, fivePct: five.percentUsed, sevenPct: seven.percentUsed, fiveResetAt, sevenResetAt }
    }
    ```
  - **`calendar.ts`:** `weekOf` as the bullets above define it. Its slicing, shared by days and hours:

    ```ts
    const SAME_RESET_MS = 60_000

    /** Each slice's rise in `pct`, from the window's own samples; undefined where unknown or ahead. */
    const risesOf = (samples: readonly Sample[], pct: (s: Sample) => number, reset: (s: Sample) => number, resetAt: number, start: number, len: number, count: number, now: number): Array<number | undefined> => {
      const own = samples.filter(s => Math.abs(reset(s) - resetAt) < SAME_RESET_MS)
      const lastAtOrBefore = (t: number) => own.reduce<Sample | undefined>((found, s) => (s.at <= t ? s : found), undefined)
      return Array.from({ length: count }, (_, i) => {
        const from = start + i * len
        if (from > now) return undefined
        const inside = own.reduce<Sample | undefined>((found, s) => (s.at > from && s.at < from + len && s.at <= now ? s : found), undefined)
        const before = lastAtOrBefore(from)
        // The window's first slice starts from 0, the window's own start.
        const base = before !== undefined ? pct(before) : i === 0 ? 0 : undefined
        if (inside === undefined || base === undefined) return undefined
        return Math.max(0, pct(inside) - base)
      })
    }
    ```

    The days call it with `pct = s => s.sevenPct`, `reset = s => s.sevenResetAt`, `start = resetsAt − 7d`, `len = 24h`, `count = 7`; the hours with the 5h fields, `start = resetsAt − 5h`, `len = 1h`, `count = 5`. Then each slice becomes a cell: `today`/`now` is the slice that holds now; `future` is a slice after it, with the guess; `text` is `` `${Math.round(pct)}%` ``, `` `~${Math.round(guess)}%` `` or `''`; `initial`, `name` and `date` come from the slice start shifted by `utcOffsetMin` (`getUTCDay`, `getUTCDate`); an hour's `label` is its local hour, two digits. `busiest` is the short name (`'Thu'`) of the largest known day. With no `seven` (or no reset), `days` is empty; with no `five`, `hours` is.
  - **`register.tsx`:**
    - `band` gains `samples: Sample[]`. At `session.start`: `band.samples = asLimitSamples(await $.store.get(LIMIT_SAMPLES_KEY).catch(() => undefined))`.
    - In `turn.complete`'s main-loop branch, with the usage read in Task 23:

      ```ts
      const sample = u === undefined ? undefined : sampleOf(await $.clock.now(), u.rateLimits)
      if (sample !== undefined) {
        const last = band.samples[band.samples.length - 1]
        if (last !== undefined && bucketOf(last.at) === bucketOf(sample.at)) {
          // The same bucket: memory only, no store I/O.
          band.samples = addSample(band.samples, sample)
        } else {
          // A new bucket: merge what other sessions wrote, add, write once.
          const stored = asLimitSamples(await $.store.get(LIMIT_SAMPLES_KEY).catch(() => undefined))
          band.samples = addSample(mergeSamples(band.samples, stored), sample)
          await $.store.set(LIMIT_SAMPLES_KEY, band.samples).catch(() => undefined)
        }
      }
      ```
    - The snapshot gets `samples: band.samples`, by reference.
  - **`snapshot.ts`:** `samples: readonly Sample[]`. **`tests/matrix.ts`:** `snapOf` gains `samples: []`.
  - **`words.ts`:** `weekWords` builds `daysAlt` (`'weekly limit by day: Tuesday 6%, Wednesday 9%, …'`, known days only, a guess said as `about 7%`), `hoursAlt` (`'5-hour limit by hour: 08:00 10%, …'`), and the summaries: `summary7` = `seven.value` + ` used`, then `seven.pace` with ` by ${resetClock}` when known, then `busiest ${busiest}`, joined by ` · ` (`'30% used · on pace for ~50% by Mon 08:40 · busiest Thu'`); `summary5` the same for 5h, without `busiest`.
  - **`reading.ts`:** a lazy getter beside `history`:

    ```ts
    let week: WeekReading | undefined
    // … in the returned object:
    get week() {
      if (week !== undefined) return week
      const windowOf = (l: LimitView | undefined): WindowNow | undefined =>
        l === undefined ? undefined : { percentUsed: l.percentUsed, projectedPct: l.projectedPct, resetsAt: l.resetInMs === undefined ? undefined : snap.now + l.resetInMs, fullAt: l.etaMs === null ? undefined : snap.now + l.etaMs }
      const w = weekOf({ samples: snap.samples, seven: windowOf(sevenDay), five: windowOf(fiveHour), now: snap.now, utcOffsetMin: snap.utcOffsetMin ?? 0 })
      const known = [...w.days, ...w.hours].some(c => !c.guess && c.pct !== undefined)
      return (week = { ...w, ...weekWords(w, sevenDay, fiveHour), empty: !known })
    },
    ```

    With the zone unknown, the cells use UTC; the README says so (Task 31).
- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh calendar history readings 'golden-*'`, then the full suite. Record the measured JSON size of 672 samples in the ledger.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/calendar.test.ts plugins/session-usage-band/tests/history.test.ts plugins/session-usage-band/tests/readings.test.ts plugins/session-usage-band/tests/matrix.ts
git commit -m "feat: the band keeps a week of limit samples, bounded, for the calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: `pulse`

**Files:** `hooks/views/pulse.tsx`, `tests/view-pulse.test.ts`
**Rows:** desktop 2, terminal 1.
**Design (spec §6):** the cache pill; the last 14 costs as bars (the newest in `value`, a re-warm capped and labelled) with the total and `last $0.21`; the 5h trail over the last hour, with its pace or the §2.2 words, and the reset; `context 38% · 7d 30%`; then ▿. The terminal draws braille beside the numbers. Escalation: the trail turns amber and gains a dashed projection. Give-way: context text, then 7d text; the reset; bars from 14 to 8; the trail becomes text; the bars become text; then, by the narrow-width ruling, the cost words (`costWords`: the empty sentence, or all three numbers, shorten) and the pace (`pace`). Expanded: cost per message (the last 24), the 5h window with a dashed projection, context over the conversation with the compaction line, and a cache panel.
**E and F fixes:** the pill is `layoutCachePill` (no `0:47`, no missing `! `); the charts are 36 px, so the desktop line is two rows, and the costs' total over its numbers keeps it two rows when the charts give way; the newest bar is drawn in `value`; the amber trail is gated by the amber step; the expanded view gains Spend, 7d and `otherLimits`; the pill, the numbers and both sizes of bars are built at most once; the history is `hist`, never `h`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-pulse.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { DARK } from '../hooks/palette'
import { CLEAR, LONG, MIN, START, mountBand, pacing, resp, respond, setup, shown, svgAlts, svgsOf, usage } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName, type Ttl } from './matrix'

viewSuite('pulse')

const T160: Mount = { surface: 'terminal', cols: 160 }
const D160: Mount = { surface: 'desktop', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName, m: Mount = T160, ttl: Ttl = '1h') => {
  const trees = await drawCases($, on, { layout: 'pulse', scenario, appearance: 'dark', ttl }, [m])
  return { shut: trees[caseKey(m, 'shut')], open: trees[caseKey(m, 'open')] }
}
/** One main-loop message with a request in it, the ledger moving from `from` to `to`. */
const message = async ($: Engine, id: string, from: number, to: number) => {
  usage.current = { ...usage.current, cost: { usd: from } }
  await $.turn.start({ text: 'hi', turnId: id })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  usage.current = { ...usage.current, cost: { usd: to } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer' })
}

test('the cost bars sit beside their numbers', LONG, async ($, on) => {
  expect(shown((await at($, on, 'fullHistory')).shut)).toMatch(/[⠀-⣿]+.*last \$\S+/)
})
test("no history yet says so, in the band's words", async ($, on) => {
  expect(shown((await at($, on, 'emptyHistory')).open)).toMatch(/Costs show after Claude's next reply\./)
})
test('the desktop draws the cost bars as an Svg with alt text, the newest in value', LONG, async ($, on) => {
  const bars = svgsOf((await at($, on, 'fullHistory', D160)).shut).find(n => /cost of the last/.test(String(n.props?.alt)))
  expect(bars).toBeDefined()
  expect(String(bars?.props?.source)).toMatch(new RegExp(`fill="${DARK.value}"`))
})
test('the desktop draws the 5h trail, amber and projected when the pace fills it', LONG, async ($, on) => {
  const trail = svgsOf((await at($, on, 'fiveHourAhead', D160)).shut).find(n => /5h usage over the last hour/.test(String(n.props?.alt)))
  expect(String(trail?.props?.source)).toMatch(/stroke-dasharray/)
})
test('in ascii the charts give way to numbers', LONG, async ($, on) => {
  const trees = await drawCases($, on, { layout: 'pulse', scenario: 'fullHistory', appearance: 'dark', env: { CC_BAND_GLYPHS: 'ascii' } }, [T160])
  const t = shown(trees[caseKey(T160, 'shut')])
  expect(t).toMatch(/last \$\S+ - avg \$\S+/)
  expect(t).not.toMatch(/[⠀-⣿]/)
})
test('a message after the cache went cold is marked a re-warm', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' }, env: { FORCE_PROMPT_CACHING_5M: '1' } })
  await $.session.start(START)
  await message($, 't1', 2.41, 2.62)
  await clock.advance(6 * MIN)
  await message($, 't2', 2.62, 3.1)
  const ui = await mountBand($, 'desktop', 160)
  expect(svgAlts(await ui.drawn()).some(a => /the newest a re-warm/.test(a))).toBe(true)
  await ui.unmount()
})
test('/clear empties the costs and keeps the 5h trail', LONG, async ($, on) => {
  const clock = setup(on, { store: { layout: 'pulse' } })
  await pacing($, clock)
  await message($, 't1', 2.41, 2.62)
  await $.session.end(CLEAR)
  const ui = await mountBand($, 'terminal', 160)
  expect(shown(await ui.drawn())).toMatch(/[⠀-⣿]+\s*! 5h/)
  await ui.press({ key: 'more' })
  expect(shown(await ui.drawn())).toMatch(/Costs show after Claude's next reply\./)
  await ui.unmount()
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-pulse`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/pulse.tsx`**

```tsx
// pulse: trends, not just totals: each message's cost, and which way the
// 5-hour limit is heading. In the ascii tier the charts give way to numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, sparkline } from '../charts'
import type { Kit } from '../kit'
import { SHORT_BELOW } from '../layout'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, chartsIfRoom, fact, fitLine, grid, gridRoom, layoutCachePill, line, lineRoom, section, words } from './parts'
import { defineView } from './view'

/** What gives way, first to last; `costWords` and `pace` are the narrow-width ruling's. Amber never does. */
const ORDER = ['calmContextText', 'calmSevenText', 'resetText', 'barsMany', 'trailChart', 'barsChart', 'costWords', 'pace'] as const
const BAR_PX = 6
/** Tall enough that the desktop line is two rows (24 px each, rounded). */
const CHART_PX = 36

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg, palette: p } = kit
  const hist = read.history
  const f = read.fiveHour
  const x = read.context
  const w = read.sevenDay
  // In the ascii tier braille would be dropped glyphs: the numbers stand alone.
  const charts = Svg !== undefined || read.frame.glyphs !== 'ascii'
  const toggle = toggleButton(kit, read, act)
  // Built at most once each, when first asked for.
  let pillLong: RenderElement | undefined
  let pillShort: RenderElement | undefined
  const pill = (short: boolean) => (short ? (pillShort ??= layoutCachePill(kit, read, true)) : (pillLong ??= layoutCachePill(kit, read, false)))
  let bars14: RenderChildren | undefined
  let bars8: RenderChildren | undefined
  const barsOf = (n: number): RenderChildren => {
    const values = hist.costValues.slice(-n)
    return barChart(kit, { key: 'bars', alt: hist.costsAlt, values, marked: hist.reWarms.slice(-n), color: p.meterFill, markColor: p.value, newestColor: p.value, px: values.length * BAR_PX, height: CHART_PX })
  }
  const bars = (many: boolean) => (many ? (bars14 ??= barsOf(14)) : (bars8 ??= barsOf(8)))
  const trail = f === undefined || hist.fiveHourHour.length < 2 ? null
    : sparkline(kit, { key: 'trail', alt: hist.trailAlt, values: hist.fiveHourHour, color: f.amber !== undefined ? p.amberFg : accentOf(kit, f), px: 92, height: CHART_PX, projectTo: f.amber !== undefined ? 1 : undefined })
  // The total over its numbers on the desktop, so the line stays two rows; beside them on the terminal.
  const stack = (top: RenderElement, under: RenderElement): RenderElement =>
    Svg ? <Box key="costs" flexDirection="column">{top}{under}</Box> : <Box key="costs" flexDirection="row" columnGap={1}>{top}{under}</Box>
  const total = words(kit, 'total', [[read.spend.totalText, 'value']], true)
  const said = (text: string) => words(kit, 'nums', [[text, 'label']])
  const costs = hist.empty
    ? { long: stack(total, said(EMPTY.costs)), short: Svg ? stack(total, said(EMPTY.costsShort)) : total }
    : { long: stack(total, said(hist.numbersText)), short: Svg ? stack(total, said(hist.numbersShort)) : total }
  const context = x.known ? words(kit, 'ctx', x.say) : null
  const seven = w === undefined ? null : words(kit, '7d', w.say)
  return [
    fitLine(kit, ORDER, lineRoom(kit), keeps => {
      const trailWords = f === undefined ? null
        : f.amber !== undefined ? words(kit, '5h', [[keeps.amber(f.amber), 'amber']])
        : words(kit, '5h', [
            ...f.say,
            ...(keeps.has('pace') && f.pace !== '' ? [[` · ${f.pace}`, 'label'] as const] : []),
            ...(keeps.has('resetText') && f.resetGlyph !== undefined ? [[` · ${f.resetGlyph}`, 'label'] as const] : []),
          ])
      return line(kit, 'line', [
        pill(kit.columns < SHORT_BELOW || !beforeLast(keeps)),
        charts && !hist.empty && keeps.has('barsChart') ? bars(keeps.has('barsMany')) : null,
        keeps.has('costWords') ? costs.long : costs.short,
        charts && (f?.amber !== undefined ? beforeLast(keeps) : keeps.has('trailChart')) ? trail : null,
        trailWords,
        !x.known ? null : x.amber !== undefined ? words(kit, 'ctx', [[keeps.amber(x.amber), 'amber']]) : keeps.has('calmContextText') ? context : null,
        w === undefined ? null : w.amber !== undefined ? words(kit, '7d', [[keeps.amber(w.amber), 'amber']]) : keeps.has('calmSevenText') ? seven : null,
      ], toggle, 1)
    }),
  ]
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Svg, palette: p } = kit
  const hist = read.history
  const c = read.cache
  const x = read.context
  const s = read.spend
  const f = read.fiveHour
  const charts = Svg !== undefined || read.frame.glyphs !== 'ascii'
  const room = gridRoom(kit, bodyRows)
  // A 40 px chart is two desktop rows; braille is one line.
  const chartRows = Svg ? 2 : 1
  const none = (text: string) => words(kit, 'none', [[text, 'label']])
  const say = (key: string, text: string | undefined): RenderChildren => (text === undefined || text === '' ? null : words(kit, key, [[text, 'value']]))
  return grid(kit, [
    section(kit, 'spend', 'SPEND', chartsIfRoom(room, [
      charts && !hist.empty ? barChart(kit, { key: 'b', alt: hist.costsAlt, values: hist.costValues, marked: hist.reWarms, color: p.meterFill, markColor: p.value, newestColor: p.value, px: hist.costValues.length * BAR_PX, height: 40 }) : null,
    ], [
      hist.empty ? none(EMPTY.costs) : say('nums', hist.numbersText),
      say('total', `${s.totalText} this session`),
      fact(kit, 'last', 'last message', s.lastText),
    ], chartRows), room),
    section(kit, 'limits', 'LIMITS', read.limits.length === 0 ? [none(EMPTY.limits)] : chartsIfRoom(room, [
      charts && f !== undefined && hist.fiveHourValues.length > 1 ? sparkline(kit, { key: 's', alt: hist.trailAlt, values: hist.fiveHourValues, color: f.amber !== undefined ? p.amberFg : accentOf(kit, f), px: 180, height: 40, projectTo: f.projectedFrac }) : null,
    ], read.limits.map(l => {
      const tail = [l.pace, l.resetClock === undefined ? l.resetGlyph : `↻ ${l.resetClock}`].filter((t): t is string => t !== undefined && t !== '')
      return words(kit, l.name, l.amber !== undefined ? [[l.amber.long, 'amber']] : [...l.say, ...tail.map(t => [` · ${t}`, 'label'] as const)])
    }), chartRows), room),
    section(kit, 'context', 'CONTEXT', !x.known ? [none(EMPTY.context)] : chartsIfRoom(room, [
      charts && hist.context.length > 1 ? sparkline(kit, { key: 's', alt: x.alt, values: hist.context, color: p.meterFill, px: 180, height: 40, projectTo: x.compactsAtText === undefined ? undefined : 1 }) : null,
    ], [
      say('in', x.compactsAtText === undefined ? `${x.inContextText} in context` : `${x.inContextText} in context · compacts at ${x.compactsAtText}`),
      say('pct', `${x.valueText} ${x.towardText}`),
    ], chartRows), room),
    section(kit, 'cache', 'CACHE', [say('now', c.value), say('rewarm', c.reWarmText), fact(kit, 'hit', 'hit rate', c.hitText), fact(kit, 'lasts', 'lasts', c.lastsText)], room),
  ], bodyRows)
}

export const pulseView = defineView('pulse', { desktop: 2, terminal: 1 }, lines, body)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-pulse`, then the full suite and the view grep gate. Record `costWords` and `pace` as narrow-width rulings in the ledger.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/pulse.tsx plugins/session-usage-band/tests/view-pulse.test.ts design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "feat: the pulse layout, each message's cost and the 5h trend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 26: `week`

**Files:** `hooks/views/week.tsx`, `tests/view-week.test.ts`
**Rows:** desktop 2, terminal 2.
**Design (spec §6):** row 1 is `7d`, seven day cells (height-filled, today outlined heavier, days ahead dashed, initials beneath), the value and `↻ Mon 08:40`; then `5h`, five hour cells labelled by clock hour. Row 2 holds the initials, then the cache pill, the cost and ▿. The terminal draws braille heights, today in `[ ]`. Escalation: amber cells and words; the cell where the 5h pace fills is marked `!`. Give-way: reset text; 5h cells become `5h 4%`; 7d cells become `7d 30%`; once both are text, row 2 holds only the pill, the cost and ▿, so it is still two rows. Expanded: large day cells with % and date, a guess for days ahead as `~7%`, then hour cells with clock labels, a summary per window (used, on pace for, busiest day) and a facts line.
**E and F fixes:** the pill is `layoutCachePill`; row 2 is squeezed too, and `EMPTY.history` gives way (`emptyText`); with no history the empty text replaces only the cells, never the facts; with no limits it keeps two rows; the cells draw `cell.text` (no rounding in the view), and a guess is dashed through `dayCells`' `guess` flags; the initials and their padding are fixed-width Boxes, not spaces; views import `DayCell` and `HourCell` from `reading.ts`, never `calendar.ts`; context, which week doesn't show, gets an amber-only piece.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-week.test.ts
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'
import { HOUR, START, mountBand, setup, shown, svgAlts } from './helpers'
import { caseKey, drawCases, viewSuite, type Mount, type ScenarioName } from './matrix'

viewSuite('week')

const T160: Mount = { surface: 'terminal', cols: 160 }
const at = async ($: Engine, on: On, scenario: ScenarioName) => {
  const trees = await drawCases($, on, { layout: 'week', scenario, appearance: 'dark' }, [T160])
  return { shut: shown(trees[caseKey(T160, 'shut')]), open: shown(trees[caseKey(T160, 'open')]) }
}
/** A week of samples for the windows USAGE reports (5h resets at 3h, 7d at 67h), now at 0. */
const sample = (hours: number, five: number, seven: number) => ({ at: hours * HOUR, fivePct: five, sevenPct: seven, fiveResetAt: 3 * HOUR, sevenResetAt: 67 * HOUR })
const SAMPLES = [sample(-100, 0, 5), sample(-60, 0, 10), sample(-40, 0, 15), sample(-10, 0, 22), sample(-1.5, 1, 27), sample(-0.5, 3, 28)]
const withHistory = async ($: Engine, on: On, surface: 'terminal' | 'desktop', env?: Record<string, string>) => {
  setup(on, { store: { layout: 'week', limitSamples: SAMPLES }, ...(env === undefined ? {} : { env }) })
  await $.session.start(START)
  const ui = await mountBand($, surface, 160)
  const tree = await ui.drawn()
  await ui.unmount()
  return tree
}

test('the desktop draws day cells and hour cells as Svgs', async ($, on) => {
  const alts = svgAlts(await withHistory($, on, 'desktop'))
  expect(alts.some(a => /^weekly limit by day/.test(a))).toBe(true)
  expect(alts.some(a => /^5-hour limit by hour/.test(a))).toBe(true)
})
test('the terminal marks today in brackets and puts the initials beneath', async ($, on) => {
  const t = shown(await withHistory($, on, 'terminal'))
  expect(t).toMatch(/\[[⠀-⣿]\]/)
  expect(t).toMatch(/[MTWFS]{3,}/)
})
test('in ascii the cells become numbers', async ($, on) => {
  const t = shown(await withHistory($, on, 'terminal', { ENABLE_PROMPT_CACHING_1H: '1', CC_BAND_GLYPHS: 'ascii' }))
  expect(t).toMatch(/\[[A-Z]\d+%\]/)
  expect(t).not.toMatch(/[⠀-⣿]/)
})
test('no history: the facts stay, and the empty line says so when open', async ($, on) => {
  const t = await at($, on, 'emptyHistory')
  expect(t.open).toMatch(/History fills in as you use Claude\./)
})
test('no limits: two rows still, and it says so', async ($, on) => {
  expect((await at($, on, 'noLimits')).shut).toMatch(/limits\s*none reported/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Run: `tools/test-only.sh view-week`. Expected: FAIL.
- [ ] **Step 3: Implement `hooks/views/week.tsx`**

```tsx
// week: where your limits went: the week as day cells, the 5-hour window as
// hour cells, shaded by height. In the ascii tier the cells become numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { dayCells } from '../charts'
import type { Kit } from '../kit'
import { SHORT_BELOW } from '../layout'
import type { DayCell, HourCell, LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { EMPTY } from '../words'
import { toggleButton } from './frame'
import { accentOf, beforeLast, fitLine, layoutCachePill, line, lineRoom, section, words, type Keeps } from './parts'
import { defineView } from './view'

/** What gives way, first to last. Amber never does. */
const ORDER = ['resetText', 'emptyText', 'calmFiveCells', 'calmSevenCells'] as const
type Piece = (typeof ORDER)[number]
type Cell = DayCell | HourCell
const nameOf = (c: Cell): string => ('initial' in c ? c.initial : c.label)
const isNow = (c: Cell): boolean => ('today' in c ? c.today : c.now)
/** `7d` and the gap after it: where the cells start, so each initial sits under its cell. */
const PREFIX = 3

/** One window on row 1: its name, its cells while they fit, its value and reset. */
const windowOf = (kit: Kit, read: Readings, l: LimitView | undefined, cells: readonly Cell[], key: '7d' | '5h', step: Piece) => {
  if (l === undefined) return undefined
  const { Box, Svg } = kit
  const amber = l.amber !== undefined
  const color = amber ? kit.palette.amberFg : accentOf(kit, l)
  const name = words(kit, `${key}:n`, [[l.name, amber ? 'amber' : key === '7d' ? 'accent7' : 'accent5']])
  const ascii = Svg === undefined && read.frame.glyphs === 'ascii'
  const chart = read.week.empty || cells.length === 0 ? null
    : ascii ? words(kit, `${key}:c`, [[cells.map(c => (isNow(c) ? `[${nameOf(c)}${c.text}]` : `${nameOf(c)}${c.text}`)).join(' '), 'value']])
    : dayCells(kit, {
        key: `${key}:c`,
        alt: key === '7d' ? read.week.daysAlt : read.week.hoursAlt,
        values: cells.map(c => c.pct),
        guess: cells.map(c => c.guess),
        today: cells.findIndex(isNow),
        color,
        cellPx: key === '7d' ? 16 : 11,
        height: 16,
        labels: cells.map(c => (c.fullMark ? '!' : nameOf(c))),
      })
  const value = l.passed ? 'reset' : l.value
  const plain = words(kit, `${key}:v`, [[value, 'value']])
  const reset = l.resetClock !== undefined ? ` ↻ ${l.resetClock}` : l.resetGlyph !== undefined ? ` ${l.resetGlyph}` : ''
  const withReset = reset === '' ? plain : words(kit, `${key}:v`, [[value, 'value'], [reset, 'label']])
  const cellsShown = (keeps: Keeps<Piece>): boolean => chart !== null && (amber ? beforeLast(keeps) : keeps.has(step))
  return {
    cellsShown,
    draw: (keeps: Keeps<Piece>): RenderElement => {
      const said = l.amber !== undefined ? words(kit, `${key}:v`, [[keeps.amber(l.amber), 'amber']]) : keeps.has('resetText') ? withReset : plain
      return <Box key={key} flexDirection="row" columnGap={1}>{cellsShown(keeps) ? [name, chart, said] : [name, said]}</Box>
    },
  }
}

const lines = (kit: Kit, read: Readings, act: BandActions): RenderElement[] => {
  const { Box, Svg } = kit
  const wk = read.week
  const x = read.context
  const toggle = toggleButton(kit, read, act)
  const seven = windowOf(kit, read, read.sevenDay, wk.days, '7d', 'calmSevenCells')
  const five = windowOf(kit, read, read.fiveHour, wk.hours, '5h', 'calmFiveCells')
  const noLimits = words(kit, 'none', [['limits ', 'label'], [EMPTY.limits, 'value']])
  // Row 1 is squeezed first; row 2 reads whether its 7d cells stayed, so the
  // initials appear only beneath cells.
  let sevenCells = false
  const r1 = fitLine(kit, ORDER, lineRoom(kit), keeps => {
    sevenCells = seven?.cellsShown(keeps) ?? false
    return line(kit, 'r1', seven === undefined && five === undefined ? [noLimits] : [seven?.draw(keeps) ?? null, five?.draw(keeps) ?? null])
  })
  // The terminal draws the initials on a line of their own; the desktop's cells carry theirs.
  const initials = Svg !== undefined || read.frame.glyphs === 'ascii' || wk.days.length === 0 ? null : (
    <Box key="initials" flexDirection="row">
      <Box key="pad" width={PREFIX} flexShrink={0} />
      {wk.days.map((d, i) => (
        <Box key={`d${i}`} width={d.today ? 3 : 1} paddingX={d.today ? 1 : 0} flexShrink={0}>
          {words(kit, 'i', [[d.fullMark ? '!' : d.initial, 'label']])}
        </Box>
      ))}
    </Box>
  )
  const empty = words(kit, 'empty', [[EMPTY.history, 'label']])
  let pillLong: RenderElement | undefined
  let pillShort: RenderElement | undefined
  const pill = (short: boolean) => (short ? (pillShort ??= layoutCachePill(kit, read, true)) : (pillLong ??= layoutCachePill(kit, read, false)))
  const cost = words(kit, 'cost', [[read.spend.totalText, 'value']])
  const r2 = fitLine(kit, ORDER, lineRoom(kit), keeps =>
    line(kit, 'r2', [
      wk.empty ? (keeps.has('emptyText') ? empty : null) : sevenCells ? initials : null,
      pill(kit.columns < SHORT_BELOW || !beforeLast(keeps)),
      cost,
      // Week shows no context, so its trigger gets an amber piece of its own.
      x.amber === undefined ? null : words(kit, 'ctx', [[keeps.amber(x.amber), 'amber']]),
    ], toggle),
  )
  return [r1, r2]
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, Svg } = kit
  const wk = read.week
  const c = read.cache
  const x = read.context
  const s = read.spend
  const ascii = Svg === undefined && read.frame.glyphs === 'ascii'
  const big = (key: string, cells: readonly Cell[], color: string, alt: string): RenderChildren =>
    cells.length === 0 ? null
    : ascii ? words(kit, key, [[cells.map(cell => (isNow(cell) ? `[${nameOf(cell)} ${cell.text}]` : `${nameOf(cell)} ${cell.text}`)).join('  '), 'value']])
    : dayCells(kit, { key, alt, values: cells.map(cell => cell.pct), guess: cells.map(cell => cell.guess), today: cells.findIndex(isNow), color, cellPx: 44, height: 40, labels: cells.map(cell => ('date' in cell ? `${cell.initial} ${cell.date} ${cell.text}` : `${cell.label} ${cell.text}`)) })
  const summary = (key: string, text: string | undefined): RenderChildren => (text === undefined ? null : words(kit, key, [[text, 'label']]))
  const pair = (key: string, chart: RenderChildren, said: RenderChildren): RenderElement => <Box key={key} flexDirection="row" columnGap={3}>{chart}{said}</Box>
  const seven = read.sevenDay
  const five = read.fiveHour
  // Two rows a chart on the desktop (51 px), one on the terminal; short of
  // rows, the summaries alone.
  const room = Math.max(0, bodyRows - 2)
  const chartRows = Svg ? 2 : 1
  const windows = [seven, five].filter(l => l !== undefined).length
  const drawCharts = !wk.empty && windows * chartRows <= room
  const limits: RenderChildren[] = [
    seven === undefined ? null : drawCharts ? pair('days', big('days', wk.days, accentOf(kit, seven), wk.daysAlt), summary('s7', wk.summary7)) : summary('s7', wk.summary7 ?? seven.text),
    five === undefined ? null : drawCharts ? pair('hours', big('hours', wk.hours, accentOf(kit, five), wk.hoursAlt), summary('s5', wk.summary5)) : summary('s5', wk.summary5 ?? five.text),
    ...read.limits.filter(l => l.key === 'other').map(l => words(kit, l.name, l.say)),
    wk.empty ? words(kit, 'empty', [[EMPTY.history, 'label']]) : null,
    read.limits.length === 0 ? words(kit, 'none', [[EMPTY.limits, 'label']]) : null,
  ]
  // The facts line: the other three sections, a phrase each.
  const facts = words(kit, 'facts', [['CACHE ', 'label'], [c.text, 'value'], ['  SPEND ', 'label'], [`${s.totalText} this session`, 'value'], ['  CONTEXT ', 'label'], [x.known ? x.text : EMPTY.context, 'value']])
  return bodyRows < 2 ? [facts] : [section(kit, 'limits', 'LIMITS', limits, room), facts]
}

export const weekView = defineView('week', { desktop: 2, terminal: 2 }, lines, body)
```

- [ ] **Step 4: Run the tests until they pass.** Run: `tools/test-only.sh view-week`, then the full suite and the view grep gate.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/week.tsx plugins/session-usage-band/tests/view-week.test.ts
git commit -m "feat: the week layout, the limits as days and hours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## P4: Production

### Task 27: The perf and soak tests

**Files:** `tests/perf.test.ts`, `tests/soak.test.ts`

- [ ] **Step 1: Write the perf test**

One layout per test, one setup each, chips first so its medians are in hand when the others compare. Each test draws calm at 200 columns, or `lastMinute` at 60, the case that squeezes most, through `drawCases` for the node budgets, then mounts again and times 200 redraws after a warm-up, as the P0 baseline did.

```ts
// tests/perf.test.ts — each layout's draw time against chips', in the same
// run, and its node budget.
import { test, expect } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { LONG, mountBand, walk } from './helpers'
import { caseKey, drawCases, type Mount } from './matrix'

const nodes = (tree: unknown): number => { let n = 0; walk(tree, () => { n++ }); return n }
/** What timing needs of a mounted band, on either surface. */
type Drawn = Readonly<{ redraw: () => Promise<void>; drawn: () => Promise<unknown> }>
const medianOf = async (ui: Drawn): Promise<number> => {
  for (let i = 0; i < 20; i++) await ui.redraw()
  const t: number[] = []
  for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); t.push(performance.now() - a) }
  return t.sort((x, y) => x - y)[100] ?? 0
}
/** Chips' medians, recorded by its own tests, which run first in this file. */
const CHIPS: Record<string, number> = {}
const ORDERED = ['chips', ...LAYOUT_NAMES.filter(l => l !== 'chips')] as const

for (const scenario of ['calm', 'lastMinute'] as const) for (const layout of ORDERED) {
  test(`perf: ${layout}, ${scenario}`, LONG, async ($, on) => {
    const cols = scenario === 'calm' ? 200 : 60
    const mounts: Mount[] = [{ surface: 'terminal', cols }, { surface: 'desktop', cols }]
    const trees = await drawCases($, on, { layout, scenario, appearance: 'dark', ttl: scenario === 'lastMinute' ? '5m' : '1h' }, mounts)
    for (const m of mounts) {
      expect(nodes(trees[caseKey(m, 'shut')])).toBeLessThanOrEqual(400)
      expect(nodes(trees[caseKey(m, 'open')])).toBeLessThanOrEqual(1500)
      const ui = await mountBand($, m.surface, m.cols)
      for (const state of ['shut', 'open'] as const) {
        if (state === 'open') await ui.press({ key: 'more' })
        const key = `${scenario}|${m.surface}|${cols}|${state}`
        const ms = await medianOf(ui)
        if (layout === 'chips') CHIPS[key] = ms
        console.log(`PERF ${layout} ${key} median=${ms.toFixed(3)}ms`)
        if (layout !== 'chips') expect(ms).toBeLessThanOrEqual(2 * (CHIPS[key] ?? 0) + 0.05)
      }
      await ui.press({ key: 'more' })
      await ui.unmount()
    }
  })
}
```

**If P0 found `performance.now` frozen,** drop the 2× assertion and keep the node budget and the log.

- [ ] **Step 2: Write the soak test**

It drives the plugin and checks what a user's machine would see: store writes, the stored size, redraws and drawn trees. The caps of the trails and samples are proven by Tasks 23 and 24's unit tests, on each test file's own module copies.

```ts
// tests/soak.test.ts — six hours in coarse ticks: what the band writes and
// redraws stays bounded.
import { test, expect } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { CLEAR, LONG, MIN, START, engine, mountBand, resp, respond, setup, turn, usage, walk } from './helpers'

const HOUR = 60 * MIN
const run = ($: Engine, args: string) =>
  $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
const nodes = (tree: unknown): number => { let n = 0; walk(tree, () => { n++ }); return n }
/** The limits rising with every turn, the 5h window rolling over every five hours. */
const rising = (i: number, now: number): void => {
  usage.current = { ...usage.current, rateLimits: [
    { kind: 'five_hour', percentUsed: Math.min(99, (now % (5 * HOUR)) / (5 * HOUR) * 60), resetsAt: new Date((Math.floor(now / (5 * HOUR)) + 1) * 5 * HOUR).toISOString() },
    { kind: 'seven_day', percentUsed: 30 + i * 0.01, resetsAt: new Date(67 * HOUR).toISOString() },
  ] }
}

test('six hours, a thousand turns, three clears: writes, size and trees stay bounded', { timeoutMs: 180_000 }, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  let cost = 2.41
  let commands = 0
  for (let i = 0; i < 1000; i++) {
    rising(i, i * 21_600)
    await turn($, `t${i}`, cost, (cost += 0.01))
    await clock.advance(21_600) // 1,000 × 21.6 s = 6 h
    if (i % 333 === 332) await $.session.end(CLEAR)
    if (i % 167 === 0) { await run($, `layout ${LAYOUT_NAMES[(i / 167) % LAYOUT_NAMES.length]}`); commands++ }
  }
  const sampleWrites = engine.storeSets.filter(k => k === 'limitSamples').length
  await run($, 'layout pulse'); commands++
  const first = await mountBand($, 'desktop', 160)
  const before = nodes(await first.drawn())
  await first.unmount()
  for (let i = 1000; i < 1050; i++) { rising(i, i * 21_600); await turn($, `t${i}`, cost, (cost += 0.01)); await clock.advance(21_600) }
  const second = await mountBand($, 'desktop', 160)
  const after = nodes(await second.drawn())
  await second.unmount()
  expect(sampleWrites).toBeLessThanOrEqual(25) // 24 buckets in 6 h, and the first
  expect(engine.storeSets.filter(k => k === 'layout').length).toBe(commands)
  expect(JSON.stringify(engine.store).length).toBeLessThan(100_000)
  expect(after).toBe(before)
})

test('a calm ten-minute walk repaints once a minute, not once a second', LONG, async ($, on) => {
  const clock = setup(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  const ui = await mountBand($, 'terminal', 120)
  await clock.settle()
  const before = engine.invalidates
  await clock.advance(10 * MIN)
  expect(engine.invalidates - before).toBeLessThanOrEqual(11)
  await ui.unmount()
})
```

- [ ] **Step 3: Run them.** Run: `tools/test-only.sh perf soak`, then the full suite. Expected: PASS. A failure is a real bug: fix it test first.
- [ ] **Step 4: Commit**

```bash
git add plugins/session-usage-band/tests/perf.test.ts plugins/session-usage-band/tests/soak.test.ts
git commit -m "test: draw time, node budgets, store writes and repaints, for every layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 28: The performance pass

- [ ] **Step 1:** Run the perf test and copy the PERF lines into `design/perf-baseline.md`, under "After the layouts", beside the P0 baseline. Compare chips' own lines with P0's: chips should be within noise of its baseline. Record both in the ledger.
- [ ] **Step 2:** For any layout over its budget, find which builder dominates by timing its `draw` in a scratch test, then fix it test first; the perf test is the RED test. The fixes to try, in order:
  1. build what doesn't depend on the squeeze once, outside the closure, and each chart size at most once (the pattern every view already follows: check the slow view does);
  2. only then, a bounded memo.
- [ ] **Step 3: The invalidate gating candidate.** Count `engine.invalidates` across a 50-step turn in a scratch test.
  - **If** steps that change nothing still repaint, gate the `turn.step` / `session.measure` / git invalidates in `register.tsx` by a paint key. The key covers `isWorking`, the cache mood, the countdown text, the limits, context, cost, workspace, layout and expanded.
  - **First,** write a test that changing each input repaints. Golden stays green.
  - **If** the count shows no waste, record that in the ledger and change nothing.
- [ ] **Step 4:** Commit the fixes and the numbers, the before and after numbers in the body:

```bash
git add plugins/session-usage-band design/perf-baseline.md design/plans/2026-10-10-band-layouts-ledger.md
git commit -m "perf: <what changed>

<before and after medians, per layout>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**An option for later, not this release:** the 1 Hz timer repaints every second in the cache's last ten minutes, because chips shows `M:SS`. The new layouts say minutes until the last minute, so for a non-chips layout the timer could tick each second only in the last minute. Note it in the ledger with the measured repaint count.

### Task 29: Independent whole-branch review

- [ ] **Step 1:** Run `superpowers:requesting-code-review` on `git diff main...feat/layouts`, dispatching a fresh reviewer on the most capable model. Pass the spec, this plan, and the ledger with every `Ruling:` line.
- [ ] **Step 2:** Re-grade the findings by their effect on a user. Fix every Critical and Important one test first, one commit each (`fix: <finding>`, ending with the Co-Authored-By line), recording each in the ledger as `Final: fixed <finding> — <test> RED→GREEN, suite N/N`. Defer the Minor ones to the ledger.
- [ ] **Step 3:** Check golden is untouched: `git log --format=%h -- plugins/session-usage-band/tests/golden/chips.ts` shows only Task 2's commit.

### Task 30: The final quality pass

**Files:**
- Create: `tools/views-gate.sh`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the views gate.** Views never format and never read raw facts; the gate makes that a check, not a habit.

```bash
#!/usr/bin/env bash
# The views gate: outside chips, no view formats, parses a time, or reads a
# raw fact. Prints each offending line and fails if there is one.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if grep -nE '\.raw\b|\.reading\.|Date\.parse|\.replace\(|Math\.round|from '\''\.\./format'\''' "$ROOT"/plugins/session-usage-band/hooks/views/*.tsx | grep -vE '/(chips|parts|frame)\.tsx:'; then
  echo "views-gate: a view formats or reads a raw fact (see above)" >&2
  exit 1
fi
```

Then `chmod +x tools/views-gate.sh`, and add a CI step after "Test": `- name: Views never format` / `run: tools/views-gate.sh`. Run it: expected, no output and exit 0.
- [ ] **Step 2:** Over the whole diff, remove what doesn't belong:
  - dead code, unused exports and debug output;
  - TODOs and commented-out code;
  - any `as never` or `as unknown as` cast outside tests;
  - names off spec §4.3.

  Check every comment against CONTRIBUTING's house style: short, saying why, in the band's voice.
- [ ] **Step 3:** Spell-check the user-visible text: `words.ts`, view labels, replies, the README and the CHANGELOG. Grep the views for `≈`, `0:` followed by digits, and `!!` outside chips. Expected: none.
- [ ] **Step 4:** Run the full gates, then commit:

```bash
git add tools/views-gate.sh .github/workflows/ci.yml plugins/session-usage-band
git commit -m "chore: tidy the layouts branch, and gate the views in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 31: Docs, version, changelog

- [ ] **Step 1:** In the plugin README, add a "Layouts" section:
  - one line per layout, with its row counts (desktop / terminal);
  - `/usage-band layout <name>` and the default;
  - `CC_BAND_GLYPHS` (`ascii` for CJK terminals, screen readers, or the ambiguous-width option);
  - how the time zone is read, and that week's cells fall back to UTC (and departures and forecast to relative times) when it can't be.

  Add the `layout <name>` row to the Commands table.
- [ ] **Step 2:** In the root README, add one line under "What it shows", linking the Layouts section. Add the layouts gallery image from Task 32.
- [ ] **Step 3:** In CONTRIBUTING.md's file table, add `words.ts`, `views/` (with `view.ts`, `index.ts`, `frame.tsx`, `parts.tsx`, one file per layout), `charts.tsx`, `glyphs.ts`, `calendar.ts`, `tests/matrix.ts`, the golden capture, `tools/test-only.sh` and `tools/views-gate.sh`. Add the rule: "A new layout is a name in `LAYOUT_NAMES`, one file in `views/` made with `defineView`, one test file running `viewSuite`, and an entry in `VIEWS`. It draws only words from `read`; `tools/views-gate.sh` checks."
- [ ] **Step 4:** In the CHANGELOG, add `## [0.12.0] - <date>` with sections:
  - **Added:** the nine layouts, the command, the glyph tiers.
  - **Fixed:** the subagent turn-start leak.
  - **Changed:** chips in CJK locales draws ASCII.

  Fold in the `[Unreleased]` entries.
- [ ] **Step 5:** Bump `plugin.json` to `0.12.0`. Set the spec's status line to "Implemented in 0.12.0".
- [ ] **Step 6:** Run the gates, then commit:

```bash
git add README.md CONTRIBUTING.md plugins/session-usage-band design/2026-10-09-band-layouts-spec.md
git commit -m "docs: the layouts in the READMEs, CONTRIBUTING and the changelog; 0.12.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 32: Demos

- [ ] **Step 1:** In `tools/demos/capture/desktop.test.ts`, add one `STATE layout-<name>` and one `STATE layout-<name>Open` capture per layout (calm), plus `-amber` (the `lastMinute` scenario) for each. Each capture is its own test, one setup each.
- [ ] **Step 2:** `tools/demos/stills.py` gains a `layouts-{light,dark}.html` gallery, one row per layout, with output in `docs/band-layouts-{light,dark}.png`. `build.sh` shoots and crops it.
- [ ] **Step 3:** Run `tools/demos/build.sh`. Check the golden-unchanged chips images are byte-identical in `git diff --stat docs/`; only the new images and `index.html` should differ.
- [ ] **Step 4:** Commit:

```bash
git add tools/demos docs
git commit -m "docs: a gallery of the nine layouts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Maintainer checkpoint 6.** Before Task 33: the maintainer checks each layout by hand, on the desktop and in a terminal, collapsed and expanded, after `claude plugin marketplace update hossein-mods && claude plugin update session-usage-band@hossein-mods` and `/reload-plugins`, and gives the go-ahead for anything outward.

### Task 33: Release preparation (the maintainer's go-ahead gates every outward step)

- [ ] **Step 1:** Run the production gate (spec §10) item by item. Paste the evidence (counts, PERF lines, tsc output, the ledger's rulings) into `design/release-0.12.0.md`.
- [ ] **Step 2:** Draft the PR body and an update for issue #1 in `design/release-0.12.0.md`: what shipped, the screenshots to attach, and the numbers.
- [ ] **Step 3:** Only on the maintainer's go-ahead:
  1. push `feat/layouts`;
  2. open the PR;
  3. after merge, run `claude plugin tag plugins/session-usage-band --push` and publish the release;
  4. update issue #1 from the draft.

---

## Self-review

**Spec coverage.**

| Spec section | Task |
| --- | --- |
| §1 layouts | T16 (pilot), T17–T21, T25, T26 |
| §2 contract | `invariantErrors` (T11a), run by every view's `viewSuite` (T11b) |
| §2.2 amber words | T4 (`AMBER`), T13 (each reading's `amber`, `boardAmber`); every view's amber-only pieces |
| §2.4 estimates | T13 (`~` on `fullAtClock`, `roomText`, the re-warm), checked by `estimate` (T11a) |
| §2.6 give-way | `fitLine` and `Keeps` (T9b); each view's `ORDER`; the narrow-width ruling |
| §2.7 same facts behind ▿ | `frame` (T9a); every body shows four sections with `EMPTY.*` |
| §2.10 contrast | T12 |
| §2.12 time words | T4, T13 |
| §2.13 alt text | T4 (`altOf`, spoken durations), T13 |
| §3.1 primitives | T7 |
| §3.2 tiers | T8 |
| §4.1 layers | T5 (facts), T13 (words), T9a, T10a |
| §4.2 command | T10b |
| §4.3 names | everywhere; checked in T30 |
| §5 data | T5, T10c, T13, T23, T24 |
| §6 each layout | T16–T21, T25, T26 |
| §7 testing | T1, T2, T11a, T11b, the view tasks, T23, T24 |
| §8 phases | P0–P4, with the P2.0 pilot and the maintainer checkpoints |
| §9 performance | T2, T13 and T23–T24 (built once, lazy getters, in-memory samples), T27, T28 |
| §10 gate | T33 |

**Placeholder scan.** Every view (T16–T21, T25, T26) carries full code against the P1 API. What can only be settled by running code is written as an explicit ruling with its fallback:
- counting invalidates (T1), `noWorkspace` and a held read (T1), how `h` passes children to `fakeEl` (T7);
- the time zone (T10c, T14, checkpoint 2);
- `viewSuite`'s first run being the pilot (T11b);
- the narrowest widths (before T17): gauges' `reWarm`, rings' `marks`, pulse's `costWords` and `pace`;
- rings' split bar and side-by-side 7d ring (T19); departures' flap padding (T20).

**Type consistency.** These names are used the same way in every task:
- the test kit: `drawCases`, `caseKey`, `Mount`, `CaseOptions`, `Ttl`, `snapOf`, `NO_ACT`, `fakeEl`, `invariantErrors`, `expectInvariants`, `suiteCases`, `viewSuite`, `engine.storeGets` / `storeSets` / `invalidates` / `storeFails`;
- the phrasebook: `Role`, `Say`, `Amber`, `AMBER`, `EMPTY`, `altOf`, `resetPhrase`, `paceText`, `cacheWords`, `contextWords`, `spendWords`, `limitWords`, `workspaceWords`, `historyWords`, `weekWords`;
- the readings: `cacheFacts`, `contextFacts`, `spendFacts`, `limitFacts`, `readingsOf`, `Readings`, `LimitView`, `ChipsWindow`, `read.chips`, `history` and `week` (lazy);
- the views: `View`, `Rows`, `Lines`, `Body`, `rowsOf`, `defineView`, `VIEWS`, `Strip`, `frame`, `openView`, `panel`, `toggleButton`, `Keeps`, `fitLine`, `line`, `lineRoom`, `beforeLast`, `words`, `fact`, `section`, `grid`, `gridRoom`, `chartsIfRoom`, `accentOf`, `layoutCachePill`;
- the charts: `meter` (and its options), `ring`, `sparkline`, `barChart`, `dayCells`, `underline`, `braille`;
- the histories: `trails`, `pushCost`, `pushContext`, `noteFiveHourTrail`, `takeRebuilt`, `Sample`, `addSample`, `mergeSamples`, `sampleOf`, `asLimitSamples`, `weekOf`.

**What no longer exists.** `drawAs`, `squeezeRow`, `readHistoryForTest`, `read.frame.columns`, `amberShort` as a field or an `ORDER` entry, a view-level `h`, `parts(kit, read)` as a factory, and chips' `cachePill` in `parts.tsx` (it lives in `chips.tsx`).

**Review focus.** Each of the five items is pinned by a named test in T8 or T10b. The views' shared risks are covered by `viewSuite`:
- amber at narrow widths, for every trigger;
- plain mode, and desktop plain's terminal rows;
- the ascii tier;
- every cache mood;
- `maxRows` 4, and the expanded height at every `maxRows`.
