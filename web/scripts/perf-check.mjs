// A cold-load measurement of the main pages on a production build: not part of the e2e suite, run by hand.
//
//   npx vite build && npx vite preview --port 4250 --strictPort    (the preview forwards /api to :8000)
//   DSBA_SESSION=<token from `python -m app.cli dev-login`> node scripts/perf-check.mjs [base] [rtt ms] [--calls]
//
// Each page opens in a fresh browser context (empty cache, no service worker) with Chrome's network emulation at the
// given round trip (default 300 ms) and 20 Mbit/s, as a guest and, when DSBA_SESSION is set, signed in. For each it
// prints the requests by type, the JS and CSS bytes on the wire, the largest contentful paint, when the network went
// quiet, the longest chain of scripts and styles that waited on each other, and the API calls (repeats marked).
// Chrome is the installed one (channel 'chrome').
import { chromium } from '@playwright/test';

const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const BASE = ARGS[0] ?? 'http://localhost:4250';
const RTT = Number(ARGS[1] ?? 300);
const SESSION = process.env.DSBA_SESSION;
const ROUTES = ['/', '/library', '/modules', '/forum', '/calendar'];

const browser = await chromium.launch({ channel: 'chrome' });

async function measure(route, signedIn) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  if (signedIn) {
    const { hostname } = new URL(BASE);
    await context.addCookies([{ name: 'dsba_session', value: SESSION, domain: hostname, path: '/', httpOnly: true }]);
  }
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: RTT,
    downloadThroughput: (20 * 1024 * 1024) / 8,
    uploadThroughput: (5 * 1024 * 1024) / 8,
  });
  const requests = new Map();
  cdp.on('Network.requestWillBeSent', (e) => {
    const init = e.initiator;
    const from = init.url ?? init.stack?.callFrames?.[0]?.url ?? init.stack?.parent?.callFrames?.[0]?.url;
    requests.set(e.requestId, { url: e.request.url, type: e.type, from, bytes: 0 });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = requests.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  const started = Date.now();
  await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120_000 });
  const idle = Date.now() - started - 500; // networkidle waits 500 ms of quiet
  const lcp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) last = e.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(Math.round(last)), 300);
      }),
  );
  await context.close();

  const all = [...requests.values()];
  const local = (r) => r.url.startsWith(BASE);
  const byType = (t) => all.filter((r) => local(r) && r.type === t);
  const scripts = byType('Script');
  const styles = byType('Stylesheet');
  const images = byType('Image');
  const fonts = byType('Font');
  const api = all.filter((r) => r.url.includes('/api/'));
  // The chain: how many files each script or style waited on before it was asked for.
  const depthOf = new Map();
  const depth = (url, seen = new Set()) => {
    if (depthOf.has(url)) return depthOf.get(url);
    if (seen.has(url)) return 0;
    seen.add(url);
    const r = all.find((x) => x.url === url);
    const d = r?.from && r.from !== url && r.from !== BASE + route ? depth(r.from, seen) + 1 : 1;
    depthOf.set(url, d);
    return d;
  };
  const chain = Math.max(0, ...[...scripts, ...styles].map((r) => depth(r.url)));
  const kb = (list) => Math.round(list.reduce((n, r) => n + r.bytes, 0) / 1024);
  const counts = new Map();
  for (const r of api) {
    const path = new URL(r.url).pathname + new URL(r.url).search;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  return {
    route,
    who: signedIn ? 'signed in' : 'guest',
    js: scripts.length,
    css: styles.length,
    img: images.length,
    font: fonts.length,
    api: api.length,
    jsKB: kb(scripts),
    cssKB: kb(styles),
    lcp,
    idle,
    chain,
    calls: [...counts].map(([p, n]) => (n > 1 ? `${p} x${n}` : p)),
  };
}

const rows = [];
for (const signedIn of SESSION ? [false, true] : [false]) {
  for (const route of ROUTES) rows.push(await measure(route, signedIn));
}
await browser.close();

console.log(`RTT ${RTT} ms, 20 Mbit/s, 1440x900, cold cache`);
console.log('who        route      js css img font api  jsKB cssKB   lcp  idle chain');
for (const r of rows) {
  console.log(
    `${r.who.padEnd(10)} ${r.route.padEnd(10)} ${String(r.js).padStart(2)} ${String(r.css).padStart(3)} ${String(r.img).padStart(3)} ${String(r.font).padStart(4)} ${String(r.api).padStart(3)} ${String(r.jsKB).padStart(5)} ${String(r.cssKB).padStart(5)} ${String(r.lcp).padStart(5)} ${String(r.idle).padStart(5)} ${String(r.chain).padStart(5)}`,
  );
}
if (process.argv.includes('--calls')) {
  for (const r of rows) console.log(`\n${r.who} ${r.route}\n  ${r.calls.join('\n  ')}`);
}
