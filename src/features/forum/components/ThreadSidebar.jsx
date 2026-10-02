import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CalendarBlank, ChatsCircle, Plus, UsersThree } from '@phosphor-icons/react';
import { Button, CohortBadge, ModuleIcon, formatDate, timeAgo } from '../../../ui';
import { cohortTextColor } from '../../../state';
import { eventDate } from '../../../data/calendar.js';
import { getNextExamForModule } from '../../calendar/public.js';
import { getCategory } from '../data/taxonomy.js';
import { getAuthor, authorLabel } from '../data/authors.js';
import { relatedThreads } from '../lib/model.js';
import { AuthorAvatar } from './AuthorAvatar.jsx';
import { ReplyCount } from './ThreadBits.jsx';

const DAY = 86_400_000;

function nextExam(moduleId) {
  try {
    const e = getNextExamForModule(moduleId);
    if (!e) return null;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Math.round((eventDate(e).getTime() - start.getTime()) / DAY);
    return { ...e, days };
  } catch {
    return null;
  }
}

function ModuleCard({ module }) {
  const exam = useMemo(() => nextExam(module.id), [module.id]);
  return (
    <section className="forum-tside__card" aria-label="Module" style={{ '--forum-c': cohortTextColor(module.year) }}>
      {module.unitCode ? (
        <span className="forum-tside__code">{module.unitCode}</span>
      ) : (
        <span className="forum-tside__icon" aria-hidden="true">
          <ModuleIcon moduleId={module.id} />
        </span>
      )}
      <p className="forum-tside__name">{module.name}</p>
      <div className="forum-tside__meta">
        <CohortBadge year={module.year} size="sm" />
        {exam ? (
          <span className="forum-tside__exam">
            <CalendarBlank aria-hidden="true" weight="bold" />
            Exam {formatDate(exam.date, { day: 'numeric', month: 'short' })}
            {exam.days >= 0 ? <span className="forum-tside__days">{exam.days === 0 ? 'today' : exam.days === 1 ? 'tomorrow' : `in ${exam.days} days`}</span> : null}
          </span>
        ) : null}
      </div>
      <div className="forum-tside__actions is-stacked">
        <Button size="sm" fullWidth to={`/forum/new?module=${module.id}`} leadingIcon={Plus}>
          Ask about {module.unitCode || 'this module'}
        </Button>
        <Button size="sm" fullWidth variant="ghost" to={`/modules/${module.id}?tab=discussion`} leadingIcon={ChatsCircle}>
          All {module.unitCode || 'module'} threads
        </Button>
      </div>
    </section>
  );
}

function CategoryCard({ category }) {
  const Icon = category.id === 'study-groups' ? UsersThree : ChatsCircle;
  return (
    <section className="forum-tside__card" aria-label="Category">
      <span className="forum-tside__icon" aria-hidden="true">
        <Icon />
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

/** Margin of the thread page: the module (with its next exam), who's here, related threads. */
export function ThreadSidebar({ thread, threads }) {
  const related = useMemo(() => relatedThreads(threads, thread), [threads, thread]);
  const people = thread.participants.map((id) => getAuthor(id));
  const category = getCategory(thread.category);
  const last = thread.replies.length ? thread.replies[thread.replies.length - 1] : null;

  return (
    <aside className="forum-tside" aria-label="About this thread">
      {thread.module ? <ModuleCard module={thread.module} /> : category ? <CategoryCard category={category} /> : null}

      <section className="forum-tside__block" aria-labelledby="forum-tside-people">
        <h2 id="forum-tside-people" className="forum-side__title">In this thread</h2>
        <div className="forum-tside__people" aria-hidden="true">
          {people.slice(0, 8).map((p) => (
            <AuthorAvatar key={p.id} author={p} size="md" />
          ))}
          {people.length > 8 ? <span className="forum-tside__more">+{people.length - 8}</span> : null}
        </div>
        {last ? (
          <>
            <p className="forum-tside__facts">
              <span className="u-tabular">{thread.replyCount}</span> {thread.replyCount === 1 ? 'reply' : 'replies'} from{' '}
              <span className="u-tabular">{people.length}</span> {people.length === 1 ? 'person' : 'people'}
              <span className="visually-hidden">: {people.map(authorLabel).join(', ')}</span>
            </p>
            <p className="forum-tside__facts">Last reply {timeAgo(last.createdAt)}</p>
          </>
        ) : (
          <p className="forum-tside__facts">No replies yet. If you know the answer, be the first to help.</p>
        )}
      </section>

      {related.length ? (
        <section className="forum-tside__block" aria-labelledby="forum-tside-related">
          <h2 id="forum-tside-related" className="forum-side__title">Related threads</h2>
          <ul role="list" className="forum-related">
            {related.map((t) => (
              <li key={t.id} className="forum-related__item">
                <Link to={`/forum/${t.id}`} className="forum-related__link" dir="auto">
                  {t.title}
                </Link>
                <span className="forum-related__meta">
                  <ReplyCount count={t.replyCount} answered={t.answered} />
                  <span className="u-tabular">{t.votes} votes</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}
