// Requests, end to end: Sara asks for a past paper from the library's "Ask for it", Ali says "me too", the rep
// plans it from Manage, and Sara is told. Requests arrive switched off, so the spec switches them on and back off.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'requests', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'requests', 'off');
  await ctx.close();
});

test('a student asks, a classmate says me too, a rep answers and the student is told', async ({ sara, ali, rep, run }) => {
  const title = `ST2133 past papers from 2019 [e2e ${run.tag}]`;
  let id = '';
  try {
    await sara.goto('/library?q=zzzz-nothing-matches');
    await sara.locator('[data-hub="ask-link"]').getByRole('link', { name: 'Ask for it' }).click();
    await expect(sara).toHaveURL(/\/requests\?new=paper/);
    const dialog = sara.getByRole('dialog', { name: 'Ask for something' });
    await expect(dialog.getByLabel('What do you need?')).toHaveValue('paper');
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Details').fill('The zone B ones, with the examiners’ reports.');
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(sara).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    id = sara.url().split('/').pop() ?? '';
    await expect(sara.getByRole('heading', { level: 1 })).toHaveText(title);

    await ali.goto(`/requests/${id}`);
    const meToo = ali.locator('[data-hub="me-too"]');
    await meToo.click();
    await expect(meToo).toHaveAttribute('aria-pressed', 'true');
    await expect(ali.getByText('You want this too')).toBeVisible();

    await rep.goto('/manage?tab=requests');
    const card = rep.locator('[data-hub="request"]').filter({ hasText: title });
    await card.getByRole('radio', { name: 'Planned' }).click();
    await card.getByLabel('Reply').fill('Asking the tutor for them this week.');
    await card.getByRole('button', { name: 'Save answer' }).click();
    await expect(rep.getByText('Status changed')).toBeVisible();

    const told = await api<{ items: { title: string; url: string | null }[] }>(sara, 'GET', '/api/v1/notifications');
    expect(told.body.items.some((n) => n.url === `/requests/${id}` && n.title.startsWith('Request planned'))).toBe(true);
    await sara.goto(`/requests/${id}`);
    await expect(sara.getByText('Asking the tutor for them this week.')).toBeVisible();
  } finally {
    if (id) await api(rep, 'DELETE', `/api/v1/requests/${id}`);
  }
});
