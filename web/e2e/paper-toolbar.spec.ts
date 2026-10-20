// A past paper's toolbar on a phone (390×844, touch): tapping Time me opens its dialog and nothing else (no note is
// made), a quick double tap on its Start stays on the paper, and Copy link, Annotate in my notebook and Report sit
// in the More menu.
import { expect, test } from './fixtures';
import { api, makeFiles, personaContext, remember } from './support';

interface Item {
  id: string;
  slug: string;
}

test('on a phone, Time me opens its dialog, a double tap on Start stays put, and the rest is under More', async ({
  browser,
  rep,
  run,
}) => {
  const files = makeFiles(run.tag);
  await rep.goto('/library?upload=1');
  const dialog = rep.getByRole('dialog');
  await expect(dialog).toContainText('Upload a file');
  await dialog.locator('input[type="file"]').setInputFiles(files.pdf);
  await dialog.getByLabel('Title').fill(`ST2133 phone toolbar May 2024 [e2e ${run.tag}]`);
  await dialog.getByLabel('Module').selectOption('economics');
  await dialog.getByLabel('Type').selectOption('past-paper');
  await dialog.getByLabel('Exam year').fill('2024');
  await dialog.getByLabel('Session').selectOption('may');
  const [resp] = await Promise.all([
    rep.waitForResponse((r) => r.url().endsWith('/api/v1/library/items') && r.request().method() === 'POST', {
      timeout: 30_000,
    }),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  const item = (await resp.json()) as Item;
  remember('items', item.id);

  const ctx = await personaContext(browser, 'sara', { mobile: true });
  const sara = await ctx.newPage();
  try {
    await sara.goto(`/library/${item.slug}`);
    const bar = sara.locator('[data-hub="file-toolbar"]');
    await bar.getByRole('button', { name: 'Time me' }).tap();
    await expect(sara.getByRole('dialog', { name: 'Time me' })).toBeVisible();
    await expect(sara).toHaveURL(new RegExp(`/library/${item.slug}$`));
    await sara.keyboard.press('Escape');

    // A double tap on Start: the first closes the sheet and starts the clock, and the second must not land on the
    // tab bar under it (ST-62: it used to open Noora).
    await bar.getByRole('button', { name: 'Time me' }).tap();
    const start = sara.locator('[data-hub="time-me-start"]');
    await expect(start).toBeVisible();
    await sara.waitForTimeout(500); // the sheet has finished sliding up
    const box = await start.boundingBox();
    if (!box) throw new Error('No Start button in the Time me sheet');
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await sara.touchscreen.tap(x, y);
    await sara.waitForTimeout(80);
    await sara.touchscreen.tap(x, y);
    await expect(sara.locator('[data-hub="exam-timer"]')).toBeVisible();
    await sara.waitForTimeout(500);
    await expect(sara).toHaveURL(new RegExp(`/library/${item.slug}$`));

    await bar.getByRole('button', { name: 'More actions' }).tap();
    const menu = sara.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Annotate in my notebook' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Report' })).toBeVisible();
  } finally {
    await ctx.close();
    await api(rep, 'DELETE', `/api/v1/library/items/${item.id}`);
  }
});
