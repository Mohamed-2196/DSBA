// Cropping a picture, in the text or free on the page: the eight handles round the part kept, and where a rectangle
// of fractions sits in the picture shown whole.
import type { CSSProperties } from 'react';
import type { Edges, Rect } from './picture';

export const CROP_HANDLES: readonly { id: string; edges: Edges }[] = [
  { id: 'nw', edges: { top: true, left: true } },
  { id: 'n', edges: { top: true } },
  { id: 'ne', edges: { top: true, right: true } },
  { id: 'e', edges: { right: true } },
  { id: 'se', edges: { bottom: true, right: true } },
  { id: 's', edges: { bottom: true } },
  { id: 'sw', edges: { bottom: true, left: true } },
  { id: 'w', edges: { left: true } },
];

export const rectStyle = (r: Rect): CSSProperties => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});
