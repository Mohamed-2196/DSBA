// The calendar: views, the subscribe link (a valid iCalendar feed), and a rep adding, editing and deleting a date.
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, remember } from './support';

test.describe.configure({ mode: 'serial' });

/** The problems with an iCalendar body (RFC 5545 basics), or [] when it is fine. */
function icsProblems(body: string): string[] {
  const problems: string[] = [];
  if (!body.startsWith('BEGIN:VCALENDAR\r\n')) problems.push('does not start with BEGIN:VCALENDAR and CRLF');
  if (!/END:VCALENDAR\r\n?$/.test(body)) problems.push('does not end with END:VCALENDAR');
  for (const key of ['VERSION:2.0', 'PRODID:']) if (!body.includes(key)) problems.push(`no ${key}`);
  const long = body.split('\r\n').filter((l) => Buffer.byteLength(l, 'utf8') > 75);
  if (long.length) problems.push(`${long.length} lines longer than 75 octets`);
  const events = body.split('BEGIN:VEVENT').slice(1);
  if (!events.length) problems.push('no events');
  for (const e of events) for (const key of ['UID:', 'DTSTAMP:', 'DTSTART', 'SUMMARY:', 'END:VEVENT']) if (!e.includes(key)) problems.push(`an event without ${key}`);
  const uids = events.map((e) => /UID:(.*)/.exec(e)?.[1]);
  if (new Set(uids).size !== uids.length) problems.push('duplicate UIDs');
  return [...new Set(problems)];
}

const inDays = (n: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date(Date.now() + n * 86_400_000));

test('a student browses the calendar and subscribes: the feed is a valid calendar', async ({ sara }) => {
  await sara.goto('/calendar');
  await expect(sara.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();
  const title = sara.locator('#cal-month-title');
  const first = await title.innerText();
  await sara.getByRole('button', { name: /^Next month/ }).click();
  await expect(title).not.toHaveText(first);
  await sara.getByRole('button', { name: /^Previous month/ }).click();
  await expect(title).toHaveText(first);
  await sara.getByRole('radio', { name: 'All years' }).click();
  await expect(sara).toHaveURL(/cohort=all/);
  await sara.locator('[data-hub="calendar-event"]').first().click();
  await expect(sara.getByRole('dialog')).toBeVisible();
  await expect(sara.locator('[data-hub="calendar-edit"]')).toHaveCount(0); // students can't edit
  await sara.keyboard.press('Escape');

  await sara.locator('[data-hub="calendar-subscribe-open"]').click();
  const dialog = sara.getByRole('dialog');
  const link = await dialog.getByLabel('Calendar link').inputValue();
  expect(link).toMatch(/\/api\/v1\/calendar\/feed\.ics(\?year=\d)?$/);
  const feed = await sara.request.get(link);
  expect(feed.status()).toBe(200);
  expect(feed.headers()['content-type']).toContain('text/calendar');
  expect(icsProblems(await feed.text())).toEqual([]);

  const [download] = await Promise.all([sara.waitForEvent('download'), dialog.getByRole('link', { name: /Download once/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  expect(icsProblems(fs.readFileSync(await download.path(), 'utf8'))).toEqual([]);
});

async function addEvent(rep: Page, fields: { title: string; date: string; cohort?: string; module?: string; time: string; place: string }): Promise<string> {
  await rep.goto('/calendar');
  await rep.locator('[data-hub="calendar-add"]').first().click();
  const dialog = rep.getByRole('dialog');
  await dialog.getByLabel('Title').fill(fields.title);
  await dialog.getByLabel('Type').selectOption('revision');
  if (fields.cohort) await dialog.getByLabel('Cohort').selectOption(fields.cohort);
  await dialog.getByLabel(/^Date/).fill(fields.date);
  if (fields.module) await dialog.getByLabel('Module').selectOption(fields.module);
  await dialog.getByLabel('Time').fill(fields.time);
  await dialog.getByLabel('Place').fill(fields.place);
  const [resp] = await Promise.all([
    rep.waitForResponse((r) => r.url().endsWith('/api/v1/calendar/events') && r.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Add event' }).click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  const id = (await resp.json()).id as string;
  remember('events', id);
  await rep.keyboard.press('Escape'); // the new event's drawer opens
  return id;
}

test('a rep adds, edits and deletes an event; students see each change', async ({ rep, sara, run }) => {
  const title = `ST2133 peer revision: MGFs [e2e ${run.tag}]`;
  const date = inDays(12);
  const id = await addEvent(rep, { title, date, cohort: '2', module: 'advanced-stats-distribution', time: '4:00 PM', place: 'BIBF, Room 204' });

  await sara.goto(`/calendar?event=${encodeURIComponent(id)}`);
  await expect(sara.getByRole('dialog')).toContainText(title);
  await expect(sara.getByRole('dialog')).toContainText('4:00 PM');
  const feed = async () => (await sara.request.get('/api/v1/calendar/feed.ics?year=2')).text();
  expect(await feed()).toContain(`peer revision: MGFs [e2e ${run.tag}]`);

  await rep.goto(`/calendar?event=${encodeURIComponent(id)}`);
  await rep.locator('[data-hub="calendar-edit"]').click();
  const form = rep.getByRole('dialog').filter({ has: rep.getByLabel('Title') });
  await form.getByLabel('Time').fill('5:30 PM');
  await form.getByRole('button', { name: /Save/ }).click();
  await expect(form).toHaveCount(0);
  await sara.goto(`/calendar?event=${encodeURIComponent(id)}`);
  await expect(sara.getByRole('dialog')).toContainText('5:30 PM');

  await rep.goto(`/calendar?event=${encodeURIComponent(id)}`);
  await rep.locator('[data-hub="calendar-delete"]').click();
  const confirm = rep.getByRole('dialog').filter({ hasText: 'Delete this event?' });
  await confirm.getByRole('button', { name: 'Delete event' }).click();
  await expect(confirm).toHaveCount(0);
  const left = await api<{ id: string }[]>(sara, 'GET', `/api/v1/calendar/events?from=${date}&to=${date}`);
  expect(left.body.map((e) => e.id)).not.toContain(id);
  expect(await feed()).not.toContain(`[e2e ${run.tag}]`);
});

test('ST-2: an event for a Year 2 module added with the default cohort is a Year 2 event', async ({ rep, run }) => {
  test.fail(true, 'ST-2: the form sends year: null, so the event shows on every cohort’s calendar');
  const id = await addEvent(rep, { title: `ST2133 drop-in [e2e ${run.tag}]`, date: inDays(13), module: 'advanced-stats-distribution', time: '1:00 PM', place: 'Room 101' });
  const events = await api<{ id: string; year: number | null }[]>(rep, 'GET', `/api/v1/calendar/events?from=${inDays(13)}&to=${inDays(13)}`);
  const ev = events.body.find((e) => e.id === id);
  await api(rep, 'DELETE', `/api/v1/calendar/events/${encodeURIComponent(id)}`);
  expect(ev?.year).toBe(2);
});
