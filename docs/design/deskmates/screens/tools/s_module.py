from kit import B, tw

DATES = [('revision', 'ST2134 revision session', 'Revision, Mon 20 Oct', 'Tomorrow'),
         ('deadline', 'ST2134 MCQ on VLE', 'Open now · closes Wed 22 Oct', '3 days'),
         ('exam', 'ST2134 Statistical Inference', 'Exam, Thu 23 Oct, 9:00', '4 days')]
DOT = {'revision': 'success', 'deadline': 'warning-fill', 'exam': 'exam', 'mock': 'accent'}
# sitting, then cells: Zone A, Zone B, RTC, examiners' report (kind, label, note, note colour)
SITTINGS = [('Oct 2025', [('paper', 'Zone A', 'New', 'accent-text'), ('paper', 'Zone B', 'New', 'accent-text'), None, None]),
            ('May 2025', [('paper', 'Zone A', '71%', 'success'), ('paper', 'Zone B', None, None), ('paper', 'RTC', None, None), ('report', 'Report', None, None)]),
            ('May 2024', [('paper', 'Zone A', None, None), ('paper', 'Zone B', '2:51', 'ink-2'), None, ('report', 'Report', None, None)])]
NOTES = [('Likelihood ratio tests, worked', 'Edited 2h ago · 3 pages'), ('Cramér–Rao bound on one page', 'Edited yesterday'),
         ('Chapter 7 lesson notes', 'Edited Mon · 4 video times')]
THREADS = [('MLE for Uniform(0, θ): why the maximum?', 'Ali · 6 replies', 'Answered'), ('Is ST2134 harder than ST2133?', 'Fatima · 14 replies', None),
           ('Cramér–Rao bound: why n·I(θ) and not I(θ)?', 'You · 3 replies', 'Answered')]
CHAPTERS = [('Point estimation', 4, 4), ('Sampling distributions', 5, 5), ('Interval estimation', 3, 4), ('Hypothesis testing', 1, 5)]

def block_title(b, x, y, title, link=None, right=None):
    b.t(x, y, title, 19, 750, 'ink', 'disp')
    if link: b.t(right, y, link, 14, 700, 'accent-text', anchor='end')

def date_rows(b, x, y, w, rows=DATES, rh=54, size=15):
    for i, (kind, title, meta, when) in enumerate(rows):
        y0 = y + i * rh
        b.a(f'<circle cx="{x+6}" cy="{y0+18}" r="5.5" fill="{b.C[DOT[kind]]}"/>')
        b.t(x + 22, y0 + 23, title, size, 700)
        b.t(x + 22, y0 + 43, meta, 13, 500, 'ink-2')
        b.t(x + w, y0 + 23, when, 13, 800, 'exam' if kind == 'exam' else 'ink', anchor='end')
        if i < len(rows) - 1: b.line(x + 22, y0 + rh - 2, x + w, y0 + rh - 2, 'line', 1)

def sittings_table(b, x, y, w, cols, phone=False):
    """The sittings table: one row per sitting, a cell per zone and the examiners' report."""
    heads = ['Sitting', 'Zone A', 'Zone B', 'RTC', "Examiners' report"] if not phone else ['Sitting', 'Zone A', 'Zone B', 'Report']
    for hx, h in zip(cols, heads): b.t(hx, y, h.upper(), 11, 800, 'ink-3', ls=.9)
    b.line(x, y + 12, x + w, y + 12, 'line', 1.5)
    rh = 52 if not phone else 46
    for i, (sit, cells) in enumerate(SITTINGS):
        y0 = y + 12 + i * rh
        if i == 1 and not phone: b.rect(x - 10, y0 + 4, w + 20, rh - 8, 12, 'inset')
        on = 'inset' if (i == 1 and not phone) else 'surface'
        b.t(x, y0 + rh / 2 + 5, sit, 15 if not phone else 14, 700, on=on)
        if phone: cells = [cells[0], cells[1], cells[3]]
        for cx, cell in zip(cols[1:], cells):
            if cell is None:
                last = cx == cols[-1]
                b.t(cx, y0 + rh / 2 + 5, 'Not out yet' if (last and not phone) else '—', 13, 500, 'ink-3', on=on); continue
            kind, lab, note, nc = cell
            b.doc(cx, y0 + rh / 2 - 12, kind, 19)
            if phone:
                b.t(cx + 26, y0 + rh / 2 + 5, note or 'Open', 13, 700, nc or 'accent-text', on=on)
            else:
                b.t(cx + 28, y0 + rh / 2 + 5, lab, 14, 600, on=on)
                if note:
                    nx = cx + 28 + tw(lab, 14, 600) + 8
                    if note == 'New': b.badge(nx, y0 + rh / 2 - 10, 'New', 'accent-soft', 'accent-text', 20, 11)
                    else: b.t(nx, y0 + rh / 2 + 5, note, 13, 800, nc, on=on)
        if i < 2 and not (i == 0 and not phone) and not (i == 1 and not phone): b.line(x, y0 + rh, x + w, y0 + rh, 'line', 1)
        if phone and i < 2: b.line(x, y0 + rh, x + w, y0 + rh, 'line', 1)
    return y + 12 + len(SITTINGS) * rh

def module_laptop(b, launcher=True):
    b.laptop_top('modules')
    b.glyph('left', 288, 101, 'accent-text'); b.t(300, 106, 'Year 2 modules', 14, 700, 'accent-text', on='canvas')
    # header band in the Modules colour, Binder idle on it
    b.band(280, 122, 1128, 150, 'modules', 24)
    b.mate('modules', 1270, 158, 112)
    b.t(308, 158, 'ST2134', 14, 700, 'modules-text', 'mono', on='modules-pill')
    b.t(308, 196, 'Statistical Inference', 34, 750, 'ink', 'disp', on='modules-pill')
    b.t(308, 224, 'Estimation, confidence intervals and hypothesis tests: how to reach sound conclusions from data.', 15, 500, 'ink-2', on='modules-pill')
    x = 308 + b.year_badge(308, 240, 2, 26, 13) + 8
    x += b.badge(x, 240, 'Exam Thu 23 Oct, in 4 days', 'exam', 'on-exam', 26, 13, icon='cal') + 12
    b.t(x, 258, '12 chapters, 48 lessons, 36 files', 13, 500, 'ink-2', on='modules-pill')
    b.tabs(280, 284, [('Overview', None), ('Lessons', 48), ('Files', 36), ('Discussion', 21)], 'Overview', 'modules', 30, base_w=1128)
    # left: the sittings table
    b.card(280, 348, 744, 236)
    block_title(b, 304, 382, 'Latest past papers', 'All 36 files', 1000)
    sittings_table(b, 304, 414, 696, [304, 420, 568, 716, 820])
    # right: next dates
    b.card(1044, 348, 364, 236)
    block_title(b, 1068, 382, 'Next dates')
    date_rows(b, 1068, 394, 316, rh=50)
    b.glyph('cal', 1077, 562, 'accent-text', .9); b.t(1092, 567, 'Open the calendar', 14, 700, 'accent-text')
    # bottom left: your notes, then progress
    b.card(280, 604, 362, 276)
    block_title(b, 304, 638, 'Your notes', 'All notes', 618)
    for i, (tt, meta) in enumerate(NOTES):
        y0 = 656 + i * 56
        b.doc(304, y0 + 4, 'note', 28); b.t(346, y0 + 21, tt, 15, 700); b.t(346, y0 + 41, meta, 13, 500, 'ink-2')
    b.button(304, 824, 'New note', 'secondary', h=40, size=14, icon='plus')
    b.card(662, 604, 362, 276)
    block_title(b, 686, 638, 'Pick up where you left off')
    b.rect(686, 656, 92, 58, 12, 'modules-pill', 'line', 1.5)
    b.a(f'<circle cx="732" cy="685" r="15" fill="{b.C["surface"]}"/>'); b.glyph('play', 733, 685, 'modules-text')
    b.t(792, 672, 'Chapter 7 · lesson 3 of 5', 12, 800, 'modules-text')
    b.t(792, 692, 'Maximum likelihood', 15, 700); b.t(792, 710, 'Opened yesterday', 13, 500, 'ink-2')
    b.t(686, 744, '', 14); b.t(686, 744, b.ts('6', w=800) + ' of 12 chapters complete', 14, 500, 'ink-2', raw=True)
    for i, (name, done, tot) in enumerate(CHAPTERS):
        y0 = 758 + i * 30
        b.t(686, y0 + 15, str(i + 1), 13, 700, 'ink-3'); b.t(706, y0 + 15, name, 14, 600)
        if done == tot: b.glyph('check', 954, y0 + 10, 'success', .8)
        b.t(1000, y0 + 15, f'{done}/{tot}', 13, 700, 'ink-2', anchor='end')
        b.rect(706, y0 + 21, 294, 4, 2, 'inset'); b.rect(706, y0 + 21, 294 * done / tot, 4, 2, 'success' if done == tot else 'y2-fill')
    # bottom right: discussion
    b.card(1044, 604, 364, 276)
    block_title(b, 1068, 638, 'Discussion', 'All 21 threads', 1384)
    for i, (tt, meta, st) in enumerate(THREADS):
        y0 = 654 + i * 50
        b.t(1068, y0 + 20, tt if tw(tt, 14, 700) < 312 else tt[:34] + '…', 14, 700)
        b.t(1068, y0 + 39, meta, 13, 500, 'ink-2')
        if st:
            mx = 1068 + tw(meta, 13, 500) + 10
            b.glyph('check', mx + 6, y0 + 34, 'success', .7); b.t(mx + 16, y0 + 39, st, 13, 700, 'success')
    b.button(1068, 824, 'Ask a question', 'primary', h=40, size=14, icon='plus')
    b.laptop_bottom(launcher)

def module_phone(b, launcher=True):
    b.phone_top()
    b.glyph('left', 24, 114, 'accent-text'); b.t(36, 119, 'Year 2 modules', 14, 700, 'accent-text', on='canvas')
    b.t(374, 119, 'About this module', 14, 600, 'ink-2', anchor='end', on='canvas');
    b.band(16, 138, 358, 160, 'modules')
    b.mate('modules', 268, 186, 104)
    b.t(34, 170, 'ST2134', 13, 700, 'modules-text', 'mono', on='modules-pill')
    b.t(34, 204, 'Statistical', 28, 750, 'ink', 'disp', on='modules-pill'); b.t(34, 236, 'Inference', 28, 750, 'ink', 'disp', on='modules-pill')
    x = 34 + b.year_badge(34, 256, 2, 26, 13) + 8
    b.badge(x, 256, 'Exam in 4 days', 'exam', 'on-exam', 26, 13, icon='cal')
    b.tabs(16, 304, [('Overview', None), ('Lessons', 48), ('Files', 36), ('Discussion', None)], 'Overview', 'modules', 18, 14, base_w=358)
    b.card(16, 364, 358, 196)
    block_title(b, 32, 394, 'Next dates')
    date_rows(b, 32, 404, 326, rh=50, size=14)
    b.card(16, 572, 358, 200)
    block_title(b, 32, 602, 'Latest past papers', 'All files', 358)
    sittings_table(b, 32, 630, 326, [32, 128, 212, 292], phone=True)
    b.phone_bottom('modules', launcher)

if __name__ == '__main__':
    b = B(1440, 900, 'light', 'Module page (ST2134, Overview) on a laptop, Deskmates v2'); module_laptop(b); b.save('module-laptop.svg')
    b = B(390, 844, 'light', 'Module page (ST2134, Overview) on a phone, Deskmates v2'); module_phone(b); b.save('module-phone.svg')
    b = B(390, 844, 'dark', 'Module page (ST2134, Overview) on a phone, dark, Deskmates v2'); module_phone(b); b.save('module-phone-dark.svg')
