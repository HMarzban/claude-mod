# Changelog

Every notable change to session-usage-band. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). Before 1.0.0, a minor
version may change how the band reads.

## [0.11.13] - 2026-10-10

### Changed
- The plugin README links the website, where every state of the band plays
  live, and names Fable and Mythos 5.1's cache-read share beside the others.
- Installing is one command: `claude plugin install session-usage-band
  --marketplace HMarzban/claude-mod`, which adds the marketplace on the way.
  The repository README adds installing inside a terminal session and for a
  whole team, and keeps the two-step form for Claude Code before 2.1.292.

### Fixed
- In the terminal, a chip's hover card drew under the chips after it, so it
  read in fragments between them, and a card from a chip mid-row was cut at
  the row's right edge. On both surfaces each card now draws after every
  chip, at its own chip and slid left only as far as it must to end short
  of ▿. The workspace strip's cards draw after the strip too, each at its
  own piece.

## [0.11.12] - 2026-10-09

### Fixed
- Sonnet 5.5 reads its cache at 0.05× base input ($0.10 on $2), as
  Anthropic's pricing page lists it; the band weighed its reads at 0.1×, so
  on Sonnet 5.5 sessions the re-warm price read low and the hover said 10%.

## [0.11.11] - 2026-10-09

### Changed
- The plugin's description leads with what it answers: what your next
  message costs. The plugin README's images and links are full URLs, so
  they work wherever the README is shown, a directory listing included.

## [0.11.10] - 2026-10-09

### Fixed
- The re-warm price could still read about 30% low. `/model` may name the
  model by an alias (`opus[1m]`), which matched no read price; the band now
  prices tokens at the model each reply is billed under, as the API names
  it, and a reopened session at the model its last reply names in the
  transcript. The rate it remembers is filed under that model too.

### Changed
- The READMEs open with a picture of the band, label every chip in a
  diagram, and say where to report a bug or suggest a feature.

## [0.11.9] - 2026-10-09

### Changed
- `Hide band` is drawn as a plain button, like `Collapse`, no longer as the
  one to press: the calm band marks no main action, least of all hiding
  itself.

## [0.11.8] - 2026-10-09

### Fixed
- On a 1M-context session the re-warm price read about 30% low. `/model`
  names such a model with its window, `claude-opus-5-5[1m]`, which matched
  no read price, so cache reads were weighed at 0.1× rather than Opus 5.5's
  0.05×. The band now prices the model behind the name: the re-warm, the
  hover's read share, the rate it remembers and the rate it reads off a
  reopened session's cost record, which names the model alone.

### Changed
- The READMEs show the band on the desktop, expanded.

## [0.11.7] - 2026-10-09

### Fixed
- Inside, not on screen: CI passes. The tests that walk the clock through
  an hour (3,600 of the band's one-second ticks) take a 30-second budget,
  since a shared runner outran the default 5 seconds where a laptop takes
  under 2. CI runs on the current checkout and setup-node actions.

## [0.11.6] - 2026-10-09

### Fixed
- The Cache card's bar tells a screen reader the time left (`cache 80%
  left`), as the battery does; it said `used`, the reverse of what it
  shows.

### Changed
- The manifests name the repository, github.com/HMarzban/claude-mod, and
  the README installs from it: `claude plugin marketplace add
  HMarzban/claude-mod`.

## [0.11.5] - 2026-10-09

### Changed
- Documentation only, ready for the repository to go public: the READMEs
  name the versions the band was tested on (Claude Code 2.1.295, and the
  desktop app's bundled 2.1.289) and how to install from a clone;
  CONTRIBUTING describes the test helpers and the clock rule; the bug
  report form asks for current versions.

## [0.11.4] - 2026-10-09

### Fixed
- Numbers at a unit's edge are written in the unit they round to: 9,999
  tokens is `10k` (was `10.0k`), 999,999 is `1.0M` (was `1000k`), $999.995
  is `$1000` (was `$1000.00`), and an estimate from $1000 is whole dollars.
- A reset under a minute away reads `<1m`, not `0m`.
- A transcript line that merely names `cost-state`, such as a prompt quoting
  it, can no longer hide the real cost record, and an unreadable last record
  falls back to the one before it.

### Changed
- Inside, not on screen: the toast rule is one pure function, the engine
  side keeps its state in one object, and the shared helpers (a duration's
  wording, trailing slashes, a transcript's backward scan) exist once. The
  test suite starts each test with one `setup()`, draws with `mountBand()`,
  finds nodes with one `byKey()`, settles on the mocked clock, and has unit
  tests for the formatting, memory and toast modules: 255 tests, from 203.

## [0.11.3] - 2026-10-09

### Changed
- Inside, not on screen: the drawing is split into focused modules (icons,
  layout, the readings, the drawing kit, the workspace strip), every word
  about the cache comes from one table, and the cache's view for the band,
  recall included, is built in one place with one rule for "recalled". The
  expanded view is drawn only while open. `band.tsx` went from 1,183 lines
  to 715.

## [0.11.2] - 2026-10-09

### Fixed
- The light palette's card edges and bar tracks met only 2.2 to 2.8:1, under
  the 3:1 a non-text edge needs; they now hold at least 3.58:1 on every light
  surface. The contrast tests run over every palette, not only the dark one.
- The Limits card says the 5h pace the chip shows (`full in ~1h`), in the
  chip's amber; the two had projected from different spans and could
  disagree. One rule now sets every limit's tone.
- The cache's hover says what a warm read costs on the model in force
  (`bills input at 5%` on Opus 5.5), not a fixed 10%.
- The token split bar no longer names an SVG id, which a page shares: its
  end segments draw their own rounded ends.
- A failed usage read can't drop a turn's bookkeeping, and a failure in the
  compaction hook never stops a compaction.

### Changed
- The context in use is worked out in one place, so the band, its toasts and
  a recalled re-warm price always agree.
- CONTRIBUTING lists every module and the engine's rules in full, and says
  why CI can't type-check.

## [0.11.1] - 2026-10-09

### Fixed
- Cache reads are priced for the model in force: 0.05× base input on
  Opus 5.5, 0.025× on Fable and Mythos 5.1, 0.1× elsewhere. Solving the rate
  with 0.1× everywhere put Opus 5.5's at $2.97 per million input tokens
  where the list price is $4.00, so every re-warm estimate read about 26%
  low. On a real session's totals the band now solves to $4.02.
- Cache writes stay at 1.25×, as Claude Code's own ledger prices them,
  1-hour writes included, so the band agrees with the cost it shows. The
  README says when Anthropic's bill differs.

## [0.11.0] - 2026-10-09

### Added
- A reopened session, or the band reloaded mid-session, knows its cache
  before the first reply: `cache cold · next message ~$2.34` once the cache
  has expired, or the countdown from the last reply while it is warm. The
  Cache card adds how long the session has been idle.
- To know it, the band remembers each session's last reply and the price
  per token it solves for each model. For a session from before the band,
  it reads the end of the transcript once, its last megabyte by `tail`,
  whatever its size: the last reply's time and the cost record's dollars
  and tokens. It never trusts the file's time, since Claude Code writes to
  a transcript each time it opens a session.
- With no price known for the model, it names the tokens the next message
  rebuilds, never a guessed dollar figure.

## [0.10.4] - 2026-10-08

### Changed
- A card short of rows gives up its bar before any fact: the bar repeats
  what a chip already shows, so at the desktop's usual height the Context
  card says how much is in context instead of drawing only its bar. The
  bar returns once every fact fits beside it.

## [0.10.3] - 2026-10-08

### Changed
- The expand toggle shows outlined triangles, `▿` to open and `▵` to
  close, measured centred in the button to within half a pixel. The `⌄ ⌃`
  chevrons sat 5 px off the middle.

## [0.10.2] - 2026-10-08

### Changed
- The expand toggle shows full-height chevrons, `⌄` to open and `⌃` to
  close, in place of small triangles that drew as specks in the desktop's
  button. A Button holds only text, so its icon is a glyph.

## [0.10.1] - 2026-10-08

### Fixed
- On a band too short to give the workspace strip its own row (the desktop
  often gives about 13), the strip now takes the footer, in place of the
  "Bring it back" hint, instead of not showing at all.

## [0.10.0] - 2026-10-08

### Added
- A workspace strip opens the expanded view. It shows the project path,
  with home as `~` and the project's folder in bold, then the git branch,
  or `detached at <commit>`. It also shows `worktree of <repo>` in a linked
  worktree, the uncommitted change count or `clean`, and ahead/behind
  (`↑2 ↓1`). It has icons on the desktop and words in the terminal, and
  each piece has a hover explanation.
- When the strip is narrow, the path and branch shorten and the extras
  drop, least important first. When the band is short of rows, the strip
  is dropped before the cards lose their last fact.
- git is read at session start, after each of your messages and when you
  open the cards, never while drawing. With no repository, or git missing
  or slow, the strip shows the path alone. Only the newest read lands, and
  a read that fails keeps the last good one.

### Fixed
- The light palette's label colour now holds 4.5:1 on its own surfaces.
- The hint under the cards takes the host theme's colours, since it sits
  on the band's bare ground.
- The expand toggle is atomic again: two quick presses leave the cards as
  they were.

## [0.9.1] - 2026-10-08

### Changed
- The expand toggle is a framed native button on the desktop, like
  Collapse and Hide band, with a chevron: `▾` opens the cards and `▴`
  closes them. The terminal keeps a bare glyph.

## [0.9.0] - 2026-10-08

### Added
- Each card's title has an icon matching its chip: a bolt for Cache, the
  coin for Spend, the document for Context and the gauge for Limits. The
  hint has an info mark. Desktop only.

## [0.8.2] - 2026-10-08

### Changed
- A blank row between lines of cards, and one above the buttons.

## [0.8.1] - 2026-10-07

### Changed
- Bars have a thumb where the fill ends.

### Fixed
- Icons and bars no longer touch their text on the desktop. It drops
  whitespace-only text, so the gaps are now spacers.

## [0.8.0] - 2026-10-07

### Changed
- Bars no longer carry a pace tick. Pace is in words: on the chip when it
  matters, and always in the Limits card.
- Cards sit in lines that share the width equally, and card bars stretch
  to fill their card.
- A card's title and headline share its first line. When the band is short
  on rows, each card drops its least important facts first, so the buttons
  never scroll away.

### Fixed
- Cards stacked one per line, because their fixed widths came out slightly
  too wide.

## [0.7.1] - 2026-10-07

### Fixed
- Every meter reused one SVG clip id, which could clip card bars to the
  width of a chip.
- The collapse toggle no longer uses `⌃`, which reads as Control on a Mac.

## [0.7.0] - 2026-10-07

### Added
- Honest early states: `cache –` when the band loads mid-conversation, and
  `cache warming` only for a conversation known to be new.
- The Cache card shows what the cache has saved, and the Spend card has a
  legend (input, output, cache reads).
- A hint under the cards: `Bring it back with /usage-band`.

### Changed
- Context measures toward auto-compaction (`63% full`, then
  `95% full · compacts in ~8k`).
- Chips never shrink, so expanding can't wrap them, and the chip row is the
  same whether the cards are open or closed.
- Cards have uppercase titles and, on the desktop, a visible border.
  Labels, values, edges and bar tracks meet WCAG AA contrast.
- The Limits card leads with the window closest to its limit and states
  each window's pace in words.

## [0.6.1] - 2026-10-07

### Fixed
- The four cards share one row, with bars across each card.

## [0.6.0] - 2026-10-07

### Added
- An expanded view of four labelled cards (Cache, Spend, Context, Limits),
  with Collapse (`c`) and Hide band (`h`) buttons.

### Fixed
- Follow-ups from the 0.5.0 verification review.

## [0.5.0] - 2026-10-07

### Fixed
- Accuracy fixes from a team code review.

### Changed
- A clean-code pass across the modules.
- A full plugin README and a marketplace index.

## [0.4.0] - 2026-10-07

### Added
- 5h and 7d limit chips with a bar, a pace tick and the reset countdown.

### Changed
- Leaner labels: the cost, tokens and context chips drop their words.

## [0.3.1] - 2026-10-07

### Fixed
- The battery icon on the desktop.
- The tokens chip shows whenever it fits.

## [0.3.0] - 2026-10-07

### Added
- The cache chip as a battery that drains as the cache ages.
- Icons, a tokens chip, and a context chip that knows where
  auto-compaction runs.

## [0.2.1] - 2026-10-07

### Fixed
- The cost baseline holds across `/clear`, resumes and reloads.
- The row always fits on one line.
- The 5-hour pace counts all your Claude use.
- Other limits, such as a gateway's spend limit, are listed.
- The expanded line shows the 5h percentage.

## [0.2.0] - 2026-10-07

### Added
- A calm one-row band: the last message's cost and a 5-hour pace estimate.
- SVG meters on the desktop.
- Hover explanations on every chip.

### Fixed
- The band resets on `/clear`, with a cost baseline.

## [0.1.1] - 2026-10-07

### Added
- The first version: a live band above the prompt with context fill,
  tokens, cost, the rate-limit windows and a prompt-cache countdown.

