"""The still images, drawn from the band's real desktop output (site.txt):
the social preview card, the chip row's anatomy, the expanded band, and the
states and layouts galleries in a light and a dark theme, for the READMEs.

    python3 stills.py out/site.txt OUT_DIR
"""
import json
import sys

from render_desk import node

MARK = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1f1e1b"/><circle cx="32" cy="32" r="21" fill="none" stroke="#3b3934" stroke-width="5"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d97757" stroke-width="5" stroke-linecap="round" stroke-dasharray="97 132" transform="rotate(-90 32 32)"/><rect x="20.5" y="25" width="20" height="14" rx="3.6" fill="none" stroke="#f2f0eb" stroke-width="3"/><rect x="41.8" y="28.8" width="3" height="6.4" rx="1.3" fill="#f2f0eb"/><rect x="24" y="28.5" width="7" height="7" rx="1.5" fill="#d97757"/></svg>'''

BAND_CSS = '''
.band{width:964px;background:#212121;border-radius:16px;padding:12px;font-size:15px;line-height:24px;color:#ececf2;white-space:pre;position:relative}
.t{white-space:pre} .svg{display:block;flex-shrink:0}
.toggle{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;background:#333336;color:#ececf2;font-size:13px}
.btn{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;border-radius:8px;background:#2e2e31;border:1px solid #3c3c40;color:#ececf2}
.key{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border:1px solid #55555e;border-radius:5px;font-size:12px;color:#b8b8c2}
'''

SOCIAL = '''<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=block">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1280px;height:640px;overflow:hidden;background:#faf9f5}
body{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#1f1e1b;position:relative}
.top{position:absolute;left:64px;right:64px;top:44px;display:flex;justify-content:space-between;align-items:center;font-size:18px;color:#6b675e}
.brand{display:flex;align-items:center;gap:12px;color:#1f1e1b;font-weight:650}
h1{position:absolute;left:64px;top:104px;font-size:70px;line-height:1.02;font-weight:760;letter-spacing:-2.6px}
.em{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;color:#b4502c;font-size:1.12em;letter-spacing:-.5px;background-image:linear-gradient(transparent 58%,rgba(217,119,87,.30) 58%,rgba(217,119,87,.30) 92%,transparent 92%);padding:0 .05em}
.sub{position:absolute;left:64px;top:196px;width:1060px;font-size:24px;line-height:1.42;color:#4f4c45}
.sub b{color:#1f1e1b;font-weight:650}
.frame{position:absolute;left:64px;right:64px;top:300px;background:#1a1a1a;border-radius:20px;padding:22px 24px;box-shadow:0 1px 2px rgba(31,30,27,.06),0 30px 70px -18px rgba(31,30,27,.38)}
.zoom{zoom:1.1;position:relative}
.ring{position:absolute;border:3px solid #d97757;border-radius:12px;box-shadow:0 0 0 6px rgba(217,119,87,.20)}
.chat{display:flex;justify-content:flex-end;margin-bottom:16px}
.chat span{background:#2a2a28;border-radius:14px;padding:8px 14px;font-size:16px;color:#d6d3cc}
.foot{position:absolute;left:64px;right:64px;bottom:36px;display:flex;justify-content:space-between;align-items:center;font-size:18px;color:#6b675e}
.cmd{font:500 17px "SF Mono",ui-monospace,Menlo,monospace;white-space:nowrap;color:#1f1e1b;background:#fff;border:1px solid #e4e0d6;border-radius:12px;padding:10px 16px}
.cmd b{color:#6b675e;font-weight:500;margin-right:10px}
''' + BAND_CSS + '''</style></head><body>
<div class="top"><span class="brand">''' + MARK.format(s=34) + '''session-usage-band</span><span>hmarzban.github.io/claude-mod</span></div>
<h1>Know what your next message <span class="em">costs.</span></h1>
<p class="sub">Step away and Claude Code's cache goes cold. The next message then costs <b>25× more</b> on Opus 5.5. This band shows the countdown and the price.</p>
<div class="frame"><div class="zoom" id="z"><div class="chat"><span>great, I'm grabbing lunch. back in an hour or so</span></div><div class="band">{band}</div></div></div>
<div class="foot"><span class="cmd"><b>$</b>claude plugin install session-usage-band --marketplace HMarzban/claude-mod</span><span>Free · MIT · desktop and terminal</span></div>
<script>
const z = document.getElementById('z'), c = document.querySelector('[data-key=cache]')
const zr = z.getBoundingClientRect(), r = c.getBoundingClientRect(), k = 1.1, pad = 6
const d = document.createElement('div'); d.className = 'ring'
Object.assign(d.style, {left: (r.left - zr.left) / k - pad + 'px', top: (r.top - zr.top) / k - pad + 'px', width: r.width / k + 2 * pad + 'px', height: r.height / k + 2 * pad + 'px'})
z.appendChild(d)
</script>
</body></html>'''


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
# One row per layout, in the command's order: calm, then the cache's last minute.
LAYOUTS = [([f'layout-{k}', f'layout-{k}-amber'], t, d) for k, t, d in [
    ('chips', 'Chips', 'the default: a row of pills'),
    ('gauges', 'Gauges', 'room left on each bar; a tick marks the window gone'),
    ('ledger', 'Ledger', 'one plain sentence'),
    ('rings', 'Rings', 'a ring per reading'),
    ('pulse', 'Pulse', 'cost per message and the 5h trend'),
    ('tiles', 'Tiles', 'equal tiles, each its figure, then its label'),
    ('week', 'Week', 'the 7d window as days'),
    ('departures', 'Departures', 'every reading a countdown, soonest first'),
    ('forecast', 'Forecast', 'each next change at its clock time'),
]]
GTHEME = {
    'light': dict(bg='#faf9f5', text='#1f1e1b', text3='#6b675e', shadow='0 1px 2px rgba(31,30,27,.06), 0 12px 30px -12px rgba(31,30,27,.3)'),
    'dark': dict(bg='#141413', text='#f2f0eb', text3='#8a877f', shadow='0 0 0 1px #2f2e2b'),
}

EXPANDED = '''<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1012px;background:#1a1a1a;overflow:hidden}
body{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:24px}
''' + BAND_CSS + '''</style></head><body><div class="band">{band}</div></body></html>'''


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
        open(f'{out}/{name}-{th}.html', 'w').write(page)


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    trees = {}
    for line in open(src):
        _, name, js = line.split(' ', 2)
        trees[name] = json.loads(js)
    open(f'{out}/social.html', 'w').write(SOCIAL.replace('{band}', node(trees['amber'])))
    open(f'{out}/anatomy.html', 'w').write(ANATOMY.replace('{band}', node(trees['calm'])))
    open(f'{out}/expanded.html', 'w').write(EXPANDED.replace('{band}', node(trees['amberOpen'])))
    gallery(out, 'states', STATES, trees)
    gallery(out, 'layouts', LAYOUTS, trees)
    print('stills')
