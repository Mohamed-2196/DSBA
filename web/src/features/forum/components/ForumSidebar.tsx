import { Link } from 'react-router-dom';
import { ArrowFatUp } from '@phosphor-icons/react';
import { useAuth } from '../../../auth';
import { Count, ErrorBoundary, Skeleton, cx } from '../../../ui';
import { useModules } from '../../../state/modules';
import { UpcomingEvents } from '../../calendar/public';
import { authorName } from '../lib/authors';
import { useTaxonomy } from '../lib/taxonomy';
import type { ForumStats } from '../../../api/types';
import type { ForumCategoryOut } from '../../../api/types';
import type { CategoryId } from '../types';
import { AuthorAvatar } from './AuthorAvatar';
import { FORUM_ICONS } from './forumIcons';

/** A year's category shows its number; a category for every year, its picture. */
export function CategoryMark({ category }: { category: Pick<ForumCategoryOut, 'year' | 'icon'> }) {
  if (category.year) {
    return (
      <span className={cx('forum-cat__mark', `forum-cat__mark--y${category.year}`)} aria-hidden="true">
        {category.year}
      </span>
    );
  }
  const Icon = FORUM_ICONS[category.icon ?? 'chat'].icon;
  return (
    <span className="forum-cat__mark forum-cat__mark--plain" aria-hidden="true">
      <Icon weight="bold" />
    </span>
  );
}

export interface ForumSidebarProps {
  stats: ForumStats | undefined;
  cohort: CategoryId | 'all';
  onPickCategory: (id: CategoryId | 'all') => void;
}

/** The quiet margin next to the thread list. */
export function ForumSidebar({ stats, cohort, onPickCategory }: ForumSidebarProps) {
  const { categories, guidelines, ready } = useTaxonomy();
  const { getModulesForYear } = useModules();
  const people = stats?.topContributors ?? [];
  const { featureOn } = useAuth();
  return (
    <aside className="forum-side" data-hub="forum-sidebar" aria-label="Forum overview">
      <section className="forum-side__block" aria-labelledby="forum-side-cats">
        <h2 id="forum-side-cats" className="forum-side__title">
          Categories
        </h2>
        <ul role="list" className="forum-cats" aria-busy={!ready || undefined}>
          {ready ? null : <CategorySkeletons />}
          {categories.map((c) => {
            const active = cohort === c.id;
            const codes = c.year && c.year < 3 ? getModulesForYear(c.year).map((m) => m.unitCode || m.shortName) : [];
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
                    <span className={cx('forum-cat__blurb', codes.length > 0 && 'is-codes')}>
                      {codes.length ? codes.join(' ') : c.blurb}
                    </span>
                  </span>
                  {/* A count only when there is something to count (UX review UX-17: a new Hub is all zeros). */}
                  <span className="forum-cat__count">
                    {stats ? (
                      stats.byCategory[c.id] ? (
                        <Count value={stats.byCategory[c.id]} />
                      ) : null
                    ) : (
                      <Skeleton width={14} height="0.9em" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {people.length ? (
        <section className="forum-side__block" aria-labelledby="forum-side-people">
          <h2 id="forum-side-people" className="forum-side__title">
            Top contributors this week
          </h2>
          <ol role="list" className="forum-people">
            {people.map((p, i) => (
              <li key={p.user.id} className="forum-person">
                <span className="forum-person__rank" aria-hidden="true">
                  {i + 1}
                </span>
                <AuthorAvatar author={p.user} size="md" />
                <span className="forum-person__text">
                  <span className="forum-person__name">{authorName(p.user)}</span>
                  <span className="forum-person__meta">
                    {p.replies} {p.replies === 1 ? 'reply' : 'replies'}
                    {p.accepted ? `, ${p.accepted} accepted` : ''}
                  </span>
                </span>
                {p.votes > 0 ? (
                  <span
                    className="forum-person__score"
                    aria-label={`${p.votes} ${p.votes === 1 ? 'upvote' : 'upvotes'} on their replies`}
                  >
                    <ArrowFatUp weight="fill" aria-hidden="true" />
                    {p.votes}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {featureOn('calendar') ? (
        <section className="forum-side__block" aria-labelledby="forum-side-dates">
          <div className="forum-side__head">
            <h2 id="forum-side-dates" className="forum-side__title">
              Coming up
            </h2>
            <Link to="/calendar" className="forum-side__link">
              Calendar
            </Link>
          </div>
          <ErrorBoundary name="UpcomingEvents">
            <UpcomingEvents n={3} />
          </ErrorBoundary>
        </section>
      ) : null}

      {guidelines.length ? (
        <section className="forum-side__block" aria-labelledby="forum-side-rules">
          <h2 id="forum-side-rules" className="forum-side__title">
            Guidelines
          </h2>
          <ul role="list" className="forum-rules">
            {guidelines.map(({ id, icon, text }) => {
              const Icon = FORUM_ICONS[icon].icon;
              return (
                <li key={id}>
                  <Icon aria-hidden="true" />
                  <span>{text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </aside>
  );
}

/** The category list's rows while the categories load. */
function CategorySkeletons() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="forum-cat" aria-hidden="true">
          <Skeleton width={28} height={28} radius={8} />
          <span className="forum-cat__text">
            <Skeleton width="60%" height="0.9em" />
            <Skeleton width="80%" height="0.8em" />
          </span>
        </li>
      ))}
    </>
  );
}
