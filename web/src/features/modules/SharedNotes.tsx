// The Files tab's "Shared from notebooks": the notes students shared with the module (IDEA-29), the newest first,
// each "Shared by Reem · Year 3, 2 days ago". Nothing shows while there are none: "Share with module" in a note is
// how they come.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, DocThumb, QueryError, Skeleton, timeAgo } from '../../ui';
import { sharedByLine, sharedNotePath, useModuleSharedNotes } from '../notes/public';

const PAGE = 10;

export function SharedNotes({ moduleId }: { moduleId: string }) {
  const [limit, setLimit] = useState(PAGE);
  const q = useModuleSharedNotes(moduleId, { limit, enabled: true });
  if (q.isPending) return <Skeleton lines={2} />;
  if (q.isError) {
    return (
      <QueryError
        error={q.error}
        title="The shared notes didn’t load"
        size="sm"
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  const { items, total } = q.data;
  if (!items.length) return null;
  return (
    <section id="shared-notes" className="mod-shared" aria-labelledby="mod-shared-h" data-hub="module-shared-notes">
      <h3 id="mod-shared-h" className="mod-shared__h">
        <DocThumb tone="note" size="sm" />
        Shared from students’ notebooks
        <span className="mod-shared__count">{total}</span>
      </h3>
      <ul className="mod-lines" role="list">
        {items.map((n) => (
          <li key={n.id}>
            <Link to={sharedNotePath(n.id)} className="mod-line mod-line--doc">
              <DocThumb tone="note" size="md" />
              <span className="mod-line__text">
                <span className="mod-line__title" dir="auto">
                  {n.title || 'Untitled note'}
                </span>
                <span className="mod-line__meta">
                  {sharedByLine(n)}, {timeAgo(n.sharedAt)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {total > items.length ? (
        <Button size="sm" variant="ghost" onClick={() => setLimit((n) => n + PAGE)} loading={q.isFetching}>
          Show more
        </Button>
      ) : null}
    </section>
  );
}
