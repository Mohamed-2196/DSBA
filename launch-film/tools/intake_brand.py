#!/usr/bin/env python3
"""Places the artwork Mohamed supplied (his DSBA logo, the newsletter cover illustration and the
official app logos for the opening) into the film and the app. Re-run after replacing a source file.

  python3 tools/intake_brand.py
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

UP = Path('/root/.claude/uploads/331caa53-7cba-5bfe-8500-672e2c76573d')
FILM = Path('/home/claude/launch-video/assets')
APP = Path('/home/claude/dsba/public')

SRC = {
    'dsba': UP / '246f15cd-image.png',       # the DSBA wordmark, blue on white
    'cover': UP / '361ce8c6-image.png',      # newsletter cover illustration, 3:4, no text
    'outlook': UP / '3340eb81-image.png',
    'gmail': UP / '57ba4008-image.png',
    'lse': UP / '4b5a7f08-image.png',
    'whatsapp': UP / '41134e21-image.png',
}


def trim(im, pad=0):
    """Crop to the non-transparent (or non-white) content."""
    im = im.convert('RGBA')
    a = np.asarray(im)
    solid = a[..., 3] > 8
    if solid.all():                       # opaque file: trim a white border instead
        solid = (a[..., :3].min(-1) < 246)
    ys, xs = np.where(solid)
    box = (max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + 1 + pad, im.width), min(ys.max() + 1 + pad, im.height))
    return im.crop(box)


def fit(im, side):
    if max(im.size) <= side:
        return im
    k = side / max(im.size)
    return im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)


# ── 1. the DSBA logo: transparent blue + white twins, and a square icon from its "D"
logo = Image.open(SRC['dsba']).convert('RGB')
a = np.asarray(logo).astype(np.float32)
blue = np.median(a[a[..., 0] < 80], axis=0)                      # ≈ (20, 54, 144)
alpha = np.clip((254 - a[..., 0]) / (254 - blue[0]), 0, 1)
ys, xs = np.where(alpha > 0.5)
x0, x1, y0, y1 = xs.min() - 6, xs.max() + 7, ys.min() - 6, ys.max() + 7
alpha = alpha[y0:y1, x0:x1]
A = Image.fromarray((alpha * 255).round().astype(np.uint8))


def tinted(rgb):
    im = Image.new('RGBA', A.size, tuple(int(c) for c in rgb) + (0,))
    im.putalpha(A)
    return im


blue_logo, white_logo = tinted(blue), tinted((255, 255, 255))
print('dsba logo', blue_logo.size, 'ratio', round(blue_logo.width / blue_logo.height, 4), 'blue', blue)

# the "D": columns up to the gap before the S
col = alpha.sum(0)
gap = int(np.argmin(col[450:700])) + 450
d = A.crop((0, 0, gap, A.height))
dy, dx = np.where(np.asarray(d) > 128)
d = d.crop((dx.min(), dy.min(), dx.max() + 1, dy.max() + 1))
S = 512
icon = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
ImageDraw.Draw(icon).rounded_rectangle((0, 0, S * 2 - 1, S * 2 - 1), radius=int(S * 2 * 0.235), fill=tuple(int(c) for c in blue) + (255,))
k = (S * 2 * 0.56) / max(d.size)
d2 = d.resize((round(d.width * k), round(d.height * k)), Image.LANCZOS)
white_d = Image.new('RGBA', d2.size, (255, 255, 255, 0))
white_d.putalpha(d2)
icon.alpha_composite(white_d, ((S * 2 - d2.width) // 2, (S * 2 - d2.height) // 2))
icon = icon.resize((S, S), Image.LANCZOS)

for root in (FILM / 'brand', APP / 'brand'):
    root.mkdir(parents=True, exist_ok=True)
    fit(blue_logo, 1600).save(root / 'dsba-logo.png', optimize=True)
    fit(white_logo, 1600).save(root / 'dsba-logo-white.png', optimize=True)
    icon.save(root / 'dsba-icon.png', optimize=True)
icon.resize((64, 64), Image.LANCZOS).save(APP / 'favicon.png', optimize=True)

# ── 2. the newsletter cover illustration
cover = Image.open(SRC['cover']).convert('RGB')
cover.save(APP / 'brand' / 'newsletter-cover.jpg', quality=92, optimize=True, progressive=True)
cover.save(FILM / 'brand' / 'newsletter-cover.jpg', quality=92, optimize=True)
print('cover', cover.size, (APP / 'brand' / 'newsletter-cover.jpg').stat().st_size // 1024, 'KB')

# ── 3. official app logos for the opening notifications
(FILM / 'logos').mkdir(parents=True, exist_ok=True)
for name in ('outlook', 'gmail', 'lse', 'whatsapp'):
    im = fit(trim(Image.open(SRC[name])), 512)
    im.save(FILM / 'logos' / f'{name}.png', optimize=True)
    print(name, im.size)

# ── 4. Mohamed's own portal screenshots for the opening's three browser tabs (MyClass, LSE VLE, UoL).
#       Teachers' names and photos on the MyClass course cards and his student number on the UoL
#       portal are blurred: the film names no individual teacher and shows no ID numbers.
from PIL import ImageFilter

PORTALS = {
    'myclass': (UP / '961c59a7-image.jpg', [(172, 708, 524, 752), (568, 708, 904, 752), (172, 1196, 524, 1240), (568, 1196, 904, 1240)]),
    'lse-vle': (UP / 'c11362a2-image.jpg', []),
    'uol': (UP / 'a4247b92-image.jpg', [(736, 40, 858, 76)]),
}
(FILM / 'portals').mkdir(parents=True, exist_ok=True)
for name, (src, boxes) in PORTALS.items():
    im = Image.open(src).convert('RGB')
    for box in boxes:
        patch = im.crop(box).filter(ImageFilter.GaussianBlur(9))
        im.paste(patch, box[:2])
    im.save(FILM / 'portals' / f'{name}.png', optimize=True)
    print('portal', name, im.size, len(boxes), 'blurred regions')
