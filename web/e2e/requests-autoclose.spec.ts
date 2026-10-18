// Requests that close themselves, end to end: Sara asks for a module's cheat sheet naming the file, a rep
// adds one to the library, Sara is asked whether it's the one, says yes, and the request is done. She can ask for the
// RTC paper of a sitting too, and zone A's paper isn't taken for it. Both switches arrive off, so the spec switches
// them on and back off.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  await setSwitch(page, 'requests', 'everyone');
  await setSwitch(page, 'requests.autoclose', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  await setSwitch(page, 'requests.autoclose', 'off');
  await setSwitch(page, 'requests', 'off');
  await ctx.close();
});

test('a paper request finds its file when a rep adds it, and the student confirms it', async ({ sara, rep, run }) => {
  const modules = await api<{ id: string; year: number }[]>(sara, 'GET', '/api/v1/modules');
  const module = modules.body.find((m) => m.year === 2) ?? modules.body[0];
  const title = `Cheat sheet please [e2e ${run.tag}]`;
  let id = '';
  let itemId = '';
  try {
    await sara.goto('/requests?new=paper');
    const dialog = sara.getByRole('dialog', { name: 'Ask for something' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.locator('[data-hub="request-wanted-kind"]').selectOption('cheat-sheet');
    await dialog.getByLabel('Module').selectOption(module.id);
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(sara).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    id = sara.url().split('/').pop() ?? '';
    await expect(sara.getByText('Wants: Cheat sheet')).toBeVisible();

    const link = await api<{ id: string; title: string }>(rep, 'POST', '/api/v1/library/links', {
      url: `https://example.com/cheat-sheet-${run.tag}`,
      title: `Cheat sheet [e2e ${run.tag}]`,
      kind: 'cheat-sheet',
      moduleId: module.id,
    });
    expect(link.status).toBe(201);
    itemId = link.body.id;

    await sara.reload();
    const found = sara.locator('[data-hub="request-found"]');
    await expect(found.getByText('Is this the file?')).toBeVisible();
    await expect(found.getByRole('link', { name: link.body.title })).toBeVisible();
    await found.locator('[data-hub="request-found-yes"]').click();
    await expect(found.getByText('It’s in the library')).toBeVisible();
    await expect(sara.getByText('Done', { exact: true }).first()).toBeVisible();
  } finally {
    if (id) await api(rep, 'DELETE', `/api/v1/requests/${id}`);
    if (itemId) await api(rep, 'DELETE', `/api/v1/library/items/${itemId}`);
  }
});

test("a request for the RTC paper says so, and finds the RTC paper, not zone A's", async ({ sara, rep, run }) => {
  const modules = await api<{ id: string; year: number }[]>(sara, 'GET', '/api/v1/modules');
  const module = modules.body.find((m) => m.year === 2) ?? modules.body[0];
  const title = `2024 RTC paper please [e2e ${run.tag}]`;
  let id = '';
  const items: string[] = [];
  const add = async (zone: 'A' | 'RTC') => {
    const made = await api<{ id: string; title: string }>(rep, 'POST', '/api/v1/library/links', {
      url: `https://example.com/paper-2024-${zone}-${run.tag}`,
      title: `2024 paper, ${zone === 'RTC' ? 'RTC' : 'zone A'} [e2e ${run.tag}]`,
      kind: 'past-paper',
      moduleId: module.id,
      examYear: 2024,
      examSession: 'may',
      zone,
    });
    expect(made.status).toBe(201);
    items.push(made.body.id);
    return made.body;
  };
  try {
    await sara.goto('/requests?new=paper');
    const dialog = sara.getByRole('dialog', { name: 'Ask for something' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Module').selectOption(module.id);
    await dialog.locator('[data-hub="request-wanted-kind"]').selectOption('past-paper');
    await dialog.getByLabel('Exam year').selectOption('2024');
    await dialog.getByLabel('Zone').selectOption('RTC');
    await expect(dialog.getByText('RTC is the paper set for Recognised Teaching Centres.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Send request' }).click();
    await expect(sara).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
    id = sara.url().split('/').pop() ?? '';
    await expect(sara.getByText('Wants: Past paper · 2024 · RTC')).toBeVisible();

    await add('A');
    await sara.reload();
    await expect(sara.locator('[data-hub="request-found"]')).toHaveCount(0);
    const rtc = await add('RTC');
    await sara.reload();
    const found = sara.locator('[data-hub="request-found"]');
    await expect(found.getByRole('link', { name: rtc.title })).toBeVisible();
    await expect(found.getByText('Past paper · 2024 · RTC')).toBeVisible();
  } finally {
    if (id) await api(rep, 'DELETE', `/api/v1/requests/${id}`);
    for (const item of items) await api(rep, 'DELETE', `/api/v1/library/items/${item}`);
  }
});
