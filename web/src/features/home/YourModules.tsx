import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleSummary } from '../../api/types';
import { useAuth } from '../../auth';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, cx } from '../../ui';
import { useMyCalendarEvents } from '../calendar/public';
import { useModuleProgress } from '../modules/public';
import { PapersDialog, modulesFor, papersNote, usePapers } from '../papers/public';
import { dayKey, daysBetween, formatDayMonth, formatLongDay, inDays, parseDay } from '../../lib/dates';

interface NextExam {
  date: Date;
  days: number;
}

function metaFor(m: ModuleSummary, watched: number): string {
  if (m.lessonCount > 0) {
    if (watched > 0) return `${watched} of ${m.lessonCount} lessons watched`;
    return `${m.lessonCount} ${m.lessonCount === 1 ? 'lesson' : 'lessons'}, ${m.chapterCount} ${m.chapterCount === 1 ? 'chapter' : 'chapters'}`;
  }
  if (m.libraryCount) return `${m.libraryCount} ${m.libraryCount === 1 ? 'file' : 'files'} in the library`;
  return 'Study guide and resources';
}

/** The binders' colours (home-screen.png), one per card in turn: the sections' art tones. */
const BINDERS = ['home', 'modules', 'library', 'notebook', 'forum', 'calendar'] as const;

function ModuleCard({ m, exam, index }: { m: ModuleSummary; exam: NextExam | null; index: number }) {
  const progress = useModuleProgress(m.id);
  const pct = progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;
  const binder = `var(--sec-${BINDERS[index % BINDERS.length]}-art)`;
  return (
    <li>
      <Link
        to={`/modules/${m.id}`}
        className="home-mod"
        style={{ '--mod-c': binder } as CSSProperties}
        aria-label={`${m.unitCode ? `${m.unitCode} ` : ''}${m.name}${exam ? `, exam ${formatLongDay(exam.date)}` : ''}`}
      >
        <span className="home-mod__top" aria-hidden="true">
          <span className="home-mod__binder" />
          {exam ? (
            <span className="home-mod__exam" title={`Exam ${inDays(exam.days)}`}>
              <span className="home-mod__examdot" />
              <span className="u-tabular">{formatDayMonth(exam.date)}</span>
            </span>
          ) : null}
        </span>
        <span className="home-mod__name" aria-hidden="true">
          {m.shortName}
        </span>
        {m.unitCode ? (
          <span className="home-mod__code u-code" aria-hidden="true">
            {m.unitCode}
          </span>
        ) : null}
        <span className="home-mod__meta">{metaFor(m, progress.watched)}</span>
        <span className="home-mod__bar" style={{ '--pct': `${pct}%` } as CSSProperties} aria-hidden="true" />
      </Link>
    </li>
  );
}

/** Under the list: which modules it shows, and a button to pick the option or electives, or to change them. */
function ModulesNote() {
  const { home, picks, papers, choices } = usePapers();
  const [open, setOpen] = useState(false);
  const note = papersNote(home, picks, papers, choices);
  if (!note) return null;
  return (
    <div className="home-mods__note">
      <p>{note.text}</p>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-haspopup="dialog" data-hub="papers-open">
        {note.action}
      </Button>
      <PapersDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** "My modules": the year's modules (your papers, once picked) as cards (a coloured binder, name, code in mono, progress
 *  while tracked, next exam), and, once the student has a year, what it lists and how to change it. */
export function YourModules({ year, today, mine }: { year: CohortYear; today: Date; mine: boolean }) {
  const { modules: catalogue } = useModules();
  const { papers } = usePapers();
  // Less the dates the student hid from their calendar: the dates Up next reads (HomePage), so Home asks once.
  const dates = useMyCalendarEvents({ from: dayKey(today) }, { enabled: useAuth().featureOn('calendar') });
  const nextExam = (moduleId: string): NextExam | null => {
    const e = (dates.data ?? []).find((ev) => ev.type === 'exam' && ev.moduleId === moduleId && !ev.sample);
    if (!e) return null;
    const date = parseDay(e.date);
    return { date, days: daysBetween(today, date) };
  };
  // In exam season the list reads in exam order.
  const modules = modulesFor(year, papers, catalogue)
    .map((m, i) => ({ m, i, exam: nextExam(m.id) }))
    .sort((a, b) => (a.exam ? a.exam.days : 1e6) - (b.exam ? b.exam.days : 1e6) || a.i - b.i);
  return (
    <div className={cx('home-mods', `home-mods--y${year}`)}>
      <ul role="list" className="home-mods__list" data-hub="home-modules">
        {modules.map(({ m, exam }, index) => (
          <ModuleCard key={m.id} m={m} exam={exam} index={index} />
        ))}
      </ul>
      {mine ? <ModulesNote /> : null}
    </div>
  );
}
