// Round 14's study core, end to end:
//   - a past paper timed with Time me asks "How did it go?" when the clock stops, and shows "Done, 68%" (ST-47);
//   - Home's Carry on leads back to the paper she had open (ST-43, IDEA-40);
//   - saving a score says so (ST-60: it doesn't yet);
//   - the forum's Yours tab lists the threads she started, and nobody else's (IDEA-42);
//   - search reads a misspelt word as the word the Hub uses (ST-54).
// A note's text view on a phone (UX-70) and its module (IDEA-41) are in notebook.spec.ts.
// Boards (where scores live) are switched on for the spec and put back as they were found.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, makeFiles, remember, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'study-core', ['board']));
test.afterAll(async ({ browser }) => switchBack(browser, 'study-core'));

interface Item {
  id: string;
  slug: string;
  status: string;
}

/** A rep shares a past paper in ST2134 (October 2023, zone A): published at once. */
async function sharePaper(rep: Page, file: string, title: string): Promise<Item> {
  await rep.goto('/library?upload=1');
  const dialog = rep.getByRole('dialog');
  await expect(dialog).toContainText('Upload a file');
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Module').selectOption('advanced-stats-inferential');
  await dialog.getByLabel('Type').selectOption('past-paper');
  await dialog.getByLabel('Exam year').fill('2023');
  await dialog.getByLabel('Session').selectOption('october');
  await dialog.getByLabel('Zone').selectOption('A');
  const [resp] = await Promise.all([
    rep.waitForResponse((r) => r.url().endsWith('/api/v1/library/items') && r.request().method() === 'POST', {
      timeout: 30_000,
    }),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  await rep.keyboard.press('Escape');
  const item = (await resp.json()) as Item;
  remember('items', item.id);
  expect(item.status).toBe('published');
  return item;
}

/** The paper the first test shares; the second test scores it again and removes it. */
let paper: Item | null = null;

test('Time me asks for the score when it stops, the paper says "Done, 68%", and Carry on leads back to it', async ({
  sara,
  rep,
  run,
}) => {
  test.slow(); // an upload, then four pages
  const files = makeFiles(run.tag);
  paper = await sharePaper(rep, files.paper, `ST2134 timed paper October 2023 [e2e ${run.tag}]`);
  await sara.goto(`/library/${paper.slug}`);
  await sara.getByRole('button', { name: 'Time me' }).click();
  const timeMe = sara.getByRole('dialog', { name: 'Time me' });
  await timeMe.getByRole('radio', { name: '1 hour' }).click();
  await timeMe.getByRole('button', { name: 'Start 1 hour' }).click();
  await expect(sara.locator('[data-hub="exam-timer"]')).toContainText(/0:59:\d\d left/);

  await sara.getByRole('button', { name: 'Stop the timer' }).click();
  const score = sara.getByRole('dialog', { name: 'How did it go?' });
  await expect(score).toBeVisible();
  await score.getByLabel('Your score').fill('68');
  await score.locator('[data-hub="board-score-save"]').click();
  await expect(score).toBeHidden();
  await expect(sara.locator('[data-hub="exam-timer"]')).toBeHidden();
  await expect(sara.getByText('Done, 68%').first()).toBeVisible();
  // ... and after a reload, from her account
  await sara.reload();
  await expect(sara.getByText('Done, 68%').first()).toBeVisible();

  // Home picks up where she left off: the paper, a tap away.
  await sara.goto('/');
  const carry = sara.locator('[data-hub="carry-on"]');
  await expect(carry).toBeVisible();
  const back = carry.locator(`a[href="/library/${paper.slug}"]`);
  await expect(back).toContainText('Past paper · opened');
  await back.click();
  await expect(sara).toHaveURL(new RegExp(`/library/${paper.slug}$`));
});

test('saving a score from the paper’s More menu says it was saved', async ({ sara, rep }) => {
  // ST-60: the score is saved, but "Saved: 70%" never shows. The dialog closes (and unmounts) before the save
  // returns, so the toast in save.mutate's own onSuccess never runs.
  test.fail(true, 'ST-60: no "Saved" toast after a score is saved');
  if (!paper) throw new Error('The first test shares the paper');
  try {
    await sara.goto(`/library/${paper.slug}`);
    await sara.locator('[data-hub="file-toolbar"]').getByRole('button', { name: 'More actions' }).click();
    await sara.getByRole('menuitem', { name: 'Save my score' }).click();
    const score = sara.getByRole('dialog', { name: 'How did it go?' });
    await expect(score.getByLabel('Your score')).toHaveValue('68');
    await score.getByLabel('Your score').fill('70');
    await score.locator('[data-hub="board-score-save"]').click();
    await expect(score).toBeHidden();
    await expect(sara.getByText('Done, 70%').first()).toBeVisible();
    await expect(sara.getByText('Saved: 70%')).toBeVisible({ timeout: 5_000 });
  } finally {
    await api(rep, 'DELETE', `/api/v1/library/items/${paper.id}`);
  }
});

test('the forum’s Yours tab lists the threads she started, and not a classmate’s', async ({
  sara,
  ali,
  guest,
  run,
}) => {
  const mine = await api<{ id: string; slug: string }>(sara, 'POST', '/api/v1/forum/threads', {
    title: `ST2134: is the MLE of a uniform's upper end biased? [e2e ${run.tag}]`,
    body: 'The max of the sample is always below θ, so its mean must be too. How much below?',
    category: 'year-2',
    moduleId: 'advanced-stats-inferential',
  });
  expect(mine.status).toBe(201);
  remember('threads', mine.body.id);
  const theirs = await api<{ id: string; slug: string }>(ali, 'POST', '/api/v1/forum/threads', {
    title: `EC1002: does a price floor always cause a surplus? [e2e ${run.tag}]`,
    body: 'Only when it is set above the equilibrium price, right?',
    category: 'year-1',
    moduleId: 'economics',
  });
  expect(theirs.status).toBe(201);
  remember('threads', theirs.body.id);

  await sara.goto('/forum');
  await sara.getByRole('tab', { name: 'Yours' }).click();
  await expect(sara).toHaveURL(/cohort=yours/);
  await expect(sara.getByRole('link', { name: /is the MLE of a uniform's upper end biased/ })).toBeVisible();
  await expect(sara.getByRole('link', { name: /does a price floor always cause a surplus/ })).toHaveCount(0);

  // A guest has no Yours tab.
  await guest.goto('/forum');
  await expect(guest.getByRole('tab', { name: /^All/ })).toBeVisible();
  await expect(guest.getByRole('tab', { name: 'Yours' })).toHaveCount(0);
});

test('search reads a misspelt word as the word the Hub uses', async ({ sara, run }) => {
  // A word nobody else uses, made of letters only (words with digits are never corrected), and the same word with
  // one letter in its middle mistyped.
  const word = `kolmo${run.tag.replace(/\d/g, (d) => 'abcdefghij'[Number(d)])}gorov`.toLowerCase();
  const typo = `${word.slice(0, 3)}${word[3] === 'x' ? 'y' : 'x'}${word.slice(4)}`;
  const thread = await api<{ id: string; slug: string }>(sara, 'POST', '/api/v1/forum/threads', {
    title: `ST2134: the ${word} test for two samples [e2e ${run.tag}]`,
    body: 'When is it better than a t test?',
    category: 'year-2',
    moduleId: 'advanced-stats-inferential',
  });
  expect(thread.status).toBe(201);
  remember('threads', thread.body.id);

  await sara.goto('/forum');
  await expect(sara.getByRole('heading', { level: 1, name: 'Forum' })).toBeVisible();
  const search = sara.getByRole('dialog').filter({ has: sara.getByRole('combobox') });
  await expect(async () => {
    if (!(await search.isVisible())) await sara.keyboard.press('Control+k');
    await expect(search.getByRole('combobox')).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await sara.keyboard.type(typo);
  await expect(search.locator('[data-hub="cmdk-corrected"]')).toHaveText(
    `Nothing matched “${typo}”. Showing results for “${word}”.`,
  );
  const option = search.getByRole('option').filter({ hasText: `the ${word} test for two samples` });
  await expect(option).toBeVisible();
  await option.click();
  await expect(sara).toHaveURL(new RegExp(`/forum/${thread.body.slug}`));
});
