import { describe, expect, it } from 'vitest';
import { avoid, clampPoint, fromAnchor, homePoint, perchOnSheet, placeChat, toAnchor, type View } from './layout';

const laptop: View = { w: 1440, h: 900, ceiling: 64, floor: 900 };
const phone: View = { w: 390, h: 844, ceiling: 56, floor: 780 };
const box = { w: 56, h: 112 };

describe('where she stands', () => {
  it('starts at the bottom right, on the floor', () => {
    expect(homePoint(laptop, box, false)).toEqual({ x: 1440 - 56 - 8, y: 900 - 112 - 16 });
    expect(homePoint(phone, box, true).y + box.h).toBeLessThanOrEqual(780);
  });

  it('never goes under the top bar or the tab bar', () => {
    expect(clampPoint({ x: -50, y: 0 }, phone, box)).toEqual({ x: 8, y: 64 });
    expect(clampPoint({ x: 999, y: 999 }, phone, box)).toEqual({ x: 390 - 56 - 8, y: 780 - 112 - 8 });
  });

  it('snaps to the nearer edge and keeps her height', () => {
    const anchor = toAnchor({ x: 400, y: 300 }, laptop, box);
    expect(anchor).toEqual({ side: 'left', lift: 900 - 412 });
    expect(fromAnchor(anchor, laptop, box)).toEqual({ x: 8, y: 300 });
    expect(toAnchor({ x: 1000, y: 300 }, laptop, box).side).toBe('right');
  });

  it('ignores a stored anchor that is not one', () => {
    expect(fromAnchor({ corner: 'br', dx: 1, dy: 2 }, laptop, box)).toBeNull();
    expect(fromAnchor({ side: 'right', lift: Number.NaN }, laptop, box)).toBeNull();
    expect(fromAnchor('right', laptop, box)).toBeNull();
  });
});

describe('keeping off controls', () => {
  it('stays put when she covers nothing', () => {
    const at = { x: 1376, y: 600 };
    expect(avoid(at, laptop, box, [{ x: 100, y: 600, w: 120, h: 40 }])).toBe(at);
  });

  it('moves along her edge to clear a primary button', () => {
    const at = { x: 1376, y: 600 };
    const button = { x: 1300, y: 650, w: 120, h: 44 };
    const next = avoid(at, laptop, box, [button]);
    expect(next.x).toBe(1376);
    expect(next.y + box.h).toBeLessThanOrEqual(button.y - 8);
  });

  it('stays put when no height is clear', () => {
    const at = { x: 1376, y: 600 };
    expect(avoid(at, laptop, box, [{ x: 1300, y: 0, w: 140, h: 900 }])).toBe(at);
  });
});

describe('where the chat goes', () => {
  it('opens beside her on the side with room, level with her feet', () => {
    const at = homePoint(laptop, box, false);
    const place = placeChat(at, laptop, box);
    expect(place.sheet).toBe(false);
    expect(place.side).toBe('left');
    expect(place.left + place.width).toBeLessThanOrEqual(at.x);
    expect(place.top + place.height).toBe(at.y + box.h);
  });

  it('stays inside the band on a short window', () => {
    const short: View = { w: 844, h: 390, ceiling: 64, floor: 390 };
    const place = placeChat(homePoint(short, box, false), short, box);
    expect(place.top).toBeGreaterThanOrEqual(64);
    expect(place.top + place.height).toBeLessThanOrEqual(390);
  });

  it('covers the whole window on a short screen (a phone on its side), so her answers have room', () => {
    const landscape: View = { w: 844, h: 390, ceiling: 64, floor: 390 };
    const place = placeChat(homePoint(landscape, box, false), landscape, box, { short: true });
    expect(place).toMatchObject({ sheet: true, full: true, top: 0, left: 0, width: 844, height: 390 });
  });

  it('is a sheet above the tab bar on a phone, with her on top of it', () => {
    const place = placeChat(homePoint(phone, box, true), phone, box, { phone: true });
    expect(place.sheet).toBe(true);
    expect(place.top + place.height).toBe(780);
    const perch = perchOnSheet(place, phone, box);
    expect(perch.y).toBeGreaterThanOrEqual(phone.ceiling);
  });
});
