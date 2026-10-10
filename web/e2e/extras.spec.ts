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
  await page.getByRole('button', { name: /^Mini Noora, your study helper/ }).click();
  const chat = page.getByRole('dialog').filter({ has: page.getByLabel('Message Mini Noora') });
  await expect(chat).toBeVisible();
  await chat.getByLabel('Message Mini Noora').fill('When is my EC1002 exam?');
  await chat.locator('[data-hub="noora-send"]').click();
  await expect(chat).toContainText(/The next EC1002 Economics exam is on \w+day \d+ \w+/);
  await expect(chat.getByRole('link').filter({ hasText: /EC1002/ }).first()).toBeVisible();
  await chat.getByRole('button', { name: 'Close chat' }).click();
  await expect(chat).toHaveCount(0);
  await ctx.close();
});
