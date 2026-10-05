// Batch screenshots of the DSBA Hub app with the film's capture conditions:
// clock frozen at 2026-10-06 10:00 Asia/Bahrain, Mac user agent (shows ⌘K), local fonts.
//
//   node tools/snap-batch.mjs spec.json outDir
//
// spec.json: [{ name, hash, w?, h?, scale?, theme?, year?, full?, selector?, wait?, clearYear?, noora?,
//               ls?: {key: value}, steps?: [{click}|{type:[sel,text]}|{press}|{wait}|{eval}|{hover}|{scroll:[sel,y]}] }]
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { installFontRoutes } from './fonts-route.mjs';

export const BASE = process.env.PULSE_BASE || 'http://127.0.0.1:5173/DSBA/';
export const FILM_NOW = '2026-10-06T10:00:00+03:00';
export const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const THUMBS = '/home/claude/launch-video/assets/yt';

export async function openPage(browser, s = {}) {
  const ctx = await browser.newContext({
    viewport: { width: s.w || 1920, height: s.h || 1080 },
    deviceScaleFactor: s.scale || 1,
    timezoneId: 'Asia/Bahrain',
    locale: 'en-GB',
    userAgent: MAC_UA,
  });
  const page = await ctx.newPage();
  await installFontRoutes(page);
  // Serve YouTube thumbnails from disk when we have them (the sandbox can't reach i.ytimg.com).
  await page.route(/i\.ytimg\.com\/vi\/([^/]+)\//, (route) => {
    const id = route.request().url().match(/\/vi\/([^/]+)\//)[1];
    const f = path.join(THUMBS, `${id}.jpg`);
    if (fs.existsSync(f)) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(f) });
    return route.abort();
  });
  await page.clock.setFixedTime(new Date(s.now || FILM_NOW));
  await page.addInitScript(([theme, year, clearYear, ls, noora]) => {
    try {
      if (clearYear) localStorage.removeItem('selectedYear'); else localStorage.setItem('selectedYear', year);
      localStorage.setItem('theme', theme);
      // Mini Noora (the floating mascot) stays out of the film's page captures unless a shot asks for her: { noora: true }
      localStorage.setItem('hub.noora.hidden', noora ? '0' : '1');
      for (const [k, v] of Object.entries(ls || {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    } catch { /* ignore */ }
  }, [s.theme || 'light', String(s.year || 2), !!s.clearYear, s.ls || null, !!s.noora]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/posthog|ERR_FAILED|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  await page.goto(BASE + '#' + (s.hash || '/'), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(s.wait ?? 900);
  return { ctx, page, errors };
}

export async function runSteps(page, steps = []) {
  for (const st of steps) {
    if (st.click) await page.locator(st.click).first().click();
    else if (st.type) await page.locator(st.type[0]).first().pressSequentially(st.type[1], { delay: 15 });
    else if (st.fill) await page.locator(st.fill[0]).first().fill(st.fill[1]);
    else if (st.press) await page.keyboard.press(st.press);
    else if (st.hover) await page.locator(st.hover).first().hover();
    else if (st.eval) await page.evaluate(st.eval);
    else if (st.scroll) await page.evaluate(([sel, y]) => { const el = sel ? document.querySelector(sel) : document.scrollingElement; el.scrollTop = y; }, st.scroll);
    await page.waitForTimeout(st.wait ?? 350);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const outDir = process.argv[3] || '.';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const s of spec) {
    const { ctx, page, errors } = await openPage(browser, s);
    try {
      await runSteps(page, s.steps);
      const out = path.join(outDir, `${s.name}.png`);
      if (s.selector) await page.locator(s.selector).first().screenshot({ path: out });
      else await page.screenshot({ path: out, fullPage: !!s.full });
      console.log('ok ', s.name, errors.length ? `  [${errors.length} errors] ${errors[0].slice(0, 160)}` : '');
    } catch (e) {
      console.log('ERR', s.name, e.message.split('\n')[0]);
    }
    await ctx.close();
  }
  await browser.close();
}
