// Manage → Career Navigator (holders of career.edit): add an employer, preview the change, save it, see it on
// /career as a student and in the activity log. Nothing is kept: the page is put back as it was.
import { expect, test } from './fixtures';
import { api } from './support';

test('a career editor edits Career Navigator, previews it, and students see the update', async ({
  admin,
  sara,
  run,
}) => {
  const employerName = `E2E Employer ${run.tag}`;
  // Read initial document so we can restore it in finally
  const initial = await api<{ version: number; data: Record<string, unknown> }>(admin, 'GET', '/api/v1/career/edit');
  expect(initial.status).toBe(200);

  try {
    await admin.goto('/manage?tab=career');
    await expect(admin.getByRole('heading', { name: 'Career Navigator', level: 2 })).toBeVisible();

    // The sections exist
    await expect(admin.getByRole('button', { name: /Employers/i })).toBeVisible();
    await expect(admin.getByRole('button', { name: /Tracks/i })).toBeVisible();
    await expect(admin.getByRole('button', { name: /Roles/i })).toBeVisible();

    // Add an employer: the new one opens for editing. Its name goes last: the employer takes its id from the name
    // when the name loses the focus (see the next test).
    await admin.getByRole('button', { name: 'Add an employer' }).click();
    const added = admin.locator('[data-item-id]').filter({ has: admin.locator('button[aria-expanded="true"]') });
    await added.getByRole('textbox', { name: 'Initials', exact: true }).fill('E2E');
    await added.getByRole('combobox', { name: 'Sector', exact: true }).fill('Technology'); // a box with suggestions
    await added
      .getByRole('textbox', { name: 'Why it’s here', exact: true })
      .fill('Leading technology employer for e2e test.');
    await added.getByRole('textbox', { name: 'Its own page', exact: true }).fill('https://example.com/careers');
    await added.getByRole('textbox', { name: 'Name', exact: true }).fill(employerName);

    // Preview drawer opens and shows the employer card
    await admin.getByRole('button', { name: 'Preview' }).click();
    const preview = admin.getByRole('dialog', { name: 'Preview' });
    await expect(preview).toBeVisible();
    // The page shows the first employers; the new one is last.
    await preview.getByRole('button', { name: /^Show all \d+ employers$/ }).click();
    await expect(preview.getByRole('heading', { name: employerName })).toBeVisible();
    await admin.getByRole('button', { name: 'Close' }).click();

    // Save changes
    await admin.getByRole('button', { name: 'Save' }).first().click();
    await expect(admin.getByText('Saved. Students see the changes now.')).toBeVisible();

    // Students see the new employer on /career
    await sara.goto('/career?all=1');
    await expect(sara.getByRole('heading', { name: employerName })).toBeVisible();

    // Manage Activity log records the update
    await admin.goto('/manage?tab=activity');
    await expect(admin.getByText(/edited Career Navigator/i).first()).toBeVisible();
  } finally {
    // Restore initial document
    const current = await api<{ version: number }>(admin, 'GET', '/api/v1/career/edit');
    if (current.status === 200 && initial.body.data) {
      await api(admin, 'PUT', '/api/v1/career', {
        version: current.body.version,
        data: initial.body.data,
      });
    }
  }
});

test('typing an employer’s name and moving on to its initials keeps them', async ({ admin }) => {
  await admin.goto('/manage?tab=career');
  await admin.getByRole('button', { name: 'Add an employer' }).click();
  const added = admin.locator('[data-item-id]').filter({ has: admin.locator('button[aria-expanded="true"]') });
  await added.getByRole('textbox', { name: 'Name', exact: true }).fill('E2E Tab Employer');
  await admin.keyboard.press('Tab');
  await admin.keyboard.type('ET');
  await expect(added.getByRole('textbox', { name: 'Initials', exact: true })).toHaveValue('ET', { timeout: 3_000 });
});
