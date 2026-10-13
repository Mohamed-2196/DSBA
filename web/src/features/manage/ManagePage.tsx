// /manage: every tool a person's boxes give them, each with what's waiting. Reps, newsletter and content managers,
// and admins (who hold every box) all work from here. A tool whose feature is switched off doesn't show.
import { CalendarDots, ChartBar, ClockCounterClockwise, Compass, Flag, Newspaper, Power, Tray, UsersThree, type Icon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Gate, MANAGER_BOXES, useAuth } from '../../auth';
import { useQueryParam } from '../../state';
import { Button, EmptyState, ErrorBoundary, Page, PageHeader, Panel, QueryError, Skeleton, TabPanel, Tabs, formatCount } from '../../ui';
import { ActivityLog, PeopleList } from '../access/public';
import { ReportsQueue } from '../forum/public';
import { UploadsQueue } from '../library/public';
import { useIssues } from '../newsletter/public';
import { useAdminStats } from './api';
import { sectionsFor, type SectionId } from './sections';
import './ManagePage.css';

const SECTIONS: Record<SectionId, { label: string; icon: Icon }> = {
  reports: { label: 'Reports', icon: Flag },
  uploads: { label: 'Uploads', icon: Tray },
  newsletter: { label: 'Newsletter', icon: Newspaper },
  calendar: { label: 'Calendar', icon: CalendarDots },
  career: { label: 'Career Navigator', icon: Compass },
  numbers: { label: 'Numbers', icon: ChartBar },
  people: { label: 'People', icon: UsersThree },
  activity: { label: 'Activity', icon: ClockCounterClockwise },
};

const NUMBERS = [
  ['openReports', 'Open reports'],
  ['pendingUploads', 'Uploads to review'],
  ['users', 'People'],
  ['threads', 'Threads'],
  ['replies', 'Replies'],
  ['libraryItems', 'Library files'],
] as const;

function Numbers() {
  const stats = useAdminStats(true);
  if (stats.isError) return <QueryError error={stats.error} title="The numbers didn’t load" onRetry={() => void stats.refetch()} retrying={stats.isFetching} size="sm" />;
  // A count is null while its feature is switched off, so it isn't shown.
  const shown = stats.data ? NUMBERS.filter(([key]) => stats.data[key] !== null) : NUMBERS;
  return (
    <dl className="manage-numbers" aria-busy={stats.isPending || undefined}>
      {shown.map(([key, label]) => {
        const value = stats.data?.[key];
        return (
          <div key={key} className="manage-number">
            <dt>{label}</dt>
            <dd>{value === undefined || value === null ? <Skeleton width="2.5ch" height="1em" /> : formatCount(value)}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Drafts() {
  const issues = useIssues({ includeDrafts: true });
  if (issues.isError) return <QueryError error={issues.error} title="Drafts didn’t load" onRetry={() => void issues.refetch()} retrying={issues.isFetching} size="sm" />;
  const drafts = (issues.data ?? []).filter((i) => i.status === 'draft');
  return (
    <Panel padding="none">
      {issues.isPending ? (
        <Skeleton lines={3} />
      ) : drafts.length ? (
        <ul role="list" className="manage-list">
          {drafts.map((d) => (
            <li key={d.id}>
              <Button variant="ghost" to={`/newsletter/${d.slug}/edit`}>
                {d.title}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" icon={Newspaper} title="No drafts" body="Start the next issue from the newsletter page." action={<Button to="/newsletter">Open the newsletter</Button>} />
      )}
    </Panel>
  );
}

function LinkOut({ icon, title, body, to, label }: { icon: Icon; title: string; body: string; to: string; label: string }) {
  return (
    <Panel padding="none">
      <EmptyState size="sm" icon={icon} title={title} body={body} action={<Button to={to}>{label}</Button>} />
    </Panel>
  );
}

const BODIES: Record<SectionId, () => ReactNode> = {
  reports: () => <ReportsQueue />,
  uploads: () => <UploadsQueue />,
  newsletter: () => <Drafts />,
  calendar: () => <LinkOut icon={CalendarDots} title="The calendar" body="Add, edit and delete events from the calendar itself." to="/calendar" label="Open the calendar" />,
  career: () => <LinkOut icon={Compass} title="Career Navigator" body="Its content is edited on Career Navigator." to="/career" label="Open Career Navigator" />,
  numbers: () => <Numbers />,
  people: () => <PeopleList />,
  activity: () => <ActivityLog />,
};

const HEADER = <PageHeader title="Manage" description="Your tools, and what’s waiting for you. Every action is logged." />;

function ManageScreen() {
  const { can, featureOn } = useAuth();
  const sections = sectionsFor(can, featureOn);
  const stats = useAdminStats(can('stats.view'));
  const counts: Partial<Record<SectionId, number | null>> = {
    reports: stats.data?.openReports ?? null,
    uploads: stats.data?.pendingUploads ?? null,
  };
  const [tab, setTab] = useQueryParam('tab', sections[0] ?? 'reports');
  const current = sections.find((id) => id === tab) ?? sections[0];
  if (!current) {
    return (
      <Page className="manage">
        {HEADER}
        <Panel padding="none">
          <EmptyState icon={Power} title="Your tools are switched off right now." body="The parts of the hub you manage are off. They’re back here when they’re switched on." />
        </Panel>
      </Page>
    );
  }
  return (
    <Page className="manage">
      {HEADER}
      <Tabs
        idBase="manage"
        tabs={sections.map((id) => ({ id, label: SECTIONS[id].label, icon: SECTIONS[id].icon, count: counts[id] ?? null }))}
        value={current}
        onChange={(id) => setTab(id, { replace: true })}
        label="Your tools"
        className="manage-tabs"
      />
      {sections.map((id) => (
        <TabPanel key={id} idBase="manage" id={id} value={current} className="manage-panel">
          <ErrorBoundary name={`Manage:${id}`}>{BODIES[id]()}</ErrorBoundary>
        </TabPanel>
      ))}
    </Page>
  );
}

export default function ManagePage() {
  return (
    <Gate title="Manage" anyBox={MANAGER_BOXES}>
      <ManageScreen />
    </Gate>
  );
}
