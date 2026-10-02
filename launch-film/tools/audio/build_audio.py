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
    out/audio/sfx_only_mix.wav  SFX + the birthday song (with its sabotage) + glitch processing,
                                no other music; same master gain/chain as mix.wav, 16-bit PCM
    out/audio/report.txt, out/audio/review/*.png
music.wav + sfx.wav == the master input; the master chain is: glue compressor -> true-peak
look-ahead limiter -> silence gates -> TPDF dither. Deterministic (fixed seeds).

Silence: every `black` segment of g1/g2 and g2.silence is exact digital silence, and what
sounded before such a span is gone after it (no reverb tail crosses it). The darkness that
follows G1 stays digitally silent until the first cue after it (the collar bell); from there
to the lights the dark beat holds only the bells, the blink ticks and an extremely quiet room
tone (sfx.DARK_ROOM_TONE_DB; None switches it off).

Nothing in tools/audio knows a time of the film: scene starts, tempo maps and every event come
from cues.json, so a re-cut only needs make_cues.py and a rebuild. The film may open on any
scene: the first START_FADE seconds are a fade-in (no step at t = 0) and the last END_SILENCE
seconds are digital silence. An SFX kind without a design in sfx.py stops the build.
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
GATE_FADE = 0.004       # raised-cosine fade into / out of every digital silence
START_FADE = 0.03       # the film fades in over its first 30 ms: whatever opens it, no click at t = 0
END_SILENCE = 0.2       # the film's last 0.2 s are digital silence (the picture is black)


def place(dst, src, n0):
    a = max(0, n0)
    b = min(dst.shape[1], n0 + src.shape[1])
    if b > a:
        dst[:, a:b] += src[:, a - n0:b - n0]


def silences(cues):
    """The spans the cue sheet declares silent: g1/g2 `black` segments and g2.silence."""
    out = []
    for g in ("g1", "g2"):
        for s in cues[g]["segments"]:
            if s["kind"] == "black":
                out.append((s["t0"], s["t1"]))
    sil = cues["g2"].get("silence")
    if sil and (sil["t0"], sil["t1"]) not in out:
        out.append((sil["t0"], sil["t1"]))
    return sorted(out)


def epochs(cues):
    """The stretches of sound between the silences: [(t0, t1), ...] covering the film."""
    out, t = [], 0.0
    for (a, b) in silences(cues):
        out.append((t, a))
        t = b
    out.append((t, cues["duration"]))
    return out


def first_sound_after(cues, t):
    """Time of the first thing that is supposed to sound at or after t (SFX cue or music entry)."""
    starts = [e["t"] for e in cues["sfx"] if e["t"] >= t - 1e-9]
    starts += [x for x in (cues["tempo"]["birthday"]["pickup"], cues["tempo"]["reveal"]["piano_start"])
               if x >= t - 1e-9]
    return min(starts) if starts else cues["duration"]


def gated_spans(cues):
    """Silences, each extended up to just before the first sound that follows it."""
    out = []
    for (a, b) in silences(cues):
        nxt = first_sound_after(cues, b)
        out.append((a, max(b, nxt - GATE_FADE - 0.002)))
    return out


def outro_fade(cues):
    """(t0, t1): the final fade follows the picture's fade to black and ends END_SILENCE early."""
    f0, f1 = cues["outro"]["fade"]
    return f0, min(f1, cues["duration"]) - END_SILENCE


def sections(cues):
    secs = {s["id"]: (s["start"], s["end"]) for s in cues["scenes"]}
    fr = cues["chaos"]["freeze"]
    secs["s02_chaos"] = (secs["s02_chaos"][0], fr)
    secs["  stop+silence"] = (fr, cues["chaos"]["implode"][0])
    secs["  reverse riser"] = tuple(cues["chaos"]["implode"])
    b0 = secs["s08_birthday"][0]
    lights = cues["birthday"]["lights_on"]
    secs["  dark + bell"] = (b0, lights)
    secs["s08_birthday"] = (lights, secs["s08_birthday"][1])
    sil = cues["g2"]["silence"]
    secs["g2_glitch"] = (cues["g2"]["start"], sil["t0"])
    secs["  g2 silence"] = (sil["t0"], sil["t1"])
    return dict(sorted(secs.items(), key=lambda kv: kv[1][0]))


def hp20(x, eps):
    """20 Hz high-pass, run separately on every epoch: the filter starts from rest after each
    silence, so not even its (inaudible) ringing crosses one and the stems stay exactly zero
    until the first sound of the next epoch."""
    y = np.zeros_like(x)
    for (a, b) in eps:
        ia, ib = s2n(a), s2n(b)
        y[:, ia:ib] = butter(x[:, ia:ib], "highpass", 20.0, 2)
    return y


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

    kinds = sfxmod.check_kinds(cues)          # fail before rendering anything if a cue has no design
    spare = sfxmod.unused_kinds(cues)
    if spare:
        stamp("SFX designs not cued in this cut (kept for re-cuts): " + ", ".join(spare))
    eps = epochs(cues)

    # ------------------------------------------------------------------ music
    mx1, a1 = score.act1(cues)
    a1_pre = a1.copy() if review else None
    a1 = score.act1_glitch(a1, mx1.n0, cues)
    stamp("act 1 rendered (launch track + hard stop + G1 crash)")
    mxb, bd = score.birthday(cues)
    bd_pre = bd.copy() if review else None
    bd = score.birthday_glitch(bd, mxb.n0, cues)
    stamp("birthday rendered (jazz waltz + sabotaged final note)")
    mx3, a3 = score.act3(cues)
    stamp("act 3 rendered (letter piano, anthem, numbers bed, network climax, finale)")
    music = np.zeros((2, N))
    place(music, a1, mx1.n0)
    place(music, bd, mxb.n0)
    place(music, a3, mx3.n0)
    box = np.zeros((2, N))
    place(box, bd, mxb.n0)

    # -------------------------------------------------------------------- sfx
    pre, pre_mix, posts = sfxmod.render_sfx(cues, eps)
    # "everything cuts" at the freeze: the launch-film SFX bed gets the same tape stop as the music
    freeze = cues["chaos"]["freeze"]
    imp0 = cues["chaos"]["implode"][0]
    a, b = s2n(freeze - 0.5), s2n(imp0)
    sub = pre_mix[:, a:b].copy()
    tape_stop(sub, a, freeze, freeze + score.FREEZE_TAPE, power=1.3, amp_pow=0.4, kill_after=True)
    F = s2n(0.012)
    k = s2n(freeze + score.FREEZE_TAPE) - a
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
    for (pmx, pmix) in posts:
        place(sfx, pmix, pmx.n0)
    stamp("SFX rendered (%d cues, %d kinds)" % (len(cues["sfx"]), len(kinds)))

    # ---------------------------------------------------------------- master
    # Nothing that sounded before a silence may come back after it: music and SFX are
    # rendered per epoch (their buffers end where the silence starts); the gate below also
    # keeps the darkness after G1 at digital zero until the collar bell.
    gate = mixing.gate_curve(N, 0, gated_spans(cues), fade=GATE_FADE)
    nf = s2n(START_FADE)
    gate[:nf] *= rc_ramp(nf)                  # the film never starts on a step
    f0, f1 = outro_fade(cues)
    ia, ib = s2n(f0), s2n(f1)
    gate[ia:ib] *= rc_ramp(ib - ia, up=False) ** 1.5
    gate[ib:] = 0.0
    music, sfx, box = (hp20(x, eps) for x in (music, sfx, box))
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
    for name, x in (("mix", mix16), ("sfx_only_mix", so16), ("music", music_st), ("sfx", sfx_st)):
        if x.shape != (2, N) or not np.all(np.isfinite(x)):
            raise RuntimeError(f"{name}: shape {x.shape} (expected {(2, N)} = {cues['duration']} s) or NaN/Inf")
    sf.write(out / "mix.wav", mix16.T, SR, subtype="PCM_16")
    sf.write(out / "sfx_only_mix.wav", so16.T, SR, subtype="PCM_16")
    render_s = time.time() - T0
    stamp(f"wrote {out}/{{music,sfx,mix,sfx_only_mix}}.wav ({render_s:.1f}s)")
    (out / "build.log").write_text("\n".join(log) + "\n")

    if review:
        write_review(cues, out, dict(music=music_st, sfx=sfx_st, mix16=mix16, so16=so16, box=box * gate * G,
                                     a1=a1, a1_pre=a1_pre, bd=bd, bd_pre=bd_pre, G=G),
                     (mx1, mxb, mx3), g, render_s, log)
    stamp("done")


# ===================================================================== review
def _db(x):
    return 20 * np.log10(np.maximum(x, 1e-12))


def _rms_db(x, t0, t1):
    seg = x[:, s2n(t0):s2n(t1)]
    return float(_db(np.sqrt(np.mean(seg ** 2)))) if seg.size else -240.0


def _band_rms_db(x, t0, t1, band):
    import review as rv
    a, b = max(0, s2n(t0 - 0.05)), min(x.shape[1], s2n(t1 + 0.05))
    seg = rv._zp_filter(x[:, a:b].mean(axis=0).astype(np.float64), band)
    seg = seg[s2n(t0) - a:s2n(t1) - a]
    return float(_db(np.sqrt(np.mean(seg ** 2)))) if seg.size else -240.0


def write_review(cues, out, A, mixers, gain_db, render_s, log):
    import review as rv
    mx1, mxb, mx3 = mixers
    music, sfx = A["music"], A["sfx"]
    mix = A["mix16"].astype(np.float64) / 32768.0
    so = A["so16"].astype(np.float64) / 32768.0
    T = cues["tempo"]
    R = T["reveal"]
    bday = cues["birthday"]
    g1, g2 = cues["g1"], cues["g2"]
    dur = cues["duration"]
    Rr = []
    w = Rr.append
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
    bal = _db(np.sqrt(np.mean(mix[0] ** 2))) - _db(np.sqrt(np.mean(mix[1] ** 2)))
    corr = float(np.corrcoef(mix[0], mix[1])[0, 1])
    w(f"mix.wav: expected {s2n(dur)} smp = {dur:.3f} s -> {'OK' if mix.shape[1] == s2n(dur) else 'FAIL'} | "
      f"L-R balance {bal:+.2f} dB, L/R correlation {corr:+.2f} | NaN/Inf: "
      f"{'none' if np.all(np.isfinite(music)) and np.all(np.isfinite(sfx)) else 'FOUND'} | "
      f"full-scale samples: {int(np.sum(np.abs(A['mix16']) >= 32767))}")
    w("")
    w("digital silence (max |sample| must be exactly 0):")
    spans = silences(cues)
    ext = gated_spans(cues)
    f0, f1 = outro_fade(cues)
    rows = [(a, b, "cue sheet") for (a, b) in spans]
    rows += [(b, e2, "until the first cue after it") for (a, b), (_, e2) in zip(spans, ext) if e2 > b + 1e-6]
    rows += [(f1, dur, "after the final fade")]
    for (a, b, why) in sorted(rows):
        ia, ib = s2n(a), s2n(b)
        vals = [int(np.max(np.abs(A["mix16"][:, ia:ib]))), int(np.max(np.abs(A["so16"][:, ia:ib]))),
                float(np.max(np.abs(music[:, ia:ib]))), float(np.max(np.abs(sfx[:, ia:ib])))]
        w(f"  {a:7.3f}-{b:7.3f} s ({why:28s}): mix {vals[0]}, sfx_only {vals[1]}, music {vals[2]:.1e}, "
          f"sfx {vals[3]:.1e} -> " + ("OK" if max(vals) == 0 else "FAIL"))

    # ------------------------------------------------- the opening and the hard stop
    pops = [p_["t"] for p_ in cues["chaos"]["pops"]]
    fz = cues["chaos"]["freeze"]
    im0, im1 = cues["chaos"]["implode"]
    a1drop = T["act1"]["drop"]

    def _pk_db(x, t0, t1):
        seg = x[:, s2n(t0):s2n(t1)]
        return float(_db(np.max(np.abs(seg)))) if seg.size else -240.0

    w("")
    w(f"THE OPENING (the film starts on {cues['scenes'][0]['id']}; fade-in {START_FADE * 1000:.0f} ms; "
      f"first ping {pops[0]:.2f} s; hard stop {fz:.2f} s; drop {a1drop:.2f} s)")
    w("  mix peak dBFS in 0-1 | 1-5 | 5-30 | 30-100 | 100-300 ms: "
      + " | ".join(f"{_pk_db(mix, a, b):6.1f}" for a, b in ((0, .001), (.001, .005), (.005, .03), (.03, .1), (.1, .3)))
      + "  (a click at t = 0 would show as a jump in the first columns)")
    w("  the build, mix RMS dBFS per 0.5 s up to the freeze: "
      + " ".join(f"{_rms_db(mix, t, t + 0.5):.0f}" for t in np.arange(0.0, fz - 1e-6, 0.5)))
    for p_ in pops[:2]:
        w(f"  ping at {p_:.3f} s: 1-6 kHz RMS {_band_rms_db(mix, p_ - 0.07, p_ - 0.01, (1000.0, 6000.0)):6.1f} dBFS in the 60 ms before "
          f"-> {_band_rms_db(mix, p_, p_ + 0.06, (1000.0, 6000.0)):6.1f} dBFS in its first 60 ms; peak {_pk_db(mix, p_, p_ + 0.1):6.1f} dBFS "
          f"over a bed at {_rms_db(mix, max(0.0, p_ - 0.15), p_ - 0.01):6.1f} dBFS rms")
    w(f"  hard stop: mix RMS {fz - 0.5:.2f}-{fz:.2f} {_rms_db(mix, fz - 0.5, fz):6.1f} | tape stop {fz:.2f}-{fz + score.FREEZE_TAPE:.2f} "
      f"{_rms_db(mix, fz, fz + score.FREEZE_TAPE):6.1f} | the held breath {fz + 0.3:.2f}-{im0:.2f} {_rms_db(mix, fz + 0.3, im0):6.1f} "
      f"(>2 kHz: {_band_rms_db(mix, fz + 0.3, im0, (2000.0, None)):6.1f}) | implode {_rms_db(mix, im0, im1):6.1f} | "
      f"drop {a1drop:.2f}-{a1drop + 0.5:.2f} {_rms_db(mix, a1drop, a1drop + 0.5):6.1f} dBFS")
    # after the tape stop the music is gone (what remains below 100 Hz is the master's 20 Hz
    # high-pass settling after the big downbeat: subsonic, about -50 dBFS, gone in 0.2 s)
    h0_ = fz + score.FREEZE_TAPE
    held = _band_rms_db(music, h0_ + 0.01, im0, (100.0, None)) if im0 > h0_ + 0.1 else -240.0
    late = [e for e in cues["sfx"] if fz < e["t"] < im0 - 1e-9]
    w(f"  music stem {h0_:.2f}-{im0:.2f} (everything cuts): {held:6.1f} dBFS rms above 100 Hz, {_rms_db(music, h0_ + 0.01, im0):6.1f} dBFS "
      f"full band -> {'OK' if held < -70.0 else 'CHECK'}; SFX cues between the stop and the implode: "
      f"{[(e['kind'], e['t']) for e in late] or 'none (only the tail of the hard stop)'}")

    # ------------------------------------------------- the darkness before the birthday
    b0 = [s for s in cues["scenes"] if s["id"].startswith("s08")][0]["start"]
    bell_t = [e["t"] for e in cues["sfx"] if e["kind"] == "bell_jingle"]
    lights = bday["lights_on"]
    pickup = T["birthday"]["pickup"]
    dark_bells = [t for t in bell_t if b0 - 1e-9 <= t < lights]
    fin_bells = [t for t in bell_t if t >= lights]
    blinks = [e["t"] for e in cues["sfx"] if e["kind"] == "blink_tick"]
    dark_ev = [e for e in cues["sfx"] if b0 - 1e-9 <= e["t"] < lights]
    w("")
    w(f"THE DARK ({b0:.2f} -> lights on {lights:.2f}, {lights - b0:.1f} s): the collar bell, the blink ticks, "
      "an extremely quiet room tone; nothing musical until the switch")
    w(f"  music stem {b0:.2f}-{min(lights, pickup):.3f}: max |sample| "
      f"{float(np.max(np.abs(music[:, s2n(b0):s2n(min(lights, pickup)) - 1]))):.1e} "
      f"(must be 0: the lights come on at {lights}, the song starts with its pickup at {pickup})")
    allowed = ("bell_jingle", "blink_tick", "lights_on")
    others = [e for e in dark_ev if e["kind"] not in allowed]
    w(f"  SFX cues in the dark: {[(e['kind'], e['t']) for e in dark_ev]}"
      f" -> {'OK' if not others else 'UNEXPECTED: ' + str(others)}")
    # the floor of the dark beat: everything outside the bells and the ticks
    tails = {"bell_jingle": 1.3, "blink_tick": 0.45}
    keep = np.ones(s2n(lights) - s2n(b0), bool)
    for e in dark_ev:
        a = s2n(e["t"] - 0.01) - s2n(b0)
        keep[max(a, 0):a + s2n(tails.get(e["kind"], 0.5))] = False
    rest = mix[:, s2n(b0):s2n(lights)][:, keep]
    fl_r = float(_db(np.sqrt(np.mean(rest ** 2)))) if rest.size else -240.0
    fl_p = float(_db(np.max(np.abs(rest)))) if rest.size else -240.0
    tone = sfxmod.DARK_ROOM_TONE_DB
    w(f"  floor outside the bells and ticks ({keep.sum() / SR:.2f} s of {lights - b0:.1f} s): rms {fl_r:6.1f} dBFS, peak {fl_p:6.1f} dBFS "
      f"(room tone: {'off' if tone is None else f'{tone:.0f} dBFS at the master input'}) -> "
      f"{'OK (really quiet)' if fl_r < -50.0 else 'CHECK'}")
    lv = {}
    for e in dark_ev:
        t = e["t"]
        lv.setdefault(e["kind"], []).append((_pk_db(mix, t, t + 0.3), _rms_db(mix, t, t + 0.1)))
        w(f"  {e['kind']:11s} {t:7.2f}: peak {lv[e['kind']][-1][0]:6.1f} dBFS, rms(100 ms) {lv[e['kind']][-1][1]:6.1f} dBFS | "
          f"<2 kHz {_band_rms_db(mix, t, t + 0.1, (None, 2000.0)):6.1f} | 2.5-7 kHz {_band_rms_db(mix, t, t + 0.1, (2500.0, 7000.0)):6.1f} | "
          f">7 kHz {_band_rms_db(mix, t, t + 0.1, (7000.0, None)):6.1f} dBFS")
    if "bell_jingle" in lv and "blink_tick" in lv:
        dp = max(p_ for p_, _ in lv["blink_tick"]) - min(p_ for p_, _ in lv["bell_jingle"])
        dr = max(r_ for _, r_ in lv["blink_tick"]) - min(r_ for _, r_ in lv["bell_jingle"])
        w(f"  loudest blink tick vs quietest bell: peak {dp:+.1f} dB, rms(100 ms) {dr:+.1f} dB -> "
          f"{'OK (clearly quieter)' if dp <= -8.0 and dr <= -8.0 else 'CHECK'}")

    secs = sections(cues)
    w("")
    w("per section: integrated LUFS, RMS dBFS, peak dBFS of the mix; LUFS of the stems")
    tm, tmu, tsf = rv.section_table(mix, secs), rv.section_table(music, secs), rv.section_table(sfx, secs)
    for (lab, a, b, L, r, p), (_, _, _, Lm, _, _), (_, _, _, Ls, _, _) in zip(tm, tmu, tsf):
        diff = (Lm - Ls) if np.isfinite(Lm) and np.isfinite(Ls) else float("nan")
        w(f"  {lab:17s} {a:6.1f}-{b:6.1f} | mix {L:6.1f} LUFS {r:6.1f} rms {p:6.1f} pk | music {Lm:6.1f} | "
          f"sfx {Ls:6.1f} | music-sfx {diff:+5.1f} LU")

    # ------------------------------------------------- loudness arc
    st_t, st_v = mixing.short_term_lufs(mix, 3.0, 0.25)
    w("")
    w("SHORT-TERM LOUDNESS of the mix (3 s window centred on t, LUFS), every 2 s:")
    line = []
    for t in np.arange(2.0, dur - 1.0, 2.0):
        i = int(np.argmin(np.abs(st_t - t)))
        line.append(f"{t:5.0f}:{st_v[i]:6.1f}")
    for i in range(0, len(line), 10):
        w("  " + "  ".join(line[i:i + 10]))

    def st_max(t0, t1):
        m = (st_t >= t0) & (st_t <= t1)
        i = np.flatnonzero(m)[np.argmax(st_v[m])]
        return float(st_t[i]), float(st_v[i])

    def st_mean(t0, t1):
        m = (st_t >= t0 + 1.5) & (st_t <= t1 - 1.5)
        return float(np.mean(st_v[m])) if np.any(m) else float("nan")

    sec3 = R["sections"]
    a3_0 = R["piano_start"]
    tmx, vmx = st_max(a3_0, dur - 1.5)
    t_ti, v_ti = st_max(*sec3["title"])
    t_cl, v_cl = st_max(R["climax"] - 0.5, sec3["network"][1])
    m_num, m_net = st_mean(*sec3["numbers"]), st_mean(*sec3["network"])
    w(f"  act 3 arc: loudest short-term moment at {tmx:.2f} s ({vmx:.1f} LUFS) -> "
      f"{'OK (inside the title / drop)' if sec3['title'][0] <= tmx <= sec3['title'][1] + 1.5 else 'CHECK'}")
    w(f"             title max {v_ti:.1f} | numbers mean {m_num:.1f} | network mean {m_net:.1f} | climax max {v_cl:.1f} "
      f"(at {t_cl:.2f}) -> numbers {v_ti - m_num:.1f} LU under the title, {m_net - m_num:.1f} LU under the network; "
      f"climax {v_ti - v_cl:.1f} LU under the drop")
    cards = cues["numbers"]["cards"]
    cl = cues["numbers"]["card_len"]
    w("             cards (mean short-term): " + "  ".join(
        f"{c['id']} {st_mean(c['t'] - 1.0, c['t'] + cl + 1.0):.1f}" for c in cards))

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
    w("ONSET CHECKS (zero-phase band filter, steepest rise of log energy; tolerance +-10 ms unless noted)")
    st = rv.detector_selftest()
    w("  detector self-test on synthetic onsets: " + ", ".join(f"{k} {e:+.1f} ms" for k, e in st))
    fails = []

    def show(gname, rows, tol=10.0, track=True, note=""):
        for (lab, t, to, dms, strength) in rows:
            ok = abs(dms) <= tol
            if track and not ok:
                fails.append(lab)
            verdict = ("OK" if ok else "CHECK") if track else "info"
            w(f"  [{gname:10s}] {lab:24s} cue {t:8.4f} onset {to:8.4f} {dms:+6.1f} ms  (rise {strength:5.1f} dB)"
              f"  {verdict}{note}")

    show("mix", rv.onset_report(mix, [("first ping", pops[0])], band=(1000.0, 6000.0)))
    show("sfx stem", rv.onset_report(sfx, [("hard stop", fz)], band=(1500.0, None)))
    show("mix", rv.onset_report(mix, [("act1 drop", T["act1"]["drop"]), ("act3 drop", R["drop"])]))
    show("mix", rv.onset_report(mix, [(f"countdown {i}", t) for i, t in enumerate(cues["launch"]["countdown"])]))
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
    # the birthday song: the pickup in the mix, every melody note on the dry piano-melody bus
    box_full = np.zeros((2, music.shape[1]))
    mb = mxb.levels["melody"].astype(np.float64)
    place(box_full, mb, mxb.n0)
    show("sfx stem", rv.onset_report(sfx, [(f"bell_jingle (dark {i + 1})", t) for i, t in enumerate(dark_bells)],
                                     band=(2500.0, None)))
    show("sfx stem", rv.onset_report(sfx, [(f"blink_tick {i + 1}", t) for i, t in enumerate(blinks)],
                                     band=(500.0, 4000.0)))
    show("sfx stem", rv.onset_report(sfx, [("lights_on click", lights)], band=(1500.0, None)))
    show("mix", rv.onset_report(mix, [("lights on (mix)", lights)], band=(1500.0, None)))
    # (in the mix the party popper sits 20 ms before the pickup, so the pickup is checked on the stem)
    show("music stem", rv.onset_report(music, [("birthday pickup", pickup)], band=(300.0, 3000.0)))
    mel = bday["melody"]
    rows = rv.onset_report(box_full, [(f"{n['syl']}", n["t"]) for n in mel], band=(1500.0, None), search=0.03)
    worst = max(rows, key=lambda r: abs(r[3]))
    bad = [r for r in rows if abs(r[3]) > 10.0]
    fails += [f"melody {r[0]} {r[1]:.3f}" for r in bad]
    w(f"  [melody bus] {len(rows)} birthday melody notes: onset - cue = "
      + " ".join(f"{r[3]:+.1f}" for r in rows) + " ms")
    w(f"  [melody bus] -> worst {worst[3]:+.1f} ms ({worst[0]} at {worst[1]:.4f}), {len(rows) - len(bad)}/{len(rows)} within +-10 ms"
      f"  {'OK' if not bad else 'CHECK'}")
    st2 = [("g2 final note (the cut)", g2["note_warp"]["t0"])]
    for s_ in g2["stutters"]:
        k = 0
        while s_["start"] + k * s_["len"] < s_["end"] - 1e-9:
            st2.append((f"g2 stutter loop{k}", s_["start"] + k * s_["len"]))
            k += 1
    show("music stem", rv.onset_report(music, st2, band=(1200.0, None), search=0.012))
    # act 3: card punches, climax, final chord
    punches = [(f"punch {c['id']}", c["punch_t"]) for c in cards]
    show("sfx stem", rv.onset_report(sfx, punches, band=(300.0, None), search=0.03))
    show("music stem", rv.onset_report(music, punches, band=(300.0, 4000.0), search=0.03))
    show("mix", rv.onset_report(mix, punches, band=(300.0, None), search=0.03))
    show("mix", rv.onset_report(mix, [("climax (>1.5 kHz)", R["climax"])], band=(1500.0, None), search=0.03))
    show("mix", rv.onset_report(mix, [("climax (>150 Hz)", R["climax"])], band=(150.0, None), search=0.03))
    show("music stem", rv.onset_report(music, [("network climax", R["climax"])], band=(150.0, 4000.0), search=0.03))
    chb = [e["t"] for e in cues["sfx"] if e["kind"] == "chime_big"]
    show("sfx stem", rv.onset_report(sfx, [("chime_big", t) for t in chb], band=(300.0, None), search=0.03))
    show("music stem", rv.onset_report(music, [("final chord", R["final_chord"])], band=(200.0, 3000.0), search=0.03))
    show("sfx stem", rv.onset_report(sfx, [("bell_jingle (finale)", t) for t in fin_bells], band=(2500.0, None)))
    meow = (cues.get("finale") or {}).get("meow")
    if meow is not None:
        show("sfx stem", rv.onset_report(sfx, [("meow bubble pop", meow)], band=(500.0, 4000.0)))
    w(f"  -> {len(fails)} checked onsets outside tolerance" + (f": {fails}" if fails else ""))

    # ------------------------------------------------- the bell over the final chord
    if fin_bells:
        bt = fin_bells[-1]
        bs = _band_rms_db(sfx, bt, bt + 0.45, (2500.0, 9000.0))
        bm = _band_rms_db(music, bt, bt + 0.45, (2500.0, 9000.0))
        w("")
        w(f"COLLAR BELL OVER THE FINAL CHORD ({bt:.2f} s, final chord {R['final_chord']:.2f} s): 2.5-9 kHz RMS over 450 ms: "
          f"bell {bs:.1f} dBFS, music {bm:.1f} dBFS -> bell {bs - bm:+.1f} dB over the music in its band "
          f"{'OK' if bs - bm >= 10 else 'CHECK'}")
        w(f"  full band: bell {_rms_db(sfx, bt, bt + 0.45):.1f} dBFS, music {_rms_db(music, bt, bt + 0.45):.1f} dBFS; "
          f"end of film: mix RMS {f1 - 0.5:.1f}-{f1:.1f} s {_rms_db(mix, f1 - 0.5, f1):.1f} dBFS, "
          f"{f1:.1f}-{dur:.1f} s {_rms_db(mix, f1, dur):.1f} dBFS")
    if meow is not None:
        ps_, pm_ = _pk_db(sfx, meow, meow + 0.15), _rms_db(music, meow, meow + 0.15)
        forum_pops = [t for t in cues["forum"]["replies"]]
        pf_ = max(_pk_db(sfx, t, t + 0.15) for t in forum_pops) if forum_pops else float("nan")
        w(f"THE CAT'S 'MEOW' BUBBLE ({meow:.2f} s): pop peak {ps_:.1f} dBFS (a forum reply pop: {pf_:.1f}) over the final chord "
          f"at {pm_:.1f} dBFS rms; 0.7-4 kHz: pop {_band_rms_db(sfx, meow, meow + 0.08, (700.0, 4000.0)):.1f} vs music "
          f"{_band_rms_db(music, meow, meow + 0.08, (700.0, 4000.0)):.1f} dBFS -> "
          f"{'OK (gentle)' if ps_ <= pf_ - 5.0 else 'CHECK'}")
    w("  the ending, mix RMS dBFS per 0.25 s from the final chord: "
      + " ".join(f"{_rms_db(mix, t, t + 0.25):.0f}" for t in np.arange(R["final_chord"], dur - 1e-6, 0.25)))

    # ------------------------------------------------- the letter's typing
    plan = sfxmod.typing_plan(cues)
    if plan:
        on = [t for t in sorted(plan) if plan[t] > 0]
        L_ = cues["letter"]
        t_typ = sum(len(l["text"]) for l in L_["lines"]) / L_["cps"]
        gaps = np.diff(on)
        gaps = gaps[gaps < 0.3]
        w("")
        w(f"THE LETTER'S TYPING: {len(plan)} type_soft cues at {L_['cps']:.0f} per second -> {len(on)} keys sound "
          f"({len(on) / t_typ:.1f} per second of typing; gaps {gaps.min() * 1000:.0f}-{gaps.max() * 1000:.0f} ms, "
          f"median {np.median(gaps) * 1000:.0f} ms) -> {'OK (no machine gun)' if len(on) / t_typ <= 14.0 else 'CHECK'}")
        for l in L_["lines"]:
            t0_, t1_ = l["t"], l["t"] + len(l["text"]) / L_["cps"]
            w(f"  {t0_:6.2f}-{t1_:6.2f} '{l['text'][:24]}': sfx stem rms {_rms_db(sfx, t0_, t1_):6.1f} dBFS, peak {_pk_db(sfx, t0_, t1_):6.1f}; "
              f"music stem rms {_rms_db(music, t0_, t1_):6.1f} dBFS")

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
    w(f"  -> worst loop lag {worst:.2f} ms (r = correlation with the source; G1 loops are also bit-crushed, "
      "G2 loops detune more each time)")

    w("")
    w("HARD EDGES (click check: a click = >2 kHz burst at the edge above -70 dBFS and >6 dB over the sounding side;")
    w("            'attack' = a percussive sound from silence: silent before it, no step on its first sample)")
    ts = g1["tape_stop"]
    blk = [s_ for s_ in g1["segments"] if s_["kind"] == "black"]
    sil = g2["silence"]
    edges_mix = [(blk[0]["t0"], "cut", "G1 static -> black") if blk else None,
                 (dark_bells[0], "attack", "darkness -> collar bell") if dark_bells else None,
                 (sil["t0"], "cut", "G2 flash -> digital silence"),
                 (ext[-1][1], "start", "silence -> letter (gate up)"),
                 (f1, "cut", "end of the final fade"), (0.0, "start", "start of film")]
    edges_mus = [(cues["chaos"]["freeze"] + score.FREEZE_TAPE, "cut", "music tape stop -> silence"),
                 (ts["t1"], "cut", "G1 tape stop -> hum"), (pickup, "start", "birthday pickup"),
                 (g2["note_warp"]["t1"], "cut", "song dies -> silence"),
                 (R["piano_start"], "start", "piano in")]
    for name, x, edges in (("mix", mix, edges_mix), ("music stem", music, edges_mus)):
        for (t, kind, lab, rel, pk, hf, click) in rv.edge_report(x, [e for e in edges if e]):
            if kind == "attack":     # a percussive start: silent before it, no step on its first sample
                w(f"  [{name:10s}] {lab:28s} t={t:7.3f} (attack): first sample {pk:7.1f} dBFS ({rel:+6.1f} dB vs the peak of its "
                  f"first 3 ms), the 3 ms before it {hf:7.1f} dBFS  {'CLICK?' if click else 'OK (no click)'}")
                continue
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
    build = (cues["launch"]["start"], T["act1"]["end"])
    waltz = (pickup, T["birthday"]["cut"])
    line = []
    half = {round(a, 3) for (a, b, _) in bars if b - a < 0.75 * T["act1"]["bar_seconds"]}
    for (t0, name, top, ok) in rows:
        note = "" if ok else (" (build: risers sweep all pitches)" if build[0] <= t0 < build[1]
                              else " (jazz voicing: see chart)" if waltz[0] <= t0 < waltz[1]
                              else " (half-bar push: the bar before it still rings)" if round(t0, 3) in half else " ??")
        line.append(f"{t0:6.2f} {name:5s} [{' '.join(top)}]{note}")
    for i in range(0, len(line), 3):
        w("  " + " | ".join(line[i:i + 3]))
    w(f"  -> {nok}/{len(rows)} bars consistent with their chord")
    w("")
    w("BIRTHDAY MELODY PITCH (dry piano-melody bus, strongest new fundamental after each cue note)")
    rows = rv.box_pitch_check(mxb.levels["melody"], mxb.n0, mel)
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
    Rr.extend("  " + l for l in log)
    (out / "report.txt").write_text("\n".join(Rr) + "\n")
    print("\n".join(Rr))

    # ------------------------------------------------------------------ plots
    for old in (out / "review").glob("*.png"):       # no stale pictures of an older cut
        old.unlink()
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
    ax.set_xlim(0, dur)
    ax.legend(loc="lower left")
    ax.set_title("short-term loudness (3 s window): mix vs stems")
    fig.tight_layout()
    fig.savefig(out / "review" / "loudness_stems.png", dpi=80)
    plt.close(fig)

    cd = cues["launch"]["countdown"]
    marks = [(t, f"cd{i}", "#e67e22") for i, t in enumerate(cd)]
    marks += [(cues["launch"]["click"], "click", "#e67e22")]
    marks += [(t, l.split()[-1], "#3498db") for (l, t, j) in st1]
    marks += [(h, "hit", "#e74c3c") for h in g1["hits"]]
    marks += [(g1["tape_stop"]["t0"], "tape0", "#9b59b6"), (g1["tape_stop"]["t1"], "tape1", "#9b59b6")]
    marks += [(s_["t0"], s_["kind"], "#2ecc71") for s_ in g1["segments"]]
    marks += [(t, "bell", "#16a085") for t in dark_bells[:1]]
    z0, z1 = cd[0] - 3.0, g1["end"] + 1.0
    rv.plot_zoom(out / "review" / "zoom_launch_g1.png", mix, z0, z1, marks,
                 f"{z0:.0f}-{z1:.0f} s: build, countdown, LAUNCH click, G1 crash (stutters, tape stop), black, the bell",
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

    # the dark, the bell, lights on, the first phrases of the song
    marks = [(n["t"], n["syl"], "#3498db") for n in mel]
    marks += [(e["t"], e["kind"], "#16a085") for e in cues["sfx"]
              if e["kind"] in ("bell_jingle", "blink_tick", "lights_on", "party_popper")]
    marks += [(s_["t0"], s_["kind"], "#2ecc71") for s_ in g1["segments"]]
    z0, z1 = g1["segments"][-1]["t0"] - 1.0, T["birthday"]["phrases"][min(1, len(T["birthday"]["phrases"]) - 1)]
    rv.plot_zoom(out / "review" / "zoom_dark_bell_song.png", mix, z0, z1, marks,
                 f"{z0:.1f}-{z1:.1f} s: static, black, the dark beat (collar bell, blink ticks), lights on, "
                 "'Happy Birthday' (jazz waltz)", extra=sfx, extra_label="sfx stem")
    # the dark beat alone, 40 dB up: the bells, the ticks and the room tone are far too quiet to
    # show at full scale
    da, db_ = s2n(b0 - 0.3), s2n(lights + 0.3)
    boost = np.clip(mix[:, da:db_] * 100.0, -1.0, 1.0)
    pad_ = np.zeros_like(mix)
    pad_[:, da:db_] = boost
    rv.plot_zoom(out / "review" / "zoom_dark_beat_x100.png", pad_, b0 - 0.3, lights + 0.3,
                 [(e["t"], e["kind"], "#16a085") for e in dark_ev] + [(lights, "lights_on", "#e74c3c")],
                 f"the dark beat {b0:.1f}-{lights:.1f} s, waveform and spectrogram of the mix amplified by 40 dB (clipped at +-1)")
    marks = [(n["t"], n["syl"], "#3498db") for n in mel if n["t"] > g2["start"] - 2.6]
    marks += [(t, l.split()[-1], "#e67e22") for (l, t) in st2]
    marks += [(h, "hit", "#e74c3c") for h in g2["hits"]]
    marks += [(l["t"], "line", "#16a085") for l in g2["terminal_lines"]]
    marks += [(s_["t0"], s_["kind"], "#2ecc71") for s_ in g2["segments"]] + [(sil["t1"], "end", "#2ecc71")]
    z0, z1 = g2["start"] - 2.5, sil["t1"] + 1.0
    rv.plot_zoom(out / "review" / "zoom_song_end_g2.png", mix, z0, z1, marks,
                 f"{z0:.1f}-{z1:.1f} s: end of the song, sabotaged 'you', terminal, crescendo, flash, digital silence",
                 extra=music, extra_label="music stem")
    fz, im = cues["chaos"]["freeze"], cues["chaos"]["implode"]
    marks = [(fz, "freeze/hard stop", "#e74c3c"), (fz + score.FREEZE_TAPE, "tape end", "#9b59b6"), (im[0], "rev riser", "#2ecc71"),
             (im[1], "DROP", "#e74c3c")] + [(c["t"], "caption", "#16a085") for c in cues["chaos"]["captions"]]
    rv.plot_zoom(out / "review" / "zoom_chaos_stop_drop.png", mix, fz - 3.0, im[1] + 2.0, marks,
                 f"{fz - 3:.0f}-{im[1] + 2:.0f} s: notification wall + snare build, hard stop (tape stop), "
                 "near-silence, reverse riser, drop", extra=sfx, extra_label="sfx stem")
    # the first seconds of the film: fade-in, drone, the first pings, the pulse coming in
    z1 = min(fz, pops[0] + 4.0)
    marks = [(p_, "ping", "#e67e22") for p_ in pops if p_ <= z1]
    marks += [(c["t"], "caption", "#16a085") for c in cues["chaos"]["captions"]]
    marks += [(e["t"], e["kind"], "#3498db") for e in cues["sfx"] if e["kind"] == "drone_in"]
    rv.plot_zoom(out / "review" / "zoom_opening.png", mix, 0.0, z1, marks,
                 f"0-{z1:.1f} s: the film opens - drone and pad swell in, the first notification pings, the pulse enters",
                 extra=sfx, extra_label="sfx stem")
    marks = [(R["drop"], "DROP", "#e74c3c"), (sec3["title"][1], "numbers", "#2ecc71")]
    marks += [(l["t"], "line", "#16a085") for l in cues["letter"]["lines"]]
    rv.plot_zoom(out / "review" / "zoom_letter_drop_title.png", mix, R["piano_start"] - 1.0, sec3["title"][1] + 2.5, marks,
                 "the letter (solo piano), riser + fill, the anthem drop, title, the band drops out into the numbers",
                 extra=sfx, extra_label="sfx stem")
    marks = []
    for c in cards:
        marks += [(c["t"], c["id"], "#2ecc71"), (c["build"], "build", "#3498db"), (c["punch_t"], "PUNCH", "#e74c3c")]
    rv.plot_zoom(out / "review" / "zoom_numbers.png", mix, sec3["numbers"][0] - 1.0, sec3["numbers"][1] + 1.0, marks,
                 "numbers: the light bed, per card: groove - chart build - punch accent - fill",
                 extra=sfx, extra_label="sfx stem")
    net = cues["network"]
    fin = cues["finale"]
    marks = [(net["start"], "network", "#2ecc71"), (net["gather"], "gather", "#3498db"), (R["climax"], "CLIMAX", "#e74c3c"),
             (fin["start"], "finale", "#2ecc71"), (R["final_chord"], "final chord", "#e74c3c"),
             (f0, "fade", "#9b59b6"), (f1, "silent", "#9b59b6")]
    marks += [(t, "bell", "#16a085") for t in fin_bells]
    if meow is not None:
        marks += [(meow, "meow", "#16a085")]
    rv.plot_zoom(out / "review" / "zoom_network_finale.png", mix, net["start"] - 1.0, dur, marks,
                 "network lift, gather swell, the climax chord + chime, finale (piano + pad), bell, final chord, meow, fade",
                 extra=music, extra_label="music stem")


if __name__ == "__main__":
    main()
