// The library: uploads of each kind of file (and the wrong ones), the rep's review with a note, the uploader's
// notifications, preview, download, stars, search and filters.
import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { api, makeFiles, remember } from './support';

test.describe.configure({ mode: 'serial' });

interface Item {
  id: string;
  slug: string;
  title: string;
  status: string;
  downloadCount: number;
  reviewNote: string | null;
}

async function openUpload(page: Page) {
  await page.goto('/library');
  await page.getByRole('button', { name: 'Upload a file' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Upload a file');
  return dialog;
}

async function upload(page: Page, file: string, fields: { title: string; module: string; kind: string }): Promise<Item> {
  const dialog = await openUpload(page);
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await dialog.getByLabel('Title').fill(fields.title);
  await dialog.getByLabel('Module').selectOption(fields.module);
  await dialog.getByLabel('Type').selectOption(fields.kind);
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/api/v1/library/items') && r.request().method() === 'POST', { timeout: 30_000 }),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status(), await resp.text()).toBe(201);
  await expect(dialog).toContainText('Sent for review');
  await expect(dialog).toContainText('Waiting for review');
  await page.keyboard.press('Escape');
  const item = (await resp.json()) as Item;
  remember('items', item.id);
  expect(item.status).toBe('pending');
  return item;
}

const titles = (tag: string) => ({
  pdf: `ST2133 MGF summary [e2e ${tag}]`,
  docx: `EC1002 elasticity notes [e2e ${tag}]`,
  ipynb: `ST2195 pandas practice [e2e ${tag}]`,
  csv: `ST2187 sales data [e2e ${tag}]`,
});

test('Ali uploads a PDF, a Word file, a notebook and a CSV; each waits for review', async ({ ali, run }) => {
  const files = makeFiles(run.tag);
  const t = titles(run.tag);
  await upload(ali, files.pdf, { title: t.pdf, module: 'advanced-stats-distribution', kind: 'notes' });
  await upload(ali, files.docx, { title: t.docx, module: 'economics', kind: 'notes' });
  await upload(ali, files.ipynb, { title: t.ipynb, module: 'programming-data-science', kind: 'exercises' });
  await upload(ali, files.csv, { title: t.csv, module: 'business-analytics', kind: 'exercises' });

  await ali.goto('/library?mine=1&year=all');
  for (const title of Object.values(t)) await expect(ali.locator('main')).toContainText(title);
  await expect(ali.locator('main')).toContainText('Waiting for review');
  // Nobody else sees a pending upload.
  const mine = await api<{ items: Item[] }>(ali, 'GET', `/api/v1/library/items?q=${run.tag}`);
  expect(mine.body.items.filter((i) => i.status === 'published')).toHaveLength(0);
});

test('wrong files are refused with a reason', async ({ ali, run }) => {
  const files = makeFiles(run.tag);
  // A program: refused before anything is sent.
  let dialog = await openUpload(ali);
  await dialog.locator('input[type="file"]').setInputFiles(files.exe);
  await expect(dialog).toContainText('This type of file can’t be added to the library.');
  await ali.keyboard.press('Escape');

  // Too large: refused before anything is sent.
  dialog = await openUpload(ali);
  await dialog.locator('input[type="file"]').setInputFiles(files.tooBig);
  await expect(dialog).toContainText('over the 50 MB limit');
  await ali.keyboard.press('Escape');

  // A web page renamed .pdf: the server looks at what arrived and refuses it.
  dialog = await openUpload(ali);
  await dialog.locator('input[type="file"]').setInputFiles(files.fakePdf);
  await dialog.getByLabel('Title').fill(`ST2134 past paper 2024 [e2e ${run.tag}]`);
  await dialog.getByLabel('Module').selectOption('advanced-stats-inferential');
  await dialog.getByLabel('Type').selectOption('past-paper');
  const [resp] = await Promise.all([
    ali.waitForResponse((r) => /\/api\/v1\/uploads\/[^/]+\/complete$/.test(r.url())),
    dialog.locator('[data-hub="upload-submit"]').click(),
  ]);
  expect(resp.status()).toBe(422);
  expect((await resp.json()).error.code).toBe('mismatch');
  await expect(dialog.locator('[role="alert"]').first()).toBeVisible();
  await ali.keyboard.press('Escape');

  // A missing title is caught in the form.
  dialog = await openUpload(ali);
  await dialog.locator('input[type="file"]').setInputFiles(files.csv);
  await dialog.getByLabel('Title').fill('');
  await dialog.locator('[data-hub="upload-submit"]').click();
  await expect(dialog).toContainText('Give it a title');
  await ali.keyboard.press('Escape');
});

test('the rep publishes three uploads and rejects one with a note; Ali is told', async ({ rep, ali, run }) => {
  const t = titles(run.tag);
  await rep.goto('/moderation?tab=uploads');
  const row = (title: string) => rep.locator('[data-hub="upload-review"]').filter({ hasText: title }).first();
  for (const title of [t.pdf, t.docx, t.ipynb]) {
    await row(title).getByRole('button', { name: 'Publish' }).click();
    await expect(rep.getByText(`“${title}” is in the library now.`)).toBeVisible();
  }
  const note = 'Only four rows. Add the full 60 weeks of data and upload it again.';
  await row(t.csv).getByRole('button', { name: 'Reject' }).click();
  await row(t.csv).getByLabel('Note for the uploader').fill(note);
  await row(t.csv).getByRole('button', { name: 'Don’t publish' }).click();
  await expect(rep.getByText('Not published').first()).toBeVisible();

  const notes = await api<{ items: { kind: string; title: string; body: string | null; url: string | null }[] }>(ali, 'GET', '/api/v1/notifications?limit=50');
  const published = notes.body.items.filter((n) => n.kind === 'upload_published').map((n) => n.title);
  expect(published).toEqual(expect.arrayContaining([`Your file is in the library: ${t.pdf}`, `Your file is in the library: ${t.docx}`]));
  const rejected = notes.body.items.find((n) => n.kind === 'upload_rejected');
  expect(rejected?.body).toBe(note);

  await ali.goto(rejected?.url ?? '/library');
  await expect(ali.locator('main')).toContainText('Not published');
  await expect(ali.locator('main')).toContainText(note);
});

test('anyone can preview the PDF and download the files unchanged', async ({ guest, run }) => {
  const files = makeFiles(run.tag);
  const t = titles(run.tag);
  const found = await api<{ items: Item[] }>(guest, 'GET', `/api/v1/library/items?q=${run.tag}`);
  const pdf = found.body.items.find((i) => i.title === t.pdf);
  const docx = found.body.items.find((i) => i.title === t.docx);
  expect(pdf && docx).toBeTruthy();
  expect(found.body.items.find((i) => i.title === t.csv)).toBeUndefined(); // rejected: not public

  await guest.goto(`/library/${pdf?.slug}`);
  const frame = guest.locator('main iframe').first();
  await expect(frame).toHaveAttribute('src', /response-content-type=application%2Fpdf/);
  const shown = await guest.request.get((await frame.getAttribute('src')) ?? '');
  expect(shown.status()).toBe(200);
  expect(shown.headers()['content-type']).toBe('application/pdf');
  expect(shown.headers()['content-disposition']).toMatch(/^inline/);

  const [download] = await Promise.all([guest.waitForEvent('download'), guest.getByRole('link', { name: /^Download/ }).first().click()]);
  expect(fs.readFileSync(await download.path()).equals(fs.readFileSync(files.pdf))).toBe(true);
  await expect.poll(async () => (await api<Item>(guest, 'GET', `/api/v1/library/items/${pdf?.slug}`)).body.downloadCount).toBeGreaterThan(0);

  // Word files have no preview: the page offers the download, which is the same file.
  await guest.goto(`/library/${docx?.slug}`);
  await expect(guest.locator('[data-hub="file-nopreview"]')).toContainText('No preview');
  const [d2] = await Promise.all([guest.waitForEvent('download'), guest.locator('[data-hub="file-nopreview"]').getByRole('link', { name: /^Download/ }).click()]);
  expect(fs.readFileSync(await d2.path()).equals(fs.readFileSync(files.docx))).toBe(true);
});

test('Sara stars a file and finds it under Starred; search and filters find it', async ({ sara, guest, run }) => {
  const t = titles(run.tag);
  const pdf = (await api<{ items: Item[] }>(sara, 'GET', `/api/v1/library/items?q=${run.tag}`)).body.items.find((i) => i.title === t.pdf);
  await api(sara, 'DELETE', `/api/v1/library/items/${pdf?.id}/star`); // not starred yet, even on a re-run
  await sara.goto(`/library/${pdf?.slug}`);
  const star = sara.getByRole('button', { name: `Star ${t.pdf}` }).first();
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await star.click();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await sara.reload();
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await sara.goto('/library?starred=1');
  await expect(sara.locator('main')).toContainText(t.pdf); // Sara is Year 2, like the file

  await guest.goto('/library?year=all');
  await guest.getByPlaceholder('Search titles, module codes or authors').fill(run.tag);
  await expect(guest.locator('main')).toContainText(t.pdf);
  await expect(guest.locator('main')).toContainText(t.ipynb);
  await guest.goto(`/library?year=all&module=advanced-stats-distribution&type=notes&q=${run.tag}`);
  const results = guest.locator('main article[data-hub="file-card"], main tr[data-hub="file-card"]'); // not "New this week"
  await expect(results.filter({ hasText: t.pdf })).toHaveCount(1);
  await expect(results.filter({ hasText: t.ipynb })).toHaveCount(0);
});

test('ST-1: a starred file from another year shows under Starred', async ({ ali }) => {
  test.fail(true, 'ST-1: "Starred" keeps the cohort filter and says "No starred files yet"');
  // A Year 2 file someone else shared (Ali is Year 1, and his own uploads show under "Your uploads" anyway).
  const other = (await api<{ items: Item[] }>(ali, 'GET', '/api/v1/library/items?year=2&source=link&limit=1')).body.items[0];
  expect((await api(ali, 'PUT', `/api/v1/library/items/${other.id}/star`)).status).toBe(200);
  await ali.goto('/library?starred=1');
  await expect(ali.locator('[data-hub="library-filters"]').getByRole('radio', { name: 'Year 1' })).toHaveAttribute('aria-checked', 'true');
  const results = ali.locator('main article[data-hub="file-card"], main tr[data-hub="file-card"]');
  await expect(results.locator(`a[href$="/library/${other.slug}"]`).first()).toBeVisible({ timeout: 5_000 });
});
