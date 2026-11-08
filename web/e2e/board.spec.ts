// Boards: off, a student is told so. With them on, a student starts a board from a template, adds a card, moves it
// with the card's menu, adds an exam from the calendar and opens it on the board. The switch ends as it was.
import { expect, test } from './fixtures';
import { api, setSwitch, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'board', ['board']));
test.afterAll(async ({ browser }) => switchBack(browser, 'board'));

interface Boards {
  boards: { id: string; archived: boolean; columns: { id: string; name: string }[] }[];
}
interface BoardDetail {
  cards: { title: string; columnId: string }[];
}

test('the board is off for students until an admin switches it on', async ({ sara, admin }) => {
  await setSwitch(admin, 'board', 'off');
  await sara.goto('/board');
  await expect(sara.getByText('This part of the hub is switched off right now.')).toBeVisible();
  await setSwitch(admin, 'board', 'everyone');
});

test('a first board’s templates are named and described for screen readers, their pictures left out', async ({
  ali,
}) => {
  // Ali makes no boards in the suite, so he gets the start screen (its buttons are only disabled while he's suspended).
  await ali.goto('/board');
  const start = ali.locator('[data-hub="board-start"]');
  await expect(start).toBeVisible();
  const expected: [string, string][] = [
    ['Start a Study board', 'Columns: To do, In progress, Done.'],
    ['Start an Assignment board', 'Columns: Research, Draft, Review, Submitted.'],
    ['Start a Personal board', 'Columns: Today, This week, Later, Done.'],
    ['Start a Blank board', 'Columns: To do, Done.'],
    ['Start a Weekly planner board', 'Columns: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday, Done.'],
  ];
  const buttons = start.getByRole('button', { name: /^Start an? / });
  await expect(buttons).toHaveCount(expected.length);
  for (const [i, [name, columns]] of expected.entries()) {
    await expect(buttons.nth(i)).toHaveAccessibleName(name);
    await expect(buttons.nth(i)).toHaveAccessibleDescription(new RegExp(`${columns.replace(/[.]/g, '\\.')}$`));
  }
  // the paper drawn on each is decoration, kept out of the accessibility tree
  await expect(start.locator('[data-hub^="board-template-"] > [aria-hidden="true"]')).toHaveCount(expected.length);
});

test('a student adds a card, moves it, and adds an exam from the calendar', async ({ sara }) => {
  const title = `E2E card ${Date.now()}`;
  await sara.goto('/board');
  await expect(sara.getByRole('heading', { name: 'Boards', level: 1 })).toBeVisible();
  // A first board comes from a template, in one click.
  const start = sara.locator('[data-hub="board-template-study"]');
  if (await start.isVisible()) await start.click();
  await expect(sara.locator('[data-hub="board-toolbar"]')).toBeVisible();

  await sara.locator('[data-hub="board-column"]').first().locator('[data-hub="board-quick-add"]').click();
  await sara.locator('[data-hub="board-quick-form"]').getByRole('textbox').fill(title);
  await sara.keyboard.press('Enter');
  const card = sara.getByRole('article', { name: title });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: `Actions for “${title}”` }).click();
  await sara.getByRole('menuitem', { name: 'Move to Done' }).click();
  const columnOf = async () => {
    const { boards } = (await api<Boards>(sara, 'GET', '/api/v1/boards')).body;
    for (const board of boards) {
      const found = (await api<BoardDetail>(sara, 'GET', `/api/v1/boards/${board.id}`)).body.cards.find(
        (c) => c.title === title,
      );
      if (found) return board.columns.find((c) => c.id === found.columnId)?.name;
    }
    return undefined;
  };
  await expect.poll(columnOf).toBe('Done');

  await sara.goto('/calendar?cohort=all&types=exam&view=list');
  // The week at the top lists every type, so pick an exam's row.
  await sara.locator('[data-hub="calendar-event"].cal-tone--exam').first().click();
  const drawer = sara.getByRole('dialog');
  const add = drawer.locator('[data-hub="board-add"], [data-hub="board-on"]');
  await expect(add).toBeVisible();
  if ((await add.getAttribute('data-hub')) === 'board-add') await add.click();
  await expect(drawer.locator('[data-hub="board-on"]')).toBeVisible();
  await drawer.locator('[data-hub="board-on"]').click();
  // "On your board" opens the board with the exam's card open.
  await expect(sara).toHaveURL(/\/board\?board=[^&]+&card=/);
  await expect(sara.locator('[data-hub="board-card-drawer"]')).toBeVisible();
});
