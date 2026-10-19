// The cover system of The DSBA Newsletter: one grid, two states.
//
//   art state    the issue has an illustration (cover.art). It fills the cover; the nameplate sits on its
//                top quarter and the cover line plus three story lines on its bottom fifth.
//   type state   no illustration: the cover is built from type alone. Nameplate, a very large issue
//                numeral, the cover line and an index of the issue's stories between rules.
//
// A cover is drawn in a 300 x 400 box and scaled as one piece, so a thumbnail is the same cover, smaller.
// This file is the geometry and the copy fitting (pure functions); the drawing is components/IssueCover.tsx.
import type { IssueCover, IssueSection } from '../../../api/types';
import { formatDay } from '../../../lib/dates';
import { issueNo, plainText, sectionLabel } from './text';

export const COVER_W = 300;
export const COVER_H = 400;
export const MARGIN = 20;
export const MEASURE = COVER_W - 2 * MARGIN;

// Bricolage Grotesque's figures at the display weight (750), proportional: FIGURE[d] is digit d's advance and where
// its ink starts and ends inside it, in em, measured in Chrome from the font. Figures stand 0.674em at most.
const FIGURE: readonly (readonly [advance: number, inkStart: number, inkEnd: number])[] = [
  [0.594, 0.028, 0.566],
  [0.302, 0.02, 0.261],
  [0.548, 0.018, 0.526],
  [0.563, 0.011, 0.556],
  [0.601, 0.015, 0.578],
  [0.563, 0.023, 0.536],
  [0.592, 0.028, 0.565],
  [0.494, 0.012, 0.481],
  [0.607, 0.023, 0.583],
  [0.601, 0.027, 0.573],
];
export const FIGURE_HEIGHT = 0.674;
const round1 = (n: number): number => Math.round(n * 10) / 10;
const figureOf = (ch: string | undefined): readonly [number, number, number] =>
  FIGURE[Number(ch)] ?? (FIGURE[0] as readonly [number, number, number]);

/**
 * Font size and x of an issue numeral whose ink runs from the left margin to the right one, or as far as it gets
 * before the figures grow taller than `maxHeight` (narrow pairs like "11").
 */
export function numeralBox(text: string, maxHeight: number): { size: number; x: number } {
  const digits = [...text];
  const first = figureOf(digits[0]);
  const last = figureOf(digits[digits.length - 1]);
  const before = digits.slice(0, -1).reduce((sum, d) => sum + figureOf(d)[0], 0);
  const ink = before + last[2] - first[1];
  const size = round1(Math.min(MEASURE / ink, maxHeight / FIGURE_HEIGHT));
  return { size, x: round1(MARGIN - first[1] * size) };
}

// Average advance of a character, in em: the story labels are tracked capitals, the story lines running text. Slightly generous, so an estimate never under-reports a width.
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
  artAlt: string | null;
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
export function coverOf(issue: {
  number: number;
  title: string;
  date: string;
  cover: IssueCover;
  sections: readonly Pick<IssueSection, 'id' | 'label' | 'title'>[] | null;
}): CoverModel {
  const { cover } = issue;
  const byId = new Map((issue.sections ?? []).map((s) => [s.id, s]));
  const known = (id: string) => !issue.sections || byId.has(id);
  const label = (s: Pick<IssueSection, 'label' | 'title'> | undefined, id: string) =>
    s ? plainText(sectionLabel(s)) : labelFromId(id);
  const rows = cover.lines.length
    ? cover.lines
        .filter((l) => known(l.section))
        .map((l) => ({ id: l.section, label: label(byId.get(l.section), l.section), text: plainText(l.text) }))
    : (issue.sections ?? []).slice(0, 5).map((s) => ({ id: s.id, label: label(s, s.id), text: '' }));
  return {
    tone: cover.tone,
    art: cover.art ?? null,
    artAlt: cover.artAlt ?? null,
    number: issueNo(issue.number),
    date: issue.date ? formatDay(issue.date) : '',
    title: issue.title,
    rows,
  };
}
