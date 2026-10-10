// A module's shared folders (v1's subject card), as labelled entries for the Overview tab.
// Links are the course's Google Drive folders and always open in a new tab.
import { BookOpenText, Exam, Notepad, PencilSimpleLine, type Icon } from '@phosphor-icons/react';
import type { ModuleDetail } from '../../api/types';

/** 'a', 'a and b', 'a, b and c'. */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface ResourceLink {
  label: string;
  href: string;
  ariaLabel: string;
}

export interface ResourceEntry {
  id: 'materials' | 'exercises' | 'exams' | 'cheatSheet';
  label: string;
  icon: Icon;
  description: string | null;
  note?: string | null;
  links: ResourceLink[];
}

/** Only https links leave the app from here. */
const safe = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    return new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

/** Resource entries in v1's order, plus `missing`: plain names of what nobody has shared yet. */
export function buildResources(m: Pick<ModuleDetail, 'unitCode' | 'name' | 'resources'>): { entries: ResourceEntry[]; missing: string[] } {
  const r = m.resources;
  const materials = safe(r.materials);
  const exercises = safe(r.exercises);
  const vle = safe(r.vle);
  const older = safe(r.olderExams);
  const cheat = safe(r.cheatSheet);
  const entries: ResourceEntry[] = [];

  if (materials) {
    entries.push({
      id: 'materials',
      label: 'Books and study guide',
      icon: BookOpenText,
      description: `The books and study guide for ${m.unitCode || m.name}, in the shared folder.`,
      links: [{ label: 'Open folder', href: materials, ariaLabel: 'Open the books and study guide folder (opens in a new tab)' }],
    });
  }

  if (exercises || r.exercisesNote) {
    entries.push({
      id: 'exercises',
      label: 'Exercises',
      icon: PencilSimpleLine,
      description: r.exercisesNote ? null : 'Practice questions for this module.',
      note: r.exercisesNote,
      links: exercises
        ? [{ label: r.exercisesNote ? 'More exercises' : 'Open folder', href: exercises, ariaLabel: 'Open the exercises folder (opens in a new tab)' }]
        : [],
    });
  }

  if (vle || older) {
    const same = !!vle && vle === older;
    const links: ResourceLink[] = same && vle
      ? [{ label: 'VLE and older exams', href: vle, ariaLabel: 'Open VLE and older exams (opens in a new tab)' }]
      : [
          ...(vle ? [{ label: 'VLE exams', href: vle, ariaLabel: 'Open VLE exams (opens in a new tab)' }] : []),
          ...(older ? [{ label: 'Older exams', href: older, ariaLabel: 'Open older exams (opens in a new tab)' }] : []),
        ];
    entries.push({
      id: 'exams',
      label: 'Previous exams',
      icon: Exam,
      description: same
        ? 'Past papers from the VLE and older sittings, kept in one folder.'
        : vle && older
          ? 'Past papers from the VLE, and older papers from earlier sittings.'
          : vle
            ? 'Past papers from the VLE.'
            : 'Older papers from earlier sittings.',
      links,
    });
  }

  if (cheat) {
    entries.push({
      id: 'cheatSheet',
      label: 'Cheat sheet',
      icon: Notepad,
      description: 'A quick-reference sheet for revision.',
      links: [{ label: 'Open', href: cheat, ariaLabel: 'Open the cheat sheet (opens in a new tab)' }],
    });
  }

  const missing = [
    !materials && 'books',
    !(exercises || r.exercisesNote) && 'exercises',
    !(vle || older) && 'past papers',
    !cheat && 'a cheat sheet',
  ].filter((x): x is string => typeof x === 'string');

  return { entries, missing };
}

/** One line on what a module without video lessons offers, e.g. 'Study guide and VLE exams'. */
export function resourceSummary(m: Pick<ModuleDetail, 'resources'>): string {
  const r = m.resources;
  const parts: string[] = [];
  if (r.materials) parts.push('study guide');
  if (r.vle && r.olderExams) parts.push(r.vle === r.olderExams ? 'VLE and older exams' : 'VLE exams, older exams');
  else if (r.vle) parts.push('VLE exams');
  else if (r.olderExams) parts.push('older exams');
  if (r.exercises || r.exercisesNote) parts.push('exercises');
  if (r.cheatSheet) parts.push('cheat sheet');
  if (!parts.length) return 'Resources on the way';
  const s = joinAnd(parts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
