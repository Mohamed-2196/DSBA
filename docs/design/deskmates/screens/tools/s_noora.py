from kit import B, tw
from s_module import module_laptop, module_phone

def her(b, x, y, w, lines, extra=None):
    """Mini Noora's message: a card on surface with a 3 px lavender rule."""
    i0 = len(b.O); yy = y + 26
    for para in lines: yy = b.wrap(x + 18, yy, para, w - 32, 15, 400, 22, 'ink') + 6
    if extra: yy = extra(yy)
    h = yy - y - (10 if not extra else -4)
    b.card_at(i0, x, y, w, h, 16, lift=False) if False else b.card_at(i0, x, y, w, h, 16)
    b.rect(x, y + 12, 3, h - 24, 1.5, 'noora-frame')
    return h

def mine(b, right, y, text, maxw=250):
    w = min(maxw, tw(text, 15, 500) + 32)
    lines = []
    if tw(text, 15, 500) + 32 > maxw:
        yy = y; i0 = len(b.O)
        end = b.wrap(right - maxw + 16, y + 26, text, maxw - 32, 15, 500, 22, 'ink', on='accent-soft')
        h = end - y - 4; n = len(b.O); b.rect(right - maxw, y, maxw, h, 16, 'accent-soft'); b.O.insert(i0, b.O.pop(n)); return h
    b.rect(right - w, y, w, 40, 16, 'accent-soft'); b.t(right - w + 16, y + 26, text, 15, 500, 'ink', on='accent-soft'); return 40

def chat(b, X, Y, W, H, phone=False):
    # header
    b.bust(X + 36, Y + 36, 20)
    b.t(X + 64, Y + 32, 'Mini Noora', 19, 750, 'ink', 'disp')
    b.a(f'<circle cx="{X+68}" cy="{Y+48}" r="4" fill="{b.C["noora-online"]}"/>'); b.t(X + 78, Y + 52, 'Knows your modules and this page', 12, 600, 'ink-2')
    for i, gl in enumerate(['history', 'trash', 'x']):
        b.glyph(gl, X + W - 96 + i * 36, Y + 36, 'ink-2', .95)
    b.line(X, Y + 70, X + W, Y + 70, 'line', 1.5, 'stroke-linecap="butt"')
    x0, w0 = X + 16, W - 32; y = Y + 86
    y += mine(b, X + W - 16, y, 'When is the ST2134 exam?') + 12
    y += her(b, x0, y, w0 - 30, ['Thursday 23 October at 9:00, in Hall B. That’s in 4 days.']) + 12
    y += mine(b, X + W - 16, y, 'What is a p-value?') + 12
    def refs(yy):
        b.rect(x0 + 18, yy - 4, w0 - 30 - 36, 44, 10, 'inset')
        b.t(x0 + 18 + (w0 - 66) / 2, yy + 23, 'p = P(T ≥ t<tspan dy="4" font-size="11">obs</tspan><tspan dy="-4"> | H₀)</tspan>', 17, 500, 'ink', anchor='middle', on='inset', raw=True, extra='font-style="italic"')
        yy += 60
        yy = b.wrap(x0 + 18, yy, 'A small p means your data sit badly with H₀.', w0 - 62, 15, 400, 22, 'ink') + 8
        b.t(x0 + 18, yy, 'WHERE TO LOOK', 11, 800, 'ink-3', ls=1.1); yy += 10
        for gl, lab in (('play', 'ST2134 · Chapter 8, lesson 2'), ('doc', 'ST2134 · May 2023 · Zone A, Q3')):
            if gl == 'doc': b.doc(x0 + 20, yy + 6, 'paper', 16)
            else: b.rect(x0 + 18, yy + 6, 20, 20, 6, 'modules-pill'); b.glyph('play', x0 + 29, yy + 16, 'modules-text', .7)
            b.t(x0 + 46, yy + 21, lab, 14, 700, 'accent-text', extra='text-decoration="underline"'); yy += 30
        b.glyph('share', x0 + 26, yy + 12, 'ink-3', .8); b.t(x0 + 38, yy + 17, 'Copy answer', 12, 700, 'ink-2')
        return yy + 22
    y += her(b, x0, y, w0 - 30, ['The chance of a result at least as extreme as yours, if H₀ is true:'], refs) + 22
    # suggested prompts from where you are
    b.t(x0, y + 4, 'FOR THIS PAGE', 11, 800, 'ink-3', ls=1.1); y += 14
    cx = x0
    for p in ('Where are the ST2134 past papers?', 'Is ST2134 harder than ST2133?'):
        cw = tw(p, 13, 600) + 28
        if cx + cw > X + W - 16: cx = x0; y += 44
        if y > Y + H - 130: break
        b.rect(cx + .75, y + .75, cw - 1.5, 36.5, 19, 'surface', 'line-strong'); b.t(cx + 14, y + 24, p, 13, 600, 'ink'); cx += cw + 8
    # composer
    cy = Y + H - 70
    b.line(X, cy - 10, X + W, cy - 10, 'line', 1.5, 'stroke-linecap="butt"')
    b.rect(X + 16.75, cy + .75, W - 32 - 54 - 1.5, 44.5, 14, 'surface', 'line-strong')
    b.glyph('attach', X + 38, cy + 23, 'ink-2', .9); b.t(X + 58, cy + 28, 'Message Mini Noora', 15, 400, 'ink-3')
    b.rect(X + W - 62, cy, 46, 46, 13, 'accent-edge'); b.rect(X + W - 62, cy, 46, 43, 13, 'accent'); b.glyph('send', X + W - 39, cy + 21, 'on-accent')

def noora_laptop(b):
    module_laptop(b, launcher=False)
    X, Y, W, H = 1020, 96, 380, 792
    b.a(f'<g filter="url(#float)"><rect x="{X}" y="{Y}" width="{W}" height="{H}" rx="22" fill="{b.C["surface"]}"/></g>')
    chat(b, X, Y, W, H)

def noora_phone(b):
    module_phone(b, launcher=False)
    b.scrim(.45)
    b.a(f'<g filter="url(#float)"><rect x="0" y="52" width="390" height="800" rx="28" fill="{b.C["surface"]}"/></g>')
    b.rect(175, 60, 40, 5, 2.5, 'line-strong')
    chat(b, 0, 66, 390, 750, phone=True)
    b.rect(128, 826, 134, 5, 2.5, 'ink')

if __name__ == '__main__':
    b = B(1440, 900, 'light', 'Mini Noora’s chat panel on a laptop, Deskmates v2'); noora_laptop(b); b.save('noora-laptop.svg')
    b = B(390, 844, 'light', 'Mini Noora’s chat panel on a phone, Deskmates v2'); noora_phone(b); b.save('noora-phone.svg')
