// Signing up and signing in with an email address and a password. Runs first (project "setup") and leaves a session
// per persona for the specs. Sara: a weak password refused, sign-up, profile; grades and lesson progress across
// signing out and back in (a wrong password first). Ali: sign-up on a phone-sized screen; his address is then marked
// confirmed, as continuing with Google once would (the admin spec gives him a role). Rep and admin: dev-login.
import { test as setup, expect, type Locator } from '@playwright/test';
import { api, confirmEmail, devLogin, env, newRun, prepareContext, readRun, statePath } from './support';

setup.describe.configure({ mode: 'serial' });

/** The profile step's question about notification emails, which has no answer chosen in advance: yes (the specs
 * expect a student's emails on). */
async function answerEmails(dialog: Locator): Promise<void> {
  const question = dialog.getByRole('group', { name: 'Email me about replies and date changes' });
  await expect(question.getByRole('radio', { checked: true })).toHaveCount(0);
  await question.getByText('Yes, email me', { exact: true }).click();
  await expect(question.getByLabel('Yes, email me')).toBeChecked();
}

setup(
  'Sara signs up with her email address and a password: a weak one first, then her profile',
  async ({ browser }) => {
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
    await dialog.getByRole('button', { name: 'New here? Create an account' }).click();
    await expect(dialog).toContainText('Create your account');
    await dialog.getByLabel('Email address').fill(run.sara.email);
    await dialog.getByLabel('Password', { exact: true }).fill('short');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog).toContainText('Use at least 10 characters.');
    await dialog.getByLabel('Password', { exact: true }).fill('password123');
    await dialog.getByRole('button', { name: 'Create account' }).click();
    await expect(dialog).toContainText('This is one of the most common passwords.');
    await dialog.getByLabel('Password', { exact: true }).fill(run.sara.password);
    await dialog.getByRole('button', { name: 'Create account' }).click();

    // A new account, so the profile step.
    await expect(dialog).toContainText('Set up your profile');
    await expect(dialog.getByRole('group', { name: 'Your cohort' }).getByLabel('Year 2')).toBeChecked(); // the year chosen on the first visit
    await dialog.getByLabel('Display name').fill('S');
    await dialog.getByRole('button', { name: 'Save and continue' }).click();
    await expect(dialog).toContainText('Enter your name (at least 2 characters).');
    await expect(dialog).toContainText('Choose yes or no.'); // the question about emails needs an answer too
    await dialog.getByLabel('Display name').fill(run.sara.name);
    await answerEmails(dialog);
    await dialog.getByRole('button', { name: 'Save and continue' }).click();
    await expect(page.getByText('Welcome to DSBA Hub, Sara')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Sara/ })).toBeVisible();

    const me = await api<{
      email: string;
      emailConfirmed: boolean;
      hasPassword: boolean;
      year: number;
      displayName: string;
      roles: { slug: string }[];
      preferences: { notificationEmails: boolean | null };
    }>(page, 'GET', '/api/v1/me');
    expect(me.body).toMatchObject({
      email: run.sara.email,
      emailConfirmed: false,
      hasPassword: true,
      year: 2,
      displayName: run.sara.name,
    });
    expect(me.body.preferences.notificationEmails).toBe(true);
    expect(me.body.roles.map((r) => r.slug)).toEqual(['student']);
    await ctx.storageState({ path: statePath('sara') });
    await ctx.close();
  },
);

setup(
  'Sara signs out and back in: grades are cleared, guest lesson progress is added to her account',
  async ({ browser }) => {
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
    await page
      .getByRole('button', { name: /Open the account menu/ })
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true }).first()).toBeVisible();
    expect((await page.request.get('/api/v1/me')).status()).toBe(401);
    await page.goto('/grades');
    await expect(marks.nth(3)).toHaveValue('');

    // As a guest she marks two ST2133 lessons as watched.
    const lessons = ['ik3fr6mt', 'crvr85s7']; // chapter 1's first two lessons (app/seed/data/modules.json)
    for (const [i, lesson] of lessons.entries()) {
      await page.goto(`/modules/advanced-stats-distribution/lessons/${lesson}`);
      // Lesson progress is opt in: the first lesson offers it once.
      if (i === 0) await page.locator('[data-hub="progress-offer"]').getByRole('button', { name: 'Turn on' }).click();
      const watched = page.locator('[data-hub="lesson-watched"]');
      await watched.click();
      await expect(watched).toHaveAttribute('aria-pressed', 'true');
    }
    await page.reload();
    await expect(page.locator('[data-hub="lesson-list"]')).toContainText(/2 of \d+ lessons watched/);

    // Sign back in: a wrong password first, answered as an unknown address would be.
    await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Email address').fill(run.sara.email);
    await dialog.getByLabel('Password', { exact: true }).fill('not her password at all');
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog).toContainText('This email address and password don’t match.');
    await dialog.getByLabel('Password', { exact: true }).fill(run.sara.password);
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText(`Signed in as ${run.sara.name}`)).toBeVisible();

    const prompt = page.getByRole('dialog').filter({ hasText: 'Is this lesson progress yours?' });
    await expect(prompt).toContainText('someone marked 2 lessons as watched on this computer');
    await prompt.getByRole('button', { name: 'Add to my account' }).click();
    await expect(page.getByText('Lesson progress added')).toBeVisible();
    const progress = await api<{ watched: Record<string, { moduleId: string }> }>(page, 'GET', '/api/v1/me/progress');
    expect(Object.keys(progress.body.watched).sort()).toEqual([...lessons].sort());

    // Home picks up where she left off; clearing the module's progress offers an undo.
    await page.goto('/');
    await expect(page.locator('[data-hub="continue-learning"]')).toContainText('ST2133');
    await page.goto('/modules/advanced-stats-distribution?tab=lessons');
    await page.getByRole('button', { name: 'Lesson options' }).click();
    await page.getByRole('menuitem', { name: 'Clear my progress in this module' }).click();
    await expect(page.getByText('Progress cleared for ST2133')).toBeVisible();
    await expect
      .poll(
        async () =>
          Object.keys((await api<{ watched: Record<string, string> }>(page, 'GET', '/api/v1/me/progress')).body.watched)
            .length,
      )
      .toBe(0);

    await ctx.storageState({ path: statePath('sara') });
    await ctx.close();
  },
);

setup('Ali signs up with his email on a phone-sized screen', async ({ browser }) => {
  const run = readRun();
  const ctx = await browser.newContext({
    baseURL: env.baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await prepareContext(ctx, { year: null });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.locator('[data-hub="onboarding-y1"]').click();
  await page.getByRole('button', { name: 'Skip the tour' }).click();

  await page.getByRole('button', { name: 'Sign in', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'New here? Create an account' }).click();
  await dialog.getByLabel('Email address').fill('ali@');
  await dialog.getByLabel('Password', { exact: true }).fill(run.ali.password);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toContainText('That email address doesn’t look right.');
  await dialog.getByLabel('Email address').fill(run.ali.email);
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog).toContainText('Set up your profile');
  await expect(dialog.getByRole('group', { name: 'Your cohort' }).getByLabel('Year 1')).toBeChecked();
  await dialog.getByLabel('Display name').fill(run.ali.name);
  await answerEmails(dialog);
  await dialog.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByText('Welcome to DSBA Hub, Ali')).toBeVisible();
  const me = await api<{ email: string; year: number }>(page, 'GET', '/api/v1/me');
  expect(me.body).toMatchObject({ email: run.ali.email, year: 1 });
  // As if he had continued with Google once: the admin spec gives him a role, which needs a confirmed address.
  await confirmEmail(run.ali.email);
  await ctx.storageState({ path: statePath('ali') });
  await ctx.close();
});

setup('the student rep and the admin sign in (dev-login)', async ({ browser }) => {
  const run = readRun();
  for (const who of ['rep', 'admin'] as const) {
    const p = run[who];
    const token = await devLogin(p.email, { name: p.name, year: 3, role: who === 'rep' ? 'rep' : 'admin' });
    const ctx = await browser.newContext({ baseURL: env.baseURL });
    await ctx.addCookies([{ name: 'dsba_session', value: token, domain: env.host, path: '/' }]);
    const page = await ctx.newPage();
    const me = await api<{ roles: { slug: string }[]; status: string }>(page, 'GET', '/api/v1/me');
    expect(me.body).toMatchObject({
      status: 'active',
      roles: expect.arrayContaining([expect.objectContaining({ slug: who === 'rep' ? 'rep' : 'admin' })]),
    });
    await ctx.storageState({ path: statePath(who) });
    await ctx.close();
  }
});
