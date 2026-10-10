# Contributing

Thanks for helping. This file covers the development loop, the rules the
code follows, and what a pull request needs.

## Development loop

You need Claude Code with mods (function-hooks plugins). Tests and checks
run locally; nothing here needs network access or an API key.

```bash
# Check the marketplace index, then the plugin's manifest and what the module hooks and calls
claude plugin validate .
claude plugin validate plugins/session-usage-band

# Run the tests
claude plugin test plugins/session-usage-band

# Run only some test files, by name glob (the red and green steps)
tools/test-only.sh view-ledger 'golden-*'

# Type-check (after the engine has laid the types, see below)
npx -y -p typescript@5 tsc -p plugins/session-usage-band

# The views gate: no layout but chips formats or reads a raw fact
tools/views-gate.sh
```

The type check reads the engine's API types from
`plugins/session-usage-band/.claude-plugin/types/`. The engine writes them
the first time it loads the plugin from its folder, for example with
`claude --plugin-dir plugins/session-usage-band`. They're generated, so
they're git-ignored. Neither `claude plugin test` nor `validate` writes
them, and loading needs a signed-in session, so CI can't type-check: run it
locally before you open a pull request.

To see a change live, add your clone as the marketplace and install from
it. From the clone's parent folder:

```bash
claude plugin marketplace add ./claude-mod
claude plugin install session-usage-band@hossein-mods
```

Then, after each edit, bump `version` in
`plugins/session-usage-band/.claude-plugin/plugin.json` (an update at the
same version doesn't reinstall; any higher number works locally, and you
set the one [step 1](#before-you-open-a-pull-request) asks for before you
open the pull request), and run:

```bash
claude plugin marketplace update hossein-mods
claude plugin update session-usage-band@hossein-mods
```

Run `/reload-plugins` in your session afterwards.

## How the code is laid out

| File | Role |
| --- | --- |
| `hooks/register.tsx` | The hooks. The only module that touches the engine (`$`). |
| `hooks/snapshot.ts` | The snapshot and actions: the one contract between `register.tsx` and the drawing. |
| `hooks/band.tsx` | `drawBand(elements, snapshot, actions)`: a pure function from a snapshot to a tree. It builds the kit and the readings, draws the chosen layout, and falls back to chips. |
| `hooks/kit.tsx` | The drawing kit made once per draw: elements, the Svg gate, palette, measure, hover cards, gaps, icons. |
| `hooks/reading.ts` | `readingsOf`: everything a view reads, built once per draw. Each section's facts, with its words from `words.ts`. |
| `hooks/words.ts` | The phrasebook: every phrase a new layout draws, built from the facts, so amber, pace, resets, empty states and alt text read the same everywhere. |
| `hooks/views/view.ts` | `View`, `rowsOf` and `defineView`, which makes a layout from its rows, its collapsed lines and its body. |
| `hooks/views/index.ts` | `VIEWS`: every layout by name. |
| `hooks/views/frame.tsx` | The expanded scaffold the new layouts share: the workspace strip, the view's body and the buttons. |
| `hooks/views/parts.tsx` | The pieces several layouts draw: pills, the shared cache pill, and the lines, sections and grid they're laid out with. |
| `hooks/views/<name>.tsx` | One file per layout: `chips`, `gauges`, `ledger`, `rings`, `pulse`, `tiles`, `week`, `departures`, `forecast`. Chips keeps its own pills and cards. |
| `hooks/strip.tsx` | The workspace strip: project, branch or worktree, changes, ahead/behind. |
| `hooks/charts.tsx` | The charts: `meter`, `ring`, `sparkline`, `barChart`, `dayCells`, `underline`, `braille`. Each is an Svg on the desktop and text elsewhere. |
| `hooks/glyphs.ts` | The terminal's glyph tier (`CC_BAND_GLYPHS`, a CJK locale) and the ASCII mapping. |
| `hooks/calendar.ts` | Week's day and hour cells, read off the limit samples. |
| `hooks/layout.ts` | Give-way orders, sizes, and how many columns a drawn tree takes. |
| `hooks/icons.ts` | The icons' SVG bodies, glyphs and names. |
| `hooks/cache.ts` | The prompt-cache model: TTL, misses, recall, a resume, re-warm and savings estimates, and the cache's view for the band. |
| `hooks/insights.ts` | Last message cost, the 5-hour pace, and the trails pulse draws. |
| `hooks/format.ts` | Numbers, times, thresholds and escalation marks. |
| `hooks/palette.ts` | The dark, light and plain palettes, and the colours for the band's bare ground. |
| `hooks/workspace.ts` | The workspace strip's git state and path, parsed from git's output. |
| `hooks/memory.ts` | What the band remembers across sessions (last replies, rates, the layout, the limit samples), and what it reads off a transcript. |
| `types/index.d.ts` | The plugin's state contract. |
| `tests/` | Tests, one file per area, with shared helpers in `helpers.ts`: `setup()` starts a test from a fresh engine, `mountBand()` draws the band, `byKey()` finds a node. |
| `tests/cases.ts`, `tests/matrix.ts` | The states every layout is drawn in and `drawCases`, which draws them; `snapOf` for pure tests, the invariant checks, and `viewSuite`, which every layout's test file runs. |
| `tools/golden/capture.sh`, `tests/golden/` | Chips' frozen trees and the tests that hold chips to them; see the rule below. |
| `tools/test-only.sh` | Runs only the tests whose names match the globs given, against a scratch copy of the plugin. |
| `tools/views-gate.sh` | The views gate, run in CI: fails when a layout's view formats or reads a raw fact. |

## Rules the code follows

- **`$` stays in `register.tsx`.** The engine refuses it anywhere else.
  Everything the band shows reaches `band.tsx` through the snapshot.
- **Never name a local variable `h`.** JSX compiles to the global `h()`.
- **No whitespace-only string children on the desktop.** It drops them, so
  a gap there is a spacer `Box`. Text surfaces keep their spaces.
- **Svg is desktop-only.** Other surfaces hold the element but draw
  nothing, so every Svg goes through `kit.Svg`, which is undefined
  elsewhere and in the plain palette.
- **No SVG names an id.** Svgs can share a page, where a repeated id
  resolves to the first, so a drawing rounds its own ends rather than clip.
- **A hover card has no key.** A keyed Box is its own hover scope, and a
  hidden one could never be hovered.
- **A hover card is drawn after the pieces of its row.** A placed Box paints
  over those before it, so a card inside its piece would sit under the
  pieces after. The kit's `hoverable` and `hoverCard` join the two by a hover
  scope. The pointer on a showing card keeps it showing, so a card sits at
  its piece, as wide as its text, and a control the card may reach, like
  the band's ▿, comes after it.
- **A Button holds text alone.** It has no icon prop and no children but its
  label, so a button's icon is a glyph.
- **Atoms are declared in `register.tsx`.** They are the band's state in the
  engine's store, and they belong with the hooks that read and write them.
- **Colour is never the only signal.** Escalation also adds words or
  `!` / `!!`. Text meets WCAG AA contrast (4.5:1) and edges and tracks meet
  3:1, in every palette. The design tests check both, over every palette.
- **A new layout** is: its name in `LAYOUT_NAMES` (`hooks/snapshot.ts`);
  `hooks/views/<name>.tsx`, made with `defineView`; an entry in `VIEWS`
  (`hooks/views/index.ts`); and `tests/view-<name>.test.ts`, which calls
  `viewSuite('<name>')`. It draws only words from `read`: outside
  `chips.tsx`, `parts.tsx` and `frame.tsx`, no `.tsx` file in `views/`
  contains `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` or
  an import of `../format`. `tools/views-gate.sh` checks. Then add it to the
  Layouts table in the plugin README, add it to the layout names and count
  in both READMEs (and the gallery's alt text) and to the list of layouts
  in this file's table, and rebuild the
  layouts gallery (`tools/demos/build.sh`).
- **Test first.** Write the failing test, watch it fail
  (`tools/test-only.sh <name>`), then make it pass, then run the whole
  suite.
- **Settle on the clock.** Work a hook starts without awaiting finishes
  under the mocked clock: `await clock.settle()`, never a spin of
  microtasks. A test that walks the clock through many minutes takes the
  `LONG` budget from `helpers.ts`: the band ticks every second, and CI
  runners are several times slower than a laptop.
- **Chips' trees are frozen.** `golden-a` and `golden-b` hold chips to the
  trees it drew before the layouts work, with the 0.11.13 hover fix: dark
  and plain, desktop and terminal, at 40, 95 and 200 columns, shut and
  open. `tools/golden/capture.sh` runs only on the hooks at `4882313`, so it
  can't recapture a fix. If your change is meant to alter what chips draws,
  update the failing keys in `tests/golden/chips.ts` to the hashes the
  failures print, and the whole tree in `GOLDEN_TREES` for a key held there,
  and say why in the pull request.

## Demos and the website

Every demo in `docs/` (the film, the GIFs, the landing page's live band and
its states, the social card, the states and layouts galleries) is drawn from the band's own output. After a change that alters
how the band reads, rebuild them with `tools/demos/build.sh`; see
[tools/demos/README.md](tools/demos/README.md). Edit the landing page in
`tools/demos/site/template.html`, never in `docs/index.html`.

## Commits

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `style:`, `refactor:`, `docs:`, `test:`, `chore:`. The
subject says what changed. The body, when there is one, says why.

## Before you open a pull request

1. Bump `version` in `plugins/session-usage-band/.claude-plugin/plugin.json`,
   following [Semantic Versioning](https://semver.org/).
2. Add an entry to `plugins/session-usage-band/CHANGELOG.md`.
3. Update the plugin's README if the band reads differently.
4. Make sure validate, test, the type check and the views gate all pass.

After merge, the maintainer tags the release with
`claude plugin tag plugins/session-usage-band`.

## Pull requests

Keep a pull request to one change, and fill in the template's checklist.
For anything visual, include a screenshot of the desktop band, collapsed
and expanded.
