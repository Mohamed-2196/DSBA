// Act 2 — the fake birthday for Noor (72–85.5) and the DOM side of glitch #2 (85.5–90).
//
// A surprise party photographed at night. Darkness, a collar bell, two eyes; the lights come up on Noor's cat
// in a party hat (a real photograph, see tools/cat/), gold foil confetti with depth of field, golden bokeh,
// a slow push-in with parallax, and the greeting set in gold and cream on the side the cat is looking at.
// One insert: a closer shot of the cat on the long note that ends the second phrase.
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
  const CUT = G.start;                       // the song is cut here: the party freezes
  const END = G.flash + 0.2;                 // the frame is black from here (raster pass + Act 3 take over)
  const LIGHTS = B.lights_on;
  const root = scene(stage, 's08', start, END, 'bday');

  // ── timing derived from the melody ──────────────────────────────────────────────────────────
  const PH = B.phrases;
  const notesOf = (i) => B.melody.filter((n) => n.t >= PH[i] - 1e-3 && (i === PH.length - 1 || n.t < PH[i + 1] - 1e-3));
  const last = (a) => a[a.length - 1];
  const CLOSE_IN = last(notesOf(1)).t;       // the long "you" that ends phrase two: cut to the closer shot
  const CLOSE_OUT = notesOf(2)[2].t;         // back to the wide on the downbeat of phrase three ("birth-")
  const NAME_T = (notesOf(2)[5] || notesOf(2)[4]).t;   // "... dear NOOR": the name's moment
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
  const DARK = { x0: 280, y0: 620, w: 520, h: 1160 };
  const cDark = offscreen(DARK.w, DARK.h).getContext('2d');
  const EYE_TINT = { amber: '255, 176, 64', blue: '120, 170, 255' };

  // ── camera ──────────────────────────────────────────────────────────────────────────────────
  // A slow dolly towards the cat's face (E) from lights-on to the cut; layers at parallax k grow by (z-1)*k.
  // The closer shot is the same world through a longer lens: every layer is magnified L times about F.
  const E = catPt((eyeA.cx + eyeB.cx) / 2 - 60, (eyeA.cy + eyeB.cy) / 2 - 40);
  const F = { x: W + 6, y: 34 };
  const camAt = (tf) => {
    const z = 1 + 0.070 * prog(tf, LIGHTS, CUT) ** 0.92
      + 0.006 * ease.inOut3(prog(tf, PH[2], PH[2] + 1.6)) + 0.009 * ease.inOut3(prog(tf, PH[3], PH[3] + 1.8));
    const close = tf >= CLOSE_IN && tf < CLOSE_OUT;
    return { z, close, L: close ? 1.40 * (1 + 0.024 * prog(tf, CLOSE_IN, CLOSE_OUT)) : 1 };
  };
  const layer = (k, c) => {
    const a = 1 + (c.z - 1) * k;
    return { s: a * c.L, x: F.x * (1 - c.L) + E.x * c.L * (1 - a), y: F.y * (1 - c.L) + E.y * c.L * (1 - a) };
  };
  const K = { bg: 0.2, bokeh: 0.42, far: 0.72, cat: 1, mid: 1.3, near: 2.0, type: 0.38 };

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
    // the steady drift from above for the rest of the scene
    for (let i = 0; i < spec.drift; i += 1) {
      piece({ b: LIGHTS + 0.4 + r() * (CUT - LIGHTS - 1.2), x0: fallX(-160, W + 160), y0: -60 - r() * 90, vx: (r() - 0.5) * 60, vy: 40 + r() * 80, vt: (95 + r() * 140) * spec.speed });
    }
    // a fresh flutter on each later phrase: a wave that is already in frame as the phrase starts
    PH.slice(1).forEach((tp) => {
      for (let i = 0; i < spec.flutter; i += 1) {
        piece({ b: tp - 0.55 - r() * 0.5, x0: fallX(-100, W + 100), y0: -50 - r() * 60, vx: (r() - 0.5) * (spec.clear ? 50 : 120), vy: 420 + r() * 520, vt: (120 + r() * 150) * spec.speed });
      }
    });
    return out;
  };
  const behind = catPt(720, 1260);           // the far layer bursts from behind the cat's shoulders ...
  const far = makeLayer(7301, { burst: 170, drift: 260, flutter: 28, size: [5, 11], alpha: [0.55, 0.9], sway: 16, speed: 0.78,
    pop: { x: behind.x, y: behind.y, dx: 160, dy: 120, angle: -Math.PI / 2 - 0.5, fan: 2.0, v0: 420, v1: 1600 } });
  // ... the nearer layers come up from under the frame, between the cat and the lens, and lean away from the face
  const FACE = [catPt(250, 0).x, catPt(1080, 0).x - 30];
  const mid = makeLayer(7302, { burst: 64, drift: 100, flutter: 13, size: [12, 22], alpha: [0.8, 1], sway: 28, speed: 1, clear: FACE,
    pop: { x: 1150, y: H + 70, dx: 460, dy: 60, angle: -Math.PI / 2 - 0.46, fan: 0.76, v0: 1100, v1: 2700 } });
  const near = makeLayer(7303, { burst: 9, drift: 16, flutter: 3, size: [44, 84], alpha: [0.5, 0.78], sway: 46, speed: 1.5, clear: [FACE[0] - 60, W + 200],
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
  const PIVOT = { x: X0, y: 580 };           // the type grows from its left edge
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
  const SHIMMERS = [[T0 + 1.05, 1.5], [NAME_T - 0.05, 1.25]];   // the foil catches the light as it lands, and again on "dear Noor"

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
  const pb = term.querySelector('.pb');
  const TERM_IN = G.terminal_lines[0].t - 0.1;

  /** Bell and eyes in the dark, painted in cat pixels on the small canvas. Returns false when there is nothing to show. */
  const paintDark = (t, dark) => {
    cDark.setTransform(1, 0, 0, 1, 0, 0);
    cDark.clearRect(0, 0, DARK.w, DARK.h);
    if (dark <= 0 || t < B.bell - 0.02) return false;
    cDark.setTransform(1, 0, 0, 1, -DARK.x0, -DARK.y0);
    // the collar bell catches a little light as it rings (twice) and stays barely visible afterwards
    const ring = [0, 0.19].reduce((s, o) => { const u = t - B.bell - o; return u > 0 ? s + Math.min(1, u / 0.03) * Math.exp(-u / 0.2) : s; }, 0);
    const ba = Math.min(0.85, ring * 0.62 + 0.16 * prog(t, B.bell, B.bell + 0.3)) * dark;
    if (ba > 0.004) {
      const { cx, cy, r } = meta.bell;
      const sw = 0.11 * Math.sin((t - B.bell) * TAU * 3.4) * Math.exp(-(t - B.bell) / 0.33);   // it swings on its ring
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
    // two eyes, one amber, one blue: the photograph's own, through soft masks. They open, hold, blink once, and
    // catch the first of the light a moment before the room does.
    const ea = smooth(prog(t, B.eyes_in, B.eyes_in + 0.3)) * dark;
    if (ea > 0.003) {
      const u = t - (B.eyes_in + 0.54);
      const blink = u < 0 ? 0 : u < 0.07 ? smooth(u / 0.07) : u < 0.12 ? 1 : u < 0.26 ? 1 - smooth((u - 0.12) / 0.14) : 0;
      const open = (0.06 + 0.94 * ease.out3(prog(t, B.eyes_in, B.eyes_in + 0.24))) * (1 - blink);
      const breathe = 0.94 + 0.06 * Math.sin(t * 5.2);
      const spark = prog(t, LIGHTS - 0.15, LIGHTS) ** 2;
      for (const e of [eyeA, eyeB]) {
        const tint = EYE_TINT[e.id] || '255, 220, 160';
        const halo = cDark.createRadialGradient(e.cx, e.cy, e.r * 0.5, e.cx, e.cy, e.r * 2.3);
        halo.addColorStop(0, `rgba(${tint}, ${(0.20 + 0.25 * spark) * ea * open})`); halo.addColorStop(1, `rgba(${tint}, 0)`);
        cDark.globalAlpha = 1; cDark.fillStyle = halo;
        cDark.fillRect(e.cx - e.r * 2.4, e.cy - e.r * 2.4, e.r * 4.8, e.r * 4.8);
        cDark.save();
        cDark.beginPath();
        cDark.ellipse(e.cx, e.cy, e.rx * 1.3, Math.max(0.01, e.ry * 1.3 * open), (e.angle * Math.PI) / 180, 0, TAU);
        cDark.clip();
        cDark.globalAlpha = ea * breathe;
        cDark.drawImage(eyesImg, DARK.x0, DARK.y0, DARK.w, 340, DARK.x0, DARK.y0, DARK.w, 340);
        if (spark > 0) {
          const gx = e.cx - e.rx * 0.30;
          const gy = e.cy - e.ry * 0.34;
          const gg = cDark.createRadialGradient(gx, gy, 0, gx, gy, e.r * (0.16 + 0.30 * spark));
          gg.addColorStop(0, `rgba(255, 250, 235, ${0.95 * spark})`); gg.addColorStop(1, 'rgba(255, 244, 220, 0)');
          cDark.globalAlpha = ea; cDark.fillStyle = gg;
          cDark.fillRect(gx - e.r, gy - e.r, e.r * 2, e.r * 2);
        }
        cDark.restore();
      }
      cDark.globalAlpha = 1;
    }
    return true;
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
    const tf = Math.min(t, CUT);             // the party freezes dead when the song is cut
    const cam = camAt(tf);
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
      const Tb = layer(K.bg, cam);
      ctx.setTransform(Tb.s, 0, 0, Tb.s, Tb.x, Tb.y);
      ctx.globalAlpha = lights;
      ctx.drawImage(bgImg, -200, -150);
      // its lights
      const Tk = layer(K.bokeh, cam);
      ctx.setTransform(Tk.s, 0, 0, Tk.s, Tk.x, Tk.y);
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
      drawConfetti(ctx, far, tf, layer(K.far, cam), gust * 0.5, turn, W, H);
      // the room falls away into the corners; the cat and its hat keep their own light (see tools/cat/05_grade.py)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(vigImg, 0, 0);
    }
    // the cat (and, before the lights, only its bell and eyes)
    const Tc = layer(K.cat, cam);
    const cs = Tc.s * CAT_S;
    ctx.setTransform(cs, 0, 0, cs, Tc.x + Tc.s * CAT_X, Tc.y + Tc.s * CAT_Y);
    if (lit && !TYPE_ONLY) {
      ctx.globalAlpha = ease.out3(prog(tf, LIGHTS, LIGHTS + 0.2));
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(catImg, 0, 0);
      ctx.imageSmoothingQuality = 'low';
    }
    ctx.globalAlpha = 1;
    if (paintDark(t, 1 - prog(tf, LIGHTS, LIGHTS + 0.14))) ctx.drawImage(cDark.canvas, DARK.x0, DARK.y0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!lit) return;

    if (!TYPE_ONLY) {
      drawConfetti(ctx, mid, tf, layer(K.mid, cam), gust, turn, W, H);
      // out-of-focus foreground pieces
      const Tn = layer(K.near, cam);
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

    // ── type (not in the closer shot) ─────────────────────────────────────────────────────────
    if (!cam.close && tf >= T0) {
      const st = typeState(t, tf);
      const key = JSON.stringify(st);
      if (key !== painted) { paintType(st); painted = key; }
      const ts = 1 + (cam.z - 1) * K.type;
      ctx.setTransform(ts, 0, 0, ts, PIVOT.x * (1 - ts), PIVOT.y * (1 - ts));
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
    if (GRAIN && !TYPE_ONLY) {               // frozen with the picture at the cut
      const rg = mulberry(Math.round(tf * 30) * 13 + 5);
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
