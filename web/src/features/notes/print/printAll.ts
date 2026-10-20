// Printing a module's notes together (IDEA-53): which notes, in which order, and the words around it. Pure.
import type { NoteSummary } from '../../../api/types';
import { formatDay } from '../../../lib/dates';
import { noteLabel } from '../draft';

/** At most this many notes print together: more makes too large a print on a phone. */
export const MAX_PRINT = 30;

/** The notes to print, oldest first. The list comes last edited first: with more than MAX_PRINT, the ones edited
 *  last are kept. `left`: how many of the module's notes are left out. */
export function printOrder<T extends Pick<NoteSummary, 'createdAt'>>(
  lastEditedFirst: readonly T[],
  total: number,
): { notes: T[]; left: number } {
  const notes = lastEditedFirst.slice(0, MAX_PRINT).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { notes, left: Math.max(0, total - notes.length) };
}

/** The line at the top of a note's first page: 'Week 3: estimators · 12 October 2026'. */
export const noteLine = (note: Pick<NoteSummary, 'title' | 'excerpt' | 'createdAt'>): string =>
  `${noteLabel(note)} · ${formatDay(new Date(note.createdAt))}`;

/** What the progress dialog says. */
export function progressLine(done: number, count: number, left: number): string {
  const doing = count === 1 ? 'Preparing your note.' : `Preparing note ${Math.min(done + 1, count)} of ${count}.`;
  if (!left) return doing;
  return `${doing} Only the ${MAX_PRINT} you edited last print, oldest first: ${left} more ${left === 1 ? 'is' : 'are'} left out.`;
}
