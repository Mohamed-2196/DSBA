// Passwords on Your account, and step-up (decision D2). Sara changes her password with the current one, and her
// other devices are signed out. Deleting the account in a session over 10 minutes old first asks for the password
// ("Confirm it's you"); closing that changes nothing. Her session is aged in the database so she meets the dialog
// as a student who signed in yesterday would. The teardown deletes the accounts through the same dialog.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  ageSessions,
  api,
  env,
  gotoAccount,
  newPassword,
  personaContext,
  readRun,
  saveRun,
  statePath,
} from './support';

test.describe.configure({ mode: 'serial' });

interface Me {
  id: string;
  email: string;
  hasPassword: boolean;
  emailConfirmed: boolean;
}

const me = async (page: Page) => (await api<Me>(page, 'GET', '/api/v1/me')).body;

test('Sara changes her password: the current one first; her other devices are signed out', async ({ browser }) => {
  const run = readRun();
  const ctx = await personaContext(browser, 'sara');
  const page = await ctx.newPage();
  // Another device, signed in with her password.
  const other = await browser.newContext({ baseURL: env.baseURL });
  const otherPage = await other.newPage();
  await otherPage.request.get('/api/v1/auth/csrf');
  const signIn = await otherPage.request.post('/api/v1/auth/sign-in', {
    data: { email: run.sara.email, password: run.sara.password },
    headers: { 'X-CSRF-Token': (await other.cookies()).find((c) => c.name === 'dsba_csrf')?.value ?? '' },
  });
  expect(signIn.status()).toBe(200);
  expect((await otherPage.request.get('/api/v1/me')).status()).toBe(200);

  await gotoAccount(page);
  const section = page.locator('[data-hub="acct-email"]');
  await expect(section).toContainText(run.sara.email);
  await expect(section).toContainText('Not confirmed');
  await page.getByRole('button', { name: 'Change your password' }).click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Change your password' });
  const next = newPassword(`${run.tag}b`);
  await dialog.getByLabel('Current password', { exact: true }).fill('not her password at all');
  await dialog.getByLabel('New password', { exact: true }).fill(next);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog).toContainText('That isn’t your current password.');
  await dialog.getByLabel('Current password', { exact: true }).fill(run.sara.password);
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed')).toBeVisible();
  expect((await me(page)).hasPassword).toBe(true);
  expect((await otherPage.request.get('/api/v1/me')).status()).toBe(401); // signed out there
  await other.close();

  await ctx.storageState({ path: statePath('sara') });
  saveRun({ ...readRun(), sara: { ...run.sara, password: next } });
  await ctx.close();
});

test('closing "Confirm it’s you" changes nothing; a wrong password is refused', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara');
  const page = await ctx.newPage();
  const before = await me(page);
  await ageSessions(before.id, 11);
  await gotoAccount(page);
  await page.getByRole('button', { name: 'Delete account' }).click();
  const confirm = page.getByRole('dialog').filter({ hasText: 'Delete your account?' });
  const word = (await confirm.locator('.u-mono').first().innerText()).trim();
  await confirm.getByRole('textbox').fill(word);
  await confirm.getByRole('button', { name: /Delete my account/ }).click();

  const stepUp = page.locator('[data-hub="step-up"]');
  await expect(stepUp).toContainText('To delete your account, enter your password');
  await stepUp.getByLabel('Password', { exact: true }).fill('not her password at all');
  await stepUp.getByRole('button', { name: 'Confirm' }).click();
  await expect(stepUp).toContainText('That isn’t your current password.');
  await stepUp.getByRole('button', { name: 'Close' }).click();
  await expect(stepUp).toHaveCount(0);
  expect((await me(page)).id).toBe(before.id); // still here
  await ageSessions(before.id, -11); // as young as before
  await ctx.close();
});
