"""Build docs/index.html: the site template with the band's real desktop
states (live.txt, from the test kit) rendered in as the hero's live band."""
import html
import json
import sys

from render_desk import node


def text(n):
    if isinstance(n, str):
        return n
    if isinstance(n, dict):
        return ''.join(text(c) for c in n.get('children') or [])
    if isinstance(n, list):
        return ''.join(text(c) for c in n)
    return ''


def lift_hovers(n):
    """Move each hidden hover card's words onto its chip as `tip`."""
    if isinstance(n, list):
        for c in n:
            lift_hovers(c)
        return
    if not isinstance(n, dict):
        return
    kids = n.get('children') or []
    keep = []
    for c in kids:
        p = (c.get('props') or {}) if isinstance(c, dict) else {}
        if p.get('position') == 'absolute' and p.get('display') == 'none':
            n.setdefault('props', {})['tip'] = ' '.join(text(c).split())
        else:
            keep.append(c)
            lift_hovers(c)
    n['children'] = keep


src, template, out = sys.argv[1], sys.argv[2], sys.argv[3]
states = {}
for line in open(src):
    _, name, js = line.split(' ', 2)
    tree = json.loads(js)
    lift_hovers(tree)
    states[name] = node(tree).replace('0:47', '<span class=cd>0:47</span>')

page = open(template).read()
for name, body in states.items():
    page = page.replace('{{' + name + '}}', body)
assert '{{' not in page, 'unfilled placeholder'
open(out, 'w').write(page)
print({k: len(v) for k, v in states.items()}, len(page))
