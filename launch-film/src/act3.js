// Act 3 — the letter (91.5–100) and Teacher's Day: the title (100–106), "we ran the numbers" (106–124),
// the network that becomes THANK YOU (124–132) and the finale (132–140).
// Every frame is a pure function of the film time: styles and canvases are recomputed from t on each seek.
import { W, H, el, chars, onFrame, scene, mulberry, clamp, lerp, prog, ease, logoTile } from './lib.js';
import { COHORTS, cohortNodes, crossLinks } from './net.js';

const BRAND = '/dsba/public/brand';
const CAT_SRC = '../assets/cat/cat-party.png';
const NET_SMALL = 'one dot for each of us';
const CAT_RISE = 452;        // travel of the cat artwork; with the clear margin above the hat, hat and face end up about a third of the way into frame
const TAU = Math.PI * 2;
const GOLD = [245, 200, 107];
const GOLD2 = [255, 217, 138];
const GOLD3 = [184, 134, 43];
const GLINT = [255, 243, 196];
const CREAM = [246, 241, 227];
const NAVY = [9, 16, 46];
const rgb = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];

const E = {
  in2: (t) => t * t,
  out2: (t) => 1 - (1 - t) ** 2,
  io2: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  in3: ease.in3,
  out3: ease.out3,
  out5: ease.out5,
  io3: ease.inOut3,
  expo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  back: (s = 1.70158) => (t) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
};
/** Eased progress of a move that starts at t0 and lasts d seconds. */
const at = (t, t0, d, fn = E.out3) => fn(prog(t, t0, t0 + d));
/** Envelope through [time, value] keys, smooth-stepped between them. */
const keys = (k) => (t) => {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i += 1) {
    if (t < k[i][0]) {
      const p = (t - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return lerp(k[i - 1][1], k[i][1], p * p * (3 - 2 * p));
    }
  }
  return k[k.length - 1][1];
};
/** Style writes that skip values already set. */
const css = (n, o) => {
  const c = n.__c || (n.__c = {});
  for (const k of Object.keys(o)) if (c[k] !== o[k]) { c[k] = o[k]; n.style[k] = o[k]; }
};
const vis = (n, on) => css(n, { visibility: on ? 'inherit' : 'hidden' });
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Subscript digits (H₀) are not in the film's fonts: set them as real subscripts. */
const rich = (s) => esc(s).replace(/[₀-₉]/g, (c) => `<sub>${c.charCodeAt(0) - 0x2080}</sub>`);
const fmt = (v) => Math.round(v).toLocaleString('en-US');

/** Split a node's text into inline-block words. */
function words(node) {
  const parts = node.textContent.split(' ');
  node.textContent = '';
  return parts.map((w, i) => {
    const s = el('span', 'wd');
    s.textContent = i < parts.length - 1 ? `${w} ` : w;
    node.appendChild(s);
    return s;
  });
}
/** Staggered rise-and-fade for a list of spans. */
function rise(spans, t, t0, { stag = 0.05, dur = 0.5, dy = 40, fn = E.out5 } = {}) {
  spans.forEach((s, i) => {
    const p = at(t, t0 + i * stag, dur, fn);
    css(s, { opacity: p.toFixed(3), transform: `translateY(${((1 - p) * dy).toFixed(2)}px)` });
  });
}

/** A soft round glow, used for every particle in the act (cheaper and prettier than shadowBlur). */
function glowSprite(c) {
  const s = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.15, rgb(c, 0.95));
  gr.addColorStop(0.4, rgb(c, 0.2));
  gr.addColorStop(1, rgb(c, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
  return cv;
}
const SP_GOLD = glowSprite(GOLD2);
const SP_GLINT = glowSprite(GLINT);
/** Draw a glow whose bright core has radius r. */
const glow = (ctx, sp, x, y, r, a) => {
  if (a <= 0.004 || r <= 0) return;
  ctx.globalAlpha = a > 1 ? 1 : a;
  const d = r * 6.4;
  ctx.drawImage(sp, x - d, y - d, d * 2, d * 2);
};

// ───────────────────────────────────────────────────────── backdrop: moods, rays, dust, the drop's sparks
function buildBackdrop({ cues, stage }, FX) {
  const L = cues.letter;
  const D = cues.teachers_day.drop;
  const X = cues.teachers_day.end;
  const NW = cues.network;
  const F = cues.finale;
  const T0 = L.start;
  const T1 = cues.duration + 0.1;
  const root = scene(stage, 'a3bg', T0, T1, 'a3 a3-backdrop');
  root.innerHTML = `<div class="a3-bg a3-bg--cool"></div><div class="a3-bg a3-bg--warm"></div><div class="a3-bg a3-bg--paper"></div>
    <div class="a3-bloom"></div><canvas width="${W}" height="${H}"></canvas>`;
  const [cool, warm, paper] = root.querySelectorAll('.a3-bg');
  const bloom = root.querySelector('.a3-bloom');
  const ctx = root.querySelector('canvas').getContext('2d');
  // rays: wedges of light fading outward, drawn once at half size and turned as bitmaps
  const raysSprite = (radius, wedge, period, colour, solid) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = radius * 2;
    const g = cv.getContext('2d');
    g.fillStyle = colour;
    for (let a = 0; a < 360; a += period) {
      g.beginPath();
      g.moveTo(radius, radius);
      g.arc(radius, radius, radius, (a * Math.PI) / 180, ((a + wedge) * Math.PI) / 180);
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
    m.addColorStop(0, '#000');
    m.addColorStop(solid, '#000');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, radius * 2, radius * 2);
    return cv;
  };
  const raysA = raysSprite(702, 6, 15, 'rgba(255,217,138,.115)', 0.19);
  const raysB = raysSprite(498, 1.5, 10, 'rgba(255,243,196,.075)', 0.14);

  const kCool = keys([[T0, 0], [T0 + 1.8, 1]]);
  const kWarm = keys([[D - 0.02, 0], [D, 1], [X - 0.8, 1], [X, 0], [F.start - 0.2, 0], [F.start + 1.8, 0.5]]);
  const kPaper = keys([[X - 0.8, 0], [X, 1], [NW.start - 0.3, 1], [NW.start + 0.5, 0]]);
  const kRays = keys([[D - 0.01, 0], [D + 0.12, 1], [X - 0.85, 1], [X - 0.2, 0], [F.title, 0], [F.title + 2.2, 0.28]]);
  const kBloom = keys([[D - 0.01, 0], [D, 1], [D + 1.4, 0.55], [X - 0.85, 0.55], [X - 0.2, 0], [F.title, 0], [F.title + 1.8, 0.4]]);
  const kAmb = keys([[T0 + 3.4, 0], [L.dissolve - 1.6, 0.5], [D, 1], [X - 0.7, 1], [X + 0.1, 0.4], [NW.start - 0.4, 0.4], [NW.start + 0.6, 0.6], [F.start - 0.2, 0.6], [F.start + 1.4, 1]]);

  const r = mulberry(9151);
  const amb = Array.from({ length: 150 }, () => ({ x: r() * W, y: r() * (H + 60), v: 7 + r() * 24, a: 10 + r() * 36, f: 0.2 + r() * 0.6, s: 0.9 + r() ** 2 * 2.3, ph: r() * TAU, tw: 0.5 + r() * 1.5 }));
  const riseT = L.dissolve - 2.8;                 // gold dust starts to gather under the last lines
  const riser = Array.from({ length: 220 }, () => ({ b: riseT + r() ** 0.6 * 3.3, x: r() * W, v: 180 + r() * 520, a: 20 + r() * 60, f: 0.5 + r() * 1.5, s: 1.2 + r() * 2.5 }));
  const diss = Array.from({ length: 170 }, () => ({ u: r(), w: r(), h: r(), b: L.dissolve + 0.03 + r() * 0.36, v: 110 + r() * 420, a: 8 + r() * 30, f: 2 + r() * 5, s: 1 + r() * 2.1, ph: r() * TAU }));
  FX.sparks = Array.from({ length: 520 }, (_, i) => {
    const an = r() * TAU;
    const v = 260 + r() ** 0.7 * 1700;
    const big = r() < 0.14;
    return { vx: Math.cos(an) * v, vy: Math.sin(an) * v * 0.8, life: 1.8 + r() * 3, s: (0.9 + r() * 1.9) * (big ? 2.2 : 1), dim: big ? 0.45 : 1, sp: r() < 0.7 ? SP_GOLD : SP_GLINT, front: i % 6 === 0 };
  });
  FX.drawSparks = (c, tau, front) => {
    const k = 1.5;
    const at2 = (tt) => { const d = (1 - Math.exp(-k * tt)) / k; return [d, 150 * tt * tt]; };
    const [d, g] = at2(tau);
    const [d0, g0] = at2(Math.max(0, tau - 0.04));
    c.lineCap = 'round';
    for (const p of FX.sparks) {
      if (p.front !== front || tau > p.life) continue;
      const x = 960 + p.vx * d;
      const y = 470 + p.vy * d + g;
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const al = clamp(1 - tau / p.life) ** 1.4 * p.dim;
      const x0 = 960 + p.vx * d0;
      const y0 = 470 + p.vy * d0 + g0;
      if (Math.abs(x - x0) + Math.abs(y - y0) > 5) {          // still fast: leave a streak
        c.globalAlpha = al * 0.55;
        c.strokeStyle = rgb(GOLD2);
        c.lineWidth = p.s * 1.5;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x, y);
        c.stroke();
      }
      glow(c, p.sp, x, y, p.s * (1 + 0.5 * clamp(1 - tau)), al);
    }
  };
  FX.titleOut = (t) => 1 - at(t, X - 0.9, 0.6, E.in2);
  // the dust keeps one clock for the whole act; it runs fast into the drop and settles after it
  const clock = (t) => {
    let u = t - T0 + 13 * prog(t, D - 2.8, D) ** 3;
    if (t > D) u += 7 * (1 - Math.exp(-(t - D) / 0.5));
    return u;
  };

  onFrame((t) => {
    if (t < T0 || t >= T1) return;
    css(cool, { opacity: kCool(t).toFixed(3) });
    css(warm, { opacity: kWarm(t).toFixed(3) });
    css(paper, { opacity: kPaper(t).toFixed(3) });
    const cy = t < F.start ? 470 : 336;                    // the light sits behind whichever title is on screen
    css(bloom, { opacity: (kBloom(t) * (1 + 0.07 * Math.sin((t - D) * Math.PI))).toFixed(3), transform: `translateY(${cy - 470}px)` });

    ctx.clearRect(0, 0, W, H);
    const ro = kRays(t);
    if (ro > 0.004) {
      const rot = ((t < F.start ? (t - D) * 5 : (F.start - D) * 5 + (t - F.start) * 2.2) * Math.PI) / 180;
      const turn = (sp, a, sc) => {
        ctx.save();
        ctx.translate(960, cy);
        ctx.rotate(a);
        ctx.scale(sc, sc);
        ctx.globalAlpha = Math.min(1, ro);
        ctx.drawImage(sp, -sp.width / 2, -sp.height / 2);
        ctx.restore();
      };
      turn(raysA, rot, 2 * (0.7 + 0.3 * at(t, D, 0.9, E.out5)));
      turn(raysB, -rot * 0.55, 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    // ambient dust
    const aa = kAmb(t);
    if (aa > 0.005) {
      const u = clock(t);
      for (const p of amb) {
        const y = ((((p.y - p.v * u) % (H + 60)) + (H + 60)) % (H + 60)) - 30;
        glow(ctx, SP_GOLD, p.x + Math.sin(u * p.f + p.ph) * p.a, y, p.s, aa * (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(u * p.tw + p.ph * 3))));
      }
    }
    // the letter: dust gathers and rises toward the drop, and the words themselves go up as dust
    if (t >= riseT && t < D + 1.6) {
      const fade = 1 - prog(t, D, D + 1.6);
      for (const p of riser) {
        if (t < p.b) continue;
        const tau = t - p.b;
        const y = H + 20 - p.v * tau * (1 + tau * 0.5);
        if (y < -20) continue;
        glow(ctx, SP_GOLD, p.x + Math.sin(tau * p.f * 4) * p.a, y, p.s, clamp(tau * 3) * 0.85 * fade);
      }
      const rects = FX.letterRects ? FX.letterRects() : null;
      if (rects && t >= L.dissolve) {
        for (const p of diss) {
          if (t < p.b) continue;
          const tau = t - p.b;
          let acc = 0;
          let rc = rects[rects.length - 1];
          for (const q of rects) { acc += q.share; if (p.u < acc) { rc = q; break; } }
          const x = rc.x + p.w * rc.w + Math.sin(tau * p.f + p.ph) * p.a * tau;
          const y = rc.y + (0.28 + 0.5 * p.h) * rc.h - p.v * tau * (0.5 + tau * 1.6);
          if (y < -20) continue;
          glow(ctx, p.u > 0.5 ? SP_GOLD : SP_GLINT, x, y, p.s, clamp(tau * 7) * 0.9 * fade);
        }
      }
    }
    // the drop: a burst of sparks behind the title
    const td = t - D;
    if (td >= 0 && td < 5.2) FX.drawSparks(ctx, td, false);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (td >= 0 && t < X && FX.drawFlecks) FX.drawFlecks(ctx, td, FX.titleOut(t), false);
    ctx.globalAlpha = 1;
  });
}

// ───────────────────────────────────────────────────────── front layer: the gold flash, sparks and foil in front of the title
function buildFront({ cues, stage }, FX) {
  const L = cues.letter;
  const D = cues.teachers_day.drop;
  const X = cues.teachers_day.end;
  const T0 = L.start;
  const T1 = cues.duration + 0.1;
  const root = scene(stage, 'a3fx', T0, T1, 'a3 a3-front');
  root.innerHTML = `<canvas width="${W}" height="${H}"></canvas><div class="a3-burst"></div><div class="a3-flash"></div>`;
  const cv = root.firstChild;
  const ctx = cv.getContext('2d');
  const burst = root.querySelector('.a3-burst');
  const flash = root.lastChild;
  const r = mulberry(4410);
  const tones = [GOLD, GOLD2, GLINT, GOLD3, GOLD2];
  const flecks = Array.from({ length: 76 }, () => {
    const an = -Math.PI / 2 + (r() - 0.5) * 2.7;
    const v = 520 + r() * 1150;
    return { x0: 960 + (r() - 0.5) * 620, y0: 470 + (r() - 0.5) * 140, vx: Math.cos(an) * v, vy: Math.sin(an) * v, w: 9 + r() * 13, h: 5 + r() * 7, sp: 3 + r() * 6, rot: r() * TAU, rs: (r() - 0.5) * 5, sway: 16 + r() * 50, sf: 0.8 + r() * 2, fall: 105 + r() * 120, c: tones[Math.floor(r() * tones.length)] };
  });
  /** Foil thrown up by the drop, fluttering down; `front` picks the half in front of (or behind) the title. */
  FX.drawFlecks = (c, td, out, front) => {
    const k = 2.2;
    const d = (1 - Math.exp(-k * td)) / k;
    flecks.forEach((p, i) => {
      if ((i % 2 === 0) !== front) return;
      const x = p.x0 + p.vx * d + Math.sin(td * p.sf + p.rot) * p.sway * clamp(td);
      const y = p.y0 + p.vy * d + p.fall * (td - d) * (1 + 0.12 * td);
      if (y > H + 30 || y < -40 || x < -40 || x > W + 40) return;
      const flip = Math.cos(td * p.sp + p.rot);
      c.save();
      c.translate(x, y);
      c.rotate(p.rot + td * p.rs);
      c.scale(1, flip);
      c.globalAlpha = clamp(td * 8) * out * (0.55 + 0.45 * Math.abs(flip)) * (front ? 1 : 0.7);
      c.fillStyle = rgb(flip > 0 ? p.c : mix(p.c, GOLD3, 0.55));
      c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      c.restore();
    });
  };
  // glints that catch on the foil while the title holds: [x, y, seconds after the drop]
  const glints = [[212, 398, 1.25], [1118, 396, 1.75], [1452, 404, 2.3], [742, 372, 2.95], [1716, 596, 3.5], [468, 548, 4.1]];
  onFrame((t) => {
    if (t < T0 || t >= T1) return;
    const bq = t < D ? prog(t, L.flash, D) : 0;
    css(burst, { opacity: clamp(bq * 9).toFixed(3), transform: `scale(${lerp(0.16, 2.3, E.in2(bq)).toFixed(4)})` });
    const iris = prog(t, D, D + 0.46);
    const hole = 1560 * E.out2(iris);
    css(flash, {
      visibility: t >= D && iris < 1 ? 'inherit' : 'hidden',
      webkitMaskImage: iris <= 0 ? 'none' : `radial-gradient(circle at 960px 475px, rgba(0,0,0,0) ${Math.max(0, hole - 420).toFixed(1)}px, rgba(0,0,0,${(1 - 0.5 * iris).toFixed(3)}) ${hole.toFixed(1)}px)`,
    });
    const td = t - D;
    const on = td >= 0 && t < X;
    vis(cv, on);
    if (!on) return;
    ctx.clearRect(0, 0, W, H);
    FX.drawFlecks(ctx, td, FX.titleOut(t), true);
    ctx.globalCompositeOperation = 'lighter';
    FX.drawSparks(ctx, td, true);
    for (const [gx, gy, g0] of glints) {
      const q = prog(td, g0, g0 + 0.75);
      if (q <= 0 || q >= 1) continue;
      const sz = Math.sin(Math.PI * q);
      glow(ctx, SP_GLINT, gx, gy, 5 * sz, 0.9 * sz);
      ctx.save();
      ctx.translate(gx, gy);
      ctx.rotate(q * 0.9 - 0.3);
      ctx.globalAlpha = sz;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) { const an = (i * Math.PI) / 4; const rr = i % 2 ? 3 : (i % 4 ? 26 : 44) * sz; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  });
}

// ───────────────────────────────────────────────────────── s09 the letter
function buildLetter({ cues, stage, S }, FX) {
  const T = cues.letter;
  const { start, end } = S('s09');
  const root = scene(stage, 's09', start, end, 'a3 a3-letter');
  const block = el('div', 'lt-block');
  root.appendChild(block);
  const last = T.lines.length - 1;
  const lines = T.lines.map((ln, i) => {
    const p = el('div', `lt-ln${i === 0 ? ' lt-dear' : ''}${i === last ? ' lt-last' : ''}${i === last - 1 ? ' lt-turn' : ''}`, '<span class="lt-tx"></span><i class="lt-caret"></i>');
    block.appendChild(p);
    return { t: ln.t, text: ln.text, end: ln.t + ln.text.length / T.cps, p, tx: p.firstChild, caret: p.lastChild };
  });
  // where the words are on screen, for the dust they dissolve into (measured once the fonts are in)
  let rects = null;
  FX.letterRects = () => {
    if (!rects) {
      const m = document.createElement('canvas').getContext('2d');
      rects = lines.map((ln) => {
        const cs = getComputedStyle(ln.p);
        m.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return { x: block.offsetLeft + ln.p.offsetLeft, y: block.offsetTop + ln.p.offsetTop, w: m.measureText(ln.text).width, h: ln.p.offsetHeight };
      });
      const sum = rects.reduce((a, q) => a + q.w, 0);
      rects.forEach((q) => { q.share = q.w / sum; });
    }
    return rects;
  };
  onFrame((t) => {
    if (t < start || t >= end) return;
    let cur = 0;
    lines.forEach((ln, i) => { if (t >= ln.t) cur = i; });
    lines.forEach((ln, i) => {
      // one character per tick; the newest letters are still "wet" and settle in over a few frames
      const k = t < ln.t ? 0 : Math.min(ln.text.length, Math.floor((t - ln.t) * T.cps + 1e-6) + 1);
      const s = ln.text.slice(0, k);
      if (ln.tx.textContent !== s) ln.tx.textContent = s;
      const dry = clamp((t - ln.end) / 0.14);
      css(ln.tx, { webkitMaskImage: k === 0 || dry >= 1 ? 'none' : `linear-gradient(90deg, #000 calc(100% - 2em), rgba(0,0,0,${(0.1 + 0.9 * dry).toFixed(3)}) calc(100% - .6em))` });
      let ca = 0;
      if (i === cur && t < T.dissolve) ca = t < ln.end ? 1 : 0.5 + 0.5 * Math.cos((t - ln.end) * TAU * 1.5);
      css(ln.caret, { opacity: ca.toFixed(3) });
    });
    const d = at(t, T.dissolve, 0.5, E.in2);
    css(block, { opacity: (1 - d).toFixed(3), transform: `translateY(${(-46 * d).toFixed(2)}px)`, filter: d > 0 ? `blur(${(14 * d).toFixed(2)}px)` : 'none' });
  });
}

// ───────────────────────────────────────────────────────── s10 the title
function buildTitle({ cues, stage, S }) {
  const TD = cues.teachers_day;
  const D = TD.drop;
  const { start, end } = S('s10');
  const root = scene(stage, 's10', start, end, 'a3 a3-td');
  const [first, ...rest] = cues.finale.title_text.split(' ');
  const name = esc(rest.join(' '));
  root.innerHTML = `<div class="td-head"><div class="td-happy"><i class="td-rule td-rule--l"></i><span class="td-happy-tx">${esc(first.toUpperCase())}</span><i class="td-rule td-rule--r"></i></div>
    <div class="td-title"><span class="td-foil">${name}</span><span class="td-glint">${name}</span></div>
    <div class="td-sub">${esc(TD.subline_text)}</div></div>`;
  const head = root.firstChild;
  const title = root.querySelector('.td-title');
  const foil = root.querySelector('.td-foil');
  const glint = root.querySelector('.td-glint');
  const sub = root.querySelector('.td-sub');
  const hap = chars(root.querySelector('.td-happy-tx'));
  const [ruleL, ruleR] = root.querySelectorAll('.td-rule');
  const OUT = TD.end - 0.8;        // the title leaves the stage for the figures
  onFrame((t) => {
    if (t < start || t >= end) return;
    const p = at(t, D, 0.75, E.expo);
    const out = at(t, OUT, 0.62, E.io3);
    const push = 1 + 0.035 * prog(t, D + 0.5, OUT + 0.62);
    css(head, { opacity: (1 - out).toFixed(3), transform: `translateY(${(-170 * out).toFixed(2)}px) scale(${(push * lerp(1, 0.66, out)).toFixed(4)})`, filter: out > 0 ? `blur(${(10 * out).toFixed(2)}px)` : 'none' });
    const halo = 0.45 + 0.35 * (1 - at(t, D, 1.8, E.out2));
    css(title, { opacity: clamp(p * 1.6).toFixed(3), transform: `scale(${lerp(2.5, 1, p).toFixed(4)})`, filter: `drop-shadow(0 10px 44px rgba(245,200,107,${halo.toFixed(3)}))${p < 1 ? ` blur(${(20 * (1 - p)).toFixed(2)}px)` : ''}` });
    css(foil, { backgroundPosition: `${lerp(100, 0, at(t, D + 1.0, 1.7, E.io2)).toFixed(2)}% 0` });
    css(glint, { backgroundPosition: `${lerp(100, 0, at(t, D + 1.05, 1.5, E.io2)).toFixed(2)}% 0` });
    hap.forEach((c, i) => {
      const q = at(t, D + 0.12 + i * 0.06, 0.5, E.out3);
      css(c, { opacity: q.toFixed(3), transform: `translateY(${((1 - q) * 40).toFixed(2)}px)` });
    });
    const rq = at(t, D + 0.42, 0.9, E.out5).toFixed(4);
    css(ruleL, { transform: `scaleX(${rq})` });
    css(ruleR, { transform: `scaleX(${rq})` });
    const sq = at(t, TD.subline, 0.6, E.out3);
    css(sub, { opacity: (sq * (1 - at(t, OUT - 0.12, 0.3, E.in2))).toFixed(3), transform: `translateY(${((1 - sq) * 34).toFixed(2)}px)` });
  });
}

// ───────────────────────────────────────────────────────── s11 "we ran the numbers": chart drawing kit
const INK = { text: rgb(CREAM, 0.94), tick: rgb(CREAM, 0.78), dim: rgb(CREAM, 0.62), axis: rgb(GOLD, 0.66), grid: rgb(GOLD, 0.15) };
const FONT = { tick: '500 30px JBMono', val: '700 34px JBMono' };
function label(ctx, s, x, y, { font = FONT.tick, fill = INK.tick, align = 'center', base = 'alphabetic', a = 1 } = {}) {
  if (a <= 0.004) return;
  ctx.save();
  ctx.globalAlpha *= clamp(a);
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, x, y);
  ctx.restore();
}
function seg(ctx, x0, y0, x1, y1, { stroke = INK.axis, w = 2, a = 1, dash = null, cap = 'butt', add = false } = {}) {
  if (a <= 0.004) return;
  ctx.save();
  if (add) ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= clamp(a);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.restore();
}
/** Start a chart frame from a clean slate (context state survives between frames). */
const wipe = (ctx) => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.clearRect(0, 0, W, H);
};
const trace = (ctx, pts) => { pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); };

/** ∞ is not in the film's fonts, so it is drawn: a lemniscate of Bernoulli with a broad-nib stroke. */
function infinity(a, wMax) {
  const n = 240;
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const th = (i / n) * TAU;
    const s = Math.sin(th);
    const c = Math.cos(th);
    pts.push([(a * c) / (1 + s * s), (a * s * c) / (1 + s * s)]);
  }
  const pad = wMax + 6;
  const w = Math.ceil(2 * a + 2 * pad);
  const h = Math.ceil(0.72 * a + 2 * pad);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  g.translate(w / 2, h / 2);
  g.lineCap = 'round';
  const gr = g.createLinearGradient(0, -0.38 * a, 0, 0.38 * a);
  gr.addColorStop(0, '#fff3c4');
  gr.addColorStop(0.4, '#f5c86b');
  gr.addColorStop(0.78, '#c9963a');
  gr.addColorStop(1, '#f1c264');
  g.strokeStyle = gr;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    g.lineWidth = wMax * (0.24 + 0.76 * Math.abs(Math.sin(Math.atan2(y1 - y0, x1 - x0) + Math.PI / 4)));
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  // a soft halo, blurred once
  const hp = Math.ceil(wMax * 2.4);
  const halo = document.createElement('canvas');
  halo.width = w + 2 * hp;
  halo.height = h + 2 * hp;
  const hg = halo.getContext('2d');
  hg.filter = `blur(${Math.round(wMax * 0.7)}px)`;
  hg.drawImage(cv, hp, hp);
  return { cv, halo, hp, pts, w, h, n, wMax };
}
function drawInfinity(ctx, inf, cx, cy, scale, alpha, run) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha * 0.5;
  ctx.drawImage(inf.halo, -inf.w / 2 - inf.hp, -inf.h / 2 - inf.hp);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;
  ctx.drawImage(inf.cv, -inf.w / 2, -inf.h / 2);
  if (run != null) {                       // a light that keeps going round: "…and counting"
    ctx.globalCompositeOperation = 'lighter';
    const head = ((((run * 0.42) % 1) + 1) % 1) * inf.n;
    for (let j = 0; j < 30; j += 1) {
      const q = inf.pts[((Math.round(head - j * 1.5) % inf.n) + inf.n) % inf.n];
      glow(ctx, SP_GLINT, q[0], q[1], lerp(7, 2.5, j / 30), alpha * (1 - j / 30) ** 2 * 0.85);
    }
  }
  ctx.restore();
}

// ───────────────────────── figure 1: bars that outgrow every axis
function figExam(card, ui) {
  vis(ui.punch, false);
  vis(ui.stamp, false);
  const { ctx } = ui;
  const P = { x0: 250, x1: 1160, y0: 330, y1: 850 };
  const PW = P.x1 - P.x0;
  const PH = P.y1 - P.y0;
  const B = card.punch_t - card.build;
  const cols = COHORTS.map((c) => hex(c.hex));
  const bx = cols.map((_, i) => P.x0 + (PW * (i + 0.5)) / cols.length);
  const BW = 170;
  const ratio = [0.68, 1, 0.5];
  // the choreography, in fractions of build → punch: grow to the top, the axis rescales, grow again, faster each time
  const M = [20, 100, 1000, 10000];
  const RS = [[0.28, 0.4], [0.58, 0.68], [0.8, 0.86]];
  const V = [[0, 11], [0.28, 20.6], [0.4, 28], [0.58, 103], [0.68, 135], [0.8, 1030], [0.86, 1400], [0.93, 12000], [1, 90000]];
  const vmax = (tau) => {
    for (let i = 1; i < V.length; i += 1) if (tau < V[i][0]) return 10 ** lerp(Math.log10(V[i - 1][1]), Math.log10(V[i][1]), (tau - V[i - 1][0]) / (V[i][0] - V[i - 1][0]));
    return Infinity;
  };
  const big = infinity(232, 31);
  const small = infinity(24, 5);
  return (t) => {
    const a = t - card.t;
    const tau = (t - card.build) / B;
    const p = t - card.punch_t + 1e-6;
    wipe(ctx);
    let k = 0;
    let q = 0;
    for (let i = 0; i < RS.length; i += 1) {
      if (tau >= RS[i][1]) { k = i + 1; continue; }
      if (tau > RS[i][0]) q = E.io2((tau - RS[i][0]) / (RS[i][1] - RS[i][0]));
      break;
    }
    const Mcur = 10 ** lerp(Math.log10(M[k]), Math.log10(M[Math.min(k + 1, M.length - 1)]), q);
    const gone = p >= 0 ? E.out3(prog(p, 0, 0.26)) : 0;      // at the punch every finite tick falls to the baseline
    const gIn = at(a, 0.18, 0.45, E.out2);
    const ticks = (m, alpha) => {
      for (let j = 1; j <= 4; j += 1) {
        const y = P.y1 - (((m * j) / 4 / Mcur) * PH) * (1 - gone);
        const al = alpha * clamp(1 - (P.y0 - y) / 46) * (1 - gone) ** 3 * gIn;
        if (al <= 0.01) continue;
        seg(ctx, P.x0, y, P.x1, y, { stroke: INK.grid, a: al });
        label(ctx, fmt((m * j) / 4), P.x0 - 20, y + 1, { align: 'right', base: 'middle', a: al });
      }
    };
    ticks(M[k], (1 - q) ** 2);
    if (q > 0) ticks(M[k + 1], q);
    if (gone > 0) {
      for (let j = 1; j <= 4; j += 1) seg(ctx, P.x0, P.y1 - (PH * j) / 4, P.x1, P.y1 - (PH * j) / 4, { stroke: INK.grid, a: gone });
      const s = E.back(2.6)(prog(p, 0.02, 0.34));
      ctx.save();
      ctx.translate(P.x0 - 48, P.y0);
      ctx.scale(s, s);
      ctx.globalAlpha = clamp(p / 0.08);
      ctx.drawImage(small.cv, -small.w / 2, -small.h / 2);
      ctx.restore();
    }
    label(ctx, '0', P.x0 - 20, P.y1 + 1, { align: 'right', base: 'middle', a: gIn });
    // bars
    const ent = at(a, 0.42, 0.46, E.out3);
    const vm = tau <= 0 ? V[0][1] * ent : vmax(tau);
    cols.forEach((c, i) => {
      const v = p >= 0 ? Infinity : vm * ratio[i % ratio.length] * (1 + (tau > 0 ? 0.09 * Math.sin(tau * 7 + i * 2.1) : 0));
      const yt = v === Infinity ? -80 : Math.max(-80, P.y1 - (v / Mcur) * PH);
      const hgt = P.y1 - yt;
      if (hgt < 1) return;
      const x = bx[i] - BW / 2;
      const g = ctx.createLinearGradient(0, P.y1, 0, 0);
      g.addColorStop(0, rgb(c, 0.97));
      g.addColorStop(1 - P.y0 / P.y1, rgb(c, 0.97));
      g.addColorStop(1 - 236 / P.y1, rgb(c, 0.5));
      g.addColorStop(1, rgb(c, 0.2));
      ctx.fillStyle = g;
      const rr = Math.min(10, hgt / 2);
      ctx.beginPath();
      ctx.moveTo(x, P.y1);
      ctx.lineTo(x, yt + rr);
      ctx.quadraticCurveTo(x, yt, x + rr, yt);
      ctx.lineTo(x + BW - rr, yt);
      ctx.quadraticCurveTo(x + BW, yt, x + BW, yt + rr);
      ctx.lineTo(x + BW, P.y1);
      ctx.closePath();
      ctx.fill();
      const over = clamp((P.y0 - yt) / 240);                 // once through the roof, light keeps travelling up the bar
      if (over > 0) {
        for (let b = 0; b < 2; b += 1) {
          const u = ((((t - card.punch_t) * 0.8 + b * 0.5 + i * 0.21) % 1) + 1) % 1;
          const yb = P.y1 - u * (P.y1 + 300);
          const band = ctx.createLinearGradient(0, yb, 0, yb + 300);
          band.addColorStop(0, 'rgba(255,255,255,0)');
          band.addColorStop(0.5, `rgba(255,255,255,${(0.2 * over * Math.sin(Math.PI * u)).toFixed(3)})`);
          band.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = band;
          ctx.fillRect(x, Math.max(yb, 0), BW, Math.min(300, P.y1 - Math.max(yb, 0)));
        }
      }
      if (v !== Infinity && yt > 70) label(ctx, fmt(v), bx[i], yt - 16, { font: FONT.val, fill: INK.text, a: ent });
    });
    // baseline and categories
    seg(ctx, P.x0, P.y1, lerp(P.x0, P.x1, at(a, 0.1, 0.55, E.out3)), P.y1, { w: 2.5 });
    COHORTS.forEach((c, i) => label(ctx, c.label, bx[i], P.y1 + 52, { fill: INK.text, a: at(a, 0.3 + i * 0.07, 0.4) }));
    if (p > -0.07) drawInfinity(ctx, big, 1510, 546, 0.5 + 0.5 * E.back(2.4)(prog(p, -0.07, 0.3)), clamp((p + 0.07) / 0.1), p);
    return null;
  };
}

// ───────────────────────── figure 2: the null hypothesis, tested
function figH0(card, ui) {
  vis(ui.punch, false);
  const { ctx } = ui;
  const B = card.punch_t - card.build;
  const XL = 180;
  const ZU = 132;
  const ZL = -3.7;
  const ZR = 3.7;
  const X = (z) => XL + (z - ZL) * ZU;
  const XA = X(ZR);                      // where the printed scale ends
  const Y0 = 830;
  const K = 1250;
  const pdf = (z) => Math.exp((-z * z) / 2) / Math.sqrt(TAU);
  const ZC = 1.645;                      // one-sided 5% critical value
  const Z0 = 0.42;
  const ZBIG = 47.3;
  const XR = 1510;
  const curve = [];
  for (let i = 0; i <= 148; i += 1) { const z = ZL + (i * (ZR - ZL)) / 148; curve.push([X(z), Y0 - pdf(z) * K]); }
  const tail = curve.filter((q) => q[0] >= X(ZC));
  tail.unshift([X(ZC), Y0 - pdf(ZC) * K]);
  const zAt = (x) => (x <= XA ? (x - XL) / ZU + ZL : ZR + ((x - XA) / (XR - XA)) ** 1.7 * (ZBIG - ZR));
  const xAt = (tau) => lerp(X(Z0), XR, E.io3(prog(tau, 0.36, 0.86)));
  return (t) => {
    const a = t - card.t;
    const tau = (t - card.build) / B;
    const p = t - card.punch_t + 1e-6;
    wipe(ctx);
    const xm = xAt(tau);
    const hot = tau > 0 ? clamp((xm - X(ZC)) / 60) : 0;      // the statistic is past the critical value
    const under = 1 - 0.9 * at(p, 0, 0.2, E.out2);           // the notes the stamp lands on step back
    // the curve draws itself, left to right
    const xRev = lerp(XL, XA, at(a, 0.26, 0.64, E.io2));
    const shown = curve.filter((q) => q[0] <= xRev);
    if (shown.length > 1) {
      const lastX = shown[shown.length - 1][0];
      ctx.beginPath();
      ctx.moveTo(XL, Y0);
      shown.forEach((q) => ctx.lineTo(q[0], q[1]));
      ctx.lineTo(lastX, Y0);
      ctx.closePath();
      ctx.fillStyle = rgb(GOLD, 0.085);
      ctx.fill();
    }
    // rejection region: the right tail beyond the critical value, shaded and hatched
    const crit = at(a, 0.62, 0.32, E.out3);
    if (crit > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(X(ZC), Y0);
      tail.forEach((q) => ctx.lineTo(q[0], q[1]));
      ctx.lineTo(XA, Y0);
      ctx.closePath();
      ctx.globalAlpha = crit;
      ctx.fillStyle = rgb(GOLD, lerp(0.3, 0.6, hot));
      ctx.fill();
      ctx.clip();
      ctx.strokeStyle = rgb(GLINT, lerp(0.5, 0.85, hot));
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = X(ZC) - 130; x < XA; x += 13) { ctx.moveTo(x, Y0); ctx.lineTo(x + 130, Y0 - 130); }
      ctx.stroke();
      ctx.restore();
    }
    if (shown.length > 1) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      trace(ctx, shown);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgb(GOLD, 0.13);
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = rgb(GOLD2);
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
    }
    // axis
    const ax = at(a, 0.1, 0.55, E.out3);
    seg(ctx, XL, Y0, lerp(XL, XA, ax), Y0, { w: 2.5 });
    for (let z = -3; z <= 3; z += 1) {
      const al = at(a, 0.2 + (z + 3) * 0.035, 0.3);
      seg(ctx, X(z), Y0, X(z), Y0 + 13, { a: al });
      label(ctx, z < 0 ? `−${-z}` : `${z}`, X(z), Y0 + 50, { a: al });
    }
    label(ctx, 'test statistic (z)', (XL + XA) / 2, Y0 + 106, { fill: INK.dim, a: at(a, 0.4, 0.4) });
    // critical value
    seg(ctx, X(ZC), Y0, X(ZC), lerp(Y0, 452, crit), { stroke: rgb(CREAM, 0.75), w: 2.5, dash: [10, 9], a: crit * (0.4 + 0.6 * under) });
    const cl = at(a, 0.72, 0.3) * under;
    label(ctx, 'critical value', X(ZC) + 18, 474, { align: 'left', fill: INK.dim, a: cl });
    label(ctx, `z = ${ZC}`, X(ZC) + 18, 514, { align: 'left', fill: INK.text, a: cl });
    seg(ctx, 962, 672, 932, 772, { stroke: rgb(CREAM, 0.6), w: 2, a: cl });
    ctx.save();
    ctx.globalAlpha = cl;
    ctx.fillStyle = rgb(CREAM, 0.8);
    ctx.beginPath();
    ctx.arc(932, 772, 4.5, 0, TAU);
    ctx.fill();
    ctx.restore();
    const rj = rgb(mix(CREAM, GOLD2, hot), 0.92);
    label(ctx, 'reject H', 958, 656, { align: 'left', fill: rj, a: cl });
    label(ctx, '0', 958 + 8 * 18.06 + 2, 664, { font: '500 21px JBMono', align: 'left', fill: rj, a: cl });
    // the observed statistic: drops in, then leaves the scale altogether
    if (tau > 0) {
      const ext = clamp((xm - (XA - 70)) / 130);
      if (ext > 0) {                          // the axis has to break to keep up
        seg(ctx, XA + 16, Y0 + 13, XA + 28, Y0 - 13, { w: 2.5, a: ext });
        seg(ctx, XA + 30, Y0 + 13, XA + 42, Y0 - 13, { w: 2.5, a: ext });
        const xe = Math.min(1800, xm + 170);
        const g = ctx.createLinearGradient(xe - 150, 0, xe, 0);
        g.addColorStop(0, rgb(GOLD, 0.62));
        g.addColorStop(1, rgb(GOLD, 0));
        seg(ctx, XA + 58, Y0, xe, Y0, { stroke: g, w: 3, dash: [2, 13], cap: 'round', a: ext });
      }
      const dr = E.out3(prog(tau, 0, 0.16));
      const m = E.io2(prog(xm, XA + 20, XR));
      const yTop = lerp(338, 668, m);
      const xg = xAt(tau - 0.05);                             // a tail of light while it travels
      if (xm - xg > 2) {
        const tail2 = ctx.createLinearGradient(xg, 0, xm, 0);
        tail2.addColorStop(0, rgb(GOLD2, 0));
        tail2.addColorStop(1, rgb(GOLD2, 0.24));
        ctx.fillStyle = tail2;
        ctx.fillRect(xg, yTop, xm - xg, Y0 - yTop);
      }
      seg(ctx, xm, yTop, xm, lerp(yTop, Y0, dr), { stroke: rgb(GOLD, 0.2), w: 14, cap: 'round', add: true });
      seg(ctx, xm, yTop, xm, lerp(yTop, Y0, dr), { stroke: rgb(GLINT), w: 4, cap: 'round' });
      const ds = 14 * E.back(2.6)(prog(tau, 0.1, 0.3));
      if (ds > 0) {
        ctx.save();
        ctx.translate(xm, Y0);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = rgb(NAVY);
        ctx.fillRect(-ds - 4, -ds - 4, 2 * ds + 8, 2 * ds + 8);
        ctx.fillStyle = rgb(GLINT);
        ctx.fillRect(-ds, -ds, 2 * ds, 2 * ds);
        ctx.restore();
      }
      const z = zAt(xm);
      const fs = lerp(38, 80, m);
      const ty = lerp(322, 560, m);
      label(ctx, `z = ${z < 10 ? z.toFixed(2) : z.toFixed(1)}`, xm, ty, { font: `700 ${fs.toFixed(1)}px JBMono`, fill: rgb(GOLD2), a: dr });
      label(ctx, 'observed', xm, ty - fs - 6, { fill: INK.dim, a: dr });
    }
    // the stamp: it arrives just before the hit, lands on it, and the page shakes
    const sp = p + 0.1;
    if (sp < 0) { css(ui.stampB, { opacity: '0' }); return null; }
    const sc = p < 0 ? lerp(2.2, 0.93, E.in2(sp / 0.1)) : lerp(0.93, 1, E.out3(prog(p, 0, 0.16)));
    css(ui.stampB, { opacity: clamp(sp / 0.04).toFixed(3), transform: `translate(-50%, -50%) rotate(${lerp(-13, -7, E.out3(sp / 0.1 > 1 ? 1 : sp / 0.1)).toFixed(2)}deg) scale(${sc.toFixed(4)})` });
    if (p < 0) return null;
    const sh = Math.exp(-p / 0.075);
    return p < 0.5 ? [9 * sh * Math.cos(p * 95), 7 * sh * Math.sin(p * 80 + 1)] : null;
  };
}

// ───────────────────────── figure 3: a scatter that turns out to be a heart
function figHeart(card, ui) {
  vis(ui.stamp, false);
  const { ctx } = ui;
  const P = { x0: 250, x1: 1160, y0: 330, y1: 850 };
  const PW = P.x1 - P.x0;
  const PH = P.y1 - P.y0;
  const B = card.punch_t - card.build;
  const rnd = mulberry(1182);
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i += 1) u += rnd(); return (u - 3) / Math.SQRT1_2; };
  const N = 120;
  const XM = 400;
  const YM = 100;
  const data = Array.from({ length: N }, () => { const x = 24 + rnd() * 360; return { x, y: clamp(11 + 0.195 * x + gauss() * 10.5, 4, 97) }; });
  // ordinary least squares, for the line and for the honest starting value of r
  const mx = data.reduce((s, d) => s + d.x, 0) / N;
  const my = data.reduce((s, d) => s + d.y, 0) / N;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const d of data) { sxx += (d.x - mx) ** 2; sxy += (d.x - mx) * (d.y - my); syy += (d.y - my) ** 2; }
  const slope = sxy / sxx;
  const icpt = my - slope * mx;
  const r0 = sxy / Math.sqrt(sxx * syy);
  const PX = (x) => P.x0 + (x / XM) * PW;
  const PY = (y) => P.y1 - (y / YM) * PH;
  const src = data.map((d) => [PX(d.x), PY(d.y)]);
  // the heart: outline points at equal arc length, the inside filled by points relaxed apart
  const HS = 14.4;
  const HC = [705, 556];
  const poly = Array.from({ length: 480 }, (_, i) => {
    const th = (i / 480) * TAU;
    return [HC[0] + HS * 16 * Math.sin(th) ** 3, HC[1] - HS * (13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th))];
  });
  const NO = 40;
  const outline = resample(poly, NO, true);
  const inside = (x, y) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const edge = (x, y) => { let m = 1e9; for (const q of poly) { const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  let inner = [];
  for (let guard = 0; inner.length < N - NO && guard < 40000; guard += 1) {
    const x = HC[0] + (rnd() - 0.5) * 470;
    const y = 380 + rnd() * 424;
    if (inside(x, y) && edge(x, y) > 30) inner.push([x, y]);
  }
  for (let it = 0; it < 90; it += 1) {
    const R = 62;
    inner = inner.map((pt, i) => {
      let fx = 0;
      let fy = 0;
      const push = (q, wgt) => { const dx = pt[0] - q[0]; const dy = pt[1] - q[1]; const d = Math.hypot(dx, dy) || 1e-6; if (d < R) { const f = ((R - d) / R) * wgt; fx += (dx / d) * f; fy += (dy / d) * f; } };
      inner.forEach((q, j) => { if (j !== i) push(q, 1); });
      outline.forEach((q) => push(q, 1.15));
      const nx = pt[0] + fx * 7;
      const ny = pt[1] + fy * 7;
      return inside(nx, ny) && edge(nx, ny) > 24 ? [nx, ny] : pt;
    });
  }
  const tgt = [...outline, ...inner];
  // pair every data point with a place in the heart: sweep both along the regression line so paths do not tangle
  const dx = PX(XM) - PX(0);
  const dy = PY(icpt + slope * XM) - PY(icpt);
  const dl = Math.hypot(dx, dy);
  const dir = [dx / dl, dy / dl];
  const order = (arr) => arr.map((q, i) => ({ i, u: q[0] * dir[0] + q[1] * dir[1], v: q[1] * dir[0] - q[0] * dir[1] })).sort((m, n) => m.u - n.u);
  const so = order(src);
  const to = order(tgt);
  const dots = new Array(N);
  for (let c = 0; c < N; c += 12) {
    const A = so.slice(c, c + 12).sort((m, n) => m.v - n.v);
    const Bc = to.slice(c, c + 12).sort((m, n) => m.v - n.v);
    A.forEach((s, j) => {
      const g = tgt[Bc[j].i];
      const dist = Math.hypot(g[0] - src[s.i][0], g[1] - src[s.i][1]);
      dots[s.i] = { s: src[s.i], g, rim: Bc[j].i < NO, born: 0.24 + 0.5 * (data[s.i].x / XM) + rnd() * 0.06, dl: rnd() * 0.2, bulge: (rnd() - 0.5) * 0.5 * dist };
    });
  }
  const m = /^(.*?)(\d+(?:\.(\d+))?)(.*)$/.exec(card.punch);
  const dec = m && m[3] ? m[3].length : 0;
  const read = (q, done) => (m ? `${m[1]}${(done ? +m[2] : Math.min(lerp(r0, +m[2], q), +m[2] - 10 ** -dec)).toFixed(dec)}${m[4]}` : card.punch);
  const bump = (x, d) => (x < 0 || x > d ? 0 : Math.sin((Math.PI * x) / d) ** 2);
  return (t) => {
    const a = t - card.t;
    const tau = (t - card.build) / B;
    const p = t - card.punch_t + 1e-6;
    wipe(ctx);
    // axes
    const ax = at(a, 0.1, 0.55, E.out3);
    for (let j = 1; j <= 4; j += 1) seg(ctx, P.x0, PY(j * 25), P.x1, PY(j * 25), { stroke: INK.grid, a: at(a, 0.2, 0.4) });
    seg(ctx, P.x0, P.y1, lerp(P.x0, P.x1, ax), P.y1, { w: 2.5 });
    seg(ctx, P.x0, P.y1, P.x0, lerp(P.y1, P.y0, ax), { w: 2.5 });
    for (let j = 0; j <= 4; j += 1) {
      const al = at(a, 0.2 + j * 0.04, 0.3);
      seg(ctx, PX(j * 100), P.y1, PX(j * 100), P.y1 + 13, { a: al });
      label(ctx, `${j * 100}`, PX(j * 100), P.y1 + 50, { a: al });
      seg(ctx, P.x0 - 13, PY(j * 25), P.x0, PY(j * 25), { a: al });
      label(ctx, `${j * 25}`, P.x0 - 22, PY(j * 25) + 1, { align: 'right', base: 'middle', a: al });
    }
    label(ctx, 'our questions', (P.x0 + P.x1) / 2, P.y1 + 106, { fill: INK.dim, a: at(a, 0.4, 0.4) });
    label(ctx, 'your patience', 176, P.y0 - 40, { align: 'left', fill: INK.dim, a: at(a, 0.4, 0.4) });
    // regression line: drawn through the cloud, let go when the points move
    const ld = at(tau, 0, 0.34, E.io2);
    const lf = 1 - at(tau, 0.4, 0.2, E.io2);
    if (ld > 0 && lf > 0) {
      const x0 = 6;
      const x1 = lerp(x0, 394, ld);
      seg(ctx, PX(x0), PY(icpt + slope * x0), PX(x1), PY(icpt + slope * x1), { stroke: rgb(GOLD, 0.16), w: 16, a: lf, cap: 'round', add: true });
      seg(ctx, PX(x0), PY(icpt + slope * x0), PX(x1), PY(icpt + slope * x1), { stroke: rgb(GLINT), w: 5, a: lf, cap: 'round' });
    }
    // points
    const beat = 1 + 0.075 * bump(p, 0.3) + 0.04 * bump(p - 0.26, 0.3) + 0.05 * bump(p - 1, 0.3) + 0.028 * bump(p - 1.26, 0.3);
    const cy = 592;
    const lit = p < 0 ? 0 : 0.35 + 0.65 * Math.exp(-p / 0.5);
    ctx.globalCompositeOperation = 'lighter';
    const pos = dots.map((d) => {
      const e = E.io3(prog(tau, 0.38 + d.dl, 0.38 + d.dl + 0.38));
      const k = Math.sin(Math.PI * e) * d.bulge;
      let x = lerp(d.s[0], d.g[0], e) - dir[1] * k;
      let y = lerp(d.s[1], d.g[1], e) + dir[0] * k;
      x = HC[0] + (x - HC[0]) * lerp(1, beat, e);
      y = cy + (y - cy) * lerp(1, beat, e);
      const ap = E.back(2.2)(prog(a, d.born, d.born + 0.3));
      if (ap > 0) glow(ctx, SP_GOLD, x, y, (d.rim ? 6.5 : 5) * ap, 0.1 * ap + 0.42 * lit * e);
      return [x, y - (1 - clamp(ap)) * 16, e, ap];
    });
    ctx.globalCompositeOperation = 'source-over';
    pos.forEach(([x, y, e, ap], i) => {
      if (ap <= 0) return;
      const d = dots[i];
      const r = lerp(8, d.rim ? 8.8 : 7.2, e) * ap;
      ctx.globalAlpha = 1;
      ctx.fillStyle = rgb(NAVY, 0.8 * (1 - 0.6 * e));
      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgb(mix(GOLD, d.rim ? GLINT : GOLD2, e * (0.6 + 0.4 * lit)));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    });
    // r: the honest value while the line is drawn, then it climbs to the punchline as the points settle
    const txt = read(E.io2(prog(tau, 0.38, 0.985)), p >= 0);
    if (ui.dim.textContent !== txt) { ui.dim.textContent = txt; ui.foil.textContent = txt; }
    ui.lock(t, card.build);
    return null;
  };
}
/** n points at equal arc length along a polyline (closed: around the loop, without repeating the start). */
function resample(pts, n, closed) {
  const path = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < path.length; i += 1) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const len = cum[cum.length - 1];
  const out = [];
  let j = 1;
  for (let k = 0; k < n; k += 1) {
    const d = (len * k) / (closed ? n : n - 1);
    while (j < cum.length - 1 && cum[j] < d) j += 1;
    const f = (d - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
    out.push([lerp(path[j - 1][0], path[j][0], f), lerp(path[j - 1][1], path[j][1], f)]);
  }
  return out;
}

// ───────────────────────── figure 4: an interval that should not be able to do this
function figCI(card, ui) {
  vis(ui.stamp, false);
  const { ctx } = ui;
  const B = card.punch_t - card.build;
  const X0 = 250;
  const X1 = 1160;
  const V0 = 86;
  const V1 = 100;
  const X = (v) => X0 + ((v - V0) / (V1 - V0)) * (X1 - X0);
  const YT = 340;
  const YA = 770;
  const YI = 884;
  const MU0 = 88.6;                // starts short of every conventional level, so it can sweep past all three
  const HW0 = 2.3;
  const S0 = HW0 / 1.96;
  const LV = [90, 95, 99];
  const GHOSTS = [0, 0.22, 0.42, 0.58, 0.71, 0.82, 0.91];
  const m = /^(.*?)(\d+(?:\.(\d+))?)(.*)$/.exec(card.punch);
  const read = (mu, done) => (m ? `${m[1]}${(done ? +m[2] : Math.min(mu, +m[2] - 10 ** -(m[3] ? m[3].length : 0))).toFixed(m[3] ? m[3].length : 0)}${m[4]}` : card.punch);
  /** A normal curve as a path: an even grid plus extra points around the mean, so a very narrow one stays smooth. */
  const bell = (mean, sd, height) => {
    const vs = [];
    for (let i = 0; i <= 220; i += 1) vs.push(V0 + (i * (V1 - V0)) / 220);
    for (let j = -24; j <= 24; j += 1) { const v = mean + (j * sd) / 6; if (v > V0 && v < V1) vs.push(v); }
    vs.sort((m1, m2) => m1 - m2);
    ctx.beginPath();
    vs.forEach((v, i) => {
      const y = YA - height * Math.exp(-((v - mean) ** 2) / (2 * sd * sd));
      if (i) ctx.lineTo(X(v), y); else ctx.moveTo(X(v), y);
    });
  };
  const star = (x, y, R, w, al) => {
    ctx.save();
    ctx.globalAlpha = al;
    ctx.fillStyle = rgb(GLINT);
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) { const an = (i * Math.PI) / 4; const rr = i % 2 ? w : R * (i % 4 ? 0.62 : 1); ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  return (t) => {
    const a = t - card.t;
    const tau = (t - card.build) / B;
    const p = t - card.punch_t + 1e-6;
    wipe(ctx);
    const s = E.io3(prog(tau, 0, 0.97));
    const mu = p >= 0 ? V1 : lerp(MU0, V1, s);
    const hw = p >= 0 ? 0 : HW0 * (1 - s) ** 1.2;
    const sg = Math.max(hw / 1.96, 0.012);
    const ent = at(a, 0.34, 0.5, E.out3);
    // axis: every percent a tick, the conventional levels named
    const ax = at(a, 0.1, 0.55, E.out3);
    seg(ctx, X0, YA, lerp(X0, X1, ax), YA, { w: 2.5 });
    for (let v = V0; v <= V1; v += 1) seg(ctx, X(v), YA, X(v), YA + (LV.includes(v) || v === V1 ? 18 : 9), { a: at(a, 0.15 + (v - V0) * 0.03, 0.3) });
    [...LV, V1].forEach((v, i) => {
      const on = v === V1 ? (p >= 0 ? 1 : 0) : clamp((mu - v) / 0.4);
      const pop = v === V1 ? (p >= 0 ? 0.5 * Math.exp(-p / 0.25) : 0) : Math.sin(Math.PI * clamp(mu - v));
      const al = at(a, 0.3 + i * 0.07, 0.35);
      const st = v === V1 ? { stroke: rgb(mix(GOLD, GLINT, on), lerp(0.5, 0.95, on)), w: 2.5, a: al } : { stroke: rgb(mix(CREAM, GOLD2, on), lerp(0.3, 0.7, on)), w: 2, dash: [9, 10], a: al };
      seg(ctx, X(v), YT, X(v), YA + 20, st);
      seg(ctx, X(v), YA + 76, X(v), YI + 30, st);
      label(ctx, `${v}%`, X(v) + (v === V1 ? 14 : v === 99 ? -8 : 0), YA + 60, { font: `${on > 0.5 ? 700 : 500} ${(30 * (1 + 0.24 * pop)).toFixed(1)}px JBMono`, fill: rgb(mix(CREAM, GOLD2, on), lerp(0.72, 1, on)), a: al });
    });
    label(ctx, 'confidence', (X0 + X1) / 2, 966, { fill: INK.dim, a: at(a, 0.4, 0.4) });
    // the sampling distribution of the estimate: as the interval closes it becomes a spike
    const fadeTop = ctx.createLinearGradient(0, YT, 0, YT + 110);
    fadeTop.addColorStop(0, rgb(GOLD2, 0));
    fadeTop.addColorStop(1, rgb(GOLD2, 1));
    const wash = ctx.createLinearGradient(0, YT, 0, YT + 110);
    wash.addColorStop(0, rgb(GOLD, 0));
    wash.addColorStop(1, rgb(GOLD, 0.11));
    const hpk = Math.min(9000, (140 * S0) / sg);
    ctx.save();
    ctx.beginPath();
    ctx.rect(X0, YT, X1 - X0 + 3, YA - YT);
    ctx.clip();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = fadeTop;
    ctx.lineWidth = 2;
    for (const gs of GHOSTS) {                               // where it has been: each one narrower than the last
      const ga = clamp((s - gs - 0.03) / 0.1) * 0.3;
      if (ga <= 0) continue;
      const gm = lerp(MU0, V1, gs);
      const gsd = (HW0 * (1 - gs) ** 1.2) / 1.96;
      const gh = (140 * S0) / gsd;
      ctx.globalAlpha = ga;
      bell(gm, gsd, gh);
      ctx.stroke();
    }
    ctx.globalAlpha = ent;
    bell(mu, sg, hpk);
    ctx.lineTo(X1, YA);
    ctx.lineTo(X0, YA);
    ctx.closePath();
    ctx.fillStyle = wash;
    ctx.fill();
    bell(mu, sg, hpk);
    ctx.strokeStyle = fadeTop;
    ctx.lineWidth = 4.5;
    ctx.stroke();
    ctx.restore();
    // the interval itself
    seg(ctx, X0, YI, X1, YI, { stroke: rgb(GOLD, 0.2), w: 2, a: ent });
    const xl = X(Math.max(mu - hw, V0));
    const xr = X(Math.min(mu + hw, V1));
    const xm = X(mu);
    seg(ctx, xm, YI - 20, xm, YA, { stroke: rgb(GOLD2, 0.4), w: 2, dash: [3, 8], a: ent });
    if (xr - xl > 1) {
      seg(ctx, xl, YI, xr, YI, { stroke: rgb(GOLD2), w: 9, a: ent });
      seg(ctx, xl, YI - 24, xl, YI + 24, { stroke: rgb(GOLD2), w: 5, a: ent, cap: 'round' });
      if (mu + hw < V1) seg(ctx, xr, YI - 24, xr, YI + 24, { stroke: rgb(GOLD2), w: 5, a: ent, cap: 'round' });
    }
    ctx.save();
    ctx.globalAlpha = ent;
    ctx.fillStyle = rgb(NAVY);
    ctx.beginPath();
    ctx.arc(xm, YI, 20, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgb(GLINT);
    ctx.beginPath();
    ctx.arc(xm, YI, 15, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (p >= 0) {                                            // locked: a point, a spike, a small flare
      const f = Math.exp(-p / 0.35);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, SP_GLINT, X1, YI, 12 + 22 * f, 0.5 + 0.5 * f);
      const rq = prog(p, 0, 0.7);
      ctx.globalAlpha = (1 - rq) ** 2 * 0.7;
      ctx.strokeStyle = rgb(GLINT);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(X1, YI, 22 + 150 * E.out3(rq), 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      star(X1, YI, 30 + 70 * f + 4 * Math.sin(p * 5), 4.5 + 4 * f, 0.95);
    }
    const txt = read(Math.round(mu), p >= 0);
    if (ui.dim.textContent !== txt) { ui.dim.textContent = txt; ui.foil.textContent = txt; }
    ui.lock(t, card.t + 0.45);
    return null;
  };
}

/** A card this file has no chart for still gets its frame: title, punchline on the hit, note. */
function figPlain(card, ui) {
  vis(ui.stamp, false);
  return (t) => { wipe(ui.ctx); ui.lock(t, card.punch_t); return null; };
}
const FIGS = { exam: figExam, h0: figH0, heart: figHeart, ci: figCI };
function figure(root, card, tOut) {
  const box = el('div', `fig fig--${card.id}`, `<canvas width="${W}" height="${H}"></canvas>
    <div class="fig-kicker"><span>${esc(card.kicker)}</span><i></i></div><div class="fig-title">${rich(card.title)}</div>
    <div class="fig-punch"><span class="pv pv--dim"></span><span class="pv pv--foil"></span></div>
    <div class="stamp"><b>${esc(card.punch)}</b></div><div class="fig-note">${esc(card.note)}</div>`);
  root.appendChild(box);
  const ui = { ctx: box.querySelector('canvas').getContext('2d'), rule: box.querySelector('.fig-kicker i'), punch: box.querySelector('.fig-punch'), dim: box.querySelector('.pv--dim'), foil: box.querySelector('.pv--foil'), stamp: box.querySelector('.stamp'), stampB: box.querySelector('.stamp b'), note: box.querySelector('.fig-note') };
  ui.dim.textContent = ui.foil.textContent = card.punch;
  /** A read-out that is faint while it counts and locks, in gold, on the punch. */
  ui.lock = (t, from) => {
    const p = t - card.punch_t + 1e-6;
    const pop = p < 0 ? 0 : 1 - E.out3(prog(p, 0, 0.42));
    css(ui.dim, { opacity: (p < 0 ? at(t, from, 0.3, E.out2) * 0.6 : 0).toFixed(3) });
    css(ui.foil, { opacity: p < 0 ? '0' : '1' });
    css(ui.punch, { transform: `scale(${(p < 0 ? 0.84 : 1 + 0.15 * pop).toFixed(4)})`, filter: p < 0 ? 'none' : `drop-shadow(0 0 ${(22 + 40 * pop).toFixed(1)}px rgba(245,200,107,${(0.3 + 0.5 * pop).toFixed(3)}))` });
  };
  const paint = (FIGS[card.id] || figPlain)(card, ui);
  const tIn = card.t - 0.04;
  return (t) => {
    const on = t >= tIn && t < tOut + 0.22;
    vis(box, on);
    if (!on) return;
    const shake = paint(t) || [0, 0];
    const pin = at(t, tIn, 0.55, E.out5);
    const pout = at(t, tOut, 0.22, E.in2);
    css(box, { opacity: (at(t, tIn, 0.26, E.out2) * (1 - pout)).toFixed(3), transform: `translate(${((1 - pin) * 150 - pout * 150 + shake[0]).toFixed(2)}px, ${shake[1].toFixed(2)}px)` });
    css(ui.rule, { transform: `scaleX(${at(t, tIn + 0.08, 0.9, E.out5).toFixed(4)})` });
    const nq = at(t, card.punch_t + (card.note.length > 30 ? 0.25 : 0.4), 0.4, E.out3);   // a long note needs its reading time
    css(ui.note, { opacity: nq.toFixed(3), transform: `translateY(${((1 - nq) * 16).toFixed(2)}px)` });
  };
}

function buildNumbers({ cues, stage, S }) {
  const N = cues.numbers;
  const { start, end } = S('s11');
  const root = scene(stage, 's11', start, end, 'a3 a3-num');
  // worn ink for the rubber stamp
  root.innerHTML = `<svg class="a3-defs" width="0" height="0"><filter id="a3-ink" x="-8%" y="-16%" width="116%" height="132%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4" result="fine"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.014 0.03" numOctaves="2" seed="11" result="big"/>
      <feDisplacementMap in="SourceGraphic" in2="fine" scale="3" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feColorMatrix in="fine" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  16 0 0 0 -4.3" result="grain"/>
      <feColorMatrix in="big" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 0.05" result="wear"/>
      <feComposite in="rough" in2="grain" operator="in" result="worn"/><feComposite in="worn" in2="wear" operator="in"/>
    </filter></svg><div class="nm-intro">${N.intro.map((ln, i) => `<div class="nm-il${i === N.intro.length - 1 ? ' nm-il--last' : ''}">${esc(ln.text)}</div>`).join('')}</div>`;
  const intro = root.querySelector('.nm-intro');
  const lines = [...intro.children].map((d, i) => ({ t: N.intro[i].t, w: words(d) }));
  const first = N.cards[0].t;
  const figs = N.cards.map((card, i) => figure(root, card, i < N.cards.length - 1 ? N.cards[i + 1].t - 0.24 : N.end - 0.22));
  onFrame((t) => {
    if (t < start || t >= end) return;
    const on = t < first + 0.1;
    vis(intro, on);
    if (on) {
      lines.forEach((ln, i) => rise(ln.w, t, ln.t, { stag: i ? 0.035 : 0.07, dur: i ? 0.45 : 0.55, dy: 46 }));
      const o = at(t, first - 0.12, 0.22, E.in2);
      css(intro, { opacity: (1 - o).toFixed(3), transform: `translateX(${(-150 * o).toFixed(2)}px)` });
    }
    for (const f of figs) f(t);
  });
}

// ───────────────────────────────────────────────────────── s12 the network, and the word it becomes
/** Letters as strokes in a unit box (x 0…w, y 0 top … 1 baseline). os/oe: the stroke starts/ends on another stroke's dot. */
const GLYPHS = (() => {
  const arc = (cx, cy, rx, ry, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const an = lerp(a0, a1, i / n); return [cx + Math.cos(an) * rx, cy + Math.sin(an) * ry]; });
  return {
    T: { w: 0.64, s: [{ p: [[0, 0], [0.64, 0]] }, { p: [[0.32, 0], [0.32, 1]], os: 1 }] },
    H: { w: 0.62, s: [{ p: [[0, 0], [0, 1]] }, { p: [[0.62, 0], [0.62, 1]] }, { p: [[0, 0.5], [0.62, 0.5]], os: 1, oe: 1 }] },
    A: { w: 0.7, s: [{ p: [[0, 1], [0.31, 0]] }, { p: [[0.39, 0], [0.7, 1]] }, { p: [[0.1085, 0.65], [0.5915, 0.65]], os: 1, oe: 1 }] },
    N: { w: 0.64, s: [{ p: [[0, 1], [0, 0]] }, { p: [[0.105, 0.165], [0.535, 0.835]] }, { p: [[0.64, 1], [0.64, 0]] }] },
    K: { w: 0.6, s: [{ p: [[0, 0], [0, 1]] }, { p: [[0, 0.5], [0.6, 0]], os: 1 }, { p: [[0, 0.5], [0.6, 1]], os: 1 }] },
    Y: { w: 0.64, s: [{ p: [[0, 0], [0.32, 0.5]] }, { p: [[0.64, 0], [0.32, 0.5]], oe: 1 }, { p: [[0.32, 0.5], [0.32, 1]], os: 1 }] },
    O: { w: 0.68, s: [{ p: arc(0.34, 0.5, 0.34, 0.5, -Math.PI / 2, Math.PI * 1.5, 72).slice(0, -1), closed: 1 }] },
    U: { w: 0.62, s: [{ p: [[0, 0], ...arc(0.31, 0.69, 0.31, 0.31, Math.PI, 0, 28), [0.62, 0]] }] },
  };
})();
/** `count` dots that spell `word`: sampled along the letter strokes at (almost) equal spacing, using every dot. */
function wordDots(word, count, { cx, cy, maxW, maxH }) {
  const GAP = 0.24;
  const SPACE = 0.5;
  let x = 0;
  const strokes = [];
  [...word.toUpperCase()].forEach((ch, gi) => {
    const g = GLYPHS[ch];
    if (!g) { x += SPACE - GAP; return; }
    g.s.forEach((s) => {
      const pts = s.p.map((q) => [q[0] + x, q[1]]);
      const path = s.closed ? [...pts, pts[0]] : pts;
      let len = 0;
      for (let i = 1; i < path.length; i += 1) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      strokes.push({ pts, len, os: s.os ? 1 : 0, oe: s.oe ? 1 : 0, closed: !!s.closed, key: `${gi}:${len.toFixed(4)}`, n: 1 });
    });
    x += g.w + GAP;
  });
  const width = x - GAP;
  const h = Math.min(maxH, maxW / width);
  const dotsOf = (s, n) => (s.closed ? n : n + 1 - s.os - s.oe);
  const total = (sp) => strokes.reduce((a, s) => a + dotsOf(s, Math.max(1, Math.round(s.len / sp))), 0);
  let best = 0.4;
  for (let sp = 0.4; sp > 0.03; sp -= 0.0005) { if (total(sp) <= count) best = sp; else break; }
  strokes.forEach((s) => { s.n = Math.max(1, Math.round(s.len / best)); });
  // spend what is left where the dots are loosest, mirror strokes together so letters stay symmetric
  let left = count - strokes.reduce((a, s) => a + dotsOf(s, s.n), 0);
  for (let guard = 0; left > 0 && guard < 400; guard += 1) {
    const groups = {};
    strokes.forEach((s) => { (groups[s.key] || (groups[s.key] = [])).push(s); });
    const pick = Object.values(groups).filter((g) => g.length <= left).sort((a, b) => b[0].len / b[0].n - a[0].len / a[0].n)[0];
    if (!pick) break;
    pick.forEach((s) => { s.n += 1; });
    left -= pick.length;
  }
  const out = [];
  const X0 = cx - (width * h) / 2;
  const Y0 = cy - h / 2;
  strokes.forEach((s) => {
    const path = s.closed ? [...s.pts, s.pts[0]] : s.pts;
    const all = resample(path, s.n + 1, false);
    const from = s.os;
    const to = s.closed || s.oe ? s.n - 1 : s.n;
    for (let k = from; k <= to; k += 1) out.push([X0 + all[k][0] * h, Y0 + all[k][1] * h]);
  });
  while (out.length < count) out.push(out[out.length - 1].slice());
  return { dots: out.slice(0, count), h, width: width * h };
}

function buildNetwork({ cues, stage, S }) {
  const NW = cues.network;
  const FN = cues.finale;
  const { start } = S('s12');
  const END = cues.duration + 0.1;
  const root = scene(stage, 's12', start, END, 'a3 a3-net');
  root.innerHTML = `<canvas width="${W}" height="${H}"></canvas>`;
  const ctx = root.firstChild.getContext('2d');
  const pts = cohortNodes();
  const links = crossLinks(pts, 72);
  const N = pts.length;
  const rnd = mulberry(1294);
  const labs = COHORTS.map((g) => {
    const d = el('div', 'nt-lab');
    d.textContent = g.label;
    d.style.left = `${g.c[0]}px`;
    d.style.top = `${g.c[1] - 223}px`;
    d.style.color = g.hex;
    root.appendChild(d);
    return d;
  });
  const caps = NW.lines.map((ln, i) => {
    const d = el('div', `nt-cap nt-cap--${Math.min(i, 1)}`);
    d.textContent = ln.text;
    root.appendChild(d);
    return { t: ln.t, el: d, w: words(d) };
  });
  const small = el('div', 'nt-small');
  small.textContent = NET_SMALL;
  root.appendChild(small);

  const word = wordDots(NW.word, N, { cx: W / 2, cy: 500, maxW: 1610, maxH: 232 });
  const RW = 9.2;                                   // dot radius once it is part of a letter
  // every dot gets a place in the word: left to right, so each cohort writes its own stretch
  const so = pts.map((p, i) => ({ i, x: p.x, y: p.y })).sort((a, b) => a.x - b.x);
  const to = word.dots.map((p, i) => ({ i, x: p[0], y: p[1] })).sort((a, b) => a.x - b.x);
  const dot = new Array(N);
  for (let c = 0; c < N; c += 8) {
    const A = so.slice(c, c + 8).sort((a, b) => a.y - b.y);
    const Bc = to.slice(c, c + 8).sort((a, b) => a.y - b.y);
    A.forEach((s, j) => {
      const p = pts[s.i];
      const g = COHORTS[p.g];
      const an = rnd() * TAU;
      dot[s.i] = {
        s: [p.x, p.y], c: g.c, col: hex(p.hex), g: word.dots[Bc[j].i],
        born: NW.nodes_in + 0.5 * (Math.hypot((p.x - g.c[0]) / 1.25, (p.y - g.c[1]) / 0.8) / 190) + 0.1 * rnd(),
        d: 0.1 + 0.36 * ((c + j) / N) + 0.04 * rnd(), th: 1.1 + 0.9 * rnd(),
        dx: Math.cos(an), dy: Math.sin(an), up: 5 + rnd() * 17, ds: 1.1 + rnd() ** 2 * 2.2, da: 0.22 + rnd() * 0.4, tw: 0.8 + rnd() * 1.8, ph: rnd() * TAU, fq: 0.3 + rnd() * 0.6,
      };
    });
  }
  const G0 = NW.gather;
  const SPAN = NW.formed - G0;
  const FLY = 0.5;                                  // flight time, as a share of gather → formed
  /** Where dot i is at time t (before the finale), and how far along its flight. */
  const where = (d, t) => {
    const an = 0.12 * E.io2(prog(t, G0, G0 + 0.09 * SPAN));              // the clusters breathe in before they go
    const sx = d.c[0] + (d.s[0] - d.c[0]) * (1 - an);
    const sy = d.c[1] + (d.s[1] - d.c[1]) * (1 - an);
    const q = prog(t, G0 + d.d * SPAN, G0 + (d.d + FLY) * SPAN);
    if (q <= 0) return [sx, sy, 0, 0];
    const e = E.out3(q);
    const ang = d.th * e;                                                // spiral in to the target
    const ox = (sx - d.g[0]) * (1 - e);
    const oy = (sy - d.g[1]) * (1 - e);
    return [d.g[0] + ox * Math.cos(ang) - oy * Math.sin(ang), d.g[1] + ox * Math.sin(ang) + oy * Math.cos(ang), e, q];
  };
  const pulseOn = NW.lines[1] ? NW.lines[1].t : NW.links_in + 1;
  onFrame((t) => {
    if (t < start || t >= END) return;
    ctx.clearRect(0, 0, W, H);
    // links between cohorts, in gold
    const lo = 1 - at(t, G0, 0.42, E.in2);
    if (t >= NW.links_in && lo > 0) {
      const warm = at(t, pulseOn - 0.1, 0.7, E.io2);
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'butt';
      const la = (0.5 + 0.24 * warm) * lo;
      links.forEach(([i, j], k) => {
        const q = at(t, NW.links_in + (k / links.length) * 0.9, 0.5, E.out2);
        if (q <= 0) return;
        const a = where(dot[i], t);
        const b = where(dot[j], t);
        const g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        g.addColorStop(0, rgb(GOLD2, la));
        g.addColorStop(0.5, rgb(GOLD, la * 0.36));
        g.addColorStop(1, rgb(GOLD2, la));
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(lerp(a[0], b[0], q), lerp(a[1], b[1], q));
        ctx.stroke();
      });
      if (warm > 0) {                                // light travelling along the connections
        ctx.globalCompositeOperation = 'lighter';
        links.forEach(([i, j], k) => {
          if (k % 3) return;
          const u = ((((t - pulseOn) / (1.3 + (k % 7) * 0.16) + k * 0.37) % 1) + 1) % 1;
          const a = dot[i].s;
          const b = dot[j].s;
          glow(ctx, SP_GLINT, lerp(a[0], b[0], u), lerp(a[1], b[1], u), 3.2, Math.sin(Math.PI * u) * 0.85 * warm * lo);
        });
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // dots
    const tf = t - FN.start;                                      // > 0: the word lets go and becomes dust
    const land = t - NW.formed;
    const pulse = land >= 0 ? Math.exp(-land / 0.55) : 0;
    const sweepX = lerp(W / 2 - word.width / 2 - 200, W / 2 + word.width / 2 + 200, prog(land, 0.25, 1.35));
    const rel = tf > 0 ? E.out3(prog(tf, 0, 1.5)) : 0;
    const kd = tf > 0 ? 1 - Math.exp(-tf / 1.1) : 0;
    const state = dot.map((d) => {
      const w = where(d, t);
      let x = w[0];
      let y = w[1];
      const e = w[2];
      const q = w[3];
      let r = lerp(6.5, RW, e) * E.back(2.5)(prog(t, d.born, d.born + 0.3));
      let al = 1;
      let shine = 0;
      if (land >= 0) shine = 0.5 * Math.exp(-(((x - sweepX) / 110) ** 2)) + 0.06 * Math.sin(t * d.tw + d.ph);
      if (tf > 0) {
        x += d.dx * 46 * kd + Math.sin(tf * d.fq + d.ph) * 12 * kd;
        y += d.dy * 30 * kd - d.up * tf;
        r = lerp(RW, d.ds, rel);
        al = lerp(1, d.da * (0.7 + 0.3 * Math.sin(t * d.tw + d.ph)), rel);
      }
      return { d, x, y, e, q, r, al, shine };
    });
    ctx.globalCompositeOperation = 'lighter';
    if (pulse > 0.01 && rel < 1) {
      const bl = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);       // a unit circle, stretched over the word
      bl.addColorStop(0, rgb(GOLD2, 0.34 * pulse * (1 - rel)));
      bl.addColorStop(0.55, rgb(GOLD, 0.12 * pulse * (1 - rel)));
      bl.addColorStop(1, rgb(GOLD, 0));
      ctx.save();
      ctx.translate(W / 2, 500);
      ctx.scale(word.width * 0.62, 250);
      ctx.fillStyle = bl;
      ctx.globalAlpha = 1;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
    for (const s of state) {
      if (s.r <= 0) continue;
      if (s.q > 0 && s.q < 1) {                      // in flight: a short tail
        const b = where(s.d, t - 0.05);
        ctx.globalAlpha = 0.3 * (1 - s.e);
        ctx.strokeStyle = rgb(mix(s.d.col, GOLD2, s.e));
        ctx.lineWidth = s.r * 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      glow(ctx, SP_GOLD, s.x, s.y, s.r * (0.72 + 0.22 * pulse * (1 - rel)), s.al * (0.46 * s.e + 0.22 * pulse) * (1 - 0.45 * rel) + s.shine * 0.4);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of state) {
      if (s.r <= 0) continue;
      ctx.globalAlpha = clamp(s.al);
      ctx.fillStyle = rgb(mix(mix(s.d.col, GOLD2, E.out2(s.q)), [255, 252, 240], clamp(0.9 * pulse + s.shine)));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // labels and captions
    labs.forEach((d, i) => css(d, { opacity: (at(t, NW.nodes_in + 0.3 + i * 0.1, 0.4, E.out2) * (1 - at(t, G0 - 0.1, 0.3, E.in2))).toFixed(3) }));
    caps.forEach((c, i) => {
      const on = t < G0 + 0.25;
      vis(c.el, on);
      if (!on) return;
      rise(c.w, t, c.t, { stag: 0.05, dur: 0.55, dy: 30 });
      const dimmed = i === 0 && caps[1] ? 1 - 0.22 * at(t, caps[1].t - 0.1, 0.5, E.io2) : 1;
      css(c.el, { opacity: ((1 - at(t, G0 - 0.2, 0.32, E.in2)) * dimmed).toFixed(3) });
    });
    const sq = at(t, NW.formed + 0.55, 0.6, E.out3);
    css(small, { opacity: (sq * (1 - at(t, FN.start - 0.3, 0.35, E.in2))).toFixed(3), transform: `translateY(${((1 - sq) * 14).toFixed(2)}px)` });
  });
}

// ───────────────────────────────────────────────────────── s13 finale
function buildFinale({ cues, config, stage, S }) {
  const F = cues.finale;
  const { start } = S('s13');
  const END = cues.duration + 0.1;
  const root = scene(stage, 's13', start, END, 'a3 a3-fin');
  root.innerHTML = `<div class="fn-col"><div class="fn-title"><span class="td-foil">${esc(F.title_text)}</span></div><i class="fn-rule"></i>
    <div class="fn-sign">${esc(F.signoff_text)}</div>
    <div class="fn-logos"><div class="fn-mini"></div><div class="fn-tag">${esc(F.hashtag)}</div><img src="${BRAND}/bibf-white.png" decoding="sync"><img class="crest" src="${BRAND}/uol.png" decoding="sync"></div></div>
    <div class="fn-ps"><span>${esc(F.ps_text)}</span></div>`;
  root.querySelector('.fn-mini').append(logoTile(56), document.createTextNode(config.product.name));
  const title = root.querySelector('.fn-title');
  const rule = root.querySelector('.fn-rule');
  const sign = words(root.querySelector('.fn-sign'));
  const logos = [...root.querySelector('.fn-logos').children];
  const ps = root.querySelector('.fn-ps span');
  // the cat (the artwork may arrive later: without it the P.S. simply stands alone)
  const cat = el('img', 'fn-cat');
  cat.decoding = 'sync';
  cat.addEventListener('error', () => { cat.style.display = 'none'; root.classList.add('no-cat'); });
  cat.src = CAT_SRC;
  root.appendChild(cat);
  onFrame((t) => {
    if (t < start || t >= END) return;
    const tq = at(t, F.title, 1.1, E.out3);
    css(title, { opacity: tq.toFixed(3), transform: `translateY(${((1 - tq) * 26).toFixed(2)}px) scale(${lerp(0.965, 1, tq).toFixed(4)})` });
    css(rule, { opacity: at(t, F.signoff - 0.3, 0.5, E.out2).toFixed(3), transform: `scaleX(${at(t, F.signoff - 0.3, 0.9, E.out5).toFixed(4)})` });
    rise(sign, t, F.signoff, { stag: 0.04, dur: 0.6, dy: 24 });
    rise(logos, t, F.logos, { stag: 0.09, dur: 0.6, dy: 26 });
    const w = prog(t, F.ps + 0.3, F.ps + 1.35);
    css(ps, { webkitMaskImage: w >= 1 ? 'none' : `linear-gradient(90deg, #000 ${(w * 108 - 8).toFixed(2)}%, rgba(0,0,0,0) ${(w * 108).toFixed(2)}%)` });
    const up = at(t, F.ps, 0.85, E.back(1.3));
    const idle = Math.sin((t - F.ps) * 1.2) * 3 * prog(t, F.ps + 0.85, F.ps + 1.8);
    css(cat, { transform: `translateY(${(-CAT_RISE * up + idle).toFixed(2)}px) rotate(${(-5 - 6 * (1 - at(t, F.ps, 1.2, E.out3))).toFixed(2)}deg)` });
  });
}

export function buildAct3(C) {
  const FX = {};
  for (const build of [buildBackdrop, buildLetter, buildTitle, buildNumbers, buildNetwork, buildFinale, buildFront]) {
    try { build(C, FX); } catch (err) { console.error(`[act3] ${build.name} failed:`, err); }
  }
}
