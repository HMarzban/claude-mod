"""The still images, drawn from the band's real desktop output (site.txt):
the social preview card, the chip row's anatomy, the expanded band, and the
states and layouts galleries in a light and a dark theme, for the READMEs.
The social card's chips come from demo.txt (beside site.txt unless given),
and so does the list of layouts the gallery draws.

    python3 stills.py out/site.txt OUT_DIR [out/demo.txt]
"""
import json
import os
import re
import sys

from common import demo_layouts, plugin_version, trees, words, write
from render_desk import BAND_CSS, node

# The social card, 1280x640 shot at 2x: the page's dark counter and receipt
# grammar, one big cache chip in its last minute, the rest of the row beneath,
# and the re-warm price as a receipt line. The chips and the price are the
# real `chips amber` drawing from demo.txt, the version the plugin's manifest's;
# never typed.
SOCIAL = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=block">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:640px;overflow:hidden;background:#0f0f12}
body{font-family:"IBM Plex Sans",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;color:#ececf2;position:relative}
.mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
.top{position:absolute;left:72px;right:72px;top:46px;padding-bottom:18px;border-bottom:1px dashed #34343c;font-size:24px;font-weight:600;letter-spacing:-.2px;display:flex;justify-content:space-between;align-items:baseline}
.top span{font-size:20px;font-weight:400;color:#9a9aa4}
h1{position:absolute;left:72px;right:72px;top:118px;font-size:76px;line-height:1.06;font-weight:600;letter-spacing:-2px}
.big,.rest{position:absolute;left:72px}
.big{top:312px}
.rest{top:418px;opacity:.65}
.big>div{zoom:3}
.rest>div{zoom:1.6}
.big,.rest{font-size:15px;line-height:24px;white-space:pre;color:#ececf2;font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;font-variant-numeric:tabular-nums}
.line{position:absolute;left:72px;right:72px;top:492px;display:flex;align-items:baseline;gap:14px;font-size:26px;font-weight:600;letter-spacing:.5px;font-variant-numeric:tabular-nums}
.line i{flex:1;border-bottom:3px dotted #5f5f69;transform:translateY(-7px)}
.line b{font-weight:600;color:#f0c969}
.foot{position:absolute;left:72px;right:72px;bottom:40px;padding-top:18px;border-top:1px dashed #34343c;font-size:26px;color:#9a9aa4}
''' + BAND_CSS + '''</style></head><body>
<div class="top mono">nextcost<span>v{version}</span></div>
<h1>See the cold-cache bill<br>before you send it.</h1>
<div class="big"><div>{chip}</div></div>
<div class="rest"><div>{rest}</div></div>
<div class="line mono">RE-WARM IF MISSED<i></i><b>{rewarm}</b></div>
<div class="foot">Free Claude Code plugin · no tokens · terminal + desktop</div>
</body></html>'''


def social(tree):
    """The social card from the chips layout's last-minute drawing: its cache
    chip alone, the row's other chips, and the chip's re-warm price."""
    row = next(c for c in tree['children'] if (c.get('props') or {}).get('key') == 'row')
    chips = {c['props']['key']: c for c in row['children'] if isinstance(c, dict) and (c.get('props') or {}).get('key')}
    assert 'left' in node(chips['cache']), 'the amber cache chip has no countdown'
    rest = {'type': 'Box', 'props': {'flexDirection': 'row', 'columnGap': 1},
            'children': [chips[k] for k in ('cost', 'ctx', '5h', '7d') if k in chips]}
    rewarm = re.search(r're-warm (~\$[\d,.]+)', words(chips['cache'])).group(1)
    return (SOCIAL.replace('{chip}', node(chips['cache'])).replace('{rest}', node(rest))
            .replace('{rewarm}', rewarm).replace('{version}', plugin_version()))


ANATOMY = '''<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1100px;height:270px;overflow:hidden;background:#141413}
body{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;position:relative}
#b{position:absolute;left:24px;top:95px;width:1052px;background:#1a1a1a;border:1px solid #2f2f2d;border-radius:16px;padding:12px 14px}
#b .band{width:100%}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:15.5px;font-weight:650;color:#f2f0eb}
.call span{display:block;font-size:13.5px;color:#a8a49c;margin-top:3px}
.stem{position:absolute;width:1px;background:#6b675e}
.dot{position:absolute;width:7px;height:7px;border-radius:50%;background:#d97757}
''' + BAND_CSS + '''</style></head><body>
<div id="b"><div class="band">{band}</div></div>
<script>
// Each callout: the piece it names, above or below the band, its title and words.
const CALLS = [
  ['cache', 1, 'Cache countdown', 'and what a re-warm will cost'],
  ['cost', 0, 'Session cost', 'the running total'],
  ['ctx', 1, 'Context', 'how close auto-compaction is'],
  ['5h', 0, '5-hour limit', 'warns before your pace runs out'],
  ['7d', 1, 'Weekly limit', 'usage and when it resets'],
  ['more', 0, 'The cards', 'every fact, labelled'],
]
const band = document.getElementById('b').getBoundingClientRect()
const add = (cls, style, html = '') => {
  const d = document.createElement('div'); d.className = cls; d.innerHTML = html
  Object.assign(d.style, style); document.body.appendChild(d); return d
}
for (const [key, above, title, words] of CALLS) {
  const r = document.querySelector(`[data-key="${key}"]`).getBoundingClientRect()
  const x = r.left + r.width / 2
  const edge = above ? band.top : band.bottom
  add('dot', {left: x - 3.5 + 'px', top: edge - 3.5 + 'px'})
  add('stem', {left: x - 0.5 + 'px', top: (above ? edge - 14 : edge) + 'px', height: '14px'})
  const c = add('call', {}, `<b>${title}</b><span>${words}</span>`)
  const w = c.getBoundingClientRect().width
  const left = Math.max(24, Math.min(1076 - w, x - w / 2))
  Object.assign(c.style, {left: left + 'px', textAlign: left === x - w / 2 ? 'center' : left === 24 ? 'left' : 'right'})
  c.style.top = (above ? edge - 18 - c.getBoundingClientRect().height : edge + 18) + 'px'
}
</script>
</body></html>'''


GALLERY = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=block">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1100px;background:{bg};overflow:hidden}
body{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:28px 34px 30px;color:{text}}
.row{display:grid;grid-template-columns:150px 1fr;gap:20px;align-items:center;margin-top:14px}
.row:first-child{margin-top:0}
.lab b{display:block;font-size:17px;font-weight:700;letter-spacing:-.2px}
.lab span{display:block;font-size:13.5px;color:{text3};margin-top:2px;line-height:1.35}
.frame{background:#1a1a1a;border-radius:16px;padding:8px;box-shadow:{shadow}}
.zoom{zoom:.9}
.band+.band{margin-top:8px}
''' + BAND_CSS + '''</style></head><body>{rows}</body></html>'''

# Each row: the states it draws, top to bottom, then its title and caption.
STATES = [
    (['calm'], 'Calm', 'just replied; nothing needs you'),
    (['amber'], 'Last minute', 'the price of going cold'),
    (['compact'], 'Near compaction', 'room left before it summarises'),
    (['all'], 'Everything at once', 'still one row'),
]
# Each layout's title and caption in the layouts gallery. Every layout the
# capture draws needs one, and every one names a layout it draws.
LAYOUT_LABELS = {
    'chips': ('Chips', 'the default: a row of pills'),
    'pulse': ('Pulse', 'is cost per message rising; will a limit fill before it resets'),
    'departures': ('Departures', 'when the cache goes cold, and each limit resets or fills'),
}
GTHEME = {
    'light': {'bg': '#faf9f5', 'text': '#1f1e1b', 'text3': '#6b675e', 'shadow': '0 1px 2px rgba(31,30,27,.06), 0 12px 30px -12px rgba(31,30,27,.3)'},
    'dark': {'bg': '#141413', 'text': '#f2f0eb', 'text3': '#8a877f', 'shadow': '0 0 0 1px #2f2e2b'},
}

EXPANDED = '''<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1012px;background:#1a1a1a;overflow:hidden}
body{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:24px}
''' + BAND_CSS + '''</style></head><body><div class="band">{band}</div></body></html>'''


def layout_rows(layouts, drawn):
    """The layouts gallery's rows, one per layout in the capture's order (the
    command's): calm, then the cache's last minute."""
    unnamed = [k for k in layouts if k not in LAYOUT_LABELS]
    if unnamed:
        sys.exit(f'stills.py: add a title and caption for {", ".join(unnamed)} to LAYOUT_LABELS')
    stale = [k for k in LAYOUT_LABELS if k not in layouts]
    if stale:
        sys.exit(f'stills.py: LAYOUT_LABELS names {", ".join(stale)}, which the capture draws no DEMO lines for')
    rows = [([f'layout-{k}', f'layout-{k}-amber'], *LAYOUT_LABELS[k]) for k in layouts]
    absent = [key for keys, _, _ in rows for key in keys if key not in drawn]
    if absent:
        sys.exit(f'stills.py: the capture has no STATE {", ".join(absent)} drawing')
    return rows


def gallery(out, name, rows, trees):
    """Write `name`-light.html and `name`-dark.html, a labelled row per entry of `rows`."""
    body = ''.join(
        f'<div class="row"><div class="lab"><b>{t}</b><span>{d}</span></div><div class="frame"><div class="zoom">'
        + ''.join(f'<div class="band">{node(trees[k])}</div>' for k in keys)
        + '</div></div></div>'
        for keys, t, d in rows)
    for th, c in GTHEME.items():
        page = GALLERY.replace('{rows}', body)
        for k, v in c.items():
            page = page.replace('{' + k + '}', v)
        write(f'{out}/{name}-{th}.html', page)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    demo_src = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(src), 'demo.txt')
    drawn = trees(src)
    with open(demo_src) as f:
        amber = next(json.loads(line.split(' ', 4)[4]) for line in f if line.startswith('DEMO chips amber shut '))
    write(f'{out}/social.html', social(amber))
    write(f'{out}/anatomy.html', ANATOMY.replace('{band}', node(drawn['calm'])))
    write(f'{out}/expanded.html', EXPANDED.replace('{band}', node(drawn['amberOpen'])))
    gallery(out, 'states', STATES, drawn)
    gallery(out, 'layouts', layout_rows(demo_layouts(demo_src), drawn), drawn)
    print('stills')
