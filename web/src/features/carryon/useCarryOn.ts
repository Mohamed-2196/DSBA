import { useTimeMe } from '../library/public';
import { carryOnRows, noteOn } from './recent';
import { useRecent } from './useRecent';

/** What there is to carry on with: the paper being timed (for `moduleId`, when it is that module's) and the rows. */
export function useCarryOn({ moduleId = null, n = 5 }: { moduleId?: string | null; n?: number } = {}) {
  const { visits, clear } = useRecent();
  const { timer } = useTimeMe();
  const timed = timer && (!moduleId || timer.paper.moduleId === moduleId) ? timer : null;
  const rows = carryOnRows(visits, { moduleId, timedId: timer?.paper.id ?? null, n: timed ? n - 1 : n });
  const timedNote = timed ? noteOn(visits, timed.paper.id) : null;
  return { timed, timedNote, rows, any: !!timed || rows.length > 0, clear };
}
