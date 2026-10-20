// What a tagged past question offers besides its paper: the examiners' report open at its worked answer, and the
// forum threads that link it. Shown under the question on the chapter's list, Home's daily question and the practise
// page.
import { Link } from 'react-router-dom';
import type { PaperQuestion } from '../../../api/types';
import { DocThumb, Icon, cx, glyph } from '../../../ui';
import { answerHref, questionHref, questionName } from '../papers';
import './QuestionExtras.css';

/** "Worked answer, report p. 7": the sitting's examiners' report at the question's commentary. */
export function WorkedAnswerLink({
  question,
  className,
}: {
  question: Pick<PaperQuestion, 'answer' | 'section' | 'question'>;
  className?: string;
}) {
  const a = question.answer;
  if (!a) return null;
  return (
    <Link
      to={answerHref(a)}
      className={cx('lib-qx__link', className)}
      data-hub="worked-answer"
      aria-label={`Worked answer to ${questionName(question)}, examiners’ report page ${a.page}`}
    >
      <DocThumb tone="report" size="sm" />
      <span>
        Worked answer <span className="lib-qx__page u-tabular">p. {a.page}</span>
      </span>
    </Link>
  );
}

/** "2 threads": the paper's page at the question, where its threads are listed. Nothing for none. */
export function ThreadCount({
  question,
  threads,
}: {
  question: Pick<PaperQuestion, 'paper' | 'page' | 'section' | 'question'>;
  threads: number;
}) {
  if (threads < 1) return null;
  return (
    <Link
      to={questionHref(question)}
      className="lib-qx__link lib-qx__threads"
      data-hub="question-threads"
      aria-label={`${threads === 1 ? '1 thread' : `${threads} threads`} about ${questionName(question)}`}
    >
      <Icon glyph={glyph.forum} />
      <span className="u-tabular">{threads === 1 ? '1 thread' : `${threads} threads`}</span>
    </Link>
  );
}
