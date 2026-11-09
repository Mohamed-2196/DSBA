// The notebook: Sara writes a note with a picture in it, makes the picture smaller from its corner, moves it to the
// right, and after a reload the text and the picture are where she left them. Notes are switched on for the spec
// and put back as they were found.
import type { Page } from '@playwright/test';
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

interface InkSheetOut {
  strokes: { points: number[]; anchor?: { block: string | null; dy: number } | null }[];
}

/** The part of a ProseMirror selection the ST-38 test reads. */
interface EditorSelection {
  $from: { parentOffset: number; index: (depth: number) => number };
}

test('handwriting beside a line moves down with it when lines are added above (ST-38)', async ({ sara, run }) => {
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = new URL(sara.url()).pathname.split('/').pop() ?? '';
  const ink = async () => (await api<InkSheetOut>(sara, 'GET', `/api/v1/notes/${id}/ink/1000`)).body.strokes;
  try {
    const text = sara.locator('[data-hub="note-text"]');
    await expect(text).toBeFocused(); // a new note waits with the cursor in its text
    await sara.keyboard.type(`First line [e2e ${run.tag}]`);
    await sara.keyboard.press('Enter');
    await sara.keyboard.type('Second line, with ink beside it');
    await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');

    // the pen, and a stroke in the margin beside the second line
    await sara.getByRole('button', { name: 'Pen', exact: true }).click();
    const line = await text.locator('p').nth(1).boundingBox();
    if (!line) throw new Error('The second line has no box');
    const y = line.y + line.height / 2;
    await sara.mouse.move(line.x + line.width - 60, y);
    await sara.mouse.down();
    await sara.mouse.move(line.x + line.width - 10, y + 3, { steps: 8 });
    await sara.mouse.up();
    await expect.poll(async () => (await ink())[0]?.anchor?.block ?? null).not.toBeNull();
    const before = (await ink())[0].points[1];

    // three lines above the second
    const type = sara.getByRole('button', { name: 'Type', exact: true });
    await type.click();
    await expect(type).toHaveAttribute('aria-pressed', 'true');
    const again = await text.locator('p').nth(1).boundingBox();
    if (!again) throw new Error('The second line has no box');
    await sara.mouse.click(again.x + 2, again.y + again.height / 2);
    // The editor takes up the click's place a moment after the mouse is released (a person never types sooner): wait
    // until its caret is at the start of the second line, or the Enters go in where the caret was.
    await sara.waitForFunction(() => {
      const el = document.querySelector<HTMLElement & { editor?: { state: { selection: EditorSelection } } }>(
        '[data-hub="note-text"]',
      );
      const at = el?.editor?.state.selection.$from;
      return !!at && at.parentOffset === 0 && at.index(0) === 1;
    });
    for (let i = 0; i < 3; i++) await sara.keyboard.press('Enter');
    // three lines of 32 units
    await expect.poll(async () => Math.round((await ink())[0].points[1] - before)).toBe(96);

    await sara.reload();
    await expect(text).toContainText('Second line');
    await expect.poll(async () => Math.round((await ink())[0].points[1] - before)).toBe(96);
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${id}`);
  }
});

test('on a phone a note opens in its text, at reading size, and shows its pages on demand (UX-70)', async ({
  sara,
  run,
}) => {
  await sara.setViewportSize({ width: 390, height: 844 });
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = new URL(sara.url()).pathname.split('/').pop() ?? '';
  try {
    const workspace = sara.locator('[data-hub="notebook-workspace"]');
    await expect(workspace).toHaveAttribute('data-view', 'text');
    const text = sara.locator('[data-hub="note-text"]');
    await expect(text).toBeFocused();
    await sara.keyboard.type(`Typed between lectures [e2e ${run.tag}]`);
    const size = await text
      .locator('p')
      .first()
      .evaluate((p) => {
        const scale = p.getBoundingClientRect().height / (p as HTMLElement).offsetHeight;
        return parseFloat(getComputedStyle(p).fontSize) * scale;
      });
    expect(size).toBeGreaterThanOrEqual(16);
    expect(await sara.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(
      false,
    );
    await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');

    await sara.getByRole('radio', { name: 'Pages' }).click();
    await expect(workspace).toHaveAttribute('data-view', 'page');
    await expect(sara.locator('[data-hub="note-surface"]')).toBeVisible();
    await expect(text).toContainText('Typed between lectures');
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${id}`);
  }
});

test('a note knows its module, and the list keeps a module’s notes (IDEA-41)', async ({ sara, run }) => {
  const title = `About a module [e2e ${run.tag}]`;
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = new URL(sara.url()).pathname.split('/').pop() ?? '';
  try {
    await sara.locator('[data-hub="note-title"]').fill(title);
    await sara.locator('[data-hub="note-module"]').click();
    await sara.getByRole('menuitem', { name: /ST2133/ }).click();
    await expect(sara.locator('[data-hub="note-module"]')).toContainText('ST2133');
    await expect
      .poll(async () => (await api<{ moduleId: string | null }>(sara, 'GET', `/api/v1/notes/${id}`)).body.moduleId)
      .toBe('advanced-stats-distribution');

    // A module's notes (the address a lesson's or module's "See all" opens): this one is there, not under ST2134.
    await sara.goto('/notes?module=advanced-stats-distribution');
    await expect(sara.locator('[data-hub="note-row"]', { hasText: title })).toContainText('ST2133');
    await sara.goto('/notes?module=advanced-stats-inferential');
    await expect(
      sara
        .getByText(/^\d+ notes?$/)
        .or(sara.getByText(/No notes/i))
        .first(),
    ).toBeVisible();
    await expect(sara.locator('[data-hub="note-row"]', { hasText: title })).toHaveCount(0);
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${id}`);
  }
});

test('the notes list’s Module filter shows only that module’s notes', async ({ sara, run }) => {
  // ST-61: picking a module sets ?module= and clears ?lesson= in one address update.
  const title = `Filtered by module [e2e ${run.tag}]`;
  const note = await api<{ id: string }>(sara, 'POST', '/api/v1/notes', {
    title,
    moduleId: 'advanced-stats-distribution',
  });
  expect(note.status).toBe(201);
  try {
    await sara.goto('/notes');
    await expect(sara.locator('[data-hub="note-row"]', { hasText: title })).toBeVisible();
    const filter = sara.getByRole('combobox', { name: 'Module' });
    await filter.selectOption('advanced-stats-inferential');
    await expect(sara).toHaveURL(/[?&]module=advanced-stats-inferential/, { timeout: 5_000 });
    await expect(filter).toHaveValue('advanced-stats-inferential');
    await expect(sara.locator('[data-hub="note-row"]', { hasText: title })).toHaveCount(0);
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${note.body.id}`);
  }
});

/** A pointer event from a stylus, dispatched on the writing surface at a point on screen. Pointer id 1 is the mouse's,
 *  the one pointer Chrome always counts as active, so the surface can capture it as it does a real pen. A `pointerout`
 *  with no `relatedTarget` is the pen leaving the screen's range. The pen presses on the page when its tip touches
 *  (`buttons` has 1) or when `touching` says so (the eraser end, which has no contact bit). */
async function pen(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerout',
  x: number,
  y: number,
  init: { button?: number; buttons?: number; pointerType?: string; touching?: boolean } = {},
): Promise<void> {
  await page.locator('[data-hub="note-surface"]').evaluate(
    (el, a) =>
      el.dispatchEvent(
        new PointerEvent(a.type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          isPrimary: true,
          pointerType: a.pointerType,
          clientX: a.x,
          clientY: a.y,
          button: a.button,
          buttons: a.buttons,
          pressure: a.touching ? 0.6 : 0,
        }),
      ),
    {
      type,
      x,
      y,
      button: init.button ?? -1,
      buttons: init.buttons ?? 0,
      pointerType: init.pointerType ?? 'pen',
      touching: init.touching ?? ((init.buttons ?? 0) & 1) !== 0,
    },
  );
}

test('a hovering pen shows a dot where it will land, and the pen’s eraser button erases (stylus)', async ({
  sara,
  run,
}, testInfo) => {
  await sara.setViewportSize({ width: 1180, height: 820 }); // an 11-inch iPad, landscape
  await sara.goto('/notes');
  await sara.locator('[data-hub="note-new"]').click();
  await expect(sara).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  const id = new URL(sara.url()).pathname.split('/').pop() ?? '';
  const ink = async () => (await api<InkSheetOut>(sara, 'GET', `/api/v1/notes/${id}/ink/1000`)).body.strokes;
  const dot = sara.locator('[data-hub="pen-hover"]');
  const radius = async () => Number(await dot.getAttribute('r'));
  try {
    await sara.keyboard.type(`Written with a pen [e2e ${run.tag}]`);
    await expect(sara.locator('[data-hub="note-status"]')).toContainText('Saved in');
    const penTool = sara.getByRole('button', { name: 'Pen', exact: true });
    await penTool.click();
    await expect(penTool).toHaveAttribute('aria-pressed', 'true');
    const text = await sara.locator('[data-hub="note-text"]').boundingBox();
    if (!text) throw new Error('The note has no text box');
    const x = text.x + 40;
    const y = text.y + text.height + 90;
    const shot = (name: string) =>
      sara.screenshot({ path: testInfo.outputPath(name), clip: { x: x - 40, y: y - 90, width: 420, height: 180 } });

    // Hovering: the dot is the pen's (its colour, at least its width), where the tip is.
    await pen(sara, 'pointermove', x, y);
    await expect.poll(radius).toBeGreaterThan(0);
    expect(await dot.evaluate((c) => (c as SVGCircleElement).style.fill)).not.toBe('');
    await shot('hover-dot.png');
    const highlighter = sara.getByRole('button', { name: 'Highlighter', exact: true });
    await highlighter.click();
    await pen(sara, 'pointermove', x + 2, y);
    await expect(dot).toHaveClass(/ink-highlighter/);
    await shot('hover-dot-highlighter.png');
    await penTool.click();

    // Touching down hides it, and the pen writes.
    await pen(sara, 'pointerdown', x, y, { button: 0, buttons: 1 });
    await expect.poll(radius).toBe(0);
    for (let i = 1; i <= 12; i++) await pen(sara, 'pointermove', x + i * 25, y + (i % 2) * 6, { buttons: 1 });
    await pen(sara, 'pointerup', x + 300, y, { button: 0, buttons: 0 });
    await expect.poll(async () => (await ink()).length).toBe(1);
    await shot('written.png');

    // Hovering with the eraser button held shows the eraser's ring.
    await pen(sara, 'pointermove', x + 150, y + 3, { buttons: 32 });
    await expect(dot).toHaveClass(/nb-overlay__eraser/);

    // The eraser button pressed while hovering does nothing until the pen touches.
    await pen(sara, 'pointerdown', x + 150, y + 3, { button: 5, buttons: 32 });
    await pen(sara, 'pointermove', x + 160, y + 3, { buttons: 32 });
    await pen(sara, 'pointerup', x + 160, y + 3, { button: 5, buttons: 0 });
    await sara.waitForTimeout(400);
    expect((await ink()).length).toBe(1);

    // The eraser button held across the line erases it; the pen is still the tool afterwards.
    await pen(sara, 'pointerdown', x - 10, y, { button: 5, buttons: 32, touching: true });
    for (let i = 1; i <= 8; i++) await pen(sara, 'pointermove', x + i * 40, y + 3, { buttons: 32, touching: true });
    await shot('erasing-by-button.png');
    await pen(sara, 'pointerup', x + 320, y, { button: 5, buttons: 0 });
    await expect.poll(async () => (await ink()).length).toBe(0);
    await expect(penTool).toHaveAttribute('aria-pressed', 'true');
    await shot('erased-by-button.png');

    // The eraser button pressed mid-line: the line so far stays, and the pen erases from there on.
    const y2 = y + 50;
    await pen(sara, 'pointerdown', x, y2, { button: 0, buttons: 1 });
    for (let i = 1; i <= 6; i++) await pen(sara, 'pointermove', x + i * 25, y2 + (i % 2) * 6, { buttons: 1 });
    // pressed right where the line ends, inside the eraser's reach of it
    await pen(sara, 'pointermove', x + 152, y2, { buttons: 33 });
    for (let i = 7; i <= 10; i++) await pen(sara, 'pointermove', x + i * 25, y2 + 20, { buttons: 33 });
    await pen(sara, 'pointerup', x + 250, y2, { button: 0, buttons: 0 });
    await expect.poll(async () => (await ink()).length).toBe(1);
    await shot('switched-mid-line.png');
    const undo = sara.getByRole('button', { name: 'Undo', exact: true });
    await undo.click();
    await expect.poll(async () => (await ink()).length).toBe(0);

    // The pen leaving hides the dot; a finger touching down hides it; a mouse never shows one.
    await pen(sara, 'pointermove', x, y);
    await expect.poll(radius).toBeGreaterThan(0);
    await pen(sara, 'pointerout', x, y); // the pen out of range (React's onPointerLeave comes from pointerout)
    await expect.poll(radius).toBe(0);
    await pen(sara, 'pointermove', x, y);
    await expect.poll(radius).toBeGreaterThan(0);
    await pen(sara, 'pointerdown', x + 200, y + 40, { pointerType: 'touch', button: 0, buttons: 1 });
    await expect.poll(radius).toBe(0);
    await pen(sara, 'pointerup', x + 200, y + 40, { pointerType: 'touch', button: 0, buttons: 0 });
    await pen(sara, 'pointermove', x, y, { pointerType: 'mouse' });
    await expect.poll(radius).toBe(0);
  } finally {
    await api(sara, 'DELETE', `/api/v1/notes/${id}`);
  }
});
