// Mini Noora's AI answers (R-6): switched on for the run. The stack has no Claude key, so the first test proves the
// fallback for real: she answers from her script with a notice. The others stand in for Claude at the network
// (page.route) and check what the web app sends: the page, the open module and lesson, and the note only when the
// student ticks "Include my note". The switches end as they start (off).
import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const admin = await ctx.newPage();
  await setSwitch(admin, 'noora.ai', 'everyone');
  await setSwitch(admin, 'notes', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const admin = await ctx.newPage();
  await setSwitch(admin, 'noora.ai', 'off');
  await setSwitch(admin, 'notes', 'off');
  await ctx.close();
});

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

/** Claude, stood in for: answers every question with a link to the calendar, and keeps what was asked. */
async function standIn(page: Page): Promise<Request[]> {
  const asked: Request[] = [];
  await page.route('**/api/v1/noora/status', (route) => route.fulfill({ json: { available: true, dailyQuestions: 30, questionsLeft: 29 } }));
  await page.route('**/api/v1/noora/ask', async (route) => {
    asked.push(route.request());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse({ type: 'text', text: 'Your next exam is on ' }, { type: 'text', text: 'the [calendar](/calendar).' }, { type: 'done', questionsLeft: 28 }),
    });
  });
  return asked;
}

async function openNoora(page: Page) {
  await page.locator('[data-hub="noora-launcher"]').click();
  const chat = page.locator('[data-hub="noora-chat"]');
  await expect(chat).toBeVisible();
  return chat;
}

test('without a Claude key she answers from her script, with a notice', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  await page.goto('/');
  const chat = await openNoora(page);
  await chat.getByLabel('Message Mini Noora').fill('When is my next exam?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-notice"]')).toContainText('from my script');
  await expect(chat.locator('[data-hub="noora-foot"]')).toContainText('stays in this browser');
  await ctx.close();
});

test('her answer streams in with a card, and she is told the page and the lesson', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  const asked = await standIn(page);
  const modules = (await api<{ id: string }[]>(page, 'GET', '/api/v1/modules')).body;
  const moduleId = modules[0]?.id ?? '';
  const detail = (await api<{ chapters: { videos: { id: string }[] }[] }>(page, 'GET', `/api/v1/modules/${moduleId}`)).body;
  const lessonId = detail.chapters[0]?.videos[0]?.id ?? '';
  await page.goto(`/modules/${moduleId}/lessons/${lessonId}`);
  const chat = await openNoora(page);
  await expect(chat.locator('[data-hub="noora-foot"]')).toContainText('Claude');
  await chat.getByLabel('Message Mini Noora').fill('What is this lesson about?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-message"][data-from="noora"]').last()).toContainText('Your next exam is on the calendar.');
  await expect(chat.locator('[data-hub="noora-refs"]').getByRole('link', { name: /calendar/ })).toBeVisible();
  await expect(chat.locator('[data-hub="noora-foot"]')).toContainText('28 of 30 left today');
  const body: unknown = asked[0]?.postDataJSON();
  expect(body).toMatchObject({ question: 'What is this lesson about?', moduleId, lessonId, note: null });
  await ctx.close();
});

test('the open note goes only when the student ticks Include my note, for one question', async ({ browser, run }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  const asked = await standIn(page);
  await page.goto('/notes/new');
  await page.locator('[data-hub="note-title"]').fill(`Moments [e2e ${run.tag}]`);
  await page.locator('[data-hub="note-body"]').fill('M(t) = E[e^{tX}]');
  await expect(page.locator('[data-hub="note-status"]')).toHaveText('Saved');
  const chat = await openNoora(page);
  const include = chat.locator('[data-hub="noora-include-note"]');
  await include.getByRole('checkbox').check();
  await chat.getByLabel('Message Mini Noora').fill('Is my note right?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-refs"]').first()).toBeVisible();
  expect(asked[0]?.postDataJSON()).toMatchObject({ note: { title: `Moments [e2e ${run.tag}]`, body: 'M(t) = E[e^{tX}]' } });
  await expect(include.getByRole('checkbox')).not.toBeChecked();
  await chat.getByLabel('Message Mini Noora').fill('And the variance?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1]?.postDataJSON()).toMatchObject({ note: null });
  // The note is deleted again.
  await page.locator('[data-hub="note-delete"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await ctx.close();
});

test('an answer can be asked again, and a new chat keeps the last one in Recent chats', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  const asked = await standIn(page);
  await page.goto('/calendar');
  const chat = await openNoora(page);
  await expect(chat.locator('[data-hub="noora-see-page"]')).toContainText('Calendar');
  await chat.getByLabel('Message Mini Noora').fill('When is my next exam?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-regenerate"]')).toBeVisible();
  await chat.locator('[data-hub="noora-regenerate"]').click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(chat.locator('[data-hub="noora-message"][data-from="noora"]')).toHaveCount(1);
  // Taking the page off: the next question goes without it.
  await chat.locator('[data-hub="noora-see-page"]').getByRole('button', { name: 'Don’t share this page' }).click();
  await chat.getByLabel('Message Mini Noora').fill('And after that?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect.poll(() => asked.length).toBe(3);
  expect(asked[2]?.postDataJSON()).toMatchObject({ route: '', moduleId: null });
  // A new chat, then back to the first from Recent chats.
  await chat.locator('[data-hub="noora-new"]').click();
  await expect(chat.locator('[data-hub="noora-empty"]')).toBeVisible();
  await chat.locator('[data-hub="noora-more"]').click();
  await page.getByRole('menuitem', { name: 'Recent chats' }).click();
  await chat.locator('[data-hub="noora-recent-chat"]').filter({ hasText: 'When is my next exam?' }).click();
  await expect(chat.locator('[data-hub="noora-message"][data-from="me"]').first()).toContainText('When is my next exam?');
  await ctx.close();
});
