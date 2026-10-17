// A picture in a note: how big it is, where it sits across the text, how it is cropped and turned. Pure functions
// over the node's attributes, so the rules are unit-tested (picture.test.ts).
//   width   its share of the text's width (MIN_WIDTH to 1)
//   x       where it sits in the room left beside it: 0 at the left margin, 0.5 in the middle, 1 at the right
//   ratio   the original picture's width over its height (known before it loads, so nothing moves while it does)
//   rotate  0, 90, 180 or 270 degrees, clockwise
//   crop    the part kept, in fractions of the original picture: cropX, cropY, cropW, cropH
// The API keeps them as they are (services/note_doc.py: small scalar attributes).

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Turn = 0 | 90 | 180 | 270;

export interface PictureAttrs {
  upload: string;
  alt: string;
  caption: string;
  width: number;
  x: number;
  ratio: number;
  rotate: Turn;
  crop: Rect;
}

export const MIN_WIDTH = 0.12;
/** The smallest crop, as a share of the picture's width or height. */
export const MIN_CROP = 0.05;
export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const round = (v: number): number => Math.round(v * 10000) / 10000;

/** A crop that stays inside the picture and keeps at least MIN_CROP of it each way. */
export function clampCrop(r: Rect): Rect {
  const w = clamp(r.w, MIN_CROP, 1);
  const h = clamp(r.h, MIN_CROP, 1);
  return { x: round(clamp(r.x, 0, 1 - w)), y: round(clamp(r.y, 0, 1 - h)), w: round(w), h: round(h) };
}

/** The node's attributes, checked: anything missing or out of range takes its default. */
export function pictureAttrs(attrs: Record<string, unknown>): PictureAttrs {
  const rotate = num(attrs.rotate, 0);
  return {
    upload: typeof attrs.upload === 'string' ? attrs.upload : '',
    alt: typeof attrs.alt === 'string' ? attrs.alt : '',
    caption: typeof attrs.caption === 'string' ? attrs.caption : '',
    width: clamp(num(attrs.width, 1), MIN_WIDTH, 1),
    x: clamp(num(attrs.x, 0.5), 0, 1),
    ratio: clamp(num(attrs.ratio, 4 / 3), 0.05, 20),
    rotate: rotate === 90 || rotate === 180 || rotate === 270 ? rotate : 0,
    crop: clampCrop({ x: num(attrs.cropX, 0), y: num(attrs.cropY, 0), w: num(attrs.cropW, 1), h: num(attrs.cropH, 1) }),
  };
}

/** The crop as node attributes. */
export const cropAttrs = (r: Rect): { cropX: number; cropY: number; cropW: number; cropH: number } => {
  const c = clampCrop(r);
  return { cropX: c.x, cropY: c.y, cropW: c.w, cropH: c.h };
};

export const turned = (rotate: Turn): boolean => rotate === 90 || rotate === 270;

/** Width over height of the picture as shown: cropped (by default the crop it has), then turned. */
export function shownRatio(p: Pick<PictureAttrs, 'ratio' | 'rotate' | 'crop'>, crop: Rect = p.crop): number {
  const r = (crop.w * p.ratio) / crop.h;
  return turned(p.rotate) ? 1 / r : r;
}

/** A rectangle of the original picture, as it appears once the picture is turned (fractions of what is shown). */
export function toShown(r: Rect, rotate: Turn): Rect {
  switch (rotate) {
    case 90:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    case 270:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    default:
      return r;
  }
}

/** The reverse of toShown: a rectangle of what is shown, as a rectangle of the original picture. */
export function fromShown(r: Rect, rotate: Turn): Rect {
  switch (rotate) {
    case 90:
      return { x: r.y, y: 1 - r.x - r.w, w: r.h, h: r.w };
    case 180:
      return { x: 1 - r.x - r.w, y: 1 - r.y - r.h, w: r.w, h: r.h };
    case 270:
      return { x: 1 - r.y - r.h, y: r.x, w: r.h, h: r.w };
    default:
      return r;
  }
}

export const nextTurn = (rotate: Turn): Turn => ((rotate + 90) % 360) as Turn;

/** Which edges a crop handle moves. */
export interface Edges {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

/** The crop (in fractions of what is shown) after a handle moved by dx, dy (fractions too), or the whole crop when no
 *  edge is given. It stays inside the picture and keeps at least MIN_CROP each way. */
export function dragCrop(r: Rect, edges: Edges, dx: number, dy: number): Rect {
  if (!edges.left && !edges.right && !edges.top && !edges.bottom) {
    return { x: clamp(r.x + dx, 0, 1 - r.w), y: clamp(r.y + dy, 0, 1 - r.h), w: r.w, h: r.h };
  }
  let left = r.x;
  let right = r.x + r.w;
  let top = r.y;
  let bottom = r.y + r.h;
  if (edges.left) left = clamp(left + dx, 0, right - MIN_CROP);
  if (edges.right) right = clamp(right + dx, left + MIN_CROP, 1);
  if (edges.top) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (edges.bottom) bottom = clamp(bottom + dy, top + MIN_CROP, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A picture resized from a corner: its new width share and place, keeping the opposite side where it was. `delta`
 *  is how far the corner moved outwards, in shares of the text's width. */
export function resized(p: Pick<PictureAttrs, 'width' | 'x'>, delta: number, fromLeft: boolean): { width: number; x: number } {
  const left = p.x * (1 - p.width);
  const right = left + p.width;
  const width = clamp(p.width + delta, MIN_WIDTH, 1);
  const newLeft = fromLeft ? right - width : left;
  const room = 1 - width;
  return { width: round(width), x: room > 0.0001 ? round(clamp(newLeft / room, 0, 1)) : 0.5 };
}

/** Where a picture `width` wide sits for a left edge at `left` (shares of the text's width): snapped to the left, the
 *  middle or the right when it is within `snap` of them. */
export function placeAt(width: number, left: number, snap = 0.025): number {
  const room = 1 - width;
  if (room <= 0.0001) return 0.5;
  const x = clamp(left / room, 0, 1);
  for (const at of [0, 0.5, 1]) if (Math.abs(x - at) * room <= snap) return at;
  return round(x);
}

/** The width share a new picture starts at: its own size, up to the whole width of the text. */
export const startWidth = (naturalWidth: number, textWidth: number): number => round(clamp(naturalWidth / textWidth, 0.25, 1));
