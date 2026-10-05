// Checks that frames are a pure function of time: each time is rendered three ways (direct on a fresh
// page, again after seeking far away and back, and after seeking to a later time first) and the
// three screenshots must be byte-identical.
//   node tools/seekcheck.mjs --times 41.3,42.8,46.5 [--url http://127.0.0.1:5180/launch-video/src/index.html?only=1]
import crypto from 'crypto';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const URL = opt('url', 'http://127.0.0.1:5180/launch-video/src/index.html?only=1');
const times = opt('times', '1').split(',').map(Number);
const hash = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 12);

async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__film, null, { timeout: 60000 });
  await page.evaluate(() => window.__film.ready);
  return page;
}
const snap = async (page, t) => { await page.evaluate((x) => window.__film.seek(x), t); return hash(await page.screenshot({ type: 'png' })); };

const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
let bad = 0;
const a = await open(browser);
const direct = [];
for (const t of times) direct.push(await snap(a, t));                       // forward, in order
const b = await open(browser);
for (let i = times.length - 1; i >= 0; i -= 1) {                             // backward, with detours
  const t = times[i];
  await snap(b, Math.min(t + 7.3, 150));
  await snap(b, Math.max(t - 9.1, 0));
  const h = await snap(b, t);
  const ok = h === direct[i];
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok  ' : 'DIFF'} t=${t}  forward ${direct[i]}  detour ${h}`);
}
await browser.close();
console.log(bad ? `${bad} time(s) differ: something depends on seek history` : 'all frames identical regardless of seek order');
process.exit(bad ? 1 : 0);
