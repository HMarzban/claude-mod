"""A 17-second film of the band in the desktop app, frame by frame.

Every band in it is the band's real desktop tree from the test kit (film.txt),
drawn by render_desk.node(). The film adds a camera, captions, a clock and a
cursor around it. Each frame is a static page; a script measures the real
chips and places the camera, ring and cursor before the screenshot.
"""
import json
import math
import sys

from render_desk import node

FPS = 30
W, H = 1280, 720


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(x):  # ease-in-out cubic
    x = clamp(x)
    return 4 * x * x * x if x < .5 else 1 - (-2 * x + 2) ** 3 / 2


def ramp(t, a, b):
    return ease((t - a) / (b - a)) if b > a else float(t >= a)


trees = {}
for line in open(sys.argv[1]):
    _, name, js = line.split(' ', 2)
    trees[name] = json.loads(js)
minutes = sorted(int(k[1:]) for k in trees if k.startswith('s'))

# ---- the timeline, in seconds ------------------------------------------
T_TITLE_OUT, T_APP_IN = 1.9, 2.3
T_LAPSE_A, T_LAPSE_B = 3.6, 7.0
T_LAST_A, T_LAST_B = 7.0, 9.4
T_COLD = 9.4
T_CURSOR_A, T_CLICK = 11.0, 12.3
T_END = 14.4
DURATION = 17.0


def band_at(t):
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


CAPTIONS = [
    (2.3, 3.6, 'You head to lunch.', 'The cache stays warm for an hour.'),
    (3.6, 7.0, 'The battery drains', 'as the cache ages.'),
    (7.0, 9.4, 'Its last minute:', 'the band tells you what going cold will cost.'),
    (9.4, 11.0, 'Gone cold.', 'You know the price before you hit enter.'),
    (11.0, 14.4, '▿ opens every fact.', 'Cache, spend, context and limits.'),
]


def caption_at(t):
    for a, b, strong, rest in CAPTIONS:
        if a <= t < b:
            fade = min(clamp((t - a) / .35), clamp((b - t) / .35))
            return strong, rest, fade
    return '', '', 0


def zoom_at(t):
    z = 1 + .42 * ramp(t, T_LAPSE_A + .3, T_LAPSE_B)  # push in on the band
    z -= .42 * ramp(t, T_CURSOR_A - .7, T_CURSOR_A + .3)  # all the way back out for the click
    return z


def frame(i):
    t = i / FPS
    title = min(clamp(t / .5), clamp((T_TITLE_OUT + .4 - t) / .4)) if t < T_APP_IN else 0
    endcard = clamp((t - T_END) / .6)
    app = clamp((t - T_TITLE_OUT) / .5) * (1 - .94 * endcard)
    strong, rest, cap = caption_at(t)
    ring = 0.0
    if T_LAST_A <= t < T_COLD + .9:
        ring = (0.55 + 0.45 * math.sin((t - T_LAST_A) * 2 * math.pi * 1.1)) * min(1, (T_COLD + .9 - t) / .4)
    cursor = ramp(t, T_CURSOR_A, T_CLICK - .15) if T_CURSOR_A <= t < T_END + .4 else -1
    press = clamp(1 - abs(t - T_CLICK) / .12)
    ripple = clamp((t - T_CLICK) / .5) if T_CLICK <= t < T_CLICK + .5 else -1
    params = dict(zoom=zoom_at(t), focus='cache' if t < T_CURSOR_A else 'row', ring=ring,
                  cursor=cursor, press=press, ripple=ripple)
    lapse = clamp(min((t - T_LAPSE_A) / .3, (T_LAPSE_B + .2 - t) / .3)) if T_LAPSE_A <= t < T_LAPSE_B + .2 else 0
    return PAGE.format(
        band=node(trees[band_at(t)]), title=title, app=app, cap=cap, strong=strong, rest=rest,
        clock=clock_at(t), clockop=app * (1 - endcard), lapse=lapse, end=endcard,
        params=json.dumps(params))


PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1280px;height:720px;overflow:hidden;background:#141413}}
body{{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#f2f0eb;position:relative}}
.title{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}}
.title h1{{font-size:64px;line-height:1.05;font-weight:750;letter-spacing:-2px;text-align:center}}
.title h1 em{{font-style:normal;color:#d97757}}
.title p{{font-size:20px;color:#8f8c85}}
.stage{{position:absolute;left:140px;top:84px;width:1000px;height:560px;overflow:hidden;border-radius:16px}}
.app{{position:absolute;inset:0;background:#1a1a1a;border:1px solid #2f2f2d;border-radius:16px;padding:16px 0 14px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;transform-origin:0 0}}
.chat{{padding:0 22px;color:#d6d3cc;font-size:15px;line-height:23px}}
.chat p{{margin-bottom:10px}} .chat .you{{background:#2a2a28;border-radius:14px;padding:8px 14px;margin:0 0 14px auto;width:fit-content;max-width:70%}}
.chat code{{font:13px "SF Mono",ui-monospace,Menlo,monospace;background:#262624;padding:1px 5px;border-radius:5px}}
.band{{margin:6px 10px 0;width:964px;background:#212121;border-radius:16px;padding:12px;font-size:15px;line-height:24px;color:#ececf2;white-space:pre;position:relative}}
.t{{white-space:pre}} .svg{{display:block;flex-shrink:0}}
.toggle{{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;background:#333336;color:#ececf2;font-size:13px}}
.btn{{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;border-radius:8px;background:#2e2e31;border:1px solid #3c3c40;color:#ececf2}}
.key{{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border:1px solid #55555e;border-radius:5px;font-size:12px;color:#b8b8c2}}
.input{{margin:10px 10px 0;height:50px;flex-shrink:0;border:1px solid #3a3a38;border-radius:16px;display:flex;align-items:center;padding:0 18px;color:#8f8c85;font-size:16px}}
.ring{{position:absolute;border:3px solid #d97757;border-radius:12px;pointer-events:none}}
.cap{{position:absolute;z-index:3;left:140px;top:30px;font-size:21px;font-weight:650}} .cap span{{color:#a8a49c;font-weight:400}}
.clock{{position:absolute;z-index:3;right:140px;top:30px;display:flex;align-items:center;gap:10px;font:600 19px -apple-system,system-ui;color:#d6d3cc;font-variant-numeric:tabular-nums}}
.clock .ff{{color:#d97757;font-size:15px;font-weight:600}}
.cursor{{position:absolute;width:26px;height:26px;pointer-events:none}}
.rip{{position:absolute;border:2px solid #f2f0eb;border-radius:50%;pointer-events:none}}
.end{{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px}}
.end h1{{font-size:62px;font-weight:750;letter-spacing:-2px}} .end h1 em{{font-style:normal;color:#d97757}}
.end .cmd{{font:500 19px "SF Mono",ui-monospace,Menlo,monospace;color:#d6d3cc;background:#1e1e1d;border:1px solid #3a3a38;border-radius:12px;padding:14px 20px}}
.end .cmd b{{color:#6c6962;font-weight:500;margin-right:12px}}
.end p{{font-size:20px;color:#a8a49c}} .end p b{{color:#f2f0eb;font-weight:600}}
</style></head><body>
<div class="title" style="opacity:{title}"><h1>Your Claude Code cache<br>is about to <em>go cold.</em></h1><p>Do you know what your next message costs?</p></div>
<div class="cap" style="opacity:{cap}">{strong} <span>{rest}</span></div>
<div class="clock" style="opacity:{clockop}"><span class="ff" style="opacity:{lapse}">⏩ time-lapse</span>{clock}</div>
<div class="stage" style="opacity:{app}"><div class="app" id="app">
<div class="chat">
<div class="you">the re-warm price looks low on 1M-context sessions. can you find out why?</div>
<p><code>/model</code> names the model by an alias, <code>opus[1m]</code>, which matched no read price, so cache reads were weighed at 0.1× instead of 0.05×. I now price tokens at the model each reply is billed under.</p>
<div class="you">nice. can you add a unit test for the transcript reader too?</div>
<p>Added <code>lastReplyModel</code> tests to <code>tests/memory.test.ts</code>. All 263 tests pass, and the change is committed.</p>
<div class="you">great, I'm grabbing lunch. back in an hour or so</div>
</div>
<div class="band" id="band">{band}</div>
<div class="input">Type / for commands</div>
</div></div>
<div class="end" style="opacity:{end}"><h1>Know what your next message <em>costs.</em></h1>
<div class="cmd"><b>$</b>claude plugin marketplace add HMarzban/claude-mod</div>
<p><b>session-usage-band</b> · free and open source · github.com/HMarzban/claude-mod</p></div>
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
    out = sys.argv[2]
    n = int(DURATION * FPS)
    for i in range(n):
        open(f"{out}/f{i:04d}.html", 'w').write(frame(i))
    print(n)
