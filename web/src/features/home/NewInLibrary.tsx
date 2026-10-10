import { Link } from 'react-router-dom';
import { Books } from '@phosphor-icons/react';
import type { CohortYear } from '../../lib/modules';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, Panel, Skeleton, timeAgo } from '../../ui';
import { libraryItemPath, libraryKindLabel, useRecentFiles } from '../library/public';

const NEW_DAYS = 14;
const isRecent = (iso: string | null): boolean => !!iso && Date.now() - new Date(iso).getTime() < NEW_DAYS * 86400000;

/** A small document glyph: page with a folded corner and its format, e.g. PDF. */
function DocGlyph({ format }: { format: string | null }) {
  const f = (format ?? 'link').toUpperCase().slice(0, 4);
  return (
    <span className="home-doc" aria-hidden="true">
      <span className="home-doc__lines" />
      <span className="home-doc__fmt">{f}</span>
    </span>
  );
}

/** "New in the library": the newest published files for the year. */
export function NewInLibrary({ year, n = 5 }: { year: CohortYear; n?: number }) {
  const { getModule } = useModules();
  const q = useRecentFiles({ n, year });

  if (q.isPending) {
    return (
      <Panel padding="none" className="home-files" aria-busy="true">
        <span className="visually-hidden">Loading the newest files</span>
        <ul role="list" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="home-files__row">
              <Skeleton width={30} height={38} radius={4} />
              <span className="home-files__text">
                <Skeleton width="70%" height={14} />
                <Skeleton width="35%" height={12} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }
  if (q.isError) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={Books}
          title="The library didn’t load"
          body="Check your connection, then try again."
          action={
            <Button size="sm" onClick={() => void q.refetch()} loading={q.isFetching}>
              Try again
            </Button>
          }
        />
      </Panel>
    );
  }
  const files = q.data ?? [];
  if (!files.length) {
    return (
      <Panel padding="none">
        <EmptyState
          size="sm"
          icon={Books}
          title="Nothing new in the library yet"
          body="Notes, past papers and study guides your classmates add will show here first."
          action={
            <Button to="/library" size="sm">
              Open the library
            </Button>
          }
        />
      </Panel>
    );
  }
  return (
    <Panel padding="none" className="home-files">
      <ul role="list">
        {files.map((f) => {
          const m = getModule(f.moduleId);
          const code = m?.unitCode ?? m?.shortName ?? null;
          const added = f.publishedAt ?? f.createdAt;
          return (
            <li key={f.id}>
              <Link to={libraryItemPath(f)} className="home-files__row">
                <DocGlyph format={f.source === 'link' ? 'link' : f.format} />
                <span className="home-files__text">
                  <span className="home-files__title">{f.title}</span>
                  <span className="home-files__meta">
                    {code ? <span className="home-files__code u-code">{code}</span> : null}
                    <span>{libraryKindLabel(f.kind)}</span>
                  </span>
                </span>
                <span className="home-files__side">
                  {isRecent(f.publishedAt) ? (
                    <Badge tone="highlight" size="sm">
                      New
                    </Badge>
                  ) : null}
                  {added ? <span className="home-files__when">{timeAgo(added)}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
