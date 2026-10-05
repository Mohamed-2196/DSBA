"""score.py - the composition. Every time comes from cues.json (scenes, tempo maps, card and
network cues); only musical subdivisions (beats, 16ths) are derived from the cue tempo.

  act1(...)     product-launch electro-pop in the key of cues.tempo.act1 (Am-F-C-G): the
                opening build under the notification pile-up (the film starts on it) + hard
                stop, drop, feature grooves, montage, launch build, and the drop that never
                comes (it is only heard through the G1 crash)
  birthday(...) "Happy Birthday" as a small jazz waltz (felt piano, upright bass, brushes,
                string bed, celesta), cut on the final "you" and sabotaged by G2
  act3(...)     felt piano under the letter -> anthem drop (title) -> playful "numbers" bed
                with an accent on every card punch -> the network lift and its climax chord
                -> piano-and-pad finale, final chord ringing out
"""
from __future__ import annotations

import numpy as np

import instruments as ins
from dsp import (SR, s2n, tarr, mtof, rng_for, make_ir, butter, fade_edges, rc_ramp,
                 smoothstep, TWO_PI, cents)
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


FREEZE_TAPE = 0.25      # s: at the freeze the music (and the launch-film SFX bed) tape-stops this fast
PAD_ALONE = 1.25        # pad level while it is the only musical bed (a scene before the pile-up)
PAD_OPENING = 0.8       # pad level in the bar that opens the film (then 0.9 once the pulse is in)

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
    film0 = T.get("first_beat", 0.0)            # the bar grid starts here, and so does the film
    chaos0, _ = scene(cues, "s02_chaos")
    freeze = cues["chaos"]["freeze"]
    imp0, imp1 = cues["chaos"]["implode"]
    logo = scene(cues, "s03_logo")
    news = scene(cues, "s04_newsletter")
    forum = scene(cues, "s05_forum")
    noora = next(((x["start"], x["end"]) for x in cues["scenes"] if x["id"] == "s05b_noora"), None)   # optional scene
    mont = scene(cues, "s06_everything")
    launch = scene(cues, "s07_launch")
    g1 = cues["g1"]
    cuts = [c["t"] for c in cues["montage"]["cuts"]]
    countdown = cues["launch"]["countdown"]

    mx = Mixer("act1", min(0.0, film0), g1["end"], act1_reverbs())
    mx.chords = []

    # The build towards the freeze. When the notification pile-up opens the film (no scene
    # before it), the first bar belongs to the drone (SFX), the pad swelling in and the first
    # pings alone; the pulse (the kick behind a wall, the arp, the ticking hats) enters on
    # the second bar and everything opens up to the freeze. With a scene before the pile-up
    # the pulse starts with it, over a pad that is already there.
    opens_film = chaos0 - film0 < bar - 1e-6
    pulse0 = chaos0 + bar if (opens_film and freeze - chaos0 >= 3 * bar - 1e-6) else chaos0
    pad_lp0 = 700.0 if opens_film else 2200.0   # the opening starts darker and opens further

    def pad_lp(t):
        fc = np.full_like(t, 6500.0)
        if chaos0 > film0:
            m = t < chaos0
            fc[m] = 260.0 * (2200.0 / 260.0) ** np.clip((t[m] - film0) / (chaos0 - film0), 0, 1) ** 1.2
        m = (t >= chaos0) & (t < drop)
        u = np.clip((t[m] - chaos0) / (freeze - chaos0), 0, 1)
        fc[m] = pad_lp0 * (7500.0 / pad_lp0) ** (u ** 0.7 if opens_film else u)
        m = t >= launch[0]
        u = np.clip((t[m] - launch[0]) / (a1_end - launch[0]), 0, 1)
        fc[m] = 3000.0 * (11000.0 / 3000.0) ** u
        return fc

    def prekick_lp(t):      # the kick "behind a wall" opens up from its entry to the freeze
        return 130.0 * (650.0 / 130.0) ** np.clip((t - pulse0) / (freeze - pulse0), 0, 1)

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
    B["prekick"] = mx.bus("prekick", gain_db=-9.5, auto_lp=prekick_lp, sends={"room": 0.08})
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

    # ----------------------------------------------------------- film start .. freeze
    intro = section_chords(film0, freeze + bar, bar, loop, turnaround=False)   # + the stopped bar
    mx.chords += [c for c in intro if c[0] < freeze]
    for (t, ch, d) in intro:
        # the very first chord of the film swells in (no abrupt start); the others are legato
        att = 1.6 if abs(t - film0) < 1e-6 else 0.06
        sig = ins.supersaw(ch1(ch)["pad"], d + 0.05, rng_for("a1pad", t), voices=7, detune=17,
                           attack=att, decay=1.0, sustain=1.0, release=0.9, drift=3.0)
        # Before the pile-up the pad is the only bed and sits a little higher. In the bar
        # that opens the film it sits lower instead: the build starts from little.
        alone = PAD_OPENING if opens_film else PAD_ALONE
        B["pad"].add(t, sig, alone if t < pulse0 - 1e-6 else 0.9)
    # The launch track's own kick, heard as if through a wall, opening up until the freeze.
    k0 = 0.30 if opens_film else 0.42           # it enters softer when it is the film's first pulse
    for t in grid(pulse0, freeze, beat):
        u = (t - pulse0) / (freeze - pulse0)
        B["prekick"].add(t, KICK, k0 + (0.92 - k0) * u)
    # quiet ticking 16th hats, fading in: with the pulse (up to the last bar before the
    # freeze) when the pile-up opens the film, otherwise through the scene before it
    h0, h1 = (pulse0, max(pulse0, freeze - bar)) if opens_film else (film0 + beat, chaos0)
    for i, t in enumerate(grid(h0, freeze, s16)):
        u = 1.0 if h1 <= h0 else min(1.0, (t - h0) / (h1 - h0))
        acc = (0.55, 0.22, 0.75, 0.3)[i % 4]
        lvl = (0.12 + 0.88 * u ** 1.5) if opens_film else (0.25 + 0.75 * u)
        B["hats"].add(t, TICK[i % 4], 0.5 * acc * lvl, pan=0.12 * ((i % 2) * 2 - 1))
    # tension: plucky 16th arp with a rising filter (from the pulse on), sub notes
    ARP_PAT = [0, 3, 2, 3, 1, 3, 2, 3, 0, 3, 2, 3, 1, 3, 2, 3]
    v0 = 0.42 if opens_film else 0.6            # the arp comes in quieter when it opens the film
    for (t, ch, d) in intro:
        if t < chaos0 - 1e-6:
            continue
        tones = ch1(ch)["arp"]
        for k in range(int(round(d / s16))):
            tt = t + k * s16
            if tt < pulse0 - 1e-6:
                continue
            u = (tt - pulse0) / (freeze - pulse0)
            bright = round(min(1.0, 0.15 + 0.85 * u ** 1.3) * 20) / 20.0
            vel = (0.95 if k % 4 == 0 else 0.7) * (v0 + (1.0 - v0) * u)
            B["arp"].add(tt, ins.pluck(tones[ARP_PAT[k % 16]], round(vel, 2), dur=0.1, bright=bright),
                         1.0, pan=0.18 * np.sin(k * 0.9))
        if t < freeze:
            # the very first note of the film swells in instead of being struck
            first = opens_film and abs(t - film0) < 1e-6
            B["bass"].add(t, ins.bass_note(ch1(ch)["bass"] + 12, d - 0.05, 0.35, cutoff=300, drive=1.0,
                                           mid=0.25, attack=0.7 if first else 0.05), 1.0)
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

    # logo reveal: full groove, crash, a sparkle (one note per pill) when the pills arrive
    groove(logo[0], logo[1], "logo")
    B["drums"].add(logo[0], CRASH, 0.85)
    pills = cues["logo"]["pills"]
    sparkle = (79, 84, 88, 91, 96, 100)[:max(1, len(cues["logo"].get("pills_text", [0] * 4)))]
    for i, m in enumerate(sparkle):
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
    # Mini Noora (when the cut has her): groove A again, lighter and playful, with a glock sparkle
    # when the chat opens, when she answers and when the chapter chips arrive
    if noora:
        groove(noora[0], noora[1], "grooveA")
        B["drums"].add(noora[0], CRASH, 0.55)
        snare_fill(noora[1], 4, toms=True)
        N = cues.get("noora", {})
        for key, notes in (("chat_open", (84, 88, 91)), ("answer", (88, 91, 96)), ("cheer", (91, 96, 100, 103))):
            if key in N:
                for i, m in enumerate(notes):
                    B["bells"].add(N[key] + i * s16, ins.glock(m, 0.8), 0.9)
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

    # ------------------------------------------- the drop that never comes (act1.end ->)
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
    tape_stop(sub, n0 + seg_a, freeze, freeze + FREEZE_TAPE, power=1.3, amp_pow=0.4, kill_after=True)
    F = s2n(0.012)
    k = s2n(freeze + FREEZE_TAPE) - (n0 + seg_a)
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
# "Happy Birthday" as a small jazz waltz in C: felt piano (melody, harmonised in sixths on
# the 2nd and 4th phrases), upright bass on beat 1 walking into the chord changes, soft
# left-hand chords on beats 2 and 3, brushes, a quiet string bed, celesta at the phrase ends.
# One row per 3/4 bar (beats counted 0, 1, 2 inside the bar):
#   name  chord for the harmony check        bass  [(beat, midi)]: beat 1 + walking notes
#   lh    rootless left-hand voicings for beats 2 and 3      pad  string-bed voicing
#   cel   celesta figure [(beat, midi)]      flat  {beat: {pc: pc}} borrowed tones from that beat on
#   pad3  string-bed voicing for the third beat when the harmony moves inside the bar
BD_BARS = [
    dict(name="C6", bass=[(0, 36), (2, 45)], lh=[[52, 55, 57, 62], [52, 57, 62]], pad=[48, 55, 64]),              # C6/9
    dict(name="G7", bass=[(0, 43), (2, 41)], lh=[[53, 57, 59, 64], [53, 59, 64]], pad=[55, 62, 65],              # G13
         cel=[(1.0, 79), (4 / 3, 83), (5 / 3, 86)]),
    dict(name="G7", bass=[(0, 38), (2, 43)], lh=[[53, 57, 59, 62], [53, 59, 62]], pad=[50, 57, 65]),              # Dm7 G9 G7
    dict(name="C6", bass=[(0, 36), (2, 43)], lh=[[52, 55, 57, 62], [52, 57, 62]], pad=[48, 55, 64],              # C6/9
         cel=[(1.0, 84), (4 / 3, 88), (5 / 3, 91)]),
    dict(name="C", bass=[(0, 36), (1, 38), (2, 40)], lh=[[52, 55, 59, 62], [52, 58, 62]], pad=[48, 55, 64, 67]),  # Cmaj9 C9
    dict(name="F", bass=[(0, 41), (2, 44)], lh=[[57, 60, 64], [56, 60, 62]], pad=[53, 60, 65],                   # Fmaj7 Fm6
         cel=[(1.0, 81), (4 / 3, 84), (5 / 3, 88)], flat={2: {9: 8}}),
    dict(name="C", bass=[(0, 43), (1, 45), (2, 47)], lh=[[52, 55, 57, 60], [53, 59, 62]], pad=[55, 60, 64],      # C6/G G7
         pad3=[55, 59, 62]),
]
# the last bar (the "you" that gets sabotaged): everything lands together on the downbeat
BD_FINAL = dict(name="C6", bass=48, low=[36, 43], lh=[52, 57, 62], rh=[64, 67], pad=[48, 55, 64, 67],
                cel=[84, 88, 91, 96])
BD_SCALE = {0, 2, 4, 5, 7, 9, 11}        # C major
PC_NAME = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]


def bd_shift(cues):
    """Semitones from the chart's key (C) to cues.tempo.birthday.key, folded to -5..+6."""
    key = str(cues["tempo"]["birthday"].get("key", "C major")).split()[0]
    r = NOTE.get(key, 0)
    return r if r <= 6 else r - 12


def bd_transposed(row, sh):
    """One chart row (or BD_FINAL) moved by sh semitones; chord names follow."""
    if not sh:
        return row

    def mv(v):
        if isinstance(v, (list, tuple)):
            return type(v)(mv(x) for x in v)
        return v + sh if isinstance(v, int) else v

    out = dict(row)
    for k in ("lh", "pad", "pad3", "low", "rh"):
        if k in out:
            out[k] = mv(out[k])
    for k in ("bass", "cel"):
        if k in out:
            v = out[k]
            if isinstance(v, int):
                out[k] = v + sh
            elif v and isinstance(v[0], tuple):
                out[k] = [(b, m + sh) for (b, m) in v]
            else:
                out[k] = [m + sh for m in v]
    if "flat" in out:
        out["flat"] = {b: {(a + sh) % 12: (c + sh) % 12 for a, c in mp.items()} for b, mp in out["flat"].items()}
    root = out["name"][0] + (out["name"][1] if len(out["name"]) > 1 and out["name"][1] in "#b" else "")
    out["name"] = PC_NAME[(NOTE[root] + sh) % 12] + out["name"][len(root):]
    return out


def bd_sixth_below(midi, flat=None, sh=0):
    """Diatonic sixth below a melody note (major if it is in the scale of the moment)."""
    scale = {(p + sh) % 12 for p in BD_SCALE}
    for a, b in (flat or {}).items():
        scale.discard(a)
        scale.add(b)
    return midi - 9 if (midi - 9) % 12 in scale else midi - 8


class PianoPart:
    """Collects piano notes, then renders them like one instrument: a key that is struck
    again stops its previous vibration (no random-phase cancellation between repeated
    notes), and a key asked for twice at the same moment sounds once (the louder)."""

    def __init__(self, voice):
        self.voice = voice
        self.notes = []

    def add(self, bus, t, midi, dur, vel, key, pan=0.0, **kw):
        self.notes.append(dict(bus=bus, t=t, m=int(midi), dur=dur, vel=vel, key=key, pan=pan, kw=kw))

    def render(self):
        notes = sorted(self.notes, key=lambda q: q["t"])
        keep = []
        for q in notes:
            twin = [r for r in keep if r["m"] == q["m"] and abs(r["t"] - q["t"]) < 0.04]
            if twin:
                if q["vel"] > twin[0]["vel"]:
                    twin[0].update(vel=q["vel"], dur=max(q["dur"], twin[0]["dur"]))
                continue
            keep.append(q)
        for i, q in enumerate(keep):
            sig = self.voice(q["m"], q["dur"], q["vel"], q["key"], **q["kw"])
            nxt = next((r for r in keep[i + 1:] if r["m"] == q["m"]), None)
            if nxt is not None:
                k = s2n(nxt["t"] - q["t"])
                if k < len(sig):
                    F = min(k, s2n(0.008))
                    sig[k - F:k] *= rc_ramp(F, up=False)
                    sig[k:] = 0.0
            q["bus"].add(q["t"], sig, 1.0, pan=q["pan"])
        return keep


def birthday(cues):
    tb = cues["tempo"]["birthday"]
    # exact beat from the tempo: cues.beat_seconds is rounded (0.1 ms), which would put the
    # last downbeat 1 ms after the cut it has to land on
    beat = 60.0 / tb["bpm"] if tb.get("bpm") else tb["beat_seconds"]
    pickup = tb["pickup"]
    cut = tb["cut"]
    phrases = tb["phrases"]
    mel = cues["birthday"]["melody"]
    # Nothing of the song may sound before the lights come on: the mixer itself starts there.
    t_start = min(cues["birthday"]["lights_on"], pickup)
    # With a hold (cues.birthday.hold) nothing cuts the song: its last chord is held for FINAL
    # seconds and let go, and the room is quiet until glitch #2. Without one the glitch takes
    # the last "you" (note_warp), so the chord only has to last until the tape stop.
    hold = cues["birthday"].get("hold")
    rings = bool(hold) and hold["end"] - cut > 4.0
    FINAL = 3.6
    end = cut + FINAL + 3.0 if rings else cues["g2"]["note_warp"]["t1"] + 0.6
    rv = {
        "plate": dict(kind="ir", ir=make_ir(1.3, 1.9, rng_for("ir", "plate_bd"), predelay=0.014, er_level=0.25,
                                            hf=0.5), ret_db=-7),
        "room": dict(kind="ir", ir=make_ir(0.5, 0.8, rng_for("ir", "room_bd"), predelay=0.005), ret_db=-7),
    }
    mx = Mixer("bday", t_start, end, rv, keep=("melody",))
    warm = [("peak", 320.0, 0.8, 1.5), ("highshelf", 2200.0, 0.7, -4.0)]     # felt: soft top, a little body
    melody = mx.bus("melody", gain_db=-6.5, hp=80, eq=warm, sends={"plate": 0.16, "room": 0.14})
    comp = mx.bus("comp", gain_db=-10.6, hp=80, eq=warm, sends={"plate": 0.14, "room": 0.14}, width=1.1)
    bass = mx.bus("bass", gain_db=-8.5, lp=2600, sends={"room": 0.07})
    brush = mx.bus("brushes", gain_db=-18.5, hp=350, sends={"room": 0.22, "plate": 0.05}, width=1.2)
    pad = mx.bus("strings", gain_db=-22.5, hp=160, lp=3200, sends={"plate": 0.30}, width=1.4)
    cel = mx.bus("celesta", gain_db=-20.0, hp=500, sends={"plate": 0.34}, width=1.3)

    def hv(key, lo=0.94, hi=1.06):          # humanised velocity factor
        return float(rng_for("bdvel", key).uniform(lo, hi))

    def voice(m, dur, vel, key, damper=0.12, bright=0.82):
        # felt / upright colour: three slightly detuned strings, a soft hammer, few upper partials
        return ins.felt_piano(m, dur, vel, rng_for("bdp", key, m), damper=damper, strings=3, bright=bright,
                              detune=1.5, hammer=0.035)

    def ppan(m):
        return float(np.clip((m - 66) / 60.0, -0.22, 0.22))

    pn = PianoPart(voice)

    # bars: the first downbeat is one beat after the pickup; the last one is the cut
    first = pickup + beat
    nbar = int(round((cut - first) / (3 * beat))) + 1
    downs = [first + 3 * beat * k for k in range(nbar)]
    sh = bd_shift(cues)                  # the chart is written in C; follow the cue sheet's key
    bars = [bd_transposed(BD_BARS[k % len(BD_BARS)], sh) for k in range(nbar - 1)]
    mx.chords = [(d, b["name"], 3 * beat) for d, b in zip(downs, bars)]

    def where(t):
        """-> (bar index, -1 for the pickup; beat inside the bar)."""
        b = (t - first) / beat
        k = int(np.floor(b / 3 + 1e-6))
        return k, b - 3 * k

    def phrase_of(t):
        ok = [i for i, p in enumerate(phrases) if t >= p - 1e-3]
        return ok[-1] if ok else 0

    # ---------------------------------------------------------------- melody
    base = (0.60, 0.64, 0.72, 0.70)
    for i, nt in enumerate(mel):
        t, m = nt["t"], nt["midi"]
        last = i == len(mel) - 1
        ph = phrase_of(t)
        k, bb = where(t)
        vel = base[min(ph, 3)] + 0.011 * (m - 67)
        if nt["dur"] < beat * 0.5:
            vel *= 0.84                                  # the short "py"
        elif k >= 0 and abs(bb) < 1e-3:
            vel *= 1.05                                  # downbeats lean in a little
        vel = float(np.clip((0.80 if last else vel) * hv(("mel", i), 0.96, 1.04), 0.3, 0.9))
        ring = ((FINAL if rings else end - t) if last else nt["dur"] + 0.05)   # legato: a hair of overlap
        pn.add(melody, t, m, ring, vel, ("mel", i), pan=ppan(m), damper=0.3 if last else 0.12)
        # the 2nd and 4th phrases are harmonised in sixths below
        if ph in (1, 3) and not last:
            flat = {}
            if 0 <= k < len(bars):
                for b0, mp in bars[k].get("flat", {}).items():
                    if bb >= b0 - 1e-3:
                        flat.update(mp)
            h = bd_sixth_below(m, flat, sh)
            pn.add(comp, t + 0.004, h, ring, vel * 0.62, ("har", i), pan=ppan(h), bright=0.7)

    # ------------------------------------------- bass, left hand, brushes, strings, celesta
    SWISH = [ins.brush_swish(rng_for("bdsw", j), dur=beat * 0.95, peak=0.38) for j in range(3)]
    TAP = [ins.brush_tap(rng_for("bdtap", j)) for j in range(4)]
    # the pickup: just the piano and one brush sweep that sets the lilt
    brush.add(pickup, ins.brush_swish(rng_for("bdsw", "pickup"), dur=beat * 0.9, peak=0.7), 0.55, pan=0.15)
    for k, (d, row) in enumerate(zip(downs, bars)):
        nb = row["bass"]
        for j, (b, m) in enumerate(nb):
            nxt_b = nb[j + 1][0] if j + 1 < len(nb) else 3.0
            dur = min((nxt_b - b) * beat * 0.98, beat * (2.4 if j == 0 else 0.95))
            v = (0.92 if b == 0 else 0.72) * hv(("bass", k, j))
            bass.add(d + b * beat + 0.003, ins.upright_bass(m, dur, v, rng_for("bdb", k, j)), 1.0)
        for b, voic in zip((1, 2), row["lh"]):
            v = (0.34 if b == 1 else 0.27) * hv(("lh", k, b))
            late = float(rng_for("bdlh", k, b).uniform(0.0, 0.006))
            for q, m in enumerate(voic):                 # gently rolled, bottom to top
                pn.add(comp, d + b * beat + late + 0.007 * q, m, beat * (0.92 if b == 1 else 0.7),
                       v * (1.08 if q == 0 else 1.0), ("lh", k, b), pan=ppan(m) - 0.08, bright=0.7)
        brush.add(d, SWISH[k % 3], 0.8 * hv(("sw", k)), pan=0.15)
        brush.add(d + beat, TAP[k % 4], 0.55 * hv(("t1", k)), pan=0.2)
        brush.add(d + 2 * beat, TAP[(k + 1) % 4], 0.42 * hv(("t2", k)), pan=0.1)
        if k % 2 == 1:                                   # swung ghost note: the "a" of beat 2
            brush.add(d + (1 + 2 / 3) * beat, TAP[(k + 2) % 4], 0.2, pan=0.25)
        plen = (2 if "pad3" in row else 3) * beat
        pad.add(d, ins.strings(row["pad"], plen - 0.1, rng_for("bdpad", k), attack=0.5 if k == 0 else 0.3,
                               release=0.7 if plen > 2.5 * beat else 0.35, voices=3, detune=6.0, lp=2000.0,
                               vib_cents=6.0), 1.0)
        if "pad3" in row:
            pad.add(d + plen, ins.strings(row["pad3"], beat - 0.1, rng_for("bdpad3", k), attack=0.2, release=0.5,
                                          voices=3, detune=6.0, lp=2000.0, vib_cents=6.0), 1.0)
        for j, (b, m) in enumerate(row.get("cel", [])):
            cel.add(d + b * beat, ins.celesta(m, (0.55, 0.5, 0.62)[j % 3], rng_for("bdcel", k, j)), 1.0,
                    pan=(-0.25, 0.0, 0.25)[j % 3])
    # the final downbeat: bass, low fifth + rolled 6/9 chord, the sixth under the melody,
    # strings and a celesta roll - all on the cut, so that is what stutters and tape-stops
    # (or, with a hold, what rings out as the song's ending)
    d = downs[-1]
    fin = bd_transposed(BD_FINAL, sh)
    ring = FINAL if rings else end - d
    bass.add(d + 0.003, ins.upright_bass(fin["bass"], ring, 0.95, rng_for("bdb", "fin"), tau=1.4), 1.0)
    for q, m in enumerate(fin["low"] + fin["lh"]):
        pn.add(comp, d + 0.006 * q, m, ring, 0.5 if q < len(fin["low"]) else 0.42, ("fin", q),
               pan=ppan(m) - 0.08, damper=0.3, bright=0.7)
    for q, m in enumerate(fin["rh"]):
        pn.add(comp, d + 0.004, m, ring, 0.5, ("finr", q), pan=ppan(m), damper=0.3, bright=0.7)
    brush.add(d, ins.brush_swish(rng_for("bdsw", "fin"), dur=beat * 1.6, peak=0.25), 0.8, pan=0.15)
    pad.add(d, ins.strings(fin["pad"], ring, rng_for("bdpad", "fin"), attack=0.12, release=1.6 if rings else 0.5, voices=3,
                           detune=6.0, lp=2200.0, vib_cents=6.0), 1.25)
    for q, m in enumerate(fin["cel"]):
        cel.add(d + 0.028 * q, ins.celesta(m, 0.7, rng_for("bdcel", "fin", q)), 1.0,
                pan=(-0.3, -0.1, 0.1, 0.3)[q % 4])
    mx.piano_notes = pn.render()
    mix = mx.render()
    return mx, mix


def birthday_glitch(mix, n0, cues):
    if cues["birthday"].get("hold"):         # the song has ended long before glitch #2: nothing to sabotage
        return mix
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

# anthem theme, (beat, midi, beats), one bar per chord of the loop. Stated softly by the piano
# under the letter, big at the drop, hinted by the plucks over the "numbers" cards, lifted by
# the strings in the network scene and played once more, simply, in the finale.
THEME = [
    [(0, 69, 1), (1, 74, 1), (2, 78, 2)],          # D : A4 D5 F#5
    [(0, 76, 3), (3, 73, 1)],                      # A : E5 . . C#5
    [(0, 74, 1), (1, 78, 1), (2, 83, 2)],          # Bm: D5 F#5 B5
    [(0, 81, 2), (2, 79, 1), (3, 78, 1)],          # G : A5 . G5 F#5
]
CODA = [(0, 81, 2), (2, 78, 1), (3, 76, 1)]         # A5 . F#5 E5  -> resolves into the finale


def ch3(name):
    if name in CH3:
        return CH3[name]
    v = generic_voicing(name, 60)
    r, _ = chord_pcs(name)
    return dict(bass=36 + (r - 0) % 12 - 12 * ((r % 12) > 7), pad=v, low=[v[0] - 12, v[1] - 12],
                ten=[m - 12 for m in v[:3]], gl=[m + 24 for m in v])


def reveal_chord_at(cues, t):
    """Chord of the reveal loop sounding at time t (bars are counted from the drop)."""
    R = cues["tempo"]["reveal"]
    loop = R["chords"]
    return loop[int(np.floor((t - R["drop"]) / R["bar_seconds"] + 1e-6)) % len(loop)]


def reveal_punch_chord(cues, t):
    """Chord a card punch at time t is voiced on: a punch that lands up to a quarter of a
    second before a bar line is played as a pushed (anticipated) downbeat of that bar."""
    return reveal_chord_at(cues, t + 0.26)


def act3(cues):
    R = cues["tempo"]["reveal"]
    beat = 60.0 / R["bpm"]
    bar = R["bar_seconds"]
    s16, s8 = beat / 4, beat / 2
    loop = R["chords"]
    p0, drop, climax, fin, end = R["piano_start"], R["drop"], R["climax"], R["final_chord"], R["end"]
    sec = R["sections"]
    title0, title1 = sec["title"]
    num0, num1 = sec["numbers"]
    net0 = sec["network"][0]
    fin0 = sec["finale"][0]
    cards = cues["numbers"]["cards"]
    gather = cues["network"]["gather"]
    start = cues["g2"]["silence"]["t1"]
    key_root = chord_pcs(loop[0])[0]
    scale = sorted(m for m in range(36, 109) if (m - key_root) % 12 in (0, 2, 4, 5, 7, 9, 11))

    def step(m, k):                      # k diatonic steps from midi m in the key
        return scale[int(np.argmin([abs(x - m) for x in scale])) + k]

    def ci(t):                           # index into the 4-bar loop / THEME at time t
        return int(np.floor((t - drop) / bar + 1e-6)) % len(loop)

    def bars(t0, t1):
        nb = int(np.floor((t1 - t0) / bar + 1e-6))
        return [(t0 + k * bar, loop[ci(t0 + k * bar)], bar) for k in range(nb)]

    rv = {
        "hall": dict(kind="ir", ir=make_ir(2.8, 3.6, rng_for("ir", "hall3"), predelay=0.025, hf=0.4, lf=1.2),
                     ret_db=-3, duck=0.35),
        "room": dict(kind="ir", ir=make_ir(0.6, 0.9, rng_for("ir", "room3"), predelay=0.006), ret_db=-7),
        "delay": dict(kind="delay", time=0.375, fb=0.35, n=6, ret_db=-8, duck=0.5),
    }
    mx = Mixer("act3", start, end, rv)
    mx.chords = []
    B = {}
    B["piano"] = mx.bus("piano", gain_db=-8.0, hp=45, sends={"hall": 0.32, "room": 0.10}, width=1.2)
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
    # the light "numbers" bed: dry-ish piano stabs, plucks, pizzicato bass, small percussion
    B["keys"] = mx.bus("keys", gain_db=-5.5, hp=110, sends={"room": 0.20, "hall": 0.07}, width=1.15)
    B["plucks"] = mx.bus("plucks", gain_db=-9.0, hp=220, sends={"delay": 0.16, "room": 0.10, "hall": 0.08},
                         width=1.2)
    B["pizz"] = mx.bus("pizz", gain_db=-7.0, lp=2600, sends={"room": 0.08})
    B["perc"] = mx.bus("perc", gain_db=-9.0, hp=250, sends={"room": 0.20}, width=1.25)
    # low strings / horns register for the climax chord (the strings bus is high-passed at 200 Hz)
    B["warm"] = mx.bus("warm", gain_db=-13.0, hp=70, lp=2200, sends={"hall": 0.30}, width=1.25)

    KICK = ins.kick(rng_for("a3", "kick"), f_start=150, f_end=46, decay=0.32, length=0.6, drive=1.5)
    KSOFT = butter(ins.kick(rng_for("a3", "ksoft"), f_start=120, f_end=50, decay=0.2, length=0.45, click=0.08,
                            drive=1.1), "lowpass", 1800.0, 2)
    CLAP = ins.clap(rng_for("a3", "clap"), decay=0.09)
    SNARE = ins.snare(rng_for("a3", "snare"), tone_f=185.0, noise_decay=0.16)
    OH = ins.hat(rng_for("a3", "oh"), open_=True, decay=0.2)
    CH = [ins.hat(rng_for("a3", "ch", i), decay=0.03) for i in range(4)]
    TICK = [ins.hat(rng_for("a3", "tick", i), decay=0.016, bright=1.1) for i in range(4)]
    SHK = [ins.shaker(rng_for("a3", "shk", i)) for i in range(4)]
    RIM = [ins.rim(rng_for("a3", "rim", i), f=1720.0 * (1.0 + 0.01 * i)) for i in range(2)]
    CRASH = ins.crash(rng_for("a3", "crash"), length=3.5, decay=1.3)
    TOMS = [ins.tom(rng_for("a3", "tom", i), f=f, decay=0.22) for i, f in enumerate((180.0, 135.0, 98.0, 75.0))]
    kicks = []

    def piano_bar(t, ch, d, vel=0.3, melody=None, mvel=0.5, eighths=True):
        c = ch3(ch)
        B["piano"].add(t, ins.felt_piano(c["bass"], d + 0.1, vel * 1.25, rng_for("p3b", t)), 1.0)
        B["piano"].add(t, ins.felt_piano(c["bass"] + 12, d + 0.1, vel * 0.9, rng_for("p3b8", t)), 0.7)
        ten = c["ten"]
        pat = [0, 1, 2, 1, 0, 1, 2, 1] if eighths else [0, 1, 2, 1]
        stp = beat / 2 if eighths else beat
        for i, idx in enumerate(pat):
            tt = t + i * stp
            if tt >= t + d - 1e-6:
                break
            B["piano"].add(tt, ins.felt_piano(ten[idx], d - i * stp + 0.05, vel * (0.85 if i % 2 else 1.0),
                                              rng_for("p3t", round(tt, 4))), 1.0)
        for (b, m, ln) in (melody or []):
            B["piano"].add(t + b * beat, ins.felt_piano(m, ln * beat * 0.98, mvel, rng_for("p3m", t, b)), 1.0)

    # ================================================= the letter: soft solo piano
    pch = bars(p0, drop)
    mx.chords += pch
    for i, (t, ch, d) in enumerate(pch):
        piano_bar(t, ch, d, vel=0.26 + 0.03 * i, melody=THEME[ci(t)], mvel=0.42 + 0.03 * i)
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
    # the drop itself: a tutti tonic stab (two octaves) on the downbeat, no sidechain
    c0 = ch3(loop[0])
    B["hits"].add(drop, ins.supersaw(c0["pad"] + [m + 12 for m in c0["pad"]] + c0["low"], 0.25, rng_for("a3drop"),
                                     voices=7, detune=14, attack=0.003, decay=0.35, sustain=0.3, release=0.5), 1.0)

    # ================================================= title: the full anthem
    ach = bars(title0, title1)
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
        for k in range(8):
            B["bells"].add(t + k * beat / 2, ins.glock(c["gl"][(0, 2, 1, 3, 2, 1, 3, 2)[k]] - 12,
                                                       0.7, rng_for("a3gl", t, k), tau_scale=0.6),
                           1.0 if k % 2 == 0 else 0.75)
        if i % 4 == 0:
            B["drums"].add(t, CRASH, 0.75 if i else 1.3)
    # lead: the theme, big
    notes = []
    for (t, ch, d) in ach:
        for (b, m, ln) in THEME[ci(t)]:
            notes.append((t + b * beat, ln * beat * 0.95, m, 1.0 if b == 0 else 0.9))
    t_l, sig = ins.lead_line(notes, rng_for("a3lead"), glide=0.045, vib_cents=18.0, vib_rate=5.2,
                             cutoff=3600, detune=9, sub=0.18, fenv=0.8)
    B["lead"].add(t_l, sig, 1.0)
    t_l, sig = ins.lead_line([(a, b, m - 12, v) for (a, b, m, v) in notes], rng_for("a3lead8"), glide=0.045,
                             vib_cents=12.0, cutoff=2400, detune=6, sub=0.0)
    B["lead"].add(t_l, sig, 0.35)
    # the band lands on the first downbeat of the numbers scene and drops out
    cL = ch3(loop[ci(title1)])
    B["kick"].add(title1, KICK, 0.9)
    kicks.append(title1)
    B["bass"].add(title1, ins.bass_note(cL["bass"], beat * 0.8, 0.85, cutoff=600), 1.0)

    # ================================================= numbers: light, playful, rhythmic bed
    # Per card: groove -> thin out while the chart builds (room for the SFX) -> an accent
    # exactly on the punch -> room to laugh -> groove -> a tiny fill into the next card.
    nch = bars(num0, num1)
    mx.chords += nch
    ncard = max(len(cards), 1)

    def level(t):                        # 0 in the intro, then 1/n .. 1 across the cards
        k = sum(1 for c in cards if t >= c["t"] - 1e-6)
        return k / ncard

    def is_stamp(c):
        return any(e["kind"] == "stamp" and abs(e["t"] - c["punch_t"]) < 1e-3 for e in cues["sfx"])

    def shadow(c):                       # how long the bed stays out of the way after a punch
        return 2 * beat - 0.02 if is_stamp(c) else 0.3

    def in_build(t):
        return any(c["build"] - 1e-6 <= t < c["punch_t"] - 1e-6 for c in cards)

    def in_shadow(t):
        return any(c["punch_t"] - 0.02 <= t < c["punch_t"] + shadow(c) for c in cards)

    def bed(t):
        return not in_build(t) and not in_shadow(t)

    def trim(L):                         # the bed builds mostly by adding players, card by card
        return 10.0 ** (float(np.interp(L, (0.0, 0.25, 0.5, 0.75, 1.0), (2.5, 2.4, 4.0, 3.0, 3.0))) / 20.0)

    def keys(t, m, dur, vel, key, g=1.0):
        B["keys"].add(t, ins.felt_piano(m, dur, vel, rng_for("a3k", key, round(t, 4), m), damper=0.06, bright=1.1),
                      g, pan=float(np.clip((m - 60) / 70.0, -0.2, 0.2)))

    def pluck(t, m, vel, dur=0.14, bright=0.6, pan=0.0, g=1.0):
        B["plucks"].add(t, ins.pluck(m, round(vel, 2), dur=dur, bright=bright, decay=0.2), g, pan=pan)

    def run_into(T, prev_m, target_m, vel=0.6, n=3, g=1.0):
        """Tiny fill: n 16ths walking diatonically into target_m (from the side prev_m is on)."""
        sgn = -1 if prev_m > target_m else 1
        for q in range(n):
            pluck(T - (n - q) * s16, step(target_m, -sgn * (n - q)), vel * (0.8 + 0.1 * q), dur=0.09, bright=0.55, g=g)

    for (t, ch, d) in nch:
        c = ch3(ch)
        L = level(t)
        tr = trim(L)
        root = c["bass"] + 12
        fifth = root + 7 if root + 7 <= 52 else root - 5
        pz = c["bass"] + (12 if c["bass"] < 36 else 0)
        punched = any(abs(t - x["punch_t"]) <= 0.3 for x in cards)     # the accent played this downbeat
        for j in range(8):
            tt = t + j * s8
            if bed(tt):
                if j in (0, 4):                                        # left hand: root, fifth
                    keys(tt, root if j == 0 else fifth, 0.2, 0.36 + 0.06 * L, "lh", tr)
                if j % 2 == 1:                                         # off-beat stabs
                    v = (0.25 + 0.08 * L) * (1.0 if j in (3, 7) else 0.88)
                    for m in c["ten"]:
                        keys(tt, m, 0.1, v, "rh", tr)
                if L >= 0.5 and j in (2, 6):
                    B["perc"].add(tt, RIM[(j // 2) % 2], tr * (0.45 + 0.25 * L), pan=-0.2)
                if L >= 0.5 and j in (0, 4):
                    B["pizz"].add(tt, ins.upright_bass(pz, 0.3, 0.75 + 0.15 * L, rng_for("a3pz", round(tt, 4)), tau=0.5), tr)
                if L >= 0.75 and j == 7:                               # pizzicato pickup into the next bar
                    B["pizz"].add(tt, ins.upright_bass(pz + 7, 0.18, 0.6, rng_for("a3pz", round(tt, 4)), tau=0.4), tr)
                if L >= 0.75 and (j in (0, 4) or (L >= 1.0 and j in (2, 6))):
                    B["kick"].add(tt, KSOFT, 0.24 + 0.1 * L)
                if L >= 1.0 and j in (2, 6):
                    B["perc"].add(tt, CLAP, tr * 0.22, pan=0.1)
                if L >= 0.75 and j % 2 == 0 and not any(abs(tt - (t + b * beat)) < 1e-6 for (b, _, _) in THEME[ci(t)]):
                    pluck(tt, c["pad"][(0, 2, 1, 3)[(j // 2) % 4]] + 12, 0.32 + 0.1 * L, dur=0.08, bright=0.45,
                          pan=0.25 * (-1) ** (j // 2), g=tr)
            # the shaker keeps time through the builds (softer), and rests after a punch
            if L > 0 and not in_shadow(tt):
                g = tr * (0.5 if in_build(tt) else 1.0)
                B["perc"].add(tt, SHK[j % 4], g * (0.55 if j % 2 else 0.34) * (0.7 + 0.3 * L), pan=0.35)
                if L >= 0.75:
                    B["perc"].add(tt + s16, SHK[(j + 1) % 4], g * 0.2, pan=0.35)
                if L >= 1.0 and j % 2 == 1 and not in_build(tt):
                    B["hats"].add(tt, TICK[j % 4], 0.3, pan=-0.3)
        # the theme, hinted by the plucks (its long third note hands over to the chart SFX)
        for (b, m, ln) in THEME[ci(t)]:
            tt = t + b * beat
            hand_over = any(c_["build"] - 1e-6 <= tt <= c_["build"] + 0.26 for c_ in cards)
            if in_shadow(tt) or (in_build(tt) and not hand_over) or (b == 0 and punched):
                continue
            pluck(tt, m, 0.72 + 0.16 * L, dur=0.14 + (0.2 if ln >= 2 else 0.0), bright=0.55 + 0.15 * L, g=tr)
            if L >= 0.5:
                pluck(tt, m - 12, 0.4 + 0.1 * L, dur=0.12, bright=0.4, g=tr)
        # a tiny fill into every bar that starts a card (and into the network scene)
        nxt = t + d
        if any(abs(nxt - c_["t"]) < 1e-6 for c_ in cards):
            target = THEME[ci(nxt)][0][1]
            run_into(nxt, THEME[ci(t)][-1][1], target, vel=0.5 + 0.2 * L, g=tr)
            if L >= 0.25:
                B["perc"].add(nxt - 2 * s16, RIM[0], tr * (0.3 + 0.2 * L), pan=-0.2)
                B["perc"].add(nxt - s16, RIM[1], tr * (0.4 + 0.25 * L), pan=-0.2)

    # while a chart builds, the left hand holds one soft low note under the SFX figure
    for i, c_ in enumerate(cards):
        tb0 = num0 + np.ceil((c_["build"] - num0) / s8 - 1e-6) * s8          # next 8th of the grid
        if c_["punch_t"] - tb0 > 0.3:
            ch = reveal_chord_at(cues, tb0)
            L = (i + 1) / ncard
            for m, v in ((ch3(ch)["bass"] + 12, 0.34), (ch3(ch)["bass"] + 19, 0.26)):
                keys(tb0, m, c_["punch_t"] - tb0 - 0.06, v, "hold", trim(L))
    # an accent exactly on every punch (pushed downbeat when the punch sits just before a bar)
    for i, c_ in enumerate(cards):
        tp = c_["punch_t"]
        L = (i + 1) / ncard
        ch = reveal_punch_chord(cues, tp)
        c = ch3(ch)
        ag = 1.25 if is_stamp(c_) else 0.55 + 0.35 * L    # small accents (the ding is the star), growing
        if is_stamp(c_):
            # REJECTED: one dry, low thud of the band under the rubber stamp, then air
            for m, v in ((c["bass"], 0.62), (c["bass"] + 12, 0.55)):   # ...which rings on through the rest
                keys(tp, m, shadow(c_) - 0.1, v, "stamp", ag)
            B["kick"].add(tp, KSOFT, 0.6)
            B["drums"].add(tp, TOMS[3], 0.35)
            B["pizz"].add(tp, ins.upright_bass(c["bass"] + 12, 0.25, 0.9, rng_for("a3pz", "stamp"), tau=0.4), ag)
            continue
        top = THEME[loop.index(ch)][0][1] if ch in loop else c["pad"][3]
        acc = {c["bass"] + 12: 0.5, c["bass"] + 24: 0.42}
        for m in c["ten"] + [top]:
            acc[m] = max(acc.get(m, 0.0), 0.44 + 0.05 * L)
        for q, (m, v) in enumerate(sorted(acc.items())):
            keys(tp + 0.004 * q, m, 0.55, v, "acc", ag)
        for m in c["pad"] + [top]:
            pluck(tp, m, 0.7 + 0.15 * L, dur=0.25, bright=0.8, g=ag)
        B["kick"].add(tp, KSOFT, 0.4)
        B["perc"].add(tp, RIM[0], 0.6 * ag, pan=-0.2)
        B["perc"].add(tp, CLAP, (0.3 + 0.1 * L) * ag)
        B["pizz"].add(tp, ins.upright_bass(c["bass"] + (12 if c["bass"] < 36 else 0), 0.45, 0.9,
                                           rng_for("a3pz", "acc", i), tau=0.6), ag)
        B["bells"].add(tp, ins.glock(top + 12, 0.55, rng_for("a3accg", i), tau_scale=0.5), 0.8)

    # the last bar of the numbers scene swells into the network (strings, cymbal, a short roll)
    tb = num1 - bar
    cb = ch3(loop[ci(tb)])
    B["strings"].add(tb, ins.strings(cb["low"] + [cb["pad"][1], cb["pad"][3]], bar, rng_for("a3nstr"), attack=1.6,
                                     release=0.5), 0.8)
    B["pad"].add(tb, ins.supersaw(cb["pad"], bar, rng_for("a3npad"), voices=7, detune=12, attack=1.5, decay=1.0,
                                  sustain=1.0, release=0.4), 0.5)
    B["fx"].add(num1 - beat * 2, ins.noise_sweep(beat * 2, rng_for("a3", "riser2"), 500.0, 7000.0, q=1.3,
                                                 amp_pow=2.2), 0.22)
    for i, t in enumerate(grid(num1 - beat, num1, s16)):
        B["drums"].add(t, SNARE, 0.14 + 0.08 * i)
    run_into(num1, THEME[ci(tb)][-1][1], THEME[ci(net0)][0][1], vel=0.75)

    # ================================================= network: the lift, the gather, the climax
    lch = bars(net0, gather)
    mx.chords += lch
    B["drums"].add(net0, CRASH, 0.5)
    lead_notes = []
    for i, (t, ch, d) in enumerate(lch):
        c = ch3(ch)
        u = i / max(len(lch) - 1, 1)
        piano_bar(t, ch, d, vel=0.28 + 0.04 * u, eighths=True)
        B["strings"].add(t, ins.strings(c["low"] + [c["pad"][1], c["pad"][3], c["pad"][2] + 12], d + 0.05,
                                        rng_for("a3lstr", t), attack=0.35 if i == 0 else 0.2, release=0.7),
                         0.6 + 0.12 * u)
        B["warm"].add(t, ins.strings([c["bass"] + 12, c["low"][1]], d + 0.05, rng_for("a3lwarm", t), attack=0.4,
                                     release=0.7, lp=900.0, vib_cents=5.0), 0.75)
        B["pad"].add(t, ins.supersaw(c["pad"], d + 0.02, rng_for("a3lpad", t), voices=7, detune=12, attack=0.25,
                                     decay=0.8, sustain=0.9, release=0.4), 0.38 + 0.1 * u)
        B["bass"].add(t, ins.bass_note(c["bass"], 2 * beat * 0.97, 0.6, cutoff=450, attack=0.01), 0.7)
        B["bass"].add(t + 2 * beat, ins.bass_note(c["bass"], 2 * beat * 0.97, 0.55, cutoff=450, attack=0.01), 0.7)
        for b in range(4):
            B["kick"].add(t + b * beat, KSOFT, 0.5 + 0.1 * u)
        for b in (1, 3):
            B["perc"].add(t + b * beat, RIM[b // 2], 0.3, pan=-0.2)
            B["perc"].add(t + b * beat, CLAP, 0.14 + 0.04 * u)
        for k in range(16):
            B["perc"].add(t + k * s16, SHK[k % 4], 0.6 * (0.5, 0.2, 0.36, 0.24)[k % 4], pan=0.35)
        for (b, m, ln) in THEME[ci(t)]:
            lead_notes.append((t + b * beat, ln * beat * 0.95, m, 0.9))
            B["strings"].add(t + b * beat, ins.strings([m + 12], ln * beat, rng_for("a3lmel", t, b), attack=0.12,
                                                       release=0.5, voices=3, lp=3600.0), 0.5)
            B["bells"].add(t + b * beat, ins.glock(m + 12, 0.6, rng_for("a3lgl", t, b), tau_scale=0.6), 0.6)
    # the gather: no drums, three rising steps evenly spaced into the climax
    g3 = (climax - gather) / 3.0
    gch = [loop[ci(gather)], loop[3 % len(loop)], loop[1 % len(loop)]]
    rise = [n[1] for n in THEME[ci(gather)]][:3]
    while len(rise) < 3:
        rise.append(rise[-1] + 4)
    mx.chords += [(gather + k * g3, gch[k], g3) for k in range(3)]
    cgap = 0.035                         # a breath of air right before the climax chord
    for k in range(3):
        t = gather + k * g3
        c = ch3(gch[k])
        w = 0.52 + 0.14 * k
        d = g3 - (cgap if k == 2 else -0.02)
        B["strings"].add(t, ins.strings(c["low"] + [c["pad"][1], c["pad"][3]], d, rng_for("a3gstr", k),
                                        attack=0.08, release=0.2), w)
        B["warm"].add(t, ins.strings([c["bass"] + 12, c["low"][1]], d, rng_for("a3gwarm", k), attack=0.08,
                                     release=0.2, lp=900.0, vib_cents=5.0), w + 0.15)
        B["pad"].add(t, ins.supersaw(c["pad"], d - 0.02, rng_for("a3gpad", k), voices=7, detune=12, attack=0.05,
                                     decay=0.8, sustain=1.0, release=0.15), 0.42 + 0.1 * k)
        B["bass"].add(t, ins.bass_note(c["bass"] + (12 if c["bass"] < 35 else 0), d * 0.97, 0.6, cutoff=500,
                                       attack=0.01), 0.75)
        for m, v in ((c["bass"] + 12, 0.38), (c["ten"][0], 0.3), (c["ten"][1], 0.3), (c["ten"][2], 0.3),
                     (rise[k], 0.5 + 0.05 * k)):
            B["piano"].add(t, ins.felt_piano(m, g3 + 0.1, v, rng_for("a3gp", k, m)), 1.0)
        lead_notes.append((t, d * 0.97, rise[k], 0.9 + 0.05 * k))
        B["strings"].add(t, ins.strings([rise[k] + 12], d - 0.02, rng_for("a3gmel", k), attack=0.06, release=0.2,
                                        voices=3, lp=3800.0), 0.55 + 0.08 * k)
    g = climax - gather - cgap
    B["fx"].add(gather, ins.noise_sweep(g, rng_for("a3", "cym"), 2500.0, 9000.0, q=0.9, amp_pow=2.0), 0.18)
    sw = ins.reverse_swell(np.stack([CRASH[0][:s2n(1.5)], CRASH[1][:s2n(1.5)]]), mx.reverbs["hall"]["ir"],
                           min(g, 1.2), power=1.6)
    B["fx"].add(climax - cgap - min(g, 1.2), sw, 0.3)

    # the climax: the fullest, warmest chord of the film (tonic add9, six octaves), held.
    # Not louder than the drop (cg trims the whole chord) but with more low-mids and mids.
    cT = ch3(loop[0])
    r0 = cT["bass"]                                   # D2
    top = r0 + 48                                     # D6
    hold = max(fin0 - climax - 0.35, 1.0)
    cg = 0.89
    mx.chords.append((climax, loop[0], fin0 - climax))
    lead_notes.append((climax, min(hold, 4 * beat), top, 1.0))
    t_l, sig = ins.lead_line(lead_notes, rng_for("a3netlead"), glide=0.05, vib_cents=16.0, vib_rate=5.0,
                             cutoff=3000, detune=8, sub=0.15, fenv=0.7)
    B["lead"].add(t_l, sig, 0.42)
    full = [r0 + 12, r0 + 19, r0 + 24, r0 + 28, r0 + 31, r0 + 36, r0 + 38, r0 + 40, r0 + 43, r0 + 48]
    B["strings"].add(climax, ins.strings(full, hold, rng_for("a3cstr"), attack=0.03, release=1.4, lp=3400.0), 1.0 * cg)
    B["warm"].add(climax, ins.strings([r0, r0 + 7, r0 + 12, r0 + 19, r0 + 28], hold, rng_for("a3cwarm"), attack=0.03,
                                      release=1.4, lp=1000.0, vib_cents=5.0), 1.6 * cg)
    B["pad"].add(climax, ins.supersaw(cT["pad"] + [r0 + 38], hold, rng_for("a3cpad"), voices=7, detune=12,
                                      attack=0.015, decay=1.5, sustain=0.8, release=1.2), 0.58 * cg)
    # the anthem's tutti stab again, soft: the chord speaks on the cue, then strings and pad bloom
    B["hits"].add(climax, ins.supersaw(cT["pad"] + [r0 + 38] + cT["low"], 0.25, rng_for("a3cstab"), voices=7,
                                       detune=13, attack=0.003, decay=0.35, sustain=0.3, release=0.5), 0.5 * cg)
    B["bass"].add(climax, ins.bass_note(r0, hold, 0.9, cutoff=480, attack=0.006, decay=1.2, sustain=0.6,
                                        release=0.3), 0.5 * cg)
    roll = [r0 - 12, r0, r0 + 7, r0 + 12, r0 + 16, r0 + 19, r0 + 24, r0 + 26, r0 + 28, r0 + 31, r0 + 36]
    for i, m in enumerate(roll):
        dt = 0.0 if i < 2 or i >= len(roll) - 2 else 0.007 * (i - 1)
        B["piano"].add(climax + dt, ins.felt_piano(m, hold + 0.6, 0.52 if i > 1 else 0.56, rng_for("a3cp", m),
                                                   damper=0.4), cg)
    B["kick"].add(climax, KICK, 0.5 * cg)
    B["hits"].add(climax, ins.boom(rng_for("a3cboom"), f0=66, f1=36.7, decay=0.9, length=2.2, click=0.15), 0.35 * cg)
    B["drums"].add(climax, CRASH, 0.5 * cg)
    for i, m in enumerate((top, top + 7, top + 12)):
        B["bells"].add(climax + 0.05 * i, ins.glock(m, 0.6, rng_for("a3cgl", i)), 0.5 * cg)
    # after it, the coda motif on the piano leads into the finale
    coda0 = fin0 - 4 * beat
    if coda0 >= climax + 0.3:
        for (b, m, ln) in CODA:
            B["piano"].add(coda0 + b * beat, ins.felt_piano(m, ln * beat * 0.98, 0.5, rng_for("a3coda", b)), 1.0)
            B["bells"].add(coda0 + b * beat, ins.glock(m + 12, 0.45, rng_for("a3codag", b), tau_scale=0.7), 0.6)

    # ================================================= finale: the theme once more, piano and pad
    fch = bars(fin0, fin)
    mx.chords += fch
    for i, (t, ch, d) in enumerate(fch):
        c = ch3(ch)
        piano_bar(t, ch, d, vel=0.40, melody=THEME[ci(t)], mvel=0.62, eighths=False)
        B["pad"].add(t, ins.supersaw(c["pad"], d + 0.05, rng_for("a3opad", t), voices=7, detune=12,
                                     attack=0.15, decay=1.0, sustain=0.8, release=0.5), 0.66)
        B["warm"].add(t, ins.strings([c["bass"] + 12, c["low"][1], c["ten"][2]], d + 0.1, rng_for("a3owarm", t),
                                     attack=0.3, release=0.8, lp=1100.0, vib_cents=5.0), 0.72)
    # final tonic chord at `fin`, rolled, ringing out. No bells or cymbal here: the cat's
    # collar bell (SFX, just before it) has the top of the spectrum to itself.
    c = ch3(loop[0])
    ring = end - fin + 0.5
    mx.chords.append((fin, loop[0], min(2.0, end - fin)))
    # bass octave and the melody's resolution land on the cue; the inner voices roll up after
    roll = [(c["bass"] - 12, 0.0, 0.52), (c["bass"], 0.0, 0.48), (c["pad"][3], 0.0, 0.5),
            (c["low"][1], 0.03, 0.42), (c["ten"][1], 0.06, 0.42), (c["ten"][2], 0.09, 0.42), (c["pad"][2], 0.12, 0.42),
            (c["pad"][3] + 4, 0.16, 0.46)]
    for (m, dt, v) in roll:
        B["piano"].add(fin + dt, ins.felt_piano(m, ring, v, rng_for("fin", m), damper=0.5), 1.0)
    # pad and low strings swell under it and are let go early, so the chord dies away naturally
    hold = max(1.0, (end - fin) * 0.45)
    B["warm"].add(fin, ins.strings(c["low"] + c["ten"], hold, rng_for("a3fin"), attack=0.4, release=2.6,
                                   lp=1200.0, vib_cents=5.0), 0.7)
    B["pad"].add(fin, ins.supersaw(c["pad"], hold, rng_for("a3fpad"), voices=7, detune=11, attack=0.3,
                                   decay=1.5, sustain=0.7, release=2.6), 0.45)

    mx.kicks = kicks
    mix = mx.render()
    return mx, mix
