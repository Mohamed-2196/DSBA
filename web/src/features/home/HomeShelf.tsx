// The desk shelf in Home's greeting band (home-screen.png): a tile per core section with its deskmate and a live line,
// each opening its section. New files and the notes count come with Home's first answer (GET /home), unread replies
// from the bell's own query.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { HomeShelf as ShelfCounts } from '../../api/types';
import { useAuth, type Feature } from '../../auth';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Deskmate, SECTION_MATE, Skeleton } from '../../ui';
import { useNotifications } from '../notifications/public';
import { modulesFor, usePapers } from '../papers/public';
import { unreadReplies } from './replies';
import { shelfTiles, type ShelfSection } from './shelf';

const FEATURE: Record<ShelfSection, Feature | null> = {
  library: 'library',
  modules: null,
  notebook: 'notes',
  forum: 'forum',
  calendar: 'calendar',
};

export function HomeShelf({
  year,
  exam,
  counts,
}: {
  year: CohortYear;
  exam: { days: number; date: Date } | null;
  /** null while Home's answer is on its way */
  counts: ShelfCounts | null;
}) {
  const { status, featureOn } = useAuth();
  const signedIn = status === 'signed-in';
  const { modules: catalogue } = useModules();
  const { papers } = usePapers();
  const notifications = useNotifications(signedIn);
  const notified = useMemo(() => notifications.data?.pages.flatMap((p) => p.items) ?? [], [notifications.data]);

  const tiles = shelfTiles({
    newFiles: counts?.newFiles ?? null,
    modules: modulesFor(year, papers, catalogue).length,
    notes: counts?.notes ?? null,
    signedIn,
    replies: unreadReplies(notified),
    exam,
    on: (s) => {
      const f = FEATURE[s];
      return f == null || featureOn(f);
    },
  });

  return (
    <nav className="home-shelf" aria-label="Your desk" data-hub="home-shelf">
      <ul role="list" className="home-shelf__list u-scroll-row">
        {tiles.map((t) => (
          <li key={t.section}>
            <Link
              to={t.to}
              className="home-shelf__tile"
              data-section={t.section}
              aria-label={t.line ? `${t.label}, ${t.line}` : t.label}
            >
              <Deskmate mate={SECTION_MATE[t.section]} size={56} className="home-shelf__mate" />
              <span className="home-shelf__label" aria-hidden="true">
                {t.label}
              </span>
              {t.line == null ? (
                <Skeleton width={56} height={12} />
              ) : (
                <span className={t.news ? 'home-shelf__line is-news' : 'home-shelf__line'} aria-hidden="true">
                  {t.line}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
