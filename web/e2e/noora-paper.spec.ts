// Asking Mini Noora about a past paper's question: from the file viewer, the student names the question and
// its page; her panel opens with the box filled and the paper above it, and the paper goes with each question until
// it is taken off. Claude is stood in for at the network (the stack has no key). The switch ends as it starts (off).
import type { Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'noora.ai', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'noora.ai', 'off');
  await ctx.close();
});

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

test('a past paper’s question goes to her with its page, until it is taken off', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  const papers = await api<{ items: { id: string; slug: string; title: string; source: string }[] }>(
    page,
    'GET',
    '/api/v1/library/items?kind=past-paper&source=file&limit=1',
  );
  const paper = papers.body.items[0];
  test.skip(!paper, 'the library has no past paper file');
  if (!paper) return;

  const asked: Request[] = [];
  await page.route('**/api/v1/noora/status', (route) =>
    route.fulfill({ json: { available: true, dailyQuestions: 30, questionsLeft: 29 } }),
  );
  await page.route('**/api/v1/noora/ask', async (route) => {
    asked.push(route.request());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse({ type: 'text', text: 'Start from the MGF.' }, { type: 'done', questionsLeft: 28 }),
    });
  });

  await page.goto(`/library/${paper.slug}`);
  await page.locator('[data-hub="file-ask-noora"]:visible').click();
  const form = page.locator('[data-hub="file-ask-form"]');
  await form.getByLabel('Question').fill('Q 2 (b)');
  await form.getByLabel('Page').fill('3');
  await page.getByRole('dialog').getByRole('button', { name: 'Ask Mini Noora' }).click();

  const chat = page.locator('[data-hub="noora-chat"]');
  await expect(chat.locator('[data-hub="noora-paper"]')).toContainText('Question 2(b), page 3');
  await expect(chat.getByLabel('Message Mini Noora')).toHaveValue('Help me with question 2(b).');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-message"][data-from="noora"]').last()).toContainText(
    'Start from the MGF.',
  );
  expect(asked[0]?.postDataJSON()).toMatchObject({ paper: { itemId: paper.id, page: 3, question: '2(b)' } });

  await chat.locator('[data-hub="noora-paper-remove"]').click();
  await expect(chat.locator('[data-hub="noora-paper"]')).toHaveCount(0);
  await chat.getByLabel('Message Mini Noora').fill('And in general?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1]?.postDataJSON()).toMatchObject({ paper: null });
  await ctx.close();
});
