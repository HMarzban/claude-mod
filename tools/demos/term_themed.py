"""The terminal demo in the site's style, light or dark: the band's real
terminal trees (frames.txt) in a dark terminal window on the page colour."""
import sys

import render as R
from common import trees
from render_desk import SITE

THEMES = {
    'light': dict(SITE['light'], shadow='0 1px 2px rgba(31,30,27,.06), 0 24px 60px -16px rgba(31,30,27,.32)'),
    'dark': dict(SITE['dark'], shadow='0 0 0 1px #2f2e2b, 0 24px 60px -16px rgba(0,0,0,.6)'),
}
CAPS = {
    'reply': ('Claude just ', 'replied', '.', 'The cache is warm for an hour.'),
    'm20': ('20 minutes ', 'later', '.', 'The countdown runs.'),
    'm45': ('45 minutes ', 'later', '.', ''),
    'last': ('Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    'last2': ('Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    'cold': ('Gone ', 'cold', '.', 'You know the price before you hit enter.'),
    'cards': ('▵ opens ', 'every', ' fact.', 'Cache, spend, context and limits.'),
}
src, out, theme = sys.argv[1:4]
for name, tree in trees(src).items():
    pre, acc, post, rest = CAPS[name]
    cap = f'{pre}<span class="em hl">{acc}</span>{post} <span class="rest">{rest}</span>'
    page = R.PAGE.format(**THEMES[theme], lh=R.LH, cap=cap, band=R.node(tree))
    open(f'{out}/{name}.html', 'w').write(page)
print(theme)
