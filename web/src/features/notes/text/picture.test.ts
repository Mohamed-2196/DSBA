import { describe, expect, it } from 'vitest';
import {
  FULL,
  MIN_CROP,
  MIN_WIDTH,
  clampCrop,
  cropAttrs,
  dragCrop,
  fromShown,
  nextTurn,
  pictureAttrs,
  placeAt,
  resized,
  shownRatio,
  startWidth,
  toShown,
  type Rect,
  type Turn,
} from './picture';

const close = (a: Rect, b: Rect) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k]).toBeCloseTo(b[k], 6);
};

describe('picture attributes', () => {
  it('fills in what is missing and keeps values in range', () => {
    const p = pictureAttrs({ upload: 'u1', width: 7, x: -2, ratio: 'wide', rotate: 45, cropX: 0.9, cropW: 0.5 });
    expect(p).toEqual({
      upload: 'u1',
      alt: '',
      caption: '',
      width: 1,
      x: 0,
      ratio: 4 / 3,
      rotate: 0,
      crop: { x: 0.5, y: 0, w: 0.5, h: 1 },
    });
    expect(pictureAttrs({ width: 0.01 }).width).toBe(MIN_WIDTH);
    expect(pictureAttrs({ rotate: 270 }).rotate).toBe(270);
  });

  it('keeps a crop inside the picture, never smaller than the least crop', () => {
    expect(clampCrop({ x: -1, y: 0.99, w: 0, h: 2 })).toEqual({ x: 0, y: 0, w: MIN_CROP, h: 1 });
    expect(cropAttrs({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({ cropX: 0.1, cropY: 0.2, cropW: 0.3, cropH: 0.4 });
  });
});

describe('turning and cropping', () => {
  it('maps a crop to what is shown and back, for every turn', () => {
    const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.3 };
    for (const t of [0, 90, 180, 270] as Turn[]) close(fromShown(toShown(crop, t), t), crop);
    // turned clockwise, the top-left of the picture is shown top-right
    close(toShown({ x: 0, y: 0, w: 0.25, h: 0.5 }, 90), { x: 0.5, y: 0, w: 0.5, h: 0.25 });
    close(toShown({ x: 0, y: 0, w: 0.25, h: 0.5 }, 180), { x: 0.75, y: 0.5, w: 0.25, h: 0.5 });
    close(toShown({ x: 0, y: 0, w: 0.25, h: 0.5 }, 270), { x: 0, y: 0.75, w: 0.5, h: 0.25 });
  });

  it('works out the shape shown', () => {
    expect(shownRatio({ ratio: 2, rotate: 0, crop: FULL })).toBe(2);
    expect(shownRatio({ ratio: 2, rotate: 90, crop: FULL })).toBe(0.5);
    expect(shownRatio({ ratio: 2, rotate: 0, crop: { x: 0, y: 0, w: 0.5, h: 1 } })).toBe(1);
    expect(nextTurn(270)).toBe(0);
    expect(nextTurn(90)).toBe(180);
  });

  it('moves the edges a handle holds, and the whole crop from inside it', () => {
    const r = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
    close(dragCrop(r, { right: true, bottom: true }, 0.1, -0.1), { x: 0.2, y: 0.2, w: 0.6, h: 0.4 });
    close(dragCrop(r, { left: true }, -0.5, 0), { x: 0, y: 0.2, w: 0.7, h: 0.5 }); // stops at the picture's edge
    close(dragCrop(r, { top: true }, 0, 0.9), { x: 0.2, y: 0.7 - MIN_CROP, w: 0.5, h: MIN_CROP }); // never inside out
    close(dragCrop(r, {}, 0.6, -0.6), { x: 0.5, y: 0, w: 0.5, h: 0.5 });
  });
});

describe('size and place', () => {
  it('resizes from a corner, keeping the other side still', () => {
    // half the width, in the middle: its left edge is at 0.25
    expect(resized({ width: 0.5, x: 0.5 }, 0.1, false)).toEqual({ width: 0.6, x: 0.625 }); // left edge stays at 0.25
    expect(resized({ width: 0.5, x: 0.5 }, 0.1, true)).toEqual({ width: 0.6, x: 0.375 }); // right edge stays at 0.75
    expect(resized({ width: 0.9, x: 0 }, 0.5, false)).toEqual({ width: 1, x: 0.5 });
    expect(resized({ width: 0.5, x: 0 }, -1, false).width).toBe(MIN_WIDTH);
  });

  it('places a picture across the text, snapping to the margins and the middle', () => {
    expect(placeAt(0.5, 0)).toBe(0);
    expect(placeAt(0.5, 0.26)).toBe(0.5);
    expect(placeAt(0.5, 0.49)).toBe(1);
    expect(placeAt(0.5, 0.1)).toBe(0.2);
    expect(placeAt(1, 0.3)).toBe(0.5);
  });

  it('starts at its own size, up to the text’s width', () => {
    expect(startWidth(1600, 656)).toBe(1);
    expect(startWidth(328, 656)).toBe(0.5);
    expect(startWidth(20, 656)).toBe(0.25);
  });
});
