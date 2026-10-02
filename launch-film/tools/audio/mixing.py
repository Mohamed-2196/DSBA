"""mixing.py - buses, sends, sidechain, glitch chains and the mastering chain."""
from __future__ import annotations

import numpy as np
from scipy import ndimage, signal

from dsp import (SR, s2n, tarr, Track, convolve, pingpong, butter, biquad, tv_filter,
                 sidechain_curve, bitcrush, rc_ramp, ms_width, stutter, tape_stop,
                 read_cubic, smoothstep, rng_for, remove_drift)


# =============================================================== bus / mixer
class Bus:
    def __init__(self, name, t0, t1, gain_db=0.0, hp=None, lp=None, width=1.0, duck=0.0,
                 sends=None, eq=(), auto_lp=None, auto_hp=None, auto_q=0.707, drive=None):
        self.name = name
        self.track = Track(t0, t1, name)
        self.gain = 10.0 ** (gain_db / 20.0)
        self.hp, self.lp, self.width, self.duck = hp, lp, width, duck
        self.sends = dict(sends or {})
        self.eq = list(eq)
        self.auto_lp, self.auto_hp, self.auto_q = auto_lp, auto_hp, auto_q
        self.drive = drive

    def add(self, t, sig, gain=1.0, pan=0.0):
        self.track.add(t, sig, gain, pan)

    def process(self, duck_shape=None):
        buf = self.track.buf
        act = np.flatnonzero(np.any(buf != 0, axis=0))
        if len(act) == 0:
            return None
        x = buf.astype(np.float64)
        if self.hp:
            x = butter(x, "highpass", self.hp, 2)
        if self.lp:
            x = butter(x, "lowpass", self.lp, 2)
        for kind, fc, q, g in self.eq:
            x = biquad(x, kind, fc, q, g)
        if self.auto_lp is not None or self.auto_hp is not None:
            a = max(0, act[0] - 256)
            b = min(x.shape[1], act[-1] + 1 + SR)
            tt = self.track.times()[a:b]
            if self.auto_lp is not None:
                x[:, a:b] = tv_filter(x[:, a:b], "lp", self.auto_lp(tt), q=self.auto_q, block=128)
            if self.auto_hp is not None:
                x[:, a:b] = tv_filter(x[:, a:b], "hp", self.auto_hp(tt), q=0.707, block=128)
        if self.drive:
            x = np.tanh(x * self.drive) / np.tanh(self.drive)
        if self.width != 1.0:
            x = ms_width(x, self.width)
        x *= self.gain
        if self.duck and duck_shape is not None:
            x *= 1.0 - self.duck * duck_shape
        return x


class Mixer:
    """A set of buses covering [t0, t1) plus reverb/delay sends and a sidechain key.

    Mixer.stat_sections (class attribute, {label: (t0, t1)}) -> per-bus RMS / loudness
    stats are computed during render (bus arrays are freed); names in `keep` are kept."""

    stat_sections: dict = {}

    def __init__(self, name, t0, t1, reverbs, keep=()):
        self.name, self.t0, self.t1 = name, t0, t1
        self.n0, self.n = s2n(t0), s2n(t1) - s2n(t0)
        self.reverbs = reverbs      # name -> dict(kind='ir'|'delay', ir=..., ret_db=..)
        self.buses: dict[str, Bus] = {}
        self.kicks: list[float] = []
        self.duck_release = 0.18
        self.levels = {}
        self.stats = {}
        self.keep = set(keep)

    def _stat(self, name, x):
        import pyloudnorm as pyln
        row = {}
        for lab, (a, b) in self.stat_sections.items():
            ia, ib = max(0, s2n(a) - self.n0), min(self.n, s2n(b) - self.n0)
            if ib - ia < SR // 2:
                continue
            seg = x[:, ia:ib]
            r = float(np.sqrt(np.mean(seg ** 2)))
            if r < 1e-6:
                continue
            L = pyln.Meter(SR).integrated_loudness(np.ascontiguousarray(seg.T))
            row[lab] = (20 * np.log10(r), L if np.isfinite(L) else -99.0)
        self.stats[name] = row

    def bus(self, name, **kw) -> Bus:
        b = Bus(name, self.t0, self.t1, **kw)
        self.buses[name] = b
        return b

    def duck_shape(self):
        if not self.kicks:
            return None
        times = (self.n0 + np.arange(self.n)) / SR
        return 1.0 - sidechain_curve(times, self.kicks, 1.0, release=self.duck_release)

    def render(self):
        out = np.zeros((2, self.n))
        sends = {k: None for k in self.reverbs}
        duck = self.duck_shape()
        for name, b in self.buses.items():
            x = b.process(duck)
            if x is None:
                continue
            if self.stat_sections:
                self._stat(name, x)
            if name in self.keep:
                self.levels[name] = x.astype(np.float32)
            out += x
            for s, lvl in b.sends.items():
                if sends[s] is None:
                    sends[s] = np.zeros((2, self.n))
                sends[s] += x * lvl
            b.track.buf = None          # free memory
        for s, cfg in self.reverbs.items():
            if sends[s] is None:
                continue
            x = sends[s]
            x = butter(x, "highpass", cfg.get("hp", 180.0), 2)
            x = butter(x, "lowpass", cfg.get("lp", 9000.0), 2)
            if cfg["kind"] == "ir":
                wet = convolve(x, cfg["ir"]).astype(np.float64)
            else:
                wet = pingpong(x, cfg["time"], cfg.get("fb", 0.4), cfg.get("n", 6),
                               cfg.get("dlp", 4500.0), cfg.get("dhp", 300.0)).astype(np.float64)
            g = 10.0 ** (cfg.get("ret_db", 0.0) / 20.0)
            if cfg.get("duck") and duck is not None:
                wet *= 1.0 - cfg["duck"] * duck
            if self.stat_sections:
                self._stat("ret_" + s, wet * g)
            out += wet * g
        if self.stat_sections:
            self._stat("TOTAL", out)
        return out

    def bus_report(self):
        """[(bus, {section: (rms_db, lufs_rel_to_total)})] for the report."""
        tot = self.stats.get("TOTAL", {})
        rep = []
        for name, row in self.stats.items():
            if name == "TOTAL":
                continue
            rep.append((name, {k: (v[0], v[1] - tot[k][1]) for k, v in row.items() if k in tot}))
        return rep


# ================================================================ glitch chains
def _seg_intensity(segments, t):
    """Intensity curve (0..1) from cue segments, same eases as the video post."""
    eases = {"corrupt": lambda p: p ** 1.35, "crescendo": lambda p: p ** 1.7,
             "static": lambda p: p * p * (3 - 2 * p)}
    I = np.zeros_like(t)
    kind = np.empty(t.shape, dtype=object)
    for s in segments:
        m = (t >= s["t0"]) & (t < s["t1"])
        p = np.clip((t[m] - s["t0"]) / max(s["t1"] - s["t0"], 1e-6), 0, 1)
        I[m] = s["i0"] + (s["i1"] - s["i0"]) * eases.get(s["kind"], lambda q: q)(p)
        kind[m] = s["kind"]
    return I, kind


G1_TAPE_POWER, G1_TAPE_AMP = 1.5, 0.35


def glitch1(buf, n0, g1, crush_kinds=("freeze_stutter", "corrupt")):
    """Act-1 crash, in place on buf (2, n) (sample 0 = absolute n0).

    order: tape stop (kills everything after it) -> stutters (stutter 3 sits inside the
    tape stop, so it repeats the slowed audio, as the cue intends) -> bit/sample-rate
    crush ramp driven by the cue segment intensities.
    """
    ts = g1["tape_stop"]
    tape_stop(buf, n0, ts["t0"], ts["t1"], power=G1_TAPE_POWER, amp_pow=G1_TAPE_AMP, kill_after=True)
    # tiny fade at the very end of the tape stop (speed -> 0 already brings level -> 0)
    b = s2n(ts["t1"]) - n0
    F = s2n(0.02)
    buf[:, b - F:b] *= rc_ramp(F, up=False)
    for st in g1["stutters"]:
        stutter(buf, n0, st["start"], st["end"], st["src"], st["len"], fade=0.003)
    # crush ramp
    a = s2n(g1["start"]) - n0
    b = s2n(ts["t1"]) - n0 + s2n(0.01)
    t = (n0 + np.arange(a, b)) / SR
    I, kind = _seg_intensity(g1["segments"], t)
    on = np.isin(kind, crush_kinds).astype(float)
    bits = 13.0 - 9.0 * I
    hold = 1.0 + 11.0 * I ** 2
    wet = np.clip(0.25 + 0.85 * I, 0, 1) * on
    F = s2n(0.003)
    wet[:F] *= rc_ramp(F)
    seg = buf[:, a:b]
    # level-adaptive crush: quantise relative to a 15 ms envelope, so the decaying tape stop
    # keeps its crunchy texture all the way down instead of being gated to zero early
    k = s2n(0.015)
    p2 = np.convolve(np.mean(seg ** 2, axis=0), np.ones(k) / k, mode="same")
    env = 2.0 * np.sqrt(p2) + 1e-5
    cr = bitcrush(seg / env, bits, hold) * env
    cr = butter(cr, "lowpass", 9500.0, 2)
    buf[:, a:b] = seg * (1 - wet) + cr * wet


G2_GRAIN_DECAY_DB = 5.0     # level drop across each stutter grain (see glitch2)


def glitch2(buf, n0, g2, fade=0.003):
    """Birthday sabotage, in place: the final note (from note_warp.t0) stutters exactly per
    g2.stutters while detuning more and more; after the stutter it re-attacks once more and
    tape-stops to nothing by note_warp.t1 ("you-you-you-yo-y"). Silence after t1.

    Every grain starts exactly on its cue sample (rates < 1 only shorten what each grain
    reads, never shift it), so audio stays locked to the video repeats. Each grain also
    decays by G2_GRAIN_DECAY_DB, so every repeat re-attacks audibly even when the source is
    a soft, sustained chord (felt piano + strings) rather than a plucked music box.
    """
    nw = g2["note_warp"]
    t0, t1 = nw["t0"], nw["t1"]
    segs = g2["segments"]
    grains = []                     # (out_start, out_end, src, is_tail)
    sts = sorted(g2["stutters"], key=lambda s: s["start"])
    cur = t0
    for st in sts:
        if st["start"] > cur:
            grains.append((cur, st["start"], cur if cur == t0 else st["src"], False))
        k = 0
        while True:
            a = st["start"] + k * st["len"]
            if a >= st["end"] - 1e-9:
                break
            grains.append((a, min(st["start"] + (k + 1) * st["len"], st["end"]), st["src"], False))
            k += 1
        cur = st["end"]
    if cur < t1:
        grains.append((cur, t1, sts[0]["src"] if sts else t0, True))

    F = max(2, s2n(fade) // 2)
    x = buf.copy()
    nA, nB = s2n(t0) - n0, s2n(t1) - n0
    w = np.ones(buf.shape[-1])
    w[nA - F:nA + F] = rc_ramp(2 * F, up=False)
    w[nA + F:] = 0.0
    y = x * w
    for (ga, gb, src, tail) in grains:
        g0, g1i = s2n(ga) - n0, s2n(gb) - n0
        L = g1i - g0 + 2 * F
        tt = (n0 + g0 - F + np.arange(L)) / SR
        I, _ = _seg_intensity(segs, np.clip(tt, t0, t1 - 1e-6))
        u = np.clip((tt - t0) / (t1 - t0), 0, 1)
        k = I / 0.7
        cents_ = -150.0 * k * u ** 1.25 + 38.0 * k * np.minimum(u * 4, 1) * np.sin(2 * np.pi * 6.3 * (tt - t0))
        rate = 2.0 ** (cents_ / 1200.0)
        v = np.clip((tt - ga) / (gb - ga), 0, 1)
        if tail:
            sp = (1.0 - v) ** 1.35
            rate = rate * 0.88 * sp
            amp = sp ** 0.45
        else:
            amp = 10.0 ** (-G2_GRAIN_DECAY_DB * v / 20.0)
        s = s2n(src) - n0
        seg = read_cubic(x, s - F + np.concatenate([[0.0], np.cumsum(rate[:-1])])) * amp
        if tail:
            seg = remove_drift(seg)
        win = np.ones(L)
        win[:2 * F] = rc_ramp(2 * F, up=True)
        if tail:
            fo = min(L - 2 * F, s2n(0.03))
            win[-fo:] = rc_ramp(fo, up=False)
            win[-F:] = 0.0
            seg = seg[:, :L]
            y[:, g0 - F:g0 - F + L] += seg * win
        else:
            win[-2 * F:] = rc_ramp(2 * F, up=False)
            y[:, g0 - F:g1i + F] += seg * win
    y[:, nB:] = 0.0
    buf[...] = y


# ==================================================================== mastering
def compressor(x, thresh_db=-16.0, ratio=2.0, attack=0.012, release=0.18, knee_db=6.0,
               block=48, detector=None):
    det = x if detector is None else detector
    C, n = det.shape
    nb = (n + block - 1) // block
    pad = nb * block - n
    d = np.pad(det, ((0, 0), (0, pad)))
    rms = np.sqrt(np.mean(d.reshape(C, nb, block) ** 2, axis=(0, 2)) + 1e-12)
    lev = 20 * np.log10(rms)
    over = lev - thresh_db
    k = knee_db
    sl = 1.0 - 1.0 / ratio
    gr = np.where(over <= -k / 2, 0.0,
                  np.where(over >= k / 2, -sl * over, -sl * (over + k / 2) ** 2 / (2 * k)))
    aa = np.exp(-block / SR / attack)
    ar = np.exp(-block / SR / release)
    g = 0.0
    sm = np.empty(nb)
    for i in range(nb):
        v = gr[i]
        g = aa * g + (1 - aa) * v if v < g else ar * g + (1 - ar) * v
        sm[i] = g
    centers = (np.arange(nb) + 0.5) * block
    gs = np.interp(np.arange(n), centers, sm)
    return x * 10.0 ** (gs / 20.0), float(np.min(sm))


def peak_env(x, os=4):
    """Per-sample true-peak estimate (max over channels of the 4x oversampled signal)."""
    n = x.shape[-1]
    y = signal.resample_poly(x, os, 1, axis=-1)
    a = np.max(np.abs(y), axis=0)[:n * os].reshape(n, os).max(axis=1)
    return np.maximum(a, np.max(np.abs(x), axis=0))


def true_peak_db(x, os=4):
    y = signal.resample_poly(x, os, 1, axis=-1)
    return 20 * np.log10(np.max(np.abs(y)) + 1e-12)


def limiter(x, ceiling_db=-1.3, look=0.0015, release=0.07, block=32):
    c = 10.0 ** (ceiling_db / 20.0)
    p = peak_env(x)
    g_req = np.minimum(1.0, c / np.maximum(p, 1e-9))
    W = max(1, s2n(look))
    g1 = ndimage.minimum_filter1d(g_req, size=2 * W + 1, mode="nearest")
    g2 = ndimage.uniform_filter1d(g1, size=2 * W + 1, mode="nearest")
    n = len(g2)
    nb = (n + block - 1) // block
    gb = np.pad(g2, (0, nb * block - n), mode="edge").reshape(nb, block).min(axis=1)
    ar = np.exp(-block / SR / release)
    y = np.empty(nb)
    v = 1.0
    for i in range(nb):
        gi = gb[i]
        v = gi if gi < v else v + (1 - ar) * (gi - v)
        y[i] = v
    up = np.repeat(y, block)[:n]
    up = ndimage.uniform_filter1d(up, size=block, mode="nearest")
    g = np.minimum(g2, up)
    return x * g, float(20 * np.log10(np.min(g)))


def gate_curve(n, n0, silences, fade=0.004):
    """1 everywhere, exact 0 inside each (t0, t1); raised-cosine fade-out ending at t0 and
    fade-in starting at t1."""
    g = np.ones(n)
    F = s2n(fade)
    for (a, b) in silences:
        ia, ib = s2n(a) - n0, s2n(b) - n0
        ia_c, ib_c = max(ia, 0), min(ib, n)
        if ib_c > ia_c:
            g[ia_c:ib_c] = 0.0
        if 0 <= ia - F and ia <= n:
            g[ia - F:ia] *= rc_ramp(F, up=False)
        if ib >= 0 and ib + F <= n:
            g[ib:ib + F] *= rc_ramp(F, up=True)
    return g


def lufs(x):
    import pyloudnorm as pyln
    return pyln.Meter(SR).integrated_loudness(np.ascontiguousarray(x.T))


def short_term_lufs(x, win=3.0, hop=0.5):
    import pyloudnorm as pyln
    m = pyln.Meter(SR, block_size=0.4)
    n = x.shape[-1]
    W, H = s2n(win), s2n(hop)
    out_t, out_v = [], []
    for a in range(0, n - W + 1, H):
        seg = x[:, a:a + W]
        if np.max(np.abs(seg)) < 1e-6:
            v = -70.0
        else:
            v = m.integrated_loudness(np.ascontiguousarray(seg.T))
            v = max(v, -70.0) if np.isfinite(v) else -70.0
        out_t.append((a + W / 2) / SR)
        out_v.append(v)
    return np.array(out_t), np.array(out_v)


def to_int16(x, rng, mask=None):
    """TPDF dither (masked: no dither where mask==0, so digital silence stays exact)."""
    d = (rng.random(x.shape) - rng.random(x.shape)) / 32768.0
    if mask is not None:
        d *= mask
    y = np.clip(np.round((x + d) * 32767.0), -32768, 32767).astype(np.int16)
    if mask is not None:
        y[:, mask == 0] = 0
    return y
