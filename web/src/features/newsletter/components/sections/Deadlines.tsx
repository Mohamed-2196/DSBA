import { useMemo, useState } from 'react';
import {
  addDays,
  dayKey,
  daysBetween,
  formatDay,
  monthName,
  monthShort,
  parseDay,
  relativeDays,
  WEEKDAYS,
} from '../../../../lib/dates';
import type { CohortYear } from '../../../../state';
import { useModules } from '../../../../state/modules';
import { Button, CohortBadge, cx, glyph, Highlight, Icon, SegmentedControl, Tooltip } from '../../../../ui';
import type { CalendarEvent } from '../../../calendar/public';
import { isMine } from '../../../papers/public';

interface SessionDay {
  iso: string;
  day: number;
  dow: number;
  exam: CalendarEvent | null;
}

/** The cohorts that have exams in a list, in order. */
const cohortsOf = (exams: readonly CalendarEvent[]): CohortYear[] =>
  [...new Set(exams.map((e) => e.year).filter((y): y is CohortYear => y != null))].sort();

/** Sunday-first weeks (Bahrain's weekend is Fri–Sat) covering the session, for the mini calendar. */
function sessionWeeks(exams: readonly CalendarEvent[]): SessionDay[][] {
  const firstExam = exams[0];
  const lastExam = exams[exams.length - 1];
  if (!firstExam || !lastExam) return [];
  const first = parseDay(firstExam.date);
  const last = parseDay(lastExam.date);
  const byDay = new Map(exams.map((e) => [e.date, e]));
  const weeks: SessionDay[][] = [];
  for (let d = addDays(first, -first.getDay()); d <= last || d.getDay() !== 0; d = addDays(d, 1)) {
    if (d.getDay() === 0) weeks.push([]);
    const iso = dayKey(d);
    weeks[weeks.length - 1]?.push({ iso, day: d.getDate(), dow: d.getDay(), exam: byDay.get(iso) ?? null });
  }
  return weeks;
}

/** Margin figure: the session as a calendar, exam days filled in the cohort colour. */
export function SessionCalendar({ exams }: { exams: CalendarEvent[] }) {
  const weeks = useMemo(() => sessionWeeks(exams), [exams]);
  const firstExam = exams[0];
  const lastExam = exams[exams.length - 1];
  if (!weeks.length || !firstExam || !lastExam) return null;
  const years = cohortsOf(exams);
  const first = parseDay(firstExam.date);
  const last = parseDay(lastExam.date);
  const firstMonth = monthName(first.getMonth());
  const lastMonth = `${monthName(last.getMonth())} ${last.getFullYear()}`;
  return (
    <figure className="nl-aside nl-session" aria-label="The session at a glance">
      <p className="nl-aside__title">The session at a glance</p>
      <p className="nl-session__months">
        {first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear()
          ? lastMonth
          : `${firstMonth} to ${lastMonth}`}
      </p>
      <div className="nl-session__grid" role="presentation">
        {WEEKDAYS.map((w, i) => (
          <span key={w.short} className={cx('nl-session__dow', i >= 5 && 'is-weekend')} aria-hidden="true">
            {w.one}
          </span>
        ))}
        {weeks.flat().map((c) => {
          const cell = (
            <span
              key={c.iso}
              className={cx(
                'nl-session__day',
                c.dow >= 5 && 'is-weekend',
                c.exam && `is-exam is-y${c.exam.year ?? 0}`,
                c.day === 1 && 'is-first',
              )}
              aria-hidden="true"
            >
              {c.day === 1 ? <span className="nl-session__mon">{monthShort(parseDay(c.iso).getMonth())}</span> : null}
              {c.day}
            </span>
          );
          return c.exam ? (
            <Tooltip
              key={c.iso}
              label={`${formatDay(c.iso, { weekday: 'short', month: 'short', year: false })}: ${c.exam.unitCode ?? c.exam.title}`}
              describe={false}
            >
              {cell}
            </Tooltip>
          ) : (
            cell
          );
        })}
      </div>
      <figcaption className="nl-session__legend">
        {years.map((y) => (
          <CohortBadge key={y} year={y} variant="dot" />
        ))}
        <span className="nl-session__weekend">
          <span aria-hidden="true" className="nl-session__weekend-key" />
          Weekend
        </span>
      </figcaption>
    </figure>
  );
}

/** The exam list: date, unit code, module, cohort and a countdown from the issue date. */
export function Deadlines({ issueDate, exams }: { issueDate: string; exams: CalendarEvent[] }) {
  const { getModule } = useModules();
  const [filter, setFilter] = useState('all');
  const years = cohortsOf(exams);
  // A year's exams are its main sittings and the year before's resits (isMine).
  const shown = filter === 'all' ? exams : exams.filter((e) => isMine(e, Number(filter), null));
  const firstId = exams[0]?.id;

  if (!exams.length) {
    return (
      <div className="nl-deadlines" data-hub="deadlines">
        <p className="nl-p">No exams on the calendar for these dates. Check the calendar for anything new.</p>
        <p className="nl-cta">
          <Button to="/calendar" leadingIcon={<Icon glyph={glyph.calendar} />}>
            Open the calendar
          </Button>
        </p>
      </div>
    );
  }

  return (
    <div className="nl-deadlines" data-hub="deadlines">
      <div className="nl-deadlines__bar">
        {years.length > 1 ? (
          <SegmentedControl
            size="sm"
            label="Show exams for"
            value={filter}
            onChange={(v) => setFilter(String(v))}
            options={[
              { value: 'all', label: 'All years' },
              ...years.map((y) => ({ value: String(y), label: `Year ${y}` })),
            ]}
          />
        ) : null}
        <span className="nl-deadlines__count u-tabular">
          {shown.length} {shown.length === 1 ? 'paper' : 'papers'}
        </span>
      </div>
      <ol role="list" className="nl-dates">
        {shown.map((e) => {
          const mod = getModule(e.moduleId);
          const count = relativeDays(daysBetween(issueDate, e.date));
          const day = parseDay(e.date);
          return (
            <li key={e.id} className={cx('nl-date', e.year && `nl-date--y${e.year}`)}>
              <time dateTime={e.date} className="nl-date__when">
                <span className="nl-date__num u-tabular">{day.getDate()}</span>
                <span className="nl-date__mon">
                  {monthShort(day.getMonth())}, {WEEKDAYS[day.getDay()]?.short ?? ''}
                </span>
              </time>
              <div className="nl-date__what">
                <span className="nl-date__code">{e.unitCode ?? mod?.shortName}</span>
                <span className="nl-date__name">
                  {mod?.name ?? e.title}
                  {e.resit ? ', resit' : ''}
                </span>
              </div>
              <div className="nl-date__meta">
                {e.year ? <CohortBadge year={e.year} size="sm" /> : null}
                <span className="nl-date__count">
                  {e.id === firstId ? <Highlight as="span">{count}</Highlight> : count}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="nl-deadlines__foot">
        <Button to="/calendar" leadingIcon={<Icon glyph={glyph.calendar} />}>
          Open the calendar
        </Button>
        <span>Countdowns are from {formatDay(issueDate, { year: false })}, the day this issue came out.</span>
      </p>
    </div>
  );
}
