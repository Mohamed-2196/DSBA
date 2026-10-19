from kit import B, tw

YOURS = [
    ('Cramér–Rao bound: why n·I(θ) and not I(θ)?', 'You started it', 'ST2134', 2, '3h', 3, 12, True, 'New reply from Ali'),
    ('Study group for ST2133 before the mock?', 'You replied', 'Study groups', None, 'yesterday', 9, 5, False, None),
    ('MLE for Uniform(0, θ): why the maximum?', 'You follow it', 'ST2134', 2, '2 days', 6, 18, True, None),
    ('How do you revise EC1002 diagrams?', 'You started it', 'EC1002', 1, '5 days', 4, 3, False, None),
    ('MT1186: Lagrange multipliers with two constraints', 'You replied', 'MT1186', 1, '1 week', 7, 9, True, None),
]
OP_BODY = ('In the lessons the bound has n·I(θ), but the formula sheet shows I(θ). Which one do I use for Q1(a)(ii) of '
           'May 2023 Zone A?')
ANS_1 = 'I(θ) is the information in one observation. n independent observations carry n times as much:'
ANS_2 = 'So for the whole sample the bound is 1 / (n I(θ)). The formula sheet gives it per observation.'
AR = ['شكراً علي، هذا وضّح لي السؤال تماماً.', 'نفس الفكرة في ورقة مايو ٢٠٢٢ أيضاً.']

def stat(b, x, y, glyph, n, on='surface'):
    b.glyph(glyph, x, y - 4, 'ink-2', .8); b.t(x + 12, y + 1, str(n), 13, 700, 'ink-2', on=on)

def thread_row(b, x, y, w, row, phone=False):
    title, how, where, year, when, replies, votes, answered, fresh = row
    h = 96 if not phone else 112
    b.card(x, y, w, h, 18)
    if fresh: b.rect(x, y + 18, 4, h - 36, 2, 'forum-art')
    tx = x + 20
    if phone:
        b.wrap(tx, y + 28, title, w - 40, 15, 700, 21, 'ink', maxlines=2)
    else:
        b.t(tx, y + 32, title, 16, 700)
    my = y + (56 if not phone else 74)
    mx = tx
    if where:
        mx += b.badge(mx, my - 15, where, 'inset', 'ink-2', 22, 12, 700) + 8
    if year:
        mx += b.year_badge(mx, my - 15, year) + 8
    b.t(mx, my, f'{how} · {when}', 13, 500, 'ink-2')
    ly = my + 24
    if fresh:
        b.a(f'<circle cx="{tx+4}" cy="{ly-4}" r="4" fill="{b.C["forum-art"]}"/>'); b.t(tx + 14, ly, fresh, 13, 700, 'forum-text')
    elif not phone:
        b.t(tx, ly, '', 13)
    rx = x + w - 20
    if phone:
        sx = x + w - 20
        ax = tx + (tw(fresh, 13, 700) + 30 if fresh else 0)
        if answered: b.glyph('check', ax + 4, ly - 4, 'success', .7); b.t(ax + 14, ly, 'Answered', 13, 700, 'success')
    else:
        stat(b, rx - 104, y + 32, 'chat', replies); stat(b, rx - 44, y + 32, 'vote', votes)
        if answered: b.badge(rx, y + 52, 'Answered', 'modules-pill', 'success', 24, 12, icon='check', anchor='end')
    return h

def forum_list_laptop(b):
    b.laptop_top('forum')
    b.band(280, 92, 1128, 136, 'forum', 24)
    b.mate('forum', 1282, 104, 112)
    b.t(308, 142, 'Forum', 34, 750, 'ink', 'disp', on='forum-pill')
    b.t(308, 172, 'Ask your cohort, share what worked and find people to revise with.', 15, 500, 'ink-2', on='forum-pill')
    b.a(f'<circle cx="313" cy="198" r="5" fill="{b.C["success"]}"/>'); b.t(326, 203, '14 replies today', 13, 700, 'ink', on='forum-pill')
    b.t(442, 203, '3 questions are waiting for a first reply', 13, 700, 'forum-text', on='forum-pill', extra='text-decoration="underline"')
    b.button(1104, 136, 'Start a thread', 'primary', icon='plus', on='forum-pill')
    b.tabs(280, 244, [('All', 312), ('Yours', None), ('Year 1', None), ('Year 2', None), ('Year 3', None), ('Study groups', None), ('Campus', None)], 'Yours', 'forum', 28, base_w=800)
    b.field(1100, 244, 308, 'Search threads', 44)
    x = 280
    x += b.chip(x, 304, 'No replies yet', h=36, size=13) + 8
    for tg in ('ST2134', 'EXAM-PREP', 'R'): x += b.chip(x, 304, tg, h=36, size=13) + 8
    b.t(1080, 327, 'Newest activity first', 13, 600, 'ink-2', anchor='end', on='canvas')
    y = 356
    for r in YOURS: y += thread_row(b, 280, y, 800, r) + 10
    # sidebar
    b.card(1100, 304, 308, 236)
    b.t(1124, 338, 'Helpful this week', 18, 750, 'ink', 'disp')
    for i, (n, yr, rp, acc) in enumerate([('Ali', 3, 9, 3), ('Fatima', 3, 6, 2), ('Sara', 2, 4, 1)]):
        y0 = 360 + i * 56
        b.avatar(1142, y0 + 20, 18, n[0], yr); b.t(1170, y0 + 16, n + (' (you)' if n == 'Sara' else ''), 15, 700)
        b.t(1170, y0 + 35, f'{rp} replies, {acc} accepted', 13, 500, 'ink-2'); b.year_badge(1384 - 56, y0 + 6, yr)
    b.card(1100, 560, 308, 196)
    b.t(1124, 594, 'Waiting for a first reply', 18, 750, 'ink', 'disp')
    for i, (tt, meta) in enumerate([('Is the t-test robust with n = 12?', 'ST2134 · 40 min'), ('EC1002 elasticity sign question', 'EC1002 · 2h'), ('Any MT1186 Zone B solutions?', 'MT1186 · 3h')]):
        y0 = 616 + i * 44
        b.t(1124, y0 + 14, tt, 14, 700); b.t(1124, y0 + 32, meta, 13, 500, 'ink-2')
    b.laptop_bottom()

def forum_list_phone(b):
    b.phone_top()
    b.band(16, 92, 358, 128, 'forum')
    b.mate('forum', 270, 104, 104)
    b.t(34, 136, 'Forum', 28, 750, 'ink', 'disp', on='forum-pill')
    b.a(f'<circle cx="39" cy="160" r="5" fill="{b.C["success"]}"/>'); b.t(52, 165, '14 replies today', 13, 700, 'ink', on='forum-pill')
    b.t(34, 190, '3 questions are waiting', 13, 700, 'forum-text', on='forum-pill', extra='text-decoration="underline"')
    b.t(34, 208, 'for a first reply', 13, 700, 'forum-text', on='forum-pill', extra='text-decoration="underline"')
    b.button(16, 232, 'Start a thread', 'primary', w=358, icon='plus', on='canvas')
    b.tabs(16, 284, [('All', 312), ('Yours', None), ('Year 1', None), ('Year 2', None), ('Year 3', None)], 'Yours', 'forum', 20, 14, base_w=358)
    y = 344
    for r in YOURS[:4]: y += thread_row(b, 16, y, 358, r, phone=True) + 10
    b.phone_bottom('forum')

def formula_line(b, x, y, size=18, on='surface', fill='ink'):
    x2 = b.formula_frac(x, y, '1', 'n I(θ)', size, fill, on, lhs='Var(θ̂) ≥'.replace('θ̂', 'T'))
    return x2

def op_card(b, x, y, w, phone=False):
    i0 = len(b.O)
    b.avatar(x + 38, y + 38, 18, 'S', 2)
    b.t(x + 66, y + 34, 'Sara', 15, 700); bx = x + 66 + tw('Sara', 15, 700) + 8
    bx += b.year_badge(bx, y + 19, 2) + 6; b.badge(bx, y + 19, 'Author', 'inset', 'ink-2')
    b.t(x + 66, y + 52, '3h ago', 13, 500, 'ink-2')
    yy = b.wrap(x + 20, y + 88, OP_BODY, w - 40, 15 if phone else 16, 400, 24 if phone else 25, 'ink')
    b.rect(x + 20, yy - 6, w - 40, 64, 12, 'inset')
    b.formula_frac(x + (w - 190) / 2, yy + 28, '1', 'n I(θ)', 18, 'ink', 'inset', lhs='Var(T) ≥')
    ay = yy + 72
    b.rect(x + 20, ay, 70, 40, 12, 'accent-soft'); b.glyph('vote', x + 40, ay + 20, 'accent-text', .9); b.t(x + 56, ay + 25, '12', 14, 800, 'accent-text', on='accent-soft')
    b.glyph('reply', x + 112, ay + 20, 'ink-2', .9); b.t(x + 126, ay + 25, 'Reply', 14, 700, 'ink-2')
    b.glyph('bell', x + 196, ay + 20, 'ink-2', .8); b.t(x + 210, ay + 25, 'Following', 14, 700, 'ink-2')
    if not phone:
        b.glyph('link', x + 312, ay + 20, 'ink-2', .9); b.t(x + 326, ay + 25, 'Copy link', 14, 700, 'ink-2')
    b.glyph('more', x + w - 34, ay + 20, 'ink-2')
    h = ay + 54 - y; b.card_at(i0, x, y, w, h); return h

def answer_card(b, x, y, w, phone=False):
    i0 = len(b.O)
    b.avatar(x + 38, y + 38, 18, 'A', 3)
    b.t(x + 66, y + 34, 'Ali', 15, 700); bx = x + 66 + tw('Ali', 15, 700) + 8
    b.year_badge(bx, y + 19, 3)
    b.t(x + 66, y + 52, '2h ago', 13, 500, 'ink-2')
    b.badge(x + w - 20, y + 22, 'Accepted answer', 'modules-pill', 'success', 26, 13, icon='check', anchor='end')
    fs, lh = (15, 23) if phone else (16, 25)
    yy = b.wrap(x + 20, y + 88, ANS_1, w - 40, fs, 400, lh, 'ink')
    b.rect(x + 20, yy - 8, w - 40, 46, 12, 'inset')
    b.t(x + w / 2, yy + 21, 'I<tspan dy="5" font-size="13">n</tspan><tspan dy="-5">(θ) = n I(θ)</tspan>', 18, 500, 'ink', anchor='middle', on='inset', raw=True, extra='font-style="italic"')
    yy = b.wrap(x + 20, yy + 60, ANS_2, w - 40, fs, 400, lh, 'ink')
    ay = yy - 6
    b.rect(x + 20, ay, 62, 40, 12, 'inset'); b.glyph('vote', x + 38, ay + 20, 'ink-2', .9); b.t(x + 54, ay + 25, '9', 14, 800, 'ink-2', on='inset')
    b.glyph('reply', x + 104, ay + 20, 'ink-2', .9); b.t(x + 118, ay + 25, 'Reply', 14, 700, 'ink-2')
    b.glyph('more', x + w - 34, ay + 20, 'ink-2')
    h = ay + 54 - y; b.card_at(i0, x, y, w, h); b.rect(x, y + 16, 4, h - 32, 2, 'success'); return h

def arabic_card(b, x, y, w):
    h = 128; b.card(x, y, w, h)
    b.avatar(x + 38, y + 38, 18, 'F', 3)
    b.t(x + 66, y + 34, 'Fatima', 15, 700); b.year_badge(x + 66 + tw('Fatima', 15, 700) + 8, y + 19, 3)
    b.t(x + 66, y + 52, '1h ago', 13, 500, 'ink-2')
    for i, l in enumerate(AR): b.t(x + w - 20, y + 84 + i * 28, l, 16, 400, 'ink', 'ar', anchor='start', extra='direction="rtl"')
    return h

def thread_laptop(b):
    b.laptop_top('forum')
    b.glyph('left', 288, 101, 'accent-text'); b.t(300, 106, 'Forum', 14, 700, 'accent-text', on='canvas')
    b.t(350, 106, '/   Year 2   /   ST2134', 14, 600, 'ink-2', on='canvas')
    b.t(280, 148, 'Cramér–Rao bound: why n·I(θ) and not I(θ)?', 30, 750, 'ink', 'disp', on='canvas')
    x = 280 + b.badge(280, 164, 'ST2134', 'inset', 'ink-2', 26, 13) + 8
    x += b.badge(x, 164, 'EXAM-PREP', 'inset', 'ink-2', 26, 13) + 12
    b.t(x, 182, '3 replies · 12 votes · asked 3h ago', 13, 500, 'ink-2', on='canvas')
    y = 206
    y += op_card(b, 280, y, 800) + 22
    b.t(280, y + 4, '3 replies', 18, 750, 'ink', 'disp', on='canvas'); b.t(1062, y + 4, 'Accepted first', 13, 700, 'ink-2', anchor='end', on='canvas'); b.glyph('down', 1072, y, 'ink-2', .6)
    y += 18
    y += answer_card(b, 280, y, 800) + 12
    arabic_card(b, 280, y, 800)
    # sidebar
    b.card(1100, 206, 308, 220)
    b.t(1124, 240, 'About this thread', 18, 750, 'ink', 'disp')
    b.binder(1124, 258, 'y2-fill', .8)
    b.t(1164, 274, 'ST2134', 13, 700, 'ink-2', 'mono'); b.t(1164, 294, 'Statistical Inference', 15, 700)
    b.t(1124, 334, 'Asked in Year 2 · 41 views', 13, 500, 'ink-2')
    b.button(1124, 356, 'Following', 'secondary', w=260, h=44, size=14, icon='bell')
    b.card(1100, 446, 308, 220)
    b.t(1124, 480, 'Related threads', 18, 750, 'ink', 'disp')
    for i, (tt, meta) in enumerate([('MLE for Uniform(0, θ): why the maximum?', '6 replies · answered'), ('Fisher information: one or two derivatives?', '4 replies · answered'), ('Efficient vs unbiased in Q1(c)', '2 replies')]):
        y0 = 500 + i * 52
        b.wrap(1124, y0 + 16, tt, 260, 14, 700, 19, 'ink', maxlines=1); b.t(1124, y0 + 36, meta, 13, 500, 'ink-2')
    b.toast(1100, 690, 308, 'forum', 'Marked as the answer', 'Ali hears about it', 'Undo')
    b.laptop_bottom()

def thread_phone(b):
    b.rect(0, 0, 390, 844, 0, 'canvas')
    # scrolled: the end of the question, then the accepted answer and an Arabic reply
    h = op_card(b, 16, -84, 358, True)
    y = -84 + h + 26
    b.t(16, y, '3 replies', 18, 750, 'ink', 'disp', on='canvas'); b.t(360, y, 'Accepted first', 13, 700, 'ink-2', anchor='end', on='canvas'); b.glyph('down', 368, y - 4, 'ink-2', .6)
    y += 16
    y += answer_card(b, 16, y, 358, True) + 12
    arabic_card(b, 16, y, 358)
    # compact top bar that appears on scroll
    b.rect(0, 0, 390, 100, 0, 'canvas'); b.line(0, 99.25, 390, 99.25, 'line', 1.5, 'stroke-linecap="butt"'); b.status()
    b.glyph('left', 26, 72, 'accent-text')
    b.t(44, 70, 'Cramér–Rao bound: why n·I(θ)…', 15, 700, 'ink', on='canvas'); b.t(44, 88, 'Forum · ST2134', 12, 600, 'ink-2', on='canvas')
    b.glyph('bell', 318, 72, 'ink-2'); b.glyph('more', 358, 72, 'ink-2')
    b.noora(52, 704)
    b.phone_bottom('forum', launcher=False)

if __name__ == '__main__':
    b = B(1440, 900, 'light', 'Forum, the Yours tab, on a laptop, Deskmates v2'); forum_list_laptop(b); b.save('forum-list-laptop.svg')
    b = B(390, 844, 'light', 'Forum, the Yours tab, on a phone, Deskmates v2'); forum_list_phone(b); b.save('forum-list-phone.svg')
    b = B(1440, 900, 'light', 'A forum thread with an accepted answer on a laptop, Deskmates v2'); thread_laptop(b); b.save('forum-thread-laptop.svg')
    b = B(390, 844, 'light', 'A forum thread with an accepted answer on a phone, Deskmates v2'); thread_phone(b); b.save('forum-thread-phone.svg')
    b = B(390, 844, 'dark', 'A forum thread with an accepted answer on a phone, dark, Deskmates v2'); thread_phone(b); b.save('forum-thread-phone-dark.svg')
