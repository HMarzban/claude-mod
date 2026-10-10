# session-usage-band

One calm row above the Claude Code prompt that answers: is my cache still
warm, what is this session costing, and am I close to a limit?

```
◷ cache 52m   $3.19   Σ 225k   ◔ ██░░░░ 76k / 200k   5h ░░░░░░ 4% │ ↻ 3h 00m   7d ██░░░░ 30% │ ↻ 2d 19h   ▿
```

On the desktop app's Code tab the glyphs are small icons, and the bars are
drawn as SVG meters:

![The band expanded on the desktop: chips for the cache, cost, context and the 5h and 7d limits, then the Cache, Spend, Context and Limits cards, the project path and branch, and the Collapse and Hide band buttons](https://raw.githubusercontent.com/HMarzban/claude-mod/main/docs/band-expanded.png)

Try every state live on the [website](https://hmarzban.github.io/claude-mod/),
and see the [changelog](CHANGELOG.md) for what changed in each version. Found
something off? [Open an issue](https://github.com/HMarzban/claude-mod/issues/new?template=bug_report.yml).

## Reading it

![The chip row, labelled: the cache countdown and what a re-warm will cost, the session cost, context toward auto-compaction, the 5-hour limit with its pace, the weekly limit and its reset, and the toggle that opens the cards](https://raw.githubusercontent.com/HMarzban/claude-mod/main/docs/band-anatomy.png)

| Chip | Shows | Turns amber when |
| --- | --- | --- |
| Cache | A battery that drains as the cache ages, and the time until it goes cold; `cache warm` while Claude is working, `cache warming` before a new conversation's first reply, `cache –` when the band loaded mid-conversation and hasn't measured it yet | Its last minute: `0:47 left · re-warm ~$0.52` |
| Cost | The session's total so far | Never |
| Tokens | Every token this conversation used | Never |
| Context | How full the conversation is toward auto-compaction (`63% full`), or of the model window when compaction is off | Near compaction: `95% full · compacts in ~8k`. Without auto-compaction: 80% (`!`), 95% (`!!`) |
| 5h | Your 5-hour limit: usage on a bar with a thumb at the fill's end, and the reset | 80%, or when your pace would fill it before it resets: `full in ~40m` |
| 7d | Your weekly limit, the same way | 80% |

A bar carries one number, the one beside it, with a thumb where its fill
ends. Pace is in words, on the chip when it matters and in the Limits card
always.
Once a window's reset time has passed, its chip says `reset` until the next
reply brings a fresh reading.

Amber means act soon. The 5h and 7d chips are tinted green and purple so
you can tell them apart; that's a label, not a warning. Nothing is ever
red: a cold cache or a full meter is a price, not an error. Colour is
never the only signal, since escalation always adds words or `!` / `!!`.

Hover any chip for a one-line explanation. `▿` opens the expanded view.
It starts with a line that says where you are:

```
~/workspace/claude-mod · on main                              3 changed · ↑2 ↓1
```

| Piece | Shows |
| --- | --- |
| Path | The project, home as `~`, its folder in bold |
| Branch | The git branch, or `detached at <commit>` |
| Worktree | `worktree of <repo>` in a linked worktree |
| Changes | Files with uncommitted changes, or `clean` |
| Ahead / behind | Commits to push (`↑`) and to pull (`↓`), only when there are any |

On the desktop each piece has an icon and a hover explanation. As the line
narrows, the path and branch shorten and the extras drop, least important
first. When the band is too short to give it a row of its own, it moves
to the footer, beside the buttons, in place of the hint. Outside a
repository, or if git is missing or slow, it shows the path alone. git is read when the session starts, after each of your
messages and when you open the cards, never while the band draws.

Then come four cards with every fact labelled:

| Card | Shows |
| --- | --- |
| Cache | Time left on a bar, what a re-warm would cost if it went cold, what the cache has saved, the hit rate, how long it lasts idle, unexpected rebuilds |
| Spend | The session total, a bar of the token split with its legend (input, output, cache reads), your last message |
| Context | How full toward auto-compaction, tokens in context, where compaction runs, room left, the model window |
| Limits | The window closest to its limit, then each window (5h, 7d, a gateway's spend limit) with its bar and value, its reset and its pace in words: `on pace for ~50%` or `full before reset` |

The cards sit four across when they fit, else two by two, each line sharing
its width equally; on the desktop each has a visible border. A card's title
and headline share its first line, and when the band is short of rows each
card drops its bar first (the chips already show it), then its least important facts, so the view never scrolls the
buttons away. Expanding never changes the chip row; only the toggle's icon turns from `▿` to `▵`.
Below the cards, `Collapse` (key `c`) closes them and `Hide band` (key `h`)
hides the band; `/usage-band` brings it back.

## When the band is narrow

Chips' row stays on one line. As it narrows, pieces give way in this
order: the tokens chip, the 7d reset time, the 5h reset time, the context
meter, a calm 7d chip, the limit bars, long wording, a calm context chip,
then a calm 5h chip. An amber chip keeps its words longest; its reset time
is the very last thing to go. Below about 55 columns, with several chips
amber at once, the end of the row is clipped rather than wrapped.

## Layouts

Chips is one of nine layouts. The other eight show the same readings in
another shape, on a filled panel (bare in `plain`), and each opens with `▿`
to its own view of every fact, under the same workspace line and buttons.

| Layout | Shows | Rows (desktop / terminal) |
| --- | --- | --- |
| `chips` | The row of chips above, and four cards behind `▿`; the default | 1 / 1 |
| `gauges` | Two rows of labelled bars: the cache's time left, context up to compaction, and the 5h and 7d limits with a tick for how much of each window has gone | 2 / 2 |
| `ledger` | The band in words alone, `·`-separated, with `! ` leading what needs you | 1 / 1 |
| `rings` | A ring per reading, its value over its label, with a dot on each limit for how much of the window has gone; the terminal draws a bar | 2 / 1 |
| `pulse` | Trends rather than totals: each message's cost as bars, and which way the 5-hour limit is heading | 2 / 1 |
| `tiles` | Each reading as a bold value over a small label, with a thin underline on the desktop | 2 / 2 |
| `week` | Where your limits went: the weekly limit as day cells and the 5-hour limit as hour cells, each filled to its rise | 2 / 2 |
| `departures` | A split-flap board: the cache `DEPARTS` at its clock time, and its last minute is `LAST CALL` | 1 / 1 |
| `forecast` | The band read like the weather: now, then up to three changes ahead at their clock times, soonest first | 2 / 1 |

```
/usage-band layout pulse    # draw pulse; /usage-band layout chips goes back
/usage-band layout          # name the layout in use and list them all
```

The choice is kept in the plugin's store, so every session draws it, and
one already open switches after its next reply. Choosing a layout shows a
hidden band. Below 40 columns every layout draws chips. On the desktop with
`CC_BAND_APPEARANCE=plain` there are no SVG charts, so a layout draws as
text and takes its terminal rows.

Pulse and week draw their charts in braille in the terminal, always beside
their numbers. Week's cells come from a week of 5h and 7d readings the band
keeps in its store, at most one per 15 minutes, so they cover the days
before this session.

### Glyphs in the terminal

```bash
CC_BAND_GLYPHS=ascii     # ASCII alone
CC_BAND_GLYPHS=unicode   # the band's own glyphs, even in a CJK locale
```

A terminal in a CJK locale draws some of the band's glyphs (`█ │ · Σ …`)
two columns wide where the band counts one, so the row runs past the
window's edge, and so does a terminal set to draw ambiguous-width
characters wide. In a CJK locale (the first of `LC_ALL`, `LC_CTYPE` and
`LANG` that is set starts with `ja`, `zh` or `ko`) the band draws ASCII by
itself. The terminal setting can't be detected, so set
`CC_BAND_GLYPHS=ascii` if you use it, and with a screen reader, which reads
braille as dots. In ASCII each glyph becomes one character or is dropped
(`█` is `#`, `▿` is `v`, `◷` goes), and braille charts give way to their
numbers. It applies to every layout, chips included, and only in the
terminal.

### Clock times

Week, departures and forecast name clock times in your local zone. The band
reads the zone's offset from UTC off the clock when the session starts and
after each reply, so a change of zone shows by the next reply. Where it
can't be read, week names its days and hours in UTC, and its reset, like
every time on departures and forecast, says how long until it comes rather
than when (`in 52m`, not `14:32`).

## The cache countdown

Claude Code caches the conversation server-side. While the cache is warm,
re-reading the conversation costs a tenth of the normal input price or
less, depending on the model (a twentieth on Opus 5.5 and Sonnet 5.5, a
fortieth on Fable and Mythos 5.1). It
stays warm for a lifetime (5 minutes or an hour) counted from the last
request. Go idle past that, and the next message rebuilds the whole
conversation at the cache-write price.

The band never suggests sending a message to keep the cache warm. That
would mean burning tokens to avoid burning tokens.

A compaction or a model switch rebuilds the cache on purpose, so neither
counts as an unexpected rebuild.

## Reopening an old session

A session the band hasn't seen a reply in yet, because you reopened it or
the band reloaded, still says what the cache is doing and what it has cost.

When you resume a session (`claude --resume`, `/resume`, or a past session
opened in the desktop app) or fork one, Claude Code says how long it has
been idle, whether its cache has likely expired, and what re-caching it
would cost. The band takes its word: the countdown runs from that idle
time, the cache reads cold when Claude Code says it has likely expired, and
the price shown is Claude Code's own. The band also reads the session's
transcript once, never while it draws, for two more facts:

- What the session spent before you resumed it: its last cost record, and
  each reply logged after it, priced at its model's rate in that record.
  The cost shows that plus what you've spent since resuming, or Claude
  Code's own total if it is larger; the two totals are never added. The
  tokens chip and the Spend card's breakdown count from it too, rather than
  waiting for your next message.
- How long the cache was last written for: an hour or 5 minutes, from the
  last reply in the main conversation that wrote to it. Until the band's
  first reply, the Cache card says `1h idle` or `5m idle` with no
  `· assumed`. A lifetime set in the environment still wins.

Where Claude Code doesn't say, or the band reloaded, it recalls when the
session's last reply was and what a token costs on its model:

- from its own memory, which keeps each session's last reply (the newest 50)
  and the price per token it solved for each model
- for a session from before the band, from the end of that session's
  transcript, read once: the last reply's time and the cost record's
  dollars and tokens

Past the cache's lifetime it shows `cache cold · next message ~$2.34`, the
cost of writing the whole context to the cache again. Within it, the
countdown runs from the last reply. With no price known for the model yet,
it names the tokens instead. With nothing to recall, it stays at `cache –`.

## What a cold cache costs

No pricing table is reachable from a mod, so the rate is solved from the
session's own bill. Each kind of token costs a fixed multiple of base input
(a cache write 1.25×, output 5×, a cache read 0.1×, or 0.05× on Opus 5.5
and Sonnet 5.5 and 0.025× on Fable and Mythos 5.1, per
[Anthropic's pricing](https://platform.claude.com/docs/en/about-claude/pricing)),
which leaves one unknown:

```
cost = r × (uncached + 1.25×written + read multiple×read + 5×output)
```

Solve for `r`, then price the re-warm as a cache write of the whole
conversation. After a compaction, it prices the summary instead. It's
always shown with `~`.

- **Writes at 1.25×, as Claude Code counts them.** Claude Code's cost
  ledger prices every cache write at 1.25×, so the band does too and agrees
  with the cost it shows. Anthropic bills a 1-hour cache write at 2×, so if
  you pay per token on a 1-hour cache, the real re-warm is up to 1.6× the
  estimate. Paying per token usually means the 5-minute cache, where 1.25×
  is exact.
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

Each fires once per crossing. The 5h chip also turns amber when your pace
would fill it before it resets; that has no toast, since the projection
moves with every reading.

## Appearance

```bash
CC_BAND_APPEARANCE=dark    # default: filled pills tuned for dark themes
CC_BAND_APPEARANCE=light   # filled pills tuned for light themes
CC_BAND_APPEARANCE=plain   # no backgrounds; every colour a theme key
```

`NO_COLOR` forces `plain`. `plain` has no hover cards and no SVG icons, since
the expanded cards carry the same facts.

## Commands

| Command | Effect |
| --- | --- |
| `/usage-band` | Toggle visibility |
| `/usage-band more` / `less` | Open or close the cards |
| `/usage-band show` / `hide` | Set visibility explicitly |
| `/usage-band layout <name>` | Draw the band in another [layout](#layouts), for every session; without a name, list them |

## Cache lifetime

The default lifetime depends on billing: an hour on a subscription within
plan usage, five minutes on usage credits or an API key. A mod can't read
which applies, so the band assumes an hour and says `· assumed`. If it
then sees the cache rebuild after a gap longer than five minutes, with the
same model, it corrects itself to `5m`. On a resumed session, the
transcript's last cache write says which until the band's first reply (see
[Reopening an old session](#reopening-an-old-session)).

To remove the guess, set one of:
- `CLAUDE_CODE_PROMPT_CACHE_TTL=5m` or `1h`
- `FORCE_PROMPT_CACHING_5M=1`
- `ENABLE_PROMPT_CACHING_1H=1`

## Install

```bash
claude plugin install session-usage-band --marketplace HMarzban/claude-mod
```

Then start a new session, or run `/reload-plugins` in an open one. Before
Claude Code 2.1.292, add the marketplace first
(`claude plugin marketplace add HMarzban/claude-mod`), then
`claude plugin install session-usage-band@hossein-mods`.

It needs Claude Code with mods (function-hooks plugins), and was tested on
2.1.295 in the terminal and the desktop app's bundled 2.1.289. It draws in the terminal and the desktop app's Code tab, which are
the surfaces with a band above the prompt. WSL sessions don't load plugins.
The [repository README](https://github.com/HMarzban/claude-mod/blob/main/README.md) covers installing inside a session or for a whole team, updating and uninstalling.

## Developing

```bash
claude plugin validate plugins/session-usage-band
claude plugin test plugins/session-usage-band
npx -y -p typescript@5 tsc -p plugins/session-usage-band
```

[CONTRIBUTING.md](https://github.com/HMarzban/claude-mod/blob/main/CONTRIBUTING.md) has the full loop and the rules the
code follows.

Only `hooks/register.tsx` touches the engine (`$`). It reads a snapshot
(`hooks/snapshot.ts`) for `hooks/band.tsx`, a pure drawing function, which
turns it into readings (`hooks/reading.ts`, its words from
`hooks/words.ts`) and draws the chosen layout from `hooks/views/`. Every
layout but chips draws those words and formats nothing itself. The cache
model, insights, memory, formatting, workspace and palettes are plain
modules. The tests drive the band through the engine's test kit, and test
the plain modules directly.

## Help make it better

Seen a wrong number, a chip that wraps, or something you'd want the band
to show? [Report a bug](https://github.com/HMarzban/claude-mod/issues/new?template=bug_report.yml) or [suggest a feature](https://github.com/HMarzban/claude-mod/issues/new?template=feature_request.yml); a screenshot
of the band helps most. Pull requests are welcome too.
