#!/usr/bin/env python3
"""glitch_post.py -- raster glitch post-processing + H.264 encode for the DSBA launch film.

Usage
  # whole film -> one frame-accurate encode (every frame must exist)
  python3 tools/glitch_post.py --frames out/frames --cues cues.json --out out/video_silent.mp4

  # a time range only: processed PNGs for review and/or a short preview mp4
  python3 tools/glitch_post.py --frames out/frames --cues cues.json --from 63.5 --to 87.0 \
      [--frames-out out/glitched_preview] [--out out/preview.mp4] [--log out/decisions.jsonl]

What it does
  * Reads clean frames  <frames>/f_%05d.png  (1920x1080, frame n shows time n/fps).
  * Frames inside cues.g1 / cues.g2 get raster glitch corruption driven by the cue data:
    segment kind + intensity ramp (i0 -> i1), short spikes at `hits` (and error-window /
    terminal-line accents), and `stutters` (frame-index remap that mirrors the audio repeat).
  * Every other frame is passed through bit-exact.
  * Photosensitivity guard (on by default, --no-flash-guard to disable): no more than 3
    large-area flashes in any second (Harding/Ofcom general-flash rule). Full-frame flashes
    are budgeted by design; any glitch frame that would still break the rule is blended
    toward the previous frame. The designed white flash and black are never touched.
    Everything written is also audited (read-only); stretches anywhere in the film with more
    than 3 large-area flashes per second are reported as a WARNING with their times.
  * Output: raw RGB piped into ONE ffmpeg encode: libx264 -crf 16 -preset slow
    -pix_fmt yuv420p -r 30, BT.709 matrix + tags, no audio.
  * Deterministic: every random decision is seeded from (seed, frame index, effect tag);
    a range render reproduces the corresponding frames of a full render exactly.

Timing convention: a cue at time T affects frames with n/fps >= T (i.e. the first frame
at or after T -- the same frame where the DOM shows something that starts at T).
"""
import argparse
import json
import math
import shutil
import subprocess
import sys
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import glitchlib as gl  # noqa: E402

DEFAULT_SEED = 0x6C17C4
ENV = (1.0, 0.68, 0.42, 0.2, 0.07)   # spike envelope by frames since the hit (~5 frames)


class FrameError(RuntimeError):
    pass


def fceil(t, fps):
    """First frame index whose time n/fps is >= t."""
    return int(math.ceil(t * fps - 1e-6))


# ==================================================================================== plan
class Segment:
    EASE = {
        "corrupt": lambda p: p ** 1.35,
        "crescendo": lambda p: p ** 1.7,
        "static": lambda p: p * p * (3 - 2 * p),
    }

    def __init__(self, d, fps):
        self.kind = d["kind"]
        self.t0, self.t1 = float(d["t0"]), float(d["t1"])
        self.i0 = float(d.get("i0", 0.0))
        self.i1 = float(d.get("i1", self.i0))
        self.n0, self.n1 = fceil(self.t0, fps), fceil(self.t1, fps)
        self.len = max(1, self.n1 - self.n0)
        self.sched = None

    def progress(self, n):
        return 0.0 if self.len <= 1 else gl.clamp01((n - self.n0) / (self.len - 1))

    def intensity(self, n):
        p = self.progress(n)
        e = self.EASE.get(self.kind, lambda x: x)(p)
        return self.i0 + (self.i1 - self.i0) * e


class Stutter:
    """Between start and end the picture repeats source slice [src, src+len) -- same as audio."""

    def __init__(self, d, fps):
        self.start, self.end = float(d["start"]), float(d["end"])
        self.src, self.len = float(d["src"]), float(d["len"])
        self.n0, self.n1 = fceil(self.start, fps), fceil(self.end, fps)
        self.fps = fps

    def map(self, n):
        """-> (source frame index, loop iteration)."""
        fps = self.fps
        if self.len * fps < 1.0:            # sub-frame slice: alternate the nearest 2 frames
            a = math.floor(self.src * fps + 1e-6)
            k = n - self.n0
            return a + (k % 2), k // 2
        el = n / fps - self.start
        loop = int(math.floor(el / self.len + 1e-9))
        phase = el - loop * self.len
        return int(math.floor((self.src + phase) * fps + 1e-6)), loop


class Window:
    def __init__(self, name, g, fps):
        self.name = name
        self.g = g
        self.start, self.end = float(g["start"]), float(g["end"])
        self.n0, self.n1 = fceil(self.start, fps), fceil(self.end, fps)
        self.segments = [Segment(s, fps) for s in g.get("segments", [])]
        self.stutters = [Stutter(s, fps) for s in g.get("stutters", [])]
        self.hits = sorted({fceil(h, fps) for h in g.get("hits", [])})
        self.accents = {}
        for t in g.get("error_windows", []):
            self.accents[fceil(t, fps)] = ("window", None)
        for i, ln in enumerate(g.get("terminal_lines", [])):
            self.accents[fceil(ln["t"], fps)] = ("line", i)
        self.spike_frames = sorted(set(self.hits) | set(self.accents))
        ts = g.get("tape_stop") or {}
        self.tape_stop = (fceil(ts["t0"], fps), fceil(ts["t1"], fps)) if ts else None

    def segment(self, n):
        for s in self.segments:
            if s.n0 <= n < s.n1:
                return s
        return None

    def spike(self, n):
        """-> (spike 0..1, frames since the most recent hit or None, that hit's frame)."""
        best, age, hf = 0.0, None, None
        for h in self.spike_frames:
            if h > n:
                break
            a = n - h
            if a < len(ENV) and ENV[a] >= best:
                best, age, hf = ENV[a], a, h
        return best, age, hf


class Plan:
    def __init__(self, cues, seed=DEFAULT_SEED):
        self.cues = cues
        self.seed = seed
        self.fps = int(cues["fps"])
        self.w, self.h = int(cues["width"]), int(cues["height"])
        self.nframes = int(cues["frames"])
        self.windows = [Window(k, cues[k], self.fps) for k in ("g1", "g2") if k in cues]
        for w in self.windows:
            for s in w.segments:
                s.sched = make_schedule(self, w, s)

    def window(self, n):
        for w in self.windows:
            if w.n0 <= n < w.n1:
                return w
        return None

    def stutter(self, n):
        for w in self.windows:
            for i, st in enumerate(w.stutters):
                if st.n0 <= n < st.n1:
                    return i, st
        return None, None

    def src_index(self, n):
        _, st = self.stutter(n)
        return st.map(n)[0] if st else n

    PROTECTED_KINDS = ("flash", "black")

    def protected(self, n):
        """Frames the flash guard must never alter: pass-through and designed flash/black."""
        w = self.window(n)
        if w is None:
            return True
        s = w.segment(n)
        return s is not None and s.kind in self.PROTECTED_KINDS

    def reserved_transitions(self):
        """Worst-case large-area transitions caused by protected frames, known in advance:
        into the white flash (+), into black (-), and out of a window that ends black (+)."""
        res = {}
        for w in self.windows:
            for s in w.segments:
                if s.kind == "flash":
                    res[s.n0] = 1
                elif s.kind == "black":
                    res[s.n0] = -1
            if w.segments and w.segments[-1].kind == "black":
                res[w.n1] = 1
        return res

    def guard_span(self, n):
        """First frame the flash guard must observe so that its decisions for frame n match a
        full render (a 1 s history before the window)."""
        for w in self.windows:
            if w.n0 - self.fps < n < w.n1 + self.fps:
                return max(0, w.n0 - self.fps)
        return n

    def ref_frames(self, n):
        """Extra clean frames a glitch frame may read (neighbours, stale inserts)."""
        w = self.window(n)
        if not w:
            return set()
        s = self.src_index(n)
        refs = {i for i in range(s - 3, s + 2)}
        seg = w.segment(n)
        if seg is not None and seg.kind == "crescendo":
            refs |= set(insert_sources(self))
        if seg is not None and seg.kind == "flash":
            refs.add(seg.n0 - 1)
        return {max(0, min(self.nframes - 1, r)) for r in refs}


# ============================================================================ scheduling
LEADS = ("mosh", "mosh_prog", "mosh_rst", "blocks", "sort", "tear", "pixel", "static")


def lead_weights(kind, I):
    if kind == "corrupt":
        return dict(mosh=1.25, mosh_prog=0.9, mosh_rst=0.85, blocks=1.0, sort=0.35 + 1.0 * I,
                    tear=0.8, pixel=0.25 + 0.5 * I)
    if kind == "crescendo":
        return dict(mosh=1.1, mosh_prog=0.8, mosh_rst=0.8, blocks=0.9, sort=0.5 + 0.9 * I,
                    tear=0.8, pixel=0.5, static=0.1 + 0.9 * I)
    return dict(mosh=1, blocks=1, tear=1)


def make_schedule(plan, win, seg):
    """Per-frame 'shot list' for a segment: which effect leads (never the same twice in a
    row) plus a different second effect for compound frames, breather frames, inversion
    strobes, stale-frame inserts and static 'lock' frames. Seeded from the segment's first
    frame, so range renders match full renders exactly.

    Full-frame flashes (whole-picture inversions, bright inserts) are placed by design so that
    each window stays under 3 large-area flashes per second, including the white flash; the
    fast strobes are band inversions covering < 25% of the screen. FlashGuard enforces it."""
    rng = gl.frame_rng(plan.seed, seg.n0, "sched:" + seg.kind)
    out, prev, phase = [], None, 0.0
    hitset = set(win.spike_frames)
    L = seg.len

    def at(q):
        return int(round(q * (L - 1)))

    full_inv, inserts, locks = set(), {}, set()
    if seg.kind == "warp":            # + the SLAM:cut inversion on the first frame
        full_inv = {at(0.38), at(0.75)}
    elif seg.kind == "crescendo":     # insert 0 = birthday card (bright), 1 = launch screen (dark)
        inserts = {at(0.16): 0, at(0.32): 1, at(0.58): 1, at(0.70): 0, at(0.86): 1}
        full_inv = {at(0.45)}
    elif seg.kind == "static":        # the signal locks back in for a frame, twice
        locks = {at(0.30) + int(rng.integers(-1, 2)), at(0.55) + int(rng.integers(-1, 2))}
    for k in range(L):
        n = seg.n0 + k
        I = seg.intensity(n)
        p = seg.progress(n)
        wts = lead_weights(seg.kind, I)
        names = list(wts)
        w = np.array([wts[x] for x in names], float)
        if prev in names and len(names) > 1:
            w[names.index(prev)] = 0.0
        lead = names[int(rng.choice(len(names), p=w / w.sum()))]
        w2 = np.array([wts[x] for x in names], float)
        w2[names.index(lead)] = 0.0
        if "static" in names:
            w2[names.index("static")] = 0.0
        second = names[int(rng.choice(len(names), p=w2 / w2.sum()))] if w2.sum() > 0 else None
        near_hit = any(0 <= n - h <= 1 for h in hitset)
        breathe = (not near_hit) and rng.random() < (0.34 * (1 - I) + 0.04)
        e = {"lead": lead, "second": second, "breathe": breathe, "invert": None,
             "insert": inserts.get(k), "lock": k in locks}
        if seg.kind == "crescendo":
            # band-inversion strobe accelerating 2.5 Hz -> 15 Hz; one designed full-frame strobe
            inc = (2.5 + 12.5 * p ** 1.4) / plan.fps
            phase += inc
            if int(phase) != int(phase - inc):
                e["invert"] = "band"
            if k in full_inv:
                e["invert"] = "full"
            e["breathe"] = False
        elif seg.kind == "warp":
            if k in full_inv:
                e["invert"] = "full"
            elif k > 0 and rng.random() < (0.1 + 0.3 * I) and not (out and out[-1]["invert"]):
                e["invert"] = "band"
        out.append(e)
        prev = lead
    return out


def insert_sources(plan):
    """Clean frames flashed (corrupted) during the crescendo: the birthday card just before
    g2 and the launch screen just before g1 -- both 'fake celebrations' tear apart."""
    srcs = []
    if "g2" in plan.cues:
        srcs.append(max(0, fceil(plan.cues["g2"]["start"] - 0.3, plan.fps)))
    if "g1" in plan.cues:
        srcs.append(max(0, fceil(plan.cues["g1"]["start"] - 0.45, plan.fps)))
    return srcs


# ================================================================================ context
class Ctx:
    def __init__(self, plan, reader, n):
        self.plan, self.reader, self.n = plan, reader, n
        self.fps, self.W, self.H = plan.fps, plan.w, plan.h
        self.t = n / plan.fps
        self.win = plan.window(n)
        self.seg = self.win.segment(n) if self.win else None
        self.kind = self.seg.kind if self.seg else "none"
        self.p = self.seg.progress(n) if self.seg else 0.0
        self.I = self.seg.intensity(n) if self.seg else 0.0
        self.k = n - self.seg.n0 if self.seg else 0
        self.spike, self.age, self.hit_n = self.win.spike(n) if self.win else (0.0, None, None)
        self.accent = self.win.accents.get(self.hit_n) if (self.win and self.hit_n is not None) else None
        si, st = plan.stutter(n)
        self.stutter = None
        self.src_idx = n
        if st is not None:
            self.src_idx, loop = st.map(n)
            self.stutter = (si, loop)
        self.sched = self.seg.sched[self.k] if (self.seg and self.seg.sched) else {}
        self.fx = []

    def rng(self, tag):
        return gl.frame_rng(self.plan.seed, self.n, tag)

    def src(self, idx):
        idx = max(0, min(self.plan.nframes - 1, int(idx)))
        return self.reader.get(idx)

    def hit_order(self):
        """Index of the current hit among the hits of this segment (for designed hit styles)."""
        if self.hit_n is None or not self.seg:
            return 0
        hs = [h for h in self.win.spike_frames if self.seg.n0 <= h < self.seg.n1]
        return hs.index(self.hit_n) if self.hit_n in hs else 0


# ================================================================================ recipes
def _split(img, c, d, rng, vert=0.12, scale=0.0):
    """Chromatic split of magnitude d px with a little vertical error and radial scale."""
    if d < 0.5:
        return img
    ang = rng.normal(0, vert)
    return gl.rgb_split(img, rdx=d, rdy=d * ang, bdx=-d * 0.85, bdy=-d * ang * 0.7,
                        rscale=1.0 + scale, bscale=1.0 - scale * 0.8)


def _band_invert(img, rng, H, total=0.2):
    """Inversion strobe confined to 1-2 horizontal bands (< 25% of the screen in total, so it
    is not a large-area flash)."""
    out = img
    nb = 1 + int(rng.random() < 0.5)
    for _ in range(nb):
        bh = max(8, int(H * total / nb * rng.uniform(0.55, 1.0)))
        y0 = int(rng.uniform(0, H - bh))
        out = gl.invert(out, y0=y0, y1=y0 + bh)
    return out


def _lead(img, c, lead, E, rng):
    """One dominant corruption effect at strength E (0..1)."""
    W, H = c.W, c.H
    out = img
    if lead == "mosh":
        out = gl.jpeg_datamosh(img, rng, hits=1 + int(5 * E), quality=int(62 - 42 * E),
                               scale=float(rng.choice([1.0, 0.5, 0.5])), at=gl.lerp(0.8, 0.12, E), spread=0.35,
                               mode="baseline", orient=int(rng.choice([0, 0, 1, 2, 3])))
    elif lead == "mosh_prog":
        out = gl.jpeg_datamosh(img, rng, hits=2 + int(10 * E), quality=int(70 - 35 * E), scale=1.0,
                               at=0.05, spread=0.1, mode="progressive")
    elif lead == "mosh_rst":
        sc = float(rng.choice([1.0, 0.5]))
        out = gl.jpeg_datamosh(img, rng, hits=4 + int(22 * E), quality=int(55 - 30 * E), scale=sc,
                               at=0.05, spread=0.1, mode="baseline", rst=int(rng.choice([8, 16, 40])),
                               orient=int(rng.choice([0, 3])))
    elif lead == "blocks":
        out = gl.block_corrupt(img, rng, 8 + int(70 * E), block=16 * int(rng.choice([1, 1, 2])),
                               max_w=6 + int(14 * E), max_h=2 + int(4 * E))
    elif lead == "sort":
        # bands aimed at the picture's content, thresholds from the band's own luminance
        vertical = rng.random() < 0.4
        for _ in range(1 + int(2 * E)):
            a, b = gl.content_band(out, rng, rng.uniform(0.1, 0.2 + 0.35 * E), vertical=vertical)
            out = gl.pixel_sort(out, a, b, hi=int(rng.uniform(215, 256)), vertical=vertical,
                                reverse=rng.random() < 0.4, step=2, lo_pct=rng.uniform(30, 65))
    elif lead == "tear":
        out = gl.slice_shift(img, rng, 4 + int(10 * E), 120 + 520 * E, hmin=4, hmax=30 + int(120 * E),
                             chan_sep=0.55)
        if rng.random() < 0.6:
            y0 = int(rng.uniform(0, 0.7) * H)
            out = gl.interlace(out, rng.integers(8, 40) * (1 if rng.random() < 0.5 else -1),
                               y0, y0 + int(H * rng.uniform(0.1, 0.35)))
        if rng.random() < 0.5:
            out = gl.band_repeat(out, rng, 1 + int(3 * E))
    elif lead == "pixel":
        b = int(12 + 52 * E * rng.random())
        if rng.random() < 0.4:
            out = gl.pixelate(img, b)
        else:
            for _ in range(1 + int(3 * E)):
                y0 = int(rng.uniform(0, 0.8) * H)
                out = gl.pixelate(out, b, 0, y0, W, min(H, y0 + int(H * rng.uniform(0.1, 0.3))))
    elif lead == "static":
        noise = gl.tv_static(H, W, rng, c.t)
        out = gl.static_mix(img, noise, 0.3 + 0.4 * E)
        out = gl.vroll(out, int(rng.integers(0, H)), bar=int(20 + 40 * E))
    c.fx.append(lead)
    return out


def slam(img, c, style, rng):
    """Designed single-frame hits (the frame a glitch_hit lands on)."""
    W, H = c.W, c.H
    c.fx.append("SLAM:" + style)
    if style == "tear":          # the crash moment: picture tears between two frames
        other = c.src(c.src_idx - 3)
        out = gl.tear_mix(img, other, int(H * rng.uniform(0.42, 0.62)), dx=int(rng.choice([-1, 1]) * rng.uniform(90, 200)))
        out = gl.slice_shift(out, rng, 6, 260, 4, 46, chan_sep=0.6)
        out = gl.translate(out, rng.integers(-18, 19), rng.integers(-12, 13))
        out = gl.invert(out, y0=int(H * 0.62), y1=int(H * 0.62) + 26)
        return _split(out, c, 24, rng, scale=0.006)
    if style == "mosh":
        out = gl.jpeg_datamosh(img, rng, hits=7, quality=22, scale=0.5, at=0.18, spread=0.1,
                               mode="baseline", orient=int(rng.choice([0, 1])))
        out = gl.slice_shift(out, rng, 5, 340, 6, 70, chan_sep=0.5)
        return _split(out, c, 20, rng)
    if style == "invert":
        out = gl.invert(img)
        out = gl.slice_shift(out, rng, 9, 460, 8, 110, chan_sep=0.6)
        out = gl.posterize(out, 4)
        return _split(out, c, 30, rng, scale=0.01)
    if style == "sort":
        out = gl.pixel_sort(img, 0, W, lo=28, hi=255, vertical=True, reverse=rng.random() < 0.5, step=2)
        out = gl.channel_swap(out, (2, 0, 1))
        out = gl.posterize(out, 3)
        return _split(out, c, 14, rng)
    if style == "split":
        out = gl.zoom(img, 1.09, dx=rng.normal(0, 20), dy=rng.normal(0, 12))
        out = gl.interlace(out, 36, 0, H)
        out = gl.block_corrupt(out, rng, 30, block=32, max_w=8, max_h=3)
        return _split(out, c, 52, rng, vert=0.2, scale=0.02)
    if style == "total":
        out = gl.jpeg_datamosh(img, rng, hits=10, quality=18, scale=0.5, at=0.05, spread=0.05, mode="progressive")
        out = gl.pixel_sort(out, int(H * 0.3), int(H * 0.75), lo=20, hi=255, step=2)
        out = gl.invert(out, y0=int(H * 0.12), y1=int(H * 0.3))
        out = gl.block_corrupt(out, rng, 50, block=16, max_w=12, max_h=4)
        out = gl.slice_shift(out, rng, 8, 500, 6, 90, chan_sep=0.6)
        return _split(out, c, 38, rng, scale=0.015)
    if style == "pop":           # an error window pops: half-updated frame + tear
        prev = c.src(c.src_idx - 1)
        out = gl.tear_mix(img, prev, int(H * rng.uniform(0.3, 0.72)), dx=int(rng.normal(0, 40)))
        out = gl.slice_shift(out, rng, 5, 180, 5, 36, chan_sep=0.6)
        out = gl.block_corrupt(out, rng, 6, block=16, max_w=10, max_h=2, modes=("copy", "smear_v", "tint", "run"))
        out = gl.adjust(out, 1.08, 14)
        return _split(out, c, 12, rng)
    if style == "line":          # a terminal line appears
        li = c.accent[1] if c.accent else 0
        out = gl.slice_shift(img, rng, 3 + 2 * li, 60 + 50 * li, 3, 26, chan_sep=0.7)
        if li == 2:              # "found: 17 tutors" -- the reveal gets a one-frame inversion
            out = gl.invert(out)
        out = gl.adjust(out, 1.0, 18)
        return _split(out, c, 8 + 3 * li, rng)
    if style == "cut":           # the birthday song is cut: hard inverted tear
        out = gl.invert(img)
        out = gl.slice_shift(out, rng, 7, 380, 10, 120, chan_sep=0.6)
        out = gl.tear_mix(out, gl.invert(c.src(c.src_idx - 2)), int(H * 0.55), dx=140)
        return _split(out, c, 28, rng, scale=0.01)
    return img


G1_CORRUPT_HITS = ("mosh", "invert", "sort", "split", "total")


def r_freeze_stutter(img, c):
    rng = c.rng("freeze")
    I, s = c.I, c.spike
    if c.age == 0:
        return slam(img, c, "tear", rng)
    out = img
    if rng.random() < 0.25 + 0.3 * I:         # half-updated frame
        other = c.src(c.src_idx + int(rng.choice([-2, -1, 1])))
        out = gl.tear_mix(out, other, int(c.H * rng.uniform(0.2, 0.85)), dx=int(rng.normal(0, 25 * I)))
        c.fx.append("tearmix")
    if rng.random() < 0.55:                    # frozen picture jumps
        out = gl.translate(out, rng.normal(0, 7 * I + 10 * s), rng.normal(0, 3 * I + 5 * s))
        c.fx.append("jitter")
    out = gl.slice_shift(out, rng, 1 + int(3 * I + 6 * s), 30 + 140 * I + 260 * s, hmin=3,
                         hmax=int(18 + 50 * s), chan_sep=0.3)
    if rng.random() < 0.3:
        out = gl.block_corrupt(out, rng, 2 + int(6 * I), modes=("smear_v", "copy", "dc"), max_w=8, max_h=2)
    out = _split(out, c, 3 + 9 * I + 18 * s, rng, scale=0.003)
    return gl.scanlines(out, 0.08 + 0.08 * I)


def r_corrupt(img, c):
    rng = c.rng("corrupt")
    I, s = c.I, c.spike
    E = min(1.0, I + 0.45 * s)
    if c.age == 0:
        return slam(img, c, G1_CORRUPT_HITS[c.hit_order() % len(G1_CORRUPT_HITS)], rng)
    sch = c.sched
    out = img
    left = c.seg.len - 1 - c.k
    # the music tape-stops: the picture sags (and drains a little)
    ts = c.win.tape_stop
    drain = 0.0
    if ts and ts[0] <= c.n < ts[1]:
        drain = (c.n - ts[0]) / max(1, ts[1] - ts[0] - 1)
        out = gl.melt(out, gl.frame_rng(c.plan.seed, ts[0], "melt"), drain ** 1.5, max_px=120)
        c.fx.append("melt")
    if sch.get("breathe") and left > 2:
        out = gl.slice_shift(out, rng, 1 + int(2 * rng.random()), 90, 3, 20)
        out = _split(out, c, 4 + 6 * I, rng)
        c.fx.append("breathe")
        return gl.scanlines(out, 0.12)
    lead = sch.get("lead", "mosh")
    out = _lead(out, c, lead, E, rng)
    # near the top a second, different corruption lands on top of the first
    second = sch.get("second")
    if second and (left < 2 or (E > 0.7 and rng.random() < (E - 0.7) / 0.3 * 0.9)):
        out = _lead(out, c, second, 0.85 * E, rng)
    if "blocks" not in (lead, second) and rng.random() < 0.65:
        out = gl.block_corrupt(out, rng, 3 + int(14 * E), max_w=10, max_h=3)
    if lead != "tear":
        out = gl.slice_shift(out, rng, 2 + int(5 * E), 60 + 260 * E, hmin=3, hmax=50, chan_sep=0.4)
    if E > 0.72 and rng.random() < 0.7:
        out = gl.posterize(out, 6 - int(3.5 * (E - 0.72) / 0.28), dither=rng.random() < 0.3)
        c.fx.append("post")
    if rng.random() < 0.45:
        out = gl.chroma_bleed(out, 10 + 30 * E, 3 + int(8 * E))
    if left < 2:
        # the crash: the decoder gives up below a seam that climbs up the frame
        seam = c.H * (0.6 if left == 1 else 0.36) + rng.normal(0, 24)
        out = gl.decoder_death(out, rng, seam, stale=c.src(c.src_idx - 2))
        c.fx.append("death")
    if drain > 0:
        out = gl.adjust(gl.desaturate(out, 0.3 * drain), 1.0 - 0.1 * drain, 0)
    out = _split(out, c, 5 + 16 * E, rng, scale=0.004 * E)
    return gl.scanlines(out, 0.1 + 0.1 * E)


def r_errors(img, c):
    """Light: the DOM's error windows must stay readable. Spikes when a window pops."""
    rng = c.rng("errors")
    I, s = c.I, c.spike
    if c.age == 0:
        return slam(img, c, "pop", rng)
    out = img
    if s > 0.3:
        out = gl.slice_shift(out, rng, 1 + int(3 * s), 120 * s, hmin=3, hmax=24, chan_sep=0.5)
        c.fx.append("aftershock")
    elif rng.random() < 0.15:
        out = gl.slice_shift(out, rng, 1, 70, hmin=2, hmax=8)
        c.fx.append("tick")
    # slow tracking band rolling down the frame
    y = ((c.t - c.seg.t0) * 380) % (c.H + 160) - 80
    out = gl.tracking_band(out, rng, y, 26, 0.35)
    out = gl.chroma_bleed(out, 6, 2)
    out = _split(out, c, 2 + 4 * I + 7 * s, rng)
    return gl.scanlines(out, 0.14, phase=c.k * 0.5)


def r_static(img, c):
    """Analog signal loss: the picture loses vertical hold (rolls faster and faster) and
    horizontal sync (leans, tears), ghosts, loses colour and drowns in snow while the AGC
    pumps; twice the signal locks back in for a frame; then the CRT collapses into black."""
    rng = c.rng("static")
    k, L = c.k, c.seg.len
    I = c.I
    left = L - 1 - k
    lock = bool(c.sched.get("lock"))
    S = I * (0.45 if lock else 1.0)
    if S < 0.95:
        S = gl.clamp01(S + rng.normal(0, 0.06))
    pic = img
    if lock:
        c.fx.append("lock")
    else:
        if I > 0.38:
            pic = gl.vroll(pic, (k ** 1.7) * 3.4 * I, bar=44)
        skew = np.linspace(0, 1, c.H, dtype=np.float32) ** 2 * (70 * I) * math.sin(c.t * 7.0)
        pic = gl.remap_rows(pic, skew + rng.normal(0, 2 + 6 * I, c.H).astype(np.float32))
        pic = gl.slice_shift(pic, rng, 1 + int(4 * I), 40 + 160 * I, hmin=2, hmax=12)
    pic = gl.echo(pic, 22 + 30 * I, 0.35 * I)
    pic = gl.adjust(gl.desaturate(pic, 0.35 + 0.55 * I), 0.88 - 0.15 * I, 16 + 14 * I)
    noise = gl.tv_static(c.H, c.W, rng, c.t, bars=0.35 + 0.2 * I, contrast=2.6 + 0.8 * S)
    out = gl.static_mix(pic, noise, 0.2 + 0.8 * S)
    out = gl.adjust(out, 0.92 + 0.16 * rng.random(), 0)       # AGC pumping
    c.fx.append(f"static{S:.2f}")
    if left < 3:                                   # CRT power-off into the black segment
        out = gl.crt_collapse(out, (3 - left) / 3.0)
        c.fx.append("crt_off")
        return out
    return gl.scanlines(out, 0.1)


def r_black(img, c):
    c.fx.append("black")
    return np.zeros_like(img)


def r_warp(img, c):
    """Birthday card corrupts as the final note detunes: wobble, inversion flickers,
    stepped pixelation on each stutter repeat, slice tears."""
    rng = c.rng("warp")
    I, s = c.I, c.spike
    if c.age == 0:
        return slam(img, c, "cut", rng)
    out = img
    amp = 3 + 34 * I ** 1.4 + 20 * s
    out = gl.wave(out, amp, rng.uniform(160, 420), c.t * 11.0, amp2=amp * 0.35, wavelength2=rng.uniform(40, 90),
                  phase2=c.t * 23.0)
    c.fx.append("wave")
    if c.stutter is not None:
        loop = c.stutter[1]
        b = (10, 20, 36, 56)[min(loop, 3)]
        if loop == 0:
            y0 = int(c.H * rng.uniform(0.15, 0.45))
            out = gl.pixelate(out, b, 0, y0, c.W, y0 + int(c.H * 0.3))
        else:
            out = gl.pixelate(out, b)
        c.fx.append(f"pix{b}")
    elif rng.random() < 0.25 + 0.4 * I:
        y0 = int(c.H * rng.uniform(0, 0.7))
        out = gl.pixelate(out, int(8 + 30 * I), 0, y0, c.W, y0 + int(c.H * rng.uniform(0.1, 0.35)))
        c.fx.append("pixband")
    out = gl.slice_shift(out, rng, 2 + int(6 * I + 5 * s), 50 + 220 * I + 200 * s, hmin=4, hmax=70, chan_sep=0.45)
    inv = c.sched.get("invert")
    if inv == "full":
        out = gl.invert(out)
        c.fx.append("inv")
    elif inv == "band":
        out = _band_invert(out, rng, c.H, total=rng.uniform(0.12, 0.22))
        c.fx.append("invband")
    if rng.random() < 0.35 * I:
        out = gl.hue_rotate(out, rng.uniform(-60, 60))
        c.fx.append("hue")
    out = _split(out, c, 4 + 16 * I + 16 * s, rng, scale=0.005 * I)
    return gl.scanlines(out, 0.08 + 0.1 * I)


def r_terminal(img, c):
    """CRT terminal: phosphor glow + scanlines + slight instability; the typed lines must
    stay readable. Short spikes when each line appears."""
    rng = c.rng("terminal")
    I, s = c.I, c.spike
    if c.age == 0:
        out = slam(img, c, "line", rng)
        return gl.scanlines(gl.glow(out, 0.55, 40, 12), 0.2, period=4.0)
    out = gl.glow(img, 0.5 + 0.2 * I, 40, 12)
    if s > 0.3:
        out = gl.slice_shift(out, rng, 1 + int(3 * s), 90 * s, hmin=3, hmax=20, chan_sep=0.6)
        c.fx.append("aftershock")
    elif rng.random() < 0.08 + 0.3 * I:
        out = gl.slice_shift(out, rng, 1, 40 + 60 * I, hmin=2, hmax=10)
        c.fx.append("tick")
    # slow horizontal wobble: long smoothing so each text line moves as a unit (no shear)
    out = gl.row_jitter(out, rng, 0.8 + 1.4 * I, smooth=60)
    out = _split(out, c, 1.5 + 4 * I + 6 * s, rng)
    bar = ((c.t * 0.45) % 1.3 - 0.15) * c.H
    out = gl.tracking_band(out, rng, bar, 10, 0.12) if rng.random() < 0.3 else out
    return gl.scanlines(out, 0.18 + 0.1 * I, period=4.0, phase=c.k * 0.35)


def r_crescendo(img, c):
    """Escalate to total corruption: accelerating band-inversion strobe (plus one budgeted
    full-frame strobe), stale-frame flashes of the two 'fake celebrations', shake + zoom,
    creeping static, compound effects, and saturated macroblock chaos on the last frames."""
    rng = c.rng("crescendo")
    I, s = c.I, c.spike
    E = min(1.0, I + 0.4 * s)
    sch = c.sched
    final = c.k >= c.seg.len - 3            # last frames before the flash: total corruption
    src = img
    if sch.get("insert") is not None:
        ins = insert_sources(c.plan)
        if ins:
            src = c.src(ins[sch["insert"] % len(ins)])
            c.fx.append("insert")
    out = gl.translate(src, rng.normal(0, 3 + 22 * E), rng.normal(0, 2 + 12 * E))
    if rng.random() < 0.3 + 0.4 * E:
        out = gl.zoom(out, 1.0 + 0.02 + 0.09 * E * rng.random())
        c.fx.append("zoom")
    lead, second = sch.get("lead", "mosh"), sch.get("second")
    if final and lead == "static":            # keep the last frames digital and colourful
        lead, second = second or "mosh", None
    out = _lead(out, c, lead, E, rng)
    if second and (final or (E > 0.65 and rng.random() < (E - 0.65) / 0.35)):
        out = _lead(out, c, second, 0.85 * E, rng)
    if final or rng.random() < 0.5 + 0.4 * E:
        out = gl.block_corrupt(out, rng, 4 + int(30 * E), max_w=12, max_h=4, ref=c.src(c.src_idx - 2))
    out = gl.slice_shift(out, rng, 2 + int(9 * E), 80 + 420 * E, hmin=3, hmax=80, chan_sep=0.5)
    if E > 0.55:
        out = gl.posterize(out, 6 - int(4 * (E - 0.55) / 0.45), dither=rng.random() < 0.4)
    st = 0.3 if final else min(0.4, max(0.0, E - 0.5) * 0.9)
    if st > 0:
        out = gl.static_mix(out, gl.tv_static(c.H, c.W, rng, c.t), st)
    if final:
        # the last frames before the flash: saturated macroblock garbage, colour swings and a
        # radial chromatic burst -- digital chaos with energy (not just grey snow)
        j = c.k - (c.seg.len - 3)
        out = gl.block_corrupt(out, rng, 70 + 30 * j, block=16, max_w=10, max_h=3,
                               modes=("tint", "swap", "quant", "copy", "dc", "run"),
                               weights=(3, 3, 2, 2, 1, 1))
        if rng.random() < 0.6:
            out = gl.hue_rotate(out, rng.uniform(70, 150) * (1 if rng.random() < 0.5 else -1))
        out = _split(out, c, 30 + 14 * j, rng, vert=0.25, scale=0.02 + 0.012 * j)
        c.fx.append("total")
    inv = sch.get("invert")
    if inv == "full":
        out = gl.invert(out) if rng.random() < 0.7 else gl.invert(out, channels=(0, 2))
        c.fx.append("strobe")
    elif inv == "band":
        out = _band_invert(out, rng, c.H, total=rng.uniform(0.12, 0.22))
        c.fx.append("strobeband")
    out = _split(out, c, 6 + 34 * E, rng, vert=0.2, scale=0.012 * E)
    return gl.scanlines(out, 0.12 + 0.08 * E)


def r_flash(img, c):
    """White flash: 2 frames of pure white, then a faint burned-in negative ghost."""
    k = c.k
    c.fx.append("flash")
    if k <= 1:
        return np.full_like(img, 255)
    ghost_src = c.src(c.seg.n0 - 1)
    ghost = gl.posterize(gl.invert(ghost_src), 2)
    a = (1.0, 1.0, 0.95, 0.91, 0.88, 0.85)[min(k, 5)]
    return gl.white_flash(ghost, a)


def r_rewind(img, c):
    """The tape rewinds with the picture on. The film itself runs backwards in the source frames
    (src/main.js remaps the clock over cues.g2.rewind); this pass adds what a deck in reverse
    picture search shows: noise bars crawling up the picture and tearing the lines they cover,
    lines pulled sideways, smeared colour, head-switching noise along the bottom edge. All of it
    follows the tape's speed: full as the transport bites, thinning as it slows, and gone when
    it stops on the cohort dots -- the last frames are the clean picture, so the stop is clean."""
    rng = c.rng("rewind")
    rw = c.win.g.get("rewind") or {}
    p = c.p
    speed = (1.0 - p) ** max(0.0, float(rw.get("power", 1.8)) - 1.0)        # of the tape: 1 -> 0
    E = gl.clamp01(1.15 * speed) * (1.0 - gl.smoothstep(0.84, 1.0, p))
    if E <= 0.004:
        return img
    on = min(1.0, 6.0 * E)                  # what would otherwise leave a floor fades out with it
    out = img
    if c.k < 3:                             # the transport bites: the picture rolls once before it holds
        out = gl.vroll(out, c.H * (0.42, 0.2, 0.07)[c.k], bar=44)
        c.fx.append("roll")
    out = gl.chroma_bleed(out, width=6 + 18 * E, shift=int(round(2 + 7 * E)), sat=1.0 - 0.3 * E)
    out = gl.row_jitter(out, rng, (1.5 + 9 * E) * on, smooth=18, spikes=int(4 * E + rng.random()),
                        spike_amp=70 * E)
    nb = 4                                  # noise bars: evenly spaced, crawling up
    drift = c.t * 0.42
    for j in range(nb):
        y = ((j / nb - drift) % 1.0) * (c.H + 140) - 70
        hgt = (30 + 50 * E) * (0.75 + 0.5 * ((j * 37) % 10) / 10)
        out = gl.tracking_band(out, rng, y, hgt * on, strength=(0.35 + 0.65 * E) * on)
    c.fx.append("bars")
    if E > 0.12:
        out = gl.head_switch(out, rng, rows=int(10 + 14 * E), shift=int(18 + 30 * E))
        out = gl.dropouts(out, rng, int(1 + 7 * E), maxlen=260)
    out = _split(out, c, (1.5 + 5 * E) * on, rng)
    return gl.scanlines(out, (0.05 + 0.1 * E) * on, period=4.0, phase=c.k * 0.5)


def r_generic(img, c):
    rng = c.rng("generic")
    E = min(1.0, c.I + 0.5 * c.spike)
    out = gl.slice_shift(img, rng, 1 + int(6 * E), 40 + 300 * E, chan_sep=0.4)
    if E > 0.4:
        out = gl.block_corrupt(out, rng, int(30 * E))
    out = _split(out, c, 2 + 20 * E, rng)
    return gl.scanlines(out, 0.1 + 0.1 * E)


RECIPES = {
    "freeze_stutter": r_freeze_stutter,
    "corrupt": r_corrupt,
    "errors": r_errors,
    "static": r_static,
    "black": r_black,
    "warp": r_warp,
    "terminal": r_terminal,
    "crescendo": r_crescendo,
    "flash": r_flash,
    "rewind": r_rewind,
}


def process_frame(plan, reader, n):
    """-> (output RGB frame, log record or None). Pass-through outside the glitch windows."""
    c = Ctx(plan, reader, n)
    img = reader.get(c.src_idx)
    if c.win is None:
        return img, None
    fn = RECIPES.get(c.kind, r_generic) if c.seg else r_generic
    out = fn(img, c)
    out = np.ascontiguousarray(out, dtype=np.uint8)
    if out.shape != (plan.h, plan.w, 3):
        raise RuntimeError(f"recipe {c.kind} returned shape {out.shape} for frame {n}")
    rec = {"n": n, "t": round(c.t, 4), "win": c.win.name, "kind": c.kind, "I": round(c.I, 3),
           "spike": round(c.spike, 2), "src": c.src_idx, "fx": c.fx}
    return out, rec


# ======================================================================= flash guard
class FlashGuard:
    """Photosensitivity guard (Harding/Ofcom-style general-flash rule): at most `limit`
    opposing large-area luminance transitions (= limit/2 flashes) in any 1-second window.
    A glitch frame that would break the rule is blended toward the previous output frame
    just enough that it no longer causes a large-area transition. Protected frames
    (pass-through, designed white flash, black) are never altered, and the transitions they
    will cause are reserved in advance so the budget is kept free for them."""

    def __init__(self, plan, limit=6):
        self.plan, self.fps, self.limit = plan, plan.fps, limit
        self.reserved = plan.reserved_transitions()
        self.hist = []                     # [(frame, sign)] of recorded transitions
        self.prev_n = self.prev_y = self.prev_img = None
        self.acted = 0

    def active(self, n):
        return any(w.n0 - self.fps <= n < w.n1 + self.fps for w in self.plan.windows)

    def _violates(self, n, s):
        past = [(k, v) for (k, v) in self.hist if k > n - self.fps]
        for e in range(n, n + self.fps):
            lo = e - self.fps + 1
            seq = [v for (k, v) in past if k >= lo] + [s]
            seq += [self.reserved[r] for r in range(n + 1, e + 1) if r in self.reserved]
            if gl.opposing_count(seq) > self.limit:
                return True
        return False

    def process(self, n, img, protected):
        """-> (frame to output, blend factor applied or None)."""
        if self.prev_n is None or n != self.prev_n + 1:   # (re)start: no history to compare
            self.prev_n, self.prev_y, self.prev_img = n, gl.flash_luma(img), img
            return img, None
        y = gl.flash_luma(img)
        s = gl.flash_transition(self.prev_y, y)
        alpha = None
        if s and not protected and self._violates(n, s):
            ps = cv2.resize(self.prev_img, gl.FLASH_GRID, interpolation=cv2.INTER_AREA)
            cs = cv2.resize(img, gl.FLASH_GRID, interpolation=cv2.INTER_AREA)
            lo, hi = 0.0, 1.0
            for _ in range(8):
                mid = (lo + hi) / 2
                if gl.flash_transition(self.prev_y, gl.flash_luma(cv2.addWeighted(ps, 1 - mid, cs, mid, 0))):
                    hi = mid
                else:
                    lo = mid
            alpha = 0.92 * lo
            img = cv2.addWeighted(self.prev_img, 1 - alpha, img, alpha, 0)
            y = gl.flash_luma(img)
            s = gl.flash_transition(self.prev_y, y)
            self.acted += 1
        if s:
            self.hist.append((n, s))
            self.hist = [(k, v) for (k, v) in self.hist if k > n - 2 * self.fps]
        self.prev_n, self.prev_y, self.prev_img = n, y, img
        return img, alpha


class FlashAudit:
    """Read-only photosensitivity audit of everything that is output (also the DOM's own
    frames outside the glitch windows, which the engine never alters)."""

    def __init__(self, fps, limit=6):
        self.fps, self.limit = fps, limit
        self.prev, self.tr = None, {}

    def add(self, n, img):
        y = gl.flash_luma(img)
        if self.prev is not None and self.prev[0] == n - 1:
            s = gl.flash_transition(self.prev[1], y)
            if s:
                self.tr[n] = s
        self.prev = (n, y)

    def report(self):
        """-> (worst count in any 1 s window, [(first_end_frame, last_end_frame, worst)])"""
        if not self.tr:
            return 0, []
        worst, bad = 0, []
        for e in range(min(self.tr), min(max(self.tr) + self.fps, self.prev[0] + 1)):
            cnt = gl.opposing_count([self.tr.get(k, 0) for k in range(e - self.fps + 1, e + 1)])
            worst = max(worst, cnt)
            if cnt > self.limit:
                if bad and bad[-1][1] == e - 1:
                    bad[-1] = (bad[-1][0], e, max(bad[-1][2], cnt))
                else:
                    bad.append((e, e, cnt))
        return worst, bad


# ================================================================================== I/O
class FrameSource:
    """Threaded PNG reader with a small cache (stutters/ghosts re-read recent frames)."""

    def __init__(self, frames_dir, w, h, workers=2, keep=28):
        self.dir = Path(frames_dir)
        self.w, self.h = w, h
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.futs = OrderedDict()
        self.keep = keep

    def path(self, idx):
        return self.dir / f"f_{idx:05d}.png"

    def _load(self, idx):
        p = self.path(idx)
        a = cv2.imread(str(p), cv2.IMREAD_COLOR)
        if a is None:
            raise FrameError(f"cannot read frame {idx} ({p}): file missing or not a valid PNG")
        if a.shape[:2] != (self.h, self.w):
            raise FrameError(f"frame {idx} ({p}) is {a.shape[1]}x{a.shape[0]}, expected {self.w}x{self.h}")
        a = cv2.cvtColor(a, cv2.COLOR_BGR2RGB)
        a.setflags(write=False)
        return a

    def prefetch(self, idx):
        if idx not in self.futs:
            self.futs[idx] = self.pool.submit(self._load, idx)
            while len(self.futs) > self.keep:
                self.futs.popitem(last=False)

    def get(self, idx):
        self.prefetch(idx)
        self.futs.move_to_end(idx)
        return self.futs[idx].result()


def ffmpeg_cmd(out, w, h, fps, crf, preset):
    return ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-framerate", str(fps), "-i", "pipe:0",
            "-an",
            "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p",
            "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p", "-r", str(fps),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-movflags", "+faststart", str(out)]


def probe_frames(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets",
                        "-show_entries", "stream=nb_read_packets,width,height,r_frame_rate,pix_fmt",
                        "-of", "json", str(path)], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    s = json.loads(r.stdout)["streams"][0]
    return s


def die(msg):
    print(f"[glitch_post] ERROR: {msg}", file=sys.stderr, flush=True)
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", required=True, help="directory with clean frames f_%%05d.png")
    ap.add_argument("--cues", required=True, help="cues.json")
    ap.add_argument("--out", help="output mp4 (required in full mode)")
    ap.add_argument("--from", dest="t_from", type=float, help="range start (s, inclusive)")
    ap.add_argument("--to", dest="t_to", type=float, help="range end (s, exclusive)")
    ap.add_argument("--frames-out", help="also write processed PNGs here (f_%%05d.png)")
    ap.add_argument("--log", help="write per-glitch-frame decisions as JSON lines")
    ap.add_argument("--seed", type=lambda x: int(x, 0), default=DEFAULT_SEED,
                    help="glitch seed (default 0x%X); same seed + same frames = same output" % DEFAULT_SEED)
    ap.add_argument("--no-flash-guard", action="store_true",
                    help="disable the photosensitivity guard (max 3 large-area flashes per second)")
    ap.add_argument("--crf", type=int, default=16, help=argparse.SUPPRESS)
    ap.add_argument("--preset", default="slow", help=argparse.SUPPRESS)
    a = ap.parse_args()

    cues = json.loads(Path(a.cues).read_text())
    plan = Plan(cues, a.seed)
    fps, W, H = plan.fps, plan.w, plan.h
    range_mode = a.t_from is not None or a.t_to is not None
    n0 = 0 if a.t_from is None else max(0, fceil(a.t_from, fps))
    n1 = plan.nframes if a.t_to is None else min(plan.nframes, fceil(a.t_to, fps))
    if n1 <= n0:
        die(f"empty range: frames {n0}..{n1}")
    if not range_mode and not a.out:
        die("--out is required in full mode")
    if not a.out and not a.frames_out:
        die("nothing to do: give --out and/or --frames-out")
    frames_dir = Path(a.frames)
    if not frames_dir.is_dir():
        die(f"frames directory not found: {frames_dir}")

    # the flash guard needs ~1 s of history before a glitch window: a range that starts inside
    # one is processed from there (silently) so its output matches a full render exactly
    guard = None if a.no_flash_guard else FlashGuard(plan)
    warm0 = plan.guard_span(n0) if guard else n0

    # ---- every frame we will read must exist (fail loudly, before encoding anything)
    needed = set(range(n0, n1)) if not range_mode else set()
    for n in range(warm0, n1):
        needed.add(plan.src_index(n))
        needed |= plan.ref_frames(n)
    present = {p.name for p in frames_dir.glob("f_*.png") if p.stat().st_size > 0}
    missing = sorted(i for i in needed if f"f_{i:05d}.png" not in present)
    if missing:
        show = ", ".join(f"f_{i:05d}.png" for i in missing[:12])
        die(f"{len(missing)} required frame(s) missing or empty in {frames_dir}: {show}"
            f"{' ...' if len(missing) > 12 else ''}\n"
            f"  (range {n0}..{n1 - 1} = {n0 / fps:.3f}-{(n1 - 1) / fps:.3f}s; stutter sources and "
            f"glitch reference frames are included in this check)")

    if a.out and not shutil.which("ffmpeg"):
        die("ffmpeg not found on PATH")
    cv2.setNumThreads(2)
    reader = FrameSource(frames_dir, W, H)
    ff = None
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        ff = subprocess.Popen(ffmpeg_cmd(a.out, W, H, fps, a.crf, a.preset), stdin=subprocess.PIPE)
    fo = None
    writer = None
    if a.frames_out:
        fo = Path(a.frames_out)
        fo.mkdir(parents=True, exist_ok=True)
        writer = ThreadPoolExecutor(max_workers=1)
    pending = []
    logf = open(a.log, "w") if a.log else None

    total = n1 - n0
    t_start = last = time.time()
    g_times, p_times, softened = [], [], []
    audit = FlashAudit(fps)
    order = list(range(warm0, n1))
    print(f"[glitch_post] {'range' if range_mode else 'full'} mode: frames {n0}..{n1 - 1} "
          f"({n0 / fps:.3f}-{(n1 - 1) / fps:.3f}s), {sum(1 for n in range(n0, n1) if plan.window(n))} glitch frames"
          + (f" (+{n0 - warm0} warm-up frames for the flash guard)" if warm0 < n0 else ""), flush=True)
    try:
        for i, n in enumerate(order):
            for j in range(1, 5):
                if i + j < len(order):
                    reader.prefetch(plan.src_index(order[i + j]))
            t0 = time.perf_counter()
            out, rec = process_frame(plan, reader, n)
            if guard is not None and guard.active(n):
                out, alpha = guard.process(n, out, plan.protected(n))
                if rec is not None and alpha is not None:
                    rec["guard"] = round(alpha, 3)
                    rec["fx"].append("flashguard")
            dt = time.perf_counter() - t0
            if n < n0:
                continue                                   # warm-up frame: not output
            if rec is not None and "guard" in rec:
                softened.append(n)
            audit.add(n, out)
            (g_times if rec else p_times).append(dt)
            if rec:
                rec["ms"] = round(dt * 1000, 1)
                if logf:
                    logf.write(json.dumps(rec) + "\n")
            if ff:
                try:
                    ff.stdin.write(out.tobytes())
                except BrokenPipeError:
                    raise FrameError(f"ffmpeg exited early (code {ff.wait()}) at frame {n}")
            if writer:
                bgr = cv2.cvtColor(out, cv2.COLOR_RGB2BGR)
                pending.append(writer.submit(cv2.imwrite, str(fo / f"f_{n:05d}.png"), bgr,
                                             [cv2.IMWRITE_PNG_COMPRESSION, 1]))
                while len(pending) > 6:
                    pending.pop(0).result()
            now = time.time()
            done = n - n0 + 1
            if now - last > 5 or done == total:
                last = now
                rate = (i + 1) / (now - t_start)
                print(f"[glitch_post] {done}/{total} frames  {rate:.1f} fps  "
                      f"ETA {(len(order) - i - 1) / max(rate, 1e-6):.0f}s", flush=True)
    except BaseException as e:                       # never leave a truncated film behind
        if ff:
            ff.kill()
            ff.wait()
            Path(a.out).unlink(missing_ok=True)
        if isinstance(e, FrameError):
            die(str(e))
        raise
    finally:
        for p in pending:
            p.result()
        if logf:
            logf.close()
    if ff:
        ff.stdin.close()
        code = ff.wait()
        if code != 0:
            die(f"ffmpeg failed with exit code {code}")
    wall = time.time() - t_start
    if g_times:
        print(f"[glitch_post] glitch frames: {len(g_times)}, mean {1000 * np.mean(g_times):.0f} ms, "
              f"max {1000 * np.max(g_times):.0f} ms (effects only)")
    if p_times:
        print(f"[glitch_post] pass-through frames: {len(p_times)}, mean {1000 * np.mean(p_times):.1f} ms")
    if guard is not None:
        print(f"[glitch_post] flash guard: softened {len(softened)} frame(s)"
              + (f" {softened}" if softened else ""))
    worst, bad = audit.report()
    if not bad:
        print(f"[glitch_post] flash audit of the output: PASS (max {worst} opposing large-area "
              f"transitions in any 1 s; limit 6 = 3 flashes/s)")
    else:
        print(f"[glitch_post] WARNING flash audit: more than 3 large-area flashes per second in "
              f"{len(bad)} stretch(es) of the output -- check these with the scene owners:")
        for e0, e1, cnt in bad:
            print(f"    1-second windows ending {e0 / fps:.2f}-{e1 / fps:.2f}s: up to {cnt} opposing transitions "
                  f"({'inside' if any(plan.window(k) for k in range(e0 - fps + 1, e1 + 1)) else 'outside'} "
                  f"the glitch windows)")
    print(f"[glitch_post] wall time {wall:.1f}s")
    if a.out:
        s = probe_frames(a.out)
        if not s:
            die(f"could not probe {a.out}")
        got = int(s.get("nb_read_packets", -1))
        print(f"[glitch_post] wrote {a.out}: {got} frames, {s.get('width')}x{s.get('height')} "
              f"{s.get('pix_fmt')} @ {s.get('r_frame_rate')}")
        if got != total:
            Path(a.out).unlink(missing_ok=True)
            die(f"frame count mismatch: encoded {got}, expected {total} (output removed)")
    if fo:
        print(f"[glitch_post] wrote {total} PNGs to {fo}")


if __name__ == "__main__":
    main()
