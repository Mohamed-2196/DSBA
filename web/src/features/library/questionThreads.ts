// Forum threads per past question (GET /forum/question-threads): looked up by the paper's slug and the question.
import type { PaperQuestion, QuestionThreads } from '../../api/types';
import { questionName } from './papers';

/** A question's key among the counts: '<paper slug>/B1'. */
export function threadKey(q: Pick<PaperQuestion, 'paper' | 'section' | 'question'>): string {
  return `${q.paper.slug}/${questionName(q)}`;
}

/** The counts by threadKey. */
export function threadCounts(rows: readonly QuestionThreads[] | undefined): Map<string, number> {
  return new Map(
    (rows ?? []).map((r) => [
      `${r.paperSlug}/${questionName({ section: r.section, question: r.question })}`,
      r.threads,
    ]),
  );
}
