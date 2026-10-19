// Which of a student's notebooks a note without one goes to: their first of their own (not a module's), as the API
// keeps it (services/notes.py own_notebook). It stays: it can't be renamed or deleted.
import type { Notebook } from '../../api/types';

export function firstOwnNotebook(notebooks: readonly Notebook[]): Notebook | null {
  let first: Notebook | null = null;
  for (const b of notebooks) {
    if (b.moduleId) continue;
    if (!first || b.createdAt < first.createdAt || (b.createdAt === first.createdAt && b.id < first.id)) first = b;
  }
  return first;
}
