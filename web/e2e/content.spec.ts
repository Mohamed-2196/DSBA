// Editing modules, end to end: an admin (who holds content.edit) adds a module, gives it a chapter and a lesson,
// sees students get it, hides it, and removes it once it's empty again.
import { expect, test } from './fixtures';
import { api, removeModule } from './support';

test('a content editor adds a module with a lesson, hides it and removes it', async ({ admin, sara, run }) => {
  const id = `e2e-module-${run.tag}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const name = `E2E module ${run.tag}`;
  try {
    await admin.goto('/manage?tab=content');
    await admin.getByRole('button', { name: 'Add a module' }).click();
    const dialog = admin.getByRole('dialog', { name: 'Add a module' });
    await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
    await dialog.getByRole('textbox', { name: 'Short name', exact: true }).fill('E2E');
    await dialog.getByLabel('Address').fill(id);
    await dialog.getByLabel('Year').selectOption('3');
    await dialog.getByRole('button', { name: 'Add the module' }).click();
    await expect(admin).toHaveURL(new RegExp(`module=${id}`));

    await admin.getByRole('button', { name: 'Add a chapter' }).click();
    await admin.getByRole('textbox', { name: 'Chapter 1', exact: true }).fill('Getting started');
    await admin.getByRole('button', { name: 'Add a lesson' }).click();
    await admin.getByRole('textbox', { name: 'Lesson 1 title' }).fill('Welcome');
    await admin.getByRole('textbox', { name: 'Video link' }).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await admin.getByRole('button', { name: 'Save' }).first().click();
    await expect(admin.getByText('Saved. Students see the changes now.')).toBeVisible();

    await sara.goto(`/modules/${id}?tab=lessons`);
    await expect(sara.getByText('Welcome').first()).toBeVisible();
    await expect(sara).toHaveURL(new RegExp(`/modules/${id}/lessons/[a-z0-9]+$`)); // the lesson's own address

    await admin.getByRole('switch', { name: 'Hide from students' }).check();
    await admin.getByRole('button', { name: 'Save' }).first().click();
    await expect(admin.getByText('Saved. Students see the changes now.').first()).toBeVisible();
    const hidden = await api(sara, 'GET', `/api/v1/modules/${id}`);
    expect(hidden.status).toBe(404);
  } finally {
    await removeModule(admin, id);
  }
});
