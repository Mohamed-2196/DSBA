// Where things go on screen. Pure geometry, no DOM and no React:
//   view  { w, h, floor }  the window, and the line she may not stand below (the top of the phone tab bar)
//   box   { w, h }         the space she fills
//   point { x, y }         the top-left corner of that space

const EDGE = 8; // she never touches the edge of the window
// Where she starts: the bottom-right corner. Close to the side edge, so that she stands in the page's
// gutter as far as she fits and covers as little of the content as she can.
const HOME = { side: 12, below: { desktop: 24, phone: 12 } };
const CHAT = { width: 400, height: 600, gap: 22, edge: 12 }; // gap: room for her gesturing hand
const SHEET = { height: 600, headroom: 28 }; // phones: the chat is a bottom sheet and she stands on top of it

const clamp = (n, min, max) => Math.min(Math.max(n, min), Math.max(min, max));

/** Keep a point inside the window (and above the phone tab bar). */
export function clampPoint(point, view, box) {
  return {
    x: Math.round(clamp(point.x, EDGE, view.w - box.w - EDGE)),
    y: Math.round(clamp(point.y, EDGE, view.floor - box.h - EDGE)),
  };
}

/** Where she starts (see HOME). On a phone that is just above the tab bar. */
export function homePoint(view, box, phone) {
  const below = phone ? HOME.below.phone : HOME.below.desktop;
  return clampPoint({ x: view.w - box.w - HOME.side, y: view.floor - box.h - below }, view, box);
}

/**
 * A point as { corner, dx, dy }: the nearest corner of the window and the gaps to its two edges.
 * This is what is remembered, so she keeps her place when the window changes size.
 */
export function toAnchor(point, view, box) {
  const right = view.w - (point.x + box.w);
  const bottom = view.h - (point.y + box.h);
  const v = point.y <= bottom ? 't' : 'b';
  const h = point.x <= right ? 'l' : 'r';
  return { corner: v + h, dx: Math.round(h === 'l' ? point.x : right), dy: Math.round(v === 't' ? point.y : bottom) };
}

/** The point an anchor stands for in this window, or null when it is not a usable anchor. */
export function fromAnchor(anchor, view, box) {
  if (!anchor || typeof anchor !== 'object' || !/^[tb][lr]$/.test(anchor.corner)) return null;
  const { corner, dx, dy } = anchor;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return clampPoint(
    {
      x: corner[1] === 'l' ? dx : view.w - box.w - dx,
      y: corner[0] === 't' ? dy : view.h - box.h - dy,
    },
    view,
    box,
  );
}

/**
 * Where the chat goes.
 * On a desktop it opens beside her, on the side with room (it stays on the side it is on for as long
 * as it fits there), with its bottom level with her feet, and it is always fully inside the window.
 * If there is no room on either side it goes above or below her instead.
 * On a phone it is a sheet along the bottom.
 * @returns {{ sheet: boolean, left, top, width, height, side: 'left'|'right', origin: { x, y } }}
 *          side: which side of her the chat is on; origin: her centre, measured from the chat's corner
 */
export function placeChat(point, view, box, { phone = false, prefer = null } = {}) {
  if (phone) {
    // As tall as it can be while leaving her room to stand on top of it (see perchOnSheet).
    const height = Math.round(clamp(view.h - box.h - SHEET.headroom, 280, SHEET.height));
    return { sheet: true, left: 0, top: view.h - height, width: view.w, height, side: 'left', origin: { x: view.w / 2, y: height } };
  }

  const width = Math.min(CHAT.width, view.w - 2 * CHAT.edge);
  const height = Math.min(CHAT.height, view.h - 2 * CHAT.edge);
  const room = {
    left: point.x - CHAT.gap - CHAT.edge,
    right: view.w - (point.x + box.w) - CHAT.gap - CHAT.edge,
  };
  const side = prefer && room[prefer] >= width ? prefer : room.left >= room.right ? 'left' : 'right';

  let left;
  let top;
  if (room[side] >= width) {
    left = side === 'left' ? point.x - CHAT.gap - width : point.x + box.w + CHAT.gap;
    top = point.y + box.h - height;
  } else {
    left = point.x + box.w / 2 - width / 2;
    const above = point.y - CHAT.gap - height;
    top = above >= CHAT.edge ? above : point.y + box.h + CHAT.gap;
  }
  left = Math.round(clamp(left, CHAT.edge, view.w - width - CHAT.edge));
  top = Math.round(clamp(top, CHAT.edge, view.h - height - CHAT.edge));

  return {
    sheet: false,
    left,
    top,
    width,
    height,
    side,
    origin: { x: Math.round(point.x + box.w / 2 - left), y: Math.round(point.y + box.h / 2 - top) },
  };
}

/** On a phone with the chat open she stands on the sheet's top edge, at the right. */
export function perchOnSheet(place, view, box) {
  return { x: Math.round(view.w - box.w - 20), y: Math.round(place.top - box.h + 5) };
}
