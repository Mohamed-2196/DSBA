#!/usr/bin/env python3
"""Generates cues.json — the single source of truth for timing.

Every workstream (DOM scenes, glitch post-processing, soundtrack/SFX) reads
cues.json. Never hand-edit cues.json; edit this file and re-run it.

All times are in seconds from the start of the film. 30 fps, 1920x1080.

Cut 2 (DSBA Hub): 140 s.
  Act 1   0-68     the believable launch film for the new DSBA Hub
  g1      68-72    glitch #1
  Act 2   72-85.5  the fake birthday for Noor, starring her cat
  g2      85.5-91.5 glitch #2 (terminal)
  Act 3   91.5-140 the letter, Teacher's Day, "we ran the numbers", the network, finale
"""
import json
import random
from pathlib import Path

FPS = 30
W, H = 1920, 1080
DURATION = 140.0

# ---------------------------------------------------------------- tempo maps
ACT1_BPM = 120          # beats at 0.0, 0.5, 1.0 ... ; bars (4/4) every 2.0s
ACT1_END = 68.0
BDAY_BPM = 110          # "Happy Birthday" (3/4)
BDAY_START = 72.0       # scene start: darkness, a collar bell, two eyes
BDAY_LIGHTS = 73.4      # lights on
BDAY_PICKUP = 73.5      # time of the first "Hap-" (pickup)
REVEAL_BPM = 120        # downbeat of the anthem drop at 100.0
REVEAL_DROP = 100.0
PIANO_START = 92.0      # 4 bars of piano before the drop (92, 94, 96, 98)

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
    (16, 1, 71, "No"), (17, 1, 69, "or"),
    (18.0, 0.75, 77, "Hap"), (18.75, 0.25, 77, "py"),
    (19, 1, 76, "birth"), (20, 1, 72, "day"), (21, 1, 74, "to"),
    (22, 3, 72, "you"),  # <- the glitch hits exactly here
]
BDAY_CUT = round(BDAY_PICKUP + 22 * bday_beat, 4)   # 85.5
BDAY_PHRASES = [round(BDAY_PICKUP + b * bday_beat, 4) for b in (0, 6, 12, 18)]

# ------------------------------------------------------------------ scenes
SCENES = [
    # id, start, end, act, short description
    ("s01_cold_open",   0.0,   8.0, 1, "Three nodes on a line, then: 3 cohorts / ~160 students / 7 places to check (the seven tick in)."),
    ("s02_chaos",       8.0,  18.0, 1, "Notifications from seven different places pile up, freeze at 16.0, implode 17-18."),
    ("s03_logo",       18.0,  26.0, 1, "DROP. The new DSBA Hub logo: 'One place to start.' + honest subline + 5 pills."),
    ("s04_newsletter", 26.0,  36.0, 1, "Feature 1 - the newsletter in a 3D browser frame: CFA Research Challenge, Student Council, Speech Day, the launch."),
    ("s05_forum",      36.0,  46.0, 1, "Feature 2 - Forum: the 'am I cooked' maths thread is typed, posted, answered across cohorts; easter egg."),
    ("s06_everything", 46.0,  62.0, 1, "Montage: library (real notes), lessons (real lecture frames), Career Navigator, calendar, grades, search; cohorts network; 'Built by students.'"),
    ("s07_launch",     62.0,  68.0, 1, "'Launching today' + LAUNCH button + 3/2/1 countdown + click at 67.85."),
    ("g1_glitch",      68.0,  72.0, 2, "Glitch #1: freeze, corruption, error windows, static, black."),
    ("s08_birthday",   72.0,  85.5, 2, "Darkness, a collar bell, two eyes. Lights on: Noor's cat in a party hat, 'Happy Birthday, Noor', gold confetti."),
    ("g2_glitch",      85.5,  91.5, 3, "Glitch #2: song cut on the final 'you', scramble, terminal 'wrong target', crescendo, flash, black+silence."),
    ("s09_letter",     91.5, 100.0, 3, "Letter to the teachers, typed line by line over soft piano; riser into the drop."),
    ("s10_teachers_day", 100.0, 106.0, 3, "DROP: HAPPY TEACHER'S DAY, gold, particles; 'Yes, it was yesterday.'"),
    ("s11_numbers",    106.0, 124.0, 3, "'We study data. So we ran the numbers on you.' Four statistics jokes, one card each (4 s)."),
    ("s12_network",    124.0, 132.0, 3, "The three cohorts as one network; the ~160 dots gather into THANK YOU."),
    ("s13_finale",     132.0, 140.0, 3, "Happy Teacher's Day sign-off, logos, the cat's P.S., fade to black."),
]

# ------------------------------------------------------------ act 1 details
COLD_OPEN_LINES = [
    (2.0, "3 cohorts."),
    (3.0, "~160 students."),
    (4.0, "7 places to check."),   # the number counts 1 -> 7 as the places tick in
]
PLACES = ["BIBF email", "Backup email", "Personal email", "LSE VLE", "BIBF MyClass", "UoL portal", "WhatsApp groups"]
PLACE_T0, PLACE_DT = 4.0, 0.25
place_times = [round(PLACE_T0 + i * PLACE_DT, 3) for i in range(len(PLACES))]   # 4.0 .. 5.5
COLD_OPEN_PUNCH = 5.6    # highlighter swipes "7 places to check."

# Notification pops, accelerating from 8.0 to 16.0 (each gets an SFX ping).
rng = random.Random(2026)
pops = []
t, dt = 8.0, 0.5
while t < 15.95:
    pops.append({
        "t": round(t, 3),
        "tone": rng.randrange(4),            # which ping pitch-set (0..3)
        "pan": round(rng.uniform(-0.8, 0.8), 2),
        "x": round(rng.uniform(0.04, 0.80), 3),  # card position (fraction of W, left edge)
        "y": round(rng.uniform(0.06, 0.86), 3),  # (fraction of H, top edge)
        "rot": round(rng.uniform(-7, 7), 1),
    })
    dt = max(0.075, dt * 0.88)
    t += dt
# which of the seven places each pop comes from (WhatsApp groups are the noisiest)
rng_src = random.Random(7)
SRC_WEIGHTS = [3, 2, 2, 2, 2, 2, 7]
for i, p in enumerate(pops):
    p["src"] = i if i < 7 else rng_src.choices(range(7), weights=SRC_WEIGHTS)[0]

CHAOS_CAPTIONS = [
    (11.0, "The timetable is in an email."),
    (12.5, "The notes are in a group chat."),
    (14.0, "The past paper is… somewhere."),
    (15.1, "Which group was it again?"),
]
CHAOS_CALM = "It all exists. Just never in one place."

FORUM_TYPED_TEXT = "What is this, am I cooked 💀"
typing_start, typing_end = 40.2, 42.2
char_dt = (typing_end - typing_start) / len(FORUM_TYPED_TEXT)   # len() counts code points (the skull is one)
forum_typing = [round(typing_start + i * char_dt, 3) for i in range(len(FORUM_TYPED_TEXT))]

# Easter egg upvote counter 23 -> 160 between 44.2 and 45.8 (ease-out), one tick per +1
EGG_T0, EGG_T1 = 44.2, 45.8
upvote_ticks = []
for i in range(1, 161):
    p = i / 160
    pt = 1 - (1 - p) ** 0.5
    upvote_ticks.append(round(EGG_T0 + (EGG_T1 - EGG_T0) * pt, 4))

# Montage of the rest of the Hub (46-62): cuts on bar / half-bar boundaries
MONTAGE = [
    {"t": 46.0, "id": "library",  "caption": "Every file, inside the app."},
    {"t": 48.0, "id": "lessons",  "caption": "Every lecture, one click away."},
    {"t": 50.0, "id": "career",   "caption": "Plan what comes next."},
    {"t": 53.0, "id": "calendar", "caption": "Every deadline, on time."},
    {"t": 54.5, "id": "grades",   "caption": "Your classification, live."},
    {"t": 56.0, "id": "search",   "caption": "Find anything."},
    {"t": 57.5, "id": "network",  "caption": "Three cohorts, finally connected."},
    {"t": 60.0, "id": "built_by", "caption": "Built by students. For all of DSBA."},
]
MONTAGE_END = 62.0
FILE_CLICK = 47.0
LESSON_PLAY = 48.9
SEARCH_TYPED_TEXT = "econometrics"
search_typing = [round(56.3 + i * 0.065, 3) for i in range(len(SEARCH_TYPED_TEXT))]

LAUNCH = {"start": 62.0, "button_in": 63.0, "countdown": [65.0, 66.0, 67.0], "click": 67.85}

# ------------------------------------------------------------- glitch maps
# 'segments' drive the raster post-processing intensity (0..1) and style.
# 'stutters' are shared A/V repeats: between start and end, BOTH audio and
# video repeat the source slice [src, src+len). Video rounds to whole frames.
# 'hits' are short spikes (both a visual spike and an SFX).
G1_T = 68.0
def g1(x):
    return round(G1_T + x, 4)
G1 = {
    "start": g1(0), "end": g1(4),
    "segments": [
        {"t0": g1(0.00), "t1": g1(0.40), "kind": "freeze_stutter", "i0": 0.35, "i1": 0.55},
        {"t0": g1(0.40), "t1": g1(1.50), "kind": "corrupt",        "i0": 0.50, "i1": 1.00},
        {"t0": g1(1.50), "t1": g1(3.00), "kind": "errors",         "i0": 0.15, "i1": 0.25},
        {"t0": g1(3.00), "t1": g1(3.90), "kind": "static",         "i0": 0.30, "i1": 1.00},
        {"t0": g1(3.90), "t1": g1(4.00), "kind": "black",          "i0": 0.00, "i1": 0.00},
    ],
    "stutters": [
        {"start": g1(0.000), "end": g1(0.375), "src": g1(-0.125), "len": 0.125},
        {"start": g1(0.500), "end": g1(0.750), "src": g1(0.375), "len": 0.0625},
        {"start": g1(0.900), "end": g1(1.100), "src": g1(0.850), "len": 0.03125},
    ],
    "tape_stop": {"t0": g1(0.75), "t1": g1(1.50)},       # Act-1 music pitch/speed falls to zero
    "error_windows": [g1(x) for x in (1.60, 1.85, 2.10, 2.35, 2.60, 2.80)],
    "hits": [g1(x) for x in (0.0, 0.42, 0.66, 0.88, 1.12, 1.31, 1.60, 1.85, 2.10, 2.35, 2.60, 2.80)],
}

G2_T = BDAY_CUT   # 85.5
def g2(x):
    return round(G2_T + x, 4)
G2 = {
    "start": g2(0), "end": g2(6),
    "segments": [
        {"t0": g2(0.00), "t1": g2(1.00), "kind": "warp",       "i0": 0.30, "i1": 0.70},
        {"t0": g2(1.00), "t1": g2(3.60), "kind": "terminal",   "i0": 0.16, "i1": 0.24},
        {"t0": g2(3.60), "t1": g2(4.30), "kind": "crescendo",  "i0": 0.45, "i1": 1.00},
        {"t0": g2(4.30), "t1": g2(4.50), "kind": "flash",      "i0": 1.00, "i1": 1.00},
        {"t0": g2(4.50), "t1": g2(6.00), "kind": "black",      "i0": 0.00, "i1": 0.00},
    ],
    "stutters": [
        # the final "you" stutters: you-you-you-yo-y
        {"start": g2(0.18), "end": g2(0.70), "src": g2(0.0), "len": 0.18},
    ],
    "note_warp": {"t0": g2(0.0), "t1": g2(1.0)},          # the final note detunes + tape-stops
    "terminal_lines": [
        {"t": g2(1.10), "text": "> ERROR: celebration.target mismatch"},
        {"t": g2(1.76), "text": "> expected: Noor"},
        {"t": g2(2.12), "text": "> found: everyone who taught us"},
        {"t": g2(2.90), "text": "> rerouting celebration..."},
    ],
    "silence": {"t0": g2(4.5), "t1": g2(6.0)},
    "crescendo": g2(3.60), "flash": g2(4.30),
}
G2["hits"] = [g2(0.0)] + [ln["t"] for ln in G2["terminal_lines"]] + [g2(4.30)]

# Terminal typing (fast enough that each line finishes before the next starts)
TERMINAL_CPS = 58.0
terminal_typing = []
for i, line in enumerate(G2["terminal_lines"]):
    end = line["t"] + len(line["text"]) / TERMINAL_CPS
    nxt = G2["terminal_lines"][i + 1]["t"] if i + 1 < len(G2["terminal_lines"]) else G2["crescendo"]
    assert end < nxt - 0.02, (line["text"], end, nxt)
    for k, _ in enumerate(line["text"]):
        terminal_typing.append(round(line["t"] + k / TERMINAL_CPS, 4))

# --------------------------------------------------------------- act 3 copy
LETTER_T = 91.5
LETTER_LINES = [
    {"t": 91.60, "text": "Dear teachers,"},
    {"t": 93.00, "text": "today, you thought you were in on the surprise."},
    {"t": 95.20, "text": "you even kept the secret."},
    {"t": 97.30, "text": "plot twist:"},
    {"t": 98.10, "text": "you were the surprise."},
]
LETTER_CPS = 30.0  # characters per second while typing
letter_typing = []
for line in LETTER_LINES:
    for i, _ in enumerate(line["text"]):
        letter_typing.append(round(line["t"] + i / LETTER_CPS, 4))

NUMBERS = {
    "start": 106.0,
    "intro": [{"t": 106.15, "text": "We study data."}, {"t": 107.0, "text": "So we ran the numbers on you."}],
    "cards": [
        {"t": 108.0, "id": "exam",  "kicker": "Figure 1", "title": "Times we asked “Will this be in the exam?”",
         "build": 108.9, "punch_t": 110.0, "punch": "∞", "note": "…and counting."},
        {"t": 112.0, "id": "h0",    "kicker": "Figure 2", "title": "H₀: you were only doing your job.",
         "build": 112.9, "punch_t": 114.0, "punch": "REJECTED", "note": "p < 0.0001"},
        {"t": 116.0, "id": "heart", "kicker": "Figure 3", "title": "Your patience vs. our questions",
         "build": 116.8, "punch_t": 118.0, "punch": "r = 1.00", "note": "A perfect fit."},
        {"t": 120.0, "id": "ci",    "kicker": "Figure 4", "title": "Confidence that we couldn’t have done it without you",
         "build": 120.9, "punch_t": 122.0, "punch": "100%", "note": "Yes, we know that’s not how confidence intervals work."},
    ],
    "card_len": 4.0,
    "end": 124.0,
}
NETWORK = {
    "start": 124.0,
    "nodes_in": 124.1, "links_in": 124.9,
    "lines": [{"t": 124.3, "text": "Three cohorts. One room."},
              {"t": 126.2, "text": "Every connection in it started in one of your classes."}],
    "gather": 128.0, "formed": 129.5, "word": "THANK YOU",
    "end": 132.0,
}
FINALE = {
    "start": 132.0, "title": 132.2, "signoff": 133.6, "logos": 134.4, "ps": 135.8,
    "title_text": "Happy Teacher’s Day",
    "signoff_text": "From all of us in DSBA · Years 1, 2 & 3",
    "hashtag": "#HappyTeachersDay",
    "ps_text": "P.S. Noor knew everything. The cake is real.",
    "fade": [138.6, 140.0],
}

# ----------------------------------------------------------- SFX cue list
sfx = []
def add(t, kind, **kw):
    sfx.append({"t": round(t, 4), "kind": kind, **kw})

# act 1
add(0.0, "drone_in")
for i, t_ in enumerate((0.55, 0.95, 1.35)):
    add(t_, "node_blip", index=i)            # the three cohort nodes light up on the line
for t_, _ in COLD_OPEN_LINES[:2]:
    add(t_, "text_hit")
for i, t_ in enumerate(place_times):
    add(t_, "count_tick", index=i, of=len(place_times))   # rising ticks 1..7
add(COLD_OPEN_PUNCH, "comic_ding")
for p in pops:
    add(p["t"], "notif_ping", tone=p["tone"], pan=p["pan"])
for t_, _ in CHAOS_CAPTIONS:
    add(t_, "soft_tick")
add(16.0, "hard_stop")              # music + everything cuts (tape-stop 0.25s)
add(17.0, "reverse_riser", dur=1.0)  # sucks into the drop
add(18.0, "impact_drop")
for t_ in (26.0, 36.0, 46.0, LAUNCH["start"]):
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
add(FILE_CLICK, "ui_click")           # file opens
add(LESSON_PLAY, "ui_click")          # lesson play
for t_ in search_typing:
    add(t_, "key_click")
for t_ in LAUNCH["countdown"]:
    add(t_, "countdown_hit")
add(LAUNCH["click"], "ui_click_big")
# glitch 1
for t_ in G1["hits"]:
    add(t_, "glitch_hit")
for t_ in G1["error_windows"]:
    add(t_, "error_beep")
add(g1(3.0), "static_rise", dur=0.9)
# act 2
add(72.3, "bell_jingle")              # the cat's collar bell, alone in the dark
add(BDAY_LIGHTS, "lights_on")         # a switch click + warm bloom
add(BDAY_LIGHTS + 0.08, "party_popper")
# glitch 2
for t_ in G2["hits"][:-1]:
    add(t_, "glitch_hit")
for t_ in terminal_typing:
    add(t_, "term_key")
add(G2["crescendo"], "crescendo_noise", dur=round(G2["flash"] - G2["crescendo"], 3))
add(G2["flash"], "flash_impact")
# act 3
for t_ in letter_typing:
    add(t_, "type_soft")
add(REVEAL_DROP - 2.0, "riser", dur=2.0)
add(REVEAL_DROP, "impact_drop_big")
for c in NUMBERS["cards"]:
    add(c["t"] - 0.12, "swish_small", dur=0.3)
    add(c["build"], "chart_build", dur=round(c["punch_t"] - c["build"], 3), id=c["id"])
    add(c["punch_t"], "stamp" if c["id"] == "h0" else "punch_ding", id=c["id"])
add(NETWORK["nodes_in"], "node_swarm", dur=0.8)
add(NETWORK["gather"], "gather_swell", dur=round(NETWORK["formed"] - NETWORK["gather"], 3))
add(NETWORK["formed"], "chime_big")
add(FINALE["start"] - 0.4, "whoosh_soft", dur=0.8)
add(FINALE["ps"], "bell_jingle")      # the cat again
sfx.sort(key=lambda e: e["t"])

cues = {
    "fps": FPS, "width": W, "height": H, "duration": DURATION,
    "frames": int(round(DURATION * FPS)),
    "tempo": {
        "act1": {"bpm": ACT1_BPM, "first_beat": 0.0, "drop": 18.0, "end": ACT1_END,
                  "chords": ["Am", "F", "C", "G"], "bar_seconds": 2.0},
        "birthday": {"bpm": BDAY_BPM, "pickup": BDAY_PICKUP, "beat_seconds": round(bday_beat, 6),
                      "cut": BDAY_CUT, "key": "C major", "time_signature": "3/4", "phrases": BDAY_PHRASES},
        "reveal": {"bpm": REVEAL_BPM, "piano_start": PIANO_START, "drop": REVEAL_DROP,
                    "chords": ["D", "A", "Bm", "G"], "bar_seconds": 2.0,
                    "sections": {"title": [100.0, 106.0], "numbers": [106.0, 124.0], "network": [124.0, 132.0], "finale": [132.0, 140.0]},
                    "climax": NETWORK["formed"], "final_chord": 136.0, "end": DURATION},
    },
    "scenes": [{"id": s[0], "start": s[1], "end": s[2], "act": s[3], "desc": s[4]} for s in SCENES],
    "cold_open": {"lines": [{"t": a, "text": b} for a, b in COLD_OPEN_LINES],
                  "places": [{"t": t_, "text": p} for t_, p in zip(place_times, PLACES)],
                  "punch": COLD_OPEN_PUNCH, "nodes": [0.55, 0.95, 1.35]},
    "chaos": {"pops": pops, "captions": [{"t": a, "text": b} for a, b in CHAOS_CAPTIONS],
              "freeze": 16.0, "calm": CHAOS_CALM, "implode": [17.0, 18.0]},
    "logo": {"intro": 18.0, "drop": 18.0, "tagline": 20.0, "subline": 21.1, "pills": 22.0, "pill_step": 0.42,
             "label": "Introducing the new", "wordmark": "DSBA Hub",
             "tagline_text": "One place to start.",
             "subline_text": "Your emails and group chats stay. The hunting stops.",
             "pills_text": ["Newsletter", "Forum", "Library", "Lessons", "Career Navigator"]},
    "newsletter": {"start": 26.0, "browser_in": 26.8,
                   "callouts": [{"t": 28.0, "text": "What’s happening in DSBA"},
                                {"t": 29.4, "text": "CFA Research Challenge: BIBF is in"},
                                {"t": 30.62, "text": "DSBA nominees for Student Council"},
                                {"t": 31.62, "text": "Speech Day, recapped"}],
                   "slides": [28.95, 30.2, 31.3], "covers": 32.4, "read_time": 34.2,
                   "title": "The Newsletter", "caption": "The news that matters to DSBA, in one read."},
    "forum": {"start": 36.0, "threads_in": 37.0, "composer_open": 39.8,
              "typed_text": FORUM_TYPED_TEXT, "typing": forum_typing,
              "post_click": 42.6, "post_appears": 42.7, "replies": [43.3, 43.9],
              "reply_cards": [{"name": "Sara M.", "year": 3, "text": "Integration by parts. You’re not cooked."},
                              {"name": "Ahmed J.", "year": 1, "text": "Dr Hamad Alrayes’ advisory session saved my life."}],
              "easter_egg": {"start": EGG_T0, "end": EGG_T1, "votes": 160, "ticks": upvote_ticks}},
    "montage": {"start": 46.0, "end": MONTAGE_END, "cuts": MONTAGE,
                "file_preview_click": FILE_CLICK, "lesson_play_click": LESSON_PLAY,
                "search_text": SEARCH_TYPED_TEXT, "search_typing": search_typing},
    "launch": LAUNCH,
    "g1": G1,
    "birthday": {"start": BDAY_START, "bell": 72.3, "eyes_in": 72.45, "lights_on": BDAY_LIGHTS,
                 "title_in": 73.6, "lower_third": 75.2, "phrases": BDAY_PHRASES, "cut": BDAY_CUT,
                 "name": "Noor",
                 "melody": [
                     {"t": round(BDAY_PICKUP + b * bday_beat, 4), "dur": round(d * bday_beat, 4), "midi": m, "syl": s}
                     for (b, d, m, s) in BDAY_MELODY]},
    "g2": {**G2, "terminal_typing": terminal_typing, "terminal_cps": TERMINAL_CPS},
    "letter": {"start": LETTER_T, "lines": LETTER_LINES, "cps": LETTER_CPS, "typing": letter_typing,
               "dissolve": 99.4, "flash": 99.84},
    "teachers_day": {"drop": REVEAL_DROP, "subline": 102.0,
                     "subline_text": "Yes, it was yesterday. We needed a day to fool you.", "end": 106.0},
    "numbers": NUMBERS,
    "network": NETWORK,
    "finale": FINALE,
    "outro": {"fade": FINALE["fade"]},
    "sfx": sfx,
}

out = Path(__file__).resolve().parent.parent / "cues.json"
out.write_text(json.dumps(cues, indent=1, ensure_ascii=False))
kinds = sorted({e["kind"] for e in sfx})
print(f"wrote {out}: {DURATION}s, {len(pops)} pops, {len(sfx)} sfx cues, birthday cut at {BDAY_CUT}s")
print("sfx kinds:", ", ".join(kinds))
