// Act 2 — the fake birthday for Noor (scene s08) and the DOM side of glitch #2 (g2). Every time comes from
// cues.birthday / cues.g2 / cues.tempo.birthday: there are no film times in this file.
//
// A surprise party photographed at night. First the dark beat: a collar bell, two eyes that open, look left,
// right and back, blink slowly, hear the bell again, blink twice and go wide. Then the lights come up on Noor's
// cat in a party hat (a real photograph, see tools/cat/), gold foil confetti with depth of field, golden bokeh,
// and the greeting set in gold and cream on the side the cat is looking at.
// The song is ONE locked-off framing from lights-on to the cut: no push-in, no closer shot. The life is inside
// the frame: the cat sways with the waltz and blinks, her hat bobbles on the beat, a soft puff of confetti and a
// glint on the foil mark each phrase.
// With a hold (cues.birthday.hold) the song then ends on its last chord and the greeting simply stays up: she
// comes to rest, breathes, blinks now and then, the foil glints, a stray piece of confetti drifts down.
// At cues.g2.start the party freezes, the greeting breaks, and a terminal takes the screen.
//
// Everything is a pure function of the film time: no tweens, no state carried between frames.
//
// Why the whole picture, type included, is painted on ONE canvas (only the terminal is DOM):
//  · headless Chromium snaps DOM text to whole pixels vertically, so type under a slow push-in hops a pixel at
//    a time. Here the type is set on its own 2x canvas and resampled, so it creeps as smoothly as the photograph;
//  · every extra full-frame layer, CSS blur or blend mode costs more capture time than the drawing itself;
//  · CSS and canvas gradients are dithered, and that noise doubles the size of each frame's PNG. Large soft
//    shapes are therefore images (assets/cat/backdrop.png, vignette.png) or sprites filled pixel by pixel.
import { W, H, onFrame, scene, typeText, mulberry, clamp, lerp, prog, ease } from './lib.js';

const CAT = '../assets/cat';
/** `?bd=type` paints the type alone on black (used by tools/cat/type_jitter.mjs to check that it moves smoothly). */
const TYPE_ONLY = new URLSearchParams(globalThis.location ? globalThis.location.search : '').get('bd') === 'type';
const GLYPH = '█▓▒░#@$%&?!<>/\\';
const TAU = Math.PI * 2;

const expoOut = (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p));
const smooth = (p) => p * p * (3 - 2 * p);
const ss = (a, b, v) => smooth(clamp((v - a) / (b - a)));
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const loadImage = (src) => { const im = new Image(); im.decoding = 'sync'; im.src = src; return im.decode().then(() => im, () => im); };
const offscreen = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
/** A square sprite filled pixel by pixel from a radial alpha profile (no gradient = no dithering). */
function sprite(rgb, profile, N = 192) {
  const c = offscreen(N, N);
  const x = c.getContext('2d');
  const id = x.createImageData(N, N);
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const r = Math.hypot(i + 0.5 - N / 2, j + 0.5 - N / 2) / (N / 2);
      const o = (j * N + i) * 4;
      id.data[o] = rgb[0]; id.data[o + 1] = rgb[1]; id.data[o + 2] = rgb[2];
      id.data[o + 3] = Math.round(255 * clamp(profile(r)));
    }
  }
  x.putImageData(id, 0, 0);
  return c;
}
/** CSS-style linear-gradient(<deg>) across the box (x, y, w, h). */
function cssGradient(c, deg, x, y, w, h) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(h * dy);
  const cx = x + w / 2;
  const cy = y + h / 2;
  return c.createLinearGradient(cx - (dx * len) / 2, cy - (dy * len) / 2, cx + (dx * len) / 2, cy + (dy * len) / 2);
}

export async function buildAct2({ cues, config, stage, S }) {
  const B = cues.birthday;
  const G = cues.g2;
  const { start } = S('s08');
  const CUT = G.start;                       // glitch #2 takes the picture here: the party freezes
  // The song ends on its last downbeat, B.cut. Without a hold that is also where the glitch hits. With one the
  // greeting stays up from there to the glitch: `pre` seconds played once (the last chord rings out, the party
  // settles), then a `loop`-second stretch that repeats: the ambient clock wraps, and tools/hold_loop.py
  // cross-fades the end of each pass into the frames before its start, so the film shows no seam. During the
  // glitch the picture is frozen as it was at the start of the loop: the state the last pass has faded back to.
  const SONG = B.cut;
  const HOLD = B.hold || null;
  const LOOP0 = HOLD ? HOLD.loop_start : CUT;
  const LOOP = HOLD ? HOLD.loop : 0;
  const ambient = (t) => (HOLD && t >= LOOP0 + LOOP ? LOOP0 + ((t - LOOP0) % LOOP) : t);
  const FROZEN = HOLD ? LOOP0 : CUT;
  const END = G.flash + 0.2;                 // the frame is black from here (raster pass + Act 3 take over)
  const LIGHTS = B.lights_on;
  const root = scene(stage, 's08', start, END, 'bday');

  // ── timing derived from the melody ──────────────────────────────────────────────────────────
  const PH = B.phrases;
  const notesOf = (i) => B.melody.filter((n) => n.t >= PH[i] - 1e-3 && (i === PH.length - 1 || n.t < PH[i + 1] - 1e-3));
  const last = (a) => a[a.length - 1];
  const NAME_T = (notesOf(2)[5] || notesOf(2)[4]).t;   // "... dear NOOR": the name's moment
  const BEAT = (PH[1] - PH[0]) / 6;          // a phrase is two bars of three: a waltz
  const BAR = 3 * BEAT;
  const DOWN = PH[0] + BEAT;                 // the first downbeat ("BIRTH-day"); "Hap-py" is the pickup
  const T0 = B.title_in;
  const T3 = B.lower_third;

  const [meta, eyesImg, catImg, bgImg, vigImg] = await Promise.all([
    fetch(`${CAT}/cat.json`).then((r) => r.json()),
    loadImage(`${CAT}/cat-eyes.png`), loadImage(`${CAT}/cat-scene.png`), loadImage(`${CAT}/backdrop.png`), loadImage(`${CAT}/vignette.png`),
    document.fonts.load("italic 400 60px 'Newsreader'"), document.fonts.load("800 60px 'Playfair'"), document.fonts.load("700 34px 'Schibsted'"),
  ]);

  root.innerHTML = `<canvas class="bd-world" width="${W}" height="${H}"></canvas>
    <div class="term"><div class="term__head">celebrationd 2.0 — /dev/projector</div><p class="bad"></p><p></p><p class="warn"></p><p></p><p class="pb"></p></div>`;
  const ctx = root.querySelector('.bd-world').getContext('2d');
  // Soft things (room, lights, blurred foreground, glows) are resampled with plain bilinear filtering, which costs a
  // third of 'high'; only the photograph and the type, where sharpness shows, get the better filter.
  ctx.imageSmoothingQuality = 'low';

  // ── the cat in the frame ────────────────────────────────────────────────────────────────────
  // The photo is cropped at its right and bottom edges, so the cat sits against the right edge of the frame,
  // hat tip 60 px under the top edge. Canvas pixel (u, v) of the cat lands on frame pixel CAT + CAT_S * (u, v).
  const CAT_S = 0.66;
  const CAT_X = W + 2 - meta.canvas.w * CAT_S;
  const CAT_Y = 60 - (meta.hat.y0 - 3) * CAT_S;
  const catPt = (u, v) => ({ x: CAT_X + u * CAT_S, y: CAT_Y + v * CAT_S });
  const [eyeA, eyeB] = meta.eyes;
  // what is seen before the lights come on (the bell, the two eyes) is painted on a small canvas in cat pixels
  const DARK = { x0: 240, y0: 580, w: 660, h: 1200 };
  const cDark = offscreen(DARK.w, DARK.h).getContext('2d');
  const EYE_TINT = { amber: '255, 176, 64', blue: '120, 170, 255' };
  // Per eye: where its pupil sits in the photograph (off the centre of the outline, more so in the far eye, which
  // is seen from the side), how far the pupil travels in a glance (cat pixels), how much of the head's move the
  // eye takes (the far eye a little less: the head turns), and how its lids close.
  // `iris` is the part of the eye that travels: an ellipse about the pupil (in outline radii) that takes in the
  // pupil, its catchlight and the inner iris, but not the bright rim of the eye, which stays where it is.
  // The far eye is seen almost edge-on and its pupil fills it, so there the pupil barely travels; instead the eye
  // itself narrows as the head turns away and opens as it turns back towards us (`turn`).
  const EYE_ACT = {
    amber: { px: 452, py: 748, look: [4, 3], follow: 0.85, drop: 0, iris: [0.9, 0.86], turn: 0.2 },
    blue: { px: 652, py: 862, look: [14, 9], follow: 1, drop: 0.34, iris: [0.94, 0.94], turn: 0 },
  };
  const EYES = [eyeA, eyeB].map((e) => {
    const half = Math.ceil(Math.max(e.rx, e.ry) * 1.3) + 24;     // the square of the photograph this eye is taken from
    const o = { ...e, ...(EYE_ACT[e.id] || { px: e.cx, py: e.cy, look: [10, 6], follow: 1, drop: 0, iris: [0.9, 0.9], turn: 0 }), a: (e.angle * Math.PI) / 180,
      sx: Math.round(e.cx) - half, sy: Math.round(e.cy) - half, sw: half * 2, tint: EYE_TINT[e.id] || '255, 220, 160' };
    // the travelling part, cut out once through a soft elliptical mask
    o.pupil = offscreen(o.sw, o.sw);
    const c = o.pupil.getContext('2d');
    c.drawImage(eyesImg, o.sx, o.sy, o.sw, o.sw, 0, 0, o.sw, o.sw);
    c.globalCompositeOperation = 'destination-in';
    c.translate(o.px - o.sx, o.py - o.sy); c.rotate(o.a); c.scale(e.rx * o.iris[0], e.ry * o.iris[1]);
    const m = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.86, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m;
    c.fillRect(-2, -2, 4, 4);
    return o;
  });
  const cEye = offscreen(Math.max(...EYES.map((e) => e.sw)), Math.max(...EYES.map((e) => e.sw))).getContext('2d');

  // ── camera: locked off ──────────────────────────────────────────────────────────────────────
  // One steady framing from lights-on to the cut. (Cut 2 pushed in slowly and cut to a closer shot on the long
  // note of phrase two; in the room that read as a random zoom, so both are gone.) Every layer of the world is
  // therefore drawn through the same identity transform; the depth is in the focus and the overlap, not in a move.
  const FIXED = { s: 1, x: 0, y: 0 };

  // ── bokeh: golden out-of-focus lights hanging in the dark ───────────────────────────────────
  const discP = (r) => (0.60 + 0.16 * ss(0.62, 0.94, r)) * (1 - ss(0.90, 1.0, r));      // a lens disc: even, a touch brighter at the rim
  const beadP = (r) => Math.exp(-((r / 0.40) ** 2)) + 0.20 * (1 - Math.min(1, r)) ** 2;   // a bulb just out of focus
  const discs = [[245, 200, 107], [255, 178, 84], [255, 222, 160], [232, 148, 58]].map((c) => sprite(c, discP));
  const beadSprite = sprite([255, 216, 146], beadP);
  const rb = mulberry(7208);
  const bokeh = [];
  const addLight = (x, y, r, a, o = {}) => bokeh.push({
    x, y, r, a, img: discs[Math.floor(rb() * 4)], ax: 6 + rb() * 20, ay: 4 + rb() * 12, fx: 0.25 + rb() * 0.35, fy: 0.2 + rb() * 0.3,
    ph: rb() * TAU, tf: 0.7 + rb() * 1.6, tp: rb() * TAU, on: LIGHTS + 0.02 + rb() * 0.42, ...o,
  });
  const scatter = (n, r0, r1, a0, a1, rightShare, ySpan, yPow) => {
    for (let i = 0; i < n; i += 1) {
      const x = rb() < rightShare ? 900 + rb() * 1140 : -80 + rb() * 1000;
      addLight(x, -60 + rb() ** yPow * ySpan, r0 + rb() * (r1 - r0), a0 + rb() * (a1 - a0));
    }
  };
  scatter(11, 84, 132, 0.06, 0.12, 0.78, 760, 1.2);     // far practicals: big, faint
  scatter(26, 34, 62, 0.11, 0.26, 0.62, 940, 1.35);     // the middle of the room
  scatter(9, 18, 30, 0.16, 0.32, 0.55, 980, 1.1);       // nearer focus: small
  // two swags of fairy lights across the top of the room: small bright beads on a sagging line
  const swag = (x0, y0, x1, y1, sag, n, r0) => {
    for (let i = 0; i < n; i += 1) {
      const u = (i + 0.5) / n;
      addLight(lerp(x0, x1, u) + (rb() - 0.5) * 12, lerp(y0, y1, u) + sag * 4 * u * (1 - u) + (rb() - 0.5) * 8, r0 + rb() * 6, 0.62 + rb() * 0.3,
        { img: beadSprite, ax: 3 + rb() * 3, ay: 4 + 8 * 4 * u * (1 - u), fx: 0.22, fy: 0.31, ph: u * 2.2 + (x0 > 600 ? 1.3 : 0), on: LIGHTS + 0.03 + u * 0.36 });
    }
  };
  swag(-160, -20, 1260, -50, 122, 16, 15);
  swag(800, -70, 2100, 130, 205, 14, 19);
  const dimForType = (d) => (d.x < 1190 && d.y > 150 && d.y < 900 ? 0.5 : 1);   // keep the lights quiet behind the greeting

  // ── confetti: gold foil in three depths ─────────────────────────────────────────────────────
  // Each piece is born at b, launched with (vx, vy) against drag k, then falls at its terminal speed, swaying and
  // tumbling. `flip` shows the foil face (bright), its back (deep gold), or a flash when it catches the light.
  const TONES = [
    ['#f5c86b', '#a87a26', '#fff1c8'], ['#ffd98a', '#b8862b', '#fff6dc'], ['#e9b550', '#8f641a', '#ffeebc'],
    ['#d9a441', '#7c5413', '#ffe6a3'], ['#f3e2b8', '#a8905c', '#fff8e6'],
  ];
  const POP = LIGHTS + 0.08;                 // the party popper (sfx at lights_on + 0.08)
  const PUFF = 0.56;                         // launch speed of the phrase puffs, as a share of the popper's
  const makeLayer = (seed, spec) => {
    const r = mulberry(seed);
    const out = [];
    const piece = (o) => {
      const disc = r() < 0.16;
      out.push({
        k: 1.5 + r() * 1.1, sw: spec.sway * (0.4 + r()), sf: 0.9 + r() * 1.7, sp: r() * TAU,
        rz: (r() - 0.5) * 5, rz0: r() * TAU, rx: 2.2 + r() * 5.5, rx0: r() * TAU,
        w: spec.size[0] + r() * (spec.size[1] - spec.size[0]), ar: r() < 0.2 ? 1 : 0.42 + r() * 0.3, disc,
        tone: TONES[Math.floor(r() ** 1.4 * (disc ? 4 : 5))], al: spec.alpha[0] + r() * (spec.alpha[1] - spec.alpha[0]), ...o,
      });
    };
    // the burst
    const p = spec.pop;
    for (let i = 0; i < spec.burst; i += 1) {
      const an = p.angle + (r() - 0.5) * p.fan;
      const v = p.v0 + r() ** 0.8 * (p.v1 - p.v0);
      piece({ b: POP + r() * 0.07, x0: p.x + (r() - 0.5) * p.dx, y0: p.y + (r() - 0.5) * p.dy, vx: Math.cos(an) * v, vy: Math.sin(an) * v, vt: (120 + r() * 150) * spec.speed });
    }
    // pieces that fall in front of the cat stay out of the column its face is in (the star stays clean and sharp)
    const fallX = (lo, hi) => { let x = lo + r() * (hi - lo); if (spec.clear) { const [a, b] = spec.clear; if (x > a && x < b) x = x - a < b - x ? a - r() * 240 : b + r() * 90; } return x; };
    // the steady drift from above for as long as the song lasts
    for (let i = 0; i < spec.drift; i += 1) {
      piece({ b: LIGHTS + 0.4 + r() * (SONG - LIGHTS - 1.2), x0: fallX(-160, W + 160), y0: -60 - r() * 90, vx: (r() - 0.5) * 60, vy: 40 + r() * 80, vt: (95 + r() * 140) * spec.speed });
    }
    // a fresh flutter on each later phrase: a wave that is already in frame as the phrase starts
    PH.slice(1).forEach((tp) => {
      for (let i = 0; i < spec.flutter; i += 1) {
        piece({ b: tp - 0.55 - r() * 0.5, x0: fallX(-100, W + 100), y0: -50 - r() * 60, vx: (r() - 0.5) * (spec.clear ? 50 : 120), vy: 420 + r() * 520, vt: (120 + r() * 150) * spec.speed });
      }
    });
    // ... and a soft puff as each later phrase starts: the popper again, at about half its strength
    PH.slice(1).forEach((tp) => {
      for (let i = 0; i < (spec.puff || 0); i += 1) {
        const an = p.angle + (r() - 0.5) * p.fan;
        const v = (p.v0 + r() ** 0.8 * (p.v1 - p.v0)) * PUFF;
        piece({ b: tp + r() * 0.12, x0: p.x + (r() - 0.5) * p.dx, y0: p.y + (r() - 0.5) * p.dy, vx: Math.cos(an) * v, vy: Math.sin(an) * v, vt: (120 + r() * 150) * spec.speed });
      }
    });
    // while the greeting is held: a few stragglers (spec.hold pieces a second), so the air is never quite still.
    // They are made last and are born after the song, so nothing before the hold changes.
    if (HOLD && spec.hold) {
      const [a, b] = [SONG + 0.1, LOOP0 + LOOP + 1];
      for (let i = 0; i < Math.round(spec.hold * (b - a)); i += 1) {
        piece({ b: a + r() * (b - a), x0: fallX(-160, W + 160), y0: -60 - r() * 90, vx: (r() - 0.5) * 60, vy: 40 + r() * 80, vt: (80 + r() * 110) * spec.speed });
      }
    }
    return out;
  };
  const behind = catPt(720, 1260);           // the far layer bursts from behind the cat's shoulders ...
  const far = makeLayer(7301, { burst: 170, drift: 260, flutter: 28, puff: 52, hold: 1.6, size: [5, 11], alpha: [0.55, 0.9], sway: 16, speed: 0.78,
    pop: { x: behind.x, y: behind.y, dx: 160, dy: 120, angle: -Math.PI / 2 - 0.5, fan: 2.0, v0: 420, v1: 1600 } });
  // ... the nearer layers come up from under the frame, between the cat and the lens, and lean away from the face
  const FACE = [catPt(250, 0).x, catPt(1080, 0).x - 30];
  const mid = makeLayer(7302, { burst: 64, drift: 100, flutter: 13, puff: 16, hold: 0.5, size: [12, 22], alpha: [0.8, 1], sway: 28, speed: 1, clear: FACE,
    pop: { x: 1150, y: H + 70, dx: 460, dy: 60, angle: -Math.PI / 2 - 0.46, fan: 0.76, v0: 1100, v1: 2700 } });
  const near = makeLayer(7303, { burst: 9, drift: 16, flutter: 3, hold: 0.1, size: [44, 84], alpha: [0.5, 0.78], sway: 46, speed: 1.5, clear: [FACE[0] - 60, W + 200],
    pop: { x: 800, y: H + 160, dx: 900, dy: 80, angle: -Math.PI / 2 - 0.32, fan: 0.5, v0: 1500, v1: 3200 } });
  // a breath of air on each phrase: pieces swing sideways and turn over a little faster
  const gustAt = (tf) => PH.reduce((s, tp) => { const u = tf - tp; return u > 0 ? s + u * Math.exp(-u * 2.4) * 2.2 : s; }, 0);
  const turnAt = (tf) => PH.reduce((s, tp) => s + smooth(prog(tf, tp, tp + 0.9)), 0);
  const drawConfetti = (c, list, tf, T, gust, turn, w, h) => {
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      const tau = tf - p.b;
      if (tau <= 0) continue;
      const d = (1 - Math.exp(-p.k * tau)) / p.k;
      const wy = p.y0 + p.vy * d + p.vt * (tau - d);
      const wx = p.x0 + p.vx * d + p.sw * Math.sin(p.sf * tau + p.sp) * Math.min(1, tau * 1.4) + gust * p.sw * 1.1;
      const sx = T.x + wx * T.s;
      const sy = T.y + wy * T.s;
      const size = p.w * T.s;
      if (sy > h + size || sy < -size * 2 || sx < -size * 2 || sx > w + size * 2) continue;
      const flip = Math.cos(p.rx0 + p.rx * tau + turn * 2.4);
      const af = Math.abs(flip);
      const th = p.rz0 + p.rz * tau;
      const cs = Math.cos(th) * T.s;
      const sn = Math.sin(th) * T.s;
      c.setTransform(cs, sn, -sn, cs, sx, sy);
      c.globalAlpha = p.al * Math.min(1, tau * 7);
      c.fillStyle = af > 0.94 ? p.tone[2] : flip > 0 ? p.tone[0] : p.tone[1];
      const hh = Math.max(0.9, p.w * p.ar * af);
      if (p.disc) { c.beginPath(); c.ellipse(0, 0, p.w * 0.5, Math.max(0.5, p.w * 0.5 * af), 0, 0, TAU); c.fill(); } else c.fillRect(-p.w / 2, -hh / 2, p.w, hh);
    }
    c.globalAlpha = 1;
    c.setTransform(1, 0, 0, 1, 0, 0);
  };
  // the near layer is out of focus: painted at quarter size, blurred there, and enlarged onto the frame
  const Q = 0.25;
  const PAD = 10;
  const nearA = offscreen(W * Q + PAD * 2, H * Q + PAD * 2).getContext('2d');
  const nearB = offscreen(W * Q + PAD * 2, H * Q + PAD * 2).getContext('2d');

  // ── film grain: faint, 2 px clumps, strongest in the mid-tones (overlay leaves black black) ──
  const GRAIN = 8;                           // +- levels in the tile; 0 switches it off
  const grainTile = offscreen(256, 256);
  {
    const g = grainTile.getContext('2d');
    const id = g.createImageData(256, 256);
    const r = mulberry(4471);
    for (let j = 0; j < 256; j += 2) {
      for (let i = 0; i < 256; i += 2) {
        const v = 128 + Math.round((r() + r() + r() - 1.5) * GRAIN * 1.15);
        for (const o of [(j * 256 + i) * 4, (j * 256 + i + 1) * 4, ((j + 1) * 256 + i) * 4, ((j + 1) * 256 + i + 1) * 4]) {
          id.data[o] = id.data[o + 1] = id.data[o + 2] = v; id.data[o + 3] = 255;
        }
      }
    }
    g.putImageData(id, 0, 0);
  }
  const grainPat = ctx.createPattern(grainTile, 'repeat');

  // ── the lights coming up: a warm bloom over the cat, not a flash ────────────────────────────
  const bloomSprite = sprite([255, 218, 160], (r) => 0.85 * Math.exp(-((r / 0.52) ** 2) * 1.25) * (1 - ss(0.86, 1, r)), 256);
  const bloomAt = catPt(520, 640);

  // ── type ────────────────────────────────────────────────────────────────────────────────────
  // Set in frame pixels on a 2x canvas that covers the part of the frame the greeting can occupy.
  // Names come from config; the layout follows CSS line-box rules so the numbers read like a style sheet.
  const NAME = config.admin.name || B.name;
  const L1 = 'Happy Birthday,';
  const LOVE = ['with love, from all of ', 'DSBA'];
  const L3A = (config.admin.cat_title || `${NAME}’s cat`).toUpperCase();
  const L3B = config.admin.cat_role || 'Head of Surprises';
  const BROKEN_1 = L1.replace(/birth/i, '█████');
  const BROKEN_2 = NAME.replace(/\S/g, '?');
  const GOLD = '#f5c86b';
  const GOLD_2 = '#ffd98a';
  const GOLD_3 = '#b8862b';
  const CREAM = '#f6ecd4';
  const TYPE = { x: 96, y: 170, w: 1210, h: 824, ss: 2 };
  const typeCv = offscreen(TYPE.w * TYPE.ss, TYPE.h * TYPE.ss);
  const tc = typeCv.getContext('2d');
  const haloCv = offscreen(TYPE.w / 4, TYPE.h / 4);
  const hc = haloCv.getContext('2d');
  const FONT = {
    kick: "700 34px 'Schibsted'", hb: "italic 400 126px 'Newsreader'", name: "800 404px 'Playfair'",
    love: "italic 400 43px 'Newsreader'", l3a: "700 34px 'Schibsted'", l3b: "italic 400 47px 'Newsreader'",
  };
  const SPACING = { kick: 0.6 * 34, hb: -0.012 * 126, name: -0.012 * 404, love: 0.012 * 43, l3a: 0.34 * 34, l3b: 0 };
  const setFont = (c, k, spacing = SPACING[k]) => { c.font = FONT[k]; c.letterSpacing = `${spacing}px`; };
  /** Baseline of a CSS line box: top of the box + half-leading + ascent. */
  const baseOf = (k, top, lineHeight) => {
    setFont(tc, k);
    const m = tc.measureText('Hxg');
    return top + (lineHeight - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
  };
  const X0 = 150;                            // the left edge every line hangs from
  const LAY = {
    kick: { ruleX: X0, ruleW: 76, ruleY: 219, x: X0 + 76 + 30, base: baseOf('kick', 196, 46) },
    hb: { x: X0, base: baseOf('hb', 270, 126 * 1.12), lh: 126 * 1.12, clip: [X0 - 40, 262, 1190, 167] },
    name: { x: X0, base: baseOf('name', 421, 404 * 0.93), boxX: X0 - 14, boxY: 421, boxH: 404 * 0.93 + 22, clip: [X0 - 54, 395, 1206, 458] },
    love: { x: X0 + 4, base: baseOf('love', 814.7, 43 * 1.2), clip: [X0 - 6, 810.7, 760, 65.6] },
    l3: { right: 1200, ruleX: 1228, top: 852, h: 112, baseA: baseOf('l3a', 854, 44), baseB: baseOf('l3b', 902, 58), clip: [640, 850, 586, 116] },
  };
  // a longer name than "Noor" is set smaller, on the same baseline, so that it still clears the cat's whiskers
  setFont(tc, 'name');
  const fit = Math.min(1, 950 / (tc.measureText(NAME).width - SPACING.name));
  if (fit < 1) { FONT.name = `800 ${Math.floor(404 * fit)}px 'Playfair'`; SPACING.name *= fit; }
  setFont(tc, 'name');
  const NAME_W = tc.measureText(NAME).width - SPACING.name;
  // the glow behind the name: the name itself, blurred once
  const GP = 120;
  const glow = offscreen(NAME_W + 28 + GP * 2, LAY.name.boxH + GP * 2);
  {
    const g = glow.getContext('2d');
    setFont(g, 'name');
    g.filter = 'blur(34px)';
    g.fillStyle = '#f1b955';
    g.fillText(NAME, GP + 14, GP + LAY.name.base - LAY.name.boxY);
  }
  // the foil catches the light once in every phrase: as it lands, on the long "you" of phrase two (where the
  // closer shot used to be), on "dear Noor", and on the last "birth-" before the cut
  const SHIMMERS = [[T0 + 1.05, 1.5], [last(notesOf(1)).t - 0.1, 1.3], [NAME_T - 0.05, 1.25], [notesOf(3)[2].t - 0.05, 1.2]];
  if (HOLD) SHIMMERS.push([LOOP0 + 5.0, 1.5]);   // and once in every pass of the hold

  /** Everything the type depends on at time t (tf = t clamped to the cut). */
  const typeState = (t, tf) => {
    const scr = t > CUT + 0.02;              // glitch #2, DOM side: the greeting scrambles and settles broken
    const sp = prog(t, CUT + 0.02, CUT + 0.62);
    const rr = mulberry(Math.round(t * 30) * 7 + 1);
    const hb = [...L1].map((c0, i) => {
      let ch = c0;
      if (scr) {
        if (sp >= 1) ch = BROKEN_1[i];
        else if (c0 !== ' ' && rr() < 0.25 + 0.6 * sp) ch = GLYPH[Math.floor(rr() * GLYPH.length)];
      }
      return { ch, p: r4(expoOut(prog(tf, T0 + 0.18 + i * 0.024, T0 + 0.86 + i * 0.024))) };
    });
    let name = NAME;
    if (scr) name = sp >= 1 ? BROKEN_2 : [...NAME].map((ch) => (rr() < 0.3 + 0.6 * sp ? GLYPH[Math.floor(rr() * GLYPH.length)] : ch)).join('');
    let shx = 1;                             // the shimmer's place: 1 = parked left of the name, 0 = gone past it
    for (const [a, dur] of SHIMMERS) if (tf >= a && tf <= a + dur) shx = 1 - ease.inOut3((tf - a) / dur);
    return {
      hb, name, shx: r4(shx),
      rule: r4(ease.out3(prog(tf, T0, T0 + 0.55))), kick: r4(ease.out3(prog(tf, T0 + 0.08, T0 + 0.95))),
      np: r4(expoOut(prog(tf, T0 + 0.42, T0 + 1.5))), lp: r4(expoOut(prog(tf, T0 + 1.2, T0 + 2.0))),
      r3: r4(ease.out3(prog(tf, T3, T3 + 0.42))), a3: r4(expoOut(prog(tf, T3 + 0.12, T3 + 0.82))), b3: r4(expoOut(prog(tf, T3 + 0.24, T3 + 0.94))),
    };
  };
  const clipTo = (c, [x, y, w, h]) => { c.beginPath(); c.rect(x, y, w, h); c.clip(); };
  const paintType = (st) => {
    const c = tc;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, typeCv.width, typeCv.height);
    c.setTransform(TYPE.ss, 0, 0, TYPE.ss, -TYPE.x * TYPE.ss, -TYPE.y * TYPE.ss);   // frame pixels from here on
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    // kicker: a short rule draws in from the right, the word settles as its tracking closes
    if (st.rule > 0) {
      const k = LAY.kick;
      const g = c.createLinearGradient(k.ruleX, 0, k.ruleX + k.ruleW, 0);
      g.addColorStop(0, 'rgba(245, 200, 107, 0)'); g.addColorStop(1, GOLD);
      c.fillStyle = g;
      c.fillRect(k.ruleX + k.ruleW * (1 - st.rule), k.ruleY - 1, k.ruleW * st.rule, 2);
      setFont(c, 'kick', (0.6 + 0.34 * (1 - st.kick)) * 34);
      c.globalAlpha = st.kick;
      c.fillStyle = GOLD;
      c.fillText('SURPRISE', k.x, k.base);
      c.globalAlpha = 1;
    }
    // "Happy Birthday,": letters rise out of a mask, one after the other
    c.save();
    clipTo(c, LAY.hb.clip);
    setFont(c, 'hb');
    c.fillStyle = CREAM;
    let x = LAY.hb.x;
    for (const { ch, p } of st.hb) {
      if (p > 0.001) {
        c.globalAlpha = Math.min(1, p * 1.6);
        c.fillText(ch, x, LAY.hb.base + (1 - p) * 1.12 * LAY.hb.lh);
      }
      x += c.measureText(ch).width;
    }
    c.restore();
    // the name: gold foil (a long gradient, a top light, a shadowed foot) and a highlight that crosses it
    if (st.np > 0.001) {
      const n = LAY.name;
      c.save();
      clipTo(c, n.clip);
      setFont(c, 'name');
      const y = n.base + (1 - st.np) * 1.04 * n.boxH;
      const by = n.boxY + (y - n.base);
      const bw = c.measureText(st.name).width - SPACING.name + 28;
      const foil = cssGradient(c, 99, n.boxX, by, bw, n.boxH);
      [[0, '#9c6a1a'], [0.13, '#dfae4c'], [0.26, '#fff1c4'], [0.37, '#f4c868'], [0.51, '#bf8a2a'], [0.64, '#f2cd7e'], [0.75, '#ffecb6'], [0.87, '#dba843'], [1, '#a26f1b']]
        .forEach(([o, col]) => foil.addColorStop(o, col));
      c.fillStyle = foil;
      c.fillText(st.name, n.x, y);
      const light = c.createLinearGradient(0, by, 0, by + n.boxH);
      light.addColorStop(0, 'rgba(255, 255, 255, .20)'); light.addColorStop(0.42, 'rgba(255, 255, 255, 0)'); light.addColorStop(1, 'rgba(70, 36, 0, .26)');
      c.fillStyle = light;
      c.fillText(st.name, n.x, y);
      if (st.shx > 0 && st.shx < 1) {
        const iw = bw * 2.6;                 // the highlight lives on a strip 2.6 names wide that slides across
        const band = cssGradient(c, 104, n.boxX - 1.6 * bw * st.shx, by, iw, n.boxH);
        band.addColorStop(0.43, 'rgba(255, 252, 240, 0)'); band.addColorStop(0.5, 'rgba(255, 252, 240, .96)'); band.addColorStop(0.57, 'rgba(255, 252, 240, 0)');
        c.fillStyle = band;
        c.fillText(st.name, n.x, y);
      }
      c.restore();
    }
    // signature line
    if (st.lp > 0.001) {
      c.save();
      clipTo(c, LAY.love.clip);
      setFont(c, 'love');
      const y = LAY.love.base + (1 - st.lp) * 1.1 * 51.6;
      c.globalAlpha = Math.min(1, st.lp * 1.4) * 0.86;
      c.fillStyle = CREAM;
      c.fillText(LOVE[0], LAY.love.x, y);
      c.globalAlpha = Math.min(1, st.lp * 1.4);
      c.fillStyle = GOLD_2;
      c.fillText(LOVE[1], LAY.love.x + c.measureText(LOVE[0]).width, y);
      c.restore();
    }
    // lower third: a rule draws down, the two lines slide out from behind it
    if (st.r3 > 0) {
      const l = LAY.l3;
      const g = c.createLinearGradient(0, l.top, 0, l.top + l.h);
      g.addColorStop(0, GOLD_2); g.addColorStop(1, GOLD_3);
      c.fillStyle = g;
      c.fillRect(l.ruleX, l.top, 2, l.h * st.r3);
      c.save();
      clipTo(c, l.clip);
      c.textAlign = 'right';
      setFont(c, 'l3a');
      c.globalAlpha = Math.min(1, st.a3 * 1.5);
      c.fillStyle = GOLD_2;
      c.fillText(L3A, l.right + SPACING.l3a + (1 - st.a3) * 64, l.baseA);
      setFont(c, 'l3b');
      c.globalAlpha = Math.min(1, st.b3 * 1.5);
      c.fillStyle = CREAM;
      c.fillText(L3B, l.right + (1 - st.b3) * 64, l.baseB);
      c.restore();
    }
    c.globalAlpha = 1;
    // halation: bright type bleeds a little into the dark around it, as it would on film
    hc.setTransform(1, 0, 0, 1, 0, 0);
    hc.clearRect(0, 0, haloCv.width, haloCv.height);
    hc.filter = 'blur(3.5px)';
    hc.drawImage(typeCv, 0, 0, haloCv.width, haloCv.height);
    hc.filter = 'none';
  };
  let painted = '';                          // what typeCv currently holds (a cache, not state: same input, same pixels)

  // ── the terminal (glitch #2) ────────────────────────────────────────────────────────────────
  const term = root.querySelector('.term');
  const lines = term.querySelectorAll('p');
  G.terminal_lines.forEach((ln, i) => typeText(lines[i], ln.text, ln.t, G.terminal_cps, { caret: '▊' }));
  // The copy and its timing come from the cues, so they are checked here rather than trusted.
  // Width: the longest line plus its caret must end inside the safe area (JBMono advances 0.6 em per character;
  // act2.css sets 64 px from x = 200, lines never wrap). A longer line makes the whole terminal smaller.
  const TERM = { x: 200, size: 64, safe: 96 };
  const widest = Math.max(...G.terminal_lines.map((ln) => ln.text.length)) + 2;
  const fitSize = Math.floor((W - TERM.x - TERM.safe) / (0.6 * widest));
  if (fitSize < TERM.size) term.style.fontSize = `${fitSize}px`;
  // Time: a line is fully typed before the next one starts, and the last two can be read for half a second.
  G.terminal_lines.forEach((ln, i, all) => {
    const typed = ln.t + ln.text.length / G.terminal_cps;
    const until = i + 1 < all.length ? all[i + 1].t : G.flash;
    if (typed > until) console.error(`[act2] terminal line ${i + 1} is still being typed when the next thing happens (${typed.toFixed(2)} > ${until.toFixed(2)})`);
    if (i >= all.length - 2 && G.flash - typed < 0.5) console.error(`[act2] terminal line ${i + 1} is on screen for only ${(G.flash - typed).toFixed(2)} s before the flash`);
  });
  const pb = term.querySelector('.pb');
  const TERM_IN = G.terminal_lines[0].t - 0.1;

  // ── the dark beat ───────────────────────────────────────────────────────────────────────────
  // bells[0]: heard on a black screen · eyes_in: two eyes open · looks: left, right, back to centre · blinks[0]: one
  // slow blink · bells[1]: the bell again; this time it catches a glint under the eyes and she glances down at it ·
  // blinks[1..]: a quick double blink · widen: pupils dilate, eyes a touch bigger, held dead still · lights_on.
  const BELLS = B.bells || [B.bell];
  // Which rings are SEEN (the collar bell catches a little light) as well as heard. The first is sound only, on
  // black; cut 2 showed it too ([true, true] brings that back, [false, false] keeps the dark to the eyes alone).
  const BELL_GLINT = [false, true];
  const BELL_SEEN = BELLS.filter((tb, i) => BELL_GLINT[i]);
  const [SLOW_BLINK, ...QUICK_BLINKS] = B.blinks;
  const BLINK = { slow: [0.20, 0.05, 0.28], quick: [0.09, 0.02, 0.12] };   // seconds down, shut, up
  const SACCADE = 0.15;                      // the eyes get there first ...
  const FOLLOW = [0.05, 0.42];               // ... and the head follows a little, later and slower
  const HEAD = [14, 5];                      // how far it follows, in cat pixels
  /** 0 = open, 1 = shut. The lids are fully shut AT `at` (where the blink sound is), for `hold` seconds. */
  const lidAt = (t, at, [down, hold, up]) => {
    const u = t - at;
    return u <= -down || u >= hold + up ? 0 : u < 0 ? smooth(1 + u / down) : u <= hold ? 1 : 1 - smooth((u - hold) / up);
  };
  /** What the eyes are doing at time t, before the lights. */
  const eyesAt = (t) => {
    const gx = B.looks.reduce((x, k) => lerp(x, k.x, ease.inOut3(prog(t, k.t, k.t + SACCADE))), 0);
    const fx = B.looks.reduce((x, k) => lerp(x, k.x, smooth(prog(t, k.t + FOLLOW[0], k.t + FOLLOW[1]))), 0);
    // the second bell is on her own collar: she glances down at it, and the first quick blink takes the glance back
    const gy = BELLS.length > 1 && QUICK_BLINKS.length
      ? smooth(prog(t, BELLS[1] + 0.1, BELLS[1] + 0.24)) * (1 - smooth(prog(t, QUICK_BLINKS[0] - BLINK.quick[0], QUICK_BLINKS[0]))) : 0;
    const shut = Math.max(lidAt(t, SLOW_BLINK, BLINK.slow), ...QUICK_BLINKS.map((q) => lidAt(t, q, BLINK.quick)));
    const wide = t < B.widen ? 0 : ease.outBack(prog(t, B.widen, B.widen + 0.18));     // a snap, a hair too far, and held
    const still = 1 - smooth(prog(t, B.widen - 0.3, B.widen));                       // she freezes before she stares
    const u = t - B.eyes_in;
    return {
      gx, gy, fx, wide,
      open: (0.06 + 0.94 * ease.out3(prog(t, B.eyes_in, B.eyes_in + 0.24))) * (1 - shut) * (1 - 0.2 * gy),
      // the head: follows the glances, and is never quite still (a slow drift, computed from t)
      hx: HEAD[0] * fx + still * (2.4 * Math.sin(0.83 * u + 0.4) + 1.1 * Math.sin(1.9 * u + 2.0)),
      hy: HEAD[1] * gy + still * (1.7 * Math.sin(1.13 * u + 1.3) + 0.8 * Math.sin(2.3 * u)),
      breathe: 0.94 + 0.06 * Math.sin(t * 5.2),
      spark: prog(t, LIGHTS - 0.15, LIGHTS) ** 2,   // they catch the first of the light a moment before the room does
    };
  };
  /** One eye of the photograph on cEye: the eyeball turned by (dx, dy) cat pixels inside its outline, its pupil `ps` times as large. */
  const paintEyeball = (e, dx, dy, ps) => {
    cEye.setTransform(1, 0, 0, 1, 0, 0);
    cEye.globalAlpha = 1;
    cEye.globalCompositeOperation = 'source-over';
    cEye.clearRect(0, 0, cEye.canvas.width, cEye.canvas.height);
    cEye.drawImage(eyesImg, e.sx, e.sy, e.sw, e.sw, 0, 0, e.sw, e.sw);
    if (dx || dy || ps !== 1) {
      // The pupil, its catchlight and the inner iris again, moved and enlarged about the pupil and painted only
      // where the eye already is ('source-atop'): the outline, its soft edge and its bright rim stay put, and the
      // iris ring closes up on the side she looks to. Only the photograph's own pixels are used.
      const ox = e.px - e.sx;
      const oy = e.py - e.sy;
      cEye.globalCompositeOperation = 'source-atop';
      cEye.setTransform(ps, 0, 0, ps, ox + dx - ox * ps, oy + dy - oy * ps);
      cEye.drawImage(e.pupil, 0, 0);
      cEye.setTransform(1, 0, 0, 1, 0, 0);
      cEye.globalCompositeOperation = 'source-over';
    }
  };
  /** Bell and eyes in the dark, painted in cat pixels on the small canvas. Returns false when there is nothing to show. */
  const paintDark = (t, dark) => {
    cDark.setTransform(1, 0, 0, 1, 0, 0);
    cDark.clearRect(0, 0, DARK.w, DARK.h);
    if (dark <= 0 || t < Math.min(BELLS[0], B.eyes_in) - 0.02) return false;
    cDark.setTransform(1, 0, 0, 1, -DARK.x0, -DARK.y0);
    // the collar bell catches a little light when it rings (a double strike) and stays barely visible afterwards
    const since = BELL_SEEN.filter((tb) => t >= tb).map((tb) => t - tb);
    const ring = since.reduce((s, u0) => s + [0, 0.19].reduce((q, o) => (u0 > o ? q + Math.min(1, (u0 - o) / 0.03) * Math.exp(-(u0 - o) / 0.2) : q), 0), 0);
    const ba = since.length ? Math.min(0.85, ring * 0.62 + 0.16 * prog(t, BELL_SEEN[0], BELL_SEEN[0] + 0.3)) * dark : 0;
    if (ba > 0.004) {
      const { cx, cy, r } = meta.bell;
      const sw = since.reduce((s, u0) => s + 0.11 * Math.sin(u0 * TAU * 3.4) * Math.exp(-u0 / 0.33), 0);   // it swings on its ring
      cDark.save();
      cDark.translate(cx + 14, cy - 150); cDark.rotate(sw); cDark.translate(-(cx + 14), -(cy - 150));
      cDark.globalAlpha = ba;
      cDark.beginPath(); cDark.ellipse(cx, cy - 4, r * 0.98, r * 1.06, 0, 0, TAU); cDark.clip();
      cDark.drawImage(catImg, cx - 60, cy - 70, 120, 140, cx - 60, cy - 70, 120, 140);
      const sh = cDark.createRadialGradient(cx - 6, cy - 8, r * 0.2, cx, cy, r * 1.06);   // only its lit shoulder shows; the rest melts into the dark
      sh.addColorStop(0, 'rgba(0,0,0,1)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      cDark.globalAlpha = 1; cDark.globalCompositeOperation = 'destination-in';
      cDark.fillStyle = sh; cDark.fillRect(cx - 60, cy - 70, 120, 140);
      cDark.globalCompositeOperation = 'source-over';
      cDark.restore();
      const gl = cDark.createRadialGradient(cx - 12, cy - 16, 0, cx - 12, cy - 16, 30);
      gl.addColorStop(0, `rgba(255, 236, 170, ${0.75 * Math.min(1, ring) * dark})`); gl.addColorStop(1, 'rgba(255, 220, 140, 0)');
      cDark.fillStyle = gl; cDark.fillRect(cx - 50, cy - 56, 80, 80);
    }
    // two eyes, one amber, one blue: the photograph's own, through soft masks
    const ea = smooth(prog(t, B.eyes_in, B.eyes_in + 0.3)) * dark;
    if (ea > 0.003) {
      const k = eyesAt(t);
      const grow = 1 + 0.12 * k.wide;        // "eyes a touch bigger"
      for (const e of EYES) {
        if (k.open < 0.02) continue;         // shut: nothing of the eye is left in the dark
        const cx = e.cx + k.hx * e.follow;
        const cy = e.cy + k.hy * e.follow;
        const hr = e.r * 2.3 * (1 + 0.16 * k.wide);
        const halo = cDark.createRadialGradient(cx, cy, e.r * 0.5, cx, cy, hr);
        halo.addColorStop(0, `rgba(${e.tint}, ${Math.min(1, 0.20 + 0.25 * k.spark + 0.09 * k.wide) * ea * k.open})`); halo.addColorStop(1, `rgba(${e.tint}, 0)`);
        cDark.globalAlpha = 1; cDark.fillStyle = halo;
        cDark.fillRect(cx - hr - 2, cy - hr - 2, hr * 2 + 4, hr * 2 + 4);
        paintEyeball(e, e.look[0] * k.gx, e.look[1] * k.gy, 1 + 0.2 * k.wide);
        cDark.save();
        cDark.translate(cx, cy); cDark.scale(grow, grow);
        if (e.turn) { cDark.rotate(e.a); cDark.scale(1, 1 + e.turn * k.fx); cDark.rotate(-e.a); }
        cDark.translate(-e.cx, -e.cy);        // the eye's own cat pixels from here on
        // the lids: the upper one comes down further than the lower one comes up
        const lx = -Math.sin(e.a) * e.ry * e.drop * (1 - k.open);
        const ly = Math.cos(e.a) * e.ry * e.drop * (1 - k.open);
        cDark.beginPath();
        cDark.ellipse(e.cx + lx, e.cy + ly, e.rx * 1.3, Math.max(0.01, e.ry * 1.3 * k.open), e.a, 0, TAU);
        cDark.clip();
        cDark.globalAlpha = ea * k.breathe;
        cDark.drawImage(cEye.canvas, 0, 0, e.sw, e.sw, e.sx, e.sy, e.sw, e.sw);
        if (k.spark > 0) {
          const gx = e.cx - e.rx * 0.30;
          const gy = e.cy - e.ry * 0.34;
          const gg = cDark.createRadialGradient(gx, gy, 0, gx, gy, e.r * (0.16 + 0.30 * k.spark));
          gg.addColorStop(0, `rgba(255, 250, 235, ${0.95 * k.spark})`); gg.addColorStop(1, 'rgba(255, 244, 220, 0)');
          cDark.globalAlpha = ea; cDark.fillStyle = gg;
          cDark.fillRect(gx - e.r, gy - e.r, e.r * 2, e.r * 2);
        }
        cDark.restore();
      }
      cDark.globalAlpha = 1;
    }
    return true;
  };

  // ── life inside the locked frame: the cat during the song ──────────────────────────────────
  // She sways with the waltz: a lean that goes out and back every two bars, and a small rise on each bar. The lean
  // turns about the bottom right corner of the photograph and only ever tips it OUT of the frame, so the two
  // cropped edges of the photo (right, bottom) stay hidden.
  const SWAY = (0.55 * Math.PI) / 180;
  const BOB = 2.6;                           // frame pixels
  const SWAY_AT = catPt(meta.canvas.w, meta.scene.h);
  const swayIn = (tf) => smooth(prog(tf, LIGHTS + 0.5, LIGHTS + 2.4));
  // Her hat bobbles on the beat: every beat gives it a nudge (the downbeat a bigger one, the popper the first), and
  // it rocks on its brim and settles. The hat is lifted off the photograph once, here: the cat without the top of
  // its hat, and the hat as a piece of its own (outline in cat pixels; straight sides, it is a cone).
  const HAT = { pivot: [785, 628], box: [650, 140, 350, 550], deg: 1.5, hz: 2.7, decay: 0.24 };
  const hatPath = new Path2D();
  hatPath.moveTo(667, 581); hatPath.lineTo(708, 526); hatPath.lineTo(888, 262);
  hatPath.arc(936, 221, 63, 2.435, 0.7 + TAU);
  hatPath.lineTo(934, 290); hatPath.lineTo(912, 600); hatPath.lineTo(908, 667);
  [[890, 668], [870, 669], [850, 669], [830, 667], [810, 665], [790, 658], [770, 652], [750, 642], [730, 632], [710, 620], [690, 606], [672, 588]]
    .forEach(([x, y]) => hatPath.lineTo(x, y));
  hatPath.closePath();
  const hatTop = new Path2D();               // what is taken off the cat: the hat above a line just over its brim
  hatTop.moveTo(718, 512); hatTop.lineTo(884, 258);
  hatTop.arc(936, 221, 67, 2.5, 0.75 + TAU);
  hatTop.lineTo(942, 292); hatTop.lineTo(918, 600);
  hatTop.closePath();
  const catBody = offscreen(catImg.naturalWidth, catImg.naturalHeight);
  {
    const c = catBody.getContext('2d');
    c.drawImage(catImg, 0, 0);
    c.globalCompositeOperation = 'destination-out';
    c.fill(hatTop);
  }
  const hatCv = offscreen(HAT.box[2], HAT.box[3]);
  {
    const c = hatCv.getContext('2d');
    c.drawImage(catImg, HAT.box[0], HAT.box[1], HAT.box[2], HAT.box[3], 0, 0, HAT.box[2], HAT.box[3]);
    c.globalCompositeOperation = 'destination-in';
    c.translate(-HAT.box[0], -HAT.box[1]);
    c.fill(hatPath);
  }
  const NUDGES = [[POP, 1.15]];
  for (let i = -1; DOWN + i * BEAT < SONG - 0.05; i += 1) if (DOWN + i * BEAT > POP + 0.2) NUDGES.push([DOWN + i * BEAT, ((i % 3) + 3) % 3 === 0 ? 1 : 0.5]);
  const hatAt = (tf) => NUDGES.reduce((s, [tb, w], i) => {
    const u = tf - tb;
    return u > 0 ? s + (i % 2 ? -1 : 1) * w * Math.exp(-u / HAT.decay) * Math.sin(TAU * HAT.hz * u) : s;
  }, 0) * ((HAT.deg * Math.PI) / 180);
  // She blinks now and then: at the end of the long "you" of phrase one, twice (the double blink again) on the long
  // "you" of phrase two, and once, slowly, after her person's name. Lids are painted in cat pixels over the photo's
  // eyes, in the colours of the fur around each eye (sampled from the photograph, so they follow its grade).
  const onFrameTime = (v) => Math.round(v * cues.fps) / cues.fps;   // so that a frame shows the lids fully shut
  const LIT_BLINKS = [
    [last(notesOf(0)).t + 0.62, BLINK.quick],
    [last(notesOf(1)).t + 0.5, BLINK.quick], [last(notesOf(1)).t + 0.8, BLINK.quick],
    [last(notesOf(2)).t + 0.3, BLINK.slow],
  ].map(([at, b]) => [onFrameTime(at), b]).filter(([at, [, hold, up]]) => at + hold + up < SONG - 0.1);
  // while the greeting is held: once as the last chord dies away, then a blink and a double blink in every pass
  // (and once more before the first pass when that is more than ten seconds away)
  if (HOLD) LIT_BLINKS.push(...[[SONG + 3.3, BLINK.slow], ...(LOOP0 - SONG > 10 ? [[SONG + 8.6, BLINK.quick]] : []),
    [LOOP0 + 2.9, BLINK.quick], [LOOP0 + 7.7, BLINK.quick], [LOOP0 + 8.0, BLINK.quick]].map(([at, b]) => [onFrameTime(at), b]));
  const litShut = (tf) => Math.max(0, ...LIT_BLINKS.map(([at, b]) => lidAt(tf, at, b)));
  const probe = offscreen(12, 12).getContext('2d', { willReadFrequently: true });
  const furAt = (u, v) => {
    probe.clearRect(0, 0, 12, 12);
    probe.drawImage(catImg, Math.round(u) - 6, Math.round(v) - 6, 12, 12, 0, 0, 12, 12);
    const d = probe.getImageData(0, 0, 12, 12).data;
    let r = 0; let g = 0; let b = 0; let a = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i] * d[i + 3]; g += d[i + 1] * d[i + 3]; b += d[i + 2] * d[i + 3]; a += d[i + 3]; }
    return a > 255 * 20 ? [r / a, g / a, b / a] : [226, 214, 198];
  };
  const rgb = (c, k = 1) => `rgb(${Math.round(c[0] * k)}, ${Math.round(c[1] * k)}, ${Math.round(c[2] * k)})`;
  const mix = (p, q, k) => p.map((v, i) => lerp(v, q[i], k));
  // A lid is a soft patch of fur over the eye and its dark rim, feathered into the photograph and kept inside the
  // cat's own outline (the far eye sits on her profile); the open part is cut out of it frame by frame.
  const LIDS = EYES.map((e) => {
    const far = e.id !== 'blue';
    const at = (k, l) => furAt(e.cx - Math.sin(e.a) * k * e.ry + Math.cos(e.a) * l * e.rx, e.cy + Math.cos(e.a) * k * e.ry + Math.sin(e.a) * l * e.rx);
    const cheek = far ? at(1.9, 0) : mix(at(1.5, 0), at(0, 1.45), 0.5);     // the lit fur next to the eye
    const brow = far ? mix(cheek, at(1.9, 1.2), 0.5) : mix(cheek, at(-1.6, 0), 0.6);
    const cv = offscreen(e.sw, e.sw);
    const c = cv.getContext('2d');
    c.translate(e.cx - e.sx, e.cy - e.sy); c.rotate(e.a);
    const g = c.createLinearGradient(0, -e.ry * 1.2, 0, e.ry * 1.2);
    g.addColorStop(0, rgb(brow)); g.addColorStop(0.6, rgb(cheek)); g.addColorStop(1, rgb(cheek));
    c.fillStyle = g; c.fillRect(-e.sw, -e.sw, e.sw * 2, e.sw * 2);
    c.globalCompositeOperation = 'destination-in';
    c.save();
    c.scale(e.rx * (far ? 1.3 : 1.42), e.ry * (far ? 1.42 : 1.42));     // wide enough to take in the dark rim of the eye
    const m = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(0.8, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m; c.fillRect(-2, -2, 4, 4);
    c.restore();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(catImg, e.sx, e.sy, e.sw, e.sw, 0, 0, e.sw, e.sw);
    return { e, cv, meet: far ? 0.08 : 0.46, lash: rgb(mix(cheek, [58, 40, 34], 0.86)) };   // meet: where the lids close, in short radii below the middle
  });
  const cLid = offscreen(cEye.canvas.width, cEye.canvas.height).getContext('2d');
  const paintLids = (c, shut) => {
    for (const { e, cv, meet, lash } of LIDS) {
      cLid.setTransform(1, 0, 0, 1, 0, 0);
      cLid.globalAlpha = 1; cLid.globalCompositeOperation = 'source-over'; cLid.filter = 'none';
      cLid.clearRect(0, 0, cLid.canvas.width, cLid.canvas.height);
      cLid.drawImage(cv, 0, 0);
      cLid.translate(e.cx - e.sx, e.cy - e.sy); cLid.rotate(e.a);
      const R = e.rx * 1.02;
      const up = lerp(-e.ry, e.ry * meet, shut);         // the edge of the upper lid, as the short radius of an arc
      const lo = lerp(e.ry, e.ry * meet, shut);          // and of the lower lid, which comes up less
      const edge = () => { if (up < 0) cLid.ellipse(0, 0, R, -up, 0, Math.PI, TAU); else cLid.ellipse(0, 0, R, Math.max(0.01, up), 0, Math.PI, 0, true); };
      if (shut < 1) {                        // the part of the eye that still shows
        cLid.globalCompositeOperation = 'destination-out'; cLid.filter = 'blur(1.2px)';
        cLid.beginPath(); edge(); cLid.ellipse(0, 0, R, lo, 0, 0, Math.PI); cLid.closePath(); cLid.fill();
        cLid.globalCompositeOperation = 'source-over';
      }
      // the lash line: a soft shadow and a fine dark edge
      cLid.strokeStyle = lash; cLid.lineCap = 'round';
      cLid.filter = 'blur(3px)'; cLid.globalAlpha = 0.3 * Math.min(1, shut * 2); cLid.lineWidth = 10;
      cLid.beginPath(); edge(); cLid.stroke();
      cLid.filter = 'blur(0.8px)'; cLid.globalAlpha = 0.82 * Math.min(1, shut * 2.5); cLid.lineWidth = 2.8;
      cLid.beginPath(); edge(); cLid.stroke();
      cLid.filter = 'none'; cLid.globalAlpha = 1;
      c.globalAlpha = Math.min(1, shut * 2.5);           // the lids come in over the rim of the eye, they do not pop on
      c.drawImage(cLid.canvas, 0, 0, e.sw, e.sw, e.sx, e.sy, e.sw, e.sw);
      c.globalAlpha = 1;
    }
  };

  onFrame((t) => {
    if (t < start || t >= END) return;
    if (t >= TERM_IN + 0.05) {               // the terminal covers the frame: nothing underneath needs drawing
      term.style.visibility = 'inherit';
      const pp = prog(t, G.crescendo, G.flash - 0.12);
      const cells = Math.round(pp * 24);
      pb.textContent = t >= G.crescendo - 0.05 ? `[${'█'.repeat(cells)}${'░'.repeat(24 - cells)}] ${Math.round(pp * 100)}%` : '';
      return;
    }
    term.style.visibility = t >= TERM_IN ? 'inherit' : 'hidden';
    const tf = t < CUT ? ambient(t) : FROZEN;   // the party freezes dead when the glitch hits
    const lights = ease.out3(prog(tf, LIGHTS, LIGHTS + 0.26));
    const lit = tf >= LIGHTS;

    // ── the photographed world, back to front ────────────────────────────────────────────────
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const gust = gustAt(tf);
    const turn = turnAt(tf);
    if (lit && !TYPE_ONLY) {
      // the room
      ctx.globalAlpha = lights;
      ctx.drawImage(bgImg, -200, -150);
      // its lights
      ctx.globalCompositeOperation = 'lighter';
      for (const d of bokeh) {
        const s = tf - d.on;
        if (s <= 0) continue;
        const on = Math.min(1, s / 0.14) * (1 + 0.35 * Math.exp(-s / 0.22));          // each lamp snaps on, a touch hot, and settles
        const tw = 0.84 + 0.16 * Math.sin(d.tf * tf + d.tp);
        ctx.globalAlpha = Math.min(1, d.a * on * tw * dimForType(d));
        const x = d.x + d.ax * Math.sin(d.fx * tf + d.ph);
        const y = d.y + d.ay * Math.sin(d.fy * tf + d.ph * 1.7);
        ctx.drawImage(d.img, x - d.r, y - d.r, d.r * 2, d.r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      drawConfetti(ctx, far, tf, FIXED, gust * 0.5, turn, W, H);
      // the room falls away into the corners; the cat and its hat keep their own light (see tools/cat/05_grade.py)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(vigImg, 0, 0);
    }
    // the cat (and, before the lights, only its bell and eyes), swaying with the waltz once the song is going
    // (with a hold she comes to rest when the song is over, and then breathes: two slow breaths to a pass)
    const sway = swayIn(tf) * (HOLD ? 1 - smooth(prog(tf, SONG + 0.3, SONG + 2.8)) : 1);
    const breath = HOLD ? 1.1 * smooth(prog(tf, SONG + 2.6, SONG + 5)) * (0.5 - 0.5 * Math.cos((TAU * (tf - LOOP0)) / (LOOP / 2))) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sway > 0 || breath > 0) {
      const bar = (tf - DOWN) / BAR;
      ctx.translate(SWAY_AT.x, SWAY_AT.y - BOB * sway * (0.5 - 0.5 * Math.cos(TAU * bar)) - breath);
      ctx.rotate(SWAY * sway * (0.5 - 0.5 * Math.cos(Math.PI * bar)));
      ctx.translate(-SWAY_AT.x, -SWAY_AT.y);
    }
    ctx.transform(CAT_S, 0, 0, CAT_S, CAT_X, CAT_Y);     // cat pixels from here on
    if (lit && !TYPE_ONLY) {
      const ca = ease.out3(prog(tf, LIGHTS, LIGHTS + 0.2));
      ctx.globalAlpha = ca;
      ctx.imageSmoothingQuality = 'high';
      if (ca < 1) ctx.drawImage(catImg, 0, 0);           // while she fades up: the photograph in one piece
      else {
        ctx.drawImage(catBody, 0, 0);
        const m = ctx.getTransform();
        ctx.translate(HAT.pivot[0], HAT.pivot[1]); ctx.rotate(hatAt(tf)); ctx.translate(-HAT.pivot[0], -HAT.pivot[1]);
        ctx.drawImage(hatCv, HAT.box[0], HAT.box[1]);
        ctx.setTransform(m);
        const shut = litShut(tf);
        if (shut > 0) paintLids(ctx, shut);
      }
      ctx.imageSmoothingQuality = 'low';
    }
    ctx.globalAlpha = 1;
    if (paintDark(t, 1 - prog(tf, LIGHTS, LIGHTS + 0.14))) ctx.drawImage(cDark.canvas, DARK.x0, DARK.y0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!lit) return;

    if (!TYPE_ONLY) {
      drawConfetti(ctx, mid, tf, FIXED, gust, turn, W, H);
      // out-of-focus foreground pieces
      const Tn = FIXED;
      nearA.setTransform(1, 0, 0, 1, 0, 0);
      nearA.clearRect(0, 0, nearA.canvas.width, nearA.canvas.height);
      drawConfetti(nearA, near, tf, { s: Tn.s * Q, x: Tn.x * Q + PAD, y: Tn.y * Q + PAD }, gust * 1.5, turn, nearA.canvas.width, nearA.canvas.height);
      nearB.clearRect(0, 0, nearB.canvas.width, nearB.canvas.height);
      nearB.filter = `blur(${(9 * Tn.s * Q).toFixed(2)}px)`;
      nearB.drawImage(nearA.canvas, 0, 0);
      ctx.drawImage(nearB.canvas, -PAD / Q, -PAD / Q, nearB.canvas.width / Q, nearB.canvas.height / Q);
      ctx.globalAlpha = 0.28;                // a light second pass, so the foreground sits in the same lens
      ctx.drawImage(vigImg, 0, 0);
      ctx.globalAlpha = 1;
    }

    // ── type ──────────────────────────────────────────────────────────────────────────────────
    if (tf >= T0) {
      const st = typeState(t, tf);
      const key = JSON.stringify(st);
      if (key !== painted) { paintType(st); painted = key; }
      const moment = smooth(prog(tf, NAME_T - 0.1, NAME_T + 0.55)) * (1 - 0.45 * smooth(prog(tf, NAME_T + 0.7, NAME_T + 2.2)));
      const ga = (0.30 * smooth(prog(tf, T0 + 0.9, T0 + 2.1)) + 0.34 * moment) * (t > CUT + 0.02 ? 0.4 : 1);
      if (ga > 0.004) {
        ctx.globalAlpha = ga;
        ctx.drawImage(glow, LAY.name.boxX - GP, LAY.name.boxY - GP);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.30;
      ctx.drawImage(haloCv, TYPE.x, TYPE.y, TYPE.w, TYPE.h);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(typeCv, TYPE.x, TYPE.y, TYPE.w, TYPE.h);
      ctx.imageSmoothingQuality = 'low';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // the lights come up: a warm bloom, not a flash
    const sb = tf - LIGHTS;
    const ba = 0.70 * (1 - Math.exp(-sb / 0.04)) * Math.exp(-sb / 0.32);
    if (ba > 0.004) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = ba;
      ctx.drawImage(bloomSprite, bloomAt.x - 1150, bloomAt.y - 940, 2300, 1880);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (GRAIN && !TYPE_ONLY) {               // the grain stops with the song: still through the hold and the glitch
      const rg = mulberry(Math.round(Math.min(tf, SONG) * 30) * 13 + 5);
      const ox = Math.floor(rg() * 128) * 2;
      const oy = Math.floor(rg() * 128) * 2;
      ctx.setTransform(1, 0, 0, 1, -ox, -oy);
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = grainPat;
      ctx.fillRect(ox, oy, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  });
}
