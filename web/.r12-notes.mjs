import { chromium } from 'playwright';
import fs from 'node:fs';
const dir = '/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/r12/shots';
const tok = fs.readFileSync('/private/tmp/claude-501/-Users-mohamed-dsba-hub/5411a11a-0ba5-46f6-8270-b4d416f58375/scratchpad/r12/token-admin', 'utf8').trim();
const browser = await chromium.launch({ channel: 'chrome' });
const log = [];
for (const [w, h, tag, touch] of [[1440, 900, 'd', false], [1180, 820, 'ipad', true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
  await ctx.addCookies([{ name: 'dsba_session', value: tok, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.push(`${tag} PAGEERROR ${e.message.slice(0, 200)}`));
  await page.goto('http://localhost:5173/notes', { waitUntil: 'networkidle' });
  await page.locator('[data-hub="note-new"]').click();
  await page.waitForTimeout(1500);
  log.push(`${tag} url after new: ${page.url()}`);
  await page.screenshot({ path: `${dir}/${tag}-note-new.png` });
  // list toolbar buttons
  const buttons = await page.$$eval('button', (bs) => bs.map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim()).filter(Boolean));
  log.push(`${tag} buttons: ${[...new Set(buttons)].join(' | ').slice(0, 1500)}`);
  // type some text in the first contenteditable/textbox
  const ed = page.locator('[contenteditable="true"], textarea').first();
  if (await ed.count()) { await ed.click(); await page.keyboard.type('Moment generating functions: M(t) = E[e^{tX}]. ', { delay: 5 }); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/${tag}-note-typed.png` });
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${dir}/notes-log.txt`, log.join('\n'));
console.log(log.join('\n'));
