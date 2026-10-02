// Screenshot any page of the DSBA site with correct fonts.
// Usage:
//   node tools/shoot-ui.mjs --url "http://127.0.0.1:5173/DSBA/#/forum" --out out.png \
//        [--w 1920] [--h 1080] [--theme light|dark] [--year 2] [--full] [--scale 1] [--wait 1200]
//        [--selector "[data-hub=thread-card]"]   (element screenshot of the first match)
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { installFontRoutes } from './fonts-route.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);

const url = opt('url', 'http://127.0.0.1:5173/DSBA/');
const out = opt('out', 'shot.png');
const w = +opt('w', 1920), h = +opt('h', 1080);
const theme = opt('theme', 'light');
const year = opt('year', '2');
const scale = +opt('scale', 1);
const wait = +opt('wait', 1200);
const selector = opt('selector', null);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
await installFontRoutes(page);
await page.addInitScript(([theme, year]) => {
  localStorage.setItem('selectedYear', year);
  localStorage.setItem('theme', theme);
  localStorage.setItem('year2_new_notes_announcement_v1', '1');
}, [theme, year]);
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(wait);
if (selector) {
  await page.locator(selector).first().screenshot({ path: out });
} else {
  await page.screenshot({ path: out, fullPage: flag('full') });
}
console.log('saved', out);
await browser.close();
