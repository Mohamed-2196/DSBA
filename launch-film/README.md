# DSBA Hub launch film

A 5 min 9 s film for the DSBA event on Tuesday 6 October 2026 (2 min 39 s of film, plus a 150 s hold on the
birthday screen that leaves the room to the room). It opens as a product-launch film
for the new DSBA Hub, "crashes" into a surprise birthday for Noor (the programme admin) starring her
cat, then crashes again into the real reason for the event: Teacher's Day.

| time | what happens |
|---|---|
| 0:00–0:10 | A browser with three portals open in tabs (MyClass, LSE VLE, UoL portal); then emails from UoL, LSE and BIBF, BIBF texts and WhatsApp groups pile up on top: "It's overwhelming." |
| 0:10–0:40 | DSBA Hub, "Here to help you through it."; newsletter; forum (the "am I cooked?" thread and Nasser's reply) |
| 0:40–0:58 | Mini Noora, the Hub's mascot and chatbot: she is picked up and put down somewhere else, a click opens her chat, a photo of a distribution-theory question (the Laplace distribution) is dropped in with "How do I find the MGF?", and she writes out the working in three steps, then the chapter and where to look |
| 0:58–1:22 | library, lessons, Career Navigator, the calendar that keeps track of everything, grades, search, the cohort network, 3-2-1 |
| 1:22–1:26 | Glitch 1: the launch crashes, error windows |
| 1:26–1:42 | 4.4 s of darkness, a collar bell, two eyes that look around and blink; lights on (1:30): Noor's cat in a party hat, "Happy Birthday, Noor", the song |
| 1:42–4:12 | The hold: the song ends on its last chord and the greeting stays up, quiet, for 150 s. The cat comes to rest, breathes and blinks, the foil glints, a stray piece of confetti drifts down |
| 4:12–4:19 | Glitch 2, out of the silence: the greeting breaks; terminal: expected Noor's birthday, found Teacher's Day; 1.5 s of silence |
| 4:19–4:27 | A letter to the teachers, typed line by line |
| 4:27–5:09 | Happy Teacher's Day; "we ran the numbers" (four statistics jokes); the network becomes THANK YOU; sign-off; the cat says "Meow." |

## Supplied artwork
`tools/intake_brand.py` places what the student rep supplied: his DSBA wordmark (blue and white twins plus a
square tile cut from its "D"), the newsletter cover illustration, the official Outlook, Gmail, LSE and
WhatsApp logos for the opening (`assets/logos/`), and his own screenshots of the three portals for the
opening's browser tabs (`assets/portals/`; teachers' names and his student number are blurred there). The film never draws or imitates a third-party logo: without
a file, a notification falls back to a neutral glyph (SMS has no file on purpose).
The Career Navigator's employer and certificate logos live in the app (`public/logos/`, see its README).
Mini Noora is the sprite sheet he supplied (the second one, with the clearer BIBF badge): `tools/noora/cut_sprites.py`
cut it into the app's `public/noora/` (17 poses on normalised canvases; the badge's letters are kept as the sheet
has them rather than as the enlarger would redraw them), and `tools/noora/from_app.py` copies those into
`assets/noora/` for the film, with half-size twins for the small mascot. The sheet has a checkerboard baked in, a pale
fringe along her outline and a pale glow round every mark beside her (wave lines, star, dashes, anger mark); the
script takes all three out, and gives the marks their own colour-keyed cut-out. After a re-cut, look at every
sprite on a dark and on a saturated background before using it: leftovers do not show on white.

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
- `tools/frames.mjs` renders the PNG frames with headless Chromium. The cut has 9270; 4770 are rendered, because the
  hold is `pre` seconds played once and then one `loop`-second pass played `loops` times (`cues.birthday.hold`).
  `tools/hold_loop.py` cross-fades the end of that pass into the frames before its start, so it repeats without a seam.
- `tools/seekcheck.mjs --times a,b,c` renders the same times in a different seek order and compares the
  screenshots: run it after changing a scene, before a full render (two workers render the frames,
  each starting somewhere else, so a frame must not depend on the frames before it).
- `tools/glitch_post.py` adds the video-signal corruption to the two glitch windows and encodes H.264.
  It keeps large flashes to at most 3 per second (photosensitivity guard).
- The film is encoded in stretches cut at scene starts (`tools/seg_encode.sh`, `out/seg/`) and joined without
  re-encoding by `tools/assemble.py`, which also checks that every frame is there once and muxes the sound.
  A change to one scene costs that scene: render its frames, encode its stretch, assemble again
  (`python3 tools/assemble.py --list` prints the stretches). The hold's loop is one file listed twelve times.
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
(`tools/noora/cut_sprites.py` is only needed to re-cut the sprite sheet: it also wants `pip install ncnn`
and the two `realesrgan-x4plus-anime` model files from the Real-ESRGAN ncnn release in `tools/noora/models/`.
It keeps the enlarged cells in `tools/noora/work/`, so a second run takes seconds.)
Not committed: build outputs (`out/`, `assets/ui/`), the YouTube thumbnails and lecture frames used in
the lessons beat (`assets/yt/`, fetched from YouTube in a browser) and the cat photo and its
derivatives (`assets/cat/`). Without `assets/yt/` the lesson posters fall back to the designed
version; without `assets/cat/` Act 2 cannot be rendered.
The chat-sized copy is a two-pass x264 encode sized to stay just under 30 MB.
