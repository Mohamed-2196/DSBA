// The account page: profile and cohort, email preferences, devices, and downloading your data.
// (Signing in, out and adding an email are in auth.setup.ts; deleting the account is in cleanup.teardown.ts.)
import fs from 'node:fs';
import { expect, test } from './fixtures';
import { api } from './support';

test('Ali edits his name and cohort, and his email preferences', async ({ ali, run }) => {
  await ali.goto('/account');
  await expect(ali.locator('main')).toContainText(run.ali.email);
  const name = ali.getByLabel('Display name');
  await name.fill('A');
  await ali.getByRole('button', { name: 'Save profile' }).click();
  await expect(ali.locator('main')).toContainText('Enter your name (at least 2 characters).');
  await name.fill('Ali E2E Hasan');
  await ali.getByRole('group', { name: 'Your cohort' }).getByText('Year 2', { exact: true }).click();
  await ali.getByRole('button', { name: 'Save profile' }).click();
  await expect.poll(async () => (await api<{ displayName: string; year: number }>(ali, 'GET', '/api/v1/me')).body).toMatchObject({ displayName: 'Ali E2E Hasan', year: 2 });
  await ali.goto('/');
  await expect(ali.locator('main')).toContainText('Year 2');

  // back as he was (the other specs know him by his name and as Year 1)
  await ali.goto('/account');
  await name.fill(run.ali.name);
  await ali.getByRole('group', { name: 'Your cohort' }).getByText('Year 1', { exact: true }).click();
  await ali.getByRole('button', { name: 'Save profile' }).click();
  await expect.poll(async () => (await api<{ displayName: string; year: number }>(ali, 'GET', '/api/v1/me')).body).toMatchObject({ displayName: run.ali.name, year: 1 });

  const newsletterEmails = ali.getByRole('switch', { name: /New newsletter issues/ });
  await newsletterEmails.click();
  await expect.poll(async () => (await api<{ preferences: { newsletterEmails: boolean } }>(ali, 'GET', '/api/v1/me')).body.preferences.newsletterEmails).toBe(false);
  await newsletterEmails.click();
  await expect.poll(async () => (await api<{ preferences: { newsletterEmails: boolean } }>(ali, 'GET', '/api/v1/me')).body.preferences.newsletterEmails).toBe(true);
});

test('the account page lists this device, and "Download your data" gives everything as JSON', async ({ ali, run }) => {
  await ali.goto('/account');
  await expect(ali.locator('main')).toContainText('This device');
  const [download] = await Promise.all([ali.waitForEvent('download'), ali.getByRole('button', { name: 'Download', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^dsba-hub-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  expect(Object.keys(data)).toEqual(expect.arrayContaining(['user', 'sessions', 'threads', 'replies', 'libraryItems', 'stars', 'reactions', 'progress', 'notifications', 'votes', 'reports']));
  expect(data.user.email).toBe(run.ali.email);
});
