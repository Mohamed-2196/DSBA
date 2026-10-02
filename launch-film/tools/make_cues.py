#!/usr/bin/env python3
"""Generates cues.json — the single source of truth for timing.

Every workstream (DOM scenes, glitch post-processing, soundtrack/SFX) reads
cues.json. Never hand-edit cues.json; edit this file and re-run it.

All times are in seconds from the start of the film. 30 fps, 1920x1080.

Cut 3 (DSBA Hub): 141 s.
  Act 1   0-64      opens straight on the notification pile-up, then the launch film for DSBA Hub
  g1      64-68     glitch #1
  Act 2   68-84.5   darkness and the cat's eyes (4.4 s), then the fake birthday for Noor
  g2      84.5-91   glitch #2 (terminal: expected Noor's birthday, found Teacher's Day)
  Act 3   91-141    the letter, Teacher's Day, "we ran the numbers", the network, finale
"""
import json
import random
from pathlib import Path

FPS = 30
W, H = 1920, 1080
DURATION = 141.0

# ---------------------------------------------------------------- tempo maps
ACT1_BPM = 120          # beats at 0.0, 0.5, 1.0 ... ; bars (4/4) every 2.0s
ACT1_DROP = 10.0
ACT1_END = 64.0
BDAY_BPM = 110          # "Happy Birthday" (3/4)
BDAY_START = 68.0       # scene start: darkness, a collar bell, two eyes that blink
BDAY_LIGHTS = 72.4      # lights on
BDAY_PICKUP = 72.5      # time of the first "Hap-" (pickup)
REVEAL_BPM = 120        # downbeat of the anthem drop
REVEAL_DROP = 99.0
PIANO_START = 91.0      # 4 bars of piano before the drop (91, 93, 95, 97)

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
BDAY_CUT = round(BDAY_PICKUP + 22 * bday_beat, 4)   # 84.5
BDAY_PHRASES = [round(BDAY_PICKUP + b * bday_beat, 4) for b in (0, 6, 12, 18)]

# ------------------------------------------------------------------ scenes
SCENES = [
    # id, start, end, act, short description
    ("s02_chaos",       0.0,  10.0, 1, "Opens on a browser with three portal tabs (MyClass, LSE VLE, UoL); then emails (from UoL, LSE, BIBF), BIBF texts and WhatsApp groups pile up on top: it is overwhelming. Freeze at 8.0, implode 9.1-10."),
    ("s03_logo",       10.0,  18.0, 1, "DROP. DSBA Hub: 'Here to help you through it.' + subline + 5 pills."),
    ("s04_newsletter", 18.0,  28.0, 1, "Feature 1 - the newsletter in a 3D browser frame: CFA Research Challenge, Student Council, Speech Day, the launch."),
    ("s05_forum",      28.0,  40.0, 1, "Feature 2 - Forum: the list; 'What is this, am I cooked?' is typed and posted in Year 1 Mathematical Methods; Nasser replies; easter egg."),
    ("s06_everything", 40.0,  58.0, 1, "Montage: library, lessons, Career Navigator (scrolls), the calendar that keeps track of everything, grades, search; cohorts network; 'Built by students.'"),
    ("s07_launch",     58.0,  64.0, 1, "'Launching today' + LAUNCH button + 3/2/1 countdown + click at 63.85."),
    ("g1_glitch",      64.0,  68.0, 2, "Glitch #1: freeze, corruption, error windows, static, black."),
    ("s08_birthday",   68.0,  84.5, 2, "4.4 s of darkness: a collar bell, two eyes, blinks. Lights on: Noor's cat in a party hat, 'Happy Birthday, Noor'."),
    ("g2_glitch",      84.5,  91.0, 3, "Glitch #2: song cut on the final 'you', scramble, terminal (expected Noor's birthday, found Teacher's Day), flash, black+silence."),
    ("s09_letter",     91.0,  99.0, 3, "Letter to the teachers, typed line by line over soft piano; riser into the drop."),
    ("s10_teachers_day", 99.0, 105.0, 3, "DROP: HAPPY TEACHER'S DAY, gold, particles; 'Yes, it was yesterday.'"),
    ("s11_numbers",    105.0, 125.0, 3, "'We study data. So we ran the numbers on you.' Four statistics jokes, one card each (4 s; the last one 6 s)."),
    ("s12_network",    125.0, 133.0, 3, "The three cohorts as one network; the ~160 dots gather into THANK YOU."),
    ("s13_finale",     133.0, 141.0, 3, "Happy Teacher's Day sign-off, institution logos, the cat says Meow, fade to black."),
]
S = {s[0].split("_")[0]: (s[1], s[2]) for s in SCENES}

# ------------------------------------------------------------ act 1 details
# The film opens on a browser with three portals open in tabs (the student's own MyClass, LSE VLE and
# UoL portal); `t` is when each tab is clicked. Then the notifications arrive on top.
TABS = [
    {"id": "myclass", "title": "MyClass", "t": 0.0},
    {"id": "lse-vle", "title": "LSE VLE", "t": 1.3},
    {"id": "uol", "title": "UoL portal", "t": 2.3},
]
# Where the notifications come from, in this order (pops[].src indexes this list). Emails come from
# UoL, LSE and BIBF (never from students); SMS is BIBF only; WhatsApp is a mix of BIBF and students.
SOURCES = ["Outlook", "Gmail", "SMS", "WhatsApp"]

# Notification pops, accelerating from 2.9 to the freeze at 8.0 (each gets an SFX ping).
rng = random.Random(2026)
pops = []
t, dt = 2.9, 0.42
while t < 7.95:
    pops.append({
        "t": round(t, 3),
        "tone": rng.randrange(4),            # which ping pitch-set (0..3)
        "pan": round(rng.uniform(-0.8, 0.8), 2),
        "x": round(rng.uniform(0.04, 0.80), 3),  # card position (fraction of W, left edge)
        "y": round(rng.uniform(0.06, 0.86), 3),  # (fraction of H, top edge)
        "rot": round(rng.uniform(-7, 7), 1),
    })
    dt = max(0.062, dt * 0.87)
    t += dt
# which place each pop comes from (WhatsApp is the noisiest)
rng_src = random.Random(7)
SRC_WEIGHTS = [4, 3, 2, 6]
for i, p in enumerate(pops):
    p["src"] = i if i < len(SOURCES) else rng_src.choices(range(len(SOURCES)), weights=SRC_WEIGHTS)[0]

CHAOS_CAPTIONS = [
    (TABS[1]["t"], "Another portal."),
    (3.0, "Another email."),          # the first email card lands at 2.9
    (5.2, "Another group chat."),
]
CHAOS_CAPTIONS_END = 6.8     # the last second before the freeze has no caption: just the pile
CHAOS_FREEZE = 8.0
CHAOS_CALM = "It’s overwhelming."
CHAOS_IMPLODE = [9.1, 10.0]

a4 = S["s04"][0]
NEWSLETTER = {
    "start": a4, "browser_in": a4 + 0.8,
    "callouts": [{"t": a4 + 2.0, "text": "What’s happening in DSBA"},
                 {"t": a4 + 3.4, "text": "CFA Research Challenge: BIBF is in"},
                 {"t": a4 + 4.62, "text": "DSBA nominees for Student Council"},
                 {"t": a4 + 5.62, "text": "Speech Day, recapped"}],
    "slides": [a4 + 2.95, a4 + 4.2, a4 + 5.3], "covers": a4 + 6.4, "read_time": a4 + 8.2,
    "title": "The Newsletter", "caption": "The news that matters to DSBA, in one read.",
}

a5 = S["s05"][0]
FORUM_TYPED_TEXT = "What is this, am I cooked? 💀"
typing_start, typing_end = a5 + 5.0, a5 + 6.8
char_dt = (typing_end - typing_start) / len(FORUM_TYPED_TEXT)   # len() counts code points (the skull is one)
forum_typing = [round(typing_start + i * char_dt, 3) for i in range(len(FORUM_TYPED_TEXT))]
# Easter egg upvote counter 23 -> 160 (ease-out), one tick per +1
EGG_T0, EGG_T1 = a5 + 10.2, a5 + 11.8
upvote_ticks = []
for i in range(1, 161):
    p = i / 160
    pt = 1 - (1 - p) ** 0.5
    upvote_ticks.append(round(EGG_T0 + (EGG_T1 - EGG_T0) * pt, 4))
FORUM = {
    "start": a5, "threads_in": a5 + 1.0, "composer_open": a5 + 4.6,
    "typed_text": FORUM_TYPED_TEXT, "typing": forum_typing,
    "post_click": a5 + 7.2, "post_appears": a5 + 7.3, "replies": [a5 + 7.8],   # only Nasser replies; his card holds ~4 s
    "reply_cards": [
        {"name": "Nasser", "flair": "not Student Council President",
         "text": "You’re cooked if you don’t know integration by parts. Just apply it and you’ll get the answer."},
    ],
    "easter_egg": {"start": EGG_T0, "end": EGG_T1, "votes": 160, "ticks": upvote_ticks},
}

# Montage of the rest of the Hub: cuts on bar / half-bar boundaries
a6 = S["s06"][0]
MONTAGE = [
    {"t": a6 + 0.0,  "id": "library",  "caption": "Every file, inside the app."},
    {"t": a6 + 2.0,  "id": "lessons",  "caption": "Every lecture, one click away."},
    {"t": a6 + 4.0,  "id": "career",   "caption": "Plan what comes next."},
    {"t": a6 + 8.0,  "id": "calendar", "caption": "Keep track of everything."},
    {"t": a6 + 10.0, "id": "grades",   "caption": "Your classification, live."},
    {"t": a6 + 11.5, "id": "search",   "caption": "Find anything."},
    {"t": a6 + 13.0, "id": "network",  "caption": "Three cohorts, finally connected."},
    {"t": a6 + 16.0, "id": "built_by", "caption": "Built by students. For all of DSBA."},
]
FILE_CLICK = a6 + 1.0
LESSON_PLAY = a6 + 2.9
CAREER_SCROLL = [a6 + 5.6, a6 + 6.5]      # the page scrolls from employers to skills and certificates
SEARCH_TYPED_TEXT = "econometrics"
search_typing = [round(a6 + 11.8 + i * 0.065, 3) for i in range(len(SEARCH_TYPED_TEXT))]

a7 = S["s07"][0]
LAUNCH = {"start": a7, "button_in": a7 + 1.0, "countdown": [a7 + 3.0, a7 + 4.0, a7 + 5.0], "click": a7 + 5.85}

# ------------------------------------------------------------- glitch maps
# 'segments' drive the raster post-processing intensity (0..1) and style.
# 'stutters' are shared A/V repeats: between start and end, BOTH audio and
# video repeat the source slice [src, src+len). Video rounds to whole frames.
# 'hits' are short spikes (both a visual spike and an SFX).
G1_T = S["g1"][0]
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

G2_T = BDAY_CUT   # 84.5
def g2(x):
    return round(G2_T + x, 4)
G2 = {
    "start": g2(0), "end": g2(6.5),
    "segments": [
        {"t0": g2(0.00), "t1": g2(1.00), "kind": "warp",       "i0": 0.30, "i1": 0.70},
        {"t0": g2(1.00), "t1": g2(4.10), "kind": "terminal",   "i0": 0.16, "i1": 0.24},
        {"t0": g2(4.10), "t1": g2(4.75), "kind": "crescendo",  "i0": 0.45, "i1": 1.00},
        {"t0": g2(4.75), "t1": g2(4.95), "kind": "flash",      "i0": 1.00, "i1": 1.00},
        {"t0": g2(4.95), "t1": g2(6.50), "kind": "black",      "i0": 0.00, "i1": 0.00},
    ],
    "stutters": [
        # the final "you" stutters: you-you-you-yo-y
        {"start": g2(0.18), "end": g2(0.70), "src": g2(0.0), "len": 0.18},
    ],
    "note_warp": {"t0": g2(0.0), "t1": g2(1.0)},          # the final note detunes + tape-stops
    "terminal_lines": [
        {"t": g2(1.05), "text": "> ERROR: celebration.target mismatch"},
        {"t": g2(1.85), "text": "> expected: Noor's birthday"},
        {"t": g2(2.55), "text": "> found: Teacher's Day"},       # then a beat for the room
        {"t": g2(3.45), "text": "> rerouting celebration..."},
    ],
    "silence": {"t0": g2(4.95), "t1": g2(6.5)},
    "crescendo": g2(4.10), "flash": g2(4.75),
}
G2["hits"] = [g2(0.0)] + [ln["t"] for ln in G2["terminal_lines"]] + [G2["flash"]]

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
LETTER_T = S["s09"][0]   # 91.0
LETTER_LINES = [
    {"t": LETTER_T + 0.10, "text": "Dear teachers,"},
    {"t": LETTER_T + 1.50, "text": "today, you thought you were in on the surprise."},
    {"t": LETTER_T + 4.50, "text": "plot twist:"},
    {"t": LETTER_T + 5.70, "text": "you were the surprise."},
]
LETTER_CPS = 26.0  # characters per second while typing
letter_typing = []
for line in LETTER_LINES:
    for i, _ in enumerate(line["text"]):
        letter_typing.append(round(line["t"] + i / LETTER_CPS, 4))

n0 = S["s11"][0]   # 105
NUMBERS = {
    "start": n0,
    "intro": [{"t": n0 + 0.15, "text": "We study data."}, {"t": n0 + 1.0, "text": "So we ran the numbers on you."}],
    "cards": [
        {"t": n0 + 2.0, "id": "exam",  "kicker": "Figure 1", "title": "Times we asked “Will this be in the exam?”",
         "build": n0 + 2.9, "punch_t": n0 + 4.0, "punch": "∞", "note": "…and counting.",
         "year1_note": "Year 1 just got here. Give them a week."},
        {"t": n0 + 6.0, "id": "h0",    "kicker": "Figure 2", "title": "H₀: you were only doing your job.",
         "build": n0 + 6.9, "punch_t": n0 + 8.0, "punch": "REJECTED", "note": "p < 0.0001"},
        {"t": n0 + 10.0, "id": "heart", "kicker": "Figure 3", "title": "Your patience vs. our questions",
         "build": n0 + 10.8, "punch_t": n0 + 12.0, "punch": "r = 1.00", "note": "A perfect fit."},
        {"t": n0 + 14.0, "id": "ci",    "kicker": "Figure 4", "title": "Confidence that we couldn’t have done it without you",
         "build": n0 + 14.9, "punch_t": n0 + 16.0, "punch": "100%",
         "note": "Disclaimer: I DO know this is not how confidence intervals work 😅", "len": 6.0},
    ],
    "card_len": 4.0,          # a card may carry its own "len"
    "end": S["s11"][1],
}
w0 = S["s12"][0]   # 125
NETWORK = {
    "start": w0,
    "nodes_in": w0 + 0.0, "links_in": w0 + 0.9,
    "lines": [{"t": w0 + 1.3, "text": "Every connection here started in one of your classes."}],
    "gather": w0 + 4.0, "formed": w0 + 5.5, "word": "THANK YOU",
    "end": S["s12"][1],
}
f0 = S["s13"][0]   # 133
FINALE = {
    "start": f0, "title": f0 + 0.2, "signoff": f0 + 1.6, "logos": f0 + 2.4, "cat": f0 + 3.8, "meow": f0 + 4.5,
    "title_text": "Happy Teacher’s Day",
    "signoff_text": "From all of us in DSBA · Years 1, 2 & 3",
    "hashtag": "#HappyTeachersDay",
    "meow_text": "Meow.",
    "fade": [DURATION - 1.4, DURATION],
}

# ----------------------------------------------------------- SFX cue list
sfx = []
def add(t, kind, **kw):
    sfx.append({"t": round(t, 4), "kind": kind, **kw})

# act 1
add(0.0, "drone_in")
for p in pops:
    add(p["t"], "notif_ping", tone=p["tone"], pan=p["pan"])
for t_, _ in CHAOS_CAPTIONS:
    add(t_, "soft_tick")
for tab in TABS[1:]:
    add(tab["t"], "ui_click")              # switching to the next portal tab
add(CHAOS_FREEZE, "hard_stop")              # music + everything cuts (tape-stop 0.25s)
add(CHAOS_IMPLODE[0], "reverse_riser", dur=round(CHAOS_IMPLODE[1] - CHAOS_IMPLODE[0], 3))  # sucks into the drop
add(ACT1_DROP, "impact_drop")
for t_ in (S["s04"][0], S["s05"][0], S["s06"][0], LAUNCH["start"]):
    add(t_ - 0.35, "whoosh", dur=0.6)
for t_ in forum_typing:
    add(t_, "key_click")
add(FORUM["post_click"], "ui_click")
add(FORUM["post_appears"], "post_pop")
for t_ in FORUM["replies"]:
    add(t_, "reply_pop")
for t_ in upvote_ticks[::4]:          # every 4th +1 gets a tick (40 ticks)
    add(t_, "upvote_tick")
add(EGG_T1, "counter_ding")
for m in MONTAGE[1:]:
    add(m["t"] - 0.12, "swish_small", dur=0.3)
add(FILE_CLICK, "ui_click")           # file opens
add(LESSON_PLAY, "ui_click")          # lesson play
add(CAREER_SCROLL[0], "swish_small", dur=0.5)
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
# act 2: the long dark beat: a collar bell, two eyes that look around and blink, a second bell
BDAY_BELLS = [BDAY_START + 0.3, BDAY_START + 3.1]
BDAY_EYES_IN = BDAY_START + 0.45
BDAY_LOOKS = [{"t": BDAY_START + 1.0, "x": -1}, {"t": BDAY_START + 1.6, "x": 1}, {"t": BDAY_START + 2.2, "x": 0}]
BDAY_BLINKS = [BDAY_START + 2.7, BDAY_START + 3.5, BDAY_START + 3.8]   # one slow blink, then a quick double
BDAY_WIDEN = BDAY_START + 4.1                                           # eyes go wide just before the lights
for t_ in BDAY_BELLS:
    add(t_, "bell_jingle")
for t_ in BDAY_BLINKS:
    add(t_, "blink_tick")
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
add(FINALE["cat"], "bell_jingle")     # the cat again
add(FINALE["meow"], "reply_pop")      # her speech bubble
sfx.sort(key=lambda e: e["t"])

cues = {
    "fps": FPS, "width": W, "height": H, "duration": DURATION,
    "frames": int(round(DURATION * FPS)),
    "tempo": {
        "act1": {"bpm": ACT1_BPM, "first_beat": 0.0, "drop": ACT1_DROP, "end": ACT1_END,
                  "chords": ["Am", "F", "C", "G"], "bar_seconds": 2.0},
        "birthday": {"bpm": BDAY_BPM, "pickup": BDAY_PICKUP, "beat_seconds": round(bday_beat, 6),
                      "cut": BDAY_CUT, "key": "C major", "time_signature": "3/4", "phrases": BDAY_PHRASES},
        "reveal": {"bpm": REVEAL_BPM, "piano_start": PIANO_START, "drop": REVEAL_DROP,
                    "chords": ["D", "A", "Bm", "G"], "bar_seconds": 2.0,
                    "sections": {"title": list(S["s10"]), "numbers": list(S["s11"]), "network": list(S["s12"]), "finale": list(S["s13"])},
                    "climax": NETWORK["formed"], "final_chord": f0 + 4.0, "end": DURATION},
    },
    "scenes": [{"id": s[0], "start": s[1], "end": s[2], "act": s[3], "desc": s[4]} for s in SCENES],
    "chaos": {"tabs": TABS, "sources": SOURCES, "pops": pops, "captions": [{"t": a, "text": b} for a, b in CHAOS_CAPTIONS],
              "captions_end": CHAOS_CAPTIONS_END,
              "freeze": CHAOS_FREEZE, "calm": CHAOS_CALM, "implode": CHAOS_IMPLODE},
    "logo": {"intro": ACT1_DROP, "drop": ACT1_DROP, "tagline": ACT1_DROP + 2.0, "subline": ACT1_DROP + 3.1,
             "pills": ACT1_DROP + 4.0, "pill_step": 0.42,
             "label": "Introducing the new", "wordmark": "DSBA Hub",
             "tagline_text": "Here to help you through it.",
             "subline_text": "Notes, lessons, answers and opportunities, from students who’ve been there.",
             "pills_text": ["Newsletter", "Forum", "Library", "Lessons", "Career Navigator"]},
    "newsletter": NEWSLETTER,
    "forum": FORUM,
    "montage": {"start": S["s06"][0], "end": S["s06"][1], "cuts": MONTAGE,
                "file_preview_click": FILE_CLICK, "lesson_play_click": LESSON_PLAY, "career_scroll": CAREER_SCROLL,
                "search_text": SEARCH_TYPED_TEXT, "search_typing": search_typing},
    "launch": LAUNCH,
    "g1": G1,
    "birthday": {"start": BDAY_START, "bell": BDAY_BELLS[0], "bells": BDAY_BELLS, "eyes_in": BDAY_EYES_IN,
                 "looks": BDAY_LOOKS, "blinks": BDAY_BLINKS, "widen": BDAY_WIDEN,
                 "lights_on": BDAY_LIGHTS,
                 "title_in": BDAY_LIGHTS + 0.2, "lower_third": BDAY_LIGHTS + 1.8, "phrases": BDAY_PHRASES, "cut": BDAY_CUT,
                 "name": "Noor",
                 "melody": [
                     {"t": round(BDAY_PICKUP + b * bday_beat, 4), "dur": round(d * bday_beat, 4), "midi": m, "syl": s}
                     for (b, d, m, s) in BDAY_MELODY]},
    "g2": {**G2, "terminal_typing": terminal_typing, "terminal_cps": TERMINAL_CPS},
    "letter": {"start": LETTER_T, "lines": LETTER_LINES, "cps": LETTER_CPS, "typing": letter_typing,
               "dissolve": LETTER_T + 7.4, "flash": LETTER_T + 7.84},
    "teachers_day": {"drop": REVEAL_DROP, "subline": REVEAL_DROP + 2.0,
                     "subline_text": "Yes, it was yesterday. We needed a day to fool you.", "end": S["s10"][1]},
    "numbers": NUMBERS,
    "network": NETWORK,
    "finale": FINALE,
    "outro": {"fade": FINALE["fade"]},
    "sfx": sfx,
}

def rounded(o):
    """Round every float so offsets like 28 + 4.2 don't print as 32.199999."""
    if isinstance(o, float):
        return round(o, 4)
    if isinstance(o, list):
        return [rounded(x) for x in o]
    if isinstance(o, dict):
        return {k: rounded(v) for k, v in o.items()}
    return o

out = Path(__file__).resolve().parent.parent / "cues.json"
out.write_text(json.dumps(rounded(cues), indent=1, ensure_ascii=False))
kinds = sorted({e["kind"] for e in sfx})
print(f"wrote {out}: {DURATION}s, {len(pops)} pops, {len(sfx)} sfx cues, birthday cut at {BDAY_CUT}s")
print("sfx kinds:", ", ".join(kinds))
