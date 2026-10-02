// Bell + dropdown in the top bar. Seeded, year-aware notifications; read state persists locally.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alarm, Bell, Check, Checks, ChatsCircle, NotePencil } from '@phosphor-icons/react';
import { useLocalStorage, useYear } from '../../state';
import { CURRENT_USER } from '../../data/people.js';
import { Button, IconButton, Menu, HubLogo, Tooltip, cx, timeAgo } from '../../ui';
import { V1_ANNOUNCEMENT_KEY, buildNotifications } from './seed.js';
import './NotificationsMenu.css';

const READ_KEY = 'hub.notifications.read';

// Enrichment from other features, loaded lazily so the top bar never depends on them at import time.
let extrasPromise = null;
function loadExtras() {
  if (!extrasPromise) {
    extrasPromise = Promise.allSettled([import('../newsletter/public.js'), import('../forum/public.js')]).then(([nl, forum]) => {
      let issue = null;
      let thread = null;
      let hot = [];
      try {
        if (nl.status === 'fulfilled') issue = nl.value.getLatestIssue?.() || null;
      } catch (err) {
        console.error('[DSBA Hub] Notifications could not read the latest issue:', err);
      }
      try {
        if (forum.status === 'fulfilled') {
          const mine = (t) => {
            const a = t?.author;
            const id = typeof a === 'object' && a ? a.id || a.name : a;
            return id === CURRENT_USER.id || id === CURRENT_USER.name;
          };
          hot = forum.value.getHotThreads?.(200) || [];
          thread = hot.find((t) => t?.authorId === CURRENT_USER.id || mine(t)) || null;
        }
      } catch (err) {
        console.error('[DSBA Hub] Notifications could not read the forum:', err);
      }
      return { issue, thread, hot };
    });
  }
  return extrasPromise;
}

function KindIcon({ n }) {
  if (n.kind === 'welcome') return <HubLogo variant="tile" size={36} decorative className="notif-icon notif-icon--tile" />;
  if (n.kind === 'newsletter') {
    return (
      <span className="notif-icon notif-icon--newsletter" aria-hidden="true">
        {String(n.number ?? 1).padStart(2, '0')}
      </span>
    );
  }
  const Icon = n.kind === 'exam' ? Alarm : n.kind === 'forum' ? ChatsCircle : NotePencil;
  return (
    <span className={cx('notif-icon', `notif-icon--${n.kind}`)} aria-hidden="true">
      <Icon weight={n.kind === 'exam' ? 'bold' : 'regular'} />
    </span>
  );
}

export function NotificationsMenu() {
  const { activeYear } = useYear();
  const [read, setRead] = useLocalStorage(READ_KEY, []);
  const [extras, setExtras] = useState(null);

  useEffect(() => {
    let alive = true;
    const run = () => loadExtras().then((x) => alive && setExtras(x));
    const idle = window.requestIdleCallback ? window.requestIdleCallback(run, { timeout: 2500 }) : window.setTimeout(run, 1200);
    return () => {
      alive = false;
      if (window.cancelIdleCallback) window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  const now = Date.now();
  const minuteKey = Math.floor(now / 60000);
  const list = useMemo(
    () => buildNotifications({ year: activeYear, now: minuteKey * 60000, issue: extras?.issue, thread: extras?.thread, hot: extras?.hot }),
    [activeYear, extras, minuteKey],
  );
  const readSet = useMemo(() => new Set([...(Array.isArray(read) ? read : []), ...list.filter((n) => n.defaultRead).map((n) => n.id)]), [read, list]);
  const unread = list.filter((n) => !readSet.has(n.id)).length;

  const markRead = (ids) => {
    setRead((prev) => [...new Set([...(Array.isArray(prev) ? prev : []), ...ids])].slice(-200));
    if (ids.includes(V1_ANNOUNCEMENT_KEY)) {
      try {
        window.localStorage.setItem(V1_ANNOUNCEMENT_KEY, '1'); // v1-compatible "seen" flag
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <Menu
      align="end"
      width={400}
      label="Notifications"
      className="notif-pop"
      onOpenChange={(open) => {
        if (open) loadExtras().then(setExtras);
      }}
      trigger={<IconButton label={unread ? `Notifications, ${unread} unread` : 'Notifications'} icon={Bell} badge={unread || undefined} data-hub="notifications" />}
    >
      {({ close }) => (
        <div className="notif" data-hub="notif-menu">
          <div className="notif__head">
            <h2 className="notif__title">Notifications</h2>
            <span className={cx('notif__count', unread && 'has-unread')}>{unread ? `${unread} new` : 'You’re all caught up'}</span>
          </div>
          <ul role="list" className="notif__list">
            {list.map((n) => {
              const isUnread = !readSet.has(n.id);
              return (
                <li key={n.id} className={cx('notif-item', isUnread && 'is-unread')}>
                  <Link
                    to={n.to}
                    className="notif-item__link"
                    onClick={() => {
                      markRead([n.id]);
                      close(false);
                    }}
                  >
                    <span className="notif-item__icon">
                      <KindIcon n={n} />
                      {isUnread ? <span className="notif-item__dot" aria-hidden="true" /> : null}
                    </span>
                    <span className="notif-item__text">
                      <span className="notif-item__title">
                        {n.title}
                        {isUnread ? <span className="visually-hidden">, unread</span> : null}
                      </span>
                      <span className="notif-item__body" dir="auto">{n.body}</span>
                    </span>
                    <time className="notif-item__time" dateTime={new Date(n.at).toISOString()}>
                      {timeAgo(n.at, now)}
                    </time>
                  </Link>
                  {isUnread ? (
                    <Tooltip label="Mark as read" side="left" describe={false} className="notif-item__mark">
                      <IconButton size="sm" label={`Mark “${n.title}” as read`} icon={Check} onClick={() => markRead([n.id])} />
                    </Tooltip>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="notif__foot">
            <Button variant="ghost" size="sm" leadingIcon={Checks} disabled={!unread} onClick={() => markRead(list.map((n) => n.id))}>
              Mark all as read
            </Button>
          </div>
        </div>
      )}
    </Menu>
  );
}
