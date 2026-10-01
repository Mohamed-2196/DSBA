#!/usr/bin/env python3
"""build_audio.py - procedural soundtrack + SFX for the DSBA launch film (numpy + scipy).

Run from anywhere (paths default to the project root):
    python3 tools/audio/build_audio.py              # full build + report + review PNGs
    python3 tools/audio/build_audio.py --no-review  # audio only

Reads cues.json (the single source of truth for every time) and writes, all exactly
`cues.duration` s, 48 kHz stereo:
    out/audio/music.wav         music stem  (32-bit float, at master-input level)
    out/audio/sfx.wav           SFX stem    (32-bit float, at master-input level)
    out/audio/mix.wav           final master, 16-bit PCM: -14 LUFS integrated, true peak <= -1 dBTP
    out/audio/sfx_only_mix.wav  SFX + birthday music box (with its sabotage) + glitch processing,
                                no other music; same master gain/chain as mix.wav, 16-bit PCM
    out/audio/report.txt, out/audio/review/*.png
music.wav + sfx.wav == the master input; the master chain is: glue compressor -> true-peak
look-ahead limiter -> silence gates -> TPDF dither. Deterministic (fixed seeds).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402
from scipy.io import wavfile  # noqa: E402

import mixing  # noqa: E402
import score  # noqa: E402
import sfx as sfxmod  # noqa: E402
from dsp import SR, s2n, butter, rng_for, rc_ramp, tape_stop  # noqa: E402

TARGET_LUFS = -14.0
CEILING_DBTP = -1.3     # limiter ceiling (true peak); verified <= -1.0 dBTP after dither


def place(dst, src, n0):
    a = max(0, n0)
    b = min(dst.shape[1], n0 + src.shape[1])
    if b > a:
        dst[:, a:b] += src[:, a - n0:b - n0]


def silences(cues):
    out = []
    for g in ("g1", "g2"):
        for s in cues[g]["segments"]:
            if s["kind"] == "black":
                out.append((s["t0"], s["t1"]))
    sil = cues["g2"].get("silence")
    if sil and (sil["t0"], sil["t1"]) not in out:
        out.append((sil["t0"], sil["t1"]))
    return sorted(out)


def sections(cues):
    secs = {s["id"]: (s["start"], s["end"]) for s in cues["scenes"]}
    fr = cues["chaos"]["freeze"]
    secs["s02_chaos"] = (secs["s02_chaos"][0], fr)
    secs["  stop+silence"] = (fr, cues["chaos"]["implode"][0])
    secs["  reverse riser"] = tuple(cues["chaos"]["implode"])
    sil = cues["g2"]["silence"]
    secs["g2_glitch"] = (cues["g2"]["start"], sil["t0"])
    secs["  g2 silence"] = (sil["t0"], sil["t1"])
    return dict(sorted(secs.items(), key=lambda kv: kv[1][0]))


def master_chain(x, gate):
    # glue compressor with a 100 Hz side-chain high-pass: sub energy (kick, booms) must not
    # pump the whole mix down on the drops
    det = butter(x, "highpass", 100.0, 2)
    y, cmin = mixing.compressor(x, thresh_db=-15.0, ratio=1.6, attack=0.015, release=0.22, knee_db=8.0, block=480,
                                detector=det)
    y, lmin = mixing.limiter(y, ceiling_db=CEILING_DBTP, look=0.0015, release=0.08)
    return y * gate, cmin, lmin


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cues", default=str(HERE.parent.parent / "cues.json"))
    ap.add_argument("--out", default=str(HERE.parent.parent / "out" / "audio"))
    ap.add_argument("--no-review", action="store_true")
    args = ap.parse_args()
    T0 = time.time()
    cues = json.loads(Path(args.cues).read_text())
    out = Path(args.out)
    (out / "review").mkdir(parents=True, exist_ok=True)
    N = s2n(cues["duration"])
    review = not args.no_review
    if review:
        mixing.Mixer.stat_sections = sections(cues)
    log = []

    def stamp(msg):
        line = f"[{time.time() - T0:6.1f}s] {msg}"
        print(line, flush=True)
        log.append(line)

    # ------------------------------------------------------------------ music
    mx1, a1 = score.act1(cues)
    a1_pre = a1.copy() if review else None
    a1 = score.act1_glitch(a1, mx1.n0, cues)
    stamp("act 1 rendered (launch track + hard stop + G1 crash)")
    mxb, bd = score.birthday(cues)
    bd_pre = bd.copy() if review else None
    bd = score.birthday_glitch(bd, mxb.n0, cues)
    stamp("birthday rendered (music box + sabotaged final note)")
    mx3, a3 = score.act3(cues)
    stamp("act 3 rendered (piano + anthem + outro)")
    music = np.zeros((2, N))
    place(music, a1, mx1.n0)
    place(music, bd, mxb.n0)
    place(music, a3, mx3.n0)
    box = np.zeros((2, N))
    place(box, bd, mxb.n0)

    # -------------------------------------------------------------------- sfx
    pre, pre_mix, post, post_mix = sfxmod.render_sfx(cues)
    # "everything cuts" at the freeze: the launch-film SFX bed gets the same 0.25 s tape stop
    freeze = cues["chaos"]["freeze"]
    imp0 = cues["chaos"]["implode"][0]
    a, b = s2n(freeze - 0.5), s2n(imp0)
    sub = pre_mix[:, a:b].copy()
    tape_stop(sub, a, freeze, freeze + 0.25, power=1.3, amp_pow=0.4, kill_after=True)
    F = s2n(0.012)
    k = s2n(freeze + 0.25) - a
    sub[:, k - F:k] *= rc_ramp(F, up=False)
    pre_mix[:, a:b] = sub
    # ... and the same G1 crash (stutters / tape stop / crush) as the music
    g1 = cues["g1"]
    a = s2n(g1["start"] - 1.0)
    sub = pre_mix[:, a:].copy()
    mixing.glitch1(sub, a, g1)
    pre_mix[:, a:] = sub
    sfx = np.zeros((2, N))
    place(sfx, pre_mix, pre.n0)
    place(sfx, post_mix, post.n0)
    stamp("SFX rendered (%d cues)" % len(cues["sfx"]))

    # ---------------------------------------------------------------- master
    gate = mixing.gate_curve(N, 0, silences(cues), fade=0.004)
    music = butter(music, "highpass", 20.0, 2)
    sfx = butter(sfx, "highpass", 20.0, 2)
    box = butter(box, "highpass", 20.0, 2)
    pre_in = (music + sfx) * gate
    L0 = mixing.lufs(pre_in)
    # the gain is quantised to 0.01 dB so float noise in the loudness measurement can never
    # change the output: the build is bit-exact run to run
    g = round(TARGET_LUFS - L0 + 0.8, 2)
    for it in range(6):
        y, cmin, lmin = master_chain(pre_in * 10 ** (g / 20), gate)
        L = mixing.lufs(y)
        stamp(f"master pass {it}: gain {g:+.2f} dB -> {L:.2f} LUFS (comp {cmin:.1f} dB, lim {lmin:.1f} dB)")
        if abs(L - TARGET_LUFS) < 0.05:
            break
        g = round(g + TARGET_LUFS - L, 2)
    G = 10 ** (g / 20)
    mix = y
    dmask = gate.copy()
    dmask[:s2n(0.003)] = 0.0
    dmask[s2n(cues["outro"]["fade"][1] - 0.005):] = 0.0
    mix16 = mixing.to_int16(mix, rng_for("dither"), mask=dmask)
    # sfx-only version: same master gain and chain (so levels match the full mix)
    so, _, _ = master_chain((sfx + box) * gate * G, gate)
    so16 = mixing.to_int16(so, rng_for("dither2"), mask=dmask)
    music_st = (music * gate * G).astype(np.float32)
    sfx_st = (sfx * gate * G).astype(np.float32)
    # float stems via scipy (libsndfile would add a PEAK chunk carrying a timestamp, making the
    # files differ byte-wise from run to run although the audio is identical)
    wavfile.write(out / "music.wav", SR, np.ascontiguousarray(music_st.T))
    wavfile.write(out / "sfx.wav", SR, np.ascontiguousarray(sfx_st.T))
    sf.write(out / "mix.wav", mix16.T, SR, subtype="PCM_16")
    sf.write(out / "sfx_only_mix.wav", so16.T, SR, subtype="PCM_16")
    render_s = time.time() - T0
    stamp(f"wrote {out}/{{music,sfx,mix,sfx_only_mix}}.wav ({render_s:.1f}s)")

    if review:
        write_review(cues, out, dict(music=music_st, sfx=sfx_st, mix16=mix16, so16=so16, box=box * gate * G,
                                     a1=a1, a1_pre=a1_pre, bd=bd, bd_pre=bd_pre),
                     (mx1, mxb, mx3), g, render_s, log)
    stamp("done")


# ===================================================================== review
def write_review(cues, out, A, mixers, gain_db, render_s, log):
    import review as rv
    mx1, mxb, mx3 = mixers
    music, sfx = A["music"], A["sfx"]
    mix = A["mix16"].astype(np.float64) / 32768.0
    so = A["so16"].astype(np.float64) / 32768.0
    R = []
    w = R.append
    w("DSBA launch film - soundtrack report (tools/audio/build_audio.py)")
    w("=" * 100)
    w(f"render time (audio only, before this review): {render_s:.1f} s")
    w(f"music.wav / sfx.wav: float32 stems at master-input level (master gain {gain_db:+.2f} dB already applied;")
    w("   peaks may exceed 0 dBFS, which float WAV preserves). music + sfx -> master chain reproduces mix.wav;")
    w("mix.wav / sfx_only_mix.wav: 16-bit PCM masters (compressor -> true-peak limiter -> gates -> TPDF dither)")
    w("")
    for name, x in (("mix.wav", mix), ("sfx_only_mix.wav", so), ("music.wav", music), ("sfx.wav", sfx)):
        L = mixing.lufs(x)
        tp = mixing.true_peak_db(x)
        sp = 20 * np.log10(np.max(np.abs(x)) + 1e-12)
        dc = np.mean(x, axis=1)
        w(f"{name:17s} {x.shape[1]} smp = {x.shape[1] / SR:.3f} s | integrated {L:6.2f} LUFS | "
          f"true peak {tp:+6.2f} dBTP | sample peak {sp:+6.2f} dBFS | DC L/R {dc[0]:+.1e} / {dc[1]:+.1e}")
    w("")
    w("digital silence (max |sample| must be exactly 0):")
    for (a, b) in silences(cues):
        ia, ib = s2n(a), s2n(b)
        vals = [int(np.max(np.abs(A["mix16"][:, ia:ib]))), int(np.max(np.abs(A["so16"][:, ia:ib]))),
                float(np.max(np.abs(music[:, ia:ib]))), float(np.max(np.abs(sfx[:, ia:ib])))]
        w(f"  {a:6.2f}-{b:6.2f} s: mix {vals[0]}, sfx_only {vals[1]}, music {vals[2]:.1e}, sfx {vals[3]:.1e} -> "
          + ("OK" if max(vals) == 0 else "FAIL"))

    secs = sections(cues)
    w("")
    w("per section: integrated LUFS, RMS dBFS, peak dBFS of the mix; LUFS of the stems")
    tm, tmu, tsf = rv.section_table(mix, secs), rv.section_table(music, secs), rv.section_table(sfx, secs)
    for (lab, a, b, L, r, p), (_, _, _, Lm, _, _), (_, _, _, Ls, _, _) in zip(tm, tmu, tsf):
        diff = (Lm - Ls) if np.isfinite(Lm) and np.isfinite(Ls) else float("nan")
        w(f"  {lab:17s} {a:6.1f}-{b:6.1f} | mix {L:6.1f} LUFS {r:6.1f} rms {p:6.1f} pk | music {Lm:6.1f} | "
          f"sfx {Ls:6.1f} | music-sfx {diff:+5.1f} LU")

    w("")
    w("SFX vs MUSIC per kind (momentary loudness over 400 ms at the cue, mean of up to 4 cues).")
    w("  Targets: hits about -8..0 LU vs the music, textures (typing/ticks) about -15..-8 LU; '-' = no music there")
    rows = rv.sfx_vs_music(music, sfx, cues, skip=silences(cues))
    rows.sort(key=lambda r: (r[4] is None, -(r[4] if r[4] is not None else 0)))
    line = []
    for (k, n, s_, m_, d) in rows:
        line.append(f"{k}x{n}: " + (f"{d:+5.1f}" if d is not None else f"  -  (sfx {s_:5.1f} LUFS)"))
    for i in range(0, len(line), 4):
        w("  " + " | ".join(f"{x:34s}" for x in line[i:i + 4]))

    # ---------------------------------------------------------------- onsets
    w("")
    w("ONSET CHECKS (zero-phase band filter, steepest rise of log energy; tolerance +-10 ms)")
    st = rv.detector_selftest()
    w("  detector self-test on synthetic onsets: " + ", ".join(f"{k} {e:+.1f} ms" for k, e in st))
    T = cues["tempo"]
    fails = []

    def show(gname, rows, tol=10.0, track=True):
        for (lab, t, to, dms, strength) in rows:
            ok = abs(dms) <= tol
            if track and not ok:
                fails.append(lab)
            verdict = ("OK" if ok else "CHECK") if track else "info (chime on a kick)"
            w(f"  [{gname:10s}] {lab:24s} cue {t:8.4f} onset {to:8.4f} {dms:+6.1f} ms  (rise {strength:5.1f} dB)"
              f"  {verdict}")

    show("mix", rv.onset_report(mix, [("act1 drop", T["act1"]["drop"]), ("act3 drop", T["reveal"]["drop"])]))
    show("mix", rv.onset_report(mix, [(f"countdown {i}", t) for i, t in enumerate(cues["launch"]["countdown"])]))
    g1, g2 = cues["g1"], cues["g2"]
    st1 = []
    for j, s_ in enumerate(g1["stutters"]):
        k = 0
        while s_["start"] + k * s_["len"] < s_["end"] - 1e-9:
            st1.append((f"g1 stutter{j + 1} loop{k}", s_["start"] + k * s_["len"], j))
            k += 1
    # stutter loops whose source starts on a transient (onset at the loop start expected)
    st1_on = [(l, t) for (l, t, j) in st1 if j < 2]
    # 1-4 kHz: transients of the accents, below the bit-crusher's aliasing fizz
    show("music stem", rv.onset_report(music, st1_on, band=(1000.0, 4000.0), search=0.012))
    st2 = [("g2 final note", g2["note_warp"]["t0"])]
    for s_ in g2["stutters"]:
        k = 0
        while s_["start"] + k * s_["len"] < s_["end"] - 1e-9:
            st2.append((f"g2 stutter loop{k}", s_["start"] + k * s_["len"]))
            k += 1
    show("music stem", rv.onset_report(music, st2, band=(2500.0, None), search=0.012))
    chimes = [(f"name_chime {i}", t) for i, t in enumerate(cues["names"]["times"])]
    show("sfx stem", rv.onset_report(sfx, chimes, band=(2500.0, None), search=0.03))
    show("mix", rv.onset_report(mix, chimes, band=(1500.0, None), search=0.03), track=False)
    w(f"  -> {len(fails)} checked onsets outside +-10 ms" + (f": {fails}" if fails else ""))

    w("")
    w("STUTTER LOOP LOCK (each repeat correlated with its cue source slice; lag 0.0 ms = sample-exact)")
    from dsp import tape_stop as _ts
    src = A["a1_pre"].copy()
    _ts(src, mx1.n0, g1["tape_stop"]["t0"], g1["tape_stop"]["t1"], power=mixing.G1_TAPE_POWER,
        amp_pow=mixing.G1_TAPE_AMP, kill_after=True)
    worst = 0.0
    for j, s_ in enumerate(g1["stutters"]):
        rows = rv.loop_lock(A["a1"], mx1.n0, src, mx1.n0, s_["start"], s_["len"], s_["end"], s_["src"])
        for (k, tl, lag, r) in rows:
            worst = max(worst, abs(lag))
        w(f"  g1 stutter{j + 1} (src {s_['src']:.4f}, len {s_['len'] * 1000:.2f} ms): "
          + " ".join(f"{tl:.4f}:{lag:+.2f}ms/r{r:.2f}" for (k, tl, lag, r) in rows))
    for s_ in g2["stutters"]:
        rows = rv.loop_lock(A["bd"], mxb.n0, A["bd_pre"], mxb.n0, s_["start"], s_["len"], s_["end"], s_["src"],
                            use=0.04)
        for (k, tl, lag, r) in rows:
            worst = max(worst, abs(lag))
        w(f"  g2 stutter (src {s_['src']:.4f}, len {s_['len'] * 1000:.0f} ms, detuning): "
          + " ".join(f"{tl:.4f}:{lag:+.2f}ms/r{r:.2f}" for (k, tl, lag, r) in rows))
    w(f"  -> worst loop lag {worst:.2f} ms (r = correlation with the source; G1 loops are also bit-crushed)")

    w("")
    w("HARD EDGES (click check: a click = >2 kHz burst at the edge above -70 dBFS and >6 dB over the sounding side)")
    ts = g1["tape_stop"]
    blk = [s_ for s_ in g1["segments"] if s_["kind"] == "black"]
    sil = g2["silence"]
    edges_mix = [(blk[0]["t0"], "cut", "G1 static -> black") if blk else None,
                 (blk[0]["t1"], "start", "black -> SURPRISE") if blk else None,
                 (sil["t0"], "cut", "G2 flash -> digital silence"), (sil["t1"], "start", "silence -> letter"),
                 (cues["duration"], "cut", "end of film"), (0.0, "start", "start of film")]
    edges_mus = [(cues["chaos"]["freeze"] + 0.25, "cut", "music tape stop -> silence"),
                 (ts["t1"], "cut", "G1 tape stop -> hum"), (g2["note_warp"]["t1"], "cut", "box dies -> silence"),
                 (cues["tempo"]["reveal"]["piano_start"], "start", "piano in")]
    for name, x, edges in (("mix", mix, edges_mix), ("music stem", music, edges_mus)):
        for (t, kind, lab, rel, pk, hf, click) in rv.edge_report(x, [e for e in edges if e]):
            rs = f"{rel:+6.1f} dB rel" if rel is not None else "  (silent ref)"
            w(f"  [{name:10s}] {lab:28s} t={t:7.3f} ({kind:5s}): level at edge {pk:7.1f} dBFS ({rs}), "
              f">2kHz burst at edge {hf:7.1f} dBFS  {'CLICK?' if click else 'OK (no click)'}")

    # ----------------------------------------------------------------- harmony
    w("")
    w("HARMONY (chroma 80-2000 Hz, +-30 cents, of the music stem per bar: top-4 pitch classes vs the chord)")
    bars = []
    for mx in mixers:
        for (t, ch, d) in getattr(mx, "chords", []):
            bars.append((t, t + d, ch))
    rows = rv.chord_check(music, bars)
    nok = sum(r[3] for r in rows)
    build = (cues["launch"]["start"], cues["tempo"]["act1"]["end"])
    line = []
    for (t0, name, top, ok) in rows:
        note = "" if ok else (" (build: risers sweep all pitches)" if build[0] <= t0 < build[1] else " ??")
        line.append(f"{t0:6.2f} {name:5s} [{' '.join(top)}]{note}")
    for i in range(0, len(line), 3):
        w("  " + " | ".join(line[i:i + 3]))
    w(f"  -> {nok}/{len(rows)} bars consistent with their chord")
    w("")
    w("MUSIC BOX PITCH (dry box bus, strongest new fundamental after each cue note)")
    rows = rv.box_pitch_check(mxb.levels["box"], mxb.n0, cues["birthday"]["melody"])
    w("  " + " ".join(f"{syl}:{got}{'' if ok else '!=' + str(want)}" for (t, syl, want, got, ok) in rows))
    w(f"  -> {sum(r[4] for r in rows)}/{len(rows)} notes measured at the cue MIDI pitch")

    w("")
    w("BUS BALANCE per section: bus loudness relative to the section's music total (LU) [rms dBFS]")
    for mx in mixers:
        for bus, row in mx.bus_report():
            if row:
                w(f"  {mx.name:5s} {bus:10s} " + "  ".join(f"{k.strip()[:9]}:{v[1]:+5.1f}[{v[0]:5.1f}]"
                                                         for k, v in row.items()))
    w("")
    w("build log:")
    R.extend("  " + l for l in log)
    (out / "report.txt").write_text("\n".join(R) + "\n")
    print("\n".join(R))

    # ------------------------------------------------------------------ plots
    st_t, st_v = mixing.short_term_lufs(mix, 3.0, 0.25)
    rv.plot_overview(out / "review" / "overview_mix.png", mix, cues, st_t, st_v, "mix.wav - whole film")
    mt, mv = mixing.short_term_lufs(music, 3.0, 0.25)
    stt, stv = mixing.short_term_lufs(sfx, 3.0, 0.25)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    fig, ax = plt.subplots(1, 1, figsize=(22, 4.5))
    ax.plot(st_t, st_v, color="k", lw=1.2, label="mix")
    ax.plot(mt, mv, color="#2980b9", lw=1, label="music stem")
    ax.plot(stt, stv, color="#c0392b", lw=1, label="sfx stem")
    for s_ in cues["scenes"]:
        ax.axvline(s_["start"], color="#2ecc71", lw=0.6)
    ax.set_ylim(-50, -5)
    ax.set_xlim(0, cues["duration"])
    ax.legend(loc="lower left")
    ax.set_title("short-term loudness (3 s window): mix vs stems")
    fig.tight_layout()
    fig.savefig(out / "review" / "loudness_stems.png", dpi=80)
    plt.close(fig)
    marks = [(t, f"cd{i}", "#e67e22") for i, t in enumerate(cues["launch"]["countdown"])]
    marks += [(cues["launch"]["click"], "click", "#e67e22")]
    marks += [(t, l.split()[-1], "#3498db") for (l, t, j) in st1]
    marks += [(h, "hit", "#e74c3c") for h in g1["hits"]]
    marks += [(g1["tape_stop"]["t0"], "tape0", "#9b59b6"), (g1["tape_stop"]["t1"], "tape1", "#9b59b6")]
    marks += [(s_["t0"], s_["kind"], "#2ecc71") for s_ in g1["segments"]]
    rv.plot_zoom(out / "review" / "zoom_60-70.png", mix, 60.0, 70.0, marks,
                 "60-70 s: build, countdown 61/62/63, LAUNCH click, G1 crash (stutters, tape stop), birthday start",
                 extra=music, extra_label="music stem")
    # close-up of the crash: source slices (yellow), loop starts (blue), tape stop (purple)
    t0c, t1c = g1["start"] - 0.4, g1["tape_stop"]["t1"] + 0.1
    a_, b_ = s2n(t0c), s2n(t1c)
    tt = np.arange(a_, b_) / SR
    fig, ax = plt.subplots(2, 1, figsize=(20, 7), sharex=True)
    ax[0].plot(tt, music[:, a_:b_].mean(axis=0), lw=0.4, color="#6c3483")
    ax[0].set_ylabel("music stem")
    ax[1].plot(tt, mix[:, a_:b_].mean(axis=0), lw=0.4, color="#1f4e8c")
    ax[1].set_ylabel("mix.wav")
    for s_ in g1["stutters"]:
        k = 0
        while s_["start"] + k * s_["len"] < s_["end"] - 1e-9:
            for a2 in ax:
                a2.axvline(s_["start"] + k * s_["len"], color="#3498db", lw=0.7)
            k += 1
        for a2 in ax:
            a2.axvspan(s_["src"], s_["src"] + s_["len"], color="#f1c40f", alpha=0.3)
    for a2 in ax:
        a2.axvline(g1["tape_stop"]["t0"], color="#9b59b6", lw=1.5)
        a2.axvline(g1["tape_stop"]["t1"], color="#9b59b6", lw=1.5)
        a2.axvline(cues["launch"]["click"], color="#e67e22", lw=1.2)
        a2.axvline(g1["start"], color="#e74c3c", lw=1.2)
    ax[0].set_title("G1 crash close-up: yellow = stutter source slices, blue = loop starts, purple = tape stop, "
                    "orange = LAUNCH click, red = expected drop")
    ax[1].set_xlim(t0c, t1c)
    fig.tight_layout()
    fig.savefig(out / "review" / "zoom_g1_crash_closeup.png", dpi=75)
    plt.close(fig)
    marks = [(n["t"], n["syl"], "#3498db") for n in cues["birthday"]["melody"] if n["t"] > 78]
    marks += [(t, l.split()[-1], "#e67e22") for (l, t) in st2]
    marks += [(h, "hit", "#e74c3c") for h in g2["hits"]]
    marks += [(l["t"], "line", "#16a085") for l in g2["terminal_lines"]]
    marks += [(s_["t0"], s_["kind"], "#2ecc71") for s_ in g2["segments"]] + [(g2["silence"]["t1"], "end", "#2ecc71")]
    rv.plot_zoom(out / "review" / "zoom_78-88.png", mix, 78.0, 88.0, marks,
                 "78-88 s: end of the song, sabotaged 'you', terminal, crescendo, flash, 1.5 s digital silence",
                 extra=music, extra_label="music stem")
    fz, im = cues["chaos"]["freeze"], cues["chaos"]["implode"]
    marks = [(fz, "freeze/hard stop", "#e74c3c"), (fz + 0.25, "tape end", "#9b59b6"), (im[0], "rev riser", "#2ecc71"),
             (im[1], "DROP", "#e74c3c")] + [(c["t"], "caption", "#16a085") for c in cues["chaos"]["captions"]]
    rv.plot_zoom(out / "review" / "zoom_13-20.png", mix, 13.0, 20.0, marks,
                 "13-20 s: notification wall + snare build, hard stop (tape stop), near-silence, reverse riser, drop",
                 extra=sfx, extra_label="sfx stem")
    marks = [(cues["tempo"]["reveal"]["drop"], "DROP", "#e74c3c")]
    marks += [(t, f"n{i}", "#3498db") for i, t in enumerate(cues["names"]["times"])]
    marks += [(cues["names"]["thank_you"], "thank you", "#16a085")]
    rv.plot_zoom(out / "review" / "zoom_93-112.png", mix, 93.0, 112.0, marks,
                 "93-112 s: riser + fill, anthem drop at 95, the 17 name chimes", extra=sfx, extra_label="sfx stem")


if __name__ == "__main__":
    main()
