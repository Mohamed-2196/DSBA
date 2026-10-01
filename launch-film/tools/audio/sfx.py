"""sfx.py - every SFX kind in cues.json, synthesized. Each design returns (offset_s, stereo)
where offset_s says where the sound starts relative to its cue time (risers that must END
on a cue start early). All randomness comes from rng_for(kind, t, ...)."""
from __future__ import annotations

import numpy as np

import instruments as ins
from dsp import (SR, TWO_PI, s2n, tarr, mtof, cents, osc, phase_of, butter, biquad, tv_filter,
                 fade_edges, rng_for, smoothstep, pan_gains, softclip, bitcrush, make_ir,
                 convolve, rc_ramp)
from mixing import Mixer
from score import chord_pcs


def _norm(x, peak=1.0):
    return x * (peak / (np.max(np.abs(x)) + 1e-12))


def _st(mono, pan=0.0, width=0.0, rng=None, decor_ms=0.0):
    """mono -> stereo with pan; optional Haas-free decorrelation via a tiny allpass-ish delay."""
    gl, gr = pan_gains(pan)
    L, R = mono * gl * np.sqrt(2), mono * gr * np.sqrt(2)
    if decor_ms:
        d = s2n(decor_ms / 1000.0)
        R = np.concatenate([np.zeros(d), R[:-d]]) * 0.85 + R * 0.15 if d else R
    return np.stack([L, R])


def _env(n, a=0.001, tau=0.05, hold=0.0):
    t = tarr(n)
    att = 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(a, 1e-5), 0, 1))
    e = att * np.exp(-np.maximum(t - a - hold, 0.0) / tau)
    fade_edges(e, 0.0, 0.003)
    return e


def _noise(n, rng, kind="white"):
    w = rng.standard_normal(n)
    return w


def _sine(f, n, ph=0.0):
    return np.sin(TWO_PI * phase_of(f, n) + ph)


def _decorrelated_noise(n, rng, lo=None, hi=None, order=2):
    x = rng.standard_normal((2, n))
    if lo and hi:
        x = butter(x, "bandpass", (lo, hi), order)
    elif lo:
        x = butter(x, "highpass", lo, order)
    elif hi:
        x = butter(x, "lowpass", hi, order)
    return x


def _whoosh(dur, peak_frac, rng, f_lo=250.0, f_hi=3500.0, q=0.9, pan_from=-0.7, pan_to=0.7,
            rise=2.2, fall=1.6, tonal=0.0):
    n = s2n(dur)
    u = np.linspace(0, 1, n)
    p = peak_frac
    amp = np.where(u < p, (u / p) ** rise, ((1 - u) / (1 - p)) ** fall)
    bell = np.where(u < p, (u / p), 1 - 0.45 * (u - p) / (1 - p))
    fc = f_lo * (f_hi / f_lo) ** bell
    w = rng.standard_normal((2, n))
    y = tv_filter(w, "bp", fc, q=q, block=64, stages=2)
    y += 0.35 * tv_filter(rng.standard_normal((2, n)), "lp", fc * 2.5, q=0.7, block=64)
    y /= np.std(y) + 1e-9
    pan = pan_from + (pan_to - pan_from) * smoothstep(u)
    gl, gr = pan_gains(pan)
    y[0] *= gl * np.sqrt(2) * amp
    y[1] *= gr * np.sqrt(2) * amp
    fade_edges(y, 0.004, 0.004)
    return _norm(y)


# ================================================================ designs
def drone_in(ev, rng, ctx):
    dur = 7.6
    n = s2n(dur)
    t = tarr(n)
    f = 55.0
    x = (np.sin(TWO_PI * f * t) + 0.45 * np.sin(TWO_PI * 2 * f * t + 0.4 * np.sin(TWO_PI * 0.23 * t))
         + 0.14 * osc("tri", 3 * f * cents(4), n) + 0.08 * osc("saw", 4 * f * cents(-5), n))
    x = butter(x, "lowpass", 900.0, 2)
    air = tv_filter(rng.standard_normal((2, n)), "bp", 900 + 600 * np.sin(TWO_PI * 0.11 * t) ** 2, q=0.8,
                    block=256, stages=2)
    air /= np.std(air) + 1e-9
    y = np.stack([x, x]) + 0.22 * air
    env = smoothstep(t / 3.2) * (1 - smoothstep((t - 4.6) / (dur - 4.6)))
    y *= env
    fade_edges(y, 0.01, 0.01)
    return 0.0, _norm(y)


def pulse_blip(ev, rng, ctx):
    n = s2n(0.9)
    t = tarr(n)
    f = 880.0 * (1 + 0.05 * np.exp(-t / 0.012))
    base = np.sin(TWO_PI * phase_of(f, n)) * _env(n, 0.002, 0.06) \
        + 0.25 * np.sin(TWO_PI * phase_of(2 * f, n)) * _env(n, 0.002, 0.025) \
        + 0.5 * np.sin(TWO_PI * 110.0 * t) * _env(n, 0.003, 0.05)
    y = np.zeros((2, n))
    y += _st(base, 0.0)
    for k, (d, g, p) in enumerate(((0.19, 0.35, -0.6), (0.38, 0.18, 0.6), (0.57, 0.08, -0.4))):
        sh = s2n(d)
        e = butter(base[:n - sh], "lowpass", 3500.0 - 800 * k, 2) * g
        y[:, sh:] += _st(e, p)
    fade_edges(y, 0.0, 0.01)
    return 0.0, _norm(y)


def text_hit(ev, rng, ctx):
    i = ctx["index"]
    n = s2n(1.0)
    t = tarr(n)
    sub = ins.boom(rng, f0=85 + 10 * i, f1=44, f_tau=0.05, decay=0.28, length=1.0, click=0.1)
    crack = butter(rng.standard_normal(n), "highpass", 2200.0, 2) * _env(n, 0.0005, 0.006)
    tick = np.sin(TWO_PI * (1300 + 180 * i) * t) * _env(n, 0.001, 0.012)
    body = butter(rng.standard_normal(n), "bandpass", (180.0, 900.0), 2) * _env(n, 0.001, 0.03)
    x = 1.0 * sub + 0.35 * crack / (np.max(np.abs(crack)) + 1e-9) + 0.22 * tick + 0.25 * body / (np.max(np.abs(body)) + 1e-9)
    return 0.0, _norm(_st(x, 0.0))


def comic_ding(ev, rng, ctx):
    n = s2n(1.8)
    t = tarr(n)
    f0 = float(mtof(88))    # E6
    wob = 1 + (2 ** (18 / 1200) - 1) * np.sin(TWO_PI * 6.0 * t) * np.exp(-t / 0.35)
    x = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 0.9), (2.0, 0.25, 0.4), (2.76, 0.32, 0.35), (4.07, 0.14, 0.2), (5.4, 0.08, 0.12)):
        if f0 * r < 18000:
            x += a * np.sin(TWO_PI * phase_of(f0 * r * wob, n) + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    x *= 1 - np.exp(-t / 0.0004)
    clk = butter(rng.standard_normal(n), "highpass", 4000.0, 2) * _env(n, 0.0003, 0.002)
    x += 0.15 * clk
    fade_edges(x, 0.0, 0.02)
    return 0.0, _norm(_st(x, 0.15))


PING_SETS = {
    0: [(88, 0.0), (93, 0.045)],               # E6 -> A6 rising fourth ("ding-ding")
    1: [(91, 0.0), (86, 0.05)],                # G6 -> D6 bubble bloop down
    2: [(84, 0.0), (88, 0.032), (91, 0.064)],  # C6 E6 G6 quick tri-tone
    3: [(81, 0.0), (88, 0.06)],                # A5 -> E6 glassy FM
}


def notif_ping(ev, rng, ctx):
    tone = int(ev.get("tone", 0)) % 4
    det = rng.uniform(-22, 22)
    dec = rng.uniform(0.8, 1.25)
    n = s2n(0.32)
    t = tarr(n)
    x = np.zeros(n)
    for (m, off) in PING_SETS[tone]:
        f0 = float(mtof(m)) * cents(det)
        k = s2n(off)
        tt = t[:n - k]
        if tone == 0:     # soft marimba-ish sine pair
            s = np.sin(TWO_PI * f0 * tt) + 0.18 * np.sin(TWO_PI * 2 * f0 * tt)
            s *= _env(n - k, 0.0015, 0.06 * dec)
        elif tone == 1:   # bubble: pitch glides up into the note
            f = f0 * (1 - 0.35 * np.exp(-tt / 0.012))
            s = np.sin(TWO_PI * phase_of(f, n - k)) * _env(n - k, 0.002, 0.05 * dec)
        elif tone == 2:   # triangle-ish quick notes
            s = osc("tri", f0, n - k) * _env(n - k, 0.0015, 0.04 * dec)
        else:             # glassy FM
            mod = 1.3 * np.exp(-tt / 0.03) * np.sin(TWO_PI * f0 * 2.0 * tt)
            s = np.sin(TWO_PI * f0 * tt + mod) * _env(n - k, 0.0015, 0.07 * dec)
        x[k:] += s
    x = butter(x, "lowpass", 7000.0, 2)
    fade_edges(x, 0.0, 0.01)
    return 0.0, _norm(_st(x, float(ev.get("pan", 0.0))))


def soft_tick(ev, rng, ctx):
    n = s2n(0.08)
    t = tarr(n)
    x = butter(rng.standard_normal(n), "bandpass", (1800.0, 6000.0), 2) * _env(n, 0.0004, 0.003)
    x = x / (np.max(np.abs(x)) + 1e-9) + 0.6 * np.sin(TWO_PI * 2600 * t) * _env(n, 0.0008, 0.01) \
        + 0.4 * np.sin(TWO_PI * 420 * t) * _env(n, 0.001, 0.012)
    return 0.0, _norm(_st(x, 0.0))


def hard_stop(ev, rng, ctx):
    n = s2n(1.6)
    t = tarr(n)
    f = 30 + 70 * np.exp(-t / 0.09)
    thump = np.sin(TWO_PI * phase_of(f, n)) * _env(n, 0.001, 0.22)
    brake = tv_filter(rng.standard_normal((2, n)), "lp", 200 + 7800 * np.exp(-t / 0.07), q=1.2, block=64)
    brake *= _env(n, 0.001, 0.12)
    brake /= np.max(np.abs(brake)) + 1e-9
    clk = butter(rng.standard_normal(n), "highpass", 3000.0, 2) * _env(n, 0.0003, 0.003)
    clk /= np.max(np.abs(clk)) + 1e-9
    y = np.stack([thump, thump]) + 0.35 * brake + 0.25 * np.stack([clk, clk])
    fade_edges(y, 0.0, 0.05)
    return 0.0, _norm(y)


def reverse_riser(ev, rng, ctx):
    dur = float(ev.get("dur", 1.0))
    burst = rng.standard_normal((2, s2n(0.4))) * np.exp(-tarr(s2n(0.4)) / 0.08)
    burst = butter(burst, "highpass", 1200.0, 2)
    sw = ins.reverse_swell(burst, ctx["ir_hall"], dur, power=1.0)
    ns = ins.noise_sweep(dur, rng, 600.0, 9000.0, q=1.1, amp_pow=2.8)
    y = 0.7 * sw + 0.45 * ns
    n = y.shape[1]
    y *= np.linspace(0, 1, n) ** 1.2
    fade_edges(y, 0.01, 0.003)
    return 0.0, _norm(y)


def impact_drop(ev, rng, ctx, big=False):
    n = s2n(3.0 if big else 2.4)
    t = tarr(n)
    b = ins.boom(rng, f0=78 if big else 82, f1=36.7 if big else 41.2, f_tau=0.07, decay=0.7 if big else 0.6,
                 length=n / SR, click=0.3, sub2=0.25)
    crack = butter(rng.standard_normal((2, n)), "highpass", 1500.0, 2) * _env(n, 0.0004, 0.012)
    crack /= np.max(np.abs(crack)) + 1e-9
    body = ins.tom(rng, f=105.0 if big else 115.0, length=0.6, decay=0.15)
    tail = _decorrelated_noise(n, rng, hi=2500.0) * _env(n, 0.002, 0.45 if big else 0.32)
    tail /= np.max(np.abs(tail)) + 1e-9
    y = np.stack([b, b]) * 1.0 + 0.45 * crack + 0.15 * tail
    y[:, :len(body)] += 0.35 * body
    y = softclip(y * 1.2, 1.0)
    fade_edges(y, 0.0, 0.1)
    return 0.0, _norm(y)


def impact_drop_big(ev, rng, ctx):
    return impact_drop(ev, rng, ctx, big=True)


def whoosh(ev, rng, ctx):
    dur = float(ev.get("dur", 0.6))
    d = (-1) ** ctx["index"]
    return 0.0, _whoosh(dur, 0.35 / dur, rng, 220.0, 3800.0, pan_from=-0.75 * d, pan_to=0.75 * d)


def swish_small(ev, rng, ctx):
    dur = float(ev.get("dur", 0.3))
    d = (-1) ** ctx["index"]
    return 0.0, _whoosh(dur, 0.12 / dur, rng, 1200.0, 7500.0, q=1.1, pan_from=0.6 * d, pan_to=-0.6 * d,
                        rise=2.6, fall=1.4)


def whoosh_soft(ev, rng, ctx):
    dur = float(ev.get("dur", 0.8))
    y = _whoosh(dur, 0.55, rng, 180.0, 1600.0, q=0.7, pan_from=-0.4, pan_to=0.4, rise=1.8, fall=1.8)
    return 0.0, butter(y, "lowpass", 3500.0, 2)


def key_click(ev, rng, ctx):
    n = s2n(0.07)
    t = tarr(n)
    clk = butter(rng.standard_normal(n), "highpass", 2500.0, 2) * _env(n, 0.0002, 0.0016)
    fr = rng.uniform(2800, 4600)
    res = biquad(rng.standard_normal(n), "bp", fr, 6.0) * _env(n, 0.0003, 0.005)
    th = np.sin(TWO_PI * rng.uniform(170, 270) * t) * _env(n, 0.001, 0.012)
    x = clk / (np.max(np.abs(clk)) + 1e-9) + 0.5 * res / (np.max(np.abs(res)) + 1e-9) + 0.45 * th
    k = s2n(rng.uniform(0.018, 0.03))
    rel = butter(rng.standard_normal(n - k), "highpass", 3500.0, 2) * _env(n - k, 0.0002, 0.0012)
    x[k:] += 0.25 * rel / (np.max(np.abs(rel)) + 1e-9)
    x *= rng.uniform(0.75, 1.0)
    return 0.0, _st(_norm(x) * rng.uniform(0.75, 1.0), rng.uniform(-0.15, 0.15))


def ui_click(ev, rng, ctx):
    n = s2n(0.08)
    t = tarr(n)
    clk = butter(rng.standard_normal(n), "highpass", 1500.0, 2) * _env(n, 0.0003, 0.002)
    x = clk / (np.max(np.abs(clk)) + 1e-9) + 0.55 * np.sin(TWO_PI * 2200 * t) * _env(n, 0.0005, 0.008) \
        + 0.35 * np.sin(TWO_PI * 620 * t) * _env(n, 0.0005, 0.006)
    k = s2n(0.028)
    x[k:] += 0.3 * x[:n - k] * 0.6
    return 0.0, _norm(_st(x, 0.05))


def _pop(rng, f_a, f_b, glide=0.028, tau=0.055, n_s=0.25):
    n = s2n(n_s)
    t = tarr(n)
    f = f_b + (f_a - f_b) * np.exp(-t / glide)
    x = np.sin(TWO_PI * phase_of(f, n)) * _env(n, 0.002, tau)
    x += 0.15 * np.sin(TWO_PI * phase_of(2 * f, n)) * _env(n, 0.002, tau * 0.5)
    clk = butter(rng.standard_normal(n), "highpass", 2500.0, 2) * _env(n, 0.0003, 0.0015)
    x += 0.2 * clk / (np.max(np.abs(clk)) + 1e-9)
    fade_edges(x, 0.0, 0.01)
    return _norm(x)


def post_pop(ev, rng, ctx):
    return 0.0, _st(_pop(rng, 330.0, 980.0, 0.03, 0.07, 0.3), 0.0)


def reply_pop(ev, rng, ctx):
    i = ctx["index"]
    return 0.0, _st(_pop(rng, 480.0 + 120 * i, 1250.0 + 250 * i, 0.022, 0.05), -0.2 + 0.4 * i)


def upvote_tick(ev, rng, ctx):
    i, N = ctx["index"], ctx["count"]
    n = s2n(0.05)
    t = tarr(n)
    f = 1500.0 * 2.0 ** (i / max(N - 1, 1))
    x = np.sin(TWO_PI * f * t) * _env(n, 0.0005, 0.006)
    x += 0.3 * butter(rng.standard_normal(n), "highpass", 4000.0, 2) * _env(n, 0.0002, 0.0015)
    return 0.0, _norm(_st(x, 0.25 * np.sin(i)))


def counter_ding(ev, rng, ctx):
    n = s2n(1.6)
    t = tarr(n)
    y = np.zeros(n)
    for (m, off, a) in ((88, 0.0, 0.8), (93, 0.045, 1.0), (100, 0.09, 0.35)):
        k = s2n(off)
        y[k:] += a * ins.fm_bell(m, 1.0, rng, ratio=3.5, index=1.6, idx_tau=0.06, tau=0.55, length=(n - k) / SR)
    for j in range(5):
        k = s2n(0.02 + 0.03 * j)
        f = rng.uniform(5000, 8000)
        y[k:] += 0.06 * np.sin(TWO_PI * f * t[:n - k]) * _env(n - k, 0.0005, 0.05)
    return 0.0, _norm(_st(y, 0.1))


def countdown_hit(ev, rng, ctx):
    i = ctx["index"]
    n = s2n(2.4)
    t = tarr(n)
    b = ins.boom(rng, f0=70 + 6 * i, f1=36, f_tau=0.06, decay=0.55 + 0.12 * i, length=n / SR, click=0.2)
    f0 = float(mtof(40 + 12))        # E3 metallic clang (dominant of A minor)
    clang = np.zeros(n)
    for r, a, tau in ((1.0, 1.0, 0.5), (2.32, 0.6, 0.3), (3.07, 0.45, 0.22), (4.21, 0.3, 0.15), (5.43, 0.2, 0.1),
                      (6.8, 0.12, 0.07)):
        clang += a * np.sin(TWO_PI * f0 * r * cents(rng.uniform(-8, 8)) * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    clang *= 1 - np.exp(-t / 0.0006)
    crack = butter(rng.standard_normal((2, n)), "highpass", 1800.0, 2) * _env(n, 0.0004, 0.01)
    crack /= np.max(np.abs(crack)) + 1e-9
    y = np.stack([b, b]) + 0.28 * np.stack([clang, clang]) / (np.max(np.abs(clang)) + 1e-9) + 0.35 * crack
    y *= 0.85 + 0.075 * i
    fade_edges(y, 0.0, 0.1)
    return 0.0, y / 1.2


def ui_click_big(ev, rng, ctx):
    n = s2n(0.35)
    t = tarr(n)
    mech = butter(rng.standard_normal(n), "bandpass", (900.0, 3200.0), 2) * _env(n, 0.0003, 0.006)
    mech /= np.max(np.abs(mech)) + 1e-9
    th = np.sin(TWO_PI * phase_of(140 * (1 + 0.5 * np.exp(-t / 0.01)), n)) * _env(n, 0.001, 0.04)
    tick = np.sin(TWO_PI * 3100 * t) * _env(n, 0.0004, 0.006)
    x = mech + 0.8 * th + 0.4 * tick
    k = s2n(0.045)
    x[k:] += 0.35 * mech[:n - k]
    return 0.0, _norm(_st(x, 0.0))


def glitch_hit(ev, rng, ctx):
    i = ctx["index"]
    dur = rng.uniform(0.09, 0.2) if i else 0.28
    n = s2n(dur + 0.02)
    t = tarr(n)
    y = np.zeros((2, n))
    kinds = rng.choice(["crush", "buzz", "chirp", "grain"], size=2, replace=False)
    for kd in kinds:
        if kd == "crush":
            w = rng.standard_normal((2, n))
            hold = np.full(n, rng.uniform(6, 40))
            x = bitcrush(w * 0.6, np.full(n, rng.uniform(2.0, 4.0)), hold)
        elif kd == "buzz":
            steps = rng.uniform(80, 1400, 8)
            idx = np.minimum((t / (dur / 8)).astype(int), 7)
            f = steps[idx]
            sq = osc("square", f, n, rng.random(), fmax=1400)
            x = np.stack([sq, osc("square", f * 1.01, n, rng.random(), fmax=1420)])
        elif kd == "chirp":
            f = rng.uniform(200, 900) * (rng.uniform(4, 12)) ** (t / dur)
            f = np.minimum(f, 9000)
            mod = 3.0 * np.sin(TWO_PI * phase_of(f * 1.5, n))
            s = np.sin(TWO_PI * phase_of(f, n) + mod)
            x = np.stack([s, -s])
        else:
            g = s2n(rng.uniform(0.008, 0.025))
            src = rng.standard_normal(g) * np.hanning(g) + np.sin(TWO_PI * rng.uniform(300, 2000) * tarr(g))
            rep = np.tile(src, n // g + 1)[:n]
            x = np.stack([rep, rep * 0.8])
        x = x / (np.max(np.abs(x)) + 1e-9)
        y += x * rng.uniform(0.5, 1.0)
    env = np.ones(n)
    env *= np.where(t > dur * 0.5, np.exp(-(t - dur * 0.5) / (dur * 0.35)), 1.0)
    env[s2n(dur):] = 0
    gate = (rng.random(int(n / s2n(0.012)) + 1) > 0.25).astype(float)
    gate = np.repeat(gate, s2n(0.012))[:n]
    gate = np.convolve(gate, np.hanning(s2n(0.003)) / np.sum(np.hanning(s2n(0.003))), mode="same")
    y *= env * (0.35 + 0.65 * gate)
    y = butter(y, "highpass", 90.0, 2)
    y = butter(y, "lowpass", 12000.0, 2)
    if ctx.get("first_of_window"):
        th = ins.boom(rng, f0=95, f1=40, decay=0.18, length=0.5, click=0.3)
        y[:, :min(n, len(th))] += 0.9 * th[:min(n, len(th))]
    fade_edges(y, 0.001, 0.004)
    y = _norm(y)
    line = ctx.get("terminal_line")
    if line is not None:
        # terminal alert beep: square wave, a little higher for each line; the "found: 17
        # tutors" line (3rd) gets a double beep. The glitch burst sits under it.
        nb = s2n(0.32)
        tb = tarr(nb)
        f = float(mtof(81 + 2 * line))
        beep = np.zeros(nb)
        for k0, ln in (((0.0, 0.07), (0.1, 0.07)) if line == 2 else ((0.0, 0.11),)):
            a0, a1 = s2n(k0), s2n(k0 + ln)
            seg = osc("square", f, a1 - a0, 0.0) * 0.8 + 0.2 * np.sin(TWO_PI * f * tarr(a1 - a0))
            e = np.ones(a1 - a0)
            fade_edges(e, 0.002, 0.008)
            beep[a0:a1] += seg * e
        beep = butter(beep, "lowpass", 5000.0, 2)
        out = np.zeros((2, max(n, nb)))
        out[:, :n] += 0.45 * y
        out[:, :nb] += 0.9 * _st(_norm(beep), 0.0)
        return 0.0, _norm(out)
    return 0.0, y


def error_beep(ev, rng, ctx):
    i = ctx["index"]
    n = s2n(0.36)
    t = tarr(n)
    f1 = float(mtof(70 + i))       # each new window a semitone higher: stacking alarm
    f2 = f1 * 2 ** (-4 / 12)
    a = s2n(0.13)
    x = np.zeros(n)
    x[:a] = osc("square", f1, a, 0.0, fmax=f1) * 0.7 + 0.3 * osc("saw", f1 * 1.003, a)
    x[a:a + s2n(0.16)] = (osc("square", f2, s2n(0.16), 0.0) * 0.7 + 0.3 * osc("saw", f2 * 0.997, s2n(0.16)))
    env = np.ones(n)
    env[:a] *= _env(a, 0.003, 10.0)
    seg = slice(a, a + s2n(0.16))
    env[seg] = _env(s2n(0.16), 0.003, 0.09)
    env[a + s2n(0.16):] = 0
    x = butter(x * env, "lowpass", 4200.0, 2)
    fade_edges(x, 0.002, 0.01)
    return 0.0, _norm(_st(x, (-0.35, 0.35)[i % 2]))


def static_rise(ev, rng, ctx):
    dur = float(ev.get("dur", 0.9))
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    w = rng.standard_normal((2, n))
    lo = 900 * (1 - 0.6 * u)
    hi = 5000 + 7000 * u
    y = tv_filter(w, "hp", lo, q=0.7, block=128)
    y = tv_filter(y, "lp", hi, q=0.7, block=128)
    cr = np.zeros((2, n))
    k = rng.integers(0, n, int(400 * dur))
    cr[rng.integers(0, 2, len(k)), k] = rng.uniform(-1, 1, len(k)) * 6
    cr = butter(cr, "highpass", 2000.0, 2)
    hum = 0.25 * np.sin(TWO_PI * 60 * t) + 0.15 * np.sin(TWO_PI * 180 * t)
    y = y / (np.std(y) + 1e-9) + cr + np.stack([hum, hum])
    y *= (0.02 + 0.98 * u ** 2.6)
    fade_edges(y, 0.005, 0.003)
    return 0.0, _norm(y)


def party_popper(ev, rng, ctx):
    n = s2n(1.3)
    t = tarr(n)
    pop = butter(rng.standard_normal(n), "highpass", 800.0, 2) * _env(n, 0.0002, 0.004)
    pop /= np.max(np.abs(pop)) + 1e-9
    pop += 0.8 * np.sin(TWO_PI * phase_of(180 * (1 + 1.5 * np.exp(-t / 0.004)), n)) * _env(n, 0.0005, 0.02)
    fw = butter(rng.standard_normal(n), "highpass", 3000.0, 2) * _env(n, 0.002, 0.025)
    fw /= np.max(np.abs(fw)) + 1e-9
    conf = np.zeros((2, n))
    m = 320
    times = 0.03 + 0.9 * rng.random(m) ** 1.8
    for tt in times:
        k = s2n(tt)
        L = s2n(rng.uniform(0.002, 0.008))
        if k + L >= n:
            continue
        c = rng.integers(0, 2)
        conf[c, k:k + L] += rng.standard_normal(L) * np.hanning(L) * (1 - tt) * rng.uniform(0.3, 1.0)
    conf = butter(conf, "bandpass", (2000.0, 9000.0), 2)
    conf /= np.max(np.abs(conf)) + 1e-9
    y = np.stack([pop, pop]) + 0.3 * np.stack([fw, fw]) + 0.35 * conf
    fade_edges(y, 0.0, 0.03)
    return 0.0, _norm(y)


def party_horn(ev, rng, ctx):
    dur = 0.85
    n = s2n(dur)
    t = tarr(n)
    f = 300.0 + 150.0 * smoothstep(t / 0.12)
    f *= 1 - 0.13 * smoothstep((t - (dur - 0.2)) / 0.2)
    f *= 1 + (2 ** (40 / 1200) - 1) * np.sin(TWO_PI * 7.5 * t) * np.clip((t - 0.1) / 0.2, 0, 1)
    reed = 0.6 * osc("saw", f, n, 0.0) + 0.5 * osc("square", f * 1.004, n, 0.3)
    form = biquad(reed, "peak", 1000.0, 2.0, 9.0)
    form = biquad(form, "peak", 2500.0, 3.0, 7.0)
    form = butter(form, "highpass", 250.0, 2)
    breath = butter(rng.standard_normal(n), "bandpass", (1500.0, 6000.0), 2) * 0.12
    env = smoothstep(t / 0.03) * (1 - smoothstep((t - (dur - 0.08)) / 0.08))
    x = (form / (np.max(np.abs(form)) + 1e-9) + breath) * env
    fade_edges(x, 0.003, 0.01)
    return 0.0, _norm(_st(x, 0.2))


def term_key(ev, rng, ctx):
    n = s2n(0.03)
    t = tarr(n)
    x = butter(rng.standard_normal(n), "highpass", 3000.0, 2) * _env(n, 0.0002, 0.0012)
    x = x / (np.max(np.abs(x)) + 1e-9) + 0.5 * np.sin(TWO_PI * rng.uniform(3800, 4600) * t) * _env(n, 0.0003, 0.003)
    return 0.0, _norm(_st(x * rng.uniform(0.7, 1.0), rng.uniform(-0.1, 0.1))) * rng.uniform(0.7, 1.0)


def crescendo_noise(ev, rng, ctx):
    dur = float(ev.get("dur", 1.3))
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    w = rng.standard_normal((2, n))
    nz = tv_filter(w, "bp", 500 * (12.0 ** u), q=0.8, block=128, stages=1)
    nz /= np.std(nz) + 1e-9
    tones = np.zeros((2, n))
    for j, m in enumerate((45, 52, 57, 64, 69)):
        f = float(mtof(m)) * 2.0 ** (2.0 * u ** 1.5) * cents(rng.uniform(-30, 30))
        for c in range(2):
            tones[c] += osc("saw", f * cents((-8, 8)[c]), n, rng.random(), fmax=float(mtof(m)) * 4)
    tones = butter(tones, "lowpass", 6000.0, 2)
    tones /= np.max(np.abs(tones)) + 1e-9
    sub = np.sin(TWO_PI * phase_of(38.0 * 2.0 ** (1.2 * u), n)) * (0.3 + 0.7 * u)
    y = 0.6 * nz + 0.6 * tones + 0.5 * np.stack([sub, sub])
    cr = bitcrush(y, 12 - 7 * u, 1 + 8 * u ** 2)
    y = y * (1 - u) + cr * u
    y = butter(y, "lowpass", 11000.0, 2)
    y *= (0.05 + 0.95 * u ** 1.7)
    fade_edges(y, 0.01, 0.003)
    return 0.0, _norm(y)


def flash_impact(ev, rng, ctx):
    n = s2n(0.9)
    t = tarr(n)
    b = ins.boom(rng, f0=90, f1=40, decay=0.6, length=0.9, click=0.4)
    crack = butter(rng.standard_normal((2, n)), "highpass", 900.0, 2) * _env(n, 0.0003, 0.02)
    crack /= np.max(np.abs(crack)) + 1e-9
    siz = butter(rng.standard_normal((2, n)), "highpass", 5000.0, 2) * _env(n, 0.001, 0.25)
    siz /= np.max(np.abs(siz)) + 1e-9
    y = np.stack([b, b]) + 0.6 * crack + 0.3 * siz
    y = softclip(y * 1.3, 1.0)
    fade_edges(y, 0.0, 0.05)
    return 0.0, _norm(y)


def type_soft(ev, rng, ctx):
    n = s2n(0.06)
    t = tarr(n)
    x = butter(rng.standard_normal(n), "lowpass", rng.uniform(1800, 3000), 2) * _env(n, 0.0006, 0.004)
    x /= np.max(np.abs(x)) + 1e-9
    x += 0.6 * np.sin(TWO_PI * rng.uniform(150, 230) * t) * _env(n, 0.001, 0.014)
    x *= rng.uniform(0.6, 1.0)
    return 0.0, _st(_norm(x) * rng.uniform(0.7, 1.0), rng.uniform(-0.12, 0.12))


def riser(ev, rng, ctx):
    dur = float(ev.get("dur", 2.0))
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    ns = ins.noise_sweep(dur, rng, 300.0, 9000.0, q=1.3, amp_pow=2.3)
    root = chord_pcs(ctx["key"])[0]
    tones = np.zeros((2, n))
    for j, iv in enumerate((0, 7, 12)):
        f = float(mtof(50 + (root - 2) + iv)) * 4.0 ** (u ** 1.7)
        for c in range(2):
            tones[c] += np.sin(TWO_PI * phase_of(f * cents((-5, 5)[c] + 2 * j), n))
    tones *= u ** 2.0
    y = 0.6 * ns + 0.3 * tones / (np.max(np.abs(tones)) + 1e-9)
    fade_edges(y, 0.02, 0.04)
    return 0.0, _norm(y)


def name_chime(ev, rng, ctx):
    idx = int(ev.get("index", ctx["index"]))
    m = ctx["chime_notes"][idx % len(ctx["chime_notes"])]
    f0 = float(mtof(m))
    n = s2n(2.4)
    t = tarr(n)
    tau = float(np.clip(1.25 * (880.0 / f0) ** 0.35, 0.5, 1.6))
    x = np.zeros(n)
    for r, a, tt in ((1.0, 1.0, tau), (1.0027, 0.35, tau * 0.9), (2.0, 0.42, tau * 0.55), (3.0, 0.12, tau * 0.3),
                     (4.16, 0.10, tau * 0.18), (5.43, 0.06, tau * 0.1)):
        if f0 * r < 17000:
            x += a * np.sin(TWO_PI * f0 * r * t + rng.uniform(0, 6.28)) * np.exp(-t / tt)
    idx = 2.4 * np.exp(-t / 0.012)
    x += 0.35 * np.sin(TWO_PI * f0 * t + idx * np.sin(TWO_PI * 3.5 * f0 * t)) * np.exp(-t / 0.10)
    x *= 1 - np.exp(-t / 0.0003)
    tick = butter(rng.standard_normal(n), "highpass", 3000.0, 2) * _env(n, 0.0002, 0.002)
    x += 0.12 * tick / (np.max(np.abs(tick)) + 1e-9)
    fade_edges(x, 0.0, 0.05)
    x = butter(x, "highpass", 150.0, 2)
    pan = 0.28 * np.sin(idx * 1.3)
    return 0.0, _norm(_st(x, pan))


DESIGNS = {
    "drone_in": drone_in, "pulse_blip": pulse_blip, "text_hit": text_hit, "comic_ding": comic_ding,
    "notif_ping": notif_ping, "soft_tick": soft_tick, "hard_stop": hard_stop, "reverse_riser": reverse_riser,
    "impact_drop": impact_drop, "whoosh": whoosh, "key_click": key_click, "ui_click": ui_click,
    "post_pop": post_pop, "reply_pop": reply_pop, "upvote_tick": upvote_tick, "counter_ding": counter_ding,
    "swish_small": swish_small, "countdown_hit": countdown_hit, "ui_click_big": ui_click_big,
    "glitch_hit": glitch_hit, "error_beep": error_beep, "static_rise": static_rise,
    "party_popper": party_popper, "party_horn": party_horn, "term_key": term_key,
    "crescendo_noise": crescendo_noise, "flash_impact": flash_impact, "type_soft": type_soft,
    "riser": riser, "impact_drop_big": impact_drop_big, "name_chime": name_chime, "whoosh_soft": whoosh_soft,
}

# (bus, gain dB). Buses: ui (dry-ish), notif, big (hall), air, glitch (dry), bell (plate+hall)
LEVELS = {
    "drone_in": ("air", -19), "pulse_blip": ("bell", -17), "text_hit": ("big", -11), "comic_ding": ("bell", -15),
    "notif_ping": ("notif", -12.5), "soft_tick": ("ui", -21), "hard_stop": ("big", -9), "reverse_riser": ("air", -12),
    "impact_drop": ("big", -5), "whoosh": ("air", -5), "key_click": ("ui", -9), "ui_click": ("ui", -4),
    "post_pop": ("ui", -7), "reply_pop": ("ui", -8), "upvote_tick": ("ui", -15), "counter_ding": ("bell", -9),
    "swish_small": ("air", -5), "countdown_hit": ("big", -5), "ui_click_big": ("ui", -2),
    "glitch_hit": ("glitch", -10), "error_beep": ("glitch", -15), "static_rise": ("glitch", -1),
    "party_popper": ("big", -4), "party_horn": ("ui", -5), "term_key": ("ui", -26),
    "crescendo_noise": ("glitch", -1), "flash_impact": ("big", -5), "type_soft": ("ui", -15),
    "riser": ("air", -11), "impact_drop_big": ("big", -6.5), "name_chime": ("bell", -8), "whoosh_soft": ("air", -9),
}


def chime_notes(cues):
    """17 ascending notes of the major pentatonic of the reveal key, from its 6th degree
    (D major -> B3 D4 E4 F#4 A4 B4 ... D7): every chime on a downbeat is a 3rd or 5th of
    the chord under it, and the last one is the tonic."""
    root, _ = chord_pcs(cues["tempo"]["reveal"]["chords"][0])
    pent = {(root + i) % 12 for i in (0, 2, 4, 7, 9)}
    start = 48 + (root + 9) % 12 + (12 if (root + 9) % 12 < 6 else 0)
    out, m = [], start
    N = len(cues["names"]["times"])
    while len(out) < N:
        if m % 12 in pent:
            out.append(m)
        m += 1
    return out


def sfx_reverbs():
    return {
        "room": dict(kind="ir", ir=make_ir(0.45, 0.8, rng_for("ir", "sfxroom"), predelay=0.004), ret_db=-9),
        "plate": dict(kind="ir", ir=make_ir(1.4, 2.0, rng_for("ir", "sfxplate"), predelay=0.012, er_level=0.2),
                      ret_db=-7),
        "hall": dict(kind="ir", ir=make_ir(2.2, 3.0, rng_for("ir", "sfxhall"), predelay=0.02), ret_db=-6),
    }


def _mixer(name, t0, t1):
    mx = Mixer(name, t0, t1, sfx_reverbs())
    mx.bus("ui", gain_db=0.0, sends={"room": 0.15})
    mx.bus("notif", gain_db=0.0, hp=300, sends={"room": 0.12, "plate": 0.10}, width=1.2)
    mx.bus("big", gain_db=0.0, sends={"hall": 0.25, "room": 0.05})
    mx.bus("air", gain_db=0.0, sends={"plate": 0.12})
    mx.bus("glitch", gain_db=0.0, sends={"room": 0.06})
    mx.bus("bell", gain_db=0.0, sends={"plate": 0.22, "hall": 0.18}, width=1.2)
    return mx


def render_sfx(cues):
    """-> (pre_mixer, pre_mix, post_mixer, post_mix).

    pre  = the launch-film SFX bed (cue t < g1.start, except hard_stop): it later gets the
           same hard stop + G1 crash processing as the music ("everything cuts").
    post = everything else (the glitch SFX themselves, birthday, terminal, act 3).
    """
    g1s = cues["g1"]["start"]
    dur = cues["duration"]
    pre = _mixer("sfx_pre", 0.0, cues["g1"]["end"])
    post = _mixer("sfx_post", 0.0, dur)
    ctx_base = {"ir_hall": make_ir(2.0, 2.6, rng_for("ir", "revriser")),
                "key": cues["tempo"]["reveal"]["chords"][0],
                "chime_notes": chime_notes(cues)}
    ev_all = cues["sfx"]
    counts, seen = {}, {}
    for e in ev_all:
        counts[e["kind"]] = counts.get(e["kind"], 0) + 1
    # density-aware level for the notification wall: each ping quieter as they pile up
    pings = np.array([e["t"] for e in ev_all if e["kind"] == "notif_ping"])
    glitch_windows = [(cues["g1"]["start"], cues["g1"]["end"]), (cues["g2"]["start"], cues["g2"]["end"])]
    first_hit = {}
    for e in ev_all:
        kind = e["kind"]
        if kind not in DESIGNS:
            raise KeyError(f"no design for SFX kind {kind!r}")
        idx = seen.get(kind, 0)
        seen[kind] = idx + 1
        ctx = dict(ctx_base, index=idx, count=counts[kind])
        if kind == "glitch_hit":
            for li, ln in enumerate(cues["g2"].get("terminal_lines", [])):
                if abs(ln["t"] - e["t"]) < 1e-3:
                    ctx["terminal_line"] = li
            for w in glitch_windows:
                if w[0] <= e["t"] < w[1] and w not in first_hit:
                    first_hit[w] = e["t"]
                    ctx["first_of_window"] = True
        rng = rng_for("sfx", kind, e["t"], idx)
        off, sig = DESIGNS[kind](e, rng, ctx)
        bus, gdb = LEVELS[kind]
        g = 10 ** (gdb / 20)
        if kind == "notif_ping":
            dens = np.sum(np.abs(pings - e["t"]) < 0.25)
            g *= float(np.clip(2.2 / np.sqrt(max(dens, 1)), 0.6, 1.0))
        target = pre if (e["t"] < g1s and kind != "hard_stop") else post
        target.buses[bus].add(e["t"] + off, sig, g)
    pre_mix = pre.render()
    post_mix = post.render()
    return pre, pre_mix, post, post_mix
