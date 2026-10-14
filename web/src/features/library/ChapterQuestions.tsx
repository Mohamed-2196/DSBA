// The Lessons tab's "Past exam questions" for a chapter: the questions students tagged with it, newest sitting first,
// each opening its paper at the question's page.
import { Link } from 'react-router-dom';
import type { PaperQuestion } from '../../api/types';
import { Skeleton } from '../../ui';
import { sittingLabel, zoneLabel } from './display';
import { questionHref, questionLabel, useModuleQuestions } from './papers';
import './ChapterQuestions.css';

/** 'May 2024, Zone A', or the paper's title when it has no exam year. */
function paperLabel(q: PaperQuestion): string {
  const p = q.paper;
  if (!p.examYear) return p.title;
  return [sittingLabel(p.examYear, p.examSession), p.zone ? zoneLabel(p.zone) : null].filter(Boolean).join(', ');
}

export function ChapterQuestions({ moduleId, chapterId }: { moduleId: string; chapterId: string }) {
  const all = useModuleQuestions(moduleId);
  if (all.isPending) return <Skeleton lines={2} />;
  if (all.isError) return null; // an extra: the lesson works without it
  const mine = all.data.filter((q) => q.chapterId === chapterId);
  return (
    <section className="lib-chq" aria-labelledby={`lib-chq-${chapterId}`} data-hub="chapter-questions">
      <h3 id={`lib-chq-${chapterId}`} className="lib-chq__h">
        Past exam questions on this chapter
      </h3>
      {mine.length ? (
        <ul role="list" className="lib-chq__list">
          {mine.map((q) => (
            <li key={q.id}>
              <Link to={questionHref(q)} className="lib-chq__link" title={q.paper.title}>
                <span className="lib-chq__paper">{paperLabel(q)}</span>
                <span className="lib-chq__q u-tabular">{questionLabel(q)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="lib-chq__empty">
          None tagged yet. Open a past paper from the <Link to={`/modules/${encodeURIComponent(moduleId)}?tab=files`}>Files tab</Link> and tag its questions
          with this chapter.
        </p>
      )}
    </section>
  );
}
