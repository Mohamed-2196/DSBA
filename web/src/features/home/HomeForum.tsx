// Home's "Forum": replies to the student first (from the bell's notifications, so nothing more is asked of the API),
// then the most active threads in the student's modules (and those about no module), most recent first.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import type { NotificationOut } from '../../api/types';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Deskmate, EmptyState, Icon, Panel, QueryError, glyph, safeInternalPath, timeAgo } from '../../ui';
import { useHotThreads } from '../forum/public';
import { useNotifications } from '../notifications/public';
import { modulesFor, usePapers } from '../papers/public';
import { HomeList, HomeListLoading, type HomeListRow } from './HomeList';
import { repliesToYou } from './replies';

/** Replies to the student (home-screen.png, "Replies to you"): who answered, what about, when; Pip and Pod beside. */
function RepliesToYou({ replies }: { replies: readonly NotificationOut[] }) {
  return (
    <Panel padding="none" className="home-replies" data-section="forum" data-hub="home-replies">
      <div className="home-replies__head">
        <h3 className="home-replies__title">Replies to you</h3>
        <Deskmate mate="pip-pod" size={56} className="home-replies__mate" />
      </div>
      <ul role="list" className="home-replies__list">
        {replies.map((r) => {
          const to = safeInternalPath(r.url) ?? '/forum';
          return (
            <li key={r.id}>
              <Link to={to} className="home-replies__row">
                {r.readAt ? null : (
                  <>
                    <span className="home-replies__dot" aria-hidden="true" />
                    <span className="visually-hidden">New: </span>
                  </>
                )}
                <span className="home-replies__what">{r.title}</span>
                {r.body ? <span className="home-replies__body">“{r.body}”</span> : null}
                <span className="home-replies__when">{timeAgo(r.createdAt)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

export function HomeForum({ year, n = 5 }: { year: CohortYear; n?: number }) {
  const { status } = useAuth();
  const notifications = useNotifications(status === 'signed-in');
  const replies = useMemo(
    () => repliesToYou(notifications.data?.pages.flatMap((p) => p.items) ?? [], 2),
    [notifications.data],
  );
  const { modules: catalogue, getModule } = useModules();
  const { papers } = usePapers();
  const mine = useMemo(() => new Set(modulesFor(year, papers, catalogue).map((m) => m.id)), [year, papers, catalogue]);
  const threads = useHotThreads({ n: 12, year });

  const rows = useMemo(
    (): HomeListRow[] =>
      (threads.data ?? [])
        .filter((t) => !t.moduleId || mine.has(t.moduleId))
        .slice(0, n)
        .map((t) => {
          const m = getModule(t.moduleId);
          return {
            id: t.id,
            icon: <Icon glyph={glyph.forum} />,
            title: t.title,
            to: `/forum/${t.slug}`,
            code: m ? m.unitCode || m.shortName : null,
            what: t.replyCount === 1 ? '1 reply' : `${t.replyCount} replies`,
            at: t.lastActivityAt,
          };
        }),
    [threads.data, mine, getModule, n],
  );

  const failed = threads.isError ? (
    <QueryError
      error={threads.error}
      title="The forum didn’t load"
      size="sm"
      onRetry={() => void threads.refetch()}
      retrying={threads.isFetching}
    />
  ) : null;
  // With replies to show, the active threads make room: two of them.
  const list = <HomeList rows={replies.length ? rows.slice(0, 2) : rows} hub="home-forum" />;
  if (replies.length) {
    return (
      <div className="home-forum">
        <RepliesToYou replies={replies} />
        {threads.isPending ? <HomeListLoading label="Loading the forum" /> : (failed ?? (rows.length ? list : null))}
      </div>
    );
  }
  if (threads.isPending) return <HomeListLoading label="Loading the forum" />;
  if (failed) return failed;
  if (!rows.length) {
    return (
      <Panel padding="none" data-hub="home-forum">
        <EmptyState
          size="sm"
          icon={<Icon glyph={glyph.forum} />}
          title="No threads in your modules yet"
          body="Ask the first question, and classmates from every year can answer."
          action={
            <Button to="/forum" size="sm">
              Open the forum
            </Button>
          }
        />
      </Panel>
    );
  }
  return list;
}
