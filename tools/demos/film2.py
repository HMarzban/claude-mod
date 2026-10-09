"""The film, restyled to the site: the same timeline, camera and real band
frames as film.py, with the site's type, a highlighter, a chapter bar and the
mark, rendered in a light and a dark theme.

    python3 film2.py film.txt OUT_DIR light|dark
"""
import json
import math
import sys

import film as F  # loads the real band trees from argv[1]
from render_desk import node

THEMES = {
    'light': dict(bg='#faf9f5', text='#1f1e1b', text2='#4f4c45', text3='#6b675e', accent='#b4502c', hl='rgba(217,119,87,.30)',
                  surface='#ffffff', line='#e4e0d6', shadow='0 1px 2px rgba(31,30,27,.06), 0 30px 70px -16px rgba(31,30,27,.32)', ring='#e4e0d6'),
    'dark': dict(bg='#141413', text='#f2f0eb', text2='#b4b0a7', text3='#8a877f', accent='#d97757', hl='rgba(217,119,87,.32)',
                 surface='#1b1b1a', line='#2f2e2b', shadow='0 0 0 1px #2f2e2b, 0 30px 70px -16px rgba(0,0,0,.6)', ring='#3b3934'),
}

CAPTIONS = [
    (2.3, 3.6, 'You head to ', 'lunch', '.', 'The cache stays warm for an hour.'),
    (3.6, 7.0, 'The battery ', 'drains', '', 'as the cache ages.'),
    (7.0, 9.4, 'Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    (9.4, 11.0, 'Gone ', 'cold', '.', 'You know the price before you hit enter.'),
    (11.0, 14.4, '▿ opens ', 'every', ' fact.', 'Cache, spend, context and limits.'),
]
CHAPTERS = [('Lunch', 2.3, 3.6), ('Countdown', 3.6, 7.0), ('Last minute', 7.0, 9.4), ('Cold', 9.4, 11.0), ('The cards', 11.0, 14.4)]

MARK = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1f1e1b"/><circle cx="32" cy="32" r="21" fill="none" stroke="#3b3934" stroke-width="5"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d97757" stroke-width="5" stroke-linecap="round" stroke-dasharray="97 132" transform="rotate(-90 32 32)"/><rect x="20.5" y="25" width="20" height="14" rx="3.6" fill="none" stroke="#f2f0eb" stroke-width="3"/><rect x="41.8" y="28.8" width="3" height="6.4" rx="1.3" fill="#f2f0eb"/><rect x="24" y="28.5" width="7" height="7" rx="1.5" fill="#d97757"/></svg>'''


def caption_at(t):
    for a, b, pre, acc, post, rest in CAPTIONS:
        if a <= t < b:
            fade = min(F.clamp((t - a) / .35), F.clamp((b - t) / .35))
            sweep = F.ease((t - a - .2) / .55)
            return pre, acc, post, rest, fade, sweep
    return '', '', '', '', 0, 0


def chapters_at(t):
    out = []
    for name, a, b in CHAPTERS:
        fill = F.clamp((t - a) / (b - a))
        active = a <= t < b
        out.append(f'<div class="ch{" on" if active else ""}"><div class="track"><div class="fill" style="transform:scaleX({fill:.4f})"></div></div><span>{name}</span></div>')
    return ''.join(out)


def frame(i, theme):
    t = i / F.FPS
    title = min(F.clamp(t / .5), F.clamp((F.T_TITLE_OUT + .4 - t) / .4)) if t < F.T_APP_IN else 0
    title_sweep = F.ease((t - .5) / .8)
    endcard = F.clamp((t - F.T_END) / .6)
    end_sweep = F.ease((t - F.T_END - .5) / .8)
    app = F.clamp((t - F.T_TITLE_OUT) / .5) * (1 - endcard)
    pre, acc, post, rest, cap, sweep = caption_at(t)
    ring = 0.0
    if F.T_LAST_A <= t < F.T_COLD + .9:
        ring = (0.55 + 0.45 * math.sin((t - F.T_LAST_A) * 2 * math.pi * 1.1)) * min(1, (F.T_COLD + .9 - t) / .4)
    cursor = F.ramp(t, F.T_CURSOR_A, F.T_CLICK - .15) if F.T_CURSOR_A <= t < F.T_END + .4 else -1
    press = F.clamp(1 - abs(t - F.T_CLICK) / .12)
    ripple = F.clamp((t - F.T_CLICK) / .5) if F.T_CLICK <= t < F.T_CLICK + .5 else -1
    params = dict(zoom=F.zoom_at(t), focus='cache' if t < F.T_CURSOR_A else 'row', ring=ring, cursor=cursor, press=press, ripple=ripple)
    lapse = F.clamp(min((t - F.T_LAPSE_A) / .3, (F.T_LAPSE_B + .2 - t) / .3)) if F.T_LAPSE_A <= t < F.T_LAPSE_B + .2 else 0
    chrome = app * (1 - endcard)
    return PAGE.format(
        **THEMES[theme], band=node(F.trees[F.band_at(t)]), title=title, tsweep=title_sweep * 100, app=app,
        cap=cap, pre=pre, acc=acc, post=post, rest=rest, sweep=sweep * 100, clock=F.clock_at(t), chrome=chrome,
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
""" + F.PAGE[F.PAGE.index("const app = document.getElementById('app')"):]

if __name__ == '__main__':
    out, theme = sys.argv[2], sys.argv[3]
    n = int(F.DURATION * F.FPS)
    only = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else range(n)
    for i in only:
        open(f"{out}/f{i:04d}.html", 'w').write(frame(i, theme))
    print(theme, n)
