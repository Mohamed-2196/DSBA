// Modules and lessons. Keeping guest progress on sign-in, resuming and clearing are in auth.setup.ts (they need a
// real sign-in); here: the module pages as a guest, and a shared computer's progress left out on sign-in.
import fs from 'node:fs';
import { expect, test } from './fixtures';
import { api, env, statePath } from './support';

test('a guest browses the modules and a module’s tabs', async ({ guest }) => {
  await guest.goto('/modules');
  await expect(guest.getByRole('heading', { name: 'Modules', level: 1 })).toBeVisible();
  await expect(guest.locator('main')).toContainText('ST2133');
  await guest.goto('/modules/advanced-stats-distribution');
  await expect(guest.locator('main')).toContainText('Advanced Statistics: Distribution Theory');
  const tabs = guest.locator('[data-hub="module-tabs"]');
  for (const tab of ['Lessons', 'Files', 'Discussion', 'Overview']) {
    await tabs.getByRole('tab', { name: new RegExp(`^${tab}`) }).click();
    await expect(tabs.getByRole('tab', { name: new RegExp(`^${tab}`) })).toHaveAttribute('aria-selected', 'true');
  }
  await guest.goto('/modules/advanced-stats-distribution/lessons/5g82thr5');
  await expect(guest.locator('[data-hub="lesson-player"]')).toBeVisible();
  // Lesson progress is off until the guest turns it on: no counts, and the lesson offers it once.
  await expect(guest.locator('[data-hub="lesson-list"]')).not.toContainText('watched');
  await expect(guest.locator('[data-hub="progress-offer"]')).toBeVisible();
});

test('Modules has no year control of its own: ?year= shows another year, and a module there links back', async ({
  guest,
}) => {
  await guest.goto('/modules');
  await expect(guest.getByRole('list', { name: 'Year 2 modules' })).toBeVisible();
  await expect(guest.locator('main').getByRole('radiogroup')).toHaveCount(0);

  await guest.goto('/modules?year=3');
  await expect(guest.getByRole('list', { name: 'Year 3 modules' })).toBeVisible();
  await expect(guest.locator('.ui-page-header__meta')).toContainText('Year 3');
  await guest.locator('[data-hub="module-tile"]').first().click();
  await guest.locator('main a[href="/modules?year=3"]').first().click();
  await expect(guest.getByRole('list', { name: 'Year 3 modules' })).toBeVisible();

  await guest.getByRole('button', { name: 'Back to Year 2' }).click();
  await expect(guest.getByRole('list', { name: 'Year 2 modules' })).toBeVisible();

  // Choosing your own year in the one control left also leaves the other year.
  await guest.goto('/modules?year=3');
  await expect(guest.getByRole('list', { name: 'Year 3 modules' })).toBeVisible();
  await guest.getByRole('radiogroup', { name: 'Your year' }).getByRole('radio', { name: 'Year 2' }).click();
  await expect(guest.getByRole('list', { name: 'Year 2 modules' })).toBeVisible();
  await expect(guest).toHaveURL(/\/modules$/);
});

test('the top bar has no upload button, and the footer still does', async ({ guest }) => {
  await guest.goto('/modules');
  await expect(guest.locator('[data-hub="topbar"]').getByRole('button', { name: 'Upload a file' })).toHaveCount(0);
  await expect(guest.locator('footer').getByRole('link', { name: 'Upload a file' })).toBeVisible();
});

test('on a shared computer, someone else’s guest progress can be left out when signing in', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: env.baseURL });
  await ctx.addInitScript(() => {
    window.localStorage.setItem('hub.noora.hidden', '1');
    if (!window.localStorage.getItem('selectedYear')) window.localStorage.setItem('selectedYear', '1');
  });
  const page = await ctx.newPage();
  await page.goto('/modules/economics/lessons/xfm6xyvy');
  await page.locator('[data-hub="progress-offer"]').getByRole('button', { name: 'Turn on' }).click();
  await page.locator('[data-hub="lesson-watched"]').click();
  await expect(page.locator('[data-hub="lesson-watched"]')).toHaveAttribute('aria-pressed', 'true');

  // The rep signs in on the same computer.
  const repState = JSON.parse(fs.readFileSync(statePath('rep'), 'utf8')) as {
    cookies: { name: string; value: string }[];
  };
  const token = repState.cookies.find((c) => c.name === 'dsba_session')?.value ?? '';
  await ctx.addCookies([{ name: 'dsba_session', value: token, domain: env.host, path: '/' }]);
  const before = await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress');
  await page.reload();
  const prompt = page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' });
  await expect(prompt).toContainText('someone marked 1 lesson as watched on this computer');
  await prompt.getByRole('button', { name: 'Leave it out' }).click();
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('hub.progress'))).toBeNull();
  const after = await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress');
  expect(after.body.watched).toEqual(before.body.watched);
  await page.reload();
  await expect(page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' })).toHaveCount(0);
  await ctx.close();
});

test('a student ticks a chapter as studied and undoes it; the watched lessons stay as they were', async ({ sara }) => {
  interface Progress {
    watched: Record<string, unknown>;
    studied: Record<string, unknown>;
  }
  expect((await api(sara, 'PATCH', '/api/v1/me', { preferences: { trackProgress: true } })).status).toBe(200);
  const progress = async () => (await api<Progress>(sara, 'GET', '/api/v1/me/progress')).body;
  const watched = Object.keys((await progress()).watched).sort();
  await sara.goto('/modules/advanced-stats-distribution?tab=lessons');
  const chapter = sara.locator('.mod-ch').nth(1);
  const head = chapter.locator('.mod-ch__head');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  const tick = chapter.getByRole('checkbox', { name: 'I’ve studied this chapter' });
  await expect(tick).toHaveAttribute('aria-checked', 'false');
  await tick.click();
  await expect(tick).toHaveAttribute('aria-checked', 'true');
  await expect(chapter.locator('.mod-ch__meta')).toContainText('Studied');
  await expect.poll(async () => Object.keys((await progress()).studied).length).toBe(1);
  expect(Object.keys((await progress()).watched).sort()).toEqual(watched);
  await tick.click();
  await expect(tick).toHaveAttribute('aria-checked', 'false');
  await expect.poll(async () => Object.keys((await progress()).studied).length).toBe(0);
});
