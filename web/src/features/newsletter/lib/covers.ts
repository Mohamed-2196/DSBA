// The cover system of The DSBA Newsletter: one grid, two states.
//
//   art state    the issue has an illustration (cover.art). It fills the cover; the nameplate sits on its
//                top quarter and the cover line plus three story lines on its bottom fifth.
//   type state   no illustration: the cover is built from type alone. Nameplate, a very large issue
//                numeral, the cover line and an index of the issue's stories between rules.
//
// A cover is drawn in a 300 x 400 box and scaled as one piece, so a thumbnail is the same cover, smaller.
// This file is the geometry and the copy fitting (pure functions); the drawing is components/IssueCover.tsx.
import type { Cover, Section } from '../types';
import { issueNo, longDate } from './text';

export const COVER_W = 300;
export const COVER_H = 400;
export const MARGIN = 20;
export const MEASURE = COVER_W - 2 * MARGIN;

// Newsreader's display figures (weight 400): every digit is 0.6em wide and 0.725em tall. FIGURE_INK[d] is
// where the ink of digit d starts and ends inside its 0.6em, measured from the font.
const FIGURE_ADVANCE = 0.6;
const FIGURE_INK: readonly (readonly [number, number])[] = [
  [0.039, 0.561], [0.082, 0.541], [0.042, 0.555], [0.068, 0.523], [0.001, 0.591],
  [0.062, 0.531], [0.062, 0.555], [0.068, 0.556], [0.048, 0.551], [0.044, 0.539],
];
export const FIGURE_HEIGHT = 0.725;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const inkOf = (ch: string | undefined): readonly [number, number] => FIGURE_INK[Number(ch)] ?? (FIGURE_INK[0] as readonly [number, number]);

/**
 * Font size and x of an issue numeral whose ink runs from the left margin to the right one ("01" and "00"
 * do), or as far as it gets before the figures grow taller than `maxHeight` (narrow pairs like "11").
 */
export function numeralBox(text: string, maxHeight: number): { size: number; x: number } {
  const first = inkOf(text[0]);
  const last = inkOf(text[text.length - 1]);
  const ink = FIGURE_ADVANCE * (text.length - 1) + last[1] - first[0];
  const size = round1(Math.min(MEASURE / ink, maxHeight / FIGURE_HEIGHT));
  return { size, x: round1(MARGIN - first[0] * size) };
}

// Average advance of a character, in em: the story labels are tracked capitals in the sans, the story lines
// are the text serif. Slightly generous, so an estimate never under-reports a width.
const LABEL_EM = 0.77;
const LINE_EM = 0.48;

/** The font size (<= size) at which `text` fits in `width`, estimated from its length. */
export function fitSize(text: string, size: number, width: number, em: number): number {
  const need = String(text).length * em * size;
  return need <= width ? size : Math.floor((size * width * 10) / need) / 10;
}
export const fitLabel = (text: string, size: number, width: number): number => fitSize(text, size, width, LABEL_EM);
export const fitLine = (text: string, size: number, width: number): number => fitSize(text, size, width, LINE_EM);

/** A section id as a label when the section itself is not known yet: 'student-council' → 'Student council'. */
const labelFromId = (id: string): string => {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export interface CoverModel {
  tone: 'navy' | 'paper';
  art: string | null;
  number: string;
  /** '' for an issue that has no date yet. */
  date: string;
  title: string;
  rows: { id: string; label: string; text: string }[];
}

/**
 * What a cover says. `cover.lines` are [{ section, text }] in story order, where `text` is the story's own
 * headline cut down to a cover line; the section's label is printed beside it. An issue without lines lists
 * its first sections by name. `sections` may be null while the issue's detail is loading.
 */
export function coverOf(issue: { number: number; title: string; date: string; cover: Cover; sections: readonly Pick<Section, 'id' | 'label'>[] | null }): CoverModel {
  const { cover } = issue;
  const byId = new Map((issue.sections ?? []).map((s) => [s.id, s]));
  const known = (id: string) => !issue.sections || byId.has(id);
  const rows = cover.lines.length
    ? cover.lines.filter((l) => known(l.section)).map((l) => ({ id: l.section, label: byId.get(l.section)?.label ?? labelFromId(l.section), text: l.text }))
    : (issue.sections ?? []).slice(0, 5).map((s) => ({ id: s.id, label: s.label, text: '' }));
  return {
    tone: cover.tone,
    art: cover.art,
    number: issueNo(issue.number),
    date: issue.date ? longDate(issue.date) : '',
    title: issue.title,
    rows,
  };
}
