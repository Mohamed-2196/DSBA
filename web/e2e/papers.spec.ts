// Past papers, end to end: a rep shares a May 2024 zone A paper and its examiners' report; Sara finds them together
// on the module's Files tab, times herself, tags question 3 with a chapter, and finds it on the Lessons tab. The spec
// switches tagging on and puts it back as it was.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, makeFiles, remember, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

interface Item {
  id: string;
  slug: string;
  status: string;
}

test.beforeAll(async ({ browser }) => switchOn(browser, 'papers', ['library.questions']));

test.afterAll(async ({ browser }) => switchBack(browser, 'papers'));

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
    await expect(sittings).toBeVisible();
    // Newest first: an older sitting may be past the first few.
    const showAll = sittings.getByRole('button', { name: /^Show all \d+ sittings$/ });
    if (await showAll.isVisible()) await showAll.click();
    // Each zone's paper is a card with its first page; the sitting's examiners' report is on it.
    const open = `Open EC1002 ZA May 2024 [e2e ${run.tag}]`;
    const card = sittings
      .getByRole('listitem', { name: 'May 2024', exact: true })
      .locator('[data-hub="paper-card"]')
      .filter({ has: sara.getByRole('link', { name: open }) });
    await expect(
      card
        .getByRole('link', { name: /^Report( \d)?$/ })
        .and(sara.getByTitle(`EC1002 commentary May 2024 [e2e ${run.tag}]`)),
    ).toBeVisible();
    await card.getByRole('link', { name: open }).click();
    await expect(sara).toHaveURL(new RegExp(`/library/${paper.slug}$`));

    const sitting = sara.locator('[data-hub="file-sitting"]');
    await expect(sitting.getByRole('heading', { name: 'May 2024 sitting' })).toBeVisible();
    await expect(
      sitting
        .getByRole('link', { name: /Examiners’ report/ })
        .and(sara.getByTitle(`EC1002 commentary May 2024 [e2e ${run.tag}]`)),
    ).toBeVisible();

    await sara.getByRole('button', { name: 'Time me' }).click();
    const timeMe = sara.getByRole('dialog', { name: 'Time me' });
    await timeMe.getByRole('radio', { name: '1 hour' }).click();
    await timeMe.getByRole('button', { name: 'Start 1 hour' }).click();
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
