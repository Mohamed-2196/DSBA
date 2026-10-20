import { Link } from 'react-router-dom';
import { Skeleton, QueryError, timeAgo } from '../../ui';
import { usePaperThreads } from './api';
import { ReplyCount } from './components/ThreadBits';
import './components/forum.css';

export interface PaperThreadsProps {
  /** the library item's slug: threads whose post or a reply links /library/<slug> */
  slug: string;
  /** how many to show (the newest first) */
  n?: number;
  /** the heading's level where it is placed */
  headingLevel?: 2 | 3;
  /** one question's threads only: 'q3', or 'b1' on a paper that numbers each section from 1 */
  question?: string;
  /** what the heading calls it: 'this paper' (default), 'Q3' */
  about?: string;
}

/**
 * A paper's page: the threads that link to it (UX-72), newest first, as a compact list of titles with their replies
 * and age. Renders nothing while there are none, so it can sit under "Ask about this paper" without an empty box.
 * @public for the library's paper page (through forum/public.ts)
 */
export function PaperThreads({ slug, n = 5, headingLevel = 3, question, about = 'this paper' }: PaperThreadsProps) {
  const { threads, total, isPending, isError, error, isFetching, refetch } = usePaperThreads(slug, { n, question });
  const Heading = `h${headingLevel}` as const;
  if (isPending) {
    return (
      <div className="forum-paperthreads" aria-busy="true">
        <Skeleton width="60%" height="1em" />
        <Skeleton width="90%" height="0.9em" style={{ marginTop: 10 }} />
      </div>
    );
  }
  if (isError) {
    return (
      <QueryError
        error={error}
        title={`The threads about ${about} didn’t load`}
        onRetry={() => void refetch()}
        retrying={isFetching}
        size="sm"
        panel={false}
      />
    );
  }
  if (!threads.length) return null;
  const more = total - threads.length;
  return (
    <section className="forum-paperthreads" aria-label={`Threads about ${about}`} data-hub="paper-threads">
      <Heading className="forum-paperthreads__title">
        {total === 1 ? `1 thread about ${about}` : `${total} threads about ${about}`}
      </Heading>
      <ul role="list" className="forum-related">
        {threads.map((t) => (
          <li key={t.id} className="forum-related__item">
            <Link to={`/forum/${t.slug}`} className="forum-related__link" dir="auto">
              {t.title}
            </Link>
            <span className="forum-related__meta">
              <ReplyCount count={t.replyCount} answered={t.answered} />
              <time dateTime={t.lastActivityAt}>{timeAgo(t.lastActivityAt)}</time>
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="forum-paperthreads__more">
          The newest {threads.length} of {total}.
        </p>
      ) : null}
    </section>
  );
}
