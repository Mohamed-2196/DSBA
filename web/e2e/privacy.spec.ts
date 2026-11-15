// /privacy follows GET /privacy: a service's lines show only while it handles students' data, and all of them show
// when that can't be read (COM-280 I4, I5). The answers are stubbed, so the dev stack's own switches don't matter.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const flags = (page: Page, body: object | null) =>
  page.route('**/api/v1/privacy', (route) =>
    body ? route.fulfill({ json: body }) : route.fulfill({ status: 503, json: { code: 'unavailable' } }),
  );

test('names Anthropic and Mini Noora’s counts only while her answers are on', async ({ guest }) => {
  await flags(guest, { nooraAnswers: false, forumCheck: false, aiApps: false });
  await guest.goto('/privacy');
  await expect(guest.getByRole('heading', { level: 1, name: 'Privacy notice' })).toBeVisible();
  await expect(guest.getByText('Railway, Google, Apple, Mozilla and Microsoft are US companies')).toBeVisible();
  await expect(guest.getByText('How many questions you asked Mini Noora each day')).toHaveCount(0);
  await expect(guest.getByText('Mini Noora’s daily question counts stay')).toHaveCount(0);

  await guest.unrouteAll();
  await flags(guest, { nooraAnswers: true, forumCheck: false, aiApps: false });
  await guest.reload();
  await expect(
    guest.getByText('Railway, Google, Apple, Mozilla, Microsoft and Anthropic are US companies'),
  ).toBeVisible();
  await expect(guest.getByText('How many questions you asked Mini Noora each day')).toBeVisible();
  await expect(guest.getByText(/Mini Noora’s daily question counts stay, without your name/)).toBeVisible();
  await expect(guest.getByText(/your year, the page you’re on/)).toBeVisible();
});

test('shows every service when the answer can’t be read', async ({ guest }) => {
  await flags(guest, null);
  await guest.goto('/privacy');
  // a 503 is retried twice before the page gives up on it
  await expect(guest.getByText(/your year, the page you’re on/)).toBeVisible({ timeout: 15_000 });
  await expect(guest.getByText(/checks forum posts and pictures against the forum rules/)).toBeVisible();
  await expect(guest.getByText(/if you connect one, the Hub gives it/)).toBeVisible();
});
