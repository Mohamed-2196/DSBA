from kit import B, tw

def tool_btn(b, x, y, glyph, active=False, size=44, sec='notebook', on='surface'):
    if active:
        b.rect(x, y, size, size, 13, f'{sec}-pill', f'{sec}-art', 2); b.glyph(glyph, x + size / 2, y + size / 2, f'{sec}-text', 1.05)
    else:
        b.glyph(glyph, x + size / 2, y + size / 2, 'ink-2', 1.05)

def notebook_phone(b):
    b.rect(0, 0, 390, 844, 0, 'canvas'); b.status()
    # note bar
    b.glyph('left', 26, 70, 'accent-text'); b.t(40, 75, 'Notes', 15, 700, 'accent-text', on='canvas')
    tool_btn(b, 286, 48, 'pages', on='canvas'); tool_btn(b, 330, 48, 'more', on='canvas')
    b.t(16, 130, 'Likelihood ratio', 28, 750, 'ink', 'disp', on='canvas'); b.t(16, 162, 'tests, worked', 28, 750, 'ink', 'disp', on='canvas')
    x = 16 + b.badge(16, 178, 'ST2134 · Lesson 7.3', 'notebook-pill', 'notebook-text', 30, 13) + 10
    b.glyph('check', x + 7, 193, 'success', .75); b.t(x + 18, 198, 'Saved', 13, 700, 'success', on='canvas')
    # ruled sheet
    b.card(16, 224, 358, 520, 18)
    for yy in range(276, 740, 28): b.line(30, yy + 6, 360, yy + 6, 'line', 1)
    b.line(46, 232, 46, 736, 'notebook-tint', 1.5)
    X = 58
    b.t(X, 270, 'The test', 21, 750, 'ink', 'disp')
    y = b.wrap(X, 298, 'Compare the best fit under H₀ with the best fit overall. A small ratio means H₀ explains the data badly.', 300, 16, 400, 28, 'ink')
    # display formula
    b.formula_frac(118, y + 32, 'L(θ<tspan font-size="12" dy="4">0</tspan><tspan dy="-4">)</tspan>', 'max L(θ)', 19, lhs='Λ =')
    y += 92
    b.t(X, y, 'Reject H₀ when −2 log Λ &gt; 3.84', 16, 600, raw=True); y += 28
    b.t(X, y, '(χ² with 1 degree of freedom, 5%).', 16, 400, 'ink-2'); y += 34
    # video time stamp (ST-44)
    bw = b.badge(X, y - 18, '14:32 · Lesson 7.3', 'notebook-pill', 'notebook-text', 30, 13, icon='play')
    b.t(X + bw + 10, y + 2, 'tap to replay', 13, 500, 'ink-3'); y += 40
    for done, txt in ((True, 'Q4 of May 2023 Zone A'), (False, 'Redo it with a one-sided H₁')):
        if done:
            b.rect(X, y - 17, 22, 22, 7, 'success'); b.glyph('check', X + 11, y - 6, 'surface', .75)
            b.t(X + 34, y, txt, 16, 500, 'ink-3', extra='text-decoration="line-through"')
        else:
            b.rect(X + 1, y - 16, 20, 20, 7, 'surface', 'line-strong', 2); b.t(X + 34, y, txt, 16, 500)
        y += 28
    b.t(X, y + 28, 'Next: the Wald test, lesson 7.4', 16, 400, 'ink-3')
    # toast: Jot happy, saved
    b.toast(16, 664, 252, 'notebook', 'Saved', 'In ST2134 Statistical Inference')
    b.noora(338, 696)
    # bottom tool bar: modes, then formatting
    b.rect(0, 752, 390, 92, 0, 'surface'); b.line(0, 752.75, 390, 752.75, 'line', 1.5, 'stroke-linecap="butt"')
    for i, (gl, act) in enumerate([('type', True), ('pen', False), ('hl', False), ('eraser', False), ('lasso', False)]):
        tool_btn(b, 12 + i * 48, 762, gl, act)
    b.line(256, 770, 256, 798, 'line-strong', 1.5)
    tool_btn(b, 266, 762, 'bold'); tool_btn(b, 312, 762, 'sigma')
    b.rect(128, 826, 134, 5, 2.5, 'ink')

PAPER = [
    ('h', 'Question 1'),
    ('p', '(a) Let X₁, …, Xₙ be a random sample from a Poisson'),
    ('p', '     distribution with mean λ.'),
    ('p', '     (i)  Find the maximum likelihood estimator of λ.', '[5 marks]'),
    ('p', '     (ii) Show that it attains the Cramér–Rao lower bound.', '[6 marks]'),
    ('g', ''),
    ('p', '(b) Construct an approximate 95% confidence interval for λ'),
    ('p', '     based on your answer to (a).', '[4 marks]'),
    ('g', ''),
    ('p', '(c) Explain what “efficient” means for an estimator.', '[5 marks]'),
    ('g', ''), ('g', ''),
    ('h', 'Question 2'),
    ('p', '(a) State the Neyman–Pearson lemma.', '[4 marks]'),
]

def notebook_laptop(b):
    b.laptop_top('notebook')
    b.glyph('left', 288, 101, 'accent-text'); b.t(300, 106, 'Notes', 14, 700, 'accent-text', on='canvas')
    b.t(346, 106, '/   ST2134 Statistical Inference', 14, 600, 'ink-2', on='canvas')
    b.t(280, 148, 'ST2134 · May 2023 · Zone A', 30, 750, 'ink', 'disp', on='canvas')
    b.glyph('check', 1004, 136, 'success', .8); b.t(1016, 141, 'Saved in ST2134 Statistical Inference', 13, 700, 'success', on='canvas')
    b.button(1258, 116, 'Print or save as PDF', 'secondary', h=40, size=14, w=150)
    b.t(1333, 141, '', 1);
    # pen toolbar with Jot beside the tools
    b.card(280, 164, 1128, 72, 18)
    b.mate('notebook', 290, 166, 66)
    x = 362
    for gl, act, lab in [('type', False, 'Type'), ('pen', True, 'Pen'), ('hl', False, 'Highlighter'), ('eraser', False, 'Eraser'), ('lasso', False, 'Lasso')]:
        tool_btn(b, x, 178, gl, act); x += 50
    b.line(x + 4, 186, x + 4, 214, 'line-strong', 1.5); x += 22
    for i, colr in enumerate(['ink', 'accent', 'exam', 'success']):
        cx = x + 22
        if i == 1: b.a(f'<circle cx="{cx}" cy="200" r="16" fill="none" stroke="{b.C["accent"]}" stroke-width="2"/>')
        b.a(f'<circle cx="{cx}" cy="200" r="11" fill="{b.C[colr]}"/>'); x += 44
    b.line(x + 4, 186, x + 4, 214, 'line-strong', 1.5); x += 18
    for i, r in enumerate([2, 3.5, 5.5]):
        cx = x + 22
        if i == 1: b.rect(x + 2, 180, 40, 40, 12, 'inset')
        b.a(f'<circle cx="{cx}" cy="200" r="{r}" fill="{b.C["ink-2"]}"/>'); x += 44
    b.line(x + 4, 186, x + 4, 214, 'line-strong', 1.5); x += 14
    tool_btn(b, x, 178, 'undo'); tool_btn(b, x + 46, 178, 'redo')
    tool_btn(b, 1300, 178, 'pages', True); tool_btn(b, 1350, 178, 'expand')
    # tooltip under the active tool
    b.a(f'<g filter="url(#float)"><rect x="392" y="232" width="74" height="30" rx="9" fill="{b.C["ink"]}"/></g>')
    b.t(404, 252, 'Pen', 13, 700, 'surface', on='ink'); b.kbd(434, 236, 'P', on='surface')
    # pages drawer
    b.rect(280, 252, 120, 636, 18, 'surface', 'line', 1.5)
    b.t(296, 278, 'PAGES', 11, 800, 'ink-3', ls=1.1)
    for i in range(4):
        y0 = 292 + i * 138
        act = i == 0
        if act: b.rect(298, y0 - 4, 84, 114, 10, 'notebook-pill', 'notebook-art', 2)
        b.rect(304, y0 + 2, 72, 96, 4, '#FFFFFF', 'line-strong', 1)
        for k in range(6): b.line(312, y0 + 16 + k * 11, 368 - (k % 3) * 9, y0 + 16 + k * 11, 'line-strong', 2)
        if i in (0, 2): b.path(f'M314 {y0+40}q12-6 24 0t20 0', 'none', 'accent', 1.6)
        b.t(340, y0 + 122 if not act else y0 + 124, str(i + 1), 12, 800 if act else 600, 'notebook-text' if act else 'ink-2', anchor='middle', on='canvas' if not act else 'canvas')
    # canvas with the PDF page
    b.rect(420, 252, 988, 648, 18, 'inset')
    PX, PY, PW = 520, 272, 760
    b.a(f'<g filter="url(#lift)"><rect x="{PX}" y="{PY}" width="{PW}" height="640" fill="#FFFFFF"/></g>')
    b.t(PX + 48, PY + 50, 'UNIVERSITY OF LONDON', 11, 800, 'ink-2', ls=1.4)
    b.t(PX + PW - 48, PY + 50, 'ST2134 ZA', 12, 700, 'ink-2', 'mono', anchor='end')
    b.t(PX + 48, PY + 84, 'Statistical Inference', 20, 750, 'ink', 'disp')
    b.t(PX + 48, PY + 108, 'Wednesday 17 May 2023, 10:00 to 12:00 · Time allowed: two hours', 13, 500, 'ink-2')
    b.line(PX + 48, PY + 124, PX + PW - 48, PY + 124, 'line-strong', 1)
    # highlighter over the estimator phrase (drawn before the text)
    b.a(f'<rect x="{PX+132}" y="{PY+226}" width="212" height="22" rx="4" fill="{b.C["warning-fill"]}" opacity=".5"/>')
    y = PY + 160
    for item in PAPER:
        if item[0] == 'g': y += 14; continue
        if item[0] == 'h': b.t(PX + 48, y, item[1], 15, 800, 'ink'); y += 30; continue
        b.t(PX + 48, y, item[1].replace('     ', '   '), 14, 400, 'ink', extra='xml:space="preserve"')
        if len(item) > 2: b.t(PX + 520, y, item[2], 13, 600, 'ink-2', anchor='end')
        y += 26
    # ink: a raspberry ring round [6 marks] with an arrow to the margin note; the royal stroke is being drawn now
    b.a(f'<ellipse cx="{PX+492}" cy="{PY+263}" rx="38" ry="14" fill="none" stroke="{b.C["exam"]}" stroke-width="2.4" transform="rotate(-3 {PX+492} {PY+263})"/>')
    b.path(f'M{PX+532} {PY+258}q30-10 44-36', 'none', 'exam', 2.2); b.path(f'M{PX+568} {PY+226}l9-6 1 11', 'none', 'exam', 2.2)
    b.path(f'M{PX+256} {PY+275}q70 6 136 0', 'none', 'accent', 2.6)
    b.a(f'<circle cx="{PX+394}" cy="{PY+274}" r="6" fill="none" stroke="{b.C["accent"]}" stroke-width="1.5"/>')
    b.path(f'M{PX+348} {PY+232}q120-10 210-72', 'none', 'notebook-text', 2.2); b.path(f'M{PX+548} {PY+156}l12 2-5 10', 'none', 'notebook-text', 2.2)
    # typed boxes on the PDF (Type tool)
    NX = PX + 584
    def hat(x, y, c): b.path(f'M{x} {y}l4-5 4 5', 'none', c, 1.6)
    def bar(x, y, w, c): b.line(x, y, x + w, y, c, 1.6)
    b.t(NX, PY + 158, 'λ = X', 18, 700, 'notebook-text', extra='font-style="italic"'); hat(NX + 2, PY + 142, 'notebook-text'); bar(NX + 34, PY + 141, 11, 'notebook-text')
    b.t(NX, PY + 180, 'set the score to 0', 13, 600, 'notebook-text')
    b.t(NX, PY + 214, 'Var(λ) = λ/n', 15, 700, 'exam', extra='font-style="italic"'); hat(NX + 33, PY + 199, 'exam')
    b.t(NX, PY + 236, '= 1/(n I(λ)), so yes', 15, 700, 'exam', extra='font-style="italic"')
    b.t(NX, PY + 316, 'X ± 1.96 √(X/n)', 15, 700, 'success', extra='font-style="italic"'); bar(NX + 1, PY + 300, 10, 'success'); bar(NX + 82, PY + 300, 10, 'success')
    b.path(f'M{PX+436} {PY+318}q60 4 140-6', 'none', 'success', 2.2)
    b.laptop_bottom()

if __name__ == '__main__':
    b = B(390, 844, 'light', 'Notebook: a note in the text view on a phone, Deskmates v2'); notebook_phone(b); b.save('notebook-phone.svg')
    b = B(1440, 900, 'light', 'Notebook: annotating a past paper with the pen on a laptop, Deskmates v2'); notebook_laptop(b); b.save('notebook-laptop.svg')
