// The list inside Home's New files and Forum cards: a file's first page, a drawn document or an icon, a title, the
// module and what it is, and when.
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Panel, Skeleton, timeAgo } from '../../ui';

export interface HomeListRow {
  id: string;
  /** a DocThumb or a brand Icon: decoration beside the title */
  icon: ReactNode;
  title: string;
  to: string;
  code: string | null;
  what: string;
  at: string | null;
}

export function HomeList({ rows, hub }: { rows: readonly HomeListRow[]; hub: string }) {
  return (
    <Panel padding="none" className="home-list" data-hub={hub}>
      <ul role="list">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={r.to} className="home-list__row">
              <span className="home-list__icon" aria-hidden="true">
                {r.icon}
              </span>
              <span className="home-list__text">
                <span className="home-list__title">{r.title}</span>
                <span className="home-list__meta">
                  {r.code ? <span className="home-list__code u-code">{r.code}</span> : null}
                  <span>{r.what}</span>
                </span>
              </span>
              {r.at ? <span className="home-list__when">{timeAgo(r.at)}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function HomeListLoading({ label }: { label: string }) {
  return (
    <Panel padding="none" className="home-list" aria-busy="true">
      <span className="visually-hidden">{label}</span>
      <div className="home-list__loading" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} width={`${70 - i * 8}%`} height={14} />
        ))}
      </div>
    </Panel>
  );
}
