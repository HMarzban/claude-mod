# Demos

Everything in `docs/` that shows the band is drawn from the band's own output:
the film, the terminal GIF, the landing page's live band and its states, the
social card and the stills. Nothing is mocked up.

```bash
tools/demos/build.sh            # rebuild everything into docs/ (about two minutes)
tools/demos/build.sh capture    # only re-capture the band's frames
```

It needs Claude Code, Google Chrome, Node 22+, Python 3 with Pillow, and ffmpeg.

## How it works

1. **Capture.** `capture/*.test.ts` are not tests. The build copies them into
   the plugin's `tests/` for one `claude plugin test` run, removes them, and
   keeps what they print: the band's drawn tree at each moment, with the clock
   moved forward and the session in a known shape.
2. **Draw.** `render.py` turns a terminal tree into HTML on a monospace grid;
   `render_desk.py` turns a desktop tree into HTML laid out like the Code tab
   (10px per column, 24px per text row), with the band's real SVG icons.
3. **Compose.** `film2.py` (on top of `film.py`'s timeline and camera) builds
   the film frame by frame in a light and a dark theme; `term_themed.py` the
   terminal demo; `gen_site.py` fills `site/template.html` with the live
   band's states; `stills.py` the social card, the expanded band and the
   states gallery.
4. **Render.** `shoot.mjs` screenshots each frame through one headless Chrome
   over the DevTools protocol; ffmpeg turns frames into MP4 and GIF.

To change the landing page, edit `site/template.html` and run the build (or
just `python3 gen_site.py out/site.txt site/template.html ../../docs/index.html`
after a capture). Don't edit `docs/index.html` by hand; the build overwrites it.

Scratch goes to `tools/demos/out/`, which git ignores.
