import { CheckCircle } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { useAuth } from '../../auth';
import { Badge } from '../../ui';
import { useBoardLinks, usePaperScores } from './api';
import { sittingsDone, type Paper } from './board';

/** The past papers the signed-in student has done: done on a board, or with a practice score (none for guests, or
 *  with the board off). */
function useDoneItems(): { done: Set<string>; scores: Readonly<Record<string, number>> } {
  const { status, featureOn } = useAuth();
  const on = status === 'signed-in' && featureOn('board');
  const links = useBoardLinks({ enabled: on });
  const scores = usePaperScores({ enabled: on });
  return useMemo(() => {
    const done = new Set((links.data ?? []).filter((l) => l.type === 'library_item' && l.done).map((l) => l.id));
    for (const id of Object.keys(scores.data ?? {})) done.add(id);
    return { done, scores: scores.data ?? {} };
  }, [links.data, scores.data]);
}

/** "4 of 12 sittings done", from the board; nothing until one is done. */
export function SittingsDone({ papers, className }: { papers: readonly Paper[]; className?: string }) {
  const { done } = useDoneItems();
  const n = sittingsDone(papers, done);
  if (!n.done) return null;
  return (
    <span className={className} data-hub="board-sittings">
      {n.done} of {n.total} sitting{n.total === 1 ? '' : 's'} done
    </span>
  );
}

/** "Done" (with the private score, if there is one) for a paper done on the board or scored. */
export function PaperDone({ itemId }: { itemId: string }) {
  const { done, scores } = useDoneItems();
  const score = scores[itemId];
  if (!done.has(itemId)) return null;
  return (
    <Badge tone="signal" size="sm" icon={CheckCircle}>
      {score == null ? 'Done' : `Done, ${score}%`}
    </Badge>
  );
}
