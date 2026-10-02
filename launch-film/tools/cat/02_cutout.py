#!/usr/bin/env python3
"""Step 2: the cutout.  python3 tools/cat/02_cutout.py

  work/src_clean.png + work/alpha_sam.png (+ work/alpha_isnet-general-use.png for whiskers)
    -> assets/cat/cat-cutout.png   RGBA, 1080 x 2056 (PAD_TOP = 280 empty rows above the photo)
    -> work/check_cutout_*.png     review composites on navy / black

How the matte is made
  1. hard mask   Segment-Anything mask (point prompts, see 01_matte.py) + hand polygons where SAM is wrong, and the
                 wedge of tile at the photo's right edge (between the ear and the shoulder) closed with inpainted coat.
  2. soft matte  guided filter of the hard mask with the *deblocked* photo as guide (the photo is a re-saved
                 phone JPEG: closed-form matting locks onto its 8x8 blocks, the guided filter does not).
  3. choke       levels pull the edge ~1 px inwards so no pale tile survives around the white fur.
  4. whiskers    the long whiskers are traced as minimum-cost paths over a bright-ridge map of the photo
                 (gated ISNet alpha) between hand-placed end points, then re-drawn as tapered soft strokes.
  5. colour      foreground colours of semi-transparent pixels are re-estimated (pymatting, multi-level) and
                 then bled outwards from the solid interior, so the edge carries fur colour, not tile colour.
"""
import os

import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.interpolate import splev, splprep
from skimage.graph import route_through_array

from catlib import ASSETS, PAD_TOP, WORK, guided_filter_color, on_colour, pad_canvas, save_rgba, smoothstep

bgr = cv2.imread(os.path.join(WORK, 'src_clean.png'))
H, W = bgr.shape[:2]

# ── 1. hard mask ──────────────────────────────────────────────────────────────────────────────
sam = cv2.imread(os.path.join(WORK, 'alpha_sam.png'), 0) > 127
m = ndi.binary_fill_holes(sam)
lab, n = ndi.label(m)
m = lab == (1 + int(np.argmax(ndi.sum(m, lab, range(1, n + 1)))))
m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
m = ndi.binary_fill_holes(m > 0).astype(np.uint8)
ADD = [
    # bell + split rings hang in front of the chest fur
    [(395, 1290), (500, 1290), (505, 1405), (395, 1405)],
    # under the chin: far side of the collar and the shadowed ruff behind the ring (SAM leaves a notch)
    [(398, 1040), (480, 1075), (565, 1105), (575, 1195), (475, 1295), (400, 1295), (362, 1205), (352, 1100), (368, 1052)],
]
REMOVE = [
    # a sliver of out-of-focus tile left of the far shoulder
    [(300, 1050), (338, 1050), (340, 1130), (322, 1210), (300, 1210)],
]
for poly in ADD:
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
for poly in REMOVE:
    cv2.fillPoly(m, [np.array(poly, np.int32)], 0)
# Between the back of the head and the shoulder a wedge of tile shows at the photo's right edge. In the film that
# edge is the edge of the frame, where the wedge reads as a bite out of the cat: close it with coat (inpainted from
# the fur on both sides; it sits in the shadow at the very edge of frame).
NOTCH = [(985, 735), (1080, 700), (1080, 965), (1000, 950)]
notch = np.zeros((H, W), np.uint8)
cv2.fillPoly(notch, [np.array(NOTCH, np.int32)], 1)
notch_bg = cv2.dilate(((notch > 0) & (m == 0)).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (17, 17))) & notch
m = np.maximum(m, notch)
filled = cv2.inpaint(bgr, notch_bg * 255, 11, cv2.INPAINT_TELEA)
filled = cv2.GaussianBlur(filled, (0, 0), 2.0)
fur_noise = cv2.GaussianBlur(np.random.default_rng(5).normal(0, 3.0, (H, W, 1)).astype(np.float32), (0, 0), 1.3)[..., None]
soft_n = cv2.GaussianBlur(notch_bg.astype(np.float32), (0, 0), 3.0)[..., None]
bgr = np.clip(bgr * (1 - soft_n) + (filled.astype(np.float32) + fur_noise) * soft_n, 0, 255).astype(np.uint8)
hard = m.astype(np.float32)

# ── 2. soft matte ─────────────────────────────────────────────────────────────────────────────
smooth = cv2.bilateralFilter(cv2.bilateralFilter(bgr, 9, 14, 3), 9, 10, 3)       # deblock, keep edges
guide = cv2.GaussianBlur(smooth, (0, 0), 0.8).astype(np.float32) / 255
P = 24                                                                           # replicate-pad: the cat runs off the right/bottom
gp = cv2.copyMakeBorder(guide, P, P, P, P, cv2.BORDER_REPLICATE)
hp = cv2.copyMakeBorder(hard, P, P, P, P, cv2.BORDER_REPLICATE)
soft = guided_filter_color(gp, hp, 6, 1e-3)[P:-P, P:-P]

# ── 3. choke + clean ──────────────────────────────────────────────────────────────────────────
alpha = smoothstep(0.22, 0.90, soft)
# nothing further than 9 px outside / inside the hard mask may be semi-transparent
near = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))
core = cv2.erode(cv2.copyMakeBorder(m, P, P, P, P, cv2.BORDER_REPLICATE), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)))[P:-P, P:-P]
alpha = np.where(near > 0, alpha, 0.0)
alpha = np.where(core > 0, 1.0, alpha).astype(np.float32)
# the far shoulder (left of the bell) is out of focus in the photo: keep its edge as soft as the lens made it
zone = np.zeros((H, W), np.float32)
cv2.fillPoly(zone, [np.array([(280, 1060), (420, 1060), (420, 1560), (280, 1560)], np.int32)], 1)
zone = cv2.GaussianBlur(zone, (0, 0), 14)
alpha = alpha * (1 - zone) + cv2.GaussianBlur(alpha, (0, 0), 2.2) * zone
body = np.clip(alpha, 0, 1)

# ── 4. whiskers ───────────────────────────────────────────────────────────────────────────────
L = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)


def bright_ridge(lum, s):
    g = cv2.GaussianBlur(lum, (0, 0), s)
    dxx = cv2.Sobel(g, cv2.CV_32F, 2, 0, ksize=3)
    dyy = cv2.Sobel(g, cv2.CV_32F, 0, 2, ksize=3)
    dxy = cv2.Sobel(g, cv2.CV_32F, 1, 1, ksize=3)
    root = np.sqrt(((dxx - dyy) / 2) ** 2 + dxy ** 2)
    l1 = (dxx + dyy) / 2 - root
    l2 = (dxx + dyy) / 2 + root
    return np.maximum(-l1, 0) * s * s * np.clip(1 - np.abs(l2) / (np.abs(l1) + 1e-6), 0, 1)


R = np.max([bright_ridge(L, s) for s in (1.0, 1.5, 2.2)], axis=0)
gate = cv2.GaussianBlur(np.clip((cv2.dilate(R, np.ones((3, 3), np.uint8)) - 6) / 14, 0, 1), (0, 0), 0.8)
iso_path = os.path.join(WORK, 'alpha_isnet-general-use.png')
iso = cv2.imread(iso_path, 0).astype(np.float32) / 255 if os.path.exists(iso_path) else np.ones((H, W), np.float32)
strength = np.clip(iso * 1.5, 0, 1) * gate

# (root on the muzzle, tip[, hidden root]) in photo pixels, read off a 2x zoom of `strength`. The far-side whiskers
# start behind the muzzle: their traced part is joined to the whisker pad with a straight lead-in ("hidden root").
WHISKERS = [
    ((315, 565), (280, 525)), ((292, 600), (212, 560)), ((238, 606), (3, 602), (300, 615)), ((285, 632), (62, 654)),
    ((262, 688), (138, 803), (297, 667)), ((400, 720), (320, 750)), ((420, 727), (220, 802)), ((430, 735), (290, 810)),
    ((445, 745), (332, 825)), ((450, 750), (335, 840)), ((455, 738), (200, 987)), ((462, 745), (160, 1210)),
    ((540, 348), (522, 248)), ((510, 362), (496, 312)),
]
SS = 4                                               # supersampling for the strokes
wh = np.zeros((H * SS, W * SS), np.uint8)
cost_full = 1.0 / (0.02 + strength) ** 1.5


def snap(pt, r=5):
    x, y = pt
    y0, x0 = max(0, y - r), max(0, x - r)
    win = strength[y0:y + r + 1, x0:x + r + 1]
    iy, ix = np.unravel_index(int(np.argmax(win)), win.shape)
    return (x0 + ix, y0 + iy)


traced = []
for root, tip, *lead in WHISKERS:
    a, b = snap(root), snap(tip)
    x0, x1 = max(0, min(a[0], b[0]) - 60), min(W, max(a[0], b[0]) + 60)
    y0, y1 = max(0, min(a[1], b[1]) - 60), min(H, max(a[1], b[1]) + 60)
    path, _ = route_through_array(cost_full[y0:y1, x0:x1], (a[1] - y0, a[0] - x0), (b[1] - y0, b[0] - x0), fully_connected=True, geometric=True)
    pts = np.array([(px + x0, py + y0) for py, px in path], np.float64)
    if lead:                                          # straight lead-in from the hidden root
        n_lead = int(np.hypot(lead[0][0] - a[0], lead[0][1] - a[1]))
        pts = np.r_[np.linspace(lead[0], a, n_lead, endpoint=False), pts]
    seg = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    length = seg[-1]
    if len(pts) > 8:                                  # smooth the pixel staircase with a fitting spline
        tck, _ = splprep([pts[:, 0], pts[:, 1]], u=seg / length, s=len(pts) * 0.6, k=3)
        u = np.linspace(0, 1, int(length * 2) + 2)
        pts = np.stack(splev(u, tck), 1)
    else:
        u = seg / length
    # how visible the real whisker is along its length (faint ones stay faint)
    vis = ndi.map_coordinates(cv2.GaussianBlur(strength, (0, 0), 1.2), [pts[:, 1], pts[:, 0]], order=1)
    vis = ndi.gaussian_filter1d(vis, max(2.0, len(vis) / 12), mode='nearest')
    scale = np.clip(0.55 + 0.6 * vis, 0.55, 1.0)
    width = (2.5 - 1.5 * u ** 0.8) * (0.8 if length < 130 else 1.0)       # px: thick at the root, hair-thin at the tip
    opac = 0.95 * scale * (1 - smoothstep(0.62, 1.0, u)) ** 1.2
    step = max(1, len(pts) // 48)
    for i in range(0, len(pts) - 1, step):
        j = min(len(pts) - 1, i + step)
        p0 = tuple(np.round(pts[i] * SS + SS / 2).astype(int))
        p1 = tuple(np.round(pts[j] * SS + SS / 2).astype(int))
        k = (i + j) // 2
        lx0, ly0 = max(0, min(p0[0], p1[0]) - 16), max(0, min(p0[1], p1[1]) - 16)
        lx1, ly1 = min(W * SS, max(p0[0], p1[0]) + 16), min(H * SS, max(p0[1], p1[1]) + 16)
        tmp = np.zeros((ly1 - ly0, lx1 - lx0), np.uint8)
        cv2.line(tmp, (p0[0] - lx0, p0[1] - ly0), (p1[0] - lx0, p1[1] - ly0), int(255 * opac[k]), max(1, int(round(width[k] * SS))), cv2.LINE_AA)
        wh[ly0:ly1, lx0:lx1] = np.maximum(wh[ly0:ly1, lx0:lx1], tmp)
    traced.append((root, tip, round(float(length))))
whisk = cv2.resize(wh, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
whisk = cv2.GaussianBlur(whisk, (0, 0), 0.6)          # the photo's own softness
print('whiskers traced (root, tip, length px):', traced)

# ── 5. colours ────────────────────────────────────────────────────────────────────────────────
from pymatting import estimate_foreground_ml  # noqa: E402

rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float64) / 255
fg = estimate_foreground_ml(rgb, body.astype(np.float64))
fg = cv2.cvtColor(np.clip(fg, 0, 1).astype(np.float32), cv2.COLOR_RGB2BGR) * 255
# bleed interior fur colour outwards over the soft edge (normalised convolution of the solid interior)
solid = (body > 0.985).astype(np.float32)
num = np.zeros((H, W, 3), np.float32)
den = np.zeros((H, W), np.float32)
for s, wgt in ((3, 1.0), (7, 0.15), (16, 0.02)):
    num += wgt * cv2.GaussianBlur(bgr.astype(np.float32) * solid[..., None], (0, 0), s)
    den += wgt * cv2.GaussianBlur(solid, (0, 0), s)
bleed = num / np.maximum(den, 1e-4)[..., None]
t = smoothstep(0.55, 0.985, body)[..., None]          # solid pixels keep the photo, the edge takes the bleed
edge_col = 0.35 * fg + 0.65 * bleed
col = bgr.astype(np.float32) * t + edge_col * (1 - t)
col = np.where(den[..., None] > 1e-3, col, fg)

# whiskers go over everything that is not already solid cat
WHISK_BGR = np.array([236, 240, 243], np.float32)
wa = whisk * (1 - body)
alpha_out = body + wa
col_out = (col * body[..., None] + WHISK_BGR * wa[..., None]) / np.maximum(alpha_out, 1e-4)[..., None]

save_rgba(os.path.join(ASSETS, 'cat-cutout.png'), pad_canvas(col_out), pad_canvas(alpha_out))

# ── review composites ─────────────────────────────────────────────────────────────────────────
navy = on_colour(col_out, alpha_out)
black = on_colour(col_out, alpha_out, (0, 0, 0))
cv2.imwrite(os.path.join(WORK, 'check_cutout_navy.png'), navy)
cv2.imwrite(os.path.join(WORK, 'check_cutout_half.png'), cv2.resize(np.concatenate([navy, black], 1), None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA))
for name, (x0, y0, x1, y1) in {'top': (300, 60, 1080, 520), 'face': (0, 380, 760, 1000), 'neck': (120, 900, 760, 1500), 'low': (180, 1300, 1080, 1776), 'right': (780, 200, 1080, 1100)}.items():
    cv2.imwrite(os.path.join(WORK, f'check_cutout_{name}.png'), navy[y0:y1, x0:x1])
print('cutout written:', os.path.join(ASSETS, 'cat-cutout.png'), (W, H + PAD_TOP))
