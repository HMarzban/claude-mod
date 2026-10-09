# Band layouts: implementation plan (P0–P4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/usage-band layout <name>` with nine layouts, production-ready:
- **P0:** pin today's band exactly.
- **P1:** lay the foundation (readings, views, the command, glyph tiers, charts) without changing chips.
- **P2:** build six views in parallel.
- **P3:** add the histories, then pulse and week.
- **P4:** profile, review, write the docs, rebuild the demos and release.

**Architecture:**
- `register.tsx` → `snapshot.ts` → `reading.ts` (`readingsOf`) → `views/<name>.tsx`, drawn through `VIEWS[layout]`.
- Chips moves into `views/chips.tsx` and draws from `Readings`.
- A golden capture taken before any code moves proves chips is unchanged.

**Tech stack:**
- Claude Code mod API (function hooks, TSX with the global `h`), TypeScript.
- `claude plugin test` for tests (`claude-code/testing`: `test`, `expect`, `mock`).
- No new dependencies.

**Spec:** `design/2026-10-09-band-layouts-spec.md` (v3). Read it first. Where the spec and the canvas differ, the spec wins.

## Global Constraints

These come from the spec and CONTRIBUTING.md:
- **Engine access:** `$` stays in `register.tsx`. Atoms are declared there too. Never name a local `h`.
- **The desktop surface:**
  - No whitespace-only string children on the desktop.
  - Svg only behind `kit.Svg`. Every Svg has an `alt` and a `width`, and no `id`, gradient, pattern or clipPath.
  - A hover card has no key. A Button holds text alone.
- **Test first:**
  - Every change starts with a failing test that you watch fail.
  - Tests that walk the clock use `LONG` from `tests/helpers.ts`.
  - Settle on the clock with `await clock.settle()`.
- **Chips stays unchanged:** with no stored layout and no `CC_BAND_GLYPHS` in a non-CJK locale, every drawn tree is deep-equal to the golden capture. No assertion in the existing suite changes.
- **Naming:** names exactly as spec §4.3.
- **Store:** the store keys are `layout` and `limitSamples`. Only the command writes `layout`.
- **Production code:** no counters or instrumentation.
- **Commits:**
  - Conventional subjects (`feat:`, `fix:`, `test:`, `refactor:`, `docs:`, `chore:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work stays on branch `feat/layouts`. Nothing is pushed.
- **Gates,** run from the repo root:
  - `claude plugin validate plugins/session-usage-band`
  - `claude plugin test plugins/session-usage-band`
  - `npx -y -p typescript@5 tsc -p plugins/session-usage-band`

  The type check needs the engine types under `plugins/session-usage-band/.claude-plugin/types/`. They exist in this checkout.

## Review Focus

Each item is something the spec implies but no task tests directly, together with the test that pins it.

1. **A stored layout from a future version** (`"layout": "sparkle"`) draws chips and never throws. Pinned in Task 10: `a stored layout this version doesn't know draws chips`.
2. **A corrupt store value** for `layout` (a number, an object, `null`) draws chips. Pinned in Task 10: `a stored layout that isn't a string draws chips`.
3. **`/usage-band layout` with extra words** (`layout  Ledger  extra`) is treated as unknown, and nothing changes. Pinned in Task 10: `extra words after the name are unknown`.
4. **A CJK locale set only in `LC_CTYPE`**, with `LANG=C`, still picks the ascii tier. Pinned in Task 8: `LC_CTYPE alone picks the ascii tier`.
5. **The ascii tier never widens a row.** Every mapping replaces a glyph with at most one character, or drops it. Pinned in Task 8: `the ascii tier never makes a row wider`.

---

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `tests/matrix.ts` | create (T1), extend (T11) | Scenarios, `drawAs`, and later `expectInvariants`, `visualRows`, `viewSuite`, `AMBER_WORDS` |
| `tests/golden/hash.ts` | create (T1) | `canon`, `fnv1a`, `treeHash` |
| `tools/golden/capture.test.ts`, `tools/golden/capture.sh` | create (T2) | Golden capture, run outside the normal suite |
| `tests/golden/chips.ts`, `tests/golden.test.ts` | create (T2) | The committed golden hashes and trees, and their assertion |
| `design/perf-baseline.md` | create (T2) | Chips' draw times today |
| `hooks/insights.ts`, `hooks/register.tsx` | modify (T3) | Clear subagent turn-start entries |
| `hooks/format.ts` | modify (T4) | `fmtClock`, `fmtDayClock`, `fmtSecondsLeft` |
| `hooks/reading.ts` | modify (T4, T5) | Shared phrases, and `Readings` / `readingsOf` |
| `hooks/layout.ts` | modify (T6) | `ROW_PX`; `cellsOf` measures a column as its widest row |
| `hooks/glyphs.ts` | create (T8) | `Glyphs`, `resolveGlyphs`, `asciiTree` |
| `hooks/charts.tsx` | create (T7) | `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `braille` |
| `hooks/views/parts.tsx`, `hooks/views/frame.tsx` | create (T9) | Shared pills; the expanded scaffold |
| `hooks/views/chips.tsx`, `hooks/views/index.ts` | create (T9, T10) | Chips as a view; `VIEWS` |
| `hooks/band.tsx` | modify (T5, T9, T10) | Down to: build kit and readings, dispatch, fall back |
| `hooks/snapshot.ts`, `hooks/memory.ts` | modify (T10) | Layout names and fields; store keys and guards |
| `hooks/palette.ts`, `tests/design.test.ts` | modify (T12) | `flap`, `flapText`, `flapDim` |
| `tests/helpers.ts` | modify (T11) | `storeFails` |
| `hooks/views/{ledger,tiles,gauges,rings,departures,forecast}.tsx`, `tests/view-*.test.ts` | replace stubs (T16–T21) | The six P2 views, built in parallel |
| `hooks/cache.ts`, `hooks/insights.ts` | modify (T23) | `lastRebuilt`; the cost, context and 5h trails |
| `hooks/calendar.ts`, `hooks/memory.ts` | create / modify (T24) | `weekOf`; `limitSamples` |
| `hooks/views/{pulse,week}.tsx`, `tests/view-{pulse,week}.test.ts` | replace stubs (T25, T26) | The history views |
| `tests/perf.test.ts`, `tests/soak.test.ts` | create (T27) | Draw time, node budgets, bounded structures |
| READMEs, CONTRIBUTING, CHANGELOG, `plugin.json`, `tools/demos/*` | modify (T31, T32) | Docs, 0.12.0, the layouts gallery |
| `design/release-0.12.0.md` | create (T33) | Gate evidence, PR and issue drafts |

---

## P0: Baseline

### Task 1: Scenarios and tree hashing

**Files:**
- Create: `plugins/session-usage-band/tests/golden/hash.ts`
- Create: `plugins/session-usage-band/tests/matrix.ts`
- Test: `plugins/session-usage-band/tests/golden-hash.test.ts`

**Interfaces:**
- **Produces:**
  - `canon(v: unknown): unknown`
  - `fnv1a(s: string): string` (8 hex characters)
  - `treeHash(tree: unknown): string`, defined as `${fnv1a(json)}-${json.length}`
  - `SCENARIOS: Readonly<Record<ScenarioName, Scenario>>`
  - `drawAs($, on, opts): Promise<unknown>`
  - `ScenarioName`, `Appearance = 'dark' | 'light' | 'plain'`, `Surface = 'terminal' | 'desktop'`

- [ ] **Step 1: Write the failing hash test**

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

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL. The module `./golden/hash` can't be resolved.

- [ ] **Step 3: Write `tests/golden/hash.ts`**

```ts
// A drawn tree as a short, stable fingerprint: the golden capture keeps
// hashes, not trees, so it stays small enough to commit.

/** `v` with object keys sorted and functions dropped: handlers differ by
 *  identity between draws, and key order is not part of what is drawn. */
export const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon)
  if (v === null || typeof v !== 'object') return v
  const o = v as Record<string, unknown>
  return Object.fromEntries(
    Object.keys(o)
      .sort()
      .filter(k => typeof o[k] !== 'function' && o[k] !== undefined)
      .map(k => [k, canon(o[k])]),
  )
}

/** 32-bit FNV-1a over UTF-16 code units: the sandbox has no crypto. */
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

- [ ] **Step 4: Write `tests/matrix.ts` with the scenarios and `drawAs`**

The scenarios reuse the states the existing tests already reach:
- `tests/cache-pill.test.ts` for the last minute and working;
- `tests/context-and-tokens.test.ts:34` for the compaction breakdown;
- `tests/resume.test.ts:48` for a recalled session;
- `tests/limits.test.ts:187` for spend limits;
- `tests/workspace-reads.test.ts:60` for git failing.

```ts
// The states every layout is drawn in, and one way to draw any of them.
// P0 needs only SCENARIOS and drawAs; P1 adds the invariant checks.

import type { SessionUsage } from 'claude-code'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'
import {
  HOUR, HOUR_1, MIN, START, USAGE, FRESH, breakdown, engine, mountBand, pacing, resp, respond,
  setup, transcriptOf, turn, usage, type Node,
} from './helpers'

export type Appearance = 'dark' | 'light' | 'plain'
export type Surface = 'terminal' | 'desktop'
export type AmberReason = 'cacheLastMinute' | 'nearCompaction' | 'contextNoCompaction' | 'limit80' | 'fiveHourAhead'

export type Scenario = Readonly<{
  usage?: SessionUsage
  store?: Record<string, unknown>
  now?: number
  /** Changes to the fake engine before the session starts. */
  prepare?: () => void
  /** Drives the session into its state; starts it unless `starts` is false. */
  drive: ($: Engine, clock: MockClock) => Promise<void>
  isWorking?: boolean
  amber: readonly AmberReason[]
}>

const replied = async ($: Engine): Promise<void> => {
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
}
const withLimits = (five: number, seven: number, fiveResetH = 3, sevenResetH = 67): SessionUsage['rateLimits'] => [
  { kind: 'five_hour', percentUsed: five, resetsAt: new Date(fiveResetH * HOUR).toISOString() },
  { kind: 'seven_day', percentUsed: seven, resetsAt: new Date(sevenResetH * HOUR).toISOString() },
]
const contextAt = (tokens: number, compactAt: number | undefined): SessionUsage['context'] => ({
  tokens,
  window: 200_000,
  percent: tokens / 2000,
  breakdown: breakdown(compactAt === undefined ? { isAutoCompactEnabled: false } : { autoCompactThreshold: compactAt, isAutoCompactEnabled: true }),
})
/** One turn, so the band reads the compaction breakdown, as it does after every turn. */
const afterTurn = async ($: Engine): Promise<void> => {
  await replied($)
  await turn($, 't1', usage.current.cost?.usd ?? 0, usage.current.cost?.usd ?? 0)
}

export const SCENARIOS = {
  calm: { drive: replied, amber: [] },
  unmeasured: { drive: async $ => { await $.session.start(START) }, amber: [] },
  warming: { usage: FRESH, drive: async $ => { await $.session.start(START) }, amber: [] },
  recalled: { now: 20 * MIN, prepare: () => { engine.transcript = transcriptOf(0) }, drive: async $ => { await $.session.start(START) }, amber: [] },
  cold: { drive: async ($, clock) => { await replied($); await clock.advance(61 * MIN) }, amber: [] },
  lastMinute: { drive: async ($, clock) => { await replied($); await clock.advance(59 * MIN + 30_000) }, amber: ['cacheLastMinute'] },
  working: { drive: replied, isWorking: true, amber: [] },
  nearCompaction: { usage: { ...USAGE, context: contextAt(150_000, 160_000) }, drive: afterTurn, amber: ['nearCompaction'] },
  compactionOff: { usage: { ...USAGE, context: contextAt(170_000, undefined) }, drive: afterTurn, amber: ['contextNoCompaction'] },
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
  noWorkspace: { prepare: () => { engine.hold = new Promise(() => undefined) }, drive: replied, amber: [] },
  notARepo: { prepare: () => { engine.git = 'none' }, drive: replied, amber: [] },
  gitFails: { prepare: () => { engine.git = 'fail' }, drive: replied, amber: [] },
  emptyHistory: { usage: FRESH, drive: async $ => { await $.session.start(START) }, amber: [] },
  fullHistory: {
    drive: async $ => {
      await replied($)
      for (let i = 1; i <= 30; i++) {
        usage.current = { ...usage.current, cost: { usd: 2.41 + i * 0.2 } }
        await turn($, `t${i}`, 2.41 + (i - 1) * 0.2, 2.41 + i * 0.2)
      }
    },
    amber: [],
  },
} as const satisfies Record<string, Scenario>

export type ScenarioName = keyof typeof SCENARIOS
export const SCENARIO_NAMES = Object.keys(SCENARIOS) as ScenarioName[]

export type DrawOptions = Readonly<{
  scenario: ScenarioName
  surface: Surface
  appearance: Appearance
  cols: number
  maxRows?: number
  expanded?: boolean
  layout?: string
  env?: Record<string, string>
}>

/** The band drawn in a scenario: setup, drive, mount, and open it if asked. */
export const drawAs = async ($: Engine, on: On, o: DrawOptions): Promise<Node> => {
  const s: Scenario = SCENARIOS[o.scenario]
  const env = { ...HOUR_1, ...(o.appearance === 'dark' ? {} : { CC_BAND_APPEARANCE: o.appearance }), ...o.env }
  const store = { ...(s.store ?? {}), ...(o.layout === undefined ? {} : { layout: o.layout }) }
  const clock = setup(on, { usage: s.usage, store, env, now: s.now })
  s.prepare?.()
  await s.drive($, clock)
  await clock.settle()
  const ui = await mountBand($, o.surface, o.cols, { maxRows: o.maxRows, isWorking: s.isWorking })
  if (o.expanded) await ui.press({ key: 'more' })
  const tree = (await ui.drawn()) as Node
  await ui.unmount()
  return tree
}
```

- **If a field isn't exported:** if `engine`, `FRESH`, `breakdown` or `transcriptOf` isn't exported from `helpers.ts`, export it. They are all `export const` today.
- **If a state isn't reached:** check each scenario against the test it reuses. If it doesn't reach its state (for example, `nearCompaction` stays calm), fix the scenario's inputs and add a check in Step 5.

- [ ] **Step 5: Add a test that each scenario reaches its state**

Append this to `tests/golden-hash.test.ts`. It is the guard that the scenarios mean what their names say.

```ts
import { LONG } from './helpers'
import { drawAs } from './matrix'
import { shown } from './helpers'

const sees = async ($: Parameters<typeof drawAs>[0], on: Parameters<typeof drawAs>[1], scenario: Parameters<typeof drawAs>[2]['scenario'], text: RegExp) =>
  expect(shown(await drawAs($, on, { scenario, surface: 'terminal', appearance: 'dark', cols: 160, expanded: true }))).toMatch(text)

test('calm reaches a warm countdown', async ($, on) => sees($, on, 'calm', /cache 1h 00m/))
test('lastMinute reaches the last minute', LONG, async ($, on) => sees($, on, 'lastMinute', /0:30 left · re-warm/))
test('cold reaches a cold cache', LONG, async ($, on) => sees($, on, 'cold', /cache cold/))
test('unmeasured reaches the dash', async ($, on) => sees($, on, 'unmeasured', /cache –/))
test('warming reaches warming', async ($, on) => sees($, on, 'warming', /cache warming/))
test('nearCompaction reaches compaction', async ($, on) => sees($, on, 'nearCompaction', /compacts in ~/))
test('limit80 reaches 82%', async ($, on) => sees($, on, 'limit80', /82%!/))
test('fiveHourAhead reaches a pace', LONG, async ($, on) => sees($, on, 'fiveHourAhead', /full in ~/))
test('resetPassed reaches a passed reset', async ($, on) => sees($, on, 'resetPassed', /5h reset/))
test('gatewaySpend reaches the spend window', async ($, on) => sees($, on, 'gatewaySpend', /spend/))
test('notARepo draws no branch', async ($, on) => {
  expect(shown(await drawAs($, on, { scenario: 'notARepo', surface: 'terminal', appearance: 'dark', cols: 160, expanded: true }))).not.toMatch(/on main/)
})
```

- [ ] **Step 6: Run the tests until they pass**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS for the existing suite plus the new tests. Where a regex misses, read the drawn text (`shown(...)`) and fix the scenario's inputs, not the regex's meaning.

- [ ] **Step 7: Commit**

```bash
git add plugins/session-usage-band/tests/golden/hash.ts plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/golden-hash.test.ts plugins/session-usage-band/tests/helpers.ts
git commit -m "test: scenarios for every band state, and a stable tree hash

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The golden capture, its assertion, and the perf baseline

**Files:**
- Create: `tools/golden/capture.test.ts`
- Create: `tools/golden/capture.sh`
- Create: `plugins/session-usage-band/tests/golden/chips.ts` (generated)
- Create: `plugins/session-usage-band/tests/golden.test.ts`
- Create: `design/perf-baseline.md`

**Interfaces:**
- **Consumes:** `SCENARIO_NAMES`, `drawAs`, `treeHash` (Task 1).
- **Produces:**
  - `GOLDEN: Readonly<Record<string, string>>`, keyed `scenario|surface|appearance|cols|open`;
  - `GOLDEN_TREES: Readonly<Record<string, unknown>>`, about 10 full trees;
  - `goldenKey(...)`.

- [ ] **Step 1: Write the capture test** (outside `tests/`, so the normal run skips it)

```ts
// tools/golden/capture.test.ts — copied into the plugin's tests/ by
// capture.sh for one run; prints GOLDEN and PERF lines, never asserts.
import { test } from 'claude-code/testing'
import { SCENARIO_NAMES, drawAs, type Appearance, type Surface } from './matrix'
import { treeHash } from './golden/hash'
import { LONG, mountBand, setup, START, respond, resp } from './helpers'

const SURFACES: Surface[] = ['terminal', 'desktop']
const APPEARANCES: Appearance[] = ['dark', 'plain']
const WIDTHS = [40, 95, 200]
const FULL = new Set(['calm|terminal|dark|40|open', 'calm|desktop|dark|95|open', 'lastMinute|terminal|dark|40|shut',
  'cold|desktop|dark|200|open', 'nearCompaction|terminal|plain|95|open', 'fiveHourAhead|desktop|dark|40|shut',
  'gatewaySpend|desktop|dark|200|open', 'resetPassed|terminal|dark|95|open', 'notARepo|desktop|plain|200|open',
  'working|terminal|dark|200|shut'])

for (const scenario of SCENARIO_NAMES) {
  test(`golden ${scenario}`, LONG, async ($, on) => {
    for (const surface of SURFACES) for (const appearance of APPEARANCES) for (const cols of WIDTHS) for (const open of [false, true]) {
      const key = `${scenario}|${surface}|${appearance}|${cols}|${open ? 'open' : 'shut'}`
      const tree = await drawAs($, on, { scenario, surface, appearance, cols, expanded: open })
      console.log(`GOLDEN ${key} ${treeHash(tree)}`)
      if (FULL.has(key)) console.log(`TREE ${key} ${JSON.stringify(tree)}`)
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
  for (const surface of SURFACES) for (const open of [false, true]) {
    const ui = await mountBand($, surface, 200)
    if (open) await ui.press({ key: 'more' })
    for (let i = 0; i < 20; i++) await ui.redraw()
    const times: number[] = []
    for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); times.push(performance.now() - a) }
    times.sort((x, y) => x - y)
    console.log(`PERF chips ${surface} ${open ? 'open' : 'shut'} median=${times[100]?.toFixed(3)}ms p95=${times[190]?.toFixed(3)}ms`)
    await ui.unmount()
  }
})
```

**Important:** the capture must be generated from the code **before** any P1 change. Run it on the commit from Task 1.

- [ ] **Step 2: Write `tools/golden/capture.sh`**

This uses the same copy-in, run, grep and clean-up approach as `tools/demos/build.sh`.

```bash
#!/usr/bin/env bash
# Capture chips' golden trees from the code as it is now. Run only on a
# commit that has not changed how chips draws. Writes tests/golden/chips.ts.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"; OUT="$HERE/out"; mkdir -p "$OUT"
trap 'rm -f "$PLUGIN/tests/zz-golden-capture.test.ts"' EXIT
cp "$HERE/capture.test.ts" "$PLUGIN/tests/zz-golden-capture.test.ts"
claude plugin test "$PLUGIN" > "$OUT/capture.log" 2>&1 || { tail -30 "$OUT/capture.log"; exit 1; }
python3 - "$OUT/capture.log" "$PLUGIN/tests/golden/chips.ts" <<'EOF'
import json, re, sys
log, out = open(sys.argv[1]).read().splitlines(), sys.argv[2]
golden = dict(re.match(r'GOLDEN (\S+) (\S+)$', l).groups() for l in log if l.startswith('GOLDEN '))
trees = {m.group(1): json.loads(m.group(2)) for l in log if (m := re.match(r'TREE (\S+) (.+)$', l))}
assert len(golden) == 20 * 2 * 2 * 3 * 2, f'expected 480 cases, got {len(golden)}'
with open(out, 'w') as f:
    f.write('// Generated by tools/golden/capture.sh from the band as it drew before the\n')
    f.write('// layouts work. Frozen: a change here must be justified in review.\n\n')
    f.write('export const GOLDEN: Readonly<Record<string, string>> = ' + json.dumps(golden, indent=1, sort_keys=True) + '\n\n')
    f.write('export const GOLDEN_TREES: Readonly<Record<string, unknown>> = ' + json.dumps(trees, sort_keys=True) + '\n')
print(len(golden), 'cases,', len(trees), 'trees')
EOF
grep '^PERF' "$OUT/capture.log"
```

Then run: `chmod +x tools/golden/capture.sh && tools/golden/capture.sh`
Expected: `480 cases, 10 trees`, followed by the PERF lines. Add `tools/golden/out/` to `.gitignore`.

- [ ] **Step 3: Record the perf baseline**

Copy the PERF lines into `design/perf-baseline.md`, with the commit hash and a one-line note on `clockReal`. If `clockReal` is `false`, the spec's draw-time row drops, and the tree-size row is the budget.

- [ ] **Step 4: Write `tests/golden.test.ts`**

```ts
// Chips draws exactly what it drew before the layouts work: every captured
// case by hash, ten by full tree so a failure can be read.
import { test, expect } from 'claude-code/testing'
import { GOLDEN, GOLDEN_TREES } from './golden/chips'
import { treeHash, canon } from './golden/hash'
import { drawAs, type ScenarioName, type Surface, type Appearance } from './matrix'
import { LONG } from './helpers'

const parse = (key: string) => {
  const [scenario, surface, appearance, cols, open] = key.split('|')
  return { scenario: scenario as ScenarioName, surface: surface as Surface, appearance: appearance as Appearance, cols: Number(cols), expanded: open === 'open' }
}
const byScenario = new Map<string, string[]>()
for (const key of Object.keys(GOLDEN)) byScenario.set(key.split('|')[0] ?? '', [...(byScenario.get(key.split('|')[0] ?? '') ?? []), key])

for (const [scenario, keys] of byScenario) {
  test(`chips draws as before: ${scenario}`, LONG, async ($, on) => {
    for (const key of keys) expect(`${key} ${treeHash(await drawAs($, on, parse(key)))}`).toBe(`${key} ${GOLDEN[key]}`)
  })
}

for (const [key, tree] of Object.entries(GOLDEN_TREES)) {
  test(`chips draws as before, whole tree: ${key}`, LONG, async ($, on) => {
    expect(canon(await drawAs($, on, parse(key)))).toEqual(canon(tree))
  })
}

test('chips stored explicitly draws the same as nothing stored', LONG, async ($, on) => {
  const key = 'calm|desktop|dark|95|open'
  expect(treeHash(await drawAs($, on, { ...parse(key), layout: 'chips' }))).toBe(GOLDEN[key])
})
```

- [ ] **Step 5: Run the whole suite**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS. The golden suite is green against the code it was captured from, so it proves the capture is deterministic. The last test passes too, because the band ignores the unknown store key.

- [ ] **Step 6: Commit**

```bash
git add tools/golden plugins/session-usage-band/tests/golden plugins/session-usage-band/tests/golden.test.ts design/perf-baseline.md .gitignore
git commit -m "test: pin chips' drawing with a golden capture, and record its draw times

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P1: Foundation

### Task 3: Subagent turn starts no longer accumulate

**Files:**
- Modify: `hooks/insights.ts`, which gains `forgetTurn` and `openTurns`
- Modify: `hooks/register.tsx` (the `turn.complete` hook, around line 285)
- Test: `tests/insights.test.ts`

**Interfaces:**
- **Produces:**
  - `forgetTurn(turnId: string): void`
  - `openTurns(): number`, a read-only count used by the soak test.

- [ ] **Step 1: Write the failing test** (append to `tests/insights.test.ts`)

```ts
import { openTurns } from '../hooks/insights'
import { turn, setup, START } from './helpers'

test("a subagent's turn leaves no start cost behind", async ($, on) => {
  setup(on)
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 'sub-1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'sub-1', reason: 'answer', agentId: 'agent-1' })
  await turn($, 'main-1', 1, 2)
  expect(openTurns()).toBe(0)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, with `openTurns` not exported. Once it is exported, the assertion fails because `openTurns()` returns 1.

- [ ] **Step 3: Implement**

In `hooks/insights.ts`, after `noteTurnEnd`:

```ts
/** A turn that ends outside the main loop: its start cost is dropped, so a
 *  subagent's turns never build up. */
export const forgetTurn = (turnId: string): void => {
  state.turnStartCost.delete(turnId)
}

/** Turns started and not yet ended, for the soak test's bound. */
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

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/insights.ts plugins/session-usage-band/hooks/register.tsx plugins/session-usage-band/tests/insights.test.ts
git commit -m "fix: a subagent's turn no longer leaves its start cost behind

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Time formats and shared phrases

**Files:**
- Modify: `hooks/format.ts`
- Modify: `hooks/reading.ts`
- Test: `tests/format.test.ts`
- Test: `tests/phrases.test.ts` (new)

**Interfaces:**
- **Produces, in `format.ts`:**
  - `fmtSecondsLeft(ms): string`, returning `47s left`;
  - `fmtClock(ms, utcOffsetMin): string`, returning `14:32`;
  - `fmtDayClock(ms, utcOffsetMin, now): string`, returning `14:32` for the same day or `Mon 08:40` otherwise;
  - `FIVE_HOUR_MS`, `SEVEN_DAY_MS`.
- **Produces, in `reading.ts`:**
  - `resetPhrase(r: ResetIn, form: 'words' | 'glyph'): string`, returning `resets in 3h 00m` or `↻ in 3h 00m`, and `reset` when passed;
  - `paceText(p: { etaMs: number | null; projectedPct: number | undefined }): string`, returning `full in ~40m`, `full before reset`, `on pace for ~10%`, or `''`;
  - `AMBER`, the amber-phrase builders below;
  - `EMPTY`;
  - `altOf(name, value, state, estimate?)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/phrases.test.ts
import { test, expect } from 'claude-code/testing'
import { fmtClock, fmtDayClock, fmtSecondsLeft } from '../hooks/format'
import { AMBER, EMPTY, altOf, paceText, resetPhrase } from '../hooks/reading'

const T = Date.UTC(2026, 9, 9, 13, 40) // a Friday, 13:40 UTC

test('clock times are local and 24-hour', () => {
  expect(fmtClock(T, 0)).toBe('13:40')
  expect(fmtClock(T, 120)).toBe('15:40')
  expect(fmtClock(T, -330)).toBe('08:10')
})
test('a clock time on another day names the day', () => {
  expect(fmtDayClock(T + 3 * 3600_000, 0, T)).toBe('16:40')
  expect(fmtDayClock(T + 67 * 3600_000, 0, T)).toBe('Mon 08:40')
})
test('the last minute counts seconds, in words', () => {
  expect(fmtSecondsLeft(47_000)).toBe('47s left')
  expect(fmtSecondsLeft(400)).toBe('1s left')
})
test('a reset reads as a duration, never as a clock', () => {
  expect(resetPhrase({ kind: 'in', text: '3h 00m' }, 'words')).toBe('resets in 3h 00m')
  expect(resetPhrase({ kind: 'in', text: '3h 00m' }, 'glyph')).toBe('↻ in 3h 00m')
  expect(resetPhrase({ kind: 'passed' }, 'words')).toBe('reset')
})
test('pace speaks a measured rate first, then the average', () => {
  expect(paceText({ etaMs: 40 * 60_000, projectedPct: 50 })).toBe('full in ~40m')
  expect(paceText({ etaMs: null, projectedPct: 112 })).toBe('full before reset')
  expect(paceText({ etaMs: null, projectedPct: 9.6 })).toBe('on pace for ~10%')
  expect(paceText({ etaMs: null, projectedPct: undefined })).toBe('')
})
test('every amber phrase starts with "! " once, long and short', () => {
  const all = [
    AMBER.cache('47s left', '~$1.66'), AMBER.cacheShort('47s'),
    AMBER.context(0.93, 12_000), AMBER.contextShort(0.93), AMBER.contextNoCompaction(0.85),
    AMBER.limit('5h', 82), AMBER.limitPace('5h', '~40m'), AMBER.limitShort('5h', '~40m'),
  ]
  expect(all).toEqual([
    '! 47s left · re-warm ~$1.66', '! 47s',
    '! context 93% · compacts in ~12k', '! ctx 93%', '! context 85%',
    '! 5h 82%', '! 5h full in ~40m', '! 5h ~40m',
  ])
  for (const s of all) expect(s.match(/!/g)?.length).toBe(1)
})
test('empty states read like the band', () => {
  expect(EMPTY.costs).toBe("Costs show after Claude's next reply.")
  expect(EMPTY.history).toBe('History fills in as you use Claude.')
})
test('alt text uses words, never ~ or ↻', () => {
  expect(altOf('5h limit', '84% used', 'ahead of pace', 'full in 40 minutes')).toBe('5h limit 84% used, ahead of pace, about full in 40 minutes')
  expect(altOf('cache', '52 minutes left', 'warm')).toBe('cache 52 minutes left, warm')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, because the imports are missing.

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
```

Make `band.tsx`'s `LIMITS` use `FIVE_HOUR_MS` / `SEVEN_DAY_MS` in place of its literals. The values are the same.

- [ ] **Step 4: Implement in `reading.ts`**

Append:

```ts
// ---- shared phrases (the eight new layouts) ----------------------------------

/** A reset as a duration: words in sentences, the glyph on chips and tiles. */
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

const pct = (frac: number): string => `${Math.round(frac * 100)}%`

/** What an amber reading says, long and short, always led by one `! `. */
export const AMBER = {
  cache: (left: string, estimate: string) => `! ${left} · re-warm ${estimate}`,
  cacheShort: (secs: string) => `! ${secs}`,
  context: (frac: number, toCompact: number) => `! context ${pct(frac)} · compacts in ~${fmtTokens(toCompact)}`,
  contextShort: (frac: number) => `! ctx ${pct(frac)}`,
  contextNoCompaction: (frac: number) => `! context ${pct(frac)}`,
  limit: (name: string, percentUsed: number) => `! ${name} ${Math.round(percentUsed)}%`,
  limitPace: (name: string, eta: string) => `! ${name} full in ${eta}`,
  limitShort: (name: string, eta: string) => `! ${name} ${eta}`,
} as const

export const EMPTY = {
  costs: "Costs show after Claude's next reply.",
  history: 'History fills in as you use Claude.',
} as const

/** What a screen reader hears for a drawn reading: words, no symbols. */
export const altOf = (name: string, value: string, state: string, estimate?: string): string =>
  `${name} ${value}, ${state}${estimate === undefined ? '' : `, about ${estimate}`}`
```

Add `fmtEta` to the `./format` import, and `type ResetIn` from `./format`.

- [ ] **Step 5: Run the tests**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS, golden included.

- [ ] **Step 6: Commit**

```bash
git add plugins/session-usage-band/hooks/format.ts plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/tests/phrases.test.ts
git commit -m "feat: clock times and the shared words the new layouts speak

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Extract `readingsOf`, and chips draws from it

**Files:**
- Modify: `hooks/reading.ts`, which gains `Readings`, `LimitView` and `readingsOf`
- Modify: `hooks/band.tsx`, where the computations move out and are replaced by reads of `read`
- Test: `tests/readings.test.ts` (new)

**Interfaces:**
- **Consumes:** Task 4's constants and phrases.
- **Produces** (exact):

```ts
export type Glyphs = 'unicode' | 'ascii'
export type LimitView = Readonly<{
  name: string; key: '5h' | '7d' | 'other'; reading: LimitReading; windowMs: number | undefined
  etaMs: number | null; reset: ResetIn | undefined; passed: boolean; frac: number; tone: Tone
  value: string; gone: number | undefined; projectedPct: number | undefined
  /** The card's tail, exactly as chips prints it: ' · full in ~40m', ' · full before reset', ' · on pace for ~50%' or ''. */
  cardPace: string
  /** The same pace for the new layouts, from paceText: 'on pace for ~50%' etc. */
  pace: string
}>
export type Readings = Readonly<{
  frame: Readonly<{ expanded: boolean; maxRows: number; now: number; columns: number; isWorking: boolean; glyphs: Glyphs; utcOffsetMin: number | undefined }>
  cache: Readonly<{ raw: BandSnapshot['cache']; mood: CacheMood; copy: CacheCopy; estimate: string; tone: Tone; charge: number; measured: boolean; known: boolean }>
  spend: Readonly<{ totalUsd: number; lastTurnUsd: number | null; sent: number; back: number; cached: number; total: number; breakdown: string }>
  context: ReturnType<typeof contextReading> & Readonly<{ raw: BandSnapshot['context'] }>
  fiveHour: LimitView | undefined
  sevenDay: LimitView | undefined
  limits: ReadonlyArray<LimitView>
  worstLimit: LimitView | undefined
  workspace: BandSnapshot['workspace']
}>
export const readingsOf = (snap: BandSnapshot): Readings
```

- **Snapshot fields:** `glyphs` and `utcOffsetMin` are read from the snapshot, which gains them in Task 10. Until then, `readingsOf` reads `(snap as { glyphs?: Glyphs }).glyphs ?? 'unicode'`, and Task 10 replaces that with the typed field. Rather than casting, add both fields to `BandSnapshot` in this task, optional: `glyphs?: Glyphs; utcOffsetMin?: number`. Task 10 makes them required.
- **Where `Glyphs` lives:** it is declared in `snapshot.ts`, because the contract owns it, and re-exported from `reading.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/readings.test.ts
import { test, expect } from 'claude-code/testing'
import { readingsOf } from '../hooks/reading'
import type { BandSnapshot } from '../hooks/snapshot'
import { DARK } from '../hooks/palette'

const snap = (over: Partial<BandSnapshot> = {}): BandSnapshot => ({
  surface: 'terminal', columns: 120, maxRows: 13, isWorking: false, expanded: false, palette: DARK, now: 0,
  cache: { requests: 1, msLeft: 52 * 60_000, ttl: '1h', ttlPinned: true, window: 155_000, hitRatio: 0.96, misses: 0, reWarmUsd: 1.66,
    savedUsd: 11.4, readShare: 0.05, fresh: true, recalled: false, idleMs: null, tokens: { sent: 18_000, back: 9_000, cached: 198_000 } },
  costUsd: 3.19, lastTurnUsd: 0.21,
  context: { tokens: 76_000, window: 200_000, percent: 38, compactAt: 190_000 },
  fiveHour: { percentUsed: 4, resetsAt: new Date(3 * 3600_000).toISOString(), etaMs: null },
  sevenDay: { percentUsed: 30, resetsAt: new Date(67 * 3600_000).toISOString() },
  otherLimits: [], workspace: undefined, ...over,
})

test('readings name every limit with its tone, value, reset and pace', () => {
  const r = readingsOf(snap())
  expect(r.fiveHour?.value).toBe('4%')
  expect(r.fiveHour?.reset).toEqual({ kind: 'in', text: '3h 00m' })
  expect(r.sevenDay?.projectedPct).toBeCloseTo(30 / (1 - 67 / 168), 5)
  expect(r.sevenDay?.pace).toBe('on pace for ~50%')
  expect(r.sevenDay?.cardPace).toBe(' · on pace for ~50%')
  expect(r.worstLimit?.name).toBe('7d')
  expect(r.limits.map(l => l.name)).toEqual(['5h', '7d'])
})
test('a measured 5h fill sets its projection to 100', () => {
  const r = readingsOf(snap({ fiveHour: { percentUsed: 84, resetsAt: new Date(70 * 60_000).toISOString(), etaMs: 40 * 60_000 } }))
  expect(r.fiveHour?.projectedPct).toBe(100)
  expect(r.fiveHour?.tone).toBe('amber')
  expect(r.fiveHour?.pace).toBe('full in ~40m')
})
test('a gateway spend limit is a limit view named spend', () => {
  const r = readingsOf(snap({ otherLimits: [{ kind: 'spend_limit', percentUsed: 92, resetsAt: undefined }] }))
  expect(r.limits.at(-1)?.name).toBe('spend')
  expect(r.limits.at(-1)?.tone).toBe('amber')
})
test('the cache reading carries its mood, words and charge', () => {
  const r = readingsOf(snap())
  expect(r.cache.mood).toBe('warm')
  expect(r.cache.copy.pill(false)).toBe('cache 52m')
  expect(r.cache.estimate).toBe('~$1.66')
  expect(r.spend.total).toBe(225_000)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, because `readingsOf` is not exported.

- [ ] **Step 3: Implement `readingsOf` in `reading.ts` by moving code out of `band.tsx`**

Move each computation word for word:

| From `band.tsx` | Into `readingsOf` |
| --- | --- |
| 182–186 | `mood`, `copy`, `estimate`, `cacheTone`, `charge` |
| 188–189 | the token breakdown and total |
| 191–200 | `contextReading` |
| 312–314 | the `windowGone`, `hasReset` and `limitTone` wrappers, now internal |
| 556–557 | `measured`, `known` |
| 616–627 | the `windows` list, with `LIMITS[...].windowMs` replaced by `FIVE_HOUR_MS` / `SEVEN_DAY_MS` |
| 633–651 | per window: `projected` and the card's `pace` string |
| 674 | `worst` → `worstLimit` |

**Card pace string.** Today the card builds `pace` as `' · full in …'`, `' · full before reset'`, `' · on pace for ~N%'` or `''`. Keep that exact card string as `cardPace`, with its leading `' · '`, so chips is unchanged. `pace` is `paceText(...)` (Task 4), the new layouts' form without the separator.

**Projection when a 5h fill is measured.** Set `projectedPct = 100` when `etaMs !== null`. Otherwise use `gone === undefined || gone < 0.05 ? undefined : percentUsed / gone`.

- [ ] **Step 4: Make `band.tsx` read from `read`**

At the top of `drawBand`, add `const read = readingsOf(snap)`. Then replace each moved local with its `read.` field:
- `mood` → `read.cache.mood`
- `copy` → `read.cache.copy`
- `ctxPct` → `read.context.pct`
- the `windows` → `read.limits`
- and so on for every moved local.

Delete only the moved lines. Leave drawing code alone.

- [ ] **Step 5: Run the tests, golden first**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS: the golden suite, the existing suite, and `readings.test.ts`.

A golden failure means a moved line changed meaning. Diff the moved code against `git show HEAD:plugins/session-usage-band/hooks/band.tsx`, fix it, and never touch the golden file.

- [ ] **Step 6: Type-check and commit**

Run: `npx -y -p typescript@5 tsc -p plugins/session-usage-band`
Expected: no errors.

```bash
git add plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/hooks/snapshot.ts plugins/session-usage-band/tests/readings.test.ts
git commit -m "refactor: every fact the band shows comes from one readings model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Rows and widths for multi-row layouts

**Files:**
- Modify: `hooks/layout.ts`
- Test: `tests/layout.test.ts`

**Interfaces:**
- **Produces:**
  - `ROW_PX = 24`;
  - `cellsOf` now measures a Box with `flexDirection: 'column'` as its widest child, not their sum;
  - `squeezeRow(build, steps, room, m)`, an alias of `squeezeToFit` named for per-row use, exported for views.

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

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL: 9 is not 6, and `ROW_PX` is not exported.

- [ ] **Step 3: Implement**

In `cellsOf`'s `'Box' | 'Text'` branch, before computing `own`:

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

/** One row of a multi-row layout, squeezed on its own: the smallest squeeze
 *  at which it fits. A step that names nothing in the row changes nothing. */
export const squeezeRow = squeezeToFit
```

- [ ] **Step 4: Run the tests**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS, golden included. Chips never measures a column Box, so its trees don't change. If golden fails, a chips measurement did cross a column Box: find it, and fix the measurement there rather than reverting.

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
- Test: `tests/charts.test.ts`

**Interfaces:**
- **Produces:** each builder takes `kit` first and returns a `RenderChildren`. On the desktop it draws an Svg with `alt` and `width`; elsewhere, text. Every builder takes a `key`.

```ts
export type MeterOptions = Readonly<{ key?: string; label: string; frac: number; tone: Tone; accent: string; size?: BarSize; stretch?: boolean; reads?: 'used' | 'left'; tick?: number; projectTo?: number }>
export const meter: (kit: Kit, o: MeterOptions) => RenderChildren
export const ring: (kit: Kit, o: Readonly<{ key: string; alt: string; frac: number; color: string; px: number; dot?: number; centre?: string }>) => RenderChildren
export const sparkline: (kit: Kit, o: Readonly<{ key: string; alt: string; values: readonly number[]; color: string; px: number; height: number; projectTo?: number }>) => RenderChildren
export const barChart: (kit: Kit, o: Readonly<{ key: string; alt: string; values: readonly number[]; marked: readonly boolean[]; color: string; markColor: string; px: number; height: number }>) => RenderChildren
export const dayCells: (kit: Kit, o: Readonly<{ key: string; alt: string; values: ReadonlyArray<number | undefined>; today: number; color: string; cellPx: number; height: number; labels?: readonly string[] }>) => RenderChildren
export const braille: (values: readonly number[], max: number) => string
export const underline: (kit: Kit, o: Readonly<{ key: string; alt: string; frac: number; color: string; px: number; dashed?: boolean }>) => RenderChildren
// icons.ts gains 'sun', 'cloud' and 'snow' (Icon, ICON_PATHS, GLYPH '' (words carry them), ALT)
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/charts.test.ts
import { test, expect } from 'claude-code/testing'
import { braille } from '../hooks/charts'

test('braille puts two values in a cell, four heights each', () => {
  expect(braille([0, 0], 4)).toBe('⠀')
  expect(braille([4, 4], 4)).toBe('⣿')
  expect(braille([1, 0], 4)).toBe('⡀')
  expect(braille([0, 1], 4)).toBe('⢀')
  expect(braille([4, 0, 2], 4)).toBe('⡇⡄')
  expect([...braille([1, 2, 3, 4, 3, 2], 4)].length).toBe(3)
})
test('braille is one column everywhere: every glyph is in U+2800–28FF', () => {
  for (const ch of braille([0, 1, 2, 3, 4, 3, 2, 1], 4)) expect(ch.codePointAt(0)! >= 0x2800 && ch.codePointAt(0)! <= 0x28ff).toBe(true)
})
```

Desktop Svg output is checked through a mounted chips draw: the meter keeps its golden trees. P2 views test their own uses of `ring`, `sparkline`, `barChart` and `dayCells`. Add one shape test per builder here, each asserting the `alt`, the `width`, and that the source has no `id=`:

```ts
import { makeKit } from '../hooks/kit'
import { ring, sparkline, barChart, dayCells } from '../hooks/charts'
import { DARK } from '../hooks/palette'
const desk = makeKit({ Box: () => null, Text: () => null, Button: () => null, Svg: (p: unknown) => ({ type: 'Svg', props: p }) } as never, { surface: 'desktop', palette: DARK, columns: 120 } as never)
for (const [name, el] of [
  ['ring', ring(desk, { key: 'r', alt: 'cache 87% left', frac: 0.87, color: '#7fcf8a', px: 30 })],
  ['sparkline', sparkline(desk, { key: 's', alt: '5h last hour', values: [1, 2, 3], color: '#7fcf8a', px: 90, height: 22 })],
  ['barChart', barChart(desk, { key: 'b', alt: 'costs', values: [1, 2, 9], marked: [false, false, true], color: '#888', markColor: '#eee', px: 60, height: 22 })],
  ['dayCells', dayCells(desk, { key: 'd', alt: 'week', values: [6, 9, 11, 4, undefined, undefined, undefined], today: 3, color: '#a99cf0', cellPx: 16, height: 16 })],
] as const) {
  test(`${name} draws one Svg with alt, width and no ids`, () => {
    const n = el as { props: { alt: string; width: number; source: string } }
    expect(n.props.alt.length).toBeGreaterThan(0)
    expect(n.props.width).toBeGreaterThan(0)
    expect(n.props.source).not.toMatch(/\bid=|<clipPath|<linearGradient|<pattern/)
  })
}
```

The element constructors depend on how the engine builds elements. If `makeKit` with fakes doesn't give plain objects, mount a tiny probe through `mountBand` instead. Either way, the assertions stay as above.

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, because `../hooks/charts` is missing.

- [ ] **Step 3: Implement `hooks/charts.tsx`**

1. **Move `meter`.** Move it word for word from `band.tsx:130-179` into `charts.tsx` as `meter(kit, o)`. Keep every Svg string identical when `tick` and `projectTo` are absent, so golden holds.
2. **Add `tick` and `projectTo`** on both surfaces:
   - **desktop `tick`:** append, after the thumb, a rect of width `2*k` at `x = tick*width − k`, `y=-1`, height `tall+2`, filled `palette.value`, with a 1 px `stroke` in the ground colour (`palette.cardBg`) for the knockout;
   - **desktop `projectTo`:** a line from the fill's end to `projectTo*width` at `y=4`, with `stroke-dasharray="3 2"` in `fill`, at full opacity;
   - **text `tick`:** `│` at its cell;
   - **text `projectTo`:** `▒` cells between the fill and `projectTo`.
3. **`ring`:**
   - **desktop:** a track circle and an arc via `stroke-dasharray`, as on the canvas Rings artboard. An optional `dot` (0–1) marks the window gone, with a ground-colour knockout ring of `r+1`. An optional `centre` is drawn as text with `font-family="system-ui, sans-serif"`.
   - **text:** `meter(kit, { label: alt, frac, tone: 'calm', accent: color })`.
4. **`sparkline`:**
   - **desktop:** a polyline over `px × height`, with the last point as a dot. When `projectTo` is set, a dashed line from the last point to `projectTo`.
   - **text:** `braille(values, 4)` in `color`.
5. **`barChart`:**
   - **desktop:** a rect per value, 4 px wide with a 2 px gap. Bars where `marked` is true are filled `markColor` and get a 2 px cap above them.
   - **text:** `braille`.
5b. **`underline`:**
   - **desktop:** a 4 px tall Svg of width `px`: a track in `palette.meterTrack` and a fill of `frac × px` in `color`. With `dashed`, the fill is a 2 px dashed line at full opacity.
   - **text:** nothing (`null`). Terminal tiles have no underline.
5c. **Icons:** add `sun`, `cloud` and `snow` to `hooks/icons.ts`, as 16-unit stroke paths copied from the canvas Forecast artboard. Give them `GLYPH` `''` (the terminal says the word) and `ALT` `'warm'`, `'cooling'` and `'cold'`.
6. **`dayCells`:**
   - **desktop:** a rect per value, outlined in `palette.trackStroke` and filled from the bottom by `value / max`. `undefined` draws a dashed outline. The `today` index gets a 2 px outline in `palette.value`.
   - **desktop `labels`:** when given, each cell's label is drawn under it as Svg text (`font-family="system-ui, sans-serif"`, 9 px). The Svg's height grows by 11 px.
   - **text:** one braille cell per value (left column only: `braille([v ?? 0, 0], max)`), `·` for an `undefined` future value, and today's cell wrapped in `[` `]`. Labels are not drawn in text; the view draws them on its own line.
7. **`braille`:**

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

- [ ] **Step 4: Run the tests, golden first**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS. Golden is unchanged, because the meter's strings are identical with no new options.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/charts.tsx plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/tests/charts.test.ts
git commit -m "feat: chart builders for the layouts, with braille for the terminal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 8: Glyph tiers

**Files:**
- Create: `hooks/glyphs.ts`
- Modify: `hooks/register.tsx` (resolve the tier at `session.start`)
- Modify: `hooks/snapshot.ts` (`glyphs` field)
- Modify: `hooks/band.tsx` (apply `asciiTree` on the terminal)
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
- **Cost if wrong:** slightly terser ascii text.
- Update spec §3.2 in this task's commit to match.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/glyphs.test.ts
import { test, expect } from 'claude-code/testing'
import { ASCII_MAP, asciiText, resolveGlyphs } from '../hooks/glyphs'
import { drawAs } from './matrix'
import { textOf, widthOf, firstRow } from './helpers'

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
test('ascii text is pure ASCII', () => {
  expect(asciiText('◷ cache 52m · ↻ 3h 00m Σ 225k ↑2 ↓1 cache – ●… █░▒│▿▵■')).toMatch(/^[\x20-\x7e]*$/)
})
test('chips in the ascii tier draws only ASCII and no wider than unicode', async ($, on) => {
  const uni = await drawAs($, on, { scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 120 })
  const asc = await drawAs($, on, { scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 120, env: { CC_BAND_GLYPHS: 'ascii' } })
  expect(textOf(asc)).toMatch(/^[\x20-\x7e]*$/)
  expect(widthOf(firstRow(asc))).toBeLessThanOrEqual(widthOf(firstRow(uni)))
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test plugins/session-usage-band`
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

export const asciiText = (s: string): string =>
  [...s].map(ch => (ch in ASCII_MAP ? ASCII_MAP[ch] : ch.charCodeAt(0) < 0x80 ? ch : '')).join('').replace(/ {2,}/g, ' ')

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

- **Double spaces:** the collapse of double spaces must not change a row's width upward, and it never does. The final `replace` only narrows.
- **If the strip uses a glyph** missing from the table, add it to `ASCII_MAP` and to the pure-ASCII test.

- [ ] **Step 4: Wire it**

1. **`snapshot.ts`:** `glyphs: Glyphs` becomes required, alongside `export type Glyphs = 'unicode' | 'ascii'`.
2. **`register.tsx`:** at `session.start`, set `band.glyphs = resolveGlyphs({ CC_BAND_GLYPHS: await $.env.get('CC_BAND_GLYPHS'), LC_ALL: await $.env.get('LC_ALL'), LC_CTYPE: await $.env.get('LC_CTYPE'), LANG: await $.env.get('LANG') })`, with `glyphs: 'unicode'` as the default in `band`. Pass `glyphs: band.glyphs` into the snapshot.
3. **`band.tsx`:** at the end of `drawBand`, `return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree`.

- [ ] **Step 5: Run the tests**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS. Golden is unchanged, because the capture's env sets no locale and no `CC_BAND_GLYPHS`.

- [ ] **Step 6: Commit,** including the spec §3.2 update

```bash
git add plugins/session-usage-band/hooks/glyphs.ts plugins/session-usage-band/hooks/snapshot.ts plugins/session-usage-band/hooks/register.tsx plugins/session-usage-band/hooks/band.tsx plugins/session-usage-band/tests/glyphs.test.ts design/2026-10-09-band-layouts-spec.md
git commit -m "feat: an ascii glyph tier for CJK locales and CC_BAND_GLYPHS=ascii

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 9: Shared parts, the expanded frame, and chips as a view

**Files:**
- Create: `hooks/views/parts.tsx` (`pill`, `batteryIcon`, `textBattery`, `cachePill`, and the `PillSpec` type)
- Create: `hooks/views/frame.tsx`
- Create: `hooks/views/chips.tsx`
- Modify: `hooks/band.tsx`
- Test: `tests/frame.test.ts`

**Interfaces:**
- **Consumes:** `Readings` (T5), `meter` (T7), `kit`.
- **Produces:**

```ts
// parts.tsx
export type PillSpec = Readonly<{ key: string; tone: Tone; body: RenderChildren[]; hover?: string; paintsOwnBg?: boolean; bg?: string }>
export const parts: (kit: Kit, read: Readings) => Readonly<{
  pill: (spec: PillSpec, anchor: 'left' | 'right') => RenderElement
  batteryIcon: () => RenderChildren
  textBattery: (text: string) => RenderChildren[]
  cachePill: (short: boolean) => PillSpec   // hover set: only chips passes it on
}>
// frame.tsx
export const bodyRowsFor: (maxRows: number, collapsedRows: number, stripRows: number) => number  // max(0, maxRows − collapsedRows − 3 − stripRows)
export const frame: (kit: Kit, read: Readings, act: BandActions, o: Readonly<{ collapsedRows: number; body: (bodyRows: number) => RenderChildren[]; strip?: (place: 'top' | 'footer', room: number) => RenderChildren }>) => RenderChildren[]
export const toggleButton: (kit: Kit, read: Readings, act: BandActions) => RenderElement          // ▿/▵ exactly as chips draws it
export const panel: (kit: Kit, key: string, children: RenderChildren[]) => RenderElement           // column Box on cardBg (filled palettes), paddingX 1
export const line: (kit: Kit, key: string, pieces: RenderChildren[], end?: RenderChildren, gap?: number) => RenderElement // nowrap row, columnGap `gap` (default 2), air, then `end`
export const lineRoom: (kit: Kit) => number                                                        // columns − ROW_SLACK − 2 (the panel's padding)
export const fitLine: <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: (p: P) => boolean) => RenderElement) => RenderElement
export const words: (kit: Kit, key: string, parts: ReadonlyArray<readonly [string, 'label' | 'value' | 'amber' | 'accent5' | 'accent7']>, bold?: boolean) => RenderElement
export const openView: (kit: Kit, read: Readings, act: BandActions, collapsed: RenderElement, collapsedRows: number, body: (bodyRows: number) => RenderChildren[]) => RenderElement
// chips.tsx
export const chipsView: View
```

- **`View`:** declared in `hooks/views/index.ts` (Task 10). Until Task 10, `chips.tsx` exports `drawChips(kit, read, act)` and `chipsView` is assembled in Task 10.
- **Hover:** `pill` draws a hover card only when `spec.hover` is set. Chips passes `hover`; other views don't.

- [ ] **Step 1: Write the failing test**

```ts
// tests/frame.test.ts
import { test, expect } from 'claude-code/testing'
import { bodyRowsFor } from '../hooks/views/frame'

test('the body gets what is left of the rows, never less than none', () => {
  expect(bodyRowsFor(13, 1, 1)).toBe(8)
  expect(bodyRowsFor(13, 2, 1)).toBe(7)
  expect(bodyRowsFor(4, 2, 1)).toBe(0)
  expect(bodyRowsFor(4, 2, 0)).toBe(0)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, because the module is missing.

- [ ] **Step 3: Move code**

1. **`band.tsx:88-128`:** `PillSpec` and `pill`, into `parts.tsx`. `hover` becomes optional, and the hover card renders only when `hover !== undefined`.
2. **`band.tsx:202-263`:** the battery and cache pill, into `parts.tsx`.
3. **`band.tsx:47-81`:** `LIMITS`, `limitChip`, `buildPills`, `rowOf`, `expandedView`, everything chips-specific. Move into `chips.tsx` as `drawChips(kit, read, act)`, a function body equal to today's `drawBand` minus the moved helpers. It uses `parts(kit, read)`.
4. **`frame.tsx`:** write `bodyRowsFor`. Write `frame` to place the strip on top when `bodyRowsFor(…, 1) >= 1`, else in the footer, then `body(bodyRows)` and the buttons row. The buttons row matches chips' (`band.tsx:687-713` before the move). Chips keeps its own expanded layout: `frame` is for the new views.
4b. **`frame.tsx` helpers,** which every new view uses. Write them exactly:

```tsx
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
/** One collapsed line: pieces, then air, then the toggle or nothing. Never wraps. */
export const line = (kit: Kit, key: string, pieces: RenderChildren[], end?: RenderChildren, gap = 2): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={gap}>{pieces}<Box key="air" flexGrow={1} />{end ?? null}</Box>
}
export const lineRoom = (kit: Kit): number => kit.columns - ROW_SLACK - 2
/** A line squeezed by its give-way order: at squeeze s, a piece is kept while s is not past it. */
export const fitLine = <P extends string>(kit: Kit, order: readonly P[], room: number, build: (keeps: (p: P) => boolean) => RenderElement): RenderElement =>
  squeezeRow(s => build(p => keepsIn(order)(s, p)), order.length, room, kit.measure)
/** Words in their roles' colours, one Text: the band's way to say a reading. */
export const words = (kit: Kit, key: string, parts: ReadonlyArray<readonly [string, 'label' | 'value' | 'amber' | 'accent5' | 'accent7']>, bold = false): RenderElement => {
  const { Text, palette } = kit
  const color = { label: palette.label, value: palette.value, amber: palette.amberFg, accent5: palette.fiveAccent, accent7: palette.weekAccent } as const
  return <Text key={key} bold={bold}>{parts.map(([t, role], i) => <Text key={String(i)} color={color[role]}>{t}</Text>)}</Text>
}
/** The whole view: its collapsed panel, and the frame beneath it when open. */
export const openView = (kit: Kit, read: Readings, act: BandActions, collapsed: RenderElement, collapsedRows: number, body: (bodyRows: number) => RenderChildren[]): RenderElement => {
  const { Box } = kit
  return <Box flexDirection="column">{collapsed}{read.frame.expanded ? frame(kit, read, act, { collapsedRows, body }) : null}</Box>
}
```

Add to `tests/frame.test.ts`, through a mounted band (Task 10 makes it reachable), a test that `toggleButton` gives the same Button props as chips' toggle. Assert it in Task 10's tests, because the views registry is needed to mount a non-chips view.

5. **`band.tsx`:** becomes:

```ts
export const drawBand = (el: ElementTable, snap: BandSnapshot, act: BandActions): RenderElement => {
  const kit = makeKit(el, snap)
  const read = readingsOf(snap)
  const tree = drawChips(kit, read, act)
  return snap.surface === 'terminal' && snap.glyphs === 'ascii' ? asciiTree(tree) : tree
}
```

- [ ] **Step 4: Run the tests, golden first**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS. Golden is unchanged. If it fails, compare the moved code with `git show HEAD:…/band.tsx`.

- [ ] **Step 5: Validate, type-check and commit**

Run:
- `claude plugin validate plugins/session-usage-band`, which must resolve imports from `hooks/views/`;
- then the tsc command from Global Constraints.

Expected: both clean. If validate can't follow the subfolder, stop and report: the spec's file layout assumes it can.

```bash
git add plugins/session-usage-band/hooks
git add plugins/session-usage-band/tests/frame.test.ts
git commit -m "refactor: chips becomes a view, with shared parts and an expanded frame

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 10: The registry, the command, and persistence

**Files:**
- Create: `hooks/views/index.ts` (`View`, `VIEWS`)
- Create: eight stub files `hooks/views/{gauges,ledger,rings,pulse,tiles,week,departures,forecast}.tsx`
- Modify: `hooks/snapshot.ts`: `LAYOUT_NAMES`, `LayoutName`, `DEFAULT_LAYOUT`, the `layout` field; `utcOffsetMin` becomes required as `number | undefined`
- Modify: `hooks/memory.ts`: `LAYOUT_KEY`, `LIMIT_SAMPLES_KEY`, `asLayoutName`
- Modify: `hooks/register.tsx`: `band.layout`, `band.utcOffsetMin`, the command, the reads
- Modify: `hooks/band.tsx`: dispatch and fallback
- Test: `tests/layout-command.test.ts` (new)

**Interfaces:**
- **Produces:**

```ts
// snapshot.ts
export const LAYOUT_NAMES = ['chips', 'gauges', 'ledger', 'rings', 'pulse', 'tiles', 'week', 'departures', 'forecast'] as const
export type LayoutName = (typeof LAYOUT_NAMES)[number]
export const DEFAULT_LAYOUT: LayoutName = 'chips'
// BandSnapshot gains: layout: LayoutName; utcOffsetMin: number | undefined
// views/index.ts
export type View = Readonly<{ name: LayoutName; rows: Readonly<{ desktop: number; terminal: number }>; draw: (kit: Kit, read: Readings, act: BandActions) => RenderElement }>
export const VIEWS: Readonly<Record<LayoutName, View>>
// memory.ts
export const LAYOUT_KEY = 'layout'
export const LIMIT_SAMPLES_KEY = 'limitSamples'
export const asLayoutName: (v: unknown) => LayoutName | undefined   // trims, lowercases; undefined unless exactly one name
```

- **Stubs:** each is `export const <name>View: View = { name: '<name>', rows: { desktop: <spec §1>, terminal: <spec §1> }, draw: drawChips }`. They declare the spec's rows; `viewSuite` (Task 11) is not run on them until their own P2 or P3 task.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/layout-command.test.ts
import { test, expect } from 'claude-code/testing'
import { asLayoutName } from '../hooks/memory'
import { VIEWS } from '../hooks/views/index'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { setup, START, mountBand, engine, shown } from './helpers'

const run = ($: Parameters<Parameters<typeof test>[1]>[0], args: string) =>
  $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
const reply = (r: unknown) => String((r as { text?: string })?.text ?? '')

test('every layout name has a view', () => {
  expect(Object.keys(VIEWS).sort()).toEqual([...LAYOUT_NAMES].sort())
})
test('asLayoutName takes a name in any case and spacing, and nothing else', () => {
  expect(asLayoutName('  Ledger ')).toBe('ledger')
  expect(asLayoutName('ledger extra')).toBeUndefined()
  for (const v of [42, null, {}, [], 'sparkle', '']) expect(asLayoutName(v)).toBeUndefined()
})
test('/usage-band layout lists the layouts and names the current one', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(reply(await run($, 'layout'))).toBe('Usage band layout: chips. Choose one: chips, gauges, ledger, rings, pulse, tiles, week, departures, forecast.')
})
test('/usage-band layout <name> saves it, says how back, and redraws', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(reply(await run($, 'layout Pulse'))).toBe('Usage band layout: pulse. /usage-band layout chips goes back.')
  expect(engine.store.layout).toBe('pulse')
  expect(reply(await run($, 'layout chips'))).toBe('Usage band layout: chips.')
})
test('an unknown name changes nothing and lists the names', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(reply(await run($, 'layout sparkle-sparkle-sparkle-sparkle'))).toMatch(/^Unknown layout ".{1,20}"\. Choose one: chips, /)
  expect(engine.store.layout).toBeUndefined()
})
test('extra words after the name are unknown', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(reply(await run($, 'layout  Ledger  extra'))).toMatch(/^Unknown layout/)
})
test('nothing stored, nothing written', async ($, on) => {
  setup(on); await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110); await ui.drawn(); await ui.unmount()
  expect('layout' in engine.store).toBe(false)
})
test('a stored layout this version doesn\'t know draws chips', async ($, on) => {
  setup(on, { store: { layout: 'sparkle' } }); await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  expect(shown(await ui.drawn())).toMatch(/\$2\.41/); await ui.unmount()
})
test('a stored layout that isn\'t a string draws chips', async ($, on) => {
  setup(on, { store: { layout: 42 } }); await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  expect(shown(await ui.drawn())).toMatch(/\$2\.41/); await ui.unmount()
})
test('setting a layout shows a hidden band', async ($, on) => {
  setup(on); await $.session.start(START)
  const ui = await mountBand($, 'terminal', 110)
  await run($, 'hide'); await run($, 'layout ledger')
  expect(shown(await ui.drawn())).toMatch(/\$2\.41/); await ui.unmount()
})
test('the usage line keeps its bracket and adds the layout hint', async ($, on) => {
  setup(on); await $.session.start(START)
  expect(reply(await run($, 'nope'))).toBe('Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>')
})
test("another session's layout is drawn after this session's next turn", async ($, on) => {
  setup(on); await $.session.start(START)
  engine.store.layout = 'ledger'
  await $.turn.start({ text: 'hi', turnId: 'x' }); await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 'x', reason: 'answer' })
  const { band } = await import('../hooks/register') as never as { band?: { layout?: string } }
  expect(band?.layout ?? 'ledger').toBe('ledger')
})
test('a view that throws falls back to chips', async ($, on) => {
  const views = VIEWS as unknown as Record<string, { draw: unknown }>
  const real = views.ledger!.draw
  views.ledger!.draw = () => { throw new Error('boom') }
  try {
    setup(on, { store: { layout: 'ledger' } }); await $.session.start(START)
    const ui = await mountBand($, 'terminal', 110)
    expect(shown(await ui.drawn())).toMatch(/\$2\.41/); await ui.unmount()
  } finally { views.ledger!.draw = real }
})
```

**About the "another session" test.** If `band` isn't exported, assert the observable effect instead: give the `ledger` stub a distinguishing drawable once it exists in P2. Until then, check `engine.store` was read after `turn.complete`, by spying the `store.get` handler with a counter. Write that version:

```ts
let reads = 0
on('store.get', ($, e) => { if (e.key === 'layout') reads++; return { value: engine.store[e.key] } })
```

The helpers' handler is registered first, so wrap `setup` and register this one after it. Expect `reads` to be at least 2 after the turn completes.

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test plugins/session-usage-band`
Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

1. **`memory.ts`:**

```ts
export const LAYOUT_KEY = 'layout'
export const LIMIT_SAMPLES_KEY = 'limitSamples'
/** A layout's name from the store or the command: trimmed, any case; anything
 *  else, including a name from a newer version, is undefined. */
export const asLayoutName = (v: unknown): LayoutName | undefined => {
  if (typeof v !== 'string') return undefined
  const word = v.trim().toLowerCase()
  return (LAYOUT_NAMES as readonly string[]).includes(word) ? (word as LayoutName) : undefined
}
```

2. **`register.tsx`:**
   - **State:** `band` gains `layout: LayoutName` (default `DEFAULT_LAYOUT`) and `utcOffsetMin: number | undefined`.
   - **`readLayout`:** `const readLayout = async ($) => { band.layout = asLayoutName(await $.store.get(LAYOUT_KEY).catch(() => undefined)) ?? DEFAULT_LAYOUT }`. Call it in `session.start` and after `turn.complete`'s main-loop branch.
   - **The offset:** set `band.utcOffsetMin` in `session.start` and `turn.complete` by calling `localOffset(await $.clock.now())`, where:

     ```ts
     const localOffset = (now: number): number | undefined => {
       try {
         const off = -new Date(now).getTimezoneOffset()
         return Number.isFinite(off) ? off : undefined
       } catch {
         return undefined
       }
     }
     ```
   - **The command:** `parseCommand` gains `{ kind: 'layout', word: string }` for `layout …`:
     - empty word: list;
     - `asLayoutName(word)` matches: set `band.layout`, `await $.store.set(LAYOUT_KEY, name)`, `await update($, isHidden, () => false)`, `$.ui.invalidate('ui.render')`, then reply;
     - no match: reply unknown, with `clipMiddle(word, 20)`.
   - **Replies:** add to `REPLY`. The usage line is `'Usage: /usage-band [more | less | show | hide] · /usage-band layout <name>'`.
   - **Registration:** set `argumentHint` and the new description per spec §4.2.
   - **Snapshot:** pass `layout: band.layout` and `utcOffsetMin: band.utcOffsetMin`.

3. **`band.tsx`:**

```ts
  const view = VIEWS[snap.layout] ?? VIEWS[DEFAULT_LAYOUT]
  let tree: RenderElement
  try {
    tree = view.draw(kit, read, act)
  } catch {
    tree = VIEWS[DEFAULT_LAYOUT].draw(kit, read, act)
  }
```

4. **Below 40 columns:** in `band.tsx`, use `snap.columns < 40 ? VIEWS.chips : …`, per spec §1.

**Time-zone ruling.** The test kit's `Date` probably reports UTC. That can't be told from a real UTC user, so P1 checks the zone **by hand**: run `/reload-plugins` in a session in a non-UTC zone and read `band.utcOffsetMin` through a temporary toast. Remove the toast, and record the result in the plan's ledger. If it is 0 in a non-UTC zone, departures and forecast use relative times (spec §5).

- [ ] **Step 4: Run the tests**

Run: `claude plugin test plugins/session-usage-band`
Expected: PASS, golden and the existing suite included. In particular, `expanded-and-commands.test.ts:85` still passes.

- [ ] **Step 5: Validate, type-check and commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/layout-command.test.ts
git commit -m "feat: /usage-band layout chooses a view, kept across sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 11: The view test matrix

**Files:**
- Modify: `tests/matrix.ts`, which gains `AMBER_WORDS`, `visualRows`, `expectInvariants`, `viewSuite`
- Modify: `tests/helpers.ts`, which gains `storeFails`
- Test: `tests/matrix.test.ts` (new; it tests the helpers on hand-built trees)

**Interfaces:**
- **Produces:**

```ts
export const AMBER_WORDS: Readonly<Record<AmberReason, RegExp>>   // e.g. cacheLastMinute: /! \d+s( left)?/ or departures' LAST CALL
export const visualRows: (tree: unknown, surface: Surface) => number
export const expectInvariants: (tree: Node, ctx: Readonly<{ layout: LayoutName; surface: Surface; appearance: Appearance; cols: number; scenario: ScenarioName; glyphs: 'unicode' | 'ascii'; expanded: boolean }>) => void
export const viewSuite: (layout: LayoutName) => void
// helpers.ts: engine.storeFails: boolean — when true, store.set rejects
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/matrix.test.ts
import { test, expect } from 'claude-code/testing'
import { visualRows } from './matrix'

const text = (s: string) => ({ type: 'Text', props: {}, children: [s] })
test('visualRows counts terminal lines and desktop px rows', () => {
  const two = { type: 'Box', props: { flexDirection: 'column' }, children: [text('a'), text('b')] }
  expect(visualRows(two, 'terminal')).toBe(2)
  const tiles = { type: 'Box', props: { flexDirection: 'column' }, children: [text('52m'), text('cache'), { type: 'Svg', props: { width: 40, height: 4, alt: 'x', source: '<svg/>' } }] }
  expect(visualRows(tiles, 'desktop')).toBe(2) // 24 + 24 + 4 = 52 px → 2 rows
  const row = { type: 'Box', props: { flexDirection: 'row' }, children: [text('a'), { type: 'Svg', props: { width: 30, height: 30, alt: 'r', source: '<svg/>' } }] }
  expect(visualRows(row, 'desktop')).toBe(1) // 30 px → 1 row
})
```

`expectInvariants` and `viewSuite` are exercised by the first P2 view. A test here would need a non-chips view, so none is written now; the first P2 task's suite is their test.

- [ ] **Step 2: Run it and watch it fail.** Expected: FAIL, because `visualRows` is not exported.

- [ ] **Step 3: Implement `visualRows`**

```ts
const ROW = 24
const pxOf = (n: unknown): number => {
  if (n === null || typeof n !== 'object') return typeof n === 'string' ? ROW : 0
  const node = n as Node
  if (node.props?.position === 'absolute' || node.props?.display === 'none') return 0
  if (node.type === 'Svg') return Number(node.props?.height ?? ROW)
  if (node.type === 'Text' || node.type === 'Button') return ROW
  const kids = (node.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
  if (kids.length === 0) return 0
  return node.props?.flexDirection === 'column' ? kids.reduce((s: number, k) => s + pxOf(k), 0) : Math.max(...kids.map(pxOf))
}
const linesOf = (n: unknown): number => {
  if (n === null || typeof n !== 'object') return typeof n === 'string' ? 1 : 0
  const node = n as Node
  if (node.props?.position === 'absolute' || node.props?.display === 'none' || node.type === 'Svg') return 0
  if (node.type === 'Text' || node.type === 'Button') return 1
  const kids = (node.children ?? []).filter(k => k !== null && k !== undefined && k !== false)
  if (kids.length === 0) return 0
  return node.props?.flexDirection === 'column' ? kids.reduce((s: number, k) => s + linesOf(k), 0) : Math.max(...kids.map(linesOf))
}
export const visualRows = (tree: unknown, surface: Surface): number => (surface === 'desktop' ? Math.round(pxOf(tree) / ROW) : linesOf(tree))
```

`expectInvariants` asserts each spec §7 check. Implement each one exactly:
- **Rows:** `visualRows` of the collapsed part, the root's first child, equals `VIEWS[layout].rows[surface]`.
- **The toggle:** `▿` or `▵` (or `v` / `^` in ascii) appears in a Button label.
- **Width:** `widthOf(collapsed) <= cols`, except for all-amber scenarios below 60 columns.
- **Whitespace:** on the desktop, no string child matches `/^\s+$/`.
- **Svg placement:** Svgs appear only when `surface === 'desktop' && appearance !== 'plain'`.
- **Svg props:** every Svg has a non-empty `alt` and a numeric `width`.
- **Colour:** no hex colour in props equals red (`/^#(f00|ff0000|e5|dc2626)/i`).
- **Wording:**
  - the text has no `/send|keep (it )?warm/i`;
  - each `SCENARIOS[scenario].amber` reason's `AMBER_WORDS` matches the text;
  - every `$` amount the scenario marks as an estimate is preceded by `~`, checked as no `re-warm \$` without a `~` before it.
- **Glyphs:** in the ascii tier, the terminal text is pure ASCII. In the unicode tier, every non-ASCII character is in the allowlist `█░▒│·↻Σ◷◔▿▵…±●■–↑↓`, or is braille.
- **Tree size:** at most 400 nodes collapsed and 1,500 expanded.

`viewSuite(layout)` registers the following, every test marked `LONG`:
- 20 scenarios × 2 surfaces, in dark at 120 columns;
- calm and an all-amber scenario (`lastMinute`) in light, plain and `CC_BAND_GLYPHS=ascii`;
- the widths `[40, 41, 50, 60, 67, 68, 80, 95, 120, 160, 200]` for calm and `lastMinute`, on both surfaces;
- expanded at `maxRows` 4, 8, 13 and 40.

Add to `helpers.ts`:
- `storeFails: false` in `EngineFake` and `ENGINE_INITIAL`;
- in `store.set`, `if (engine.storeFails) throw new Error('store unavailable')` first.

- [ ] **Step 4: Run the tests.** Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/tests/matrix.ts plugins/session-usage-band/tests/matrix.test.ts plugins/session-usage-band/tests/helpers.ts
git commit -m "test: one suite every layout runs, from rows to contrast to wording

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 12: Flap tokens, and contrast on the new grounds

**Files:**
- Modify: `hooks/palette.ts` (`flap`, `flapText` and `flapDim` in `Palette`, `DARK`, `LIGHT` and `PLAIN`)
- Test: `tests/design.test.ts`

- [ ] **Step 1: Write the failing test** (inside the existing per-palette loop in `design.test.ts`)

```ts
  test(`${name}: the new layouts' text and marks hold on the card ground and on flaps`, () => {
    for (const fg of [p.value, p.label, p.amberFg]) expect(contrast(fg, p.cardBg)).toBeGreaterThanOrEqual(4.5)
    for (const mark of [p.meterFill, p.trackStroke, p.warm, p.fiveAccent, p.weekAccent]) expect(contrast(mark, p.cardBg)).toBeGreaterThanOrEqual(3)
    expect(contrast(p.value, p.surface)).toBeGreaterThanOrEqual(4.5)
    for (const fg of [p.flapText, p.flapDim]) expect(contrast(fg, p.flap)).toBeGreaterThanOrEqual(4.5)
    for (const fg of [p.warm, p.fiveAccent, p.weekAccent, p.amberFg, p.coin]) expect(contrast(fg, p.flap)).toBeGreaterThanOrEqual(4.5)
  })
```

- [ ] **Step 2: Run it and watch it fail.** Expected: FAIL, because `p.flap` is undefined. Some accents on `cardBg` may also fail; that is the point of the test.

- [ ] **Step 3: Implement**

1. **The new tokens:**
   - `DARK`: `flap '#111113'`, `flapText '#f2f2f5'`, `flapDim '#a2a2ac'`.
   - `LIGHT`: `flap '#1d1d22'`, `flapText '#f2f2f5'`, `flapDim '#a8a8b2'`.
   - `PLAIN`: theme keys, `flap: ''`, `flapText: 'text'`, `flapDim: 'subtle'`, matching how `PLAIN` fills its other fields.
2. **Lightness only:** if an accent fails on `cardBg` or on `flap`, change only that token's lightness, keeping its hue. Change chips' tokens only if the golden capture still passes. If it doesn't, add a separate token for the new layouts, such as `fiveAccentOnCard`. Record any new token in spec §2.10.

- [ ] **Step 4: Run the tests.** Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/palette.ts plugins/session-usage-band/tests/design.test.ts
git commit -m "feat: flap colours for departures, and contrast checked on the card ground

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 13: The words the new views speak

Views never format (spec §2.5), so `readingsOf` gives every phrase a new view draws, ready to place. Chips doesn't read these fields, so golden is unaffected.

**Files:**
- Modify: `hooks/format.ts` (`fmtLeft`)
- Modify: `hooks/reading.ts` (`Readings` gains a `words` layer)
- Test: `tests/readings.test.ts`

**Interfaces:**
- **Consumes:** Task 4 (`AMBER`, `resetPhrase`, `paceText`, `altOf`, `fmtClock`, `fmtDayClock`, `fmtSecondsLeft`) and Task 5 (`Readings`).
- **Produces:** these fields, added to Task 5's types:

```ts
// cache
condition: 'not measured' | 'warming' | 'warm' | 'cooling' | 'cold'
left: string            // '52m left' | '9m left' | '47s left' | '' (unmeasured, warming, cold, or working)
leftShort: string       // '52m' | '9m' | '47s' | ''
text: string            // 'cache 52m left' | 'cache warm' | 'cache –' | 'cache warming' | 'cache cold · re-warm ~$1.66'
textShort: string       // 'cache 52m' | 'cache warm' | 'cache –' | 'warming' | 'cold ~$1.66'
amber: string | undefined       // '! 47s left · re-warm ~$1.66' in the last minute
amberShort: string | undefined  // '! 47s'
coldAtClock: string | undefined   // '14:32' while warm and not working, when utcOffsetMin is known
coldSinceClock: string | undefined // '13:28' when cold and the time is known
alt: string             // 'cache 52 minutes left, warm' …
savedText: string | undefined   // '~$11.40', once measured
hitText: string | undefined     // '96%', once measured
lastsText: string               // '1h idle · assumed' (chips' expiry fact)
rebuildsText: string | undefined // '2', when there were unexpected rebuilds
// spend
totalText: string; lastText: string | undefined; tokensText: string
split: ReadonlyArray<Readonly<{ label: 'input' | 'output' | 'cache reads'; tokens: number; text: string }>>
// context
valueText: string; text: string; textShort: string; amber: string | undefined; amberShort: string | undefined
inContextText: string; compactsAtText: string | undefined; roomText: string | undefined; windowText: string; alt: string
// LimitView
text: string             // '5h 4%' (or '5h reset' once passed)
resetWords: string | undefined   // 'resets in 3h 00m'
resetGlyph: string | undefined   // '↻ in 3h 00m'
resetClock: string | undefined   // '16:40' or 'Mon 08:40', when utcOffsetMin is known
projectedText: string | undefined // '~10%'
fullAtClock: string | undefined  // '14:20', when a measured fill exists and the time is known
amber: string | undefined        // '! 5h 82%' | '! 5h full in ~40m'
amberShort: string | undefined   // '! 5h 82%' | '! 5h ~40m'
alt: string
```

- [ ] **Step 1: Write the failing tests** (append to `tests/readings.test.ts`)

```ts
test('the cache speaks in words for the new views', () => {
  expect(readingsOf(snap()).cache.text).toBe('cache 52m left')
  const last = readingsOf(snap({ cache: { ...snap().cache, msLeft: 47_000 } })).cache
  expect(last.condition).toBe('cooling')
  expect(last.amber).toBe('! 47s left · re-warm ~$1.66')
  expect(last.amberShort).toBe('! 47s')
  expect(readingsOf(snap({ isWorking: true })).cache.text).toBe('cache warm')
  expect(readingsOf(snap({ cache: { ...snap().cache, msLeft: -60_000 } })).cache.text).toBe('cache cold · re-warm ~$1.66')
})
test('clock times appear only when the offset is known', () => {
  expect(readingsOf(snap()).cache.coldAtClock).toBeUndefined()
  const r = readingsOf({ ...snap({ now: Date.UTC(2026, 9, 9, 13, 40) }), utcOffsetMin: 0 } as never)
  expect(r.cache.coldAtClock).toBe('14:32')
})
test('limits and context speak in words, amber with one "! "', () => {
  const r = readingsOf(snap({ fiveHour: { percentUsed: 82, resetsAt: new Date(3 * 3600_000).toISOString(), etaMs: null } }))
  expect(r.fiveHour?.text).toBe('5h 82%')
  expect(r.fiveHour?.amber).toBe('! 5h 82%')
  expect(r.fiveHour?.resetGlyph).toBe('↻ in 3h 00m')
  expect(r.sevenDay?.projectedText).toBe('~50%')
  const near = readingsOf(snap({ context: { tokens: 176_000, window: 200_000, percent: 88, compactAt: 190_000 } }))
  expect(near.context.amber).toBe('! context 93% · compacts in ~14k')
  expect(near.context.amberShort).toBe('! ctx 93%')
})
test('the countdown never looks like a clock', () => {
  for (const ms of [52 * 60_000, 9.5 * 60_000, 47_000]) expect(readingsOf(snap({ cache: { ...snap().cache, msLeft: ms } })).cache.left).not.toMatch(/\d:\d\d/)
})
```

- [ ] **Step 2: Run them and watch them fail.** Expected: FAIL, because the fields are undefined.

- [ ] **Step 3: Implement**

In `format.ts`:

```ts
/** A countdown in words for the new views: `52m left`, `1h 05m left`, `9m left`, `47s left`. */
export const fmtLeft = (ms: number): string =>
  ms < 60_000 ? fmtSecondsLeft(ms) : ms < 600_000 ? `${Math.ceil(ms / 60_000)}m left` : `${fmtCountdown(ms)} left`
```

In `readingsOf`, after the moved facts, build each field.

**Cache:**
- `condition`: map the mood, with `expiring` → `cooling` and `unmeasured` → `not measured`.
- `left`: `fmtLeft(msLeft)` when the mood is warm or expiring and Claude isn't working; otherwise `''`. `leftShort` is `left` without `' left'`.
- `text`:
  - unmeasured: `'cache –'`
  - warming: `'cache warming'`
  - working: `'cache warm'`
  - warm: `` `cache ${left}` ``
  - expiring: `` `cache ${left}` ``
  - cold: `` `cache cold · re-warm ${estimate}` ``
- `textShort` is the same but shorter:
  - warm and expiring: `` `cache ${leftShort}` ``
  - warming: `'warming'`
  - cold: `` `cold ${estimate}` ``
- `amber` and `amberShort`: only when expiring, as `AMBER.cache(left, estimate)` and `AMBER.cacheShort(leftShort)`.
- `coldAtClock`: `fmtClock(now + msLeft, off)` when `off !== undefined`, the mood is warm or expiring, and Claude isn't working.
- `coldSinceClock`: `fmtClock(now + msLeft, off)` when the cache is cold and `off !== undefined`. At this point `msLeft ≤ 0`, so the time is in the past.
- `alt`: `altOf('cache', left ? left.replace('m left', ' minutes left').replace('s left', ' seconds left') : condition, condition)`.
- `savedText`, `hitText`, `lastsText` and `rebuildsText`: the chips cache card's facts, moved verbatim from its `factRow` values (`band.tsx` 558–567 before the move).

**Spend:**
- `totalText`: `fmtCost(costUsd)`.
- `lastText`: `fmtSmallCost(lastTurnUsd)` when known.
- `tokensText`: `fmtTokens(total)`.
- `split`: the three parts with `fmtTokens`.

**Context:**
- `valueText` is `pct`. `text` is `` `context ${pct}` ``. `textShort` is `` `ctx ${pct}` ``.
- `amber`:
  - when amber with `compactAt` known: `AMBER.context(frac, toCompact)`;
  - when amber without it: `AMBER.contextNoCompaction(frac)`.

  `amberShort` is `AMBER.contextShort(frac)`.
- `inContextText`: `fmtTokens(used)`. `compactsAtText`: `` `~${fmtTokens(compactAt)}` ``. `roomText`: `` `~${fmtTokens(toCompact)}` ``. `windowText`: `fmtTokens(window)`.
- `alt`: `altOf('context', pct + ' full', tone === 'amber' ? 'near the limit' : 'fine')`.

**Each limit:**
- `text`: `` `${name} ${value}` ``, or `` `${name} reset` `` once passed.
- `resetWords` and `resetGlyph`: `resetPhrase(reset, 'words' | 'glyph')` when there is a reset.
- `resetClock`: `fmtDayClock(Date.parse(resetsAt), off, now)` when both are known.
- `projectedText`: `` `~${Math.round(projectedPct)}%` ``.
- `fullAtClock`: `fmtClock(now + etaMs, off)`.
- `amber`: `etaMs !== null ? AMBER.limitPace(name, fmtEta(etaMs)) : AMBER.limit(name, percentUsed)`, only when amber. `amberShort`: `etaMs !== null ? AMBER.limitShort(name, fmtEta(etaMs)) : AMBER.limit(name, percentUsed)`.
- `alt`: `altOf(name + ' limit', Math.round(percentUsed) + ' percent used', tone === 'amber' ? 'needs attention' : 'fine', projectedText?.replace('~', '') + ' at its reset')`, with the estimate dropped when there is no projection.

- [ ] **Step 4: Run the tests.** Expected: PASS, golden included.

- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/format.ts plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/tests/readings.test.ts
git commit -m "feat: the readings speak every phrase the new layouts draw

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: The P1 gate

- [ ] **Step 1:** Run `claude plugin validate .`, then `claude plugin validate plugins/session-usage-band`. Expected: both pass.
- [ ] **Step 2:** Run `claude plugin test plugins/session-usage-band`. Expected: everything passes. Record the total count from the output.
- [ ] **Step 3:** Run `npx -y -p typescript@5 tsc -p plugins/session-usage-band`. Expected: no errors.
- [ ] **Step 4:** Check that nothing a P2 agent needs is missing:
  - `VIEWS` has nine entries;
  - `readingsOf` exposes every field in Task 5's and Task 13's types;
  - `charts.tsx` exports all six builders;
  - `frame.tsx` exports `frame`, `bodyRowsFor`, `toggleButton`, `panel`, `line`, `lineRoom`, `fitLine`, `words` and `openView`;
  - `tests/matrix.ts` exports `viewSuite`.

  Write the freeze note in the plan's ledger: these interfaces are frozen for P2.
- [ ] **Step 5:** Run `git log --oneline main..feat/layouts` and confirm one commit per task, with nothing pushed.

---

## P2: Six views, in parallel

**How P2 runs**
- Task 15 runs first, alone.
- Tasks 16–21 then run in parallel, one agent each, in separate worktrees.
- Each agent touches **only** its own view file, `hooks/views/<name>.tsx` (it replaces the stub), and its own test file, `tests/view-<name>.test.ts`.
- If an agent needs a change to a frozen file (Task 14's list), it stops and reports. The change goes in on its own (Task 15b), and every worktree rebases.
- Task 22 merges the six views.

**The pattern every P2 view follows** (a view must not deviate from it)
- `draw` returns `openView(kit, read, act, collapsed, ROWS, body)`.
- `collapsed` is `panel(kit, 'collapsed', [ …one line per row… ])`. The last line ends with `toggleButton(kit, read, act)`.
- Each line is built with `fitLine(kit, ORDER, lineRoom(kit), keeps => line(kit, key, pieces(keeps), end))`.
- **Give-way and amber:** the `ORDER` lists calm pieces only, plus a final `'amberShort'`. An amber piece ignores every step except `'amberShort'`, where it switches to its `amberShort` words.
- **Text:** every word comes from `read`. A view adds only its own fixed labels (`CACHE`, `cooling`, …).
- **Desktop and plain:** Svg goes only through `charts.tsx`. Plain draws the text forms, which the builders already handle.

**Each view's test file starts the same way:**

```ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG } from './helpers'
viewSuite('<name>')
```

### Task 15: P2 setup, the canvas refresh, and worktrees

**Files:**
- Modify: the canvas `https://claude.ai/artifact/D7zicdKoREmY44Ai1bqwFK` (Keepers row)
- Modify: `.gitignore`

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
  - terminal glyphs from the allowlist only (braille charts, no circles or weather).

  Publish and tell the maintainer.
- [ ] **Step 2: Create one worktree per view, off the P1 tip.**

```bash
for v in ledger tiles gauges rings departures forecast; do
  git worktree add -b layouts/$v .worktrees/$v feat/layouts
  cp -R plugins/session-usage-band/.claude-plugin/types .worktrees/$v/plugins/session-usage-band/.claude-plugin/types
done
```

Add `.worktrees/` to `.gitignore`. If permissions refuse a worktree command, ask the maintainer to run it.
- [ ] **Step 3: Brief each agent with this text,** with the view's task substituted:
  1. "Work only in `.worktrees/<name>`, on branch `layouts/<name>`. Implement Task <N> of `design/plans/2026-10-10-band-layouts-plan.md`, test first. Touch only `hooks/views/<name>.tsx` and `tests/view-<name>.test.ts`."
  2. "Run the full gates in your worktree before you report."
  3. "Do not push."

### Task 15b: A shared-file change during P2 (only when needed)

Use this task only when a P2 agent reports a missing helper or field.

- [ ] Make the change on `feat/layouts`, test first, in the file that owns it. Run the full suite, golden included.
- [ ] In every worktree, run `git rebase feat/layouts`, then re-run that view's tests.

### Task 16: `ledger`

**Files:** `hooks/views/ledger.tsx`, `tests/view-ledger.test.ts`
**Rows:** desktop 1, terminal 1.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-ledger.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG } from './helpers'
viewSuite('ledger')

const at = (scenario: Parameters<typeof drawAs>[2]['scenario'], cols = 160, expanded = false) => async ($: never, on: never) =>
  shown(await drawAs($, on, { layout: 'ledger', scenario, surface: 'terminal', appearance: 'dark', cols, expanded }))

test('calm reads as one sentence of readings', async ($, on) => {
  expect(await at('calm')($ as never, on as never)).toMatch(/cache 1h 00m left · \$2\.41 · context 38% · 5h 4%, resets in 3h 00m · 7d 30%, resets in 2d 19h/)
})
test('the last minute leads with "! " and the price', LONG, async ($, on) => {
  expect(await at('lastMinute')($ as never, on as never)).toMatch(/^! 30s left · re-warm ~\$/)
})
test('narrow, resets become ↻ and then go; the cache stays', async ($, on) => {
  const t = await at('calm', 60)($ as never, on as never)
  expect(t).toMatch(/cache 1h 00m left/)
  expect(t).not.toMatch(/resets in/)
})
test('expanded lists the four sections in sentences', async ($, on) => {
  const t = await at('calm', 160, true)($ as never, on as never)
  for (const h of ['CACHE', 'SPEND', 'CONTEXT', 'LIMITS']) expect(t).toContain(h)
  expect(t).toMatch(/re-warm ~\$\S+ if it goes cold/)
})
```

- [ ] **Step 2: Run and watch them fail.** Expected: FAIL (the stub draws chips).
- [ ] **Step 3: Implement `hooks/views/ledger.tsx`**

```tsx
// ledger: the band in words alone, `·`-separated; `! ` leads what needs you.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import type { View } from './index'

const ORDER = ['resetGlyph', 'resetTimes', 'calmSeven', 'calmContext', 'cost', 'calmFive', 'amberShort'] as const
type Piece = (typeof ORDER)[number]

const limitPart = (kit: Kit, l: LimitView, calmStep: Piece, keeps: (p: Piece) => boolean): RenderChildren => {
  if (l.tone === 'amber') return words(kit, l.name, [[keeps('amberShort') ? (l.amber ?? l.text) : (l.amberShort ?? l.text), 'amber']])
  if (!keeps(calmStep)) return null
  const reset = l.resetWords !== undefined && keeps('resetTimes') ? [[', ', 'label'] as const, [keeps('resetGlyph') ? l.resetWords : (l.resetGlyph ?? ''), 'label'] as const] : []
  return words(kit, l.name, [[`${l.name} `, 'label'], [l.text.slice(l.name.length + 1), 'value'], ...reset])
}

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const c = read.cache
    const x = read.context
    const parts: RenderChildren[] = [
      c.amber !== undefined
        ? words(kit, 'cache', [[keeps('amberShort') ? c.amber : (c.amberShort ?? c.amber), 'amber']])
        : words(kit, 'cache', c.text.startsWith('cache ') ? [['cache ', 'label'], [c.text.slice(6), 'value']] : [[c.text, 'value']]),
      keeps('cost') ? words(kit, 'cost', [[read.spend.totalText, 'value']]) : null,
      !x.known ? null : x.amber !== undefined
        ? words(kit, 'ctx', [[keeps('amberShort') ? x.amber : (x.amberShort ?? x.amber), 'amber']])
        : keeps('calmContext') ? words(kit, 'ctx', [['context ', 'label'], [x.valueText, 'value']]) : null,
      read.fiveHour ? limitPart(kit, read.fiveHour, 'calmFive', keeps) : null,
      read.sevenDay ? limitPart(kit, read.sevenDay, 'calmSeven', keeps) : null,
    ].filter(part => part !== null)
    const joined = parts.flatMap((part, i) => (i === 0 ? [part] : [words(kit, `sep${i}`, [['·', 'label']]), part]))
    return line(kit, 'line', joined, toggleButton(kit, read, act), 1)
  })

const section = (kit: Kit, title: string, sentences: ReadonlyArray<string | undefined>, room: number): RenderElement => {
  const { Box } = kit
  return (
    <Box key={`sec:${title}`} flexDirection="column" flexGrow={1} width={0} minWidth={0}>
      {words(kit, 'h', [[title, 'label']], true)}
      {sentences.filter((t): t is string => t !== undefined).slice(0, Math.max(0, room)).map((t, i) => words(kit, `s${i}`, [[t, 'value']]))}
    </Box>
  )
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box } = kit
  const c = read.cache
  const x = read.context
  const perLine = kit.columns >= 100 ? 4 : 2
  const lines = 4 / perLine
  const room = Math.floor((bodyRows - (lines - 1)) / lines) - 1
  const sections = [
    section(kit, 'CACHE', [c.left || c.condition, c.condition === 'cold' ? `next message ${c.estimate}` : `re-warm ${c.estimate} if it goes cold`, c.savedText && `saved ${c.savedText}, ${c.hitText} hit rate`, `lasts ${c.lastsText}`], room),
    section(kit, 'SPEND', [`${read.spend.totalText} this session`, read.spend.lastText && `last message ${read.spend.lastText}`, `${read.spend.tokensText} tokens: ${read.spend.split.map(p => `${p.text} ${p.label}`).join(', ')}`], room),
    section(kit, 'CONTEXT', x.known ? [`${x.valueText} toward compaction`, `${x.inContextText} in context${x.compactsAtText ? `, compacts at ${x.compactsAtText}` : ''}`, x.roomText && `${x.roomText} room in a ${x.windowText} window`] : ['not reported'], room),
    section(kit, 'LIMITS', read.limits.length === 0 ? ['none reported'] : [read.worstLimit && `closest is ${read.worstLimit.text}`, ...read.limits.map(l => [l.text, l.resetWords, l.pace || undefined].filter(Boolean).join(', '))], room),
  ]
  return Array.from({ length: lines }, (_, i) => <Box key={`l${i}`} flexDirection="row" columnGap={2}>{sections.slice(i * perLine, (i + 1) * perLine)}</Box>)
}

export const ledgerView: View = {
  name: 'ledger',
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), 1, body(kit, read)),
}
```

Run the tests. If a matrix case fails (for example, width at 40 for an amber scenario), fix the view, not the matrix.

- [ ] **Step 4: Run the tests.** Expected: the ledger suite passes. Golden and the existing suite pass.
- [ ] **Step 5: Commit in the worktree**

```bash
git add plugins/session-usage-band/hooks/views/ledger.tsx plugins/session-usage-band/tests/view-ledger.test.ts
git commit -m "feat: the ledger layout, the band in words alone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 17: `tiles`

**Files:** `hooks/views/tiles.tsx`, `tests/view-tiles.test.ts`
**Rows:** desktop 2 (the 4 px underline doesn't count), terminal 2.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-tiles.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG, svgsOf } from './helpers'
viewSuite('tiles')

test('each tile is a value over its label', async ($, on) => {
  const t = shown(await drawAs($, on, { layout: 'tiles', scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 160 }))
  expect(t).toMatch(/1h 00m/)
  expect(t).toMatch(/cache/)
  expect(t).toMatch(/\$2\.41/)
  expect(t).toMatch(/5h ↻ in 3h 00m/)
})
test('the desktop draws an underline bar under each tile but the cost', async ($, on) => {
  const tree = await drawAs($, on, { layout: 'tiles', scenario: 'calm', surface: 'desktop', appearance: 'dark', cols: 160 })
  expect(svgsOf(tree).filter(n => Number(n.props?.height) === 4)).toHaveLength(4)
})
test('an amber tile turns its label into the reason', LONG, async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'tiles', scenario: 'lastMinute', surface: 'terminal', appearance: 'dark', cols: 160 }))).toMatch(/! 30s left · re-warm ~\$/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/tiles.tsx`**

```tsx
// tiles: type first — a bold value over a small label; on the desktop the
// bar is a thin underline. No pills.

import type { RenderChildren, RenderElement } from 'claude-code'
import { underline } from '../charts'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import type { View } from './index'

const ORDER = ['underline', 'resetText', 'calmSeven', 'calmContext', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
type Role = 'value' | 'amber' | 'label' | 'accent5' | 'accent7'
const UNDERLINE_PX = 64

const tile = (kit: Kit, key: string, value: string, label: string, role: Role, bar: Readonly<{ frac: number; color: string; alt: string }> | undefined, keeps: (p: Piece) => boolean): RenderElement => {
  const { Box } = kit
  return (
    <Box key={key} flexDirection="column" flexShrink={0}>
      {words(kit, 'v', [[value, role === 'amber' ? 'amber' : 'value']], true)}
      {words(kit, 'l', [[label, role]])}
      {bar !== undefined && keeps('underline') ? underline(kit, { key: 'u', alt: bar.alt, frac: bar.frac, color: bar.color, px: UNDERLINE_PX }) : null}
    </Box>
  )
}

const limitTile = (kit: Kit, l: LimitView, accent: 'accent5' | 'accent7', color: string, keeps: (p: Piece) => boolean): RenderElement =>
  l.tone === 'amber'
    ? tile(kit, l.name, l.value, keeps('amberShort') ? (l.amber ?? l.text) : (l.amberShort ?? l.text), 'amber', { frac: l.frac, color: kit.palette.amberFg, alt: l.alt }, keeps)
    : tile(kit, l.name, l.passed ? 'reset' : l.value, keeps('resetText') && l.resetGlyph ? `${l.name} ${l.resetGlyph}` : l.name, accent, { frac: l.frac, color, alt: l.alt }, keeps)

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const p = kit.palette
    const c = read.cache
    const x = read.context
    const pieces: RenderChildren[] = [
      c.amber !== undefined
        ? tile(kit, 'cache', c.leftShort, keeps('amberShort') ? c.amber : (c.amberShort ?? c.amber), 'amber', { frac: c.charge, color: p.amberFg, alt: c.alt }, keeps)
        : tile(kit, 'cache', c.leftShort || c.condition, c.leftShort ? 'cache' : 'cache', 'label', { frac: c.charge, color: p.warm, alt: c.alt }, keeps),
      tile(kit, 'cost', read.spend.totalText, 'this session', 'label', undefined, keeps),
      !x.known ? null : x.amber !== undefined
        ? tile(kit, 'ctx', x.valueText, keeps('amberShort') ? x.amber : (x.amberShort ?? x.amber), 'amber', { frac: x.frac, color: p.amberFg, alt: x.alt }, keeps)
        : keeps('calmContext') ? tile(kit, 'ctx', x.valueText, 'context', 'label', { frac: x.frac, color: p.meterFill, alt: x.alt }, keeps) : null,
      read.fiveHour ? limitTile(kit, read.fiveHour, 'accent5', p.fiveAccent, keeps) : null,
      read.sevenDay && (read.sevenDay.tone === 'amber' || keeps('calmSeven')) ? limitTile(kit, read.sevenDay, 'accent7', p.weekAccent, keeps) : null,
    ].filter(piece => piece !== null)
    return line(kit, 'line', pieces, toggleButton(kit, read, act), 3)
  })

const group = (kit: Kit, title: string, tiles: RenderElement[]): RenderElement => {
  const { Box } = kit
  return (
    <Box key={`g:${title}`} flexDirection="column" flexGrow={1} width={0} minWidth={0} rowGap={1}>
      {words(kit, 'h', [[title, 'label']], true)}
      <Box key="r1" flexDirection="row" columnGap={2}>{tiles.slice(0, 2)}</Box>
      <Box key="r2" flexDirection="row" columnGap={2}>{tiles.slice(2, 4)}</Box>
    </Box>
  )
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box } = kit
  const all = () => true
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const groups = [
    group(kit, 'CACHE', [
      tile(kit, 'left', c.leftShort || c.condition, 'left', 'label', { frac: c.charge, color: p.warm, alt: c.alt }, all),
      tile(kit, 'rewarm', c.estimate, 're-warm if cold', 'label', undefined, all),
      tile(kit, 'saved', c.savedText ?? '–', 'saved', 'label', undefined, all),
      tile(kit, 'hit', c.hitText ?? '–', 'hit rate', 'label', undefined, all),
    ]),
    group(kit, 'SPEND', [
      tile(kit, 'total', read.spend.totalText, 'this session', 'label', undefined, all),
      tile(kit, 'last', read.spend.lastText ?? '–', 'last message', 'label', undefined, all),
      tile(kit, 'tokens', read.spend.tokensText, 'tokens', 'label', undefined, all),
      tile(kit, 'reads', read.spend.split[2]?.text ?? '–', 'cache reads', 'label', undefined, all),
    ]),
    group(kit, 'CONTEXT', x.known ? [
      tile(kit, 'pct', x.valueText, 'to compaction', 'label', { frac: x.frac, color: p.meterFill, alt: x.alt }, all),
      tile(kit, 'in', x.inContextText, 'in context', 'label', undefined, all),
      tile(kit, 'room', x.roomText ?? '–', 'room left', 'label', undefined, all),
      tile(kit, 'window', x.windowText, 'window', 'label', undefined, all),
    ] : []),
    group(kit, 'LIMITS', read.limits.slice(0, 2).flatMap(l => [
      tile(kit, `${l.name}:now`, l.passed ? 'reset' : l.value, l.resetGlyph ? `${l.name} ${l.resetGlyph}` : l.name, l.tone === 'amber' ? 'amber' : 'label', { frac: l.frac, color: l.tone === 'amber' ? p.amberFg : p.meterFill, alt: l.alt }, all),
      tile(kit, `${l.name}:then`, l.projectedText ?? '–', `${l.name} at its reset`, 'label', undefined, all),
    ])),
  ]
  const perLine = kit.columns >= 100 ? 4 : 2
  return bodyRows < 4
    ? [<Box key="l0" flexDirection="row" columnGap={2}>{groups.slice(0, perLine)}</Box>]
    : Array.from({ length: 4 / perLine }, (_, i) => <Box key={`l${i}`} flexDirection="row" columnGap={2}>{groups.slice(i * perLine, (i + 1) * perLine)}</Box>)
}

export const tilesView: View = {
  name: 'tiles',
  rows: { desktop: 2, terminal: 2 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), 2, body(kit, read)),
}
```

- [ ] **Step 4: Run the tests until they pass.**
  - In the dashed-projection tiles of the expanded view, pass `dashed: true` to `underline`, with `frac = projectedPct / 100`, wherever a `projectedText` is shown.
  - Remove the `–` fallbacks if the matrix shows them in a scenario where the fact exists.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/tiles.tsx plugins/session-usage-band/tests/view-tiles.test.ts
git commit -m "feat: the tiles layout, a bold value over its label

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18: `gauges`

**Files:** `hooks/views/gauges.tsx`, `tests/view-gauges.test.ts`
**Rows:** 2 and 2.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-gauges.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG, svgsOf } from './helpers'
viewSuite('gauges')

test('row one is the cache with its time-left bar; row two the three cells', async ($, on) => {
  const t = shown(await drawAs($, on, { layout: 'gauges', scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 160 }))
  expect(t).toMatch(/cache.*1h 00m left · re-warm ~\$/)
  expect(t).toMatch(/context.*38%.*5h.*4%.*7d.*30%/)
})
test('5h and 7d bars carry a tick for the window gone; context has none', async ($, on) => {
  const tree = await drawAs($, on, { layout: 'gauges', scenario: 'calm', surface: 'desktop', appearance: 'dark', cols: 160 })
  const ticked = svgsOf(tree).filter(n => /class="tick"/.test(String(n.props?.source)))
  expect(ticked.map(n => String(n.props?.alt).split(' ')[0])).toEqual(['5h', '7d'])
})
test('narrow, calm cells become text and the rows stay two', async ($, on) => {
  const t = shown(await drawAs($, on, { layout: 'gauges', scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 50 }))
  expect(t).toMatch(/5h 4%/)
})
test('a measured pace speaks in amber words', LONG, async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'gauges', scenario: 'fiveHourAhead', surface: 'terminal', appearance: 'dark', cols: 160 }))).toMatch(/! 5h full in ~/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/gauges.tsx`**

```tsx
// gauges: two rows of labelled bars. The cache's bar is its time left; the
// 5h and 7d bars carry a tick for how much of the window has gone.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import type { View } from './index'

const ORDER = ['tokens', 'resetText', 'costRight', 'bars', 'calmCellsText', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
const WIDE = { px: 240, cells: 24 } as const
const CELL = { px: 120, cells: 12 } as const
const SMALL = { px: 60, cells: 6 } as const

const cacheLine = (kit: Kit, read: Readings): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const p = kit.palette
    const c = read.cache
    const sentence = c.amber !== undefined
      ? words(kit, 'say', [[keeps('amberShort') ? c.amber : (c.amberShort ?? c.amber), 'amber']])
      : words(kit, 'say', [[c.text.replace(/^cache /, '') + (c.condition === 'warm' && !read.frame.isWorking ? ` · re-warm ${c.estimate}` : ''), 'value'], ...(keeps('costRight') ? [] : [[` · ${read.spend.totalText}`, 'value'] as const])])
    const right = keeps('costRight') ? words(kit, 'right', [[read.spend.totalText + (keeps('tokens') ? ` · ${read.spend.tokensText} tokens` : ''), 'label']]) : null
    return line(kit, 'r1', [
      words(kit, 'name', [['cache', c.tone === 'amber' ? 'amber' : 'label']]),
      meter(kit, { key: 'bar', label: 'cache', frac: c.charge, tone: c.tone, accent: p.warm, size: keeps('bars') ? WIDE : SMALL, reads: 'left' }),
      sentence,
    ], right)
  })

const cell = (kit: Kit, key: string, name: string, frac: number, tone: 'calm' | 'amber', accent: string, value: string, amber: readonly [string, string] | undefined, tick: number | undefined, keeps: (p: Piece) => boolean): RenderChildren[] => {
  if (tone === 'amber' && amber !== undefined) {
    return [meter(kit, { key: `${key}:bar`, label: name, frac, tone, accent, size: keeps('bars') ? CELL : SMALL, tick }), words(kit, key, [[keeps('amberShort') ? amber[0] : amber[1], 'amber']])]
  }
  if (!keeps('calmCellsText')) return [words(kit, key, [[`${name} `, 'label'], [value, 'value']])]
  return [words(kit, `${key}:n`, [[name, 'label']]), meter(kit, { key: `${key}:bar`, label: name, frac, tone, accent, size: keeps('bars') ? CELL : SMALL, tick }), words(kit, key, [[value, 'value']])]
}

const limitCell = (kit: Kit, l: LimitView, accent: string, keeps: (p: Piece) => boolean): RenderChildren[] =>
  cell(kit, l.name, l.name, l.frac, l.tone, accent, l.passed ? 'reset' : l.value + (keeps('resetText') && l.resetGlyph ? ` ${l.resetGlyph}` : ''), l.amber === undefined ? undefined : [l.amber, l.amberShort ?? l.amber], l.gone, keeps)

const cellsLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const p = kit.palette
    const x = read.context
    return line(kit, 'r2', [
      ...(x.known ? cell(kit, 'ctx', 'context', x.frac, x.tone, p.meterFill, x.valueText, x.amber === undefined ? undefined : [x.amber, x.amberShort ?? x.amber], undefined, keeps) : []),
      ...(read.fiveHour ? limitCell(kit, read.fiveHour, p.fiveAccent, keeps) : []),
      ...(read.sevenDay ? limitCell(kit, read.sevenDay, p.weekAccent, keeps) : []),
    ], toggleButton(kit, read, act))
  })

const panelOf = (kit: Kit, title: string, rows: RenderChildren[], room: number): RenderElement => {
  const { Box } = kit
  return <Box key={`p:${title}`} flexDirection="column" flexGrow={1} width={0} minWidth={0}>{words(kit, 'h', [[title, 'label']], true)}{rows.filter(r => r !== null).slice(0, Math.max(0, room))}</Box>
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box } = kit
  const p = kit.palette
  const c = read.cache
  const x = read.context
  const room = bodyRows - 1
  const facts = (k: string, label: string, value: string | undefined) => (value === undefined ? null : words(kit, k, [[`${label} `, 'label'], [value, 'value']]))
  return [
    <Box key="panels" flexDirection="row" columnGap={3}>
      {panelOf(kit, 'CACHE', [
        c.hitText === undefined ? null : meter(kit, { key: 'hit', label: 'hit rate', frac: Number(c.hitText.replace('%', '')) / 100, tone: 'calm', accent: p.warm, size: CELL }),
        facts('hit', 'hit rate', c.hitText), facts('saved', 'saved', c.savedText), facts('lasts', 'lasts', c.lastsText),
      ], room)}
      {panelOf(kit, 'SPEND', [facts('total', 'session', read.spend.totalText), facts('last', 'last message', read.spend.lastText), ...read.spend.split.map(s => facts(s.label, s.label, s.text))], room)}
      {panelOf(kit, 'CONTEXT', x.known ? [meter(kit, { key: 'room', label: 'context', frac: x.frac, tone: x.tone, accent: p.meterFill, size: CELL }), facts('room', 'room', x.roomText), facts('at', 'compacts at', x.compactsAtText), facts('win', 'window', x.windowText)] : [facts('none', 'context', 'not reported')], room)}
      {panelOf(kit, 'LIMITS', read.limits.flatMap(l => [
        meter(kit, { key: `${l.name}:bar`, label: l.name, frac: l.frac, tone: l.tone, accent: l.key === '5h' ? p.fiveAccent : l.key === '7d' ? p.weekAccent : p.meterFill, size: CELL, tick: l.gone, projectTo: l.projectedPct === undefined ? undefined : Math.min(1, l.projectedPct / 100) }),
        words(kit, `${l.name}:w`, [[l.text, l.tone === 'amber' ? 'amber' : 'value'], [l.pace ? ` · ${l.pace}` : '', 'label']]),
      ]), room)}
    </Box>,
  ]
}

export const gaugesView: View = {
  name: 'gauges',
  rows: { desktop: 2, terminal: 2 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [cacheLine(kit, read), cellsLine(kit, read, act)]), 2, body(kit, read)),
}
```

**Ruling: hit-rate parsing.** Parsing `hitText` back to a number violates "views never format". Add `hitFrac: number | undefined` to `Readings.cache` through Task 15b, and use it here.

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/gauges.tsx plugins/session-usage-band/tests/view-gauges.test.ts
git commit -m "feat: the gauges layout, two rows of labelled bars

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 19: `rings`

**Files:** `hooks/views/rings.tsx`, `tests/view-rings.test.ts`
**Rows:** desktop 2, terminal 1.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-rings.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG, svgsOf } from './helpers'
viewSuite('rings')

test('the desktop draws a ring per reading, and none for the cost', async ($, on) => {
  const tree = await drawAs($, on, { layout: 'rings', scenario: 'calm', surface: 'desktop', appearance: 'dark', cols: 160 })
  expect(svgsOf(tree).filter(n => /<circle/.test(String(n.props?.source))).map(n => String(n.props?.alt).split(' ')[0])).toEqual(['cache', 'context', '5h', '7d'])
})
test('the terminal shows a meter, the value and the label on one row', async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'rings', scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 160 }))).toMatch(/█+░*\s*1h 00m\s+cache/)
})
test('amber makes the label the reason', LONG, async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'rings', scenario: 'fiveHourAhead', surface: 'terminal', appearance: 'dark', cols: 160 }))).toMatch(/! 5h full in ~/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/rings.tsx`**

```tsx
// rings: a small ring per reading, its value over its label beside it; on a
// limit, a dot marks how much of the window has gone.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter, ring } from '../charts'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import type { View } from './index'

const ORDER = ['labelsLong', 'resetText', 'calmSeven', 'cost', 'calmContext', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
const RING_PX = 26
const SMALL = { px: 60, cells: 6 } as const

const unit = (kit: Kit, key: string, o: Readonly<{ frac?: number; color?: string; dot?: number; alt: string; value: string; label: string; amber: boolean }>): RenderElement => {
  const { Box, Svg } = kit
  const mark = o.frac === undefined ? null : Svg
    ? ring(kit, { key: 'ring', alt: o.alt, frac: o.frac, color: o.amber ? kit.palette.amberFg : (o.color ?? kit.palette.meterFill), px: RING_PX, dot: o.dot })
    : meter(kit, { key: 'ring', label: o.alt, frac: o.frac, tone: o.amber ? 'amber' : 'calm', accent: o.color ?? kit.palette.meterFill, size: SMALL })
  const text = Svg
    ? <Box key="t" flexDirection="column">{words(kit, 'v', [[o.value, o.amber ? 'amber' : 'value']], true)}{words(kit, 'l', [[o.label, o.amber ? 'amber' : 'label']])}</Box>
    : <Box key="t" flexDirection="row" columnGap={1}>{words(kit, 'v', [[o.value, o.amber ? 'amber' : 'value']], true)}{words(kit, 'l', [[o.label, o.amber ? 'amber' : 'label']])}</Box>
  return <Box key={key} flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>{mark}{text}</Box>
}

const limitUnit = (kit: Kit, l: LimitView, color: string, keeps: (p: Piece) => boolean): RenderElement =>
  unit(kit, l.name, {
    frac: l.frac, color, dot: l.gone, alt: l.alt,
    value: l.passed ? 'reset' : l.value,
    label: l.tone === 'amber' ? (keeps('amberShort') ? (l.amber ?? l.name) : (l.amberShort ?? l.name)) : keeps('labelsLong') && keeps('resetText') && l.resetGlyph ? `${l.name} ${l.resetGlyph}` : l.name,
    amber: l.tone === 'amber',
  })

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const p = kit.palette
    const c = read.cache
    const x = read.context
    const pieces: RenderChildren[] = [
      unit(kit, 'cache', { frac: c.charge, color: p.warm, alt: c.alt, value: c.leftShort || c.condition, label: c.amber !== undefined ? (keeps('amberShort') ? c.amber : (c.amberShort ?? c.amber)) : keeps('labelsLong') ? `cache ${c.condition}` : 'cache', amber: c.amber !== undefined }),
      !x.known || (x.amber === undefined && !keeps('calmContext')) ? null
        : unit(kit, 'ctx', { frac: x.frac, color: p.meterFill, alt: x.alt, value: x.valueText, label: x.amber !== undefined ? (keeps('amberShort') ? x.amber : (x.amberShort ?? x.amber)) : 'context', amber: x.amber !== undefined }),
      read.fiveHour ? limitUnit(kit, read.fiveHour, p.fiveAccent, keeps) : null,
      read.sevenDay && (read.sevenDay.tone === 'amber' || keeps('calmSeven')) ? limitUnit(kit, read.sevenDay, p.weekAccent, keeps) : null,
      keeps('cost') ? unit(kit, 'cost', { alt: 'cost', value: read.spend.totalText, label: 'this session', amber: false }) : null,
    ].filter(piece => piece !== null)
    return line(kit, 'line', pieces, toggleButton(kit, read, act), 3)
  })

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const c = read.cache
  const x = read.context
  const fact = (k: string, label: string, value: string | undefined) => (value === undefined ? null : words(kit, k, [[`${label} `, 'label'], [value, 'value']]))
  const big = (key: string, mark: RenderChildren, title: string, facts: RenderChildren[]) => (
    <Box key={key} flexDirection="row" columnGap={2} flexGrow={1} width={0} minWidth={0}>
      {mark}
      <Box key="f" flexDirection="column">{words(kit, 't', [[title, 'label']], true)}{facts.filter(f => f !== null).slice(0, Math.max(0, bodyRows - 1))}</Box>
    </Box>
  )
  const five = read.fiveHour
  const seven = read.sevenDay
  return [
    <Box key="panels" flexDirection="row" columnGap={3}>
      {big('cache', ring(kit, { key: 'r', alt: c.alt, frac: c.charge, color: p.warm, px: 64, centre: c.leftShort || undefined }), 'Cache', [fact('rw', 're-warm', c.estimate), fact('sv', 'saved', c.savedText), fact('hit', 'hit', c.hitText), fact('ls', 'lasts', c.lastsText)])}
      {big('spend', null, `Spend ${read.spend.totalText}`, read.spend.split.map(s => fact(s.label, s.label, s.text)).concat([fact('last', 'last', read.spend.lastText)]))}
      {big('ctx', x.known ? ring(kit, { key: 'r', alt: x.alt, frac: x.frac, color: p.meterFill, px: 64, centre: x.valueText }) : null, 'Context', [fact('in', 'in context', x.inContextText), fact('at', 'compacts at', x.compactsAtText), fact('room', 'room', x.roomText)])}
      {big('limits', five ? ring(kit, { key: 'r', alt: five.alt, frac: five.frac, color: p.fiveAccent, px: 64, dot: five.gone }) : null, 'Limits', read.limits.map(l => fact(l.name, l.text, [l.resetGlyph, l.pace].filter(Boolean).join(' · '))).concat(seven ? [] : []))}
    </Box>,
  ]
}

export const ringsView: View = {
  name: 'rings',
  rows: { desktop: 2, terminal: 1 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), kit.Svg ? 2 : 1, body(kit, read)),
}
```

- **The spend donut** (spec §6): draw it with `ring` segments only if `ring` supports parts. Otherwise use the split bar (`meter` per part) and record a ruling. The spec allows "a donut becomes the split bar" on the terminal, and on the desktop the split bar is acceptable when `ring` has no segments.
- **The nested 7d ring:** if `ring` can't nest, draw the 7d ring beside the 5h ring, and record a ruling.

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/rings.tsx plugins/session-usage-band/tests/view-rings.test.ts
git commit -m "feat: the rings layout, a ring per reading

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 20: `departures`

**Files:** `hooks/views/departures.tsx`, `tests/view-departures.test.ts`
**Rows:** 1 and 1.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-departures.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG } from './helpers'
viewSuite('departures')

const say = async ($: never, on: never, scenario: Parameters<typeof drawAs>[2]['scenario'], cols = 160) =>
  shown(await drawAs($, on, { layout: 'departures', scenario, surface: 'terminal', appearance: 'dark', cols }))

test('warm, the cache departs in minutes, never "52M"', async ($, on) => {
  const t = await say($ as never, on as never, 'calm')
  expect(t).toMatch(/CACHE.*IN 1H 00 MIN/)
  expect(t).not.toMatch(/\d+M\b(?! MIN)/)
})
test('the last minute is LAST CALL, with the price and no "send"', LONG, async ($, on) => {
  const t = await say($ as never, on as never, 'lastMinute')
  expect(t).toMatch(/LAST CALL.*30s.*RE-WARM ~\$/)
  expect(t).not.toMatch(/send|keep warm/i)
})
test('cold, it has departed and names the re-warm', LONG, async ($, on) => {
  expect(await say($ as never, on as never, 'cold')).toMatch(/DEPARTED.*RE-WARM ~\$/)
})
test('working, it is boarding with no time', async ($, on) => {
  expect(await say($ as never, on as never, 'working')).toMatch(/BOARDING/)
})
test('a measured fill is ! FULL; 82% is ! NEAR LIMIT', LONG, async ($, on) => {
  expect(await say($ as never, on as never, 'fiveHourAhead')).toMatch(/! FULL/)
  expect(await say($ as never, on as never, 'limit80')).toMatch(/! NEAR LIMIT/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/departures.tsx`**

```tsx
// departures: a split-flap board. The cache is a flight that departs; its
// last minute is LAST CALL, said with its price and nothing more.

import type { RenderChildren, RenderElement } from 'claude-code'
import type { Kit } from '../kit'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton } from './frame'
import type { View } from './index'

const ORDER = ['fiveProjection', 'boardMinutes', 'calmSeven', 'calmFiveGroup', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
type Ink = 'text' | 'dim' | 'warm' | 'amber' | 'five' | 'week'

const flap = (kit: Kit, key: string, text: string, ink: Ink = 'text'): RenderElement => {
  const { Box, Text, palette: p } = kit
  const color = { text: p.flapText, dim: p.flapDim, warm: p.warm, amber: p.amberFg, five: p.fiveAccent, week: p.weekAccent }[ink]
  return (
    <Box key={key} flexShrink={0} paddingX={1} {...(p.filled ? { backgroundColor: ink === 'amber' ? p.amberBg : p.flap } : {})}>
      <Text color={color} bold>{text}</Text>
    </Box>
  )
}
const group = (kit: Kit, key: string, flaps: RenderChildren[]): RenderElement => {
  const { Box } = kit
  return <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>{flaps}</Box>
}
const minutes = (short: string): string => short.toUpperCase().replace(/M$/, ' MIN').replace(/S$/, 's')

const cacheFlaps = (kit: Kit, read: Readings, keeps: (p: Piece) => boolean): RenderChildren[] => {
  const c = read.cache
  if (read.frame.isWorking) return [flap(kit, 'c', 'CACHE'), flap(kit, 's', 'BOARDING', 'warm')]
  switch (c.condition) {
    case 'not measured': return [flap(kit, 'c', 'CACHE'), flap(kit, 's', 'NOT MEASURED', 'dim')]
    case 'warming': return [flap(kit, 'c', 'CACHE'), flap(kit, 's', 'WARMING', 'dim')]
    case 'cooling': return [flap(kit, 'c', 'CACHE'), flap(kit, 's', 'LAST CALL', 'amber'), flap(kit, 't', c.leftShort, 'amber'), ...(keeps('amberShort') ? [flap(kit, 'r', `RE-WARM ${c.estimate}`, 'dim')] : [])]
    case 'cold': return [flap(kit, 'c', 'CACHE'), flap(kit, 's', c.coldSinceClock ? `DEPARTED ${c.coldSinceClock}` : 'DEPARTED', 'dim'), flap(kit, 'r', `RE-WARM ${c.estimate}`)]
    case 'warm': return [flap(kit, 'c', 'CACHE'), flap(kit, 's', c.coldAtClock ? `DEPARTS ${c.coldAtClock}` : 'DEPARTS', 'warm'), ...(keeps('boardMinutes') || !c.coldAtClock ? [flap(kit, 't', `IN ${minutes(c.leftShort)}`)] : [])]
  }
}

const limitStatus = (l: LimitView): readonly [string, Ink] | undefined =>
  l.passed ? ['RESET', 'dim'] : l.tone === 'amber' ? (l.etaMs !== null ? [`! FULL ${l.fullAtClock ?? l.amberShort?.replace('! ', '') ?? ''}`.trim(), 'amber'] : ['! NEAR LIMIT', 'amber']) : l.projectedText ? [`${l.projectedText} AT ↻`, 'dim'] : undefined

const limitGroup = (kit: Kit, l: LimitView, ink: 'five' | 'week', full: boolean): RenderElement => {
  const status = limitStatus(l)
  return group(kit, l.name, [flap(kit, 'n', l.name.toUpperCase(), ink), flap(kit, 'v', l.passed ? '–' : l.value), ...(status && (full || l.tone === 'amber') ? [flap(kit, 's', status[0], status[1])] : [])])
}

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const f = read.fiveHour
    const w = read.sevenDay
    return line(kit, 'line', [
      group(kit, 'cache', cacheFlaps(kit, read, keeps)),
      f && (f.tone === 'amber' || keeps('calmFiveGroup')) ? limitGroup(kit, f, 'five', keeps('fiveProjection')) : f ? group(kit, '5h', [flap(kit, 'n', `5H ${f.value}`, 'five')]) : null,
      w && (w.tone === 'amber' || keeps('calmSeven')) ? limitGroup(kit, w, 'week', false) : null,
      group(kit, 'cost', [flap(kit, 'v', read.spend.totalText)]),
    ].filter(piece => piece !== null), toggleButton(kit, read, act))
  })

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, Text, palette: p } = kit
  const c = read.cache
  const x = read.context
  const head = (t: string) => <Text key={t} color={p.label} bold>{t}</Text>
  const row = (key: string, cells: readonly [string, string, string, string], ink: Ink = 'text') => (
    <Box key={key} flexDirection="row" columnGap={1}>
      <Box key="a" width={10} flexShrink={0}>{flap(kit, 'a', cells[0], ink)}</Box>
      <Box key="b" width={18} flexShrink={0}>{flap(kit, 'b', cells[1], cells[1].startsWith('!') || cells[1] === 'LAST CALL' ? 'amber' : 'text')}</Box>
      <Box key="c" width={14} flexShrink={0}>{flap(kit, 'c', cells[2])}</Box>
      <Box key="d" flexGrow={1} width={0} minWidth={0} overflow="hidden">{flap(kit, 'd', cells[3], 'dim')}</Box>
    </Box>
  )
  const rows = [
    row('cache', ['CACHE', c.condition === 'cooling' ? 'LAST CALL' : c.condition.toUpperCase(), c.leftShort ? `IN ${minutes(c.leftShort)}` : '–', `RE-WARM ${c.estimate}${c.savedText ? ` · SAVED ${c.savedText}` : ''}`]),
    ...(x.known ? [row('ctx', ['CONTEXT', x.amber ? `! ${x.valueText}` : `${x.valueText} TO COMPACT`, `${x.inContextText} OF ${x.windowText}`.toUpperCase(), (x.compactsAtText ? `COMPACTS AT ${x.compactsAtText} · ROOM ${x.roomText ?? '–'}` : 'NO AUTO-COMPACTION').toUpperCase()])] : []),
    ...read.limits.map(l => row(l.name, [l.name.toUpperCase(), limitStatus(l)?.[0] ?? l.value, l.resetClock ? `↻ ${l.resetClock}` : (l.resetGlyph ?? '–'), `${l.value} NOW${l.projectedText ? ` · ${l.projectedText} AT RESET` : ''}`])),
    row('spend', ['SPEND', read.spend.totalText, read.spend.lastText ? `LAST ${read.spend.lastText}` : '–', `${read.spend.tokensText} TOKENS`.toUpperCase()]),
  ]
  return [
    <Box key="th" flexDirection="row" columnGap={1}>{head('ITEM      ')}{head('STATUS            ')}{head('TIME          ')}{head('REMARKS')}</Box>,
    ...rows.slice(0, Math.max(0, bodyRows - 1)),
  ]
}

export const departuresView: View = {
  name: 'departures',
  rows: { desktop: 1, terminal: 1 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), 1, body(kit, read)),
}
```

**Ruling: the board header.** Its padding uses spaces inside Text with other characters. That's allowed: only whitespace-*only* strings are dropped. If the desktop misaligns it, replace the padding with fixed-`width` Boxes, as the rows use.

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/departures.tsx plugins/session-usage-band/tests/view-departures.test.ts
git commit -m "feat: the departures layout, a split-flap board

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 21: `forecast`

**Files:** `hooks/views/forecast.tsx`, `tests/view-forecast.test.ts`
**Rows:** desktop 2, terminal 1.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-forecast.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG } from './helpers'
viewSuite('forecast')

const say = async ($: never, on: never, scenario: Parameters<typeof drawAs>[2]['scenario'], cols = 160) =>
  shown(await drawAs($, on, { layout: 'forecast', scenario, surface: 'terminal', appearance: 'dark', cols }))

test('now, then events in time order, at most three', async ($, on) => {
  const t = await say($ as never, on as never, 'calm')
  expect(t).toMatch(/now · warm/)
  expect(t.indexOf('cold')).toBeLessThan(t.indexOf('5h resets'))
  expect((t.match(/│/g) ?? []).length).toBeLessThanOrEqual(3)
})
test('the last minute is "! cooling" with seconds', LONG, async ($, on) => {
  expect(await say($ as never, on as never, 'lastMinute')).toMatch(/! cooling · 30s left/)
})
test('a measured fill is an event before the reset', LONG, async ($, on) => {
  const t = await say($ as never, on as never, 'fiveHourAhead')
  expect(t).toMatch(/! 5h full/)
  expect(t.indexOf('! 5h full')).toBeLessThan(t.indexOf('5h resets'))
})
test('no weather glyphs in the terminal: the words carry it', async ($, on) => {
  expect(await say($ as never, on as never, 'calm')).not.toMatch(/[☼☁❄✱◐]/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/forecast.tsx`**

```tsx
// forecast: read like the weather — now, then each change at its clock time.

import type { RenderChildren, RenderElement } from 'claude-code'
import { meter } from '../charts'
import type { Kit } from '../kit'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import type { View } from './index'

const ORDER = ['farEvents', 'inX', 'detail', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
type Event = Readonly<{ key: string; at: number; time: string; label: string; detail: string; amber: boolean; icon?: 'sun' | 'cloud' | 'snow' | 'five' | 'week' }>
const DAY_MS = 24 * 3600_000

const eventsOf = (read: Readings): Event[] => {
  const c = read.cache
  const f = read.fiveHour
  const w = read.sevenDay
  const now = read.frame.now
  const out: Event[] = []
  if ((c.condition === 'warm' || c.condition === 'cooling') && !read.frame.isWorking) {
    out.push({ key: 'cold', at: c.raw.msLeft, time: c.coldAtClock ?? `in ${c.leftShort}`, label: 'cold', detail: `re-warm ${c.estimate}`, amber: false, icon: 'snow' })
  }
  if (f?.etaMs != null) out.push({ key: 'full', at: f.etaMs, time: f.fullAtClock ?? (f.amberShort ?? '').replace(/^! 5h /, ''), label: '! 5h full', detail: 'at this pace', amber: true, icon: 'five' })
  const resetAt = (iso: string | undefined) => (iso === undefined ? NaN : Date.parse(iso) - now)
  if (f && !f.passed && f.reset?.kind === 'in') out.push({ key: '5r', at: resetAt(f.reading.resetsAt), time: f.resetClock ?? f.resetGlyph ?? '', label: '5h resets', detail: `from ${f.value}`, amber: false, icon: 'five' })
  if (w && !w.passed && w.reset?.kind === 'in' && resetAt(w.reading.resetsAt) <= DAY_MS) out.push({ key: '7r', at: resetAt(w.reading.resetsAt), time: w.resetClock ?? w.resetGlyph ?? '', label: '7d resets', detail: `from ${w.value}`, amber: false, icon: 'week' })
  return out.filter(e => Number.isFinite(e.at)).sort((a, b) => a.at - b.at).slice(0, 3)
}

const column = (kit: Kit, key: string, head: RenderChildren, detail: RenderChildren | null): RenderElement => {
  const { Box } = kit
  return kit.Svg
    ? <Box key={key} flexDirection="column" flexShrink={0}>{head}{detail}</Box>
    : <Box key={key} flexDirection="row" columnGap={1} flexShrink={0}>{head}{detail}</Box>
}

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const { icon } = kit
    const c = read.cache
    const events = eventsOf(read)
    const kept = events.filter((e, i) => e.amber || i === 0 || keeps('farEvents'))
    const nowHead = c.amber !== undefined
      ? words(kit, 'h', [[keeps('amberShort') ? `! cooling · ${c.left}` : `! ${c.leftShort}`, 'amber']])
      : words(kit, 'h', [['now · ', 'label'], [read.frame.isWorking ? 'warm' : c.condition, 'value']])
    const nowDetail = keeps('detail') && c.amber === undefined ? words(kit, 'd', [[c.left || (c.condition === 'cold' ? `re-warm ${c.estimate}` : ''), 'label']]) : null
    const cols: RenderChildren[] = [column(kit, 'now', [...(kit.Svg ? icon(c.condition === 'cooling' ? 'cloud' : c.condition === 'cold' ? 'snow' : 'sun', c.amber ? kit.palette.amberFg : kit.palette.warm) : []), nowHead], nowDetail)]
    kept.forEach((e, i) => {
      cols.push(words(kit, `sep${i}`, [['│', 'label']]))
      const time = i === 0 && e.key === 'cold' && keeps('inX') && c.coldAtClock ? `${e.time} · in ${c.leftShort}` : e.time
      cols.push(column(kit, e.key, words(kit, 'h', [[`${time} · `, e.amber ? 'amber' : 'label'], [e.label, e.amber ? 'amber' : 'value']]), keeps('detail') ? words(kit, 'd', [[e.detail, 'label']]) : null))
    })
    return line(kit, 'line', cols, toggleButton(kit, read, act), 1)
  })

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const c = read.cache
  const x = read.context
  const size = { px: 200, cells: 20 } as const
  const row = (key: string, name: string, now: string, bar: RenderChildren, outcome: string, amber = false) => (
    <Box key={key} flexDirection="row" columnGap={2}>
      <Box key="n" width={10} flexShrink={0}>{words(kit, 'n', [[name, amber ? 'amber' : 'value']], true)}</Box>
      <Box key="v" width={12} flexShrink={0}>{words(kit, 'v', [[now, amber ? 'amber' : 'value']])}</Box>
      <Box key="b" flexShrink={0}>{bar}</Box>
      {words(kit, 'o', [[outcome, 'label']])}
    </Box>
  )
  const rows = [
    row('cache', 'Cache', c.leftShort || c.condition, meter(kit, { key: 'b', label: 'cache', frac: c.charge, tone: c.tone, accent: p.warm, size, reads: 'left' }), c.condition === 'cold' ? `next message ${c.estimate}` : `cold ${c.coldAtClock ?? 'later'}, then ${c.estimate}`, c.tone === 'amber'),
    ...(x.known ? [row('ctx', 'Context', x.valueText, meter(kit, { key: 'b', label: 'context', frac: x.frac, tone: x.tone, accent: p.meterFill, size, projectTo: 1 }), x.compactsAtText ? `compacts at ${x.compactsAtText}, ${x.roomText} room` : 'no auto-compaction', x.tone === 'amber')] : []),
    ...read.limits.map(l => row(l.name, l.name, l.passed ? 'reset' : l.value, meter(kit, { key: 'b', label: l.name, frac: l.frac, tone: l.tone, accent: l.key === '5h' ? p.fiveAccent : l.key === '7d' ? p.weekAccent : p.meterFill, size, projectTo: l.projectedPct === undefined ? undefined : Math.min(1, l.projectedPct / 100) }), [l.pace, l.resetClock ? `↻ ${l.resetClock}` : l.resetGlyph].filter(Boolean).join(' · '), l.tone === 'amber')),
    row('spend', 'Spend', read.spend.totalText, null, read.spend.lastText ? `last ${read.spend.lastText} · ${read.spend.tokensText} tokens` : `${read.spend.tokensText} tokens`),
  ]
  return rows.slice(0, Math.max(0, bodyRows))
}

export const forecastView: View = {
  name: 'forecast',
  rows: { desktop: 2, terminal: 1 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), kit.Svg ? 2 : 1, body(kit, read)),
}
```

**Ruling: `rows` per surface.** `rows.desktop` is 2 for the Svg desktop. Desktop *plain* has no Svg and draws one row. The matrix's row check reads `kit.Svg ? rows.desktop : rows.terminal`. Apply this in `expectInvariants` through Task 15b: `rows[surface === 'desktop' && appearance !== 'plain' ? 'desktop' : 'terminal']`. Rings needs the same rule.

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/forecast.tsx plugins/session-usage-band/tests/view-forecast.test.ts
git commit -m "feat: the forecast layout, now and each change ahead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 22: Merge P2

- [ ] **Step 1:** On `feat/layouts`, merge the views in order: ledger, tiles, gauges, rings, departures, forecast. Use `git merge --no-ff layouts/<name>` for each, and run the full gates after each one (validate, test, tsc).
- [ ] **Step 2:** If a merge conflicts outside the view's own two files, a frozen file changed. Stop and resolve it through Task 15b.
- [ ] **Step 3:** Remove the worktrees with `git worktree remove .worktrees/<name>` and the branches with `git branch -d layouts/<name>`. If permissions refuse either, ask the maintainer.

---

## P3: Histories, then pulse and week (serial)

### Task 23: The conversation trails and `reWarm`

**Files:**
- Modify: `hooks/cache.ts` (`lastRebuilt`)
- Modify: `hooks/insights.ts` (`costTrail`, `contextTrail`, `fiveHourTrail`)
- Modify: `hooks/register.tsx`
- Modify: `hooks/snapshot.ts` (`history`)
- Modify: `hooks/reading.ts` (`Readings.history`)
- Test: `tests/history.test.ts` (new)

**Interfaces:**
- **Produces:**

```ts
// snapshot.ts
history: Readonly<{ costs: ReadonlyArray<Readonly<{ usd: number; reWarm: boolean }>>; context: readonly number[]; fiveHour: ReadonlyArray<Readonly<{ at: number; pct: number }>> }>
// reading.ts → Readings.history
history: Readonly<{ costs: ReadonlyArray<Readonly<{ usd: number; reWarm: boolean }>>; costMax: number; lastText: string | undefined; avgText: string | undefined; maxText: string | undefined; reWarmText: string | undefined; context: readonly number[]; fiveHour: ReadonlyArray<Readonly<{ at: number; pct: number }>>; fiveHourHour: readonly number[]; empty: boolean; costsAlt: string; trailAlt: string }>
// costsAlt: 'cost of the last 14 messages, steady' | '…, the newest a re-warm'; trailAlt: '5h usage over the last hour, steady' | '…, rising, full in about 40 minutes'
// insights.ts
export const COST_TRAIL = 24, CONTEXT_TRAIL = 40, FIVE_HOUR_TRAIL = 300
```

`avgText` is `avgWarmUsd`, the mean of non-re-warm costs, formatted with `fmtSmallCost`. `Readings.spend.avgWarmUsd` takes the same value.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/history.test.ts
import { test, expect } from 'claude-code/testing'
import { COST_TRAIL, CONTEXT_TRAIL, FIVE_HOUR_TRAIL } from '../hooks/insights'
import { setup, START, turn, respond, resp, LONG, MIN, CLEAR } from './helpers'
import { readHistoryForTest } from '../hooks/register'

test('the cost trail keeps the last 24 turns', LONG, async ($, on) => {
  setup(on); await $.session.start(START)
  for (let i = 0; i < 30; i++) await turn($, `t${i}`, i, i + 0.2)
  expect(readHistoryForTest().costs).toHaveLength(COST_TRAIL)
})
test('/clear empties the conversation trails but keeps the 5h trail', LONG, async ($, on) => {
  const clock = setup(on); await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await turn($, 't1', 1, 1.2); await clock.advance(2 * MIN)
  await $.session.end(CLEAR)
  const h = readHistoryForTest()
  expect(h.costs).toHaveLength(0); expect(h.context).toHaveLength(0)
  expect(h.fiveHour.length).toBeGreaterThan(0)
})
test('a turn after the TTL ran out is marked a re-warm', LONG, async ($, on) => {
  const clock = setup(on); await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await turn($, 't1', 1, 1.2)
  await clock.advance(61 * MIN)
  await $.turn.start({ text: 'hi', turnId: 't2' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(readHistoryForTest().costs.at(-1)?.reWarm).toBe(true)
})
test('the 5h trail keeps at most one reading a minute, 300 at most', LONG, async ($, on) => {
  const clock = setup(on); await $.session.start(START)
  for (let i = 0; i < 400; i++) { await $.session.measure({ context: { window: 200_000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 4, resetsAt: new Date(5 * 3600_000).toISOString() }], cost: { usd: 1 }, changed: [] }); await clock.advance(30_000) }
  expect(readHistoryForTest().fiveHour.length).toBeLessThanOrEqual(FIVE_HOUR_TRAIL)
})
```

**About `readHistoryForTest`.** It is a read-only export from `register.tsx` returning `band.history`. If an exported accessor is disallowed, read the same data through a mounted pulse view's text instead. Record that as a ruling.

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement**
  - **`cache.ts`:** in `recordResponse`, set `state.lastRebuilt = true` when a main request writes the cache:
    - after `gap > TTL_MS`;
    - as a miss (the existing branch);
    - after a compaction (the existing flag);
    - after a model switch.

    Otherwise set it to `false`. Export a read-only `cache.lastRebuilt`.
  - **`insights.ts`:**
    - `pushCost(usd, reWarm)` caps at `COST_TRAIL`.
    - `pushContext(tokens)` caps at `CONTEXT_TRAIL`.
    - `noteFiveHourTrail(now, pct)` keeps at most one reading per minute bucket, caps at `FIVE_HOUR_TRAIL`, and drops readings older than 5 h.
    - `resetConversationInsights` clears costs and context. `resetInsights` clears the 5h trail too.
  - **`register.tsx`:**
    - In `noteTurnEnd`'s branch, when spent > 0, call `pushCost(spent, cache.lastRebuilt)`. Also call `pushContext(contextUsed)`.
    - In `session.measure`, call `noteFiveHourTrail`.
    - The snapshot gets `history`.
  - **`reading.ts`:** `Readings.history`, using `fmtSmallCost`; `fiveHourHour` is the trail's last 60 minutes.
- [ ] **Step 4: Run the tests until they pass.** Golden is unchanged.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/history.test.ts
git commit -m "feat: the band remembers each message's cost, the context and the 5h trend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 24: `limitSamples` and the calendar

**Files:**
- Modify: `hooks/memory.ts` (`asLimitSamples`, `addSample`)
- Create: `hooks/calendar.ts` (pure: `weekOf`)
- Modify: `hooks/register.tsx`
- Modify: `hooks/snapshot.ts` (`samples`)
- Modify: `hooks/reading.ts` (`Readings.week`)
- Test: `tests/calendar.test.ts`
- Test: extend `tests/history.test.ts`

**Interfaces:**
- **Produces:**

```ts
export type Sample = Readonly<{ at: number; fivePct: number; sevenPct: number; fiveResetAt: number; sevenResetAt: number }>
export const MAX_SAMPLES = 672
export const addSample: (samples: readonly Sample[], s: Sample) => Sample[]   // one per 15-minute bucket (latest wins), capped, sorted
export const asLimitSamples: (v: unknown) => Sample[]
// calendar.ts
export type DayCell = Readonly<{ initial: string; date: string; pct: number | undefined; today: boolean; future: boolean; guessPct: number | undefined; fullMark: boolean }>
export type HourCell = Readonly<{ label: string; pct: number | undefined; now: boolean; future: boolean; fullMark: boolean }>
export const weekOf: (o: Readonly<{ samples: readonly Sample[]; seven: LimitView | undefined; five: LimitView | undefined; now: number; utcOffsetMin: number }>) => Readonly<{ days: DayCell[]; hours: HourCell[]; busiest: string | undefined }>
// Readings.week = weekOf(...) & { empty: boolean; today: number; nowHour: number; daysAlt: string; hoursAlt: string; summary7: string | undefined; summary5: string | undefined }
// daysAlt: 'weekly limit by day: Tuesday 6%, Wednesday 9%, …'; summary7: '30% used · on pace for ~50% by Mon 08:40 · busiest Thu'
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/calendar.test.ts
import { test, expect } from 'claude-code/testing'
import { addSample, MAX_SAMPLES } from '../hooks/memory'
import { weekOf } from '../hooks/calendar'

const H = 3600_000
const T0 = Date.UTC(2026, 9, 6, 8, 40) // Tue 08:40 UTC, the 7d window's start
const s = (h: number, seven: number, five = 0) => ({ at: T0 + h * H, fivePct: five, sevenPct: seven, fiveResetAt: T0 + (Math.floor(h / 5) + 1) * 5 * H, sevenResetAt: T0 + 168 * H })

test('one sample per 15-minute bucket, the latest wins, capped', () => {
  let all: ReturnType<typeof addSample> = []
  all = addSample(all, s(0, 1)); all = addSample(all, { ...s(0, 2), at: T0 + 5 * 60_000 })
  expect(all).toHaveLength(1); expect(all[0]?.sevenPct).toBe(2)
  for (let i = 0; i < 800; i++) all = addSample(all, s(i * 0.25, i))
  expect(all.length).toBeLessThanOrEqual(MAX_SAMPLES)
})
test("a day cell is that day's rise in the weekly limit", () => {
  const samples = [s(0, 0), s(15, 6), s(39, 15), s(63, 26), s(77, 30)]
  const wk = weekOf({ samples, seven: { percentUsed: 30, projectedPct: 50 } as never, five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.map(d => d.initial).join('')).toBe('TWTFSSM')
  expect(wk.days.slice(0, 4).map(d => Math.round(d.pct ?? -1))).toEqual([6, 9, 11, 4])
  expect(wk.days[3]?.today).toBe(true)
  expect(wk.days.slice(4).every(d => d.future)).toBe(true)
  expect(wk.days[4]?.guessPct).toBeCloseTo((50 - 30) / 3, 5)
})
test('a sample from another window is ignored', () => {
  const stale = { ...s(10, 50), sevenResetAt: T0 - H }
  const wk = weekOf({ samples: [stale, s(0, 0), s(20, 5)], seven: { percentUsed: 5, projectedPct: 20 } as never, five: undefined, now: T0 + 20 * H, utcOffsetMin: 0 })
  expect(Math.max(...wk.days.map(d => d.pct ?? 0))).toBeLessThan(50)
})
test('no samples: every past cell is unknown, never 0%', () => {
  const wk = weekOf({ samples: [], seven: { percentUsed: 30, projectedPct: 50 } as never, five: undefined, now: T0 + 77 * H, utcOffsetMin: 0 })
  expect(wk.days.slice(0, 3).every(d => d.pct === undefined)).toBe(true)
})
```

Append to `tests/history.test.ts`:
- `samples are written at most once per 15 minutes over 2 hours`: count `store.set` calls for `limitSamples`, expecting at most 9.
- `a failing store never throws`: set `engine.storeFails = true` and complete a turn.

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement**
  - **`addSample`:**
    1. bucket = `Math.floor(at / 900_000)`;
    2. replace any sample in the same bucket;
    3. sort by `at`;
    4. drop the oldest past `MAX_SAMPLES`.
  - **`weekOf`:**
    - **Days:** the 7d window runs from `sevenResetAt − 7d` to `sevenResetAt`. Each day cell covers that local day (using `utcOffsetMin`) clipped to the window.
    - **A day's `pct`:** the rise in `sevenPct` between the last sample before the day's start and the last sample in the day, using only samples whose `sevenResetAt` equals the current window's reset. If there is no sample at either end, `pct` is `undefined`.
    - **Days to come:** `future` is true, `pct` is `undefined`, and `guessPct = (projectedPct − percentUsed) / daysLeft`.
    - **Full mark:** `fullMark` is on the first future day where the cumulative guess passes 100.
    - **Hours:** the five hours before `fiveResetAt`, computed the same way with `fivePct`.
    - **`busiest`:** the initial of the largest day.
  - **`register.tsx`:**
    - On `turn.complete`, when both limits are known, read `asLimitSamples(await $.store.get(LIMIT_SAMPLES_KEY))`, `addSample`, and write it back only when the bucket is new or changed.
    - Catch store errors silently: keep the old samples, never throw.
    - Hold `band.samples` for the snapshot.
  - **`reading.ts`:** `Readings.week = weekOf({...})` when `utcOffsetMin` is known. Otherwise use offset 0, and state it in the README.
- [ ] **Step 4: Run the tests until they pass.** Also check the measured size: 672 samples serialised come to at most 70 KB. Add `expect(JSON.stringify(all).length).toBeLessThan(70_000)` to the cap test.
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks plugins/session-usage-band/tests/calendar.test.ts plugins/session-usage-band/tests/history.test.ts
git commit -m "feat: the band keeps a week of limit samples, bounded, for the calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 25: `pulse`

**Files:** `hooks/views/pulse.tsx`, `tests/view-pulse.test.ts`
**Rows:** desktop 2, terminal 1.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-pulse.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, LONG, svgsOf } from './helpers'
viewSuite('pulse')

test('the cost bars sit beside their numbers', LONG, async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'pulse', scenario: 'fullHistory', surface: 'terminal', appearance: 'dark', cols: 160 }))).toMatch(/[⠀-⣿]+.*last \$\S+/)
})
test('no history yet says so, in the band\'s words', async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'pulse', scenario: 'emptyHistory', surface: 'terminal', appearance: 'dark', cols: 160, expanded: true }))).toMatch(/Costs show after Claude's next reply\./)
})
test('the desktop draws the bars and the 5h trail as Svgs with alt text', LONG, async ($, on) => {
  const alts = svgsOf(await drawAs($, on, { layout: 'pulse', scenario: 'fullHistory', surface: 'desktop', appearance: 'dark', cols: 160 })).map(n => String(n.props?.alt))
  expect(alts.some(a => /cost of the last/.test(a))).toBe(true)
  expect(alts.some(a => /5h/.test(a))).toBe(true)
})
test('in ascii the charts give way to numbers', LONG, async ($, on) => {
  const t = shown(await drawAs($, on, { layout: 'pulse', scenario: 'fullHistory', surface: 'terminal', appearance: 'dark', cols: 160, env: { CC_BAND_GLYPHS: 'ascii' } }))
  expect(t).toMatch(/last \$\S+ - avg \$\S+/)
  expect(t).not.toMatch(/[⠀-⣿]/)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/pulse.tsx`**

```tsx
// pulse: trends, not just totals — each message's cost, and which way the
// 5-hour limit is heading. In the ascii tier the charts give way to numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { barChart, sparkline } from '../charts'
import type { Kit } from '../kit'
import { EMPTY } from '../reading'
import type { Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import { parts } from './parts'
import type { View } from './index'

const ORDER = ['calmContextText', 'calmSevenText', 'resetText', 'barsMany', 'trailChart', 'barsChart', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
const BAR_PX = 6

const numbers = (read: Readings): string =>
  [read.history.lastText && `last ${read.history.lastText}`, read.history.avgText && `avg ${read.history.avgText}`, read.history.maxText && `max ${read.history.maxText}${read.history.reWarmText ? ' re-warm' : ''}`]
    .filter(Boolean)
    .join(' · ')

const amberOr = (keeps: (p: Piece) => boolean, long: string | undefined, short: string | undefined, calm: string): readonly [string, 'amber' | 'label'] =>
  long !== undefined ? [keeps('amberShort') ? long : (short ?? long), 'amber'] : [calm, 'label']

const collapsedLine = (kit: Kit, read: Readings, act: BandActions): RenderElement =>
  fitLine(kit, ORDER, lineRoom(kit), keeps => {
    const p = kit.palette
    const h = read.history
    const f = read.fiveHour
    const x = read.context
    const w = read.sevenDay
    const ascii = read.frame.glyphs === 'ascii'
    const own = parts(kit, read)
    const recent = h.costs.slice(keeps('barsMany') ? -14 : -8)
    const costs: RenderChildren[] = h.empty
      ? [words(kit, 'empty', [[EMPTY.costs, 'label']])]
      : [
          !ascii && keeps('barsChart')
            ? barChart(kit, { key: 'bars', alt: h.costsAlt, values: recent.map(c => c.usd), marked: recent.map(c => c.reWarm), color: p.meterFill, markColor: p.value, px: recent.length * BAR_PX, height: 22 })
            : null,
          words(kit, 'total', [[read.spend.totalText, 'value']], true),
          words(kit, 'nums', [[numbers(read), 'label']]),
        ]
    const trail: RenderChildren[] = f === undefined ? [] : [
      !ascii && keeps('trailChart') && h.fiveHourHour.length > 1
        ? sparkline(kit, { key: 'trail', alt: h.trailAlt, values: h.fiveHourHour, color: f.tone === 'amber' ? p.amberFg : p.fiveAccent, px: 92, height: 22, projectTo: f.tone === 'amber' ? 1 : undefined })
        : null,
      f.amber !== undefined
        ? words(kit, '5h', [amberOr(keeps, f.amber, f.amberShort, f.text)])
        : words(kit, '5h', [[f.text, 'value'], [f.pace ? ` · ${f.pace}` : '', 'label'], [keeps('resetText') && f.resetGlyph ? ` · ${f.resetGlyph}` : '', 'label']]),
    ]
    const tail: RenderChildren[] = [
      x.known && (x.amber !== undefined || keeps('calmContextText')) ? words(kit, 'ctx', [amberOr(keeps, x.amber, x.amberShort, x.text)]) : null,
      w && (w.amber !== undefined || keeps('calmSevenText')) ? words(kit, '7d', [amberOr(keeps, w.amber, w.amberShort, w.text)]) : null,
    ]
    const pill = own.pill({ ...own.cachePill(kit.columns < 68), hover: undefined }, 'left')
    return line(kit, 'line', [pill, ...costs, ...trail, ...tail].filter(piece => piece !== null), toggleButton(kit, read, act))
  })

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const h = read.history
  const f = read.fiveHour
  const x = read.context
  const c = read.cache
  const charts = read.frame.glyphs !== 'ascii' && bodyRows >= 3
  const section = (key: string, title: string, chart: RenderChildren, note: string) => (
    <Box key={key} flexDirection="column" flexGrow={1} width={0} minWidth={0}>
      {words(kit, 't', [[title, 'label']], true)}
      {charts ? chart : null}
      {words(kit, 'n', [[note, 'label']])}
    </Box>
  )
  return [
    <Box key="charts" flexDirection="row" columnGap={3}>
      {section('costs', 'Cost per message', h.empty ? null : barChart(kit, { key: 'b', alt: h.costsAlt, values: h.costs.map(e => e.usd), marked: h.costs.map(e => e.reWarm), color: p.meterFill, markColor: p.value, px: h.costs.length * BAR_PX, height: 40 }), h.empty ? EMPTY.costs : numbers(read))}
      {f ? section('5h', '5h this window', h.fiveHour.length > 1 ? sparkline(kit, { key: 's', alt: h.trailAlt, values: h.fiveHour.map(r => r.pct), color: f.tone === 'amber' ? p.amberFg : p.fiveAccent, px: 180, height: 40, projectTo: f.projectedPct === undefined ? undefined : Math.min(1, f.projectedPct / 100) }) : null, [f.text, f.pace, f.resetClock ? `↻ ${f.resetClock}` : f.resetGlyph].filter(Boolean).join(' · ')) : null}
      {x.known ? section('ctx', 'Context', h.context.length > 1 ? sparkline(kit, { key: 's', alt: x.alt, values: h.context, color: p.meterFill, px: 180, height: 40, projectTo: x.compactsAtText ? 1 : undefined }) : null, [x.inContextText, x.compactsAtText && `compacts at ${x.compactsAtText}`].filter(Boolean).join(' · ')) : null}
      {section('cache', 'Cache', null, [c.left || c.condition, `re-warm ${c.estimate}`, c.hitText && `hit ${c.hitText}`].filter(Boolean).join(' · '))}
    </Box>,
  ]
}

export const pulseView: View = {
  name: 'pulse',
  rows: { desktop: 2, terminal: 1 },
  draw: (kit, read, act) => openView(kit, read, act, panel(kit, 'collapsed', [collapsedLine(kit, read, act)]), kit.Svg ? 2 : 1, body(kit, read)),
}
```

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/pulse.tsx plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/tests/view-pulse.test.ts
git commit -m "feat: the pulse layout, each message's cost and the 5h trend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 26: `week`

**Files:** `hooks/views/week.tsx`, `tests/view-week.test.ts`
**Rows:** 2 and 2.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/view-week.test.ts
import { test, expect } from 'claude-code/testing'
import { viewSuite, drawAs } from './matrix'
import { shown, svgsOf } from './helpers'
viewSuite('week')

test('the desktop draws day cells and hour cells as Svgs', async ($, on) => {
  const alts = svgsOf(await drawAs($, on, { layout: 'week', scenario: 'calm', surface: 'desktop', appearance: 'dark', cols: 160 })).map(n => String(n.props?.alt))
  expect(alts.some(a => /weekly limit by day/.test(a))).toBe(true)
  expect(alts.some(a => /5-hour limit by hour/.test(a))).toBe(true)
})
test('the terminal marks today in brackets and shows the initials', async ($, on) => {
  const t = shown(await drawAs($, on, { layout: 'week', scenario: 'calm', surface: 'terminal', appearance: 'dark', cols: 160 }))
  expect(t).toMatch(/\[/)
  expect(t).toMatch(/[MTWFS]{1}/)
})
test('no history: today alone, and the empty line when open', async ($, on) => {
  expect(shown(await drawAs($, on, { layout: 'week', scenario: 'emptyHistory', surface: 'terminal', appearance: 'dark', cols: 160, expanded: true }))).toMatch(/History fills in as you use Claude\./)
})
```

- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Implement `hooks/views/week.tsx`**

```tsx
// week: where your limits went — the week as day cells, the 5-hour window as
// hour cells, shaded by height. In the ascii tier the cells become numbers.

import type { RenderChildren, RenderElement } from 'claude-code'
import { dayCells } from '../charts'
import type { DayCell, HourCell } from '../calendar'
import type { Kit } from '../kit'
import { EMPTY } from '../reading'
import type { LimitView, Readings } from '../reading'
import type { BandActions } from '../snapshot'
import { fitLine, line, lineRoom, openView, panel, toggleButton, words } from './frame'
import { parts } from './parts'
import type { View } from './index'

const ORDER = ['resetText', 'calmFiveCells', 'calmSevenCells', 'amberShort'] as const
type Piece = (typeof ORDER)[number]
type Cell = DayCell | HourCell
const nameOf = (c: Cell): string => ('initial' in c ? c.initial : c.label)
const isNow = (c: Cell): boolean => ('today' in c ? c.today : c.now)

/** The ascii tier's cells: each day's share as a number, today in brackets. */
const asText = (cells: readonly Cell[]): string =>
  cells.map(c => (isNow(c) ? `[${nameOf(c)}${c.pct === undefined ? '' : Math.round(c.pct)}]` : `${nameOf(c)}${c.pct === undefined ? '' : Math.round(c.pct)}`)).join(' ')

const windowPieces = (kit: Kit, read: Readings, key: '7d' | '5h', l: LimitView | undefined, cells: readonly Cell[], accent: string, step: Piece, keeps: (p: Piece) => boolean): RenderChildren[] => {
  if (l === undefined) return []
  const amber = l.amber !== undefined
  const name = words(kit, `${key}:n`, [[l.name, amber ? 'amber' : key === '7d' ? 'accent7' : 'accent5']])
  const reset = keeps('resetText') ? (l.resetClock ? ` ↻ ${l.resetClock}` : l.resetGlyph ? ` ${l.resetGlyph}` : '') : ''
  const value = amber
    ? words(kit, `${key}:v`, [[keeps('amberShort') ? (l.amber ?? l.text) : (l.amberShort ?? l.text), 'amber']])
    : words(kit, `${key}:v`, [[l.passed ? 'reset' : l.value, 'value'], [reset, 'label']])
  if ((!amber && !keeps(step)) || read.week.empty) return [name, value]
  const chart = read.frame.glyphs === 'ascii'
    ? words(kit, `${key}:c`, [[asText(cells), 'value']])
    : dayCells(kit, {
        key: `${key}:c`,
        alt: key === '7d' ? read.week.daysAlt : read.week.hoursAlt,
        values: cells.map(c => c.pct),
        today: cells.findIndex(isNow),
        color: amber ? kit.palette.amberFg : accent,
        cellPx: key === '7d' ? 16 : 11,
        height: 16,
        labels: cells.map(c => (c.fullMark ? '!' : nameOf(c))),
      })
  return [name, chart, value]
}

const collapsed = (kit: Kit, read: Readings, act: BandActions): RenderElement => {
  const p = kit.palette
  const wk = read.week
  const own = parts(kit, read)
  const r1 = fitLine(kit, ORDER, lineRoom(kit), keeps =>
    line(kit, 'r1', [
      ...windowPieces(kit, read, '7d', read.sevenDay, wk.days, p.weekAccent, 'calmSevenCells', keeps),
      ...windowPieces(kit, read, '5h', read.fiveHour, wk.hours, p.fiveAccent, 'calmFiveCells', keeps),
    ]),
  )
  // The terminal draws the initials on a line of their own; the desktop's
  // cells carry theirs inside the Svg.
  const initials = !kit.Svg && read.frame.glyphs !== 'ascii' && !wk.empty
    ? words(kit, 'ini', [[`   ${wk.days.map(d => (d.today ? ` ${d.fullMark ? '!' : d.initial} ` : d.fullMark ? '!' : d.initial)).join('')}`, 'label']])
    : null
  const empty = wk.empty ? words(kit, 'empty', [[EMPTY.history, 'label']]) : null
  const r2 = line(kit, 'r2', [initials ?? empty, own.pill({ ...own.cachePill(kit.columns < 68), hover: undefined }, 'left'), words(kit, 'cost', [[read.spend.totalText, 'value']])].filter(piece => piece !== null), toggleButton(kit, read, act))
  return panel(kit, 'collapsed', [r1, r2])
}

const body = (kit: Kit, read: Readings) => (bodyRows: number): RenderChildren[] => {
  const { Box, palette: p } = kit
  const wk = read.week
  if (wk.empty) return [words(kit, 'empty', [[EMPTY.history, 'label']])]
  const big = (key: string, cells: readonly Cell[], color: string, alt: string) =>
    read.frame.glyphs === 'ascii'
      ? words(kit, key, [[asText(cells), 'value']])
      : dayCells(kit, { key, alt, values: cells.map(c => c.pct ?? ('guessPct' in c ? c.guessPct : undefined)), today: cells.findIndex(isNow), color, cellPx: 44, height: 40, labels: cells.map(c => ('date' in c ? `${c.initial} ${c.date}` : c.label)) })
  const rows: RenderChildren[] = [
    read.sevenDay ? <Box key="w" flexDirection="row" columnGap={3}>{big('days', wk.days, p.weekAccent, wk.daysAlt)}{words(kit, 's7', [[wk.summary7 ?? read.sevenDay.text, 'label']])}</Box> : null,
    read.fiveHour ? <Box key="h" flexDirection="row" columnGap={3}>{big('hours', wk.hours, p.fiveAccent, wk.hoursAlt)}{words(kit, 's5', [[wk.summary5 ?? read.fiveHour.text, 'label']])}</Box> : null,
    words(kit, 'facts', [[[read.cache.text, read.spend.totalText + ' this session', read.context.known ? read.context.text : undefined].filter(Boolean).join(' · '), 'label']]),
  ]
  return rows.filter(r => r !== null).slice(0, Math.max(0, bodyRows))
}

export const weekView: View = {
  name: 'week',
  rows: { desktop: 2, terminal: 2 },
  draw: (kit, read, act) => openView(kit, read, act, collapsed(kit, read, act), 2, body(kit, read)),
}
```

**Ruling: initials in the terminal.** The initials line pads with three spaces for `7d ` and puts spaces where the cells' brackets fall, so a letter sits under its cell. If the matrix's width check fails because the initials line is wider than the cells line, drop the initials at the `'calmSevenCells'` step too.

- [ ] **Step 4: Run the tests until they pass.**
- [ ] **Step 5: Commit**

```bash
git add plugins/session-usage-band/hooks/views/week.tsx plugins/session-usage-band/hooks/reading.ts plugins/session-usage-band/tests/view-week.test.ts
git commit -m "feat: the week layout, the limits as days and hours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## P4: Production

### Task 27: The perf and soak tests

**Files:** `tests/perf.test.ts`, `tests/soak.test.ts`

- [ ] **Step 1: Write the tests**

```ts
// tests/perf.test.ts
import { test, expect } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { setup, START, mountBand, respond, resp, LONG, walk } from './helpers'

const time = async (ui: { redraw: () => Promise<void>; drawn: () => Promise<unknown> }) => {
  for (let i = 0; i < 20; i++) await ui.redraw()
  const t: number[] = []
  for (let i = 0; i < 200; i++) { const a = performance.now(); await ui.redraw(); await ui.drawn(); t.push(performance.now() - a) }
  return t.sort((x, y) => x - y)[100] ?? 0
}
const nodes = (tree: unknown) => { let n = 0; walk(tree, () => { n++ }); return n }

for (const surface of ['terminal', 'desktop'] as const) for (const open of [false, true]) {
  test(`every layout draws within 2× chips and its node budget: ${surface} ${open ? 'open' : 'shut'}`, LONG, async ($, on) => {
    const median: Record<string, number> = {}
    for (const layout of LAYOUT_NAMES) {
      setup(on, { store: { layout } }); await $.session.start(START)
      await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
      const ui = await mountBand($, surface, 200)
      if (open) await ui.press({ key: 'more' })
      median[layout] = await time(ui)
      expect(nodes(await ui.drawn())).toBeLessThanOrEqual(open ? 1500 : 400)
      await ui.unmount()
    }
    console.log(`PERF ${surface} ${open ? 'open' : 'shut'} ${JSON.stringify(median)}`)
    for (const layout of LAYOUT_NAMES) expect(median[layout]! <= 2 * median.chips! + 0.05).toBe(true)
  })
}
```

**If P0 found `performance.now` frozen,** drop the 2× assertion and keep the node budget and the log.

```ts
// tests/soak.test.ts — six hours in coarse ticks: nothing grows past its cap.
import { test, expect } from 'claude-code/testing'
import { LAYOUT_NAMES } from '../hooks/snapshot'
import { openTurns, COST_TRAIL, CONTEXT_TRAIL, FIVE_HOUR_TRAIL } from '../hooks/insights'
import { MAX_SAMPLES } from '../hooks/memory'
import { readHistoryForTest } from '../hooks/register'
import { setup, START, turn, engine, CLEAR, MIN, LONG } from './helpers'

test('six hours, a thousand turns, three clears: every structure stays bounded', { timeoutMs: 120_000 }, async ($, on) => {
  const clock = setup(on); await $.session.start(START)
  const run = (args: string) => $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })
  let cost = 1
  for (let i = 0; i < 1000; i++) {
    await turn($, `t${i}`, cost, (cost += 0.01))
    await clock.advance(21_600)  // 1,000 × 21.6 s = 6 h
    if (i % 333 === 332) await $.session.end(CLEAR)
    if (i % 167 === 0) await run(`layout ${LAYOUT_NAMES[(i / 167) % LAYOUT_NAMES.length]}`)
  }
  const h = readHistoryForTest()
  expect(h.costs.length).toBeLessThanOrEqual(COST_TRAIL)
  expect(h.context.length).toBeLessThanOrEqual(CONTEXT_TRAIL)
  expect(h.fiveHour.length).toBeLessThanOrEqual(FIVE_HOUR_TRAIL)
  expect(openTurns()).toBe(0)
  expect(((engine.store.limitSamples as unknown[] | undefined) ?? []).length).toBeLessThanOrEqual(MAX_SAMPLES)
  expect(JSON.stringify(engine.store).length).toBeLessThan(100_000)
})
```

- [ ] **Step 2: Run them.** Expected: PASS. A failure is a real bug: fix it test-first.
- [ ] **Step 3: Commit**

```bash
git add plugins/session-usage-band/tests/perf.test.ts plugins/session-usage-band/tests/soak.test.ts
git commit -m "test: draw time, node budgets and a six-hour soak, for every layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 28: The performance pass

- [ ] **Step 1:** Run the perf test and copy the PERF lines into `design/perf-baseline.md`, under "After the layouts", beside the P0 baseline.
- [ ] **Step 2:** For any layout over its budget, profile which builder dominates by timing its `draw` in a scratch test, then fix it test-first. The perf test is the RED test. The fixes to try, in order:
  1. Build readings and Svg strings once, outside the give-way loop.
  2. Binary-search the squeeze (the fit is monotone).
  3. Only then, a bounded memo.
- [ ] **Step 3: The invalidate gating candidate.** Count `ui.invalidate` events during a 50-step turn by registering `on('ui.invalidate', …)` in a test.
  - **If** steps that change nothing still repaint, gate the `turn.step` / `session.measure` / git invalidates in `register.tsx` by a paint key. The key covers `isWorking`, cache mood, the countdown text, limits, context, cost, workspace, layout and expanded.
  - **First,** write a test that changing each input repaints. Golden stays green.
  - **If** the count shows no waste, record that and change nothing.
- [ ] **Step 4:** Commit the fixes and the numbers, as `perf: …` with the before and after numbers in the body.

### Task 29: Independent whole-branch review

- [ ] **Step 1:** Run `superpowers:requesting-code-review` on `git diff main...feat/layouts`, dispatching a fresh reviewer on the most capable model. Pass the spec, this plan, and every `Ruling:` line from the ledger.
- [ ] **Step 2:** Re-grade the findings by their effect on a user. Fix every Critical and Important one test-first, recording each as `Final: fixed <finding> — <test> RED→GREEN, suite N/N`. Defer the Minor ones to the ledger.

### Task 30: The final quality pass

- [ ] **Step 1:** Over the whole diff, remove what doesn't belong:
  - dead code, unused exports and debug output;
  - TODOs and commented-out code;
  - any `as never` casts outside tests;
  - names off spec §4.3.

  Check every comment against CONTRIBUTING's house style: short, saying why, in the band's voice.
- [ ] **Step 2:** Spell-check the user-visible text: copy in `reading.ts`, view labels, replies, the README and the CHANGELOG. Grep the views for `≈`, `0:` followed by digits, and `!!` outside chips. Expected: none.
- [ ] **Step 3:** Run the full gates. Commit as `chore: tidy the layouts branch`.

### Task 31: Docs, version, changelog

- [ ] **Step 1:** In the plugin README, add a "Layouts" section:
  - one line per layout, with its row counts (desktop / terminal);
  - `/usage-band layout <name>` and the default;
  - `CC_BAND_GLYPHS` (`ascii` for CJK terminals, screen readers, or the ambiguous-width option);
  - how the time zone is read.

  Add the `layout <name>` row to the Commands table.
- [ ] **Step 2:** In the root README, add one line under "What it shows", linking the Layouts section. Add the layouts gallery image from Task 32.
- [ ] **Step 3:** In CONTRIBUTING.md's file table, add `views/` (with index, frame, parts, one per layout), `charts.tsx`, `glyphs.ts`, `calendar.ts`, `tests/matrix.ts` and the golden capture. Add a rule: "A new layout is one file in `views/`, one test file running `viewSuite`, and an entry in `VIEWS`."
- [ ] **Step 4:** In the CHANGELOG, add `## [0.12.0] - <date>` with sections:
  - **Added:** the nine layouts, the command, the glyph tiers.
  - **Fixed:** the subagent turn-start leak.
  - **Changed:** chips in CJK locales draws ASCII.

  Fold in the `[Unreleased]` entries.
- [ ] **Step 5:** Bump `plugin.json` to `0.12.0`. Set the spec's status line to "Implemented in 0.12.0".
- [ ] **Step 6:** Run the gates, then commit as `docs: the layouts in the READMEs, CONTRIBUTING and the changelog; 0.12.0`.

### Task 32: Demos

- [ ] **Step 1:** In `tools/demos/capture/desktop.test.ts`, add one `STATE layout-<name>` and one `STATE layout-<name>Open` capture per layout (calm), plus `-amber` (the `lastMinute` scenario) for each.
- [ ] **Step 2:** `tools/demos/stills.py` gains a `layouts-{light,dark}.html` gallery, one row per layout, with output in `docs/band-layouts-{light,dark}.png`. `build.sh` shoots and crops it.
- [ ] **Step 3:** Run `tools/demos/build.sh`. Check the golden-unchanged chips images are byte-identical in `git diff --stat docs/`; only the new images and `index.html` should differ.
- [ ] **Step 4:** Commit as `docs: a gallery of the nine layouts`.

### Task 33: Release preparation (the maintainer's go-ahead gates every outward step)

- [ ] **Step 1:** Run the production gate (spec §10) item by item. Paste the evidence (counts, PERF lines, tsc output) into `design/release-0.12.0.md`.
- [ ] **Step 2:** Draft the PR body and an update for issue #1 in `design/release-0.12.0.md`: what shipped, the screenshots to attach, and the numbers.
- [ ] **Step 3:** Ask the maintainer to check each layout by hand, on the desktop and in a terminal, collapsed and expanded, after `claude plugin marketplace update hossein-mods && claude plugin update session-usage-band@hossein-mods` and `/reload-plugins`.
- [ ] **Step 4:** Only on the maintainer's go-ahead:
  1. push `feat/layouts`;
  2. open the PR;
  3. after merge, run `claude plugin tag plugins/session-usage-band --push` and publish the release;
  4. update issue #1 from the draft.

---

## Self-review

**Spec coverage.**

| Spec section | Task |
| --- | --- |
| §1 layouts | T16–T21, T25, T26 |
| §2 contract | `expectInvariants` (T11), run by every view's `viewSuite` |
| §2.2 amber words | T4, T13 |
| §2.12 time words | T4, T13 |
| §3.1 primitives | T7 |
| §3.2 tiers | T8 |
| §4.1 layers | T5, T9, T10 |
| §4.2 command | T10 |
| §4.3 names | everywhere; checked in T30 |
| §5 data | T5, T13, T23, T24 |
| §6 each layout | T16–T21, T25, T26 |
| §7 testing | T1, T2, T11, the view tasks, T23, T24 |
| §8 phases | P0–P4 as written |
| §9 performance | T2, T27, T28 |
| §10 gate | T33 |

**Placeholder scan.** Every view (T16–T21, T25, T26) carries full code. The places that depend on what P1 actually produced (`hitFrac`, the per-surface rows rule, the ring's segment and nesting support, the initials alignment) are written as explicit rulings, each with its fallback.

**Type consistency.** These names are used the same way in every task:
- `Readings` fields (T5 plus T13);
- `View`, `VIEWS`;
- `fitLine`, `line`, `words`, `panel`, `openView`, `toggleButton`;
- `meter` (and its options), `ring`, `sparkline`, `barChart`, `dayCells`, `underline`, `braille`;
- `addSample`, `weekOf`, `readHistoryForTest`.

**Review focus.** Each of the five items is pinned by a named test in T8 or T10. The views' shared risks are covered by `viewSuite`:
- amber at narrow widths;
- plain mode;
- the ascii tier;
- every cache mood;
- `maxRows` 4.
