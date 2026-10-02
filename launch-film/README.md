# DSBA Hub launch film

A 2 min 20 s film for the DSBA event on Tuesday 6 October 2026. It opens as a product-launch film
for the new DSBA Hub, "crashes" into a surprise birthday for Noor (the programme admin) starring her
cat, then crashes again into the real reason for the event: Teacher's Day.

| time | what happens |
|---|---|
| 0:00–1:08 | Launch film: seven places to check, the logo, newsletter, forum, library, lessons, Career Navigator, calendar, grades, search, the cohort network, 3-2-1 |
| 1:08–1:12 | Glitch 1: the launch crashes, error windows |
| 1:12–1:25 | Darkness, a collar bell, two eyes; lights on: Noor's cat in a party hat, "Happy Birthday, Noor" |
| 1:25–1:31 | Glitch 2: the song is cut on the last "you"; terminal: expected Noor, found everyone who taught us; 1.5 s of silence |
| 1:31–1:40 | A letter to the teachers, typed line by line |
| 1:40–2:20 | Happy Teacher's Day; "we ran the numbers" (four statistics jokes); the network becomes THANK YOU; sign-off and the cat's P.S. |

## Change names and copy
- `config.json`: the admin's name and the cat's title.
- `tools/make_cues.py`: every on-screen line and every time. Re-run it to regenerate `cues.json`,
  then rebuild audio and frames. Do not edit `cues.json` by hand.

## How it is built
- `tools/make_cues.py` writes `cues.json`, the one timeline every part reads.
- `src/` is the film itself: one HTML page animated with GSAP that can be set to any time
  (`window.__film.seek(t)`). `act1.js` (launch), `act2.js` (birthday), `act3.js` (Teacher's Day).
  Open `src/index.html?play` to watch it live; `?only=2` builds a single act. See `ENGINE_GUIDE.md`.
- `tools/capture-ui.mjs` screenshots the real app (clock frozen at the event date) into `assets/ui/`.
- `tools/cat/` cuts the cat out of the photo and composites the party hat (`assets/cat/`).
- `tools/frames.mjs` renders 4200 PNG frames with headless Chromium.
- `tools/glitch_post.py` adds the video-signal corruption to the two glitch windows and encodes H.264.
  It keeps large flashes to at most 3 per second (photosensitivity guard).
- `tools/audio/build_audio.py` synthesises the soundtrack and sound effects from the same cues.
- `tools/build.sh` runs all of it.

## Rebuild from a fresh checkout
The scripts use absolute paths from the machine they were written on: the repo at `/home/claude/dsba`,
this folder copied to `/home/claude/launch-video`, both served from `/home/claude`.
```
cp -r /home/claude/dsba/launch-film /home/claude/launch-video && cd /home/claude/launch-video && npm install
(cd /home/claude/dsba && npm ci && npx vite --port 5173 --host 127.0.0.1 &)     # the app, for UI captures
(cd /home/claude && python3 -m http.server 5180 --bind 127.0.0.1 &)             # serves the film page
tools/build.sh                                                                   # about an hour on 2 CPUs
```
Needs Node 22, Playwright with Chromium, Python 3 with numpy, scipy, OpenCV and Pillow, and ffmpeg.
Not committed: build outputs (`out/`, `assets/ui/`), the YouTube thumbnails and lecture frames used in
the lessons beat (`assets/yt/`, fetched from YouTube in a browser) and the cat photo and its
derivatives (`assets/cat/`). Without `assets/yt/` the lesson posters fall back to the designed
version; without `assets/cat/` Act 2 cannot be rendered.
The chat-sized copy is a two-pass x264 encode sized to stay just under 30 MB.
