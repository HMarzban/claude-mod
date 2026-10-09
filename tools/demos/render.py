"""Render the band's real terminal trees (from the test kit) as HTML frames.

Each tree is Box/Text/Button with flex props measured in terminal cells, so it
maps straight onto CSS flexbox with 1 cell = 1ch and 1 row = 1 line.
"""
import html
import json
import sys

LH = 1.45  # line height in em; one terminal row


def esc(s):
    return html.escape(s, quote=False)


def node(n):
    if n is None or n is False or n is True:
        return ''
    if isinstance(n, (str, int, float)):
        return esc(str(n))
    if isinstance(n, list):
        return ''.join(node(c) for c in n)
    t, p, kids = n.get('type'), n.get('props') or {}, n.get('children') or []
    if p.get('position') == 'absolute' or p.get('display') == 'none':
        return ''  # hover cards
    if t == 'Text':
        st = []
        if p.get('color'): st.append(f"color:{p['color']}")
        if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
        if p.get('bold'): st.append('font-weight:700')
        if p.get('dimColor'): st.append('opacity:.55')
        return f"<span style=\"{';'.join(st)}\">{node(kids)}</span>"
    if t == 'Button':
        label = esc(p.get('label', ''))
        if p.get('plain'):
            op = 'opacity:.55;' if p.get('dimColor') else ''
            return f"<span style=\"{op}\">{label}</span>"
        hk = p.get('hotkey')
        mark = f"<span style=\"color:#d97757\">{esc(hk)}</span> " if hk else ''
        return f"<span>[ {mark}{label} ]</span>"
    # Box
    st = ['display:flex', f"flex-direction:{p.get('flexDirection', 'row')}"]
    if p.get('flexWrap'): st.append(f"flex-wrap:{p['flexWrap']}")
    if 'columnGap' in p: st.append(f"column-gap:{p['columnGap']}ch")
    if 'rowGap' in p: st.append(f"row-gap:{p['rowGap'] * LH}em")
    if 'paddingX' in p: st.append(f"padding:0 {p['paddingX']}ch")
    if 'marginTop' in p: st.append(f"margin-top:{p['marginTop'] * LH}em")
    if isinstance(p.get('width'), (int, float)): st.append(f"width:{p['width']}ch")
    if isinstance(p.get('minWidth'), (int, float)): st.append(f"min-width:{p['minWidth']}ch")
    if isinstance(p.get('height'), (int, float)): st.append(f"height:{p['height'] * LH}em")
    if 'flexGrow' in p: st.append(f"flex-grow:{p['flexGrow']}")
    if 'flexShrink' in p: st.append(f"flex-shrink:{p['flexShrink']}")
    if p.get('justifyContent'): st.append(f"justify-content:{p['justifyContent']}")
    if p.get('alignItems'): st.append(f"align-items:{p['alignItems']}")
    if p.get('overflow') == 'hidden': st.append('overflow:hidden')
    if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
    return f"<div style=\"{';'.join(st)}\">{node(kids)}</div>"


PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1000px;height:{h}px;overflow:hidden;background:#141413}}
body{{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:22px 26px}}
.cap{{color:#f2f0eb;font-size:19px;font-weight:650;height:30px}}
.cap span{{color:#a8a49c;font-weight:400}}
.cap em{{font-style:normal;color:#d97757}}
.term{{margin-top:10px;height:{th}px;display:flex;flex-direction:column;background:#1e1e1e;border:1px solid #34332f;border-radius:12px;overflow:hidden}}
.bar{{height:30px;display:flex;align-items:center;gap:7px;padding:0 12px;background:#262624;border-bottom:1px solid #34332f}}
.bar i{{width:11px;height:11px;border-radius:50%;background:#4a4945}}
.bar b{{margin-left:auto;margin-right:auto;color:#8f8c85;font:500 12px -apple-system,system-ui}}
.scr{{flex:1;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden;padding:14px 16px 16px;font:14.5px/{lh}em "SF Mono",ui-monospace,Menlo,monospace;color:#d4d4d8;white-space:pre}}
.chat{{color:#8f8c85}}
.prompt{{margin-top:{lh}em;border:1px solid #4a4945;border-radius:8px;padding:2px 10px;color:#8f8c85}}
</style></head><body>
<div class="cap">{cap}</div>
<div class="term"><div class="bar"><i></i><i></i><i></i><b>claude</b></div>
<div class="scr"><div class="chat">&gt; the re-warm price looks low on 1M-context sessions. why?</div>
<div class="chat" style="margin-top:{lh}em">⏺ /model names the model by an alias, opus[1m], which matched no</div>
<div class="chat">  read price. Pricing tokens at the model each reply is billed under.</div>
<div class="chat">⏺ Update(hooks/cache.ts)</div>
<div class="chat">  ⎿  Updated hooks/cache.ts with 12 additions and 3 removals</div>
<div class="chat">⏺ Bash(claude plugin test plugins/session-usage-band)</div>
<div class="chat">  ⎿  264 pass · 0 fail</div>
<div class="chat" style="margin-top:{lh}em">⏺ Done. The tests pass, and the change is committed.</div>
<div class="chat" style="margin-top:{lh}em">&gt; great, I'm grabbing lunch. back in an hour or so</div>
<div style="margin-top:{lh}em">{band}</div>
<div class="prompt">&gt; <span style="color:#d4d4d8">▌</span></div></div></div>
</body></html>"""

CAPS = {
    'reply': 'Claude just replied. <span>The cache is warm for an hour.</span>',
    'm20': '20 minutes later <span>· the countdown runs</span>',
    'm45': '45 minutes later',
    'last': 'Its last minute: <em>the band says what a cold cache will cost</em>',
    'last2': 'Its last minute: <em>the band says what a cold cache will cost</em>',
    'cold': 'Gone cold. <span>Now you know what the next message costs.</span>',
    'cards': '▿ opens every fact <span>· cache, spend, context, limits</span>',
}

if __name__ == '__main__':
    frames_txt, out = sys.argv[1], sys.argv[2]
    for line in open(frames_txt):
        _, name, js = line.split(' ', 2)
        tree = json.loads(js)
        open(f"{out}/{name}.html", 'w').write(PAGE.format(h=560, th=488, lh=LH, cap=CAPS[name], band=node(tree)))
        print(name)
