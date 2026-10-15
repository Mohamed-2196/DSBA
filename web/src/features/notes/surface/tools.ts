// The writing tools and their settings (kept on this device: each student's own pens).
export type Tool = 'type' | 'pen' | 'highlighter' | 'eraser' | 'lasso' | 'laser';
export type EraserMode = 'stroke' | 'partial';

export interface PenSettings {
  pen: { color: string; width: number };
  highlighter: { color: string; width: number };
  eraser: { mode: EraserMode; size: number };
}

export const PEN_COLORS = [
  { value: '#1f2933', label: 'Black' },
  { value: '#1558f0', label: 'Blue' },
  { value: '#d6336c', label: 'Red' },
  { value: '#2b8a3e', label: 'Green' },
  { value: '#e8590c', label: 'Orange' },
] as const;

export const HIGHLIGHTER_COLORS = [
  { value: '#ffd43b', label: 'Yellow' },
  { value: '#8ce99a', label: 'Green' },
  { value: '#ffa8c5', label: 'Pink' },
  { value: '#91d5ff', label: 'Blue' },
] as const;

export const PEN_WIDTHS = [
  { value: 1.6, label: 'Fine' },
  { value: 2.6, label: 'Medium' },
  { value: 4.4, label: 'Bold' },
] as const;

export const HIGHLIGHTER_WIDTHS = [
  { value: 14, label: 'Thin' },
  { value: 22, label: 'Medium' },
  { value: 32, label: 'Wide' },
] as const;

export const ERASER_SIZES = [
  { value: 6, label: 'Small' },
  { value: 14, label: 'Medium' },
  { value: 28, label: 'Large' },
] as const;

export const DEFAULT_PENS: PenSettings = {
  pen: { color: PEN_COLORS[0].value, width: PEN_WIDTHS[1].value },
  highlighter: { color: HIGHLIGHTER_COLORS[0].value, width: HIGHLIGHTER_WIDTHS[1].value },
  eraser: { mode: 'stroke', size: ERASER_SIZES[1].value },
};

/** Tools that write on the sheets (everything but typing). */
export const isInkTool = (t: Tool): boolean => t !== 'type';

export const TOOL_KEYS: Record<string, Tool> = {
  t: 'type',
  p: 'pen',
  h: 'highlighter',
  e: 'eraser',
  l: 'lasso',
  k: 'laser',
};
