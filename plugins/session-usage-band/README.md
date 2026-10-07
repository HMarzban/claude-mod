# session-usage-band

One calm row above the Claude Code prompt that answers: is my cache still
warm, what is this session costing, and am I close to a limit?

```
◷ cache 52m   $3.19   Σ 225k   ◔ ██┃░░░ 76k / 200k   5h ░░┃░░░ 4% │ ↻ 3h 00m   7d ██░┃░░ 30% │ ↻ 2d 19h   ⋯
```

On the desktop app's Code tab the glyphs are small icons, and the bars are
drawn as SVG meters.

## Reading it

| Chip | Shows | Turns amber when |
| --- | --- | --- |
| Cache | A battery that drains as the cache ages, and the time until it goes cold; `cache warm` while Claude is working | Its last minute: `0:47 left · re-warm ~$0.52` |
| Cost | The session's total so far | Never |
| Tokens | Every token this conversation used | Never |
| Context | Tokens in the window, with a tick where auto-compaction runs | Near compaction: `compacts in ~8k`. Without auto-compaction: 80% (`!`), 95% (`!!`) |
| 5h | Your 5-hour limit: usage, a tick at the share of the window gone, and the reset | 80%, or when your pace would fill it before it resets: `full in ~40m` |
| 7d | Your weekly limit, the same way | 80% |

The tick on a limit bar is the clock: a bar behind its tick is a pace that
lasts the window, and a bar past it is one that runs out early. Once a
window's reset time has passed, its chip says `reset` until the next reply
brings a fresh reading.

Amber means act soon. The 5h and 7d chips are tinted green and purple so
you can tell them apart; that's a label, not a warning. Nothing is ever
red: a cold cache or a full meter is a price, not an error. Colour is
never the only signal, since escalation always adds words or `!` / `!!`.

Hover any chip for a one-line explanation. `⋯` opens four cards with
every fact labelled:

| Card | Shows |
| --- | --- |
| Cache | Time left on a bar, how much input came from the cache, the lifetime, unexpected rebuilds, model calls |
| Spend | The session total, a bar of the token split, your last message, tokens sent, back and from cache |
| Context | Used of the window on a bar with the compaction tick, where auto-compaction runs, tokens to go |
| Limits | Each window (5h, 7d, a gateway's spend limit) with its usage, bar, pace tick and reset |

The cards wrap onto two rows when the band is narrow. Below them, `⌃ Collapse`
(key `c`) closes them and `Hide band` (key `h`) hides the band.

## When the band is narrow

The row stays on one line. As it narrows, pieces give way in this
order: the tokens chip, the 7d reset time, the 5h reset time, the context
meter, a calm 7d chip, the limit bars, long wording, a calm context chip,
then a calm 5h chip. An amber chip keeps its words longest; its reset time
is the very last thing to go. Below about 55 columns, with several chips
amber at once, the end of the row is clipped rather than wrapped.

## The cache countdown

Claude Code caches the conversation server-side. While the cache is warm,
re-reading the conversation costs a tenth of the normal input price. It
stays warm for a lifetime (5 minutes or an hour) counted from the last
request. Go idle past that, and the next message rebuilds the whole
conversation at the cache-write price.

The band never suggests sending a message to keep the cache warm. That
would mean burning tokens to avoid burning tokens.

A compaction or a model switch rebuilds the cache on purpose, so neither
counts as an unexpected rebuild.

## What a cold cache costs

No pricing table is reachable from a mod, so the rate is solved from the
session's own bill. Anthropic models hold fixed ratios between their rates
(a cache write 1.25× base input, a cache read 0.1×, output 5×), which
leaves one unknown:

```
cost = r × (uncached + 1.25×written + 0.1×read + 5×output)
```

Solve for `r`, then price the re-warm as a cache write of the whole
conversation. After a compaction, it prices the summary instead. It's
always shown with `~`.

- **Known limitation:** a 1-hour cache bills writes at 2×, not 1.25×. The
  estimate partly corrects itself through the solved rate, but it's still
  an estimate on top of the client-side cost Claude Code computes.
- **After `/clear`, a resume or a reload,** the rate is solved from what
  the current conversation has spent, not the session's whole ledger.

## Your pace on the 5-hour limit

The band records your 5-hour usage as it moves. Once it has at least 10
minutes and a 2-point rise to go on, it projects when you'd hit 100%,
using the last 30 minutes. If that's before the limit resets, the chip
says so. The limit is shared across all your Claude use, so the pace
includes your other sessions and devices, and `/clear` keeps it. The
projection hides once its newest reading is more than 15 minutes old.

## Toasts

A toast speaks where a chip turns amber:
- the 5-hour limit at 80% and 95%
- context within 10% of auto-compaction, or at 80% and 95% when
  auto-compaction is off

Each fires once per crossing.

## Appearance

```bash
CC_BAND_APPEARANCE=dark    # default: filled pills tuned for dark themes
CC_BAND_APPEARANCE=light   # filled pills tuned for light themes
CC_BAND_APPEARANCE=plain   # no backgrounds; every colour a theme key
```

`NO_COLOR` forces `plain`. `plain` has no hover cards and no SVG icons, since
the second line carries the same facts.

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
then sees the cache rebuild after a gap longer than five minutes, with the
same model, it corrects itself to `5m`.

To remove the guess, set one of:
- `CLAUDE_CODE_PROMPT_CACHE_TTL=5m` or `1h`
- `FORCE_PROMPT_CACHING_5M=1`
- `ENABLE_PROMPT_CACHING_1H=1`

## Install

```bash
claude plugin marketplace add /path/to/claude-mod
claude plugin install session-usage-band@hossein-mods
```

It draws in the terminal, the desktop app's Code tab, VS Code and mobile.
WSL sessions don't load plugins.

## Developing

```bash
claude plugin validate plugins/session-usage-band
claude plugin test plugins/session-usage-band
```

Only `hooks/register.tsx` touches the engine (`$`). It reads a snapshot for
`hooks/band.tsx`, a pure drawing function. The cache model, insights,
formatting and palettes are plain modules with unit-level tests.
