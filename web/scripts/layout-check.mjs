// Long-content layout check, by hand: DSBA_SESSION=<dev-login token> node scripts/layout-check.mjs [base]
//
// Run it against Vite or a preview (default http://localhost:5290) that forwards /api to a stack with data.
// Loads the main pages at 360, 768 and 1440 wide, light and dark, with every title, name and summary the API returns
// swapped for long content a student could type (a 200-character word with no spaces, a 200-character URL, a long
// Arabic title, a long sentence), and fails when a page scrolls sideways or a text box's content is wider than the
// box without an ellipsis or a line clamp. Signed in when DSBA_SESSION is set (`python -m app.cli dev-login`),
// otherwise as a guest.
// Chrome is the installed one (channel 'chrome'). Exit code 1 lists each problem with its page, size and selector.
// LAYOUT_ROUTES=/forum,/career checks only those pages.
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://localhost:5290';
const SESSION = process.env.DSBA_SESSION;
const SIZES = [
  { width: 360, height: 780, touch: true },
  { width: 768, height: 1024, touch: true },
  { width: 1440, height: 900, touch: false },
];
const THEMES = ['light', 'dark'];

const WORD = 'Supercalifragilistic_regression_coefficients_'.repeat(5).slice(0, 200);
const URL_TEXT = `https://example.com/${'very-long-path-segment/'.repeat(9)}`.slice(0, 200);
const ARABIC =
  'سؤال عن معاملات الانحدار في امتحان الإحصاء المتقدم لشهر أكتوبر وكيف نحسب الدالة المولدة للعزوم خطوة بخطوة';
const SENTENCE =
  'An unusually long module or section name that keeps going for well over one line, the way some real titles do';
const LONG = [WORD, ARABIC, URL_TEXT, SENTENCE];
// Free text a student, rep or editor writes. Ids, slugs, codes and enums stay as they are.
const KEYS = new Set(['title', 'name', 'shortName', 'excerpt', 'dek', 'summary', 'description', 'fileName']);
// Responses left alone: settings and flags whose names are identifiers, and the session.
const SKIP = /\/api\/v1\/(features|site|auth|admin\/features|admin\/roles|guides|grades\/rules|daily)/;

let turn = 0;
function lengthen(value) {
  if (Array.isArray(value)) return value.map(lengthen);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => {
        if (KEYS.has(k) && typeof v === 'string' && v.trim()) return [k, LONG[turn++ % LONG.length]];
        return [k, lengthen(v)];
      }),
    );
  }
  return value;
}

/** Ids for the detail pages, from the real API. */
async function discover(request) {
  const json = async (path) => {
    const res = await request.get(`${BASE}/api/v1/${path}`);
    return res.ok() ? res.json() : null;
  };
  const modules = (await json('modules')) ?? [];
  const threads = (await json('forum/threads?limit=1'))?.items ?? [];
  const issues = (await json('newsletter/issues')) ?? [];
  const routes = ['/', '/modules', '/library', '/forum', '/newsletter', '/calendar', '/career', '/daily'];
  const mod = modules[1] ?? modules[0];
  if (mod)
    routes.push(`/modules/${mod.id}`, `/modules/${mod.id}?tab=files`, `/library?module=${mod.id}&type=past-paper`);
  if (threads[0]) routes.push(`/forum/${threads[0].slug}`);
  if (issues[0]) routes.push(`/newsletter/${issues[0].slug}`);
  if (SESSION) routes.push('/notes', '/board', '/requests', '/account', '/manage');
  const only = process.env.LAYOUT_ROUTES?.split(',');
  return only
    ? routes.filter((r) => only.some((o) => r === o || r.startsWith(`${o}?`) || r.startsWith(`${o}/`)))
    : routes;
}

/** Runs in the page: the sideways overflow and every text box whose content is wider than it. */
function probe() {
  const problems = [];
  const doc = document.documentElement;
  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };
  if (doc.scrollWidth > window.innerWidth + 1) {
    // The innermost boxes past the right edge that no scrolling row holds: where the extra width comes from.
    const scrolls = (el) => ['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(el).overflowX);
    const past = [...document.body.querySelectorAll('*')].filter((el) => {
      if (el.getBoundingClientRect().right <= window.innerWidth + 1) return false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) if (scrolls(a)) return false;
      return true;
    });
    const inner = past.filter((el) => !past.some((other) => other !== el && el.contains(other))).slice(0, 3);
    problems.push(`page scrolls sideways (${doc.scrollWidth} px wide) at ${inner.map(describe).join(', ')}`);
  }
  const hasText = (el) =>
    [...el.childNodes].some(
      (n) =>
        (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) ||
        (n.nodeType === Node.ELEMENT_NODE && getComputedStyle(n).display === 'inline' && n.textContent.trim()),
    );
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (['inline', 'contents', 'none'].includes(cs.display) || cs.visibility === 'hidden') continue;
    if (el.clientWidth < 4 || el.closest('[aria-hidden="true"], svg, canvas, .katex')) continue;
    if (el.scrollWidth <= el.clientWidth + 1 || !hasText(el)) continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    const clamped = cs.textOverflow === 'ellipsis' || cs.webkitLineClamp !== 'none';
    if (clamped && cs.overflowX !== 'visible') continue;
    const text = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
    problems.push(`${describe(el)} is ${el.scrollWidth - el.clientWidth} px too wide: "${text}"`);
  }
  return problems;
}

const browser = await chromium.launch({ channel: 'chrome' });
const failures = [];
let routes = null;
for (const size of SIZES) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch,
      colorScheme: theme,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    if (SESSION) {
      const { hostname } = new URL(BASE);
      await context.addCookies([{ name: 'dsba_session', value: SESSION, domain: hostname, path: '/', httpOnly: true }]);
    }
    await context.addInitScript((t) => localStorage.setItem('theme', t), theme);
    routes ??= await discover(context.request);
    await context.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (route.request().method() !== 'GET' || SKIP.test(url)) return route.continue();
      const response = await route.fetch();
      const type = response.headers()['content-type'] ?? '';
      if (!type.includes('application/json')) return route.fulfill({ response });
      return route.fulfill({ response, json: lengthen(await response.json()) });
    });
    const page = await context.newPage();
    for (const path of routes) {
      turn = 0; // each page gets the same long content on every run
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(300);
      const found = await page.evaluate(probe);
      for (const p of found) failures.push(`${path} @ ${size.width} ${theme}: ${p}`);
    }
    await context.close();
  }
}
await browser.close();

if (failures.length) {
  console.log([...new Set(failures)].join('\n'));
  console.log(`\n${failures.length} layout problem(s) with long content.`);
  process.exit(1);
}
console.log(`No layout problems with long content on ${routes.length} pages × ${SIZES.length} sizes × 2 themes.`);
