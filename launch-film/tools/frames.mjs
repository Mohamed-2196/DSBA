// Renders film frames with headless Chromium.
//   node tools/frames.mjs --from 0 --to 120 [--out out/frames] [--workers 2] [--times 1.5,3,20.2] [--scale 1]
// --times renders just those timestamps (review stills named t_<time>.png).
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:5180/launch-video/src/index.html');
const out = opt('out', '/home/claude/launch-video/out/frames');
const fps = 30;
const workers = +opt('workers', 2);
fs.mkdirSync(out, { recursive: true });

const times = opt('times', null);
const jobs = times
  ? times.split(',').map((s) => ({ t: +s, file: path.join(out, `t_${(+s).toFixed(2).padStart(6, '0')}.png`) }))
  : (() => { const a = Math.round(+opt('from', 0) * fps); const b = Math.round(+opt('to', 120) * fps); return Array.from({ length: b - a }, (_, i) => ({ t: (a + i) / fps, file: path.join(out, `f_${String(a + i).padStart(5, '0')}.png`) })); })();

const skip = args.includes('--skip-existing');
const started = Date.now();
let done = 0;
async function run(list) {
  list = skip ? list.filter((j) => !fs.existsSync(j.file) || fs.statSync(j.file).size === 0) : list;
  if (!list.length) return;
  // one browser per worker: a shared browser serialises rasterisation in its GPU process
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: +opt('scale', 1) });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film, null, { timeout: 60000 });
  await page.evaluate(() => window.__film.ready);
  for (const j of list) {
    await page.evaluate((t) => window.__film.seek(t), j.t);
    await page.screenshot({ path: j.file, type: 'png' });
    done += 1;
    if (done % 150 === 0) console.log(`${done}/${jobs.length} frames, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  await browser.close();
}
// contiguous chunks per worker (each worker only ever seeks forward)
const size = Math.ceil(jobs.length / workers);
await Promise.all(Array.from({ length: workers }, (_, w) => run(jobs.slice(w * size, (w + 1) * size))));
console.log(`rendered ${done} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${out}`);
