// Alerts: a rep moves a Year 2 mock with "Tell Year 2" ticked and Sara (Year 2) gets a notification; the Sunday
// summary (switched off at first) shows reps this week's text on Manage, and Sara turns its email on.
import { expect, test } from './fixtures';
import { api, gotoAccount, personaContext, remember, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

const inDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date(Date.now() + n * 86_400_000));

interface Note {
  kind: string;
  title: string;
  url: string | null;
}

test('a rep moves a Year 2 mock and Year 2 is told', async ({ rep, sara, run }) => {
  const title = `Mock exam [e2e ${run.tag}]`;
  const made = await api<{ id: string }>(rep, 'POST', '/api/v1/calendar/events', {
    title,
    type: 'mock',
    date: inDays(20),
    year: 2,
    time: '12:30 PM',
  });
  expect(made.status).toBe(201);
  const id = made.body.id;
  remember('events', id);

  await rep.goto(`/calendar?event=${encodeURIComponent(id)}`);
  await rep.locator('[data-hub="calendar-edit"]').click();
  const form = rep.getByRole('dialog').filter({ has: rep.getByLabel('Title') });
  await expect(form.locator('[data-hub="calendar-tell"]')).toBeChecked();
  await expect(form.getByText('Tell Year 2')).toBeVisible();
  await form.getByLabel(/^Date/).fill(inDays(22));
  const [resp] = await Promise.all([
    rep.waitForResponse((r) => r.url().includes('/api/v1/calendar/events/') && r.request().method() === 'PATCH'),
    form.getByRole('button', { name: /Save/ }).click(),
  ]);
  expect((await resp.json()).notice).toBe('sent');
  await expect(rep.getByText(/were told|was told/)).toBeVisible();

  const notes = await api<{ items: Note[] }>(sara, 'GET', '/api/v1/notifications');
  const told = notes.body.items.find((n) => n.kind === 'date_changed' && n.title.includes(`[e2e ${run.tag}]`));
  expect(told?.title).toContain('moved to');
  expect(told?.url).toContain(`event=${id}`);
});

test('reps see the Sunday summary to paste, and a student turns its email on', async ({ admin, rep, sara }) => {
  await setSwitch(admin, 'summary', 'everyone');

  await rep.goto('/manage?tab=summary');
  const panel = rep.locator('[data-hub="sunday-summary"]');
  await expect(panel.getByRole('heading', { name: 'Sunday summary' })).toBeVisible();
  await panel.getByRole('radio', { name: 'Year 2' }).click();
  await expect(panel.getByLabel('The summary for Year 2')).toContainText('Your week in DSBA Hub, Year 2');

  await gotoAccount(sara);
  const toggle = sara.getByRole('switch', { name: /Sunday summary/ });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect
    .poll(
      async () =>
        (await api<{ preferences: { emailWeeklySummary: boolean } }>(sara, 'GET', '/api/v1/me')).body.preferences
          .emailWeeklySummary,
    )
    .toBe(true);
  await toggle.click(); // back off: the summary is opt-in
});

test.afterAll(async ({ browser }) => {
  // Switched back off for the rest of the run: the summary arrives off.
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'summary', 'off');
  await ctx.close();
});
