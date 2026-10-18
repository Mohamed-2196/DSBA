// Suggested videos: Sara suggests a video for a Year 3 module with no lessons yet; an admin (who holds
// content.edit) adds it as a lesson in a new chapter from Manage; Sara is told, and the lesson is there. The feature
// arrives switched off, and is switched off again afterwards.
import { expect, test } from './fixtures';
import { api, personaContext, removeModule, setSwitch } from './support';

interface Note {
  kind: string;
  title: string;
  url: string | null;
}

test('a student suggests a video and a content editor adds it as a lesson', async ({ admin, sara, run }) => {
  const id = `e2e-suggest-${run.tag}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const title = `Gradient descent [e2e ${run.tag}]`;
  const made = await api(admin, 'POST', '/api/v1/content/modules', {
    id,
    name: `E2E suggestions ${run.tag}`,
    shortName: 'E2E',
    year: 3,
  });
  expect(made.status).toBe(201);
  try {
    await setSwitch(admin, 'video_suggestions', 'everyone');

    await sara.goto(`/modules/${id}?tab=lessons`);
    const panel = sara.locator('[data-hub="suggest-video"]');
    await panel.getByRole('button', { name: 'Suggest a video' }).click();
    const dialog = sara.getByRole('dialog', { name: 'Suggest a video' });
    await dialog.getByRole('textbox', { name: 'Link' }).fill(`https://www.youtube.com/watch?v=e2e${run.tag}`);
    await dialog.getByRole('textbox', { name: 'Title' }).fill(title);
    await dialog.getByRole('textbox', { name: 'Why this video?' }).fill('Clearer than the study guide');
    await dialog.locator('[data-hub="suggestion-send"]').click();
    await expect(sara.getByText('Video suggested')).toBeVisible();
    await expect(panel.getByText(title)).toBeVisible();
    await expect(panel.getByText('Waiting for review')).toBeVisible();

    await admin.goto('/manage?tab=videos');
    const card = admin.locator('[data-hub="suggestion"]').filter({ hasText: title });
    await expect(card.getByText('“Clearer than the study guide”')).toBeVisible();
    await card.getByLabel('Chapter').selectOption({ label: 'A new chapter…' });
    await card.getByRole('textbox', { name: 'New chapter’s name' }).fill('Optimisation');
    await card.locator('[data-hub="suggestion-accept"]').click();
    await expect(admin.getByText('Added as a lesson')).toBeVisible();

    const notes = await api<{ items: Note[] }>(sara, 'GET', '/api/v1/notifications');
    const told = notes.body.items.find((n) => n.kind === 'video_suggestion' && n.title.includes(`[e2e ${run.tag}]`));
    expect(told?.url).toMatch(new RegExp(`^/modules/${id}/lessons/[a-z0-9]+$`));

    await sara.goto(told?.url ?? `/modules/${id}?tab=lessons`);
    await expect(sara.getByRole('heading', { name: title })).toBeVisible();
  } finally {
    await removeModule(admin, id);
  }
});

test.afterAll(async ({ browser }) => {
  // Switched back off for the rest of the run: suggestions arrive off.
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'video_suggestions', 'off');
  await ctx.close();
});
