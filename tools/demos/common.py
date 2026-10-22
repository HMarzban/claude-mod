"""What the demo scripts share: reading and writing a page, the capture's
lines and the layouts it draws, the text a drawn tree shows, the plugin's
version, and the CSS a Box's flex props ask for."""
import json
import os
from pathlib import Path

MANIFEST = os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../plugins/nextcost/.claude-plugin/plugin.json')


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def plugin_version():
    """The version in the plugin's manifest: the release the demos describe."""
    return json.loads(read(MANIFEST))['version']


def trees(path):
    """{name: tree} from a capture file's `<TAG> <name> <tree>` lines, in order."""
    out = {}
    with open(path) as f:
        for line in f:
            _, name, js = line.split(' ', 2)
            out[name] = json.loads(js)
    return out


def demo_layouts(path):
    """The layouts a capture's `DEMO <layout> ...` lines draw, in the order
    they first come: the capture's, which is LAYOUT_NAMES'."""
    with open(path) as f:
        return list(dict.fromkeys(line.split(' ', 2)[1] for line in f))


def words(n):
    """The text a drawn tree shows."""
    if isinstance(n, str):
        return n
    if isinstance(n, list):
        return ''.join(words(c) for c in n)
    if isinstance(n, dict):
        return ''.join(words(c) for c in n.get('children') or [])
    return ''


def flex_css(p, cell, gap, row, pad=False):
    """The CSS for a Box's flex props, from flex-wrap to justify-content.
    `cell`, `gap` and `row` turn a count of columns, gap rows and text rows
    into a CSS length. With `pad`, paddingX goes among them; the desktop pads
    beside its border and ground instead."""
    st = []
    if p.get('flexWrap'): st.append(f"flex-wrap:{p['flexWrap']}")
    if 'columnGap' in p: st.append(f"column-gap:{cell(p['columnGap'])}")
    if 'rowGap' in p: st.append(f"row-gap:{gap(p['rowGap'])}")
    if pad and 'paddingX' in p: st.append(f"padding:0 {cell(p['paddingX'])}")
    if 'marginTop' in p: st.append(f"margin-top:{gap(p['marginTop'])}")
    if isinstance(p.get('width'), (int, float)): st.append(f"width:{cell(p['width'])}")
    if isinstance(p.get('minWidth'), (int, float)): st.append(f"min-width:{cell(p['minWidth'])}")
    if isinstance(p.get('height'), (int, float)): st.append(f"height:{row(p['height'])}")
    if 'flexGrow' in p: st.append(f"flex-grow:{p['flexGrow']}")
    if 'flexShrink' in p: st.append(f"flex-shrink:{p['flexShrink']}")
    if p.get('justifyContent'): st.append(f"justify-content:{p['justifyContent']}")
    return st
