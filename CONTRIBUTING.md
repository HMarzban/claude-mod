# Contributing

Thanks for helping. This file covers the development loop, the rules the
code follows, and what a pull request needs.

## Development loop

You need Claude Code with mods (function-hooks plugins). Tests and checks
run locally; nothing here needs network access or an API key.

```bash
# Check the marketplace index and the plugin
claude plugin validate .
claude plugin validate plugins/nextcost

# Run the tests
claude plugin test plugins/nextcost

# Run only some test files, by name glob (the red and green steps)
tools/test-only.sh view-pulse 'golden-*'

# Type-check (after the engine has laid the types, see below)
npx -y -p typescript@5 tsc -p plugins/nextcost

# The views gate: no layout but chips formats or reads a raw fact
tools/views-gate.sh
```

The type check reads the engine's API types from
`plugins/nextcost/.claude-plugin/types/`. The engine writes them
the first time it loads the plugin from its folder, for example with
`claude --plugin-dir plugins/nextcost`. They're generated, so
they're git-ignored. Neither `claude plugin test` nor `validate` writes
them, and loading needs a signed-in session, so CI can't type-check: run it
locally before you open a pull request.

CI runs every check twice: on the latest Claude Code, and on a pinned
version last known good (`matrix.claude-code` in `.github/workflows/ci.yml`).
It also runs nightly, so a new release that breaks the band shows within a
day. Red on latest alone means a Claude Code release changed something:
fix the band or its tests for it, then bump the pin to that release, in
`ci.yml` and in both READMEs' Install sections, which name the pinned
version. Red on both means the change itself.

To see a change live, add your clone as the marketplace and install from
it. From the clone's parent folder:

```bash
claude plugin marketplace add ./nextcost
claude plugin install nextcost@hossein-mods
```

Then, after each edit, bump `version` in
`plugins/nextcost/.claude-plugin/plugin.json`; an update at the
same version doesn't reinstall. Any higher number works locally; set the
real one ([step 1](#before-you-open-a-pull-request)) before you open the
pull request. After each bump, run:

```bash
claude plugin marketplace update hossein-mods
claude plugin update nextcost@hossein-mods
```

Run `/reload-plugins` in your session afterwards.

## How the code is laid out

| File | Role |
| --- | --- |
| `hooks/register.tsx` | The hooks. The only module that touches the engine (`$`). |
| `hooks/command.ts` | What `/nextcost` answers and how it reads its arguments. Pure: `register.tsx` runs it. |
| `hooks/snapshot.ts` | The snapshot and actions: the one contract between `register.tsx` and the drawing. |
| `hooks/band.tsx` | `drawBand(elements, snapshot, actions)`: a pure function from a snapshot to a tree. It builds the kit and the readings, draws the chosen layout, and falls back to chips. |
| `hooks/kit.tsx` | The drawing kit made once per draw: elements, the Svg gate, palette, measure, hover cards, gaps and air, icons, and `svg`, which builds every Svg. |
| `hooks/reading.ts` | `readingsOf`: everything a view reads, built once per draw. Each section's facts, with its words from `words.ts`. |
| `hooks/words.ts` | The phrasebook: every phrase a layout draws, built from the facts, so amber, pace, resets, empty states and alt text read the same everywhere. It holds the departures board's words too: statuses, short forms, remarks and alt sentences. |
| `hooks/views/view.ts` | `View` (the rows it declares, its `collapsed` row and what it `open`s) and `rowsOf`. |
| `hooks/views/index.ts` | `VIEWS`: every layout by name. |
| `hooks/views/cards.tsx` | `openBody`, chips' open view: its four cards, on the shell in `shell.tsx`. Chips' alone; pulse and departures import nothing from it. |
| `hooks/views/shell.tsx` | The card family chips' and pulse's open views share: which cards there are and their marks, a card's ground and edge, its title and headline, its fact rows, how many cards a line holds, their grid, and the alert drawn where none fits. |
| `hooks/views/frame.tsx` | What all three layouts share: `drawView` (a view's collapsed row with the toggle, and while open what opens beneath it), `bodyRowsFor`, the `footer` (Collapse, Hide band, the hint and the strip's place), and the lines pulse and departures squeeze to fit (`line`, `fitLine`). |
| `hooks/views/<name>.tsx` | One file per layout: `chips`, `pulse` and `departures`. Chips draws its pills and the cache's battery, and exports its pill builders, their hover strings, `LIMITS` and its pill row for its tests. |
| `hooks/views/pulse-open.tsx` | Pulse's open view: four cards on the shared shell, each with its chart, and their give-way. |
| `hooks/views/departures-board.tsx` | Departures' open board: its ground, its header (`DEPARTURES` and the time now), the quiet headings, a line per reading in aligned columns, their give-way, and the footer every layout draws. |
| `hooks/flaps.tsx` | The split-flap tiles departures draws: one Svg per reading on the desktop, a coloured run of text in the terminal; the open board's flap columns, its rules and the height its lines take. |
| `hooks/strip.tsx` | The workspace strip: project, branch or worktree, changes, ahead/behind. |
| `hooks/charts.tsx` | The charts: `meter`, `splitBar`, `sparkline`, `barChart`, `dayCells`, `heartbeat`, `track`, `braille`. Each is an Svg on the desktop and text elsewhere. |
| `hooks/glyphs.ts` | The terminal's glyph tier (`NEXTCOST_GLYPHS`, a CJK locale) and the ASCII mapping. |
| `hooks/calendar.ts` | The day and hour cells pulse draws, read off the limit samples. |
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
| `tests/golden/` | Chips' frozen trees and the tests that hold chips to them; see the rule below. |
| `tools/test-only.sh` | Runs only the tests whose names match the globs given, against a scratch copy of the plugin. |
| `tools/scratch.sh` | `scratch_plugin`, which `test-only.sh` and the demo build source: a scratch copy of the plugin without its tests. |
| `tools/views-gate.sh` | The views gate, run in CI: fails when a layout's view formats or reads a raw fact, or a hook other than `kit.tsx` writes an `<svg>` root. |
| `tools/demos/build.sh` | Rebuilds every demo and the site from the band's own output; see `tools/demos/README.md`. |

## Rules the code follows

- **`$` stays in `register.tsx`.** The engine refuses it anywhere else.
  Everything the band shows reaches `band.tsx` through the snapshot. Each
  call is spelled out at its site with literal names, `$.env.get('LANG')`,
  never through a helper that loops over names: the engine reads the calls
  to list what a module touches, and refuses to load one it can't.
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
  its piece and covers whole pieces: its text, then the rest of any piece it
  enters, never part of one. A control the card may reach, like the band's
  ▵, comes after it.
- **A line that may be cut is `kit.oneLine`**, never a Text with
  `wrap="truncate-end"`. The surface's cut ends in `…`, which a CJK
  terminal draws two columns wide, so the ascii tier clips the line to its
  row instead.
- **A Button holds text alone.** It has no icon prop and no children but its
  label, so a button's icon is a glyph.
- **Every program the band runs is named in full where it runs.** Each
  `$.process.run` call spells out its command as a fixed list, never an
  argv handed through a helper, so a reader and the plugin directory's checks
  see the program at its call. A new command, or a new hook, goes in the
  plugin README's *What it runs, reads and sends* and in `SECURITY.md` in the
  same pull request: the directory holds a mod for review until its README
  says what it runs and what each hook does.
- **Atoms are declared in `register.tsx`.** They are the band's state in the
  engine's store, and they belong with the hooks that read and write them.
- **Colour is never the only signal.** Escalation also adds words or
  `!` / `!!`. Text meets WCAG AA contrast (4.5:1) and edges and tracks meet
  3:1, in every palette. The design tests check both, over every palette.
- **A new layout** is: its name in `LAYOUT_NAMES` (`hooks/snapshot.ts`);
  `hooks/views/<name>.tsx`, which declares its `collapsed` row and what it `open`s, and shares only `views/frame.tsx` (`drawView` puts the two together; `bodyRowsFor`, `footer`, `line` and `fitLine`) and, for cards, `views/shell.tsx`; an entry in `VIEWS`
  (`hooks/views/index.ts`); and `tests/view-<name>.test.ts`, which calls
  `viewSuite('<name>')`. It draws only words from `read`: outside
  `chips.tsx`, no `.tsx` file in `views/`
  contains `.raw`, `.reading.`, `Date.parse`, `.replace(`, `Math.round` or
  an import of `../format`. `tools/views-gate.sh` checks, and also that a pulse or departures file
  imports nothing from `./cards` or `./chips` and draws no pill, battery or
  meter, since those layouts keep their own look. Then add it to the
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
  trees it draws as its 0.13 board does, its open view the cards every
  layout shares: dark and plain, desktop and terminal, at 40, 95 and 200
  columns, shut and open; and every frame's hover cards to whole pieces.
  A clock time is the host's zone's, which the kit can't pin, so the hash
  reads every clock time alike (`tests/golden/hash.ts`); the readings' tests
  hold each to its zone. No tool recaptures the trees, so a change meant to
  alter what chips draws re-freezes them by hand: update the failing keys
  in `tests/golden/chips.ts` to the hashes the failures print. For a key
  also held in `GOLDEN_TREES`, replace its whole tree too: log
  `JSON.stringify(canon(tree))` for that key in `tests/golden/suite.ts`,
  paste the output in, and drop the log. Say why in the pull request.

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

1. Bump `version` in `plugins/nextcost/.claude-plugin/plugin.json`,
   following [Semantic Versioning](https://semver.org/).
2. Add an entry to `plugins/nextcost/CHANGELOG.md`.
3. Update the plugin's README if the band reads differently, and its *What
   it runs, reads and sends* and `SECURITY.md` if it runs, reads or hooks
   anything new.
4. Make sure validate, test, the type check and the views gate all pass.

After merge, the maintainer tags the release with
`claude plugin tag plugins/nextcost`.

nextcost is submitted to Anthropic's plugin directory, which follows
`main`: GitHub tells it of each push, and it scans what it finds. Since
nextcost is a mod, every new version waits for an Anthropic reviewer before
it goes live there, so a release reaches the directory later than the
marketplace install. A change to what the band runs, reads or hooks without
the README saying so holds that version back.

## Pull requests

Keep a pull request to one change, and fill in the template's checklist.
For anything visual, include a screenshot of the desktop band, collapsed
and expanded.
