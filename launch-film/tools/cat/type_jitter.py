#!/usr/bin/env python3
"""Track the centroid of each line of type across the PNGs written by type_jitter.mjs.
   python3 tools/cat/type_jitter.py <dir>
Reports the largest frame-to-frame step and the residual from a smooth (quadratic) path, in pixels."""
import glob
import sys

import cv2
import numpy as np

files = sorted(glob.glob(sys.argv[1] + '/j_*.png'))
REGIONS = {'kicker': (250, 170, 640, 250), 'happy birthday': (140, 250, 1090, 425), 'name': (140, 470, 1130, 800),
           'with love': (150, 800, 700, 900), 'lower third': (840, 840, 1260, 990)}


def centroid(im, x0, y0, x1, y1, thr=40):
    g = cv2.cvtColor(im[y0:y1, x0:x1], cv2.COLOR_BGR2GRAY).astype(np.float32)
    w = np.clip(g - thr, 0, None)
    ys, xs = np.mgrid[0:g.shape[0], 0:g.shape[1]]
    return np.array([(xs * w).sum() / w.sum() + x0, (ys * w).sum() / w.sum() + y0])


tracks = {k: [] for k in REGIONS}
for f in files:
    im = cv2.imread(f)
    for k, r in REGIONS.items():
        tracks[k].append(centroid(im, *r))
for k, v in tracks.items():
    v = np.array(v)
    d = np.diff(v, axis=0)
    t = np.arange(len(v))
    res = [v[:, ax] - np.polyval(np.polyfit(t, v[:, ax], 2), t) for ax in (0, 1)]
    print(f'{k:15s} moved ({v[-1, 0] - v[0, 0]:+.2f}, {v[-1, 1] - v[0, 1]:+.2f}) px | largest step dx {np.abs(d[:, 0]).max():.3f} dy {np.abs(d[:, 1]).max():.3f} '
          f'| residual rms x {np.std(res[0]):.3f} y {np.std(res[1]):.3f}')
