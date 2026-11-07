// What a student can do with a notebook from its menu on /notes.
import type { Notebook } from '../../api/types';

/**
 * Any notebook can be deleted, with its notes. A module's notebook is named after the module, so only the student's
 * own notebooks can be renamed.
 */
export function notebookActions(
  b: Notebook,
  { readOnly }: { readOnly: boolean },
): { rename: boolean; delete: boolean } {
  if (readOnly) return { rename: false, delete: false };
  return { rename: !b.moduleId, delete: true };
}
