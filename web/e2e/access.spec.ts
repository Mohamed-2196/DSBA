// Boxes and switches, end to end: a newsletter manager publishes but can't moderate; a switched-off calendar is gone
// for a student and a guest, and marked for an admin; a guest sees only what's on for everyone.
import { expect, test } from './fixtures';
import { api, remember, roleIdBySlug, setSwitch, switchBack, switchOn, freshIssueNumber } from './support';

test.describe.configure({ mode: 'serial' });

// Whatever happens, the calendar and grades end as they were.
test.beforeAll(async ({ browser }) => switchOn(browser, 'access', ['calendar', 'grades']));
test.afterAll(async ({ browser }) => switchBack(browser, 'access'));

test('a newsletter manager can publish but not moderate', async ({ admin, sara, run }) => {
  const me = await api<{ id: string }>(sara, 'GET', '/api/v1/me');
  const ids = [await roleIdBySlug(admin, 'student'), await roleIdBySlug(admin, 'newsletter-manager')];
  expect((await api(admin, 'PUT', `/api/v1/admin/users/${me.body.id}/roles`, { roleIds: ids })).status).toBe(200);
  try {
    const issue = await api<{ id: string }>(sara, 'POST', '/api/v1/newsletter/issues', {
      slug: `e2e-nm-${run.tag}`,
      number: freshIssueNumber(),
      title: `Newsletter manager test [e2e ${run.tag}]`,
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date()),
      dek: 'A draft from a newsletter manager.',
      summary: 'A test.',
      editors: ['Sara E2E'],
      cover: { tone: 'paper', lines: [] },
      sections: [],
    });
    expect(issue.status).toBe(201);
    remember('issues', issue.body.id);
    const moderate = await api<{ error: { code: string } }>(
      sara,
      'POST',
      '/api/v1/forum/threads/00000000-0000-4000-8000-000000000000/moderate',
      { status: 'hidden' },
    );
    expect(moderate.status).toBe(403);
    await sara.goto('/manage');
    await expect(
      sara.getByRole('navigation', { name: 'Your tools' }).getByRole('button', { name: /Newsletter/ }),
    ).toBeVisible();
    await expect(
      sara.getByRole('navigation', { name: 'Your tools' }).getByRole('button', { name: /Reports/ }),
    ).toHaveCount(0);
  } finally {
    await api(admin, 'PUT', `/api/v1/admin/users/${me.body.id}/roles`, { roleIds: [ids[0]] });
  }
});

test('with the calendar off, a student and a guest lose it; an admin sees it marked', async ({
  admin,
  sara,
  guest,
}) => {
  await setSwitch(admin, 'calendar', 'off');
  for (const page of [sara, guest]) {
    await page.goto('/calendar');
    await expect(page.locator('main')).toContainText('This part of the hub is switched off right now.');
    await expect(page.locator('[data-hub="nav-calendar"]')).toHaveCount(0);
    expect((await api(page, 'GET', '/api/v1/calendar/events')).status).toBe(404);
  }
  await admin.goto('/calendar');
  await expect(admin.getByText('Off for others')).toBeVisible();
  await setSwitch(admin, 'calendar', 'everyone');
});

test('a guest sees only the features on for everyone', async ({ admin, guest }) => {
  await setSwitch(admin, 'grades', 'roles', [await roleIdBySlug(admin, 'rep')]);
  try {
    const features = await api<{ features: string[] }>(guest, 'GET', '/api/v1/features');
    expect(features.body.features).not.toContain('grades');
    await guest.goto('/');
    await expect(guest.locator('[data-hub="nav-modules"]')).toBeVisible();
    await expect(guest.locator('[data-hub="nav-grades"]')).toHaveCount(0);
  } finally {
    await setSwitch(admin, 'grades', 'everyone');
  }
});
