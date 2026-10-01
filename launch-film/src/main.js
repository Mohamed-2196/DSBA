// Builds the film as one paused GSAP timeline plus per-frame functions, and exposes
// window.__film = { duration, fps, seek(t), ready } for the frame renderer.
// Open with ?play to watch it in real time (with sound, if out/audio/mix.wav exists).
import { FPS, el, frameFns, scenes, prog } from './lib.js';
import { buildAct1 } from './act1.js';
import { buildAct23 } from './act23.js';

const json = (u) => fetch(u).then((r) => r.json());
const [cues, config, manifest] = await Promise.all([json('../cues.json'), json('../config.json'), json('../assets/ui/manifest.json')]);
const stage = document.getElementById('stage');
const tl = gsap.timeline({ paused: true });
const C = { cues, config, manifest, stage, tl };
buildAct1(C);
buildAct23(C);
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
  const fonts = ['800 60px Schibsted', '500 60px Schibsted', '600 60px Newsreader', 'italic 500 60px Newsreader', '500 40px JBMono', '700 40px JBMono', '700 60px Fredoka', '600 60px Fredoka', '800 60px Playfair', '600 30px Playfair', 'italic 700 60px Playfair', '700 60px Caveat'];
  await Promise.all(fonts.map((f) => document.fonts.load(f)));
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((res) => { img.onload = img.onerror = res; })).then(() => img.decode().catch(() => {}))));
  seek(0);
  return true;
})();

window.__film = { duration: cues.duration, fps: FPS, seek, ready, cues };

if (new URLSearchParams(location.search).has('play')) {
  await ready;
  const from = Number(new URLSearchParams(location.search).get('t') || 0);
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
