#!/usr/bin/env python3
"""Review harness for the raster glitch engine (tools/glitch_post.py).

The real DOM frames don't exist yet, so this renders realistic STAND-IN frames
for 63-87 s (launch screen -> error windows -> birthday card -> terminal ->
black -> letter), runs the engine on both glitch windows and writes contact
sheets + preview mp4s for review.

    python3 tools/glitch_test.py                 # all stages
    python3 tools/glitch_test.py --stage frames  # only (re)render missing stand-ins (--force: all)
    python3 tools/glitch_test.py --stage run     # only run the engine (--no-mp4, --only g1|g2)
    python3 tools/glitch_test.py --stage sheets  # only rebuild contact sheets + flash report

Outputs
    out/test_frames/f_%05d.png            stand-in clean frames (63.0-87.0 s)
    out/glitch_review/frames/f_%05d.png   processed frames (review windows only)
    out/glitch_review/log_g1.jsonl ...    per-frame decisions from the engine
    out/glitch_review/sheet_g1_*.png      6x5 contact sheets with timestamps (+ FLASH marks)
    out/glitch_review/detail_g1.png ...   half-res sheets of key moments (picked from cues)
    out/glitch_review/flash_report.json   photosensitivity check of the processed frames
    out/glitch_review/preview_g1.mp4      63.5-68.5 s, engine's codec settings
    out/glitch_review/preview_g2.mp4      80.0-87.0 s
"""
import argparse
import json
import math
import subprocess
import sys
import time
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "node_modules" / "@fontsource"
DEJAVU_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
W, H, FPS = 1920, 1080, 30
# UI screenshot used as texture inside the launch screen's tilted browser frames (first hit wins;
# a drawn fake UI is used if none exists). Override with --texture.
TEXTURE_CANDIDATES = [
    *sorted((ROOT / "assets" / "ui").glob("*.png")),
    Path("/tmp/claude-0/-home-claude/331caa53-7cba-5bfe-8500-672e2c76573d/scratchpad/shots/current-dark-top.png"),
]

TEST_T0, TEST_T1 = 63.0, 87.0
REVIEW_RANGES = {"g1": (63.5, 68.5), "g2": (80.0, 87.0)}


# --------------------------------------------------------------------------- utils
@lru_cache(maxsize=None)
def font(family, weight, size):
    p = FONTS / family / "files" / f"{family}-latin-{weight}-normal.woff2"
    return ImageFont.truetype(str(p), size)


@lru_cache(maxsize=None)
def dejavu(size):
    return ImageFont.truetype(DEJAVU_MONO, size)


def hexc(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def vgrad(c0, c1, w=W, h=H):
    t = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    g = np.array(c0, np.float32) * (1 - t) + np.array(c1, np.float32) * t
    return np.broadcast_to(g, (h, w, 3)).copy()


def radial(img, cx, cy, r, color, alpha):
    """Additive soft radial light (float image)."""
    y, x = np.ogrid[:img.shape[0], :img.shape[1]]
    d = np.sqrt(((x - cx) / r) ** 2 + ((y - cy) / r) ** 2)
    a = np.clip(1.0 - d, 0, 1) ** 2 * alpha
    img += a[..., None] * np.array(color, np.float32)
    return img


def text_mask(text, fnt, spacing=0):
    """Tight L-mask for a single line of text (supports letter spacing)."""
    if spacing == 0:
        l, t, r, b = fnt.getbbox(text)
        m = Image.new("L", (r - l + 4, b - t + 4), 0)
        ImageDraw.Draw(m).text((2 - l, 2 - t), text, font=fnt, fill=255)
        return m
    widths = [fnt.getlength(ch) for ch in text]
    total = int(sum(widths) + spacing * (len(text) - 1)) + 8
    asc, desc = fnt.getmetrics()
    m = Image.new("L", (total, asc + desc + 8), 0)
    d = ImageDraw.Draw(m)
    x = 4
    for ch, wch in zip(text, widths):
        d.text((x, 4), ch, font=fnt, fill=255)
        x += wch + spacing
    bb = m.getbbox() or (0, 0, 1, 1)
    return m.crop(bb)


def paste_mask(canvas, mask, color, cx, cy, anchor="mm", alpha=1.0):
    """Alpha-composite a solid color through an L-mask onto a PIL RGB canvas."""
    w, h = mask.size
    if anchor == "mm":
        x, y = int(cx - w / 2), int(cy - h / 2)
    elif anchor == "lm":
        x, y = int(cx), int(cy - h / 2)
    else:  # "lt"
        x, y = int(cx), int(cy)
    if alpha < 1.0:
        mask = mask.point(lambda v: int(v * alpha))
    canvas.paste(color, (x, y, x + w, y + h), mask)
    return (x, y, w, h)


def glow_from_mask(mask, pad, sigma):
    """Blurred, padded copy of an L-mask (for glows)."""
    w, h = mask.size
    big = Image.new("L", (w + 2 * pad, h + 2 * pad), 0)
    big.paste(mask, (pad, pad))
    return big.filter(ImageFilter.GaussianBlur(sigma))


def load_texture(path=None):
    """RGB uint8 UI screenshot for the browser frames (or a drawn stand-in UI)."""
    for p in ([Path(path)] if path else TEXTURE_CANDIDATES):
        if p.exists():
            return np.asarray(Image.open(p).convert("RGB"))
    im = Image.new("RGB", (1440, 900), (22, 24, 40))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 1440, 120), fill=(28, 32, 62))
    d.text((600, 40), "DSBA Pulse", font=font("inter", 800, 40), fill=(235, 238, 255))
    for cx in (70, 736):
        for cy in (150, 780):
            d.rounded_rectangle((cx, cy, cx + 634, cy + 560), radius=12, fill=(32, 34, 54))
            d.text((cx + 32, cy + 70), "Advanced Statistics", font=font("inter", 700, 30), fill=(120, 130, 255))
            for k in range(8):
                d.text((cx + 32, cy + 130 + k * 46), "Access materials  ·  week %d notes" % (k + 1),
                       font=font("inter", 500, 20), fill=(110, 120, 230) if k % 2 else (170, 175, 190))
    return np.asarray(im)


def browser_frame(tex, w=900):
    """A dark browser window (title bar + URL pill) showing `tex`. -> RGB uint8."""
    th = int(tex.shape[0] * w / tex.shape[1])
    body = cv2.resize(tex, (w, th), interpolation=cv2.INTER_AREA)
    bar = 46
    im = Image.new("RGB", (w, th + bar), (14, 18, 44))
    im.paste(Image.fromarray(body), (0, bar))
    d = ImageDraw.Draw(im)
    for k, col in enumerate(("#ff5f57", "#febc2e", "#28c840")):
        d.ellipse((18 + k * 24, 16, 32 + k * 24, 30), fill=hexc(col))
    d.rounded_rectangle((w // 2 - 170, 10, w // 2 + 170, 36), radius=13, fill=(30, 36, 80))
    d.text((w // 2, 23), "pulse.dsba.app", font=font("jetbrains-mono", 500, 16), fill=(170, 180, 240), anchor="mm")
    d.rectangle((0, 0, w - 1, th + bar - 1), outline=(70, 84, 200), width=2)
    return np.asarray(im)


def warp_into(canvas, rgb, quad, opacity, glow_color=None, glow=0.0):
    """Perspective-warp `rgb` into the float canvas at `quad` (TL, TR, BR, BL) with opacity,
    plus an optional additive glow around its silhouette."""
    h, w = rgb.shape[:2]
    m = cv2.getPerspectiveTransform(np.float32([(0, 0), (w, 0), (w, h), (0, h)]), np.float32(quad))
    warped = cv2.warpPerspective(rgb, m, (W, H), flags=cv2.INTER_AREA).astype(np.float32)
    mask = cv2.warpPerspective(np.full((h, w), 255, np.uint8), m, (W, H), flags=cv2.INTER_LINEAR)
    a = (mask.astype(np.float32) / 255.0 * opacity)[..., None]
    canvas *= 1 - a
    canvas += warped * a
    if glow_color is not None and glow > 0:
        edge = cv2.GaussianBlur(mask, (0, 0), 26).astype(np.float32) / 255.0
        canvas += (edge * glow)[..., None] * np.array(glow_color, np.float32)


def add_light(canvas_np, mask_np, x, y, color, strength):
    """Additive colored light through a float mask (0..255) at (x, y) top-left."""
    h, w = mask_np.shape
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        return
    m = mask_np[y0 - y:y1 - y, x0 - x:x1 - x].astype(np.float32) / 255.0 * strength
    canvas_np[y0:y1, x0:x1] += m[..., None] * np.array(color, np.float32)


# ------------------------------------------------------------------ stand-in scenes
class StandIns:
    def __init__(self, cues, texture=None):
        self.c = cues
        self.texture = texture
        self._launch_bg = None
        self._bday_bg = None
        self._err_bg = None
        self.launch_click = cues["launch"]["click"]
        self.g1 = cues["g1"]
        self.g2 = cues["g2"]

    # ---------------------------------------------------------------- launch
    def launch_bg(self):
        if self._launch_bg is None:
            bg = vgrad(hexc("#05071a"), hexc("#0b1033"))
            radial(bg, 960, 760, 900, hexc("#2a3399"), 0.55)
            radial(bg, 960, 380, 700, hexc("#1a237e"), 0.35)
            # two 3D-tilted browser frames with the real UI, receding toward the centre
            frame = browser_frame(load_texture(self.texture))
            warp_into(bg, frame, [(-330, 170), (430, 270), (430, 800), (-330, 940)], 0.5,
                      hexc("#5c6bff"), 0.35)
            warp_into(bg, frame, [(1490, 270), (2250, 170), (2250, 940), (1490, 800)], 0.5,
                      hexc("#4de1ff"), 0.3)
            # faint perspective dot grid
            for gy in range(560, H, 38):
                k = (gy - 560) / (H - 560)
                step = int(40 + 50 * k)
                rad = 1 + int(2 * k)
                a = 25 + 70 * k
                for gx in range(-step * 30 + 960, W + step, step):
                    if 0 <= gx < W:
                        bg[max(0, gy - rad):gy + rad, max(0, gx - rad):gx + rad] += a * np.array((0.45, 0.55, 1.0))
            self._launch_bg = np.clip(bg, 0, 255)
            # static text
            self.m_label = text_mask("LAUNCHING TODAY", font("jetbrains-mono", 500, 30), spacing=10)
            self.m_title = text_mask("DSBA Pulse", font("inter", 900, 210), spacing=-6)
            self.m_title_glow = np.asarray(glow_from_mask(self.m_title, 60, 28))
            self.m_btn_text = text_mask("LAUNCH", font("inter", 800, 66), spacing=10)
            # button sprite (RGBA)
            bw, bh = 600, 160
            grad = np.zeros((bh, bw, 3), np.float32)
            xs = np.linspace(0, 1, bw, dtype=np.float32)[None, :, None]
            grad[:] = np.array(hexc("#5c6bff"), np.float32) * (1 - xs) + np.array(hexc("#4de1ff"), np.float32) * xs
            shape = Image.new("L", (bw, bh), 0)
            ImageDraw.Draw(shape).rounded_rectangle((0, 0, bw - 1, bh - 1), radius=80, fill=255)
            self.btn_shape = shape
            self.btn_rgb = grad
            self.btn_glow = np.asarray(glow_from_mask(shape, 120, 45))
        return self._launch_bg

    def render_launch(self, t, frozen=False):
        bg = self.launch_bg().copy()
        click = self.launch_click
        since = t - click
        # title glow + text
        tw, th = self.m_title.size
        add_light(bg, self.m_title_glow, 960 - tw // 2 - 60, 400 - th // 2 - 60, hexc("#5c6bff"), 0.9)
        # button glow pulses; boosted after the click
        pulse = 0.55 + 0.2 * math.sin(t * 2 * math.pi * 0.9)
        boost = 1.0 + (1.8 * math.exp(-max(0.0, since) * 2.5) if since >= 0 else 0.0)
        gw = self.btn_glow.shape[1]
        add_light(bg, self.btn_glow, 960 - gw // 2, 730 - self.btn_glow.shape[0] // 2,
                  hexc("#4de1ff"), pulse * boost * 0.9)
        # ripples after the click
        if since >= 0:
            for k, delay in enumerate((0.0, 0.28)):
                s = since - delay
                if 0 <= s < 1.4:
                    r = 300 + 1100 * (1 - math.exp(-s * 2.2))
                    a = (1 - s / 1.4) ** 1.5
                    ring = Image.new("L", (W, H), 0)
                    ImageDraw.Draw(ring).ellipse((960 - r, 730 - r * 0.55, 960 + r, 730 + r * 0.55),
                                                 outline=255, width=8 - 3 * k)
                    ring = ring.filter(ImageFilter.GaussianBlur(2))
                    bg += (np.asarray(ring, np.float32) / 255.0 * a * 0.8)[..., None] * np.array(hexc("#4de1ff"), np.float32)
        img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
        paste_mask(img, self.m_label, hexc("#4de1ff"), 960, 245)
        paste_mask(img, self.m_title, (255, 255, 255), 960, 400)
        # countdown "1"
        if 63.0 <= t < 63.75:
            a = 1.0 - max(0.0, (t - 63.35) / 0.4)
            sc = 1.0 + 0.25 * math.exp(-(t - 63.0) * 8)
            m = text_mask("1", font("inter", 900, int(120 * sc)))
            paste_mask(img, m, hexc("#4de1ff"), 960, 565, alpha=max(0.0, a))
        # button (pressed scale)
        sc = 1.0
        if 0 <= since < 0.25:
            sc = 0.93 + 0.07 * min(1.0, since / 0.25) ** 0.5
        bw, bh = int(600 * sc), int(160 * sc)
        btn = cv2.resize(self.btn_rgb, (bw, bh), interpolation=cv2.INTER_AREA)
        if since >= 0:
            btn = btn + 70 * math.exp(-since * 3)
        # light sweep
        xs = np.arange(bw, dtype=np.float32)[None, :]
        ys = np.arange(bh, dtype=np.float32)[:, None]
        sweep_x = ((t * 0.7) % 1.6 - 0.3) * bw
        band = np.exp(-(((xs + ys * 0.6) - sweep_x) / 40.0) ** 2) * 70
        btn = np.clip(btn + band[..., None], 0, 255).astype(np.uint8)
        shape = self.btn_shape.resize((bw, bh))
        bx, by = 960 - bw // 2, 730 - bh // 2
        img.paste(Image.fromarray(btn), (bx, by), shape)
        paste_mask(img, self.m_btn_text.resize((int(self.m_btn_text.size[0] * sc), int(self.m_btn_text.size[1] * sc))),
                   (255, 255, 255), 960, 730)
        d = ImageDraw.Draw(img)
        # cursor
        if t < click + 2.0:
            k = min(1.0, max(0.0, (t - 63.0) / 0.7))
            k = 1 - (1 - k) ** 3
            cx, cy = 1450 + (1010 - 1450) * k, 980 + (752 - 980) * k
            s = 1.0 if not (0 <= since < 0.12) else 0.85
            pts = [(0, 0), (0, 44), (11, 34), (19, 52), (27, 48), (19, 31), (34, 31)]
            pts = [(cx + px * s, cy + py * s) for px, py in pts]
            d.polygon(pts, fill=(255, 255, 255), outline=(10, 12, 30))
        # post-click status
        if since >= 0:
            dots = "." * (int(since * 6) % 4)
            m = text_mask("Launching" + dots, font("jetbrains-mono", 500, 30))
            paste_mask(img, m, (200, 210, 255), 870, 875, anchor="lm")
            prog = min(1.0, since / 2.0)
            d.rectangle((260, 990, 260 + int(1400 * prog), 994), fill=hexc("#4de1ff"))
            d.rectangle((260, 990, 1660, 994), outline=(40, 50, 110))
        return np.asarray(img)

    # ---------------------------------------------------------------- errors
    WINDOWS = [
        ("pulse.exe", "pulse.exe has stopped responding", "#ff3b5c"),
        ("system", "Unexpected file found: surprise.mp4", "#1a237e"),
        ("launcher", "Overriding launch sequence…", "#1a237e"),
        ("loader", "Loading the real reason we're here…", "#ff3b5c"),
        ("launch.cfg", "celebration.target = ???", "#1a237e"),
        ("pulse.exe", "Please do not close this window.", "#ff3b5c"),
    ]
    # scattered (not a tight cascade) so every message stays readable
    WIN_POS = [(150, 110), (960, 190), (330, 420), (1010, 520), (180, 730), (840, 770)]

    @lru_cache(maxsize=None)
    def window_sprite(self, i):
        title, msg, bar = self.WINDOWS[i]
        ww, wh = 800, 250
        im = Image.new("RGBA", (ww + 14, wh + 14), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle((14, 14, ww + 13, wh + 13), fill=(0, 0, 0, 140))  # hard shadow
        d.rectangle((0, 0, ww - 1, wh - 1), fill=(222, 222, 222, 255), outline=(0, 0, 0, 255), width=3)
        d.line((3, 3, ww - 4, 3), fill=(255, 255, 255, 255), width=2)
        d.rectangle((3, 3, ww - 4, 50), fill=hexc(bar) + (255,))
        d.text((18, 12), title, font=font("jetbrains-mono", 700, 26), fill=(255, 255, 255, 255))
        d.rectangle((ww - 46, 10, ww - 12, 44), fill=(222, 222, 222, 255), outline=(0, 0, 0, 255), width=2)
        d.text((ww - 38, 9), "x", font=font("jetbrains-mono", 700, 26), fill=(0, 0, 0, 255))
        # warning icon
        d.polygon([(70, 82), (30, 152), (110, 152)], fill=(255, 212, 0, 255), outline=(0, 0, 0, 255))
        d.text((62, 95), "!", font=font("jetbrains-mono", 800, 46), fill=(0, 0, 0, 255))
        # message (wrap at ~30 chars)
        words, lines, cur = msg.split(), [], ""
        for wd in words:
            if len(cur) + len(wd) + 1 > 30:
                lines.append(cur)
                cur = wd
            else:
                cur = (cur + " " + wd).strip()
        lines.append(cur)
        for k, ln in enumerate(lines):
            d.text((140, 80 + k * 40), ln, font=font("jetbrains-mono", 500, 30), fill=(10, 10, 10, 255))
        d.rectangle((ww - 170, wh - 62, ww - 30, wh - 20), fill=(222, 222, 222, 255), outline=(0, 0, 0, 255), width=3)
        d.text((ww - 118, wh - 58), "OK", font=font("jetbrains-mono", 700, 28), fill=(0, 0, 0, 255))
        return im

    def render_errors(self, t):
        if self._err_bg is None:
            base = self.render_launch(64.2).astype(np.float32)
            gray = base.mean(axis=2, keepdims=True)
            base = (base * 0.6 + gray * 0.4) * 0.42
            self._err_bg = np.clip(base, 0, 255).astype(np.uint8)
        img = Image.fromarray(self._err_bg.copy())
        times = self.g1["error_windows"]
        for i, tw in enumerate(times):
            if t < tw:
                continue
            age = t - tw
            spr = self.window_sprite(i % len(self.WINDOWS))
            sc = 0.86 + 0.14 * min(1.0, age / 0.07)
            if sc < 1.0:
                spr = spr.resize((int(spr.size[0] * sc), int(spr.size[1] * sc)))
            px, py = self.WIN_POS[i % len(self.WIN_POS)]
            x = px + int((1 - sc) * 400)
            y = py + int((1 - sc) * 125)
            img.paste(spr, (x, y), spr)
            if i == 3:  # progress bar in the "loading" window
                d = ImageDraw.Draw(img)
                prog = min(1.0, (t - tw) / 1.5)
                d.rectangle((x + 140, y + 170, x + 600, y + 200), fill=(255, 255, 255), outline=(0, 0, 0), width=2)
                d.rectangle((x + 143, y + 173, x + 143 + int(454 * prog), y + 197), fill=hexc("#1a237e"))
                d.text((x + 612, y + 168), f"{int(prog * 100)}%", font=font("jetbrains-mono", 700, 26), fill=(0, 0, 0))
        return np.asarray(img)

    # -------------------------------------------------------------- birthday
    PASTELS = ["#ff9ecb", "#ffe680", "#9ff0d0", "#c9b6ff", "#ffffff", "#ff7ab8"]

    def bday_bg(self):
        if self._bday_bg is None:
            bg = vgrad(hexc("#ffd3e8"), hexc("#e3d7ff"))
            radial(bg, 300, 200, 600, (40, 20, 10), 0.6)
            radial(bg, 1650, 900, 700, (-20, 10, 20), 0.6)
            img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
            d = ImageDraw.Draw(img)
            # card
            sh = Image.new("L", (W, H), 0)
            ImageDraw.Draw(sh).rounded_rectangle((330, 150, 1590, 990), radius=60, fill=110)
            sh = sh.filter(ImageFilter.GaussianBlur(30))
            img.paste((150, 80, 140), (0, 0), sh)
            d.rounded_rectangle((320, 130, 1600, 970), radius=60, fill=(255, 252, 250), outline=hexc("#ffc2df"), width=6)
            # cake
            d.rounded_rectangle((760, 640, 1160, 800), radius=26, fill=hexc("#ff9ecb"))
            d.rounded_rectangle((800, 560, 1120, 660), radius=22, fill=hexc("#ffe680"))
            for k in range(9):
                x = 770 + k * 44
                d.ellipse((x, 625, x + 40, 665), fill=(255, 255, 255))
            d.rounded_rectangle((720, 790, 1200, 815), radius=12, fill=hexc("#c9b6ff"))
            for k in range(5):
                x = 850 + k * 55
                d.rectangle((x, 505, x + 14, 562), fill=hexc("#9ff0d0" if k % 2 else "#c9b6ff"))
            sig = text_mask("Love, the DSBA tutors & students", font("fredoka", 500, 44))
            paste_mask(img, sig, hexc("#b05a8c"), 960, 900)
            self._bday_bg = np.asarray(img)
            rng = np.random.default_rng(7)
            self.confetti = [(rng.uniform(0, W), rng.uniform(0, H), rng.uniform(120, 260), rng.uniform(10, 40),
                              rng.uniform(0, 6.28), rng.integers(len(self.PASTELS)), rng.uniform(1, 4))
                             for _ in range(150)]
        return self._bday_bg

    def render_birthday(self, t):
        img = Image.fromarray(self.bday_bg().copy())
        d = ImageDraw.Draw(img)
        s = t - 68.0
        # balloons (behind the title, on the sides)
        for k, (bx, col) in enumerate([(150, "#ff9ecb"), (260, "#c9b6ff"), (1660, "#9ff0d0"), (1770, "#ffe680")]):
            by = 300 + 40 * math.sin(s * 1.6 + k) + (k % 2) * 120
            d.line((bx, by + 90, bx + 10 * math.sin(s + k), by + 330), fill=(160, 120, 150), width=3)
            d.ellipse((bx - 70, by - 90, bx + 70, by + 90), fill=hexc(col), outline=(255, 255, 255), width=4)
            d.ellipse((bx - 40, by - 60, bx - 15, by - 25), fill=(255, 255, 255))
        # candle flames
        for k in range(5):
            x = 857 + k * 55
            fl = 1.0 + 0.18 * math.sin(t * 17 + k * 2.1) + 0.1 * math.sin(t * 29 + k)
            d.ellipse((x - 9 * fl, 470 - 26 * fl, x + 9 * fl, 505), fill=(255, 190, 60))
            d.ellipse((x - 4, 486 - 10 * fl, x + 4, 503), fill=(255, 250, 200))
        # title (scrambles during g2)
        line1, line2 = "HAPPY BIRTHDAY,", "COOL ADMIN!"
        if t >= 80.5:
            rng = np.random.default_rng(int(t * 30))
            k = min(1.0, (t - 80.5) / 0.9)
            glyphs = "#@%&$!?*<>/\\"
            l1 = list(line1)
            for i in range(6, 11):  # BIRTH -> blocks
                if rng.random() < k * 1.3:
                    l1[i] = "█" if (k > 0.75 or rng.random() < 0.5) else glyphs[rng.integers(len(glyphs))]
            if k > 0.75:
                l1 = list("HAPPY ████DAY")
            line1 = "".join(l1)
            l2 = list(line2)
            for i in range(len(l2)):
                if l2[i] != " " and rng.random() < k * 0.6:
                    l2[i] = glyphs[rng.integers(len(glyphs))]
            line2 = "".join(l2)
        f = font("fredoka", 700, 128)
        for text, y, col in ((line1, 270, "#ff4f9d"), (line2, 400, "#8a5cff")):
            if "█" in text or any(ch in "#@%&$!?*<>/\\" for ch in text):
                # per-char draw with a fallback font for the block glyphs
                widths = [f.getlength(ch) if ch != "█" else 70 for ch in text]
                x = 960 - sum(widths) / 2
                for ch, wch in zip(text, widths):
                    if ch == "█":
                        d.rectangle((x + 4, y - 50, x + wch - 4, y + 52), fill=hexc(col))
                    else:
                        d.text((x, y), ch, font=f, fill=hexc(col), anchor="lm")
                    x += wch
            else:
                d.text((960, y), text, font=f, fill=hexc(col), anchor="mm")
        # confetti (in front)
        for (x0, y0, vy, sway, ph, ci, spin) in self.confetti:
            y = (y0 + vy * s) % (H + 60) - 30
            x = x0 + sway * math.sin(s * 2 + ph)
            a = s * spin + ph
            ca, sa = math.cos(a), math.sin(a)
            pts = [(x + px * ca - py * sa, y + px * sa + py * ca) for px, py in ((-9, -5), (9, -5), (9, 5), (-9, 5))]
            d.polygon(pts, fill=hexc(self.PASTELS[ci]))
        # SURPRISE! burst at the start
        if 68.0 <= t < 68.4:
            k = (t - 68.0) / 0.4
            m = text_mask("SURPRISE!", font("fredoka", 700, int(250 * (1.15 - 0.15 * k))))
            img2 = Image.new("RGB", (W, H), hexc("#ff9ecb"))
            paste_mask(img2, m, (255, 255, 255), 960, 540)
            return np.asarray(img2)
        return np.asarray(img)

    # -------------------------------------------------------------- terminal
    def render_terminal(self, t):
        bg = np.zeros((H, W, 3), np.float32) + np.array((3, 8, 5), np.float32)
        radial(bg, 960, 540, 1300, (6, 22, 12), 1.0)
        img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(img)
        fh = font("jetbrains-mono", 500, 30)
        d.text((150, 120), "celebration.sys  --  debug console  [pid 1706]", font=fh, fill=(30, 120, 70))
        d.line((150, 170, 1770, 170), fill=(20, 80, 45), width=2)
        f = font("jetbrains-mono", 600, 50)
        lines = self.g2["terminal_lines"]
        cols = ["#ff3b5c", "#39ff88", "#ff3b5c", "#39ff88"]
        cur_xy = None
        for i, ln in enumerate(lines):
            if t < ln["t"]:
                break
            nch = min(len(ln["text"]), int((t - ln["t"]) * 40) + 1)
            txt = ln["text"][:nch]
            y = 240 + i * 90
            d.text((150, y), txt, font=f, fill=hexc(cols[i % 4]))
            cur_xy = (150 + f.getlength(txt) + 8, y)
        if t >= 83.5:
            k = min(1.0, (t - 83.5) / 1.25)
            nb = int(round(28 * k))
            bar = "[" + "#" * nb + "-" * (28 - nb) + f"] {int(k * 100):3d}%"
            y = 240 + 4 * 90
            d.text((150, y), bar, font=f, fill=hexc("#39ff88"))
            cur_xy = (150 + f.getlength(bar) + 8, y)
        if cur_xy and (int(t * 4) % 2 == 0):
            d.rectangle((cur_xy[0], cur_xy[1] + 4, cur_xy[0] + 28, cur_xy[1] + 62), fill=hexc("#39ff88"))
        return np.asarray(img)

    # ---------------------------------------------------------------- letter
    def render_letter(self, t):
        bg = vgrad(hexc("#070a22"), hexc("#0d1440"))
        radial(bg, 960, 420, 900, (40, 30, 10), 0.8)
        img = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8))
        d = ImageDraw.Draw(img)
        for ln in self.c["letter"]["lines"]:
            if t < ln["t"]:
                break
            n = min(len(ln["text"]), int((t - ln["t"]) * self.c["letter"]["cps"]) + 1)
            d.text((360, 380), ln["text"][:n], font=font("caveat", 700, 120), fill=hexc("#ffd98a"))
            break  # only the first line is needed up to 87 s
        return np.asarray(img)

    # ---------------------------------------------------------------- router
    def render(self, n):
        t = n / FPS
        if t < 65.5:
            return self.render_launch(t)
        if t < 68.0:
            return self.render_errors(t)
        if t < 81.5:
            return self.render_birthday(t)
        if t < 84.8:
            return self.render_terminal(t)
        if t < 85.0:
            return np.full((H, W, 3), 255, np.uint8)
        if t < 86.5:
            return np.zeros((H, W, 3), np.uint8)
        return self.render_letter(t)


def make_frames(cues, out_dir, force=False, texture=None):
    out_dir.mkdir(parents=True, exist_ok=True)
    si = StandIns(cues, texture)
    n0, n1 = int(round(TEST_T0 * FPS)), int(round(TEST_T1 * FPS))
    t_start = time.time()
    made = 0
    for n in range(n0, n1 + 1):
        p = out_dir / f"f_{n:05d}.png"
        if p.exists() and not force:
            continue
        img = si.render(n)
        cv2.imwrite(str(p), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_PNG_COMPRESSION, 1])
        made += 1
        if made % 60 == 0:
            print(f"  stand-ins: {made} frames ({time.time() - t_start:.0f}s)", flush=True)
    print(f"stand-ins: wrote {made} frames to {out_dir} in {time.time() - t_start:.1f}s")


# --------------------------------------------------------------------- engine run
def run_engine(cues_path, frames_dir, review_dir, mp4=True, only=None):
    review_dir.mkdir(parents=True, exist_ok=True)
    fo = review_dir / "frames"
    for name, (a, b) in REVIEW_RANGES.items():
        if only and name != only:
            continue
        cmd = [sys.executable, str(ROOT / "tools" / "glitch_post.py"),
               "--frames", str(frames_dir), "--cues", str(cues_path),
               "--from", str(a), "--to", str(b),
               "--frames-out", str(fo), "--log", str(review_dir / f"log_{name}.jsonl")]
        if mp4:
            cmd += ["--out", str(review_dir / f"preview_{name}.mp4")]
        print("$", " ".join(cmd), flush=True)
        subprocess.run(cmd, check=True)


# ------------------------------------------------------------------ contact sheets
def load_log(path):
    out = {}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip():
                r = json.loads(line)
                out[r["n"]] = r
    return out


def flash_report(review_dir):
    """Photosensitivity check on the processed review frames: large-area luminance
    transitions and the worst count of opposing transitions in any 1 s window
    (> 6 = more than 3 flashes per second = fail)."""
    sys.path.insert(0, str(ROOT / "tools"))
    import glitchlib as gl
    fo = review_dir / "frames"
    rep = {}
    for name, (a, b) in REVIEW_RANGES.items():
        n0, n1 = int(round(a * FPS)), int(round(b * FPS))
        prev, tr = None, {}
        for n in range(n0, n1):
            p = fo / f"f_{n:05d}.png"
            if not p.exists():
                prev = None
                continue
            y = gl.flash_luma(cv2.cvtColor(cv2.imread(str(p)), cv2.COLOR_BGR2RGB))
            if prev is not None:
                tr[n] = gl.flash_transition(prev, y)
            prev = y
        worst, at = 0, None
        for e in range(n0, n1):
            cnt = gl.opposing_count([tr.get(k, 0) for k in range(e - FPS + 1, e + 1)])
            if cnt > worst:
                worst, at = cnt, e
        marks = {k: v for k, v in tr.items() if v}
        rep[name] = {"max_opposing_transitions_in_1s": worst, "window_ending_at_frame": at,
                     "pass": worst <= 6, "transitions": {str(k): v for k, v in marks.items()}}
        print(f"flash check {name}: max {worst} opposing large-area transitions in 1 s "
              f"({worst / 2:.1f} flashes/s) -> {'PASS' if worst <= 6 else 'FAIL'}; transitions at "
              + " ".join(f"{k}{'+' if v > 0 else '-'}" for k, v in marks.items()))
    (review_dir / "flash_report.json").write_text(json.dumps(rep, indent=1))
    return rep


def contact_sheets(review_dir, cues, flash=None):
    fo = review_dir / "frames"
    ftr = {}
    for r in (flash or {}).values():
        ftr.update({int(k): v for k, v in r["transitions"].items()})
    lab_font = font("jetbrains-mono", 600, 15)
    cols, rows, tw, th = 6, 5, 320, 180
    pad, lab = 6, 40
    for name in ("g1", "g2"):
        log = load_log(review_dir / f"log_{name}.jsonl")
        g = cues[name]
        n0, n1 = int(round(g["start"] * FPS)) - 3, int(round(g["end"] * FPS)) + 3
        frames = list(range(n0, n1))
        for sheet_i in range(0, len(frames), cols * rows):
            chunk = frames[sheet_i:sheet_i + cols * rows]
            sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + lab + pad) + pad), (24, 24, 28))
            d = ImageDraw.Draw(sheet)
            for k, n in enumerate(chunk):
                p = fo / f"f_{n:05d}.png"
                x = pad + (k % cols) * (tw + pad)
                y = pad + (k // cols) * (th + lab + pad)
                if p.exists():
                    im = cv2.imread(str(p))
                    im = cv2.resize(im, (tw, th), interpolation=cv2.INTER_AREA)
                    sheet.paste(Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)), (x, y))
                r = log.get(n)
                t = n / FPS
                fl = {1: "  FLASH+", -1: "  FLASH-"}.get(ftr.get(n), "")
                if r:
                    l1 = f"{t:6.3f}s f{n} <{r['src']}{fl}"
                    l2 = f"{r['kind'][:9]} I{r['I']:.2f} s{r['spike']:.1f} {'/'.join(r.get('fx', []))[:24]}"
                else:
                    l1, l2 = f"{t:6.3f}s f{n}{fl}", "pass-through"
                col = (255, 210, 90) if (r and r["spike"] >= 0.99) else (210, 210, 220)
                d.text((x + 2, y + th + 2), l1, font=lab_font, fill=col)
                d.text((x + 2, y + th + 20), l2, font=lab_font, fill=(150, 160, 175))
            out = review_dir / f"sheet_{name}_{sheet_i // (cols * rows) + 1}.png"
            sheet.save(out)
            print("wrote", out)


def detail_sheet(review_dir, frames, name, notes=None):
    """2-column grid of half-res frames for close inspection."""
    fo = review_dir / "frames"
    hw, hh = W // 2, H // 2
    rows = -(-len(frames) // 2)
    sheet = Image.new("RGB", (hw * 2 + 6, (hh + 30 + 6) * rows), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    for k, n in enumerate(frames):
        p = fo / f"f_{n:05d}.png"
        if not p.exists():
            continue
        im = cv2.resize(cv2.imread(str(p)), (hw, hh), interpolation=cv2.INTER_AREA)
        x, y = (k % 2) * (hw + 6), (k // 2) * (hh + 30 + 6)
        sheet.paste(Image.fromarray(cv2.cvtColor(im, cv2.COLOR_BGR2RGB)), (x, y))
        note = f"  {notes[k]}" if notes else ""
        d.text((x + 4, y + hh + 5), f"{n / FPS:.3f}s  f{n}{note}", font=font("jetbrains-mono", 600, 18),
               fill=(230, 230, 230))
    out = review_dir / f"detail_{name}.png"
    sheet.save(out)
    print("wrote", out)


def key_frames(cues):
    """Moments worth a close look, derived from the cue data: {window: [(frame, note)]}."""
    def f(t):
        return int(math.ceil(t * FPS - 1e-6))

    def seg(g, kind):
        return next(s for s in g["segments"] if s["kind"] == kind)

    def at(s, q):  # same frame arithmetic as glitch_post.make_schedule
        n0, n1 = f(s["t0"]), f(s["t1"])
        return n0 + int(round(q * (n1 - n0 - 1)))

    g1, g2 = cues["g1"], cues["g2"]
    c1, s1 = seg(g1, "corrupt"), seg(g1, "static")
    w2, t2, c2, fl2 = seg(g2, "warp"), seg(g2, "terminal"), seg(g2, "crescendo"), seg(g2, "flash")
    corrupt_hits = [h for h in g1["hits"] if c1["t0"] <= h < c1["t1"]]
    return {
        "g1": [(f(g1["hits"][0]), "crash hit (tear)"), (f(corrupt_hits[2]), "corrupt hit"),
               (f(corrupt_hits[-1]), "corrupt peak hit"), (f(c1["t1"]) - 1, "decoder death"),
               (f(g1["error_windows"][-1]) + 4, "errors: readable"),
               (f(s1["t0"] + 0.45 * (s1["t1"] - s1["t0"])), "static")],
        "g2": [(f(g2["hits"][0]), "song cut (inversion)"), (at(w2, 0.38), "warp inversion"),
               (f(g2["terminal_lines"][2]["t"]) + 14, "terminal: readable"),
               (at(c2, 0.16), "crescendo insert"),
               (f(c2["t1"]) - 1, "total corruption"), (f(fl2["t0"]) + 3, "flash burn-in")],
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=["all", "frames", "run", "sheets"], default="all")
    ap.add_argument("--force", action="store_true", help="re-render stand-in frames even if present")
    ap.add_argument("--cues", default=str(ROOT / "cues.json"))
    ap.add_argument("--frames-dir", default=str(ROOT / "out" / "test_frames"))
    ap.add_argument("--review-dir", default=str(ROOT / "out" / "glitch_review"))
    ap.add_argument("--detail", default="", help="comma list of frame indices for a 2x2 detail sheet")
    ap.add_argument("--texture", help="UI screenshot (PNG) for the launch screen's browser frames")
    ap.add_argument("--no-mp4", action="store_true", help="skip the preview mp4s (faster iteration)")
    ap.add_argument("--only", choices=["g1", "g2"], help="run the engine on one window only")
    a = ap.parse_args()
    cues = json.loads(Path(a.cues).read_text())
    frames_dir, review_dir = Path(a.frames_dir), Path(a.review_dir)
    if a.stage in ("all", "frames"):
        make_frames(cues, frames_dir, force=a.force, texture=a.texture)
    if a.stage in ("all", "run"):
        run_engine(Path(a.cues), frames_dir, review_dir, mp4=not a.no_mp4, only=a.only)
    if a.stage in ("all", "sheets"):
        contact_sheets(review_dir, cues, flash_report(review_dir))
        for name, picks in key_frames(cues).items():
            detail_sheet(review_dir, [n for n, _ in picks], name, [s for _, s in picks])
        if a.detail:
            idx = [int(x) for x in a.detail.split(",") if x.strip()]
            detail_sheet(review_dir, idx, "custom")


if __name__ == "__main__":
    main()
