// "Help the year below" (IDEA-9): the unanswered questions a Year 2 or Year 3 student could answer.
import type { ThreadSummary } from '../../../api/types';
import type { CohortYear } from '../../../state';

/** The cohorts below `year`: none for Year 1. */
export function yearsBelow(year: CohortYear | null | undefined): CohortYear[] {
  if (year === 3) return [1, 2];
  if (year === 2) return [1];
  return [];
}

/**
 * Up to `n` threads from the years below, newest first: unanswered, without a reply, not pinned, visible, and not
 * the viewer's own. Forum-wide threads (no year) are left out: they aren't the year below's questions.
 */
export function pickBelow(threads: readonly ThreadSummary[], below: readonly CohortYear[], n = 3): ThreadSummary[] {
  const seen = new Set<string>();
  return threads
    .filter((t) => {
      if (seen.has(t.id)) return false;
      seen.add(t.id);
      return t.year !== null && below.includes(t.year) && !t.answered && t.replyCount === 0 && !t.pinned && !t.locked && t.status === 'visible' && !t.isMine;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}
