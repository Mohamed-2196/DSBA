// The guides and the installed app: Results day keeps its ticks in the browser, the projected class
// reads the calculator's marks without sending them, the electives guide compares the electives from Career
// Navigator's data, and the app manifest is served.
import { expect, test } from './fixtures';

test('the electives guide lists the electives with the roles they lead to', async ({ guest }) => {
  await guest.goto('/career');
  await guest.getByRole('link', { name: 'Compare electives' }).click();
  await expect(guest.getByRole('heading', { level: 1, name: 'Choosing your Year 3 electives' })).toBeVisible();
  const cards = guest.locator('[data-hub="elective"]');
  await expect(cards).toHaveCount(4);
  const pricing = guest.locator('[data-hub="elective"][data-module-id="asset-pricing"]');
  await pricing.getByRole('link', { name: 'Risk analyst' }).click();
  await expect(guest).toHaveURL(/\/career\?role=risk-analyst/);
});

test('the app manifest names the hub and starts at Home', async ({ guest }) => {
  const res = await guest.request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { name: string; start_url: string; icons: unknown[] };
  expect(manifest.name).toBe('DSBA Hub');
  expect(manifest.start_url).toBe('/?source=app');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
});

test('Results day ticks a step and reads the calculator’s marks from this browser', async ({ guest }) => {
  await guest.goto('/grades?example=resit');
  await expect(guest).toHaveURL(/\/grades$/);
  await guest.goto('/results-day');
  await expect(guest.getByRole('heading', { level: 1, name: 'Results day' })).toBeVisible();
  await guest.getByRole('checkbox', { name: 'Read your results on the UoL portal' }).check();
  await expect(guest.getByText(/^1 of \d+ done$/)).toBeVisible();
  const projected = guest.locator('[data-hub="projected-class"]');
  await expect(projected).toHaveAttribute('data-state', 'fail');
  await expect(projected).toContainText('1 mark is under 40');
  await expect(projected.getByRole('link', { name: /Programme regulations/ })).toBeVisible();
});

test('Career Navigator’s further study card shows the class your marks point to', async ({ guest }) => {
  await guest.goto('/career');
  await expect(guest.locator('[data-hub="projected-class"]')).toHaveAttribute('data-state', 'empty');
  await guest.goto('/grades?example=partial');
  await expect(guest).toHaveURL(/\/grades$/);
  await guest.goto('/career');
  const projected = guest.locator('[data-hub="projected-class"]');
  await expect(projected).toHaveAttribute('data-state', 'partial');
  await expect(projected).toContainText('On your marks so far');
  await expect(projected).toContainText('It isn’t your official result');
});
