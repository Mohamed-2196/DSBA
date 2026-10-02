// Does the type move smoothly under the slow push-in, or does it snap to whole pixels?
// Renders the type alone on black (src/act2.js honours ?bd=type) for a run of frames and writes PNGs;
// tools/cat/type_jitter.py then tracks each line's centroid.  (DOM text snapped: 1 px hops. Canvas type: < 0.05 px.)
//   node tools/cat/type_jitter.mjs <outdir> [t0=81] [n=24] [step=0.1]
import fs from 'fs';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const out = process.argv[2];
const t0 = +(process.argv[3] || 81);
const n = +(process.argv[4] || 24);
const step = +(process.argv[5] || 0.1);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto('http://127.0.0.1:5180/launch-video/src/index.html?only=2&bd=type', { waitUntil: 'load' });
await page.waitForFunction(() => window.__film, null, { timeout: 60000 });
await page.evaluate(() => window.__film.ready);
for (let i = 0; i < n; i += 1) {
  const t = t0 + i * step;
  await page.evaluate((tt) => window.__film.seek(tt), t);
  await page.screenshot({ type: 'png', path: `${out}/j_${String(i).padStart(3, '0')}.png` });
}
await browser.close();
