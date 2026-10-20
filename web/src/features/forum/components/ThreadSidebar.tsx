import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../auth';
import type { ModuleSummary, ThreadDetail } from '../../../api/types';
import {
  Button,
  CohortBadge,
  ModuleArt,
  ModuleIcon,
  Skeleton,
  formatDate,
  moduleArtSrc,
  timeAgo,
  Icon,
  glyph,
} from '../../../ui';
import { cohortTextColor } from '../../../state';
import { useModules } from '../../../state/modules';
import { daysUntil } from '../../../lib/dates';
import { useModuleExam } from '../../modules/public';
import { useRelatedThreads } from '../api';
import { authorName } from '../lib/authors';
import { participants, takesReplies } from '../lib/replies';
import { useTaxonomy } from '../lib/taxonomy';
import type { ForumCategoryOut } from '../../../api/types';
import { AuthorAvatar } from './AuthorAvatar';
import { FORUM_ICONS } from './forumIcons';
import { ReplyCount } from './ThreadBits';

function ModuleCard({ module }: { module: ModuleSummary }) {
  const { mayTry } = useAuth();
  const exam = useModuleExam(module.id).next?.event ?? null;
  const posts = mayTry('forum.post');
  const days = exam ? daysUntil(exam.date) : null;
  const hasArt = moduleArtSrc(module.art) != null;
  return (
    <section
      className="forum-tside__card"
      aria-label="Module"
      style={{ '--forum-c': cohortTextColor(module.year) } as CSSProperties}
    >
      {hasArt ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-10)', marginBottom: 'var(--sp-6)' }}>
          <ModuleArt art={module.art} />
          {module.unitCode ? (
            <span className="forum-tside__code" style={{ marginBottom: 0 }}>
              {module.unitCode}
            </span>
          ) : null}
        </div>
      ) : module.unitCode ? (
        <span className="forum-tside__code">{module.unitCode}</span>
      ) : (
        <span className="forum-tside__icon" aria-hidden="true">
          <ModuleIcon moduleId={module.id} />
        </span>
      )}
      <p className="forum-tside__name">{module.name}</p>
      <div className="forum-tside__meta">
        <CohortBadge year={module.year} size="sm" />
        {exam && days !== null && days >= 0 ? (
          <span className="forum-tside__exam">
            <Icon glyph={glyph.calendar} />
            {exam.resit ? 'Resit' : 'Exam'} {formatDate(exam.date, { day: 'numeric', month: 'short' })}
            <span className="forum-tside__days">
              {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
            </span>
          </span>
        ) : null}
      </div>
      <div className="forum-tside__actions is-stacked">
        {posts ? (
          <Button size="sm" fullWidth to={`/forum/new?module=${module.id}`} leadingIcon={<Icon glyph={glyph.plus} />}>
            Ask about {module.unitCode || 'this module'}
          </Button>
        ) : null}
        <Button
          size="sm"
          fullWidth
          variant="ghost"
          to={`/modules/${module.id}?tab=discussion`}
          leadingIcon={<Icon glyph={glyph.forum} />}
        >
          All {module.unitCode || 'module'} threads
        </Button>
      </div>
    </section>
  );
}

function CategoryCard({ category }: { category: ForumCategoryOut }) {
  const mark = FORUM_ICONS[category.icon ?? 'chat'].icon;
  return (
    <section className="forum-tside__card" aria-label="Category">
      <span className="forum-tside__icon" aria-hidden="true">
        <Icon glyph={mark} />
      </span>
      <p className="forum-tside__name">{category.label}</p>
      <p className="forum-tside__blurb">{category.blurb}.</p>
      <div className="forum-tside__actions">
        <Button size="sm" to={`/forum?cohort=${category.id}`}>
          More in {category.label}
        </Button>
      </div>
    </section>
  );
}

function RelatedThreads({ threadId }: { threadId: string }) {
  const related = useRelatedThreads(threadId);
  if (related.isPending) {
    return (
      <section className="forum-tside__block" aria-label="Related threads" aria-busy="true">
        <h2 className="forum-side__title">Related threads</h2>
        <Skeleton lines={3} />
      </section>
    );
  }
  // A side block: when it can't load, it simply isn't there.
  if (related.isError || !related.data.length) return null;
  return (
    <section className="forum-tside__block" aria-labelledby="forum-tside-related">
      <h2 id="forum-tside-related" className="forum-side__title">
        Related threads
      </h2>
      <ul role="list" className="forum-related">
        {related.data.map((t) => (
          <li key={t.id} className="forum-related__item">
            <Link to={`/forum/${t.slug}`} className="forum-related__link" dir="auto">
              {t.title}
            </Link>
            <span className="forum-related__meta">
              <ReplyCount count={t.replyCount} answered={t.answered} />
              {t.voteCount > 0 ? (
                <span className="u-tabular">
                  {t.voteCount} {t.voteCount === 1 ? 'vote' : 'votes'}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Margin of the thread page: the module (with its next exam), who's here, related threads. */
export function ThreadSidebar({ thread, unavailable = false }: { thread: ThreadDetail; unavailable?: boolean }) {
  const { getModule } = useModules();
  const { getCategory } = useTaxonomy();
  const module = getModule(thread.moduleId);
  const category = getCategory(thread.category);
  // Who replied: the thread's author only counts when they replied too (student test ST-11).
  const { people, count, last } = useMemo(() => participants(thread.replies), [thread.replies]);
  const replies = thread.replyCount === 1 ? 'reply' : 'replies';

  return (
    <aside className="forum-tside" aria-label="About this thread">
      {module ? <ModuleCard module={module} /> : category ? <CategoryCard category={category} /> : null}

      <section className="forum-tside__block" aria-labelledby="forum-tside-people">
        <h2 id="forum-tside-people" className="forum-side__title">
          In this thread
        </h2>
        {people.length ? (
          <div className="forum-tside__people" aria-hidden="true">
            {people.slice(0, 8).map((p) => (
              <AuthorAvatar key={p.id} author={p} size="md" />
            ))}
            {people.length > 8 ? <span className="forum-tside__more">+{people.length - 8}</span> : null}
          </div>
        ) : null}
        {last ? (
          <>
            <p className="forum-tside__facts">
              <span className="u-tabular">{thread.replyCount}</span> {replies} from{' '}
              {count === 1 && people.length === 1 ? (
                authorName(people[0])
              ) : (
                <>
                  <span className="u-tabular">{count}</span> {count === 1 ? 'person' : 'people'}
                  <span className="visually-hidden">: {people.map((p) => authorName(p)).join(', ')}</span>
                </>
              )}
            </p>
            <p className="forum-tside__facts">Last reply {timeAgo(last.createdAt)}</p>
          </>
        ) : (
          <p className="forum-tside__facts">
            {takesReplies(thread) && !unavailable
              ? 'No replies yet. If you know the answer, be the first to help.'
              : 'No replies.'}
          </p>
        )}
      </section>

      <RelatedThreads threadId={thread.id} />
    </aside>
  );
}
