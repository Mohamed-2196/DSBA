// Revision plans and past papers on the study board. With the board on, a student plans a
// module's revision from the module page, finds the plan on the board, and removes it. The switch goes back off.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

interface Board {
  cards: { title: string; column: string; planModuleId: string | null; planDate: string | null }[];
  plans: { moduleId: string; left: number }[];
}

test('a student plans a module’s revision to the exam date and removes the plan', async ({ sara, admin }) => {
  await setSwitch(admin, 'board', 'everyone');
  await sara.goto('/modules/economics');
  await sara.locator('[data-hub="board-plan"]').click();
  const dialog = sara.getByRole('dialog');
  const exam = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
  await dialog.getByLabel('Exam date').fill(exam);
  await dialog.getByLabel('A past paper every').selectOption('3');
  await dialog.locator('[data-hub="board-plan-save"]').click();
  await expect(dialog).toBeHidden();

  const board = async () => (await api<Board>(sara, 'GET', '/api/v1/board')).body;
  await expect.poll(async () => (await board()).plans.some((p) => p.moduleId === 'economics')).toBe(true);
  const planned = (await board()).cards.filter((c) => c.planModuleId === 'economics' && c.column !== 'done');
  expect(planned.length).toBeGreaterThan(0);
  expect(planned.every((c) => c.planDate !== null && c.planDate < exam)).toBe(true);

  await sara.goto('/board');
  const row = sara.locator('[data-hub="board-plan-row"]').filter({ hasText: 'revision' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Remove plan' }).click();
  await sara.getByRole('dialog').getByRole('button', { name: 'Remove plan' }).click();
  await expect.poll(async () => (await board()).plans.some((p) => p.moduleId === 'economics')).toBe(false);
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'board', 'off');
  await ctx.close();
});
