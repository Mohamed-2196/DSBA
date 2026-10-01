// Captures every UI asset the film needs from the running DSBA Pulse app (clock frozen at the
// event time). Writes PNGs to assets/ui/ and rectangles to assets/ui/manifest.json.
//   node tools/capture-ui.mjs [only-group ...]     groups: stills seq-composer seq-cmdk elements dark
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
    ['issue-top', '/newsletter/launch-edition', 1500],
    ['issue-cohort', '/newsletter/launch-edition?section=cohort-corner', 2200],
    ['issue-deadlines', '/newsletter/launch-edition?section=deadlines', 2200],
    ['library', '/library', 1800],
    ['viewer-nb', '/library/st2195-block-6-notebook-data-wrangling', 1800],
    ['viewer-paper', '/library/st2133-past-paper-2025-zone-a', 1800],
    ['lessons', '/modules/advanced-stats-distribution?tab=lessons&chapter=1&video=3', 1800],
    ['modules', '/modules', 1500],
    ['calendar', '/calendar', 2500],
  ];
  for (const [name, hash, wait] of stills) {
    const { ctx, page } = await openPage(browser, { hash, scale: 2, wait });
    await shot(page, name);
    if (name === 'lessons') manifest.lessonsPlay = await rect(page, '.mod-poster__play');
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
    const { ctx, page } = await openPage(browser, { hash: '/forum', scale: 2, wait: 1500 });
    manifest.forumEggRow = await rect(page, `[data-pulse=thread-row][data-thread-id="${EGG}"]`);
    manifest.forumEggCount = await rect(page, `[data-thread-id="${EGG}"] .forum-vote__count`);
    manifest.forumEggVote = await rect(page, `[data-thread-id="${EGG}"] [data-pulse=vote]`);
    manifest.forumStart = await rect(page, '[data-pulse=new-thread-button]');
    manifest.forumFirstRow = await rect(page, '[data-pulse=thread-row]');
    await hideEggCount(page);
    await shot(page, 'forum');
    await ctx.close();
  }
}

if (want('elements')) {
  console.log('elements (2x)');
  {
    const { ctx, page } = await openPage(browser, { hash: '/newsletter', scale: 2, wait: 1500, h: 2400 });
    const covers = page.locator('[data-pulse=issue-cover]');
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
    const thumbs = page.locator('[data-pulse=library-new] [data-pulse=file-thumb], .lib-new [data-pulse=file-thumb]');
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
  const text = TYPED.forum.typed_text;
  const { ctx, page } = await openPage(browser, { hash: '/forum/new', scale: 1, wait: 1500 });
  manifest.composer = await rect(page, '[data-pulse=composer]');
  manifest.composerTitle = await rect(page, '[data-pulse=composer-title]');
  manifest.composerPost = await rect(page, '[data-pulse=post-button]');
  const title = page.locator('[data-pulse=composer-title]');
  await title.click();
  await page.waitForTimeout(300);
  await shot(page, 'composer-00');
  for (let i = 0; i < text.length; i += 1) {
    await page.keyboard.type(text[i]);
    await page.waitForTimeout(i === text.length - 1 ? 900 : 60);
    await shot(page, `composer-${String(i + 1).padStart(2, '0')}`);
  }
  manifest.composerFrames = text.length + 1;
  await page.locator('[data-pulse=composer-body]').fill('Did the 2024 Zone A paper last night and the MGF questions destroyed me. What did you focus on in the last two weeks?');
  await page.waitForTimeout(500);
  await shot(page, 'composer-final');
  manifest.composerPost = await rect(page, '[data-pulse=post-button]');
  await page.locator('[data-pulse=post-button]').click();
  await page.waitForTimeout(1300);
  manifest.postedFirstRow = await rect(page, '[data-pulse=thread-row]:not(:has-text("Welcome to the forum"))');
  manifest.postedEggRow = await rect(page, `[data-pulse=thread-row][data-thread-id="${EGG}"]`);
  manifest.postedEggCount = await rect(page, `[data-thread-id="${EGG}"] .forum-vote__count`);
  await hideEggCount(page);
  await shot(page, 'forum-posted');
  await ctx.close();
}

if (want('seq-cmdk')) {
  console.log('search palette typing (1x)');
  const text = TYPED.montage.search_text;
  const { ctx, page } = await openPage(browser, { hash: '/', scale: 1, wait: 4600 });
  await page.keyboard.press('Meta+k');
  await page.waitForTimeout(700);
  manifest.cmdk = await rect(page, '[data-pulse=cmdk]');
  await shot(page, 'cmdk-00');
  for (let i = 0; i < text.length; i += 1) {
    await page.keyboard.type(text[i]);
    await page.waitForTimeout(i === text.length - 1 ? 700 : 140);
    await shot(page, `cmdk-${String(i + 1).padStart(2, '0')}`);
  }
  manifest.cmdkFrames = text.length + 1;
  manifest.cmdkFinal = await rect(page, '[data-pulse=cmdk]');
  await ctx.close();
}

if (want('dark')) {
  console.log('dark stills (1x)');
  for (const [name, hash, wait] of [['home-dark', '/', 4600], ['forum-dark', '/forum', 1500], ['library-dark', '/library', 1800], ['newsletter-dark', '/newsletter', 1500], ['calendar-dark', '/calendar', 2500], ['lessons-dark', '/modules/advanced-stats-distribution?tab=lessons&chapter=1&video=3', 1800]]) {
    const { ctx, page } = await openPage(browser, { hash, scale: 1, wait, theme: 'dark' });
    await shot(page, name);
    await ctx.close();
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
console.log('manifest keys:', Object.keys(manifest).join(', '));
await browser.close();
