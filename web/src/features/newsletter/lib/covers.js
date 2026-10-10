// The cover system of The DSBA Newsletter: one grid, two states.
//
//   art state    the issue has an illustration (cover.art). It fills the cover; the nameplate sits on its
//                top quarter and the cover line plus three story lines on its bottom fifth.
//   type state   no illustration: the cover is built from type alone. Nameplate, a very large issue
//                numeral, the cover line and an index of the issue's stories between rules.
//
// A cover is drawn in a 300 x 400 box and scaled as one piece, so a thumbnail is the same cover, smaller.
// This file is the geometry and the copy fitting (pure functions); the drawing is components/IssueCover.jsx.
import { issueNo, longDate } from './text';

export const COVER_W = 300;
export const COVER_H = 400;
export const MARGIN = 20;
export const MEASURE = COVER_W - 2 * MARGIN;

// Newsreader's display figures (weight 400): every digit is 0.6em wide and 0.725em tall. FIGURE_INK[d] is
// where the ink of digit d starts and ends inside its 0.6em, measured from the font.
const FIGURE_ADVANCE = 0.6;
const FIGURE_INK = [
  [0.039, 0.561], [0.082, 0.541], [0.042, 0.555], [0.068, 0.523], [0.001, 0.591],
  [0.062, 0.531], [0.062, 0.555], [0.068, 0.556], [0.048, 0.551], [0.044, 0.539],
];
export const FIGURE_HEIGHT = 0.725;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Font size and x of an issue numeral whose ink runs from the left margin to the right one ("01" and "00"
 * do), or as far as it gets before the figures grow taller than `maxHeight` (narrow pairs like "11").
 */
export function numeralBox(text, maxHeight) {
  const first = FIGURE_INK[text[0]] || FIGURE_INK[0];
  const last = FIGURE_INK[text[text.length - 1]] || FIGURE_INK[0];
  const ink = FIGURE_ADVANCE * (text.length - 1) + last[1] - first[0];
  const size = round1(Math.min(MEASURE / ink, maxHeight / FIGURE_HEIGHT));
  return { size, x: round1(MARGIN - first[0] * size) };
}

// Average advance of a character, in em: the story labels are tracked capitals in the sans, the story lines
// are the text serif. Slightly generous, so an estimate never under-reports a width.
const LABEL_EM = 0.77;
const LINE_EM = 0.48;

/** The font size (<= size) at which `text` fits in `width`, estimated from its length. */
export function fitSize(text, size, width, em) {
  const need = String(text).length * em * size;
  return need <= width ? size : Math.floor((size * width * 10) / need) / 10;
}
export const fitLabel = (text, size, width) => fitSize(text, size, width, LABEL_EM);
export const fitLine = (text, size, width) => fitSize(text, size, width, LINE_EM);

/**
 * What a cover says, from the issue's data.
 * `issue.cover` is { tone, art?, lines? }: `lines` are [{ section, text }] in story order, where `text` is the
 * story's own headline cut down to a cover line. An issue without `lines` lists its first sections by name.
 * -> { tone, art, number, date, title, rows: [{ id, label, text }] }
 */
export function coverOf(issue) {
  const cover = issue.cover && typeof issue.cover === 'object' ? issue.cover : {};
  const byId = new Map(issue.sections.map((s) => [s.id, s]));
  const rows = cover.lines?.length
    ? cover.lines.filter((l) => byId.has(l.section)).map((l) => ({ id: l.section, label: byId.get(l.section).label, text: l.text }))
    : issue.sections.slice(0, 5).map((s) => ({ id: s.id, label: s.label, text: '' }));
  return {
    tone: cover.tone === 'paper' ? 'paper' : 'navy',
    art: cover.art || null,
    number: issueNo(issue.number),
    date: longDate(issue.date),
    title: issue.title,
    rows,
  };
}
