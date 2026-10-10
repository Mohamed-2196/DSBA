// The forum: a thread with a picture, answers, a nested reply, votes, accepting an answer, editing, deleting,
// reporting, the rep's moderation (hide, resolve, lock), locked and hidden threads as students, search and filters.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, makeFiles, remember } from './support';

test.describe.configure({ mode: 'serial' });

let slug = '';
let threadId = '';
let hiddenSlug = '';

async function postReply(page: Page, text: string): Promise<string> {
  await page.locator('[data-hub="reply-input"]').fill(text);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => /\/forum\/threads\/[^/]+\/replies$/.test(r.url()) && r.request().method() === 'POST'),
    page.locator('[data-hub="post-reply"]').last().click(),
  ]);
  expect(resp.status()).toBe(201);
  return (await resp.json()).id as string;
}

const reply = (page: Page, text: string) => page.locator('[data-hub="reply"]').filter({ hasText: text }).first();

test('Sara starts a thread with a picture of her working', async ({ sara, run }) => {
  const files = makeFiles(run.tag);
  await sara.goto('/forum/new');
  await sara.getByLabel('Title').fill(`ST2133: is the MGF of a sum of independent Poissons the product? [e2e ${run.tag}]`);
  await sara.locator('[data-hub="composer-category"]').selectOption({ label: 'Year 2' });
  await sara.locator('[data-hub="composer-module"]').selectOption('advanced-stats-distribution');
  await sara.getByRole('button', { name: 'Exam prep', exact: true }).click();
  const body = sara.locator('[data-hub="composer-body"]');
  await body.fill(`X ~ Poisson(2) and Y ~ Poisson(3) are independent. Is M of X+Y just M_X(t) M_Y(t)? Here is my working (run ${run.tag}):\n\n`);
  await body.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(el.value.length, el.value.length));
  const [chooser] = await Promise.all([sara.waitForEvent('filechooser'), sara.locator('[data-hub="attach-image"]').click()]);
  await chooser.setFiles(files.png);
  await expect(body).toHaveValue(/!\[[^\]]*\]\(\/api\/v1\/media\/[0-9a-f-]{36}\)/, { timeout: 20_000 });

  await sara.getByRole('radio', { name: 'Preview' }).click();
  await expect(sara.locator('[data-hub="composer"] img[src^="/api/v1/media/"]')).toBeVisible();
  await sara.getByRole('radio', { name: 'Write' }).click();

  const [resp] = await Promise.all([
    sara.waitForResponse((r) => r.url().endsWith('/api/v1/forum/threads') && r.request().method() === 'POST'),
    sara.locator('[data-hub="post-button"]').click(),
  ]);
  expect(resp.status()).toBe(201);
  const thread = await resp.json();
  slug = thread.slug;
  threadId = thread.id;
  remember('threads', thread.id);
  await expect(sara.getByText('Thread posted')).toBeVisible();

  await sara.goto(`/forum/${slug}`);
  await expect(sara.getByRole('heading', { level: 1 })).toContainText('MGF of a sum of independent Poissons');
  const img = sara.locator('main img[src^="/api/v1/media/"]').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(sara.locator('main')).toContainText('Waiting for a first reply');
});

test('Ali answers and votes; Sara replies to his answer, accepts it and edits her question', async ({ ali, sara }) => {
  await ali.goto(`/forum/${slug}`);
  await postReply(ali, 'Yes. For independent X and Y, M_{X+Y}(t) = M_X(t) M_Y(t) = exp(5(e^t - 1)), so X + Y ~ Poisson(5).');
  const answer = reply(ali, 'exp(5(e^t - 1))');
  await expect(answer).toBeVisible();

  const vote = ali.locator('[data-hub="vote"]').first();
  await expect(vote).toHaveAttribute('aria-label', 'Upvote, 1 vote'); // the author's own vote
  await vote.click();
  await expect(vote).toHaveAttribute('aria-pressed', 'true');
  await expect(vote).toHaveAttribute('aria-label', 'Upvote, 2 votes');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-label', 'Upvote, 1 vote');
  await vote.click();
  await expect(vote).toHaveAttribute('aria-label', 'Upvote, 2 votes');
  await ali.reload();
  await expect(ali.locator('[data-hub="vote"]').first()).toHaveAttribute('aria-pressed', 'true');

  await sara.goto(`/forum/${slug}`);
  const his = reply(sara, 'exp(5(e^t - 1))');
  await his.getByRole('button', { name: 'Reply', exact: true }).click();
  const inline = sara.locator('[data-hub="reply-composer-inline"]');
  await inline.locator('textarea').fill('Thank you! So the parameters just add up.');
  const [nested] = await Promise.all([
    sara.waitForResponse((r) => /\/replies$/.test(r.url()) && r.request().method() === 'POST'),
    inline.getByRole('button', { name: /post|reply/i }).last().click(),
  ]);
  expect((await nested.json()).parentId).toBeTruthy();
  await expect(his.locator('[data-hub="reply"]').filter({ hasText: 'the parameters just add up' })).toBeVisible(); // nested inside the answer

  await his.locator('[data-hub="vote"]').first().click();
  await expect(his.locator('[data-hub="vote"]').first()).toHaveAttribute('aria-pressed', 'true');
  await his.getByRole('button', { name: 'Accept answer' }).click();
  await expect(his).toContainText('Accepted answer');
  await expect(sara.locator('main').first()).toContainText('Answered');

  await sara.locator('[data-hub="post-menu"]').first().click();
  await sara.getByRole('menuitem', { name: 'Edit' }).click();
  const editor = sara.locator('main textarea').first();
  await editor.fill(`${await editor.inputValue()}\n\n**Edit:** solved, see the accepted answer.`);
  await sara.getByRole('button', { name: 'Save changes' }).first().click();
  await expect(sara.locator('main')).toContainText('Edit: solved, see the accepted answer.');
  await expect(sara.locator('main')).toContainText('edited');

  const notes = await api<{ items: { kind: string; title: string }[] }>(ali, 'GET', '/api/v1/notifications');
  const kinds = notes.body.items.map((n) => n.kind);
  expect(kinds).toContain('answer_accepted');
  expect(kinds).toContain('reply_reply');
});

test('Ali deletes a reply; Sara reports an off-topic one, and reporting twice is answered kindly', async ({ ali, sara }) => {
  await ali.goto(`/forum/${slug}`);
  await postReply(ali, 'Sorry, wrong thread.');
  const mine = reply(ali, 'Sorry, wrong thread.');
  await mine.locator('[data-hub="post-menu"]').click();
  await ali.getByRole('menuitem', { name: 'Delete' }).click();
  await ali.getByRole('dialog').getByRole('button', { name: 'Delete reply' }).click();
  await expect(ali.getByText('Reply deleted')).toBeVisible();
  await expect(ali.locator('[data-hub="reply"]').filter({ hasText: 'Sorry, wrong thread.' })).toHaveCount(0);

  await postReply(ali, 'Does anyone have the ST2133 2024 paper? Send it in the WhatsApp group please.');

  await sara.goto(`/forum/${slug}`);
  const offTopic = reply(sara, 'WhatsApp group please');
  await offTopic.locator('[data-hub="report-button"]').click();
  const dialog = sara.getByRole('dialog');
  await expect(dialog).toContainText('Report this reply');
  await dialog.getByText('Something else', { exact: true }).click();
  await dialog.getByLabel('Add a note').fill('Asks for papers in WhatsApp, not about this question.');
  await dialog.locator('[data-hub="report-send"]').click();
  await expect(sara.getByText('Report sent')).toBeVisible();

  await offTopic.locator('[data-hub="report-button"]').click();
  await sara.getByRole('dialog').getByText('Spam', { exact: true }).click();
  await sara.getByRole('dialog').locator('[data-hub="report-send"]').click();
  await expect(sara.getByText('You’ve already reported this reply').or(sara.getByText("You've already reported this reply"))).toBeVisible();
});

test('the rep hides the reply, resolves the report and locks the thread; students see it locked', async ({ rep, sara, ali }) => {
  await rep.goto('/moderation');
  const report = rep.locator('[data-hub="report"]').filter({ hasText: 'WhatsApp group please' }).first();
  await expect(report).toContainText('Something else');

  await rep.goto(`/forum/${slug}`);
  const offTopic = reply(rep, 'WhatsApp group please');
  await offTopic.locator('[data-hub="post-menu"]').click();
  await rep.getByRole('menuitem', { name: 'Hide reply' }).click();
  await expect(rep.getByText('Reply hidden')).toBeVisible();

  await rep.goto('/moderation');
  await report.getByRole('button', { name: 'Resolve' }).click();
  await rep.getByRole('dialog').getByLabel('Note').fill('Hid the reply: papers go in the library.');
  await rep.getByRole('dialog').locator('[data-hub="report-decide"]').click();
  await expect(rep.getByText('Report resolved')).toBeVisible();

  await rep.goto(`/forum/${slug}`);
  await rep.locator('[data-hub="post-menu"]').first().click();
  await rep.getByRole('menuitem', { name: 'Lock replies' }).click();
  await expect(rep.getByText('Thread locked')).toBeVisible();

  const notes = await api<{ items: { kind: string; body: string | null }[] }>(sara, 'GET', '/api/v1/notifications');
  expect(notes.body.items.some((n) => n.kind === 'report_resolved')).toBe(true);
  await sara.goto(`/forum/${slug}`);
  await expect(sara.locator('[data-hub="reply"]').filter({ hasText: 'WhatsApp group please' })).toHaveCount(0);

  await ali.goto(`/forum/${slug}`);
  await expect(ali.locator('main')).toContainText('This thread is locked, so new replies are off.');
  await expect(ali.locator('[data-hub="reply-input"]')).toHaveCount(0);
  const locked = await api<{ error: { code: string } }>(ali, 'POST', `/api/v1/forum/threads/${threadId}/replies`, { body: 'One more thing.' });
  expect(locked.status).toBe(409);
  expect(locked.body.error.code).toBe('thread_locked');
});

test('a hidden thread is gone for students and guests', async ({ ali, rep, sara, guest, run }) => {
  await ali.goto('/forum/new');
  await ali.getByLabel('Title').fill(`ST1215 mock: the questions from this morning [e2e ${run.tag}]`);
  await ali.locator('[data-hub="composer-category"]').selectOption({ label: 'Year 1' });
  await ali.locator('[data-hub="composer-body"]').fill('Q1 was conditional probability, Q2 a Poisson approximation.');
  const [resp] = await Promise.all([
    ali.waitForResponse((r) => r.url().endsWith('/api/v1/forum/threads') && r.request().method() === 'POST'),
    ali.locator('[data-hub="post-button"]').click(),
  ]);
  const t = await resp.json();
  hiddenSlug = t.slug;
  remember('threads', t.id);

  await rep.goto(`/forum/${hiddenSlug}`);
  await rep.locator('[data-hub="post-menu"]').first().click();
  await rep.getByRole('menuitem', { name: 'Hide thread' }).click();
  await expect(rep.locator('main')).toContainText('This thread is hidden.');

  for (const page of [sara, guest]) {
    await page.goto(`/forum/${hiddenSlug}`);
    await expect(page.getByText('We couldn’t find that thread').or(page.getByText("We couldn't find that thread"))).toBeVisible();
  }
  await sara.goto('/forum?cohort=year-1&sort=new');
  await expect(sara.locator('main')).not.toContainText('ST1215 mock: the questions from this morning');
});

test('forum search and filters find the thread', async ({ guest, run }) => {
  await guest.goto('/forum');
  await guest.getByLabel('Search threads').fill(run.tag);
  await expect(guest).toHaveURL(new RegExp(`q=${run.tag}`));
  const list = guest.locator('main');
  await expect(list).toContainText('MGF of a sum of independent Poissons');
  await expect(list).not.toContainText('ST1215 mock: the questions'); // hidden

  await guest.goto(`/forum?cohort=year-2&q=${run.tag}`);
  await expect(guest.locator('main')).toContainText('MGF of a sum of independent Poissons');
  await guest.goto(`/forum?cohort=year-1&q=${run.tag}`);
  await expect(guest.locator('main')).not.toContainText('MGF of a sum of independent Poissons');
  await guest.goto(`/forum?tag=exam-prep&sort=new&q=${run.tag}`);
  await expect(guest.locator('main')).toContainText('MGF of a sum of independent Poissons');
  // words from the body and the answers count too
  await guest.goto('/forum?q=independent%20Poissons');
  await expect(guest.locator('main')).toContainText('MGF of a sum of independent Poissons');
});
