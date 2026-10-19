// The notebooks' two budgets (api/app/services/notes.py): the typed text and handwriting, and the pictures, files and
// PDFs. The notes list shows a budget only once it is nearly used up, with what makes room: a meter that sits at 1%
// is furniture. Pure (storage.test.ts).
import type { StorageUse } from '../../api/types';

/** A budget shows from this share of it used. */
export const SHOWN_FROM = 0.8;

export interface Budget {
  label: string;
  used: number;
  limit: number;
  /** what to delete to make room */
  room: string;
}

/** The budgets nearly used up. */
export function nearlyFull(storage: StorageUse): Budget[] {
  const budgets: Budget[] = [
    {
      label: 'Text and handwriting',
      used: storage.writingBytes,
      limit: storage.writingLimitBytes,
      room: 'Delete notes you don’t need any more to make room.',
    },
    {
      label: 'Pictures and files',
      used: storage.filesBytes,
      limit: storage.filesLimitBytes,
      room: 'Delete pictures, files or PDF notes you don’t need any more to make room.',
    },
  ];
  return budgets.filter((b) => b.limit > 0 && b.used >= b.limit * SHOWN_FROM);
}
