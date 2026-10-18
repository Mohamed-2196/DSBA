// Manage → Career Navigator (holders of career.edit): add/edit employer, preview changes,
// save with versioning, verify students see it on /career, and check activity log.
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
    await expect(admin.getByRole('heading', { name: 'Career Navigator', level: 3 })).toBeVisible();

    // The sections exist
    await expect(admin.getByRole('button', { name: /Employers/i })).toBeVisible();
    await expect(admin.getByRole('button', { name: /Tracks/i })).toBeVisible();
    await expect(admin.getByRole('button', { name: /Roles/i })).toBeVisible();

    // Add an employer
    await admin.getByRole('button', { name: 'Add an employer' }).click();
    const nameInput = admin.getByRole('textbox', { name: 'Name', exact: true }).last();
    await nameInput.fill(employerName);
    const monoInput = admin.getByRole('textbox', { name: 'Initials', exact: true }).last();
    await monoInput.fill('E2E');
    const sectorInput = admin.getByRole('textbox', { name: 'Sector', exact: true }).last();
    await sectorInput.fill('Technology');
    const whyInput = admin.getByRole('textbox', { name: 'Why it’s here', exact: true }).last();
    await whyInput.fill('Leading technology employer for e2e test.');

    // Preview drawer opens and shows the employer card
    await admin.getByRole('button', { name: 'Preview' }).click();
    await expect(admin.getByRole('dialog', { name: 'Preview' })).toBeVisible();
    await expect(admin.getByRole('dialog', { name: 'Preview' }).getByText(employerName)).toBeVisible();
    await admin.getByRole('button', { name: 'Close' }).click();

    // Save changes
    await admin.getByRole('button', { name: 'Save' }).first().click();
    await expect(admin.getByText('Saved. Students see the changes now.')).toBeVisible();

    // Students see the new employer on /career
    await sara.goto('/career?all=1');
    await expect(sara.getByText(employerName)).toBeVisible();

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
