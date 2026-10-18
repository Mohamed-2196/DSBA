// Home's "New files": the newest files in the student's modules (their papers, once picked; else their year's), with
// their real titles; a batch added to one module on one day is one row (fileRows.ts).
import { Books, Files, FileText } from '@phosphor-icons/react';
import { useMemo } from 'react';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, Panel, QueryError } from '../../ui';
import { libraryItemPath, libraryKindLabel, useRecentFiles } from '../library/public';
import { modulesFor, usePapers } from '../papers/public';
import { HomeList, HomeListLoading, type HomeListRow } from './HomeList';
import { newFileRows } from './fileRows';

export function NewFiles({ year, n = 5 }: { year: CohortYear; n?: number }) {
  const { modules: catalogue, getModule } = useModules();
  const { papers } = usePapers();
  const mine = useMemo(() => new Set(modulesFor(year, papers, catalogue).map((m) => m.id)), [year, papers, catalogue]);
  const files = useRecentFiles({ n: 30, year });

  const rows = useMemo((): HomeListRow[] => {
    const codeOf = (moduleId: string | null) => {
      const m = getModule(moduleId);
      return m ? m.unitCode || m.shortName : null;
    };
    return newFileRows(files.data ?? [], mine, n).map((r) => {
      if (r.kind === 'batch') {
        const code = codeOf(r.moduleId) ?? 'a module';
        return {
          id: r.id,
          icon: Files,
          title: `${r.count} files added to ${code}`,
          to: `/library?module=${encodeURIComponent(r.moduleId)}`,
          code: null,
          what: 'Open them in the library',
          at: r.at,
        };
      }
      return {
        id: r.id,
        icon: FileText,
        title: r.item.title,
        to: libraryItemPath(r.item),
        code: codeOf(r.item.moduleId),
        what: libraryKindLabel(r.item.kind),
        at: r.at,
      };
    });
  }, [files.data, mine, getModule, n]);

  if (files.isPending) return <HomeListLoading label="Loading new files" />;
  if (files.isError) {
    return (
      <QueryError
        error={files.error}
        title="New files didn’t load"
        size="sm"
        onRetry={() => void files.refetch()}
        retrying={files.isFetching}
      />
    );
  }
  if (!rows.length) {
    return (
      <Panel padding="none" data-hub="home-files">
        <EmptyState
          size="sm"
          icon={Books}
          title="No new files in your modules"
          body="Notes and past papers your classmates add show here first."
          action={
            <Button to="/library" size="sm">
              Open the library
            </Button>
          }
        />
      </Panel>
    );
  }
  return <HomeList rows={rows} hub="home-files" />;
}
