// Full /noora study assistant page: sidebar of chats (grouped, rename, delete, search),
// centered conversation column, rich composer with context, welcome empty state with starter cards,
// and carrying conversations over from Mini Noora.
import type { Page, Request } from '@playwright/test';
import { expect, test } from './fixtures';
import { personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const admin = await ctx.newPage();
  await setSwitch(admin, 'noora.ai', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const admin = await ctx.newPage();
  await setSwitch(admin, 'noora.ai', 'off');
  await ctx.close();
});

const sse = (...events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');

async function standIn(page: Page): Promise<Request[]> {
  const asked: Request[] = [];
  await page.route('**/api/v1/noora/status', (route) =>
    route.fulfill({ json: { available: true, dailyQuestions: 30, questionsLeft: 29 } }),
  );
  await page.route('**/api/v1/noora/ask', async (route) => {
    asked.push(route.request());
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: sse(
        { type: 'text', text: 'The **central limit theorem** states that sample means approach normal distribution:\n\n' },
        { type: 'text', text: '$$\\bar X_n \\sim N(\\mu, \\sigma^2/n)$$\n\n' },
        { type: 'text', text: '```r\nmean(rnorm(100))\n```' },
        { type: 'done', questionsLeft: 28 },
      ),
    });
  });
  return asked;
}

test('/noora welcomes the student, starter cards fill the composer, and answers render with code and math', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  await standIn(page);

  await page.goto('/noora');
  await expect(page.getByRole('heading', { name: /What can I help with/ })).toBeVisible();

  // Starter cards across categories are rendered
  await expect(page.locator('[data-starter="explain"]')).toBeVisible();
  await expect(page.locator('[data-starter="quiz"]')).toBeVisible();

  // Clicking a starter card populates the composer
  await page.locator('[data-starter="explain"]').click();
  const box = page.getByRole('textbox', { name: 'Message Noora' });
  await expect(box).toHaveValue(/Explain .* simply/);

  // Sending the question
  await box.press('Enter');
  await expect(page.locator('[data-hub="noora-message"][data-from="me"]')).toContainText('Explain');
  await expect(page.locator('[data-hub="noora-message"][data-from="noora"]')).toContainText('central limit theorem');
  await expect(page.locator('.nr-code')).toBeVisible();

  // Conversation appears in the sidebar
  await expect(page.locator('[data-hub="noora-sidebar-chat"]')).toHaveCount(1);

  // New chat resets to welcome view
  await page.getByRole('button', { name: 'New chat' }).click();
  await expect(page.getByRole('heading', { name: /What can I help with/ })).toBeVisible();

  // Clicking the saved chat restores it
  await page.locator('[data-hub="noora-sidebar-chat"]').first().click();
  await expect(page.locator('[data-hub="noora-message"][data-from="me"]')).toContainText('Explain');

  await ctx.close();
});

test('mascot quick launcher carries the current chat over to /noora', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara', { noora: true });
  const page = await ctx.newPage();
  await standIn(page);

  await page.goto('/calendar');
  await page.locator('[data-hub="noora-launcher"]').click();
  const chat = page.locator('[data-hub="noora-chat"]');
  await expect(chat).toBeVisible();

  await chat.getByLabel('Message Mini Noora').fill('When is my next exam?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat.locator('[data-hub="noora-message"][data-from="noora"]')).toBeVisible();

  // "Open full chat" navigates to /noora with this conversation
  await chat.locator('[data-hub="noora-open-page"]').click();
  await expect(page).toHaveURL(/\/noora/);
  await expect(page.locator('[data-hub="noora-message"][data-from="me"]')).toContainText('When is my next exam?');

  await ctx.close();
});
