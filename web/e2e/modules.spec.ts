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
  await guest.goto('/modules/advanced-stats-distribution?tab=lessons&chapter=1&video=0');
  await expect(guest.locator('[data-hub="lesson-player"]')).toBeVisible();
  await expect(guest.locator('[data-hub="lesson-list"]')).toContainText(/0 of \d+ lessons watched/);
});

test('on a shared computer, someone else’s guest progress can be left out when signing in', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: env.baseURL });
  await ctx.addInitScript(() => {
    window.localStorage.setItem('hub.noora.hidden', '1');
    if (!window.localStorage.getItem('selectedYear')) window.localStorage.setItem('selectedYear', '1');
  });
  const page = await ctx.newPage();
  await page.goto('/modules/economics?tab=lessons&chapter=0&video=0');
  await page.locator('[data-hub="lesson-watched"]').click();
  await expect(page.locator('[data-hub="lesson-watched"]')).toHaveAttribute('aria-pressed', 'true');

  // The rep signs in on the same computer.
  const repState = JSON.parse(fs.readFileSync(statePath('rep'), 'utf8')) as { cookies: { name: string; value: string }[] };
  const token = repState.cookies.find((c) => c.name === 'dsba_session')?.value ?? '';
  await ctx.addCookies([{ name: 'dsba_session', value: token, domain: env.host, path: '/' }]);
  const before = await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress');
  await page.reload();
  const prompt = page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' });
  await expect(prompt).toContainText('someone marked 1 lesson as watched on this computer');
  await prompt.getByRole('button', { name: 'Leave it out' }).click();
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => window.localStorage.getItem('hub.lessons.v1'))).toBeNull();
  const after = await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress');
  expect(after.body.watched).toEqual(before.body.watched);
  await page.reload();
  await expect(page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' })).toHaveCount(0);
  await ctx.close();
});
