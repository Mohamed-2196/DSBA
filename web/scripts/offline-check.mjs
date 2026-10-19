// A browser check of reading offline (api/offline.ts, sw/sw.ts): not part of the e2e suite, run by hand against a
// production build, because only a build has the service worker.
//
//   npx vite build && npx vite preview --port 5244 --strictPort    (the preview forwards /api to :8000)
//   DSBA_SESSION=<token from `python -m app.cli dev-login`> node scripts/offline-check.mjs [base] [screenshot dir]
//
// Signed in with a made-up account, it reads the library, a file, the forum, a thread and the calendar online; then
// goes offline (Chrome's offline emulation), opens the hub cold and reads them again; tries a write; comes back
// online; checks the offline line at phone, tablet, laptop and monitor sizes; and signs out, which must empty the
// kept snapshot. Chrome is the installed one (channel 'chrome').
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5244';
const OUT = process.argv[3] ?? 'offline-shots';
const SESSION = process.env.DSBA_SESSION;
if (!SESSION) throw new Error('Set DSBA_SESSION to a session token (python -m app.cli dev-login …).');
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const { hostname } = new URL(BASE);
await context.addCookies([{ name: 'dsba_session', value: SESSION, domain: hostname, path: '/', httpOnly: true }]);
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
const bar = page.locator('[data-hub="offline-bar"]');
const keptCount = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('dsba-hub-offline', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('snapshot');
        req.onsuccess = () => {
          const get = req.result.transaction('snapshot').objectStore('snapshot').get('current');
          get.onsuccess = () =>
            resolve(
              get.result
                ? { owner: get.result.owner, keys: get.result.entries.map((e) => JSON.stringify(e.key)) }
                : null,
            );
        };
      }),
  );

// ── Online: the worker installs, and the screens are read once ──────────────────────────────────────────────
await page.goto(`${BASE}/`);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload(); // the worker now controls the page, so the files it serves are kept
await page.locator('main').waitFor();

await page.goto(`${BASE}/library`);
const card = page.locator('[data-hub="file-card"]').first();
await card.waitFor();
const fileHref = await card.locator('a').first().getAttribute('href');
await page.goto(`${BASE}${fileHref}`);
const fileTitle = (await page.locator('main h1').first().innerText()).trim();

await page.goto(`${BASE}/forum`);
const threadLink = page.locator('main a[href^="/forum/"]:not([href="/forum/new"])').first();
await threadLink.waitFor();
const threadHref = await threadLink.getAttribute('href');
await page.goto(`${BASE}${threadHref}`);
const threadTitle = (await page.locator('main h1').first().innerText()).trim();

await page.goto(`${BASE}/calendar`);
await page.locator('[data-hub="calendar-grid"], [data-hub="calendar-event"]').first().waitFor();
await page.goto(`${BASE}/library`);
await card.waitFor();
await page.waitForTimeout(2500); // writes are gathered for 1.5 s
const kept = await keptCount();
const keptKeys = kept?.keys.join(' ') ?? '';
check(keptKeys.includes('"forum","thread"'), 'the snapshot holds the thread');
check(keptKeys.includes('"library","item"'), 'the snapshot holds the file’s details');
check(keptKeys.includes('"library","list"'), 'the snapshot holds the library list');
check(keptKeys.includes('"calendar","events"'), 'the snapshot holds the calendar');
if (process.env.DEBUG) console.log(kept);

// ── Offline: a cold start opens the hub, and the kept screens read ──────────────────────────────────────────
await context.setOffline(true);
await page.reload();
await bar.waitFor();
check((await bar.innerText()).includes('showing what you last saw'), 'the offline line shows on a cold start');
await page.locator('[data-hub="file-card"]').first().waitFor({ timeout: 5000 });
check(true, 'the library list reads offline');
await shot('offline-library');

/** The page's title once it shows, or null (with a screenshot to look at). */
const titleOf = async (name) => {
  const h1 = page.locator('main h1').first();
  const shown = await h1.waitFor({ timeout: 5000 }).then(
    () => true,
    () => false,
  );
  await shot(name);
  return shown ? (await h1.innerText()).trim() : null;
};

await page.goto(`${BASE}${fileHref}`);
const fileShown = await titleOf('offline-file');
check(fileShown === fileTitle, `the file's page reads (${fileTitle})`);

await page.goto(`${BASE}${threadHref}`);
check((await titleOf('offline-thread')) === threadTitle, `the thread reads (${threadTitle})`);

// a write: the API isn't reached, and the message says why
const replyBox = page.getByRole('textbox', { name: 'Your reply' });
await replyBox.waitFor({ timeout: 5000 }).catch(() => undefined);
if (await replyBox.count()) {
  await replyBox.click();
  await page.keyboard.type('Offline reply check');
  await page.locator('[data-hub="post-reply"]').first().click();
  const said = page.getByText('You’re offline, so this didn’t go through');
  await said
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => undefined);
  check((await said.count()) > 0, 'a reply offline says it needs a connection');
  await shot('offline-write');
} else {
  check(false, 'the thread has a reply box');
}

await page.goto(`${BASE}/calendar`);
await page.locator('[data-hub="calendar-grid"], [data-hub="calendar-event"]').first().waitFor({ timeout: 5000 });
check(true, 'the calendar reads offline');
await shot('offline-calendar');

// a library filter never opened: nothing kept, and the line says so
await page.goto(`${BASE}/library?q=zzzz-never-searched`);
await page.waitForTimeout(800);
check((await bar.innerText()).includes('wasn’t kept'), 'an unkept page says it loads once back online');
await shot('offline-unkept');

// ── The offline line at every size: no sideways scroll ───────────────────────────────────────────────────────
await page.goto(`${BASE}${threadHref}`);
await bar.waitFor();
const sizes = [
  [360, 780],
  [390, 844],
  [430, 932],
  [844, 390],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1366, 1024],
  [1280, 800],
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
  [2560, 1440],
  [3440, 1440],
];
for (const [width, height] of sizes) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check(!wide, `${width}×${height}: nothing scrolls sideways`);
  if ([360, 844, 768, 1440, 3440].includes(width)) await shot(`offline-bar-${width}x${height}`);
}
await page.setViewportSize({ width: 1280, height: 800 });

// ── Back online: the line goes and the page is read again ────────────────────────────────────────────────────
await context.setOffline(false);
await bar.waitFor({ state: 'detached', timeout: 5000 });
check(true, 'the offline line goes when the connection is back');

// ── Signing out empties the snapshot ─────────────────────────────────────────────────────────────────────────
await page.goto(`${BASE}/library`);
await card.waitFor();
await page
  .getByRole('button', { name: /account|profile|menu/i })
  .first()
  .click()
  .catch(() => undefined);
const signOut = page.getByRole('menuitem', { name: 'Sign out' });
if (await signOut.count()) {
  await signOut.click();
  await page.getByRole('button', { name: 'Sign in' }).first().waitFor();
  await page.waitForTimeout(2500);
  const after = await keptCount();
  check(
    after === null || after.owner === 'guest',
    `signing out drops the account's snapshot (${JSON.stringify(after)})`,
  );
} else {
  check(false, 'found Sign out in the profile menu');
}

await browser.close();
console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exit(failures.length ? 1 : 0);
