"""Writes tools/_brand-sheet.html (rendered to brand-sheet.png). Run from brand/: python3 tools/brandsheet.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from icondata import NAV, UI  # noqa: E402
from build import svg  # noqa: E402

BRAND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V2 = os.path.join(BRAND, '..', 'v2')
PUB = os.path.abspath(os.path.join(BRAND, '..', '..', '..', '..', 'web', 'public', 'brand'))
T = json.load(open(os.path.join(V2, 'tokens.json')))
L, D = T['color']['light'], T['color']['dark']


def lum(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def sw(hexv, role, dark=False, big=False):
    txt = '#0A1F44' if lum(hexv) > 0.25 else '#FFFFFF'
    return (f'<div class="sw{" big" if big else ""}"><div class="chip" style="background:{hexv};color:{txt}">'
            f'{hexv.upper()}</div><div class="role">{role}</div></div>')


def pair(fg, bg, label):
    r = ratio(fg, bg)
    ok = 'AAA' if r >= 7 else ('AA' if r >= 4.5 else 'fail')
    return (f'<div class="pair" style="background:{bg};color:{fg}"><b>{label}</b><span>{fg.upper()} on {bg.upper()}'
            f'</span><em class="{ok}">{r:.2f} {ok}</em></div>')


def icon(name, data, size, color, tint, paper, active=False):
    return (f'<span class="ic" style="width:{size}px;height:{size}px;color:{color};--icon-tint:{tint};'
            f'--icon-paper:{paper}">{svg(data[name], active)}</span>')


def img(path, h, extra=''):
    return f'<img src="file://{path}" style="height:{h}px;{extra}" alt="">'


LOCK = os.path.join(PUB, 'hub-lockup-horizontal.png')
LOCKW = os.path.join(PUB, 'hub-lockup-horizontal-white.png')
APP = os.path.join(PUB, 'hub-icon.png')
SEC = ['home', 'library', 'modules', 'notebook', 'forum', 'calendar', 'search', 'tools']
MATE = {'home': 'Lumen', 'library': 'Stacks', 'modules': 'Binder', 'notebook': 'Jot', 'forum': 'Pip and Pod',
        'calendar': 'Blink', 'search': 'Loupe', 'tools': 'no mate'}

h = []
A = h.append

# ── header
A(f'<header><div>{img(LOCK, 40)}</div><div class="ht"><h1>Brand sheet</h1>'
  '<p>Deskmates v2 · the study desk, in the hub\'s own blue · October 2026</p></div></header>')

# ── logo
A('<h2>1 · Logo</h2><div class="row3">')
A('<div class="card"><h3>Light: hub-lockup-horizontal.png</h3><div class="stage" style="background:#F2F5FB">'
  f'<div class="clear">{img(LOCK, 54)}<i class="x t">x</i><i class="x l">x</i></div></div>'
  '<p>Clear space <b>x</b> = the height of the H (the lockup\'s height) on every side. Nothing else enters it: '
  'text, icons, the edge of a card. In a bar, the bar\'s own edge may come to x/2.</p></div>')
A('<div class="card"><h3>Dark: hub-lockup-horizontal-white.png</h3><div class="stage" style="background:#0B1530">'
  f'<div class="clear dk">{img(LOCKW, 54)}</div></div>'
  '<p>On canvas #0B1530, surface #111E3E or the logo blue. Never the blue lockup on a dark ground, and never the '
  'white one on a light ground.</p></div>')
A('<div class="card"><h3>App icon: hub-icon.png</h3><div class="stage apps" style="background:#F2F5FB">'
  + ''.join(img(APP, s, 'border-radius:%dpx' % (s * 0.22)) for s in (96, 48, 32, 16)) +
  '</div><div class="stage apps" style="background:#0B1530;margin-top:8px">'
  + ''.join(img(APP, s, 'border-radius:%dpx' % (s * 0.22)) for s in (96, 48, 32, 16)) +
  '</div><p>Home screen, favicon and the share image. The platform rounds it; add no border, shadow or badge.</p>'
  '</div></div>')
A('<div class="card wide"><h3>Minimum and standard sizes (shown at real size)</h3><div class="sizes">'
  f'<div>{img(LOCK, 27)}<span>27 px · sidebar</span></div><div>{img(LOCK, 21)}<span>21 px · phone app bar</span>'
  f'</div><div>{img(LOCK, 16)}<span>16 px · smallest lockup</span></div>'
  f'<div>{img(APP, 16)}<span>16 px · smallest app icon (favicon)</span></div></div>'
  '<p>Below 16 px tall the lockup becomes the app icon. The programme\'s official DSBA logo, when it appears, '
  'sits to the left of the lockup with a 1 px line-strong divider and x between them.</p></div>')

# ── palette
A('<h2>2 · Colour</h2><div class="row2">')
for name, P, bg in (('Light', L, '#F2F5FB'), ('Dark', D, '#0B1530')):
    ink = P['ink']
    A(f'<div class="card pal" style="background:{bg};color:{ink}"><h3>{name}</h3><div class="sws">')
    for k, role in (('canvas', 'canvas'), ('surface', 'surface'), ('inset', 'inset'), ('raised', 'raised'),
                    ('line', 'line'), ('line-strong', 'line-strong'), ('ink', 'ink'), ('ink-2', 'ink-2'),
                    ('ink-3', 'ink-3'), ('accent', 'accent'), ('accent-edge', 'accent-edge'),
                    ('accent-soft', 'accent-soft'), ('accent-text', 'accent-text'), ('on-accent', 'on-accent'),
                    ('success', 'success'), ('warning', 'warning'), ('warning-fill', 'warning-fill'),
                    ('error', 'error'), ('exam', 'exam'), ('on-exam', 'on-exam')):
        A(sw(P[k], role))
    for y in ('y1', 'y2', 'y3'):
        A(sw(P['year'][y]['fill'], f'Year {y[1]} fill'))
        A(sw(P['year'][y]['text'], f'Year {y[1]} text'))
        A(sw(P['year'][y]['soft'], f'Year {y[1]} soft'))
    A('</div></div>')
A('</div>')
A('<div class="card wide"><h3>Sections: art (both themes) · tint · pill · text</h3><table class="sec"><tr><th></th>'
  '<th>art</th><th colspan="3">light: tint · pill · label</th><th colspan="3">dark: tint · pill · label</th></tr>')
for s in SEC:
    ls, ds = L['section'][s], D['section'][s]
    A(f'<tr><td><b>{s.title()}</b><br><small>{MATE[s]}</small></td><td>{sw(ls["art"], "")}</td>'
      f'<td>{sw(ls["tint"], "")}</td><td>{sw(ls["pill"], "")}</td>'
      f'<td><span class="lab" style="background:{ls["pill"]};color:{ls["text"]}">{s.title()} {ls["text"]}</span></td>'
      f'<td>{sw(ds["tint"], "")}</td><td>{sw(ds["pill"], "")}</td>'
      f'<td><span class="lab" style="background:{ds["pill"]};color:{ds["text"]}">{s.title()} {ds["text"]}</span></td>'
      '</tr>')
A('</table><p>Art colours are for drawings and fills, never text. Wherever a section colour is text, use its text '
  'tone. The five tools share Home\'s blue on purpose; their shapes tell them apart.</p></div>')
A('<div class="card wide"><h3>Contrast pairs (WCAG 2, computed)</h3><div class="pairs">')
for fg, bg, lab in ((L['ink'], L['canvas'], 'ink / canvas'), (L['ink-2'], L['surface'], 'ink-2 / surface'),
                    (L['ink-3'], L['canvas'], 'ink-3 / canvas'), (L['ink-3'], L['inset'], 'ink-3 / inset'),
                    (L['on-accent'], L['accent'], 'on-accent / accent'),
                    (L['accent-text'], L['accent-soft'], 'accent-text / soft'),
                    (L['section']['library']['text'], L['section']['library']['pill'], 'library label / pill'),
                    (L['section']['calendar']['text'], L['section']['calendar']['pill'], 'calendar label / pill'),
                    (L['on-exam'], L['exam'], 'on-exam / exam'), (L['warning'], L['surface'], 'warning / surface'),
                    (L['year']['y2']['text'], L['year']['y2']['soft'], 'Year 2 text / soft'),
                    (L['ink'], L['warning-fill'], 'ink / badge yellow'),
                    (D['ink'], D['canvas'], 'D ink / canvas'), (D['ink-3'], D['surface'], 'D ink-3 / surface'),
                    (D['on-accent'], D['accent'], 'D on-accent / accent'),
                    (D['accent'], D['accent-soft'], 'D accent / soft'),
                    (D['section']['notebook']['text'], D['section']['notebook']['pill'], 'D notebook label / pill'),
                    (D['on-exam'], D['exam'], 'D on-exam / exam'),
                    (L['section']['library']['art'], L['surface'], "Don't: yellow art as text")):
    A(pair(fg, bg, lab))
A('</div></div>')

# ── type
A('<h2>3 · Type</h2><div class="card wide type">')
for tok, size, line, wt, fam, sample in (
        ('display-xl', 44, 48, 750, 'disp', 'Good evening, Sara'), ('display', 34, 40, 750, 'disp', 'Past papers'),
        ('title', 28, 34, 750, 'disp', 'ST2133 Advanced statistics'),
        ('heading', 22, 28, 750, 'disp', 'Up next this week'),
        ('subhead', 17, 24, 700, 'ui', 'Zone A · May 2019 · examiners\' report'),
        ('body', 16, 25, 400, 'ui', 'Time yourself on a full paper, then mark it against the examiners\' report.'),
        ('body-sm', 14, 21, 400, 'ui', 'Uploaded by a Year 3 student · 12 downloads'),
        ('nav · 500 / 700', 15, 20, 600, 'ui', 'Library'), ('meta', 13, 18, 500, 'ui', 'Thu 23 Oct, 9:00'),
        ('overline', 12, 16, 800, 'ov', 'Tools'), ('timer', 40, 44, 700, 'mono', '42:10'),
        ('code', 13, 18, 500, 'mono', 'ST2134 · EC2066'),
        ('arabic-body', 16, 28, 400, 'ar', 'ملاحظات المحاضرة والأوراق السابقة')):
    A(f'<div class="ts"><code>{tok}<br><small>{size}/{line} · {wt}</small></code>'
      f'<span class="f-{fam}" style="font-size:{size}px;line-height:{line}px;font-weight:{wt}">{sample}</span></div>')
A('<p class="faces"><b>Bricolage Grotesque</b> 750, tracking −0.025em: page titles, greetings, card titles. '
  '<b>Figtree</b> 400–800: everything in the UI. <b>JetBrains Mono</b>: module codes and the exam timer. '
  '<b>IBM Plex Sans Arabic</b> 400–700: next in every stack; Arabic body at line height 1.75. '
  'Running text stops at about 68 ch.</p></div>')

# ── shape
A('<h2>4 · Shape, depth and motion</h2><div class="row2"><div class="card"><h3>Radii</h3><div class="radii">')
for k, v in (('doc-thumb', 6), ('button', 13), ('control', 14), ('nav-item', 14), ('tab-pill', 17), ('card', 18),
             ('panel', 22), ('sheet', 28), ('chip', 999)):
    A(f'<div><span style="border-radius:{v}px"></span><code>{k} {v if v < 999 else "pill"}</code></div>')
A('</div></div><div class="card"><h3>Shadows and the pressable button</h3><div class="shadows">')
for bg, srf, sh, fl, edge, acc, on in (('#F2F5FB', '#FFFFFF', T['shadow']['light']['card'], T['shadow']['light']['float'],
                                        '#1F3A93', '#2445C2', '#FFFFFF'),
                                       ('#0B1530', '#111E3E', T['shadow']['dark']['card'], T['shadow']['dark']['float'],
                                        '#5F7BE0', '#8DA6FF', '#0B1530')):
    A(f'<div class="shrow" style="background:{bg}"><div class="sbox" style="background:{srf};box-shadow:{sh}">'
      f'card</div><div class="sbox" style="background:{srf};box-shadow:{fl}">float</div>'
      f'<button style="background:{acc};color:{on};box-shadow:inset 0 -3px 0 {edge}">Time me</button>'
      f'<button style="background:{acc};color:{on};box-shadow:none;transform:translateY(2px)">pressed</button></div>')
A('</div><p>Cards: radius 18, a 1.5 px line, the card shadow. The primary button keeps a 3 px lip in accent-edge '
  'and drops it on press. Motion: 140 / 200 / 320 ms on cubic-bezier(.2,.8,.2,1); the happy hop uses the '
  'bounce ease. Reduced motion: no transforms, a 120 ms fade.</p></div></div>')

# ── icons
grid = ''.join(f'<i style="left:{i*10}px;top:0;width:1px;height:240px"></i>'
               f'<i style="top:{i*10}px;left:0;height:1px;width:240px"></i>' for i in range(25))
A('<h2>5 · Icons</h2><div class="row2"><div class="card"><h3>Construction</h3><div class="constr">'
  f'<div class="big">{grid}<b class="safe"></b>{icon("calendar", NAV, 240, "#3E4E6E", "#FFCBC6", "#FFFFFF")}</div>'
  f'<div class="big">{grid}<b class="safe"></b>{icon("forum", NAV, 240, "#14234D", "#F25CA2", "#FFE3F0", True)}</div>'
  '</div><ul><li>24 px grid, 2 px safe margin (the dashed box). Stroke 1.75, round caps and joins, corner radii 1–3.'
  '</li><li>One tinted body (<code>var(--icon-tint)</code>) plus paper parts (<code>var(--icon-paper)</code>); '
  'lines and dots in <code>currentColor</code>. Arrows, chevrons and plain marks are line only.</li>'
  '<li>Active: line navy (#14234D / #EAF0FF) at 1.85, body in the full art colour, paper takes the pill colour, '
  'on a pill, label bold in the section text tone. Three changes, never colour alone.</li>'
  '<li>Sizes 24 (tab bar, top bar), 20 (sidebar, buttons), 16 (inline meta only).</li></ul></div>')
A('<div class="card"><h3>In use</h3>')
for theme, P, bg in (('light', L, '#FFFFFF'), ('dark', D, '#111E3E')):
    A(f'<div class="side" style="background:{bg}">')
    for nm, s, act in (('home', 'home', False), ('library', 'library', True), ('modules', 'modules', False),
                       ('notebook', 'notebook', False), ('forum', 'forum', False), ('calendar', 'calendar', False),
                       ('grades', 'tools', False)):
        sec = P['section'][s]
        if act:
            A(f'<div class="item on" style="background:{sec["pill"]};color:{sec["text"]}">'
              f'{icon(nm, NAV, 20, P["icon"]["line-active"], L["section"][s]["art"], sec["pill"], True)}'
              f'{nm.title()}</div>')
        else:
            A(f'<div class="item" style="color:{P["ink-2"]}">{icon(nm, NAV, 20, P["icon"]["line"], sec["tint"], P["icon"]["paper"])}'
              f'{nm.title() if nm != "grades" else "Grades"}</div>')
    A('<div class="uirow">' + ''.join(icon(nm, UI, 20, P['icon']['line'], P['section']['home']['tint'],
                                         P['icon']['paper']) for nm in
                                    ('bookmark', 'timer', 'upload', 'download', 'highlighter', 'filter', 'bell',
                                     'reply', 'vote', 'flag', 'share', 'exam', 'offline')) + '</div></div>')
A('<p>13 nav icons and 69 UI icons, each with a default and an active file: <code>icons/nav</code>, '
  '<code>icons/ui</code>. Every size and state is on icon-sheet.png.</p></div></div>')

# ── characters
A('<h2>6 · The desk-mates</h2><div class="card wide"><div class="mates">')
for s, nm in (('home', 'Lumen'), ('library', 'Stacks'), ('modules', 'Binder'), ('notebook', 'Jot'),
              ('forum', 'Pip and Pod'), ('calendar', 'Blink'), ('search', 'Loupe')):
    A(f'<figure>{img(os.path.join(V2, "sections", s + ".svg"), 104)}<figcaption><b>{nm}</b> · {s}</figcaption></figure>')
A('</div><div class="mates states">')
for f, cap in (('library', 'idle: you are here'), ('states/library-happy', 'happy: it worked'),
               ('states/library-sleepy', 'sleepy: nothing here yet')):
    A(f'<figure>{img(os.path.join(V2, "sections", f + ".svg"), 104)}<figcaption>{cap}</figcaption></figure>')
A(f'<figure class="dkm">{img(os.path.join(V2, "sections", "states/forum-sleepy.svg"), 104, "filter:drop-shadow(2px 0 0 #EAF0FF) drop-shadow(-2px 0 0 #EAF0FF) drop-shadow(0 2px 0 #EAF0FF) drop-shadow(0 -2px 0 #EAF0FF)")}'
  '<figcaption>on dark: 2 px #EAF0FF halo</figcaption></figure>')
A('</div><div class="rules"><div><h4>Use them</h4><ul><li>Section headers (98–104 px): one mate, idle.</li>'
  '<li>Empty states (160 px): sleepy, with a line that says what to do next.</li>'
  '<li>Success toasts (40 px): happy, with a 6 px hop.</li><li>The Home shelf (56 px).</li></ul></div>'
  '<div><h4>Don\'t</h4><ul><li>Two mates competing in one view, or a mate in Noora\'s chat.</li>'
  '<li>A mate below 32 px: the nav icon takes over.</li><li>Failures and errors: a mate never smiles at a failed upload or a lost answer; '
  'use the plain error style.</li><li>New faces, people or mascots: Noora is the only person.</li></ul></div></div></div>')

# ── do / don't
A('<h2>7 · Do and don\'t</h2><div class="dd">')
dos = [
    ('do', '<span class="lab" style="background:#FFF1C7;color:#865C00;font-weight:700">Library</span>',
     'Section labels in the text tone on the pill: 5.26:1.'),
    ('dont', '<span class="lab" style="background:#FFFFFF;color:#FFC233;font-weight:700">Library</span>',
     'The art yellow as text: 1.6:1. Art colours are never text.'),
    ('do', f'{img(LOCK, 22)}', 'The lockup file as it is, with clear space, on canvas or surface.'),
    ('dont', '<span class="nologo">no redraw · recolour · outline · stretch · effects</span>',
     'Never redraw, recolour, outline, stretch, rotate or put the logo on a photo or a section colour.'),
    ('do', ''.join(icon(n, NAV, 22, '#3E4E6E', '#C9D4FF', '#FFFFFF') for n in ('home', 'boards', 'grades', 'career')),
     'One icon family in a row: Deskmates nav icons in the sidebar and tab bar.'),
    ('dont', '<span class="nologo">Deskmates + Phosphor in one row</span>',
     'Mixing families side by side. Swap a whole surface at once.'),
    ('do', '<span class="lab" style="background:#C21D5C;color:#fff;font-weight:700">Exam · Thu 9:00</span>',
     'Exams in raspberry, distinct from errors and the calendar.'),
    ('dont', '<span class="lab" style="background:#F0524B;color:#fff;font-weight:700">Exam · Thu 9:00</span>',
     'Calendar tomato for exams: it reads as an error, and white on it is 3.5:1.'),
]
for kind, demo, txt in dos:
    A(f'<div class="ddc {kind}"><div class="demo">{demo}</div><p><b>{"Do" if kind == "do" else "Don’t"}.</b> {txt}</p></div>')
A('</div>')

CSS = """<style>
html,body{margin:0}body{width:1600px;background:#F2F5FB;color:#0A1F44;font:400 15px/1.5 Figtree,system-ui,sans-serif;
 padding:40px 48px 56px;box-sizing:border-box}
header{display:flex;align-items:center;justify-content:space-between;padding-bottom:24px;border-bottom:1.5px solid #DCE4F1}
.ht{text-align:right}h1{font:750 44px/48px 'Bricolage Grotesque',sans-serif;letter-spacing:-.025em;margin:0}
.ht p{margin:4px 0 0;color:#3E4E6E}
h2{font:750 28px/34px 'Bricolage Grotesque',sans-serif;letter-spacing:-.02em;margin:40px 0 14px}
h3{font:700 15px/20px Figtree;margin:0 0 12px}h4{margin:0 0 6px;font:800 12px Figtree;letter-spacing:.1em;text-transform:uppercase;color:#3E4E6E}
.card{background:#fff;border:1.5px solid #DCE4F1;border-radius:18px;padding:20px;box-shadow:0 2px 6px rgba(10,31,68,.07)}
.card p,.card li{color:#3E4E6E;font-size:14px;line-height:21px;max-width:68ch}.card p{margin:12px 0 0}
.row3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.row2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.wide{margin-top:16px}
.stage{border-radius:13px;padding:36px 20px;display:flex;align-items:center;justify-content:center;min-height:110px;box-sizing:border-box}
.clear{position:relative;outline:1.5px dashed #2445C2;outline-offset:54px;margin:54px 0}.clear.dk{outline:none;margin:0}
.clear img{display:block}.x{position:absolute;font:700 12px Figtree;color:#2445C2;font-style:normal}
.x.t{top:-40px;left:50%}.x.l{left:-38px;top:18px}
.stage .clear{margin:58px}.card:first-child .stage{padding:0}
.apps{gap:18px;padding:18px}.sizes{display:flex;gap:48px;align-items:flex-end}
.sizes div{display:flex;flex-direction:column;align-items:flex-start;gap:8px}.sizes span{font-size:12px;color:#3E4E6E}
.pal{border-radius:18px}.pal h3{color:inherit}.sws{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.sw .chip{height:44px;border-radius:10px;display:flex;align-items:flex-end;padding:5px 7px;box-sizing:border-box;
 font:500 10px 'JetBrains Mono',monospace;box-shadow:inset 0 0 0 1px rgba(127,140,170,.35)}
.sw .role{font:600 11px Figtree;margin-top:3px;opacity:.85}
table.sec{border-collapse:collapse;width:100%}table.sec td,table.sec th{padding:5px 8px;text-align:left;font-size:12px;vertical-align:middle}
table.sec th{color:#3E4E6E;font-weight:800;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
table.sec .sw .chip{height:32px;width:96px}table.sec .sw .role{display:none}
table.sec tr td:nth-child(6),table.sec tr td:nth-child(7),table.sec tr td:nth-child(8){background:#0B1530}
.lab{display:inline-block;padding:7px 13px;border-radius:999px;font:700 13px Figtree}
.pairs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.pair{border-radius:12px;padding:10px 12px;box-shadow:inset 0 0 0 1px rgba(127,140,170,.3);display:flex;flex-direction:column;gap:1px}
.pair b{font:700 14px Figtree}.pair span{font:500 10px 'JetBrains Mono';opacity:.9}
.pair em{font:800 12px Figtree;font-style:normal}
.type .ts{display:grid;grid-template-columns:150px 1fr;align-items:baseline;border-bottom:1px solid #ECF1F9;padding:6px 0}
.ts code{font:500 12px/16px 'JetBrains Mono';color:#5A6A8C}.ts small{font-size:11px}
.f-disp{font-family:'Bricolage Grotesque','IBM Plex Sans Arabic',sans-serif;letter-spacing:-.025em}
.f-ui{font-family:Figtree,sans-serif}.f-ov{font-family:Figtree;text-transform:uppercase;letter-spacing:.1em;color:#3E4E6E}
.f-mono{font-family:'JetBrains Mono',monospace}.f-ar{font-family:'IBM Plex Sans Arabic';direction:rtl;text-align:right}
.faces{max-width:none!important}
.radii{display:flex;flex-wrap:wrap;gap:16px}.radii div{display:flex;flex-direction:column;align-items:center;gap:6px}
.radii span{width:76px;height:56px;background:#E3E9FF;border:1.5px solid #2445C2}.radii code{font:500 11px 'JetBrains Mono'}
.shadows{display:flex;flex-direction:column;gap:10px}.shrow{display:flex;gap:20px;align-items:center;padding:20px;border-radius:13px}
.sbox{width:120px;height:60px;border-radius:18px;display:flex;align-items:center;justify-content:center;font:600 12px Figtree;color:#5A6A8C}
button{font:700 15px Figtree;border:0;border-radius:13px;height:46px;padding:0 20px}
.constr{display:flex;gap:20px}.big{position:relative;width:240px;height:240px;background:#F2F5FB;border-radius:6px;overflow:hidden}
.big i{position:absolute;background:rgba(36,69,194,.12)}.big .safe{position:absolute;left:20px;top:20px;width:200px;height:200px;
 border:1.5px dashed rgba(192,38,45,.6);box-sizing:border-box}.big .ic{position:absolute;left:0;top:0}
.ic{display:inline-block;flex:none}.ic svg{display:block;width:100%;height:100%}
.card ul{margin:14px 0 0;padding-left:18px}
.side{border-radius:13px;padding:10px;margin-bottom:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:2px}
.item{display:flex;align-items:center;gap:10px;height:40px;padding:0 12px;border-radius:14px;font:500 15px Figtree}
.item.on{font-weight:700}.uirow{grid-column:1/-1;display:flex;gap:18px;padding:10px 12px}
.mates{display:flex;gap:24px;flex-wrap:wrap}.mates figure{margin:0;text-align:center}
.mates figcaption{font-size:12px;color:#3E4E6E}.states{margin-top:16px}
.dkm{background:#0B1530;border-radius:13px;padding:8px 12px}.dkm figcaption{color:#A9B8D9}
.rules{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:16px}
.dd{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.ddc{background:#fff;border-radius:18px;border:1.5px solid #DCE4F1;overflow:hidden}
.ddc .demo{height:96px;display:flex;align-items:center;justify-content:center;gap:12px;background:#F2F5FB}
.ddc p{margin:0;padding:12px 16px 16px;font-size:13px;line-height:19px;color:#3E4E6E}
.ddc.do{border-top:5px solid #18794A}.ddc.dont{border-top:5px solid #C0262D}
.nologo{font:600 12px Figtree;color:#C0262D;border:1.5px dashed #C0262D;border-radius:10px;padding:10px 14px}
</style>"""
FONTS = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,'
         '500..800&family=Figtree:wght@400..800&family=JetBrains+Mono:wght@500;700&family=IBM+Plex+Sans+Arabic:'
         'wght@400;500;600;700&display=block">')
open(os.path.join(BRAND, 'tools', '_brand-sheet.html'), 'w').write(
    f'<!doctype html><html><head><meta charset="utf-8">{FONTS}{CSS}</head><body>{"".join(h)}</body></html>')
print('ok')
