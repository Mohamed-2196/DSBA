// A past question a day: with an Econometrics exam tomorrow and ten more tagged questions (the seed tags others),
// Sara (Year 2) sees the day's question on Home, keeps its paper on her board and opens it at its page. The spec switches
// its features on and puts them back as it found them.
import { expect, test } from './fixtures';
import { api, makeFiles, remember, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

const inDays = (n: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bahrain' }).format(new Date(Date.now() + n * 86_400_000));

test.beforeAll(async ({ browser }) =>
  switchOn(browser, 'daily-question', ['library.questions', 'library.daily-question', 'board']),
);

test.afterAll(async ({ browser }) => switchBack(browser, 'daily-question'));

test('Sara opens the day’s past question from Home and keeps its paper on her board', async ({ sara, rep, run }) => {
  const files = makeFiles(run.tag);
  const title = `EC2020 ZA May 2024 [e2e ${run.tag}]`;

  await rep.goto('/library?upload=1');
  const dialog = rep.getByRole('dialog');
  await dialog.locator('input[type="file"]').setInputFiles(files.pdf);
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Module').selectOption('econometrics');
  await dialog.getByLabel('Type').selectOption('past-paper');
  await dialog.getByLabel('Exam year').fill('2024');
  await dialog.getByLabel('Session').selectOption('may');
  await dialog.getByLabel('Zone').selectOption('A');
  const [resp] = await Promise.all([
    rep.waitForResponse((r) => r.url().endsWith('/api/v1/library/items') && r.request().method() === 'POST', {
      timeout: 30_000,
    }),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  await rep.keyboard.press('Escape');
  const paper = (await resp.json()) as { id: string; slug: string };
  remember('items', paper.id);

  try {
    const mod = await api<{ chapters: { id: string }[] }>(rep, 'GET', '/api/v1/modules/econometrics');
    const chapter = mod.body.chapters[0]?.id ?? '';
    for (let q = 1; q <= 10; q++) {
      const tagged = await api(rep, 'POST', `/api/v1/library/items/${paper.id}/questions`, {
        question: q,
        chapterId: chapter,
        page: 1,
      });
      expect(tagged.status).toBe(201);
    }
    const exam = await api<{ id: string }>(rep, 'POST', '/api/v1/calendar/events', {
      title: `Econometrics exam [e2e ${run.tag}]`,
      type: 'exam',
      date: inDays(1),
      moduleId: 'econometrics',
    });
    expect(exam.status).toBe(201);
    remember('events', exam.body.id);

    // It's on Home by default: Home leads with studying (ST-50).
    await api(sara, 'PATCH', '/api/v1/me', { preferences: { homeBlocks: null } });
    await sara.goto('/');
    const card = sara.locator('[data-hub="daily-question"]');
    await expect(card.getByRole('heading', { name: 'A past question a day' })).toBeVisible();
    // The seed tags Econometrics papers too, so the day's question may come from any of them, this one included.
    await expect(card).toContainText('Elements of Econometrics · exam tomorrow');
    await expect(card).toContainText(/Question [A-D]?\d+, /);
    await card.locator('[data-hub="board-add"]').click();
    await expect(card.locator('[data-hub="board-on"]')).toBeVisible();
    await card.locator('[data-hub="daily-open"]').click();
    await expect(sara).toHaveURL(/\/library\/[^/?]+(\?page=\d+)?$/);
    await expect(sara.locator('[data-hub="question-tags"]')).toBeVisible();
  } finally {
    await api(rep, 'DELETE', `/api/v1/library/items/${paper.id}`);
    await api(sara, 'PATCH', '/api/v1/me', { preferences: { homeBlocks: null } });
  }
});
