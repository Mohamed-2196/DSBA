// With reduced motion on, a menu opened from the keyboard takes focus, as it does with motion on: the bell's
// popover and the account menu.
import { expect, test } from './fixtures';

test('with reduced motion, Enter on the bell and on the account button moves focus into the panel', async ({
  sara,
}) => {
  await sara.emulateMedia({ reducedMotion: 'reduce' });
  await sara.goto('/');
  for (const name of [/^Notifications/, /account menu/i]) {
    const trigger = sara.getByRole('button', { name }).first();
    await trigger.focus();
    await sara.keyboard.press('Enter');
    await expect
      .poll(() => sara.evaluate(() => !!document.activeElement?.closest('.ui-menu')), { timeout: 2000 })
      .toBe(true);
    await sara.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});
