"""dsp.py - core DSP for the procedural soundtrack (numpy + scipy only).

Deterministic: every random draw comes from rng_for(...), a numpy Generator
derived from a fixed project seed plus stable (crc32) keys, so changing one
sound never changes the randomness of another.
"""
from __future__ import annotations

import zlib

import numpy as np
from scipy import signal

def _enable_ftz_daz() -> bool:
    """Flush denormals to zero (x86-64 MXCSR FTZ|DAZ via glibc fesetenv). IIR filters fed
    with long digital silence otherwise decay into denormal numbers and run ~8x slower
    (and so do FFTs of their output). Harmless for audio (denormals are < -6000 dBFS)."""
    try:
        import ctypes
        import ctypes.util
        import platform
        if platform.machine().lower() not in ("x86_64", "amd64"):
            return False
        libm = ctypes.CDLL(ctypes.util.find_library("m"))
        env = (ctypes.c_uint8 * 64)()            # glibc x86-64 fenv_t: 32 bytes, mxcsr at 28
        if libm.fegetenv(env) != 0:
            return False
        mx = int.from_bytes(bytes(env[28:32]), "little") | 0x8040
        env[28:32] = list(mx.to_bytes(4, "little"))
        if libm.fesetenv(env) != 0:
            return False
        return float(np.float64(1e-300) * np.float64(1e-10)) == 0.0
    except Exception:  # pragma: no cover
        return False


FTZ = _enable_ftz_daz()

try:   # fast path for time-varying filters; falls back to the public API if scipy changes
    from scipy.signal._sosfilt import _sosfilt as _sosfilt_c
    _t = np.zeros((1, 8))
    _sosfilt_c(np.array([[1.0, 0, 0, 1.0, 0, 0]]), _t, np.zeros((1, 1, 2)))
except Exception:  # pragma: no cover
    _sosfilt_c = None

SR = 48000
NYQ = SR / 2.0
SEED = 20261006
TWO_PI = 2.0 * np.pi


# --------------------------------------------------------------------- basics
def rng_for(*keys) -> np.random.Generator:
    seq = [SEED]
    for k in keys:
        if isinstance(k, (bool, np.bool_)):
            k = int(k)
        if isinstance(k, (int, np.integer)):
            seq.append(int(k) % (2 ** 32))
        elif isinstance(k, (float, np.floating)):
            seq.append(int(round(float(k) * 1e4)) % (2 ** 32))
        else:
            seq.append(zlib.crc32(str(k).encode("utf-8")))
    return np.random.default_rng(seq)


def s2n(t: float) -> int:
    return int(round(t * SR))


def tarr(n: int) -> np.ndarray:
    return np.arange(n) / SR


def db2a(db):
    return 10.0 ** (np.asarray(db, dtype=float) / 20.0)


def a2db(a):
    return 20.0 * np.log10(np.maximum(np.abs(a), 1e-12))


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def cents(c):
    return 2.0 ** (np.asarray(c, dtype=float) / 1200.0)


def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


def fade_edges(x: np.ndarray, fin: float = 0.003, fout: float = 0.003) -> np.ndarray:
    """Raised-cosine fades on both ends (in place, works for (n,) or (C, n))."""
    n = x.shape[-1]
    a = min(s2n(fin), n // 2)
    b = min(s2n(fout), n // 2)
    if a > 0:
        x[..., :a] *= 0.5 - 0.5 * np.cos(np.pi * (np.arange(a) + 0.5) / a)
    if b > 0:
        x[..., n - b:] *= 0.5 + 0.5 * np.cos(np.pi * (np.arange(b) + 0.5) / b)
    return x


def ramp(n: int, a: float, b: float, curve: float = 1.0) -> np.ndarray:
    u = np.linspace(0.0, 1.0, n) if n > 1 else np.zeros(n)
    return a + (b - a) * u ** curve


def exp_ramp(n: int, a: float, b: float) -> np.ndarray:
    return a * (b / a) ** (np.linspace(0.0, 1.0, n) if n > 1 else np.zeros(n))


# ---------------------------------------------------------------- oscillators
TL = 4096
_H_LEVELS = sorted({max(1, int(round(2 ** (i / 4.0)))) for i in range(0, 44)})
_TABLES: dict = {}
F_LIMIT = 19000.0   # highest partial allowed (well below Nyquist: no aliasing)


def _wavetable(kind: str, H: int) -> np.ndarray:
    key = (kind, H)
    tab = _TABLES.get(key)
    if tab is None:
        k = np.arange(1, H + 1, dtype=float)
        if kind == "saw":
            a = (2.0 / np.pi) * ((-1.0) ** (k + 1)) / k
        elif kind == "square":
            a = np.where(k % 2 == 1, (4.0 / np.pi) / k, 0.0)
        elif kind == "tri":
            a = np.where(k % 2 == 1, (8.0 / np.pi ** 2) * ((-1.0) ** ((k - 1) // 2)) / k ** 2, 0.0)
        else:
            raise ValueError(kind)
        spec = np.zeros(TL // 2 + 1, dtype=complex)
        spec[1:H + 1] = -1j * a * TL / 2.0
        w = np.fft.irfft(spec, TL)
        tab = np.empty(TL + 1)
        tab[:TL] = w
        tab[TL] = w[0]
        _TABLES[key] = tab
    return tab


def _pick_h(fmax: float) -> int:
    hmax = F_LIMIT / max(float(fmax), 1.0)
    best = 1
    for h in _H_LEVELS:
        if h <= hmax:
            best = h
        else:
            break
    return min(best, TL // 2 - 1)


def phase_of(freq, n: int, phase0: float = 0.0) -> np.ndarray:
    """Phase in cycles (not wrapped). freq scalar or array(n)."""
    if np.ndim(freq) == 0:
        return phase0 + np.arange(n) * (float(freq) / SR)
    inc = np.asarray(freq, dtype=float) / SR
    ph = np.cumsum(inc)
    ph -= inc[0]
    ph += phase0
    return ph


def osc(kind: str, freq, n: int, phase0: float = 0.0, fmax: float | None = None) -> np.ndarray:
    """Band-limited oscillator (wavetable, no partial above F_LIMIT)."""
    ph = phase_of(freq, n, phase0)
    if kind == "sine":
        return np.sin(TWO_PI * ph)
    fm = float(np.max(freq)) if fmax is None else float(fmax)
    ph = ph - np.floor(ph)
    tab = _wavetable(kind, _pick_h(fm))
    x = ph * TL
    i = x.astype(np.int64)
    np.minimum(i, TL - 1, out=i)
    fr = x - i
    t0 = tab[i]
    return t0 + fr * (tab[i + 1] - t0)


# ------------------------------------------------------------------ envelopes
def env_adsr(n: int, a: float = 0.005, d: float = 0.2, s: float = 0.7, r: float = 0.1,
             gate: float | None = None, end_fade: float = 0.004) -> np.ndarray:
    """Attack (raised cosine) -> exp decay (tau d) to s -> exp release (tau r) after gate."""
    t = tarr(n)
    att = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(a, 1e-4), 0.0, 1.0))
    e = att * (s + (1.0 - s) * np.exp(-np.maximum(t - a, 0.0) / max(d, 1e-4)))
    if gate is not None and gate < n / SR:
        g = max(0, s2n(gate))
        if g < n:
            lvl = e[g]
            e[g:] = lvl * np.exp(-(t[g:] - t[g]) / max(r, 1e-4))
    if end_fade:
        fade_edges(e, 0.0, end_fade)
    return e


def env_perc(n: int, a: float = 0.001, tau: float = 0.2, end_fade: float = 0.004) -> np.ndarray:
    t = tarr(n)
    att = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(a, 1e-5), 0.0, 1.0))
    e = att * np.exp(-np.maximum(t - a, 0.0) / tau)
    if end_fade:
        fade_edges(e, 0.0, end_fade)
    return e


# -------------------------------------------------------------------- filters
def rbj(kind: str, fc, q=0.7071, gain_db=0.0) -> np.ndarray:
    """RBJ-cookbook biquad(s) as sos rows [b0 b1 b2 1 a1 a2]; fc/q may be arrays."""
    fc = np.clip(np.asarray(fc, dtype=float), 5.0, NYQ * 0.995)
    q = np.asarray(q, dtype=float)
    w0 = TWO_PI * fc / SR
    cw, sw = np.cos(w0), np.sin(w0)
    alpha = sw / (2.0 * q)
    A = 10.0 ** (np.asarray(gain_db, dtype=float) / 40.0)
    one = np.ones_like(cw)
    if kind == "lp":
        b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
    elif kind == "hp":
        b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
    elif kind == "bp":
        b0 = alpha; b1 = 0 * cw; b2 = -alpha
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
    elif kind == "notch":
        b0 = one; b1 = -2 * cw; b2 = one
        a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha
    elif kind == "peak":
        b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A
        a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A
    elif kind in ("lowshelf", "highshelf"):
        al = sw / 2 * np.sqrt(2.0)
        sa = 2 * np.sqrt(A) * al
        if kind == "lowshelf":
            b0 = A * ((A + 1) - (A - 1) * cw + sa)
            b1 = 2 * A * ((A - 1) - (A + 1) * cw)
            b2 = A * ((A + 1) - (A - 1) * cw - sa)
            a0 = (A + 1) + (A - 1) * cw + sa
            a1 = -2 * ((A - 1) + (A + 1) * cw)
            a2 = (A + 1) + (A - 1) * cw - sa
        else:
            b0 = A * ((A + 1) + (A - 1) * cw + sa)
            b1 = -2 * A * ((A - 1) + (A + 1) * cw)
            b2 = A * ((A + 1) + (A - 1) * cw - sa)
            a0 = (A + 1) - (A - 1) * cw + sa
            a1 = 2 * ((A - 1) - (A + 1) * cw)
            a2 = (A + 1) - (A - 1) * cw - sa
    else:
        raise ValueError(kind)
    sos = np.stack(np.broadcast_arrays(b0 / a0, b1 / a0, b2 / a0, one, a1 / a0, a2 / a0), axis=-1)
    return sos


def sosf(x: np.ndarray, sos: np.ndarray) -> np.ndarray:
    sos = np.atleast_2d(sos)
    return signal.sosfilt(sos, x, axis=-1)


def biquad(x, kind, fc, q=0.7071, gain_db=0.0, stages=1):
    sos = np.repeat(rbj(kind, fc, q, gain_db)[None, :], stages, axis=0)
    return signal.sosfilt(sos, x, axis=-1)


def butter(x, kind, fc, order=2):
    """kind: 'lowpass' | 'highpass' | 'bandpass' (fc=(lo, hi))."""
    sos = signal.butter(order, fc, btype=kind, fs=SR, output="sos")
    return signal.sosfilt(sos, x, axis=-1)


def tv_filter(x: np.ndarray, kind: str, fc, q=0.7071, block: int = 64, stages: int = 1,
              gain_db: float = 0.0) -> np.ndarray:
    """Time-varying RBJ biquad cascade, coefficients updated every `block` samples."""
    x2 = np.atleast_2d(np.asarray(x, dtype=float))
    C, n = x2.shape
    nb = (n + block - 1) // block
    centers = np.minimum(np.arange(nb) * block + block // 2, n - 1)
    fca = np.asarray(fc, dtype=float)
    fcb = np.full(nb, float(fca)) if fca.ndim == 0 else fca[centers]
    qa = np.asarray(q, dtype=float)
    qb = np.full(nb, float(qa)) if qa.ndim == 0 else qa[centers]
    co = rbj(kind, fcb, qb, gain_db)                         # (nb, 6)
    sos_all = np.ascontiguousarray(np.repeat(co[:, None, :], stages, axis=1))   # (nb, stages, 6)
    if _sosfilt_c is not None:
        # scipy's C kernel called directly (the public wrapper costs ~100 us per call):
        # lay the signal out as (block, channel, sample) so every block is C-contiguous.
        pad = nb * block - n
        Y = np.ascontiguousarray(np.pad(x2, ((0, 0), (0, pad))).reshape(C, nb, block).transpose(1, 0, 2))
        zi = np.zeros((C, stages, 2))
        for i in range(nb):
            _sosfilt_c(sos_all[i], Y[i], zi)
        y = Y.transpose(1, 0, 2).reshape(C, nb * block)[:, :n]
    else:
        y = np.empty_like(x2)
        zi = np.zeros((stages, C, 2))
        sf = signal.sosfilt
        for i in range(nb):
            s = i * block
            e = s + block
            y[:, s:e], zi = sf(sos_all[i], x2[:, s:e], axis=-1, zi=zi)
    return y if np.ndim(x) == 2 else y[0]


def onepole_lp(x, fc):
    a = np.exp(-TWO_PI * fc / SR)
    return signal.lfilter([1 - a], [1, -a], x, axis=-1)


# ------------------------------------------------------------- stereo / noise
def pan_gains(p):
    th = (np.clip(p, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    return np.cos(th), np.sin(th)


def to_stereo(mono: np.ndarray, pan: float = 0.0) -> np.ndarray:
    gl, gr = pan_gains(pan)
    return np.stack([mono * gl, mono * gr])


def white(n: int, rng) -> np.ndarray:
    return rng.standard_normal(n)


def pink(n: int, rng) -> np.ndarray:
    w = rng.standard_normal(max(n, 2))
    W = np.fft.rfft(w)
    f = np.fft.rfftfreq(len(w), 1.0 / SR)
    f[0] = f[1]
    W /= np.sqrt(f / 1000.0)
    p = np.fft.irfft(W, len(w))[:n]
    return p / (np.std(p) + 1e-12)


def softclip(x, drive: float = 1.0):
    return np.tanh(x * drive) / np.tanh(drive)


# --------------------------------------------------------------------- tracks
class Track:
    """Stereo float32 buffer covering [t0, t1) of the film."""

    def __init__(self, t0: float, t1: float, name: str = ""):
        self.t0 = t0
        self.n0 = s2n(t0)
        self.n = s2n(t1) - self.n0
        self.name = name
        self.buf = np.zeros((2, self.n), dtype=np.float32)

    def add(self, t: float, sig: np.ndarray, gain: float = 1.0, pan: float = 0.0):
        s = np.asarray(sig)
        if s.ndim == 1:
            s = to_stereo(s, pan)
        elif pan:
            gl, gr = pan_gains(pan)
            s = s * np.array([[gl * np.sqrt(2)], [gr * np.sqrt(2)]])
        start = s2n(t) - self.n0
        a = max(0, start)
        b = min(self.n, start + s.shape[1])
        if b <= a:
            return
        self.buf[:, a:b] += (s[:, a - start:b - start] * gain).astype(np.float32)

    def gain_curve(self, g: np.ndarray):
        self.buf *= g.astype(np.float32)

    def idx(self, t: float) -> int:
        return min(max(s2n(t) - self.n0, 0), self.n)

    def times(self) -> np.ndarray:
        return (self.n0 + np.arange(self.n)) / SR


# --------------------------------------------------------------------- reverb
def make_ir(rt60: float, length: float, rng, predelay: float = 0.012, lf: float = 1.15,
            hf: float = 0.45, er_level: float = 0.5, er_taps: int = 10, er_span: float = 0.05,
            onset: float = 0.006) -> np.ndarray:
    """Stereo-decorrelated, frequency-dependent decaying-noise impulse response."""
    n = s2n(length)
    t = tarr(n)
    pd = s2n(predelay)
    ir = np.zeros((2, n + pd))
    bands = [("lowpass", 250.0, lf), ("bandpass", (250.0, 2000.0), 1.0),
             ("bandpass", (2000.0, 7000.0), 0.5 * (1.0 + hf)), ("highpass", 7000.0, hf)]
    tail_fade = np.ones(n)
    nf = int(n * 0.15)
    tail_fade[n - nf:] = 0.5 + 0.5 * np.cos(np.pi * np.arange(nf) / nf)
    for ch in range(2):
        w = rng.standard_normal(n)
        acc = np.zeros(n)
        for kind, fc, mult in bands:
            b = butter(w, kind, fc, order=2)
            acc += b * np.exp(-6.9078 * t / (rt60 * mult))
        acc *= 1.0 - np.exp(-t / onset)
        acc *= tail_fade
        lvl = np.sqrt(np.mean(acc[: s2n(0.05)] ** 2)) + 1e-9
        blip = np.hanning(7)
        for _ in range(er_taps):
            tt = rng.uniform(0.003, er_span)
            k = s2n(tt)
            amp = er_level * lvl * 6.0 * rng.uniform(0.3, 1.0) * np.exp(-tt / 0.04) * rng.choice([-1.0, 1.0])
            if k + 7 < n:
                acc[k:k + 7] += amp * blip
        ir[ch, pd:] = acc
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True)) + 1e-12
    return ir


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    """Stereo convolution over the active region of x; output same length as x."""
    out = np.zeros(x.shape, dtype=np.float32)
    idx = np.flatnonzero(np.any(np.abs(x) > 1e-12, axis=0))
    if len(idx) == 0:
        return out
    gap = max(ir.shape[1], s2n(0.5))
    brk = np.flatnonzero(np.diff(idx) > gap)          # independent active segments
    starts = np.concatenate([[idx[0]], idx[brk + 1]])
    ends = np.concatenate([idx[brk] + 1, [idx[-1] + 1]])
    irf = ir.astype(np.float32)
    for a, b in zip(starts, ends):
        for c in range(2):
            y = signal.oaconvolve(x[c, a:b].astype(np.float32), irf[c])
            m = min(len(y), x.shape[1] - a)
            out[c, a:a + m] += y[:m]
    return out


def pingpong(x: np.ndarray, delay_s: float, fb: float = 0.45, n_echo: int = 6,
             lp_fc: float = 5000.0, hp_fc: float = 250.0) -> np.ndarray:
    """Ping-pong echoes (first repeat left), each repeat darker. Returns wet only."""
    out = np.zeros(x.shape, dtype=np.float32)
    act = np.flatnonzero(np.any(x != 0, axis=0))
    if len(act) == 0:
        return out
    n = x.shape[1]
    d = s2n(delay_s)
    a = act[0]
    b = min(n, act[-1] + 1 + d * n_echo)
    m = 0.5 * (x[0, a:b] + x[1, a:b]).astype(np.float64)
    sos = np.vstack([signal.butter(2, lp_fc, "lowpass", fs=SR, output="sos"),
                     signal.butter(1, hp_fc, "highpass", fs=SR, output="sos")])
    e = m
    for k in range(1, n_echo + 1):
        e = signal.sosfilt(sos, e) * (1.0 if k == 1 else fb)
        off = k * d
        L = (b - a) - off
        if L <= 0:
            break
        out[(k - 1) % 2, a + off:a + off + L] += e[:L].astype(np.float32)
    return out


# --------------------------------------------------------- time manipulation
def read_cubic(x: np.ndarray, pos: np.ndarray) -> np.ndarray:
    """Catmull-Rom read of x (C, n) at fractional sample positions."""
    n = x.shape[-1]
    i = np.floor(pos).astype(np.int64)
    f = pos - i

    def g(k):
        return x[..., np.clip(k, 0, n - 1)]

    xm1, x0, x1, x2 = g(i - 1), g(i), g(i + 1), g(i + 2)
    c1 = 0.5 * (x1 - xm1)
    c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2
    c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1)
    return ((c3 * f + c2) * f + c1) * f + x0


def bitcrush(x: np.ndarray, bits: np.ndarray, hold: np.ndarray) -> np.ndarray:
    """Sample-and-hold rate reduction (hold >= 1 samples) + amplitude quantisation."""
    n = x.shape[-1]
    ph = np.cumsum(1.0 / np.maximum(hold, 1.0))
    k = np.floor(ph).astype(np.int64)
    change = np.empty(n, dtype=bool)
    change[0] = True
    change[1:] = k[1:] != k[:-1]
    idx = np.maximum.accumulate(np.where(change, np.arange(n), 0))
    y = x[..., idx]
    q = 2.0 ** (np.asarray(bits) - 1.0)
    return np.round(y * q) / q


def sidechain_curve(times_s: np.ndarray, kicks, depth: float, release: float = 0.17,
                    attack: float = 0.004, shape: float = 1.6) -> np.ndarray:
    """Gain curve (1 = no duck) for pumping: dips at each kick time."""
    n = len(times_s)
    duck = np.zeros(n)
    t0 = times_s[0]
    na = s2n(attack)
    nr = s2n(release)
    up = 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    down = (1.0 - smoothstep(np.arange(nr) / nr)) ** (1.0 / shape)
    seg = np.concatenate([up, down])
    for k in kicks:
        s = s2n(k - t0) - na + s2n(0.001)
        a = max(0, s)
        b = min(n, s + len(seg))
        if b > a:
            duck[a:b] = np.maximum(duck[a:b], seg[a - s:b - s])
    return 1.0 - depth * duck


# ------------------------------------------------------------ added utilities
def rc_ramp(n: int, up: bool = True) -> np.ndarray:
    """Raised-cosine ramp of n samples (0->1 if up). rc_ramp(n) + rc_ramp(n, False) == 1."""
    r = 0.5 - 0.5 * np.cos(np.pi * (np.arange(n) + 0.5) / max(n, 1))
    return r if up else r[::-1].copy()


def ms_width(x: np.ndarray, width: float) -> np.ndarray:
    m = 0.5 * (x[0] + x[1])
    s = 0.5 * (x[0] - x[1]) * width
    return np.stack([m + s, m - s])


def vari_read(x: np.ndarray, start_pos: float, rate: np.ndarray) -> np.ndarray:
    """Read x (C, n) from start_pos advancing by rate[k] samples per output sample."""
    pos = start_pos + np.concatenate([[0.0], np.cumsum(rate[:-1])])
    return read_cubic(x, pos)


def stutter(buf: np.ndarray, n0: int, start: float, end: float, src: float, length: float,
            fade: float = 0.003) -> None:
    """In place on buf (C, n) whose sample 0 is absolute sample n0.

    For t in [start, end): buf(t) = buf_in(src + ((t - start) mod length)) -- exactly the
    video's frame remap. Every boundary (region edges and each loop point) is a
    raised-cosine crossfade of `fade` seconds centred on the boundary, so the loop points
    land on the cue sample yet nothing clicks.
    """
    F = max(2, s2n(fade) // 2)
    a, b = s2n(start) - n0, s2n(end) - n0
    s = s2n(src) - n0
    L = length * SR
    x = buf.copy()
    w = np.ones(buf.shape[-1])
    w[a - F:a + F] = rc_ramp(2 * F, up=False)
    w[a + F:b - F] = 0.0
    w[b - F:b + F] = rc_ramp(2 * F, up=True)
    y = x * w
    k = 0
    while True:
        g0 = a + int(round(k * L))
        if g0 >= b:
            break
        g1 = min(a + int(round((k + 1) * L)), b)
        glen = g1 - g0
        seg = x[..., s - F:s + glen + F]
        win = np.ones(glen + 2 * F)
        win[:2 * F] = rc_ramp(2 * F, up=True)
        win[-2 * F:] = rc_ramp(2 * F, up=False)
        y[..., g0 - F:g1 + F] += seg * win
        k += 1
    buf[...] = y


def tape_stop(buf: np.ndarray, n0: int, t0: float, t1: float, power: float = 1.6,
              amp_pow: float = 0.35, kill_after: bool = True) -> None:
    """In place: from t0 the playback speed falls to zero at t1 (pitch + speed together).
    Speed curve (1-u)^power; level follows speed^amp_pow like a real tape head."""
    a, b = s2n(t0) - n0, s2n(t1) - n0
    L = b - a
    u = (np.arange(L) + 0.5) / L
    rate = (1.0 - u) ** power
    x = buf.copy()
    seg = vari_read(x, float(a), rate) * (rate ** amp_pow)
    buf[..., a:b] = remove_drift(seg)
    if kill_after:
        buf[..., b:] = 0.0


def remove_drift(seg: np.ndarray, fc: float = 25.0, xfade: float = 0.02) -> np.ndarray:
    """As a slowed-down signal approaches zero speed its waveform freezes into a slow
    DC-like drift; remove it with a zero-phase high-pass (crossfaded in over `xfade` so the
    junction with the preceding audio stays continuous) and fade the last 15 ms."""
    sos = signal.butter(2, fc, "highpass", fs=SR, output="sos")
    hp = signal.sosfiltfilt(sos, seg, axis=-1)
    n = seg.shape[-1]
    w = np.ones(n)
    k = min(n, s2n(xfade))
    w[:k] = rc_ramp(k)
    out = seg * (1.0 - w) + hp * w
    f = min(n, s2n(0.015))
    out[..., n - f:] *= rc_ramp(f, up=False)
    return out
