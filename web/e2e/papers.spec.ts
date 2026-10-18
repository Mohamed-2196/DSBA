// Past papers, end to end: a rep shares a May 2024 zone A paper and its examiners' report; Sara finds them side by
// side on the module's Files tab, times herself, tags question 3 with a chapter, and finds it on the Lessons tab.
// Tagging arrives switched off, so the spec switches it on and back off.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, makeFiles, personaContext, remember, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

interface Item {
  id: string;
  slug: string;
  status: string;
}

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'library.questions', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'library.questions', 'off');
  await ctx.close();
});

async function share(
  page: Page,
  file: string,
  title: string,
  kind: 'past-paper' | 'examiners-report',
  zone: '' | 'A',
): Promise<Item> {
  await page.goto('/library?upload=1');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Upload a file');
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Module').selectOption('economics');
  await dialog.getByLabel('Type').selectOption(kind);
  await dialog.getByLabel('Exam year').fill('2024');
  await dialog.getByLabel('Session').selectOption('may');
  await dialog.getByLabel('Zone').selectOption(zone);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/library/items') && r.request().method() === 'POST', {
      timeout: 30_000,
    }),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  await page.keyboard.press('Escape');
  const item = (await resp.json()) as Item;
  remember('items', item.id);
  expect(item.status).toBe('published'); // a rep's file skips review
  return item;
}

test('a paper sits with its report, Sara times herself, tags a question and finds it under its chapter', async ({
  sara,
  rep,
  run,
}) => {
  const files = makeFiles(run.tag);
  const made: Item[] = [];
  try {
    const paper = await share(rep, files.pdf, `EC1002 ZA May 2024 [e2e ${run.tag}]`, 'past-paper', 'A');
    made.push(paper);
    made.push(await share(rep, files.pdf, `EC1002 commentary May 2024 [e2e ${run.tag}]`, 'examiners-report', ''));

    await sara.goto('/modules/economics?tab=files');
    const sittings = sara.locator('[data-hub="paper-sittings"]');
    // Imported papers may share the sitting, so a label can carry a number ("Paper 2").
    const may = sittings.getByRole('listitem').filter({ has: sara.getByRole('heading', { name: 'May 2024' }) });
    await expect(
      may.getByRole('link', {
        name: new RegExp(`^Examiners’ report( \\d)?: EC1002 commentary May 2024 \\[e2e ${run.tag}\\]$`),
      }),
    ).toBeVisible();
    await may
      .getByRole('link', { name: new RegExp(`^Paper( \\d)?: EC1002 ZA May 2024 \\[e2e ${run.tag}\\]$`) })
      .click();
    await expect(sara).toHaveURL(new RegExp(`/library/${paper.slug}$`));

    const sitting = sara.locator('[data-hub="file-sitting"]');
    await expect(sitting.getByRole('heading', { name: 'May 2024 sitting' })).toBeVisible();
    await expect(
      sitting
        .getByRole('link', { name: /Examiners’ report/ })
        .and(sara.getByTitle(`EC1002 commentary May 2024 [e2e ${run.tag}]`)),
    ).toBeVisible();

    await sara.getByRole('button', { name: 'Time me' }).click();
    await sara.getByRole('menuitem', { name: '1 hour' }).click();
    await expect(sara.locator('[data-hub="exam-timer"]')).toContainText(/0:59:\d\d left/);
    await sara.getByRole('button', { name: 'Stop the timer' }).click();

    const tags = sara.locator('[data-hub="question-tags"]');
    await tags.getByLabel('Question').selectOption('3');
    await tags.getByLabel('Page').fill('2');
    await tags.getByLabel('Chapter').selectOption({ index: 1 });
    const chapter =
      (await tags.getByLabel('Chapter').locator('option:checked').textContent())?.replace(/^\d+\.\s*/, '') ?? '';
    await tags.getByRole('button', { name: 'Tag the question' }).click();
    await expect(tags.getByRole('listitem').filter({ hasText: chapter })).toContainText('Q3 (p. 2)');

    await sara.goto('/modules/economics?tab=lessons');
    const past = sara.locator('[data-hub="chapter-questions"]');
    await expect(past.getByRole('heading', { name: 'Past exam questions on this chapter' })).toBeVisible();
    await past.getByRole('link', { name: /May 2024, Zone A\s*Q3 \(p\. 2\)/ }).click();
    await expect(sara).toHaveURL(new RegExp(`/library/${paper.slug}\\?page=2$`));
  } finally {
    for (const item of made) await api(rep, 'DELETE', `/api/v1/library/items/${item.id}`);
  }
});
