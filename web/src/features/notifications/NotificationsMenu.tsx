// Bell + dropdown in the top bar: the signed-in person's notifications from the API (hidden for guests).
import { Link } from 'react-router-dom';
import {
  ArrowClockwise, Bell, ChatsCircle, Check, Checks, FileArrowUp, FileX, Newspaper, SealCheck, ShieldCheck, WarningCircle, type Icon,
} from '@phosphor-icons/react';
import type { NotificationOut } from '../../api/types';
import { useAuth } from '../../auth';
import { useToast } from '../../state';
import { Button, EmptyState, HubLogo, IconButton, Menu, Skeleton, Tooltip, cx, safeInternalPath, timeAgo } from '../../ui';
import { useMarkAllRead, useMarkRead, useNotifications } from './api';
import './NotificationsMenu.css';

type Kind = NotificationOut['kind'];

const KIND_ICON: Record<Exclude<Kind, 'system'>, { icon: Icon; tone: string }> = {
  thread_reply: { icon: ChatsCircle, tone: 'forum' },
  reply_reply: { icon: ChatsCircle, tone: 'forum' },
  answer_accepted: { icon: SealCheck, tone: 'signal' },
  upload_published: { icon: FileArrowUp, tone: 'signal' },
  upload_rejected: { icon: FileX, tone: 'alert' },
  new_issue: { icon: Newspaper, tone: 'newsletter' },
  report_resolved: { icon: ShieldCheck, tone: 'forum' },
};

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'system') return <HubLogo variant="tile" size={36} decorative className="notif-icon notif-icon--tile" />;
  const { icon: Glyph, tone } = KIND_ICON[kind] ?? KIND_ICON.thread_reply;
  return (
    <span className={cx('notif-icon', `notif-icon--${tone}`)} aria-hidden="true">
      <Glyph weight={tone === 'newsletter' ? 'fill' : 'regular'} />
    </span>
  );
}

function Row({ n, onOpen, onMarkRead }: { n: NotificationOut; onOpen: () => void; onMarkRead: () => void }) {
  const unread = !n.readAt;
  // Only ever a page inside the Hub (security review, finding 12).
  const to = safeInternalPath(n.url);
  const content = (
    <>
      <span className="notif-item__icon">
        <KindIcon kind={n.kind} />
        {unread ? <span className="notif-item__dot" aria-hidden="true" /> : null}
      </span>
      <span className="notif-item__text">
        <span className="notif-item__title" dir="auto">
          {n.title}
          {unread ? <span className="visually-hidden">, unread</span> : null}
        </span>
        {n.body ? (
          <span className="notif-item__body" dir="auto">
            {n.body}
          </span>
        ) : null}
      </span>
      <time className="notif-item__time" dateTime={n.createdAt}>
        {timeAgo(n.createdAt)}
      </time>
    </>
  );
  return (
    <li className={cx('notif-item', unread && 'is-unread')}>
      {to ? (
        <Link to={to} className="notif-item__link" onClick={onOpen}>
          {content}
        </Link>
      ) : (
        <button type="button" className="notif-item__link" onClick={onOpen}>
          {content}
        </button>
      )}
      {unread ? (
        <Tooltip label="Mark as read" side="left" describe={false} className="notif-item__mark">
          <IconButton size="sm" label={`Mark “${n.title}” as read`} icon={Check} onClick={onMarkRead} />
        </Tooltip>
      ) : null}
    </li>
  );
}

export function NotificationsMenu() {
  const { status, me } = useAuth();
  const signedIn = status === 'signed-in' && !!me;
  const query = useNotifications(signedIn);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const { push } = useToast();

  if (!signedIn) return null;

  const pages = query.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const unread = pages[0]?.unreadCount ?? 0;

  const read = (n: NotificationOut) => {
    if (!n.readAt) markRead.mutate(n.id);
  };
  const readAll = () =>
    markAll.mutate(undefined, {
      onError: () => push({ tone: 'alert', title: 'Couldn’t mark them as read', body: 'Check your connection and try again.' }),
    });

  return (
    <Menu
      align="end"
      width={400}
      label="Notifications"
      className="notif-pop"
      onOpenChange={(open) => {
        if (open) void query.refetch();
      }}
      trigger={<IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} icon={Bell} badge={unread || undefined} data-hub="notifications" />}
    >
      {({ close }) => (
        <div className="notif" data-hub="notif-menu">
          <div className="notif__head">
            <h2 className="notif__title">Notifications</h2>
            <span className={cx('notif__count', unread > 0 && 'has-unread')}>{unread ? `${unread} new` : query.isSuccess ? 'You’re all caught up' : ''}</span>
          </div>
          {query.isPending ? (
            <ul role="list" className="notif__list" aria-busy="true" aria-label="Loading notifications">
              {[0, 1, 2].map((i) => (
                <li key={i} className="notif-item notif-item--loading">
                  <span className="notif-item__link">
                    <Skeleton width={36} height={36} radius="var(--r-control)" />
                    <Skeleton lines={2} />
                    <span />
                  </span>
                </li>
              ))}
            </ul>
          ) : query.isError && !items.length ? (
            <EmptyState
              size="sm"
              icon={WarningCircle}
              title="Notifications didn’t load"
              body="Check your connection and try again."
              action={
                <Button size="sm" leadingIcon={ArrowClockwise} onClick={() => void query.refetch()} loading={query.isFetching}>
                  Try again
                </Button>
              }
            />
          ) : !items.length ? (
            <EmptyState size="sm" icon={Bell} title="No notifications yet" body="Replies to your threads, accepted answers and reviews of your uploads show up here." />
          ) : (
            <ul role="list" className="notif__list">
              {items.map((n) => (
                <Row
                  key={n.id}
                  n={n}
                  onOpen={() => {
                    read(n);
                    close(false);
                  }}
                  onMarkRead={() => read(n)}
                />
              ))}
              {query.hasNextPage ? (
                <li className="notif__more">
                  <Button variant="ghost" size="sm" fullWidth onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                    Show older notifications
                  </Button>
                </li>
              ) : null}
            </ul>
          )}
          {items.length ? (
            <div className="notif__foot">
              <Button variant="ghost" size="sm" leadingIcon={Checks} disabled={!unread} loading={markAll.isPending} onClick={readAll}>
                Mark all as read
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Menu>
  );
}
