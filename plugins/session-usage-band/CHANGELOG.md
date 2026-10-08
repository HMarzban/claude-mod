# Changelog

Every notable change to session-usage-band. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). Before 1.0.0, a minor
version may change how the band reads.

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

