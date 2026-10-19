// Manage's content tabs, seen on the site: the admin changes the footer's line in Site settings and a guest sees it;
// renames this week's Daily theme in Daily puzzles, sees the new name in the preview of today and a guest sees it on
// the Daily. Each is put back as it was.
import { expect, test } from './fixtures';
import { api } from './support';

test('a Site settings change shows on the site', async ({ admin, guest, run }) => {
  const before = await api<{ version: number; data: { tagline: string } }>(admin, 'GET', '/api/v1/site/edit');
  expect(before.status).toBe(200);
  const tagline = `Made by DSBA students at BIBF, for DSBA students [e2e ${run.tag}]`;
  try {
    await admin.goto('/manage?tab=site');
    await admin.getByRole('button', { name: 'Footer and notes' }).click();
    await admin.getByLabel('Who makes the hub').fill(tagline);
    await admin.getByRole('button', { name: 'Save', exact: true }).first().click();
    await expect(admin.getByText('Saved. Everyone sees the changes now.')).toBeVisible();

    await guest.goto('/about');
    await expect(guest.getByRole('contentinfo').filter({ hasText: tagline })).toBeVisible();
  } finally {
    const now = await api<{ version: number }>(admin, 'GET', '/api/v1/site/edit');
    expect(
      (await api(admin, 'PUT', '/api/v1/site', { version: now.body.version, data: before.body.data })).status,
    ).toBe(200);
  }
});

interface Theme {
  id: string;
  title: string;
  blurb: string;
  inRotation: boolean;
  version: number;
}

test('a Daily puzzles edit shows in the preview of the day and on the Daily', async ({ admin, guest, run }) => {
  const today = await api<{ theme: { id: string } }>(admin, 'GET', '/api/v1/daily');
  test.skip(today.status !== 200, 'the Daily has no puzzles today: load its content first');
  const themes = async () => (await api<{ themes: Theme[] }>(admin, 'GET', '/api/v1/content/daily')).body.themes;
  const theme = (await themes()).find((t) => t.id === today.body.theme.id);
  if (!theme) throw new Error(`No theme ${today.body.theme.id} in Daily puzzles`);
  const renamed = `${theme.title.slice(0, 40)} [e2e ${run.tag}]`;
  try {
    await admin.goto('/manage?tab=daily');
    await admin.getByRole('button', { name: /^Themes and weeks/ }).click();
    await admin.getByRole('button', { name: `Edit ${theme.title}` }).click();
    const dialog = admin.getByRole('dialog', { name: `Edit ${theme.title}` });
    await dialog.getByRole('textbox', { name: 'Title', exact: true }).fill(renamed);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(admin.getByText('Theme saved.')).toBeVisible();

    await admin.getByRole('button', { name: 'Preview a day' }).click();
    await admin.getByRole('group', { name: 'Go to' }).getByRole('button', { name: 'Today' }).click();
    await expect(admin.getByText(renamed)).toBeVisible();

    await guest.goto('/daily');
    await expect(guest.getByRole('heading', { level: 1 })).toContainText(renamed); // 'Daily #19 · <theme>'
  } finally {
    const now = (await themes()).find((t) => t.id === theme.id);
    if (now && now.title !== theme.title) {
      const put = await api(admin, 'PUT', `/api/v1/content/daily/themes/${theme.id}`, {
        title: theme.title,
        blurb: theme.blurb,
        inRotation: theme.inRotation,
        version: now.version,
      });
      expect(put.status).toBe(200);
    }
  }
});
