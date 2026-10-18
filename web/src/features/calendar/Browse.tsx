import { useMemo } from 'react';
import { CalendarBlank, CalendarPlus, ListBullets, Plus, SquaresFour } from '@phosphor-icons/react';
import { BREAKPOINTS, cohortLabel, useMediaQuery } from '../../state';
import { Button, Chip, cx, EmptyState, SegmentedControl } from '../../ui';
import { formatShort, parseDay, type DayKey } from '../../lib/dates';
import { monthTitle } from './dates';
import { DayList } from './DayList';
import { EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
import { MonthPanel } from './MonthPanel';
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
 * Every date ahead, as one list: a repeat of the student's own is one row, at its next day. Laptops and wider show
 * the month grid beside it; phones and tablets switch between the list and the month. Whose dates and which types
 * are picked above both.
 */
export function Browse({ view, today, calendarEmpty, onAddDate, onAddMine }: BrowseProps) {
  const wide = useMediaQuery(BREAKPOINTS.desktop);
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const showList = wide || view.mode === 'list';
  const showMonth = wide || view.mode === 'month';
  const from =
    view.listFrom === view.todayKey ? 'From today' : `From ${formatShort(parseDay(view.listFrom))}, after this week`;

  return (
    <section className="cal-browse" aria-labelledby={BROWSE_TITLE_ID}>
      <div className="cal-browse__head">
        <h2 id={BROWSE_TITLE_ID} className="cal-browse__title">
          Coming up
        </h2>
        {wide ? null : (
          <SegmentedControl
            label="Show as"
            size="sm"
            value={view.mode}
            onChange={(v) => view.setMode(v === 'month' ? 'month' : 'list')}
            options={[
              { value: 'list', label: 'List', icon: ListBullets },
              { value: 'month', label: 'Month', icon: SquaresFour },
            ]}
            className="cal-browse__mode"
          />
        )}
      </div>
      <Filters view={view} />
      <div className={cx('cal-browse__body', wide && 'cal-browse__body--split')}>
        {showList ? (
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
        ) : null}
        {showMonth ? <MonthPanel view={view} today={today} compact={phone} onAdd={onAddMine} /> : null}
      </div>
    </section>
  );
}

function Filters({ view }: { view: CalendarView }) {
  const { year, cohortYear, setAllYears, signedIn, types, toggleType, clearTypes } = view;
  return (
    <div className="cal-filters">
      {year ? (
        <SegmentedControl
          label="Whose dates"
          size="sm"
          options={[
            { value: 'mine', label: cohortLabel(year) },
            { value: 'all', label: 'All years' },
          ]}
          value={cohortYear ? 'mine' : 'all'}
          onChange={(v) => setAllYears(v === 'all')}
          className="cal-filters__cohort"
        />
      ) : null}
      <div className="cal-filters__types" role="group" aria-label="Event types (also the colour key)">
        {signedIn ? (
          <Chip
            size="sm"
            selected={types.has('mine')}
            onChange={() => toggleType('mine')}
            className="cal-typechip cal-typechip--mine"
            data-hub="calendar-filter-mine"
          >
            <span className="cal-dot cal-dot--mine cal-colour--violet" aria-hidden="true" />
            Yours
          </Chip>
        ) : null}
        {TYPE_ORDER.map((type) => (
          <Chip
            key={type}
            size="sm"
            selected={types.has(type)}
            onChange={() => toggleType(type)}
            color={EVENT_TYPES[type].color}
            className={cx('cal-typechip', `cal-typechip--${type}`)}
          >
            {typeLabel(type)}
          </Chip>
        ))}
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
        <Button size="sm" variant="primary" leadingIcon={CalendarPlus} onClick={() => onAddMine()}>
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
        <Button size="sm" variant="primary" leadingIcon={Plus} onClick={onAddDate}>
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
        <EmptyState size="sm" icon={CalendarBlank} title={title} body={body} action={action} />
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
