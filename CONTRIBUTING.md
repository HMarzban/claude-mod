# Contributing

Thanks for helping. This file covers the development loop, the rules the
code follows, and how a change ships.

## Development loop

You need Claude Code with mods (function-hooks plugins). Tests and checks
run locally; nothing here needs network access or an API key.

```bash
# Check the manifest and what the module hooks and calls
claude plugin validate plugins/session-usage-band

# Run the tests
claude plugin test plugins/session-usage-band

# Type-check (after the engine has laid the types, see below)
npx -p typescript@5 tsc -p plugins/session-usage-band
```

The type check reads the engine's API types from
`plugins/session-usage-band/.claude-plugin/types/`. The engine writes them
the first time it loads the plugin from its folder, for example with
`claude --plugin-dir plugins/session-usage-band`. They're generated, so
they're git-ignored. Neither `claude plugin test` nor `validate` writes
them, and loading needs a signed-in session, so CI can't type-check: run it
locally before you open a pull request.

To see a change live, install the plugin from your clone (see the
[README](README.md#install)). Then, after each edit:

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
| `hooks/band.tsx` | `drawBand(elements, snapshot, actions)`: a pure function from a snapshot to a tree; the chips and the cards. |
| `hooks/kit.tsx` | The drawing kit made once per draw: elements, the Svg gate, palette, measure, hover cards, gaps, icons. |
| `hooks/strip.tsx` | The workspace strip: project, branch or worktree, changes, ahead/behind. |
| `hooks/reading.ts` | Pure readings of the snapshot: the cache's mood and every word about it, the context's fill, a limit's tone. |
| `hooks/layout.ts` | Give-way orders, sizes, and how many columns a drawn tree takes. |
| `hooks/icons.ts` | The icons' SVG bodies, glyphs and names. |
| `hooks/cache.ts` | The prompt-cache model: TTL, misses, recall, re-warm and savings estimates, and the cache's view for the band. |
| `hooks/insights.ts` | Last message cost and the 5-hour pace. |
| `hooks/format.ts` | Numbers, times, thresholds and escalation marks. |
| `hooks/palette.ts` | The dark, light and plain palettes, and the colours for the band's bare ground. |
| `hooks/workspace.ts` | The workspace strip's git state and path, parsed from git's output. |
| `hooks/memory.ts` | What the band remembers across sessions, and what it reads off a transcript's end. |
| `types/index.d.ts` | The plugin's state contract. |
| `tests/` | Tests, one file per area, with shared helpers in `helpers.ts`. |

## Rules the code follows

- **`$` stays in `register.tsx`.** The engine refuses it anywhere else.
  Everything the band shows reaches `band.tsx` through the snapshot.
- **Never name a local variable `h`.** JSX compiles to the global `h()`.
- **No whitespace-only string children on the desktop.** It drops them, so
  a gap there is a spacer `Box`. Text surfaces keep their spaces.
- **Svg is desktop-only.** Other surfaces hold the element but draw
  nothing, so every Svg sits behind the `surface === 'desktop'` check.
- **No SVG names an id.** Svgs can share a page, where a repeated id
  resolves to the first, so a drawing rounds its own ends rather than clip.
- **A hover card has no key.** A keyed Box is its own hover scope, and a
  hidden one could never be hovered.
- **A Button holds text alone.** It has no icon prop and no children but its
  label, so a button's icon is a glyph.
- **Atoms are declared in `register.tsx`.** They are the band's state in the
  engine's store, and they belong with the hooks that read and write them.
- **Colour is never the only signal.** Escalation also adds words or
  `!` / `!!`. Text meets WCAG AA contrast (4.5:1) and edges and tracks meet
  3:1, in every palette. The design tests check both, over every palette.
- **Test first.** Write the failing test, watch it fail, then make it pass.

## Commits

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/):
`feat:`, `fix:`, `style:`, `refactor:`, `docs:`, `test:`, `chore:`. The
subject says what changed. The body, when there is one, says why.

## Shipping a change

1. Bump `version` in `plugins/session-usage-band/.claude-plugin/plugin.json`,
   following [Semantic Versioning](https://semver.org/).
2. Add an entry to `plugins/session-usage-band/CHANGELOG.md`.
3. Update the plugin's README if the band reads differently.
4. Make sure validate, test and the type check all pass.
5. Tag the release with `claude plugin tag plugins/session-usage-band`.

## Pull requests

Keep a pull request to one change, and fill in the template's checklist.
For anything visual, include a screenshot of the desktop band, collapsed
and expanded.
