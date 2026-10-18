// Where Mini Noora and her chat go on screen. Pure geometry, no DOM and no React:
//   view  { w, h, ceiling, floor, left, right }  the window; the band she keeps to (below the top bar, above the
//                                                 phone tab bar); and the page column beside the rail, whose edges
//                                                 hold her lanes
//   box   { w, h }                  the space she fills
//   point { x, y }                  the top-left corner of that space
//   rect  { x, y, w, h }            a control she must not cover (a primary button, say)
//   span  { left, right }           the part of the window the page's content takes, edge to edge
//
// She rests in a lane: a strip at the left or right edge of the page column, as wide as she is plus LANE_PAD on each
// side, which pages keep clear (ui/Page.css), so at rest she never covers the page. She can be carried anywhere; let
// go, she goes to the lane on the nearer side, at the height she was let go at.

export interface View {
  w: number;
  h: number;
  /** the line she may not stand above (the bottom of the top bar) */
  ceiling: number;
  /** the line she may not stand below (the top of the phone tab bar, else the bottom of the window) */
  floor: number;
  /** the page column's left edge (the rail's right edge) */
  left: number;
  /** the page column's right edge (the window's, unless the shell is centred on a very wide screen) */
  right: number;
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
export interface Span {
  left: number;
  right: number;
}
export type Side = 'left' | 'right';

/** Where she rests, as it is remembered: the lane she stands in and her height above the floor. */
export interface Anchor {
  side: Side;
  /** px from her feet to the floor */
  lift: number;
}

export interface ChatPlace {
  /** a sheet along the bottom (phones), else a card beside her */
  sheet: boolean;
  /** the sheet covers the whole window (a short screen): she steps out of sight */
  full: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  /** which side of her the card is on */
  side: Side;
}

/** px between her and either side of her lane: the lane is her width plus this on each side. */
export const LANE_PAD = 8;
const EDGE = 8; // carried, she never touches the edge of the window
const HOME_LIFT = 16; // where she starts: the right lane, just above the floor
const CHAT = { width: 384, height: 560, gap: 16, edge: 12 };
const SHEET = { height: 560, headroom: 20 }; // phones: the chat is a sheet and she stands on top of it
const CLEAR = 8; // px she keeps from a control she must not cover
const HINT_GAP = 10; // px between her and her first-visit hint

const clamp = (n: number, min: number, max: number): number => Math.min(Math.max(n, min), Math.max(min, max));

/** How wide her lane is. */
export const laneWidth = (box: Box): number => box.w + 2 * LANE_PAD;

/** Keep a point inside her band of the window (where she can be carried). */
export function clampPoint(point: Point, view: View, box: Box): Point {
  return {
    x: Math.round(clamp(point.x, EDGE, view.w - box.w - EDGE)),
    y: Math.round(clamp(point.y, view.ceiling + EDGE, view.floor - box.h - EDGE)),
  };
}

/** The lane nearer to a point: she is let go there and goes to it. */
export function nearestSide(point: Point, view: View, box: Box): Side {
  return point.x + box.w / 2 < (view.left + view.right) / 2 ? 'left' : 'right';
}

/** Where she stands in a lane, `lift` px above the floor. */
export function restPoint(side: Side, lift: number, view: View, box: Box): Point {
  const x = side === 'left' ? view.left + LANE_PAD : view.right - box.w - LANE_PAD;
  return {
    x: Math.round(x),
    y: Math.round(clamp(view.floor - box.h - lift, view.ceiling + EDGE, view.floor - box.h - EDGE)),
  };
}

/** Where she is let go, as an anchor: the nearer lane, and how high she stands. */
export function toAnchor(point: Point, view: View, box: Box): Anchor {
  const p = clampPoint(point, view, box);
  return { side: nearestSide(p, view, box), lift: Math.max(0, Math.round(view.floor - (p.y + box.h))) };
}

/** The point an anchor stands for in this window, or null when it is not a usable anchor (it comes from storage). */
export function fromAnchor(anchor: unknown, view: View, box: Box): Point | null {
  if (!anchor || typeof anchor !== 'object') return null;
  const { side, lift } = anchor as Record<string, unknown>;
  if ((side !== 'left' && side !== 'right') || typeof lift !== 'number' || !Number.isFinite(lift)) return null;
  return restPoint(side, lift, view, box);
}

/** Where she starts: the right lane, just above the floor. */
export function homePoint(view: View, box: Box): Point {
  return restPoint('right', HOME_LIFT, view, box);
}

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Keep her off the controls that matter (something fixed that reaches into her lane): if she would cover one, she
 * moves up or down her lane to the nearest height where she covers none. With no such height she stays where she is.
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
 * Where her first-visit hint (a speech bubble of `bubble` size, its tail at her shoulder) can go without covering
 * the page: beside her, on a side where it stays inside the window and clear of the page's content (`page`). The
 * side away from the page is tried first. Null when neither side has the room, or the page is not known.
 */
export function hintSide(point: Point, view: View, box: Box, page: Span | null, bubble: Box): Side | null {
  if (!page) return null;
  const top = point.y + box.h * 0.42 - bubble.h;
  if (top < view.ceiling + EDGE) return null;
  const fits = (side: Side): boolean => {
    const left = side === 'left' ? point.x - HINT_GAP - bubble.w : point.x + box.w + HINT_GAP;
    const right = left + bubble.w;
    if (left < EDGE || right > view.w - EDGE) return false;
    return right <= page.left || left >= page.right;
  };
  const outer: Side = point.x + box.w / 2 < (page.left + page.right) / 2 ? 'left' : 'right';
  const inner: Side = outer === 'left' ? 'right' : 'left';
  return fits(outer) ? outer : fits(inner) ? inner : null;
}

/**
 * Where the chat goes.
 * Wider screens: a card beside her, on the side with room (it stays on the side it is on for as long as it fits),
 * its bottom level with her feet, always inside her band. With no room either side, above or below her.
 * Phones: a sheet along the bottom, above the tab bar, with room for her to stand on top of it.
 * Short screens (a phone on its side): the whole window, from its top to the floor, so the conversation has room.
 */
export function placeChat(
  point: Point,
  view: View,
  box: Box,
  { phone = false, short = false, prefer = null }: { phone?: boolean; short?: boolean; prefer?: Side | null } = {},
): ChatPlace {
  if (short)
    return { sheet: true, full: true, left: 0, top: 0, width: view.w, height: Math.max(0, view.floor), side: 'left' };
  if (phone) {
    const height = Math.round(clamp(view.floor - view.ceiling - box.h - SHEET.headroom, 260, SHEET.height));
    return { sheet: true, full: false, left: 0, top: view.floor - height, width: view.w, height, side: 'left' };
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
    full: false,
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
