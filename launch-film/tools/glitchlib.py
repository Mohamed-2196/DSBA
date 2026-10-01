"""glitchlib -- reusable raster glitch effects (numpy + OpenCV + PIL).

Conventions
-----------
* Images are uint8 RGB arrays shaped (H, W, 3). Every function returns a NEW array and
  never modifies its input.
* Randomness comes only from the numpy Generator that is passed in (`rng`), so every
  effect is deterministic for a given seed. Use `frame_rng(seed, frame_index, tag)` to get
  an independent, reproducible stream per frame and per effect.
* "amount"/"strength" parameters are 0..1 unless noted; distances are in pixels.

Effect families
---------------
geometry   translate, zoom, remap_rows, wave, row_jitter, vroll, melt
channels   rgb_split, invert, channel_swap, desaturate, adjust, hue_rotate
digital    slice_shift, band_repeat, interlace, tear_mix, block_corrupt, ghost_blocks,
           pixelate, posterize, jpeg_datamosh (real byte-level JPEG corruption), pixel_sort,
           content_band (aim an effect at the picture's content), decoder_death
analog     scanlines, chroma_bleed, echo, tracking_band, head_switch, dropouts,
           tv_static, static_mix, glow, crt_collapse
tonal      white_flash
safety     flash_luma, flash_transition, opposing_count (photosensitive-flash metric)
"""
import io
import zlib
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = True  # decode damaged JPEGs instead of raising


# =============================================================================== helpers
def frame_rng(seed, n, tag=""):
    """Independent deterministic Generator for (seed, frame index, effect tag)."""
    return np.random.default_rng([int(seed) & 0xFFFFFFFF, int(n) & 0xFFFFFFFF,
                                  zlib.crc32(tag.encode("utf-8"))])


def clamp01(x):
    return 0.0 if x < 0 else 1.0 if x > 1 else float(x)


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(e0, e1, x):
    t = clamp01((x - e0) / (e1 - e0)) if e1 != e0 else float(x >= e1)
    return t * t * (3 - 2 * t)


@lru_cache(maxsize=4)
def _grid(h, w):
    mx, my = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return mx, my


@lru_cache(maxsize=4)
def _solid(h, w, v):
    a = np.full((h, w, 3), v, np.uint8)
    a.setflags(write=False)
    return a


def _ri(x):
    return int(round(float(x)))


# ============================================================================== geometry
def translate(img, dx, dy, fill=0):
    """Integer shift; exposed area filled with `fill` (signal displaced in the frame)."""
    dx, dy = _ri(dx), _ri(dy)
    h, w = img.shape[:2]
    out = np.empty_like(img)
    out[:] = fill
    if abs(dx) >= w or abs(dy) >= h:
        return out
    ys, yd = (slice(0, h - dy), slice(dy, h)) if dy >= 0 else (slice(-dy, h), slice(0, h + dy))
    xs, xd = (slice(0, w - dx), slice(dx, w)) if dx >= 0 else (slice(-dx, w), slice(0, w + dx))
    out[yd, xd] = img[ys, xs]
    return out


def zoom(img, scale, cx=None, cy=None, dx=0.0, dy=0.0):
    """Scale about (cx, cy) (default centre) plus an offset; reflected borders."""
    h, w = img.shape[:2]
    cx = w / 2 if cx is None else cx
    cy = h / 2 if cy is None else cy
    m = np.float32([[scale, 0, (1 - scale) * cx + dx], [0, scale, (1 - scale) * cy + dy]])
    return cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)


def remap_rows(img, dx_rows, dy=None, border=cv2.BORDER_REFLECT_101):
    """Shift each row y horizontally by dx_rows[y] px (content moves right for +dx).
    Optional dy: (H,W) or (H,1) vertical displacement (content moves down for +dy)."""
    h, w = img.shape[:2]
    mx, my = _grid(h, w)
    map_x = mx - np.asarray(dx_rows, np.float32).reshape(h, 1)
    map_y = my if dy is None else (my - np.asarray(dy, np.float32))
    return cv2.remap(img, map_x, map_y, cv2.INTER_LINEAR, borderMode=border)


def wave(img, amp, wavelength, phase=0.0, amp2=0.0, wavelength2=97.0, phase2=0.0):
    """Horizontal sine displacement per row (detuned / warped signal)."""
    y = np.arange(img.shape[0], dtype=np.float32)
    dx = amp * np.sin(2 * np.pi * y / wavelength + phase)
    if amp2:
        dx += amp2 * np.sin(2 * np.pi * y / wavelength2 + phase2)
    return remap_rows(img, dx)


def row_jitter(img, rng, amp, smooth=5, spikes=0, spike_amp=40.0):
    """Unstable horizontal sync: smooth per-row noise plus a few sharp spikes."""
    h = img.shape[0]
    d = rng.normal(0, 1, h + 4 * smooth).astype(np.float32)
    if smooth > 1:
        k = np.hanning(2 * smooth + 1).astype(np.float32)
        d = np.convolve(d, k / k.sum(), mode="same")
        d /= max(1e-6, float(d.std()))
    d = d[2 * smooth:2 * smooth + h] * amp
    for _ in range(int(spikes)):
        y = int(rng.integers(0, h))
        ln = int(rng.integers(2, 14))
        d[y:y + ln] += spike_amp * (rng.random() * 2 - 1)
    return remap_rows(img, d)


def vroll(img, offset, bar=36, sync_line=True):
    """Vertical-hold loss: picture rolls by `offset` rows; black blanking bar at the seam."""
    h = img.shape[0]
    off = _ri(offset) % h
    out = np.roll(img, off, axis=0)
    if bar > 0:
        rows = np.arange(off - bar, off) % h
        out[rows] = 0
        if sync_line:
            out[(off - bar // 3) % h] = 170
    return out


def melt(img, rng, amount, max_px=160):
    """Picture sags downward in uneven 'drips' (used while the music tape-stops)."""
    h, w = img.shape[:2]
    if amount <= 0:
        return img.copy()
    cols = rng.random(24).astype(np.float32)
    prof = cv2.resize(cols.reshape(1, -1), (w, 1), interpolation=cv2.INTER_CUBIC).ravel()
    prof = 0.35 + 0.65 * np.clip(prof, 0, 1)
    yy = (np.arange(h, dtype=np.float32) / h)[:, None] ** 1.6
    dy = yy * prof[None, :] * (amount * max_px)
    return remap_rows(img, np.zeros(h, np.float32), dy=dy, border=cv2.BORDER_REPLICATE)


# ============================================================================== channels
def rgb_split(img, rdx=0.0, rdy=0.0, bdx=0.0, bdy=0.0, rscale=1.0, bscale=1.0, gdx=0.0, gdy=0.0):
    """Chromatic split: per-channel offset + slight scale about the frame centre."""
    h, w = img.shape[:2]
    chans = list(cv2.split(img))
    for ch, (dx, dy, s) in enumerate(((rdx, rdy, rscale), (gdx, gdy, 1.0), (bdx, bdy, bscale))):
        if dx == 0 and dy == 0 and s == 1.0:
            continue
        m = np.float32([[s, 0, (1 - s) * w / 2 + dx], [0, s, (1 - s) * h / 2 + dy]])
        chans[ch] = cv2.warpAffine(chans[ch], m, (w, h), flags=cv2.INTER_LINEAR,
                                   borderMode=cv2.BORDER_REFLECT_101)
    return cv2.merge(chans)


def invert(img, y0=0, y1=None, x0=0, x1=None, channels=None):
    """Colour inversion of the whole frame, a region, or only some channels."""
    out = img.copy()
    roi = out[y0:y1, x0:x1]
    if channels is None:
        roi[...] = 255 - roi
    else:
        for c in channels:
            roi[..., c] = 255 - roi[..., c]
    return out


def channel_swap(img, perm=(2, 0, 1), y0=0, y1=None, x0=0, x1=None):
    out = img.copy()
    roi = out[y0:y1, x0:x1]
    roi[...] = roi[..., list(perm)]
    return out


def desaturate(img, amount):
    if amount <= 0:
        return img.copy()
    g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY), cv2.COLOR_GRAY2RGB)
    return cv2.addWeighted(img, 1 - amount, g, amount, 0)


def adjust(img, gain=1.0, bias=0.0):
    """out = img*gain + bias (saturating)."""
    return cv2.convertScaleAbs(img, alpha=float(gain), beta=float(bias))


def hue_rotate(img, degrees):
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV)
    hsv[..., 0] = ((hsv[..., 0].astype(np.int16) + int(degrees / 2)) % 180).astype(np.uint8)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2RGB)


# =============================================================================== digital
def slice_shift(img, rng, n, max_shift, hmin=4, hmax=80, wrap=True, chan_sep=0.0,
                ymin=0, ymax=None, min_shift=4):
    """Horizontal slice displacement: `n` random bands shifted sideways (heavy-tailed),
    optionally with the R/G/B planes torn apart inside a band (`chan_sep` = probability)."""
    h, w = img.shape[:2]
    out = img.copy()
    ymax = h if ymax is None else int(ymax)
    for _ in range(int(n)):
        bh = int(rng.integers(hmin, max(hmin, hmax) + 1))
        y = int(rng.integers(int(ymin), max(int(ymin) + 1, ymax - bh)))
        mag = max(min_shift, max_shift * (0.08 + 0.92 * rng.random() ** 1.8))
        dx = int(mag) * (1 if rng.random() < 0.5 else -1)
        band = out[y:y + bh]
        if chan_sep > 0 and rng.random() < chan_sep:
            for c in range(3):
                d = dx + int(rng.normal(0, max(3.0, abs(dx) * 0.3)))
                band[..., c] = np.roll(band[..., c], d, axis=1)
        else:
            band[...] = np.roll(band, dx, axis=1)
            if not wrap:
                if dx > 0:
                    band[:, :dx] = band[:, dx:dx + 1]
                elif dx < 0:
                    band[:, dx:] = band[:, dx - 1:dx]
    return out


def band_repeat(img, rng, n, hmin=8, hmax=120):
    """Copy horizontal bands to other heights (a slice of the picture decoded in the wrong place)."""
    h = img.shape[0]
    out = img.copy()
    for _ in range(int(n)):
        bh = int(rng.integers(hmin, hmax + 1))
        ys = int(rng.integers(0, h - bh))
        yd = int(np.clip(ys + rng.integers(-260, 261), 0, h - bh))
        out[yd:yd + bh] = img[ys:ys + bh]
    return out


def interlace(img, dx, y0=0, y1=None):
    """Field misalignment: odd lines shifted against even lines (comb artefact)."""
    out = img.copy()
    sl = out[y0 + 1:y1:2]
    sl[...] = np.roll(sl, _ri(dx), axis=1)
    return out


def tear_mix(img, other, y, dx=0, seam=60):
    """Partial frame update: rows below y still show `other` (older/newer frame)."""
    out = img.copy()
    h = img.shape[0]
    y = int(np.clip(y, 0, h))
    lower = other[y:]
    out[y:] = np.roll(lower, _ri(dx), axis=1) if dx else lower
    if seam and 0 < y < h - 2:
        out[y:y + 2] = cv2.add(out[y:y + 2], np.full_like(out[y:y + 2], seam))
    return out


BLOCK_MODES = ("copy", "smear_v", "smear_h", "dc", "tint", "gray", "swap", "quant", "run")


def block_corrupt(img, rng, n, block=16, max_w=16, max_h=4, modes=BLOCK_MODES, weights=None, ref=None):
    """Macroblock-level decode errors on a `block`-px grid:
    copy (wrong motion vector, optionally from `ref` = a stale frame), smear_v/h (concealment
    repeats an edge row/column), dc (DC-only blocks), tint (lost chroma -> green/magenta),
    gray (missing data), swap (channel order), quant (coarse quantiser), run (error runs to
    the end of the macroblock row)."""
    h, w = img.shape[:2]
    out = img.copy()
    src = img if ref is None else ref
    p = None if weights is None else np.asarray(weights, float) / float(np.sum(weights))
    for _ in range(int(n)):
        bw = min(w, block * int(rng.integers(1, max_w + 1)))
        bh = min(h, block * int(rng.integers(1, max_h + 1)))
        x = block * int(rng.integers(0, (w - bw) // block + 1))
        y = block * int(rng.integers(0, (h - bh) // block + 1))
        m = modes[int(rng.choice(len(modes), p=p))]
        r = out[y:y + bh, x:x + bw]
        if m == "copy":
            sx = int(np.clip(x + block * rng.integers(-14, 15), 0, w - bw))
            sy = int(np.clip(y + block * rng.integers(-6, 7), 0, h - bh))
            r[...] = src[sy:sy + bh, sx:sx + bw]
        elif m == "smear_v":
            r[...] = r[:1]
        elif m == "smear_h":
            r[...] = r[:, :1]
        elif m == "dc":
            sb = max(4, block // 2)
            sm = cv2.resize(r, (max(1, bw // sb), max(1, bh // sb)), interpolation=cv2.INTER_AREA)
            r[...] = cv2.resize(sm, (bw, bh), interpolation=cv2.INTER_NEAREST)
        elif m == "tint":
            lum = cv2.cvtColor(np.ascontiguousarray(r), cv2.COLOR_RGB2GRAY).astype(np.float32)
            if rng.random() < 0.6:   # zeroed chroma: the classic decoder green
                col = np.array((0.10, 0.85, 0.22), np.float32)
                base = np.array((0, 70, 10), np.float32)
            else:                    # saturated chroma: magenta/pink
                col = np.array((1.0, 0.30, 0.95), np.float32)
                base = np.array((60, 0, 50), np.float32)
            r[...] = np.clip(lum[..., None] * col + base, 0, 255).astype(np.uint8)
        elif m == "gray":
            r[...] = int(rng.integers(96, 160))
        elif m == "swap":
            r[...] = r[..., list(rng.permutation(3))]
        elif m == "quant":
            q = 1 << int(rng.integers(5, 8))
            r[...] = (r // q) * q + q // 2
        elif m == "run":
            band = out[y:y + bh, x:]
            band[...] = np.roll(src[y:y + bh, x:], int(rng.integers(-240, 241)), axis=1)
    return out


def ghost_blocks(img, stale, rng, amount, block=16, cluster=4, mv=(0, 0)):
    """P-frame reference error: clustered macroblocks keep showing a stale frame
    (optionally displaced by a motion vector `mv`)."""
    h, w = img.shape[:2]
    if amount <= 0:
        return img.copy()
    gh, gw = -(-h // block), -(-w // block)
    field = rng.random((gh // cluster + 2, gw // cluster + 2)).astype(np.float32)
    field = cv2.resize(field, (gw, gh), interpolation=cv2.INTER_LINEAR)
    field += rng.random((gh, gw)).astype(np.float32) * 0.25
    thr = np.quantile(field, 1 - min(0.98, amount))
    m = (field > thr).astype(np.uint8)
    mask = cv2.resize(m, (gw * block, gh * block), interpolation=cv2.INTER_NEAREST)[:h, :w]
    src = translate(stale, mv[0], mv[1]) if (mv[0] or mv[1]) else stale
    return np.where(mask[..., None].astype(bool), src, img)


def pixelate(img, block, x0=0, y0=0, x1=None, y1=None):
    """Exact block-grid pixelation of the frame or a region."""
    out = img.copy()
    roi = out[y0:y1, x0:x1]
    h, w = roi.shape[:2]
    b = max(2, int(block))
    if h < 1 or w < 1:
        return out
    cols, rows = -(-w // b), -(-h // b)
    sm = cv2.resize(roi, (cols, rows), interpolation=cv2.INTER_AREA)
    big = cv2.resize(sm, (cols * b, rows * b), interpolation=cv2.INTER_NEAREST)
    roi[...] = big[:h, :w]
    return out


@lru_cache(maxsize=8)
def _bayer(h, w):
    b = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16.0 - 0.5
    return np.tile(b, (-(-h // 4), -(-w // 4)))[:h, :w]


def posterize(img, bits, dither=False):
    """Bit-depth crush to `bits` per channel (optionally ordered-dithered)."""
    bits = int(np.clip(bits, 1, 8))
    if bits >= 8:
        return img.copy()
    levels = (1 << bits) - 1
    if not dither:
        lut = np.round(np.round(np.arange(256) / 255.0 * levels) / levels * 255).astype(np.uint8)
        return cv2.LUT(img, lut)
    h, w = img.shape[:2]
    f = img.astype(np.float32) / 255.0 * levels + _bayer(h, w)[..., None]
    return (np.clip(np.round(f), 0, levels) * (255.0 / levels)).astype(np.uint8)


# ------------------------------------------------------------------ real JPEG datamosh
def _jpeg_scans(data):
    """[(start, end)] byte ranges of entropy-coded data following each SOS header."""
    scans, i, n = [], 2, len(data)
    while i < n - 3:
        if data[i] != 0xFF:
            i += 1
            continue
        mk = data[i + 1]
        if mk == 0xFF:
            i += 1
        elif mk in (0x01, 0xD8) or 0xD0 <= mk <= 0xD7:
            i += 2
        elif mk == 0xD9:
            break
        elif mk == 0xDA:
            seg_len = (data[i + 2] << 8) | data[i + 3]
            s = j = i + 2 + seg_len
            while True:
                j = data.find(b"\xff", j)
                if j < 0 or j >= n - 1:
                    j = n
                    break
                if data[j + 1] == 0x00 or 0xD0 <= data[j + 1] <= 0xD7:
                    j += 2
                    continue
                break
            scans.append((s, j))
            i = j
        else:
            i += 2 + ((data[i + 2] << 8) | data[i + 3])
    return scans


def _safe_pos(buf, p, hi):
    """Move p forward to a byte that is neither 0xFF nor right after 0xFF (marker/stuffing)."""
    while p < hi and (buf[p] == 0xFF or buf[p - 1] == 0xFF):
        p += 1
    return p if p < hi - 1 else None


def _decode_jpeg(buf, shape):
    try:
        im = Image.open(io.BytesIO(bytes(buf)))
        im.load()
        arr = np.asarray(im.convert("RGB"))
    except Exception:
        return None
    if arr.shape[:2] != tuple(shape):
        return None
    return arr


def _corrupt_scan(buf, s, e, rng, hits, at, spread, ops):
    span = e - s
    first = float(np.clip(at + rng.normal(0, spread * 0.35), 0.01, 0.97))
    pos = [first] + sorted(float(v) for v in rng.uniform(first, 1.0, max(0, hits - 1)))
    for f in sorted(pos, reverse=True):  # back to front: deletions don't move later targets
        p = _safe_pos(buf, s + int(f * (span - 8)), e)
        if p is None:
            continue
        op = ops[int(rng.integers(len(ops)))]
        if op == "byte":
            v = int(rng.integers(0, 255))
            buf[p] = v if v != buf[p] else (v + 1) % 255
        elif op == "bit":
            v = buf[p] ^ (1 << int(rng.integers(0, 8)))
            buf[p] = v if v != 0xFF else 0xFE
        elif op == "chunk":  # repeat a run of earlier scan bytes (texture smear)
            ln = int(rng.integers(6, 48))
            q = _safe_pos(buf, s + int(rng.integers(0, max(1, p - s))), e)
            if q is None or p + ln >= e - 2:
                continue
            chunk = bytes(buf[q:q + ln]).rstrip(b"\xff")
            buf[p:p + len(chunk)] = chunk
        elif op == "drop":   # lost bytes: everything after slides sideways
            ln = int(rng.integers(1, 6))
            if p + ln >= e - 2 or buf[p + ln] == 0x00 or buf[p - 1] == 0xFF:
                continue
            del buf[p:p + ln]
            e -= ln
        elif op == "insert":
            ln = int(rng.integers(1, 6))
            buf[p:p] = bytes(int(v) for v in rng.integers(0, 255, ln))
            e += ln
    return buf


def jpeg_datamosh(img, rng, hits=3, quality=40, scale=1.0, at=0.5, spread=0.3,
                  mode="baseline", orient=0, rst=0, ops=("byte", "byte", "bit", "chunk", "drop", "insert"),
                  scan_pick=None):
    """REAL datamosh: JPEG-encode the frame, damage bytes inside the entropy-coded scan
    data (after SOS, never touching markers or stuffed bytes), decode the wreck.

    hits     number of damaged spots          at/spread  where the first damage lands
                                                         (fraction of the scan; later hits follow)
    quality  JPEG quality (lower = blockier)   scale      encode at reduced size -> chunkier blocks
    mode     'baseline' (damage cascades to the end of the image) or 'progressive'
             (damage one scan: structure survives, colour/texture is scrambled)
    rst      restart interval in MCUs (>0 confines each error to a band; 0 = cascade)
    orient   0 normal, 1 v-flip (cascade runs upward), 2 h-flip, 3 transpose (sideways)
    Falls back to fewer hits, then to the clean frame, if the result can't be decoded.
    """
    h0, w0 = img.shape[:2]
    src = img
    if orient == 1:
        src = src[::-1]
    elif orient == 2:
        src = src[:, ::-1]
    elif orient == 3:
        src = src.transpose(1, 0, 2)
    src = np.ascontiguousarray(src)
    sh, sw = src.shape[:2]
    if scale != 1.0:
        src = cv2.resize(src, (max(16, int(sw * scale)), max(16, int(sh * scale))), interpolation=cv2.INTER_AREA)
    params = [cv2.IMWRITE_JPEG_QUALITY, int(np.clip(quality, 2, 100))]
    if mode == "progressive":
        params += [cv2.IMWRITE_JPEG_PROGRESSIVE, 1]
    if rst:
        params += [cv2.IMWRITE_JPEG_RST_INTERVAL, int(rst)]
    ok, enc = cv2.imencode(".jpg", cv2.cvtColor(src, cv2.COLOR_RGB2BGR), params)
    if not ok:
        return img.copy()
    clean = enc.tobytes()
    scans = _jpeg_scans(clean)
    if not scans:
        return img.copy()
    dec = None
    for attempt in range(3):
        buf = bytearray(clean)
        if mode == "progressive" and len(scans) > 1:
            k = scan_pick if scan_pick is not None else int(rng.integers(0, len(scans)))
            k = int(np.clip(k, 0, len(scans) - 1))
        else:
            k = 0
        s, e = scans[k]
        if e - s < 64:
            break
        _corrupt_scan(buf, s, e, rng, max(1, hits >> attempt), at, spread, ops)
        dec = _decode_jpeg(buf, src.shape[:2])
        if dec is not None:
            break
    if dec is None:
        return img.copy()
    if scale != 1.0:
        dec = cv2.resize(dec, (sw, sh), interpolation=cv2.INTER_NEAREST)
    if orient == 1:
        dec = dec[::-1]
    elif orient == 2:
        dec = dec[:, ::-1]
    elif orient == 3:
        dec = dec.transpose(1, 0, 2)
    dec = np.ascontiguousarray(dec)
    if dec.shape[:2] != (h0, w0):
        dec = cv2.resize(dec, (w0, h0), interpolation=cv2.INTER_NEAREST)
    return dec


# -------------------------------------------------------------------------- pixel sort
def _sort_rows(band, lo, hi, reverse=False, rng=None, rand_len=0):
    lum = cv2.cvtColor(band, cv2.COLOR_RGB2GRAY)
    m = (lum >= lo) & (lum <= hi)
    brk = np.ones(m.shape, bool)
    brk[:, 1:] = (m[:, 1:] != m[:, :-1]) | ~m[:, 1:]
    if rand_len and rng is not None:  # extra random interval breaks
        brk |= rng.random(m.shape) < (1.0 / rand_len)
    seg = np.cumsum(brk, axis=1, dtype=np.int32)
    key = lum.astype(np.int32)
    if reverse:
        key = 255 - key
    idx = np.argsort(seg * 256 + key, axis=1)
    return np.take_along_axis(band, idx[..., None], axis=1)


def pixel_sort(img, a0, a1, lo=50, hi=255, vertical=False, reverse=False, rng=None, rand_len=0, step=1,
               lo_pct=None):
    """Asendorf-style pixel sorting inside rows a0:a1 (or columns if vertical):
    runs of pixels whose luminance is within [lo, hi] are sorted by luminance.
    lo_pct: if given, lo = that luminance percentile of the band (adapts to dark/bright frames).
    step=2 sorts at half resolution along the sort axis (faster, same look)."""
    out = img.copy()
    if vertical:
        band = np.ascontiguousarray(img[:, a0:a1].transpose(1, 0, 2))
    else:
        band = np.ascontiguousarray(img[a0:a1])
    if band.size == 0:
        return out
    if lo_pct is not None:
        sub = cv2.cvtColor(np.ascontiguousarray(band[::4, ::4]), cv2.COLOR_RGB2GRAY)
        lo = int(np.percentile(sub, float(lo_pct)))
    if step > 1:
        small = np.ascontiguousarray(band[:, ::step])
        srt = np.repeat(_sort_rows(small, lo, hi, reverse, rng, rand_len), step, axis=1)[:, :band.shape[1]]
    else:
        srt = _sort_rows(band, lo, hi, reverse, rng, rand_len)
    if vertical:
        out[:, a0:a1] = srt.transpose(1, 0, 2)
    else:
        out[a0:a1] = srt
    return out


def content_band(img, rng, frac, vertical=False, power=2.0):
    """Pick a band [a, b) of rows (or columns) covering `frac` of the frame, centred with
    probability ~ local brightness**power, so effects land on the picture's content (titles,
    windows, glows) instead of empty background."""
    h, w = img.shape[:2]
    small = cv2.cvtColor(cv2.resize(img, (max(1, w // 16), max(1, h // 16)), interpolation=cv2.INTER_AREA),
                         cv2.COLOR_RGB2GRAY).astype(np.float32)
    prof = small.mean(axis=0 if vertical else 1)
    wt = (prof - prof.min()) ** power + 1e-3
    span = w if vertical else h
    centre = (int(rng.choice(len(prof), p=wt / wt.sum())) + rng.random()) * span / len(prof)
    half = max(2.0, frac * span / 2)
    a = int(np.clip(centre - half, 0, span - 2))
    return a, int(np.clip(centre + half, a + 2, span))


def decoder_death(img, rng, seam, block=16, stale=None, green=0.25):
    """The decoder gives up mid-frame: macroblock rows below `seam` (px) are 'concealed' --
    columns smeared down from the last good row, grey/zero-chroma blocks, stale-frame copies
    and DC-only blocks, with the damage thickening toward the bottom."""
    h, w = img.shape[:2]
    out = img.copy()
    y0 = int(np.clip(seam // block * block, block, h - block))
    src = img if stale is None else stale
    edge = out[y0 - 1].copy()
    cols = -(-w // block)
    # 1) per macroblock column: smear the last good row down (concealment repeats it), or
    #    keep a stale/sliding copy of the picture (wrong reference)
    for bx in range(cols):
        x = bx * block
        if rng.random() < 0.72:
            out[y0:, x:x + block] = edge[None, x:x + block]
        else:
            out[y0:, x:x + block] = np.roll(src[y0:, x:x + block], int(rng.integers(-6, 12)) * block, axis=0)
    # 2) per-macroblock garbage, denser lower in the frame
    for by in range(y0, h, block):
        depth = (by - y0) / max(1, h - y0)
        n = int(cols * (0.08 + 0.5 * depth))
        xs = rng.choice(cols, size=min(cols, n), replace=False)
        for bx in xs:
            x = int(bx) * block
            r = out[by:by + block, x:x + block]
            u = rng.random()
            if u < green:
                r[...] = (0, int(rng.integers(90, 150)), int(rng.integers(0, 40)))
            elif u < 0.5:
                r[...] = int(rng.integers(80, 150))
            elif u < 0.75:
                sy = int(np.clip(by + block * rng.integers(-8, 3), 0, h - block))
                r[...] = src[sy:sy + r.shape[0], x:x + r.shape[1]]
            else:
                r[...] = r.reshape(-1, 3).mean(axis=0).astype(np.uint8)
    # 3) the first concealed row is often a bright/garbled line
    out[y0:y0 + 2] = cv2.add(out[y0:y0 + 2], np.full_like(out[y0:y0 + 2], 60))
    return out


# ================================================================================ analog
@lru_cache(maxsize=12)
def _scan_weights(h, w, strength, period, phase):
    y = np.arange(h, dtype=np.float32)
    wt = 1.0 - strength * (0.5 + 0.5 * np.cos(2 * np.pi * (y - phase) / period))
    a = np.repeat((wt * 255.0 + 0.5).astype(np.uint8)[:, None, None], w, axis=1).repeat(3, axis=2)
    a.setflags(write=False)
    return a


def scanlines(img, strength=0.2, period=4.0, phase=0.0):
    """Soft (sinusoidal) scanlines -- a single spatial frequency, so they don't alias
    into moire when the film is scaled on a projector."""
    if strength <= 0:
        return img.copy()
    h, w = img.shape[:2]
    wt = _scan_weights(h, w, round(float(strength), 3), float(period), round(float(phase) % period, 1))
    return cv2.multiply(img, wt, scale=1.0 / 255.0)


def chroma_bleed(img, width=12, shift=4, sat=1.0):
    """VHS chroma: colour smeared sideways and offset from the luma."""
    ycc = cv2.cvtColor(img, cv2.COLOR_RGB2YCrCb)
    y, cr, cb = cv2.split(ycc)
    k = max(1, int(width))
    cr = cv2.blur(cr, (k, 1))
    cb = cv2.blur(cb, (k, 1))
    if shift:
        cr = np.roll(cr, int(shift), axis=1)
        cb = np.roll(cb, int(shift), axis=1)
    if sat != 1.0:
        cr = cv2.addWeighted(cr, sat, cr, 0, 128 * (1 - sat))
        cb = cv2.addWeighted(cb, sat, cb, 0, 128 * (1 - sat))
    return cv2.cvtColor(cv2.merge([y, cr, cb]), cv2.COLOR_YCrCb2RGB)


def echo(img, dx, strength=0.25):
    """Multipath ghost: faint copy of the picture offset to the right."""
    return cv2.addWeighted(img, 1.0 - strength * 0.5, np.roll(img, int(dx), axis=1), strength * 0.5, 0)


def tracking_band(img, rng, y, height, strength=1.0):
    """VHS tracking error: a band of rows torn sideways with noise streaks and lifted blacks."""
    h, w = img.shape[:2]
    out = img.copy()
    y0, y1 = max(0, int(y)), min(h, int(y + height))
    if y1 - y0 < 2:
        return out
    rows = y1 - y0
    prof = np.sin(np.linspace(0, np.pi, rows)) ** 0.7
    dx = (rng.normal(0, 1, rows) * 30 + 55) * prof * strength
    band = out[y0:y1]
    for i in range(rows):
        if abs(dx[i]) >= 1:
            band[i] = np.roll(band[i], int(dx[i]), axis=0)
    band[...] = cv2.convertScaleAbs(band, alpha=1.0 - 0.15 * strength, beta=40 * strength)
    streak = rng.random((rows, w // 8)) > 1.0 - 0.10 * strength
    streak = np.repeat(streak, 8, axis=1)[:, :w] & (prof[:, None] > 0.3)
    band[streak] = (225, 225, 230)
    return out


def head_switch(img, rng, rows=14, shift=26):
    """Head-switching noise at the bottom of the frame."""
    h = img.shape[0]
    out = img.copy()
    for i in range(int(rows)):
        y = h - rows + i
        out[y] = np.roll(img[y], int(shift * (0.4 + i / rows) + rng.integers(-6, 7)), axis=0)
    nz = rng.integers(0, 60, (int(rows), img.shape[1], 1), dtype=np.uint8)
    out[h - rows:] = cv2.add(out[h - rows:], np.repeat(nz, 3, axis=2))
    return out


def dropouts(img, rng, n, maxlen=320):
    """Tape dropouts: short bright horizontal streaks."""
    h, w = img.shape[:2]
    out = img.copy()
    for _ in range(int(n)):
        y, x = int(rng.integers(0, h - 2)), int(rng.integers(0, w - 20))
        ln, th = int(rng.integers(20, maxlen)), int(rng.integers(1, 3))
        v = int(rng.integers(190, 256))
        out[y:y + th, x:x + ln] = v
    return out


def tv_static(h, w, rng, t=0.0, grain=2, bars=0.35, tint=(0.93, 0.97, 1.0), contrast=2.7):
    """Analog 'snow': fine monochrome grain with horizontal streak correlation and
    slowly rolling darker/brighter bars. Generated at 1/grain resolution (authentic
    grain size, and far cheaper for H.264 than per-pixel noise)."""
    gh, gw = -(-h // grain), -(-w // grain)
    n = rng.integers(0, 256, (gh, gw), dtype=np.uint8)
    n = cv2.blur(n, (3, 1))
    # contrasty, with a flickering level (AGC)
    n = cv2.convertScaleAbs(n, alpha=contrast, beta=127.5 * (1 - contrast) - 2 + 30 * rng.random())
    yy = np.arange(gh, dtype=np.float32) / gh
    roll = 1.0 - bars * (0.5 + 0.5 * np.sin(2 * np.pi * (yy * 1.6 - t * 0.85)))
    roll *= 1.0 - 0.3 * bars * (0.5 + 0.5 * np.sin(2 * np.pi * (yy * 6.1 + t * 2.7)))
    n = (n.astype(np.float32) * roll[:, None]).astype(np.uint8)
    for _ in range(int(rng.integers(1, 4))):  # bright sync streak rows
        y = int(rng.integers(0, gh))
        n[y:y + int(rng.integers(1, 3))] = cv2.add(n[y:y + 2], 70)[:1]
    up = cv2.resize(n, (gw * grain, gh * grain), interpolation=cv2.INTER_NEAREST)[:h, :w]
    return cv2.merge([cv2.convertScaleAbs(up, alpha=tint[0]), cv2.convertScaleAbs(up, alpha=tint[1]),
                      cv2.convertScaleAbs(up, alpha=tint[2])])


def ui_mask(img, thresh=100, grow=40):
    """Bool mask of bright UI (windows, light panels, bright text), dilated by `grow` px so
    title bars and borders are covered. Use it to keep readable UI clean while the dark
    background glitches."""
    lum = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    small = cv2.resize(lum, (lum.shape[1] // 4, lum.shape[0] // 4), interpolation=cv2.INTER_AREA)
    m = (small > thresh).astype(np.uint8)
    k = max(1, int(grow) // 4)
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_RECT, (2 * k + 1, 2 * k + 1)))
    return cv2.resize(m, (lum.shape[1], lum.shape[0]), interpolation=cv2.INTER_NEAREST).astype(bool)


def composite(mask, a, b):
    """a where mask is True, b elsewhere."""
    return np.where(mask[..., None], a, b)


def static_mix(img, noise, amount):
    a = clamp01(amount)
    if a <= 0:
        return img.copy()
    if a >= 1:
        return noise.copy()
    return cv2.addWeighted(img, 1 - a, noise, a, 0)


def glow(img, strength=0.6, threshold=50, sigma=12, scale=4):
    """Bloom: blurred bright parts added back (phosphor glow)."""
    h, w = img.shape[:2]
    sm = cv2.resize(img, (w // scale, h // scale), interpolation=cv2.INTER_AREA)
    br = cv2.subtract(sm, np.full_like(sm, int(threshold)))
    bl = cv2.GaussianBlur(br, (0, 0), max(0.5, sigma / scale))
    bl = cv2.resize(bl, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.addWeighted(img, 1.0, bl, float(strength), 0)


def crt_collapse(img, p):
    """CRT power-off: 0..0.6 squash vertically into a white-hot line, then shrink to a dot."""
    h, w = img.shape[:2]
    out = np.zeros_like(img)
    p = clamp01(p)
    if p < 0.6:
        k = p / 0.6
        hh = max(3, int(h * (1 - k) ** 2.4))
        sq = cv2.resize(img, (w, hh), interpolation=cv2.INTER_AREA)
        sq = cv2.addWeighted(sq, 1.0 + 0.6 * k, sq, 0, 255 * (0.08 + 0.45 * k))
        y0 = (h - hh) // 2
        out[y0:y0 + hh] = sq
    else:
        k = (p - 0.6) / 0.4
        ww = max(6, int(w * (1 - k) ** 1.8))
        th = max(2, int(5 * (1 - k)) + 2)
        x0 = (w - ww) // 2
        out[h // 2 - th // 2:h // 2 + th - th // 2, x0:x0 + ww] = 255
    return glow(out, 1.4, 0, sigma=14)


# ======================================================================= photosensitivity
# Harding / Ofcom / ITU-R BT.1702 style "general flash" metric. A transition is a change of
# >= 20 cd/m2 (nominal 200 cd/m2 display) over >= 25% of the screen where the darker state is
# below 160 cd/m2; a flash is a pair of opposing transitions; > 3 flashes in any 1 s fails.
_LIN200 = ((np.arange(256) / 255.0) ** 2.2 * 200.0).astype(np.float32)
FLASH_GRID = (240, 135)


def flash_luma(img):
    """Coarse (240x135) screen luminance map in cd/m2 for flash analysis."""
    s = cv2.resize(img, FLASH_GRID, interpolation=cv2.INTER_AREA)
    lin = _LIN200[s]
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def flash_transition(y0, y1, dmin=20.0, dark=160.0, area=0.25):
    """+1 / -1 if y0 -> y1 is a large-area luminance increase / decrease, else 0."""
    d = y1 - y0
    low = np.minimum(y0, y1) < dark
    up = float(((d >= dmin) & low).mean())
    dn = float(((d <= -dmin) & low).mean())
    if up >= area and up >= dn:
        return 1
    if dn >= area:
        return -1
    return 0


def opposing_count(signs):
    """Number of opposing transitions in a time-ordered sign sequence (+,+,- counts 2)."""
    n, last = 0, 0
    for s in signs:
        if s and s != last:
            n += 1
            last = s
    return n


# ================================================================================= tonal
def white_flash(img, a):
    a = clamp01(a)
    h, w = img.shape[:2]
    if a >= 1:
        return np.full_like(img, 255)
    return cv2.addWeighted(img, 1 - a, _solid(h, w, 255), a, 0)
