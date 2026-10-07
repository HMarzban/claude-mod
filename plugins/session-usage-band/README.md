# session-usage-band

One calm row above the Claude Code prompt that answers: what is this
session costing, and is there anything I should do about it right now?

```
◷ cache 52m   $3.19 last $0.42   Σ 225k tokens   ◔ context ██░░░░ 76k / 200k   5h ░░░░░░ 4%   ⋯
```

## Reading it

| Pill | Shows | Turns amber when |
| --- | --- | --- |
| Cache | A battery that drains as the cache ages: time until it goes cold; `cache warm` while Claude is working | Its last minute: `0:47 left · re-warm ~$0.52` |
| Cost | The session's total (with a coin on desktop), and what your last message cost | Never |
| Tokens | Every token this conversation used; hover for sent, back and from cache | Never |
| Context | Tokens in the window, with a tick where auto-compaction runs | Near compaction: `compacts in ~8k` (without auto-compaction: 80% `!`, 95% `!!`) |
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
