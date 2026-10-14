// The ink engine, shared by everything that takes handwriting: strokes as vectors (geometry), how they are drawn
// (InkSheet), undo and redo (history), and the laser pointer (laser). Pointer handling lives with the surface that
// uses it (features/notes/surface).
export * from './geometry';
export * from './history';
export * from './laser';
export { InkSheet, StrokePaths, type InkSheetProps } from './InkSheet';
