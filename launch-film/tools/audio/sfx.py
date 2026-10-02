"""sfx.py - every SFX kind in cues.json, synthesized. Each design returns (offset_s, stereo)
where offset_s says where the sound starts relative to its cue time (risers that must END
on a cue start early). All randomness comes from rng_for(kind, t, ...).

Every kind in cues.sfx needs an entry in DESIGNS and in LEVELS: render_sfx() refuses to
build otherwise. Pitched effects take their notes from the music under them (ctx["key1"],
ctx["key"], ctx["chord"], ctx["tick_chord"]), so nothing rings against the score."""
from __future__ import annotations

import numpy as np

import instruments as ins
from dsp import (SR, TWO_PI, s2n, tarr, mtof, cents, osc, phase_of, butter, biquad, tv_filter,
                 fade_edges, rng_for, smoothstep, pan_gains, softclip, bitcrush, make_ir,
                 convolve, rc_ramp)
from mixing import Mixer
from score import chord_pcs, reveal_punch_chord


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


def node_blip(ev, rng, ctx):
    """One of the three cohort nodes lighting up: a soft, round blip. The three rise through
    the tonic chord of the launch track (root, third, fifth), left -> centre -> right."""
    i = int(ev.get("index", ctx["index"]))
    root, pcs = chord_pcs(ctx["key1"])
    tones = sorted(69 + (p - 9) % 12 for p in pcs[:3])      # voiced upward from around A4
    m = tones[i % 3] + 12 * (i // 3)
    f0 = float(mtof(m))
    n = s2n(0.75)
    t = tarr(n)
    f = f0 * (1.0 - 0.045 * np.exp(-t / 0.012))            # tiny scoop up into the note
    ph = phase_of(f, n)
    x = (np.sin(TWO_PI * ph) * _env(n, 0.004, 0.13)
         + 0.22 * np.sin(TWO_PI * 2 * ph + 0.4) * _env(n, 0.004, 0.06)
         + 0.07 * np.sin(TWO_PI * 3 * ph) * _env(n, 0.003, 0.03))
    pan = (-0.45, 0.0, 0.45)[i % 3]
    y = _st(x, pan)
    k = s2n(0.17)                                           # one soft echo from the other side
    y[:, k:] += _st(butter(x[:n - k], "lowpass", 2500.0, 2) * 0.22, -pan if pan else 0.3)
    fade_edges(y, 0.0, 0.02)
    return 0.0, _norm(y)


def count_tick(ev, rng, ctx):
    """The seven "places to check" ticking in: seven ticks climbing the pentatonic scale of
    the chord under them, the last one slightly brighter (the punch-line ding tops the run)."""
    i = int(ev.get("index", ctx["index"]))
    N = int(ev.get("of", ctx["count"]))
    last = i == N - 1
    root, _ = chord_pcs(ctx["tick_chord"])
    pent = (0, 2, 4, 7, 9)
    m = 72 + (root % 12) + pent[i % 5] + 12 * (i // 5)
    f0 = float(mtof(m))
    n = s2n(0.16 if last else 0.11)
    t = tarr(n)
    x = np.sin(TWO_PI * f0 * t) * _env(n, 0.0008, 0.034 if last else 0.022)
    x += 0.3 * np.sin(TWO_PI * 2 * f0 * t + 0.3) * _env(n, 0.0006, 0.012)
    if last:
        x += 0.22 * np.sin(TWO_PI * 3 * f0 * t) * _env(n, 0.0006, 0.02)
        x += 0.12 * np.sin(TWO_PI * 4.2 * f0 * t) * _env(n, 0.0005, 0.012)
    clk = butter(rng.standard_normal(n), "bandpass", (2200.0, 7000.0), 2) * _env(n, 0.0003, 0.0018)
    x += (0.32 if last else 0.26) * clk / (np.max(np.abs(clk)) + 1e-9)
    x += 0.2 * np.sin(TWO_PI * 330.0 * t) * _env(n, 0.001, 0.008)     # a little wooden body
    fade_edges(x, 0.0, 0.01)
    pan = -0.25 + 0.5 * i / max(N - 1, 1)
    return 0.0, _norm(_st(x, pan)) * (1.0 if last else 0.82 + 0.03 * i)


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
        # terminal alert beep: square wave, a little higher for each line; the "> found: ..."
        # line (3rd) gets a double beep. The glitch burst sits under it.
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
    # Level by the loudness of the last 150 ms, not by the peak: the crackles are random
    # spikes, and peak-normalising made the static up to 4 dB louder or quieter depending on
    # where they happened to fall (i.e. on the cue time that seeds them).
    e = y[:, -s2n(min(0.15, dur / 2)):]
    y *= 10 ** (-16.8 / 20) / (np.sqrt(np.mean(e ** 2)) + 1e-9)
    a = np.abs(y)                     # only the odd crackle above 0.9 is rounded off, below 1.0
    over = a > 0.9
    y[over] = np.sign(y[over]) * (0.9 + 0.1 * np.tanh((a[over] - 0.9) / 0.1))
    return 0.0, y


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


# shell modes of the collar bell: (Hz, level, decay s). Inharmonic, 3-9 kHz; each mode is a
# slightly split doublet (no bell is perfectly round), which gives the ring its shimmer.
JINGLE_MODES = [(3120.0, 1.00, 0.085), (3890.0, 0.80, 0.070), (4610.0, 0.90, 0.060), (5340.0, 0.60, 0.050),
                (6180.0, 0.50, 0.040), (7450.0, 0.26, 0.030), (8920.0, 0.13, 0.022)]
JINGLE_SHAKES = [(0.0, 1.0), (0.115, 0.70), (0.225, 0.88)]      # three quick shakes of the collar


def bell_jingle(ev, rng, ctx):
    """A small cat-collar jingle bell: three quick shakes. Each shake is the loose pellet
    bouncing 2-4 times inside the slotted shell (impacts a few ms apart, each weaker), and
    every impact rings the same inharmonic shell modes with different weights. No noise bed,
    nothing below 2.5 kHz: it has to be clean on its own in silence."""
    n = s2n(0.68)
    t = tarr(n)
    brng = rng_for("jingle_bell")              # the bell itself is the same object every time
    split = [f * brng.uniform(0.0012, 0.0035) for f, _, _ in JINGLE_MODES]
    y = np.zeros((2, n))
    for (ts, a) in JINGLE_SHAKES:
        tt = ts + (rng.uniform(0.0, 0.004) if ts else 0.0)   # the first impact sits on the cue
        for b in range(int(rng.integers(2, 5))):
            amp = a * 0.6 ** b * rng.uniform(0.8, 1.0)
            k = s2n(tt)
            tk = t[:n - k]
            hit = np.zeros((2, n - k))
            for (f, lvl, tau), df in zip(JINGLE_MODES, split):
                w = lvl * rng.uniform(0.45, 1.0)             # the pellet lands somewhere else each time
                ph = rng.uniform(0.0, TWO_PI, 2)
                e = np.exp(-tk / (tau * rng.uniform(0.9, 1.1)))
                lo = np.sin(TWO_PI * (f - df) * tk + ph[0]) * e
                hi = np.sin(TWO_PI * (f + df) * tk + ph[1]) * e
                hit[0] += w * (0.62 * lo + 0.38 * hi)
                hit[1] += w * (0.38 * lo + 0.62 * hi)
            hit *= 1.0 - np.exp(-tk / 0.00025)
            y[:, k:] += amp * hit
            tt += rng.uniform(0.009, 0.022)
    y = butter(y, "highpass", 2500.0, 2)
    y = butter(y, "lowpass", 12000.0, 2)
    fade_edges(y, 0.0, 0.08)
    return 0.0, _norm(y)


def lights_on(ev, rng, ctx):
    """A wall switch (lever click, then the contact snapping over 18 ms later) and a short
    warm bloom as the room lights up: a low dominant chord of the song's key, soft-attacked,
    all of it below the melody's first note, with a breath of air on top."""
    n = s2n(1.25)
    t = tarr(n)

    def click(k0, f_res, tau, body):
        m = n - k0
        tk = t[:m]
        nz = butter(rng.standard_normal(m), "bandpass", (1400.0, 6500.0), 2) * _env(m, 0.0002, 0.0016)
        c = nz / (np.max(np.abs(nz)) + 1e-9)
        c += 0.55 * np.sin(TWO_PI * f_res * tk) * _env(m, 0.0003, tau)
        c += body * np.sin(TWO_PI * 410.0 * tk) * _env(m, 0.0005, 0.009)
        out = np.zeros(n)
        out[k0:] = c
        return out

    sw = 0.8 * click(0, 2900.0, 0.0035, 0.5) + 1.0 * click(s2n(0.018), 2300.0, 0.005, 0.8)
    key = ctx.get("bday_key", "C")
    dom = (chord_pcs(key)[0] + 7) % 12                       # G for C major
    base = 36 + dom if dom >= 7 else 48 + dom                # G2
    chord = [base, base + 7, base + 12, base + 16, base + 19]   # G2 D3 G3 B3 D4
    k0 = s2n(0.02)
    m = n - k0
    tb = t[:m]
    att = smoothstep(tb / 0.14)
    dec = np.exp(-np.maximum(tb - 0.14, 0.0) / 0.3)
    bloom = np.zeros((2, m))
    for j, mm in enumerate(chord):
        f = float(mtof(mm))
        a = (1.0, 0.75, 0.8, 0.6, 0.5)[j]
        for c in range(2):
            fc = f * cents((-4, 4)[c] * (1 if j % 2 else -1))
            bloom[c] += a * (np.sin(TWO_PI * fc * tb + rng.uniform(0, 6.28))
                             + 0.25 * np.sin(TWO_PI * 2 * fc * tb + rng.uniform(0, 6.28))
                             + 0.08 * np.sin(TWO_PI * 3 * fc * tb + rng.uniform(0, 6.28)))
    bloom *= att * dec
    air = _decorrelated_noise(m, rng, lo=1500.0, hi=5500.0) * smoothstep(tb / 0.1) * np.exp(-tb / 0.16)
    y = np.zeros((2, n))
    y += 0.9 * np.stack([sw, sw]) / (np.max(np.abs(sw)) + 1e-9)
    y[:, k0:] += 0.5 * bloom / (np.max(np.abs(bloom)) + 1e-9) + 0.05 * air / (np.max(np.abs(air)) + 1e-9)
    fade_edges(y, 0.0, 0.08)
    return 0.0, _norm(y)


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


def _punch_notes(ctx):
    """The two notes of a card's ding: fifth -> root of the chord under the punch (octave 6)."""
    root, _ = chord_pcs(ctx.get("chord", ctx["key"]))
    r = 84 + root % 12
    if r > 93:
        r -= 12
    return r - 5, r


def _soft_tone(f, n, ph0=0.0):
    """Soft triangle-ish tone for the data sonifications (fundamental + weak odd partials)."""
    ph = phase_of(f, n, ph0)
    return np.sin(TWO_PI * ph) + 0.11 * np.sin(TWO_PI * 3 * ph) + 0.03 * np.sin(TWO_PI * 5 * ph)


def chart_build(ev, rng, ctx):
    """A soft, rising data sonification for each "figure" while its chart draws. It ends on
    the punch and aims at the first note of that card's ding.
      exam   bars shooting up        an accelerating upward glide, ticking faster and faster
      h0     the bell curve          a gentle bell-shaped swell, then the statistic slides out
      heart  the scatter plot        a flurry of soft plucks converging onto one note
      ci     the confidence band     two tones sweeping smoothly together until they lock
    """
    dur = float(ev.get("dur", 1.0))
    kind = ev.get("id", "exam")
    n = s2n(dur)
    t = tarr(n)
    u = t / dur
    lo_m, _ = _punch_notes(ctx)                   # first note of the ding that follows
    f_end = float(mtof(lo_m))
    y = np.zeros((2, n))
    if kind == "h0":
        g = np.exp(-0.5 * ((u - 0.33) / 0.13) ** 2)                    # the bell curve
        sl = smoothstep((u - 0.66) / 0.34) ** 1.6                      # then the slide
        f = (f_end / 4.0) * 2.0 ** (7.0 / 12.0 * g + 2.0 * sl)          # up a fifth and back, then two octaves
        x = _soft_tone(f, n) * (0.2 + 0.8 * g + 0.75 * sl)
        y += _st(x, 0.0)
        y += 0.12 * _st(_soft_tone(f + 1.5, n, 0.3) * (0.8 * g + 0.75 * sl), 0.5)     # a slow, light shimmer
        y += 0.12 * _st(_soft_tone(f - 1.5, n, 0.6) * (0.8 * g + 0.75 * sl), -0.5)
    elif kind == "heart":
        root, _ = chord_pcs(ctx["key"])
        pent = sorted(m for m in range(48, 100) if (m - root) % 12 in (0, 2, 4, 7, 9))
        tgt = lo_m - 12
        N = 24
        for k in range(N):
            v = k / (N - 1)
            tk = dur * 0.93 * v ** 0.85
            spread = 15.0 * (1.0 - v) ** 1.3
            want = tgt + rng.uniform(-spread, spread)
            m = min(pent, key=lambda q: abs(q - want)) if spread > 1.0 else tgt
            k0 = s2n(tk)
            mlen = min(n - k0, s2n(0.22))
            if mlen < 64:
                continue
            tp = tarr(mlen)
            f = float(mtof(m))
            p = (np.sin(TWO_PI * f * tp) + 0.3 * np.sin(TWO_PI * 2 * f * tp) * np.exp(-tp / 0.02)) * _env(mlen, 0.0015, 0.05)
            y[:, k0:k0 + mlen] += _st(p, rng.uniform(-0.8, 0.8) * (1.0 - v)) * (0.6 + 0.4 * v)
    elif kind == "ci":
        lock = 0.8
        w = np.clip(u / lock, 0.0, 1.0)
        e = 1.0 - (1.0 - w) ** 2.4                                      # ease-out: slows into the lock
        f1 = (f_end / 4.0) * 4.0 ** e                                   # lower bound sweeps up two octaves
        f2 = (f_end * 1.5) * (1.0 / 1.5) ** e                           # upper bound eases down a fifth
        a = (0.35 + 0.65 * smoothstep(u / 0.5)) * np.where(u > lock, np.exp(-(u - lock) * dur / 0.07), 1.0)
        y += _st(_soft_tone(f1, n) * a, -0.3 * (1.0 - w))
        y += _st(0.55 * _soft_tone(f2, n, 0.25) * a, 0.3 * (1.0 - w))
        k0 = s2n(dur * lock)                                            # the lock: a tiny double tick
        for dk, g_ in ((0, 0.5), (s2n(0.045), 0.35)):
            m = n - k0 - dk
            if m > 64:
                c = butter(rng.standard_normal(m), "bandpass", (2500.0, 8000.0), 2) * _env(m, 0.0003, 0.002)
                y[:, k0 + dk:] += g_ * np.stack([c, c]) / (np.max(np.abs(c)) + 1e-9)
    else:                                                               # "exam" and any other id
        e = u ** 2.3                                                    # accelerating
        f = (f_end / 6.0) * 6.0 ** e
        x = _soft_tone(f, n) * (0.35 + 0.65 * u)
        y += _st(x, 0.0) + 0.12 * _st(_soft_tone(f + 1.5, n, 0.4) * (0.35 + 0.65 * u), 0.4) \
            + 0.12 * _st(_soft_tone(f - 1.5, n, 0.7) * (0.35 + 0.65 * u), -0.4)
        steps = np.floor(12.0 * np.log2(f / f[0]) / 2.0)               # a tick every whole tone climbed
        for k0 in np.flatnonzero(np.diff(steps) > 0):
            m = min(n - k0, s2n(0.02))
            if m > 64:
                c = butter(rng.standard_normal(m), "highpass", 3000.0, 2) * _env(m, 0.0003, 0.0015)
                y[:, k0:k0 + m] += 0.22 * (0.4 + 0.6 * k0 / n) * np.stack([c, c]) / (np.max(np.abs(c)) + 1e-9)
    y = butter(y, "lowpass", 6500.0, 2)
    y = _norm(y)
    # a breath before the punch: the figure lets go in its last 45 ms, so the ding / stamp
    # lands in a little air instead of on top of it
    k = min(n, s2n(0.045))
    g_ = s2n(0.012)
    y[:, n - k:n - g_] *= rc_ramp(k - g_, up=False)
    y[:, n - g_:] = 0.0
    fade_edges(y, 0.012, 0.0)
    return 0.0, y


def punch_ding(ev, rng, ctx):
    """A bright, satisfying two-note ding on a card's punch: fifth -> root of the chord the
    band accents there, the second note louder and longer, a little glassy sparkle on top."""
    lo, hi = _punch_notes(ctx)
    n = s2n(1.8)
    t = tarr(n)
    y = np.zeros(n)
    for (m, off, a, tau) in ((lo, 0.0, 0.75, 0.45), (hi, 0.085, 1.0, 0.8)):
        k = s2n(off)
        f0 = float(mtof(m))
        tk = t[:n - k]
        y[k:] += a * ins.fm_bell(m, 1.0, rng, ratio=3.5, index=1.5, idx_tau=0.05, tau=tau, length=(n - k) / SR)
        y[k:] += a * 0.5 * np.sin(TWO_PI * f0 * tk) * np.exp(-tk / (tau * 1.2)) * (1 - np.exp(-tk / 0.0004))
        y[k:] += a * 0.16 * np.sin(TWO_PI * 2 * f0 * tk + 0.5) * np.exp(-tk / (tau * 0.5)) * (1 - np.exp(-tk / 0.0004))
    for j in range(4):
        k = s2n(0.09 + 0.028 * j)
        f = rng.uniform(5200, 8200)
        y[k:] += 0.05 * np.sin(TWO_PI * f * t[:n - k]) * _env(n - k, 0.0005, 0.06)
    fade_edges(y, 0.0, 0.05)
    return 0.0, _norm(_st(y, 0.08))


def stamp(ev, rng, ctx):
    """A rubber stamp slammed onto paper on a desk: a low thud, the desk's knock, and the
    slap of the paper. Short and dry."""
    n = s2n(0.42)
    t = tarr(n)
    f = 52.0 + 95.0 * np.exp(-t / 0.016)
    thud = np.sin(TWO_PI * phase_of(f, n)) * _env(n, 0.0012, 0.075)
    knock = butter(rng.standard_normal(n), "bandpass", (130.0, 520.0), 2) * _env(n, 0.001, 0.03)
    knock /= np.max(np.abs(knock)) + 1e-9
    slap = _decorrelated_noise(n, rng, lo=1300.0, hi=7500.0) * (_env(n, 0.0006, 0.011) + 0.16 * _env(n, 0.004, 0.05))
    slap /= np.max(np.abs(slap)) + 1e-9
    rub = np.sin(TWO_PI * 185.0 * t) * _env(n, 0.002, 0.022)             # the rubber die giving
    y = np.stack([thud, thud]) + 0.5 * np.stack([knock, knock]) + 0.5 * slap + 0.3 * np.stack([rub, rub])
    y = softclip(y * 1.25, 1.0)
    fade_edges(y, 0.0, 0.04)
    return 0.0, _norm(y)


def node_swarm(ev, rng, ctx):
    """The ~160 student dots appearing: a shimmer of as many tiny plucks, scattered across
    the stereo field and across three octaves of the key's pentatonic scale."""
    dur = float(ev.get("dur", 0.8))
    N = int(ev.get("count", 160))
    n = s2n(dur + 0.35)
    root, _ = chord_pcs(ctx["key"])
    pent = [m for m in range(74, 103) if (m - root) % 12 in (0, 2, 4, 7, 9)]
    y = np.zeros((2, n))
    times = np.sort(dur * rng.random(N) ** 0.9)
    for tk in times:
        k0 = s2n(tk)
        m = n - k0
        L = min(m, s2n(0.16))
        tp = tarr(L)
        f = float(mtof(pent[int(rng.integers(0, len(pent)))])) * cents(rng.uniform(-6, 6))
        p = np.sin(TWO_PI * f * tp + rng.uniform(0, 6.28)) * _env(L, 0.001, rng.uniform(0.02, 0.045))
        bell = np.sin(np.pi * np.clip(tk / dur, 0, 1)) ** 0.6           # the swarm swells and thins
        y[:, k0:k0 + L] += _st(p, rng.uniform(-0.9, 0.9)) * rng.uniform(0.35, 1.0) * (0.35 + 0.65 * bell)
    y = butter(y, "highpass", 900.0, 2)
    fade_edges(y, 0.002, 0.05)
    return 0.0, _norm(y)


def gather_swell(ev, rng, ctx):
    """An airy, rising whoosh-swell that peaks exactly `dur` after its cue (the climax):
    noise through a rising band, plus breathy resonances on the tonic chord fading in."""
    dur = float(ev.get("dur", 1.4))
    top = dur - 0.035                 # it crests a breath before the climax chord and gets out of its way
    n = s2n(dur + 0.08)
    t = tarr(n)
    u = np.clip(t / top, 0.0, 1.0)
    amp = u ** 2.3
    amp[t > top] = np.exp(-(t[t > top] - top) / 0.014)
    fc = 450.0 * (6500.0 / 450.0) ** (u ** 1.2)
    w = tv_filter(rng.standard_normal((2, n)), "bp", fc, q=0.8, block=64, stages=2)
    w /= np.std(w[:, s2n(dur * 0.8):s2n(dur)]) + 1e-9
    root, _ = chord_pcs(ctx["key"])
    r = 74 + (root - 2) % 12                                  # around D5
    air = np.zeros((2, n))
    for j, iv in enumerate((0, 7, 12, 16, 19)):
        f = float(mtof(r + iv)) * 2.0 ** (-0.18 * (1.0 - u) ** 2)       # drifts up into pitch
        b = tv_filter(rng.standard_normal((2, n)), "bp", f, q=28.0, block=64, stages=1)
        air += (1.0, 0.8, 0.7, 0.5, 0.45)[j] * b / (np.std(b) + 1e-9)
    air /= np.std(air[:, s2n(dur * 0.8):s2n(dur)]) + 1e-9
    y = (0.75 * w + 0.6 * air) * amp
    y = butter(y, "highpass", 250.0, 2)
    fade_edges(y, 0.02, 0.05)
    return 0.0, _norm(y)


def chime_big(ev, rng, ctx):
    """A rich chime chord in the key of the reveal, struck as one gesture (rolled upward in
    ~90 ms) and left to ring: tonic bell low and wide, fifths, the third and the octave."""
    root, _ = chord_pcs(ctx["key"])
    r = 62 + (root - 2) % 12                                  # D4
    notes = [(r, 0.9, -0.15), (r + 12, 1.0, 0.2), (r + 19, 0.8, -0.35), (r + 24, 0.85, 0.35),
             (r + 28, 0.6, -0.1), (r + 31, 0.5, 0.45), (r + 36, 0.35, -0.45)]
    L = 4.2
    n = s2n(L + 0.2)
    y = np.zeros((2, n))
    for i, (m, a, pan) in enumerate(notes):
        k = s2n(0.014 * i)
        for dc, g, pp in ((-2.5, 0.6, -0.12), (2.5, 0.6, 0.12)):         # two slightly detuned strikes: chorus
            c = ins.chime(m + dc / 100.0, a, rng, length=L)
            y[:, k:k + len(c)] += _st(c * g, float(np.clip(pan + pp, -1, 1)))
    y = butter(y, "highpass", 180.0, 2)
    fade_edges(y, 0.0, 0.6)
    return 0.0, _norm(y)


DESIGNS = {
    "drone_in": drone_in, "node_blip": node_blip, "text_hit": text_hit, "count_tick": count_tick,
    "comic_ding": comic_ding, "notif_ping": notif_ping, "soft_tick": soft_tick, "hard_stop": hard_stop,
    "reverse_riser": reverse_riser, "impact_drop": impact_drop, "whoosh": whoosh, "key_click": key_click,
    "ui_click": ui_click, "post_pop": post_pop, "reply_pop": reply_pop, "upvote_tick": upvote_tick,
    "counter_ding": counter_ding, "swish_small": swish_small, "countdown_hit": countdown_hit,
    "ui_click_big": ui_click_big, "glitch_hit": glitch_hit, "error_beep": error_beep, "static_rise": static_rise,
    "bell_jingle": bell_jingle, "lights_on": lights_on, "party_popper": party_popper, "term_key": term_key,
    "crescendo_noise": crescendo_noise, "flash_impact": flash_impact, "type_soft": type_soft,
    "riser": riser, "impact_drop_big": impact_drop_big, "chart_build": chart_build, "punch_ding": punch_ding,
    "stamp": stamp, "node_swarm": node_swarm, "gather_swell": gather_swell, "chime_big": chime_big,
    "whoosh_soft": whoosh_soft,
}

# (bus, gain dB). Buses: ui (dry-ish), notif, big (hall), air, glitch (dry), bell (plate+hall),
# tiny (small room: the collar bell)
LEVELS = {
    "drone_in": ("air", -19), "node_blip": ("bell", -15), "text_hit": ("big", -11), "count_tick": ("ui", -11),
    "comic_ding": ("bell", -15),
    "notif_ping": ("notif", -12.5), "soft_tick": ("ui", -21), "hard_stop": ("big", -9), "reverse_riser": ("air", -12),
    "impact_drop": ("big", -5), "whoosh": ("air", -5), "key_click": ("ui", -9), "ui_click": ("ui", -4),
    "post_pop": ("ui", -7), "reply_pop": ("ui", -8), "upvote_tick": ("ui", -15), "counter_ding": ("bell", -9),
    "swish_small": ("air", -5), "countdown_hit": ("big", -5), "ui_click_big": ("ui", -2),
    "glitch_hit": ("glitch", -10), "error_beep": ("glitch", -15), "static_rise": ("glitch", -1),
    "bell_jingle": ("tiny", -12), "lights_on": ("air", -9), "party_popper": ("big", -9), "term_key": ("ui", -26),
    "crescendo_noise": ("glitch", -1), "flash_impact": ("big", -5), "type_soft": ("ui", -15),
    "riser": ("air", -11), "impact_drop_big": ("big", -6.5), "chart_build": ("notif", -13.5),
    "punch_ding": ("bell", -8.5), "stamp": ("ui", -3), "node_swarm": ("bell", -9), "gather_swell": ("air", -5),
    "chime_big": ("bell", -8), "whoosh_soft": ("air", -9),
}


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
    mx.bus("tiny", gain_db=0.0, hp=1500, sends={"room": 0.10, "plate": 0.10}, width=1.1)
    return mx


def check_kinds(cues):
    """Fail loudly if the cue sheet asks for an SFX kind that cannot be rendered."""
    kinds = sorted({e["kind"] for e in cues["sfx"]})
    missing = [k for k in kinds if k not in DESIGNS]
    unlevelled = [k for k in kinds if k in DESIGNS and k not in LEVELS]
    if missing or unlevelled:
        raise KeyError("cues.sfx uses SFX kinds that sfx.py cannot render - "
                       f"no design: {missing or 'none'}; no level/bus: {unlevelled or 'none'}. "
                       "Add them to DESIGNS and LEVELS in tools/audio/sfx.py.")
    return kinds


def render_sfx(cues, epochs):
    """-> (pre_mixer, pre_mix, [(post_mixer, post_mix), ...]).

    pre  = the launch-film SFX bed (cue t < g1.start, except hard_stop): it later gets the
           same hard stop + G1 crash processing as the music ("everything cuts").
    post = everything else, one mixer per epoch. `epochs` are the stretches between the cue
           sheet's black / silence spans; a mixer ends where its epoch ends, so no reverb
           tail survives a silence (the collar bell after G1 and the letter after G2 start
           from nothing).
    """
    check_kinds(cues)
    g1s = cues["g1"]["start"]
    pre = _mixer("sfx_pre", 0.0, cues["g1"]["end"])
    posts = [_mixer(f"sfx_post{i + 1}", a, b) for i, (a, b) in enumerate(epochs)]
    ev_all = cues["sfx"]
    T1 = cues["tempo"]["act1"]
    ticks = [e["t"] for e in ev_all if e["kind"] == "count_tick"]
    tick_chord = T1["chords"][int((min(ticks) - T1.get("first_beat", 0.0)) // T1["bar_seconds"]) % len(T1["chords"])] \
        if ticks else T1["chords"][0]
    ctx_base = {"ir_hall": make_ir(2.0, 2.6, rng_for("ir", "revriser")),
                "key": cues["tempo"]["reveal"]["chords"][0],
                "key1": T1["chords"][0],
                "tick_chord": tick_chord,
                "bday_key": cues["tempo"]["birthday"].get("key", "C major").split()[0]}
    counts, seen = {}, {}
    for e in ev_all:
        counts[e["kind"]] = counts.get(e["kind"], 0) + 1
    # density-aware level for the notification wall: each ping quieter as they pile up
    pings = np.array([e["t"] for e in ev_all if e["kind"] == "notif_ping"])
    glitch_windows = [(cues["g1"]["start"], cues["g1"]["end"]), (cues["g2"]["start"], cues["g2"]["end"])]
    first_hit = {}
    for e in ev_all:
        kind = e["kind"]
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
        if kind in ("chart_build", "punch_ding", "stamp"):
            # the chord the band accents on this card's punch (a build ends on its punch)
            ctx["chord"] = reveal_punch_chord(cues, e["t"] + float(e.get("dur", 0.0)))
        rng = rng_for("sfx", kind, e["t"], idx)
        off, sig = DESIGNS[kind](e, rng, ctx)
        bus, gdb = LEVELS[kind]
        g = 10 ** (gdb / 20)
        if kind == "notif_ping":
            dens = np.sum(np.abs(pings - e["t"]) < 0.25)
            g *= float(np.clip(2.2 / np.sqrt(max(dens, 1)), 0.6, 1.0))
        if e["t"] < g1s and kind != "hard_stop":
            target = pre
        else:
            home = [mx for mx, (a, b) in zip(posts, epochs) if a - 1e-9 <= e["t"] < b]
            if not home:
                raise ValueError(f"SFX cue {kind!r} at {e['t']} s lies inside a black/silence span of the cue sheet")
            target = home[0]
        target.buses[bus].add(e["t"] + off, sig, g)
    pre_mix = pre.render()
    return pre, pre_mix, [(mx, mx.render()) for mx in posts]
