// A module's shelves (GET /modules/{id} `shelves`), as the Overview tab lists them: what the Hub holds for the module,
// each opening the Files tab at its part. Every file is served by the Hub; a shelf whose files are still being
// copied in says so.
import {
  BookOpenText,
  Exam,
  Files,
  Monitor,
  Notebook,
  Notepad,
  PencilSimpleLine,
  type Icon,
} from '@phosphor-icons/react';
import type { ModuleDetail, ModuleShelf } from '../../api/types';

type ShelfKind = ModuleShelf['kind'];

/** 'a', 'a and b', 'a, b and c'. */
export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

interface ShelfInfo {
  label: string;
  /** lower case, inside a sentence */
  name: string;
  icon: Icon;
  description: string;
}

const SHELF_INFO: Record<ShelfKind, ShelfInfo> = {
  'course-materials': {
    label: 'Books and study guide',
    name: 'books',
    icon: BookOpenText,
    description: 'The study guide and the essential reading.',
  },
  exercises: {
    label: 'Exercises',
    name: 'exercises',
    icon: PencilSimpleLine,
    description: 'Practice questions and problem sets.',
  },
  'past-paper': {
    label: 'Past papers',
    name: 'past papers',
    icon: Exam,
    description: 'Every sitting, with its examiners’ report and solutions when they’re in.',
  },
  'vle-materials': {
    label: 'VLE material',
    name: 'VLE material',
    icon: Monitor,
    description: 'Slides, activities and handouts from the VLE.',
  },
  'cheat-sheet': {
    label: 'Cheat sheet',
    name: 'a cheat sheet',
    icon: Notepad,
    description: 'A quick-reference sheet for revision.',
  },
  notes: {
    label: 'Students’ notes',
    name: 'notes',
    icon: Notebook,
    description: 'Notes students made for their own revision and shared.',
  },
  other: {
    label: 'Other files',
    name: 'other files',
    icon: Files,
    description: 'Anything else shared for this module.',
  },
};

/** What every module should have; the Overview tab says which of these nobody has shared yet. */
const EXPECTED: readonly ShelfKind[] = ['course-materials', 'past-paper', 'notes'];

export interface Shelf extends ShelfInfo {
  kind: ShelfKind;
  files: number;
  beingAdded: boolean;
  /** where it starts on the Files tab */
  hash: string;
}

/** Where a shelf starts on the Files tab: '#papers' for past papers, '#files-<kind>' for the rest. */
export function shelfHash(kind: ShelfKind): string {
  return kind === 'past-paper' ? 'papers' : `files-${kind}`;
}

/** The module's shelves in the API's order, and `missing`: plain names of what nobody has shared yet. */
export function buildShelves(m: Pick<ModuleDetail, 'shelves'>): { shelves: Shelf[]; missing: string[] } {
  const shelves = m.shelves.map((s) => ({
    ...SHELF_INFO[s.kind],
    kind: s.kind,
    files: s.files,
    beingAdded: s.beingAdded,
    hash: shelfHash(s.kind),
  }));
  const have = new Set(m.shelves.map((s) => s.kind));
  return { shelves, missing: EXPECTED.filter((k) => !have.has(k)).map((k) => SHELF_INFO[k].name) };
}

/** The shelf of this kind when it has files, else null (the header's Past papers and Study guide buttons). */
export function shelfWithFiles(m: Pick<ModuleDetail, 'shelves'> | undefined, kind: ShelfKind): ModuleShelf | null {
  return m?.shelves.find((s) => s.kind === kind && s.files > 0) ?? null;
}

/** One line on what a module without video lessons offers, e.g. 'Books, past papers and notes'. */
export function resourceSummary(m: Pick<ModuleDetail, 'shelves'>): string {
  const ready = m.shelves.filter((s) => s.files > 0).map((s) => SHELF_INFO[s.kind].name);
  if (!ready.length) return m.shelves.length ? 'Files on their way into the Hub' : 'Nothing shared yet';
  const s = joinAnd(ready.map((n) => n.replace(/^a /, '')));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
