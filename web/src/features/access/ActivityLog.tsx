// The activity log: who did what, newest first, in plain words.
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { AdminUserPage } from '../../api/types';
import { useAuth } from '../../auth';
import { Avatar, Button, EmptyState, formatDate, glyph, Icon, Panel, QueryError, Skeleton, timeAgo } from '../../ui';
import { ADMIN_USERS_KEY, useAudit, usePeople } from './api';
import { auditActor, describeAudit } from './audit';
import './ActivityLog.css';

export function ActivityLog() {
  const qc = useQueryClient();
  const { me, can } = useAuth();
  const audit = useAudit(true);
  // The newest accounts, so "suspended an account" can say whose (any list already loaded helps too). Reading
  // accounts needs people.suspend.
  usePeople('', null, can('people.suspend'));
  const entries = audit.data?.pages.flatMap((p) => p.items) ?? [];
  const nameOf = (id: string): string | null => {
    if (id === me?.id) return me.displayName ?? null;
    for (const [, data] of qc.getQueriesData<InfiniteData<AdminUserPage, number>>({ queryKey: ADMIN_USERS_KEY })) {
      for (const page of data?.pages ?? []) {
        const found = page.items.find((u) => u.id === id);
        if (found) return found.displayName ?? null;
      }
    }
    return null;
  };
  if (audit.isPending) {
    return (
      <Panel padding="none">
        <div className="activity-loading" aria-busy="true" aria-label="Loading activity">
          {[0, 1, 2].map((i) => (
            <div key={i} className="activity-loading__row">
              <Skeleton circle width={32} height={32} />
              <Skeleton lines={2} />
            </div>
          ))}
        </div>
      </Panel>
    );
  }
  if (audit.isError) {
    return (
      <QueryError
        error={audit.error}
        title="Activity didn’t load"
        onRetry={() => void audit.refetch()}
        retrying={audit.isFetching}
        size="sm"
      />
    );
  }
  if (!entries.length) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={<Icon glyph={glyph.clock} />}
          title="Nothing yet"
          body="Role changes, switches, suspensions and moderation show up here."
        />
      </Panel>
    );
  }
  return (
    <>
      <Panel padding="none">
        <ol role="list" className="activity-log">
          {entries.map((e) => {
            const who = auditActor(e);
            return (
              <li key={e.id} className="activity-log__item">
                <Avatar name={who} size="sm" decorative />
                <p className="activity-log__text">
                  <strong>{who}</strong> {describeAudit(e, nameOf)}
                </p>
                <time
                  className="activity-log__time"
                  dateTime={e.createdAt}
                  title={formatDate(e.createdAt, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                >
                  {timeAgo(e.createdAt)}
                </time>
              </li>
            );
          })}
        </ol>
      </Panel>
      {audit.hasNextPage ? (
        <div className="activity-more">
          <Button onClick={() => void audit.fetchNextPage()} loading={audit.isFetchingNextPage}>
            Show older activity
          </Button>
        </div>
      ) : null}
    </>
  );
}
