from kit import B, tw
from icons import SECTION
from s_module import sittings_table
from s_forum import thread_row, YOURS

HALO = ('<defs><filter id="halo" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="2" result="d"/>'
        '<feFlood flood-color="#EAF0FF" flood-opacity=".9"/><feComposite in2="d" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>')

def embed(b, sub, x, y):
    b.a(f'<g transform="translate({x} {y})">' + ''.join(sub.O) + '</g>'); b.warn += sub.warn

def head(b, x, y, label, note=None):
    b.t(x, y, label.upper(), 12, 800, 'accent-text', ls=1.2, on='canvas')
    if note: b.t(x, y + 20, note, 13, 500, 'ink-2', on='canvas')

def cap(b, x, y, s, on='canvas'): b.t(x, y, s, 12, 600, 'ink-3', on=on)

def tabbar(b, active):
    b.rect(0, 0, 390, 88, 0, 'surface'); b.line(0, .75, 390, .75, 'line', 1.5, 'stroke-linecap="butt"')
    for key, lab, cx in [('home', 'Home', 39), ('modules', 'Modules', 117), ('library', 'Library', 195), ('forum', 'Forum', 273), ('more', 'More', 351)]:
        sec = SECTION[key]
        if key == active:
            b.rect(cx - 30, 8, 60, 34, 17, f'{sec}-pill'); b.icon(key, cx - 12, 13, 24, True, b.C[f'{sec}-pill']); b.t(cx, 60, lab, 12, 800, f'{sec}-text', anchor='middle')
        else: b.icon(key, cx - 12, 13, 24); b.t(cx, 60, lab, 12, 600, 'ink-2', anchor='middle')

def side_items(b):
    """Sidebar item states: default, hover, active, focus, with a count."""
    b.rect(0, 0, 260, 304, 18, 'surface', 'line', 1.5)
    rows = [('library', 'Library', 'default'), ('notebook', 'Notebook', 'hover'), ('forum', 'Forum', 'active'), ('calendar', 'Calendar', 'focus'), ('modules', 'Modules', 'count')]
    for i, (key, lab, st) in enumerate(rows):
        y = 14 + i * 56; sec = SECTION[key]
        if st == 'hover': b.rect(12, y, 236, 44, 14, 'inset')
        if st == 'active': b.rect(12, y, 236, 44, 14, f'{sec}-pill')
        if st == 'focus': b.rect(10, y - 2, 240, 48, 16, 'surface', 'focus', 2)
        if st == 'active':
            b.icon(key, 26, y + 11, 22, True, b.C[f'{sec}-pill']); b.t(60, y + 27, lab, 15, 700, f'{sec}-text', on=f'{sec}-pill')
        else:
            b.icon(key, 26, y + 11, 22); b.t(60, y + 27, lab, 15, 500, 'ink-2', on='inset' if st == 'hover' else 'surface')
        if st == 'count': b.badge(238, y + 11, '2 new', 'accent-soft', 'accent-text', 22, 12, anchor='end')
        b.t(238, y + 27, '' if st in ('count',) else st, 11, 700, 'ink-3', anchor='end', on='inset' if st == 'hover' else (f'{sec}-pill' if st == 'active' else 'surface'), check=False)

def components(b):
    C = b.C
    b.rect(0, 0, b.W, b.H, 0, 'canvas'); b.a(HALO)
    b.lockup(40, 36, 27)
    b.t(40, 112, 'Components', 44, 750, 'ink', 'disp', on='canvas')
    b.t(40, 142, 'Deskmates v2 · the shared parts every key screen is built from. Light theme; dark where the colours change.', 15, 500, 'ink-2', on='canvas')
    L, R = 40, 760
    # ---------- buttons
    y = 200; head(b, L, y, 'Buttons', '44 px tall, radius 13. Primary has a 3 px lip that drops on press.')
    x = L; yy = y + 44
    for lab, kind, note in [('Save', 'primary', 'Primary'), ('Cancel', 'secondary', 'Secondary'), ('See resources', 'quiet', 'Quiet'), ('Delete thread', 'danger', 'Danger'),
                            ('Save', 'pressed', 'Pressed'), ('Post reply', 'disabled', 'Disabled')]:
        w = b.button(x, yy, lab, kind, on='canvas'); cap(b, x, yy + 64, note); x += w + 16
    yy += 86; x = L
    for lab, kind, ic in [('New note', 'primary', 'plus'), ('Upload a file', 'secondary', 'upload'), ('Ask a question', 'quiet-soft', 'plus')]:
        x += b.button(x, yy, lab, kind, h=40, size=14, icon=ic, on='canvas') + 16
    cap(b, x + 4, yy + 25, 'Small, 40 px (laptop only); 44 px on touch')
    # dark buttons
    bd = B(660, 70, 'dark', ''); bd.rect(0, 0, 660, 70, 16, 'canvas'); x = 14
    for lab, kind in [('Save', 'primary'), ('Cancel', 'secondary'), ('See resources', 'quiet'), ('Delete', 'danger'), ('Save', 'pressed'), ('Post reply', 'disabled')]:
        x += bd.button(x, 13, lab, kind, on='canvas') + 12
    embed(b, bd, L, yy + 58)
    # ---------- inputs
    head(b, R, y, 'Inputs', 'Radius 14, 46–48 px. Focus: accent border plus a 3 px soft ring.')
    b.field(R, y + 44, 300, 'Search the hub', 46, kbd='⌘K')
    b.field(R + 324, y + 44, 300, '', 46, icon=None, value='ST2133 · May 2019', focus=True)
    cap(b, R, y + 108, 'Default, with the ⌘K hint'); cap(b, R + 324, y + 108, 'Focused, filled')
    b.rect(R + .75, y + 128.75, 298.5, 98.5, 14, 'surface', 'error', 2); b.t(R + 16, y + 156, 'Write a reply…', 15, 400, 'ink-3')
    b.glyph('x', R + 18, y + 248, 'error', .7); b.t(R + 30, y + 253, 'Write your reply first, then post it.', 13, 600, 'error', on='canvas')
    b.rect(R + 324.75, y + 128.75, 160.5, 44.5, 14, 'surface', 'line-strong'); b.t(R + 340, y + 156, 'Year 2', 15, 600); b.glyph('down', R + 464, y + 151, 'ink-2', .8)
    cap(b, R + 324, y + 196, 'Select')
    b.rect(R + 504, y + 136, 52, 30, 15, 'accent'); b.a(f'<circle cx="{R+541}" cy="{y+151}" r="11" fill="{C["surface"]}"/>'); cap(b, R + 504, y + 196, 'Switch')
    b.rect(R + 576, y + 138, 26, 26, 8, 'success'); b.glyph('check', R + 589, y + 151, 'surface', .8); cap(b, R + 576, y + 196, 'Tick')
    # ---------- chips
    y = 500; head(b, L, y, 'Chips', 'Pills, 44 px on touch. The one dark pill is Filters, with a yellow count.')
    x = L; yy = y + 44; xs = [x]
    x += b.chip(x, yy, 'ST2134') + 10; xs.append(x)
    x += b.chip(x, yy, 'Yours', True, sec='forum') + 10; xs.append(x)
    x += b.chip(x, yy, 'May 2019', clear=True) + 10
    fx = x; fw = 118
    b.rect(fx, yy, fw, 44, 22, 'ink'); b.path(f'M{fx+18} {yy+16}h16M{fx+18} {yy+22}h12M{fx+18} {yy+28}h8', 'none', 'canvas', 2)
    b.t(fx + 40, yy + 27, 'Filters', 14, 700, 'canvas', on='ink'); b.a(f'<circle cx="{fx+98}" cy="{yy+22}" r="10" fill="{C["warning-fill"]}"/>'); b.t(fx + 98, yy + 26.5, '2', 12, 800, '#0A1F44', anchor='middle', on='warning-fill')
    x = fx + fw + 10
    b.chip(x, yy + 4, 'EXAM-PREP', h=36, size=13)
    for cx_, t in [(xs[0], 'Default'), (xs[1], 'Selected'), (xs[2], 'Clearable'), (fx, 'Filters'), (x, 'Small, 36 px')]: cap(b, cx_, yy + 64, t)
    # ---------- tabs
    head(b, R, y, 'Tabs and segmented control', 'In-page tabs: a 3 px underline in the section colour, counts in a pill.')
    b.tabs(R, y + 34, [('Overview', None), ('Lessons', 48), ('Files', 36), ('Discussion', 21)], 'Overview', 'modules', 28, base_w=640)
    b.tabs(R, y + 94, [('All', 312), ('Yours', None), ('Year 1', None), ('Year 2', None), ('Study groups', None)], 'Yours', 'forum', 28, base_w=640)
    from s_calendar import segmented
    segmented(b, R, y + 160, ['List', 'Month'], 'Month')
    segmented(b, R + 200, y + 160, ['Columns', 'List'], 'Columns')
    # ---------- cards
    y = 740; head(b, L, y, 'Cards', 'Index cards: radius 18, a 1.5 px line, a soft shadow. Documents carry a coloured top band.')
    b.card(L, y + 40, 660, 110); b.doc(L + 14, y + 54, 'paper')
    b.t(L + 68, y + 68, 'ST2133 · May 2019 · Zone A', 16, 700); b.t(L + 68, y + 88, 'Past paper · 6 pages · solutions inside', 13, 400, 'ink-2')
    tm_x = L + 68; b.rect(tm_x, y + 102, 104, 36, 12, 'accent-edge'); b.rect(tm_x, y + 102, 104, 33, 12, 'accent')
    b.glyph('clock', tm_x + 19, y + 118, 'on-accent'); b.t(tm_x + 33, y + 123, 'Time me', 14, 700, 'on-accent', on='accent')
    b.rect(L + 180.75, y + 102.75, 70.5, 34.5, 12, 'surface', 'line-strong'); b.t(L + 216, y + 125, 'Open', 14, 600, anchor='middle')
    b.rect(L + 616, y + 54, 30, 30, 10, 'inset'); b.glyph('bookmark', L + 631, y + 69, 'ink-2', .9)
    thread_row(b, L, y + 166, 660, YOURS[0])
    # doc thumbnails + module card
    b.card(L, y + 278, 200, 150); b.binder(L + 18, y + 294, 'y2-fill')
    b.t(L + 18, y + 364, 'Statistical Inference', 15, 700); b.t(L + 18, y + 384, 'ST2134', 13, 600, 'ink-2', 'mono')
    b.rect(L + 18, y + 402, 164, 6, 3, 'inset'); b.rect(L + 18, y + 402, 95, 6, 3, 'y2-fill')
    for i, (k, lab) in enumerate([('paper', 'Past paper'), ('report', "Examiners' report"), ('note', "Students' note")]):
        b.doc(L + 230 + i * 140, y + 300, k, 48); cap(b, L + 230 + i * 140, y + 386, lab)
    # ---------- sittings table
    head(b, R, y, 'The sittings table', 'One row per sitting, a cell per zone and the report. The hovered row sits on inset.')
    b.card(R, y + 40, 640, 236)
    sittings_table(b, R + 24, y + 80, 592, [R + 24, R + 128, R + 262, R + 396, R + 486])
    # ---------- toasts
    y = 1190; head(b, L, y, 'Toasts', 'Ink on light, raised on dark. The desk-mate switches to happy and hops 6 px.')
    b.toast(L, y + 40, 320, 'library', 'Uploaded. It’s in ST2133 · May 2019.')
    b.toast(L + 340, y + 40, 320, 'notebook', 'Saved', 'In ST2134 Statistical Inference')
    b.toast(L, y + 124, 320, 'forum', 'Marked as the answer', 'Ali hears about it', 'Undo')
    b.toast(L + 340, y + 124, 320, 'calendar', 'Event added', 'Study group, Tue 21 Oct, 18:00')
    b.toast(L, y + 208, 320, 'modules', 'Lesson done', 'Chapter 7 · lesson 3 of 5')
    bd = B(320, 72, 'dark', ''); bd.rect(0, 0, 320, 72, 18, 'canvas'); bd.toast(0, 0, 320, 'library', 'Done in 2:51. Mark it?', None, 'Mark'); embed(b, bd, L + 340, y + 208)
    # ---------- dialogs
    head(b, R, y, 'Dialogs', 'ConfirmDialog: radius 22, a title that asks, a body that says what happens, the safe action first.')
    b.a(f'<g filter="url(#float)"><rect x="{R}" y="{y+40}" width="310" height="214" rx="22" fill="{C["surface"]}"/></g>')
    b.t(R + 24, y + 80, 'Delete this thread?', 21, 750, 'ink', 'disp')
    b.wrap(R + 24, y + 108, 'Its 3 replies go too. This can’t be undone.', 262, 15, 400, 22, 'ink-2')
    b.button(R + 24, y + 186, 'Cancel', 'secondary', w=120); b.button(R + 154, y + 186, 'Delete', 'danger', w=132)
    b.a(f'<g filter="url(#float)"><rect x="{R+330}" y="{y+40}" width="310" height="214" rx="22" fill="{C["surface"]}"/></g>')
    b.t(R + 354, y + 80, 'Hide Mini Noora?', 21, 750, 'ink', 'disp')
    b.wrap(R + 354, y + 108, 'She stays off every page until you bring her back from your account.', 262, 15, 400, 22, 'ink-2')
    b.button(R + 354, y + 186, 'Keep her', 'secondary', w=120); b.button(R + 484, y + 186, 'Hide', 'primary', w=132)
    # ---------- tab bars
    y = 1510; head(b, L, y, 'Bottom tab bar', '84 px plus the home indicator. Active: navy line, full section colour, pill, bold label.')
    tl = B(390, 88, 'light', ''); tabbar(tl, 'library'); embed(b, tl, L, y + 40)
    td = B(390, 88, 'dark', ''); tabbar(td, 'forum'); embed(b, td, L, y + 140)
    cap(b, L + 404, y + 90, 'Light, Library active'); cap(b, L + 404, y + 190, 'Dark, Forum active')
    # ---------- sidebar items
    head(b, R, y, 'Sidebar item states', 'Default, hover, active, focus ring, and a count.')
    sl = B(260, 304, 'light', ''); side_items(sl); embed(b, sl, R, y + 40)
    sdk = B(260, 304, 'dark', ''); side_items(sdk); embed(b, sdk, R + 290, y + 40)
    # ---------- badges
    y = 1910; head(b, L, y, 'Badges and pills')
    x = L; yy = y + 30
    x += b.year_badge(x, yy, 1) + 8; x += b.year_badge(x, yy, 2) + 8; x += b.year_badge(x, yy, 3) + 8
    x += b.badge(x, yy, 'Exam Thu 23 Oct, in 4 days', 'exam', 'on-exam', icon='cal') + 8
    x += b.badge(x, yy, 'New', 'accent-soft', 'accent-text') + 8; x += b.badge(x, yy, 'Author', 'inset', 'ink-2') + 8
    x += b.badge(x, yy, 'Accepted answer', 'modules-pill', 'success', icon='check') + 8
    yy += 36; x = L
    x += b.badge(x, yy, 'Hidden', 'error', '#FFFFFF') + 8
    x += b.badge(x, yy, 'ST2134', 'inset', 'ink-2') + 8
    for s in ('library', 'notebook', 'forum', 'calendar', 'search'): x += b.badge(x, yy, s.capitalize(), f'{s}-pill', f'{s}-text') + 8
    b.a(f'<circle cx="{x+10}" cy="{yy+11}" r="10" fill="{C["warning-fill"]}"/>'); b.t(x + 10, yy + 15.5, '2', 12, 800, '#0A1F44', anchor='middle', on='warning-fill'); x += 30
    b.a(f'<circle cx="{x+6}" cy="{yy+11}" r="5" fill="{C["calendar-art"]}"/>')
    # ---------- time me
    head(b, R, y, 'Time me', 'The timer pill: idle, running, 10 minutes left (warning), 2 minutes left (exam colour).')
    yy = y + 30; x = R
    b.rect(x, yy, 104, 36, 12, 'accent-edge'); b.rect(x, yy, 104, 33, 12, 'accent'); b.glyph('clock', x + 19, yy + 16, 'on-accent'); b.t(x + 33, yy + 21, 'Time me', 14, 700, 'on-accent', on='accent'); x += 116
    for lab, bg, fg, pct, bar in [('42:10 left', 'accent-soft', 'accent-text', .77, 'accent'), ('9:58 left', 'warning-fill', '#0A1F44', .94, 'warning'), ('1:52 left', 'exam', 'on-exam', .99, 'on-exam')]:
        w = 132; b.rect(x, yy, w, 36, 18, bg); b.glyph('clock', x + 19, yy + 18, fg); b.t(x + 33, yy + 23, lab, 14, 700, fg, 'mono', on=bg)
        b.rect(x + 12, yy + 44, w - 24, 4, 2, 'inset'); b.rect(x + 12, yy + 44, (w - 24) * pct, 4, 2, bar if bar != 'on-exam' else 'exam'); x += w + 12

if __name__ == '__main__':
    b = B(1440, 2020, 'light', 'Components, Deskmates v2'); components(b); b.save('components.svg')
