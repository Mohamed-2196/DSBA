from kit import B, tw

# event type -> (fill, text, stroke)  — the type key of the real calendar (eventMeta.ts)
STY = {'exam': ('exam', 'on-exam', None), 'mock': ('accent-soft', 'accent-text', None), 'revision': ('modules-pill', 'success', None),
       'deadline': ('warning-fill', '#0A1F44', None), 'event': ('y3-soft', 'y3-text', None), 'term': ('inset', 'ink-2', None),
       'mine': ('surface', 'accent-text', 'accent')}
LEGEND = [('exam', 'Exam'), ('mock', 'Mock exam'), ('revision', 'Revision'), ('deadline', 'Deadline'), ('event', 'Event'), ('term', 'Term dates'), ('mine', 'Your events')]
EV = {1: [('term', 'Term starts')], 6: [('mock', 'EC2020 Mock exam')], 9: [('mock', 'ST2133 Mock exam')], 15: [('revision', 'Revision: hypothesis tests')],
      17: [('event', 'Event: careers fair')], 20: [('revision', 'ST2134 revision 10:00')], 21: [('mine', 'Study group 18:00')],
      23: [('exam', 'ST2134 Exam 9:00')], 24: [('deadline', 'IS2184 coursework due')], 28: [('exam', 'ST2133 Exam 14:00')]}

def ev_chip(b, x, y, w, kind, label, h=24, size=12):
    fill, fg, st = STY[kind]
    if st: b.rect(x + .75, y + .75, w - 1.5, h - 1.5, 7, fill, st, 1.5, 'stroke-dasharray="4 3"')
    else: b.rect(x, y, w, h, 7, fill)
    if kind == 'exam': b.glyph('cal', x + 12, y + h / 2, fg, .6)
    tx = x + (22 if kind == 'exam' else 8)
    while tw(label, size, 700) > w - (tx - x) - 6 and len(label) > 4: label = label[:-2].rstrip() + '…' if not label.endswith('…') else label[:-2] + '…'
    b.t(tx, y + h / 2 + 4.2, label, size, 700, fg, on=fill)

def legend_dot(b, x, y, kind, label, on='canvas'):
    fill, fg, st = STY[kind]
    if st: b.rect(x, y - 9, 14, 14, 4, fill, st, 1.5, 'stroke-dasharray="3 2"')
    else: b.rect(x, y - 9, 14, 14, 4, fill, 'line-strong' if kind in ('term',) else None, 1)
    b.t(x + 20, y + 3, label, 13, 600, 'ink-2', on=on); return 20 + tw(label, 13, 600) + 22

def segmented(b, x, y, items, active, h=44, w_each=None):
    ws = [w_each or round(tw(l, 14, 700) + 40) for l in items]; W = sum(ws) + 8
    b.rect(x, y, W, h, 14, 'inset'); cx = x + 4
    for l, w in zip(items, ws):
        if l == active:
            b.a(f'<g filter="url(#lift)"><rect x="{cx}" y="{y+4}" width="{w}" height="{h-8}" rx="11" fill="{b.C["surface"]}"/></g>')
            b.t(cx + w / 2, y + h / 2 + 5, l, 14, 800, 'ink', anchor='middle')
        else: b.t(cx + w / 2, y + h / 2 + 5, l, 14, 600, 'ink-2', anchor='middle', on='inset')
        cx += w
    return W

def calendar_laptop(b):
    b.laptop_top('calendar')
    b.band(280, 92, 1128, 124, 'calendar', 24)
    b.mate('calendar', 1296, 100, 110)
    b.t(308, 142, 'Calendar', 34, 750, 'ink', 'disp', on='calendar-pill')
    b.t(308, 172, 'Exams, deadlines and term dates for Year 2, with your own events.', 15, 500, 'ink-2', on='calendar-pill')
    b.t(308, 194, 'Hide what you don’t need, and add any of it to your own calendar app.', 15, 500, 'ink-2', on='calendar-pill')
    x = 1278
    w = round(tw('New event', 15, 700) + 36 + 22); x -= w; b.button(x, 132, 'New event', 'primary', w=w, icon='plus', on='calendar-pill')
    w = round(tw('Subscribe', 15, 700) + 36); x -= w + 10; b.button(x, 132, 'Subscribe', 'secondary', w=w)
    w = round(tw('Customise', 15, 700) + 36); x -= w + 10; b.button(x, 132, 'Customise', 'secondary', w=w)
    # controls
    x = 280 + segmented(b, 280, 232, ['List', 'Month'], 'Month') + 12
    b.rect(x + .75, 232.75, 130.5, 42.5, 14, 'surface', 'line-strong'); b.t(x + 16, 259, 'Year 2', 14, 700); b.glyph('down', x + 108, 254, 'ink-2', .8)
    b.button(1408 - 82, 232, 'Today', 'secondary', w=82, h=44, size=14)
    b.rect(1062.75, 232.75, 42.5, 42.5, 13, 'surface', 'line-strong'); b.glyph('left', 1084, 254, 'ink')
    b.t(1186, 262, 'October 2025', 22, 750, 'ink', 'disp', anchor='middle', on='canvas')
    b.rect(1266.75, 232.75, 42.5, 42.5, 13, 'surface', 'line-strong'); b.glyph('right', 1288, 254, 'ink')
    # legend (the colour key; each type can be turned off in Customise)
    x = 284
    for k, l in LEGEND: x += legend_dot(b, x, 302, k, l)
    # month grid
    GX, GY, GW, RH = 280, 322, 1128, 110; cw = GW / 7
    b.card(GX, GY, GW, 36 + RH * 5, 18)
    for i, d in enumerate(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']):
        b.t(GX + i * cw + 14, GY + 24, d.upper(), 11, 800, 'ink-3', ls=1)
    b.line(GX, GY + 36, GX + GW, GY + 36, 'line', 1.5)
    for r in range(1, 5): b.line(GX, GY + 36 + r * RH, GX + GW, GY + 36 + r * RH, 'line', 1)
    for c in range(1, 7): b.line(GX + c * cw, GY + 36, GX + c * cw, GY + 36 + 5 * RH, 'line', 1)
    days = [29, 30] + list(range(1, 32)) + [1, 2]
    for i, d in enumerate(days):
        r, c = divmod(i, 7); x0 = GX + c * cw; y0 = GY + 36 + r * RH
        muted = (i < 2) or (i >= 33)
        if muted: b.rect(x0 + 1, y0 + 1, cw - 2, RH - 2, 0, 'inset' if False else 'surface')
        if d == 19 and not muted:
            b.a(f'<circle cx="{x0+24}" cy="{y0+22}" r="15" fill="{b.C["accent"]}"/>'); b.t(x0 + 24, y0 + 27, '19', 14, 800, 'on-accent', anchor='middle', on='accent')
            b.t(x0 + 46, y0 + 27, 'Today', 12, 700, 'accent-text')
        else:
            b.t(x0 + 14, y0 + 27, str(d) if not (d == 1 and i > 30) else 'Nov 1', 14, 700 if not muted else 500, 'ink-3' if muted else 'ink')
        if not muted:
            for k, (kind, lab) in enumerate(EV.get(d, [])):
                ev_chip(b, x0 + 8, y0 + 40 + k * 30, cw - 16, kind, lab)
    # the VLE window: a bar across Mon 20 to Wed 22, placed by its closing day
    r = 3; y0 = GY + 36 + r * RH + 70
    b.rect(GX + 8, y0, cw * 3 - 16, 26, 8, 'warning-fill')
    b.t(GX + 18, y0 + 17.5, 'ST2134 MCQ on VLE · open now, closes Wed 22 Oct', 12, 700, '#0A1F44', on='warning-fill')
    b.laptop_bottom()

def date_leaf(b, x, y, mon, day, kind='exam', w=50, h=56):
    head = {'exam': 'exam', 'cal': 'calendar-art'}.get(kind, kind)
    b.rect(x, y, w, h, 11, '#FFFFFF' if not b.C['dark'] else 'surface', 'art-outline' if not b.C['dark'] else 'line-strong', 2)
    b.a(f'<path d="M{x+1} {y+12}a11 11 0 0 1 11-11h{w-24}a11 11 0 0 1 11 11v6h-{w-2}z" fill="{b.C[head]}"/>')
    b.t(x + w / 2, y + 15, mon, 10, 800, 'on-exam' if kind == 'exam' else '#0A1F44', anchor='middle', on=head, check=kind == 'exam')
    b.t(x + w / 2, y + 45, str(day), 21, 800, 'ink', 'disp', anchor='middle', on='#FFFFFF' if not b.C['dark'] else 'surface')

def calendar_phone(b):
    b.phone_top()
    b.band(16, 92, 358, 112, 'calendar')
    b.mate('calendar', 272, 100, 100)
    b.t(34, 138, 'Calendar', 28, 750, 'ink', 'disp', on='calendar-pill')
    b.t(34, 164, 'Year 2 · 7 dates ahead', 14, 600, 'ink-2', on='calendar-pill'); b.t(34, 186, 'this month', 14, 600, 'ink-2', on='calendar-pill')
    segmented(b, 16, 216, ['List', 'Month'], 'List', w_each=80)
    b.button(234, 216, 'New event', 'primary', w=140, icon='plus', on='canvas')
    # your next exam
    b.card(16, 274, 358, 112)
    b.t(32, 300, 'YOUR NEXT EXAM', 11, 800, 'exam', ls=1.1)
    date_leaf(b, 32, 312, 'OCT', 23, 'exam', 48, 58)
    b.t(94, 330, 'ST2134 Statistical Inference', 15, 700)
    b.t(94, 350, 'Thu 23 Oct, 9:00 · in 4 days', 14, 700, 'exam')
    b.t(94, 370, 'Hall B · 1 more exam after it', 13, 500, 'ink-2')
    # agenda
    b.t(16, 414, 'THIS WEEK', 11, 800, 'ink-3', ls=1.1, on='canvas')
    rows = [('Mon', 20, [('revision', 'ST2134 revision session', '10:00 · Room 4'), ('deadline', 'ST2134 MCQ on VLE', 'Open now · closes Wed 22 Oct')]),
            ('Tue', 21, [('mine', 'Study group', '18:00 · your event')]),
            ('Thu', 23, [('exam', 'ST2134 Statistical Inference', 'Exam · 9:00 · Hall B')]),
            ('Fri', 24, [('deadline', 'IS2184 coursework due', 'Deadline · 23:59 on the VLE')])]
    y = 426
    b.card(16, y, 358, 330)
    yy = y + 8
    for wd, d, evs in rows:
        b.t(48, yy + 26, wd.upper(), 11, 800, 'ink-3', anchor='middle', ls=.8)
        b.t(48, yy + 50, str(d), 22, 750, 'exam' if d == 23 else 'ink', 'disp', anchor='middle')
        for kind, title, meta in evs:
            fill, fg, st = STY[kind]
            if st: b.rect(82, yy + 12, 5, 40, 2.5, 'surface', st, 1.5)
            else: b.rect(82, yy + 12, 5, 40, 2.5, fill if kind not in ('revision',) else 'success')
            b.t(98, yy + 28, title, 15, 700); b.t(98, yy + 47, meta, 13, 500, 'exam' if kind == 'exam' else 'ink-2')
            yy += 52
        yy += 6; b.line(32, yy - 2, 358, yy - 2, 'line', 1)
    b.phone_bottom('more')

if __name__ == '__main__':
    b = B(1440, 900, 'light', 'Calendar, month view, on a laptop, Deskmates v2'); calendar_laptop(b); b.save('calendar-laptop.svg')
    b = B(390, 844, 'light', 'Calendar, agenda list, on a phone, Deskmates v2'); calendar_phone(b); b.save('calendar-phone.svg')
