"""Writes brand/icons/{nav,ui}/*.svg and tools/_icon-sheet.html. Run from brand/: python3 tools/build.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from icondata import NAV, UI, GROUPS  # noqa: E402

BRAND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TINT = {False: 'var(--icon-tint, color-mix(in srgb, currentColor 22%, transparent))',
        True: 'var(--icon-tint, color-mix(in srgb, currentColor 55%, transparent))'}
PAPER = 'var(--icon-paper, #FFFFFF)'
SW = {False: 1.75, True: 1.85}
HEAVY = {False: 2.75, True: 2.85}


def svg(parts, active):
    out = []
    for k, d in parts:
        if k == 'f':
            out.append(f'<path d="{d}" fill="{TINT[active]}"/>')
        elif k == 'w':
            out.append(f'<path d="{d}" fill="{PAPER}"/>')
        elif k == 'l':
            out.append(f'<path d="{d}"/>')
        elif k == 'L':
            out.append(f'<path d="{d}" stroke-width="{HEAVY[active]}"/>')
        elif k == 'd':
            out.append(f'<path d="{d}" fill="currentColor" stroke="none"/>')
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" '
            f'stroke="currentColor" stroke-width="{SW[active]}" stroke-linecap="round" stroke-linejoin="round" '
            'aria-hidden="true">' + ''.join(out) + '</svg>\n')


def write_all():
    for folder, data in (('nav', NAV), ('ui', UI)):
        d = os.path.join(BRAND, 'icons', folder)
        for f in os.listdir(d):
            if f.endswith('.svg'):
                os.remove(os.path.join(d, f))
        for name, parts in data.items():
            open(os.path.join(d, f'{name}.svg'), 'w').write(svg(parts, False))
            open(os.path.join(d, f'{name}-active.svg'), 'w').write(svg(parts, True))


SECTION = {'home': 'home', 'modules': 'modules', 'library': 'library', 'notebook': 'notebook', 'forum': 'forum',
           'calendar': 'calendar', 'search': 'search', 'boards': 'tools', 'grades': 'tools', 'career': 'tools',
           'newsletter': 'tools', 'daily': 'tools', 'more': 'tools'}
LABEL = {'career': 'career navigator', 'daily': 'daily puzzles'}
STATUS = {'success': 'modules', 'info': 'home', 'warning': 'library', 'error': 'calendar', 'question': 'home',
          'offline': 'search'}
TOK = json.load(open(os.path.join(BRAND, '..', 'v2', 'tokens.json')))['color']
THEME = {
    'light': dict(bg='#F2F5FB', panel='#FFFFFF', ink='#0A1F44', ink2='#3E4E6E', ink3='#5A6A8C', line='#3E4E6E',
                  lineA='#14234D', paper='#FFFFFF', line_rule='#DCE4F1'),
    'dark': dict(bg='#0B1530', panel='#111E3E', ink='#EAF0FF', ink2='#A9B8D9', ink3='#8798BE', line='#A9B8D9',
                 lineA='#EAF0FF', paper='#111E3E', line_rule='#22355F'),
}


def cell(name, parts, theme, sec):
    t = THEME[theme]
    s = TOK[theme]['section'][sec]
    art = TOK['light']['section'][sec]['art']
    row1 = ''.join(
        f'<span class="ic" style="width:{z}px;height:{z}px;color:{t["line"]};--icon-tint:{s["tint"]};'
        f'--icon-paper:{t["paper"]}">{svg(parts, False)}</span>' for z in (24, 20, 16))
    row2 = ''.join(
        f'<span class="pill" style="background:{s["pill"]};height:{z+8}px;padding:0 {z//2}px">'
        f'<span class="ic" style="width:{z}px;height:{z}px;color:{t["lineA"]};--icon-tint:{art};'
        f'--icon-paper:{s["pill"]}">{svg(parts, True)}</span></span>' for z in (24, 20, 16))
    return (f'<div class="cell"><div class="row">{row1}</div><div class="row">{row2}</div>'
            f'<div class="name">{LABEL.get(name, name)}</div></div>')


def sheet():
    cols = []
    for theme in ('light', 'dark'):
        t = THEME[theme]
        h = [f'<section style="background:{t["bg"]};color:{t["ink"]};--ink2:{t["ink2"]};--rule:{t["line_rule"]}">',
             f'<h1>{theme.title()} <small>{t["bg"]} · rows: 24, 20, 16 px default, then active on its pill</small></h1>',
             '<h2>Navigation</h2><div class="grid">']
        for name, parts in NAV.items():
            h.append(cell(name, parts, theme, SECTION[name]))
        h.append('</div>')
        for title, names in GROUPS:
            h.append(f'<h2>{title}</h2><div class="grid">')
            for name in names:
                h.append(cell(name, UI[name], theme, STATUS.get(name, 'home')))
            h.append('</div>')
        h.append('</section>')
        cols.append(''.join(h))
    css = """<style>
html,body{margin:0}body{display:flex;font-family:Figtree,system-ui,sans-serif;width:1880px}
section{width:940px;padding:28px 28px 20px;box-sizing:border-box}
h1{font:800 20px/1 'Bricolage Grotesque',Figtree,sans-serif;margin:0 0 6px;letter-spacing:-.02em}
h1 small{font:600 12px Figtree;color:var(--ink2);letter-spacing:0;margin-left:8px}
h2{font:800 11px/1 Figtree;letter-spacing:.1em;text-transform:uppercase;color:var(--ink2);margin:18px 0 8px;
 padding-top:12px;border-top:1px solid var(--rule)}
.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px 4px}
.cell{padding:4px 0}.row{display:flex;align-items:center;gap:10px;height:34px}
.ic{display:inline-block;flex:none}.ic svg{display:block;width:100%;height:100%}
.pill{display:inline-flex;align-items:center;border-radius:999px;flex:none}
.name{font:600 11px Figtree;color:var(--ink2);margin-top:2px}
</style>"""
    fonts = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@'
             '12..96,500..800&family=Figtree:wght@400..800&display=block">')
    html = f'<!doctype html><html><head><meta charset="utf-8">{fonts}{css}</head><body>{"".join(cols)}</body></html>'
    open(os.path.join(BRAND, 'tools', '_icon-sheet.html'), 'w').write(html)


if __name__ == '__main__':
    write_all()
    sheet()
    print(len(NAV), 'nav,', len(UI), 'ui')
