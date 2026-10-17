import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/r12/shots';
const tok = fs.readFileSync('/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/r12/token-' + (process.env.WHO || 'admin'), 'utf8').trim();
const pages = JSON.parse(process.env.PAGES);
const sizes = JSON.parse(process.env.SIZES || '[[1440,900,"d"],[390,844,"m"]]');
const browser = await chromium.launch({ channel: 'chrome' });
const errors = [];
for (const [w, h, tag] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, ...(w < 600 ? { isMobile: true, hasTouch: true } : {}) });
  await ctx.addCookies([{ name: 'dsba_session', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.addInitScript(() => { try { localStorage.setItem('hub.noora.hint', 'seen'); } catch {} });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${tag} ${page.url()} PAGEERROR ${e.message.slice(0, 160)}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} ${page.url()} console ${m.text().slice(0, 160)}`); });
  for (const [name, path] of pages) {
    try {
      await page.goto('http://localhost:5173' + path, { waitUntil: 'networkidle', timeout: 25000 });
    } catch (e) { errors.push(`${tag} ${path} GOTO ${String(e).slice(0, 120)}`); }
    await page.waitForTimeout(700);
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (sideways) errors.push(`${tag} ${path} SIDEWAYS-SCROLL`);
    await page.screenshot({ path: `${dir}/${tag}-${name}.png`, fullPage: !!process.env.FULL });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${dir}/errors-${process.env.TAG || 'run'}.txt`, errors.join('\n'));
console.log('done', errors.length, 'issues');
