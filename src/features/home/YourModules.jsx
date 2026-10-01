import { Link } from 'react-router-dom';
import { getModuleStats, getModulesForYear } from '../../data/modules.js';
import { getEventsForModule, eventDate } from '../../data/calendar.js';
import { ModuleIcon, cx } from '../../ui';
import { getModuleProgress } from '../modules/public.js';
import { daysBetween, inDays, longDay, shortDay } from './time.js';

/** Progress from the modules feature, guarded (its implementation is another team's). */
function safeProgress(id) {
  try {
    const p = getModuleProgress(id);
    return p && typeof p.total === 'number' ? p : null;
  } catch {
    return null;
  }
}

function nextExam(moduleId, today) {
  const e = getEventsForModule(moduleId).find((ev) => ev.type === 'exam' && daysBetween(today, eventDate(ev)) >= 0);
  return e ? { date: eventDate(e), days: daysBetween(today, eventDate(e)) } : null;
}

function metaFor(m, progress) {
  const s = getModuleStats(m);
  if (s.videos > 0) {
    const watched = progress?.watched || 0;
    return watched > 0 ? `${watched} of ${s.videos} lessons watched` : `${s.videos} ${s.videos === 1 ? 'lesson' : 'lessons'}, ${s.chapters} ${s.chapters === 1 ? 'chapter' : 'chapters'}`;
  }
  if (s.notes > 0) return s.notes === 1 ? 'Study guide, past exams, notes' : `Study guide, past exams, ${s.notes} notes`;
  return m.resources.olderExams || m.resources.vle ? 'Study guide and past exams' : 'Study guide';
}

/** "Your modules": the year's modules as a quick list (unit code, name, progress, next exam). */
export function YourModules({ year, today }) {
  // In exam season the list reads in exam order (it doubles as the hero trace's legend).
  const modules = getModulesForYear(year)
    .map((m, i) => ({ m, i, exam: nextExam(m.id, today) }))
    .sort((a, b) => (a.exam ? a.exam.days : 1e6) - (b.exam ? b.exam.days : 1e6) || a.i - b.i);
  return (
    <ul role="list" className={cx('home-mods', `home-mods--y${year}`)} data-pulse="home-modules">
      {modules.map(({ m, exam }) => {
        const progress = safeProgress(m.id);
        const pct = progress && progress.total > 0 ? Math.round((progress.watched / progress.total) * 100) : 0;
        return (
          <li key={m.id}>
            <Link to={`/modules/${m.id}`} className="home-mods__row" aria-label={`${m.unitCode ? `${m.unitCode} ` : ''}${m.name}${exam ? `, exam ${longDay(exam.date)}` : ''}`}>
              {m.unitCode ? (
                <span className="home-mods__code u-code" aria-hidden="true">{m.unitCode}</span>
              ) : (
                <span className="home-mods__icon" aria-hidden="true">
                  <ModuleIcon moduleId={m.id} />
                </span>
              )}
              <span className="home-mods__text">
                <span className="home-mods__name">{m.shortName}</span>
                <span className="home-mods__meta">{metaFor(m, progress)}</span>
              </span>
              {exam ? (
                <span className="home-mods__exam" title={`Exam ${inDays(exam.days)}`}>
                  <span className="home-mods__examdot" aria-hidden="true" />
                  <span className="u-tabular">{shortDay(exam.date)}</span>
                </span>
              ) : null}
              {pct > 0 ? <span className="home-mods__bar" style={{ '--pct': `${pct}%` }} aria-hidden="true" /> : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
