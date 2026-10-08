# Security

## What the plugin can reach

session-usage-band runs inside Claude Code's mod environment, with no DOM,
no Node and no network of its own. It only reaches what the engine hands
it:

- **Reads** the session's usage (cost, token counts, context fill and rate
  limits), the clock, and these environment variables: `CC_BAND_APPEARANCE`,
  `NO_COLOR`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` and
  `FORCE_PROMPT_CACHING_5M`.
- **Writes** two values to the session's own state: whether the band is
  hidden, and whether it's expanded.
- **Never** reads or writes files, runs processes, calls a model, or sends
  anything anywhere.

`claude plugin validate plugins/session-usage-band` lists every read and
write the module makes, so you can check this yourself.

## Supported versions

Only the latest release gets fixes.

## Reporting a vulnerability

Please don't open a public issue. Use your host's private vulnerability
reporting for this repository, such as GitHub's "Report a vulnerability"
on the Security tab. Include what you found, how to reproduce it, and the
plugin and Claude Code versions. You'll get a reply within a week.
