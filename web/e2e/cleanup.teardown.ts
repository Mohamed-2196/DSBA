// Runs after every spec (project "cleanup", the setup project's teardown). Every feature is switched back on for
// everyone, so an interrupted run never leaves one off. The run's two students download their data and delete their
// accounts (their posts stay, as from a deleted account); then the rep removes what the run created. Nothing the run
// didn't create is touched. E2E_KEEP=1 leaves the accounts and posts in place.
import fs from 'node:fs';
import { test as teardown, expect } from '@playwright/test';
import { api, env, FEATURES, personaContext, readRun, statePath, waitForCode } from './support';

teardown.describe.configure({ mode: 'serial' });

teardown('every feature is switched back on for everyone', async ({ browser }) => {
  if (!fs.existsSync(statePath('admin'))) return;
  const ctx = await personaContext(browser, 'admin');
  const page = await ctx.newPage();
  // Only the ones that aren't on: every switch counts towards the admin's 60 changes in 10 minutes.
  const now = await api<{ feature: string; mode: string }[]>(page, 'GET', '/api/v1/admin/features');
  expect(now.status).toBe(200);
  const on = new Set(now.body.filter((f) => f.mode === 'everyone').map((f) => f.feature));
  for (const feature of FEATURES.filter((f) => !on.has(f))) {
    const r = await api(page, 'PUT', `/api/v1/admin/features/${feature}`, { mode: 'everyone', roleIds: [] });
    expect(r.status, `switch ${feature} on`).toBe(200);
  }
  await ctx.close();
});

teardown('the students download their data and delete their accounts; their posts stay as a deleted account', async ({ browser }) => {
  teardown.skip(env.keep, 'E2E_KEEP=1');
  const run = readRun();
  for (const who of ['ali', 'sara'] as const) {
    if (!fs.existsSync(statePath(who))) continue;
    const ctx = await personaContext(browser, who);
    const page = await ctx.newPage();
    const me = await api<{ id: string; displayName: string; email: string | null; phone: string | null }>(page, 'GET', '/api/v1/me');
    if (me.status !== 200) {
      await ctx.close();
      continue;
    }
    const mine = await api<{ items: { slug: string }[] }>(page, 'GET', '/api/v1/forum/threads?mine=true&limit=50');

    await page.goto('/account');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download', exact: true }).click()]);
    const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    expect(data.user.id).toBe(me.body.id);

    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Your threads and replies stay, shown as from a deleted user.');
    const word = (await dialog.locator('.u-mono').first().innerText()).trim();
    await dialog.getByRole('textbox').fill(word);
    const since = Date.now();
    await dialog.getByRole('button', { name: /Delete my account/ }).click();
    // D2: a session that started more than 10 minutes ago confirms it's you first, with a code to the account's
    // email address (or phone). After the code the deletion goes ahead by itself.
    const deleted = page.getByText('Your account is deleted');
    const stepUp = page.locator('[data-hub="step-up"]');
    await expect(deleted.or(stepUp).first()).toBeVisible();
    if (await stepUp.isVisible()) {
      const code = me.body.email ? await waitForCode('email', me.body.email, since) : await waitForCode('sms', me.body.phone ?? '', since);
      await stepUp.getByLabel('6-digit code').fill(code);
    }
    await expect(deleted).toBeVisible();
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);
    await ctx.close();

    // What classmates see now.
    const visible = mine.body.items[0];
    if (visible) {
      const guest = await browser.newContext({ baseURL: env.baseURL });
      const g = await guest.newPage();
      const thread = await api<{ author: unknown; title: string }>(g, 'GET', `/api/v1/forum/threads/${visible.slug}`);
      if (thread.status === 200) {
        expect(thread.body.author).toBeNull();
        await g.goto(`/forum/${visible.slug}`);
        await expect(g.locator('main')).toContainText('Deleted account');
      }
      await guest.close();
    }
    fs.rmSync(statePath(who));
  }
  expect(run.tag).toBeTruthy();
});

teardown('the rep removes what the run created', async ({ browser }) => {
  teardown.skip(env.keep, 'E2E_KEEP=1');
  if (!fs.existsSync(statePath('rep'))) return;
  const run = readRun();
  const ctx = await personaContext(browser, 'rep');
  const page = await ctx.newPage();
  for (const id of run.created.threads) {
    const r = await api(page, 'POST', `/api/v1/forum/threads/${id}/moderate`, { status: 'hidden' });
    expect([200, 404]).toContain(r.status);
  }
  for (const id of run.created.items) {
    const r = await api(page, 'DELETE', `/api/v1/library/items/${id}`);
    expect([204, 404]).toContain(r.status);
  }
  for (const id of run.created.events) {
    const r = await api(page, 'DELETE', `/api/v1/calendar/events/${encodeURIComponent(id)}`);
    expect([204, 404]).toContain(r.status);
  }
  for (const id of run.created.issues) {
    const r = await api(page, 'DELETE', `/api/v1/newsletter/issues/${id}`);
    expect([204, 404]).toContain(r.status);
  }
  await ctx.close();
});
