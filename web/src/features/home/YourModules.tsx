import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleSummary } from '../../api/types';
import { useAuth } from '../../auth';
import type { CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, ModuleArt, ModuleIcon, cx, moduleArtSrc } from '../../ui';
import { useCalendarEvents } from '../calendar/public';
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

function ModuleRow({ m, exam }: { m: ModuleSummary; exam: NextExam | null }) {
  const progress = useModuleProgress(m.id);
  const hasArt = moduleArtSrc(m.art) != null;
  const pct = progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;
  return (
    <li>
      <Link
        to={`/modules/${m.id}`}
        className="home-mods__row"
        aria-label={`${m.unitCode ? `${m.unitCode} ` : ''}${m.name}${exam ? `, exam ${formatLongDay(exam.date)}` : ''}`}
      >
        {hasArt ? (
          <span className="home-mods__lead">
            <ModuleArt art={m.art} className="home-mods__art" />
          </span>
        ) : m.unitCode ? (
          <span className="home-mods__code u-code" aria-hidden="true">
            {m.unitCode}
          </span>
        ) : (
          <span className="home-mods__icon" aria-hidden="true">
            <ModuleIcon moduleId={m.id} />
          </span>
        )}
        <span className="home-mods__text">
          <span className="home-mods__name">
            {hasArt && m.unitCode ? <span className="home-mods__tag u-code">{m.unitCode}</span> : null}
            {hasArt && m.unitCode ? ' ' : null}
            {m.shortName}
          </span>
          <span className="home-mods__meta">{metaFor(m, progress.watched)}</span>
        </span>
        {exam ? (
          <span className="home-mods__exam" title={`Exam ${inDays(exam.days)}`}>
            <span className="home-mods__examdot" aria-hidden="true" />
            <span className="u-tabular">{formatDayMonth(exam.date)}</span>
          </span>
        ) : null}
        {pct > 0 ? (
          <span className="home-mods__bar" style={{ '--pct': `${pct}%` } as CSSProperties} aria-hidden="true" />
        ) : null}
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

/** "My modules": the year's modules (your papers, once picked) as a quick list (illustration or unit code, name,
 *  progress while tracked, next exam), and, once the student has a year, what it lists and how to change it. */
export function YourModules({ year, today, mine }: { year: CohortYear; today: Date; mine: boolean }) {
  const { modules: catalogue } = useModules();
  const { papers } = usePapers();
  const exams = useCalendarEvents({ from: dayKey(today), type: 'exam' }, { enabled: useAuth().featureOn('calendar') });
  const nextExam = (moduleId: string): NextExam | null => {
    const e = (exams.data ?? []).find((ev) => ev.moduleId === moduleId && !ev.sample);
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
        {modules.map(({ m, exam }) => (
          <ModuleRow key={m.id} m={m} exam={exam} />
        ))}
      </ul>
      {mine ? <ModulesNote /> : null}
    </div>
  );
}
