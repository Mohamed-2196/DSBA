// "You asked, we did" and the Gaps screen, end to end: Sara asks for something, a rep marks it done,
// and it leads "You asked, we did" on /requests; the rep's Gaps tab lists what's missing. requests and
// requests.done arrive off, so the spec switches them on and back off.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  await setSwitch(page, 'requests', 'everyone');
  await setSwitch(page, 'requests.done', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  await setSwitch(page, 'requests.done', 'off');
  await setSwitch(page, 'requests', 'off');
  await ctx.close();
});

test('a request a rep marks done shows under "You asked, we did"', async ({ sara, rep, run }) => {
  const title = `A fix for the calendar [e2e ${run.tag}]`;
  const made = await api<{ id: string }>(sara, 'POST', '/api/v1/requests', { kind: 'fix', title });
  expect(made.status).toBe(201);
  try {
    const answered = await api(rep, 'POST', `/api/v1/requests/${made.body.id}/answer`, { status: 'done', reply: 'Fixed.' });
    expect(answered.status).toBe(200);

    await sara.goto('/requests');
    const done = sara.locator('[data-hub="requests-done"]');
    await expect(done.getByRole('heading', { name: 'You asked, we did' })).toBeVisible();
    await expect(done.getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) })).toBeVisible();
  } finally {
    await api(rep, 'DELETE', `/api/v1/requests/${made.body.id}`);
  }
});

test('a rep sees the gaps of what they look after', async ({ rep }) => {
  await rep.goto('/manage?tab=gaps');
  await expect(rep.getByRole('tab', { name: /Gaps/ })).toHaveAttribute('aria-selected', 'true');
  await expect(rep.locator('[data-hub="gaps-requests"]')).toBeVisible();
  await expect(rep.locator('[data-hub="gaps-sittings"]')).toBeVisible();
  await expect(rep.locator('[data-hub="gaps-unconfirmed"]')).toBeVisible();
});
