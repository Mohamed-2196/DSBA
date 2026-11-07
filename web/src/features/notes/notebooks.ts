// Which of a student's notebooks a note without one goes to: their first of their own (not a module's), as the API
// keeps it (services/notes.py own_notebook). Deleted, the next of their own takes its place, or the API makes a new one
// when a note needs it.
import type { Notebook } from '../../api/types';

export function firstOwnNotebook(notebooks: readonly Notebook[]): Notebook | null {
  let first: Notebook | null = null;
  for (const b of notebooks) {
    if (b.moduleId) continue;
    if (!first || b.createdAt < first.createdAt || (b.createdAt === first.createdAt && b.id < first.id)) first = b;
  }
  return first;
}

/**
 * Any notebook can be deleted, with its notes. A module's notebook is named after the module, and the first of the
 * student's own keeps its name, so only their other notebooks can be renamed.
 */
export function notebookActions(
  b: Notebook,
  ownFirst: Notebook | null,
  { readOnly }: { readOnly: boolean },
): { rename: boolean; delete: boolean } {
  if (readOnly) return { rename: false, delete: false };
  return { rename: !b.moduleId && b.id !== ownFirst?.id, delete: true };
}
