// Requests, end to end: Sara asks for a past paper from the library's "Ask for it", Ali says "me too", the rep
// plans it from Manage, and Sara is told. Requests arrive switched off, so the spec switches them on and back off.
import { expect, test } from './fixtures';
import { api, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'requests', ['requests']));

test.afterAll(async ({ browser }) => switchBack(browser, 'requests'));

test('a student asks, a classmate says me too, a rep answers and the student is told', async ({
  sara,
  ali,
  rep,
  run,
}) => {
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
    expect(told.body.items.some((n) => n.url === `/requests/${id}` && n.title.startsWith('Request planned'))).toBe(
      true,
    );
    await sara.goto(`/requests/${id}`);
    await expect(sara.getByText('Asking the tutor for them this week.')).toBeVisible();
    // her own request shows that she asked and that Ali joined her, not "0 Me too"
    await expect(sara.locator('[data-hub="me-too"]').first()).toHaveText('You and 1 other');
  } finally {
    if (id) await api(rep, 'DELETE', `/api/v1/requests/${id}`);
  }
});

test('a double tap on "Send request" sends one request', async ({ ali, rep, run }) => {
  test.fail(true, 'ST-19: the request dialog has no guard against a second press, so a double tap makes two requests');
  const title = `Double tap [e2e ${run.tag}]`;
  await ali.goto('/requests');
  await ali.getByRole('button', { name: 'New request' }).click();
  const dialog = ali.getByRole('dialog', { name: 'Ask for something' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Send request' }).dblclick();
  await expect(ali).toHaveURL(/\/requests\/[0-9a-f-]{36}$/);
  await expect
    .poll(
      async () =>
        (await api<{ items: { title: string }[] }>(ali, 'GET', `/api/v1/requests?q=${encodeURIComponent(run.tag)}`))
          .body.items.length,
    )
    .toBeGreaterThan(0);
  const made = (
    await api<{ items: { id: string; title: string }[] }>(
      ali,
      'GET',
      `/api/v1/requests?q=${encodeURIComponent(run.tag)}`,
    )
  ).body.items.filter((r) => r.title === title);
  for (const r of made) await api(rep, 'DELETE', `/api/v1/requests/${r.id}`);
  expect(made).toHaveLength(1);
});
