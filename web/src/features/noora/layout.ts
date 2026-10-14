// Where Mini Noora and her chat go on screen. Pure geometry, no DOM and no React:
//   view  { w, h, ceiling, floor }  the window, and the band she keeps to: below the top bar, above the phone tab bar
//   box   { w, h }                  the space she fills
//   point { x, y }                  the top-left corner of that space
//   rect  { x, y, w, h }            a control she must not cover (a primary button, say)

export interface View {
  w: number;
  h: number;
  /** the line she may not stand above (the bottom of the top bar) */
  ceiling: number;
  /** the line she may not stand below (the top of the phone tab bar, else the bottom of the window) */
  floor: number;
}
export interface Box {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point, Box {}
export type Side = 'left' | 'right';

/** Where she rests, as it is remembered: the edge she stands at and her height above the floor. */
export interface Anchor {
  side: Side;
  /** px from her feet to the floor */
  lift: number;
}

export interface ChatPlace {
  /** a sheet along the bottom (phones), else a card beside her */
  sheet: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  /** which side of her the card is on */
  side: Side;
}

const EDGE = 8; // she never touches the edge of the window
const HOME_LIFT = { desktop: 24, phone: 12 }; // where she starts: bottom right, just above the floor
const CHAT = { width: 384, height: 560, gap: 16, edge: 12 };
const SHEET = { height: 560, headroom: 20 }; // phones: the chat is a sheet and she stands on top of it
const CLEAR = 8; // px she keeps from a control she must not cover

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), Math.max(min, max));

/** Keep a point inside her band of the window. */
export function clampPoint(point: Point, view: View, box: Box): Point {
  return {
    x: Math.round(clamp(point.x, EDGE, view.w - box.w - EDGE)),
    y: Math.round(clamp(point.y, view.ceiling + EDGE, view.floor - box.h - EDGE)),
  };
}

/** The edge nearer to a point: she is let go there and snaps to it. */
export function nearestSide(point: Point, view: View, box: Box): Side {
  return point.x + box.w / 2 < view.w / 2 ? 'left' : 'right';
}

/** Where she is let go, as an anchor: the nearer edge, and how high she stands. */
export function toAnchor(point: Point, view: View, box: Box): Anchor {
  const p = clampPoint(point, view, box);
  return { side: nearestSide(p, view, box), lift: Math.max(0, Math.round(view.floor - (p.y + box.h))) };
}

/** The point an anchor stands for in this window, or null when it is not a usable anchor (it comes from storage). */
export function fromAnchor(anchor: unknown, view: View, box: Box): Point | null {
  if (!anchor || typeof anchor !== 'object') return null;
  const { side, lift } = anchor as Record<string, unknown>;
  if ((side !== 'left' && side !== 'right') || typeof lift !== 'number' || !Number.isFinite(lift)) return null;
  return clampPoint({ x: side === 'left' ? EDGE : view.w - box.w - EDGE, y: view.floor - box.h - lift }, view, box);
}

/** Where she starts: the bottom-right corner, just above the floor. */
export function homePoint(view: View, box: Box, phone: boolean): Point {
  const lift = phone ? HOME_LIFT.phone : HOME_LIFT.desktop;
  return clampPoint({ x: view.w - box.w - EDGE, y: view.floor - box.h - lift }, view, box);
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Keep her off the controls that matter: if she would cover one, she moves up or down her edge to the nearest
 * height where she covers none. With no such height she stays where she is.
 */
export function avoid(point: Point, view: View, box: Box, controls: readonly Rect[]): Point {
  const near = controls.map((c) => ({ x: c.x - CLEAR, y: c.y - CLEAR, w: c.w + 2 * CLEAR, h: c.h + 2 * CLEAR }));
  const free = (y: number) => !near.some((c) => overlaps({ x: point.x, y, w: box.w, h: box.h }, c));
  if (free(point.y)) return point;
  const top = view.ceiling + EDGE;
  const bottom = view.floor - box.h - EDGE;
  // Every height that puts her just clear of a control, nearest first.
  const tries = near
    .flatMap((c) => [c.y - box.h, c.y + c.h])
    .filter((y) => y >= top && y <= bottom)
    .sort((a, b) => Math.abs(a - point.y) - Math.abs(b - point.y));
  const y = tries.find(free);
  return y == null ? point : { x: point.x, y: Math.round(y) };
}

/**
 * Where the chat goes.
 * Wider screens: a card beside her, on the side with room (it stays on the side it is on for as long as it fits),
 * its bottom level with her feet, always inside her band. With no room either side, above or below her.
 * Phones: a sheet along the bottom, above the tab bar, with room for her to stand on top of it.
 */
export function placeChat(point: Point, view: View, box: Box, { phone = false, prefer = null }: { phone?: boolean; prefer?: Side | null } = {}): ChatPlace {
  if (phone) {
    const height = Math.round(clamp(view.floor - view.ceiling - box.h - SHEET.headroom, 260, SHEET.height));
    return { sheet: true, left: 0, top: view.floor - height, width: view.w, height, side: 'left' };
  }

  const width = Math.min(CHAT.width, view.w - 2 * CHAT.edge);
  const band = { top: view.ceiling + CHAT.edge, bottom: view.floor - CHAT.edge };
  const height = Math.min(CHAT.height, band.bottom - band.top);
  const room: Record<Side, number> = {
    left: point.x - CHAT.gap - CHAT.edge,
    right: view.w - (point.x + box.w) - CHAT.gap - CHAT.edge,
  };
  const side: Side = prefer && room[prefer] >= width ? prefer : room.left >= room.right ? 'left' : 'right';

  let left: number;
  let top: number;
  if (room[side] >= width) {
    left = side === 'left' ? point.x - CHAT.gap - width : point.x + box.w + CHAT.gap;
    top = point.y + box.h - height;
  } else {
    left = point.x + box.w / 2 - width / 2;
    const above = point.y - CHAT.gap - height;
    top = above >= band.top ? above : point.y + box.h + CHAT.gap;
  }
  return {
    sheet: false,
    left: Math.round(clamp(left, CHAT.edge, view.w - width - CHAT.edge)),
    top: Math.round(clamp(top, band.top, band.bottom - height)),
    width,
    height,
    side,
  };
}

/** On a phone with the chat open she stands on the sheet's top edge, at the right. */
export function perchOnSheet(place: ChatPlace, view: View, box: Box): Point {
  return { x: Math.round(view.w - box.w - 16), y: Math.round(place.top - box.h + 4) };
}
