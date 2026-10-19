# The site, itemized: redesign brief

Status: in progress (branch `site/itemized`). Distilled from four audits run
on 2026-10-19 (information architecture, originality, accessibility, SEO and
marketing); this brief settles where they disagreed.

## Why

https://hmarzban.github.io/claude-mod/ runs ~8.8 screens on desktop and ~11
on a phone, says the 25× story five times, and wears a stock "AI landing page"
skin: Anthropic's own beige and terracotta, an italic serif accent word in
every heading, a "New" pill, icon tiles above every title, icon-card grids,
highlighter underlines. The owner wants it mature, enjoyable, original, and
shorter. SEO and the social card are in scope too.

## The concept: "Itemized"

The page is the bill for one Claude Code session, as the band would print
it: line items with dotted leaders, figures in tabular mono, every estimate
marked `~`. The pitch is literally "the price comes from your own bill", and
a receipt is narrow by nature, so phones cost nothing. The product's real
output (the live band, the film, the layouts) stays the star; the receipt
is the frame, not a costume. One torn edge at most, no barcodes, no paper
texture, no all-mono brutalism.

### Type
- IBM Plex Mono 400/600: figures, line items, labels, headings.
- IBM Plex Sans 400/600: prose.
- Google Fonts, these two families only, `display=swap`, preconnect, and
  `system-ui` / `ui-monospace` fallbacks. `font-variant-numeric: tabular-nums`
  on every figure.

### Colour (tokens on `:root`, dark under `[data-theme=dark]` and
`prefers-color-scheme: dark` when no theme is saved)
| token | light | dark |
| --- | --- | --- |
| counter (page) | `#e6e7e3` | `#0f0f12` |
| paper (surfaces) | `#fbfaf7` | `#1d1d22` |
| ink | `#0b0b0c` | `#ececf2` |
| ink-2 (secondary) | `#5f5f69` | `#9a9aa4` |
| rule | `#c9cac4` | `#34343c` |
| red (cold, the price) | `#b3261e` | `#ff6b5e` |
| amber (last minute) | `#8a5a00` | `#f0c969` |
| green (warm) | `#2f6b3a` | `#7fcf8a` |

Never `#faf9f5`, `#141413`, `#d97757`, `#b4502c` or any clay/terracotta.
The band's own drawings keep their own colours (they're real output).

### Grammar
- Left-aligned. One content column (max ~68ch for prose) inside a 1120px
  container; the live band and the calculator may use the full container.
- Sections are numbered line items: a mono label row like
  `02 ─ THE BILL FOR A LUNCH BREAK` with a 1px dashed rule; headings are
  plain Plex Mono 600 or Plex Sans 600, no accent words, no icons above.
- Two radii only: 0 (paper, rules) and 4px (controls). 1px rules instead of
  shadows; no gradients, glow or blur.
- Tabs are underlined text, not pills. No badges, no trust-icon row, no
  "Star on GitHub" button (the repo is a plain link).

### Slop checklist (the build and the review both enforce it)
1. No `#faf9f5` `#141413` `#d97757` `#b4502c`, no clay accent.
2. No italic or serif display face; no accent words in another face.
3. No icon tiles; no icons above headings.
4. No pill badges, no pill segmented tabs.
5. No highlighter or wavy underlines.
6. At most 2 border-radius values (0 and 4px) in the page's own CSS. The `.band*` rules are exempt: they reproduce the product's real drawing.
7. No feature card grids: rows, tables, line items.
8. No gradients, glow, or shadows beyond a 1px rule.
9. No centred body text.
10. No "X, in Y." headings, no "Meet/Know…" openers, no fragment-with-full-stop
    headings; use real band strings or figures where they say it better.
11. Every estimate carries `~`, uses tabular numerals, and is checked
    against Anthropic's live pricing page.
12. No trust-badge row, no "Star on GitHub" CTA.
13. FAQ answers visible by default.
14. Every animation has a `prefers-reduced-motion` state that still reads.
15. Two font families at most, with system fallbacks.

## Structure (target ~4 desktop screens, ~6 on a 390px phone)

0. **Header**, sticky, ~56px: wordmark `session-usage-band` in mono · Demo ·
   Cost · Notes · GitHub · theme button (`aria-pressed`, "Dark theme") · a
   compact "Copy install" that appears only once the hero's install line has
   scrolled away. Mobile: wordmark, theme, Copy install.
1. **Hero + live band** (~1,050 / 1,300px).
   - Version line above the h1, plain mono text linking the changelog:
     `v0.15.1 · 2026-10-19 · idle compaction, Haiku 5.5 tiers`.
   - h1: "The price of your next Claude Code message, before you send it."
   - Lede (2 lines): "Step away and Claude Code's prompt cache goes cold;
     your next message then writes the whole conversation again. This
     plugin draws the countdown and the re-warm price above the prompt."
   - Install as a terminal line `$ claude plugin install session-usage-band
     --marketplace HMarzban/claude-mod` with one Copy button; under it in
     ink-2: "It loads in your next session, or run /reload-plugins in an
     open one. Claude Code 2.1.292 or later." A spec line in
     mono: `free · MIT · no network · no tokens · terminal + desktop app`.
   - The live band stage, directly below: state tabs **Calm · Last minute ·
     Gone cold · Near a limit**, a smaller layout switch **chips · pulse ·
     departures**, a Pause/Play tour button, the band itself, one live note
     line, and a chip legend as line items with dotted leaders (cache ·
     spend · context · 5h · 7d; tapping/hovering one rings its chip).
     `/usage-band layout <name>` copy appears when the layout isn't chips.
     "Watch the 17-second film" opens the film in a `<dialog>`.
2. **The bill for a lunch break** (~650 / 950px): the calculator as two
   receipts side by side (stacked on mobile), "back within the hour"
   (warm, green) and "back after lunch" (cold, red), each a line item list
   ending in a total; the gap between them is the punchline, stated once
   (`25× the warm read, on the context part`). Model `<select>` and a
   context range with visible labels and `aria-valuetext`. A `<details>`
   "How the price is worked out" holds the formula and the pricing note.
   The 25× applies to the context part only: say so (see SEO audit P0).
3. **What it reads, what it never does** (~380 / 650px): line items from
   SECURITY.md (reads usage, two read-only git commands, transcript tail on
   resume, settings keys) and the nevers (no network, no tokens, no files
   written), `~1,000 tests`, MIT, link to SECURITY.md.
4. **Notes** (FAQ, ~420 / 700px): 8 questions, two columns on desktop,
   answers visible, mono `Q.` gutter. Must include: what a cold cache costs
   and why; is the price exact (`~`, Claude Code's ledger, 1h writes at 2×);
   how it knows 5m vs 1h; idle compaction; does it work in the desktop app;
   how is it different from ccusage / a status line (honest: ccusage reports
   from past logs; status lines can show a countdown; this draws the re-warm
   price live, in the desktop app too); does it send data (no); limits pace.
   The FAQPage JSON-LD is generated from the same text.
5. **Total + footer** (~520 / 800px): the install line once more as the bill's
   total, a row of plain text links ("A price looks off? Report it." ·
   Releases · Changelog · Security · License · GitHub), and "Not affiliated
   with Anthropic."

Remove: the trust strip, the five feature tiles and the anatomy image, the
standalone film section, the separate layouts section and its gallery, the
contribute cards, the hand-drawn underline, the eyebrow pill.

## The live demo: data contract

The pipeline lands first; the page is built on what it delivers.

- Each demo state is one deterministic session shape, drawn in all three
  layouts from identical inputs, so switching layout never changes a figure.
  States: `calm` (warm, some way in), `amber` (the cache's last minute),
  `cold` (a minute past it), `limit` (near compaction, a 5-hour pace that
  fills before its reset, the week over 80%).
- `gen_site.py` fills two placeholders in the template:
  - `{{demo-chips-amber}}`: that drawing, pre-rendered into the band host so
    the hero has a band before any JS (the tour starts on Last minute).
  - `{{demo-json}}`: inside `<script type="application/json" id="demo-data">`,
    placed after the page's main script, holding
    `{ "<layout>": { "<state>": { "shut": "<html>", "open": "<html>" } } }`
    for layout ∈ `chips pulse departures`, state ∈ `calm amber cold limit`
    (24 drawings), each from `render_desk.node()` after `lift_hovers`, with
    `</` escaped. No fetch: previews and screenshots run over `file://`.
  - The main script reads `#demo-data` lazily (on DOMContentLoaded or first
    interaction), never at parse time.
- The countdown in an amber drawing is wrapped in `<span class=cd>` wherever
  it is, whatever its value (not a hard-coded `0:47`); the page ticks it.
- Phones: the band keeps its desktop drawing in a horizontally scrolling
  region (`tabindex=0`, `role=region`, `aria-label`, visible scrollbar), and
  every state change or legend tap scrolls the relevant chip into view. The
  legend's line items carry each figure in readable text.
- In the site's drawings only (`node(..., site=True)` or equivalent, so
  the film, terminal GIF and stills render byte-for-byte as before), band
  controls are real `<button type="button">`s (`data-key` kept), `▵` named
  "Show details" / "Hide details" with `aria-expanded`, and every
  `<img class=svg>` has `alt=""`. Hover tips stay in
  `data-tip`; the page makes tip-carrying chips focusable and shows the tip
  on focus, hover and tap, closes on Esc, and links it with
  `aria-describedby`.

## Accessibility (WCAG 2.2 AA) — the a11y audit's checklist applies in full
Skip link to `<main id=main>`; header holds the nav only; one h1, h2 per
section; contrast ≥4.5:1 text and ≥3:1 UI in both themes; one never-clipped
`:focus-visible` ring; state tabs as APG tabs with ←/→/Home/End; layout
switch as a radiogroup; the tour pauses on hover/focus, stops after one
pass, has a visible Pause, never announces its steps; a picked state is
announced once via one polite live note; the calculator's `<output>` is
polite and debounced; Copy buttons announce Copied / failed; the film has a
visible description and no autoplay under reduced motion; reduced motion
turns off every transition, the tour and the countdown, listening for
changes; theme follows `prefers-color-scheme` until overridden; targets
≥24px; no colour-only meaning; reflow at 320px; decorative SVGs
`aria-hidden`. Gate: axe-core 0 violations in both themes.

## SEO, head and social card
- `<title>`: "Claude Code plugin: prompt-cache countdown, cost and limits"
  (≤60 chars). Meta description ≤155 chars: "Free Claude Code plugin: a band
  above the prompt with the prompt-cache countdown, the re-warm price,
  session cost, context and 5-hour/weekly limits."
- og/twitter: the corrected description (no blanket "25× more"),
  `og:image` 2560×1280 + `og:image:type` + `og:image:alt` +
  `twitter:image:alt`, `og:locale` en_US. Two `theme-color` metas (light,
  dark media). PNG favicon fallback + 180px apple-touch-icon.
- JSON-LD: SoftwareApplication (softwareVersion 0.15.1, dateModified, offers
  free, no rating) + separate SoftwareSourceCode (codeRepository) + FAQPage
  built from the visible notes.
- `build.sh` writes `docs/sitemap.xml`'s `lastmod` as the build date.
- h2s carry searchable words: prompt cache, cost, usage limits, plugin.
- **Social card** (`stills.py` → `social.html` → `docs/social-preview.png`,
  1280×640 shot at 2×): dark counter background, receipt grammar; top-left
  wordmark; headline ≤8 words on two lines, ~76px Plex Mono/Sans 600, e.g.
  "See the cold-cache bill before you send it."; one large real amber chip
  (≥40px text) whose words are read from the band's real `amber` capture,
  never typed, a faded row of the other chips behind; footer line ~26px
  "Free Claude Code plugin · no tokens · terminal + desktop". No install
  command, no URL. ≥64px side margins. Must read at 400px wide.

## Done means
- `tools/demos/build.sh` builds the page, `demo.json`, the stills and the
  card from the band's real output; the README's images still build.
- Desktop ≤ ~4.5 screens at 1440×900, phone ≤ ~6.5 at 390×844.
- The slop checklist passes on review; axe 0 violations both themes;
  keyboard-only walkthrough works; Lighthouse SEO and a11y ≥ 95.
- Every figure on the page re-checked against Anthropic's live pricing.
