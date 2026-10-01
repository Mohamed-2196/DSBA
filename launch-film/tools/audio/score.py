"""score.py - the composition. Every time comes from cues.json; only musical subdivisions
(beats, 16ths) are derived from the cue tempo.

  act1(...)     product-launch electro-pop, A minor, Am-F-C-G (0-64 s, + the never-heard drop)
  birthday(...) music-box Happy Birthday waltz, C major, 3/4 (68-80.5 s, + the sabotaged "you")
  act3(...)     felt piano (D major) -> anthem drop at 95 -> outro + final chord
"""
from __future__ import annotations

import numpy as np

import instruments as ins
from dsp import (SR, s2n, tarr, mtof, rng_for, make_ir, butter, fade_edges, rc_ramp,
                 smoothstep, osc, env_adsr, TWO_PI, cents)
from mixing import Mixer

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
        "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def chord_pcs(name):
    root = name[0] + (name[1] if len(name) > 1 and name[1] in "#b" else "")
    q = name[len(root):]
    r = NOTE[root]
    ivs = [0, 3, 7] if (q.startswith("m") and not q.startswith("maj")) else [0, 4, 7]
    if "7" in q:
        ivs.append(11 if "maj" in q else 10)
    return r, [(r + i) % 12 for i in ivs]


def generic_voicing(name, lo, n=4):
    """Fallback close voicing above `lo` (used only for chords not in the tables)."""
    r, pcs = chord_pcs(name)
    out, m = [], lo
    while len(out) < n:
        if m % 12 in pcs:
            out.append(m)
        m += 1
    return out


def scene(cues, sid):
    for s in cues["scenes"]:
        if s["id"] == sid:
            return s["start"], s["end"]
    raise KeyError(sid)


def grid(t0, t1, step):
    k = np.arange(int(np.floor((t1 - t0) / step + 1e-6)))
    return t0 + k * step


def place_notes(bus, events, voice, **kw):
    for (t, *args) in events:
        bus.add(t, voice(*args, **kw))


# ============================================================================ ACT 1
# Voicings chosen for smooth voice leading (Am->F->C->G->Am all move by step).
CH1 = {
    "Am": dict(bass=33, pad=[57, 60, 64, 69], stab=[69, 72, 76], arp=[69, 72, 76, 81]),
    "F":  dict(bass=29, pad=[57, 60, 65, 69], stab=[69, 72, 77], arp=[65, 69, 72, 77]),
    "C":  dict(bass=36, pad=[55, 60, 64, 67], stab=[67, 72, 76], arp=[67, 72, 76, 79]),
    "G":  dict(bass=31, pad=[55, 59, 62, 67], stab=[67, 71, 74], arp=[67, 71, 74, 79]),
    "E":  dict(bass=28, pad=[56, 59, 64, 68], stab=[68, 71, 76], arp=[64, 68, 71, 76]),
}


def ch1(name):
    if name in CH1:
        return CH1[name]
    r, _ = chord_pcs(name)
    v = generic_voicing(name, 55)
    return dict(bass=28 + (r - 4) % 12, pad=v, stab=[m + 12 for m in v[1:]], arp=[m + 12 for m in v])


# lead hook: (16th step, midi, length in 16ths) - a 3-3-2 / 3-3-2 "tresillo" rhythm
MOTIF = {
    "Am":    [(0, 76, 3), (3, 76, 3), (6, 74, 2), (8, 76, 3), (11, 79, 3), (14, 76, 2)],
    "F":     [(0, 72, 3), (3, 72, 3), (6, 69, 2), (8, 72, 3), (11, 74, 3), (14, 72, 2)],
    "C":     [(0, 76, 3), (3, 76, 3), (6, 74, 2), (8, 72, 3), (11, 74, 3), (14, 76, 2)],
    "G":     [(0, 74, 3), (3, 71, 3), (6, 67, 9)],                 # phrase end
    "G2":    [(0, 74, 3), (3, 71, 3), (6, 67, 2), (8, 69, 3), (11, 71, 3), (14, 74, 2)],
    "Am_hi": [(0, 81, 3), (3, 79, 3), (6, 76, 2), (8, 79, 3), (11, 81, 3), (14, 84, 2)],
    "FG":    [(0, 72, 3), (3, 72, 3), (6, 69, 2), (8, 71, 3), (11, 74, 3), (14, 76, 2)],
}
TRES = [0, 3, 6, 8, 11, 14]


def section_chords(t0, t1, bar, loop, turnaround=True):
    """[(t, chord, dur)] cycling the cue loop; a leftover odd bar becomes an F|G push."""
    nb = int(round((t1 - t0) / bar))
    out = []
    for k in range(nb):
        t = t0 + k * bar
        if turnaround and k == nb - 1 and nb % 4 != 0:
            out += [(t, loop[1], bar / 2), (t + bar / 2, loop[3], bar / 2)]
        else:
            out.append((t, loop[k % 4], bar))
    return out


def act1_reverbs():
    return {
        "room": dict(kind="ir", ir=make_ir(0.55, 0.9, rng_for("ir", "room1"), predelay=0.006), ret_db=-6),
        "plate": dict(kind="ir", ir=make_ir(1.3, 1.9, rng_for("ir", "plate1"), predelay=0.012, er_level=0.2),
                      ret_db=-5, duck=0.4),
        "hall": dict(kind="ir", ir=make_ir(2.3, 3.0, rng_for("ir", "hall1"), predelay=0.02), ret_db=-4, duck=0.5),
        "delay": dict(kind="delay", time=0.375, fb=0.38, n=6, ret_db=-6, duck=0.5),
    }


def act1(cues):
    T = cues["tempo"]["act1"]
    beat = 60.0 / T["bpm"]
    bar = T["bar_seconds"]
    s16 = beat / 4.0
    loop = T["chords"]
    drop = T["drop"]
    a1_end = T["end"]
    chaos0, _ = scene(cues, "s02_chaos")
    freeze = cues["chaos"]["freeze"]
    imp0, imp1 = cues["chaos"]["implode"]
    logo = scene(cues, "s03_logo")
    news = scene(cues, "s04_newsletter")
    forum = scene(cues, "s05_forum")
    mont = scene(cues, "s06_everything")
    launch = scene(cues, "s07_launch")
    g1 = cues["g1"]
    cuts = [c["t"] for c in cues["montage"]["cuts"]]
    countdown = cues["launch"]["countdown"]
    first_line = cues["cold_open_lines"][0]["t"]

    mx = Mixer("act1", 0.0, g1["end"], act1_reverbs())
    mx.chords = []

    def pad_lp(t):
        fc = np.full_like(t, 6500.0)
        m = t < chaos0
        fc[m] = 260.0 * (2200.0 / 260.0) ** np.clip(t[m] / chaos0, 0, 1) ** 1.2
        m = (t >= chaos0) & (t < drop)
        fc[m] = 2200.0 * (7500.0 / 2200.0) ** np.clip((t[m] - chaos0) / (freeze - chaos0), 0, 1)
        m = t >= launch[0]
        u = np.clip((t[m] - launch[0]) / (a1_end - launch[0]), 0, 1)
        fc[m] = 3000.0 * (11000.0 / 3000.0) ** u
        return fc

    def build_hp(t):
        fc = np.full_like(t, 18.0)
        m = (t >= launch[0]) & (t < a1_end)
        u = np.clip((t[m] - launch[0]) / (a1_end - launch[0]), 0, 1)
        fc[m] = 18.0 * (380.0 / 18.0) ** (u ** 1.5)
        return fc

    B = {}
    B["kick"] = mx.bus("kick", gain_db=-4.5, sends={"room": 0.04})
    B["drums"] = mx.bus("drums", gain_db=-2.5, hp=90, sends={"room": 0.16, "plate": 0.06}, width=1.1)
    B["hats"] = mx.bus("hats", gain_db=-9.0, hp=400, sends={"room": 0.10}, width=1.35)
    B["bass"] = mx.bus("bass", gain_db=-10.5, duck=0.8, auto_hp=build_hp)
    B["pad"] = mx.bus("pad", gain_db=-15.5, duck=0.6, auto_lp=pad_lp, auto_hp=build_hp,
                      sends={"hall": 0.28}, width=1.45, hp=140)
    B["stabs"] = mx.bus("stabs", gain_db=-8.5, duck=0.5, hp=180, lp=9000,
                        sends={"plate": 0.22, "delay": 0.10}, width=1.35)
    B["arp"] = mx.bus("arp", gain_db=-14.0, duck=0.4, hp=200, auto_hp=build_hp,
                      sends={"delay": 0.20, "hall": 0.10}, width=1.25)
    B["lead"] = mx.bus("lead", gain_db=-8.0, duck=0.15, hp=150,
                       sends={"delay": 0.16, "hall": 0.14, "plate": 0.05})
    B["fx"] = mx.bus("fx", gain_db=-12.0, sends={"hall": 0.22}, width=1.3)
    B["hits"] = mx.bus("hits", gain_db=-8.0, sends={"hall": 0.25, "room": 0.1})
    B["pulse"] = mx.bus("pulse", gain_db=-7.0, sends={"room": 0.10})
    B["bells"] = mx.bus("bells", gain_db=-17.0, sends={"plate": 0.3, "delay": 0.2}, width=1.2)

    rk = rng_for("a1", "drums")
    KICK = ins.kick(rk)
    KICK_BIG = ins.kick(rng_for("a1", "kickbig"), f_start=180, f_end=44, decay=0.42, length=0.9, drive=2.0)
    CLAP = ins.clap(rng_for("a1", "clap"))
    SNARE = ins.snare(rng_for("a1", "snare"), tone_f=200.0, noise_decay=0.13)
    OH = ins.hat(rng_for("a1", "oh"), open_=True, decay=0.16)
    CH = [ins.hat(rng_for("a1", "ch", i), decay=0.028) for i in range(4)]
    TICK = [ins.hat(rng_for("a1", "tick", i), decay=0.015, bright=1.15) for i in range(4)]
    SHK = [ins.shaker(rng_for("a1", "shk", i)) for i in range(3)]
    CRASH = ins.crash(rng_for("a1", "crash"), length=3.2, decay=1.1)
    CRASH_S = ins.crash(rng_for("a1", "crash_s"), length=1.4, decay=0.45, hp=3500)
    TOMS = [ins.tom(rng_for("a1", "tom", i), f=f, decay=0.18) for i, f in enumerate((190.0, 145.0, 105.0))]

    kicks = []

    def kick_at(t, vel=1.0, big=False):
        B["kick"].add(t, KICK_BIG if big else KICK, vel)
        kicks.append(t)

    def snare_fill(t_end, n16, vel0=0.45, vel1=0.95, toms=False):
        for i in range(n16):
            t = t_end - (n16 - i) * s16
            v = vel0 + (vel1 - vel0) * i / max(n16 - 1, 1)
            if toms and i >= n16 - 3:
                B["drums"].add(t, TOMS[i - (n16 - 3)], v * 0.9, pan=(-0.35, 0.0, 0.35)[i - (n16 - 3)])
            else:
                B["drums"].add(t, SNARE, v * 0.75)

    # ------------------------------------------------------------- 0 .. freeze
    intro = section_chords(0.0, freeze + bar, bar, loop, turnaround=False)   # + the stopped bar
    mx.chords += [c for c in intro if c[0] < freeze]
    for (t, ch, d) in intro:
        att = 1.6 if t == 0 else 0.06
        sig = ins.supersaw(ch1(ch)["pad"], d + 0.05, rng_for("a1pad", t), voices=7, detune=17,
                           attack=att, decay=1.0, sustain=1.0, release=0.9, drift=3.0)
        B["pad"].add(t, sig, 0.9)
    # soft pulse on the beats (a heartbeat for "Pulse")
    PULSE = ins.soft_pulse(rng_for("a1", "pulse"), f=55.0)
    for t in grid(first_line, freeze, beat):
        u = (t - first_line) / (freeze - first_line)
        B["pulse"].add(t, PULSE, 0.45 + 0.4 * u)
    # quiet ticking 16th hats (fade in)
    for i, t in enumerate(grid(beat, freeze, s16)):
        u = min(1.0, t / chaos0)
        acc = (0.55, 0.22, 0.75, 0.3)[i % 4]
        B["hats"].add(t, TICK[i % 4], 0.5 * acc * (0.25 + 0.75 * u), pan=0.12 * ((i % 2) * 2 - 1))
    # tension: plucky 16th arp with a rising filter, sub notes
    ARP_PAT = [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 3, 2, 3]
    for (t, ch, d) in intro:
        if t < chaos0:
            continue
        tones = ch1(ch)["arp"]
        for k in range(int(round(d / s16))):
            tt = t + k * s16
            u = (tt - chaos0) / (freeze - chaos0)
            bright = round(min(1.0, 0.15 + 0.85 * u ** 1.3) * 20) / 20.0
            vel = (0.95 if k % 4 == 0 else 0.7) * (0.6 + 0.4 * u)
            B["arp"].add(tt, ins.pluck(tones[ARP_PAT[k % 16]], round(vel, 2), dur=0.1, bright=bright),
                         1.0, pan=0.18 * np.sin(k * 0.9))
        if t < freeze:
            B["bass"].add(t, ins.bass_note(ch1(ch)["bass"] + 12, d - 0.05, 0.35, cutoff=300, drive=1.0,
                                           mid=0.25, attack=0.05), 1.0)
    # snare build over the last bar before the freeze
    tb = freeze - bar
    roll = list(grid(tb, freeze - bar / 2, beat / 2)) + list(grid(freeze - bar / 2, freeze - bar / 4, s16)) \
        + list(grid(freeze - bar / 4, freeze, s16 / 2))
    for t in roll:
        u = (t - tb) / bar
        B["drums"].add(t, ins.snare(rng_for("a1roll", t), tone_f=185 + 70 * u, noise_decay=0.08 + 0.05 * (1 - u)),
                       0.12 + 0.5 * u ** 1.4)
    B["fx"].add(freeze - 2 * bar, ins.noise_sweep(2 * bar, rng_for("a1", "riser0"), 400.0, 7000.0, q=1.6,
                                                  amp_pow=2.4), 0.35)
    # the downbeat that never happens (heard only through the tape stop)
    kick_at(freeze, 1.0, big=True)
    B["drums"].add(freeze, CRASH, 0.6)
    B["bass"].add(freeze, ins.bass_note(ch1(loop[0])["bass"], bar, 0.9), 1.0)

    # ------------------------------------------------------------ drop sections
    def drums_bar(t, style, k_in_sec):
        for b in range(4):
            kick_at(t + b * beat)
        for b in (1, 3):
            B["drums"].add(t + b * beat, CLAP, 0.8)
            if style in ("montage", "drop2"):
                B["drums"].add(t + b * beat, SNARE, 0.45)
        for b in range(4):
            B["hats"].add(t + b * beat + 2 * s16, OH, 0.55 if style != "logo" else 0.6, pan=0.1)
        for i in range(16):
            if i % 4 == 2:
                continue
            acc = (0.32, 0.5, 0, 0.55)[i % 4]
            if style == "logo" and i % 2 == 1:
                continue
            if style == "grooveB":
                acc = (0.3, 0.62, 0, 0.42)[i % 4]
            B["hats"].add(t + i * s16, CH[i % 4], acc * (0.85 if style != "montage" else 1.0),
                          pan=-0.25 if i % 2 else 0.2)
        if style in ("grooveB", "montage", "drop2"):
            for i in range(16):
                B["hats"].add(t + i * s16, SHK[i % 3], (0.5, 0.25, 0.4, 0.3)[i % 4] * 0.6, pan=0.45)

    def bass_bar(t, ch, d, style):
        root = ch1(ch)["bass"]
        if style in ("logo", "grooveA"):
            for b in range(int(round(d / beat))):
                m = root + (12 if b == 3 else 0)
                B["bass"].add(t + b * beat + 2 * s16, ins.bass_note(m, 2 * s16 * 0.92, 0.95), 1.0)
        elif style == "grooveB":
            for st in TRES:
                if st * s16 >= d - 1e-6:
                    continue
                m = root + (12 if st in (6, 14) else 0)
                B["bass"].add(t + st * s16, ins.bass_note(m, s16 * 2.4, 0.95, cutoff=750), 1.0)
        else:   # rolling 16ths off the kick
            for i in range(int(round(d / s16))):
                if i % 4 == 0:
                    continue
                m = root + (12 if i % 4 == 2 else 0)
                B["bass"].add(t + i * s16, ins.bass_note(m, s16 * 0.85, 0.9 if i % 4 != 2 else 0.75,
                                                         cutoff=900, decay=0.12, sustain=0.6), 1.0)

    def stabs_bar(t, ch, d, style):
        v = ch1(ch)["stab"]
        steps = TRES if style in ("logo", "montage", "drop2") else [2, 6, 10, 14]
        for st in steps:
            if st * s16 >= d - 1e-6:
                continue
            sig = ins.supersaw(v, 0.11, rng_for("stab", ch, st), voices=5, detune=13, attack=0.003,
                               decay=0.12, sustain=0.0, release=0.12, drift=0.5)
            B["stabs"].add(t + st * s16, sig, 1.0 if st in (0, 8) else 0.8)

    def pad_bar(t, ch, d, gain):
        sig = ins.supersaw(ch1(ch)["pad"], d + 0.02, rng_for("a1pad", t), voices=7, detune=15,
                           attack=0.02, decay=0.6, sustain=0.9, release=0.25)
        B["pad"].add(t, sig, gain)

    def arp_bar(t, ch, d, vel=0.75, bright=0.75):
        tones = ch1(ch)["arp"]
        for k in range(int(round(d / s16))):
            B["arp"].add(t + k * s16, ins.pluck(tones[ARP_PAT[k % 16]], round(vel * (1.0 if k % 4 == 0 else 0.8), 2),
                                                dur=0.1, bright=bright), 1.0, pan=0.2 * np.sin(k * 0.9))

    def lead_notes(chs, motif_names, octave=0, vel=1.0):
        notes = []
        for (t, ch, d), mname in zip(chs, motif_names):
            if mname is None:
                continue
            for (st, m, ln) in MOTIF[mname]:
                notes.append((t + st * s16, ln * s16 * 0.92, m + 12 * octave,
                              vel * (1.0 if st in (0, 8) else 0.86)))
        return notes

    def motif_names_for(chs, hi_bar=None):
        names = []
        for i, (t, ch, d) in enumerate(chs):
            if d < bar - 1e-6:          # half-bar turnaround: one 'FG' push over both halves
                names.append("FG" if i + 1 < len(chs) and chs[i + 1][2] < bar - 1e-6 else None)
                continue
            if i == hi_bar:
                names.append("Am_hi")
            elif ch == loop[3]:
                nxt = chs[i + 1][1] if i + 1 < len(chs) else None
                names.append("G2" if nxt == loop[0] else "G")
            else:
                names.append(ch if ch in MOTIF else None)
        return names

    def groove(t0, t1, style, chords=None):
        chs = chords or section_chords(t0, t1, bar, loop)
        mx.chords.extend(c for c in chs if c[0] < a1_end)
        bars_t = sorted({round(t0 + k * bar, 6) for k in range(int(round((t1 - t0) / bar)))})
        for i, bt in enumerate(bars_t):
            drums_bar(bt, style, i)
        for (t, ch, d) in chs:
            bass_bar(t, ch, d, style)
            if style != "grooveB":
                stabs_bar(t, ch, d, style)
            pad_bar(t, ch, d, {"logo": 0.95, "grooveA": 0.55, "grooveB": 0.7, "montage": 0.8, "drop2": 0.85}[style])
            if style in ("grooveA", "montage", "drop2"):
                arp_bar(t, ch, d, vel=0.7 if style == "grooveA" else 0.8, bright=0.7 if style == "grooveA" else 0.9)
        return chs

    # logo reveal: full groove, crash, a 4-note sparkle when the pills arrive
    groove(logo[0], logo[1], "logo")
    B["drums"].add(logo[0], CRASH, 0.85)
    pills = cues["logo"]["pills"]
    for i, m in enumerate((79, 84, 88, 91)):
        B["bells"].add(pills + i * s16, ins.glock(m, 0.9), 1.0)
    # newsletter: groove A
    groove(news[0], news[1], "grooveA")
    B["drums"].add(news[0], CRASH, 0.6)
    snare_fill(news[1], 4)
    # forum: groove B + the lead hook
    chs = groove(forum[0], forum[1], "grooveB")
    B["drums"].add(forum[0], CRASH, 0.6)
    snare_fill(forum[1], 4, toms=True)
    t_l, sig = ins.lead_line(lead_notes(chs, motif_names_for(chs)), rng_for("lead", "forum"))
    B["lead"].add(t_l, sig, 1.0)
    # montage: everything, lead doubled, fills into every cut, crashes on the cuts
    chs = groove(mont[0], mont[1], "montage")
    B["drums"].add(mont[0], CRASH, 0.75)
    names = motif_names_for(chs, hi_bar=4 if len(chs) > 5 else None)
    t_l, sig = ins.lead_line(lead_notes(chs, names), rng_for("lead", "mont"), cutoff=4800)
    B["lead"].add(t_l, sig, 1.0)
    t_l, sig = ins.lead_line(lead_notes(chs, names, octave=1, vel=0.8), rng_for("lead", "mont8"),
                             cutoff=6000, detune=12, sub=0.0)
    B["lead"].add(t_l, sig, 0.33)
    for c in cuts:
        if c <= mont[0] + 1e-6 or c >= mont[1] - 1e-6:
            continue
        n16 = 4 if abs((c - mont[0]) / bar - round((c - mont[0]) / bar)) < 1e-6 else 2
        snare_fill(c, n16, toms=(n16 == 4))
        B["drums"].add(c, CRASH_S, 0.7)
    snare_fill(mont[1], 8, 0.35, 1.0, toms=True)

    # ------------------------------------------------------------- launch build
    bl0, bl1 = launch[0], a1_end
    nbars = int(round((bl1 - bl0) / bar))
    bchs = [(bl0 + k * bar, (loop[0], loop[1], loop[3])[min(k, 2)], bar) for k in range(nbars)]
    # last bar: G then E (the dominant) for maximum pull to the Am that never comes
    lt, lch, _ = bchs[-1]
    bchs[-1] = (lt, loop[3], bar / 2)
    bchs.append((lt + bar / 2, "E", bar / 2))
    mx.chords.extend(bchs)
    # The build stops dead on ONE accented pre-drop hit, a 16th before the drop. It sits
    # exactly on the first G1 stutter's source, so every stutter loop starts on that hit.
    st0 = g1["stutters"][0]["src"] if g1["stutters"] else a1_end - s16
    pre_hit = st0 if countdown[-1] < st0 < a1_end else a1_end - s16
    B["drums"].add(bl0, CRASH, 0.85)
    kick_at(bl0, 1.0, big=True)
    for (t, ch, d) in bchs:
        d = min(t + d, pre_hit) - t
        sig = ins.supersaw(ch1(ch)["pad"], d + 0.01, rng_for("a1bpad", t), voices=7, detune=18,
                           attack=0.03, decay=1.0, sustain=1.0, release=0.03)
        B["pad"].add(t, sig, 0.95)
        B["bass"].add(t, ins.bass_note(ch1(ch)["bass"], d, 0.8, cutoff=500, attack=0.01, release=0.01), 1.0)
        arp_bar(t, ch, d, vel=0.85, bright=1.0)
    # kick: quarters, then 8ths, then 16ths
    for t in grid(bl0 + beat, pre_hit, beat / 4):
        u = (t - bl0) / (bl1 - bl0)
        step = beat if u < 0.5 else (beat / 2 if u < 5 / 6 else s16)
        if abs((t - bl0) / step - round((t - bl0) / step)) < 1e-6:
            B["kick"].add(t, KICK, 0.55 + 0.35 * u)
            kicks.append(t)
    # snare roll accelerating: quarters -> 8ths -> 16ths -> 32nds
    tt = bl0
    while tt < pre_hit - 1e-6:
        u = (tt - bl0) / (bl1 - bl0)
        step = beat if u < 1 / 6 else (beat / 2 if u < 5 / 12 else (s16 if u < 3 / 4 else s16 / 2))
        B["drums"].add(tt, ins.snare(rng_for("a1broll", round(tt, 4)), tone_f=190 + 90 * u,
                                     noise_decay=0.12 - 0.06 * u), 0.2 + 0.7 * u ** 1.6)
        tt = round(tt + step, 6)
    rz = ins.noise_sweep(pre_hit - bl0, rng_for("a1", "riser1"), 300.0, 6500.0, q=1.5, amp_pow=2.6)
    rz = butter(rz, "lowpass", 9000.0, 2)
    fade_edges(rz, 0.0, 0.008)
    B["fx"].add(bl0, rz, 0.5)
    # the pre-drop hit (then a 16th of near-silence where the drop should land)
    B["hits"].add(pre_hit, KICK_BIG, 0.95)
    B["drums"].add(pre_hit, SNARE, 1.1)
    B["drums"].add(pre_hit, CRASH_S, 0.55)
    B["hits"].add(pre_hit, ins.supersaw([m + 12 for m in ch1("E")["pad"]], 0.05, rng_for("prehit"), voices=7,
                                        detune=16, attack=0.002, decay=0.05, sustain=0.0, release=0.06), 0.9)
    # pitch riser: detuned saw cluster sweeping up an octave
    n = s2n(pre_hit - countdown[0])
    tr = tarr(n)
    u = tr / tr[-1]
    rs = np.zeros((2, n))
    for j, m in enumerate((57, 64, 69)):
        f = float(mtof(m)) * 2.0 ** (u ** 1.6)
        for c in range(2):
            rs[c] += ins.osc("saw", f * cents((-6, 6)[c] + j), n, 0.1 * j + 0.3 * c)
    rs = butter(rs, "lowpass", 5000.0, 2) * (u ** 2.2)
    fade_edges(rs, 0.05, 0.004)
    B["fx"].add(countdown[0], rs / np.max(np.abs(rs)), 0.35)
    # countdown hits: kick + crash + boom + a tutti stab of the chord under each number
    hit_ch = []
    for t in countdown:
        c_here = [c for c in bchs if c[0] <= t + 1e-6][-1][1]
        hit_ch.append(c_here)
    for i, (t, c_here) in enumerate(zip(countdown, hit_ch)):
        v = 0.8 + 0.1 * i
        B["hits"].add(t, KICK_BIG, v)
        kicks.append(t)
        B["hits"].add(t, ins.boom(rng_for("a1boom", i), f0=70, f1=34, decay=0.5, length=1.2), 0.55 * v)
        B["drums"].add(t, CRASH_S, 0.8 * v)
        sig = ins.supersaw([m + 12 for m in ch1(c_here)["pad"]] + [ch1(c_here)["pad"][0]], 0.35,
                           rng_for("cdstab", i), voices=7, detune=16, attack=0.003, decay=0.25,
                           sustain=0.25, release=0.3)
        B["hits"].add(t, sig, 0.9 * v)

    # ------------------------------------------- the drop that never comes (64 ->)
    after = section_chords(a1_end, a1_end + 2 * bar, bar, loop, turnaround=False)
    groove(a1_end, a1_end + 2 * bar, "drop2", chords=after)
    B["drums"].add(a1_end, CRASH, 0.9)
    B["hits"].add(a1_end, KICK_BIG, 0.9)
    t_l, sig = ins.lead_line(lead_notes(after, [after[0][1], after[1][1]]), rng_for("lead", "drop2"), cutoff=5200)
    B["lead"].add(t_l, sig, 1.0)
    # accents on the later stutter sources that are heard un-slowed, so those loops start
    # on a transient too (the third stutter's source lies inside the tape stop: no accent)
    for st in g1["stutters"][1:]:
        if a1_end <= st["src"] < g1["tape_stop"]["t0"]:
            B["drums"].add(st["src"], CLAP, 0.9)
            B["drums"].add(st["src"], SNARE, 0.6)

    mx.kicks = sorted(set(round(k, 6) for k in kicks if k >= drop - 1e-6))
    mix = mx.render()

    # ---------------------------------------------------- hard stop at the freeze
    from dsp import tape_stop
    n0 = mx.n0
    seg_a, seg_b = s2n(freeze - 0.5) - n0, s2n(drop) - n0
    sub = mix[:, seg_a:seg_b].copy()
    tape_stop(sub, n0 + seg_a, freeze, freeze + 0.25, power=1.3, amp_pow=0.4, kill_after=True)
    F = s2n(0.012)
    k = s2n(freeze + 0.25) - (n0 + seg_a)
    sub[:, k - F:k] *= rc_ramp(F, up=False)
    mix[:, seg_a:seg_b] = sub
    # reverse swell into the drop (reverse reverb of the first drop chord + crash)
    ir = mx.reverbs["hall"]["ir"]
    stab = ins.supersaw(ch1(loop[0])["pad"] + [m + 12 for m in ch1(loop[0])["pad"]], 0.3,
                        rng_for("revswell"), voices=7, detune=15, attack=0.003, decay=0.3, sustain=0.3, release=0.2)
    cr = np.zeros_like(stab)
    cr[:, :min(stab.shape[1], CRASH.shape[1])] = CRASH[:, :stab.shape[1]] * 0.5
    sw = ins.reverse_swell(stab + cr, ir * 1.0, drop - imp0, power=1.6)
    i0 = s2n(imp0) - n0
    mix[:, i0:i0 + sw.shape[1]] += sw * 0.30
    return mx, mix


def act1_glitch(mix, n0, cues, with_hum=True):
    """G1 crash on the Act-1 music (+ near-silent broken-amp hum under the error SFX)."""
    from mixing import glitch1
    g1 = cues["g1"]
    a = s2n(g1["start"] - 1.0) - n0
    sub = mix[:, a:].copy()
    glitch1(sub, n0 + a, g1)
    mix[:, a:] = sub
    if with_hum:
        ts1 = g1["tape_stop"]["t1"]
        st = [s for s in g1["segments"] if s["kind"] == "static"]
        hum_end = st[0]["t0"] if st else g1["end"]
        n = s2n(hum_end - ts1)
        t = tarr(n)
        rng = rng_for("hum")
        h = sum(a_ * np.sin(TWO_PI * 50.0 * k * t + rng.uniform(0, 6.28)) for k, a_ in ((1, 1.0), (2, 0.5), (3, 0.35), (5, 0.12)))
        crack = np.zeros(n)
        idx = rng.integers(0, n, 14)
        crack[idx] = rng.uniform(-1, 1, 14)
        crack = butter(crack, "bandpass", (1500.0, 6000.0), 2) * 6.0
        h = (h + crack) * smoothstep(t / 0.25) * (1 - smoothstep((t - (n / SR - 0.3)) / 0.3))
        i0 = s2n(ts1) - n0
        mix[:, i0:i0 + n] += np.stack([h, h * 0.9]) * 10 ** (-44 / 20)
    return mix


# ========================================================================= BIRTHDAY
BD_HARM = ["C", "G7", "G7", "C", "C7", "F", "C|G7", "C"]          # one per 3/4 bar
BD_CHORD = {"C": [52, 55, 60], "G7": [53, 55, 59], "C7": [52, 58, 60], "F": [53, 57, 60]}
BD_BASS = {"C": 36, "G7": 43, "C7": 36, "F": 41}


def birthday(cues):
    tb = cues["tempo"]["birthday"]
    beat = tb["beat_seconds"]
    pickup = tb["pickup"]
    cut = tb["cut"]
    mel = cues["birthday"]["melody"]
    t_start = cues["birthday"]["surprise"]
    end = cues["g2"]["note_warp"]["t1"] + 0.6
    rv = {
        "plate": dict(kind="ir", ir=make_ir(1.5, 2.2, rng_for("ir", "plate_bd"), predelay=0.015, er_level=0.25,
                                            hf=0.6), ret_db=-6),
        "room": dict(kind="ir", ir=make_ir(0.5, 0.8, rng_for("ir", "room_bd"), predelay=0.005), ret_db=-8),
    }
    mx = Mixer("bday", t_start, end, rv, keep=("box",))
    box = mx.bus("box", gain_db=-10.5, hp=120, sends={"plate": 0.30, "room": 0.10}, width=1.15)
    bass = mx.bus("bass", gain_db=-13.5, lp=1200, sends={"room": 0.12})
    chords = mx.bus("chords", gain_db=-19.0, hp=150, sends={"plate": 0.22, "room": 0.08}, width=1.3)
    spark = mx.bus("spark", gain_db=-26.0, hp=600, sends={"plate": 0.35}, width=1.4)

    # downbeats: first full bar starts one beat after the pickup; 3 beats per bar
    first = pickup + beat
    nbar = int(round((cut - first) / (3 * beat))) + 1
    downs = [first + 3 * beat * k for k in range(nbar)]
    harm = (BD_HARM * 2)[:nbar]
    mx.chords = [(d, h, 3 * beat) for d, h in zip(downs, harm)][:-1]
    # the box plays exactly the cue notes
    for i, nt in enumerate(mel):
        t = nt["t"]
        on_down = any(abs(t - d) < 1e-3 for d in downs)
        short = nt["dur"] < beat * 0.5
        vel = 0.95 if on_down else (0.72 if short else 0.85)
        sig = ins.music_box(nt["midi"], vel, rng_for("box", i))
        # a re-plucked tine stops its previous vibration: damp this note where the same
        # pitch is struck again (no random-phase cancellation between repeated notes)
        nxt = [m for m in mel[i + 1:] if m["midi"] == nt["midi"]]
        if nxt:
            k = s2n(nxt[0]["t"] - t)
            if k < len(sig):
                F = s2n(0.006)
                sig[k - F:k] *= rc_ramp(F, up=False)
                sig[k:] = 0.0
        box.add(t, sig, 1.0, pan=0.0)
    # oom-pah-pah: soft bass on 1, light celesta/marimba chords on 2 and 3
    for k, (d, h) in enumerate(zip(downs, harm)):
        last = k == nbar - 1
        parts = h.split("|")
        h1 = parts[0]
        h3 = parts[-1]
        bass.add(d, ins.soft_bass(BD_BASS[h1], (3 * beat if last else beat * 0.95), 0.9), 1.0)
        if last:
            for m in BD_CHORD["C"] + [64]:
                chords.add(d, ins.celesta(m, 0.75, rng_for("bdc", k, m)), 1.0)
                chords.add(d, ins.marimba(m, 0.4, rng_for("bdm", k, m)), 0.5)
            continue
        for b, hh in ((1, h1 if len(parts) == 1 else parts[0]), (2, h3)):
            for j, m in enumerate(BD_CHORD[hh]):
                chords.add(d + b * beat, ins.celesta(m, 0.62 if b == 1 else 0.5, rng_for("bdc", k, b, m)), 1.0,
                           pan=(-0.3, 0.0, 0.3)[j])
                chords.add(d + b * beat, ins.marimba(m, 0.33, rng_for("bdm", k, b, m)), 0.45)
    # cheese: glock doubles the melody an octave up from the 3rd phrase, a triangle on its peak
    third = [nt for nt in mel if nt["t"] >= downs[min(4, nbar - 1)] - 2 * beat - 1e-3]
    for i, nt in enumerate(third):
        spark.add(nt["t"], ins.glock(nt["midi"] + 12, 0.8, rng_for("bdg", i), tau_scale=0.5), 1.0)
    spark.add(downs[min(4, nbar - 1)], ins.triangle_ting(rng_for("tri"), f=3135.0, length=1.4), 0.6)
    mix = mx.render()
    return mx, mix


def birthday_glitch(mix, n0, cues):
    from mixing import glitch2
    glitch2(mix, n0, cues["g2"])
    return mix


# ============================================================================ ACT 3
CH3 = {
    "D":  dict(bass=38, pad=[62, 66, 69, 74], low=[50, 57], ten=[57, 62, 66], gl=[86, 90, 93, 98]),
    "A":  dict(bass=33, pad=[61, 64, 69, 73], low=[45, 52], ten=[57, 61, 64], gl=[85, 88, 93, 97]),
    "Bm": dict(bass=35, pad=[62, 66, 71, 74], low=[47, 54], ten=[59, 62, 66], gl=[86, 90, 95, 98]),
    "G":  dict(bass=31, pad=[62, 67, 71, 74], low=[43, 50], ten=[55, 59, 62], gl=[86, 91, 95, 98]),
}

# anthem theme, (beat, midi, beats). Stated softly by the piano, then big at the drop.
THEME = [
    [(0, 69, 1), (1, 74, 1), (2, 78, 2)],          # D : A4 D5 F#5
    [(0, 76, 3), (3, 73, 1)],                      # A : E5 . . C#5
    [(0, 74, 1), (1, 78, 1), (2, 83, 2)],          # Bm: D5 F#5 B5
    [(0, 81, 2), (2, 79, 1), (3, 78, 1)],          # G : A5 . G5 F#5
]
THEME_END = [(0, 78, 4)]                            # D : F#5 (held)
CODA = [(0, 81, 2), (2, 78, 1), (3, 76, 1)]         # D : A5 . F#5 E5  -> D5 into the outro


def ch3(name):
    if name in CH3:
        return CH3[name]
    v = generic_voicing(name, 60)
    r, _ = chord_pcs(name)
    return dict(bass=36 + (r - 0) % 12 - 12 * ((r % 12) > 7), pad=v, low=[v[0] - 12, v[1] - 12],
                ten=[m - 12 for m in v[:3]], gl=[m + 24 for m in v])


def act3(cues):
    R = cues["tempo"]["reveal"]
    beat = 60.0 / R["bpm"]
    bar = R["bar_seconds"]
    s16 = beat / 4
    loop = R["chords"]
    p0, drop, fin, end = R["piano_start"], R["drop"], R["final_chord"], R["end"]
    names = cues["names"]
    outro0 = cues["outro"]["start"]
    fade0, fade1 = cues["outro"]["fade"]
    start = cues["g2"]["silence"]["t1"]
    rv = {
        "hall": dict(kind="ir", ir=make_ir(2.8, 3.6, rng_for("ir", "hall3"), predelay=0.025, hf=0.4, lf=1.2),
                     ret_db=-3, duck=0.35),
        "room": dict(kind="ir", ir=make_ir(0.6, 0.9, rng_for("ir", "room3"), predelay=0.006), ret_db=-7),
        "delay": dict(kind="delay", time=0.375, fb=0.35, n=6, ret_db=-8, duck=0.5),
    }
    mx = Mixer("act3", start, end, rv)
    mx.chords = []
    B = {}
    B["piano"] = mx.bus("piano", gain_db=-5.0, hp=45, sends={"hall": 0.32, "room": 0.10}, width=1.2)
    B["kick"] = mx.bus("kick", gain_db=-3.8, sends={"room": 0.05})
    B["drums"] = mx.bus("drums", gain_db=-4.0, hp=90, sends={"room": 0.14, "hall": 0.08}, width=1.15)
    B["hats"] = mx.bus("hats", gain_db=-10.0, hp=500, sends={"room": 0.1}, width=1.35)
    B["bass"] = mx.bus("bass", gain_db=-9.0, duck=0.55)
    B["pad"] = mx.bus("pad", gain_db=-15.0, hp=150, lp=7000, duck=0.4, sends={"hall": 0.3}, width=1.5)
    B["strings"] = mx.bus("strings", gain_db=-13.0, hp=200, duck=0.25, sends={"hall": 0.35}, width=1.4)
    B["lead"] = mx.bus("lead", gain_db=-7.0, hp=160, duck=0.1, sends={"hall": 0.3, "delay": 0.2})
    B["bells"] = mx.bus("bells", gain_db=-17.0, hp=900, sends={"hall": 0.35, "delay": 0.15}, width=1.3)
    B["fx"] = mx.bus("fx", gain_db=-12.0, sends={"hall": 0.25}, width=1.3)
    B["hits"] = mx.bus("hits", gain_db=-11.0, hp=120, sends={"hall": 0.35}, width=1.4)

    KICK = ins.kick(rng_for("a3", "kick"), f_start=150, f_end=46, decay=0.32, length=0.6, drive=1.5)
    CLAP = ins.clap(rng_for("a3", "clap"), decay=0.09)
    SNARE = ins.snare(rng_for("a3", "snare"), tone_f=185.0, noise_decay=0.16)
    OH = ins.hat(rng_for("a3", "oh"), open_=True, decay=0.2)
    CH = [ins.hat(rng_for("a3", "ch", i), decay=0.03) for i in range(4)]
    CRASH = ins.crash(rng_for("a3", "crash"), length=3.5, decay=1.3)
    TOMS = [ins.tom(rng_for("a3", "tom", i), f=f, decay=0.22) for i, f in enumerate((180.0, 135.0, 98.0, 75.0))]
    kicks = []

    def piano_bar(t, ch, d, vel=0.3, melody=None, mvel=0.5, eighths=True):
        c = ch3(ch)
        B["piano"].add(t, ins.felt_piano(c["bass"], d + 0.1, vel * 1.25, rng_for("p3b", t)), 1.0)
        B["piano"].add(t, ins.felt_piano(c["bass"] + 12, d + 0.1, vel * 0.9, rng_for("p3b8", t)), 0.7)
        ten = c["ten"]
        pat = [0, 1, 2, 1, 0, 1, 2, 1] if eighths else [0, 1, 2, 1]
        step = beat / 2 if eighths else beat
        for i, idx in enumerate(pat):
            tt = t + i * step
            if tt >= t + d - 1e-6:
                break
            B["piano"].add(tt, ins.felt_piano(ten[idx], d - i * step + 0.05, vel * (0.85 if i % 2 else 1.0),
                                              rng_for("p3t", round(tt, 4))), 1.0)
        for (b, m, ln) in (melody or []):
            B["piano"].add(t + b * beat, ins.felt_piano(m, ln * beat * 0.98, mvel, rng_for("p3m", t, b)), 1.0)

    # ------------------------------------------------- 87-95: the letter, soft piano
    pch = section_chords(p0, drop, bar, loop, turnaround=False)
    mx.chords += pch
    for i, (t, ch, d) in enumerate(pch):
        piano_bar(t, ch, d, vel=0.26 + 0.03 * i, melody=THEME[i % 4], mvel=0.42 + 0.03 * i)
    # riser + drum fill over the last bar
    fb = drop - bar
    for t in grid(fb, drop - beat, beat / 2):
        u = (t - fb) / bar
        B["drums"].add(t, SNARE, 0.12 + 0.33 * u)
    for i, t in enumerate(grid(drop - beat, drop, s16)):
        B["drums"].add(t, TOMS[i % 4], 0.45 + 0.1 * i, pan=(-0.4, -0.15, 0.15, 0.4)[i % 4])
    B["drums"].add(drop - beat / 2, SNARE, 0.55)
    B["drums"].add(drop - beat / 4, SNARE, 0.65)
    gap = 0.04        # a 40 ms air pocket right before the drop makes it punch
    B["fx"].add(fb, ins.noise_sweep(bar - gap, rng_for("a3", "riser"), 350.0, 8000.0, q=1.5, amp_pow=2.4), 0.35)
    sw = ins.reverse_swell(np.stack([CRASH[0][:s2n(1.5)], CRASH[1][:s2n(1.5)]]),
                           mx.reverbs["hall"]["ir"], bar / 2 - gap, power=1.4)
    B["fx"].add(drop - bar / 2, sw, 0.45)
    # the drop itself: a tutti D-major stab (two octaves) on the downbeat, no sidechain
    c0 = ch3(loop[0])
    B["hits"].add(drop, ins.supersaw(c0["pad"] + [m + 12 for m in c0["pad"]] + c0["low"], 0.25, rng_for("a3drop"),
                                     voices=7, detune=14, attack=0.003, decay=0.35, sustain=0.3, release=0.5), 1.0)

    # ------------------------------------------------- 95-113: the anthem
    ach = section_chords(drop, outro0, bar, loop, turnaround=False)
    mx.chords += ach
    for i, (t, ch, d) in enumerate(ach):
        c = ch3(ch)
        for b in range(4):
            B["kick"].add(t + b * beat, KICK, 1.0)
            kicks.append(t + b * beat)
            B["hats"].add(t + b * beat + 2 * s16, OH, 0.55)
        for b in (1, 3):
            B["drums"].add(t + b * beat, CLAP, 0.75)
            B["drums"].add(t + b * beat, SNARE, 0.4)
        for k in range(16):
            if k % 4 == 2:
                continue
            B["hats"].add(t + k * s16, CH[k % 4], (0.3, 0.5, 0, 0.55)[k % 4], pan=-0.2 if k % 2 else 0.2)
        for k in range(8):
            m = c["bass"] + (12 if k % 2 else 0)
            B["bass"].add(t + k * beat / 2, ins.bass_note(m, beat / 2 * 0.9, 0.9 if k % 2 == 0 else 0.75,
                                                          cutoff=700), 1.0)
        B["pad"].add(t, ins.supersaw(c["pad"], d + 0.02, rng_for("a3pad", t), voices=7, detune=13,
                                     attack=0.03, decay=0.8, sustain=0.9, release=0.3), 0.9)
        B["strings"].add(t, ins.strings(c["low"] + [c["pad"][1], c["pad"][3]], d + 0.05, rng_for("a3str", t),
                                        attack=0.25 if i else 0.08, release=0.6), 1.0)
        if not (names["times"][0] - beat <= t < names["times"][-1]):
            for k in range(8):
                B["bells"].add(t + k * beat / 2, ins.glock(c["gl"][(0, 2, 1, 3, 2, 1, 3, 2)[k]] - 12,
                                                           0.7, rng_for("a3gl", t, k), tau_scale=0.6),
                               1.0 if k % 2 == 0 else 0.75)
    # crashes on phrase starts, a tom fill into the second phrase
    for k, (t, ch, d) in enumerate(ach):
        if k % 4 == 0:
            B["drums"].add(t, CRASH, 0.75 if k else 1.3)
    for k in range(4, len(ach), 4):
        tt = ach[k][0]
        for i, t in enumerate(grid(tt - beat, tt, s16)):
            B["drums"].add(t, TOMS[i % 4], 0.5 + 0.1 * i)
    # lead: theme at the drop, rest under the names, coda for "Thank you"
    notes = []
    for i in range(min(4, len(ach))):
        t = ach[i][0]
        for (b, m, ln) in THEME[i]:
            notes.append((t + b * beat, ln * beat * 0.95, m, 1.0 if b == 0 else 0.9))
    if len(ach) > 4:
        for (b, m, ln) in THEME_END:
            notes.append((ach[4][0] + b * beat, ln * beat * 0.9, m, 0.9))
    t_l, sig = ins.lead_line(notes, rng_for("a3lead"), glide=0.045, vib_cents=18.0, vib_rate=5.2,
                             cutoff=3600, detune=9, sub=0.18, fenv=0.8)
    B["lead"].add(t_l, sig, 1.0)
    t_l, sig = ins.lead_line([(a, b, m - 12, v) for (a, b, m, v) in notes], rng_for("a3lead8"), glide=0.045,
                             vib_cents=12.0, cutoff=2400, detune=6, sub=0.0)
    B["lead"].add(t_l, sig, 0.35)
    cd = [c for c in ach if c[0] < outro0][-1]
    cn = [(cd[0] + b * beat, ln * beat * 0.95, m, 0.95) for (b, m, ln) in CODA]
    cn.append((outro0, 2 * beat, 74, 0.85))
    t_l, sig = ins.lead_line(cn, rng_for("a3coda"), glide=0.05, vib_cents=18.0, cutoff=3400, detune=9, sub=0.15)
    B["lead"].add(t_l, sig, 0.9)

    # ------------------------------------------------- outro: no drums, pads + piano
    och = [(outro0, loop[2], bar), (outro0 + bar, loop[3], bar / 2), (outro0 + 1.5 * bar, loop[1], bar / 2)]
    och = [c for c in och if c[0] < fin - 1e-6]
    mx.chords += och
    for (t, ch, d) in och:
        c = ch3(ch)
        piano_bar(t, ch, d, vel=0.3, eighths=False)
        B["strings"].add(t, ins.strings(c["low"] + [c["pad"][1], c["pad"][3]], d + 0.1, rng_for("a3ostr", t),
                                        attack=0.15, release=0.8), 0.9)
        B["pad"].add(t, ins.supersaw(c["pad"], d + 0.05, rng_for("a3opad", t), voices=7, detune=12,
                                     attack=0.1, decay=1.0, sustain=0.8, release=0.5), 0.55)
    # final D major chord at `fin`, rolled, ringing out
    c = ch3(loop[0])
    roll = [c["bass"] - 12, c["bass"], c["low"][1], c["ten"][1], c["ten"][2], c["pad"][2], c["pad"][3], 78]
    ring = end - fin + 0.5
    for i, m in enumerate(roll):
        B["piano"].add(fin + 0.035 * i, ins.felt_piano(m, ring, 0.42 if i else 0.5, rng_for("fin", m), damper=0.5), 1.0)
    B["strings"].add(fin, ins.strings(c["low"] + c["ten"] + [c["pad"][3]], ring - 1.0, rng_for("a3fin"),
                                      attack=0.4, release=1.5, lp=2500), 0.8)
    B["pad"].add(fin, ins.supersaw(c["pad"], ring - 1.2, rng_for("a3fpad"), voices=7, detune=11, attack=0.3,
                                   decay=1.5, sustain=0.7, release=1.0), 0.45)
    B["bells"].add(fin, ins.glock(86, 0.7, rng_for("fing")), 1.0)
    B["bells"].add(fin + 0.12, ins.glock(93, 0.5, rng_for("fing2")), 1.0)
    B["drums"].add(fin, ins.crash(rng_for("a3fcr"), length=3.0, decay=1.4, hp=4000), 0.25)

    mx.kicks = kicks
    mix = mx.render()
    # final fade (cue outro.fade) to exact silence at the end
    n0 = mx.n0
    a, b = s2n(fade0) - n0, s2n(fade1) - n0
    g = np.ones(mix.shape[1])
    g[a:b] = rc_ramp(b - a, up=False) ** 1.5
    g[b:] = 0.0
    mix *= g
    return mx, mix
