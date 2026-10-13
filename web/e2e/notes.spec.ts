// Notes (R-5): switched on for the run, a student writes a note that saves as she types, finds it by searching, adds
// a quick note on a lesson, and deletes both. A guest is asked to sign in. Notes end switched off, as they start.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'notes', 'everyone');
  await ctx.close();
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'notes', 'off');
  await ctx.close();
});

test('a student writes a note, finds it and deletes it', async ({ sara, run }) => {
  const title = `Moments [e2e ${run.tag}]`;
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await sara.locator('[data-hub="note-title"]').fill(title);
  await sara.locator('[data-hub="note-body"]').fill('The mean is `E[X] = Σ x p(x)`.');
  await expect(sara.locator('[data-hub="note-status"]')).toHaveText('Saved');
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);

  await sara.reload();
  await expect(sara.locator('[data-hub="note-body"]')).toHaveValue('The mean is `E[X] = Σ x p(x)`.');

  await sara.goto('/notes');
  await sara.getByRole('searchbox', { name: 'Search your notes' }).fill('Σ x p');
  await expect(sara.locator('[data-hub="note-row"]')).toHaveCount(1);
  await expect(sara.locator('[data-hub="note-row"]')).toContainText(title);

  await sara.locator('[data-hub="note-row"]').click();
  await sara.locator('[data-hub="note-delete"]').click();
  await sara.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(sara).toHaveURL(/\/notes$/);
  const left = await api<{ items: { title: string }[] }>(sara, 'GET', `/api/v1/notes?q=${encodeURIComponent(run.tag)}`);
  expect(left.body.items).toHaveLength(0);
});

test('a lesson keeps its own notes', async ({ sara, run }) => {
  await sara.goto('/modules/economics?tab=lessons&chapter=0&video=0');
  const panel = sara.locator('[data-hub="lesson-notes"]');
  await panel.locator('[data-hub="lesson-note-text"]').fill(`A quick note [e2e ${run.tag}]`);
  await panel.getByRole('button', { name: 'Add note' }).click();
  await expect(panel.getByRole('link', { name: `A quick note [e2e ${run.tag}]` })).toBeVisible();
  const notes = await api<{ items: { id: string }[] }>(sara, 'GET', '/api/v1/notes?module_id=economics&chapter=0&video=0');
  for (const n of notes.body.items) expect((await api(sara, 'DELETE', `/api/v1/notes/${n.id}`)).status).toBe(204);
});

test('a guest is asked to sign in', async ({ guest }) => {
  await guest.goto('/notes');
  await expect(guest.getByText('Sign in to see this page')).toBeVisible();
  await expect(guest.locator('[data-hub="nav-notes"]')).toHaveCount(0);
});
