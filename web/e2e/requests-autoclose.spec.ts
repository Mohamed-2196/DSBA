// Requests that close themselves, end to end: Sara asks for a module's cheat sheet naming the file, a rep
// adds one to the library, Sara is asked whether it's the one, says yes, and the request is done. Both switches arrive
// off, so the spec switches them on and back off.
import { expect, test } from './fixtures';
import { api, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'requests-autoclose', ['requests', 'requests.autoclose']));

test.afterAll(async ({ browser }) => switchBack(browser, 'requests-autoclose'));

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
