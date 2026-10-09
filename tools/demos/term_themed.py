"""The terminal demo in the site's style, light or dark: the band's real
terminal trees (frames.txt) in a dark terminal window on the page colour."""
import sys
import render as R

T = {
    'light': dict(bg='#faf9f5', text='#1f1e1b', text3='#6b675e', accent='#b4502c', hl='rgba(217,119,87,.30)', shadow='0 1px 2px rgba(31,30,27,.06), 0 24px 60px -16px rgba(31,30,27,.32)'),
    'dark': dict(bg='#141413', text='#f2f0eb', text3='#8a877f', accent='#d97757', hl='rgba(217,119,87,.32)', shadow='0 0 0 1px #2f2e2b, 0 24px 60px -16px rgba(0,0,0,.6)'),
}
CAPS = {
    'reply': ('Claude just ', 'replied', '.', 'The cache is warm for an hour.'),
    'm20': ('20 minutes ', 'later', '.', 'The countdown runs.'),
    'm45': ('45 minutes ', 'later', '.', ''),
    'last': ('Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    'last2': ('Its ', 'last', ' minute.', 'The band names the price of going cold.'),
    'cold': ('Gone ', 'cold', '.', 'You know the price before you hit enter.'),
    'cards': ('▿ opens ', 'every', ' fact.', 'Cache, spend, context and limits.'),
}
src, out, theme = sys.argv[1], sys.argv[2], sys.argv[3]
c = T[theme]
for line in open(src):
    _, name, js = line.split(' ', 2)
    import json
    band = R.node(json.loads(js))
    pre, acc, post, rest = CAPS[name]
    cap = f'{pre}<span class="em hl">{acc}</span>{post} <span class="rest">{rest}</span>'
    page = R.PAGE.format(h=560, th=488, lh=R.LH, cap=cap, band=band)
    page = page.replace('background:#141413}}'.replace('}}', '}'), f'background:{c["bg"]}}}')
    page = page.replace('.cap{color:#f2f0eb;font-size:19px;font-weight:650;height:30px}',
        f'.cap{{color:{c["text"]};font-size:21px;font-weight:700;letter-spacing:-.3px;height:32px}} .cap .em{{font-family:"Instrument Serif",Georgia,serif;font-style:italic;font-weight:400;color:{c["accent"]};font-size:1.14em}} .cap .hl{{background-image:linear-gradient(transparent 58%,{c["hl"]} 58%,{c["hl"]} 92%,transparent 92%);padding:0 .06em}} .cap span.rest{{color:{c["text3"]};font-weight:400;font-size:18px;margin-left:6px}}')
    page = page.replace('.term{margin-top:10px;', f'.term{{box-shadow:{c["shadow"]};margin-top:10px;'.replace('{{', '{'))
    page = page.replace('<head><meta charset="utf-8">', '<head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=block">')
    open(f'{out}/{name}.html', 'w').write(page)
print(theme)
