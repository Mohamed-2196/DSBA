// The Daily: six puzzles a day, the same for everyone. A guest plays every game to a finish on a laptop; Ali plays
// them all on his phone, his plays count, and he shows on the leaderboard once he chooses to. The answers come from
// the day's preview that content editors have in Manage → Daily puzzles (Sudoku's are worked out from its grid). A
// stack without the Daily's content has no puzzles: the spec says so and skips.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, personaContext } from './support';

test.describe.configure({ mode: 'serial' });

type Cell = { row: number; col: number };

interface Answers {
  day: string;
  word: string;
  groups: string[][];
  search: { start: Cell; end: Cell; letters: [string, string] }[];
  quiz: { answer: number; options: number }[];
  nearest: string;
}

interface Preview {
  games: {
    game: string;
    puzzle:
      | { game: 'word'; answer: string }
      | { game: 'groups'; groups: { words: string[] }[] }
      | { game: 'search'; words: string[]; grid: string[] }
      | { game: 'quiz'; questions: { answer: number; options: string[] }[] }
      | { game: 'nearest'; target: string }
      | null;
    problem: string | null;
  }[];
}

/** Where each word lies in the grid: its first and last letters, in any of the eight directions. */
function findWords(grid: string[], words: string[]): Answers['search'] {
  const size = grid.length;
  const at = (r: number, c: number) => (r >= 0 && c >= 0 && r < size && c < size ? grid[r][c] : '');
  const steps = [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => [dr, dc] as const)).filter(([a, b]) => a || b);
  return words.map((word) => {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        for (const [dr, dc] of steps)
          if ([...word].every((ch, i) => at(r + dr * i, c + dc * i) === ch)) {
            const n = word.length - 1;
            return {
              start: { row: r, col: c },
              end: { row: r + dr * n, col: c + dc * n },
              letters: [word[0], word[n]],
            };
          }
    throw new Error(`${word} isn't in the grid`);
  });
}

/** The day's answers, from the preview (content editors only). A string says why there are none. */
async function todaysAnswers(admin: Page): Promise<Answers | string> {
  const today = await api<{ day: string }>(admin, 'GET', '/api/v1/daily');
  if (today.status !== 200) return `the Daily didn't load (${today.status})`;
  const day = today.body.day;
  const preview = await api<Preview>(admin, 'GET', `/api/v1/content/daily/preview?day=${day}`);
  expect(preview.status).toBe(200);
  const missing = preview.body.games.find((g) => !g.puzzle);
  if (missing) return `today has no ${missing.game} puzzle (${missing.problem}): load the Daily's content first`;
  const of = <G extends string>(game: G) => preview.body.games.find((g) => g.game === game)?.puzzle;
  const word = of('word');
  const groups = of('groups');
  const search = of('search');
  const quiz = of('quiz');
  const nearest = of('nearest');
  if (word?.game !== 'word' || groups?.game !== 'groups' || search?.game !== 'search' || quiz?.game !== 'quiz')
    return 'the preview is missing a game';
  if (nearest?.game !== 'nearest') return 'the preview is missing a game';
  return {
    day,
    word: word.answer,
    groups: groups.groups.map((g) => g.words),
    search: findWords(search.grid, search.words),
    quiz: quiz.questions.map((q) => ({ answer: q.answer, options: q.options.length })),
    nearest: nearest.target,
  };
}

/** A Sudoku's solution, by backtracking (the day's grids have one solution each). */
function solveSudoku(givens: number[]): number[] {
  const grid = [...givens];
  const fits = (i: number, d: number) => {
    const r = Math.floor(i / 9);
    const c = i % 9;
    for (let k = 0; k < 9; k++) {
      if (grid[r * 9 + k] === d || grid[k * 9 + c] === d) return false;
      const br = Math.floor(r / 3) * 3 + Math.floor(k / 3);
      const bc = Math.floor(c / 3) * 3 + (k % 3);
      if (grid[br * 9 + bc] === d) return false;
    }
    return true;
  };
  const fill = (from: number): boolean => {
    const i = grid.indexOf(0, from);
    if (i === -1) return true;
    for (let d = 1; d <= 9; d++)
      if (fits(i, d)) {
        grid[i] = d;
        if (fill(i + 1)) return true;
      }
    grid[i] = 0;
    return false;
  };
  if (!fill(0)) throw new Error('This Sudoku has no solution');
  return grid;
}

let answers: Answers | string;

test.beforeAll(async ({ browser }) => {
  const ctx = await personaContext(browser, 'admin');
  answers = await todaysAnswers(await ctx.newPage());
  await ctx.close();
});

const known = (): Answers => {
  test.skip(typeof answers === 'string', typeof answers === 'string' ? answers : '');
  return answers as Answers;
};

/** Opens a game. The rules open by themselves when a game not started yet is opened on a device for the first
 * time; a play already under way opens straight on its board. */
async function open(page: Page, game: string, tap = false) {
  await page.goto(`/daily/${game}`);
  await expect(page.getByRole('button', { name: 'How to play' })).toBeEnabled(); // the play has loaded
  const play = page.getByRole('dialog', { name: /^How to play/ }).getByRole('button', { name: 'Play' });
  if (await play.isVisible()) await (tap ? play.tap() : play.click());
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

const result = (page: Page) => page.getByRole('dialog').filter({ has: page.getByText(/#\d+$/) });

/** Picks a word in Correlations. Right after a group is found the board takes no picks for a moment, so a pick is
 * made again until it holds (never twice: a second pick would let go of it). */
async function pickWord(page: Page, word: string, tap = false) {
  const button = page.getByRole('button', { name: word, exact: true });
  await expect(async () => {
    if ((await button.getAttribute('aria-pressed')) !== 'true') await (tap ? button.tap() : button.click());
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 1_000 });
  }).toPass();
}

test('a guest plays every game to a finish', async ({ guest }) => {
  const a = known();
  const page = guest;

  await open(page, 'word');
  await page.keyboard.type(a.word);
  await page.keyboard.press('Enter');
  await expect(result(page)).toContainText('Solved in 1 guess');
  await expect(result(page)).toContainText('Guest: not kept');

  await open(page, 'groups');
  for (const group of a.groups) {
    for (const word of group) await pickWord(page, word);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('group', { name: new RegExp(`${group[0]}`) })).toBeVisible();
  }
  await expect(result(page)).toContainText('All four groups, 0 mistakes');

  await open(page, 'search');
  for (const [i, { start, end, letters }] of a.search.entries()) {
    const cell = (p: Cell, l: string) =>
      page.getByRole('button', { name: `${l}, row ${p.row + 1}, column ${p.col + 1}`, exact: true });
    await cell(start, letters[0]).click();
    await cell(end, letters[1]).click();
    // The grid takes no taps while a line is being checked: the next word waits for this one.
    await expect(page.getByText(`${i + 1} of ${a.search.length} found`)).toBeVisible();
  }
  await expect(result(page)).toContainText(`${a.search.length} words, 0 hints`);

  await open(page, 'quiz');
  for (const [i, q] of a.quiz.entries()) {
    await page.getByRole('group', { name: 'Answers' }).getByRole('button').nth(q.answer).click();
    await expect(page.getByText('Right', { exact: true })).toBeVisible();
    if (i < a.quiz.length - 1) await page.getByRole('button', { name: 'Next question' }).click();
  }
  await page.getByRole('button', { name: 'See your result' }).first().click();
  await expect(result(page)).toContainText(`${a.quiz.length} of ${a.quiz.length} right`);

  // Nearest Neighbour and Sudoku end with "Give up": a guest's answer waits for an account, or for tomorrow.
  await open(page, 'nearest');
  await page.getByRole('textbox', { name: 'Your guess' }).fill('data');
  await page.getByRole('button', { name: 'Guess', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your guesses, closest first' })).toContainText('data');
  for (const game of ['nearest', 'sudoku']) {
    if (game === 'sudoku') {
      await open(page, 'sudoku');
      await page
        .getByRole('gridcell', { name: /: empty$/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Hint' }).click();
      await expect(page.getByRole('gridcell', { name: /from a hint$/ })).toHaveCount(1);
    }
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Give up and see the answer' }).click();
    await page.getByRole('dialog', { name: 'Give up?' }).getByRole('button', { name: 'Give up' }).click();
    await expect(result(page)).toContainText('Not this time');
  }
});

test('a guest’s hub counts the puzzles they finished', async ({ guest }) => {
  const a = known();
  await open(guest, 'word');
  await guest.keyboard.type(a.word);
  await guest.keyboard.press('Enter');
  await expect(result(guest)).toContainText('Solved in 1 guess');
  await guest.goto('/daily');
  await expect(guest.getByRole('region', { name: 'Today so far' })).toContainText('1 of 6 done');
  await expect(guest.locator('a[data-game="word"]')).toContainText('Solved');
});

test('Ali plays every game on his phone, his plays count, and he joins the leaderboard', async ({ browser, run }) => {
  const a = known();
  const ctx = await personaContext(browser, 'ali', { mobile: true });
  const page = await ctx.newPage();
  const tapKey = (key: string) =>
    page
      .getByRole('group', { name: 'Keyboard' })
      .getByRole('button', { name: new RegExp(`^${key}(,|$)`) })
      .tap();

  // The Word: one wrong guess, then the word.
  await open(page, 'word', true);
  for (const guess of ['TABLE', a.word]) {
    if (guess === a.word && a.word === 'TABLE') continue;
    for (const ch of guess) await tapKey(ch);
    await page.getByRole('button', { name: 'Guess' }).tap();
    await expect(
      page.getByRole('grid', { name: /Guesses/ }).getByRole('row', { name: new RegExp(`^${guess}:`) }),
    ).toBeVisible();
    // The keyboard takes the guess's colours once its tiles have turned; a guess made before then is ignored.
    await expect(
      page.getByRole('group', { name: 'Keyboard' }).getByRole('button', { name: new RegExp(`^${guess[0]}, `) }),
    ).toBeVisible();
  }
  await expect(result(page)).toContainText(/Solved in [12] guess/);

  await open(page, 'groups', true);
  for (const group of a.groups) {
    for (const word of group) await pickWord(page, word, true);
    await page.getByRole('button', { name: 'Submit' }).tap();
    await expect(page.getByRole('group', { name: new RegExp(`${group[0]}`) })).toBeVisible();
  }
  await expect(result(page)).toContainText('All four groups');

  await open(page, 'search', true);
  for (const [i, { start, end, letters }] of a.search.entries()) {
    const cell = (p: Cell, l: string) =>
      page.getByRole('button', { name: `${l}, row ${p.row + 1}, column ${p.col + 1}`, exact: true });
    await cell(start, letters[0]).tap();
    await cell(end, letters[1]).tap();
    // The grid takes no taps while a line is being checked: the next word waits for this one.
    await expect(page.getByText(`${i + 1} of ${a.search.length} found`)).toBeVisible();
  }
  await expect(result(page)).toContainText('Every word found');

  // The Daily Query: two right and three wrong is a loss that still earns points for the right ones.
  await open(page, 'quiz', true);
  for (const [i, q] of a.quiz.entries()) {
    const pick = i < 2 ? q.answer : (q.answer + 1) % q.options;
    await page.getByRole('group', { name: 'Answers' }).getByRole('button').nth(pick).tap();
    await expect(page.getByText(i < 2 ? 'Right' : 'Not quite', { exact: true })).toBeVisible();
    if (i < a.quiz.length - 1) await page.getByRole('button', { name: 'Next question' }).tap();
  }
  await page.getByRole('button', { name: 'See your result' }).first().tap();
  await expect(result(page)).toContainText('2 of 5 right');
  await expect(result(page)).toContainText('+40 points');

  await open(page, 'nearest', true);
  await page.getByRole('textbox', { name: 'Your guess' }).fill(a.nearest);
  await page.getByRole('button', { name: 'Guess', exact: true }).tap();
  await expect(result(page)).toContainText('Found it');

  await open(page, 'sudoku', true);
  const play = await api<{ play: { view: { givens: number[] } } }>(
    page,
    'GET',
    `/api/v1/daily/${a.day}/sudoku?variant=easy`,
  );
  const givens = play.body.play.view.givens;
  const solution = solveSudoku(givens);
  for (const [i, given] of givens.entries()) {
    if (given) continue;
    await page
      .getByRole('gridcell', { name: new RegExp(`^Row ${Math.floor(i / 9) + 1}, column ${(i % 9) + 1},`) })
      .tap();
    await page
      .getByRole('group', { name: 'Digits' })
      .getByRole('button', { name: new RegExp(`^Place ${solution[i]},`) })
      .tap();
  }
  await expect(result(page)).toContainText('Easy, 0 mistakes, 0 hints');

  // Every play is kept: the hub has all six done and the day's points.
  const me = await api<{ done: number; points: number; games: { status: string; scored: boolean }[] }>(
    page,
    'GET',
    '/api/v1/daily',
  );
  expect(me.body.done).toBe(6);
  expect(me.body.games.every((g) => g.scored)).toBe(true);
  await page.goto('/daily');
  const summary = page.getByRole('region', { name: 'Today so far' });
  await expect(summary).toContainText('All six done');
  await expect(summary).toContainText(`${me.body.points} points today`);

  // His name shows on the leaderboard only once he chooses it.
  await page.getByRole('tab', { name: 'Leaderboard' }).tap();
  const toggle = page.getByRole('switch', { name: 'Show my name on the leaderboard' });
  await expect(toggle).not.toBeChecked();
  const mine = page.getByRole('listitem').filter({ hasText: run.ali.name }).filter({ hasText: 'You' }).first();
  await page.getByRole('switch', { name: 'Show my name on the leaderboard' }).tap();
  await expect(mine).toContainText('You');
  await expect(mine).toContainText(`${me.body.points} pts`);
  await ctx.close();
});
