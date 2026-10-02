#!/usr/bin/env python3
"""Step 5: scene-ready layers.  python3 tools/cat/05_grade.py

  assets/cat/cat-party.png (neutral composite, as photographed)
    -> assets/cat/cat-party-lit.png   the same picture graded for the film's night party: exposure lifted to the
                                      projector's white, a little warmth, the body falling off into navy shadow
    -> assets/cat/cat-rim.png         warm back-light along the silhouette (ears, hat, profile, whiskers), kept as a
                                      separate RGBA layer for anyone who wants to animate it
    -> assets/cat/cat-scene.png       lit + rim flattened into one image, cropped to the rows a frame can show:
                                      this is the file src/act2.js draws
    -> assets/cat/cat-closeup.png     tight head-and-shoulders crop of the same picture (see cat.json for its offset)
    -> assets/cat/cat.json            geometry for the film: canvas, eyes, bell, hat, close-up crop
"""
import json
import os

import cv2
import numpy as np

from catlib import ASSETS, CAN_H, CAN_W, PAD_TOP, WORK, save_rgba, smoothstep

im = cv2.imread(os.path.join(ASSETS, 'cat-party.png'), cv2.IMREAD_UNCHANGED).astype(np.float32)
bgr, alpha = im[..., :3], im[..., 3] / 255
yy, xx = np.mgrid[0:CAN_H, 0:CAN_W].astype(np.float32)
eyes_meta = json.load(open(os.path.join(ASSETS, 'eyes.json')))
eye_m = cv2.imread(os.path.join(ASSETS, 'cat-eyes.png'), cv2.IMREAD_UNCHANGED)[..., 3].astype(np.float32) / 255
hat_m = np.load(os.path.join(WORK, 'hat_alpha.npy'))

# ── 1. exposure: the photo's whites sit at ~205; bring them to ~244 with a soft shoulder ─────────────────────
x = bgr / 255
GAIN = 1.22
x = x * GAIN
KNEE = 0.84
x = np.where(x < KNEE, x, KNEE + (1 - KNEE) * (1 - np.exp(-(x - KNEE) / (1 - KNEE))))
# gentle S-curve for depth without waking up the JPEG blocks
x = np.clip(x, 0, 1)
x = x + 0.10 * (x - 0.5) * (1 - np.abs(2 * x - 1))

# ── 2. warmth (tungsten room), eyes and hat keep their own colour ────────────────────────────────────────────
warm = np.array([0.925, 0.985, 1.025], np.float32)            # BGR multipliers
keep = np.clip(np.maximum(eye_m, hat_m * 0.7), 0, 1)[..., None]
x = x * (warm * (1 - keep) + 1.0 * keep)
# the irises get a breath more colour (a retoucher's eye light)
hsv = cv2.cvtColor(np.clip(x, 0, 1).astype(np.float32), cv2.COLOR_BGR2HSV)
hsv[..., 1] = np.clip(hsv[..., 1] * (1 + 0.35 * eye_m), 0, 1)
hsv[..., 2] = np.clip(hsv[..., 2] * (1 + 0.10 * eye_m), 0, 1)
x = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)

# ── 3. the pool of light: face and hat bright, chest and the far right falling into navy ────────────────────
cx, cy = 600.0, 760.0
d = np.hypot((xx - cx) / 1.0, (yy - cy) / 1.15)
pool = 1 - smoothstep(430.0, 1250.0, d)
side = 1 - 0.42 * smoothstep(880.0, 1080.0, xx)               # the back of the head leaves the light
low = 1 - 0.62 * smoothstep(1330.0, 1860.0, yy)               # ... and so does the chest, below the collar
m = np.clip(pool * side * low, 0, 1)[..., None]
SHADOW = np.array([0.60, 0.46, 0.39], np.float32)             # BGR: the shadow side goes darker and a little cool
x = x * (SHADOW * (1 - m) + m)
lit = np.clip(x * 255, 0, 255)

save_rgba(os.path.join(ASSETS, 'cat-party-lit.png'), lit, alpha)

# ── 4. rim light layer ───────────────────────────────────────────────────────────────────────────────────────
soft = cv2.GaussianBlur(alpha, (0, 0), 7.0)
inner = alpha * np.clip(1 - soft, 0, 1) * 2.0                 # bright right at the silhouette, gone ~12 px inside
gx = cv2.Sobel(cv2.GaussianBlur(alpha, (0, 0), 5.0), cv2.CV_32F, 1, 0, ksize=3)
gy = cv2.Sobel(cv2.GaussianBlur(alpha, (0, 0), 5.0), cv2.CV_32F, 0, 1, ksize=3)
gn = np.hypot(gx, gy) + 1e-5
nx, ny = -gx / gn, -gy / gn                                   # outward normal of the silhouette
ldir = np.array([-0.42, -0.91])                               # back-light sits high and a little to the left
facing = np.clip(nx * ldir[0] + ny * ldir[1], -1, 1)
w = smoothstep(-0.55, 0.75, facing)
rim = np.clip(inner * (0.18 + 0.82 * w), 0, 1)
rim = cv2.GaussianBlur(rim, (0, 0), 1.0)
rim *= 1 - 0.75 * smoothstep(1400.0, 1900.0, yy)              # nothing glows down in the dark of the chest
RIM_BGR = np.array([150, 214, 255], np.float32)               # warm gold
save_rgba(os.path.join(ASSETS, 'cat-rim.png'), np.broadcast_to(RIM_BGR, lit.shape), np.clip(rim * 1.15, 0, 1))

# ── 5. the picture the film draws: lit + rim in one image, cropped to the rows a 16:9 frame can ever show ─────
SCENE_H = 1780
r3s = np.clip(rim * 1.15, 0, 1)[..., None] * 0.92
scene = RIM_BGR * r3s + lit * (1 - r3s)
# the phone JPEG's block noise is invisible at the film's scale but costs ~20 % of every frame's PNG: take it out
scene = cv2.fastNlMeansDenoisingColored(np.clip(scene, 0, 255).astype(np.uint8), None, 3, 3, 5, 15).astype(np.float32)
save_rgba(os.path.join(ASSETS, 'cat-scene.png'), scene[:SCENE_H], alpha[:SCENE_H])

# ── 5b. close-up crop ────────────────────────────────────────────────────────────────────────────────────────
CX0, CY0, CX1, CY1 = 150, 140, 1080, 1500
cv2.imwrite(os.path.join(ASSETS, 'cat-closeup.png'), np.dstack([scene, alpha * 255])[CY0:CY1, CX0:CX1].astype(np.uint8), [cv2.IMWRITE_PNG_COMPRESSION, 9])

# ── 6. geometry for the film ─────────────────────────────────────────────────────────────────────────────────
ys, xs = np.where(hat_m > 0.5)
meta = {
    '_note': 'Pixel coordinates on the 1080x2056 cat canvas (cat-cutout / cat-party / cat-party-lit / cat-rim / cat-eyes). '
             'Generated by tools/cat/05_grade.py.',
    'canvas': {'w': CAN_W, 'h': CAN_H, 'pad_top': PAD_TOP},
    'eyes': eyes_meta['eyes'],
    'bell': {'cx': 448, 'cy': 1349 + PAD_TOP, 'r': 42},
    'nose': {'cx': 350, 'cy': 608 + PAD_TOP},
    'hat': {'x0': int(xs.min()), 'y0': int(ys.min()), 'x1': int(xs.max()), 'y1': int(ys.max())},
    'scene': {'file': 'cat-scene.png', 'w': CAN_W, 'h': SCENE_H},
    'closeup': {'file': 'cat-closeup.png', 'x0': CX0, 'y0': CY0, 'w': CX1 - CX0, 'h': CY1 - CY0},
    'framing': 'the cat runs off the canvas at its right and bottom edges: keep those two edges out of frame',
}
json.dump(meta, open(os.path.join(ASSETS, 'cat.json'), 'w'), indent=2)

# ── review ───────────────────────────────────────────────────────────────────────────────────────────────────
bg = np.zeros((CAN_H, CAN_W, 3), np.float32)
bg[:] = (26, 10, 4)
a3 = alpha[..., None]
comp = lit * a3 + bg * (1 - a3)
r3 = np.clip(rim * 1.15, 0, 1)[..., None]
comp_rim = RIM_BGR * r3 + comp * (1 - r3)
sheet = np.concatenate([comp, comp_rim], 1)
cv2.imwrite(os.path.join(WORK, 'check_lit.png'), cv2.resize(sheet[100:1740], None, fx=0.6, fy=0.6, interpolation=cv2.INTER_AREA).astype(np.uint8))
cv2.imwrite(os.path.join(WORK, 'check_lit_head.png'), comp_rim[150:1000, 330:1080].astype(np.uint8))
print(json.dumps(meta['hat']), 'lit max', lit.max(), 'fur p50', np.percentile(lit[alpha > 0.99].mean(-1), [5, 50, 95]).round(0))
