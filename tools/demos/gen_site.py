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


def lift_hovers(tree):
    """Move each hidden hover card's words onto the chip that shares its
    hover scope, as `tip`."""
    tips = {}

    def drop(n):
        if isinstance(n, list):
            for c in n:
                drop(c)
            return
        if not isinstance(n, dict):
            return
        keep = []
        for c in n.get('children') or []:
            p = (c.get('props') or {}) if isinstance(c, dict) else {}
            if p.get('position') == 'absolute' and p.get('display') == 'none':
                tips[(c.get('hover') or {}).get('scope')] = ' '.join(text(c).split())
            else:
                keep.append(c)
                drop(c)
        n['children'] = keep

    def tag(n):
        if isinstance(n, list):
            for c in n:
                tag(c)
            return
        if not isinstance(n, dict):
            return
        scope = (n.get('hover') or {}).get('scope')
        if scope in tips:
            n.setdefault('props', {})['tip'] = tips[scope]
        tag(n.get('children') or [])

    drop(tree)
    tag(tree)


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
