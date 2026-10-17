// Manage → Newsletter's order. A plain function, tested in manage.test.ts.
import type { IssueSummary } from '../../../api/types';

type Ordered = Pick<IssueSummary, 'status' | 'date' | 'number'>;

/** Drafts first, then published issues; newest first within each (the higher number first on the same day). */
export function managerOrder<T extends Ordered>(issues: readonly T[]): T[] {
  const byNewest = (a: T, b: T) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.number - a.number);
  return [...issues.filter((i) => i.status === 'draft').sort(byNewest), ...issues.filter((i) => i.status !== 'draft').sort(byNewest)];
}
