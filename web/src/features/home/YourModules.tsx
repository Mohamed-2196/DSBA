import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ModuleSummary } from '../../api/types';
import type { CohortYear } from '../../lib/modules';
import { useModules } from '../../state/modules';
import { ModuleIcon, cx } from '../../ui';
import { useCalendarEvents } from '../calendar/public';
import { useModuleProgress } from '../modules/public';
import { dayFromISO, daysBetween, inDays, isoDay, longDay, shortDay } from './time';

interface NextExam {
  date: Date;
  days: number;
}

function metaFor(m: ModuleSummary, watched: number): string {
  if (m.lessonCount > 0) {
    if (watched > 0) return `${watched} of ${m.lessonCount} lessons watched`;
    return `${m.lessonCount} ${m.lessonCount === 1 ? 'lesson' : 'lessons'}, ${m.chapterCount} ${m.chapterCount === 1 ? 'chapter' : 'chapters'}`;
  }
  if (m.libraryCount > 0) return `${m.libraryCount} ${m.libraryCount === 1 ? 'file' : 'files'} in the library`;
  return 'Study guide and resources';
}

function ModuleRow({ m, exam }: { m: ModuleSummary; exam: NextExam | null }) {
  const progress = useModuleProgress(m.id);
  const pct = progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;
  return (
    <li>
      <Link to={`/modules/${m.id}`} className="home-mods__row" aria-label={`${m.unitCode ? `${m.unitCode} ` : ''}${m.name}${exam ? `, exam ${longDay(exam.date)}` : ''}`}>
        {m.unitCode ? (
          <span className="home-mods__code u-code" aria-hidden="true">
            {m.unitCode}
          </span>
        ) : (
          <span className="home-mods__icon" aria-hidden="true">
            <ModuleIcon moduleId={m.id} />
          </span>
        )}
        <span className="home-mods__text">
          <span className="home-mods__name">{m.shortName}</span>
          <span className="home-mods__meta">{metaFor(m, progress.watched)}</span>
        </span>
        {exam ? (
          <span className="home-mods__exam" title={`Exam ${inDays(exam.days)}`}>
            <span className="home-mods__examdot" aria-hidden="true" />
            <span className="u-tabular">{shortDay(exam.date)}</span>
          </span>
        ) : null}
        {pct > 0 ? <span className="home-mods__bar" style={{ '--pct': `${pct}%` } as CSSProperties} aria-hidden="true" /> : null}
      </Link>
    </li>
  );
}

/** "Your modules": the year's modules as a quick list (unit code, name, progress, next exam). */
export function YourModules({ year, today }: { year: CohortYear; today: Date }) {
  const { getModulesForYear } = useModules();
  const exams = useCalendarEvents({ from: isoDay(today), type: 'exam' });
  const nextExam = (moduleId: string): NextExam | null => {
    const e = (exams.data ?? []).find((ev) => ev.moduleId === moduleId && !ev.sample);
    if (!e) return null;
    const date = dayFromISO(e.date);
    return { date, days: daysBetween(today, date) };
  };
  // In exam season the list reads in exam order (it doubles as the hero trace's legend).
  const modules = getModulesForYear(year)
    .map((m, i) => ({ m, i, exam: nextExam(m.id) }))
    .sort((a, b) => (a.exam ? a.exam.days : 1e6) - (b.exam ? b.exam.days : 1e6) || a.i - b.i);
  return (
    <ul role="list" className={cx('home-mods', `home-mods--y${year}`)} data-hub="home-modules">
      {modules.map(({ m, exam }) => (
        <ModuleRow key={m.id} m={m} exam={exam} />
      ))}
    </ul>
  );
}
