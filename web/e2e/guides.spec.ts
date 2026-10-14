// The guides and the installed app: Start here keeps its ticks in the browser, the electives guide compares the
// electives from Career Navigator's data, and the app manifest is served.
import { expect, test } from './fixtures';

test('Start here ticks a step and keeps it after a reload', async ({ guest }) => {
  await guest.goto('/start-here');
  await expect(guest.getByRole('heading', { level: 1, name: 'Start here' })).toBeVisible();
  const step = guest.getByRole('checkbox', { name: 'Get your University of London login' });
  await step.check();
  await expect(guest.getByText(/^1 of \d+ done$/)).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole('checkbox', { name: 'Get your University of London login' })).toBeChecked();
});

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
