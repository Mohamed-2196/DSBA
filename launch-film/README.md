# DSBA Pulse launch film

A 2-minute film for the DSBA launch event on Tuesday 6 October 2026. It opens as a product-launch
film for DSBA Pulse, "crashes" into a fake birthday card for the programme admin, then crashes
again into the real reason for the event: a Teacher's Day thank-you to the 17 tutors.

| time | what happens |
|---|---|
| 0:00–1:04 | Launch film: the problem, the logo, newsletter, forum, library, lessons, calendar, grades, search, 3-2-1 |
| 1:04–1:08 | Glitch 1: the launch crashes, error windows |
| 1:08–1:20 | "Happy birthday" card with a music-box song (people sing along) |
| 1:20–1:26 | Glitch 2: the song is cut on the last "you"; terminal: expected admin, found 17 tutors; 1.5 s of silence |
| 1:26–1:35 | A letter to the tutors, typed line by line |
| 1:35–2:00 | Happy Teacher's Day, the 17 names on the beat, thank you |

## Change the names
Edit `config.json` (admin's name and the 17 tutors), then rebuild. Nothing else holds a name.

## How it is built
- `tools/make_cues.py` writes `cues.json`, the one timeline every part reads.
- `src/` is the film itself: one HTML page animated with GSAP that can be set to any time
  (`window.__film.seek(t)`). Open `src/index.html?play` to watch it live.
- `tools/capture-ui.mjs` screenshots the real app (clock frozen at the event date) into `assets/ui/`.
- `tools/frames.mjs` renders 3600 PNG frames with headless Chromium.
- `tools/glitch_post.py` adds the video-signal corruption to the two glitch windows and encodes H.264.
  It keeps large flashes to at most 3 per second (photosensitivity guard).
- `tools/audio/build_audio.py` synthesises the soundtrack and sound effects from the same cues.
- `tools/build.sh` runs all of it.

The scripts use absolute paths from the machine they were written on (`/home/claude/...`); adjust them
if you rebuild elsewhere. Build outputs (`out/`, `assets/ui/`) are not committed.
