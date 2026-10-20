// The Lessons tab's past exam questions on a chapter, grouped by its study guide's topics (questions without one
// under "Other"), with chips to show one topic and practise it.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaperQuestion } from '../../api/types';
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
  type Mark,
} from './practice';
import { hasTopics, topicGroups } from './topics';
import { useChapterTopics } from './useChapterTopics';
import { ThreadCount, WorkedAnswerLink } from './components/QuestionExtras';
import { MarkBadge } from './components/MarkBadge';
import { TopicChips } from './components/TopicChips';
import { threadCounts, threadKey } from './questionThreads';
import './ChapterQuestions.css';

function QuestionCards({
  questions,
  marks,
  threads,
}: {
  questions: readonly PaperQuestion[];
  marks: Map<string, Mark>;
  threads: Map<string, number>;
}) {
  return (
    <ul role="list" className="lib-chq__list">
      {questions.map((q) => {
        const mark = marks.get(tagKey(q));
        const n = threads.get(threadKey(q)) ?? 0;
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
  );
}

export function ChapterQuestions({ moduleId, chapterId }: { moduleId: string; chapterId: string }) {
  const { featureOn } = useAuth();
  const all = useModuleQuestions(moduleId);
  const practising = usePracticeOn();
  const marks = useQuestionMarks(moduleId, { enabled: practising });
  const threads = useQuestionThreads({ module_id: moduleId }, { enabled: featureOn('forum') });
  const guide = useChapterTopics(moduleId, chapterId);
  const [topic, setTopic] = useState<string | null>(null);
  if (all.isPending) return <Skeleton lines={2} />;
  if (all.isError) return null; // an extra: the lesson works without it
  const mine = practiseList(all.data, chapterId);
  const groups = hasTopics(mine) ? topicGroups(mine, guide) : [];
  const group = groups.find((g) => g.id === topic) ?? null;
  const shown = group ? group.questions : mine;
  const byKey = marksByKey(marks.data);
  const counts = threadCounts(threads.data);
  const progress = practising && marks.data ? progressOf(shown, byKey) : null;
  const started = !!progress && progress.done + progress.stuck + progress.skipped > 0;
  const what = group ? 'topic' : 'chapter';
  return (
    <section className="lib-chq" aria-labelledby={`lib-chq-${chapterId}`} data-hub="chapter-questions">
      <div className="lib-chq__head">
        <div className="lib-chq__titles">
          <h3 id={`lib-chq-${chapterId}`} className="lib-chq__h">
            Past exam questions on this chapter
          </h3>
          {progress && mine.length ? (
            <p className="lib-chq__progress u-tabular" data-hub="chapter-progress">
              {group ? `${group.title}: ` : ''}
              {progressLabel(progress)}
            </p>
          ) : null}
        </div>
        {mine.length && featureOn('library.practice') ? (
          <Button
            size="sm"
            variant={started ? 'primary' : 'secondary'}
            to={practisePath(moduleId, chapterId, group?.id ?? null)}
            leadingIcon={<Icon glyph={glyph.target} />}
            data-hub="practise-chapter"
          >
            {started ? 'Carry on practising' : `Practise this ${what}`}
          </Button>
        ) : null}
      </div>
      {groups.length > 1 ? (
        <TopicChips
          groups={groups}
          total={mine.length}
          value={group?.id ?? null}
          onChange={setTopic}
          label="Questions by topic"
        />
      ) : null}
      {!mine.length ? (
        <p className="lib-chq__empty">
          No questions tagged with this chapter yet. Open a past paper from the{' '}
          <Link to={`/modules/${encodeURIComponent(moduleId)}?tab=files`}>Files tab</Link> and choose “Tag this
          question” to add one.
        </p>
      ) : groups.length ? (
        (group ? [group] : groups).map((g) => (
          <section key={g.id} className="lib-chq__group" aria-labelledby={`lib-chq-${chapterId}-${g.id}`}>
            <h4 id={`lib-chq-${chapterId}-${g.id}`} className="lib-chq__topic">
              <span className="lib-chq__topic-name">{g.title}</span>
              <span className="lib-chq__topic-n u-tabular">
                {g.questions.length === 1 ? '1 question' : `${g.questions.length} questions`}
              </span>
            </h4>
            <QuestionCards questions={g.questions} marks={byKey} threads={counts} />
          </section>
        ))
      ) : (
        <QuestionCards questions={mine} marks={byKey} threads={counts} />
      )}
    </section>
  );
}
