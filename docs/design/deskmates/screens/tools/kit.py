# Deskmates v2 screen kit: one builder for every key screen. Colours come only from v2/tokens.json.
import json, os, re, sys
from html import escape
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # docs/design/deskmates/screens
V2 = os.path.join(os.path.dirname(ROOT), 'v2')
sys.path.insert(0, os.path.join(V2, 'tools'))
from icons import g as icon_g, PAL, SECTION       # the approved 13-icon nav family

TOK = json.load(open(os.path.join(V2, 'tokens.json')))
SEC_DIR = '../v2/sections/'
PUB = '../../../../web/public/'
NOORA_BUST = PUB + 'noora/bust-neutral.png'
NOORA_IDLE = PUB + 'noora/idle.png'

def theme(name):
    c = TOK['color'][name]; C = {k: v for k, v in c.items() if isinstance(v, str)}
    for y in ('y1', 'y2', 'y3'):
        for k, v in c['year'][y].items(): C[f'{y}-{k}'] = v
    for s, d in c['section'].items():
        for k in ('art', 'tint', 'pill', 'text'): C[f'{s}-{k}'] = d[k]
    for k, v in TOK['color']['art'].items(): C['art-' + k] = v
    for k, v in c['noora'].items(): C['noora-' + k] = v
    C['dark'] = name == 'dark'
    C['icon-line'] = c['icon']['line']
    return C

ALLOWED = set()
def _walk(o):
    if isinstance(o, dict):
        for v in o.values(): _walk(v)
    elif isinstance(o, str) and re.fullmatch(r'#[0-9A-Fa-f]{6}', o): ALLOWED.add(o.upper())
_walk(TOK['color'])

def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
def ratio(a, b):
    a, b = lum(a), lum(b); return (max(a, b) + .05) / (min(a, b) + .05)

FONTS = ("@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&amp;"
         "family=Figtree:ital,wght@0,400..800;1,400..700&amp;family=JetBrains+Mono:wght@500;700&amp;"
         "family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&amp;display=block');"
         ".ui{font-family:Figtree,'IBM Plex Sans Arabic',system-ui,sans-serif}"
         ".disp{font-family:'Bricolage Grotesque','IBM Plex Sans Arabic',Figtree,sans-serif}"
         ".mono{font-family:'JetBrains Mono',ui-monospace,monospace}.ar{font-family:'IBM Plex Sans Arabic',sans-serif}")

# text widths: measured in Chrome with the real fonts (tools/widths.json, filled by tools/measure.py);
# a rough estimate stands in until a string has been measured
WCACHE_F = os.path.join(HERE, 'widths.json')
WCACHE = json.load(open(WCACHE_F)) if os.path.exists(WCACHE_F) else {}
PENDING = set()
def tw(s, size, w=400, font='ui'):
    s = re.sub(r'<[^>]+>', '', s)
    key = f'{font}|{w}|{size}|{s}'
    if key in WCACHE: return WCACHE[key]
    PENDING.add(key)
    return _est(s, size, w, font)
def save_pending():
    if PENDING:
        pf = os.path.join(HERE, 'pending.json'); old = json.load(open(pf)) if os.path.exists(pf) else []
        json.dump(sorted(set(old) | PENDING), open(pf, 'w'), ensure_ascii=False)
import atexit; atexit.register(save_pending)
def _est(s, size, w=400, font='ui'):
    if font == 'mono': return len(s) * size * .6
    k = {'disp': .5}.get(font, .49 if w < 600 else .52 if w < 700 else .545)
    n = 0
    for ch in s:
        if ch in 'iljtfI.,:;\'’|!· ': n += .55
        elif ch in 'mwMW': n += 1.5
        elif ch.isupper() or ch.isdigit(): n += 1.15
        else: n += 1
    return n * size * k

class B:
    def __init__(self, w, h, theme_name, title):
        self.W, self.H = w, h; self.th = theme_name; self.C = theme(theme_name); self.O = []; self.warn = []
        self.title = title; self.clip = 0
    def col(self, v):
        if v is None: return None
        if v.startswith('#') or v in ('none',) or v.startswith('url'): return v
        return self.C[v]
    def a(self, s): self.O.append(s)
    # ---- text ----
    def t(self, x, y, s, size=14, w=400, fill='ink', font='ui', anchor='start', on='surface', ls=None, raw=False, extra='', check=True):
        f = self.col(fill); bg = self.col(on)
        if check and bg and f.startswith('#') and bg.startswith('#'):
            r = ratio(f, bg); need = 3 if (size >= 24 or (size >= 18.66 and w >= 700)) else 4.5
            if r < need: self.warn.append(f'{r:.2f} {f} on {bg}: {re.sub("<[^>]+>","",s)[:40]}')
        if ls is None and font == 'disp': ls = round(-0.022 * size, 2)
        lsa = f' letter-spacing="{ls}"' if ls else ''
        body = s if raw else escape(s, quote=False)
        self.a(f'<text x="{x:g}" y="{y:g}" class="{font}" font-size="{size}" font-weight="{w}" fill="{f}" text-anchor="{anchor}"{lsa} {extra}>{body}</text>')
    def ts(self, s, fill=None, w=None, extra=''):
        f = f' fill="{self.col(fill)}"' if fill else ''; ww = f' font-weight="{w}"' if w else ''
        return f'<tspan{f}{ww} {extra}>{escape(s, quote=False)}</tspan>'
    def wrap(self, x, y, s, maxw, size=14, w=400, lh=None, fill='ink-2', font='ui', on='surface', anchor='start', maxlines=99):
        lh = lh or round(size * 1.5); words = s.split(' '); line = ''; lines = []
        for wd in words:
            tst = (line + ' ' + wd).strip()
            if tw(tst, size, w, font) > maxw and line: lines.append(line); line = wd
            else: line = tst
        if line: lines.append(line)
        if len(lines) > maxlines: lines = lines[:maxlines]; lines[-1] = lines[-1].rstrip('.,') + '…'
        for i, l in enumerate(lines): self.t(x, y + i * lh, l, size, w, fill, font, anchor, on)
        return y + len(lines) * lh
    # ---- shapes ----
    def rect(self, x, y, w, h, r=0, fill='surface', stroke=None, sw=1.5, extra=''):
        st = f' stroke="{self.col(stroke)}" stroke-width="{sw}"' if stroke else ''
        self.a(f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r:g}" fill="{self.col(fill)}"{st} {extra}/>')
    def line(self, x1, y1, x2, y2, stroke='line', sw=1.5, extra=''):
        cap = 'butt' if 'stroke-linecap="butt"' in extra else 'round'
        extra = extra.replace('stroke-linecap="butt"', '')
        self.a(f'<path d="M{x1:g} {y1:g}L{x2:g} {y2:g}" stroke="{self.col(stroke)}" stroke-width="{sw}" stroke-linecap="{cap}" {extra}/>')
    def path(self, d, fill='none', stroke='ink-2', sw=2, extra=''):
        st = f' stroke="{self.col(stroke)}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"' if stroke else ''
        self.a(f'<path d="{d}" fill="{self.col(fill)}"{st} {extra}/>')
    def card_at(self, idx, x, y, w, h, r=18, fill='surface', stroke='line'):
        n = len(self.O); self.card(x, y, w, h, r, fill, stroke); self.O.insert(idx, self.O.pop(n))
    def card(self, x, y, w, h, r=18, fill='surface', stroke='line', lift=True):
        o = f'<rect x="{x:g}" y="{y:g}" width="{w:g}" height="{h:g}" rx="{r}" fill="{self.col(fill)}" stroke="{self.col(stroke)}" stroke-width="1.5"/>'
        self.a(f'<g filter="url(#lift)">{o}</g>' if lift else o)
    # ---- art ----
    def mate(self, name, x, y, s, state=None):
        f = ' filter="url(#halo)"' if self.C['dark'] else ''
        href = SEC_DIR + (f'states/{name}-{state}.svg' if state else f'{name}.svg')
        self.a(f'<image{f} href="{href}" x="{x:g}" y="{y:g}" width="{s:g}" height="{s:g}"/>')
    def icon(self, name, x, y, size=24, active=False, paper=None):
        self.a(icon_g(name, x, y, size, self.th, active, paper))
    def doc(self, x, y, kind, w=40):
        band = {'paper': '#FFC233', 'report': '#2DB87D', 'note': '#7B61FF'}[kind]; s = w / 40
        o = [f'<g transform="translate({x:g} {y:g}) scale({s:g})"><rect width="40" height="50" rx="6" fill="#FFFFFF" stroke="#14234D" stroke-width="2"/>'
             f'<rect width="40" height="14" rx="6" fill="{band}" stroke="#14234D" stroke-width="2"/>']
        if kind == 'paper': o.append('<path d="M8 26h24M8 33h18M8 40h22" stroke="#C9D5EA" stroke-width="2.5" stroke-linecap="round"/>')
        if kind == 'report': o.append('<path d="M10 30l6 6 12-12" fill="none" stroke="#18794A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>')
        if kind == 'note': o.append('<path d="M8 30q6-6 12 0t12 0M8 40q6-5 12 0" fill="none" stroke="#7B61FF" stroke-width="2.5" stroke-linecap="round"/>')
        o.append('</g>'); self.a(''.join(o))
    def binder(self, x, y, colour, s=1):
        self.a(f'<g transform="translate({x} {y}) scale({s})"><rect width="38" height="46" rx="7" fill="{self.col(colour)}" stroke="#14234D" stroke-width="2"/><path d="M9 1v44" stroke="#14234D" stroke-width="2"/><rect x="15" y="8" width="18" height="9" rx="3" fill="#FFFFFF" stroke="#14234D" stroke-width="1.5"/></g>')
    # ---- controls ----
    def button(self, x, y, label, kind='primary', w=None, h=44, size=15, icon=None, on='surface'):
        C = self.C; iw = 22 if icon else 0
        w = w or round(tw(label, size, 700) + 36 + iw)
        cx = x + w / 2 + iw / 2
        if kind == 'primary':
            self.rect(x, y, w, h, 13, 'accent-edge'); self.rect(x, y, w, h - 3, 13, 'accent'); fg = 'on-accent'; bg = 'accent'; ty = y + h / 2 + size * .33 - 1.5
        elif kind == 'pressed':
            self.rect(x, y + 3, w, h - 3, 13, 'accent-edge'); fg = 'on-accent'; bg = 'accent-edge'; ty = y + h / 2 + size * .33 + 1.5
        elif kind == 'secondary':
            self.rect(x + .75, y + .75, w - 1.5, h - 1.5, 13, 'surface', 'line-strong'); fg = 'ink'; bg = 'surface'; ty = y + h / 2 + size * .33
        elif kind == 'quiet':
            fg = 'accent-text'; bg = on; ty = y + h / 2 + size * .33
        elif kind == 'quiet-soft':
            self.rect(x, y, w, h, 13, 'accent-soft'); fg = 'accent-text'; bg = 'accent-soft'; ty = y + h / 2 + size * .33
        elif kind == 'danger':
            self.rect(x, y, w, h, 13, 'error'); fg = 'on-accent' if not C['dark'] else 'on-accent'; bg = 'error'; ty = y + h / 2 + size * .33
            fg = '#FFFFFF' if not C['dark'] else C['canvas']
        elif kind == 'disabled':
            self.rect(x, y, w, h, 13, 'inset'); fg = 'ink-3'; bg = 'inset'; ty = y + h / 2 + size * .33
        if icon: self.glyph(icon, x + w / 2 - tw(label, size, 700) / 2 - iw / 2 - 2, ty - size * .36, fg)
        self.t(cx, ty, label, size, 700, fg, anchor='middle', on=bg)
        return w
    def glyph(self, name, cx, cy, colour, s=1):
        """Small UI glyphs drawn inline (not nav icons): plus, check, clock, x, chevrons, send, upload..."""
        c = self.col(colour); st = f'fill="none" stroke="{c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
        G = {
            'plus': f'<path d="M-6 0h12M0-6v12" {st}/>',
            'check': f'<path d="M-6 0l4 4 8-8" {st}/>',
            'x': f'<path d="M-5-5l10 10M5-5l-10 10" {st}/>',
            'clock': f'<circle r="7" {st}/><path d="M0-4v4l3 2M-2-10h4" {st}/>',
            'left': f'<path d="M3-6l-6 6 6 6" {st}/>', 'right': f'<path d="M-3-6l6 6-6 6" {st}/>',
            'down': f'<path d="M-6-3l6 6 6-6" {st}/>', 'up': f'<path d="M-6 3l6-6 6 6" {st}/>',
            'send': f'<path d="M-7 0h12M0-6l6 6-6 6" {st}/>',
            'upload': f'<path d="M0 5V-6M-5-1l5-5 5 5M-7 7h14" {st}/>',
            'reply': f'<path d="M-2-6l-6 5 6 5M-8-1h9a6 6 0 0 1 6 6v2" {st}/>',
            'bell': f'<path d="M-8 6h16M-6 6v-6a6 6 0 0 1 12 0v6M-3 10h6" {st}/>',
            'moon': f'<path d="M6 3a8 8 0 1 1-7-10 6 6 0 0 0 7 10z" {st}/>',
            'more': f'<circle cx="-6" r="1.8" fill="{c}"/><circle r="1.8" fill="{c}"/><circle cx="6" r="1.8" fill="{c}"/>',
            'vote': f'<path d="M-6 3l6-7 6 7z" {st}/>',
            'bookmark': f'<path d="M-5-7h10v15l-5-4-5 4z" {st}/>',
            'undo': f'<path d="M-4-7l-4 4 4 4M-8-3h9a5 5 0 0 1 0 10H-3" {st}/>',
            'redo': f'<path d="M4-7l4 4-4 4M8-3h-9a5 5 0 0 0 0 10H3" {st}/>',
            'link': f'<path d="M-2 2l4-4M-4-1l-2 2a3.5 3.5 0 0 0 5 5l2-2M4 1l2-2a3.5 3.5 0 0 0-5-5l-2 2" {st}/>',
            'bold': f'<path d="M-4-7h5a3.5 3.5 0 0 1 0 7h-5zM-4 0h6a3.5 3.5 0 0 1 0 7h-6z" {st}/>',
            'italic': f'<path d="M-1-7h7M-6 7h7M3-7l-6 14" {st}/>',
            'list': f'<path d="M-2-5h9M-2 0h9M-2 5h9" {st}/><circle cx="-7" cy="-5" r="1.4" fill="{c}"/><circle cx="-7" r="1.4" fill="{c}"/><circle cx="-7" cy="5" r="1.4" fill="{c}"/>',
            'sigma': f'<path d="M6-7h-12l7 7-7 7h12" {st}/>',
            'type': f'<path d="M-6-6h12M0-6v13M-3 7h6" {st}/>',
            'pen': f'<path d="M-6 7l2-6 9-9 4 4-9 9zM-4 1l4 4" {st}/>',
            'hl': f'<path d="M-7 8h6M-5 4l3 3 9-9-3-3z" {st}/>',
            'eraser': f'<path d="M-2 7h9M-8 2l7-7 7 7-5 5h-4z" {st}/>',
            'lasso': f'<ellipse cy="-2" rx="7" ry="5" {st} stroke-dasharray="3 3"/><path d="M-3 3q-2 4 2 5" {st}/>',
            'pages': f'<rect x="-6" y="-7" width="10" height="13" rx="2" {st}/><path d="M7-4v11H-3" {st}/>',
            'search': f'<circle cx="-1.5" cy="-1.5" r="5.5" {st}/><path d="M3 3l4.5 4.5" {st}/>',
            'filter': f'<path d="M-7-4h14M-4 1h8M-1 6h2" {st}/>',
            'play': f'<path d="M-3-5v10l8-5z" fill="{c}" stroke="{c}" stroke-width="1.5" stroke-linejoin="round"/>',
            'chat': f'<path d="M-7-6h14v9h-8l-4 4v-4h-2z" {st}/>',
            'cal': f'<rect x="-7" y="-6" width="14" height="13" rx="2.5" {st}/><path d="M-7-1h14M-3-8v4M3-8v4" {st}/>',
            'history': f'<path d="M-7 0a7 7 0 1 0 2-5M-7-7v4h4M0-3v3l2 2" {st}/>',
            'trash': f'<path d="M-6-4h12M-4-4l1 11h6l1-11M-2-4v-3h4v3" {st}/>',
            'attach': f'<path d="M4-2l-6 6a2.5 2.5 0 0 1-3.5-3.5l7-7a4 4 0 0 1 5.6 5.6l-7 7" {st}/>',
            'star': f'<path d="M0-7l2 5h5l-4 3 1.6 5L0 3l-4.6 3L-3 1l-4-3h5z" {st}/>',
            'share': f'<path d="M0-7v9M-4-3l4-4 4 4M-6 2v5h12v-5" {st}/>',
            'expand': f'<path d="M2-7h5v5M-2 7h-5v-5M7-7l-5 5M-7 7l5-5" {st}/>',
            'minus': f'<path d="M-6 0h12" {st}/>',
        }
        self.a(f'<g transform="translate({cx:g} {cy:g}) scale({s})">{G[name]}</g>')
    def chip(self, x, y, label, sel=False, h=44, clear=False, size=14, count=None, sec=None, on='canvas'):
        w = round(tw(label, size, 600) + 32 + (22 if clear else 0) + (28 if count is not None else 0))
        if sel and sec:
            self.rect(x, y, w, h, h / 2, f'{sec}-pill', f'{sec}-art', 1.5); fg = f'{sec}-text'; bg = f'{sec}-pill'
        elif sel:
            self.rect(x, y, w, h, h / 2, 'accent-soft', 'accent', 1.5); fg = 'accent-text'; bg = 'accent-soft'
        else:
            self.rect(x + .75, y + .75, w - 1.5, h - 1.5, h / 2, 'surface', 'line-strong'); fg = 'ink'; bg = 'surface'
        self.t(x + 16, y + h / 2 + size * .34, label, size, 700 if sel else 600, fg, on=bg)
        if count is not None:
            cx = x + w - 22 - (22 if clear else 0)
            self.a(f'<circle cx="{cx}" cy="{y+h/2}" r="10" fill="{self.C["warning-fill"]}"/>'); self.t(cx, y + h / 2 + 4.3, str(count), 12, 800, '#0A1F44', anchor='middle', on='warning-fill')
        if clear: self.glyph('x', x + w - 22, y + h / 2, fg, .9)
        return w
    def badge(self, x, y, label, bg, fg, h=22, size=12, w=700, icon=None, anchor='start'):
        bw = round(tw(label, size, w) + 18 + (16 if icon else 0))
        if anchor == 'end': x = x - bw
        self.rect(x, y, bw, h, h / 2, bg)
        if icon: self.glyph(icon, x + 15, y + h / 2, fg, .7)
        self.t(x + 9 + (16 if icon else 0), y + h / 2 + size * .35, label, size, w, fg, on=bg)
        return bw
    def year_badge(self, x, y, year, h=22, size=12):
        return self.badge(x, y, f'Year {year}', f'y{year}-soft', f'y{year}-text', h, size)
    def avatar(self, cx, cy, r, letter, year=2):
        self.a(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{self.C[f"y{year}-soft"]}"/>')
        self.t(cx, cy + r * .36, letter, round(r * .8), 800, f'y{year}-text', anchor='middle', on=f'y{year}-soft')
    def kbd(self, x, y, label, on='inset'):
        w = max(24, round(tw(label, 12, 700) + 14))
        self.rect(x, y, w, 22, 6, 'surface' if on != 'surface' else 'inset', 'line-strong', 1)
        self.t(x + w / 2, y + 15.5, label, 12, 700, 'ink-2', anchor='middle', on='surface' if on != 'surface' else 'inset')
        return w
    def tabs(self, x, y, items, active, sec, gap=28, size=15, base_w=None, on='canvas'):
        """In-page tabs: 3 px underline in the section colour; items are (label, count|None)."""
        cx = x; spans = []
        for lab, cnt in items:
            act = lab == active; lw = tw(lab, size, 800 if act else 600)
            self.t(cx, y + 26, lab, size, 800 if act else 600, 'ink' if act else 'ink-2', on=on)
            ex = 0
            if cnt is not None:
                bw = round(tw(str(cnt), 12, 700) + 14)
                self.rect(cx + lw + 7, y + 11, bw, 20, 10, f'{sec}-pill' if act else 'inset')
                self.t(cx + lw + 7 + bw / 2, y + 25.5, str(cnt), 12, 700, f'{sec}-text' if act else 'ink-2', anchor='middle', on=f'{sec}-pill' if act else 'inset')
                ex = bw + 7
            if act: spans.append((cx, cx + lw + ex))
            cx += lw + ex + gap
        self.line(x - (0 if base_w is None else 0), y + 44.75, x + (base_w or cx - x - gap), y + 44.75, 'line', 1.5)
        for a0, a1 in spans: self.rect(a0, y + 42, a1 - a0, 3.5, 1.75, f'{sec}-art')
        return cx
    def field(self, x, y, w, placeholder, h=46, icon='search', kbd=None, value=None, focus=False):
        if focus: self.rect(x - 3, y - 3, w + 6, h + 6, 17, 'accent-soft')
        self.rect(x + .75, y + .75, w - 1.5, h - 1.5, 14, 'surface', 'accent' if focus else 'line-strong', 2 if focus else 1.5)
        tx = x + 16
        if icon == 'search': self.icon('search', x + 13, y + h / 2 - 12, 24); tx = x + 46
        elif icon: self.glyph(icon, x + 24, y + h / 2, 'ink-2'); tx = x + 44
        if value: self.t(tx, y + h / 2 + 5.3, value, 15, 500, 'ink')
        else: self.t(tx, y + h / 2 + 5.3, placeholder, 15, 400, 'ink-3')
        if kbd: self.kbd(x + w - 50, y + h / 2 - 11, kbd, on='surface')
    def toast(self, x, y, w, mate, text, sub=None, action=None):
        h = 64 if not sub else 72
        self.a(f'<g filter="url(#float)"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="18" fill="{self.C["ink"] if not self.C["dark"] else self.C["raised"]}"/></g>')
        on = 'ink' if not self.C['dark'] else 'raised'; fg = 'surface' if not self.C['dark'] else 'ink'; fg2 = 'line' if not self.C['dark'] else 'ink-2'
        self.mate(mate, x + 8, y + h / 2 - 26, 52, 'happy')
        self.t(x + 66, y + (h / 2 + 5 if not sub else 30), text, 15, 700, fg, on=on)
        if sub: self.t(x + 66, y + 51, sub, 13, 500, fg2, on=on)
        if action:
            self.t(x + w - 18, y + h / 2 + 5, action, 14, 800, '#C9D4FF' if not self.C['dark'] else 'accent', anchor='end', on=on)
    def noora(self, cx, cy, R=31):
        self.clip += 1; cid = f'nc{self.clip}'
        self.a(f'<clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{R-4}"/></clipPath>')
        self.a(f'<g filter="url(#float)"><circle cx="{cx}" cy="{cy}" r="{R}" fill="{self.C["surface"]}" stroke="{self.C["noora-ring"]}" stroke-width="3"/></g>')
        self.a(f'<circle cx="{cx}" cy="{cy}" r="{R-4}" fill="{self.C["noora-frame"]}"/><image href="{NOORA_BUST}" x="{cx-R-1}" y="{cy-R+1}" width="{2*R+2}" height="{2*R+2}" clip-path="url(#{cid})"/>')
        self.a(f'<circle cx="{cx+R*.74:g}" cy="{cy-R*.74:g}" r="6" fill="{self.C["noora-online"]}" stroke="{self.C["surface"]}" stroke-width="2.5"/>')
    def bust(self, cx, cy, r):
        self.clip += 1; cid = f'nb{self.clip}'
        self.a(f'<clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath><circle cx="{cx}" cy="{cy}" r="{r}" fill="{self.C["noora-frame"]}"/>')
        self.a(f'<image href="{NOORA_BUST}" x="{cx-r-2}" y="{cy-r+1}" width="{2*r+4}" height="{2*r+4}" clip-path="url(#{cid})"/>')
    def formula_frac(self, x, y, num, den, size=18, fill='ink', on='surface', lhs=None):
        """A display formula: lhs, then num over den with a fraction bar. KaTeX in the product."""
        if lhs:
            self.t(x, y, lhs, size, 500, fill, on=on, raw=True, extra='font-style="italic"'); x += tw(re.sub('<[^>]+>', '', lhs), size, 500) + 8
        nw, dw = tw(re.sub('<[^>]+>', '', num), size, 500), tw(re.sub('<[^>]+>', '', den), size, 500); fw = max(nw, dw) + 10
        self.t(x + fw / 2, y - size * .62, num, size, 500, fill, anchor='middle', on=on, raw=True, extra='font-style="italic"')
        self.line(x, y - size * .3, x + fw, y - size * .3, fill, 1.5)
        self.t(x + fw / 2, y + size * .78, den, size, 500, fill, anchor='middle', on=on, raw=True, extra='font-style="italic"')
        return x + fw
    # ---- shells ----
    def status(self, fill='ink'):
        c = self.col(fill)
        self.t(28, 32, '9:41', 15, 700, fill, on='canvas', check=False)
        self.a(f'<g fill="{c}"><rect x="306" y="22" width="3" height="8" rx="1"/><rect x="311" y="19" width="3" height="11" rx="1"/><rect x="316" y="16" width="3" height="14" rx="1"/><rect x="330" y="17" width="26" height="13" rx="4" fill="none" stroke="{c}" stroke-width="1.5"/><rect x="332.5" y="19.5" width="18" height="8" rx="2"/></g>')
    def lockup(self, x, y, h):
        f = 'hub-lockup-horizontal-white.png' if self.C['dark'] else 'hub-lockup-horizontal.png'
        self.a(f'<image href="{PUB}brand/{f}" x="{x}" y="{y}" width="{h*7.07:.1f}" height="{h}"/>')
    def phone_top(self, appbar=True):
        self.rect(0, 0, self.W, self.H, 0, 'canvas'); self.status()
        if appbar:
            self.lockup(16, 56, 21)
            self.rect(286, 44, 44, 44, 14, 'canvas'); self.icon('search', 296, 54, 24)
            self.avatar(352, 66, 18, 'S', 2)
    def phone_bottom(self, active=None, launcher=True, tabbar=True, launcher_y=704):
        if launcher: self.noora(338, launcher_y)
        if not tabbar:
            self.rect(128, 826, 134, 5, 2.5, 'ink'); return
        self.rect(0, 738, 390, 106, 0, 'surface'); self.line(0, 738.75, 390, 738.75, 'line', 1.5, 'stroke-linecap="butt"')
        for key, lab, cx in [('home', 'Home', 39), ('modules', 'Modules', 117), ('library', 'Library', 195), ('forum', 'Forum', 273), ('more', 'More', 351)]:
            sec = SECTION[key]
            if key == active:
                self.rect(cx - 30, 746, 60, 34, 17, f'{sec}-pill'); self.icon(key, cx - 12, 751, 24, True, self.C[f'{sec}-pill'])
                self.t(cx, 798, lab, 12, 800, f'{sec}-text', anchor='middle')
            else:
                self.icon(key, cx - 12, 751, 24); self.t(cx, 798, lab, 12, 600, 'ink-2', anchor='middle')
        self.rect(128, 826, 134, 5, 2.5, 'ink')
    def laptop_top(self, active=None, search=True):
        C = self.C
        self.rect(0, 0, self.W, self.H, 0, 'canvas')
        self.rect(0, 0, 248, self.H, 0, 'surface'); self.line(248.75, 0, 248.75, self.H, 'line', 1.5, 'stroke-linecap="butt"')
        self.lockup(24, 30, 27)
        nav = [('home', 'Home'), ('modules', 'Modules'), ('library', 'Library'), ('notebook', 'Notebook'), ('forum', 'Forum'), ('calendar', 'Calendar'), None,
               ('boards', 'Boards'), ('grades', 'Grades'), ('career', 'Career Navigator'), ('newsletter', 'Newsletter'), ('daily', 'Daily puzzles')]
        y = 88
        for item in nav:
            if item is None:
                self.line(24, y + 6, 224, y + 6, 'line', 1.5); self.t(28, y + 30, 'TOOLS', 11, 800, 'ink-3', ls=1.1); y += 42; continue
            key, lab = item; sec = SECTION[key]
            if key == active:
                self.rect(12, y, 224, 44, 14, f'{sec}-pill'); self.icon(key, 26, y + 11, 22, True, C[f'{sec}-pill'])
                self.t(60, y + 27, lab, 15, 700, f'{sec}-text', on=f'{sec}-pill')
            else:
                self.icon(key, 26, y + 11, 22); self.t(60, y + 27, lab, 15, 500, 'ink-2')
            y += 48
        self.rect(16, 824, 216, 52, 16, 'inset'); self.avatar(44, 850, 16, 'S', 2)
        self.t(70, 846, 'Sara', 14, 700, on='inset'); self.t(70, 864, 'Year 2', 12, 700, 'y2-text', on='inset')
        if search:
            self.field(280, 24, 520, 'Search papers, lessons, threads', 44, kbd='⌘K')
        self.rect(1312.75, 24.75, 42.5, 42.5, 14, 'surface', 'line-strong'); self.glyph('bell', 1334, 44, 'ink-2'); self.a(f'<circle cx="1347" cy="33" r="5" fill="{C["calendar-art"]}"/>')
        self.rect(1364.75, 24.75, 42.5, 42.5, 14, 'surface', 'line-strong'); self.glyph('moon', 1386, 46, 'ink-2')
    def laptop_bottom(self, launcher=True):
        if launcher: self.noora(1364, 836, 35)
    def band(self, x, y, w, h, sec, r=22):
        self.rect(x, y, w, h, r, f'{sec}-pill')
    def scrim(self, op=.45):
        self.a(f'<rect width="{self.W}" height="{self.H}" fill="{"#0A1F44" if not self.C["dark"] else "#0B1530"}" opacity="{op}"/>')
    # ---- output ----
    def defs(self):
        sh = .07 if not self.C['dark'] else .35
        halo = ('<filter id="halo" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="d"/>'
                '<feFlood flood-color="#EAF0FF" flood-opacity=".9"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>') if self.C['dark'] else ''
        fl = '#0A1F44' if not self.C['dark'] else '#0B1530'
        return (f'<defs><filter id="lift" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="{fl}" flood-opacity="{sh}"/></filter>'
                f'<filter id="float" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="{fl}" flood-opacity="{min(sh*3,.6):.2f}"/></filter>{halo}</defs>')
    def save(self, name):
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.W} {self.H}" width="{self.W}" height="{self.H}">'
               f'<title>{escape(self.title)}</title><style>{FONTS}</style>{self.defs()}\n' + '\n'.join(self.O) + '\n</svg>\n')
        bad = {h.upper() for h in re.findall(r'#[0-9A-Fa-f]{6}\b', svg)} - ALLOWED
        if bad: print(name, 'OFF-TOKEN', bad)
        for w in self.warn: print(name, 'CONTRAST', w)
        open(os.path.join(ROOT, name), 'w').write(svg)
        return name
