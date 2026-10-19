"""Deskmates v2 icon geometry: 24 px grid, 1.75 px stroke, round caps and joins.

Part kinds:
  f  the tinted body       fill var(--icon-tint), outlined
  w  a paper part          fill var(--icon-paper), outlined
  l  a line                no fill
  L  a heavy line          no fill, stroke 2.75 (the search handle only)
  d  a solid dot           fill currentColor, no stroke
"""
import math
import re


def n(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def tidy(d):
    return re.sub(r'-?\d+\.\d+', lambda m: n(float(m.group())), d)


def R(x, y, w, h, r):
    return tidy(f'M{x+r} {y}h{w-2*r}a{r} {r} 0 0 1 {r} {r}v{h-2*r}a{r} {r} 0 0 1-{r} {r}'
                f'h-{w-2*r}a{r} {r} 0 0 1-{r}-{r}v-{h-2*r}a{r} {r} 0 0 1 {r}-{r}z')


def C(cx, cy, r):
    return tidy(f'M{cx-r} {cy}a{r} {r} 0 1 0 {2*r} 0a{r} {r} 0 1 0-{2*r} 0z')


def poly(pts, close=True):
    d = 'M' + 'L'.join(f'{n(x)} {n(y)}' for x, y in pts)
    return d + ('z' if close else '')


def rot(pts, deg, cx, cy):
    a = math.radians(deg)
    return [(cx + (x - cx) * math.cos(a) - (y - cy) * math.sin(a),
             cy + (x - cx) * math.sin(a) + (y - cy) * math.cos(a)) for x, y in pts]


def star(cx, cy, ro, ri):
    pts = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(-90 + i * 36)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(pts)


def gear(cx, cy, ro, ri, teeth=8):
    # flat-topped teeth, half a tooth wide at the tip
    pts = []
    step = 360 / teeth
    for i in range(teeth):
        a0 = -90 + i * step
        for da, r in ((-step * 0.30, ri), (-step * 0.17, ro), (step * 0.17, ro), (step * 0.30, ri)):
            a = math.radians(a0 + da)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return poly(pts)


def eraser():
    # a block 15 x 7 turned 45 degrees: the paper end rubs, the tinted sleeve holds it
    cx, cy = 12.6, 10.6
    tip = [(cx - 7.5, cy - 3.5), (cx - 2.5, cy - 3.5), (cx - 2.5, cy + 3.5), (cx - 7.5, cy + 3.5)]
    body = [(cx - 2.5, cy - 3.5), (cx + 7.5, cy - 3.5), (cx + 7.5, cy + 3.5), (cx - 2.5, cy + 3.5)]
    return poly(rot(tip, -45, cx, cy)), poly(rot(body, -45, cx, cy))


ER_TIP, ER_BODY = eraser()

# ── The 13 nav icons (approved in v2; geometry kept, numbers tidied, details snapped) ──
NAV = {
    'home': [('l', 'M10.2 19.2L6.4 13.2L10.6 9.6'), ('w', R(5, 18.8, 10, 2.7, 1.35)),
             ('f', 'M9.4 9.9C9.4 5.6 11.6 3 15 3s5.6 2.6 5.6 6.9z'), ('l', 'M8.6 9.9h12.8'),
             ('d', C(6.4, 13.2, 1.25)), ('f', 'M13.4 10.4a1.6 1.4 0 0 0 3.2 0z')],
    'modules': [('f', R(4, 3, 14, 18, 2.2)), ('l', 'M7.6 3.4v17.2'), ('w', R(10.2, 6, 5, 3.2, .8)),
                ('l', 'M18 6h1.4a1.1 1.1 0 0 1 1.1 1.1v2.2a1.1 1.1 0 0 1-1.1 1.1H18'
                      'M18 12.2h1.4a1.1 1.1 0 0 1 1.1 1.1v2.2a1.1 1.1 0 0 1-1.1 1.1H18')],
    'library': [('f', R(3, 17.4, 18, 3.6, 1.2)), ('f', R(4.6, 13.8, 16, 3.6, 1.2)),
                ('w', 'M7 3h7.4L18 6.6v7.2H7z'), ('l', 'M14.4 3v3.6H18M9.6 8.6h3.6M9.6 11.2h5.4')],
    'notebook': [('f', R(3.5, 4.6, 12.5, 16.4, 2.2)), ('w', R(6.4, 8.6, 6.6, 3.2, .8)),
                 ('l', 'M6.6 3v3.4M9.75 3v3.4M12.9 3v3.4'), ('w', 'M18.6 4.6h2.6v11.6l-1.3 3.2-1.3-3.2z'),
                 ('l', 'M18.6 16.2h2.6')],
    'forum': [('f', 'M5.6 3h7.8a3.1 3.1 0 0 1 3.1 3.1v3.7a3.1 3.1 0 0 1-3.1 3.1H9.6L6 15.8v-2.95'
                    'A3.1 3.1 0 0 1 2.5 9.8V6.1A3.1 3.1 0 0 1 5.6 3z'),
              ('w', 'M12.3 11.4h5.9a2.8 2.8 0 0 1 2.8 2.8v1.8a2.8 2.8 0 0 1-2.4 2.77V21l-2.9-2.4h-3.4'
                    'a2.8 2.8 0 0 1-2.8-2.8v-1.6a2.8 2.8 0 0 1 2.8-2.8z')],
    'calendar': [('w', R(3.5, 5, 17, 16, 2.6)),
                 ('f', 'M3.5 7.6A2.6 2.6 0 0 1 6.1 5h11.8a2.6 2.6 0 0 1 2.6 2.6v2.9h-17z'),
                 ('l', 'M8.5 3v4M15.5 3v4'), ('d', C(12, 15.6, 1.7))],
    'boards': [('w', R(2.5, 4, 19, 16, 2.6)), ('f', 'M5.7 7.6l5.6-.6.6 5.6-5.6.6z'),
               ('f', 'M13.2 8.4l5 .5-.7 7.6-5-.5z'), ('d', C(8.6, 7.4, 1)), ('d', C(15.8, 8.7, 1))],
    # calculator: a 2 x 2 keypad (v2 had 3 x 3), so the keys stay separate dots at 16 and 20 px
    'grades': [('w', R(5, 2.5, 14, 19, 2.6)), ('f', R(7.5, 5, 9, 4, 1))] +
              [('d', C(x, y, 1.3)) for y in (13.4, 17.8) for x in (9.6, 14.4)],
    'career': [('w', C(12, 12, 9)), ('f', 'M12 5.4l2.4 6.6H9.6z'), ('l', 'M9.6 12h4.8L12 18.6z'),
               ('d', C(12, 12, 1.1))],
    'newsletter': [('w', 'M16.8 8h2.6a1.6 1.6 0 0 1 1.6 1.6V18a2.5 2.5 0 0 1-2.5 2.5'),
                   ('w', 'M3.5 5.6A1.6 1.6 0 0 1 5.1 4h10.1a1.6 1.6 0 0 1 1.6 1.6V18a2.5 2.5 0 0 0 2.5 2.5H6'
                         'a2.5 2.5 0 0 1-2.5-2.5z'),
                   ('f', R(6.4, 7, 7.6, 4.6, .8)), ('l', 'M6.4 14.6h7.6M6.4 17.4h5')],
    'daily': [('w', R(3.5, 3.5, 17, 17, 3)), ('f', 'M9.2 9.2h5.6v5.6H9.2z'),
              ('f', 'M14.8 14.8h5.7v2.7a3 3 0 0 1-3 3h-2.7z'),
              ('l', 'M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17')],
    'search': [('L', 'M15.4 15.4l5.2 5.2'), ('f', C(10.5, 10.5, 6.6)), ('l', 'M7.4 9.4a3.3 3.3 0 0 1 2.4-2.5')],
    'more': [('f', C(5.5, 12, 2.2)), ('f', C(12, 12, 2.2)), ('f', C(18.5, 12, 2.2))],
}

# ── Everyday UI icons, same family ──
TRAY = R(3.5, 16, 17, 4.5, 1.8)
UI = {
    # actions
    'plus': [('l', 'M12 5v14M5 12h14')],
    'close': [('l', 'M6 6l12 12M18 6L6 18')],
    'check': [('l', 'M4.5 12.5l5 5L19.5 7')],
    'back': [('l', 'M19.5 12h-15M10.5 6l-6 6 6 6')],
    'forward': [('l', 'M4.5 12h15M13.5 6l6 6-6 6')],
    'arrow-up': [('l', 'M12 19.5v-15M6 10.5l6-6 6 6')],
    'arrow-down': [('l', 'M12 4.5v15M6 13.5l6 6 6-6')],
    'chevron-down': [('l', 'M6 9l6 6 6-6')],
    'chevron-up': [('l', 'M6 15l6-6 6 6')],
    'chevron-left': [('l', 'M15 6l-6 6 6 6')],
    'chevron-right': [('l', 'M9 6l6 6-6 6')],
    'external': [('w', 'M10.5 4.5h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4'),
                 ('l', 'M14 4.5h5.5V10M19.5 4.5L11 13')],
    'more': [('d', C(5, 12, 2)), ('d', C(12, 12, 2)), ('d', C(19, 12, 2))],
    'more-vertical': [('d', C(12, 5, 2)), ('d', C(12, 12, 2)), ('d', C(12, 19, 2))],
    'drag': [('d', C(9, 6, 1.5)), ('d', C(15, 6, 1.5)), ('d', C(9, 12, 1.5)), ('d', C(15, 12, 1.5)),
             ('d', C(9, 18, 1.5)), ('d', C(15, 18, 1.5))],
    'trash': [('f', 'M5.5 7.5h13l-1.1 11.6a2 2 0 0 1-2 1.9H8.6a2 2 0 0 1-2-1.9z'),
              ('l', 'M3.5 7.5h17M9 7.5V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2v2.3M10 11.5v5.5M14 11.5v5.5')],
    'edit': [('f', 'M15.3 4.7a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3L9.5 18.5l-4-4z'),
             ('w', 'M5.5 14.5l4 4-5.5 1.5z'), ('l', 'M13 7l4 4')],
    'pen': [('f', 'M14.5 3.5l6 6-4 1.5-2.5 6L4 20l3-10 6-2.5z'), ('l', 'M4 20l6-6'), ('w', C(11.3, 12.7, 1.6))],
    'highlighter': [('f', 'M14.6 3.9a1.5 1.5 0 0 1 2.1 0l3.4 3.4a1.5 1.5 0 0 1 0 2.1l-8.4 8.4-5.5-5.5z'),
                    ('w', 'M6.2 12.3l5.5 5.5-2.2 2.2H6.2L3.8 17.6V14.7z'), ('l', 'M13.5 20.5h7')],
    'eraser': [('w', ER_TIP), ('f', ER_BODY), ('l', 'M10.5 20.5h10')],
    'filter': [('f', 'M4 4.5h16l-6.2 8V18l-3.6 2v-7.5z')],
    'sort': [('l', 'M8 4.5v15M4.5 8L8 4.5 11.5 8M16 19.5v-15M12.5 16l3.5 3.5 3.5-3.5')],
    'copy': [('f', R(3.5, 3.5, 12, 12, 2)), ('w', R(8.5, 8.5, 12, 12, 2))],
    'link': [('l', 'M10 14a3.5 3.5 0 0 0 5 0l4-4a3.5 3.5 0 0 0-5-5l-1 1'
                   'M14 10a3.5 3.5 0 0 0-5 0l-4 4a3.5 3.5 0 0 0 5 5l1-1')],
    'share': [('l', 'M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8'), ('f', C(17.8, 6, 2.6)), ('f', C(6.2, 12, 2.6)),
              ('f', C(17.8, 18, 2.6))],
    'upload': [('f', TRAY), ('l', 'M12 12.5v-9M7.5 8l4.5-4.5 4.5 4.5')],
    'download': [('f', TRAY), ('l', 'M12 3.5v9M7.5 8l4.5 4.5 4.5-4.5')],
    'refresh': [('l', 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15')],
    'undo': [('l', 'M9 14.5l-5-5 5-5M4 9.5h10.5a5.5 5.5 0 0 1 0 11H11')],
    'send': [('f', 'M20.5 3.5L3.5 10.3l7 3.2 3.2 7z'), ('l', 'M20.5 3.5l-10 10')],
    'attach': [('l', 'M19.5 11.5l-7.6 7.6a4.8 4.8 0 0 1-6.8-6.8l8.3-8.3a3.2 3.2 0 0 1 4.5 4.5l-8.3 8.3'
                     'a1.6 1.6 0 0 1-2.3-2.3l7.6-7.6')],
    # people and account
    'user': [('f', 'M4.5 20.5c0-3.7 3.4-6.2 7.5-6.2s7.5 2.5 7.5 6.2z'), ('w', C(12, 8, 4.2))],
    'mail': [('f', R(3, 5, 18, 14, 2.5)), ('l', 'M4 7l8 6 8-6')],
    'sign-in': [('f', R(13, 3.5, 7.5, 17, 2)), ('l', 'M3.5 12h11M11 8.5l3.5 3.5-3.5 3.5')],
    'sign-out': [('f', R(3.5, 3.5, 7.5, 17, 2)), ('l', 'M9.5 12h11M17 8.5l3.5 3.5-3.5 3.5')],
    'settings': [('f', gear(12, 12, 9.2, 7)), ('w', C(12, 12, 3))],
    'bell': [('f', 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2H4.4z'), ('l', 'M10 21h4M12 3.2V5')],
    'sun': [('f', C(12, 12, 4)),
            ('l', 'M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4'
                  'M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4')],
    'moon': [('f', 'M19.8 14.6A8 8 0 0 1 9.4 4.2a8 8 0 1 0 10.4 10.4z')],
    'eye': [('f', 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), ('w', C(12, 12, 3.2))],
    'eye-off': [('f', 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), ('w', C(12, 12, 3.2)),
                ('l', 'M4 3.5l16 17')],
    'lock': [('l', 'M8 10.5V7.5a4 4 0 0 1 8 0v3'), ('f', R(4.5, 10.5, 15, 10.5, 2.2)), ('d', C(12, 15.7, 1.4))],
    # forum
    'reply': [('l', 'M9.5 6l-5.5 5.5 5.5 5.5M4 11.5h9.5a6.5 6.5 0 0 1 6.5 6.5v1')],
    'vote': [('f', 'M12 3.5l8 8.5h-4.5v8.5h-7V12H4z')],
    'thumbs-up': [('f', 'M8.5 10.5L11.8 3.8a2.1 2.1 0 0 1 3.9 1.5L15 9h4a2 2 0 0 1 2 2.3l-1.2 7.4a2 2 0 0 1-2 1.8H8.5z'),
                  ('w', R(3, 10.5, 5.5, 10, 1.4))],
    'flag': [('f', 'M5.5 4.5c3-2 6 1.5 9 0s4.5-.5 4.5-.5v9.5s-1.5-1-4.5.5-6-2-9 0z'), ('l', 'M5.5 21V3.5')],
    'sparkle': [('f', 'M12 3c.9 5.2 3.8 8.1 9 9-5.2.9-8.1 3.8-9 9-.9-5.2-3.8-8.1-9-9 5.2-.9 8.1-3.8 9-9z')],
    # study
    'bookmark': [('f', 'M8 3.5h8a1.5 1.5 0 0 1 1.5 1.5v15.5L12 16.5l-5.5 4V5A1.5 1.5 0 0 1 8 3.5z')],
    'star': [('f', star(12, 12.6, 9.4, 4.3))],
    'timer': [('f', C(12, 13.5, 7.5)), ('l', 'M12 13.5V9.8M10 2.8h4M12 2.8V6M18.3 6.3l1.4-1.4')],
    'clock': [('f', C(12, 12, 9)), ('l', 'M12 7v5l3.5 2.2')],
    'deadline': [('l', 'M6 3h12M6 21h12'),
                 ('w', 'M7.5 3v2.6c0 2.6 4.5 4.4 4.5 6.4s-4.5 3.8-4.5 6.4V21h9v-2.6c0-2.6-4.5-4.4-4.5-6.4'
                       's4.5-3.8 4.5-6.4V3z'),
                 ('f', 'M8.4 20.1c.4-2 3.6-3.3 3.6-4.6 0 1.3 3.2 2.6 3.6 4.6z')],
    'exam': [('w', R(4.5, 4.5, 15, 17, 2.2)), ('f', R(8.5, 2.5, 7, 4, 1.3)), ('l', 'M8.5 13.5l2.5 2.5 4.5-5')],
    'calendar-add': [('w', R(3.5, 5, 17, 16, 2.6)),
                     ('f', 'M3.5 7.6A2.6 2.6 0 0 1 6.1 5h11.8a2.6 2.6 0 0 1 2.6 2.6v2.9h-17z'),
                     ('l', 'M8.5 3v4M15.5 3v4M12 13v5.2M9.4 15.6h5.2')],
    'page': [('w', 'M6.5 3H14l5 5v11.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z'),
             ('f', 'M14 3v5h5z'), ('l', 'M8.5 12.5h7M8.5 16h5')],
    'folder': [('f', 'M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-15'
                     'A1.5 1.5 0 0 1 3 18.7z'), ('l', 'M3 10.5h18')],
    'pin': [('f', 'M8.5 3.5h7l-1.2 5.3 3.2 3.4v1.8h-11v-1.8l3.2-3.4z'), ('l', 'M12 14v6.5')],
    'image': [('w', R(3, 4, 18, 16, 2.5)), ('f', 'M4.2 18.8l5-5.6 4 4 2.4-2.4 4.2 4z'), ('d', C(15.5, 9, 1.6))],
    'video': [('w', R(2.5, 5, 19, 14, 3)), ('f', 'M10 8.8v6.4l5.4-3.2z')],
    'play': [('f', 'M7.5 4.9v14.2a1 1 0 0 0 1.5.86l11.3-7.1a1 1 0 0 0 0-1.72L9 4.04a1 1 0 0 0-1.5.86z')],
    'pause': [('f', R(6, 4.5, 4, 15, 1.2)), ('f', R(14, 4.5, 4, 15, 1.2))],
    'list': [('l', 'M9 6.5h11M9 12h11M9 17.5h11'), ('d', C(4.8, 6.5, 1.3)), ('d', C(4.8, 12, 1.3)),
             ('d', C(4.8, 17.5, 1.3))],
    'sidebar': [('w', R(3, 4, 18, 16, 2.5)), ('f', 'M5.5 4h4v16h-4A2.5 2.5 0 0 1 3 17.5v-11A2.5 2.5 0 0 1 5.5 4z')],
    # status
    'success': [('f', C(12, 12, 9)), ('l', 'M8 12.3l2.8 2.8 5.4-5.6')],
    'info': [('f', C(12, 12, 9)), ('l', 'M12 11v5.5'), ('d', C(12, 7.8, 1.2))],
    'error': [('f', C(12, 12, 9)), ('l', 'M12 7.3v5.4'), ('d', C(12, 16.2, 1.2))],
    'warning': [('f', 'M10.3 4.4a2 2 0 0 1 3.4 0l7.6 13.1a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z'),
                ('l', 'M12 9.5v4.3'), ('d', C(12, 17.1, 1.2))],
    'question': [('f', C(12, 12, 9)),
                 ('l', 'M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.3'), ('d', C(12, 16.8, 1.2))],
    'offline': [('f', 'M7.2 18.5a4.5 4.5 0 0 1-.6-8.96A5.8 5.8 0 0 1 17.6 9a4.75 4.75 0 0 1-.2 9.5z'),
                ('l', 'M4 3.5l16 17')],
}

GROUPS = [
    ('Actions', ['plus', 'close', 'check', 'edit', 'trash', 'copy', 'link', 'external', 'share', 'upload',
                 'download', 'refresh', 'undo', 'send', 'attach', 'filter', 'sort', 'more', 'more-vertical', 'drag']),
    ('Direction', ['back', 'forward', 'arrow-up', 'arrow-down', 'chevron-left', 'chevron-right', 'chevron-up',
                   'chevron-down']),
    ('Study', ['bookmark', 'star', 'timer', 'clock', 'deadline', 'exam', 'calendar-add', 'page', 'folder', 'pen',
               'highlighter', 'eraser', 'pin', 'image', 'video', 'play', 'pause', 'list', 'sidebar']),
    ('Forum and account', ['reply', 'vote', 'thumbs-up', 'flag', 'bell', 'mail', 'user', 'sign-in', 'sign-out',
                           'settings', 'sun', 'moon', 'eye', 'eye-off', 'lock', 'sparkle']),
    ('Status', ['success', 'info', 'warning', 'error', 'question', 'offline']),
]
assert sorted(sum((g for _, g in GROUPS), [])) == sorted(UI), set(UI) ^ set(sum((g for _, g in GROUPS), []))
