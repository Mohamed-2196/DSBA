// /moderation (student reps and admins): what needs a look, in two queues. The queues themselves belong to
// the forum (reports) and the library (uploads); this page frames them with the counts from GET /admin/stats.
import { ArrowClockwise, Flag, Tray, WarningCircle } from '@phosphor-icons/react';
import type { AdminStats } from '../../api/types';
import { RoleGate } from '../../auth';
import { ReportsQueue } from '../forum/ReportsQueue';
import { UploadsQueue } from '../library/UploadsQueue';
import { useQueryParam } from '../../state';
import { Button, ErrorBoundary, Page, PageHeader, Skeleton, TabPanel, Tabs } from '../../ui';
import { useAdminStats } from './api';
import './ModerationPage.css';

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-GB');
const fmt = (n: number) => (n >= 10_000 ? compact.format(n) : whole.format(n));

const TILES: { key: keyof AdminStats; label: string }[] = [
  { key: 'openReports', label: 'Open reports' },
  { key: 'pendingUploads', label: 'Uploads to review' },
  { key: 'users', label: 'People' },
  { key: 'threads', label: 'Threads' },
  { key: 'replies', label: 'Replies' },
  { key: 'libraryItems', label: 'Library files' },
];

function StatsRow() {
  const stats = useAdminStats();
  if (stats.isError) {
    // The queues below still work: the counts are a convenience.
    return (
      <p className="mod-stats-error" role="status">
        <WarningCircle aria-hidden="true" weight="fill" />
        <span>The counts didn’t load.</span>
        <Button variant="ghost" size="sm" leadingIcon={ArrowClockwise} onClick={() => void stats.refetch()} loading={stats.isFetching}>
          Try again
        </Button>
      </p>
    );
  }
  return (
    <dl className="mod-stats" aria-busy={stats.isPending || undefined}>
      {TILES.map((t) => (
        <div key={t.key} className="mod-stat">
          <dt className="mod-stat__label">{t.label}</dt>
          <dd className="mod-stat__value">{stats.data ? fmt(stats.data[t.key]) : <Skeleton width="2.5ch" height="1em" />}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModerationScreen() {
  const [tab, setTab] = useQueryParam('tab', 'reports');
  const stats = useAdminStats();
  const tabs = [
    { id: 'reports', label: 'Reports', icon: Flag, count: stats.data?.openReports ?? null },
    { id: 'uploads', label: 'Uploads', icon: Tray, count: stats.data?.pendingUploads ?? null },
  ];
  return (
    <Page className="mod">
      <PageHeader title="Moderation" description="Reports from students and uploads waiting for review. Every action is logged." />
      <StatsRow />
      <Tabs idBase="moderation" tabs={tabs} value={tab} onChange={(id) => setTab(id, { replace: true })} label="Moderation queues" className="mod-tabs" />
      <TabPanel idBase="moderation" id="reports" value={tab} className="mod-panel">
        <ErrorBoundary name="ReportsQueue">
          <ReportsQueue />
        </ErrorBoundary>
      </TabPanel>
      <TabPanel idBase="moderation" id="uploads" value={tab} className="mod-panel">
        <ErrorBoundary name="UploadsQueue">
          <UploadsQueue />
        </ErrorBoundary>
      </TabPanel>
    </Page>
  );
}

export default function ModerationPage() {
  return (
    <RoleGate need="moderator" title="Moderation" description="Reports and uploads waiting for a student rep.">
      <ModerationScreen />
    </RoleGate>
  );
}
