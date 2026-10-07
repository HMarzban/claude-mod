# Usage band redesign implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the session usage band into one calm, self-explanatory row.
It gets SVG meters on desktop, hover explanations, last turn's cost and a
5h limit ETA. Along the way it fixes `/clear` leaving stale cache state.

**Architecture:**
- `hooks/register.tsx` stays the only file that touches `$` and declares
  state atoms. The validator enforces both.
- Pure logic moves into `cache.ts`, `insights.ts`, `format.ts` and
  `palette.ts`.
- Drawing moves into `band.tsx`, a pure
  `drawBand(elements, snapshot, actions)` that never sees `$`.
- Work goes in four stages:
  1. a throwaway probe settles the rendering unknowns
  2. a pure move of the logic, with all tests green
  3. behaviour changes, each test-first
  4. release

**Tech stack:**
- Claude Code function-hook plugin, TSX against the global `h`
- `claude plugin validate`
- `claude plugin test` (the `claude-code/testing` kit)
- `tsc` 5.x in strict mode

**Spec:** `docs/superpowers/specs/2026-10-07-usage-band-redesign-design.md`.
Read it alongside this plan; the plan argues from it.

## Global constraints

- Only `hooks/register.tsx` may reference `$` or call `atom` / `read` /
  `update`. Other modules import nothing at runtime from `'claude-code'`,
  only types.
- `band.tsx` exports `drawBand(el: ElementTable, s: BandSnapshot, act: BandActions): RenderElement`.
  It must not take `$`.
- One accent colour: amber (`palette.amberFg` / `palette.amberBg`; `warning`
  in `plain`). Never red: no `error` colour anywhere. The only other colour
  is the cache dot (`dotWarm` / `dotCold`).
- Escalation thresholds are 80% (`!`) and 95% (`!!`), for pills and toasts
  alike. Toasts re-arm below 75%.
- Width rules by `bodyColumns`:
  - the 5h pill shows at ≥ 100, or whenever escalated
  - the context meter shows at ≥ 84
  - `last $x` shows at ≥ 68
  - wording is short below 68
  - cache, total cost and `⋯` always show
- ETA rules:
  - 30-minute sample window
  - shown only if the samples span ≥ 10 min, rise ≥ 2 points, and the
    newest is ≤ 15 min old
  - hidden at ≥ 100%, or when the fill time is at or after `resetsAt`
  - rounded to 5 min under 1h, to 15 min from 1h
- Hover cards are one line, under 60 characters, `wrap: "truncate-end"`.
  They're left-anchored except on the rightmost visible pill (`right: 0`).
  There are none in `plain`.
- Copy is in sentence case, with no first person. The figures `~$` and `!`
  / `!!` keep their meaning.
- Gates for every task: `claude plugin validate`, `claude plugin test` and
  the strict `tsc` check (Task 0) all pass.

## Review focus

The failure modes most likely to bite, each pinned by a test in the task
that owns the code:

1. **API-key or gateway users have no `rateLimits`.** The band draws
   without the 5h pill, the ETA or limit facts, and doesn't crash. (Task 5:
   "no rate limits…")
2. **5h at or above 100%.** The meter is full, it reads `100%!!`, and there
   is no "full in" ETA. (Task 4: "no ETA once the window is full")
3. **`resetsAt` jitter of a few seconds between readings** must not wipe
   the samples, while a real reset must. (Task 4: "jitter in resetsAt…")
4. **`/clear` with a TTL pinned by an environment variable.** The pin
   survives the reset. (Task 3: "/clear keeps a TTL…")
5. **A very narrow band** (30 columns): no crash, still one row, cache and
   cost present. (Task 5: "a very narrow band…")

## Paths used below

```bash
REPO=/Users/macbook/workspace/claude-mod
MOD=$REPO/plugins/session-usage-band
SCRATCH=/private/tmp/claude-501/-Users-macbook-workspace-claude-mod/7c0626a1-38c5-4603-afd1-0ba78f4adf2e/scratchpad
TYPES=/private/tmp/claude-501/bundled-skills/2.1.289/dfa02334dfcf27a002ed7bfa9a63f52c/plugin-authoring/types/claude-code.d.ts
PROBE=/Users/macbook/.claude/dev-mods/7c0626a1-38c5-4603-afd1-0ba78f4adf2e/usage-band-probe
```

If `$TYPES` no longer exists, as happens after a restart, load the
`plugin-authoring` skill again. Its text names the new path.

## File map

| File | Status | Responsibility |
| --- | --- | --- |
| `$MOD/hooks/register.tsx` | modify | Atoms; every hook; builds the snapshot and actions; the only `$` user |
| `$MOD/hooks/cache.ts` | create | Cache model: counters, TTL, cold-start detection, re-warm price, conversation reset |
| `$MOD/hooks/insights.ts` | create | Last turn's cost; 5h samples and ETA |
| `$MOD/hooks/format.ts` | create | Number and time formatting |
| `$MOD/hooks/palette.ts` | create | Palettes and appearance resolution |
| `$MOD/hooks/band.tsx` | create | Pure drawing of the band |
| `$MOD/tests/helpers.ts` | create | Shared test base, fixtures and tree helpers |
| `$MOD/tests/band.test.ts` | rewrite | Band behaviour through the mounted UI |
| `$MOD/tests/lifecycle.test.ts` | create | `/clear` reset and cost baseline |
| `$MOD/tests/insights.test.ts` | create | Unit tests of `insights.ts` and `fmtEta` |
| `$MOD/.claude-plugin/plugin.json` | modify | Version 0.2.0 |
| `$REPO/README.md` | rewrite | User-facing docs |
| `$PROBE/**` | create, then delete | Throwaway probe |

---

### Task 0: Repository and type-check baseline

**Files:**
- Create: `$REPO/.gitignore`
- Create: `$SCRATCH/tc/tsconfig.json` (outside the repo)

**Interfaces:**
- Produces: the `tsc` gate command every later task runs.

- [ ] **Step 1: Initialise git and commit the 0.1.1 baseline** (approved by the user at handoff)

```bash
cd $REPO && git init -q && printf '.DS_Store\nnode_modules/\n.claude-plugin/types/\n' > .gitignore && git add -A && git commit -qm "chore: baseline session-usage-band 0.1.1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline
```

Expected: one commit.

- [ ] **Step 2: Write the strict tsconfig**

```bash
mkdir -p $SCRATCH/tc && cat > $SCRATCH/tc/tsconfig.json <<EOF
{ "compilerOptions": { "target": "es2023", "lib": ["es2023"], "types": [], "module": "esnext", "moduleResolution": "bundler", "strict": true, "noUncheckedIndexedAccess": true, "noEmit": true, "skipLibCheck": true, "jsx": "react", "jsxFactory": "h", "jsxFragmentFactory": "Fragment" },
  "include": ["$TYPES", "$MOD/hooks", "$MOD/types", "$MOD/tests"] }
EOF
```

- [ ] **Step 3: Run all three gates on the baseline**

```bash
claude plugin validate $MOD && claude plugin test $MOD 2>&1 | tail -3 && npx -y -p typescript@5 tsc -p $SCRATCH/tc && echo TSC-OK
```

Expected: `✔ Validation passed`, `20 pass`, `0 fail`, `TSC-OK`.

From here on, "run the gates" means this exact command.

---

### Task 1: Probe the desktop rendering unknowns (throwaway)

**Files:**
- Create: `$PROBE/.claude-plugin/plugin.json`
- Create: `$PROBE/hooks/hooks.json`
- Create: `$PROBE/hooks/register.tsx`
- Modify: the spec's §6, to record the results

**Interfaces:** none. This code is deleted at the end of the task.

- [ ] **Step 1: Write the probe manifest and hooks list**

```bash
mkdir -p $PROBE/.claude-plugin $PROBE/hooks
echo '{ "name": "usage-band-probe", "version": "0.0.1", "description": "Throwaway probe for the usage band redesign" }' > $PROBE/.claude-plugin/plugin.json
echo '{ "modules": ["./register.tsx"] }' > $PROBE/hooks/hooks.json
```

- [ ] **Step 2: Write the probe module**

`$PROBE/hooks/register.tsx`:

```tsx
import type { Register } from 'claude-code'

export const register: Register = on => {
  let lastTurnUsd: number | null = null
  const startCost = new Map<string, number>()

  on('session.start', async ($, e, next) => {
    $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    startCost.set(e.turnId, (await $.session.usage()).cost?.usd ?? 0)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const start = startCost.get(e.turnId)
    if (e.agentId === undefined && start !== undefined) {
      lastTurnUsd = ((await $.session.usage()).cost?.usd ?? 0) - start
    }
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const el = $.ui.resolve(e)
    const { Box, Text } = el
    const cost = (await $.session.usage()).cost?.usd ?? 0
    const svg =
      'Svg' in el ? (
        <el.Svg
          key="meter"
          alt="40%"
          width={44}
          height={6}
          source='<svg xmlns="http://www.w3.org/2000/svg" width="44" height="6" viewBox="0 0 44 6"><rect width="44" height="6" rx="3" fill="#45454f"/><rect width="18" height="6" rx="3" fill="#b8b8c2"/></svg>'
        />
      ) : (
        <Text key="meter">no Svg on {e.surface}</Text>
      )
    const card = (key: string, text: string, anchor: 'left' | 'right') => (
      <Box
        key={`${key}-card`}
        position="absolute"
        top={0}
        {...(anchor === 'left' ? { left: 0 } : { right: 0 })}
        width={text.length + 2}
        display="none"
        hover={{ display: 'flex' }}
        backgroundColor="#1f1f25"
        paddingX={1}
      >
        <Text color="#ececf2" wrap="truncate-end">
          {text}
        </Text>
      </Box>
    )
    const pill = (key: string, label: string, text: string, anchor: 'left' | 'right') => (
      <Box key={key} backgroundColor="#2b2b33" paddingX={1}>
        <Text color="#ececf2">{label}</Text>
        {card(key, text, anchor)}
      </Box>
    )
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
          {pill('a', 'probe A', 'Card A: hover me, then slide right to B', 'left')}
          {svg}
          {pill('b', 'probe B', 'Card B: left-anchored, covers pills to its right', 'left')}
          {pill('c', 'probe C', 'Card C: right-anchored, opens leftward', 'right')}
        </Box>
        <Text color="#8a8a94">
          {`bodyColumns ${e.props.bodyColumns} · viewport ${e.viewport?.columns ?? '?'} · cost $${cost.toFixed(4)} · last turn ${lastTurnUsd === null ? '—' : `$${lastTurnUsd.toFixed(4)}`}`}
        </Text>
      </Box>
    )
  })
}
```

- [ ] **Step 3: Validate the probe**

Run: `claude plugin validate $PROBE`
Expected: `✔ Validation passed` (an author warning is fine).

- [ ] **Step 4: Ask the user to enable hot reloading**

The first write to the dev-mods folder makes the engine ask "Enable hot
reloading for this session?". The user chooses **Enable for this
session**, and the probe loads when the turn ends. Its band appears beside
the real one.

- [ ] **Step 5: The user checks each criterion and reports back**

1. **Svg:** the meter between A and B sits centred in the row, 44×6, and
   doesn't change the row's height.
2. **Hover:**
   - hovering A shows card A with no flicker
   - card A stays open while the pointer is on it
   - leaving card A and pointing at B shows card B
   - card C opens leftward and isn't clipped
3. **Width:** narrow the Code tab in steps. `bodyColumns` changes with the
   width; note the value at the narrowest and widest.
4. **Cost:** run `/cost`, send one short message, run `/cost` again. The
   difference matches `last turn`.

- [ ] **Step 6: Record the results in the spec and apply fallbacks**

Append to the spec's §6 a `### Probe results (2026-10-07)` list with one
line per criterion: pass or fail, plus the `bodyColumns` range observed.

For each failure, edit the plan before continuing:
- **1 fails:** delete Task 6. Desktop keeps the text meters.
- **2 fails:** delete Task 7. No hover cards.
- **3 looks wrong:** in Task 5, replace `s.columns` with the viewport
  columns in `register.tsx`. Set
  `columns: e.viewport?.columns ?? e.props.bodyColumns`.
- **4 fails:** in Task 5, hide `last $x` (drop the `costBody.push` line)
  and note it in the README's limitations.

- [ ] **Step 7: Delete the probe**

```bash
rm -r $PROBE && ls $(dirname $PROBE)
```

Expected: the probe folder is gone.

- [ ] **Step 8: Commit the recorded results**

```bash
cd $REPO && git add docs && git commit -qm "docs: record usage band probe results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move pure logic out of `register.tsx` (no behaviour change)

**Files:**
- Create: `$MOD/hooks/cache.ts`, `$MOD/hooks/format.ts`, `$MOD/hooks/palette.ts`
- Modify: `$MOD/hooks/register.tsx`, deleting lines 7–255 and adding imports

**Interfaces:**
- Produces, in `cache.ts`:
  - `type Ttl = '5m' | '1h'`
  - `TTL_MS: Record<Ttl, number>`
  - `SOON_MS: number`
  - `cache` (mutable object)
  - `resetCache(): void`
  - `recordResponse(usage, now: number, isMain: boolean): void`
  - `reWarmUsd(sessionCost: number | undefined): number | null`
  - `hitRatio(): number | null`
  - `msLeft(now: number): number`
- Produces, in `format.ts`:
  - `clamp01`, `fmtTokens`, `fmtCost`, `fmtElapsed`, `fmtCountdown`,
    `fmtResetsIn`, `fmtEstimate`
  - `WINDOW_LABEL`, `severity`, `severityMark`
- Produces, in `palette.ts`:
  - `type Palette`, `DARK`, `LIGHT`, `PLAIN`
  - `resolvePalette(appearance: string | undefined, noColor: string | undefined): Palette`

The existing 20 tests are the safety net. This task adds no tests.

- [ ] **Step 1: Create `cache.ts`** from `register.tsx` lines 73–192, verbatim, with these changes:
  - add `export` to: `Ttl`, `TTL_MS`, `SOON_MS`, `cache`, `resetCache`,
    `recordResponse`, `reWarmUsd`, `hitRatio`, `msLeft`
  - leave out line 184 (`fmtEstimate`), which goes to `format.ts`
  - keep `MISS_MIN_TOKENS`, `MISS_MIN_SHARE`, `WRITE_MULT`, `READ_MULT`
    and `OUTPUT_MULT` unexported

```bash
cd $MOD/hooks && { sed -n '73,183p' register.tsx; sed -n '185,192p' register.tsx; } > cache.ts \
 && sed -i '' -E 's/^type Ttl /export type Ttl /; s/^const (TTL_MS|SOON_MS|cache|resetCache|recordResponse|reWarmUsd|hitRatio|msLeft)([ :])/export const \1\2/' cache.ts \
 && grep -n '^export' cache.ts
```

Expected: 9 `export` lines (`Ttl`, `TTL_MS`, `SOON_MS`, `cache`, `resetCache`, `recordResponse`, `reWarmUsd`, `hitRatio`, `msLeft`).

- [ ] **Step 2: Create `format.ts`** from line 184 plus lines 194–255, exporting every `const`.

```bash
cd $MOD/hooks && { sed -n '184p' register.tsx; echo; sed -n '194,255p' register.tsx; } > format.ts \
 && sed -i '' -E 's/^const /export const /' format.ts && grep -c '^export const' format.ts
```

Expected: `10`.

- [ ] **Step 3: Create `palette.ts`** from lines 7–69, then add `resolvePalette`.

```bash
cd $MOD/hooks && sed -n '7,69p' register.tsx > palette.ts \
 && sed -i '' -E 's/^type Palette /export type Palette /; s/^const (DARK|LIGHT|PLAIN):/export const \1:/' palette.ts \
 && cat >> palette.ts <<'EOF'

/** The palette CC_BAND_APPEARANCE names; NO_COLOR forces plain. */
export const resolvePalette = (appearance: string | undefined, noColor: string | undefined): Palette =>
  noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK
EOF
```

- [ ] **Step 4: Cut lines 7–255 from `register.tsx` and import the moved names**

```bash
cd $MOD/hooks && sed -i '' '7,255d' register.tsx && python3 - <<'EOF'
p='register.tsx'
s=open(p).read()
s=s.replace("""import type { Register, RenderChildren } from 'claude-code'
""","""import type { Register, RenderChildren } from 'claude-code'
import { SOON_MS, cache, hitRatio, msLeft, recordResponse, resetCache, reWarmUsd } from './cache'
import {
  WINDOW_LABEL,
  clamp01,
  fmtCost,
  fmtCountdown,
  fmtElapsed,
  fmtEstimate,
  fmtResetsIn,
  fmtTokens,
  severity,
  severityMark,
} from './format'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'
""",1)
s=s.replace("""const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)
""","""const isExpanded = atom({ plugin: 'session-usage-band', key: 'isExpanded' } as const, false)

let palette: Palette = DARK
""",1)
s=s.replace("""    palette = noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK""","""    palette = resolvePalette(appearance, noColor)""",1)
open(p,'w').write(s)
EOF
grep -n "^import\|^let palette\|resolvePalette" register.tsx
```

Expected: four import lines from `./cache`, `./format` and `./palette` (two
from palette), `let palette`, and one `resolvePalette(` call.

- [ ] **Step 5: Run the gates**

Expected: validation passes and lists the same `state reads` / `state writes` as the baseline; `20 pass`; `TSC-OK`.

If `tsc` reports an unused import, delete only that import. Don't change
any code.

- [ ] **Step 6: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "refactor: move cache, format and palette out of register.tsx

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reset the conversation on `/clear`, with a cost baseline

**Files:**
- Modify: `$MOD/hooks/cache.ts` (the `cache` object, `resetCache`, `reWarmUsd`; add `resetConversation`)
- Modify: `$MOD/hooks/register.tsx` (keep the timer handle; add a `session.end` hook)
- Create: `$MOD/tests/helpers.ts`, `$MOD/tests/lifecycle.test.ts`

**Interfaces:**
- Consumes: `cache`, `resetCache` and `reWarmUsd` from Task 2.
- Produces:
  - `resetConversation(costNow: number): void`, which keeps `ttl` and
    `ttlPinned`, clears everything else, and sets `cache.costBase = costNow`
  - `cache.costBase: number`
  - the test helpers in `tests/helpers.ts`, which Task 5 relies on

- [ ] **Step 1: Write the shared test helpers**

`$MOD/tests/helpers.ts`:

```ts
import type {
  HookStream,
  ModelUsage,
  On,
  SessionUsage,
  TurnStepChunk,
  TurnStepInput,
  TurnStepResult,
} from 'claude-code'

export const PLUGIN = 'session-usage-band'

export const props = (cols: number, isWorking = false) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 14,
  bodyColumns: cols,
  scroll: { offset: 0, bodyRows: 14 },
  view: {},
})

export const USAGE: SessionUsage = {
  startedAt: 0,
  context: { tokens: 76_000, window: 200_000, percent: 38 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 4, resetsAt: new Date(3 * 3600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 30, resetsAt: new Date(67 * 3600_000).toISOString() },
  ],
  cost: { usd: 2.41 },
}

export const FRESH: SessionUsage = {
  startedAt: 0,
  context: { window: 200_000 },
  rateLimits: [],
  cost: { usd: 0 },
}

/** What the engine reports right now; a test swaps `current` to move cost or limits. */
export const usage: { current: SessionUsage } = { current: USAGE }

/** Every toast the plugin raised since `base` ran. */
export const toasts: string[] = []

let nextUsage: ModelUsage | null = null

/** Everything beneath the plugin: the engine's own answers. */
export const base = (on: On, initial: SessionUsage = USAGE): void => {
  usage.current = initial
  toasts.length = 0
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.usage', () => ({ value: usage.current }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
  })
  on('ui.render', () => ({ type: 'Box' as const, children: [] }))
  on('turn.step', async function* ($, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: nextUsage === null ? null : { ...nextUsage, model: e.model },
    }
  })
}

export const resp = (input: number, read: number, write: number, output: number): ModelUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

export type Step = (e: TurnStepInput) => HookStream<TurnStepChunk, TurnStepResult>

export const respond = async (step: Step, u: ModelUsage): Promise<void> => {
  nextUsage = u
  const stream = step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  for await (const _chunk of stream) {
    // drain so the hook's result settles
  }
  await stream.result
}

export const inAgent =
  (step: Step): Step =>
  e =>
    step({ ...e, agentId: 'agent-1' })

export type Node = {
  type?: string
  props?: Record<string, unknown>
  hover?: Record<string, unknown>
  children?: unknown[]
}

/** All text beneath a node, hidden cards included. */
export const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number'
    ? String(n)
    : n !== null && typeof n === 'object'
      ? ((n as Node).children ?? []).map(textOf).join('')
      : ''

export const walk = (n: unknown, visit: (node: Node) => void): void => {
  if (n === null || typeof n !== 'object') return
  visit(n as Node)
  for (const k of (n as Node).children ?? []) walk(k, visit)
}

/** Rows of the band: the root Box's children. */
export const rowCount = (tree: unknown): number => {
  const t = tree as Node
  return t.type === 'Box' ? (t.children ?? []).length : 0
}
```

- [ ] **Step 2: Write the failing lifecycle tests**

`$MOD/tests/lifecycle.test.ts`:

```ts
import { test, expect, mock } from 'claude-code/testing'
import { PLUGIN, USAGE, base, props, resp, respond, usage } from './helpers'

const clear = { reason: 'clear', sessionId: 's1', resume: { id: 's1' } } as const

test('/clear starts the band on a fresh conversation', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  await $.session.end(clear)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  await ui.unmount()
})

test('spend before a /clear does not inflate the re-warm estimate', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on) // ledger at $2.41 when /clear runs
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(clear)

  // The ledger keeps counting: $0.59 is this conversation's.
  usage.current = { ...USAGE, cost: { usd: 3.0 } }
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  // rate = 0.59 / (10k + 1.25*100k + 5*2k) ; re-warm = 1.25 * 112k * rate = 0.57
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.57/ })).toBeDefined()
  await ui.unmount()
})

test('a ledger the engine reset on /clear is used as it stands', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { ENABLE_PROMPT_CACHING_1H: '1' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  await $.session.end(clear)

  usage.current = { ...USAGE, cost: { usd: 0.59 } } // below the $2.41 baseline: reset
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$0\.57/ })).toBeDefined()
  await ui.unmount()
})

test('/clear keeps a TTL the environment pinned', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.session.end(clear)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(6 * 60_000) // past 5m, well inside the 1h default

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cold/ })).toBeDefined()
  await ui.unmount()
})
```

- [ ] **Step 3: Run the tests and watch them fail**

Run: `claude plugin test $MOD 2>&1 | grep -E "^\(fail\)| pass$| fail$"`

Expected: these three FAIL:
- "/clear starts the band…"
- "spend before a /clear…" (the estimate still mixes in the first response)
- "a ledger the engine reset…"

"/clear keeps a TTL…" passes already, because nothing resets yet. It
guards Step 4.

- [ ] **Step 4: Add `costBase`, `resetConversation` and the baseline-aware rate to `cache.ts`**

In the `cache` object, add after `rebuilding: false,`:

```ts
  // Session cost when this conversation began, so a /clear's earlier spend
  // can't inflate the rate the re-warm price is solved from.
  costBase: 0,
```

In `resetCache`, add after `cache.rebuilding = false`:

```ts
  cache.costBase = 0
```

After `resetCache`, add:

```ts
/** A new conversation in the same process (/clear, resume): the billing
 *  mode and its TTL carry over, everything measured starts again. */
export const resetConversation = (costNow: number): void => {
  const { ttl, ttlPinned } = cache
  resetCache()
  cache.ttl = ttl
  cache.ttlPinned = ttlPinned
  cache.costBase = costNow
}
```

In `reWarmUsd`, replace

```ts
  const rate = sessionCost / weighted
```

with

```ts
  // A ledger below the baseline was reset by the engine, so it already
  // counts this conversation alone.
  const billed = sessionCost >= cache.costBase ? sessionCost - cache.costBase : sessionCost
  if (billed <= 0) return null
  const rate = billed / weighted
```

- [ ] **Step 5: Reset on `session.end` and keep the timer handle in `register.tsx`**

Change the type import to:

```ts
import type { Register, RenderChildren, Timer } from 'claude-code'
```

Change the `./cache` import to include `resetConversation`:

```ts
import { SOON_MS, cache, hitRatio, msLeft, recordResponse, resetCache, resetConversation, reWarmUsd } from './cache'
```

Inside `register`, after `const warned = new Set<string>()`, add:

```ts
  let tick: Timer | undefined
```

Replace `    $.clock.every(1000, () => {` with:

```ts
    tick?.cancel()
    tick = $.clock.every(1000, () => {
```

After the `session.start` hook's closing `})`, add:

```ts
  // /clear and resume end the conversation but not the process, and no
  // session.start follows, so the next conversation starts from here.
  on('session.end', async ($, e, next) => {
    resetConversation((await $.session.usage()).cost?.usd ?? 0)
    warned.clear()
    lastPaintKey = ''
    $.ui.invalidate('ui.render')
    return next(e)
  })
```

- [ ] **Step 6: Run the gates**

Expected: `24 pass` (20 + 4) and `TSC-OK`. Validation passes and lists `session.end` among the hooks.

- [ ] **Step 7: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "fix: reset the usage band on /clear with a cost baseline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Last turn's cost and the 5h ETA, as pure logic

**Files:**
- Create: `$MOD/hooks/insights.ts`
- Modify: `$MOD/hooks/format.ts` (add `fmtEta`)
- Create: `$MOD/tests/insights.test.ts`

**Interfaces:**
- Produces, in `insights.ts`:
  - `insights: { lastTurnUsd: number | null }`, read-only to callers
  - `resetInsights(): void`
  - `noteTurnStart(turnId: string, costUsd: number | undefined): void`
  - `noteTurnEnd(turnId: string, costUsd: number | undefined): void`
  - `noteFiveHour(now: number, percentUsed: number, resetsAt: string | undefined): void`
  - `fiveHourEtaMs(now: number): number | null`
- Produces, in `format.ts`: `fmtEta(ms: number): string`, for example `~40m` or `~1h 45m`.

- [ ] **Step 1: Write the failing unit tests**

`$MOD/tests/insights.test.ts`:

```ts
import { test, expect } from 'claude-code/testing'
import { fmtEta } from '../hooks/format'
import {
  fiveHourEtaMs,
  insights,
  noteFiveHour,
  noteTurnEnd,
  noteTurnStart,
  resetInsights,
} from '../hooks/insights'

const MIN = 60_000
const cents = (n: number | null): number | null => (n === null ? null : Math.round(n * 100))
const RESET_IN_3H = new Date(3 * 60 * MIN).toISOString()

test("last turn's cost is the ledger's rise across one turn", () => {
  resetInsights()
  expect(insights.lastTurnUsd).toBe(null)
  noteTurnStart('t1', 2.0)
  noteTurnEnd('t1', 2.41)
  expect(cents(insights.lastTurnUsd)).toBe(41)
})

test('an unmatched turn, a missing ledger or no rise leaves nothing to show', () => {
  resetInsights()
  noteTurnEnd('never-started', 5)
  expect(insights.lastTurnUsd).toBe(null)
  noteTurnStart('t1', undefined)
  noteTurnEnd('t1', 3)
  expect(insights.lastTurnUsd).toBe(null)
  noteTurnStart('t2', 3)
  noteTurnEnd('t2', 3)
  expect(insights.lastTurnUsd).toBe(null)
})

test('the ETA needs ten minutes and two points of evidence', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(8 * MIN, 46, RESET_IN_3H)
  expect(fiveHourEtaMs(8 * MIN)).toBe(null) // under 10 minutes
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 41, RESET_IN_3H)
  expect(fiveHourEtaMs(12 * MIN)).toBe(null) // under 2 points
})

test('the ETA projects the pace from the first to the newest sample', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 46, RESET_IN_3H) // 0.5 points a minute, 54 to go
  expect(fiveHourEtaMs(12 * MIN)).toBe(108 * MIN)
  expect(fmtEta(108 * MIN)).toBe('~1h 45m')
})

test('the ETA hides when the samples go stale', () => {
  resetInsights()
  noteFiveHour(0, 40, RESET_IN_3H)
  noteFiveHour(12 * MIN, 46, RESET_IN_3H)
  expect(fiveHourEtaMs(27 * MIN)).not.toBe(null) // exactly 15 minutes: still fresh
  expect(fiveHourEtaMs(28 * MIN)).toBe(null) // 16 minutes: stale
})

test('the ETA hides when the window resets first', () => {
  resetInsights()
  const soon = new Date(30 * MIN).toISOString()
  noteFiveHour(0, 40, soon)
  noteFiveHour(12 * MIN, 46, soon) // fills at 120m, resets at 30m
  expect(fiveHourEtaMs(12 * MIN)).toBe(null)
})

test('no ETA once the window is full', () => {
  resetInsights()
  noteFiveHour(0, 90, RESET_IN_3H)
  noteFiveHour(12 * MIN, 100, RESET_IN_3H)
  expect(fiveHourEtaMs(12 * MIN)).toBe(null)
})

test('jitter in resetsAt keeps the samples; a real reset clears them', () => {
  resetInsights()
  noteFiveHour(0, 40, new Date(3 * 60 * MIN).toISOString())
  noteFiveHour(12 * MIN, 46, new Date(3 * 60 * MIN + 2_000).toISOString()) // 2s jitter
  expect(fiveHourEtaMs(12 * MIN)).not.toBe(null)
  noteFiveHour(13 * MIN, 2, new Date(8 * 60 * MIN).toISOString()) // new window
  expect(fiveHourEtaMs(13 * MIN)).toBe(null)
})

test('old samples fall out of the 30-minute window', () => {
  resetInsights()
  noteFiveHour(0, 10, RESET_IN_3H)
  noteFiveHour(40 * MIN, 12, RESET_IN_3H)
  noteFiveHour(52 * MIN, 13, RESET_IN_3H) // only 40m and 52m remain: 1 point
  expect(fiveHourEtaMs(52 * MIN)).toBe(null)
})

test('the ETA rounds to 5 minutes under an hour and 15 from an hour', () => {
  expect(fmtEta(2 * MIN)).toBe('~5m')
  expect(fmtEta(38 * MIN)).toBe('~40m')
  expect(fmtEta(58 * MIN)).toBe('~1h')
  expect(fmtEta(67 * MIN)).toBe('~1h')
  expect(fmtEta(68 * MIN)).toBe('~1h 15m')
  expect(fmtEta(130 * MIN)).toBe('~2h 15m')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test $MOD 2>&1 | grep -E "error|^\(fail\)| fail$" | head`
Expected: a load error, because `../hooks/insights` doesn't exist yet.

- [ ] **Step 3: Write `insights.ts`**

`$MOD/hooks/insights.ts`:

```ts
// What the band can tell you that the engine's own figures don't: what your
// last message cost, and when your pace fills the 5-hour limit.

type Sample = { t: number; pct: number }

const WINDOW_MS = 30 * 60_000
const MIN_SPAN_MS = 10 * 60_000
const MIN_RISE = 2
const STALE_MS = 15 * 60_000
// resetsAt readings of one window can differ by a few seconds.
const SAME_RESET_MS = 60_000

const state = {
  turnStartCost: new Map<string, number>(),
  samples: [] as Sample[],
  resetsAt: undefined as string | undefined,
}

export const insights = {
  lastTurnUsd: null as number | null,
}

export const resetInsights = (): void => {
  state.turnStartCost.clear()
  state.samples = []
  state.resetsAt = undefined
  insights.lastTurnUsd = null
}

export const noteTurnStart = (turnId: string, costUsd: number | undefined): void => {
  if (costUsd !== undefined) state.turnStartCost.set(turnId, costUsd)
}

/** Everything the ledger rose by during the turn: its tool calls and
 *  subagents, and any background work that ran meanwhile. */
export const noteTurnEnd = (turnId: string, costUsd: number | undefined): void => {
  const start = state.turnStartCost.get(turnId)
  state.turnStartCost.delete(turnId)
  if (start === undefined || costUsd === undefined) return
  const spent = costUsd - start
  insights.lastTurnUsd = spent > 0 ? spent : null
}

const sameReset = (a: string | undefined, b: string | undefined): boolean => {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  const da = Date.parse(a)
  const db = Date.parse(b)
  return !Number.isNaN(da) && !Number.isNaN(db) && Math.abs(da - db) < SAME_RESET_MS
}

export const noteFiveHour = (now: number, percentUsed: number, resetsAt: string | undefined): void => {
  const last = state.samples[state.samples.length - 1]
  if (!sameReset(resetsAt, state.resetsAt) || (last !== undefined && percentUsed < last.pct)) {
    state.samples = []
  }
  state.resetsAt = resetsAt
  state.samples.push({ t: now, pct: percentUsed })
  state.samples = state.samples.filter(s => now - s.t <= WINDOW_MS)
}

/** Time until your pace fills the 5-hour window, or null while the
 *  evidence is thin, stale, or the window resets first. */
export const fiveHourEtaMs = (now: number): number | null => {
  const first = state.samples[0]
  const last = state.samples[state.samples.length - 1]
  if (first === undefined || last === undefined || last.pct >= 100) return null
  const span = last.t - first.t
  const rise = last.pct - first.pct
  if (span < MIN_SPAN_MS || rise < MIN_RISE || now - last.t > STALE_MS) return null
  const tFull = last.t + ((100 - last.pct) * span) / rise
  if (state.resetsAt !== undefined) {
    const resetAt = Date.parse(state.resetsAt)
    if (!Number.isNaN(resetAt) && tFull >= resetAt) return null
  }
  return Math.max(0, tFull - now)
}
```

- [ ] **Step 4: Add `fmtEta` to `format.ts`**

Append:

```ts
/** A projection, never a countdown: 5-minute steps under an hour, 15 from one. */
export const fmtEta = (ms: number): string => {
  const mins = Math.max(0, ms) / 60_000
  if (mins < 57.5) return `~${Math.max(5, Math.round(mins / 5) * 5)}m`
  const q = Math.round(mins / 15) * 15
  const h = Math.floor(q / 60)
  const m = q % 60
  return m ? `~${h}h ${m}m` : `~${h}h`
}
```

- [ ] **Step 5: Run the gates**

Expected: `34 pass` (24 + 10) and `TSC-OK`.

- [ ] **Step 6: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "feat: last turn cost and 5h pace ETA logic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The calm one-row band (text meters, every surface)

**Files:**
- Rewrite: `$MOD/hooks/palette.ts`
- Create: `$MOD/hooks/band.tsx`
- Modify: `$MOD/hooks/register.tsx` (replace the `ui.render` hook; add `turn.start` and `turn.complete`; extend `session.start`, `session.end` and `session.measure`)
- Modify: `$MOD/hooks/format.ts` (remove `severity`, `fmtElapsed`, `WINDOW_LABEL`; add `fmtSmallCost`)
- Rewrite: `$MOD/tests/band.test.ts`

**Interfaces:**
- Consumes:
  - `cache`, `msLeft`, `hitRatio`, `reWarmUsd`, `resetConversation` and
    `SOON_MS` (Tasks 2 and 3)
  - `insights`, `noteTurnStart`, `noteTurnEnd`, `noteFiveHour`,
    `fiveHourEtaMs` and `resetInsights` (Task 4)
  - `fmtEta` (Task 4)
  - every helper in `tests/helpers.ts` (Task 3)
- Produces:
  - `drawBand(el: ElementTable, s: BandSnapshot, act: BandActions): RenderElement`
  - `type BandSnapshot`, `type BandActions` (both below)
  - a `pill(...)` internal that Task 7 extends
  - a `meter(...)` internal that Task 6 extends
  - `Palette` fields: `filled`, `surface`, `value`, `label`, `dotWarm`,
    `dotCold`, `amberBg`, `amberFg`, `meterTrack`, `meterFill`, `cardBg`

- [ ] **Step 1: Write the new band tests** (they fail against the old drawing)

Replace `$MOD/tests/band.test.ts` with:

```ts
import { test, expect, mock } from 'claude-code/testing'
import { DARK } from '../hooks/palette'
import {
  FRESH,
  PLUGIN,
  USAGE,
  base,
  inAgent,
  props,
  resp,
  respond,
  rowCount,
  textOf,
  toasts,
  usage,
  walk,
} from './helpers'

const START = { cwd: '/tmp', surface: 'terminal', isInteractive: true } as const
const HOUR_1 = { ENABLE_PROMPT_CACHING_1H: '1' }

/** The unexpected-rebuild count in the expanded line, 0 when it's absent. */
const rebuilds = (tree: unknown): number => {
  const m = textOf(tree).match(/(\d+) unexpected rebuild/)
  return m ? Number(m[1]) : 0
}

/** Text meters drawn: six cells of █ and ░. An empty meter's inner track
 *  Text is six cells too, so it's excluded by its track colour. */
const METER = /^[█░]{6}$/
const textMeters = async (ui: { findAll: (q: { type: string; text: RegExp }) => Promise<Array<{ props?: Record<string, unknown> }>> }) =>
  (await ui.findAll({ type: 'Text', text: METER })).filter(t => t.props?.color !== DARK.meterTrack).length

const turn = async (
  $: { turn: { start: (e: never) => Promise<unknown>; complete: (e: never) => Promise<unknown> } },
  id: string,
  from: number,
  to: number,
  extra: Record<string, unknown> = {},
): Promise<void> => {
  usage.current = { ...usage.current, cost: { usd: from } }
  if (!('agentId' in extra)) await $.turn.start({ text: 'hi', turnId: id } as never)
  usage.current = { ...usage.current, cost: { usd: to } }
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: id, reason: 'answer', ...extra } as never)
}

// ── the collapsed row ──────────────────────────────────────────────────

test('the collapsed band is one row', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /4%/ })).toBeDefined()
  await ui.unmount()
})

test('pills carry their own foreground and background, never one of each', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let pills = 0
  walk(await ui.drawn(), n => {
    const bg = n.props?.backgroundColor
    if (typeof bg !== 'string') return
    pills += 1
    expect(bg.startsWith('#')).toBe(true)
    walk(n, t => {
      if (t.type === 'Text' && typeof t.props?.color === 'string') expect(t.props.color.startsWith('#')).toBe(true)
    })
  })
  expect(pills).toBeGreaterThan(2)
  await ui.unmount()
})

test('CC_BAND_APPEARANCE=plain drops every background for theme keys', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  let backgrounds = 0
  walk(await ui.drawn(), n => {
    if (n.props?.backgroundColor !== undefined) backgrounds += 1
  })
  expect(backgrounds).toBe(0)
  expect(await ui.find({ type: 'Text', text: /\[/ })).toBeDefined()
  await ui.unmount()
})

test('before the first response the band says warming rather than a false zero', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, FRESH)
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache warming/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\b0%/ })).toBeUndefined()
  await ui.unmount()
})

test('the calm band uses no amber', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  walk(await ui.drawn(), n => {
    expect(n.props?.color).not.toBe(DARK.amberFg)
    expect(n.props?.backgroundColor).not.toBe(DARK.amberBg)
  })
  await ui.unmount()
})

// ── the cache pill ─────────────────────────────────────────────────────

test('the countdown is still while warm, then names the stakes in its last minute', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache 1h 00m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /re-warm/ })).toBeUndefined()

  await clock.advance(15_000)
  expect(await ui.find({ type: 'Text', text: /cache 59m/ })).toBeDefined()

  await clock.advance(60 * 60_000 - 45_000) // 30s left
  const soon = await ui.find({ type: 'Text', text: /0:30 left · re-warm ~\$/ })
  expect(soon).toBeDefined()
  expect(soon?.props?.color).toBe(DARK.amberFg)

  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold · next message ~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a cold cache is neutral, never amber or red', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, { CLAUDE_CODE_PROMPT_CACHE_TTL: '5m' })
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))
  await clock.advance(10 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cold = await ui.find({ type: 'Text', text: /cache cold/ })
  expect(cold).toBeDefined()
  expect(cold?.props?.color).not.toBe(DARK.amberFg)
  expect(cold?.props?.color).not.toBe('error')
  await ui.unmount()
})

test("while a turn runs, 'cache warm' replaces the calm countdown", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 180_000, 5_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110, true) })
  expect(await ui.find({ type: 'Text', text: /^cache warm$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache 1h/ })).toBeUndefined()

  await clock.advance(60 * 60_000 - 30_000) // a tool call outlasting the TTL
  expect(await ui.find({ type: 'Text', text: /0:30 left/ })).toBeDefined()
  await ui.unmount()
})

test('the re-warm estimate appears only where it is actionable', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await clock.advance(60 * 60_000 - 40_000)
  expect(await ui.find({ type: 'Text', text: /re-warm ~\$/ })).toBeDefined()
  await clock.advance(60_000)
  expect(await ui.find({ type: 'Text', text: /cache cold .*~\$/ })).toBeDefined()
  await ui.unmount()
})

test('a narrow band shortens the wording but keeps the money', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(60 * 60_000 - 40_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(64) })
  const pill = await ui.find({ type: 'Text', text: /~\$/ })
  expect(pill).toBeDefined()
  expect(pill?.text).not.toMatch(/re-warm/)
  await ui.unmount()
})

test('with nothing billed yet the cold pill names the tokens instead', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /cache cold · next message 112k tokens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /~\$/ })).toBeUndefined()
  await ui.unmount()
})

// ── the cache model through the band ───────────────────────────────────

test('an assumed hour is corrected to 5m when a gap past 5m rebuilt the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, {})
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(12 * 60_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(textOf(tree)).toMatch(/cache lifetime 5m(?! \(assumed\))/)
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test('a prefix the cache should have served but did not is an unexpected rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 500))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(82_500, 0, 82_500, 300))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(1)
  await ui.unmount()
})

test('a warm follow-up to a long answer is not a rebuild', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 80_000, 5_000))
  await clock.advance(30_000)
  await respond(e => $.turn.step(e), resp(300, 80_000, 7_000, 400))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  await ui.press({ key: 'more' })
  const tree = await ui.drawn()
  expect(textOf(tree)).toMatch(/cache lifetime 1h/)
  expect(rebuilds(tree)).toBe(0)
  await ui.unmount()
})

test("a subagent's steps leave the main countdown and window alone", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, cost: { usd: 0 } }) // no ledger: the pill names the window in tokens
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(2_000, 0, 150_000, 1_000))
  await clock.advance(50 * 60_000)
  await respond(inAgent(e => $.turn.step(e)), resp(500, 0, 12_000, 800))
  await clock.advance(9 * 60_000 + 30_000)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /0:30 left · re-warm 153k tokens/ })).toBeDefined()
  await ui.press({ key: 'more' })
  expect(rebuilds(await ui.drawn())).toBe(0)
  await ui.unmount()
})

test("a subagent's tokens still count toward the rate the re-warm is solved from", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(inAgent(e => $.turn.step(e)), resp(3_000, 20_000, 10_000, 4_000))
  await clock.advance(61 * 60_000)

  // weighted = 13k + 1.25*110k + 0.1*20k + 5*6k = 182.5k; 1.25*112k*2.41/182.5k = 1.85
  // (without the subagent's tokens it would be 2.33)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.85/ })).toBeDefined()
  await ui.unmount()
})

test("the re-warm estimate is solved from every response's tokens", async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await respond(e => $.turn.step(e), resp(4_000, 100_000, 6_000, 3_000))
  await respond(e => $.turn.step(e), resp(1_000, 110_000, 2_000, 1_000))
  await clock.advance(61 * 60_000)

  // weighted = 15k + 1.25*108k + 0.1*210k + 5*6k = 201k; 1.25*114k*2.41/201k = 1.71
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /~\$1\.71/ })).toBeDefined()
  await ui.unmount()
})

// ── cost, context and limits ───────────────────────────────────────────

test("last turn's cost follows the main turn and ignores subagents'", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()

  await turn($, 't1', 2.0, 2.41)
  expect(await ui.find({ type: 'Text', text: /last \$0\.41/ })).toBeDefined()

  await turn($, 't2', 2.41, 3.0, { agentId: 'agent-1' })
  expect(await ui.find({ type: 'Text', text: /last \$0\.41/ })).toBeDefined()

  await turn($, 't3', 3.0, 3.5, { isAborted: true, reason: 'aborted' })
  expect(await ui.find({ type: 'Text', text: /last \$0\.50/ })).toBeDefined()
  await ui.unmount()
})

test("no cost ledger hides last turn's cost", async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { startedAt: 0, context: { window: 200_000 }, rateLimits: [] })
  await $.session.start(START)
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()
  await ui.unmount()
})

test('context and 5h escalate to amber at 80% and mark 95%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, {
    ...USAGE,
    context: { tokens: 164_000, window: 200_000, percent: 82 },
    rateLimits: [{ kind: 'five_hour', percentUsed: 96, resetsAt: new Date(3600_000).toISOString() }],
  })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const ctx = await ui.find({ type: 'Text', text: /82%!$/ })
  expect(ctx?.props?.color).toBe(DARK.amberFg)
  const five = await ui.find({ type: 'Text', text: /96%!!/ })
  expect(five?.props?.color).toBe(DARK.amberFg)
  await ui.unmount()
})

test('the 5h pill shows your pace once there is enough evidence, and drops it when stale', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  const resetsAt = new Date(3 * 3600_000).toISOString()
  const at = (pct: number) => ({ ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: pct, resetsAt }] })
  base(on, at(40))
  await $.session.start(START)
  const measure = async (pct: number) => {
    usage.current = at(pct)
    const u = usage.current
    await $.session.measure({ context: u.context, rateLimits: u.rateLimits, cost: u.cost, changed: [] })
  }
  await measure(40)
  await clock.advance(12 * 60_000)
  await measure(46)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const five = await ui.find({ type: 'Text', text: /full in ~1h 45m/ })
  expect(five).toBeDefined()
  expect(five?.props?.color).toBe(DARK.amberFg)

  await clock.advance(16 * 60_000)
  expect(await ui.find({ type: 'Text', text: /full in/ })).toBeUndefined()
  await ui.unmount()
})

test('toasts fire once per threshold crossing and re-arm below 75%', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const at = async (percent: number) =>
    $.session.measure({ context: { window: 200_000, percent }, rateLimits: [], changed: [] })

  await at(82)
  await at(84)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/Context is 82% full/)
  await at(96)
  expect(toasts).toHaveLength(2)
  await at(70)
  await at(81)
  expect(toasts).toHaveLength(3)
})

test('no rate limits: the band draws without the 5h pill or limit facts', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [] })
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
  await ui.press({ key: 'more' })
  const text = textOf(await ui.drawn())
  expect(text).toMatch(/cache lifetime/)
  expect(text).not.toMatch(/limit|resets in/)
  await ui.unmount()
})

// ── width ──────────────────────────────────────────────────────────────

test('narrow widths drop pills in priority order', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const at = async (cols: number) => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(cols) })

  let ui = await at(110)
  expect(await textMeters(ui)).toBe(2)
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeDefined()
  await ui.unmount()

  ui = await at(90) // the 5h pill goes first
  expect(await textMeters(ui)).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^5h/ })).toBeUndefined()
  await ui.unmount()

  ui = await at(75) // then the context meter, keeping its %
  expect(await textMeters(ui)).toBe(0)
  expect(await ui.find({ type: 'Text', text: /38%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeDefined()
  await ui.unmount()

  ui = await at(60) // then last $x; cache and cost stay
  expect(await ui.find({ type: 'Text', text: /last \$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
  await ui.unmount()
})

test('an escalated 5h pill never drops', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on, { ...USAGE, rateLimits: [{ kind: 'five_hour', percentUsed: 85 }] })
  await $.session.start(START)

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(70) })
  expect(await ui.find({ type: 'Text', text: /85%!/ })).toBeDefined()
  await ui.unmount()
})

test('a very narrow band still draws one row with cache and cost', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(30) })
  expect(rowCount(await ui.drawn())).toBe(1)
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

// ── expanded line, commands, sites ─────────────────────────────────────

test('⋯ toggles the expanded line, and Hide hides the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(2)
  const text = textOf(await ui.drawn())
  expect(text).toMatch(/of input served from cache/)
  expect(text).toMatch(/cache lifetime 1h/)
  expect(text).toMatch(/7d limit 30%, resets in 2d 19h/)
  expect(text).toMatch(/5h resets in 3h/)
  expect(text).toMatch(/1 model call\b/)

  await ui.press({ key: 'more' })
  expect(rowCount(await ui.drawn())).toBe(1)

  await ui.press({ key: 'more' })
  await ui.press({ key: 'hide' })
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await ui.unmount()
})

test('/usage-band more, less, hide and show drive the band', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const run = (args: string): Promise<unknown> =>
    $.command.run({ command: 'usage-band', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 110 } })

  await run('more')
  expect(textOf(await ui.drawn())).toMatch(/cache lifetime/)
  await run('less')
  expect(textOf(await ui.drawn())).not.toMatch(/cache lifetime/)
  await run('hide')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeUndefined()
  await run('show')
  expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
  await ui.unmount()
})

test('the band yields the site while a survey holds it', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({
    plugin: PLUGIN,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { ...props(110), hasSurvey: true },
  })
  expect(await ui.find({ type: 'Text', text: /cache/ })).toBeUndefined()
  await ui.unmount()
})

test('the band draws on every surface that renders', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))
  for (const surface of ['desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: props(110) })
    expect(await ui.find({ type: 'Text', text: /\$2\.41/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /cache/ })).toBeDefined()
    await ui.unmount()
  }
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test $MOD 2>&1 | grep -cE "^\(fail\)"`

Expected: most band tests FAIL (old rows, old wording, no `more` key). The insights and lifecycle tests still pass.

- [ ] **Step 3: Rewrite `palette.ts`**

```ts
// A filled pill needs its foreground and background from one source: a theme
// key resolves against the user's theme, a hex does not, and mixing them makes
// a pill that is legible on one theme and blank on the other. Nothing in the
// API reports whether the theme is light or dark, so the palette is declared
// rather than guessed: CC_BAND_APPEARANCE = dark | light | plain.
export type Palette = {
  filled: boolean
  surface: string
  value: string
  label: string
  dotWarm: string
  dotCold: string
  amberBg: string
  amberFg: string
  meterTrack: string
  meterFill: string
  cardBg: string
}

export const DARK: Palette = {
  filled: true,
  surface: '#2b2b33',
  value: '#ececf2',
  label: '#8a8a94',
  dotWarm: '#7fcf8a',
  dotCold: '#6f6f7a',
  amberBg: '#3a2f17',
  amberFg: '#f0c969',
  meterTrack: '#45454f',
  meterFill: '#b8b8c2',
  cardBg: '#1f1f25',
}

export const LIGHT: Palette = {
  filled: true,
  surface: '#ededf2',
  value: '#1d1d22',
  label: '#6e6e7a',
  dotWarm: '#2f8a45',
  dotCold: '#a0a0aa',
  amberBg: '#fbeccd',
  amberFg: '#7a4e06',
  meterTrack: '#d6d6de',
  meterFill: '#55555f',
  cardBg: '#ffffff',
}

// No backgrounds at all: every colour is a theme key, so it follows whatever
// theme the user has. The safe fallback, and what NO_COLOR terminals want.
export const PLAIN: Palette = {
  filled: false,
  surface: '',
  value: 'text',
  label: 'subtle',
  dotWarm: 'success',
  dotCold: 'subtle',
  amberBg: '',
  amberFg: 'warning',
  meterTrack: 'subtle',
  meterFill: 'text',
  cardBg: '',
}

/** The palette CC_BAND_APPEARANCE names; NO_COLOR forces plain. */
export const resolvePalette = (appearance: string | undefined, noColor: string | undefined): Palette =>
  noColor ? PLAIN : appearance === 'light' ? LIGHT : appearance === 'plain' ? PLAIN : DARK
```

- [ ] **Step 4: Trim `format.ts`**

- Delete `fmtElapsed`, `WINDOW_LABEL`, `severity`, and the comment block
  above `severity`.
- Keep `severityMark`, and change its doc comment to
  `/** The words for escalation: colour is never the only signal. */`
- Append:

```ts
/** A small figure honestly: under a cent is not $0.00. */
export const fmtSmallCost = (usd: number): string => (usd < 0.01 ? '<$0.01' : fmtCost(usd))
```

- [ ] **Step 5: Write `band.tsx`**

`$MOD/hooks/band.tsx`:

```tsx
import type { ElementTable, RenderChildren, RenderElement } from 'claude-code'
import { SOON_MS } from './cache'
import type { Ttl } from './cache'
import {
  clamp01,
  fmtCost,
  fmtCountdown,
  fmtEstimate,
  fmtEta,
  fmtResetsIn,
  fmtSmallCost,
  fmtTokens,
  severityMark,
} from './format'
import type { Palette } from './palette'

/** Everything the band shows, read by register.tsx; drawing never touches $. */
export type BandSnapshot = {
  columns: number
  isWorking: boolean
  expanded: boolean
  palette: Palette
  now: number
  cache: {
    requests: number
    msLeft: number
    ttl: Ttl
    ttlPinned: boolean
    window: number
    hitRatio: number | null
    misses: number
    reWarmUsd: number | null
  }
  costUsd: number
  lastTurnUsd: number | null
  contextPercent: number | undefined
  fiveHour: { percentUsed: number; resetsAt: string | undefined; etaMs: number | null } | undefined
  sevenDay: { percentUsed: number; resetsAt: string | undefined } | undefined
}

export type BandActions = {
  toggleExpanded: () => Promise<void>
  hide: () => Promise<void>
}

// The minimum width, in bodyColumns, each optional piece needs.
const SHOW_FIVE_HOUR = 100
const SHOW_CONTEXT_METER = 84
const SHOW_LAST_COST = 68
const AMBER_AT = 0.8
const METER_CELLS = 6

type Tone = 'calm' | 'amber'

export const drawBand = (el: ElementTable, s: BandSnapshot, act: BandActions): RenderElement => {
  const { Box, Button, Text } = el
  const p = s.palette
  const c = s.cache
  const short = s.columns < SHOW_LAST_COST

  /** A pill carries its own foreground and background, never one of each. */
  const pill = (key: string, tone: Tone, body: RenderChildren[]) => {
    const fg = tone === 'amber' ? p.amberFg : p.value
    return p.filled ? (
      <Box key={key} backgroundColor={tone === 'amber' ? p.amberBg : p.surface} paddingX={1}>
        {body}
      </Box>
    ) : (
      <Box key={key}>
        <Text color={fg}>[</Text>
        {body}
        <Text color={fg}>]</Text>
      </Box>
    )
  }

  // Two glyphs only: partial blocks jitter across fonts and read as noise to
  // a screen reader. The number beside a meter always carries the value.
  const meter = (key: string, frac: number, tone: Tone) => {
    const filled = Math.round(clamp01(frac) * METER_CELLS)
    return (
      <Text key={key} color={tone === 'amber' ? p.amberFg : p.meterFill}>
        {'█'.repeat(filled)}
        <Text color={p.meterTrack}>{'░'.repeat(METER_CELLS - filled)}</Text>
      </Text>
    )
  }

  const pills: RenderChildren[] = []

  // ---- cache: the only pill that counts down --------------------------
  const estimate = c.reWarmUsd !== null ? fmtEstimate(c.reWarmUsd) : `${fmtTokens(c.window)} tokens`
  const warm = c.msLeft > 0
  const soon = c.requests > 0 && warm && c.msLeft <= SOON_MS
  const dot = (color: string) => (
    <Text key="dot" color={color}>
      {'● '}
    </Text>
  )
  if (c.requests === 0) {
    pills.push(pill('cache', 'calm', [dot(p.dotCold), <Text key="c" color={p.value}>{'cache warming'}</Text>]))
  } else if (soon) {
    const text = short
      ? `◷ ${fmtCountdown(c.msLeft)} ${estimate}`
      : `◷ ${fmtCountdown(c.msLeft)} left · re-warm ${estimate}`
    pills.push(pill('cache', 'amber', [<Text key="c" color={p.amberFg}>{text}</Text>]))
  } else if (!warm) {
    // Cold is a price, not an error: neutral, no hue, no alarm.
    const text = short ? `cold ${estimate}` : `cache cold · next message ${estimate}`
    pills.push(pill('cache', 'calm', [dot(p.dotCold), <Text key="c" color={p.value}>{text}</Text>]))
  } else {
    // Mid-turn every step restarts the TTL, so a countdown would only bounce.
    const text = s.isWorking ? 'cache warm' : `cache ${fmtCountdown(c.msLeft)}`
    pills.push(pill('cache', 'calm', [dot(p.dotWarm), <Text key="c" color={p.value}>{text}</Text>]))
  }

  // ---- cost -------------------------------------------------------------
  const costBody: RenderChildren[] = [
    <Text key="v" color={p.value} bold>
      {fmtCost(s.costUsd)}
    </Text>,
  ]
  if (s.lastTurnUsd !== null && s.columns >= SHOW_LAST_COST) {
    costBody.push(<Text key="l" color={p.label}>{` last ${fmtSmallCost(s.lastTurnUsd)}`}</Text>)
  }
  pills.push(pill('cost', 'calm', costBody))

  // ---- context ----------------------------------------------------------
  if (s.contextPercent !== undefined) {
    const frac = clamp01(s.contextPercent / 100)
    const tone: Tone = frac >= AMBER_AT ? 'amber' : 'calm'
    const fg = tone === 'amber' ? p.amberFg : p.value
    const withMeter = s.columns >= SHOW_CONTEXT_METER
    pills.push(
      pill('ctx', tone, [
        <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
          {'context '}
        </Text>,
        withMeter ? meter('m', frac, tone) : null,
        <Text key="v" color={fg}>
          {`${withMeter ? ' ' : ''}${Math.round(s.contextPercent)}%${severityMark(frac)}`}
        </Text>,
      ]),
    )
  }

  // ---- 5h limit ---------------------------------------------------------
  if (s.fiveHour) {
    const frac = clamp01(s.fiveHour.percentUsed / 100)
    const eta = s.fiveHour.etaMs
    const tone: Tone = frac >= AMBER_AT || eta !== null ? 'amber' : 'calm'
    if (tone === 'amber' || s.columns >= SHOW_FIVE_HOUR) {
      const fg = tone === 'amber' ? p.amberFg : p.value
      pills.push(
        pill('5h', tone, [
          <Text key="l" color={tone === 'amber' ? p.amberFg : p.label}>
            {'5h '}
          </Text>,
          meter('m', frac, tone),
          <Text key="v" color={fg}>
            {` ${Math.round(s.fiveHour.percentUsed)}%${severityMark(frac)}${eta === null ? '' : ` full in ${fmtEta(eta)}`}`}
          </Text>,
        ]),
      )
    }
  }

  // ---- the expanded line: every fact, in words --------------------------
  const facts: string[] = []
  if (c.requests > 0 && c.hitRatio !== null) facts.push(`${Math.round(c.hitRatio * 100)}% of input served from cache`)
  if (c.misses > 0) facts.push(`${c.misses} unexpected rebuild${c.misses === 1 ? '' : 's'}`)
  // Inference only ever moves an assumed hour to 5m, so an unpinned hour is the guess.
  facts.push(`cache lifetime ${c.ttl}${!c.ttlPinned && c.ttl === '1h' ? ' (assumed)' : ''}`)
  if (s.sevenDay) {
    const r = fmtResetsIn(s.sevenDay.resetsAt, s.now)
    facts.push(`7d limit ${Math.round(s.sevenDay.percentUsed)}%${r === null ? '' : r === 'now' ? ', resetting now' : `, resets in ${r}`}`)
  }
  if (s.fiveHour) {
    const r = fmtResetsIn(s.fiveHour.resetsAt, s.now)
    if (r !== null) facts.push(r === 'now' ? '5h resetting now' : `5h resets in ${r}`)
  }
  if (c.requests > 0) facts.push(`${c.requests} model call${c.requests === 1 ? '' : 's'}`)

  return (
    <Box flexDirection="column">
      <Box key="row" flexDirection="row" flexWrap="nowrap" overflow="hidden" columnGap={1}>
        {pills}
        <Box flexGrow={1} />
        <Button key="more" label="⋯" plain dimColor onPress={act.toggleExpanded} />
      </Box>
      {s.expanded ? (
        <Box key="facts" flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text color={p.label} wrap="wrap">
            {facts.join(' · ')}
          </Text>
          <Button key="hide" label="Hide" plain dimColor onPress={act.hide} />
        </Box>
      ) : null}
    </Box>
  )
}
```

- [ ] **Step 6: Rewire `register.tsx`**

**Imports.** Replace the imports from `./format`, `./cache` and `./palette`
with:

```ts
import { drawBand } from './band'
import { cache, hitRatio, msLeft, recordResponse, resetCache, resetConversation, reWarmUsd } from './cache'
import { fmtCountdown, fmtEta } from './format'
import { fiveHourEtaMs, insights, noteFiveHour, noteTurnEnd, noteTurnStart, resetInsights } from './insights'
import { DARK, resolvePalette } from './palette'
import type { Palette } from './palette'
```

Change the type import to `import type { Register, Timer } from 'claude-code'`.

**Constants.** After `let palette: Palette = DARK`, add:

```ts
// Toasts speak at the same points the pills turn amber, so the two agree.
const TOAST_AT = 0.8
const TOAST_AGAIN_AT = 0.95
const TOAST_REARM_BELOW = 0.75
```

**`warned`.** Change `const warned = new Set<string>()` to
`const warned = new Map<string, number>()`.

**`session.start`.** At the start of the hook, after `resetCache()`, add:

```ts
    resetInsights()
    warned.clear()
    lastPaintKey = ''
```

Inside the timer, replace the two lines

```ts
        const key = `${fmtCountdown(left)}|${left > 0}`
```

with

```ts
        const eta = fiveHourEtaMs(now)
        const key = `${fmtCountdown(left)}|${left > 0}|${eta === null ? '-' : fmtEta(eta)}`
```

**`session.end`.** After `resetConversation(...)`, add `resetInsights()`.

**Turn hooks.** After the `session.end` hook, add:

```ts
  on('turn.start', async ($, e, next) => {
    noteTurnStart(e.turnId, (await $.session.usage()).cost?.usd)
    return next(e)
  })

  // Main-loop turns only: a subagent's run is part of the turn that spawned it.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      noteTurnEnd(e.turnId, (await $.session.usage()).cost?.usd)
      $.ui.invalidate('ui.render')
    }
    return result
  })
```

**`session.measure`.** Replace the whole hook with:

```ts
  on('session.measure', async ($, e, next) => {
    const now = await $.clock.now()
    const note = (key: string, frac: number, text: (pct: number) => string): void => {
      const level = frac >= TOAST_AGAIN_AT ? 2 : frac >= TOAST_AT ? 1 : 0
      if (level > (warned.get(key) ?? 0)) {
        warned.set(key, level)
        $.ui.toast(text(Math.round(frac * 100)))
      } else if (frac < TOAST_REARM_BELOW) {
        warned.delete(key)
      }
    }

    if (e.context.percent !== undefined) {
      note('context', e.context.percent / 100, pct => `Context is ${pct}% full. Claude Code will summarize older messages soon.`)
    }
    for (const limit of e.rateLimits) {
      if (limit.kind !== 'five_hour') continue
      noteFiveHour(now, limit.percentUsed, limit.resetsAt)
      note('five_hour', limit.percentUsed / 100, pct => `You've used ${pct}% of your 5-hour limit.`)
    }

    $.ui.invalidate('ui.render')
    return next(e)
  })
```

**`ui.render`.** Replace the whole `ui.render` hook, from
`on('ui.render', { component: 'AbovePrompt' }` to the end of the file, with:

```tsx
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) return next(e)

    const usage = await $.session.usage()
    const now = await $.clock.now()
    const five = usage.rateLimits.find(l => l.kind === 'five_hour')
    const seven = usage.rateLimits.find(l => l.kind === 'seven_day')

    return drawBand(
      $.ui.resolve(e),
      {
        columns: e.props.bodyColumns,
        isWorking: e.props.isWorking,
        expanded: await read($, isExpanded),
        palette,
        now,
        cache: {
          requests: cache.requests,
          msLeft: msLeft(now),
          ttl: cache.ttl,
          ttlPinned: cache.ttlPinned,
          window: cache.window,
          hitRatio: hitRatio(),
          misses: cache.misses,
          reWarmUsd: reWarmUsd(usage.cost?.usd),
        },
        costUsd: usage.cost?.usd ?? 0,
        lastTurnUsd: insights.lastTurnUsd,
        contextPercent: usage.context.percent,
        fiveHour: five ? { percentUsed: five.percentUsed, resetsAt: five.resetsAt, etaMs: fiveHourEtaMs(now) } : undefined,
        sevenDay: seven ? { percentUsed: seven.percentUsed, resetsAt: seven.resetsAt } : undefined,
      },
      {
        toggleExpanded: async () => {
          await update($, isExpanded, current => !current)
        },
        hide: async () => {
          await update($, isHidden, () => true)
        },
      },
    )
  })
}
```

- [ ] **Step 7: Run the gates**

Expected: validation passes, listing hooks `session.start`, `session.end`,
`turn.start`, `turn.complete`, `turn.step`, `session.measure`,
`command.run{command=usage-band}` and `ui.render{component=AbovePrompt}`.
Also expect `0 fail` and `TSC-OK`.

If a single assertion fails on wording, fix the code to match the test,
not the reverse. The test copy is the spec's copy.

- [ ] **Step 8: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "feat: calm one-row usage band with last turn cost and 5h pace

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: SVG meters on desktop

**Files:**
- Modify: `$MOD/hooks/band.tsx` (the `meter` internal)
- Modify: `$MOD/tests/band.test.ts` (append tests)

**Interfaces:**
- Consumes: `drawBand` and `meter(key, frac, tone)` from Task 5; `palette.meterTrack` and `palette.meterFill`.
- Produces: nothing new outside this file.

- [ ] **Step 1: Append the failing tests**

```ts
// ── desktop meters ─────────────────────────────────────────────────────

test('desktop draws SVG meters; the terminal and plain draw text ones', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const desk = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  const svgs = await desk.findAll({ type: 'Svg' })
  expect(svgs).toHaveLength(2)
  expect(svgs[0]?.props?.width).toBe(44)
  expect(svgs[0]?.props?.height).toBe(6)
  expect(svgs[0]?.props?.alt).toBe('38%')
  expect(String(svgs[0]?.props?.source)).toContain(DARK.meterTrack)
  expect(await textMeters(desk)).toBe(0)
  await desk.unmount()

  const term = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(await term.findAll({ type: 'Svg' })).toHaveLength(0)
  expect(await textMeters(term)).toBe(2)
  await term.unmount()
})

test('plain appearance keeps text meters on desktop', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  await ui.unmount()
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test $MOD 2>&1 | grep -E "^\(fail\)"`
Expected: "desktop draws SVG meters…" FAILs, since `findAll` finds 0 Svg. The plain test passes already; it guards Step 3.

- [ ] **Step 3: Draw SVG meters when the surface has `Svg` and the palette is hex**

In `band.tsx`, after `const short = …`, add:

```tsx
  // Svg is the desktop's alone, and its markup takes hex: theme keys can't
  // reach inside it, so plain appearance keeps the text meter.
  const Svg = 'Svg' in el && p.filled ? el.Svg : undefined
```

Replace the body of `meter` with:

```tsx
  const meter = (key: string, frac: number, tone: Tone) => {
    const fill = tone === 'amber' ? p.amberFg : p.meterFill
    if (Svg) {
      const w = 44
      const h = 6
      const fw = Math.round(clamp01(frac) * w)
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" rx="3" fill="${p.meterTrack}"/>` +
        (fw > 0 ? `<rect width="${fw}" height="${h}" rx="3" fill="${fill}"/>` : '') +
        '</svg>'
      return <Svg key={key} source={source} alt={`${Math.round(clamp01(frac) * 100)}%`} width={w} height={h} />
    }
    // Two glyphs only: partial blocks jitter across fonts and read as noise to
    // a screen reader. The number beside a meter always carries the value.
    const filled = Math.round(clamp01(frac) * METER_CELLS)
    return (
      <Text key={key} color={fill}>
        {'█'.repeat(filled)}
        <Text color={p.meterTrack}>{'░'.repeat(METER_CELLS - filled)}</Text>
      </Text>
    )
  }
```

Delete the old two-glyph comment above `meter`; it now sits inside.

- [ ] **Step 4: Run the gates**

Expected: `0 fail` and `TSC-OK`. If `tsc` rejects `<Svg …/>` because the
union isn't narrowed, change the `Svg` line to:

```tsx
const Svg = p.filled && 'Svg' in el ? (el as ElementTable<'desktop'>).Svg : undefined
```

- [ ] **Step 5: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "feat: SVG meters in the desktop usage band

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hover explanations

**Files:**
- Modify: `$MOD/hooks/band.tsx` (`pill` takes a card; pills are collected, then drawn with the last one right-anchored)
- Modify: `$MOD/tests/band.test.ts` (append tests)

**Interfaces:**
- Consumes: `pill`, `BandSnapshot` and `palette.cardBg` from Task 5.
- Constraint, found by the probe: the card Box must not carry a `key`. The
  engine refuses a tree in which a keyed Box is drawn `display: "none"`.
- Produces: nothing outside this file.

- [ ] **Step 1: Append the failing tests**

```ts
// ── hover explanations ─────────────────────────────────────────────────

/** Each pill's hidden card: [pill key, card] pairs from the first row. */
const cards = (tree: unknown): Array<[string, Node]> => {
  const out: Array<[string, Node]> = []
  walk(tree, n => {
    for (const k of n.children ?? []) {
      const child = k as Node
      if (child?.props?.position === 'absolute') out.push([String(n.props?.key), child])
    }
  })
  return out
}

test('every pill explains itself on hover, inside its own hover scope', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start({ ...START, surface: 'desktop' })
  await turn($, 't1', 2.0, 2.41)
  await respond(e => $.turn.step(e), resp(41_000, 0, 155_000, 12_000))

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: props(110) })
  const found = cards(await ui.drawn())
  expect(found.map(([key]) => key).join(',')).toBe('cache,cost,ctx,5h')
  for (const [, card] of found) {
    expect(card.props?.display).toBe('none')
    expect(card.hover?.display).toBe('flex')
    expect(card.props?.backgroundColor).toBe(DARK.cardBg)
    expect(textOf(card).length).toBeLessThan(60)
  }
  expect(found[0]?.[1].props?.left).toBe(0)
  expect(found[3]?.[1].props?.right).toBe(0) // the rightmost opens leftward
  expect(textOf(found[0]?.[1])).toBe('Warm cache bills input at 10%; expires 1h after a reply')
  expect(textOf(found[1]?.[1])).toBe('$0.41 spent during your last message, subagents included')
  expect(textOf(found[2]?.[1])).toBe('Conversation fill; near full, older turns get summarized')
  expect(textOf(found[3]?.[1])).toBe('5-hour limit across all your Claude use; resets in 3h 00m')
  await ui.unmount()
})

test('the rightmost visible pill anchors right when narrower widths drop pills', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(90) })
  const found = cards(await ui.drawn())
  expect(found.map(([key]) => key).join(',')).toBe('cache,cost,ctx')
  expect(found[2]?.[1].props?.right).toBe(0)
  await ui.unmount()
})

test('a cold cache explains what the next message rebuilds', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.env(on, HOUR_1)
  base(on)
  await $.session.start(START)
  await respond(e => $.turn.step(e), resp(10_000, 0, 100_000, 2_000))
  await clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  const cache = cards(await ui.drawn()).find(([key]) => key === 'cache')
  expect(textOf(cache?.[1])).toMatch(/^Cold: next message rebuilds 112k tokens \(~\$\d+\.\d\d\)$/)
  await ui.unmount()
})

test('plain appearance draws no hover cards', async ($, on) => {
  mock.clock(on, { now: 0 })
  mock.env(on, { CC_BAND_APPEARANCE: 'plain', ...HOUR_1 })
  base(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: props(110) })
  expect(cards(await ui.drawn())).toHaveLength(0)
  await ui.unmount()
})
```

Add `Node` to the import from `./helpers`.

- [ ] **Step 2: Run them and watch them fail**

Run: `claude plugin test $MOD 2>&1 | grep -E "^\(fail\)"`
Expected: the first three hover tests FAIL, finding no cards. The plain one passes and guards Step 3.

- [ ] **Step 3: Give `pill` a card and anchor the last one right**

In `band.tsx`, replace the `pill` function with:

```tsx
  type PillSpec = { key: string; tone: Tone; body: RenderChildren[]; card: string }

  // A card is a child of its pill: the engine counts the pointer on a placed
  // Box as on its parent, so reading the card keeps the pill hovered. One
  // line, since a collapsed band is one row; plain has no background to
  // cover the row with, so it has no cards, and the expanded line says it all.
  const pill = ({ key, tone, body, card }: PillSpec, anchor: 'left' | 'right') => {
    const fg = tone === 'amber' ? p.amberFg : p.value
    if (!p.filled) {
      return (
        <Box key={key}>
          <Text color={fg}>[</Text>
          {body}
          <Text color={fg}>]</Text>
        </Box>
      )
    }
    return (
      <Box key={key} backgroundColor={tone === 'amber' ? p.amberBg : p.surface} paddingX={1}>
        {body}
        {/* No key: a keyed Box is its own hover scope, and a hidden one can
            never be hovered, so the engine refuses it. Unkeyed, the card
            answers to its pill's scope. */}
        <Box
          position="absolute"
          top={0}
          {...(anchor === 'left' ? { left: 0 } : { right: 0 })}
          width={Math.min(card.length + 2, s.columns)}
          display="none"
          hover={{ display: 'flex' }}
          backgroundColor={p.cardBg}
          paddingX={1}
        >
          <Text color={p.value} wrap="truncate-end">
            {card}
          </Text>
        </Box>
      </Box>
    )
  }
```

Change `const pills: RenderChildren[] = []` to `const pills: PillSpec[] = []`.

Change every `pills.push(pill('<key>', <tone>, <body>))` to
`pills.push({ key: '<key>', tone: <tone>, body: <body>, card: <card> })`.
The card for each:

- **cache** (all four branches). Define this once, above the branches, and
  pass `card: cacheCard` in each:

```tsx
  const cacheCard =
    c.requests > 0 && !warm
      ? `Cold: next message rebuilds ${fmtTokens(c.window)} tokens${c.reWarmUsd === null ? '' : ` (${fmtEstimate(c.reWarmUsd)})`}`
      : `Warm cache bills input at 10%; expires ${c.ttl} after a reply`
```

- **cost:**

```tsx
    card: s.lastTurnUsd === null
      ? 'What this session has cost so far'
      : `${fmtSmallCost(s.lastTurnUsd)} spent during your last message, subagents included`,
```

- **ctx:** `card: 'Conversation fill; near full, older turns get summarized'`

- **5h:**

```tsx
    card: (() => {
      const r = fmtResetsIn(s.fiveHour.resetsAt, s.now)
      return r === null || r === 'now'
        ? 'Your 5-hour limit, across all your Claude use'
        : `5-hour limit across all your Claude use; resets in ${r}`
    })(),
```

  Inside the `if (s.fiveHour)` block, bind `const fiveHour = s.fiveHour` at
  its top and use `fiveHour` in the closure, so the narrowing holds.

In the returned tree, replace `{pills}` with:

```tsx
        {pills.map((spec, i) => pill(spec, i === pills.length - 1 ? 'right' : 'left'))}
```

- [ ] **Step 4: Run the gates**

Expected: `0 fail` and `TSC-OK`. Every earlier band test still passes: the
copy contains no `0%`, `re-warm`, `last $` or `cache lifetime`, so their
negative assertions hold.

- [ ] **Step 5: Commit**

```bash
cd $REPO && git add -A plugins && git commit -qm "feat: hover explanations on usage band pills

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README, release and live check

**Files:**
- Rewrite: `$REPO/README.md`
- Modify: `$MOD/.claude-plugin/plugin.json` (`"version": "0.2.0"`)

**Interfaces:** none.

- [ ] **Step 1: Bump the version**

```bash
sed -i '' 's/"version": "0.1.1"/"version": "0.2.0"/' $MOD/.claude-plugin/plugin.json && grep version $MOD/.claude-plugin/plugin.json
```

- [ ] **Step 2: Rewrite the README**

`$REPO/README.md`:

````markdown
# session-usage-band

One calm row above the Claude Code prompt that answers: what is this
session costing, and is there anything I should do about it right now?

```
● cache 52m   $3.19 last $0.42   context ██░░░░ 16%   5h ░░░░░░ 4%            ⋯
```

## Reading it

| Pill | Shows | Turns amber when |
| --- | --- | --- |
| Cache | Time until the prompt cache goes cold; `cache warm` while Claude is working | Its last minute: `0:47 left · re-warm ~$0.52` |
| Cost | The session's total, and what your last message cost | Never |
| Context | How full the conversation is | 80% (`!`), and 95% (`!!`) |
| 5h | Your 5-hour usage limit | 80%, or when your pace would fill it before it resets: `full in ~40m` |

Everything else stays grey. Amber means act soon. Nothing is ever red,
because a cold cache or a full meter is a price, not an error. Hover any
pill for a one-line explanation.

`⋯` opens a second line with the rest, in plain words: how much input
came from the cache, unexpected rebuilds, the cache lifetime, your weekly
limit and when each limit resets.

As the window narrows, the 5h pill goes first (unless it's amber), then the
context meter, then `last $x`. The cache and the total cost always stay.

## The cache countdown

Claude Code caches the conversation server-side. While the cache is warm,
re-reading the conversation costs a tenth of the normal input price. It
stays warm for a lifetime (5 minutes or an hour) counted from the last
reply. Go idle past that, and the next message rebuilds the whole
conversation at the cache-write price.

The band never suggests sending a message to keep the cache warm. That
would mean burning tokens to avoid burning tokens.

## What a cold cache costs

No pricing table is reachable from a mod, so the rate is solved from the
session's own bill. Anthropic models hold fixed ratios between their rates
(a cache write 1.25× base input, a cache read 0.1×, output 5×), which
leaves one unknown:

```
cost = r × (uncached + 1.25×written + 0.1×read + 5×output)
```

Solve for `r`, then price the re-warm as a cache write of the whole
conversation. It's always shown with `~`.

- **Known limitation:** a 1-hour cache bills writes at 2×, not 1.25×. The
  estimate partly corrects itself through the solved rate, but it's still
  an estimate on top of the client-side cost Claude Code computes.
- **After `/clear`,** the band starts fresh and solves the rate from what
  the new conversation has spent.

## Your pace on the 5-hour limit

The band records your 5-hour usage as it moves. Once it has at least 10
minutes and a 2-point rise to go on, it projects when you'd hit 100%,
using the last 30 minutes. If that's before the limit resets, the pill
says so. The limit is shared across all your Claude use, so the pace
includes your other sessions and devices. The projection hides once its
newest reading is more than 15 minutes old.

## Appearance

```bash
CC_BAND_APPEARANCE=dark    # default: filled pills tuned for dark themes
CC_BAND_APPEARANCE=light   # filled pills tuned for light themes
CC_BAND_APPEARANCE=plain   # no backgrounds; every colour a theme key
```

`NO_COLOR` forces `plain`. In the desktop app's Code tab, meters are drawn
as small SVG bars. In the terminal and in `plain`, they're text. `plain`
has no hover cards, since the second line carries the same facts.

## Commands

| Command | Effect |
| --- | --- |
| `/usage-band` | Toggle visibility |
| `/usage-band more` / `less` | Open or close the second line |
| `/usage-band show` / `hide` | Set visibility explicitly |

## Cache lifetime

The default lifetime depends on billing: an hour on a subscription within
plan usage, five minutes on usage credits or an API key. A mod can't read
which applies, so the band assumes an hour and says `(assumed)`. If it
then sees the cache rebuild after a gap longer than five minutes, it
corrects itself to `5m`.

Set `CLAUDE_CODE_PROMPT_CACHE_TTL` to `5m` or `1h` to remove the guess.

## Install

```bash
claude plugin marketplace add /path/to/claude-mod
claude plugin install session-usage-band@hossein-mods
```

It draws in the terminal and in the Claude desktop app's Code tab. WSL
sessions don't load plugins.
````

- [ ] **Step 3: Run the gates once more**

Expected: validation passes, `0 fail`, `TSC-OK`.

- [ ] **Step 4: Commit**

```bash
cd $REPO && git add -A && git commit -qm "release: session-usage-band 0.2.0

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Update the installed plugin**

```bash
claude plugin marketplace update hossein-mods && claude plugin update session-usage-band@hossein-mods && claude plugin list 2>&1 | grep -A3 usage-band
```

Expected: `Version: 0.2.0`, `Status: ✔ enabled`. If `update` reports
nothing to do, run `claude plugin uninstall session-usage-band@hossein-mods`
and then `claude plugin install session-usage-band@hossein-mods`.

- [ ] **Step 6: Live check in a new throwaway Code session** (user)

1. **Collapsed band:**
   - one row
   - `cache warming` until the first reply, then `cache 1h 00m` /
     `59m` once it finishes
   - `cache warm` while Claude works
2. **After a reply:** `last $x` appears, and the meters render on desktop
   as SVG bars.
3. **Hover:** each pill shows its card, as in the probe.
4. **Expanded line:** `⋯` opens the plain-language line and `Hide` hides
   the band.
5. **`/clear`:** the band shows `cache warming` with no `last $x`. After
   the next reply, the cold re-warm figure is in the same range as before,
   not inflated.
6. **`/cost` after `/clear`:** record in the spec's §6 whether `/cost`
   reset.

- [ ] **Step 7: Commit the recorded live-check notes**

```bash
cd $REPO && git add docs && git commit -qm "docs: record 0.2.0 live check

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
