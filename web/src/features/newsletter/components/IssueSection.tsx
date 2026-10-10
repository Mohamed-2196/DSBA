// One section of an issue: the label, the headline, the copy, a live part (deadlines from the calendar,
// threads from the forum, files from the library) and the reactions; a picture or a margin note beside it.
// Used by the reader and by the editor's preview.
import type { ReactNode } from 'react';
import type { ReactionCounts } from '../../../api/types';
import { useCalendarEvents } from '../../calendar/public';
import { useHotThreads } from '../../forum/public';
import { useRecentFiles } from '../../library/public';
import { ErrorBoundary, cx } from '../../../ui';
import { addDaysIso, sectionDomId } from '../lib/text';
import type { Block, Section } from '../types';
import { Aside, Blocks, Figure, Profile } from './Blocks';
import { Reactions } from './Reactions';
import { sectionIcon } from './sectionIcons';
import { ChartOfTheWeek } from './sections/ChartOfTheWeek';
import { CohortCorner } from './sections/CohortCorner';
import { Deadlines, SessionCalendar } from './sections/Deadlines';
import { ForumList, LibraryList, LiveSkeleton } from './sections/LiveLists';

export interface SectionIssue {
  id: string;
  slug: string;
  date: string;
  editors: readonly string[];
  reactions: Record<string, ReactionCounts>;
}

export interface IssueSectionProps {
  issue: SectionIssue;
  section: Section;
  /** Reactions show their counts but can't be pressed (a draft, the editor's preview). */
  readOnly?: boolean;
}

interface FrameProps extends IssueSectionProps {
  /** The headline (a live section that has nothing to list shows its fallback title). */
  title?: string;
  /** The copy before the live part (hidden when the live part falls back to an invitation). */
  blocks?: readonly Block[];
  body?: ReactNode;
  /** Beside the copy when the section has no picture or margin note of its own. */
  aside?: ReactNode;
}

function SectionFrame({ issue, section, readOnly, title = section.title, blocks = section.blocks, body, aside }: FrameProps) {
  const Icon = sectionIcon(section.icon);
  const headId = `${sectionDomId(section.id)}-title`;
  // A picture (or a wide margin note) takes a column beside the copy; on a phone it moves above it.
  const wide = Boolean(section.figure) || Boolean(section.aside?.wide);
  let side: ReactNode = null;
  if (section.figure) side = <Figure figure={section.figure} />;
  else if (section.aside) side = <Aside aside={section.aside} />;
  else if (aside) side = aside;
  return (
    <section id={sectionDomId(section.id)} className={cx('nl-section', `nl-section--${section.kind ?? 'copy'}`, wide && 'has-wide-aside')} aria-labelledby={headId} data-hub="issue-section">
      <header className="nl-section__head">
        <p className="nl-section__label">
          <Icon weight="duotone" aria-hidden="true" />
          {section.label}
        </p>
        <h2 id={headId} className="nl-section__title" tabIndex={-1}>
          {title}
        </h2>
        {section.profile ? <Profile profile={section.profile} /> : null}
      </header>
      <div className="nl-section__body">
        <Blocks blocks={blocks} editors={issue.editors} />
        {body ? (
          <ErrorBoundary name={`Newsletter ${section.id}`} resetKey={issue.slug}>
            {body}
          </ErrorBoundary>
        ) : null}
        <Blocks blocks={section.after} editors={issue.editors} />
        <Reactions issueId={issue.id} issueSlug={issue.slug} sectionId={section.id} counts={issue.reactions[section.id]} label={section.label} readOnly={readOnly} />
      </div>
      {side ? <div className="nl-section__aside">{side}</div> : null}
    </section>
  );
}

/** Exams between the section's dates (as of the issue, never "today"), from the calendar. */
function DeadlinesSection(props: IssueSectionProps) {
  const { issue, section } = props;
  const from = section.window?.from ?? issue.date;
  const to = section.window?.to ?? addDaysIso(from, 90);
  const q = useCalendarEvents({ from, to, type: 'exam' });
  const exams = q.data ?? [];
  return (
    <SectionFrame
      {...props}
      body={q.isPending ? <LiveSkeleton rows={4} /> : <Deadlines issueDate={issue.date} exams={exams} />}
      aside={exams.length ? <SessionCalendar exams={exams} /> : null}
    />
  );
}

/** From the forum: hot threads about a module first (study questions, study groups), then the rest. */
function ForumSection(props: IssueSectionProps) {
  const { section } = props;
  const q = useHotThreads({ n: 12 });
  const list = q.data ?? [];
  const threads = [...list.filter((t) => t.moduleId), ...list.filter((t) => !t.moduleId)].slice(0, 4);
  const empty = !q.isPending && !threads.length;
  return (
    <SectionFrame
      {...props}
      title={empty && section.fallback ? section.fallback.title : section.title}
      blocks={empty && section.fallback ? [] : section.blocks}
      body={q.isPending ? <LiveSkeleton /> : <ForumList threads={threads} fallback={section.fallback} />}
    />
  );
}

/** New in the library: the newest published files. */
function LibrarySection(props: IssueSectionProps) {
  const { section } = props;
  const q = useRecentFiles({ n: 4 });
  const files = q.data ?? [];
  const empty = !q.isPending && !files.length;
  return (
    <SectionFrame
      {...props}
      title={empty && section.fallback ? section.fallback.title : section.title}
      blocks={empty && section.fallback ? [] : section.blocks}
      body={q.isPending ? <LiveSkeleton /> : <LibraryList files={files} fallback={section.fallback} />}
    />
  );
}

export function IssueSection(props: IssueSectionProps) {
  const { section } = props;
  switch (section.kind) {
    case 'deadlines':
      return <DeadlinesSection {...props} />;
    case 'forum':
      return <ForumSection {...props} />;
    case 'library':
      return <LibrarySection {...props} />;
    case 'cohorts':
      return <SectionFrame {...props} body={section.cohorts?.length ? <CohortCorner sectionId={section.id} cohorts={section.cohorts} /> : null} />;
    case 'chart':
      return <SectionFrame {...props} body={section.chart ? <ChartOfTheWeek chart={section.chart} /> : null} />;
    default:
      return <SectionFrame {...props} />;
  }
}
