// Film engine helpers. Everything must be a pure function of time: no Math.random, no clocks.
export const W = 1920;
export const H = 1080;
export const FPS = 30;

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
export const ease = {
  out3: (t) => 1 - (1 - t) ** 3,
  out5: (t) => 1 - (1 - t) ** 5,
  in3: (t) => t ** 3,
  inOut3: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
};

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Split an element's text into inline-block spans (one per character). */
export function chars(node) {
  const text = node.textContent;
  node.textContent = '';
  return [...text].map((c) => {
    const s = el('span', 'ch');
    s.textContent = c === ' ' ? ' ' : c;
    node.appendChild(s);
    return s;
  });
}

/**
 * Keyframe track: keys = [{ t, v: {..numbers}, e?: easing, cut?: true }]. Each key is reached at its
 * time, moving from the previous key's value (or jumping to it at `t` when cut is set).
 */
export function track(keys) {
  return (t) => {
    if (t <= keys[0].t) return keys[0].v;
    for (let i = 1; i < keys.length; i += 1) {
      const a = keys[i - 1];
      const b = keys[i];
      if (t < b.t) {
        if (b.cut) return a.v;
        const p = (b.e || ease.inOut3)(prog(t, a.t, b.t));
        const out = {};
        for (const k of Object.keys(b.v)) out[k] = lerp(a.v[k], b.v[k], p);
        return out;
      }
    }
    return keys[keys.length - 1].v;
  };
}

/** Per-frame callbacks, called with the film time after the GSAP timeline has been seeked. */
export const frameFns = [];
export const onFrame = (fn) => frameFns.push(fn);

/** A scene root that is only visible in [start, end). */
export const scenes = [];
export function scene(stage, id, start, end, cls = '') {
  const root = el('section', `scene ${cls}`);
  root.id = id;
  stage.appendChild(root);
  scenes.push({ root, start, end });
  return root;
}

/** Type `text` into `node` from t0 at cps characters per second. Returns the end time. */
export function typeText(node, text, t0, cps, { caret = null } = {}) {
  node.textContent = '';
  const span = el('span');
  node.appendChild(span);
  let caretEl = null;
  if (caret) { caretEl = el('span', 'caret'); caretEl.textContent = caret; node.appendChild(caretEl); }
  const end = t0 + text.length / cps;
  onFrame((t) => {
    const n = clamp(Math.floor((t - t0) * cps + 1e-6), 0, text.length);
    const s = t < t0 ? '' : text.slice(0, n);
    if (span.textContent !== s) span.textContent = s;
    if (caretEl) caretEl.style.visibility = t >= t0 && t < end + 0.35 && Math.floor(t * 5) % 2 === 0 ? 'inherit' : 'hidden';
  });
  return end;
}

/** Browser window showing 1920×1080 "screens". Children placed in .bw__content use screen pixels. */
export function browser({ width = 1500, url = 'mohamed-2196.github.io/DSBA', screens = [] } = {}) {
  const s0 = width / W;
  const viewH = Math.round(H * s0);
  const bw = el('div', 'bw');
  bw.style.width = `${width}px`;
  bw.innerHTML = `<div class="bw__bar"><i></i><i></i><i></i><span class="bw__url"><b></b>${url}</span></div>
    <div class="bw__view" style="height:${viewH}px"><div class="bw__content"></div></div>`;
  const content = bw.querySelector('.bw__content');
  const imgs = {};
  for (const name of screens) {
    const img = el('img', 'bw__screen');
    img.src = `../assets/ui/${name}.png`;
    img.decoding = 'sync';
    img.dataset.name = name;
    content.appendChild(img);
    imgs[name] = img;
  }
  gsap.set(content, { transformOrigin: '0 0', scale: s0, x: 0, y: 0 });
  /** GSAP vars that put screen point (fx, fy) at the centre of the view at zoom z. */
  const focus = (fx, fy, z = 1) => {
    const k = s0 * z;
    return {
      scale: k,
      x: clamp(width / 2 - fx * k, width - W * k, 0),
      y: clamp(viewH / 2 - fy * k, viewH - H * k, 0),
    };
  };
  /** Show exactly one screen (instant). */
  const show = (tl, name, at) => {
    for (const [n, img] of Object.entries(imgs)) tl.set(img, { autoAlpha: n === name ? 1 : 0 }, at);
  };
  return { el: bw, content, imgs, s0, width, viewH, height: viewH + 46, focus, show };
}

/** Mouse cursor with a click ripple, positioned in its parent's coordinate space. */
export function cursor(parent) {
  const c = el('div', 'cursor', `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M4 2l15 9.5-6.6 1.6L16 20.6l-3 1.4-3.6-7.6L4 19z" fill="#fff" stroke="#0a1f44" stroke-width="1.6" stroke-linejoin="round"/></svg><i class="cursor__ring"></i>`);
  parent.appendChild(c);
  const ring = c.querySelector('.cursor__ring');
  gsap.set(c, { autoAlpha: 0, x: 0, y: 0 });
  gsap.set(ring, { scale: 0, autoAlpha: 0 });
  return {
    el: c,
    move: (tl, x, y, at, dur = 0.6, e = 'power2.inOut') => tl.to(c, { x, y, duration: dur, ease: e }, at),
    place: (tl, x, y, at) => tl.set(c, { x, y, autoAlpha: 1 }, at),
    hide: (tl, at) => tl.set(c, { autoAlpha: 0 }, at),
    click: (tl, at) => {
      tl.fromTo(ring, { scale: 0.2, autoAlpha: 0.9 }, { scale: 2.6, autoAlpha: 0, duration: 0.45, ease: 'power2.out', immediateRender: false }, at);
      tl.to(c, { scale: 0.82, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: '4px 2px' }, at - 0.03);
    },
  };
}

/** A floating label with a pointer dot. */
export function callout(parent, text, x, y, { side = 'right' } = {}) {
  const c = el('div', `callout callout--${side}`, `<i></i><span>${text}</span>`);
  c.style.left = `${x}px`;
  c.style.top = `${y}px`;
  parent.appendChild(c);
  gsap.set(c, { autoAlpha: 0, scale: 0.6, xPercent: side === 'left' ? -100 : 0 });
  return {
    el: c,
    show: (tl, at, hold = 1.5) => {
      tl.to(c, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, at);
      tl.to(c, { autoAlpha: 0, scale: 0.9, duration: 0.25, ease: 'power2.in' }, at + hold);
    },
  };
}

/** A quiet baseline with a spike at fraction `at` (used as a generic "signal" line). */
export function pulsePath(w, y, at = 0.5, amp = 1) {
  const x = w * at;
  const p = [[0, 0], [x - 150, 0], [x - 120, -18 * amp], [x - 96, 14 * amp], [x - 74, 0], [x - 46, 0], [x - 22, -150 * amp], [x + 10, 120 * amp], [x + 34, -46 * amp], [x + 56, 18 * amp], [x + 80, 0], [w, 0]];
  return p.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${(y + py).toFixed(1)}`).join(' ');
}

/** Geometry of the DSBA Hub mark in a 100×100 box: three cohort nodes joined at a highlighted hub. */
export const HUB_MARK = {
  hub: [50, 51.5],
  nodes: [[50, 23], [74.7, 65.8], [25.3, 65.8]],
  nodeR: 9, hubR: 12.5, stroke: 7.2,
};

/** The DSBA Hub mark as SVG markup (white spokes + nodes, yellow hub). Classes: hub-spoke, hub-node, hub-core. */
export function hubMarkSvg() {
  const { hub, nodes, nodeR, hubR, stroke } = HUB_MARK;
  return `<svg viewBox="0 0 100 100">${nodes.map(([x, y]) => `<line class="hub-spoke" x1="${hub[0]}" y1="${hub[1]}" x2="${x}" y2="${y}" stroke="#fff" stroke-width="${stroke}" stroke-linecap="round"/>`).join('')}${nodes.map(([x, y]) => `<circle class="hub-node" cx="${x}" cy="${y}" r="${nodeR}" fill="#fff"/>`).join('')}<circle class="hub-core" cx="${hub[0]}" cy="${hub[1]}" r="${hubR}" fill="#ffe14a" stroke="#1558f0" stroke-width="4.6"/></svg>`;
}

/** The DSBA Hub logo tile (brand-blue rounded square with the hub mark). */
export function logoTile(size = 150) {
  const t = el('div', 'logo-tile');
  t.style.width = t.style.height = `${size}px`;
  t.style.borderRadius = `${size * 0.28}px`;
  t.innerHTML = hubMarkSvg();
  return t;
}
