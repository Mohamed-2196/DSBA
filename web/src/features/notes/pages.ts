// A change to a note's pages of paper, as the API makes it in one go (POST /notes/{id}/pages): a page added, deleted
// or moved, with the handwriting and the free pictures of the pages after it going along. The same rules here, so
// what is on screen follows what the server did (api/app/services/notes.py page_mapping).
import type { PageChange } from '../../api/types';
import type { FreePicture } from './pictures/geometry';
import { PAPER_BASE } from './surface/layout';

/** The change, without the version it is sent with. */
export type PageMove = Omit<PageChange, 'version'>;

/** Where each sheet of paper goes for `change` on a note with `pages` pages (null: deleted); sheets not listed stay. */
export function pageMapping(change: PageMove, pages: number): Map<number, number | null> {
  const out = new Map<number, number | null>();
  const at = change.page;
  if (change.action === 'insert') {
    for (let k = at; k < pages; k++) out.set(PAPER_BASE + k, PAPER_BASE + k + 1);
    return out;
  }
  if (change.action === 'delete') {
    out.set(PAPER_BASE + at, null);
    for (let k = at + 1; k < pages; k++) out.set(PAPER_BASE + k, PAPER_BASE + k - 1);
    return out;
  }
  const to = change.to ?? at;
  const [from, until, step] = to < at ? [to, at - 1, 1] : [at + 1, to, -1];
  for (let k = from; k <= until; k++) out.set(PAPER_BASE + k, PAPER_BASE + k + step);
  out.set(PAPER_BASE + at, PAPER_BASE + to);
  return out;
}

/** How many pages there are after the change. */
export const pagesAfter = (change: PageMove, pages: number): number =>
  pages + (change.action === 'insert' ? 1 : change.action === 'delete' ? -1 : 0);

/** The pictures moved with their pages (the ones on a deleted page go with it). */
export function repaged(list: readonly FreePicture[], map: ReadonlyMap<number, number | null>): FreePicture[] {
  return list.flatMap((p) => {
    if (!map.has(p.sheet)) return [p];
    const to = map.get(p.sheet);
    return to === null || to === undefined ? [] : [{ ...p, sheet: to }];
  });
}

/** The change that takes `change` back. */
export function undoOf(change: PageMove): PageMove {
  if (change.action === 'insert') return { action: 'delete', page: change.page };
  if (change.action === 'delete') return { action: 'insert', page: change.page };
  return { action: 'move', page: change.to ?? change.page, to: change.page };
}
