// Home's "New in my modules": the newest files in the library and the most active threads in the forum, for the
// student's modules (their papers, once picked; else their year's), as one list, newest first.
import { Books, ChatCircleText, FileText } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, Panel, QueryError, Skeleton, timeAgo } from '../../ui';
import { useHotThreads } from '../forum/public';
import { libraryItemPath, libraryKindLabel, useRecentFiles } from '../library/public';
import { modulesFor, usePapers } from '../papers/public';

interface Row {
  id: string;
  kind: 'file' | 'thread';
  title: string;
  to: string;
  code: string | null;
  what: string;
  at: string | null;
}

const time = (iso: string | null): number => (iso ? Date.parse(iso) || 0 : 0);

export function NewInModules({ year, n = 6, files: filesOn, threads: threadsOn }: { year: CohortYear; n?: number; files: boolean; threads: boolean }) {
  const { modules: catalogue, getModule } = useModules();
  const { papers } = usePapers();
  const mine = useMemo(() => new Set(modulesFor(year, papers, catalogue).map((m) => m.id)), [year, papers, catalogue]);
  const files = useRecentFiles({ n: 12, year, enabled: filesOn });
  const threads = useHotThreads({ n: 10, year, enabled: threadsOn });

  const pending = (filesOn && files.isPending) || (threadsOn && threads.isPending);
  const failed = [filesOn && files.isError ? files : null, threadsOn && threads.isError ? threads : null].filter((q) => q !== null);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const codeOf = (moduleId: string | null) => {
      const m = getModule(moduleId);
      return m ? m.unitCode || m.shortName : null;
    };
    for (const f of (filesOn ? files.data : null) ?? []) {
      if (f.moduleId && !mine.has(f.moduleId)) continue;
      out.push({ id: `f${f.id}`, kind: 'file', title: f.title, to: libraryItemPath(f), code: codeOf(f.moduleId), what: libraryKindLabel(f.kind), at: f.publishedAt ?? f.createdAt });
    }
    for (const t of (threadsOn ? threads.data : null) ?? []) {
      if (t.moduleId && !mine.has(t.moduleId)) continue;
      const replies = t.replyCount === 1 ? '1 reply' : `${t.replyCount} replies`;
      out.push({ id: `t${t.id}`, kind: 'thread', title: t.title, to: `/forum/${t.slug}`, code: codeOf(t.moduleId), what: `Thread, ${replies}`, at: t.lastActivityAt });
    }
    return out.sort((a, b) => time(b.at) - time(a.at)).slice(0, n);
  }, [files.data, threads.data, filesOn, threadsOn, mine, getModule, n]);

  if (pending) {
    return (
      <Panel padding="none" className="home-new" aria-busy="true">
        <span className="visually-hidden">Loading what’s new</span>
        <div className="home-new__loading" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} width={`${70 - i * 8}%`} height={14} />
          ))}
        </div>
      </Panel>
    );
  }
  const problem = failed[0];
  if (problem && !rows.length) {
    return (
      <QueryError
        error={problem.error}
        title="What’s new didn’t load"
        size="sm"
        onRetry={() => failed.forEach((q) => void q.refetch())}
        retrying={failed.some((q) => q.isFetching)}
      />
    );
  }
  if (!rows.length) {
    return (
      <Panel padding="none" data-hub="home-new">
        <EmptyState
          size="sm"
          icon={Books}
          title="Nothing new in your modules yet"
          body="Notes, past papers and threads your classmates add will show here first."
          action={
            filesOn ? (
              <Button to="/library" size="sm">
                Open the library
              </Button>
            ) : undefined
          }
        />
      </Panel>
    );
  }
  return (
    <Panel padding="none" className="home-new" data-hub="home-new">
      <ul role="list">
        {rows.map((r) => {
          const Icon = r.kind === 'file' ? FileText : ChatCircleText;
          return (
            <li key={r.id}>
              <Link to={r.to} className="home-new__row">
                <Icon className="home-new__icon" weight="duotone" aria-hidden="true" />
                <span className="home-new__text">
                  <span className="home-new__title">{r.title}</span>
                  <span className="home-new__meta">
                    {r.code ? <span className="home-new__code u-code">{r.code}</span> : null}
                    <span>{r.what}</span>
                  </span>
                </span>
                {r.at ? <span className="home-new__when">{timeAgo(r.at)}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
