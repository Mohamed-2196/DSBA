// Is every frame a pure function of t? Renders a set of times three ways (fresh page per frame; one page seeking
// forwards; one page seeking in a scrambled order with other frames in between) and compares the PNGs byte for byte.
//   node tools/cat/determinism.mjs [times=72.9,73.45,74.2,77,80.3,82.6,85.8,86.2,88.5]
import crypto from 'crypto';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const times = (process.argv[2] || '72.9,73.45,74.2,77,80.3,82.6,85.8,86.2,88.5').split(',').map(Number);
const URL = 'http://127.0.0.1:5180/launch-video/src/index.html?only=2';
const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
const open = async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film, null, { timeout: 60000 });
  await page.evaluate(() => window.__film.ready);
  return page;
};
const shot = async (page, t) => {
  await page.evaluate((tt) => window.__film.seek(tt), t);
  return crypto.createHash('md5').update(await page.screenshot({ type: 'png' })).digest('hex');
};
const fresh = {};
for (const t of times) { const p = await open(); fresh[t] = await shot(p, t); await p.close(); }
const fwd = {};
{ const p = await open(); for (const t of times) fwd[t] = await shot(p, t); await p.close(); }
const mixed = {};
{
  const p = await open();
  const order = [...times].reverse();
  for (const t of order) { await shot(p, t - 0.7); await shot(p, 89); mixed[t] = await shot(p, t); }
  await p.close();
}
let bad = 0;
for (const t of times) {
  const ok = fresh[t] === fwd[t] && fresh[t] === mixed[t];
  if (!ok) bad += 1;
  console.log(String(t).padEnd(7), ok ? 'identical' : `DIFFERENT fresh=${fresh[t].slice(0, 8)} forward=${fwd[t].slice(0, 8)} scrambled=${mixed[t].slice(0, 8)}`);
}
console.log(bad ? `${bad} frame(s) depend on history` : 'all frames identical in all three orders');
await browser.close();
