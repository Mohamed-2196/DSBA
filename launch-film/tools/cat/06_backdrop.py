#!/usr/bin/env python3
"""Step 6: the room behind the cat.  python3 tools/cat/06_backdrop.py

  -> assets/cat/backdrop.png   2320 x 1380 RGB: near-black navy, a navy lift where the greeting sits, warm tungsten
                               haze behind the cat's head (so the navy hat separates from the dark) and low right
  -> assets/cat/vignette.png   1920 x 1080 RGBA: black, alpha = corner fall-off

Why images and not CSS gradients: headless Chromium dithers every CSS/canvas gradient, and that 1-bit noise makes
each frame's PNG several times larger and slower to encode (the frame renderer saves PNGs). A plain 8-bit image is
drawn without dithering.
"""
import os

import cv2
import numpy as np

from catlib import ASSETS, smoothstep

W, H = 2320, 1380              # the frame (1920 x 1080) plus a 200 x 150 px apron for the camera move
OX, OY = 200, 150
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
fx, fy = xx - OX, yy - OY      # frame coordinates


def blob(cx, cy, rx, ry, power=2.0):
    d = np.sqrt(((fx - cx) / rx) ** 2 + ((fy - cy) / ry) ** 2)
    return np.exp(-(d ** power) * 1.6)


def clouds(seed, cell):
    r = np.random.default_rng(seed)
    g = r.random((H // cell + 3, W // cell + 3)).astype(np.float32)
    return cv2.GaussianBlur(cv2.resize(g, (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), cell * 0.35)


# base: almost black, slightly lifted through the middle (RGB, linear-ish working values 0..255)
v = np.clip(fy / 1080, -0.2, 1.2)
base = np.stack([2 + 2.2 * np.sin(np.pi * np.clip(v, 0, 1)), 4 + 5 * np.sin(np.pi * np.clip(v, 0, 1)), 11 + 13 * np.sin(np.pi * np.clip(v, 0, 1))], -1)

img = base.copy()
# navy lift behind the greeting
navy = blob(600, 540, 900, 620, 1.7) * (0.72 + 0.56 * clouds(2, 300)) * (0.9 + 0.2 * clouds(6, 90))
img += navy[..., None] * np.array([6.0, 14.0, 40.0])
# tungsten haze behind the cat's head and hat: uneven, like light on a wall through smoke
haze = blob(1560, 380, 560, 470, 1.6) * (0.78 + 0.44 * clouds(3, 260))
core = blob(1650, 300, 300, 260, 1.8) * (0.8 + 0.4 * clouds(4, 150))
img += haze[..., None] * np.array([74.0, 44.0, 12.0])
img += core[..., None] * np.array([46.0, 27.0, 6.0])
# a second, dimmer practical low on the right, behind the cat's shoulder
low = blob(1850, 960, 430, 330, 1.7) * (0.8 + 0.4 * clouds(5, 200))
img += low[..., None] * np.array([40.0, 22.0, 6.0])
# the warm light spills a little into the navy
img += blob(1150, 470, 620, 520, 1.5)[..., None] * np.array([9.0, 5.0, 1.0])

out = np.clip(img, 0, 255)
cv2.imwrite(os.path.join(ASSETS, 'backdrop.png'), np.round(out[..., ::-1]).astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])

# vignette
VW, VH = 1920, 1080
y2, x2 = np.mgrid[0:VH, 0:VW].astype(np.float32)
d = np.sqrt(((x2 - 0.54 * VW) / 1250) ** 2 + ((y2 - 0.45 * VH) / 800) ** 2)
a = 0.80 * smoothstep(0.50, 1.02, d)
a = np.maximum(a, 0.40 * smoothstep(0.87 * VW, VW, x2))          # the right edge, where the photo is cropped
a = 1 - (1 - a) * (1 - 0.30 * smoothstep(0.80 * VH, VH, y2))     # and a little weight at the bottom
vig = np.zeros((VH, VW, 4), np.uint8)
vig[..., 0], vig[..., 1], vig[..., 2] = 8, 2, 1
vig[..., 3] = np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)
cv2.imwrite(os.path.join(ASSETS, 'vignette.png'), vig, [cv2.IMWRITE_PNG_COMPRESSION, 9])
print('backdrop', out.shape, 'max', out.reshape(-1, 3).max(0).round(0), os.path.getsize(os.path.join(ASSETS, 'backdrop.png')) // 1000, 'KB;',
      'vignette', os.path.getsize(os.path.join(ASSETS, 'vignette.png')) // 1000, 'KB')
