// The study board (R-4): it arrives switched off. With it on, a student adds a card, moves it with the card's menu,
// adds an exam from the calendar, and finds it on the board. The switch goes back off afterwards.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

test('the board is off for students until an admin switches it on', async ({ sara, admin }) => {
  await setSwitch(admin, 'board', 'off');
  await sara.goto('/board');
  await expect(sara.getByText('This part of the hub is switched off right now.')).toBeVisible();
  await setSwitch(admin, 'board', 'everyone');
});

test('a student adds a card, moves it, and adds an exam from the calendar', async ({ sara }) => {
  const title = `E2E card ${Date.now()}`;
  await sara.goto('/board');
  await expect(sara.getByRole('heading', { name: 'Study board', level: 1 })).toBeVisible();
  await sara.locator('[data-hub="board-new"]').click();
  await sara.getByLabel('Title').fill(title);
  await sara.locator('[data-hub="board-save"]').click();
  const card = sara.getByRole('article', { name: title });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: `Actions for “${title}”` }).click();
  await sara.getByRole('menuitem', { name: 'Move to Done' }).click();
  const columnOf = async () => (await api<{ cards: { title: string; column: string }[] }>(sara, 'GET', '/api/v1/board')).body.cards.find((c) => c.title === title)?.column;
  await expect.poll(columnOf).toBe('done');

  await sara.goto('/calendar?cohort=all&types=exam');
  // The week at the top lists every type, so pick an exam's row.
  await sara.locator('[data-hub="calendar-event"].cal-tone--exam').first().click();
  const drawer = sara.getByRole('dialog');
  const add = drawer.locator('[data-hub="board-add"], [data-hub="board-on"]');
  await expect(add).toBeVisible();
  if ((await add.getAttribute('data-hub')) === 'board-add') await add.click();
  await expect(drawer.locator('[data-hub="board-on"]')).toBeVisible();
  await drawer.locator('[data-hub="board-on"]').click();
  await expect(sara).toHaveURL(/\/board$/);
  await expect(sara.getByRole('link', { name: 'Open in the calendar' }).first()).toBeVisible();
});

test.afterAll(async ({ browser }) => {
  // Switched back off for the rest of the run: the board arrives off.
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'board', 'off');
  await ctx.close();
});
