// Notes: switched on for the run, a student writes a note that saves as she types, finds it by searching, adds
// a quick note on a lesson, and deletes both. A guest is asked to sign in. Notes end switched off, as they start.
import { expect, test } from './fixtures';
import { api, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'notes', ['notes']));

test.afterAll(async ({ browser }) => switchBack(browser, 'notes'));

test('a student writes a note, finds it and deletes it', async ({ sara, run }) => {
  const title = `Moments [e2e ${run.tag}]`;
  const body = 'The mean is E[X] = Σ x p(x).';
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await sara.locator('[data-hub="note-title"]').fill(title);
  await sara.locator('[data-hub="note-text"]').click();
  await sara.keyboard.type(body);
  await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');

  await sara.reload();
  await expect(sara.locator('[data-hub="note-text"]')).toContainText(body);
  // out to the list and in again: the note opens with its text, and nothing is saved over it
  await sara.locator('.nb-back').click();
  await expect(sara).toHaveURL(/\/notes$/);
  await sara.locator('[data-hub="note-row"]', { hasText: title }).click();
  await expect(sara.locator('[data-hub="note-text"]')).toContainText(body);
  await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');

  await sara.goto('/notes');
  await sara.getByRole('searchbox', { name: 'Search your notes' }).fill('Σ x p');
  await expect(sara.locator('[data-hub="note-row"]')).toHaveCount(1);
  await expect(sara.locator('[data-hub="note-row"]')).toContainText(title);

  await sara.locator('[data-hub="note-row"]').click();
  await sara.locator('[data-hub="note-more"]').click();
  await sara.getByRole('menuitem', { name: 'Delete note' }).click();
  await sara.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(sara).toHaveURL(/\/notes$/);
  const left = await api<{ items: { title: string }[] }>(sara, 'GET', `/api/v1/notes?q=${encodeURIComponent(run.tag)}`);
  expect(left.body.items.map((n) => n.title)).not.toContain(title); // another spec's note may share the run's tag
});

test('a lesson keeps its own notes', async ({ sara, run }) => {
  await sara.goto('/modules/economics/lessons/xfm6xyvy'); // chapter 1's first lesson (app/seed/data/modules.json)
  const panel = sara.locator('[data-hub="lesson-notes"]');
  await panel.locator('[data-hub="lesson-note-text"]').fill(`A quick note [e2e ${run.tag}]`);
  await panel.getByRole('button', { name: 'Add note' }).click();
  await expect(panel.getByRole('link', { name: `A quick note [e2e ${run.tag}]` })).toBeVisible();
  const notes = await api<{ items: { id: string }[] }>(
    sara,
    'GET',
    '/api/v1/notes?module_id=economics&lesson_id=xfm6xyvy',
  );
  for (const n of notes.body.items) expect((await api(sara, 'DELETE', `/api/v1/notes/${n.id}`)).status).toBe(204);
});

test('notes beside the lesson’s video, about the lesson, and no empty note left behind (ST-44, ST-37)', async ({
  sara,
  run,
}) => {
  const lesson = '/api/v1/notes?module_id=economics&lesson_id=xfm6xyvy';
  const clear = async () => {
    const notes = await api<{ items: { id: string }[] }>(sara, 'GET', lesson);
    for (const n of notes.body.items) await api(sara, 'DELETE', `/api/v1/notes/${n.id}`);
  };
  await clear();
  try {
    await sara.goto('/modules/economics/lessons/xfm6xyvy');
    await sara.locator('[data-hub="lesson-take-notes"]').click();
    const panel = sara.locator('[data-hub="lesson-note-panel"]');
    // a lesson without notes opens a new one, ready to type, beside the video
    const text = panel.locator('[data-hub="note-text"]');
    await expect(text).toBeFocused();
    await expect(sara.locator('[data-hub="lesson-player"]')).toBeInViewport();
    await sara.keyboard.type(`Beside the video [e2e ${run.tag}]`);
    await expect(panel.locator('[data-hub="note-status"]')).toContainText('Saved in');
    await expect(panel.locator('[data-hub="note-stamp-time"]')).toBeVisible();
    const saved = await api<{ items: { id: string; moduleId: string; lessonId: string }[] }>(sara, 'GET', lesson);
    expect(saved.body.items.map((n) => [n.moduleId, n.lessonId])).toEqual([['economics', 'xfm6xyvy']]);

    // back to the lesson's notes, a new one left empty, and closed: only the written one is kept
    await panel.locator('[data-hub="lesson-note-list"]').click();
    await panel.locator('[data-hub="lesson-note-new"]').click();
    await expect(panel.locator('[data-hub="note-text"]')).toBeFocused();
    await panel.locator('[data-hub="lesson-note-close"]').click();
    await expect(panel).toHaveCount(0);
    await expect.poll(async () => (await api<{ items: unknown[] }>(sara, 'GET', lesson)).body.items.length).toBe(1);
  } finally {
    await clear();
  }
});

test('a guest is asked to sign in', async ({ guest }) => {
  await guest.goto('/notes');
  await expect(guest.getByText('Sign in to see this page')).toBeVisible();
  await expect(guest.locator('[data-hub="nav-notes"]')).toHaveCount(0);
});
