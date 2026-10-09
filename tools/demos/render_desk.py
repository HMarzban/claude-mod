"""Render the band's real desktop trees (from the test kit) as HTML frames,
laid out like the desktop app's Code tab. Metrics are calibrated against a
real screenshot: 10px per column, 24px per text row, 12px per gap row."""
import base64
import html
import json
import sys

COL, ROW, GAP = 10, 24, 12


def esc(s):
    return html.escape(s, quote=False)


def node(n, parent_row=False):
    if n is None or isinstance(n, bool):
        return ''
    if isinstance(n, (str, int, float)):
        return f"<span class=t>{esc(str(n))}</span>"
    if isinstance(n, list):
        return ''.join(node(c, parent_row) for c in n)
    t, p, kids = n.get('type'), n.get('props') or {}, n.get('children') or []
    if p.get('position') == 'absolute' or p.get('display') == 'none':
        return ''
    if t == 'Text':
        st = []
        if p.get('color'): st.append(f"color:{p['color']}")
        if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
        if p.get('bold'): st.append('font-weight:600')
        if p.get('dimColor'): st.append('opacity:.55')
        inner = ''.join(esc(c) if isinstance(c, str) else node(c) for c in kids)
        return f"<span class=t style=\"{';'.join(st)}\">{inner}</span>"
    if t == 'Svg':
        src = base64.b64encode(p['source'].encode()).decode()
        h = p.get('height')
        if 'width' in p:
            return f"<img class=svg src=\"data:image/svg+xml;base64,{src}\" style=\"width:{p['width']}px;height:{h}px\">"
        return f"<img class=svg src=\"data:image/svg+xml;base64,{src}\" style=\"flex:1;min-width:0;width:100%;height:{h}px\">"
    if t == 'Button':
        label = esc(p.get('label', ''))
        if p.get('key') == 'more':
            return f"<span class=toggle data-key=more>{label}</span>"
        hk = p.get('hotkey')
        badge = f"<span class=key>{esc(hk.upper())}</span>" if hk else ''
        return f"<span class=btn>{label}{badge}</span>"
    st = ['display:flex', f"flex-direction:{p.get('flexDirection', 'row')}"]
    row = p.get('flexDirection', 'row') == 'row'
    if row: st.append('align-items:center')
    if p.get('flexWrap'): st.append(f"flex-wrap:{p['flexWrap']}")
    if 'columnGap' in p: st.append(f"column-gap:{p['columnGap'] * COL}px")
    if 'rowGap' in p: st.append(f"row-gap:{p['rowGap'] * GAP}px")
    if 'marginTop' in p: st.append(f"margin-top:{p['marginTop'] * GAP}px")
    if isinstance(p.get('width'), (int, float)): st.append(f"width:{p['width'] * COL}px")
    if isinstance(p.get('minWidth'), (int, float)): st.append(f"min-width:{p['minWidth'] * COL}px")
    if isinstance(p.get('height'), (int, float)): st.append(f"height:{p['height'] * ROW}px")
    if 'flexGrow' in p: st.append(f"flex-grow:{p['flexGrow']}")
    if 'flexShrink' in p: st.append(f"flex-shrink:{p['flexShrink']}")
    if p.get('justifyContent'): st.append(f"justify-content:{p['justifyContent']}")
    if p.get('overflow') == 'hidden': st.append('overflow:hidden')
    padx = p.get('paddingX', 0) * COL
    if p.get('borderStyle'):
        st.append(f"border:1px solid {p.get('borderColor', '#55555e')};border-radius:12px;padding:11px {padx}px")
    elif p.get('backgroundColor'):
        st.append(f"border-radius:8px;padding:0 {padx}px;height:{ROW + 4}px")
    elif padx:
        st.append(f"padding:0 {padx}px")
    if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
    dk = f" data-key=\"{html.escape(str(p['key']))}\"" if p.get('key') else ''
    if p.get('tip'): dk += f" data-tip=\"{html.escape(p['tip'])}\""
    return f"<div{dk} style=\"{';'.join(st)}\">{node(kids)}</div>"


PAGE = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{width:1040px;height:{h}px;overflow:hidden;background:#141413}}
body{{font-family:-apple-system,system-ui,sans-serif;-webkit-font-smoothing:antialiased;padding:22px 23px}}
.cap{{color:#f2f0eb;font-size:19px;font-weight:650;height:30px}}
.cap span{{color:#a8a49c;font-weight:400}} .cap em{{font-style:normal;color:#d97757}}
.app{{margin-top:10px;height:{ah}px;background:#1a1a1a;border:1px solid #2f2f2d;border-radius:14px;padding:16px 0 14px;display:flex;flex-direction:column;justify-content:flex-end;overflow:hidden}}
.chat{{padding:0 22px;color:#d6d3cc;font-size:15px;line-height:23px}}
.chat p{{margin-bottom:10px}} .chat .you{{align-self:flex-end;background:#2a2a28;border-radius:14px;padding:8px 14px;margin:0 0 14px auto;width:fit-content;max-width:70%}}
.chat code{{font:13px "SF Mono",ui-monospace,Menlo,monospace;background:#262624;padding:1px 5px;border-radius:5px}}
.band{{margin:6px 10px 0;width:{bw}px;background:#212121;border-radius:16px;padding:12px 12px;font-size:15px;line-height:{row}px;color:#ececf2;white-space:pre}}
.t{{white-space:pre}}
.svg{{display:block;flex-shrink:0}}
.toggle{{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;background:#333336;color:#ececf2;font-size:13px}}
.btn{{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;border-radius:8px;background:#2e2e31;border:1px solid #3c3c40;color:#ececf2}}
.key{{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border:1px solid #55555e;border-radius:5px;font-size:12px;color:#b8b8c2}}
.input{{margin:10px 10px 0;height:50px;border:1px solid #3a3a38;border-radius:16px;display:flex;align-items:center;padding:0 18px;color:#8f8c85;font-size:16px}}
</style></head><body>
<div class="cap">{cap}</div>
<div class="app">
<div class="chat">
<div class="you">the re-warm price looks low on 1M-context sessions. can you find out why?</div>
<p><code>/model</code> names the model by an alias, <code>opus[1m]</code>, which matched no read price, so cache reads were weighed at 0.1× instead of 0.05×. I now price tokens at the model each reply is billed under.</p>
<div class="you">nice. can you add a unit test for the transcript reader too?</div>
<p>Added <code>lastReplyModel</code> tests to <code>tests/memory.test.ts</code>. All 263 tests pass, and the change is committed.</p>
<div class="you">great, I'm grabbing lunch. back in an hour or so</div>
</div>
<div class="band">{band}</div>
<div class="input">Type / for commands</div>
</div>
</body></html>"""

CAPS = {
    'reply': 'Claude just replied. <span>The cache is warm for an hour.</span>',
    'm19': '19 minutes later <span>· the battery drains</span>',
    'm45': '45 minutes later',
    'last': 'Its last minute: <em>the band says what a cold cache will cost</em>',
    'last2': 'Its last minute: <em>the band says what a cold cache will cost</em>',
    'cold': 'Gone cold. <span>Now you know what the next message costs.</span>',
    'cards': '▿ opens every fact <span>· cache, spend, context, limits</span>',
}

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    for line in open(src):
        _, name, js = line.split(' ', 2)
        tree = json.loads(js)
        open(f"{out}/d-{name}.html", 'w').write(
            PAGE.format(h=620, ah=546, bw=94 * COL + 24, row=ROW, cap=CAPS[name], band=node(tree)))
        print(name)
