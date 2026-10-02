import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowFatUp, ChatsCircle, CheckCircle, HandHeart, MagnifyingGlass, ShieldCheck, Tag, UsersThree } from '@phosphor-icons/react';
import { ErrorBoundary, cx } from '../../../ui';
import { UpcomingEvents } from '../../calendar/public.js';
import { CATEGORIES } from '../data/taxonomy.js';
import { authorLabel } from '../data/authors.js';
import { topContributors } from '../lib/model.js';
import { AuthorAvatar } from './AuthorAvatar.jsx';

function CategoryMark({ category }) {
  if (category.year) {
    return (
      <span className={cx('forum-cat__mark', `forum-cat__mark--y${category.year}`)} aria-hidden="true">
        {category.year}
      </span>
    );
  }
  const Icon = category.id === 'study-groups' ? UsersThree : ChatsCircle;
  return (
    <span className="forum-cat__mark forum-cat__mark--plain" aria-hidden="true">
      <Icon weight="bold" />
    </span>
  );
}

const RULES = [
  { icon: MagnifyingGlass, text: 'Search before you post. Your question may already have an answer.' },
  { icon: Tag, text: 'Put the module code in your title, like ST2133.' },
  { icon: CheckCircle, text: 'Accept the answer that helped, so the next person finds it.' },
  { icon: ShieldCheck, text: 'Never share exam questions while an exam window is open.' },
  { icon: HandHeart, text: 'Be kind. Everyone here is revising too.' },
];

/** The quiet margin next to the thread list. */
export function ForumSidebar({ threads, counts, cohort, onPickCategory }) {
  const people = useMemo(() => topContributors(threads), [threads]);
  return (
    <aside className="forum-side" data-hub="forum-sidebar" aria-label="Forum overview">
      <section className="forum-side__block" aria-labelledby="forum-side-cats">
        <h2 id="forum-side-cats" className="forum-side__title">Categories</h2>
        <ul role="list" className="forum-cats">
          {CATEGORIES.map((c) => {
            const active = cohort === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={cx('forum-cat', active && 'is-active')}
                  aria-pressed={active}
                  onClick={() => onPickCategory(active ? 'all' : c.id)}
                >
                  <CategoryMark category={c} />
                  <span className="forum-cat__text">
                    <span className="forum-cat__label">{c.label}</span>
                    <span className={cx('forum-cat__blurb', c.year && c.year < 3 && 'is-codes')}>
                      {c.year && c.year < 3 ? c.modules.join(' ') : c.blurb}
                    </span>
                  </span>
                  <span className="forum-cat__count">{counts[c.id] || 0}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {people.length ? (
        <section className="forum-side__block" aria-labelledby="forum-side-people">
          <h2 id="forum-side-people" className="forum-side__title">Top contributors this week</h2>
          <ol role="list" className="forum-people">
            {people.map((p, i) => (
              <li key={p.authorId} className="forum-person">
                <span className="forum-person__rank" aria-hidden="true">{i + 1}</span>
                <AuthorAvatar author={p.author} size="md" />
                <span className="forum-person__text">
                  <span className="forum-person__name">{authorLabel(p.author)}</span>
                  <span className="forum-person__meta">
                    {p.replies} {p.replies === 1 ? 'reply' : 'replies'}
                    {p.accepted ? `, ${p.accepted} accepted` : ''}
                  </span>
                </span>
                <span className="forum-person__score" aria-label={`${p.votes} upvotes on their replies`}>
                  <ArrowFatUp weight="fill" aria-hidden="true" />
                  {p.votes}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="forum-side__block" aria-labelledby="forum-side-dates">
        <div className="forum-side__head">
          <h2 id="forum-side-dates" className="forum-side__title">Upcoming deadlines</h2>
          <Link to="/calendar" className="forum-side__link">Calendar</Link>
        </div>
        <ErrorBoundary name="UpcomingEvents">
          <UpcomingEvents n={3} />
        </ErrorBoundary>
      </section>

      <section className="forum-side__block" aria-labelledby="forum-side-rules">
        <h2 id="forum-side-rules" className="forum-side__title">Guidelines</h2>
        <ul role="list" className="forum-rules">
          {RULES.map(({ icon: Icon, text }) => (
            <li key={text}>
              <Icon aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <Link to="/forum/welcome-to-the-forum" className="forum-side__link forum-side__more">Read the full guidelines</Link>
      </section>
    </aside>
  );
}
