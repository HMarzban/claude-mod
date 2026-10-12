"""A 17-second film of the band in the desktop app, frame by frame, in a
light or a dark theme.

Every band in it is the band's real desktop tree from the test kit (film.txt),
drawn by render_desk.node(). The film adds a camera, captions, a chapter bar,
a clock and a cursor around it. Each frame is a static page; a script measures
the real chips and places the camera, ring and cursor before the screenshot.

    python3 film.py film.txt OUT_DIR light|dark
"""
import json
import math
import sys

from render_desk import node

FPS = 30


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):  # ease-in-out cubic
    x = clamp(x)
    return 4 * x * x * x if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def ramp(t, a, b):
    return ease((t - a) / (b - a)) if b > a else float(t >= a)


# ---- the timeline, in seconds ------------------------------------------
T_TITLE_OUT, T_APP_IN = 1.9, 2.3
T_LAPSE_A, T_LAPSE_B = 3.6, 7.0
T_LAST_A, T_LAST_B = 7.0, 9.4
T_COLD = 9.4
T_CURSOR_A, T_CLICK = 11.0, 12.3
T_END = 14.4
DURATION = 17.0


def band_at(t, minutes):
    if t < T_LAPSE_A:
        return 's0'
    if t < T_LAPSE_B:  # the hour, minute by minute, easing in and out
        sim = ease((t - T_LAPSE_A) / (T_LAPSE_B - T_LAPSE_A)) * 3539
    elif t < T_LAST_B:  # the last minute, linearly
        sim = 3541 + (t - T_LAST_A) / (T_LAST_B - T_LAST_A) * 56
    elif t < T_CLICK:
        return 'cold'
    else:
        return 'cards'
    best = max([m for m in minutes if m <= sim] or [0])
    return f's{best}'


def clock_at(t):
    sim = 0 if t < T_LAPSE_A else (3480 * ease((t - T_LAPSE_A) / (T_LAPSE_B - T_LAPSE_A)) if t < T_LAPSE_B else 3480 + min(1, (t - T_LAST_A) / (T_LAST_B - T_LAST_A)) * 119 + (max(0, t - T_LAST_B) * 6))
    mins = 12 * 60 + 31 + int(sim // 60)
    h, m = divmod(mins, 60)
    h12 = h if h <= 12 else h - 12
    return f"{h12}:{m:02d} PM"


def zoom_at(t):
    z = 1 + .42 * ramp(t, T_LAPSE_A + .3, T_LAPSE_B)  # push in on the band
    z -= .42 * ramp(t, T_CURSOR_A - .7, T_CURSOR_A + .3)  # all the way back out for the click
    return z


THEMES = {
    'light': dict(bg='#faf9f5', text='#1f1e1b', text3='#6b675e', accent='#b4502c', hl='rgba(217,119,87,.30)',
                  surface='#ffffff', line='#e4e0d6', shadow='0 1px 2px rgba(31,30,27,.06), 0 30px 70px -16px rgba(31,30,27,.32)'),
    'dark': dict(bg='#141413', text='#f2f0eb', text3='#8a877f', accent='#d97757', hl='rgba(217,119,87,.32)',
                 surface='#1b1b1a', line='#2f2e2b', shadow='0 0 0 1px #2f2e2b, 0 30px 70px -16px rgba(0,0,0,.6)'),
}

# Each chapter: its span, its name on the chapter bar, and its caption.
CHAPTERS = [
    (T_APP_IN, T_LAPSE_A, 'Lunch', 'You head to ', 'lunch', '.', 'The cache stays warm for an hour.'),
    (T_LAPSE_A, T_LAPSE_B, 'Countdown', 'The battery ', 'drains', '', 'as the cache ages.'),
    (T_LAST_A, T_LAST_B, 'Last minute', 'Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    (T_COLD, T_CURSOR_A, 'Cold', 'Gone ', 'cold', '.', 'You know the price before you hit enter.'),
    (T_CURSOR_A, T_END, 'The cards', '▵ opens ', 'every', ' fact.', 'Cache, spend, context and limits.'),
]

MARK = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1f1e1b"/><circle cx="32" cy="32" r="21" fill="none" stroke="#3b3934" stroke-width="5"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d97757" stroke-width="5" stroke-linecap="round" stroke-dasharray="97 132" transform="rotate(-90 32 32)"/><rect x="20.5" y="25" width="20" height="14" rx="3.6" fill="none" stroke="#f2f0eb" stroke-width="3"/><rect x="41.8" y="28.8" width="3" height="6.4" rx="1.3" fill="#f2f0eb"/><rect x="24" y="28.5" width="7" height="7" rx="1.5" fill="#d97757"/></svg>'''


def caption_at(t):
    for a, b, _, pre, acc, post, rest in CHAPTERS:
        if a <= t < b:
            fade = min(clamp((t - a) / .35), clamp((b - t) / .35))
            sweep = ease((t - a - .2) / .55)
            return pre, acc, post, rest, fade, sweep
    return '', '', '', '', 0, 0


def chapters_at(t):
    out = []
    for a, b, name, *_ in CHAPTERS:
        fill = clamp((t - a) / (b - a))
        active = a <= t < b
        out.append(f'<div class="ch{" on" if active else ""}"><div class="track"><div class="fill" style="transform:scaleX({fill:.4f})"></div></div><span>{name}</span></div>')
    return ''.join(out)


def frame(i, theme, trees, minutes):
    t = i / FPS
    title = min(clamp(t / .5), clamp((T_TITLE_OUT + .4 - t) / .4)) if t < T_APP_IN else 0
    title_sweep = ease((t - .5) / .8)
    endcard = clamp((t - T_END) / .6)
    end_sweep = ease((t - T_END - .5) / .8)
    app = clamp((t - T_TITLE_OUT) / .5) * (1 - endcard)
    pre, acc, post, rest, cap, sweep = caption_at(t)
    ring = 0.0
    if T_LAST_A <= t < T_COLD + .9:
        ring = (0.55 + 0.45 * math.sin((t - T_LAST_A) * 2 * math.pi * 1.1)) * min(1, (T_COLD + .9 - t) / .4)
    cursor = ramp(t, T_CURSOR_A, T_CLICK - .15) if T_CURSOR_A <= t < T_END + .4 else -1
    press = clamp(1 - abs(t - T_CLICK) / .12)
    ripple = clamp((t - T_CLICK) / .5) if T_CLICK <= t < T_CLICK + .5 else -1
    params = dict(zoom=zoom_at(t), focus='cache' if t < T_CURSOR_A else 'row', ring=ring, cursor=cursor, press=press, ripple=ripple)
    lapse = clamp(min((t - T_LAPSE_A) / .3, (T_LAPSE_B + .2 - t) / .3)) if T_LAPSE_A <= t < T_LAPSE_B + .2 else 0
    chrome = app * (1 - endcard)
    return PAGE.format(
        **THEMES[theme], band=node(trees[band_at(t, minutes)]), title=title, tsweep=title_sweep * 100, app=app,
        cap=cap, pre=pre, acc=acc, post=post, rest=rest, sweep=sweep * 100, clock=clock_at(t), chrome=chrome,
        lapse=lapse, end=endcard, esweep=end_sweep * 100, chapters=chapters_at(t), mark64=MARK.format(s=64), mark44=MARK.format(s=44),
        params=json.dumps(params))


PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=block">
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1280px;height:720px;overflow:hidden;background:{bg}}}
body{{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:{text};position:relative}}
.em{{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;color:{accent};letter-spacing:-.01em}}
.hl{{background-image:linear-gradient(transparent 58%,{hl} 58%,{hl} 92%,transparent 92%);background-repeat:no-repeat;padding:0 .06em;margin:0 -.06em}}
.title,.end{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}}
.title h1,.end h1{{font-size:66px;line-height:1.04;font-weight:760;letter-spacing:-2.4px;margin-top:26px}}
.title h1 .em,.end h1 .em{{font-size:1.12em}}
.title p{{font-size:21px;color:{text3};margin-top:18px}}
.stage{{position:absolute;left:140px;top:84px;width:1000px;height:556px;overflow:hidden;border-radius:18px;box-shadow:{shadow};background:#1a1a1a}}
.app{{position:absolute;inset:0;background:#1a1a1a;border-radius:18px;padding:16px 0 14px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;transform-origin:0 0}}
.chat{{padding:0 22px;color:#d6d3cc;font-size:15px;line-height:23px}}
.chat p{{margin-bottom:10px}} .chat .you{{background:#2a2a28;border-radius:14px;padding:8px 14px;margin:0 0 14px auto;width:fit-content;max-width:70%}}
.chat code{{font:13px "SF Mono",ui-monospace,Menlo,monospace;background:#262624;padding:1px 5px;border-radius:5px}}
.band{{margin:6px 10px 0;width:964px;background:#212121;border-radius:16px;padding:12px;font-size:15px;line-height:24px;color:#ececf2;white-space:pre;position:relative}}
.t{{white-space:pre}} .svg{{display:block;flex-shrink:0}}
.toggle{{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;background:#333336;color:#ececf2;font-size:13px}}
.btn{{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;border-radius:8px;background:#2e2e31;border:1px solid #3c3c40;color:#ececf2}}
.key{{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border:1px solid #55555e;border-radius:5px;font-size:12px;color:#b8b8c2}}
.input{{margin:10px 10px 0;height:50px;flex-shrink:0;border:1px solid #3a3a38;border-radius:16px;display:flex;align-items:center;padding:0 18px;color:#8f8c85;font-size:16px}}
.ring{{position:absolute;border:3px solid #d97757;border-radius:12px;pointer-events:none;box-shadow:0 0 0 6px rgba(217,119,87,.18)}}
.cap{{position:absolute;z-index:3;left:140px;top:26px;font-size:24px;font-weight:700;letter-spacing:-.4px;white-space:nowrap}}
.cap .em{{font-size:1.14em}} .cap .rest{{color:{text3};font-weight:400;font-size:19px;margin-left:10px;letter-spacing:0}}
.clock{{position:absolute;z-index:3;right:140px;top:24px;display:flex;align-items:center;gap:10px}}
.pill{{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:999px;background:{surface};border:1px solid {line};font:600 17px -apple-system,system-ui;color:{text};font-variant-numeric:tabular-nums}}
.pill svg{{width:17px;height:17px;fill:none;stroke:{accent};stroke-width:2;stroke-linecap:round}}
.lapse{{background:{accent};border-color:{accent};color:#fff;font-size:14px}} .lapse svg{{stroke:#fff}}
.chapters{{position:absolute;left:140px;right:140px;top:660px;display:flex;gap:10px}}
.ch{{flex:1;display:grid;gap:8px}} .ch .track{{height:4px;border-radius:2px;background:{line};overflow:hidden}}
.ch .fill{{height:100%;background:{accent};transform-origin:0 50%}}
.ch span{{font-size:13px;color:{text3};font-weight:500}} .ch.on span{{color:{text};font-weight:650}}
.cursor{{position:absolute;width:26px;height:26px;pointer-events:none}}
.rip{{position:absolute;border:2px solid #f2f0eb;border-radius:50%;pointer-events:none}}
.end .cmd{{margin-top:30px;font:500 19px "SF Mono",ui-monospace,Menlo,monospace;color:{text};background:{surface};border:1px solid {line};border-radius:14px;padding:15px 22px}}
.end .cmd b{{color:{text3};font-weight:500;margin-right:12px}}
.end p{{margin-top:18px;font-size:19px;color:{text3}}} .end p b{{color:{text};font-weight:650}}
</style></head><body>
<div class="title" style="opacity:{title}">{mark64}<h1>Your Claude Code cache<br>is about to <span class="em hl" style="background-size:{tsweep}% 100%">go cold.</span></h1><p>Do you know what your next message costs?</p></div>
<div class="cap" style="opacity:{cap}">{pre}<span class="em hl" style="background-size:{sweep}% 100%">{acc}</span>{post}<span class="rest">{rest}</span></div>
<div class="clock" style="opacity:{chrome}"><span class="pill lapse" style="opacity:{lapse}"><svg viewBox="0 0 24 24"><path d="M5 6l7 6-7 6zM12 6l7 6-7 6z"/></svg>time-lapse</span><span class="pill"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>{clock}</span></div>
<div class="stage" style="opacity:{app}"><div class="app" id="app">
<div class="chat">
<div class="you">the re-warm price looks low on 1M-context sessions. can you find out why?</div>
<p><code>/model</code> names the model by an alias, <code>opus[1m]</code>, which matched no read price, so cache reads were weighed at 0.1× instead of 0.05×. I now price tokens at the model each reply is billed under.</p>
<div class="you">nice. can you add a unit test for the transcript reader too?</div>
<p>Added <code>lastReplyModel</code> tests to <code>tests/memory.test.ts</code>. All 264 tests pass, and the change is committed.</p>
<div class="you">great, I'm grabbing lunch. back in an hour or so</div>
</div>
<div class="band" id="band">{band}</div>
<div class="input">Type / for commands</div>
</div></div>
<div class="chapters" style="opacity:{chrome}">{chapters}</div>
<div class="end" style="opacity:{end}">{mark44}<h1>Know what your next message <span class="em hl" style="background-size:{esweep}% 100%">costs.</span></h1>
<div class="cmd"><b>$</b>claude plugin install session-usage-band --marketplace HMarzban/claude-mod</div>
<p><b>session-usage-band</b> · free and open source · hmarzban.github.io/claude-mod</p></div>
<script>
const P = {params};
const app = document.getElementById('app'), stage = app.parentElement;
const sr = stage.getBoundingClientRect();
const rel = el => {{ const r = el.getBoundingClientRect(); return {{x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height}}; }};
const chipR = rel(document.querySelector('[data-key=cache]'));
const rowR = rel(document.querySelector('[data-key=row]'));
const moreEl = document.querySelector('[data-key=more]');
const moreR = moreEl ? rel(moreEl) : null;
const target = P.focus === 'cache' ? chipR : rowR;
const fx = target.x + target.w / 2, fy = target.y + target.h / 2;
const z = P.zoom;
// blend from holding the focus point still (k=0) to bringing it to the goal (k=1)
const gx = 430, gy = 400, k = Math.min(1, Math.max(0, (z - 1) / 0.42));
const tx = (1 - k) * (fx - z * fx) + k * (gx - z * fx);
const ty = (1 - k) * (fy - z * fy) + k * (gy - z * fy);
app.style.transform = `translate(${{tx}}px, ${{ty}}px) scale(${{z}})`;
const toStage = b => ({{x: tx + z * b.x, y: ty + z * b.y, w: z * b.w, h: z * b.h}});
if (P.ring > 0.01) {{
  const c = toStage(chipR), pad = 7 * z;
  const d = document.createElement('div'); d.className = 'ring';
  Object.assign(d.style, {{left: (c.x - pad) + 'px', top: (c.y - pad) + 'px', width: (c.w + 2 * pad) + 'px', height: (c.h + 2 * pad) + 'px', opacity: P.ring}});
  stage.appendChild(d);
}}
if (P.cursor >= 0 && moreR) {{
  const m = toStage(moreR);
  const ex = m.x + m.w * 0.55, ey = m.y + m.h * 0.6;
  const sx = 640, sy = 300, e = P.cursor;
  const x = sx + (ex - sx) * e, y = sy + (ey - sy) * e;
  const s = 1 - 0.18 * P.press;
  const cur = document.createElement('div'); cur.className = 'cursor';
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 20 L9 15.5 L12.5 22 L15.5 20.6 L12 14 L18.5 14 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  Object.assign(cur.style, {{left: x + 'px', top: y + 'px', transform: `scale(${{s}})`, transformOrigin: '4px 2px'}});
  stage.appendChild(cur);
  if (P.ripple >= 0) {{
    const r = 6 + 34 * P.ripple, rp = document.createElement('div'); rp.className = 'rip';
    Object.assign(rp.style, {{left: (ex - r) + 'px', top: (ey - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px', opacity: 1 - P.ripple}});
    stage.appendChild(rp);
  }}
}}
</script>
</body></html>"""

if __name__ == '__main__':
    src, out, theme = sys.argv[1:4]
    trees = {}
    for line in open(src):
        _, name, js = line.split(' ', 2)
        trees[name] = json.loads(js)
    minutes = sorted(int(k[1:]) for k in trees if k.startswith('s'))
    n = int(DURATION * FPS)
    for i in range(n):
        open(f"{out}/f{i:04d}.html", 'w').write(frame(i, theme, trees, minutes))
    print(theme, n)
