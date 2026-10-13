// The admin's Access screen: give Ali the Newsletter manager role and take it back (he's told, and Manage follows);
// suspend him (he reads but can't post) and lift it; see it all under Activity.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext, readRun, remember, roleIdBySlug } from './support';

test.describe.configure({ mode: 'serial' });

async function findAli(admin: Page, email: string) {
  await admin.goto('/admin/access?tab=people');
  await admin.getByLabel('Search by name, email or phone').fill(email);
  const row = admin.locator('tr').filter({ hasText: email }).first();
  await expect(row).toBeVisible();
  return row;
}

// Whatever happens, Ali ends as a plain, active student for the specs that follow.
test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  const found = await api<{ items: { id: string; status: string }[] }>(page, 'GET', `/api/v1/admin/users?q=${encodeURIComponent(readRun().ali.email)}`);
  const ali = found.body.items[0];
  if (ali) {
    await api(page, 'PUT', `/api/v1/admin/users/${ali.id}/roles`, { roleIds: [await roleIdBySlug(page, 'student')] });
    if (ali.status !== 'active') await api(page, 'PATCH', `/api/v1/admin/users/${ali.id}`, { status: 'active' });
  }
  await ctx.close();
});

test('the admin makes Ali a newsletter manager and back; he is told', async ({ admin, ali, run }) => {
  let row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Change the roles of/ }).click();
  let dialog = admin.getByRole('dialog');
  await dialog.getByLabel(/^Newsletter manager/).check();
  await dialog.getByRole('button', { name: 'Save roles' }).click();
  await expect(admin.getByText(`${run.ali.name}’s roles are saved`)).toBeVisible();
  await expect(row).toContainText('Newsletter manager');

  const me = await api<{ roles: { slug: string }[]; boxes: string[] }>(ali, 'GET', '/api/v1/me');
  expect(me.body.roles.map((r) => r.slug)).toContain('newsletter-manager');
  expect(me.body.boxes).toContain('newsletter.manage');
  await ali.goto('/manage');
  await expect(ali.getByRole('tab', { name: /Newsletter/ })).toBeVisible();
  await expect(ali.getByRole('tab', { name: /Reports/ })).toHaveCount(0);

  row = await findAli(admin, run.ali.email);
  await row.getByRole('button', { name: /^Change the roles of/ }).click();
  dialog = admin.getByRole('dialog');
  // The dialog fills in Ali's roles just after it opens: wait for them before changing one.
  await expect(dialog.getByLabel(/^Newsletter manager/)).toBeChecked();
  await dialog.getByLabel(/^Newsletter manager/).uncheck();
  await dialog.getByRole('button', { name: 'Save roles' }).click();
  await expect(admin.getByText(`${run.ali.name}’s roles are saved`).first()).toBeVisible();
  await expect(dialog).toBeHidden();
  await ali.goto('/manage');
  await expect(ali.locator('main')).toContainText('This page isn’t on your account');
  const notes = await api<{ items: { title: string }[] }>(ali, 'GET', '/api/v1/notifications');
  expect(notes.body.items.filter((n) => n.title === 'Your roles changed').length).toBeGreaterThanOrEqual(2);
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
  await expect(ali.locator('[data-hub="cant-post"]')).toContainText('Your account is suspended, so you can’t post in the forum for now.');
  await expect(ali.locator('[data-hub="post-button"]')).toHaveCount(0);
  await ali.goto(`/forum/${thread.body.slug}`);
  await expect(ali.locator('[data-hub="cant-post"]')).toContainText('Your account is suspended, so you can’t post in the forum for now.');
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
  await admin.goto('/admin/access?tab=activity');
  const log = admin.locator('main');
  await expect(log).toContainText(`${run.ali.name}’s roles`);
  await expect(log).toContainText(/suspen/i);
});
