// A student's own calendar: adding, editing and deleting their own events (private to them), hiding a programme
// date and showing it again, their own events on Home, and the private feed (the shared feed stays programme-only).
import { expect, test } from './fixtures';
import { api } from './support';

test.describe.configure({ mode: 'serial' });

const inDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date(Date.now() + n * 86_400_000));

interface Own {
  id: string;
  title: string;
}

test('a student adds their own weekly event, sees it on the calendar and Home, edits it, and deletes it', async ({
  sara,
  ali,
}) => {
  const title = `Study group ${Date.now().toString(36)}`;
  await sara.goto('/calendar');
  await sara.locator('[data-hub="calendar-mine-add"]').click();
  const form = sara.getByRole('dialog');
  await form.getByLabel('Title').fill(title);
  await form.getByLabel('Day').fill(inDays(1));
  await form.getByLabel('Starts').fill('18:00');
  await form.getByLabel('Ends').fill('19:30');
  await form.getByLabel('Repeat').selectOption('weekly');
  await form.getByLabel('Place').fill('Library, room 2');
  await form.getByLabel('Reminder').selectOption('30');
  await form.getByText('Teal').click();
  await form.locator('[data-hub="calendar-mine-save"]').click();
  await expect(sara.getByText('Added to your calendar')).toBeVisible();

  // the drawer opens on it: theirs, with its repeat and reminder
  const drawer = sara.getByRole('dialog');
  await expect(drawer.getByText('Your event')).toBeVisible();
  await expect(drawer.getByText('18:00–19:30, Library, room 2')).toBeVisible();
  await expect(drawer.getByText(/Every week for a year/)).toBeVisible();
  await expect(drawer.getByText('30 minutes before')).toBeVisible();
  await sara.keyboard.press('Escape');

  // the "Yours" filter shows only their events
  await sara.locator('[data-hub="calendar-filter-mine"]').click();
  await expect(sara).toHaveURL(/types=mine/);
  await expect(sara.locator('[data-hub="calendar-list"] [data-hub="calendar-event"]').first()).toContainText(title);

  // Home's "Coming up" lists it
  await sara.goto('/');
  await expect(sara.locator('[data-hub="upcoming-events"]')).toContainText(title);

  const mine = await api<Own[]>(sara, 'GET', '/api/v1/calendar/mine/events');
  const own = mine.body.find((e) => e.title === title);
  expect(own).toBeTruthy();
  // nobody else sees it
  const theirs = await api<Own[]>(ali, 'GET', '/api/v1/calendar/mine/events');
  expect(theirs.body.some((e) => e.title === title)).toBe(false);
  expect((await api(ali, 'PATCH', `/api/v1/calendar/mine/events/${own?.id}`, { title: 'Mine now' })).status).toBe(404);

  // change only its first day: that day becomes an event of its own, and the repeat skips it
  await sara.goto(`/calendar?event=mine-${own?.id}`);
  await sara.locator('[data-hub="calendar-mine-edit"]').click();
  const edit = sara.getByRole('dialog', { name: 'Edit your event' });
  await expect(edit.getByRole('radio', { name: /This event/ })).toBeChecked();
  await edit.getByLabel('Starts').fill('17:00');
  await edit.locator('[data-hub="calendar-mine-save"]').click();
  await expect(sara.getByText('Changes saved')).toBeVisible();
  const split = await api<(Own & { date: string; repeat: string; skipped: string[] })[]>(
    sara,
    'GET',
    '/api/v1/calendar/mine/events',
  );
  const series = split.body.find((e) => e.id === own?.id);
  const single = split.body.find((e) => e.title === title && e.id !== own?.id);
  expect(series?.skipped).toEqual([inDays(1)]);
  expect(single?.repeat).toBe('none');
  expect(single?.date).toBe(inDays(1));
  expect((await api(sara, 'DELETE', `/api/v1/calendar/mine/events/${single?.id}`)).status).toBe(204);

  // then all of it: a new title for every repeat, and the whole repeat deleted
  await sara.goto(`/calendar?event=mine-${own?.id}`);
  await sara.locator('[data-hub="calendar-mine-edit"]').click();
  await edit.getByRole('radio', { name: /All events/ }).check();
  await edit.getByLabel('Title').fill(`${title} (moved)`);
  await edit.locator('[data-hub="calendar-mine-save"]').click();
  await expect(sara.getByText('Changes saved')).toBeVisible();
  await sara.locator('[data-hub="calendar-mine-delete"]').click();
  const confirm = sara.getByRole('dialog', { name: 'Delete a repeating event?' });
  await confirm.getByRole('radio', { name: /All events/ }).check();
  await confirm.getByRole('button', { name: 'Delete all events' }).click();
  await expect(sara.getByText('Event deleted')).toBeVisible();
  const after = await api<Own[]>(sara, 'GET', '/api/v1/calendar/mine/events');
  expect(after.body.some((e) => e.id === own?.id)).toBe(false);
});

test('a student hides a programme date, then shows it again from Customise', async ({ sara }) => {
  await sara.goto('/calendar?cohort=all');
  const row = sara.locator('[data-hub="calendar-list"] [data-hub="calendar-event"]').first();
  const id = await row.getAttribute('data-event-id');
  expect(id).toBeTruthy();
  await row.click();
  await sara.locator('[data-hub="calendar-hide"]').click();
  await expect(sara.getByText('Hidden from your calendar')).toBeVisible();
  await expect(sara.locator(`[data-hub="calendar-list"] [data-event-id="${id}"]`)).toHaveCount(0);

  await sara.locator('[data-hub="calendar-customise-open"]').click();
  const hidden = sara.locator('[data-hub="calendar-hidden"]');
  await expect(hidden).toBeVisible();
  await hidden.getByRole('button', { name: 'Show again' }).first().click();
  await sara.getByRole('button', { name: 'Done' }).click();
  await expect(sara.locator(`[data-hub="calendar-list"] [data-event-id="${id}"]`)).toHaveCount(1);
  const prefs = await api<{ hiddenEvents: string[] }>(sara, 'GET', '/api/v1/calendar/mine/settings');
  expect(prefs.body.hiddenEvents).not.toContain(id);
});

test('the private link holds their own events; the shared feed does not; a new link retires the old one', async ({
  sara,
  browser,
}) => {
  const title = `Dentist ${Date.now().toString(36)}`;
  const made = await api<Own>(sara, 'POST', '/api/v1/calendar/mine/events', {
    title,
    date: inDays(3),
    startTime: '10:00',
    remind: 60,
  });
  expect(made.status).toBe(201);
  await sara.goto('/calendar');
  await sara.locator('[data-hub="calendar-subscribe-open"]').click();
  const dialog = sara.getByRole('dialog', { name: 'Subscribe to the calendar' });
  await dialog.locator('[data-hub="calendar-feed-new"]').click();
  const link = await dialog.getByLabel('Your private calendar link').inputValue();
  expect(link).toMatch(/\/api\/v1\/feeds\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);

  // a calendar app has no session
  const app = await browser.newContext();
  const feed = await app.request.get(link);
  expect(feed.status()).toBe(200);
  const body = (await feed.text()).replace(/\r\n /g, '');
  expect(body).toContain(`SUMMARY:${title}`);
  expect(body).toContain('TRIGGER:-PT60M');
  const shared = await app.request.get(link.replace(/feeds\/calendar\/.*$/, 'calendar/feed.ics'));
  expect(await shared.text()).not.toContain(title);

  // both ask first: the link in use stops working
  await dialog.locator('[data-hub="calendar-feed-rotate"]').click();
  await sara.getByRole('dialog', { name: 'Make a new link?' }).getByRole('button', { name: 'Make a new link' }).click();
  await expect(dialog.getByLabel('Your private calendar link')).not.toHaveValue(link);
  expect((await app.request.get(link)).status()).toBe(404);
  await dialog.locator('[data-hub="calendar-feed-off"]').click();
  await sara.getByRole('dialog', { name: 'Turn your link off?' }).getByRole('button', { name: 'Turn it off' }).click();
  await expect(dialog.locator('[data-hub="calendar-feed-new"]')).toBeVisible();
  await app.close();
  expect((await api(sara, 'DELETE', `/api/v1/calendar/mine/events/${made.body.id}`)).status).toBe(204);
});
