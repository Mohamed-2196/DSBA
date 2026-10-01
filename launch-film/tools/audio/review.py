"""review.py - objective checks of the rendered soundtrack: onsets vs cues, stutter loop
lock, chord chroma, music-box pitch, loudness/RMS per section, spectrogram/waveform PNGs."""
from __future__ import annotations

import numpy as np
from scipy import signal

from dsp import SR, s2n, mtof, rng_for
from score import chord_pcs

PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _zp_filter(x, band, order=4):
    lo, hi = band
    if lo and hi:
        sos = signal.butter(order, (lo, hi), "bandpass", fs=SR, output="sos")
    elif lo:
        sos = signal.butter(order, lo, "highpass", fs=SR, output="sos")
    elif hi:
        sos = signal.butter(order, hi, "lowpass", fs=SR, output="sos")
    else:
        return x
    return signal.sosfiltfilt(sos, x)          # zero phase: no group-delay bias


# ------------------------------------------------------------------- onsets
def onset_time(x, t_exp, search=0.03, band=(1500.0, None), win=None, d=0.002):
    """Onset near t_exp: steepest rise of the band-limited log energy (centred moving
    average over `win`, backward difference over `d`). For an energy step at t0 that
    difference peaks at t0 - win/2 + d, which is corrected for. Returns (t, rise dB)."""
    mono = x.mean(axis=0) if x.ndim == 2 else x
    pad = 0.15
    a = max(0, s2n(t_exp - search - pad))
    b = min(len(mono), s2n(t_exp + search + pad))
    seg = _zp_filter(mono[a:b].astype(np.float64), band)
    w = win if win else max(0.003, 3.0 / (band[0] or 300.0))
    k = max(2, s2n(w))
    c = np.concatenate([[0.0], np.cumsum(seg ** 2)])
    idx = np.arange(len(seg))
    lo = np.clip(idx - k // 2, 0, len(seg))
    hi = np.clip(idx - k // 2 + k, 0, len(seg))
    e = (c[hi] - c[lo]) / k
    le = 10 * np.log10(e + 1e-14)
    D = s2n(d)
    rise = np.full(len(le), -np.inf)
    rise[D:] = le[D:] - le[:-D]
    t = (a + idx) / SR
    m = (t >= t_exp - search) & (t <= t_exp + search)
    if not np.any(m):
        return np.nan, 0.0
    i = np.flatnonzero(m)[np.argmax(rise[m])]
    return float(t[i] + (k // 2 - D) / SR), float(rise[i])


def onset_report(x, items, band=(1500.0, None), search=0.03, win=None):
    rows = []
    for lab, t in items:
        to, strength = onset_time(x, t, search=search, band=band, win=win)
        rows.append((lab, t, to, (to - t) * 1000.0, strength))
    return rows


def detector_selftest():
    """Synthetic onsets at known times (inside other sound) -> max abs error in ms."""
    rng = rng_for("selftest")
    n = s2n(3.0)
    t = np.arange(n) / SR
    errs = []
    base = 0.02 * rng.standard_normal(n)
    for k, (t0, kind) in enumerate([(0.731, "noise"), (1.517, "bell"), (2.263, "tone")]):
        x = base.copy()
        i0 = s2n(t0)
        tt = t[i0:] - t0
        if kind == "noise":
            x[i0:] += rng.standard_normal(n - i0) * np.exp(-tt / 0.08)
            band = (1500.0, None)
        elif kind == "bell":
            prev = s2n(t0 - 0.5)
            x[prev:] += 0.5 * np.sin(2 * np.pi * 311.0 * (t[prev:] - t[prev])) * np.exp(-(t[prev:] - t[prev]) / 1.0)
            x[i0:] += sum(a * np.sin(2 * np.pi * 247.0 * r * tt + rng.uniform(0, 6)) * np.exp(-tt / 0.8)
                          for r, a in ((1, 1), (2, 0.4), (5.4, 0.1)))
            band = (150.0, None)
        else:
            x[i0:] += 0.6 * np.sin(2 * np.pi * 523.0 * tt) * np.minimum(tt / 0.003, 1) * np.exp(-tt / 0.6)
            band = (300.0, None)
        to, _ = onset_time(x, t0 + rng.uniform(-0.01, 0.01), band=band)
        errs.append((kind, (to - t0) * 1000.0))
    return errs


# --------------------------------------------------------------- loop lock
def loop_lock(out, n0_out, src, n0_src, start, length, end, src_t, guard=0.003, use=None, maxlag=0.006):
    """For each stutter loop k, correlate the loop's audio (inside its crossfades) with the
    source slice at lags +-maxlag: returns [(k, t_loop, lag_ms, corr)]. lag 0 = sample-exact."""
    om = out.mean(axis=0) if out.ndim == 2 else out
    sm = src.mean(axis=0) if src.ndim == 2 else src
    M = s2n(maxlag)
    rows = []
    k = 0
    while start + k * length < end - 1e-9:
        g0 = start + k * length
        g1 = min(start + (k + 1) * length, end)
        L = (g1 - g0) - 2 * guard
        if use:
            L = min(L, use)
        if L <= 0.002:
            break
        a = s2n(g0 + guard) - n0_out
        o = om[a:a + s2n(L)]
        s0 = s2n(src_t + guard) - n0_src
        win = sm[s0 - M:s0 + len(o) + M]
        num = np.correlate(win, o, mode="valid")              # lags -M..+M
        c2 = np.concatenate([[0.0], np.cumsum(win ** 2)])
        den = np.sqrt((c2[len(o):] - c2[:-len(o)]) * np.sum(o ** 2)) + 1e-12
        r = num / den
        j = int(np.argmax(r))
        rows.append((k, g0, (j - M) / SR * 1000.0, float(r[j])))
        k += 1
    return rows


# ------------------------------------------------------------------- chroma
def chroma(x, t0, t1, fmin=80.0, fmax=2000.0, tol=0.3):
    """Pitch-class energy, counting only spectrum within +-tol semitones of an equal-tempered
    pitch (so e.g. the 7th/11th harmonics of a saw bass, which fall between semitones,
    are not mistaken for wrong notes)."""
    mono = x.mean(axis=0)
    seg = mono[s2n(t0):s2n(t1)]
    if len(seg) < 1024 or np.max(np.abs(seg)) < 1e-6:
        return None
    S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
    f = np.fft.rfftfreq(len(seg), 1.0 / SR)
    m = (f >= fmin) & (f <= fmax)
    midi = 69 + 12 * np.log2(f[m] / 440.0)
    near = np.abs(midi - np.round(midi)) <= tol
    pcs = np.mod(np.round(midi[near]), 12).astype(int)
    c = np.bincount(pcs, weights=S[m][near], minlength=12)
    return c / (c.max() + 1e-12)


def chord_check(x, bars):
    """bars: [(t0, t1, chord_name)] -> rows (t0, chord, top4 names, ok). ok = root in the top 4,
    two triad tones in the top 3, strongest class a chord tone or a 6th/7th/9th colour."""
    rows = []
    for (t0, t1, name) in bars:
        c = chroma(x, t0 + 0.05, t1 - 0.05)
        if c is None:
            continue
        top = list(np.argsort(c)[::-1][:4])
        r, pcs = chord_pcs(name.split("|")[0])
        triad = pcs[:3]
        ok = (r in top) and sum(p in top[:3] for p in triad) >= 2 \
            and top[0] in pcs + [(r + d) % 12 for d in (2, 9, 10, 11)]
        rows.append((t0, name, [PC[p] for p in top], ok))
    return rows


# --------------------------------------------------------------- pitch check
def box_pitch_check(box, n0, melody):
    """Dry music-box bus: strongest candidate fundamental (MIDI 55-90) just after each note,
    minus what was already ringing before it (skipped for repeated pitches)."""
    mono = box.mean(axis=0) if box.ndim == 2 else box
    N = 16384
    f = np.fft.rfftfreq(N, 1.0 / SR)
    cand = np.arange(55, 91)

    def sal(seg):
        S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), N))
        out = []
        for m in cand:
            fm = float(mtof(m))
            sel = (f > fm * 2 ** (-0.3 / 12)) & (f < fm * 2 ** (0.3 / 12))
            out.append(S[sel].max() if np.any(sel) else 0.0)
        return np.array(out)

    rows = []
    prev = None
    for nt in melody:
        t = nt["t"]
        a = s2n(t + 0.004) - n0
        post = sal(mono[a:a + s2n(0.05)])
        pre = sal(mono[a - s2n(0.058):a - s2n(0.008)]) if a > s2n(0.06) else 0 * post
        score = post if prev == nt["midi"] else post - 0.8 * pre
        got = int(cand[int(np.argmax(score))])
        rows.append((t, nt["syl"], nt["midi"], got, got == nt["midi"]))
        prev = nt["midi"]
    return rows


# ------------------------------------------------------------------- levels
def section_table(x, sections):
    import pyloudnorm as pyln
    meter = pyln.Meter(SR)
    rows = []
    for lab, (a, b) in sections.items():
        seg = x[:, s2n(a):s2n(b)]
        rms = np.sqrt(np.mean(seg ** 2)) + 1e-12
        pk = np.max(np.abs(seg)) + 1e-12
        try:
            L = meter.integrated_loudness(np.ascontiguousarray(seg.T)) if (b - a) >= 0.5 and pk > 1e-6 else -np.inf
        except Exception:
            L = -np.inf
        rows.append((lab, a, b, L, 20 * np.log10(rms), 20 * np.log10(pk)))
    return rows


# -------------------------------------------------------------------- plots
def plot_overview(path, x, cues, st_t, st_v, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    mono = x.mean(axis=0)
    fig, ax = plt.subplots(3, 1, figsize=(22, 11), sharex=True,
                           gridspec_kw={"height_ratios": [1.1, 2.2, 1.0]})
    cols = 4000
    n = len(mono)
    k = n // cols
    mm = mono[:k * cols].reshape(cols, k)
    tt = (np.arange(cols) + 0.5) * k / SR
    ax[0].fill_between(tt, mm.min(axis=1), mm.max(axis=1), color="#1f4e8c", lw=0)
    ax[0].set_ylim(-1, 1)
    ax[0].set_ylabel("waveform")
    f, t, S = signal.spectrogram(mono, SR, nperseg=2048, noverlap=1024, scaling="spectrum")
    ax[1].pcolormesh(t, f, 10 * np.log10(S + 1e-12), vmin=-110, vmax=-20, cmap="magma", shading="auto")
    ax[1].set_yscale("symlog", linthresh=200)
    ax[1].set_ylim(30, 20000)
    ax[1].set_ylabel("Hz")
    ax[2].plot(st_t, st_v, color="#c0392b")
    ax[2].axhline(-14, color="gray", ls="--", lw=0.8)
    ax[2].set_ylim(-45, -5)
    ax[2].set_ylabel("short-term LUFS (3 s)")
    for s in cues["scenes"]:
        for a in ax:
            a.axvline(s["start"], color="#2ecc71", lw=0.7, alpha=0.8)
        ax[0].text(s["start"] + 0.2, 0.85, s["id"].split("_", 1)[1], fontsize=8, color="#145a32")
    ax[2].set_xlabel("seconds")
    ax[0].set_title(title)
    ax[2].set_xlim(0, x.shape[1] / SR)
    fig.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)


def plot_zoom(path, x, t0, t1, marks, title, extra=None, extra_label=""):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    a, b = s2n(t0), s2n(t1)
    mono = x[:, a:b].mean(axis=0)
    rows = 3 if extra is not None else 2
    fig, ax = plt.subplots(rows, 1, figsize=(22, 4.2 * rows), sharex=True)
    cols = 6000
    k = max(1, len(mono) // cols)
    mmn = mono[:k * (len(mono) // k)].reshape(-1, k)
    tc = t0 + (np.arange(mmn.shape[0]) + 0.5) * k / SR
    ax[0].fill_between(tc, mmn.min(axis=1), mmn.max(axis=1), color="#1f4e8c", lw=0)
    ax[0].set_ylim(-1, 1)
    ax[0].set_ylabel("mix.wav")
    f, t, S = signal.spectrogram(mono, SR, nperseg=1024, noverlap=896, scaling="spectrum")
    ax[1].pcolormesh(t + t0, f, 10 * np.log10(S + 1e-12), vmin=-110, vmax=-20, cmap="magma", shading="auto")
    ax[1].set_yscale("symlog", linthresh=200)
    ax[1].set_ylim(30, 20000)
    ax[1].set_ylabel("mix spectrogram (Hz)")
    if extra is not None:
        s_m = extra[:, a:b].mean(axis=0)
        ss = s_m[:k * (len(s_m) // k)].reshape(-1, k)
        ax[2].fill_between(tc, ss.min(axis=1), ss.max(axis=1), color="#8e44ad", lw=0)
        ax[2].set_ylim(-1, 1)
        ax[2].set_ylabel(extra_label)
    for (tm, lab, col) in marks:
        if t0 <= tm <= t1:
            for a_ in ax:
                a_.axvline(tm, color=col, lw=0.8, alpha=0.85)
            ax[0].text(tm, 0.9, lab, fontsize=7, rotation=90, va="top", color=col)
    ax[0].set_title(title)
    ax[-1].set_xlabel("seconds")
    ax[-1].set_xlim(t0, t1)
    fig.tight_layout()
    fig.savefig(path, dpi=80)
    plt.close(fig)


# ------------------------------------------------------------- edge/click check
def edge_report(x, edges):
    """Hard edges must be click-free. For a cut INTO silence at t: peak |x| in the last
    0.5 ms before t relative to the RMS 10-30 ms before t. For a start FROM silence at t:
    peak |x| in the first 0.25 ms after t relative to the RMS 5-25 ms after t. A step
    discontinuity (click) would read about 0 dB or more; a proper micro-fade reads far below."""
    mono = x.mean(axis=0) if x.ndim == 2 else x
    rows = []
    for (t, kind, lab) in edges:
        i = s2n(t)
        if kind == "cut":
            edge = np.max(np.abs(mono[max(0, i - s2n(0.0005)):i])) if i > 0 else 0.0
            ref = mono[max(0, i - s2n(0.03)):max(0, i - s2n(0.01))]
        else:
            edge = np.max(np.abs(mono[i:i + s2n(0.00025)]))
            ref = mono[i + s2n(0.005):i + s2n(0.025)]
        r = np.sqrt(np.mean(ref ** 2)) if len(ref) else 0.0
        rel = 20 * np.log10(edge / r + 1e-12) if r > 1e-9 else None
        # a click is a broadband step: compare >2 kHz energy right at the edge (+-0.5 ms)
        # with the >2 kHz level 10-30 ms on the sounding side
        a0, b0 = max(0, i - s2n(0.04)), min(len(mono), i + s2n(0.04))
        hf = _zp_filter(mono[a0:b0].astype(np.float64), (2000.0, None))
        j = i - a0
        e_edge = np.max(np.abs(hf[max(0, j - s2n(0.0005)):j + s2n(0.0005)]))
        side = hf[max(0, j - s2n(0.03)):max(0, j - s2n(0.01))] if kind == "cut" else hf[j + s2n(0.01):j + s2n(0.03)]
        e_ref = np.sqrt(np.mean(side ** 2)) if len(side) else 0.0
        hf_db = 20 * np.log10((e_edge + 1e-12) / (e_ref + 1e-9))
        click = e_edge > 10 ** (-70 / 20) and hf_db > 6.0
        rows.append((t, kind, lab, rel, 20 * np.log10(edge + 1e-12), 20 * np.log10(e_edge + 1e-12), click))
    return rows


# --------------------------------------------------------- SFX vs music balance
def sfx_vs_music(music, sfx, cues, skip=()):
    """Per SFX kind: momentary (400 ms from 50 ms before the cue) loudness of the SFX stem
    vs the music stem, averaged over up to 4 occurrences. -> [(kind, n, sfx, music, diff)]."""
    import pyloudnorm as pyln
    meter = pyln.Meter(SR, block_size=0.2)
    N = music.shape[1]

    def mom(x, t, w=0.4):
        a, b = max(0, s2n(t - 0.05)), min(N, s2n(t - 0.05 + w))
        seg = x[:, a:b]
        if seg.shape[1] < s2n(0.25) or np.max(np.abs(seg)) < 1e-7:
            return None
        v = meter.integrated_loudness(np.ascontiguousarray(seg.T))
        return v if np.isfinite(v) else None

    kinds = {}
    for e in cues["sfx"]:
        kinds.setdefault(e["kind"], []).append(e["t"] + (e.get("dur", 0.0) * 0.6 if e["kind"] in
                                                          ("riser", "whoosh", "whoosh_soft", "reverse_riser",
                                                           "static_rise", "crescendo_noise") else 0.0))
    rows = []
    for k, ts in kinds.items():
        sel = [t for t in ts[::max(1, len(ts) // 4)][:4] if not any(a <= t < b for a, b in skip)]
        vals = [(mom(sfx, t), mom(music, t)) for t in sel]
        sv = [a for a, b in vals if a is not None]
        mv = [b for a, b in vals if b is not None]
        s_ = float(np.mean(sv)) if sv else None
        m_ = float(np.mean(mv)) if mv else None
        rows.append((k, len(ts), s_, m_, (s_ - m_) if (s_ is not None and m_ is not None) else None))
    return rows
