import { describe, expect, it } from 'vitest';
import {
  avoid,
  clampPoint,
  edgeClip,
  fromAnchor,
  hintSide,
  homePoint,
  laneWidth,
  LANE_PAD,
  nearestSide,
  perchOnSheet,
  placeChat,
  restPoint,
  toAnchor,
  type View,
} from './layout';
import { HEIGHT, figure } from './sprites';

// A laptop with the rail (264 px) on the left; a phone; a very wide screen where the shell is centred (2000 px).
const laptop: View = { w: 1440, h: 900, ceiling: 64, floor: 900, left: 264, right: 1440 };
const phone: View = { w: 390, h: 844, ceiling: 56, floor: 780, left: 0, right: 390 };
const ultra: View = { w: 2560, h: 1440, ceiling: 64, floor: 1440, left: 544, right: 2280 };
const box = { w: 54, h: 112 };

describe('her lane', () => {
  it('is as wide as the room the pages keep for it (Mascot.css: 70 px wide, 60 px below 1100 px)', () => {
    expect(laneWidth(figure(HEIGHT.desktop))).toBe(70);
    expect(laneWidth(figure(HEIGHT.compact))).toBe(60);
  });

  it('starts her at the bottom of the right lane', () => {
    expect(homePoint(laptop, box)).toEqual({ x: 1440 - 54 - LANE_PAD, y: 900 - 112 - 16 });
  });

  it('has its left lane beside the rail, not under it', () => {
    expect(restPoint('left', 100, laptop, box).x).toBe(264 + LANE_PAD);
  });

  it('keeps to the shell on a very wide screen', () => {
    expect(homePoint(ultra, box).x).toBe(2280 - 54 - LANE_PAD);
  });

  it('never stands under the top bar or the tab bar', () => {
    expect(restPoint('right', 5000, phone, box).y).toBe(56 + 8);
    expect(restPoint('right', -50, phone, box).y).toBe(780 - 112 - 8);
  });
});

describe('carrying her', () => {
  it('keeps her inside the window band', () => {
    expect(clampPoint({ x: -50, y: 0 }, phone, box)).toEqual({ x: 8, y: 64 });
    expect(clampPoint({ x: 999, y: 999 }, phone, box)).toEqual({ x: 390 - 54 - 8, y: 780 - 112 - 8 });
  });

  it('lets her go into the lane nearer the middle of the page column, at her height', () => {
    // The page column runs from 264 to 1440: its middle is 852.
    expect(nearestSide({ x: 700, y: 300 }, laptop, box)).toBe('left');
    expect(nearestSide({ x: 900, y: 300 }, laptop, box)).toBe('right');
    const anchor = toAnchor({ x: 400, y: 300 }, laptop, box);
    expect(anchor).toEqual({ side: 'left', lift: 900 - 412 });
    expect(fromAnchor(anchor, laptop, box)).toEqual({ x: 264 + LANE_PAD, y: 300 });
  });

  it('ignores a stored anchor that is not one', () => {
    expect(fromAnchor({ corner: 'br', dx: 1, dy: 2 }, laptop, box)).toBeNull();
    expect(fromAnchor({ side: 'right', lift: Number.NaN }, laptop, box)).toBeNull();
    expect(fromAnchor('right', laptop, box)).toBeNull();
  });
});

describe('keeping off controls', () => {
  it('stays put when she covers nothing', () => {
    const at = { x: 1378, y: 600 };
    expect(avoid(at, laptop, box, [{ x: 100, y: 600, w: 120, h: 40 }])).toBe(at);
  });

  it('moves along her lane to clear a control that reaches into it', () => {
    const at = { x: 1378, y: 600 };
    const bar = { x: 264, y: 650, w: 1176, h: 44 };
    const next = avoid(at, laptop, box, [bar]);
    expect(next.x).toBe(1378);
    expect(next.y + box.h).toBeLessThanOrEqual(bar.y - 8);
  });

  it('stays put when no height is clear', () => {
    const at = { x: 1378, y: 600 };
    expect(avoid(at, laptop, box, [{ x: 1300, y: 0, w: 140, h: 900 }])).toBe(at);
  });
});

describe('her first-visit hint', () => {
  const bubble = { w: 260, h: 96 };

  it('never covers the page: no room beside her on a laptop', () => {
    const page = { left: 304, right: 1370 };
    expect(hintSide(homePoint(laptop, box), laptop, box, page, bubble)).toBeNull();
  });

  it('goes into the empty margin of a very wide screen, outside the shell first', () => {
    const page = { left: 717, right: 2057 };
    expect(hintSide(homePoint(ultra, box), ultra, box, page, bubble)).toBe('right');
  });

  it('takes the side towards the page when that side is clear of it', () => {
    const wide: View = { w: 1920, h: 1080, ceiling: 64, floor: 1080, left: 264, right: 1920 };
    expect(hintSide(homePoint(wide, box), wide, box, { left: 400, right: 1500 }, bubble)).toBe('left');
    expect(hintSide(homePoint(wide, box), wide, box, { left: 400, right: 1700 }, bubble)).toBeNull();
  });

  it('waits while the page is not known, or when it would reach under the top bar', () => {
    expect(hintSide(homePoint(ultra, box), ultra, box, null, bubble)).toBeNull();
    expect(hintSide({ x: 2218, y: 80 }, ultra, box, { left: 717, right: 2057 }, bubble)).toBeNull();
  });
});

describe('where the chat goes', () => {
  it('opens beside her on the side with room, level with her feet', () => {
    const at = homePoint(laptop, box);
    const place = placeChat(at, laptop, box);
    expect(place.sheet).toBe(false);
    expect(place.side).toBe('left');
    expect(place.left + place.width).toBeLessThanOrEqual(at.x);
    expect(place.top + place.height).toBe(at.y + box.h);
  });

  it('stays inside the band on a short window', () => {
    const short: View = { w: 844, h: 390, ceiling: 64, floor: 390, left: 72, right: 844 };
    const place = placeChat(homePoint(short, box), short, box);
    expect(place.top).toBeGreaterThanOrEqual(64);
    expect(place.top + place.height).toBeLessThanOrEqual(390);
  });

  it('covers the whole window on a short screen (a phone on its side), so her answers have room', () => {
    const landscape: View = { w: 844, h: 390, ceiling: 64, floor: 390, left: 72, right: 844 };
    const place = placeChat(homePoint(landscape, box), landscape, box, { short: true });
    expect(place).toMatchObject({ sheet: true, full: true, top: 0, left: 0, width: 844, height: 390 });
  });

  it('is a sheet above the tab bar on a phone, with her on top of it', () => {
    const place = placeChat(homePoint(phone, box), phone, box, { phone: true });
    expect(place.sheet).toBe(true);
    expect(place.top + place.height).toBe(780);
    const perch = perchOnSheet(place, phone, box);
    expect(perch.y).toBeGreaterThanOrEqual(phone.ceiling);
  });
});

describe('her canvas at the window’s edge', () => {
  const small = figure(HEIGHT.compact);
  it('trims the empty margin that would run past the right edge (a phone on its side, UX-87)', () => {
    const at = homePoint({ w: 844, h: 390, ceiling: 56, floor: 390, left: 0, right: 844 }, small);
    const clip = edgeClip(at, small, small.canvas, 844);
    expect(clip).toBe(`inset(-100% -${844 - at.x - small.w}px -100% ${Math.round(small.canvas.left)}px)`);
  });

  it('leaves her alone where the canvas fits', () => {
    expect(edgeClip({ x: 400, y: 200 }, small, small.canvas, 1440)).toBeNull();
  });
});
