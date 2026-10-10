// The admin's People page: find a student, change his role and back, suspend him (he can read but not post),
// lift it, and see it all in the activity log.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext, readRun, remember } from './support';

test.describe.configure({ mode: 'serial' });

async function findAli(admin: Page, email: string) {
  await admin.goto('/admin/people');
  await admin.getByLabel('Search people').fill(email);
  const row = admin.locator('tr').filter({ hasText: email }).first();
  await expect(row).toBeVisible();
  return row;
}

// Whatever happens, Ali isn't left suspended or a rep for the specs that follow.
test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  const found = await api<{ items: { id: string; role: string; status: string }[] }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(readRun().ali.email)}`);
  const ali = found.body.items[0];
  if (ali && (ali.status !== 'active' || ali.role !== 'student')) await api(page, 'PATCH', `/api/v1/admin/users/${ali.id}`, { role: 'student', status: 'active' });
  await ctx.close();
});

test('the admin makes Ali a student rep and back; he is told', async ({ admin, ali, run }) => {
  let row = await findAli(admin, run.ali.email);
  await row.getByLabel(/Role of/).selectOption('moderator');
  await admin.getByRole('dialog').getByRole('button', { name: 'Make student rep' }).click();
  await expect(admin.getByText(`${run.ali.name} is now a student rep`, { exact: true })).toBeVisible();
  expect((await api<{ role: string }>(ali, 'GET', '/api/v1/me')).body.role).toBe('moderator');
  await ali.goto('/moderation');
  await expect(ali.locator('main')).toContainText('Open reports');

  row = await findAli(admin, run.ali.email);
  await row.getByLabel(/Role of/).selectOption('student');
  await admin.getByRole('dialog').getByRole('button', { name: 'Make student' }).click();
  await expect(admin.getByText(`${run.ali.name} is now a student`, { exact: true })).toBeVisible();
  await ali.goto('/moderation');
  await expect(ali.locator('main')).toContainText('It isn’t available on your account.');
  const notes = await api<{ items: { title: string }[] }>(ali, 'GET', '/api/v1/notifications');
  expect(notes.body.items.map((n) => n.title)).toEqual(expect.arrayContaining(["You're now a student rep", 'Your role is now student']));
});

test('a suspended student can read but not post; lifting it lets him post again', async ({ admin, ali, sara, run }) => {
  const thread = await api<{ id: string; slug: string }>(sara, 'POST', '/api/v1/forum/threads', {
    title: `ST2195: dplyr or base R for the coursework? [e2e ${run.tag}]`,
    body: 'The brief doesn’t say. Did anyone lose marks for using tidyverse?',
    category: 'year-2',
    moduleId: 'programming-data-science',
  });
  expect(thread.status).toBe(201);
  remember('threads', thread.body.id);

  let row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Suspend/ }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Suspend' }).click();
  await expect(admin.getByText(`${run.ali.name} is suspended`, { exact: true })).toBeVisible();

  await ali.goto('/forum/new');
  await expect(ali.locator('main')).toContainText('Your account is suspended, so you can’t post.');
  await expect(ali.locator('[data-hub="post-button"]')).toBeDisabled();
  await ali.goto(`/forum/${thread.body.slug}`);
  await expect(ali.locator('main')).toContainText('Your account is suspended, so you can read the forum but not reply.');
  await expect(ali.locator('[data-hub="reply-input"]')).toHaveCount(0);
  const writes: ['PUT' | 'POST', string, unknown][] = [
    ['PUT', `/api/v1/forum/threads/${thread.body.id}/vote`, undefined],
    ['POST', `/api/v1/forum/threads/${thread.body.id}/replies`, { body: 'Trying to reply while suspended.' }],
    ['POST', '/api/v1/uploads', { purpose: 'library', fileName: 'notes.pdf', contentType: 'application/pdf', sizeBytes: 1000 }],
    ['POST', '/api/v1/reports', { targetType: 'thread', targetId: thread.body.id, reason: 'spam', note: null }],
  ];
  for (const [method, url, data] of writes) {
    const r = await api<{ error: { message: string } }>(ali, method, url, data);
    expect(r.status, `${method} ${url}`).toBe(403);
    expect(r.body.error.message).toContain('suspended');
  }
  const notes = await api<{ items: { title: string }[] }>(ali, 'GET', '/api/v1/notifications');
  expect(notes.body.items[0].title).toBe('Your account is suspended');

  row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Lift the suspension/ }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Lift suspension' }).click();
  await expect(admin.getByText(`${run.ali.name} can post again`, { exact: true })).toBeVisible();
  await ali.goto(`/forum/${thread.body.slug}`);
  await expect(ali.locator('[data-hub="reply-input"]')).toBeVisible();
  await ali.goto('/forum/new');
  await expect(ali.locator('[data-hub="post-button"]')).toBeEnabled();
});

test('the activity log records the role and status changes', async ({ admin, run }) => {
  await admin.goto('/admin/people');
  await admin.getByRole('tab', { name: 'Activity' }).click();
  const log = admin.locator('main');
  await expect(log).toContainText(run.ali.name);
  await expect(log).toContainText(/suspen/i);
});
