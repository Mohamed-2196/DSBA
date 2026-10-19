from kit import B, tw

def empty_block(b, x, y, w, h, mate, title, body, actions, phone=False):
    b.card(x, y, w, h, 22)
    cx = x + w / 2; s = 160 if not phone else (150 if len(actions) < 2 or 'notes' in title else 116)
    my = y + (max(48, (h - 340) / 2) if not phone else 28)
    b.mate(mate, cx - s / 2, my, s, 'sleepy')
    ty = my + s + 30
    if tw(title, 22, 750, 'disp') > w - 48:
        words = title.split(' '); half = len(words) // 2 + 1
        b.t(cx, ty, ' '.join(words[:half]), 22, 750, 'ink', 'disp', anchor='middle'); ty += 28
        b.t(cx, ty, ' '.join(words[half:]), 22, 750, 'ink', 'disp', anchor='middle')
    else:
        b.t(cx, ty, title, 22, 750, 'ink', 'disp', anchor='middle')
    yy = ty + 30
    # centred wrap
    words = body.split(' '); line = ''; maxw = min(w - 56, 440)
    for wd in words:
        tst = (line + ' ' + wd).strip()
        if tw(tst, 15, 400) > maxw and line: b.t(cx, yy, line, 15, 400, 'ink-2', anchor='middle'); yy += 23; line = wd
        else: line = tst
    b.t(cx, yy, line, 15, 400, 'ink-2', anchor='middle'); yy += 26
    if actions:
        ws = [round(tw(l, 15, 700) + 36 + (22 if ic else 0)) for l, k, ic in actions]
        if phone and len(ws) > 1:
            for (l, k, ic) in actions:
                if k == 'secondary': b.button(cx - 80, yy - 4, l, 'quiet', w=160, h=44)
                else: b.button(x + 20, yy, l, k, w=w - 40, icon=ic)
                yy += 54
        else:
            bx = cx - (sum(ws) + 10 * (len(ws) - 1)) / 2
            for (l, k, ic), bw in zip(actions, ws): b.button(bx, yy, l, k, w=bw, icon=ic); bx += bw + 10

NOTES = ('notebook', 'No notes yet', 'Type with rich text, write with stylus ink, or annotate past papers.',
         [('New note', 'primary', 'plus'), ('Annotate a past paper', 'secondary', None)])
DUE = ('calendar', 'Nothing due in the next 7 days', 'Cards with a due date show here from all your boards, overdue ones first.',
       [('Add a card', 'secondary', 'plus')])
LESSONS = ('modules', 'No video lessons for EC1002 yet', 'The study guide and past papers are in Overview. Have notes or a past paper for this module? Share them in the library.',
           [('Upload a file', 'primary', 'upload'), ('See resources', 'secondary', None)])

def notes_laptop(b):
    b.laptop_top('notebook')
    b.t(280, 136, 'Notes', 34, 750, 'ink', 'disp', on='canvas')
    b.t(280, 164, 'Your typed notes, ink and annotated papers, by notebook.', 15, 500, 'ink-2', on='canvas')
    b.button(1408 - 136, 112, 'New note', 'primary', w=136, icon='plus')
    b.button(1408 - 136 - 170, 112, 'New notebook', 'secondary', w=160)
    x = 280
    x += b.chip(x, 188, 'All notes', True, 40, size=13, sec='notebook') + 8
    b.chip(x, 188, 'Personal', False, 40, size=13)
    empty_block(b, 280, 248, 1128, 600, *NOTES)
    b.laptop_bottom()

def notes_phone(b):
    b.phone_top()
    b.t(16, 128, 'Notes', 28, 750, 'ink', 'disp', on='canvas')
    b.button(374 - 128, 98, 'New note', 'primary', w=128, icon='plus', on='canvas')
    x = 16; x += b.chip(x, 148, 'All notes', True, 40, size=13, sec='notebook') + 8; b.chip(x, 148, 'Personal', False, 40, size=13)
    empty_block(b, 16, 204, 358, 476, *NOTES, phone=True)
    b.phone_bottom('more')

def due_laptop(b):
    b.laptop_top('boards')
    b.t(280, 136, 'Boards', 34, 750, 'ink', 'disp', on='canvas')
    b.t(280, 164, 'Plan study, coursework and everyday tasks. Only you see your boards.', 15, 500, 'ink-2', on='canvas')
    b.button(1408 - 140, 112, 'New board', 'secondary', w=140, icon='plus')
    b.tabs(280, 184, [('Today', None), ('Revision plan', None), ('Coursework', None), ('Everyday', None)], 'Today', 'tools', 30, base_w=1128)
    empty_block(b, 280, 252, 1128, 520, *DUE)
    b.laptop_bottom()

def due_phone(b):
    b.phone_top()
    b.t(16, 128, 'Boards', 28, 750, 'ink', 'disp', on='canvas')
    b.wrap(16, 154, 'Plan study, coursework and everyday tasks. Only you see your boards.', 358, 14, 500, 21, 'ink-2', on='canvas')
    b.tabs(16, 186, [('Today', None), ('Revision plan', None), ('Coursework', None)], 'Today', 'tools', 22, 14, base_w=358)
    empty_block(b, 16, 246, 358, 430, *DUE, phone=True)
    b.phone_bottom('more')

def lessons_laptop(b):
    b.laptop_top('modules')
    b.glyph('left', 288, 101, 'accent-text'); b.t(300, 106, 'Year 1 modules', 14, 700, 'accent-text', on='canvas')
    b.band(280, 122, 1128, 120, 'modules', 24)
    b.mate('modules', 1290, 132, 100)
    b.t(308, 156, 'EC1002', 14, 700, 'modules-text', 'mono', on='modules-pill')
    b.t(308, 194, 'Introduction to Economics', 34, 750, 'ink', 'disp', on='modules-pill')
    x = 308 + b.year_badge(308, 206, 1, 26, 13) + 12
    b.t(x, 224, '22 files, 9 threads', 13, 500, 'ink-2', on='modules-pill')
    b.tabs(280, 254, [('Overview', None), ('Lessons', None), ('Files', 22), ('Discussion', 9)], 'Lessons', 'modules', 30, base_w=1128)
    empty_block(b, 280, 324, 1128, 520, *LESSONS)
    b.laptop_bottom()

def lessons_phone(b):
    b.phone_top()
    b.glyph('left', 24, 114, 'accent-text'); b.t(36, 119, 'Year 1 modules', 14, 700, 'accent-text', on='canvas')
    b.band(16, 138, 358, 116, 'modules')
    b.mate('modules', 278, 150, 92)
    b.t(34, 166, 'EC1002', 13, 700, 'modules-text', 'mono', on='modules-pill')
    b.t(34, 198, 'Introduction', 26, 750, 'ink', 'disp', on='modules-pill'); b.t(34, 228, 'to Economics', 26, 750, 'ink', 'disp', on='modules-pill')
    b.tabs(16, 262, [('Overview', None), ('Lessons', None), ('Files', 22), ('Discussion', None)], 'Lessons', 'modules', 18, 14, base_w=358)
    empty_block(b, 16, 320, 358, 410, *LESSONS, phone=True)
    b.phone_bottom('modules')

if __name__ == '__main__':
    for fn, name, w, h, t in [(notes_laptop, 'empty-notes-laptop.svg', 1440, 900, 'Empty state: no notes yet, on a laptop'), (notes_phone, 'empty-notes-phone.svg', 390, 844, 'Empty state: no notes yet, on a phone'),
                              (due_laptop, 'empty-due-laptop.svg', 1440, 900, 'Empty state: nothing due, on a laptop'), (due_phone, 'empty-due-phone.svg', 390, 844, 'Empty state: nothing due, on a phone'),
                              (lessons_laptop, 'empty-lessons-laptop.svg', 1440, 900, 'Empty state: no lessons yet, on a laptop'), (lessons_phone, 'empty-lessons-phone.svg', 390, 844, 'Empty state: no lessons yet, on a phone')]:
        b = B(w, h, 'light', t + ', Deskmates v2'); fn(b); b.save(name)
