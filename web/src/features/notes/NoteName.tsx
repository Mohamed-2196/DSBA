// A note's name in another feature's list: its title, else its first line with its formulas set, else "Untitled note".
import type { NoteSummary } from '../../api/types';
import { labelParts } from './draft';
import { MathLine } from './MathLine';

export function NoteName({ note }: { note: Pick<NoteSummary, 'title' | 'excerpt'> }) {
  return <MathLine parts={labelParts(note)} />;
}
