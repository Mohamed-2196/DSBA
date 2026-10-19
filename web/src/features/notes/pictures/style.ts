// Where a free picture's box is drawn, in the units of what it is in (the column of pages, or one sheet).
import type { CSSProperties } from 'react';
import type { FreePicture } from './geometry';

/** The box on its sheet, `top` units down the column it is in, turned about its middle. */
export const boxStyle = (p: Pick<FreePicture, 'x' | 'y' | 'w' | 'h' | 'angle'>, top = 0): CSSProperties => ({
  left: p.x,
  top: top + p.y,
  width: p.w,
  height: p.h,
  transform: p.angle ? `rotate(${p.angle}deg)` : undefined,
});
