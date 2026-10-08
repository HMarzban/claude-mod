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
they're git-ignored.

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
| `hooks/band.tsx` | `drawBand(elements, snapshot, actions)`: a pure function from a snapshot to a tree. |
| `hooks/cache.ts` | The prompt-cache model: TTL, misses, re-warm and savings estimates. |
| `hooks/insights.ts` | Last message cost and the 5-hour pace. |
| `hooks/format.ts` | Numbers, times, thresholds and escalation marks. |
| `hooks/palette.ts` | The dark, light and plain palettes. |
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
- **SVG ids are unique per drawing.** Svgs can share a page, and a repeated
  id resolves to the first.
- **A hover card has no key.** A keyed Box is its own hover scope, and a
  hidden one could never be hovered.
- **Colour is never the only signal.** Escalation also adds words or
  `!` / `!!`. Text meets WCAG AA contrast (4.5:1) and edges and tracks meet
  3:1. The design tests check both.
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
