"""Version every local asset docs/index.html names by its contents, so a
changed file gets a new URL and no cache keeps the old one: browsers' long
favicon stores and link-preview caches included.

    python3 cachebust.py ../../docs/index.html ../../docs

A quoted file name (relative, or under the site's URL) that exists in the
docs folder gets `?v=` and the first 10 hex digits of its SHA-256; an old
`?v=` is replaced, so running it twice changes nothing. Data URIs and names
of files that aren't there are left alone.
"""
import hashlib
import os
import re
import sys

from common import read, write

SITE = 'https://hmarzban.github.io/nextcost/'
NAME = re.compile(rf"""(["'])((?:{re.escape(SITE)})?)([A-Za-z0-9._-]+\.(?:png|svg|mp4|gif|jpg|webp|ico))(?:\?v=[0-9a-f]+)?\1""")

page, docs = sys.argv[1], sys.argv[2]
digests = {}


def digest(name):
    if name not in digests:
        with open(os.path.join(docs, name), 'rb') as f:
            digests[name] = hashlib.sha256(f.read()).hexdigest()[:10]
    return digests[name]


def version(m):
    quote, prefix, name = m.group(1), m.group(2), m.group(3)
    if not os.path.isfile(os.path.join(docs, name)):
        return m.group(0)
    return f'{quote}{prefix}{name}?v={digest(name)}{quote}'


write(page, NAME.sub(version, read(page)))
print(f'cachebust: {len(digests)} assets versioned: ' + ', '.join(sorted(digests)))
