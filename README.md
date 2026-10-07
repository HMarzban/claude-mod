# session-usage-band

A band above the Claude Code prompt showing what the current session is
spending, built around one question: *is my cache still warm?*

```
▏◷ cache 52m · hit 94%▏ ▏$2.41▏ ▏sent 196k · back 12k · cached 190k▏ ▏1h 12m▏  ctx ███░░░░░  38%
```

## The cache countdown

Claude Code caches the conversation prefix server-side. Cache reads bill well
below the normal input rate. The cache stays warm for a TTL — 5 minutes or an
hour — measured from the last response. Idle past it and your next message
re-reads the whole conversation at full price.

So the countdown is the one figure where what you do in the next minute changes
the bill. It gets the leftmost pill, the only colour in the band, and the only
icon. Everything else is a scoreboard.

It escalates by motion, not volume:

| State | Shows | Repaints |
| --- | --- | --- |
| Warm, over 10 min | `◷ cache 52m` | once a minute — effectively still |
| Warm, under 10 min | `◷ cache 4:10` | when the digits change |
| Expiring, under 60s | `◷ 0:47 · 38k (~$0.52) to re-warm` | every second, amber |
| Cold | `◷ cold · 38k (~$0.52) to re-warm` | still, neutral grey |

## What a cold cache costs

No pricing table is reachable from a mod, so the rate is solved from the
session's own bill rather than hard-coded. Anthropic models hold fixed ratios
between the four rates — a cache write is 1.25x base input, a cache read 0.1x,
output 5x — which leaves one unknown:

```
cost = r x (uncached + 1.25*written + 0.1*read + 5*output)
```

Solve for `r`, then price the re-warm as a cache write of the whole window. It
self-calibrates to whatever model and plan are in force and needs no updating
when prices change. It stays hidden until enough has been billed to solve from.

It is an estimate on top of an estimate — Claude Code's session cost is itself
computed client-side at list price — so it never appears without a `~`. Narrow
widths shorten the wording around it (`260k ~$2.01`) rather than dropping it.

The figure and the token count appear only when they're actionable. Cold is drawn neutral, never
red: a cold cache is a price, not an error, and alarming on it would only teach
you to ignore the pill. The band never suggests sending a message to keep the
cache warm — that would have you burn tokens to avoid burning tokens.

## Appearance

A filled pill needs its foreground and background from one source. A theme key
resolves against your theme; a hex does not. Mixing them gives a pill that is
legible on one theme and blank on the other — so the palette is declared, not
guessed. Nothing in the mods API reports whether your theme is light or dark.

```bash
CC_BAND_APPEARANCE=dark    # default, filled pills tuned for dark themes
CC_BAND_APPEARANCE=light   # filled pills tuned for light themes
CC_BAND_APPEARANCE=plain   # no backgrounds; every colour a theme key
```

`NO_COLOR` forces `plain`. Use `plain` on a custom theme, or if a pill ever
looks washed out.

Gauges use two block glyphs only (`█` `░`) in three theme-keyed severity bands,
never a hex gradient: a gradient needs 24-bit colour, is invisible at the green
end on light themes, and carries severity by hue alone. Every gauge has its
number beside it, and thresholds add `!` / `!!` so nothing depends on colour.

## Install

```bash
claude plugin marketplace add /path/to/claude-mod   # this folder, which holds .claude-plugin/marketplace.json
claude plugin install session-usage-band@hossein-mods
```

Draws in the terminal and in the Claude Desktop app's Code tab. Hooks run
everywhere, but the VS Code extension draws nothing and WSL sessions don't load
plugins at all.

## Commands

| Command | Effect |
| --- | --- |
| `/usage-band` | Toggle visibility |
| `/usage-band more` | Add the rate-limit and cache-detail rows |
| `/usage-band less` | Back to the single pill row |
| `/usage-band show` / `hide` | Set visibility explicitly |

`More` adds two rows: the rate-limit windows with their reset countdowns, and
the cache's own detail — TTL, hit rate, cold starts and request count.

## Cache TTL

The default TTL depends on billing — an hour on a subscription within plan
usage, five minutes on usage credits or an API key — and a mod can't read which
applies. The band assumes an hour and shows `1h?` while assuming. If it then
sees the cache rebuild after a gap longer than five minutes, it corrects itself
to `5m` and doesn't count that as a cold start.

Set `CLAUDE_CODE_PROMPT_CACHE_TTL` to `5m` or `1h` to remove the guess.
