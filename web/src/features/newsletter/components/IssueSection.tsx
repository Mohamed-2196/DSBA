// One section of an issue: the label, the headline, the copy, a live part (deadlines from the calendar, threads
// from the forum, files from the library, requests done) and the reactions; a picture or a card beside it.
// Used by the reader and by the editor's preview.
import type { ReactNode } from 'react';
import type { IssueSection as SectionData, LiveFallback, PollResult, ReactionCounts } from '../../../api/types';
import { useAuth } from '../../../auth';
import { addDaysToKey } from '../../../lib/dates';
import { ErrorBoundary, cx } from '../../../ui';
import { useCalendarEvents } from '../../calendar/public';
import { useHotThreads } from '../../forum/public';
import { useRecentFiles } from '../../library/public';
import { useDoneRequests } from '../../requests/public';
import { liveSectionOn } from '../lib/live';
import { plainText, sectionDomId, sectionLabel } from '../lib/text';
import type { Block } from '../types';
import { Aside, Blocks, Figure } from './Blocks';
import { Reactions } from './Reactions';
import { sectionIcon } from './sectionIcons';
import { Deadlines, SessionCalendar } from './sections/Deadlines';
import { ForumList, LibraryList, LiveSkeleton, RequestsList } from './sections/LiveLists';

export interface SectionIssue {
  id: string;
  slug: string;
  date: string;
  editors: readonly string[];
  reactions: Record<string, ReactionCounts>;
  polls?: Record<string, PollResult>;
}

export interface IssueSectionProps {
  issue: SectionIssue;
  section: SectionData;
  /** Reactions show their counts but can't be pressed (a draft, the editor's preview). */
  readOnly?: boolean;
}

interface FrameProps extends IssueSectionProps {
  /** The headline (a live section that has nothing to list shows its fallback title). */
  title?: string;
  /** The copy before the live part (hidden when the live part falls back to an invitation). */
  blocks?: readonly Block[];
  body?: ReactNode;
  /** Beside the copy when the section has no picture or card of its own. */
  aside?: ReactNode;
}

function SectionFrame({ issue, section, readOnly, title = section.title, blocks = section.blocks, body, aside }: FrameProps) {
  const Icon = sectionIcon(section.icon);
  const headId = `${sectionDomId(section.id)}-title`;
  const label = plainText(sectionLabel(section));
  // A picture (or a wide card) takes a column beside the copy; on a phone it moves above it.
  const wide = Boolean(section.figure) || Boolean(section.aside?.wide);
  let side: ReactNode = null;
  if (section.figure) side = <Figure figure={section.figure} />;
  else if (section.aside) side = <Aside aside={section.aside} />;
  else if (aside) side = aside;
  const poll = { issueId: issue.id, slug: issue.slug, polls: issue.polls, readOnly };
  return (
    <section id={sectionDomId(section.id)} className={cx('nl-section', `nl-section--${section.kind ?? 'copy'}`, wide && 'has-wide-aside')} aria-labelledby={headId} data-hub="issue-section">
      <header className="nl-section__head">
        <p className="nl-section__label">
          <Icon weight="duotone" aria-hidden="true" />
          {label}
        </p>
        <h2 id={headId} className="nl-section__title" tabIndex={-1}>
          {plainText(title)}
        </h2>
      </header>
      <div className="nl-section__body">
        <Blocks blocks={blocks} editors={issue.editors} poll={poll} />
        {body ? (
          <ErrorBoundary name={`Newsletter ${section.id}`} resetKey={issue.slug}>
            {body}
          </ErrorBoundary>
        ) : null}
        <Blocks blocks={section.after} editors={issue.editors} poll={poll} />
        <Reactions issueId={issue.id} issueSlug={issue.slug} sectionId={section.id} counts={issue.reactions[section.id]} label={label} readOnly={readOnly} />
      </div>
      {side ? <div className="nl-section__aside">{side}</div> : null}
    </section>
  );
}

/** Exams between the section's dates (as of the issue, never "today"), from the calendar. */
function DeadlinesSection(props: IssueSectionProps) {
  const { issue, section } = props;
  const on = liveSectionOn('deadlines', useAuth().featureOn);
  const from = section.window?.from ?? issue.date;
  const to = section.window?.to ?? addDaysToKey(from, 90);
  const q = useCalendarEvents({ from, to, type: 'exam' }, { enabled: on });
  const exams = q.data ?? [];
  if (!on) return <SectionFrame {...props} />;
  return (
    <SectionFrame
      {...props}
      body={q.isPending ? <LiveSkeleton rows={4} /> : <Deadlines issueDate={issue.date} exams={exams} />}
      aside={exams.length ? <SessionCalendar exams={exams} /> : null}
    />
  );
}

/** A live list that may have nothing to show yet: the section then reads as its fallback (an invitation). */
function fallbackProps(section: SectionData, empty: boolean): { title: string; blocks: readonly Block[]; fallback: LiveFallback | null } {
  const fallback = section.fallback ?? null;
  return empty && fallback ? { title: fallback.title, blocks: [], fallback } : { title: section.title, blocks: section.blocks, fallback };
}

/** From the forum: hot threads about a module first (study questions, study groups), then the rest. */
function ForumSection(props: IssueSectionProps) {
  const on = liveSectionOn('forum', useAuth().featureOn);
  const q = useHotThreads({ n: 12, enabled: on });
  const list = q.data ?? [];
  const threads = [...list.filter((t) => t.moduleId), ...list.filter((t) => !t.moduleId)].slice(0, 4);
  const { title, blocks, fallback } = fallbackProps(props.section, !q.isPending && !threads.length);
  if (!on) return <SectionFrame {...props} />;
  return <SectionFrame {...props} title={title} blocks={blocks} body={q.isPending ? <LiveSkeleton /> : <ForumList threads={threads} fallback={fallback} />} />;
}

/** New in the library: the newest published files. */
function LibrarySection(props: IssueSectionProps) {
  const on = liveSectionOn('library', useAuth().featureOn);
  const q = useRecentFiles({ n: 4, enabled: on });
  const files = q.data ?? [];
  const { title, blocks, fallback } = fallbackProps(props.section, !q.isPending && !files.length);
  if (!on) return <SectionFrame {...props} />;
  return <SectionFrame {...props} title={title} blocks={blocks} body={q.isPending ? <LiveSkeleton /> : <LibraryList files={files} fallback={fallback} />} />;
}

/** You asked, we did: the requests done in the 30 days up to the issue's date (as of the issue, never "today"). */
function RequestsSection(props: IssueSectionProps) {
  const on = liveSectionOn('requests', useAuth().featureOn);
  const q = useDoneRequests({ until: props.issue.date, limit: 5, enabled: on });
  const requests = q.data?.items ?? [];
  const { title, blocks, fallback } = fallbackProps(props.section, !q.isPending && !requests.length);
  if (!on) return <SectionFrame {...props} />;
  return <SectionFrame {...props} title={title} blocks={blocks} body={q.isPending ? <LiveSkeleton /> : <RequestsList requests={requests} fallback={fallback} />} />;
}

export function IssueSection(props: IssueSectionProps) {
  switch (props.section.kind) {
    case 'deadlines':
      return <DeadlinesSection {...props} />;
    case 'forum':
      return <ForumSection {...props} />;
    case 'library':
      return <LibrarySection {...props} />;
    case 'requests':
      return <RequestsSection {...props} />;
    default:
      return <SectionFrame {...props} />;
  }
}
