from kit import B, tw
from s_module import module_laptop

GROUPS = [
    ('Lessons', 'modules', [('Simple linear ', 'regression', '', 'ST2134 · Chapter 9, lesson 2'), ('', 'Regression', ' diagnostics', 'EC2020 · Chapter 4, lesson 3')]),
    ('Library', 'library', [('', 'Regression', ' on one page', "Students' note · Ali · Year 2"), ('Linear ', 'regression', ' formula sheet', "Students' note · Fatima · Year 3")]),
    ('Forum', 'forum', [('', 'Regression', ' vs correlation: which test?', 'ST2134 · 6 replies · answered')]),
    ('Modules', 'modules', [('EC2020 Elements of Econometrics', '', '', 'Year 2 · in 5 chapters')]),
]
ICON = {'Lessons': 'modules', 'Library': 'library', 'Forum': 'forum', 'Modules': 'modules'}

def hl_title(b, x, y, pre, hit, post, size=15, on='surface'):
    if hit:
        hx = x + tw(pre, size, 600); hw = tw(hit, size, 800)
        b.rect(hx - 3, y - size * .78, hw + 6, size * 1.05, 4, 'library-tint')
    b.t(x, y, b.ts(pre) + b.ts(hit, w=800) + b.ts(post), size, 600, 'ink', on=on, raw=True)

def results(b, x, y, w, phone=False):
    first = True
    for label, sec, rows in GROUPS:
        b.t(x + 8, y + 14, label.upper(), 11, 800, 'ink-3', ls=1.1); y += 24
        for pre, hit, post, meta in rows:
            rh = 52 if not phone else 58
            on = 'surface'
            if first:
                b.rect(x, y, w, rh, 12, 'accent-soft'); on = 'accent-soft'
            b.rect(x + 8, y + rh / 2 - 17, 34, 34, 10, f'{sec}-pill' if not first else 'surface')
            b.icon(ICON[label], x + 13, y + rh / 2 - 12, 24)
            if phone:
                hl_title(b, x + 54, y + 24, pre, hit, post, 15, on); b.t(x + 54, y + 44, meta, 13, 500, 'ink-2', on=on)
            else:
                hl_title(b, x + 54, y + 22, pre, hit, post, 15, on); b.t(x + 54, y + 41, meta, 13, 500, 'ink-2', on=on)
            if first and not phone:
                b.t(x + w - 50, y + rh / 2 + 5, 'Open', 13, 700, 'accent-text', anchor='end', on=on); b.kbd(x + w - 40, y + rh / 2 - 11, '↵', on='accent-soft')
            first = False; y += rh
        y += 8
    return y

def search_laptop(b):
    module_laptop(b, launcher=False)
    b.scrim(.42)
    X, Y, W, H = 400, 92, 640, 640
    b.a(f'<g filter="url(#float)"><rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="22" fill="{b.C["surface"]}"/></g>')
    # input row: Loupe sits in the palette
    b.mate('search', X + 10, Y + 6, 60)
    b.t(X + 76, Y + 44, 'regresion', 20, 600, 'ink')
    b.rect(X + 76 + tw('regresion', 20, 600) + 3, Y + 24, 2, 26, 1, 'accent')
    b.kbd(X + W - 112, Y + 25, 'Esc', on='surface'); b.t(X + W - 74, Y + 41, 'to clear', 12, 600, 'ink-3')
    b.line(X, Y + 72, X + W, Y + 72, 'line', 1.5, 'stroke-linecap="butt"')
    # spelling correction
    b.rect(X + 16, Y + 86, W - 32, 40, 12, 'search-pill')
    b.t(X + 32, Y + 111, b.ts('Nothing matched “regresion”. Showing results for ') + b.ts('“regression”', w=800) + b.ts('.'), 14, 500, 'search-text', on='search-pill', raw=True)
    results(b, X + 12, Y + 140, W - 24)
    # footer keys
    b.line(X, Y + H - 48, X + W, Y + H - 48, 'line', 1.5, 'stroke-linecap="butt"')
    fx = X + 20; fy = Y + H - 35
    fx += b.kbd(fx, fy, '↑', on='surface') + 4; fx += b.kbd(fx, fy, '↓', on='surface') + 6; b.t(fx, fy + 16, 'to move', 12, 600, 'ink-2'); fx += 70
    fx += b.kbd(fx, fy, '↵', on='surface') + 6; b.t(fx, fy + 16, 'to open', 12, 600, 'ink-2'); fx += 70
    fx += b.kbd(fx, fy, 'Esc', on='surface') + 6; b.t(fx, fy + 16, 'to clear', 12, 600, 'ink-2')
    b.t(X + W - 20, fy + 16, '7 results', 12, 700, 'ink-3', anchor='end')

def search_phone(b):
    b.rect(0, 0, 390, 844, 0, 'surface'); b.status()
    b.rect(0, 0, 390, 0, 0, 'surface')
    # field row
    b.glyph('left', 26, 76, 'accent-text')
    b.field(44, 54, 330, '', 46, icon='search', value='regresion', focus=True)
    b.rect(90 + tw('regresion', 15, 500) + 2, 66, 2, 22, 1, 'accent')
    b.glyph('x', 352, 77, 'ink-2', .9)
    # correction with Loupe
    b.rect(16, 116, 358, 66, 16, 'search-pill')
    b.mate('search', 18, 112, 66)
    b.t(84, 143, 'Nothing matched “regresion”.', 14, 500, 'search-text', on='search-pill')
    b.t(84, 164, b.ts('Showing results for ') + b.ts('“regression”', w=800) + b.ts('.'), 14, 500, 'search-text', on='search-pill', raw=True)
    results(b, 8, 196, 374, phone=True)
    b.rect(128, 826, 134, 5, 2.5, 'ink')

if __name__ == '__main__':
    b = B(1440, 900, 'light', 'Search: the ⌘K palette with a spelling correction on a laptop, Deskmates v2'); search_laptop(b); b.save('search-laptop.svg')
    b = B(390, 844, 'light', 'Search: the palette with a spelling correction on a phone, Deskmates v2'); search_phone(b); b.save('search-phone.svg')
