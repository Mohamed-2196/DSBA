import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { Button, CohortBadge, Highlight, SegmentedControl, Tooltip, cx } from '../../../../ui';
import { getModule } from '../../../../data/modules.js';
import { countdownLabel, daysBetween, parseDay } from '../../lib/text.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmt = (iso, opts) => parseDay(iso).toLocaleDateString('en-GB', opts);

/** Sunday-first weeks (Bahrain's weekend is Fri–Sat) covering the session, for the mini calendar. */
function sessionWeeks(exams) {
  if (!exams.length) return [];
  const first = parseDay(exams[0].date);
  const last = parseDay(exams[exams.length - 1].date);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const byDay = new Map(exams.map((e) => [e.date, e]));
  const weeks = [];
  for (let d = new Date(start); d <= last || d.getDay() !== 0; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0) weeks.push([]);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    weeks[weeks.length - 1].push({ iso, day: d.getDate(), dow: d.getDay(), exam: byDay.get(iso) || null });
  }
  return weeks;
}

/** Margin figure: the session as a three-week calendar, exam days filled in the cohort colour. */
export function SessionCalendar({ exams }) {
  const weeks = useMemo(() => sessionWeeks(exams), [exams]);
  if (!weeks.length) return null;
  const years = [...new Set(exams.map((e) => e.year).filter(Boolean))].sort();
  const firstMonth = fmt(exams[0].date, { month: 'long' });
  const lastMonth = fmt(exams[exams.length - 1].date, { month: 'long', year: 'numeric' });
  return (
    <figure className="nl-aside nl-session" aria-label="The session at a glance">
      <p className="nl-aside__title">The session at a glance</p>
      <p className="nl-session__months">
        {firstMonth} to {lastMonth}
      </p>
      <div className="nl-session__grid" role="presentation">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={cx('nl-session__dow', i >= 5 && 'is-weekend')} aria-hidden="true">
            {w.slice(0, 1)}
          </span>
        ))}
        {weeks.flat().map((c) => {
          const cell = (
            <span
              key={c.iso}
              className={cx('nl-session__day', c.dow >= 5 && 'is-weekend', c.exam && `is-exam is-y${c.exam.year}`, c.day === 1 && 'is-first')}
              aria-hidden="true"
            >
              {c.day === 1 ? <span className="nl-session__mon">{fmt(c.iso, { month: 'short' })}</span> : null}
              {c.day}
            </span>
          );
          return c.exam ? (
            <Tooltip key={c.iso} label={`${fmt(c.iso, { weekday: 'short', day: 'numeric', month: 'short' })}: ${c.exam.unitCode || c.exam.title}`} describe={false}>
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
export function Deadlines({ issue, exams }) {
  const [filter, setFilter] = useState('all');
  const years = [...new Set(exams.map((e) => e.year).filter(Boolean))].sort();
  const shown = filter === 'all' ? exams : exams.filter((e) => String(e.year) === filter);
  const firstId = exams[0]?.id;

  if (!exams.length) {
    return (
      <div className="nl-deadlines" data-hub="deadlines">
        <p className="nl-p">No exams on the calendar for this window. Check the calendar for anything new.</p>
        <p className="nl-cta">
          <Button to="/calendar" leadingIcon={CalendarBlank}>
            Open the calendar
          </Button>
        </p>
      </div>
    );
  }

  return (
    <div className="nl-deadlines" data-hub="deadlines">
      <div className="nl-deadlines__bar">
        <SegmentedControl
          size="sm"
          label="Show exams for"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: String(y), label: `Year ${y}` }))]}
        />
        <span className="nl-deadlines__count u-tabular">
          {shown.length} {shown.length === 1 ? 'paper' : 'papers'}
        </span>
      </div>
      <ol role="list" className="nl-dates">
        {shown.map((e) => {
          const mod = getModule(e.moduleId);
          const days = daysBetween(issue.date, e.date);
          const count = countdownLabel(days);
          return (
            <li key={e.id} className={cx('nl-date', e.year && `nl-date--y${e.year}`)}>
              <time dateTime={e.date} className="nl-date__when">
                <span className="nl-date__num u-tabular">{fmt(e.date, { day: 'numeric' })}</span>
                <span className="nl-date__mon">
                  {fmt(e.date, { month: 'short' })}, {fmt(e.date, { weekday: 'short' })}
                </span>
              </time>
              <div className="nl-date__what">
                <span className="nl-date__code">{e.unitCode || mod?.shortName}</span>
                <span className="nl-date__name">{mod?.name || e.title}</span>
              </div>
              <div className="nl-date__meta">
                {e.year ? <CohortBadge year={e.year} size="sm" /> : null}
                <span className="nl-date__count">{e.id === firstId ? <Highlight as="span">{count}</Highlight> : count}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="nl-deadlines__foot">
        <Button to="/calendar" leadingIcon={CalendarBlank}>
          Open the calendar
        </Button>
        <span>Countdowns are from {fmt(issue.date, { day: 'numeric', month: 'long' })}, the day this issue came out.</span>
      </p>
    </div>
  );
}
