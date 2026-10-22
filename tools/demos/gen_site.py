"""Build docs/index.html: the site template with the band's real desktop
output (from the test kit) rendered in as the hero's live band.

    python3 gen_site.py out/site.txt site/template.html ../../docs/index.html [out/demo.txt]

site.txt fills the legacy {{<state>}} placeholders; demo.txt (beside site.txt
unless given) fills {{demo-chips-amber}}, the hero's first drawing, and
{{demo-json}}, every drawing as {layout: {state: {shut, open}}} for
<script type="application/json" id="demo-data">."""
import datetime
import json
import os
import sys

from common import plugin_version, trees, words
from render_desk import node


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
                scope = (c.get('hover') or {}).get('scope')
                if scope is not None:
                    tips[scope] = ' '.join(words(c).split())
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


# The live demo's drawings: every state in every layout, from demo.txt.
LAYOUTS = ('chips', 'pulse', 'departures')
STATES = ('calm', 'amber', 'cold', 'limit')


def demo_drawings(path):
    """{layout: {state: {shut, open}}}: each DEMO line's tree, its hover cards
    lifted onto their chips, drawn for the site. A countdown in the last
    minute is wrapped in <span class=cd>; departures draws its countdown on
    flap tiles inside an SVG, so its drawings carry none."""
    demo = {layout: {state: {} for state in STATES} for layout in LAYOUTS}
    for line in open(path):
        _, layout, state, look, js = line.rstrip('\n').split(' ', 4)
        tree = json.loads(js)
        lift_hovers(tree)
        demo[layout][state][look] = node(tree, site=True)
    for layout in LAYOUTS:
        for state in STATES:
            for look in ('shut', 'open'):
                body = demo[layout][state].get(look)
                assert body, f'no {layout} {state} {look} drawing in {path}'
                ticks = state == 'amber' and layout != 'departures'
                assert ('<span class=cd>' in body) == ticks, f'{layout} {state} {look}: countdown span {"missing" if ticks else "unexpected"}'
    return demo


def script_json(data):
    """JSON safe inside <script type="application/json">."""
    return json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/').replace('<!--', '<\\u0021--')


src, template, out = sys.argv[1], sys.argv[2], sys.argv[3]
demo_src = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(src), 'demo.txt')
states = {}
for name, tree in trees(src).items():
    lift_hovers(tree)
    states[name] = node(tree).replace('0:47', '<span class=cd>0:47</span>')

page = open(template).read()
# The release the page describes is the manifest's, and it is dated the day
# it was built (UTC), as the sitemap is: neither is typed into the template.
page = page.replace('{{version}}', plugin_version())
page = page.replace('{{built}}', datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d'))
for name, body in states.items():
    page = page.replace('{{' + name + '}}', body)
if '{{demo-' in page:
    demo = demo_drawings(demo_src)
    page = page.replace('{{demo-chips-amber}}', demo['chips']['amber']['shut'])
    page = page.replace('{{demo-json}}', script_json(demo))
assert '{{' not in page, 'unfilled placeholder'
open(out, 'w').write(page)
print({k: len(v) for k, v in states.items()}, len(page))
