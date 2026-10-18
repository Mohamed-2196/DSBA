// The ink engine, shared by everything that takes handwriting: strokes as vectors (geometry), how they are drawn
// (InkSheet), and the laser pointer (laser). Pointer handling and undo live with the surface that uses it
// (features/notes).
export * from './geometry';
export * from './laser';
export { InkSheet, StrokePaths, type InkSheetProps } from './InkSheet';
