// Revision plans and past papers on a board. With boards on, a student plans a module's revision from the module
// page, finds the plan on its board, and removes it. The switch goes back off.
import { expect, test } from './fixtures';
import { api, personaContext, setSwitch } from './support';

test.describe.configure({ mode: 'serial' });

interface Boards {
  plans: { moduleId: string; boardId: string; left: number }[];
}
interface BoardDetail {
  board: { columns: { id: string; done: boolean }[] };
  cards: { columnId: string; planModuleId: string | null; planDate: string | null }[];
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

  const plan = async () =>
    (await api<Boards>(sara, 'GET', '/api/v1/boards')).body.plans.find((p) => p.moduleId === 'economics');
  await expect.poll(async () => (await plan()) !== undefined).toBe(true);
  const boardId = (await plan())?.boardId ?? '';
  const detail = (await api<BoardDetail>(sara, 'GET', `/api/v1/boards/${boardId}`)).body;
  const done = new Set(detail.board.columns.filter((c) => c.done).map((c) => c.id));
  const planned = detail.cards.filter((c) => c.planModuleId === 'economics' && !done.has(c.columnId));
  expect(planned.length).toBeGreaterThan(0);
  expect(planned.every((c) => c.planDate !== null && c.planDate < exam)).toBe(true);

  await sara.goto(`/board?board=${boardId}`);
  const row = sara.locator('[data-hub="board-plan-row"]').filter({ hasText: 'revision' }).first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Remove plan' }).click();
  await sara.getByRole('dialog').getByRole('button', { name: 'Remove plan' }).click();
  await expect.poll(async () => (await plan()) === undefined).toBe(true);
});

test.afterAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  await setSwitch(await ctx.newPage(), 'board', 'off');
  await ctx.close();
});
