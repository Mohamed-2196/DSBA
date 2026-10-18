// Forum categories: Ali posts in "Study groups", a category for every year, from a link that picks it. Sara (Year 2)
// finds the thread under that category's tab and not under her year's, and the thread's page leads back to it.
import { expect, test } from './fixtures';
import { remember } from './support';

test('a thread posted in a category is listed under it, and its page leads back to it', async ({ ali, sara, run }) => {
  const title = `ST2133 revision group on Thursday? [e2e ${run.tag}]`;
  await ali.goto('/forum/new?category=study-groups');
  await expect(ali.locator('[data-hub="composer-category"]')).toHaveValue('study-groups');
  await ali.getByLabel('Title').fill(title);
  await ali.locator('[data-hub="composer-body"]').fill('Library, 6 pm. Bring the May 2024 paper and a calculator.');
  const [resp] = await Promise.all([
    ali.waitForResponse((r) => r.url().endsWith('/api/v1/forum/threads') && r.request().method() === 'POST'),
    ali.locator('[data-hub="post-button"]').click(),
  ]);
  expect(resp.status()).toBe(201);
  const thread = (await resp.json()) as { id: string; slug: string; category: string };
  remember('threads', thread.id);
  expect(thread.category).toBe('study-groups');

  await sara.goto('/forum');
  const categories = sara.getByRole('tablist', { name: 'Categories' });
  await categories.getByRole('tab', { name: /^Study groups/ }).click();
  await expect(sara).toHaveURL(/cohort=study-groups/);
  await expect(sara.locator('main').getByRole('link', { name: title })).toBeVisible();
  await categories.getByRole('tab', { name: /^Year 2/ }).click();
  await expect(sara).toHaveURL(/cohort=year-2/);
  await expect(sara.locator('main').getByRole('link', { name: title })).toHaveCount(0);

  await sara.goto(`/forum/${thread.slug}`);
  await sara.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Study groups' }).click();
  await expect(sara).toHaveURL(/\/forum\?cohort=study-groups/);
});
