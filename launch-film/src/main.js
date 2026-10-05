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

// The tape rewinds (cues.g2.rewind, in the cut that rolls back to the cohort dots): between t0 and t1 the
// picture is the film itself at an earlier time, running backwards from `from` to `to`, fast at first and
// coming to rest. Every scene is a pure function of the time it is given, so this is only another clock.
// On top, drawn by the real clock: what a tape deck prints on the picture, REWIND and then PLAY.
const RW = (cues.g2 && cues.g2.rewind) || null;
const PLAY = (cues.network && cues.network.rollback && cues.network.rollback.play) || null;
const shown = (t) => {
  if (!RW || t < RW.t0 || t >= RW.t1) return t;
  const p = (t - RW.t0) / (RW.t1 - RW.t0);
  return RW.from + (RW.to - RW.from) * (1 - (1 - p) ** (RW.power || 1.8));
};
const osd = el('div');
osd.id = 'osd';
osd.innerHTML = '<span class="osd__mode"><i></i><i></i><b></b></span><span class="osd__clock"></span>';
stage.appendChild(osd);
const [osdMode, osdClock] = osd.children;
const clock = (u) => `${Math.floor(u / 60)}:${String(Math.floor(u % 60)).padStart(2, '0')}`;
let osdWas = '';

function seek(t) {
  const u = shown(t);
  tl.seek(u, true);
  for (const s of scenes) s.root.style.visibility = u >= s.start && u < s.end ? 'visible' : 'hidden';
  for (const fn of frameFns) fn(u);
  fade.style.opacity = String(Math.max(1 - prog(t, 0, 0.5), prog(t, cues.outro.fade[0], cues.outro.fade[1] - 0.1)));
  const mode = RW && t >= RW.t0 && t < RW.t1 ? 'rew' : PLAY && t >= PLAY[0] && t < PLAY[1] ? 'play' : '';
  if (mode !== osdWas) {
    osdWas = mode;
    osd.style.visibility = mode ? 'visible' : 'hidden';
    osd.className = mode;
    osdMode.lastChild.textContent = mode === 'rew' ? 'REWIND' : 'PLAY';
  }
  if (mode) {
    const s = clock(mode === 'rew' ? u : RW.to + (t - PLAY[0]));       // the film's own clock at the picture shown
    if (osdClock.textContent !== s) osdClock.textContent = s;
    // a deck's PLAY blinks out: on for most of its second, then gone
    if (mode === 'play') osd.style.opacity = t < PLAY[1] - 0.25 ? '1' : String(Math.floor((PLAY[1] - t) * 16) % 2);
    else osd.style.opacity = '1';
  }
  return t;
}

const ready = (async () => {
  const fonts = ['800 60px Schibsted', '500 60px Schibsted', '600 60px Newsreader', 'italic 500 60px Newsreader', '500 40px JBMono', '700 40px JBMono', '800 60px Playfair', '600 30px Playfair', 'italic 700 60px Playfair', '700 60px Caveat'];
  await Promise.all(fonts.map((f) => document.fonts.load(f)));
  // the formula in Mini Noora's answer: letters and figures come from two files of one family (film.css), and a
  // family is only fetched for the characters asked for, so ask for both kinds
  await Promise.all([document.fonts.load('40px NrMath', 'MXtλ 02=()−′/'), document.fonts.load('40px NrMain', 'Var 2'), document.fonts.load('40px NrBig', '[]∫')]);
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
