// Home's "Forum": the most active threads in the student's modules (and those about no module), most recent first.
import { ChatCircleText, ChatsCircle } from '@phosphor-icons/react';
import { useMemo } from 'react';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, EmptyState, Panel, QueryError } from '../../ui';
import { useHotThreads } from '../forum/public';
import { modulesFor, usePapers } from '../papers/public';
import { HomeList, HomeListLoading, type HomeListRow } from './HomeList';

export function HomeForum({ year, n = 5 }: { year: CohortYear; n?: number }) {
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
            icon: ChatCircleText,
            title: t.title,
            to: `/forum/${t.slug}`,
            code: m ? m.unitCode || m.shortName : null,
            what: t.replyCount === 1 ? '1 reply' : `${t.replyCount} replies`,
            at: t.lastActivityAt,
          };
        }),
    [threads.data, mine, getModule, n],
  );

  if (threads.isPending) return <HomeListLoading label="Loading the forum" />;
  if (threads.isError) {
    return (
      <QueryError
        error={threads.error}
        title="The forum didn’t load"
        size="sm"
        onRetry={() => void threads.refetch()}
        retrying={threads.isFetching}
      />
    );
  }
  if (!rows.length) {
    return (
      <Panel padding="none" data-hub="home-forum">
        <EmptyState
          size="sm"
          icon={ChatsCircle}
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
  return <HomeList rows={rows} hub="home-forum" />;
}
