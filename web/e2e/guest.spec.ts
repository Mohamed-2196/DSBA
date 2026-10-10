// Reading needs no account: every page as a guest, on a desktop and a 390×844 phone, in light and dark;
// and writing asks a guest to sign in first.
import { expect, test } from './fixtures';
import { env, prepareContext, trackErrors } from './support';

const PAGES: [string, RegExp][] = [
  ['/', /Good (morning|afternoon|evening)/],
  ['/modules', /^Modules$/],
  ['/modules/advanced-stats-distribution', /Advanced Statistics: Distribution Theory/],
  ['/library', /^Library$/],
  ['/forum', /^Forum$/],
  ['/forum/new', /^Start a thread$/],
  ['/newsletter', /The DSBA Newsletter/],
  ['/calendar', /^Calendar$/],
  ['/career', /^Career Navigator$/],
  ['/grades', /^Grades$/],
  ['/about', /About DSBA Hub/],
  ['/account', /^Your account$/],
  ['/moderation', /^Moderation$/],
  ['/admin/people', /^People$/],
];

test('every page loads for a guest, without errors', async ({ guest }) => {
  const errors = trackErrors(guest);
  for (const [url, heading] of PAGES) {
    await guest.goto(url);
    await expect(guest.getByRole('heading', { level: 1, name: heading }).first(), url).toBeVisible();
  }
  await guest.goto('/no-such-page');
  await expect(guest.getByText('This page doesn’t exist')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every page fits a 390×844 phone screen, in dark mode too', async ({ browser }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ baseURL: env.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme });
    await prepareContext(ctx);
    const page = await ctx.newPage();
    for (const [url, heading] of PAGES) {
      await page.goto(url);
      await expect(page.getByRole('heading', { level: 1, name: heading }).first(), url).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} scrolls sideways at 390 px (${colorScheme})`).toBeLessThanOrEqual(0);
    }
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const [r, g, b] = (bg.match(/\d+/g) ?? []).map(Number);
    const light = (r + g + b) / 3 > 128;
    expect(light, `body background ${bg} in ${colorScheme} mode`).toBe(colorScheme === 'light');
    await ctx.close();
  }
});

test('writing asks a guest to sign in first', async ({ guest }) => {
  const signIn = guest.getByRole('dialog').filter({ has: guest.getByLabel('Email or phone number') });
  await guest.goto('/library');
  await guest.getByRole('button', { name: 'Upload a file' }).first().click();
  await expect(signIn).toBeVisible();
  await guest.keyboard.press('Escape');

  await guest.goto('/forum/new');
  await guest.getByLabel('Title').fill('ST2133: what does "almost surely" mean?');
  await guest.locator('[data-hub="post-button"]').click();
  await expect(signIn).toBeVisible();
  await expect(signIn).toContainText('Sign in to post your thread');
  await guest.keyboard.press('Escape');

  await guest.goto('/newsletter');
  await expect(guest.getByRole('button', { name: /Sign in to subscribe/ })).toBeVisible();
});
