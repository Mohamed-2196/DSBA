import { Link } from 'react-router-dom';
import { Button, Skeleton, glyph, Icon } from '../../ui';
import { paperLabel } from '../../lib/exams';
import { useAuth } from '../../auth';
import { useQuestionThreads } from '../forum/public';
import { questionHref, questionLabel, useModuleQuestions } from './papers';
import {
  marksByKey,
  practiseList,
  practisePath,
  progressLabel,
  progressOf,
  tagKey,
  usePracticeOn,
  useQuestionMarks,
} from './practice';
import { ThreadCount, WorkedAnswerLink } from './components/QuestionExtras';
import { MarkBadge } from './components/MarkBadge';
import { threadCounts, threadKey } from './questionThreads';
import './ChapterQuestions.css';

export function ChapterQuestions({ moduleId, chapterId }: { moduleId: string; chapterId: string }) {
  const { featureOn } = useAuth();
  const all = useModuleQuestions(moduleId);
  const practising = usePracticeOn();
  const marks = useQuestionMarks(moduleId, { enabled: practising });
  const threads = useQuestionThreads({ module_id: moduleId }, { enabled: featureOn('forum') });
  if (all.isPending) return <Skeleton lines={2} />;
  if (all.isError) return null; // an extra: the lesson works without it
  const mine = practiseList(all.data, chapterId);
  const byKey = marksByKey(marks.data);
  const counts = threadCounts(threads.data);
  const progress = practising && marks.data ? progressOf(mine, byKey) : null;
  const started = !!progress && progress.done + progress.stuck + progress.skipped > 0;
  return (
    <section className="lib-chq" aria-labelledby={`lib-chq-${chapterId}`} data-hub="chapter-questions">
      <div className="lib-chq__head">
        <div className="lib-chq__titles">
          <h3 id={`lib-chq-${chapterId}`} className="lib-chq__h">
            Past exam questions on this chapter
          </h3>
          {progress && mine.length ? (
            <p className="lib-chq__progress u-tabular" data-hub="chapter-progress">
              {progressLabel(progress)}
            </p>
          ) : null}
        </div>
        {mine.length && featureOn('library.practice') ? (
          <Button
            size="sm"
            variant={started ? 'primary' : 'secondary'}
            to={practisePath(moduleId, chapterId)}
            leadingIcon={<Icon glyph={glyph.target} />}
            data-hub="practise-chapter"
          >
            {started ? 'Carry on practising' : 'Practise this chapter'}
          </Button>
        ) : null}
      </div>
      {mine.length ? (
        <ul role="list" className="lib-chq__list">
          {mine.map((q) => {
            const mark = byKey.get(tagKey(q));
            const n = counts.get(threadKey(q)) ?? 0;
            return (
              <li key={q.id} className="lib-chq__item">
                <Link to={questionHref(q)} className="lib-chq__card" title={q.paper.title}>
                  <div className="lib-chq__thumb">
                    {q.paper.coverUrl ? (
                      <img src={q.paper.coverUrl} alt="" className="lib-chq__cover" loading="lazy" />
                    ) : (
                      <div className="lib-chq__fallback">
                        <Icon glyph={glyph.exam} aria-hidden="true" className="lib-chq__icon" />
                      </div>
                    )}
                  </div>
                  <div className="lib-chq__info">
                    <span className="lib-chq__q u-tabular">{questionLabel(q)}</span>
                    <span className="lib-chq__paper">{paperLabel(q.paper)}</span>
                  </div>
                  {mark ? <MarkBadge mark={mark} /> : null}
                </Link>
                {q.answer || n ? (
                  <div className="lib-qx lib-chq__extras">
                    <WorkedAnswerLink question={q} />
                    <ThreadCount question={q} threads={n} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="lib-chq__empty">
          No questions tagged with this chapter yet. Open a past paper from the{' '}
          <Link to={`/modules/${encodeURIComponent(moduleId)}?tab=files`}>Files tab</Link> and choose “Tag this
          question” to add one.
        </p>
      )}
    </section>
  );
}
