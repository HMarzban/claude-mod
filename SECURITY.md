# Security

## What the plugin can reach

session-usage-band runs inside Claude Code's mod environment, with no DOM,
no Node and no network of its own. It only reaches what the engine hands
it:

- **Reads** the session's usage (cost, token counts, context fill and rate
  limits), the clock, the session's project root and repository root, and
  these environment variables: `HOME`, `CC_BAND_APPEARANCE`, `NO_COLOR`,
  `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` and
  `FORCE_PROMPT_CACHING_5M`.
- **Runs** two read-only git commands in the project root, for the
  workspace strip, exactly:
  - `git -c core.fsmonitor=false --no-optional-locks status --porcelain=v2 --branch`
  - `git rev-parse --path-format=absolute --git-dir --git-common-dir --show-toplevel`

  They run at session start, after each of your messages, on a new
  conversation and when you open the cards. They never run while the band
  draws, and they have a 3-second timeout. The engine runs git with
  repository hooks off. `core.fsmonitor=false` stops git from starting a
  program a repository's own config names, and `--no-optional-locks` keeps
  it from taking the index lock. The plugin runs no other command, though
  git itself still honours the rest of your git configuration.
- **Writes** two values to the session's own state: whether the band is
  hidden, and whether it's expanded.
- **Never** writes files, calls a model, or sends anything anywhere.

`claude plugin validate plugins/session-usage-band` lists every read and
write the module makes, so you can check this yourself.

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please don't open a public issue. Use your host's private vulnerability
reporting for this repository, such as GitHub's "Report a vulnerability"
on the Security tab. Include what you found, how to reproduce it, and the
plugin and Claude Code versions. You'll get a reply within a week.
