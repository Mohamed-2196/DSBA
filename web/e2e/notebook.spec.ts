// The notebook: Sara writes a note with a picture in it, makes the picture smaller from its corner, moves it to the
// right, and after a reload the text and the picture are where she left them. Notes are switched on for the spec
// and put back as they were found.
import { expect, test } from './fixtures';
import { api, makeFiles, switchBack, switchOn } from './support';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => switchOn(browser, 'notebook', ['notes']));
test.afterAll(async ({ browser }) => switchBack(browser, 'notebook'));

interface DocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

/** The note's pictures, as saved. */
function pictures(node: DocNode): { width: number; x: number }[] {
  const own = node.type === 'image' ? [{ width: Number(node.attrs?.width), x: Number(node.attrs?.x) }] : [];
  return [...own, ...(node.content ?? []).flatMap(pictures)];
}

test('a note keeps its text, and a picture moved and resized stays put after a reload', async ({ sara, run }) => {
  const files = makeFiles(run.tag);
  const text = `Working for question 2 [e2e ${run.tag}]`;
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = new URL(sara.url()).pathname.split('/').pop() ?? '';
  const saved = async () =>
    pictures((await api<{ doc: DocNode }>(sara, 'GET', `/api/v1/notes/${id}`)).body.doc ?? { type: 'doc' });
  try {
    await sara.locator('[data-hub="note-title"]').fill(`Pictures [e2e ${run.tag}]`);
    await sara.locator('[data-hub="note-text"]').click();
    await sara.keyboard.type(text);
    await sara.keyboard.press('Enter');

    const [chooser] = await Promise.all([
      sara.waitForEvent('filechooser'),
      sara.locator('[data-hub="note-insert-picture"]').click(),
    ]);
    await chooser.setFiles(files.png);
    const picture = sara.locator('[data-hub="note-picture"]');
    const image = picture.getByRole('img');
    await expect(image).toBeVisible();
    await expect.poll(async () => (await saved()).length).toBe(1);
    const [before] = await saved();

    // Selected, it shows its tools and corners: pull the bottom-right corner in to make it smaller.
    await image.click();
    await expect(picture.getByRole('button', { name: 'To the right' })).toBeVisible();
    const box = await image.boundingBox();
    if (!box) throw new Error('The picture has no box');
    await sara.mouse.move(box.x + box.width - 1, box.y + box.height - 1);
    await sara.mouse.down();
    await sara.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
    await sara.mouse.up();
    await expect.poll(async () => (await saved())[0]?.width ?? 1).toBeLessThan(before.width);

    // To the right of the text.
    await picture.getByRole('button', { name: 'To the right' }).click();
    await expect.poll(async () => (await saved())[0]?.x).toBe(1);
    await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');
    const [after] = await saved();

    await sara.reload();
    await expect(sara.locator('[data-hub="note-text"]')).toContainText(text);
    await expect(image).toBeVisible();
    expect(await saved()).toEqual([after]);
    // On the page: as wide as it was left, and against the text's right edge.
    const shown = await image.boundingBox();
    const column = await sara.locator('[data-hub="note-text"]').boundingBox();
    if (!shown || !column) throw new Error('The note has no box');
    expect(Math.abs(shown.x + shown.width - (column.x + column.width))).toBeLessThan(6);
    expect(shown.width).toBeLessThan(box.width);
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${id}`);
  }
});
