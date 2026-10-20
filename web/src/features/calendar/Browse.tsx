import { useMemo } from 'react';
import { BREAKPOINTS, cohortLabel, useMediaQuery } from '../../state';
import { Button, Chip, cx, EmptyState, Icon, SegmentedControl, glyph } from '../../ui';
import { formatShort, parseDay, type DayKey } from '../../lib/dates';
import { monthTitle } from './dates';
import { DayList } from './DayList';
import { TYPE_ORDER, typeLabel } from './eventMeta';
import { MonthNav, MonthPanel } from './MonthPanel';
import { groupByMonth } from './queries';
import type { CalendarView } from './useCalendarView';

export const BROWSE_TITLE_ID = 'cal-browse-title';

export interface BrowseProps {
  view: CalendarView;
  today: Date;
  /** nothing at all on the calendar */
  calendarEmpty: boolean;
  /** reps can add the first programme date */
  onAddDate?: () => void;
  /** a new event of the student's own (on a day of the month) */
  onAddMine: (day?: DayKey) => void;
}

/**
 * The bar under the calendar's band (docs/design/deskmates/screens/calendar-*): List or Month, whose dates (the
 * student's year or every year), and in the month, its arrows and Today.
 */
export function CalendarBar({ view }: { view: CalendarView }) {
  const { year, cohortYear, setAllYears } = view;
  return (
    <div className="cal-bar" data-hub="calendar-bar">
      <SegmentedControl
        label="Show as"
        value={view.mode}
        onChange={(v) => view.setMode(v === 'month' ? 'month' : 'list')}
        options={[
          { value: 'list', label: 'List' },
          { value: 'month', label: 'Month' },
        ]}
        className="cal-bar__mode"
      />
      {year ? (
        <SegmentedControl
          label="Whose dates"
          options={[
            { value: 'mine', label: cohortLabel(year) },
            { value: 'all', label: 'All years' },
          ]}
          value={cohortYear ? 'mine' : 'all'}
          onChange={(v) => setAllYears(v === 'all')}
          className="cal-bar__cohort"
        />
      ) : null}
      {view.mode === 'month' ? <MonthNav view={view} /> : null}
    </div>
  );
}

/**
 * Every date ahead as one list (a repeat of the student's own is one row, at its next day), or the month on a grid.
 * The types above both are the colour key and a filter.
 */
export function Browse({ view, today, calendarEmpty, onAddDate, onAddMine }: BrowseProps) {
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const from =
    view.listFrom === view.todayKey ? 'From today' : `From ${formatShort(parseDay(view.listFrom))}, after this week`;

  return (
    <section className="cal-browse" aria-labelledby={BROWSE_TITLE_ID}>
      <h2 id={BROWSE_TITLE_ID} className={view.mode === 'list' ? 'cal-browse__title' : 'visually-hidden'}>
        {view.mode === 'list' ? 'Coming up' : 'Month'}
      </h2>
      <Filters view={view} />
      <div className="cal-browse__body">
        {view.mode === 'list' ? (
          <div className="cal-list" data-hub="calendar-list">
            <p className="cal-list__from">{from}</p>
            <UpcomingList
              view={view}
              today={today}
              calendarEmpty={calendarEmpty}
              onAddDate={onAddDate}
              onAddMine={onAddMine}
            />
          </div>
        ) : (
          <MonthPanel view={view} today={today} compact={phone} onAdd={onAddMine} />
        )}
      </div>
    </section>
  );
}

function Filters({ view }: { view: CalendarView }) {
  const { signedIn, types, toggleType, clearTypes } = view;
  return (
    <div className="cal-filters">
      <div className="cal-filters__types" role="group" aria-label="Event types (also the colour key)">
        {TYPE_ORDER.map((type) => (
          <Chip
            key={type}
            size="sm"
            selected={types.has(type)}
            onChange={() => toggleType(type)}
            className={cx('cal-typechip', `cal-typechip--${type}`)}
          >
            <span className={cx('cal-swatch', `cal-swatch--${type}`)} aria-hidden="true" />
            {typeLabel(type)}
          </Chip>
        ))}
        {signedIn ? (
          <Chip
            size="sm"
            selected={types.has('mine')}
            onChange={() => toggleType('mine')}
            className="cal-typechip cal-typechip--mine"
            data-hub="calendar-filter-mine"
          >
            <span className="cal-swatch cal-swatch--mine" aria-hidden="true" />
            Your events
          </Chip>
        ) : null}
        {types.size ? (
          <Button size="sm" variant="ghost" onClick={clearTypes}>
            Show every type
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UpcomingList({ view, today, calendarEmpty, onAddDate, onAddMine }: BrowseProps) {
  const { list, listFrom, eventId, cohortYear, open, types, clearTypes, setAllYears } = view;
  const months = useMemo(() => groupByMonth(list, listFrom), [list, listFrom]);

  if (!months.length) {
    let title = 'Nothing else on the calendar yet';
    let body = 'New dates show up here as soon as they’re announced.';
    let action = null;
    if (types.size === 1 && types.has('mine')) {
      title = 'None of your own events ahead';
      body = 'Add the things you plan around: study groups, deadlines of your own, appointments.';
      action = (
        <Button size="sm" variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} onClick={() => onAddMine()}>
          New event
        </Button>
      );
    } else if (types.size) {
      title = 'No dates of these types ahead';
      action = (
        <Button size="sm" onClick={clearTypes}>
          Show every type
        </Button>
      );
    } else if (calendarEmpty) {
      title = 'The calendar is empty';
      action = onAddDate ? (
        <Button size="sm" variant="primary" leadingIcon={<Icon glyph={glyph.plus} />} onClick={onAddDate}>
          Add a date
        </Button>
      ) : null;
    } else if (cohortYear) {
      title = `Nothing else ahead for ${cohortLabel(cohortYear)}`;
      action = (
        <Button size="sm" onClick={() => setAllYears(true)}>
          Show all years
        </Button>
      );
    }
    return (
      <div className="cal-list__empty">
        <EmptyState size="sm" mate="blink" title={title} body={body} action={action} />
      </div>
    );
  }

  return (
    <ol role="list" className="cal-list__months">
      {months.map((m) => (
        <li key={m.key} className="cal-list__month">
          <h3 className="cal-list__month-title">{monthTitle(m)}</h3>
          <DayList days={m.days} today={today} selectedId={eventId} showCohort={!cohortYear} onOpen={open} />
        </li>
      ))}
    </ol>
  );
}
