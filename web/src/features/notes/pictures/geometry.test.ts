import { describe, expect, it } from 'vitest';
import { PAPER_BASE, SHEET_HEIGHT, SHEET_WIDTH, TEXT_SIDE, TEXT_WIDTH } from '../surface/layout';
import { FULL, pictureAttrs } from '../text/picture';
import {
  MIN_SIZE,
  angleTowards,
  bounds,
  broughtForward,
  croppedTo,
  freeFromInline,
  fromStored,
  inlineFromFree,
  keptAcross,
  landed,
  middle,
  movedBy,
  normAngle,
  pictureWords,
  picturesFrom,
  placedPicture,
  quarterTurned,
  resizedTo,
  sentBackward,
  settle,
  snapAngle,
  toStored,
  turn,
  wholeOf,
  type FreePicture,
} from './geometry';

const pic = (changes: Partial<FreePicture> = {}): FreePicture => ({
  id: 'p1',
  upload: 'u1',
  sheet: PAPER_BASE,
  x: 100,
  y: 200,
  w: 300,
  h: 200,
  angle: 0,
  ratio: 1.5,
  crop: FULL,
  alt: '',
  caption: '',
  ...changes,
});

const near = (a: number, b: number, digits = 1) => expect(a).toBeCloseTo(b, digits);

describe('stored and read back', () => {
  it('keeps a picture as the document stores it, and reads it back the same', () => {
    const p = pic({ angle: 30, crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }, alt: 'Normal curve', caption: 'Week 4' });
    const stored = toStored(p);
    expect(stored).toMatchObject({ cropX: 0.1, cropY: 0.2, cropW: 0.5, cropH: 0.6, angle: 30, sheet: PAPER_BASE });
    expect(fromStored(JSON.parse(JSON.stringify(stored)))).toEqual(p);
  });

  it('leaves out what isn’t a picture, and repeats, and brings numbers in range', () => {
    const list = picturesFrom([
      toStored(pic()),
      toStored(pic()), // the same id again
      { ...toStored(pic({ id: 'p2' })), upload: '' },
      { ...toStored(pic({ id: 'p3' })), sheet: 1.5 },
      { ...toStored(pic({ id: 'p4' })), angle: 725, w: 5000, cropW: 9, ratio: 'wide' },
      'not a picture',
    ]);
    expect(list.map((p) => p.id)).toEqual(['p1', 'p4']);
    expect(list[1]).toMatchObject({ angle: 5, w: SHEET_WIDTH, crop: FULL, ratio: SHEET_WIDTH / 200 });
    expect(picturesFrom(null)).toEqual([]);
  });
});

describe('the turned box', () => {
  it('turns clockwise, as on the page', () => {
    const v = turn({ x: 1, y: 0 }, 90);
    near(v.x, 0, 6);
    near(v.y, 1, 6); // pointing right, turned a quarter clockwise: pointing down
    expect(normAngle(-90)).toBe(270);
    expect(normAngle(360)).toBe(0);
    expect(normAngle(359.999)).toBe(0);
  });

  it('finds the upright box a turned picture fills', () => {
    expect(bounds(pic())).toEqual({ x: 100, y: 200, w: 300, h: 200 });
    const b = bounds(pic({ angle: 90 }));
    near(b.w, 200);
    near(b.h, 300);
    near(b.x, 150); // the middle stays at 250, 300
    near(b.y, 150);
    near(bounds(pic({ angle: 45 })).w, (300 + 200) / Math.SQRT2);
  });

  it('settles a picture on its page: whole where it fits, in the middle where it doesn’t', () => {
    expect(settle(pic(), SHEET_HEIGHT)).toEqual(pic());
    expect(settle(pic({ x: -50, y: SHEET_HEIGHT - 100 }), SHEET_HEIGHT)).toMatchObject({ x: 0, y: SHEET_HEIGHT - 200 });
    expect(settle(pic({ x: 700 }), SHEET_HEIGHT).x).toBe(SHEET_WIDTH - 300);
    // turned a quarter, it is 200 wide: it settles by its turned box
    const turned = settle(pic({ x: -100, angle: 90 }), SHEET_HEIGHT);
    near(bounds(turned).x, 0);
    // taller than a short PDF page: its middle goes to the page's middle
    const tall = settle(pic({ h: 900, y: 0 }), 600);
    near(middle(tall).y, 300);
  });
});

describe('resizing from a corner', () => {
  it('keeps the opposite corner still and the shape', () => {
    const p = pic();
    const r = resizedTo(p, 'se', { x: 700, y: 600 }, { keepShape: true, height: SHEET_HEIGHT });
    expect(r.x).toBe(100);
    expect(r.y).toBe(200);
    near(r.w / r.h, 1.5, 6);
    expect(r.w).toBeGreaterThan(300);
    const nw = resizedTo(p, 'nw', { x: 250, y: 300 }, { keepShape: true, height: SHEET_HEIGHT });
    near(nw.x + nw.w, 400); // the bottom right corner stays
    near(nw.y + nw.h, 400);
    near(nw.w / nw.h, 1.5, 6);
  });

  it('stretches when the shape isn’t kept', () => {
    const r = resizedTo(pic(), 'se', { x: 500, y: 300 }, { keepShape: false, height: SHEET_HEIGHT });
    expect(r).toMatchObject({ x: 100, y: 200, w: 400, h: 100 });
  });

  it('stays between the smallest size and the page', () => {
    const tiny = resizedTo(pic(), 'se', { x: 0, y: 0 }, { keepShape: true, height: SHEET_HEIGHT });
    near(tiny.h, MIN_SIZE);
    const huge = resizedTo(pic(), 'se', { x: 5000, y: 5000 }, { keepShape: true, height: SHEET_HEIGHT });
    near(huge.w, SHEET_WIDTH);
    const free = resizedTo(pic(), 'sw', { x: 399, y: 5000 }, { keepShape: false, height: 600 });
    expect(free.h).toBe(600);
    expect(free.w).toBe(MIN_SIZE);
  });

  it('resizes a turned picture in its own frame', () => {
    // turned a quarter clockwise, the picture's own width runs down the page and its height across it: its own
    // bottom left corner is at the top left of the box it fills (150, 150)
    const p = pic({ angle: 90 });
    const r = resizedTo(p, 'ne', { x: 450, y: 450 }, { keepShape: false, height: SHEET_HEIGHT });
    expect(r.angle).toBe(90);
    expect([r.w, r.h]).toEqual([300, 300]); // its height grew from 200 to 300, across the page
    const box = bounds(r);
    near(box.x, 150); // the corner that stays, stays
    near(box.y, 150);
  });
});

describe('turning', () => {
  it('points the top at the pointer, snapping to quarter turns', () => {
    const p = pic(); // its middle is at 250, 300
    expect(angleTowards(p, { x: 250, y: 100 })).toBe(0);
    expect(angleTowards(p, { x: 450, y: 300 })).toBe(90);
    expect(angleTowards(p, { x: 250, y: 500 })).toBe(180);
    expect(angleTowards(p, { x: 50, y: 300 })).toBe(270);
    expect(angleTowards(p, { x: 260, y: 100 })).toBe(0); // 2.9 degrees off: snapped
    near(angleTowards(p, { x: 450, y: 100 }), 45, 6);
    expect(snapAngle(50, true)).toBe(45);
    expect(snapAngle(358)).toBe(0);
    expect(snapAngle(20)).toBe(20);
  });

  it('turns a quarter at a time', () => {
    expect(quarterTurned(pic({ angle: 270 })).angle).toBe(0);
    expect(quarterTurned(pic({ angle: 10 })).angle).toBe(100);
  });
});

describe('cropping', () => {
  it('shows the whole picture around the part kept, at the same scale', () => {
    const p = pic({ crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }); // the right half of a 600 x 200 picture
    expect(wholeOf(p)).toEqual({ x: -200, y: 200, w: 600, h: 200 });
  });

  it('keeps the part kept where it is on the page', () => {
    const p = pic();
    const left = croppedTo(p, { x: 0, y: 0, w: 0.5, h: 1 });
    expect(left).toMatchObject({ x: 100, y: 200, w: 150, h: 200, crop: { x: 0, y: 0, w: 0.5, h: 1 } });
    const back = croppedTo(left, FULL);
    expect(back).toMatchObject({ x: 100, y: 200, w: 300, h: 200 });
  });

  it('keeps it in place when it is turned', () => {
    const p = pic({ angle: 90 });
    const top = croppedTo(p, { x: 0, y: 0, w: 1, h: 0.5 }); // the picture's own top half: on the page, its right
    expect(top.w).toBe(300);
    expect(top.h).toBe(100);
    const m = middle(top);
    near(m.x, 250 + 50); // turned clockwise, the picture's top is on the right
    near(m.y, 300);
  });
});

describe('one above the other', () => {
  const a = pic({ id: 'a' });
  const b = pic({ id: 'b', x: 300 }); // overlaps a
  const c = pic({ id: 'c', x: 600, y: 900 }); // overlaps neither
  const d = pic({ id: 'd', sheet: PAPER_BASE + 1 }); // another page
  const ids = (list: FreePicture[] | null) => list?.map((p) => p.id) ?? null;

  it('brings a picture above the next one it overlaps', () => {
    expect(ids(broughtForward([a, c, b, d], 'a'))).toEqual(['c', 'b', 'a', 'd']);
    expect(broughtForward([a, b], 'b')).toBeNull();
    expect(broughtForward([c, a, d], 'c')).toBeNull();
  });

  it('sends a picture below the one before it that it overlaps', () => {
    expect(ids(sentBackward([a, c, b, d], 'b'))).toEqual(['b', 'a', 'c', 'd']);
    expect(sentBackward([a, b], 'a')).toBeNull();
    expect(sentBackward([a, d], 'd')).toBeNull();
  });
});

describe('new pictures', () => {
  it('lands where it was dropped, at most START units on its longer side', () => {
    const p = placedPicture(
      { upload: 'u', alt: 'Slide', width: 2400, height: 1200 },
      PAPER_BASE,
      { x: 400, y: 500 },
      SHEET_HEIGHT,
      'n1',
    );
    expect(p).toMatchObject({ id: 'n1', w: 400, h: 200, x: 200, y: 400, angle: 0, crop: FULL, alt: 'Slide' });
    near(p.ratio, 2, 6);
  });

  it('makes a small one larger, up to twice its size, and keeps it on the page', () => {
    const p = placedPicture({ upload: 'u', alt: '', width: 50, height: 40 }, PAPER_BASE, { x: 5, y: 5 }, SHEET_HEIGHT);
    expect(p).toMatchObject({ w: 100, h: 80, x: 0, y: 0 });
    const strip = placedPicture(
      { upload: 'u', alt: '', width: 4000, height: 50 },
      PAPER_BASE,
      { x: 400, y: 9 },
      SHEET_HEIGHT,
    );
    expect(strip.h).toBe(MIN_SIZE);
    expect(strip.w).toBe(SHEET_WIDTH);
    expect(strip.ratio).toBe(20);
  });
});

describe('in the text and free', () => {
  it('makes a picture in the text free where it shows', () => {
    const a = pictureAttrs({ upload: 'u', alt: 'Graph', width: 0.5, ratio: 2, rotate: 90, cropX: 0.1, cropW: 0.9 });
    const free = freeFromInline(a, PAPER_BASE, { x: 300, y: 100, w: 150, h: 300 }, 'f1');
    expect(free).toMatchObject({ id: 'f1', sheet: PAPER_BASE, angle: 90, w: 300, h: 150, alt: 'Graph' });
    expect(middle(free)).toEqual({ x: 375, y: 250 });
    expect(bounds(free).w).toBeCloseTo(150, 6);
  });

  it('puts a free picture in the text at its nearest quarter turn and its own shape', () => {
    const p = pic({
      angle: 80,
      w: 328,
      h: 100,
      x: TEXT_SIDE + TEXT_WIDTH - 328 - 0,
      crop: { x: 0, y: 0, w: 0.5, h: 1 },
    });
    const attrs = inlineFromFree(p);
    expect(attrs).toMatchObject({ rotate: 90, width: 0.1524, cropW: 0.5 }); // 100 of the text's 656 units
    const upright = inlineFromFree(pic({ w: TEXT_WIDTH / 2, x: TEXT_SIDE }));
    expect(upright).toMatchObject({ rotate: 0, width: 0.5, x: 0 });
  });

  it('reads the pictures’ words page by page, top to bottom', () => {
    const list = [
      pic({ id: 'a', y: 500, caption: 'Second' }),
      pic({ id: 'b', sheet: PAPER_BASE + 1, y: 0, alt: 'Third' }),
      pic({ id: 'c', y: 10, caption: ' First ', alt: 'its description' }),
    ];
    expect(pictureWords(list)).toEqual(['First', 'its description', 'Second', 'Third']);
  });

  it('lands a dragged picture on the page under its middle', () => {
    const sheets = [
      { index: 0, top: 0, height: 1000 },
      { index: PAPER_BASE, top: 1024, height: SHEET_HEIGHT },
      { index: PAPER_BASE + 1, top: 1024 + SHEET_HEIGHT, height: SHEET_HEIGHT },
    ];
    // dragged down the first page of paper until its middle is on the second
    expect(landed(pic({ y: 1300 }), sheets[1], sheets)).toMatchObject({ sheet: PAPER_BASE + 1, y: 180 });
    // across the page break: on the page its middle is on, wholly
    expect(landed(pic({ y: 1050 }), sheets[1], sheets)).toMatchObject({ sheet: PAPER_BASE + 1, y: 0 });
    expect(landed(pic({ y: 1000 }), sheets[1], sheets)).toMatchObject({ sheet: PAPER_BASE, y: SHEET_HEIGHT - 200 });
    // up onto the PDF's page above, and past the end of the column
    expect(landed(pic({ y: -400 }), sheets[1], sheets).sheet).toBe(0);
    expect(landed(pic({ y: 5000 }), sheets[1], sheets)).toMatchObject({ sheet: PAPER_BASE + 1, y: SHEET_HEIGHT - 200 });
  });

  it('keeps a dragged picture within the page’s width', () => {
    expect(keptAcross(pic({ x: -60, y: -500 }))).toMatchObject({ x: 0, y: -500 });
    expect(keptAcross(pic({ x: 700 })).x).toBe(SHEET_WIDTH - 300);
  });

  it('moves by a step', () => {
    expect(movedBy(pic(), 4, -32)).toMatchObject({ x: 104, y: 168 });
  });
});
