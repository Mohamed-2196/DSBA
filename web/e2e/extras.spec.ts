// Career Navigator, the grades calculator (marks stay in the browser) and Mini Noora.
import { expect, test } from './fixtures';
import { env, prepareContext } from './support';

test('Career Navigator lists where to apply and filters by track', async ({ guest }) => {
  await guest.goto('/career');
  await expect(guest.getByRole('heading', { name: 'Career Navigator', level: 1 })).toBeVisible();
  const roles = guest.locator('main').getByRole('link', { name: /See (open roles|the programme)/ });
  const all = await roles.count();
  expect(all).toBeGreaterThan(5);
  await guest.getByText('Data science & analytics', { exact: false }).first().click();
  await expect(guest).toHaveURL(/track=/);
  await expect.poll(() => roles.count()).toBeLessThan(all);
  const external = guest.locator('main a[target="_blank"]').first();
  await expect(external).toHaveAttribute('rel', /noopener/);
});

test('the grades calculator keeps a guest’s marks in this browser only', async ({ guest }) => {
  const sent: string[] = [];
  guest.on('request', (r) => {
    if (r.url().includes('/api/') && r.method() !== 'GET') sent.push(r.url());
  });
  await guest.goto('/grades');
  const marks = guest.locator('[data-hub="grades-inputs"] input[inputmode="decimal"]');
  for (const [i, m] of ['55', '62', '71', '48'].entries()) await marks.nth(i).fill(m);
  await guest.reload();
  await expect(marks.nth(0)).toHaveValue('55');
  await expect(marks.nth(3)).toHaveValue('48');
  expect(sent).toEqual([]); // nothing went to the server
  await guest.getByRole('button', { name: 'Reset' }).click();
  const confirm = guest.getByRole('dialog');
  if (await confirm.isVisible()) await confirm.getByRole('button', { name: /Reset|Clear/ }).last().click();
  await expect(marks.nth(0)).toHaveValue('');
});

test('Mini Noora answers with the date of an exam and where to look', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: env.baseURL });
  await prepareContext(ctx, { noora: true, year: '1' });
  const page = await ctx.newPage();
  await page.goto('/');
  const launcher = page.locator('[data-hub="noora-launcher"]:visible');
  await launcher.click();
  const chat = page.locator('[data-hub="noora-chat"]');
  await expect(chat).toBeVisible();
  // Questions for the page she is opened on.
  await expect(chat.locator('[data-hub="noora-suggestion"]').first()).toBeVisible();
  await chat.getByLabel('Message Mini Noora').fill('When is my EC1002 exam?');
  await chat.getByLabel('Message Mini Noora').press('Enter');
  await expect(chat).toContainText(/The next EC1002 Economics exam is on \w+day \d+ \w+/);
  // Her links open the page and, on a laptop, she stays open beside it.
  await chat.getByRole('link').filter({ hasText: /EC1002/ }).first().click();
  await expect(page).toHaveURL(/\/(calendar|modules)/);
  await expect(chat).toBeVisible();
  // Clearing the chat asks first.
  await chat.locator('[data-hub="noora-clear"]').click();
  await page.getByRole('dialog', { name: 'Clear the chat?' }).getByRole('button', { name: 'Clear chat' }).click();
  await expect(chat.locator('[data-hub="noora-empty"]')).toBeVisible();
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(chat).toBeHidden();
  await expect(launcher).toBeFocused();
  await ctx.close();
});
