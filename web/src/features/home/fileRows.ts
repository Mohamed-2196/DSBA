// Home's "New files": the newest files in the student's modules, each with its real title. A batch (three or more
// files added to one module on one day, as an import does) is one row, "12 files added to ST2133", so the list never
// shows a run of rows that look the same. Links to other sites are left out: Home lists files the Hub serves.
import type { LibraryItem } from '../../api/types';

export type NewFileRow =
  | { kind: 'file'; id: string; item: LibraryItem; at: string }
  | { kind: 'batch'; id: string; moduleId: string; count: number; at: string; item: LibraryItem };

/** Three or more files on one module and day are a batch. */
export const BATCH_MIN = 3;

const dayOf = (iso: string): string => iso.slice(0, 10);
const when = (item: LibraryItem): string => item.publishedAt ?? item.createdAt;

/**
 * The rows for `items` (newest first), keeping only files in `mine` (modules; null keeps every module) and those
 * without a module. At most `n` rows.
 */
export function newFileRows(items: readonly LibraryItem[], mine: ReadonlySet<string> | null, n: number): NewFileRow[] {
  const files = items.filter((i) => i.source === 'file' && (!i.moduleId || !mine || mine.has(i.moduleId)));
  const groups = new Map<string, LibraryItem[]>();
  for (const f of files) {
    if (!f.moduleId) continue;
    const key = `${f.moduleId}|${dayOf(when(f))}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const rows: NewFileRow[] = [];
  const done = new Set<string>();
  for (const f of files) {
    const key = f.moduleId ? `${f.moduleId}|${dayOf(when(f))}` : null;
    const group = key ? (groups.get(key) ?? []) : [];
    if (key && f.moduleId && group.length >= BATCH_MIN) {
      if (done.has(key)) continue;
      done.add(key);
      rows.push({
        kind: 'batch',
        id: `b${key}`,
        moduleId: f.moduleId,
        count: group.length,
        at: when(f),
        item: group.find((i) => i.coverUrl) ?? f,
      });
    } else rows.push({ kind: 'file', id: `f${f.id}`, item: f, at: when(f) });
    if (rows.length >= n) break;
  }
  return rows;
}
