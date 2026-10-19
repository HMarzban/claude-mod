"""Render the band's real desktop trees (from the test kit) as HTML frames,
laid out like the desktop app's Code tab. Metrics are calibrated against a
real screenshot: 10px per column, 24px per text row, 12px per gap row.

node(tree) draws a band for the film, the terminal demo and the stills;
node(tree, site=True) draws it for the landing page's live band: the band's
buttons are real <button>s, its icons have alt="", and a countdown in the
cache's last minute (`0:40 left`, `40s left`) is wrapped in <span class=cd>
so the page can tick it."""
import base64
import html
import re

COL, ROW, GAP = 10, 24, 12


# A countdown in the cache's last minute, as the chips (`0:40 left`) and the
# pulse (`40s left`) draw it; never a clock time (`cold at 15:45`) or `54m left`.
COUNTDOWN = re.compile(r'(\d+:\d\d|\d+s)(?= left)')


def esc(s, site=False):
    s = html.escape(s, quote=False)
    return COUNTDOWN.sub(r'<span class=cd>\1</span>', s) if site else s


def node(n, parent_row=False, site=False):
    if n is None or isinstance(n, bool):
        return ''
    if isinstance(n, (str, int, float)):
        return f"<span class=t>{esc(str(n), site)}</span>"
    if isinstance(n, list):
        return ''.join(node(c, parent_row, site) for c in n)
    t, p, kids = n.get('type'), n.get('props') or {}, n.get('children') or []
    if p.get('position') == 'absolute' or p.get('display') == 'none':
        return ''
    if t == 'Text':
        st = []
        if p.get('color'): st.append(f"color:{p['color']}")
        if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
        if p.get('bold'): st.append('font-weight:600')
        if p.get('dimColor'): st.append('opacity:.55')
        inner = ''.join(esc(c, site) if isinstance(c, str) else node(c, site=site) for c in kids)
        return f"<span class=t style=\"{';'.join(st)}\">{inner}</span>"
    if t == 'Svg':
        src = base64.b64encode(p['source'].encode()).decode()
        h = p.get('height')
        if site:
            st = f"width:{p['width']}px;height:{h}px" if 'width' in p else f"flex:1;min-width:0;width:100%;height:{h}px"
            return f"<img class=svg alt=\"\" src=\"data:image/svg+xml;base64,{src}\" style=\"{st}\">"
        if 'width' in p:
            return f"<img class=svg src=\"data:image/svg+xml;base64,{src}\" style=\"width:{p['width']}px;height:{h}px\">"
        return f"<img class=svg src=\"data:image/svg+xml;base64,{src}\" style=\"flex:1;min-width:0;width:100%;height:{h}px\">"
    if t == 'Button':
        label = esc(p.get('label', ''))
        if site:
            return site_button(p, label)
        if p.get('key') == 'more':
            return f"<span class=toggle data-key=more>{label}</span>"
        hk = p.get('hotkey')
        badge = f"<span class=key>{esc(hk.upper())}</span>" if hk else ''
        return f"<span class=btn>{label}{badge}</span>"
    st = ['display:flex', f"flex-direction:{p.get('flexDirection', 'row')}"]
    row = p.get('flexDirection', 'row') == 'row'
    if row: st.append(f"align-items:{p.get('alignItems', 'center')}")
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
    elif p.get('backgroundColor') and row:
        st.append(f"border-radius:8px;padding:0 {padx}px;height:{ROW + 4}px")
    elif p.get('backgroundColor'):  # a layout's panel, as tall as its rows
        st.append(f"border-radius:8px;padding:2px {padx}px")
    elif padx:
        st.append(f"padding:0 {padx}px")
    if p.get('backgroundColor'): st.append(f"background:{p['backgroundColor']}")
    dk = f" data-key=\"{html.escape(str(p['key']))}\"" if p.get('key') else ''
    if p.get('tip'): dk += f" data-tip=\"{html.escape(p['tip'])}\""
    return f"<div{dk} style=\"{';'.join(st)}\">{node(kids, site=site)}</div>"


def site_button(p, label):
    """A band button as a real <button>: the ▵/▿ toggle named for what it
    does, with aria-expanded; any other by its label, its hotkey badge hidden."""
    key = f" data-key=\"{html.escape(str(p['key']))}\"" if p.get('key') else ''
    if p.get('key') == 'more':
        shut = p.get('label') != '▿'  # ▵ while shut, ▿ while open
        name, expanded = ('Show details', 'false') if shut else ('Hide details', 'true')
        return f"<button type=button class=toggle{key} aria-label=\"{name}\" aria-expanded={expanded}>{label}</button>"
    hk = p.get('hotkey')
    badge = f"<span class=key aria-hidden=true>{esc(hk.upper())}</span>" if hk else ''
    return f"<button type=button class=btn{key}>{label}{badge}</button>"


# The CSS node()'s HTML is drawn with, for every page that shows a band.
BAND_CSS = '''
.band{width:964px;background:#212121;border-radius:16px;padding:12px;font-size:15px;line-height:24px;color:#ececf2;white-space:pre;position:relative}
.t{white-space:pre} .svg{display:block;flex-shrink:0}
.toggle{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:7px;background:#333336;color:#ececf2;font-size:13px}
.btn{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 6px 0 12px;border-radius:8px;background:#2e2e31;border:1px solid #3c3c40;color:#ececf2}
.key{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;border:1px solid #55555e;border-radius:5px;font-size:12px;color:#b8b8c2}
'''

# The project's mark; MARK.format(s=size).
MARK = '''<svg viewBox="0 0 64 64" width="{s}" height="{s}" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#1f1e1b"/><circle cx="32" cy="32" r="21" fill="none" stroke="#3b3934" stroke-width="5"/><circle cx="32" cy="32" r="21" fill="none" stroke="#d97757" stroke-width="5" stroke-linecap="round" stroke-dasharray="97 132" transform="rotate(-90 32 32)"/><rect x="20.5" y="25" width="20" height="14" rx="3.6" fill="none" stroke="#f2f0eb" stroke-width="3"/><rect x="41.8" y="28.8" width="3" height="6.4" rx="1.3" fill="#f2f0eb"/><rect x="24" y="28.5" width="7" height="7" rx="1.5" fill="#d97757"/></svg>'''

# The site's page colours, for every demo page; each adds its own shadow.
SITE = {
    'light': dict(bg='#faf9f5', text='#1f1e1b', text3='#6b675e', accent='#b4502c', hl='rgba(217,119,87,.30)'),
    'dark': dict(bg='#141413', text='#f2f0eb', text3='#8a877f', accent='#d97757', hl='rgba(217,119,87,.32)'),
}
