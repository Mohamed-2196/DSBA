// Home's blocks: a sensible default, and Customise Home to hide, show and move them (saved to the account, or to
// the browser for a guest). Lesson progress is off until turned on, so Continue waits for it.
import { expect, test } from './fixtures';
import { api } from './support';

test('a student hides and moves Home blocks, and it is saved to the account', async ({ ali }) => {
  await api(ali, 'PATCH', '/api/v1/me', { preferences: { homeBlocks: null } });
  await ali.goto('/');
  const blocks = ali.locator('.home-blocks [data-block]');
  await expect(ali.locator('.home-blocks [data-block="coming_up"]')).toBeVisible();
  await expect(ali.locator('.home-blocks [data-block="continue"]')).toHaveCount(0); // lesson progress is off

  await ali.locator('[data-hub="home-customize-open"]').click();
  const dialog = ali.getByRole('dialog', { name: 'Customise Home' });
  const comingUp = dialog.getByRole('switch', { name: 'Coming up' });
  await comingUp.click(); // the account's preferences change a tick after the click (optimistic update)
  await expect(comingUp).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Move My modules up' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(ali.locator('.home-blocks [data-block="coming_up"]')).toHaveCount(0);

  await expect
    .poll(async () => (await api<{ preferences: { homeBlocks: string[] | null } }>(ali, 'GET', '/api/v1/me')).body.preferences.homeBlocks)
    .not.toContain('coming_up');
  await ali.reload();
  await expect(ali.locator('.home-blocks [data-block="coming_up"]')).toHaveCount(0);
  const saved = (await api<{ preferences: { homeBlocks: string[] } }>(ali, 'GET', '/api/v1/me')).body.preferences.homeBlocks;
  expect(saved.indexOf('modules')).toBeLessThan(saved.indexOf('continue'));
  await expect(blocks.first()).toBeVisible();

  await ali.locator('[data-hub="home-customize-open"]').click();
  await ali.getByRole('dialog', { name: 'Customise Home' }).getByRole('button', { name: 'Reset to default' }).click();
  await ali.getByRole('dialog', { name: 'Customise Home' }).getByRole('button', { name: 'Done' }).click();
  await expect(ali.locator('.home-blocks [data-block="coming_up"]')).toBeVisible();
});

test('a guest’s Home layout stays in the browser', async ({ guest }) => {
  await guest.goto('/');
  await expect(guest.locator('.home-blocks [data-block="todo"]')).toHaveCount(0); // the board needs an account
  await guest.locator('[data-hub="home-customize-open"]').click();
  await guest.getByRole('dialog', { name: 'Customise Home' }).getByRole('switch', { name: 'My modules', exact: true }).uncheck();
  await guest.getByRole('dialog', { name: 'Customise Home' }).getByRole('button', { name: 'Done' }).click();
  await guest.reload();
  await expect(guest.locator('.home-blocks [data-block="modules"]')).toHaveCount(0);
  expect(await guest.evaluate(() => window.localStorage.getItem('hub.homeBlocks'))).not.toContain('modules');
});
