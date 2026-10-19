// /manage: every tool a person's boxes give them, each with what's waiting. Reps, newsletter and content managers,
// and admins (who hold every box) all work from here. A tool whose feature is switched off doesn't show.
import {
  BookOpenText,
  Bug,
  Calculator,
  CalendarCheck,
  CalendarDots,
  ChartBar,
  ChatCircleDots,
  ChatsCircle,
  ClockCounterClockwise,
  Compass,
  Flag,
  GearSix,
  HandWaving,
  ListChecks,
  ListMagnifyingGlass,
  Newspaper,
  Power,
  PuzzlePiece,
  Tray,
  UsersThree,
  YoutubeLogo,
  type Icon,
} from '@phosphor-icons/react';
import { Suspense, useId, useMemo, useState, type ReactNode } from 'react';
import { Gate, MANAGER_BOXES, useAuth } from '../../auth';
import { normalizeYear, UnsavedProvider, useLeaveGuard, useQueryParam, useUnsavedRegistry } from '../../state';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorBoundary,
  Count,
  Page,
  PageHeader,
  Panel,
  QueryError,
  Select,
  Skeleton,
  cx,
  formatCount,
} from '../../ui';
import { ActivityLog, PeopleList } from '../access/public';
import { CareerEditor } from '../career/public';
import { DailyContentEditor } from '../daily/public';
import { ForumSettingsEditor, ReportsQueue } from '../forum/public';
import { ModulesEditor, SuggestionsQueue } from '../modules/public';
import { FlaggedQuestions, UploadsQueue } from '../library/public';
import { RequestsQueue } from '../requests/public';
import { GradeRulesEditor } from '../grades/public';
import { IssuesManager, NewsletterSettingsEditor } from '../newsletter/public';
import { NooraEditor } from '../noora/public';
import { SiteEditor } from '../site/public';
import { GuidesEditor } from '../start/public';
import { useAdminStats } from './api';
import { Gaps } from './Gaps';
import { NooraNumbers } from './NooraNumbers';
import { SundaySummary } from './SundaySummary';
import { SummaryWords } from './SummaryWords';
import { BugReports } from '../bugs/public';
import { groupSections, sectionsFor, type SectionId } from './sections';
import './ManagePage.css';

const SECTIONS: Record<SectionId, { label: string; icon: Icon }> = {
  reports: { label: 'Reports', icon: Flag },
  uploads: { label: 'Uploads', icon: Tray },
  requests: { label: 'Requests', icon: HandWaving },
  bugs: { label: 'Bugs', icon: Bug },
  newsletter: { label: 'Newsletter', icon: Newspaper },
  calendar: { label: 'Calendar', icon: CalendarDots },
  summary: { label: 'Sunday summary', icon: CalendarCheck },
  career: { label: 'Career Navigator', icon: Compass },
  content: { label: 'Modules', icon: BookOpenText },
  daily: { label: 'Daily puzzles', icon: PuzzlePiece },
  guides: { label: 'Guides', icon: ListChecks },
  forum: { label: 'Forum', icon: ChatsCircle },
  videos: { label: 'Suggested videos', icon: YoutubeLogo },
  gaps: { label: 'Gaps', icon: ListMagnifyingGlass },
  numbers: { label: 'Numbers', icon: ChartBar },
  people: { label: 'People', icon: UsersThree },
  activity: { label: 'Activity', icon: ClockCounterClockwise },
  noora: { label: 'Mini Noora', icon: ChatCircleDots },
  grades: { label: 'Grades calculator', icon: Calculator },
  site: { label: 'Site settings', icon: GearSix },
};

const NUMBERS = [
  ['openReports', 'Open reports'],
  ['pendingUploads', 'Uploads to review'],
  ['openRequests', 'Open requests'],
  ['openBugReports', 'Open bug reports'],
  ['pendingSuggestions', 'Suggested videos'],
  ['users', 'People'],
  ['threads', 'Threads'],
  ['replies', 'Replies'],
  ['libraryItems', 'Library files'],
] as const;

function Numbers() {
  const { featureOn, isAdmin } = useAuth();
  return (
    <div className="manage-stack">
      <HubNumbers />
      {featureOn('noora.ai') ? <NooraNumbers canEdit={isAdmin} /> : null}
    </div>
  );
}

function HubNumbers() {
  const stats = useAdminStats(true);
  if (stats.isError)
    return (
      <QueryError
        error={stats.error}
        title="The numbers didn’t load"
        onRetry={() => void stats.refetch()}
        retrying={stats.isFetching}
        size="sm"
      />
    );
  // A count is null while its feature is switched off, so it isn't shown.
  const shown = stats.data ? NUMBERS.filter(([key]) => stats.data[key] !== null) : NUMBERS;
  return (
    <dl className="manage-numbers" aria-busy={stats.isPending || undefined}>
      {shown.map(([key, label]) => {
        const value = stats.data?.[key];
        return (
          <div key={key} className="manage-number">
            <dt>{label}</dt>
            <dd>
              {value === undefined || value === null ? <Skeleton width="2.5ch" height="1em" /> : formatCount(value)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function LinkOut({
  icon,
  title,
  body,
  to,
  label,
}: {
  icon: Icon;
  title: string;
  body: string;
  to: string;
  label: string;
}) {
  return (
    <Panel padding="none">
      <EmptyState size="sm" icon={icon} title={title} body={body} action={<Button to={to}>{label}</Button>} />
    </Panel>
  );
}

function SummaryForMe() {
  const { me } = useAuth();
  const year = normalizeYear(me?.year);
  return (
    <div className="manage-stack">
      <SundaySummary defaultYear={year} />
      <SummaryWords defaultYear={year} />
    </div>
  );
}

const BODIES: Record<SectionId, () => ReactNode> = {
  reports: () => <ReportsQueue />,
  uploads: () => (
    <>
      <UploadsQueue />
      <FlaggedQuestions />
    </>
  ),
  requests: () => <RequestsQueue />,
  bugs: () => <BugReports />,
  newsletter: () => (
    <div className="manage-stack">
      <IssuesManager />
      <NewsletterSettingsEditor />
    </div>
  ),
  calendar: () => (
    <LinkOut
      icon={CalendarDots}
      title="The calendar"
      body="Add, edit and delete events from the calendar itself."
      to="/calendar"
      label="Open the calendar"
    />
  ),
  summary: () => <SummaryForMe />,
  career: () => <CareerEditor />,
  content: () => <ModulesEditor />,
  daily: () => <DailyContentEditor />,
  guides: () => <GuidesEditor />,
  forum: () => <ForumSettingsEditor />,
  videos: () => <SuggestionsQueue />,
  gaps: () => <Gaps />,
  numbers: () => <Numbers />,
  people: () => <PeopleList />,
  activity: () => <ActivityLog />,
  noora: () => <NooraEditor />,
  grades: () => <GradeRulesEditor />,
  site: () => <SiteEditor />,
};

/** The tabs that hold a draft. */
const KEEP_DRAFTS: ReadonlySet<SectionId> = new Set([
  'newsletter',
  'summary',
  'career',
  'content',
  'guides',
  'forum',
  'noora',
  'grades',
  'site',
]);

const andList = new Intl.ListFormat('en-GB', { type: 'conjunction' });

const LOADING = (
  <Panel padding="md">
    <Skeleton lines={8} />
  </Panel>
);

const HEADER = (
  <PageHeader title="Manage" description="Your tools, and what’s waiting for you. Every action is logged." />
);

/**
 * Manage's sections, grouped (Waiting, Publish, Look after), each waiting one with its count. A list on the left
 * from 1024px; a "Show" picker above the section below that, so every section is in reach at any width.
 */
function ManageNav({
  sections,
  current,
  counts,
  onPick,
}: {
  sections: SectionId[];
  current: SectionId;
  counts: Partial<Record<SectionId, number | null>>;
  onPick: (id: SectionId) => void;
}) {
  const groups = groupSections(sections);
  const headId = useId();
  const named = (id: SectionId) => {
    const n = counts[id];
    return n ? `${SECTIONS[id].label} (${n})` : SECTIONS[id].label;
  };
  return (
    <>
      <div className="manage-pick">
        <Select
          label="Show"
          value={current}
          onChange={(e) => onPick(e.target.value as SectionId)}
          data-hub="manage-pick"
        >
          {groups.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {g.sections.map((id) => (
                <option key={id} value={id}>
                  {named(id)}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <nav className="manage-nav" aria-label="Your tools" data-hub="manage-nav">
        {groups.map((g) => (
          <div key={g.id} className="manage-nav__group">
            <h2 className="manage-nav__head" id={`${headId}-${g.id}`}>
              {g.label}
            </h2>
            <ul role="list" aria-labelledby={`${headId}-${g.id}`}>
              {g.sections.map((id) => {
                const Icon = SECTIONS[id].icon;
                const n = counts[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={cx('manage-nav__item', id === current && 'is-active')}
                      aria-current={id === current ? 'page' : undefined}
                      onClick={() => onPick(id)}
                      data-section={id}
                    >
                      <Icon
                        aria-hidden="true"
                        weight={id === current ? 'duotone' : 'regular'}
                        className="manage-nav__icon"
                      />
                      <span className="manage-nav__label">{SECTIONS[id].label}</span>
                      {n ? <Count value={n} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}

function ManageScreen() {
  const { can, featureOn, isAdmin } = useAuth();
  const sections = sectionsFor(can, featureOn, isAdmin);
  const stats = useAdminStats(can('stats.view'));
  const counts: Partial<Record<SectionId, number | null>> = {
    reports: stats.data?.openReports ?? null,
    uploads: stats.data?.pendingUploads ?? null,
    requests: stats.data?.openRequests ?? null,
    videos: stats.data?.pendingSuggestions ?? null,
    bugs: stats.data?.openBugReports ?? null,
  };
  const [tab, setTab] = useQueryParam('tab', sections[0] ?? 'reports');
  const current = sections.find((id) => id === tab) ?? sections[0];
  // An editor keeps its unsaved draft while another tab is open: once visited, its panel stays mounted (hidden).
  const [visited, setVisited] = useState<ReadonlySet<SectionId>>(() => new Set(current ? [current] : []));
  // The editors report their unsaved changes; leaving Manage (or the screen an editor is on) asks first.
  const unsaved = useUnsavedRegistry();
  const guard = useLeaveGuard(unsaved.names.length > 0, unsaved.loses);
  const registry = useMemo(() => ({ report: unsaved.report, bypass: guard.bypass }), [unsaved.report, guard.bypass]);
  if (!current) {
    return (
      <Page className="manage">
        {HEADER}
        <Panel padding="none">
          <EmptyState
            icon={Power}
            title="Your tools are switched off right now."
            body="The parts of the hub you manage are off. They’re back here when they’re switched on."
          />
        </Panel>
      </Page>
    );
  }
  return (
    <Page className="manage">
      {HEADER}
      <UnsavedProvider value={registry}>
        <div className="manage-layout">
          <ManageNav
            sections={sections}
            current={current}
            counts={counts}
            onPick={(id) => {
              setVisited((v) => new Set([...v, current, id]));
              setTab(id, { replace: true });
            }}
          />
          {sections.map((id) => {
            const active = id === current;
            if (!active && !(KEEP_DRAFTS.has(id) && visited.has(id))) return null;
            return (
              <section key={id} className="manage-panel" aria-label={SECTIONS[id].label} hidden={!active}>
                {/* The list and the picker already name the section on screen. */}
                <h2 className="visually-hidden">{SECTIONS[id].label}</h2>
                <ErrorBoundary name={`Manage:${id}`}>
                  {/* The editors load on first use (each feature's public.ts exports them lazily). */}
                  <Suspense fallback={LOADING}>{BODIES[id]()}</Suspense>
                </ErrorBoundary>
              </section>
            );
          })}
        </div>
      </UnsavedProvider>
      <ConfirmDialog
        open={guard.asking}
        title="Leave without saving?"
        body={<p>{`Your changes to ${andList.format(unsaved.names)} aren’t saved. If you leave, they’re lost.`}</p>}
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={guard.leave}
        onClose={guard.stay}
      />
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
