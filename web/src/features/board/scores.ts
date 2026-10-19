// Practice scores on past papers, as the board shows them. They are kept in the student's account (GET and PUT
// /paper-scores, api.ts), where only they see them.
import type { PaperScore } from '../../api/types';

/** Scores by library item id. */
export type Scores = Readonly<Record<string, number>>;

/** The scores by library item id. */
export const scoresById = (list: readonly PaperScore[]): Scores =>
  Object.fromEntries(list.map((s) => [s.itemId, s.score]));

/** The list with one paper's score set (null: removed), the newest first, as the API keeps it. */
export function withScore(list: readonly PaperScore[], itemId: string, score: number | null, at: string): PaperScore[] {
  const others = list.filter((s) => s.itemId !== itemId);
  return score === null ? others : [{ itemId, score, updatedAt: at }, ...others];
}
