// Builds the film as one paused GSAP timeline plus per-frame functions, and exposes
// window.__film = { duration, fps, seek(t), ready } for the frame renderer.
// Open with ?play to watch it in real time (with sound, if out/audio/mix.wav exists).
// ?only=2 (or 1,3 / 2,3 …) builds just those acts: handy while working on one of them.
import { FPS, el, frameFns, scenes, prog } from './lib.js';

const params = new URLSearchParams(location.search);
const json = (u) => fetch(u).then((r) => r.json());
const [cues, config, manifest] = await Promise.all([json('../cues.json'), json('../config.json'), json('../assets/ui/manifest.json').catch(() => ({}))]);
const stage = document.getElementById('stage');
const tl = gsap.timeline({ paused: true });
const C = { cues, config, manifest, stage, tl };
/** Scene start/end by id prefix, e.g. S('s08') → { start: 72, end: 85.5 }. */
C.S = (id) => cues.scenes.find((s) => s.id === id || s.id.startsWith(`${id}_`));

const only = params.get('only');
const ACTS = [['1', './act1.js', 'buildAct1'], ['2', './act2.js', 'buildAct2'], ['3', './act3.js', 'buildAct3']];
for (const [n, file, fn] of ACTS) {
  if (only && !only.split(',').includes(n)) continue;
  try {
    const mod = await import(file);
    await mod[fn](C);
  } catch (err) {
    // one act failing must not take the others down while several people work on the film
    console.error(`[film] act ${n} failed to build:`, err);
  }
}
const fade = el('div');
fade.id = 'fade';
stage.appendChild(fade);

function seek(t) {
  tl.seek(t, true);
  for (const s of scenes) s.root.style.visibility = t >= s.start && t < s.end ? 'visible' : 'hidden';
  for (const fn of frameFns) fn(t);
  fade.style.opacity = String(Math.max(1 - prog(t, 0, 0.5), prog(t, cues.outro.fade[0], cues.outro.fade[1] - 0.1)));
  return t;
}

const ready = (async () => {
  const fonts = ['800 60px Schibsted', '500 60px Schibsted', '600 60px Newsreader', 'italic 500 60px Newsreader', '500 40px JBMono', '700 40px JBMono', '800 60px Playfair', '600 30px Playfair', 'italic 700 60px Playfair', '700 60px Caveat'];
  await Promise.all(fonts.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; })).then(() => img.decode().catch(() => {}))));
  seek(0);
  return true;
})();

window.__film = { duration: cues.duration, fps: FPS, seek, ready, cues };

if (params.has('play')) {
  await ready;
  const from = Number(params.get('t') || 0);
  const audio = new Audio('../out/audio/mix.wav');
  audio.currentTime = from;
  let t0 = null;
  const loop = (now) => {
    if (t0 == null) t0 = now;
    const t = audio.paused ? from + (now - t0) / 1000 : audio.currentTime;
    if (t < cues.duration) { seek(t); requestAnimationFrame(loop); }
  };
  document.body.addEventListener('click', () => audio.play(), { once: true });
  requestAnimationFrame(loop);
  const s = Math.min(innerWidth / 1920, innerHeight / 1080);
  stage.style.transformOrigin = '0 0';
  stage.style.transform = `scale(${s})`;
}
