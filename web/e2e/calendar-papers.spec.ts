// Your papers and dates: Sara (Year 2) picks Econometrics as her option on Home and the
// calendar leaves out Information Systems' dates; an exam shows its length, rules and source; a careers date shows
// on its employer's card in Career Navigator.
import { expect, test } from './fixtures';
import { api, remember } from './support';

test.describe.configure({ mode: 'serial' });

const inDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date(Date.now() + n * 86_400_000));

test('a Year 2 student picks her option and the calendar follows it', async ({ rep, sara, run }) => {
  const tag = `[e2e ${run.tag}]`;
  const is = await api<{ id: string }>(rep, 'POST', '/api/v1/calendar/events', {
    title: `IS mock ${tag}`,
    type: 'mock',
    date: inDays(3),
    moduleId: 'information-systems',
  });
  const em = await api<{ id: string }>(rep, 'POST', '/api/v1/calendar/events', {
    title: `Econometrics exam ${tag}`,
    type: 'exam',
    date: inDays(4),
    moduleId: 'econometrics',
    duration: '3 hours',
    rules: 'Bring your student ID.',
    source: 'UoL exam timetable',
    checkedOn: inDays(0),
  });
  expect([is.status, em.status]).toEqual([201, 201]);
  remember('events', is.body.id);
  remember('events', em.body.id);

  await sara.goto('/calendar');
  await expect(sara.getByText(`IS mock ${tag}`).first()).toBeVisible();
  // She picks her option from Home's "My modules".
  await sara.goto('/');
  await sara.locator('[data-hub="papers-open"]').first().click();
  const dialog = sara.locator('[data-hub="papers-dialog"]');
  await dialog
    .getByLabel(/Econometrics/)
    .first()
    .check();
  await sara.locator('[data-hub="papers-save"]').click();
  await expect
    .poll(async () => (await api<{ papers: string[] }>(sara, 'GET', '/api/v1/me')).body.papers)
    .toEqual(['econometrics']);
  await sara.goto('/calendar');
  await expect(sara.getByText(`Econometrics exam ${tag}`).first()).toBeVisible();
  await expect(sara.getByText(`IS mock ${tag}`)).toHaveCount(0);

  await sara.goto(`/calendar?event=${encodeURIComponent(em.body.id)}`);
  const drawer = sara.getByRole('dialog');
  await expect(drawer.getByText('3 hours')).toBeVisible();
  await expect(drawer.getByText('Bring your student ID.')).toBeVisible();
  await expect(drawer.getByText(/Source: UoL exam timetable/)).toBeVisible();

  await api(sara, 'PATCH', '/api/v1/me', { papers: [] }); // back to every Year 2 module
});

test('a careers date shows on its employer’s card', async ({ rep, sara, run }) => {
  const made = await api<{ id: string }>(rep, 'POST', '/api/v1/calendar/events', {
    title: `NBB EVOLVE applications [e2e ${run.tag}]`,
    type: 'careers',
    date: inDays(-1),
    endDate: inDays(10),
    employerId: 'nbb',
    source: 'https://nbbonline.com/about/careers/',
  });
  expect(made.status).toBe(201);
  remember('events', made.body.id);
  await sara.goto('/career?all=1');
  const card = sara.locator('[data-employer-id="nbb"]');
  await expect(card.locator('[data-hub="career-application-date"]')).toContainText('Closes');
});
