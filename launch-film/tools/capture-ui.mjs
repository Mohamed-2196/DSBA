// Captures every UI asset the film needs from the running DSBA Hub app (clock frozen at the
// event time). Writes PNGs to assets/ui/ and rectangles to assets/ui/manifest.json.
//   node tools/capture-ui.mjs [only-group ...]     groups: stills seq-composer seq-cmdk seq-career elements dark
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
import { openPage, runSteps } from './snap-batch.mjs';

const OUT = '/home/claude/launch-video/assets/ui';
fs.mkdirSync(OUT, { recursive: true });
const manifestPath = path.join(OUT, 'manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const only = process.argv.slice(2);
const want = (g) => !only.length || only.includes(g);
const TYPED = JSON.parse(fs.readFileSync('/home/claude/launch-video/cues.json', 'utf8'));
const EGG = 'why-is-everyone-acting-weird-today';
const COOKED = 'what-is-this-am-i-cooked';
// The film shows this thread being written, so the seeded copy is hidden while capturing the forum.
const HIDE = { 'hub.forum.hidden': [COOKED] };
const LESSON = '/modules/advanced-stats-distribution?tab=lessons&chapter=1&video=10';

const rect = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return b ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null;
};
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); console.log('  ', name); };
const hideEggCount = (page) => page.evaluate((id) => {
  document.querySelectorAll(`[data-thread-id="${id}"] .forum-vote__count`).forEach((el) => { el.style.visibility = 'hidden'; });
}, EGG);

const browser = await chromium.launch();

if (want('stills')) {
  console.log('stills (2x)');
  const stills = [
    ['home', '/', 4600],
    ['newsletter', '/newsletter', 1500],
    ['issue-top', '/newsletter/launch-edition', 1800],
    ['issue-council', '/newsletter/launch-edition?section=student-council', 2400],
    ['issue-speech', '/newsletter/launch-edition?section=speech-day', 2400],
    ['issue-launch', '/newsletter/launch-edition?section=launch', 2400],
    ['library', '/library', 2200],
    ['viewer-fine', '/library/st2187-business-analytics-cover', 2600],
    ['viewer-table', '/library/st2133-common-continuous-distributions', 2600],
    ['lessons', LESSON, 2200],
    ['career', '/career', 2600],
    ['modules', '/modules', 1500],
    ['calendar', '/calendar', 2500],
  ];
  for (const [name, hash, wait] of stills) {
    const { ctx, page } = await openPage(browser, { hash, scale: 2, wait });
    await shot(page, name);
    if (name === 'lessons') {
      manifest.lessonsPlay = await rect(page, '.mod-poster__play');
      manifest.lessonsPoster = await rect(page, '[data-hub=lesson-poster]');
    }
    await ctx.close();
  }
  // grades with the first-class example loaded
  {
    const { ctx, page } = await openPage(browser, { hash: '/grades', scale: 2, wait: 1200 });
    await runSteps(page, [{ click: 'button:has-text("Try an example")', wait: 400 }, { click: '[role=menuitem]:has-text("first-class")', wait: 1200 }]);
    await shot(page, 'grades');
    await ctx.close();
  }
  // forum list (egg count hidden: the film animates it)
  {
    const { ctx, page } = await openPage(browser, { hash: '/forum', scale: 2, wait: 1500, ls: HIDE });
    manifest.forumEggRow = await rect(page, `[data-hub=thread-row][data-thread-id="${EGG}"]`);
    manifest.forumEggCount = await rect(page, `[data-thread-id="${EGG}"] .forum-vote__count`);
    manifest.forumEggVote = await rect(page, `[data-thread-id="${EGG}"] [data-hub=vote]`);
    manifest.forumStart = await rect(page, '[data-hub=new-thread-button]');
    manifest.forumFirstRow = await rect(page, '[data-hub=thread-row]');
    await hideEggCount(page);
    await shot(page, 'forum');
    await ctx.close();
  }
}

if (want('elements')) {
  console.log('elements (2x)');
  {
    const { ctx, page } = await openPage(browser, { hash: '/newsletter', scale: 2, wait: 1500, h: 2400 });
    const covers = page.locator('[data-hub=issue-cover]');
    const n = await covers.count();
    manifest.covers = [];
    for (let i = 0; i < n; i += 1) {
      const b = await covers.nth(i).boundingBox();
      if (!b || b.width < 120) continue;
      const name = `cover-${manifest.covers.length}`;
      await covers.nth(i).screenshot({ path: path.join(OUT, `${name}.png`) });
      manifest.covers.push({ name, w: Math.round(b.width), h: Math.round(b.height) });
    }
    console.log('   covers', manifest.covers.length);
    await ctx.close();
  }
  {
    const { ctx, page } = await openPage(browser, { hash: '/library', scale: 2, wait: 1800 });
    const thumbs = page.locator('[data-hub=library-new] [data-hub=file-thumb], .lib-new [data-hub=file-thumb]');
    const n = Math.min(8, await thumbs.count());
    manifest.thumbs = [];
    for (let i = 0; i < n; i += 1) {
      const b = await thumbs.nth(i).boundingBox();
      const name = `thumb-${i}`;
      await thumbs.nth(i).screenshot({ path: path.join(OUT, `${name}.png`) });
      manifest.thumbs.push({ name, w: Math.round(b.width), h: Math.round(b.height), x: Math.round(b.x), y: Math.round(b.y) });
    }
    console.log('   thumbs', manifest.thumbs.length);
    await ctx.close();
  }
}

if (want('seq-composer')) {
  console.log('composer typing (1x)');
  const text = Array.from(TYPED.forum.typed_text);   // code points: the skull is one keystroke
  // posted in Year 1 → MT1186 Mathematical Methods (the composer reads both from the URL)
  const { ctx, page } = await openPage(browser, { hash: '/forum/new?attach=reduction-formula&category=year-1&module=mathematics', scale: 1, wait: 1800, ls: HIDE });
  // Film-only: a shorter details box, so the attached question is on screen while the title is typed.
  await page.addStyleTag({ content: '[data-hub=composer-body]{min-height:0!important;height:84px!important}' });
  await page.waitForTimeout(300);
  manifest.composer = await rect(page, '[data-hub=composer]');
  manifest.composerTitle = await rect(page, '[data-hub=composer-title]');
  manifest.composerCategory = await rect(page, '[data-hub=composer-category]');
  manifest.composerModule = await rect(page, '[data-hub=composer-module]');
  manifest.composerAttachment = await rect(page, '[data-hub=composer-attachment]');
  const title = page.locator('[data-hub=composer-title]');
  await title.click();
  await page.waitForTimeout(300);
  await shot(page, 'composer-00');
  for (let i = 0; i < text.length; i += 1) {
    await page.keyboard.insertText(text[i]);
    await page.waitForTimeout(i === text.length - 1 ? 900 : 60);
    await shot(page, `composer-${String(i + 1).padStart(2, '0')}`);
  }
  manifest.composerFrames = text.length + 1;
  // scroll down to the Post button for the last beat
  await page.locator('[data-hub=post-button]').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const b = document.querySelector('[data-hub=post-button]'); const r = b.getBoundingClientRect(); window.scrollBy(0, r.bottom - (window.innerHeight - 70)); });
  await page.waitForTimeout(500);
  manifest.composerScroll = await page.evaluate(() => window.scrollY || document.scrollingElement.scrollTop);
  manifest.composerPost = await rect(page, '[data-hub=post-button]');
  manifest.composerAttachmentFinal = await rect(page, '[data-hub=composer-attachment]');
  await shot(page, 'composer-final');
  await page.locator('[data-hub=post-button]').click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  manifest.postedHash = await page.evaluate(() => location.hash);
  manifest.postedFirstRow = await rect(page, '[data-hub=thread-row]:not(:has-text("Welcome to the forum"))');
  manifest.postedEggRow = await rect(page, `[data-hub=thread-row][data-thread-id="${EGG}"]`);
  manifest.postedEggCount = await rect(page, `[data-thread-id="${EGG}"] .forum-vote__count`);
  await hideEggCount(page);
  await shot(page, 'forum-posted');
  await ctx.close();
}

if (want('seq-career')) {
  // Career Navigator scrolls from the employers down to the certificates: one frame per film frame,
  // at the eased scroll positions the film plays back in order.
  console.log('career scroll (1.5x)');
  const [t0, t1] = TYPED.montage.career_scroll;
  const N = Math.round((t1 - t0) * TYPED.fps);
  const { ctx, page } = await openPage(browser, { hash: '/career', scale: 1.5, wait: 2600 });
  const target = await page.evaluate(() => {
    const el = document.querySelector('[data-hub=career-certs]');
    return Math.round(el.getBoundingClientRect().top + window.scrollY - 80);
  });
  // visit the bottom once so anything lazy has loaded, then go back to the top
  await page.evaluate((y) => window.scrollTo(0, y), target);
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - ((-2 * p + 2) ** 3) / 2);
  for (let k = 0; k <= N; k += 1) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(target * ease(k / N)));
    await page.waitForTimeout(k === 0 || k === N ? 500 : 140);
    await shot(page, `career-${String(k).padStart(2, '0')}`);
  }
  manifest.careerFrames = N + 1;
  manifest.careerScroll = target;
  manifest.careerLogos = await page.evaluate(() => [...document.querySelectorAll('[data-hub=career-logo]')].map((e) => e.getAttribute('data-logo-state')).reduce((a, s) => { a[s] = (a[s] || 0) + 1; return a; }, {}));
  console.log('   frames', N + 1, 'scroll', target, 'logos', JSON.stringify(manifest.careerLogos));
  await ctx.close();
}

if (want('seq-cmdk')) {
  console.log('search palette typing (1x)');
  const text = TYPED.montage.search_text;
  const { ctx, page } = await openPage(browser, { hash: '/', scale: 1, wait: 4600 });
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(700);
  manifest.cmdk = await rect(page, '[data-hub=cmdk]');
  await shot(page, 'cmdk-00');
  for (let i = 0; i < text.length; i += 1) {
    await page.keyboard.type(text[i]);
    await page.waitForTimeout(i === text.length - 1 ? 700 : 140);
    await shot(page, `cmdk-${String(i + 1).padStart(2, '0')}`);
  }
  manifest.cmdkFrames = text.length + 1;
  manifest.cmdkFinal = await rect(page, '[data-hub=cmdk]');
  await ctx.close();
}

if (want('dark')) {
  console.log('dark stills (1x)');
  for (const [name, hash, wait] of [['home-dark', '/', 4600], ['forum-dark', '/forum', 1500], ['library-dark', '/library', 1800], ['newsletter-dark', '/newsletter', 1500], ['calendar-dark', '/calendar', 2500], ['lessons-dark', LESSON, 2200], ['career-dark', '/career', 2200]]) {
    const { ctx, page } = await openPage(browser, { hash, scale: 1, wait, theme: 'dark' });
    await shot(page, name);
    await ctx.close();
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log('manifest keys:', Object.keys(manifest).join(', '));
await browser.close();
