// Past papers, end to end: a rep shares a May 2024 zone A paper and its examiners' report; Sara finds them together
// in one row of the module's Files tab, times herself, tags question 3 with a chapter, and finds it on the Lessons
// tab. The spec switches tagging on and puts it back as it was.
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
  test.slow(); // two uploads, then four pages
  const files = makeFiles(run.tag);
  const made: Item[] = [];
  try {
    const paper = await share(rep, files.paper, `EC1002 ZA May 2024 [e2e ${run.tag}]`, 'past-paper', 'A');
    made.push(paper);
    made.push(await share(rep, files.report, `EC1002 commentary May 2024 [e2e ${run.tag}]`, 'examiners-report', ''));

    await sara.goto('/modules/economics?tab=files');
    const sittings = sara.locator('[data-hub="paper-sittings"]');
    await expect(sittings).toBeVisible();
    // Newest first: on a phone an older sitting may be past the first few.
    const showAll = sittings.getByRole('button', { name: /^Show all \d+ sittings$/ });
    if (await showAll.isVisible()) await showAll.click();
    // One row per sitting: each zone's paper, then the sitting's examiners' report, as links named by the sitting.
    const may = sittings.getByRole('listitem', { name: 'May 2024', exact: true });
    await expect(
      may
        .getByRole('link', { name: /^May 2024 (Zone [AB] )?[Rr]eport( \d)?( New)?$/ }) // New: shared this week
        .and(sara.getByTitle(`EC1002 commentary May 2024 [e2e ${run.tag}]`))
        .first(),
    ).toBeVisible();
    await may
      .getByRole('link', { name: /^May 2024 Zone A( \(\d\))? paper/ })
      .and(sara.getByTitle(`EC1002 ZA May 2024 [e2e ${run.tag}]`))
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
    const timeMe = sara.getByRole('dialog', { name: 'Time me' });
    await timeMe.getByRole('radio', { name: '1 hour' }).click();
    await timeMe.getByRole('button', { name: 'Start 1 hour' }).click();
    await expect(sara.locator('[data-hub="exam-timer"]')).toContainText(/0:59:\d\d left/);
    await sara.getByRole('button', { name: 'End this attempt' }).click();
    await sara.getByRole('dialog', { name: 'End this attempt?' }).getByRole('button', { name: 'End attempt' }).click();
    // Ending asks for the score there and then while boards (where scores live) are on (ST-47); she skips it, which
    // keeps the stopped clock (ST-67), then closes the timer.
    const score = sara.getByRole('dialog', { name: 'How did it go?' });
    if (
      await score.waitFor({ timeout: 3000 }).then(
        () => true,
        () => false,
      )
    ) {
      await score.getByRole('button', { name: 'Skip', exact: true }).click();
      await expect(score).toBeHidden();
      await sara.locator('[data-hub="exam-timer"]').getByRole('button', { name: 'Close the timer' }).click();
    }
    await expect(sara.locator('[data-hub="exam-timer"]')).toBeHidden();

    const tags = sara.locator('[data-hub="question-tags"]');
    await tags.getByRole('button', { name: /^Tag (this|a) question$/ }).click();
    const tagging = sara.getByRole('dialog', { name: 'Tag this question' });
    await tagging.getByLabel('Question').selectOption('3');
    await tagging.getByLabel('Page').fill('2');
    await tagging.getByLabel('Chapter').selectOption({ index: 1 });
    const chapter =
      (await tagging.getByLabel('Chapter').locator('option:checked').textContent())?.replace(/^\d+\.\s*/, '') ?? '';
    await tagging.locator('[data-hub="tag-question-submit"]').click();
    await expect(tags.getByRole('listitem').filter({ hasText: chapter })).toContainText('Q3 (p. 2)');

    await sara.goto('/modules/economics?tab=lessons');
    const past = sara.locator('[data-hub="chapter-questions"]');
    await expect(past.getByRole('heading', { name: 'Past exam questions on this chapter' })).toBeVisible();
    await past
      .getByRole('link')
      .filter({ hasText: 'Q3 (p. 2)' })
      .and(sara.getByTitle(`EC1002 ZA May 2024 [e2e ${run.tag}]`))
      .click();
    await expect(sara).toHaveURL(new RegExp(`/library/${paper.slug}\\?page=2$`));
  } finally {
    for (const item of made) await api(rep, 'DELETE', `/api/v1/library/items/${item.id}`);
  }
});

test('a sectioned paper names its questions by section: B1 under Questions by topic', async ({ sara }) => {
  // The seed tags EC1002's 2023 papers by section (A1 to A8, then B1 and on).
  const { body: tagged } = await api<
    Array<{
      section: string | null;
      question: number;
      page: number | null;
      chapterTitle: string;
      paper: { slug: string };
    }>
  >(sara, 'GET', '/api/v1/library/questions?module_id=economics');
  const b1 = tagged.find((q) => q.section === 'B' && q.question === 1);
  test.skip(!b1, 'no B1 question in the seed on this stack');
  if (!b1) return;
  const label = b1.page ? `B1 (p. ${b1.page})` : 'B1';

  await sara.goto(`/library/${b1.paper.slug}`);
  const tags = sara.locator('[data-hub="question-tags"]');
  await expect(
    tags.getByRole('listitem').filter({ hasText: b1.chapterTitle }).filter({ hasText: label }),
  ).toBeVisible();
  await expect(tags.getByRole('listitem').filter({ hasText: /^Q\d/ })).toHaveCount(0); // no "Q9" for B1
});
