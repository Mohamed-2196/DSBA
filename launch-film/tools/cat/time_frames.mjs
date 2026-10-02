// Timing helper: how long does a frame take to seek, rasterise and capture as PNG (what tools/frames.mjs does)?
//   node tools/cat/time_frames.mjs [t0=77] [n=10] [only=2]
// Run it once on an Act 1 time (e.g. `30 6 1`) to see what "normal" is under the machine's current load.
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const t0 = +(process.argv[2] || 77);
const n = +(process.argv[3] || 10);
const only = process.argv[4] || '2';
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });
await page.goto(`http://127.0.0.1:5180/launch-video/src/index.html?only=${only}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__film, null, { timeout: 60000 });
await page.evaluate(() => window.__film.ready);
let seek = 0; let shot = 0; let bytes = 0; let js = 0;
for (let i = 0; i < n; i += 1) {
  const t = t0 + i / 30;
  let b = Date.now();
  js += await page.evaluate((tt) => { const s = performance.now(); window.__film.seek(tt); return performance.now() - s; }, t);
  seek += Date.now() - b;
  b = Date.now();
  bytes += (await page.screenshot({ type: 'png' })).length;
  shot += Date.now() - b;
}
console.log(`t=${t0} only=${only}: js ${(js / n).toFixed(1)} ms, seek round-trip ${(seek / n).toFixed(0)} ms, screenshot ${(shot / n).toFixed(0)} ms, ${(bytes / n / 1e6).toFixed(2)} MB/frame`);
await browser.close();
