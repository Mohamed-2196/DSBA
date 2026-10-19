// A picture free on a page of a note: a box anywhere on one sheet, over or beside the writing, turned by any angle
// about its middle, cropped, and stacked with the other free pictures on its sheet (the later ones on top). Everything
// is in sheet units (surface/layout.ts), so a picture keeps its place on the page at every zoom, on every device and
// in the export. Pure functions over plain values (geometry.test.ts); the API checks the same ranges
// (api/app/services/note_doc.py).
//
// The note's document keeps its free pictures in its own `pictures` attribute (docPictures.ts), stored flat:
//   id, upload        the picture's own id, and its file (an upload of the note's)
//   sheet             the sheet it is on: a PDF's page (0-999) or paper (PAPER_BASE and up)
//   x, y, w, h        its box before it is turned: the top left corner and the size, on the sheet
//   angle             degrees clockwise about its middle, from 0 up to 360
//   ratio             the original picture's width over its height
//   cropX … cropH     the part of the original picture kept, in fractions of it
//   alt, caption      its description and its caption
import { SHEET_WIDTH, TEXT_SIDE, TEXT_WIDTH } from '../surface/layout';
import {
  FULL,
  MIN_WIDTH,
  clampCrop,
  cropAttrs,
  placeAt,
  type PictureAttrs,
  type Rect,
  type Turn,
} from '../text/picture';

export interface FreePicture {
  id: string;
  upload: string;
  sheet: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  ratio: number;
  crop: Rect;
  alt: string;
  caption: string;
}

/** The picture as the note's document keeps it. */
export interface StoredPicture {
  id: string;
  upload: string;
  sheet: number;
  x: number;
  y: number;
  w: number;
  h: number;
  angle: number;
  ratio: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  alt: string;
  caption: string;
}

export interface Point {
  x: number;
  y: number;
}

/** A box on a sheet: its top left corner and its size. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The smallest a free picture gets, each way (units). */
export const MIN_SIZE = 32;
/** Pictures in one note, in the text and free together (the API's limit). */
export const MAX_PICTURES = 200;
/** How far an arrow key moves a picture, and with Shift: a ruled line, a square of the grid. */
export const NUDGE = 4;
export const NUDGE_FAR = 32;
/** A new picture's longer side, at most (units), and what a small one is enlarged towards (twice its size at most). */
const START = 400;
const SMALL = 120;
/** A turn within this many degrees of a quarter turn snaps to it. */
const SNAP = 4;
const RATIO_MIN = 0.05;
const RATIO_MAX = 20;
export const CAPTION_MAX = 300;
export const ALT_MAX = 500;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
/** Units kept to two decimals: finer than a pixel at any zoom, and short in the saved note. */
const r2 = (v: number): number => Math.round(v * 100) / 100;
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[A-Za-z0-9_-]{1,32}$/;

/** A fresh id for a picture: short, unique within a note. */
export function pictureId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63]).join('');
}

// ── stored and read back ───────────────────────────────────────────────────────────────────────

export const toStored = (p: FreePicture): StoredPicture => ({
  id: p.id,
  upload: p.upload,
  sheet: p.sheet,
  x: p.x,
  y: p.y,
  w: p.w,
  h: p.h,
  angle: p.angle,
  ratio: p.ratio,
  ...cropAttrs(p.crop),
  alt: p.alt,
  caption: p.caption,
});

/** One stored picture, read back: null when it isn't one (no id or file); numbers out of range are brought in. */
export function fromStored(v: unknown): FreePicture | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !ID.test(v.id) || typeof v.upload !== 'string' || !v.upload)
    return null;
  const sheet = num(v.sheet, -1);
  if (!Number.isInteger(sheet) || sheet < 0) return null;
  const w = clamp(num(v.w, 0), MIN_SIZE / 2, SHEET_WIDTH);
  const h = Math.max(MIN_SIZE / 2, num(v.h, 0));
  return {
    id: v.id,
    upload: v.upload,
    sheet,
    x: num(v.x, 0),
    y: num(v.y, 0),
    w,
    h,
    angle: normAngle(num(v.angle, 0)),
    ratio: clamp(num(v.ratio, w / h), RATIO_MIN, RATIO_MAX),
    crop: clampCrop({ x: num(v.cropX, 0), y: num(v.cropY, 0), w: num(v.cropW, 1), h: num(v.cropH, 1) }),
    alt: typeof v.alt === 'string' ? v.alt : '',
    caption: typeof v.caption === 'string' ? v.caption : '',
  };
}

/** The document's free pictures (its `pictures` attribute), each read back; ones that aren't, and repeats, are left
 *  out. */
export function picturesFrom(value: unknown): FreePicture[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: FreePicture[] = [];
  for (const v of value) {
    const p = fromStored(v);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// ── the box, turned ────────────────────────────────────────────────────────────────────────────

/** An angle from 0 up to 360, to two decimals. */
export function normAngle(deg: number): number {
  const a = r2(((deg % 360) + 360) % 360);
  return a >= 360 ? 0 : a;
}

/** `v` turned `deg` degrees clockwise (y grows downwards, as on the page). */
export function turn(v: Point, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

export const middle = (p: Box): Point => ({ x: p.x + p.w / 2, y: p.y + p.h / 2 });

/** The upright box the turned picture fills on its sheet. */
export function bounds(p: Pick<FreePicture, 'x' | 'y' | 'w' | 'h' | 'angle'>): Box {
  const a = (p.angle * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const s = Math.abs(Math.sin(a));
  const w = p.w * c + p.h * s;
  const h = p.w * s + p.h * c;
  const m = middle(p);
  return { x: m.x - w / 2, y: m.y - h / 2, w, h };
}

/** The picture moved (never resized) so it lies on its sheet, `height` units tall: wholly where it fits, else with its
 *  middle in the middle of the sheet that way. */
export function settle(p: FreePicture, height: number): FreePicture {
  const b = bounds(p);
  const dx = b.w <= SHEET_WIDTH ? clamp(b.x, 0, SHEET_WIDTH - b.w) - b.x : (SHEET_WIDTH - b.w) / 2 - b.x;
  const dy = b.h <= height ? clamp(b.y, 0, height - b.h) - b.y : (height - b.h) / 2 - b.y;
  return Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005 ? p : { ...p, x: r2(p.x + dx), y: r2(p.y + dy) };
}

/** The picture moved across (never up or down) so it lies within its sheet's width, where it fits: a picture being
 *  dragged may go on to another page, never off the side. */
export function keptAcross(p: FreePicture): FreePicture {
  const b = bounds(p);
  if (b.w > SHEET_WIDTH) return p;
  const dx = clamp(b.x, 0, SHEET_WIDTH - b.w) - b.x;
  return Math.abs(dx) < 0.005 ? p : { ...p, x: r2(p.x + dx) };
}

/** A sheet in the column of pages: its number, where it starts (units down the column) and how tall it is. */
export interface SheetPlace {
  index: number;
  top: number;
  height: number;
}

/** Where a picture dragged on sheet `from` lands: on the sheet under its middle (the nearest one, past the first or the
 *  last), settled on it. */
export function landed(p: FreePicture, from: SheetPlace, sheets: readonly SheetPlace[]): FreePicture {
  const y = from.top + middle(p).y;
  const to = sheets.find((s) => y < s.top + s.height) ?? sheets[sheets.length - 1] ?? from;
  return settle({ ...p, sheet: to.index, y: r2(p.y + from.top - to.top) }, to.height);
}

export const movedBy = (p: FreePicture, dx: number, dy: number): FreePicture => ({
  ...p,
  x: r2(p.x + dx),
  y: r2(p.y + dy),
});

// ── resizing ───────────────────────────────────────────────────────────────────────────────────

export type Corner = 'nw' | 'ne' | 'sw' | 'se';
export const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se'];
const SIGNS: Record<Corner, readonly [number, number]> = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };

/**
 * The picture resized by pulling its `corner` to `to` (a point on its sheet): the opposite corner stays where it is.
 * Keeping its shape, the corner follows the pointer along the picture's diagonal; otherwise width and height follow
 * it apart. It stays between MIN_SIZE and the sheet's size (`height` units tall).
 */
export function resizedTo(
  p: FreePicture,
  corner: Corner,
  to: Point,
  { keepShape, height }: { keepShape: boolean; height: number },
): FreePicture {
  const [sx, sy] = SIGNS[corner];
  const m = middle(p);
  const half = turn({ x: (-sx * p.w) / 2, y: (-sy * p.h) / 2 }, p.angle);
  const anchor = { x: m.x + half.x, y: m.y + half.y };
  // the pointer from the corner that stays, in the picture's own (unturned) frame
  const v = turn({ x: to.x - anchor.x, y: to.y - anchor.y }, -p.angle);
  let w: number;
  let h: number;
  if (keepShape) {
    const along = (sx * v.x * p.w + sy * v.y * p.h) / (p.w * p.w + p.h * p.h);
    const lo = Math.max(MIN_SIZE / p.w, MIN_SIZE / p.h);
    const hi = Math.min(SHEET_WIDTH / p.w, height / p.h);
    const s = lo > hi ? hi : clamp(along, lo, hi);
    w = p.w * s;
    h = p.h * s;
  } else {
    w = clamp(sx * v.x, MIN_SIZE, SHEET_WIDTH);
    h = clamp(sy * v.y, MIN_SIZE, Math.max(MIN_SIZE, height));
  }
  const reach = turn({ x: (sx * w) / 2, y: (sy * h) / 2 }, p.angle);
  const c = { x: anchor.x + reach.x, y: anchor.y + reach.y };
  return { ...p, x: r2(c.x - w / 2), y: r2(c.y - h / 2), w: r2(w), h: r2(h) };
}

// ── turning ────────────────────────────────────────────────────────────────────────────────────

/** An angle snapped to a quarter turn when it is within SNAP degrees of one, or to the nearest 15 degrees (`steps`). */
export function snapAngle(deg: number, steps = false): number {
  const a = normAngle(deg);
  if (steps) return normAngle(Math.round(a / 15) * 15);
  const quarter = Math.round(a / 90) * 90;
  return Math.abs(a - quarter) <= SNAP ? normAngle(quarter) : a;
}

/** The angle that points the picture's top at `to` (a point on its sheet): 0 straight up, growing clockwise. */
export function angleTowards(p: Box, to: Point, steps = false): number {
  const m = middle(p);
  return snapAngle((Math.atan2(to.x - m.x, m.y - to.y) * 180) / Math.PI, steps);
}

/** A quarter turn clockwise. */
export const quarterTurned = (p: FreePicture): FreePicture => ({ ...p, angle: normAngle(p.angle + 90) });

// ── cropping ───────────────────────────────────────────────────────────────────────────────────

/** The whole picture behind the crop, as cropping shows it: a box (before it is turned, turned like the picture) at
 *  the same scale, with the part kept where the picture is now. */
export function wholeOf(p: FreePicture): Box {
  const w = p.w / p.crop.w;
  const h = p.h / p.crop.h;
  const off = turn({ x: (0.5 - (p.crop.x + p.crop.w / 2)) * w, y: (0.5 - (p.crop.y + p.crop.h / 2)) * h }, p.angle);
  const m = middle(p);
  return { x: m.x + off.x - w / 2, y: m.y + off.y - h / 2, w, h };
}

/** The picture cropped to `crop` (fractions of the whole picture): the part kept stays where it is on the page, at the
 *  same scale (and at least MIN_SIZE each way). */
export function croppedTo(p: FreePicture, crop: Rect): FreePicture {
  const c = clampCrop(crop);
  const whole = wholeOf(p);
  const wm = middle(whole);
  const off = turn({ x: (c.x + c.w / 2 - 0.5) * whole.w, y: (c.y + c.h / 2 - 0.5) * whole.h }, p.angle);
  const up = Math.max(1, MIN_SIZE / (c.w * whole.w), MIN_SIZE / (c.h * whole.h));
  const w = c.w * whole.w * up;
  const h = c.h * whole.h * up;
  return { ...p, crop: c, x: r2(wm.x + off.x - w / 2), y: r2(wm.y + off.y - h / 2), w: r2(w), h: r2(h) };
}

// ── one above the other ────────────────────────────────────────────────────────────────────────

const overlap = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The pictures with `id` moved just above the next picture on its sheet that it overlaps, or null when none is above
 *  it (later pictures are drawn on top). */
export function broughtForward(list: readonly FreePicture[], id: string): FreePicture[] | null {
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const p = list[i];
  const box = bounds(p);
  for (let j = i + 1; j < list.length; j++) {
    const q = list[j];
    if (q.sheet !== p.sheet || !overlap(box, bounds(q))) continue;
    const out = [...list];
    out.splice(i, 1);
    out.splice(j, 0, p);
    return out;
  }
  return null;
}

/** The pictures with `id` moved just below the picture before it on its sheet that it overlaps, or null when none is
 *  below it. */
export function sentBackward(list: readonly FreePicture[], id: string): FreePicture[] | null {
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return null;
  const p = list[i];
  const box = bounds(p);
  for (let j = i - 1; j >= 0; j--) {
    const q = list[j];
    if (q.sheet !== p.sheet || !overlap(box, bounds(q))) continue;
    const out = [...list];
    out.splice(i, 1);
    out.splice(j, 0, p);
    return out;
  }
  return null;
}

// ── new pictures, and pictures in the text ─────────────────────────────────────────────────────

export interface NewFreePicture {
  upload: string;
  alt: string;
  /** the picture's own size, in pixels */
  width: number;
  height: number;
}

/** A new picture with its middle at `at` on `sheet` (`height` units tall): its own size, made smaller to START units
 *  on its longer side, a small one larger (up to twice), and on the page. */
export function placedPicture(
  n: NewFreePicture,
  sheet: number,
  at: Point,
  height: number,
  id: string = pictureId(),
): FreePicture {
  let w = Math.max(1, n.width);
  let h = Math.max(1, n.height);
  const ratio = clamp(w / h, RATIO_MIN, RATIO_MAX);
  const down = Math.min(1, START / Math.max(w, h));
  const up = Math.max(w, h) < SMALL ? Math.min(2, SMALL / Math.max(w, h)) : 1;
  w *= down * up;
  h *= down * up;
  const least = Math.max(1, MIN_SIZE / w, MIN_SIZE / h);
  w = Math.min(SHEET_WIDTH, w * least);
  h = Math.min(Math.max(MIN_SIZE, height), h * least);
  const p: FreePicture = {
    id,
    upload: n.upload,
    sheet,
    x: r2(at.x - w / 2),
    y: r2(at.y - h / 2),
    w: r2(w),
    h: r2(h),
    angle: 0,
    ratio,
    crop: FULL,
    alt: n.alt,
    caption: '',
  };
  return settle(p, height);
}

/** A picture in the text made free where it is: `shown` is its box as it shows (cropped and turned) on `sheet`. */
export function freeFromInline(a: PictureAttrs, sheet: number, shown: Box, id: string = pictureId()): FreePicture {
  const sideways = a.rotate === 90 || a.rotate === 270;
  const w = sideways ? shown.h : shown.w;
  const h = sideways ? shown.w : shown.h;
  const m = middle(shown);
  return {
    id,
    upload: a.upload,
    sheet,
    x: r2(m.x - w / 2),
    y: r2(m.y - h / 2),
    w: r2(w),
    h: r2(h),
    angle: a.rotate,
    ratio: a.ratio,
    crop: a.crop,
    alt: a.alt,
    caption: a.caption,
  };
}

/** What a free picture becomes in the text: its nearest quarter turn, its width as a share of the text's width (in the
 *  text a picture keeps its own shape), and its place across the text. */
export function inlineFromFree(p: FreePicture): Record<string, unknown> {
  const rotate = (normAngle(Math.round(p.angle / 90) * 90) % 360) as Turn;
  const shownWidth = rotate === 90 || rotate === 270 ? p.h : p.w;
  const width = Math.round(clamp(shownWidth / TEXT_WIDTH, MIN_WIDTH, 1) * 10000) / 10000;
  const left = (middle(p).x - TEXT_SIDE) / TEXT_WIDTH - width / 2;
  return {
    upload: p.upload,
    alt: p.alt,
    caption: p.caption,
    width,
    x: placeAt(width, left),
    ratio: p.ratio,
    rotate,
    ...cropAttrs(p.crop),
  };
}

/** The pictures' words (captions, then descriptions), in the order they are read: page by page, top to bottom. */
export function pictureWords(list: readonly FreePicture[]): string[] {
  return [...list]
    .sort((a, b) => a.sheet - b.sheet || a.y - b.y || a.x - b.x)
    .flatMap((p) => [p.caption.trim(), p.alt.trim()])
    .filter(Boolean);
}
