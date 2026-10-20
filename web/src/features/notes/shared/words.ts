// How a shared note is named and reached, for the pages that list them (light: no editor).
import type { SharedNoteSummary } from '../../../api/types';

export const sharedNotePath = (id: string): string => `/notes/shared/${encodeURIComponent(id)}`;

/** "Shared by Reem Writer · Year 3", or by a student (shared without a name). */
export function sharedByLine(copy: Pick<SharedNoteSummary, 'author'>): string {
  const a = copy.author;
  if (!a) return 'Shared by a student';
  return a.year ? `Shared by ${a.displayName} · Year ${a.year}` : `Shared by ${a.displayName}`;
}
