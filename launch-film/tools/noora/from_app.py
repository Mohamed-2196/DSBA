#!/usr/bin/env python3
"""Mini Noora's sprites for the film, taken from the app: /home/claude/dsba/public/noora/*.png are
copied to assets/noora/, and every full-body pose also gets a half-size twin in assets/noora/sm/
(340x392, same framing) for the small mascot inside the browser, so Chromium never has to shrink a
sprite by more than about a half.

  python3 tools/noora/from_app.py

The app's files are the masters. They were cut from the supplied sprite sheet by cut_sprites.py.
"""
import shutil
from pathlib import Path
import numpy as np
from PIL import Image

APP = Path('/home/claude/dsba/public/noora')
FILM = Path(__file__).resolve().parent.parent.parent / 'assets' / 'noora'
SMALL = (340, 392)


def half(im):
    """Resize on premultiplied colour, so the transparent surround does not darken the outline."""
    a = np.asarray(im.convert('RGBA')).astype('float32') / 255.0
    a[..., :3] *= a[..., 3:4]
    pm = Image.fromarray((a * 255).round().astype('uint8'), 'RGBA').resize(SMALL, Image.LANCZOS)
    b = np.asarray(pm).astype('float32') / 255.0
    b[..., :3] = np.clip(b[..., :3] / np.clip(b[..., 3:4], 1e-6, 1), 0, 1)
    return Image.fromarray((b * 255).round().astype('uint8'), 'RGBA')


def main():
    (FILM / 'sm').mkdir(parents=True, exist_ok=True)
    n = 0
    for src in sorted(APP.glob('*.png')):
        shutil.copyfile(src, FILM / src.name)
        if not src.name.startswith('bust-'):
            half(Image.open(src)).save(FILM / 'sm' / src.name, optimize=True)
        n += 1
    shutil.copyfile(APP / 'sprites.json', FILM / 'sprites.json')
    print(f'{n} sprites -> {FILM} (+ sm/)')


if __name__ == '__main__':
    main()
