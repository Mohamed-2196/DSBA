"""instruments.py - synthesized voices (drums, synths, felt piano, bells and mallets, and the
jazz-waltz trio of the birthday scene: upright bass, brushes).

All voices return float64 arrays: mono (n,) or stereo (2, n). Tonal voices are
band-limited (wavetables / additive partials kept below dsp.F_LIMIT); every
voice has an attack and an end fade so nothing clicks.
"""
from __future__ import annotations

import numpy as np

from dsp import (SR, TWO_PI, F_LIMIT, s2n, tarr, mtof, cents, osc, phase_of, env_adsr,
                 fade_edges, butter, biquad, tv_filter, softclip, pan_gains,
                 rng_for, onepole_lp)


def _norm(x, peak=1.0):
    m = np.max(np.abs(x)) + 1e-12
    return x * (peak / m)


# ====================================================================== drums
def kick(rng, f_start=165.0, f_end=47.0, f_tau=0.032, decay=0.26, length=0.55,
         click=0.22, drive=1.6):
    n = s2n(length)
    t = tarr(n)
    f = f_end + (f_start - f_end) * np.exp(-t / f_tau)
    body = np.sin(TWO_PI * phase_of(f, n))
    amp = np.exp(-t / decay) * (0.85 + 0.15 * np.exp(-t / 0.02))
    x = body * amp
    nc = s2n(0.015)
    cl = butter(rng.standard_normal(nc), "highpass", 1800.0, 2) * np.exp(-tarr(nc) / 0.0022)
    cl += 0.6 * np.sin(TWO_PI * 1250.0 * tarr(nc)) * np.exp(-tarr(nc) / 0.0018)
    x[:nc] += click * cl
    x = softclip(x * drive, 1.0)
    fade_edges(x, 0.0004, 0.02)
    return _norm(x)


def snare(rng, tone_f=195.0, tone_decay=0.07, noise_decay=0.15, length=0.4, bright=1.0,
          noise_amt=0.9):
    n = s2n(length)
    t = tarr(n)
    f = tone_f * (1.0 + 0.3 * np.exp(-t / 0.008))
    tone = (0.7 * np.sin(TWO_PI * phase_of(f, n)) * np.exp(-t / tone_decay)
            + 0.3 * np.sin(TWO_PI * phase_of(f * 1.74, n)) * np.exp(-t / (tone_decay * 0.6)))
    nz = butter(rng.standard_normal(n), "bandpass", (1200.0, min(11000.0 * bright, 16000.0)), 2)
    nz = nz / (np.std(nz[: s2n(0.05)]) + 1e-9) * 0.35
    nz *= np.exp(-t / noise_decay) * (1.0 - np.exp(-t / 0.0007))
    x = tone + noise_amt * nz
    x = softclip(x * 1.3, 1.0)
    fade_edges(x, 0.0004, 0.02)
    return _norm(x)


def clap(rng, length=0.45, decay=0.075, lo=850.0, hi=3200.0):
    n = s2n(length)
    t = tarr(n)
    env = np.zeros(n)
    for off, a in ((0.0, 0.8), (0.0085, 0.9), (0.0175, 0.75)):
        tt = t - off
        env += a * np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / 0.0035), 0.0) * (tt >= 0)
    tt = t - 0.026
    env += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / decay), 0.0)
    out = np.zeros((2, n))
    for c in range(2):
        nz = butter(rng.standard_normal(n), "bandpass", (lo, hi), 2)
        nz += 0.25 * butter(rng.standard_normal(n), "highpass", 5000.0, 2)
        out[c] = nz * env
    fade_edges(out, 0.0003, 0.02)
    return _norm(out)


_HAT_F = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * 1.48


def hat(rng, open_=False, decay=None, bright=1.0):
    decay = decay if decay is not None else (0.24 if open_ else 0.032)
    length = min(decay * 6.0, 1.4)
    n = s2n(length)
    t = tarr(n)
    metal = np.zeros(n)
    for f in _HAT_F:
        metal += osc("square", f * rng.uniform(0.995, 1.005), n, rng.random())
    nz = rng.standard_normal(n)
    x = 0.55 * metal / 6.0 + 0.6 * nz
    x = butter(x, "highpass", 6500.0 * bright, 2)
    x = biquad(x, "peak", 10500.0, 0.9, 3.0)
    x *= np.exp(-t / decay) * (1.0 - np.exp(-t / 0.0004))
    fade_edges(x, 0.0002, 0.01)
    return _norm(x)


def shaker(rng, length=0.11, decay=0.035):
    n = s2n(length)
    t = tarr(n)
    nz = butter(rng.standard_normal(n), "bandpass", (4500.0, 11000.0), 2)
    env = (1.0 - np.exp(-t / 0.006)) * np.exp(-t / decay)
    x = nz * env
    fade_edges(x, 0.001, 0.01)
    return _norm(x)


def crash(rng, length=3.0, decay=1.0, bright=1.0, hp=2500.0):
    n = s2n(length)
    t = tarr(n)
    out = np.zeros((2, n))
    for c in range(2):
        nz = butter(rng.standard_normal(n), "highpass", hp * bright, 2)
        metal = np.zeros(n)
        freqs = rng.uniform(3000.0, 11000.0, 28)
        for f in freqs:
            td = rng.uniform(0.35, 1.2) * decay
            metal += np.sin(TWO_PI * f * t + rng.uniform(0, TWO_PI)) * np.exp(-t / td)
        x = 0.8 * nz * (0.65 * np.exp(-t / (0.12 * decay)) + 0.35 * np.exp(-t / decay)) + 0.05 * metal
        x *= 1.0 - np.exp(-t / 0.0008)
        out[c] = biquad(x, "highshelf", 9000.0, 0.7, -3.0)
    fade_edges(out, 0.0003, 0.3)
    return _norm(out)


def tom(rng, f=120.0, length=0.5, decay=0.2):
    n = s2n(length)
    t = tarr(n)
    ff = f * (1.0 + 0.45 * np.exp(-t / 0.025))
    x = np.sin(TWO_PI * phase_of(ff, n)) * np.exp(-t / decay)
    nc = s2n(0.02)
    x[:nc] += 0.25 * butter(rng.standard_normal(nc), "lowpass", 2500.0, 2) * np.exp(-tarr(nc) / 0.004)
    x = softclip(x * 1.2, 1.0)
    fade_edges(x, 0.0005, 0.03)
    return _norm(x)


# ===================================================================== synths
def supersaw(midis, dur, rng, voices=7, detune=14.0, spread=0.85, attack=0.3, decay=0.6,
             sustain=1.0, release=0.6, drift=2.0, wave="saw", center_boost=1.4):
    """Chord of detuned band-limited saws, stereo spread. Returns (2, n)."""
    n = s2n(dur + release)
    t = tarr(n)
    out = np.zeros((2, n))
    offs = np.linspace(-1.0, 1.0, voices) * detune if voices > 1 else np.zeros(1)
    pans = np.linspace(-spread, spread, voices) if voices > 1 else np.zeros(1)
    order = np.argsort(np.abs(offs))       # centre voice first
    pan_for = np.empty(voices)
    # alternate sides so neighbouring detunes land on opposite channels
    side_pans = sorted(pans, key=abs)
    for j, v in enumerate(order):
        pan_for[v] = side_pans[j] * (1 if j % 2 == 0 else -1)
    for m in np.atleast_1d(midis):
        f0 = float(mtof(m))
        for v in range(voices):
            c = offs[v] + rng.uniform(-1.2, 1.2)
            rate = rng.uniform(0.12, 0.5)
            ph = rng.uniform(0, TWO_PI)
            f = f0 * cents(c) * (1.0 + (2 ** (drift / 1200) - 1) * np.sin(TWO_PI * rate * t + ph))
            sig = osc(wave, f, n, rng.random())
            g = center_boost if abs(offs[v]) < 1e-6 else 1.0
            gl, gr = pan_gains(pan_for[v])
            out[0] += sig * gl * g
            out[1] += sig * gr * g
    env = env_adsr(n, attack, decay, sustain, release / 4.0, gate=dur)
    out *= env / np.sqrt(voices * len(np.atleast_1d(midis)))
    return out


_PLUCK_CACHE: dict = {}


def pluck(midi, vel=1.0, dur=0.16, bright=1.0, variant=0, decay=0.16, fenv_tau=0.07):
    """Electro-pop pluck: 2 detuned saws + square, enveloped resonant low-pass. (2, n)"""
    key = (int(midi), round(float(vel), 2), round(float(dur), 3), round(float(bright), 2), variant,
           round(decay, 3), round(fenv_tau, 3))
    hit = _PLUCK_CACHE.get(key)
    if hit is not None:
        return hit
    rng = rng_for("pluck", *key)
    f0 = float(mtof(midi))
    n = s2n(dur + 0.3)
    t = tarr(n)
    a = osc("saw", f0 * cents(7), n, rng.random())
    b = osc("saw", f0 * cents(-7), n, rng.random())
    c = 0.45 * osc("square", f0, n, rng.random())
    x = np.stack([a + c, b + c]) * 0.5
    peak = min(1200.0 + 6500.0 * bright * vel, 15000.0)
    fc = 250.0 + 1.2 * f0 + peak * np.exp(-t / fenv_tau)
    x = tv_filter(x, "lp", fc, q=1.0, block=32, stages=2)
    env = env_adsr(n, 0.0015, decay, 0.0, 0.05, gate=dur)
    x *= env * vel
    _PLUCK_CACHE[key] = x
    return x


def bass_note(midi, dur, vel=1.0, cutoff=650.0, drive=1.8, sub=1.0, mid=0.55, attack=0.004,
              decay=0.25, sustain=0.85, release=0.035):
    f0 = float(mtof(midi))
    n = s2n(dur + release * 5)
    t = tarr(n)
    s = np.sin(TWO_PI * f0 * t)
    saw = osc("saw", f0, n, 0.0)
    saw = biquad(saw, "lp", min(cutoff, 8000.0), 0.85, stages=2)
    x = sub * s + mid * saw
    x = softclip(x * drive, 1.0)
    x = biquad(x, "lp", 3500.0, 0.7)
    x *= env_adsr(n, attack, decay, sustain, release, gate=dur)
    return x * vel


def lead_line(notes, rng, glide=0.03, vib_cents=14.0, vib_rate=5.6, cutoff=4200.0,
              attack=0.006, release=0.07, detune=8.0, sub=0.22, fenv=1.4, bright_tau=0.09,
              wave_b="saw"):
    """Monophonic lead with portamento + delayed vibrato.

    notes: list of (t, dur, midi, vel), absolute times. Returns (t_start, (2, n)).
    """
    notes = sorted(notes)
    t_start = notes[0][0] - 0.02
    t_end = max(t + d for t, d, _, _ in notes) + release * 6 + 0.05
    n = s2n(t_end - t_start)
    tt = t_start + tarr(n)
    logf = np.zeros(n)
    amp = np.zeros(n)
    vib = np.zeros(n)
    onset_env = np.zeros(n)
    for i, (t0, d, m, v) in enumerate(notes):
        a = s2n(t0 - t_start)
        b = s2n(notes[i + 1][0] - t_start) if i + 1 < len(notes) else n
        logf[a:b] = np.log2(float(mtof(m)))
        if i == 0:
            logf[:a] = np.log2(float(mtof(m)))
        e = env_adsr(n - a, attack, 0.4, 0.82, release, gate=d, end_fade=0)
        amp[a:] = np.maximum(amp[a:], e * v)
        if d > 0.5:
            k = np.arange(n - a) / SR
            ramp_in = np.clip((k - 0.2) / 0.3, 0.0, 1.0) * (k < d + release)
            vib[a:] = np.maximum(vib[a:], ramp_in)
        onset_env[a:] = np.maximum(onset_env[a:], np.exp(-np.arange(n - a) / SR / bright_tau))
    # portamento: one-pole smoothing of the log-frequency staircase (start from the first
    # pitch, not from zero state, or every phrase would begin with a sweep up from ~1 Hz)
    l0 = logf[0]
    logf = onepole_lp(logf - l0, 1.0 / (TWO_PI * glide)) + l0
    f = 2.0 ** logf
    f *= 1.0 + (2 ** (vib_cents / 1200) - 1) * vib * np.sin(TWO_PI * vib_rate * tarr(n) + 0.3)
    a1 = osc("saw", f * cents(detune), n, rng.random())
    a2 = osc(wave_b, f * cents(-detune), n, rng.random())
    s1 = osc("square", f * 0.5, n, rng.random()) * sub
    x = np.stack([a1 + 0.8 * a2 + s1, 0.8 * a1 + a2 + s1]) * 0.45
    fc = np.minimum(cutoff * (1.0 + fenv * onset_env), 16000.0)
    x = tv_filter(x, "lp", fc, q=0.9, block=64, stages=2)
    x *= amp
    fade_edges(x, 0.002, 0.01)
    return t_start, x


# ================================================================ mallets etc.
def _additive(f0, partials, n, rng, t=None):
    """partials: list of (ratio, amp, tau). Skips partials above F_LIMIT."""
    t = tarr(n) if t is None else t
    x = np.zeros(n)
    for r, a, tau in partials:
        f = f0 * r
        if f >= F_LIMIT or a == 0:
            continue
        x += a * np.sin(TWO_PI * f * t + rng.uniform(0, TWO_PI)) * np.exp(-t / tau)
    return x


def marimba(midi, vel=1.0, rng=None, length=None):
    rng = rng or rng_for("marimba", midi)
    f0 = float(mtof(midi))
    tau = float(np.clip(0.75 * (220.0 / f0) ** 0.55, 0.18, 1.1))
    n = s2n(length if length else min(5 * tau, 3.0))
    t = tarr(n)
    parts = [(1.0, 1.0, tau), (3.98, 0.22 * vel, tau * 0.22), (9.85, 0.05 * vel, tau * 0.08)]
    x = _additive(f0, parts, n, rng, t)
    x *= 0.5 - 0.5 * np.cos(np.pi * np.clip(t / 0.0025, 0, 1))
    nc = s2n(0.012)
    x[:nc] += 0.05 * butter(rng.standard_normal(nc), "lowpass", 1800.0, 2) * np.exp(-tarr(nc) / 0.003)
    fade_edges(x, 0.0, 0.01)
    return x * vel


def glock(midi, vel=1.0, rng=None, length=None, tau_scale=1.0):
    rng = rng or rng_for("glock", midi)
    f0 = float(mtof(midi))
    tau = float(np.clip(1.9 * (1000.0 / f0) ** 0.5, 0.5, 3.0)) * tau_scale
    n = s2n(length if length else min(3.5 * tau, 5.0))
    t = tarr(n)
    parts = [(1.0, 1.0, tau), (2.76, 0.28 * vel, tau * 0.22), (5.40, 0.12 * vel, tau * 0.09),
             (8.93, 0.05 * vel, tau * 0.05)]
    x = _additive(f0, parts, n, rng, t)
    x *= 1.0 - np.exp(-t / 0.0003)
    fade_edges(x, 0.0, 0.01)
    return x * vel


def fm_bell(midi, vel=1.0, rng=None, ratio=3.5, index=2.0, idx_tau=0.25, tau=2.0, length=None):
    rng = rng or rng_for("fmbell", midi)
    f0 = float(mtof(midi))
    # keep the sidebands below the limit
    index = min(index, max(0.0, (F_LIMIT / f0 - 1.0) / ratio - 1.5))
    n = s2n(length if length else min(4 * tau, 6.0))
    t = tarr(n)
    mod = index * vel * np.exp(-t / idx_tau) * np.sin(TWO_PI * f0 * ratio * t + rng.uniform(0, TWO_PI))
    x = np.sin(TWO_PI * f0 * t + mod) * np.exp(-t / tau)
    x *= 1.0 - np.exp(-t / 0.0005)
    fade_edges(x, 0.0, 0.01)
    return x * vel


def chime(midi, vel=1.0, rng=None, length=3.2):
    """Chime bell (the big chime chord on the network climax): tuned octave partials + a
    little metal + FM strike shimmer."""
    rng = rng or rng_for("chime", midi)
    f0 = float(mtof(midi))
    n = s2n(length)
    t = tarr(n)
    tau = float(np.clip(1.9 * (880.0 / f0) ** 0.4, 0.9, 2.6))
    parts = [(1.0, 1.0, tau), (1.0017, 0.35, tau * 0.95), (2.0, 0.30, tau * 0.55),
             (3.0, 0.07, tau * 0.25), (2.76, 0.10, 0.35), (5.40, 0.05, 0.12), (0.5, 0.10, tau * 0.6)]
    x = _additive(f0, parts, n, rng, t)
    x += 0.35 * fm_bell(midi, 1.0, rng, ratio=3.5, index=1.4, idx_tau=0.08, tau=0.5, length=length)
    x *= 1.0 - np.exp(-t / 0.0004)
    fade_edges(x, 0.0, 0.02)
    return x * vel


# ===================================================================== piano
def felt_piano(midi, dur, vel=0.5, rng=None, damper=0.09, strings=2, bright=1.0, kmax=16,
               detune=0.9, hammer=0.025):
    """Additive felt piano: stiff-string partials, 2-stage decay, soft hammer, damper.
    `detune` = +-cents between the unison strings (a little more = upright warmth),
    `hammer` = level of the felt thump."""
    rng = rng or rng_for("piano", midi, dur, vel)
    f0 = float(mtof(midi))
    B = 0.00011 * 2.0 ** ((midi - 48) / 12.0)
    K = int(max(1, min(kmax, 16500.0 / f0)))
    k = np.arange(1, K + 1, dtype=float)
    fk = k * f0 * np.sqrt(1.0 + B * k * k)
    kc = 1.2 + 4.5 * vel * bright
    ak = k ** -0.7 * np.exp(-(k - 1.0) / kc)
    ak *= 0.75 + 0.25 * np.abs(np.sin(np.pi * k / 7.3))
    tau1 = float(np.clip(5.5 * (110.0 / f0) ** 0.55, 0.8, 8.0))
    tk = tau1 / (1.0 + 0.11 * (k - 1.0) ** 1.35)
    keep = (fk < 16500.0) & (ak > 0.002)
    fk, ak, tk = fk[keep], ak[keep], tk[keep]
    n = s2n(dur + damper * 7 + 0.01)
    t = tarr(n)
    # x(t) = sum over strings and partials of a_k * env_k(t) * sin(2 pi f_k det t + ph), with
    # env_k = 0.55 exp(-t / 0.22 tau_k) + 0.45 exp(-t / tau_k). Evaluated block by block with
    # the angle-addition identity (sin(a + b) = sin a cos b + cos a sin b) and factored
    # exponentials: the same signal as the direct formula, several times faster.
    M = 4096
    nb = (n + M - 1) // M
    tb = np.arange(M) / SR
    E1 = np.exp(-tb[None, :] / (0.22 * tk[:, None]))
    E2 = np.exp(-tb[None, :] / tk[:, None])
    # One hammer strikes all the unison strings: they start (almost) in phase and only drift
    # apart through their slight detuning. (Independent random phases per string would give
    # every partial of every note a random level - sometimes no fundamental at all.)
    ph0 = rng.uniform(0.0, TWO_PI, len(fk))
    strs = []
    for s in range(strings):
        det = float(cents(rng.uniform(-detune, detune))) if s else 1.0
        ph = ph0 + (rng.uniform(-0.25, 0.25, len(fk)) if s else 0.0)
        ws = TWO_PI * fk * det
        arg = ws[:, None] * tb[None, :]
        strs.append((ws, ph, np.cos(arg), np.sin(arg)))
    x = np.empty(nb * M)
    acc = np.empty_like(E1)
    tmp = np.empty_like(E1)
    for j in range(nb):
        t0 = j * M / SR
        acc[:] = 0.0
        for (ws, ph, Cb, Sb) in strs:
            th = ws * t0 + ph
            np.multiply(np.sin(th)[:, None], Cb, out=tmp)
            acc += tmp
            np.multiply(np.cos(th)[:, None], Sb, out=tmp)
            acc += tmp
        a1 = 0.55 * ak * np.exp(-t0 / (0.22 * tk))
        a2 = 0.45 * ak * np.exp(-t0 / tk)
        np.multiply(a1[:, None], E1, out=tmp)
        tmp += a2[:, None] * E2
        x[j * M:(j + 1) * M] = np.einsum("km,km->m", tmp, acc)
    x = x[:n] / strings
    att = 0.002 + 0.004 * (1.0 - vel)
    x *= 0.5 - 0.5 * np.cos(np.pi * np.clip(t / att, 0, 1))
    nc = s2n(0.03)
    th = butter(rng.standard_normal(nc), "lowpass", min(4.0 * f0, 2500.0), 2) * np.exp(-tarr(nc) / 0.006)
    x[:nc] += hammer * th
    g = s2n(dur)
    if g < n:
        x[g:] *= np.exp(-(t[g:] - t[g]) / damper)
    fade_edges(x, 0.0, 0.01)
    return x * vel ** 1.3


def ep_note(midi, dur, vel=0.6, rng=None):
    """Soft FM electric-piano tine (used as a quiet layer)."""
    rng = rng or rng_for("ep", midi, dur)
    f0 = float(mtof(midi))
    n = s2n(dur + 0.6)
    t = tarr(n)
    idx = (0.9 + 1.4 * vel) * np.exp(-t / 0.25)
    mod = idx * np.sin(TWO_PI * f0 * t + rng.uniform(0, TWO_PI))
    car = np.sin(TWO_PI * f0 * t + mod)
    tine = 0.12 * vel * np.sin(TWO_PI * f0 * 14.0 * t) * np.exp(-t / 0.02) if f0 * 14 < F_LIMIT else 0.0
    x = (car + tine) * env_adsr(n, 0.002, 1.2, 0.25, 0.12, gate=dur)
    return x * vel


# ============================================================ added voices
def strings(midis, dur, rng, attack=0.7, release=1.2, voices=3, detune=7.0, lp=3000.0,
            vib_cents=9.0, vib_rate=5.2, spread=0.8):
    """Slow saw ensemble ("strings-like" pad): delayed vibrato, low-passed, stereo spread."""
    n = s2n(dur + release)
    t = tarr(n)
    out = np.zeros((2, n))
    midis = np.atleast_1d(midis)
    vib_env = np.clip((t - 0.35) / 0.8, 0.0, 1.0)
    for j, m in enumerate(midis):
        f0 = float(mtof(m))
        for v in range(voices):
            c = (v - (voices - 1) / 2.0) * detune + rng.uniform(-2.0, 2.0)
            ph = rng.uniform(0, TWO_PI)
            rate = vib_rate * rng.uniform(0.9, 1.1)
            f = f0 * cents(c) * (1.0 + (2 ** (vib_cents / 1200) - 1) * vib_env * np.sin(TWO_PI * rate * t + ph))
            sig = osc("saw", f, n, rng.random())
            p = ((v + j) % voices) / max(voices - 1, 1) * 2 - 1
            gl, gr = pan_gains(p * spread)
            out[0] += sig * gl
            out[1] += sig * gr
    out = butter(out, "lowpass", lp, 2)
    out = biquad(out, "peak", 1200.0, 0.8, -2.0)
    env = env_adsr(n, attack, 1.0, 1.0, release / 3.5, gate=dur)
    out *= env / np.sqrt(voices * len(midis))
    return out


def noise_sweep(dur, rng, f0, f1, q=1.4, amp_pow=2.0, stereo=True, block=128, hp=None):
    """Band-pass noise whose centre sweeps exponentially f0->f1 while the level rises."""
    n = s2n(dur)
    u = np.linspace(0.0, 1.0, n)
    fc = f0 * (f1 / f0) ** (u ** 1.3)
    C = 2 if stereo else 1
    w = rng.standard_normal((C, n))
    y = tv_filter(w, "bp", fc, q=q, block=block, stages=2)
    if hp:
        y = butter(y, "highpass", hp, 2)
    y /= np.std(y[:, -s2n(min(0.1, dur / 4)):]) + 1e-9
    y *= u ** amp_pow
    fade_edges(y, 0.01, 0.004)
    return y if stereo else y[0]


def boom(rng, f0=62.0, f1=31.0, f_tau=0.09, decay=0.9, length=2.2, click=0.25, sub2=0.0):
    """Cinematic sub boom: falling sine + soft transient."""
    n = s2n(length)
    t = tarr(n)
    f = f1 + (f0 - f1) * np.exp(-t / f_tau)
    x = np.sin(TWO_PI * phase_of(f, n)) * np.exp(-t / decay)
    if sub2:
        x += sub2 * np.sin(TWO_PI * phase_of(f * 2.0, n)) * np.exp(-t / (decay * 0.4))
    nc = s2n(0.04)
    tr = butter(rng.standard_normal(nc), "lowpass", 2500.0, 2) * np.exp(-tarr(nc) / 0.008)
    x[:nc] += click * tr
    x = softclip(x * 1.4, 1.0)
    x *= 1.0 - np.exp(-t / 0.0015)
    fade_edges(x, 0.0, 0.05)
    return _norm(x)


def celesta(midi, vel=1.0, rng=None, length=None):
    """Soft celesta/toy-piano chord voice (hammered bar: 1, 4, 10 partials)."""
    rng = rng or rng_for("celesta", midi)
    f0 = float(mtof(midi))
    tau = float(np.clip(0.9 * (523.0 / f0) ** 0.5, 0.35, 1.6))
    n = s2n(length if length else min(3.2 * tau, 3.0))
    t = tarr(n)
    parts = [(1.0, 1.0, tau), (2.0, 0.18, tau * 0.5), (4.0, 0.12 * vel, tau * 0.18),
             (10.1, 0.03 * vel, tau * 0.05)]
    x = _additive(f0, parts, n, rng, t)
    x *= 0.5 - 0.5 * np.cos(np.pi * np.clip(t / 0.002, 0, 1))
    fade_edges(x, 0.0, 0.01)
    return x * vel


def reverse_swell(sig, ir, length, power=1.0):
    """Reverse-reverb swell: convolve sig (2, n) with ir, reverse, keep the last `length` s.
    The result ends at its loudest point (place it so that it ends on the downbeat)."""
    from dsp import convolve as _conv
    pad = np.zeros((2, sig.shape[1] + ir.shape[1]))
    pad[:, :sig.shape[1]] = sig
    wet = _conv(pad, ir).astype(np.float64)
    rev = wet[:, ::-1]
    nz = np.flatnonzero(np.any(np.abs(rev) > 1e-7, axis=0))
    rev = rev[:, nz[0]:] if len(nz) else rev
    L = s2n(length)
    if rev.shape[1] >= L:
        rev = rev[:, rev.shape[1] - L:]
    else:
        rev = np.pad(rev, ((0, 0), (L - rev.shape[1], 0)))
    u = np.linspace(0.0, 1.0, L)
    rev = rev * (u ** power)
    fade_edges(rev, 0.02, 0.003)
    return _norm(rev)


# ============================================= jazz-waltz voices (the birthday trio)
def upright_bass(midi, dur, vel=1.0, rng=None, tau=None, release=0.07):
    """Round pizzicato double-bass note (mono).

    A plucked string: the pluck point (~1/5 of the string) thins every 5th harmonic, the
    upper partials die within a few tens of ms while the fundamental rings for about a
    second; a soft finger thump, a few cents of pitch settle at the attack and the two main
    body resonances (air ~105 Hz, top plate ~215 Hz) on top."""
    rng = rng or rng_for("ubass", midi, dur)
    f0 = float(mtof(midi))
    n = s2n(dur + release * 6 + 0.02)
    t = tarr(n)
    K = int(max(3, min(14, 4200.0 / f0)))
    k = np.arange(1, K + 1, dtype=float)
    ak = np.abs(np.sin(np.pi * k * 0.21)) / k ** 1.25
    ak /= ak[0]
    tau1 = tau if tau else float(np.clip(1.05 * (65.4 / f0) ** 0.45, 0.45, 1.3))
    tk = tau1 / (1.0 + 0.45 * (k - 1.0) ** 1.2)
    fk = k * f0 * np.sqrt(1.0 + 0.00005 * k * k)
    # the string is stretched by the pluck: starts ~10 cents sharp and settles in ~30 ms
    warp = np.cumsum(1.0 + (2 ** (10.0 / 1200) - 1) * np.exp(-t / 0.03)) / SR
    x = np.zeros(n)
    for a, f, tt in zip(ak, fk, tk):
        x += a * np.sin(TWO_PI * f * warp + rng.uniform(0.0, 0.5)) * np.exp(-t / tt)
    x *= 0.5 - 0.5 * np.cos(np.pi * np.clip(t / 0.004, 0, 1))
    nc = s2n(0.05)
    tc = tarr(nc)
    thump = butter(rng.standard_normal(nc), "lowpass", 650.0, 2) * np.exp(-tc / 0.011)
    snap = butter(rng.standard_normal(nc), "bandpass", (900.0, 2400.0), 2) * np.exp(-tc / 0.004)
    x[:nc] += 0.10 * thump / (np.max(np.abs(thump)) + 1e-9) + 0.025 * snap / (np.max(np.abs(snap)) + 1e-9)
    # the body radiates little below ~90 Hz: the low notes speak through harmonics 2-5
    x = biquad(x, "lowshelf", 85.0, 0.7, -5.0)
    x = biquad(x, "peak", 105.0, 1.2, 2.0)
    x = biquad(x, "peak", 215.0, 0.9, 3.0)
    x = butter(x, "lowpass", 2400.0, 2)
    g = s2n(dur)
    if g < n:
        x[g:] *= np.exp(-(t[g:] - t[g]) / release)
    fade_edges(x, 0.0, 0.01)
    return _norm(x) * vel


def brush_swish(rng, dur=0.5, peak=0.4, bright=1.0):
    """Wire brush swept across a coated snare head: a soft hump of scratchy mid/high noise,
    a little different in each channel, with the bristles' level flutter. (2, n)"""
    n = s2n(dur)
    u = np.linspace(0.0, 1.0, n)
    hump = np.where(u < peak, 0.5 - 0.5 * np.cos(np.pi * u / peak),
                    0.5 + 0.5 * np.cos(np.pi * (u - peak) / (1.0 - peak))) ** 1.3
    y = butter(rng.standard_normal((2, n)), "bandpass", (1100.0, min(8500.0 * bright, 14000.0)), 2)
    y = biquad(y, "peak", 3600.0, 0.9, 4.0)
    fl = butter(rng.standard_normal(n), "lowpass", 45.0, 2)
    fl = np.clip(fl / (np.std(fl) + 1e-9), -2.0, 2.0)
    head = butter(rng.standard_normal(n), "bandpass", (170.0, 260.0), 2)
    y = y / (np.std(y) + 1e-9) + 0.12 * head / (np.std(head) + 1e-9)
    y *= hump * (1.0 + 0.22 * fl)
    fade_edges(y, 0.004, 0.01)
    return _norm(y)


def brush_tap(rng, decay=0.03, tone=200.0):
    """Brush tap on the snare: the bristles land over a few ms (no stick click), a short
    burst of head noise, a hint of the drum's tone and of the snare wires. (2, n)"""
    n = s2n(0.22)
    t = tarr(n)
    att = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / 0.004, 0, 1))
    burst = butter(rng.standard_normal((2, n)), "bandpass", (800.0, 7500.0), 2)
    burst /= np.std(burst[:, :s2n(0.03)]) + 1e-9
    y = burst * att * (0.75 * np.exp(-t / decay) + 0.25 * np.exp(-t / (decay * 3.5)))
    body = np.sin(TWO_PI * phase_of(tone * (1.0 + 0.15 * np.exp(-t / 0.01)), n)) * np.exp(-t / 0.045) * att
    wires = butter(rng.standard_normal((2, n)), "bandpass", (3500.0, 9000.0), 2)
    wires /= np.std(wires) + 1e-9
    y += 0.9 * body + 0.18 * wires * att * np.exp(-t / 0.07)
    fade_edges(y, 0.0, 0.02)
    return _norm(y)


def rim(rng, f=1720.0, decay=0.016):
    """Cross-stick / rim click: a short woody knock (three inharmonic tones + a click)."""
    n = s2n(0.12)
    t = tarr(n)
    x = (np.sin(TWO_PI * f * t) * np.exp(-t / decay)
         + 0.6 * np.sin(TWO_PI * f * 0.42 * t + 0.5) * np.exp(-t / (decay * 1.7))
         + 0.3 * np.sin(TWO_PI * f * 2.37 * t) * np.exp(-t / (decay * 0.5)))
    x *= 1.0 - np.exp(-t / 0.0003)
    nc = s2n(0.006)
    x[:nc] += 0.45 * butter(rng.standard_normal(nc), "highpass", 2000.0, 2) * np.exp(-tarr(nc) / 0.0012)
    fade_edges(x, 0.0, 0.01)
    return _norm(x)
