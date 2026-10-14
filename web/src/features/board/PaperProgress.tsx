import { CheckCircle } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useAuth } from '../../auth';
import { Badge } from '../../ui';
import { useBoard } from './api';
import { sittingsDone, type Paper } from './board';
import { usePaperScores } from './scores';

/** The library items done on the signed-in student's board (none for guests, or with the board off). */
function useDoneItems(): Set<string> {
  const { status, featureOn } = useAuth();
  const board = useBoard({ enabled: status === 'signed-in' && featureOn('board') });
  return useMemo(
    () => new Set((board.data?.cards ?? []).filter((c) => c.column === 'done' && c.link?.type === 'library_item').map((c) => c.link?.id ?? '')),
    [board.data],
  );
}

/** "4 of 12 sittings done", from the board; nothing until one is done. */
export function SittingsDone({ papers, className }: { papers: readonly Paper[]; className?: string }) {
  const done = useDoneItems();
  const n = sittingsDone(papers, done);
  if (!n.done) return null;
  return (
    <span className={className} data-hub="board-sittings">
      {n.done} of {n.total} sitting{n.total === 1 ? '' : 's'} done
    </span>
  );
}

/** "Done" (with the private score, if there is one) for a paper done on the board. */
export function PaperDone({ itemId }: { itemId: string }) {
  const done = useDoneItems();
  const [scores] = usePaperScores();
  if (!done.has(itemId)) return null;
  const score = scores[itemId];
  return (
    <Badge tone="signal" size="sm" icon={CheckCircle}>
      {score == null ? 'Done' : `Done, ${score}%`}
    </Badge>
  );
}
