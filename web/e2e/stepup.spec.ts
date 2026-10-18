// Step-up (decision D2): changing the email address or phone number in a session over 10 minutes old first asks
// for a code to an address the account already has ("Confirm it's you"), then carries on with the change. Sara has
// both (setup), and her session is aged in the database so she meets the dialog as a student who signed in
// yesterday would. About 5 codes: two emails and three texts.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import {
  ageSessions,
  api,
  gotoAccount,
  mailedSince,
  newestText,
  personaContext,
  readRun,
  saveRun,
  statePath,
  waitForCode,
} from './support';

test.describe.configure({ mode: 'serial' });

interface Me {
  id: string;
  email: string | null;
  phone: string | null;
}

const me = async (page: Page) => (await api<Me>(page, 'GET', '/api/v1/me')).body;

/** A new Bahraini mobile, not the one Sara has. */
function newMobile(old: string): { local: string; e164: string } {
  for (;;) {
    const local = `3${'369'[Math.floor(Math.random() * 3)]}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
    if (`+973${local}` !== old) return { local, e164: `+973${local}` };
  }
}

test('Sara changes her email address: a code to her current address first, then one to the new address', async ({
  browser,
}) => {
  const run = readRun();
  const ctx = await personaContext(browser, 'sara');
  const page = await ctx.newPage();
  const before = await me(page);
  expect(before.email).toBeTruthy();
  await ageSessions(before.id, 11);

  await gotoAccount(page);
  await page.getByRole('button', { name: 'Change your email address' }).click();
  const change = page.getByRole('dialog').filter({ hasText: 'Change your email address' });
  const newEmail = `sara.e2e.${run.tag}.new@example.com`;
  await change.getByLabel('New email address').fill(newEmail);
  const since = Date.now();
  await change.getByRole('button', { name: 'Send code' }).click();

  // The API answers step_up_required; the app asks for a code to the address she has now.
  const stepUp = page.locator('[data-hub="step-up"]');
  await expect(stepUp).toContainText('Confirm it’s you');
  const sendAgain = stepUp.getByRole('button', { name: 'Send the code again' });
  const codeBox = stepUp.getByLabel('6-digit code');
  await expect(codeBox.or(sendAgain)).toBeVisible();
  if (await sendAgain.isVisible()) {
    const alert = await stepUp.locator('.signin__alert').textContent();
    const waitSeconds = parseInt(alert?.match(/(\d+)\s*second/)?.[1] ?? '30', 10);
    await page.waitForTimeout((waitSeconds + 1) * 1000);
    await sendAgain.click();
    await expect(codeBox).toBeVisible();
  }
  await expect(stepUp).toContainText(`To change how you sign in, enter the code we sent to ${before.email}.`);
  const code = await waitForCode('email', before.email ?? '', since);
  await stepUp.getByLabel('6-digit code').fill(code === '000000' ? '111111' : '000000');
  await expect(stepUp).toContainText("That code isn't right. 4 tries left.");
  const since2 = Date.now();
  await stepUp.getByLabel('6-digit code').fill(code);

  // Confirmed: the change goes ahead by itself, and the new address gets its own code.
  await expect(stepUp).toHaveCount(0);
  await expect(change).toContainText(`Sent to ${newEmail}.`);
  await change.getByLabel('6-digit code').fill(await waitForCode('email', newEmail, since2));
  await expect(page.getByText('Your email address is changed')).toBeVisible();
  expect((await me(page)).email).toBe(newEmail);
  // The old address is told, in case it wasn't her.
  await expect
    .poll(() => mailedSince(before.email ?? '', 'Your DSBA Hub account changed', since2), { timeout: 30_000 })
    .toBe(true);

  await ctx.storageState({ path: statePath('sara') }); // the step-up renewed her session
  saveRun({ ...readRun(), sara: { ...run.sara, email: newEmail } });
  await ctx.close();
});

test('Sara changes her phone number, confirming by text instead of email', async ({ browser }) => {
  const run = readRun();
  const ctx = await personaContext(browser, 'sara');
  const page = await ctx.newPage();
  const before = await me(page);
  expect(before.phone).toBe(run.sara.e164);
  await ageSessions(before.id, 11);
  const next = newMobile(run.sara.e164);

  await gotoAccount(page);
  await page.getByRole('button', { name: 'Change your phone number' }).click();
  const change = page.getByRole('dialog').filter({ hasText: 'Change your phone number' });
  await change.getByLabel('New phone number').fill(next.local);
  await change.getByRole('button', { name: 'Send code' }).click();

  // The dialog tries her email address first (within 30 s of the last code there it says how long to wait); she
  // asks for a text instead.
  const stepUp = page.locator('[data-hub="step-up"]');
  await expect(stepUp).toContainText(
    new RegExp(`(we sent to|send a code to) ${before.email?.replace(/[.+]/g, '\\$&')}\\.`),
  );
  const since = Date.now();
  await stepUp.getByRole('button', { name: 'Text my phone instead' }).click();
  await expect(stepUp).toContainText(`enter the code we sent to +973 ${run.sara.local}.`);
  const since2 = Date.now();
  await stepUp.getByLabel('6-digit code').fill(await waitForCode('sms', run.sara.e164, since));

  await expect(stepUp).toHaveCount(0);
  await change.getByLabel('6-digit code').fill(await waitForCode('sms', next.e164, since2));
  await expect(page.getByText('Your phone number is changed')).toBeVisible();
  expect((await me(page)).phone).toBe(next.e164);
  // The old number is told by text.
  await expect
    .poll(() => newestText(run.sara.e164), { timeout: 20_000 })
    .toContain('The phone number on your DSBA Hub account was changed');

  await ctx.storageState({ path: statePath('sara') });
  saveRun({
    ...readRun(),
    sara: { ...readRun().sara, local: `${next.local.slice(0, 4)} ${next.local.slice(4)}`, e164: next.e164 },
  });
  await ctx.close();
});

test('closing "Confirm it’s you" changes nothing', async ({ browser }) => {
  const ctx = await personaContext(browser, 'sara');
  const page = await ctx.newPage();
  const before = await me(page);
  await ageSessions(before.id, 11);
  await gotoAccount(page);
  await page.getByRole('button', { name: 'Remove your phone number' }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Remove your phone number?' })
    .getByRole('button', { name: 'Remove', exact: true })
    .click();
  const stepUp = page.locator('[data-hub="step-up"]');
  await expect(stepUp).toContainText('To remove your phone number');
  await stepUp.getByRole('button', { name: 'Close' }).click();
  await expect(stepUp).toHaveCount(0);
  await expect(page.getByRole('dialog').filter({ hasText: 'Remove your phone number?' })).toContainText('confirm it');
  expect(await me(page)).toMatchObject({ email: before.email, phone: before.phone });
  await ageSessions(before.id, -11); // as young as before, so the teardown deletes her account without a code
  await ctx.close();
});
