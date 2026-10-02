"""Shared constants and helpers for the cat asset pipeline (tools/cat/*.py)."""
import os

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
WORK = os.path.join(HERE, 'work')
ASSETS = os.path.join(ROOT, 'assets', 'cat')
os.makedirs(WORK, exist_ok=True)

# The photo is 1080x1776. Every derived asset lives on one padded canvas so the layers stack 1:1 in the film:
# PAD_TOP transparent pixels are added above the photo to make room for the party hat.
SRC_W, SRC_H = 1080, 1776
PAD_TOP = 280
CAN_W, CAN_H = SRC_W, SRC_H + PAD_TOP


def box(x, r):
    return cv2.boxFilter(x, -1, (2 * r + 1, 2 * r + 1), borderType=cv2.BORDER_REFLECT)


def guided_filter_color(guide, p, r, eps):
    """He et al. guided filter: 3-channel guide (float 0..1), scalar input p. Returns float32."""
    I = guide.astype(np.float64)
    p = p.astype(np.float64)
    mI = [box(I[..., c], r) for c in range(3)]
    mp = box(p, r)
    cov = [box(I[..., c] * p, r) - mI[c] * mp for c in range(3)]
    v = {}
    for i in range(3):
        for j in range(i, 3):
            v[(i, j)] = box(I[..., i] * I[..., j], r) - mI[i] * mI[j]
    a11, a12, a13 = v[(0, 0)] + eps, v[(0, 1)], v[(0, 2)]
    a22, a23, a33 = v[(1, 1)] + eps, v[(1, 2)], v[(2, 2)] + eps
    det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13)
    i11 = (a22 * a33 - a23 * a23) / det
    i12 = (a13 * a23 - a12 * a33) / det
    i13 = (a12 * a23 - a13 * a22) / det
    i22 = (a11 * a33 - a13 * a13) / det
    i23 = (a12 * a13 - a11 * a23) / det
    i33 = (a11 * a22 - a12 * a12) / det
    a = [i11 * cov[0] + i12 * cov[1] + i13 * cov[2],
         i12 * cov[0] + i22 * cov[1] + i23 * cov[2],
         i13 * cov[0] + i23 * cov[1] + i33 * cov[2]]
    b = mp - a[0] * mI[0] - a[1] * mI[1] - a[2] * mI[2]
    q = box(a[0], r) * I[..., 0] + box(a[1], r) * I[..., 1] + box(a[2], r) * I[..., 2] + box(b, r)
    return q.astype(np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def pad_canvas(img):
    """Photo-space array (H, W[, C]) -> padded canvas (PAD_TOP empty rows on top)."""
    pad = [(PAD_TOP, 0), (0, 0)] + [(0, 0)] * (img.ndim - 2)
    return np.pad(img, pad)


def save_rgba(path, bgr, alpha):
    """Straight-alpha PNG from float/uint8 BGR and float alpha (0..1)."""
    out = np.dstack([np.clip(bgr, 0, 255).astype(np.uint8), np.clip(alpha * 255 + 0.5, 0, 255).astype(np.uint8)])
    cv2.imwrite(path, out, [cv2.IMWRITE_PNG_COMPRESSION, 9])


def on_colour(bgr, alpha, colour=(40, 16, 8)):
    """Composite straight-alpha over a flat BGR colour (default: the film's navy) for review stills."""
    a = alpha[..., None].astype(np.float32)
    return (bgr.astype(np.float32) * a + np.array(colour, np.float32) * (1 - a)).astype(np.uint8)
