#!/usr/bin/env python3
"""Generates cues.json — the single source of truth for timing.

Every workstream (DOM scenes, glitch post-processing, soundtrack/SFX) reads
cues.json. Never hand-edit cues.json; edit this file and re-run it.

All times are in seconds from the start of the film. 30 fps, 1920x1080.
"""
import json
import random
from pathlib import Path

FPS = 30
W, H = 1920, 1080
DURATION = 120.0

# ---------------------------------------------------------------- tempo maps
ACT1_BPM = 120          # beats at 0.0, 0.5, 1.0 ... ; bars (4/4) every 2.0s
BDAY_BPM = 110          # music-box "Happy Birthday" (3/4)
BDAY_PICKUP = 68.5      # time of the first "Hap-" (pickup)
REVEAL_BPM = 120        # downbeat of the anthem drop at 95.0
REVEAL_DROP = 95.0
PIANO_START = 87.0      # 4 bars of piano before the drop (87,89,91,93)

bday_beat = 60.0 / BDAY_BPM

# Happy Birthday melody: (beat_offset_from_pickup, duration_beats, midi, syllable)
# Key of C major, 3/4. The film CUTS the song on the final "you" (beat 22).
BDAY_MELODY = [
    (0.0, 0.75, 67, "Hap"), (0.75, 0.25, 67, "py"),
    (1, 1, 69, "birth"), (2, 1, 67, "day"), (3, 1, 72, "to"), (4, 2, 71, "you"),
    (6.0, 0.75, 67, "Hap"), (6.75, 0.25, 67, "py"),
    (7, 1, 69, "birth"), (8, 1, 67, "day"), (9, 1, 74, "to"), (10, 2, 72, "you"),
    (12.0, 0.75, 67, "Hap"), (12.75, 0.25, 67, "py"),
    (13, 1, 79, "birth"), (14, 1, 76, "day"), (15, 1, 72, "dear"),
    (16, 1, 71, "Ad"), (17, 1, 69, "min"),
    (18.0, 0.75, 77, "Hap"), (18.75, 0.25, 77, "py"),
    (19, 1, 76, "birth"), (20, 1, 72, "day"), (21, 1, 74, "to"),
    (22, 3, 72, "you"),  # <- the glitch hits exactly here
]
BDAY_CUT = round(BDAY_PICKUP + 22 * bday_beat, 4)   # 80.5

# ------------------------------------------------------------------ scenes
SCENES = [
    # id, start, end, act, short description
    ("s01_cold_open",   0.0,   8.0, 1, "Pulse line + stats: 3 cohorts / 17 tutors / ~160 students / ...and 47 group chats."),
    ("s02_chaos",       8.0,  18.0, 1, "Notification/chat-bubble chaos piles up, freezes at 16.0, implodes 17-18."),
    ("s03_logo",       18.0,  26.0, 1, "DROP. DSBA Pulse logo reveal: 'DSBA, rebuilt from scratch.' + 4 pills."),
    ("s04_newsletter", 26.0,  36.0, 1, "Feature 1 - The Pulse newsletter in a 3D browser frame, callouts, issue covers."),
    ("s05_forum",      36.0,  46.0, 1, "Feature 2 - Forum: threads fly in, votes tick, composer types, replies, easter egg."),
    ("s06_everything", 46.0,  58.0, 1, "Fast montage of the rest of v2: library + file viewer, lessons, calendar, grades, search; then cohorts network + 'Built by students.'"),
    ("s07_launch",     58.0,  64.0, 1, "'Launching today' + LAUNCH button + 3/2/1 countdown + click at 63.85."),
    ("g1_glitch",      64.0,  68.0, 2, "Glitch #1: freeze, corruption, error windows, static, black."),
    ("s08_birthday",   68.0,  80.5, 2, "SURPRISE! Happy Birthday card for the admin, confetti, cake; music-box song."),
    ("g2_glitch",      80.5,  86.5, 3, "Glitch #2: song cut on final 'you', scramble, terminal 'wrong target', crescendo, flash, black+silence."),
    ("s09_letter",     86.5,  95.0, 3, "Letter to the tutors, typed line by line over soft piano; riser into the drop."),
    ("s10_teachers_day", 95.0, 101.0, 3, "DROP: HAPPY TEACHER'S DAY, gold, particles."),
    ("s11_names",     101.0, 113.0, 3, "17 tutor names appear on beats, then 'Thank you.'"),
    ("s12_outro",     113.0, 120.0, 3, "Constellation pull-back, sign-off, fade to black."),
]

# ------------------------------------------------------------ act 1 details
COLD_OPEN_LINES = [
    (2.0, "3 cohorts."),
    (3.0, "17 tutors."),
    (4.0, "~160 students."),
    (5.5, "...and 47 group chats."),
]

# Chat-bubble pops, accelerating from 8.0 to 16.0 (each gets an SFX ping).
rng = random.Random(2026)
pops = []
t, dt = 8.0, 0.5
while t < 15.95:
    pops.append({
        "t": round(t, 3),
        "tone": rng.randrange(4),            # which ping pitch-set (0..3)
        "pan": round(rng.uniform(-0.8, 0.8), 2),
        "x": round(rng.uniform(0.04, 0.80), 3),  # bubble position (fraction of W, left edge)
        "y": round(rng.uniform(0.06, 0.86), 3),  # (fraction of H, top edge)
        "rot": round(rng.uniform(-7, 7), 1),
        "msg": None,                          # filled by the scene from its message pool
    })
    dt = max(0.075, dt * 0.88)
    t += dt

CHAOS_CAPTIONS = [
    (11.0, "Announcements get buried."),
    (12.6, "Files hide in 40 Drive folders."),
    (14.0, "Questions go unanswered."),
    (15.2, "Year 1 never meets Year 3."),
]

FORUM_TYPED_TEXT = "Any tips for surviving Advanced Stats?"
typing_start, typing_end = 40.2, 42.2
char_dt = (typing_end - typing_start) / len(FORUM_TYPED_TEXT)
forum_typing = [round(typing_start + i * char_dt, 3) for i in range(len(FORUM_TYPED_TEXT))]

# Easter egg upvote counter 0 -> 160 between 44.2 and 45.8 (ease-out), one tick per +1
EGG_T0, EGG_T1 = 44.2, 45.8
upvote_ticks = []
for i in range(1, 161):
    p = i / 160
    # inverse of ease-out-quad: value(p_t) = 1-(1-p_t)^2  -> p_t = 1 - sqrt(1-p)
    pt = 1 - (1 - p) ** 0.5
    upvote_ticks.append(round(EGG_T0 + (EGG_T1 - EGG_T0) * pt, 4))

# Montage of the rest of v2 (46-58): quick cuts on bar / half-bar boundaries
MONTAGE = [
    {"t": 46.0, "id": "library",  "caption": "Every file, inside the app."},
    {"t": 48.0, "id": "lessons",  "caption": "Every lecture, one click away."},
    {"t": 50.0, "id": "calendar", "caption": "Every deadline, on time."},
    {"t": 51.5, "id": "grades",   "caption": "Your classification, live."},
    {"t": 53.0, "id": "search",   "caption": "Find anything."},
    {"t": 54.5, "id": "network",  "caption": "Everyone, in one place."},
    {"t": 56.0, "id": "built_by", "caption": "Built by students. For all of DSBA."},
]
SEARCH_TYPED_TEXT = "econometrics"
search_typing = [round(53.35 + i * 0.065, 3) for i in range(len(SEARCH_TYPED_TEXT))]

# ------------------------------------------------------------- glitch maps
# 'segments' drive the raster post-processing intensity (0..1) and style.
# 'stutters' are shared A/V repeats: between start and end, BOTH audio and
# video repeat the source slice [src, src+len). Video rounds to whole frames.
# 'hits' are short spikes (both a visual spike and an SFX).
G1 = {
    "start": 64.0, "end": 68.0,
    "segments": [
        {"t0": 64.00, "t1": 64.40, "kind": "freeze_stutter", "i0": 0.35, "i1": 0.55},
        {"t0": 64.40, "t1": 65.50, "kind": "corrupt",        "i0": 0.50, "i1": 1.00},
        {"t0": 65.50, "t1": 67.00, "kind": "errors",         "i0": 0.15, "i1": 0.25},
        {"t0": 67.00, "t1": 67.90, "kind": "static",         "i0": 0.30, "i1": 1.00},
        {"t0": 67.90, "t1": 68.00, "kind": "black",          "i0": 0.00, "i1": 0.00},
    ],
    "stutters": [
        {"start": 64.000, "end": 64.375, "src": 63.875, "len": 0.125},
        {"start": 64.500, "end": 64.750, "src": 64.375, "len": 0.0625},
        {"start": 64.900, "end": 65.100, "src": 64.850, "len": 0.03125},
    ],
    "tape_stop": {"t0": 64.75, "t1": 65.50},       # Act-1 music pitch/speed falls to zero
    "error_windows": [65.60, 65.85, 66.10, 66.35, 66.60, 66.80],
    "hits": [64.0, 64.42, 64.66, 64.88, 65.12, 65.31, 65.60, 65.85, 66.10, 66.35, 66.60, 66.80],
}

G2 = {
    "start": 80.5, "end": 86.5,
    "segments": [
        {"t0": 80.50, "t1": 81.50, "kind": "warp",       "i0": 0.30, "i1": 0.70},
        {"t0": 81.50, "t1": 83.95, "kind": "terminal",   "i0": 0.16, "i1": 0.24},
        {"t0": 83.95, "t1": 84.80, "kind": "crescendo",  "i0": 0.45, "i1": 1.00},
        {"t0": 84.80, "t1": 85.00, "kind": "flash",      "i0": 1.00, "i1": 1.00},
        {"t0": 85.00, "t1": 86.50, "kind": "black",      "i0": 0.00, "i1": 0.00},
    ],
    "stutters": [
        # the final sung "you" stutters: you-you-you-yo-y
        {"start": 80.68, "end": 81.20, "src": 80.50, "len": 0.18},
    ],
    "note_warp": {"t0": 80.5, "t1": 81.5},          # music-box final note detunes + tape-stops
    "terminal_lines": [
        {"t": 81.60, "text": "> ERROR: celebration.target mismatch"},
        {"t": 82.30, "text": "> expected: admin"},
        {"t": 82.90, "text": "> found: 17 tutors"},
        {"t": 83.40, "text": "> rerouting celebration..."},
    ],
    "hits": [80.5, 81.60, 82.30, 82.90, 83.40, 84.80],
    "silence": {"t0": 85.0, "t1": 86.5},
}

# Terminal typing (fast enough that line 1 finishes before line 2 starts)
TERMINAL_CPS = 58.0
terminal_typing = []
for line in G2["terminal_lines"]:
    for i, _ in enumerate(line["text"]):
        terminal_typing.append(round(line["t"] + i / TERMINAL_CPS, 4))

# --------------------------------------------------------------- act 3 copy
LETTER_LINES = [
    {"t": 86.60, "text": "Dear tutors,"},
    {"t": 88.00, "text": "yesterday, you thought that was the celebration."},
    {"t": 90.20, "text": "today, you thought you were in on a surprise."},
    {"t": 92.30, "text": "plot twist:"},
    {"t": 93.10, "text": "you were the surprise."},
]
LETTER_CPS = 30.0  # characters per second while typing
letter_typing = []
for line in LETTER_LINES:
    for i, _ in enumerate(line["text"]):
        letter_typing.append(round(line["t"] + i / LETTER_CPS, 4))

NAMES_FIRST = 101.5
reveal_beat = 60.0 / REVEAL_BPM
name_times = [round(NAMES_FIRST + i * reveal_beat, 3) for i in range(17)]  # 101.5 .. 109.5

# ----------------------------------------------------------- SFX cue list
sfx = []
def add(t, kind, **kw):
    sfx.append({"t": round(t, 4), "kind": kind, **kw})

add(0.0, "drone_in")
add(1.5, "pulse_blip")
for t_, _ in COLD_OPEN_LINES[:3]:
    add(t_, "text_hit")
add(5.5, "comic_ding")
for p in pops:
    add(p["t"], "notif_ping", tone=p["tone"], pan=p["pan"])
for t_, _ in CHAOS_CAPTIONS:
    add(t_, "soft_tick")
add(16.0, "hard_stop")              # music + everything cuts (tape-stop 0.25s)
add(17.0, "reverse_riser", dur=1.0)  # sucks into the drop
add(18.0, "impact_drop")
for t_ in (26.0, 36.0, 46.0, 58.0):
    add(t_ - 0.35, "whoosh", dur=0.6)
for t_ in forum_typing:
    add(t_, "key_click")
add(42.6, "ui_click")
add(42.7, "post_pop")
add(43.3, "reply_pop")
add(43.9, "reply_pop")
for t_ in upvote_ticks[::4]:          # every 4th +1 gets a tick (40 ticks)
    add(t_, "upvote_tick")
add(45.8, "counter_ding")
for m in MONTAGE[1:]:
    add(m["t"] - 0.12, "swish_small", dur=0.3)
add(47.3, "ui_click")                 # file preview opens
add(48.9, "ui_click")                 # lesson play
for t_ in search_typing:
    add(t_, "key_click")
for t_ in (61.0, 62.0, 63.0):
    add(t_, "countdown_hit")
add(63.85, "ui_click_big")
for t_ in G1["hits"]:
    add(t_, "glitch_hit")
for t_ in G1["error_windows"]:
    add(t_, "error_beep")
add(67.0, "static_rise", dur=0.9)
add(68.0, "party_popper")
add(68.05, "party_horn")
for t_ in G2["hits"][:-1]:
    add(t_, "glitch_hit")
for t_ in terminal_typing:
    add(t_, "term_key")
add(83.95, "crescendo_noise", dur=0.85)
add(84.8, "flash_impact")
for t_ in letter_typing:
    add(t_, "type_soft")
add(93.0, "riser", dur=2.0)
add(95.0, "impact_drop_big")
for i, t_ in enumerate(name_times):
    add(t_, "name_chime", index=i)
add(112.9, "whoosh_soft", dur=0.8)
sfx.sort(key=lambda e: e["t"])

cues = {
    "fps": FPS, "width": W, "height": H, "duration": DURATION,
    "frames": int(round(DURATION * FPS)),
    "tempo": {
        "act1": {"bpm": ACT1_BPM, "first_beat": 0.0, "drop": 18.0, "end": 64.0,
                  "chords": ["Am", "F", "C", "G"], "bar_seconds": 2.0},
        "birthday": {"bpm": BDAY_BPM, "pickup": BDAY_PICKUP, "beat_seconds": round(bday_beat, 6),
                      "cut": BDAY_CUT, "key": "C major", "time_signature": "3/4"},
        "reveal": {"bpm": REVEAL_BPM, "piano_start": PIANO_START, "drop": REVEAL_DROP,
                    "chords": ["D", "A", "Bm", "G"], "bar_seconds": 2.0, "final_chord": 117.0, "end": 120.0},
    },
    "scenes": [{"id": s[0], "start": s[1], "end": s[2], "act": s[3], "desc": s[4]} for s in SCENES],
    "cold_open_lines": [{"t": a, "text": b} for a, b in COLD_OPEN_LINES],
    "chaos": {"pops": pops, "captions": [{"t": a, "text": b} for a, b in CHAOS_CAPTIONS],
              "freeze": 16.0, "implode": [17.0, 18.0]},
    "logo": {"intro": 18.0, "drop": 18.0, "tagline": 20.0, "pills": 22.0,
             "tagline_text": "DSBA, rebuilt from scratch.",
             "pills_text": ["Newsletter", "Forum", "Library", "Lessons"]},
    "newsletter": {"start": 26.0, "browser_in": 26.6, "callouts": [28.0, 29.6, 31.2],
                   "covers": 32.4, "read_time": 34.2},
    "forum": {"start": 36.0, "threads_in": 37.0, "composer_open": 39.8,
              "typed_text": FORUM_TYPED_TEXT, "typing": forum_typing,
              "post_click": 42.6, "post_appears": 42.7, "replies": [43.3, 43.9],
              "easter_egg": {"start": EGG_T0, "end": EGG_T1, "votes": 160, "ticks": upvote_ticks}},
    "montage": {"start": 46.0, "end": 58.0, "cuts": MONTAGE,
                "file_preview_click": 47.3, "lesson_play_click": 48.9,
                "search_text": SEARCH_TYPED_TEXT, "search_typing": search_typing},
    "launch": {"start": 58.0, "button_in": 59.0, "countdown": [61.0, 62.0, 63.0], "click": 63.85},
    "g1": G1,
    "birthday": {"surprise": 68.0, "card_in": 68.25, "melody": [
        {"t": round(BDAY_PICKUP + b * bday_beat, 4), "dur": round(d * bday_beat, 4), "midi": m, "syl": s}
        for (b, d, m, s) in BDAY_MELODY]},
    "g2": {**G2, "terminal_typing": terminal_typing, "terminal_cps": TERMINAL_CPS},
    "letter": {"lines": LETTER_LINES, "cps": LETTER_CPS, "typing": letter_typing, "dissolve": 94.4},
    "teachers_day": {"drop": REVEAL_DROP, "subline": 97.0},
    "names": {"intro": 101.0, "times": name_times, "thank_you": 110.5},
    "outro": {"start": 113.0, "signoff": 114.5, "hashtag": 116.5, "fade": [118.5, 120.0]},
    "sfx": sfx,
}

out = Path(__file__).resolve().parent.parent / "cues.json"
out.write_text(json.dumps(cues, indent=1))
print(f"wrote {out}: {len(pops)} pops, {len(sfx)} sfx cues, birthday cut at {BDAY_CUT}s")
