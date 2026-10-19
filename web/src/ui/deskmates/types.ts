import type { ReactElement } from 'react';
import type { MATE_POSES } from './art';

/** A deskmate: lumen (Home), stacks (library), binder (modules), jot (notebook), pip-pod (forum), blink (calendar)
 *  or loupe (search). */
export type MateName = keyof typeof MATE_POSES;
/** The poses a deskmate is drawn in: idle, happy and sleepy for all, plus Lumen's wave, Blink's countdown and
 *  Loupe's searching. */
export type MatePose<M extends MateName = MateName> = (typeof MATE_POSES)[M][number];
/** A deskmate's drawings, one per pose (the inside of a 200 × 200 SVG). */
export type MateArt<M extends MateName> = Record<MatePose<M>, ReactElement>;
