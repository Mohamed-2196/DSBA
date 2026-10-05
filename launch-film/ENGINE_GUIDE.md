# Film engine guide (read this before touching a scene)

The film is ONE web page (`src/index.html`) rendered frame by frame by headless Chromium.
1920×1080, 30 fps, 259.0 s (7770 frames) in cut 8, of which 120 s are the birthday hold. Every frame must be a pure function of the film time `t`.

## Files
- `tools/make_cues.py` → `cues.json`: the single source of truth for timing and on-screen copy.
  **Do not edit either** (the director owns them). Read times and text from `cues` instead of
  hard-coding them. If you need a time that is not there, derive it from a cue (`cue + 0.4`).
- `config.json`: names (`config.admin.name` = "Noor", `config.product.name` = "DSBA Hub").
- `src/main.js`: loads cues/config, builds each act inside try/catch, exposes `window.__film.seek(t)`.
  `?only=2` (or `?only=3`, `?only=2,3`) builds just those acts.
- `src/lib.js`: helpers (below). `src/net.js`: the shared cohort network (160 student dots).
- `src/act1.js` + `src/film.css`: Act 1 and glitch 1 (0–86). `src/act2.js` + `src/act2.css`: Act 2, its hold and glitch 2 (86–229).
  `src/act3.js` + `src/act3.css`: Act 3 (229–259). Scene times always come from `cues.scenes` via `S('s08')`; never hard-code them. One owner per act; stay in your files.
- `assets/`: images (`assets/ui/*.png` are app screenshots, `assets/cat/` is Noor's cat, `assets/noora/` Mini Noora's
  sprites: full-body poses on one 680×784 canvas with half-size twins in `sm/`, busts on a 600×600 one).
  Reference assets from scenes as `../assets/...`. Brand logos: `/dsba/public/brand/{bibf-white,bibf,uol,myclass-white,myclass}.png`.

## How a scene is built
```js
import { W, H, el, chars, onFrame, scene, typeText, mulberry, clamp, lerp, prog, ease, track, logoTile, hubMarkSvg } from './lib.js';
export function buildAct2({ tl, cues, config, stage, S }) {
  const { start, end } = S('s08');                  // scene times by id prefix, from cues.scenes
  const root = scene(stage, 's08', start, end, 'bday');   // <section class="scene bday">, visible only in [start, end)
  root.innerHTML = `...`;
  tl.from(node, { y: 80, opacity: 0, duration: 0.5, ease: 'power4.out' }, cues.birthday.title_in);  // GSAP at absolute film time
  onFrame((t) => { if (t < start || t >= end) return; /* anything procedural: canvas, counters, parallax */ });
}
```
- `tl` is one paused GSAP timeline; positions are absolute film seconds. GSAP 3 core only (no plugins).
- `onFrame(fn)` runs after every seek with the film time. Use it for canvas drawing, typed text,
  number counters, camera moves (`track([{t, v:{...}, e?, cut?}])` gives keyframed values).
- `scene()` roots are shown/hidden by the engine. Inside a scene, hide/show children with
  `visibility: 'inherit' | 'hidden'` (never `'visible'`, it would show through a hidden scene).

## Rules that have bitten us before
1. **Deterministic.** No `Math.random()`, `Date.now()`, CSS animations/transitions, `requestAnimationFrame`,
   videos or GIFs. Use `mulberry(seed)` for randomness and compute motion from `t`.
   Frames are rendered in order by two workers, each seeking forward only, starting anywhere, so a
   frame must not depend on earlier frames (no accumulated state in `onFrame`; recompute from `t`).
2. **GSAP `from`/`fromTo` render immediately at build time.** Use at most one `from` per element+property;
   later tweens on the same property use `to`, or pass `immediateRender: false`. `tl.set` is fine.
   **One writer per property.** Never drive the same property of the same element from both the timeline and an
   `onFrame` write: the tween captures its start value from whatever the last frame left there. Anything that follows
   a path (a cursor carrying something, a dragged card) is computed from `t` in one `onFrame`; the timeline keeps the
   one-off entrances and exits. The same goes for measurements: read sizes inside `onFrame`, never cache one taken at
   build time (the fonts are not loaded yet). `node tools/seekcheck.mjs --times …` proves a scene is seek-order-proof.
   **The hold repeats.** From `cues.birthday.hold.loop_start` the birthday scene's ambient clock wraps every `loop`
   seconds, so anything added to the hold must be a function of that clock (and must not happen in a pass's last
   `xfade` seconds, which are cross-faded into the frames before the loop's start).
3. `chars(node)` splits text into inline-block spans (`.ch`) for staggered reveals.
4. `typeText(node, text, t0, cps, { caret })` types text as a pure function of time.
5. Canvas: a `<canvas width="1920" height="1080">` cleared and redrawn in `onFrame`. Keep particle counts
   sane (≤ ~600 drawn per frame); frames render at ~3–4 fps on this machine.
6. Images must be in the DOM at build time (`img.decoding = 'sync'`); the renderer waits for them.
7. No strobing: never flip the whole frame bright/dark more than 3 times a second.
8. Text safe area: keep copy 96 px from the edges. Minimum body size on screen 34 px; it is shown on a projector.
9. Fonts: 'Schibsted' (sans, 400–900), 'Newsreader' (serif + italic, 200–800), 'JBMono' (500/700),
   'Playfair' (600, 800, italic 700), 'Caveat' (700). Nothing else is installed; emoji render in colour.
10. Palette (CSS vars in film.css): `--bg #040a1c`, `--navy #081433`, `--cobalt #1558f0`, `--cobalt-2 #6fa2ff`,
    `--hl #ffe14a` (highlighter), `--gold #f5c86b`, `--gold-2 #ffd98a`, `--gold-3 #b8862b`,
    cohorts `--y1 #3bc9db`, `--y2 #5e9bff`, `--y3 #ffa94d`. The film is blue; gold belongs to Act 3 (and the birthday's foil).

## Rendering review frames (do this, look at the result, iterate)
The static server is already running (`http://127.0.0.1:5180/launch-video/src/index.html`). Do not restart it.
```bash
cd /home/claude/launch-video
node tools/frames.mjs --workers 1 --out out/review_act2 --url "http://127.0.0.1:5180/launch-video/src/index.html?only=2" --times 68.2,68.9,72.5,76.5
python3 tools/sheet.py out/review_act2 out/review_act2/sheet 3      # contact sheets → out/review_act2/sheet_1.png …
```
`[pageerror]`/`[console]` lines printed by frames.mjs are JavaScript errors in the page: fix them.
Read the sheet PNGs to check your work; open single full-size frames (`t_072.50.png`) when detail matters.
Delete old stills in your review folder before re-rendering a new set (the sheet tool picks up every `t_*.png`).
Use your own review folder (`out/review_act2`, `out/review_act3`) and never write to `out/frames`.
Be economical: a dozen or two well-chosen stills per pass, not hundreds.

## Housekeeping
- Other people are working in this project and in /home/claude/dsba at the same time. Touch only your files.
- No git commands that change state (no add/commit/stash/checkout/reset). No `pkill -f`.
- The machine has 2 CPUs: don't run long renders in the background while you think.
