// Signing up and signing in, with real one-time codes. Runs first (project "setup") and leaves a session per
// persona for the specs. Sara: phone, wrong code, resend, a retired and a reused code, profile; grades and lesson
// progress across signing out and back in; adding an email. Ali: email, on a phone-sized screen. Rep and admin:
// dev-login. About 5 codes per run (the API allows 30 per IP per hour).
import { test as setup, expect, type Page } from '@playwright/test';
import { api, devLogin, env, newRun, prepareContext, readRun, statePath, waitForCode } from './support';

setup.describe.configure({ mode: 'serial' });

/** The sign-in dialog's request for a code, with the challenge the API answered. Within 30 s of the last code
 * to the same address the API says how long to wait ("Wait 21 seconds before asking for another code."), as a
 * student would see it; then it waits that long and asks again. */
async function sendCode(page: Page): Promise<{ challengeId: string; since: number }> {
  const dialog = page.getByRole('dialog');
  for (let attempt = 0; ; attempt++) {
    const since = Date.now();
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/otp') && r.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Send code' }).click(),
    ]);
    const body = await resp.json();
    if (resp.status() === 429 && body.error?.code === 'rate_limited' && body.error.retryAfter <= 60 && attempt === 0) {
      await expect(dialog).toContainText(/Wait \d+ seconds? before asking for another code\./);
      await page.waitForTimeout((body.error.retryAfter + 1) * 1000); // the wait the API asked for
      continue;
    }
    expect(resp.status(), JSON.stringify(body)).toBe(202);
    return { challengeId: body.challengeId as string, since };
  }
}

setup('Sara signs up with her phone number: wrong code, resend, profile', async ({ browser }) => {
  const run = newRun();
  const ctx = await browser.newContext({ baseURL: env.baseURL });
  await prepareContext(ctx, { year: null }); // a first visit: no year chosen yet
  const page = await ctx.newPage();

  // First visit: choose a year, skip the tour.
  await page.goto('/');
  await page.locator('[data-hub="onboarding-y2"]').click();
  await page.getByRole('button', { name: 'Skip the tour' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Sign in to DSBA Hub');
  await dialog.getByLabel('Email or phone number').fill(run.sara.local);
  await expect(dialog).toContainText(`We’ll text a 6-digit code to +973 ${run.sara.local}.`);
  const first = await sendCode(page);
  await expect(dialog).toContainText('Check your messages');
  await expect(dialog).toContainText(`Sent to +973 •••• ••${run.sara.local.slice(-2)}.`);
  const code1 = await waitForCode('sms', run.sara.e164, first.since);

  // A wrong code says how many tries are left.
  await dialog.getByLabel('6-digit code').fill(code1 === '000000' ? '111111' : '000000');
  await expect(dialog).toContainText("That code isn't right. 4 tries left.");

  // Resend after the countdown: a new code, and the first one stops working.
  const resend = dialog.getByRole('button', { name: 'Resend code', exact: true });
  await expect(resend).toBeEnabled({ timeout: 45_000 });
  const since2 = Date.now();
  const [resp2] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/otp')), resend.click()]);
  const second = { challengeId: (await resp2.json()).challengeId as string };
  await expect(dialog).toContainText('We sent you a new code.');
  const code2 = await waitForCode('sms', run.sara.e164, since2);
  const retired = await api<{ error: { code: string } }>(page, 'POST', '/api/v1/auth/otp/verify', { challengeId: first.challengeId, code: code1 });
  expect(retired.status).toBe(410);
  expect(retired.body.error.code).toBe('code_expired');

  // The right code: a new account, so the profile step.
  await dialog.getByLabel('6-digit code').fill(code2);
  await expect(dialog).toContainText('Set up your profile');
  await expect(dialog.getByRole('group', { name: 'Your cohort' }).getByLabel('Year 2')).toBeChecked(); // the year chosen on the first visit
  // A used code can't be used again.
  const reused = await api<{ error: { code: string } }>(page, 'POST', '/api/v1/auth/otp/verify', { challengeId: second.challengeId, code: code2 });
  expect(reused.status).toBe(410);

  await dialog.getByLabel('Display name').fill('S');
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(dialog).toContainText('Enter your name (at least 2 characters).');
  await dialog.getByLabel('Display name').fill(run.sara.name);
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Welcome to DSBA Hub, Sara')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Sara/ })).toBeVisible();

  const me = await api<{ phone: string; year: number; displayName: string; role: string }>(page, 'GET', '/api/v1/me');
  expect(me.body).toMatchObject({ phone: run.sara.e164, year: 2, displayName: run.sara.name, role: 'student' });
  await ctx.storageState({ path: statePath('sara') });
  await ctx.close();
});

setup('Sara signs out and back in: grades are cleared, guest lesson progress is added to her account', async ({ browser }) => {
  const run = readRun();
  const ctx = await browser.newContext({ baseURL: env.baseURL, storageState: statePath('sara') });
  await prepareContext(ctx);
  const page = await ctx.newPage();

  // Grades stay in this browser across a reload...
  await page.goto('/grades');
  const marks = page.locator('[data-hub="grades-inputs"] input[inputmode="decimal"]');
  for (const [i, m] of ['68', '74', '61', '72'].entries()) await marks.nth(i).fill(m);
  await page.reload();
  await expect(marks.nth(3)).toHaveValue('72');

  // ...and signing out clears them.
  await page.getByRole('button', { name: /Open the account menu/ }).first().click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible();
  expect((await page.request.get('/api/v1/me')).status()).toBe(401);
  await page.goto('/grades');
  await expect(marks.nth(3)).toHaveValue('');

  // As a guest she marks two ST2133 lessons as watched.
  const mod = '/modules/advanced-stats-distribution?tab=lessons&chapter=0';
  for (const v of [0, 1]) {
    await page.goto(`${mod}&video=${v}`);
    const watched = page.locator('[data-hub="lesson-watched"]');
    await watched.click();
    await expect(watched).toHaveAttribute('aria-pressed', 'true');
  }
  await page.reload();
  await expect(page.locator('[data-hub="lesson-list"]')).toContainText(/2 of \d+ lessons watched/);

  // Sign back in, this time typing the number in international format.
  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email or phone number').fill(`+973 ${run.sara.local}`);
  const { since } = await sendCode(page);
  await dialog.getByLabel('6-digit code').fill(await waitForCode('sms', run.sara.e164, since));
  await expect(page.getByText(`Signed in as ${run.sara.name}`)).toBeVisible();

  const prompt = page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' });
  await expect(prompt).toContainText('someone marked 2 lessons as watched on this computer');
  await prompt.getByRole('button', { name: 'Add to my account' }).click();
  await expect(page.getByText('Lesson progress added')).toBeVisible();
  const progress = await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress');
  expect(Object.keys(progress.body.watched).sort()).toEqual(['advanced-stats-distribution:0:0', 'advanced-stats-distribution:0:1']);

  // Home picks up where she left off; clearing the module's progress offers an undo.
  await page.goto('/');
  await expect(page.locator('[data-hub="continue-learning"]')).toContainText('ST2133');
  await page.goto('/modules/advanced-stats-distribution?tab=lessons');
  await page.getByRole('button', { name: 'Lesson options' }).click();
  await page.getByRole('menuitem', { name: 'Clear my progress in this module' }).click();
  await expect(page.getByText('Progress cleared for ST2133')).toBeVisible();
  await expect
    .poll(async () => Object.keys((await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress')).body.watched).length)
    .toBe(0);

  await ctx.storageState({ path: statePath('sara') });
  await ctx.close();
});

setup('Sara adds an email address to her phone account', async ({ browser }) => {
  const run = readRun();
  const ctx = await browser.newContext({ baseURL: env.baseURL, storageState: statePath('sara') });
  await prepareContext(ctx);
  const page = await ctx.newPage();
  await page.goto('/account');
  await page.getByRole('button', { name: 'Add email' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('New email address').fill(run.sara.email);
  const since = Date.now();
  await dialog.getByRole('button', { name: /Send code/ }).click();
  await dialog.getByLabel('6-digit code').fill(await waitForCode('email', run.sara.email, since));
  await expect(page.getByText('Email address added')).toBeVisible();
  const me = await api<{ email: string; phone: string }>(page, 'GET', '/api/v1/me');
  expect(me.body).toMatchObject({ email: run.sara.email, phone: run.sara.e164 });
  await ctx.storageState({ path: statePath('sara') });
  await ctx.close();
});

setup('Ali signs up with his email on a phone-sized screen', async ({ browser }) => {
  const run = readRun();
  const ctx = await browser.newContext({ baseURL: env.baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await prepareContext(ctx, { year: null });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('[data-hub="onboarding-y1"]').click();
  await page.getByRole('button', { name: 'Skip the tour' }).click();

  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email or phone number').fill('ali@');
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await expect(dialog).toContainText('That email address doesn’t look right.');
  await dialog.getByLabel('Email or phone number').fill(run.ali.email);
  const { since } = await sendCode(page);
  await expect(dialog).toContainText('Check your email');
  await dialog.getByLabel('6-digit code').fill(await waitForCode('email', run.ali.email, since));
  await expect(dialog).toContainText('Set up your profile');
  await expect(dialog.getByRole('group', { name: 'Your cohort' }).getByLabel('Year 1')).toBeChecked();
  await dialog.getByLabel('Display name').fill(run.ali.name);
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Welcome to DSBA Hub, Ali')).toBeVisible();
  const me = await api<{ email: string; year: number }>(page, 'GET', '/api/v1/me');
  expect(me.body).toMatchObject({ email: run.ali.email, year: 1 });
  await ctx.storageState({ path: statePath('ali') });
  await ctx.close();
});

setup('the student rep and the admin sign in (dev-login)', async ({ browser }) => {
  const run = readRun();
  for (const who of ['rep', 'admin'] as const) {
    const p = run[who];
    const token = await devLogin(p.email, { name: p.name, year: 3, role: who === 'rep' ? 'moderator' : 'admin' });
    const ctx = await browser.newContext({ baseURL: env.baseURL });
    await ctx.addCookies([{ name: 'dsba_session', value: token, domain: env.host, path: '/' }]);
    const page = await ctx.newPage();
    const me = await api<{ role: string; status: string }>(page, 'GET', '/api/v1/me');
    expect(me.body).toMatchObject({ role: who === 'rep' ? 'moderator' : 'admin', status: 'active' });
    await ctx.storageState({ path: statePath(who) });
    await ctx.close();
  }
});
