#!/usr/bin/env bash
# Rebuild every demo from the band's real output: the film, the terminal GIF,
# the landing page's live band and states, and the still images.
#
#   tools/demos/build.sh            # everything
#   tools/demos/build.sh capture    # only re-capture the band's frames
#
# Needs: Claude Code (claude plugin test), Google Chrome, Node 22+, Python 3
# with Pillow, and ffmpeg. Output lands in docs/; scratch in tools/demos/out/.
# PYTHON=/path/to/python3 picks the Python; else the first on PATH with Pillow.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PLUGIN="$ROOT/plugins/session-usage-band"
OUT="$HERE/out"
DOCS="$ROOT/docs"
export CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
mkdir -p "$OUT"
cd "$HERE"

shot() { # shot WIDTH HEIGHT PAGE PNG
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size="$1,$2" --virtual-time-budget=5000 --screenshot="$4" "file://$3" 2>/dev/null
}

# ---- 1. capture: run the capture files as tests, keep what they print ------
# In a scratch copy of the plugin holding only what they import, so a failed
# run leaves nothing in the plugin's tests/.
capture() {
  echo "capturing the band's frames"
  SCRATCH="$(mktemp -d)"
  trap 'rm -rf "$SCRATCH"' EXIT
  find "$PLUGIN" -mindepth 1 -maxdepth 1 ! -name tests -exec cp -R {} "$SCRATCH/" \;
  mkdir -p "$SCRATCH/tests"
  cp "$PLUGIN"/tests/{helpers.ts,globals.d.ts,cases.ts,matrix.ts} capture/*.test.ts "$SCRATCH/tests/"
  claude plugin test "$SCRATCH" > "$OUT/capture.log" 2>&1 || { tail -20 "$OUT/capture.log"; exit 1; }
  grep '^FRAME' "$OUT/capture.log" > "$OUT/frames.txt"
  grep '^FILM' "$OUT/capture.log" > "$OUT/film.txt"
  grep -E '^(LIVE|STATE)' "$OUT/capture.log" > "$OUT/site.txt"
  grep '^DEMO' "$OUT/capture.log" > "$OUT/demo.txt"
  wc -l "$OUT"/frames.txt "$OUT"/film.txt "$OUT"/site.txt "$OUT"/demo.txt | tail -1
}
capture
[ "${1:-}" = capture ] && exit 0

# ---- the Python with Pillow: $PYTHON, else the first python3 that has it ----
pillow_python() {
  local py
  if [ -n "${PYTHON:-}" ]; then
    "$PYTHON" -c 'import PIL' 2>/dev/null && { echo "$PYTHON"; return; }
    echo "build.sh: PYTHON=$PYTHON can't import Pillow" >&2; exit 1
  fi
  for py in python3 python3.14 python3.13 python3.12 python3.11 python3.10 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    command -v "$py" >/dev/null 2>&1 && "$py" -c 'import PIL' 2>/dev/null && { echo "$py"; return; }
  done
  echo "build.sh: no python3 with Pillow found; run 'python3 -m pip install Pillow' or set PYTHON=/path/to/python3" >&2
  exit 1
}
PY="$(pillow_python)"

# ---- 2. the terminal GIF, light and dark ------------------------------------
for th in light dark; do
  echo "terminal ($th)"
  mkdir -p "$OUT/term-$th"
  "$PY" term_themed.py "$OUT/frames.txt" "$OUT/term-$th" "$th" >/dev/null
  for f in reply m20 m45 last last2 cold cards; do shot 1000 560 "$OUT/term-$th/$f.html" "$OUT/term-$th/$f.png"; done
  sed "s#file '#file '$OUT/term-$th/#" terminal-timing.txt > "$OUT/term-$th.txt"
  ffmpeg -y -loglevel error -f concat -safe 0 -i "$OUT/term-$th.txt" \
    -vf "scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none" \
    -loop 0 "$DOCS/band-demo-terminal-$th.gif"
done

# ---- 3. the film, light and dark: MP4 for the site, GIF for the README -------
for th in light dark; do
  echo "film ($th)"
  mkdir -p "$OUT/film-$th"
  "$PY" film.py "$OUT/film.txt" "$OUT/film-$th" "$th" >/dev/null
  node shoot.mjs "$OUT/film-$th" 1.5
  suffix=$([ "$th" = dark ] && echo "-dark" || echo "")
  ffmpeg -y -loglevel error -framerate 30 -i "$OUT/film-$th/f%04d.png" -c:v libx264 -crf 18 -preset slow \
    -pix_fmt yuv420p -movflags +faststart "$DOCS/demo$suffix.mp4"
  ffmpeg -y -loglevel error -framerate 30 -i "$OUT/film-$th/f%04d.png" \
    -vf "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \
    -loop 0 "$DOCS/band-film-$th.gif"
  "$PY" -c 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); im.thumbnail((1600, 1600)); im.save(sys.argv[2])' \
    "$OUT/film-$th/f0250.png" "$DOCS/demo-poster$suffix.png"
done

# ---- 4. the landing page, with the live band and its states ----------------
echo "site"
"$PY" gen_site.py "$OUT/site.txt" site/template.html "$DOCS/index.html" "$OUT/demo.txt" >/dev/null
# the sitemap's lastmod is the day the page was built (UTC)
sed -i.bak -E "s#<lastmod>[^<]*</lastmod>#<lastmod>$(date -u +%Y-%m-%d)</lastmod>#" "$DOCS/sitemap.xml" && rm -f "$DOCS/sitemap.xml.bak"

# ---- 5. the stills: social card, anatomy, expanded band, the galleries -------
echo "stills"
mkdir -p "$OUT/stills"
"$PY" stills.py "$OUT/site.txt" "$OUT/stills" "$OUT/demo.txt" >/dev/null
shot 1280 640 "$OUT/stills/social.html" "$DOCS/social-preview.png"
shot 1100 270 "$OUT/stills/anatomy.html" "$DOCS/band-anatomy.png"
shot 1012 700 "$OUT/stills/expanded.html" "$DOCS/band-expanded.png"
for th in light dark; do
  shot 1100 900 "$OUT/stills/states-$th.html" "$DOCS/band-states-$th.png"
  shot 1100 1600 "$OUT/stills/layouts-$th.html" "$DOCS/band-layouts-$th.png"
done
"$PY" - "$DOCS" <<'EOF'
import sys
from PIL import Image
def crop(path, pad=48):
    im = Image.open(path).convert('RGB'); bg = im.getpixel((2, im.height - 2)); w, h = im.size; px = im.load()
    last = next((y for y in range(h - 1, -1, -1) if any(sum(abs(a - b) for a, b in zip(px[x, y], bg)) > 12 for x in range(0, w, 4))), h)
    im.crop((0, 0, w, min(h, last + pad))).save(path)
for name in ['band-expanded.png'] + [f'band-{g}-{th}.png' for g in ('states', 'layouts') for th in ('light', 'dark')]:
    crop(f'{sys.argv[1]}/{name}')
EOF
# ---- 6. cache-bust: the page names each local asset with a hash of its
# final bytes (the social card is drawn after the page), so a changed file
# gets a new URL: browsers' favicon stores and link previews refetch it.
"$PY" cachebust.py "$DOCS/index.html" "$DOCS"
echo "done: docs/ is up to date"
