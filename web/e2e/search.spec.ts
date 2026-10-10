// Site search (Ctrl+K or /) finds new content: a thread posted a moment ago, a module, a calendar date.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, remember } from './support';

/** Opens the palette with a shortcut and returns it once its search field has the focus. (A key pressed while
 * the page is still starting up can be missed, so it is pressed again if the palette didn't open.) */
async function palette(page: Page, key: string) {
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('combobox') });
  await expect(async () => {
    if (!(await dialog.isVisible())) await page.keyboard.press(key);
    await expect(dialog.getByRole('combobox')).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  return dialog;
}

test('Ctrl+K finds a thread posted a moment ago and opens it', async ({ sara, run }) => {
  const thread = await api<{ id: string; slug: string }>(sara, 'POST', '/api/v1/forum/threads', {
    title: `ST2134: bootstrap interval for the median [e2e ${run.tag}]`,
    body: 'Is the percentile bootstrap fine for the median with n = 25, or do we need the BCa interval?',
    category: 'year-2',
    moduleId: 'advanced-stats-inferential',
  });
  expect(thread.status).toBe(201);
  remember('threads', thread.body.id);

  await sara.goto('/');
  await expect(sara.getByRole('heading', { level: 1, name: new RegExp(run.sara.name.split(' ')[0]) })).toBeVisible(); // signed in and ready
  const search = await palette(sara, 'Control+k');
  await sara.keyboard.type(`bootstrap ${run.tag}`);
  const option = search.getByRole('option').filter({ hasText: 'bootstrap interval for the median' }).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(sara).toHaveURL(new RegExp(`/forum/${thread.body.slug}`));
});

test('"/" opens search, which finds modules and dates', async ({ guest }) => {
  await guest.goto('/forum');
  await expect(guest.getByRole('heading', { level: 1, name: 'Forum' })).toBeVisible();
  await expect(guest.getByRole('tab', { name: /^All/ })).toBeVisible(); // the page has loaded
  const search = await palette(guest, '/');
  await guest.keyboard.type('ST2133');
  await expect(search.getByRole('option').filter({ hasText: 'Advanced Statistics: Distribution Theory' }).first()).toBeVisible();
  await guest.keyboard.press('Control+a');
  await guest.keyboard.type('mock exam');
  await expect(search.getByRole('option').filter({ hasText: /Mock exam/i }).first()).toBeVisible();
  await guest.keyboard.press('Escape');
  await guest.keyboard.press('Escape');
  await expect(search).toHaveCount(0);
});
