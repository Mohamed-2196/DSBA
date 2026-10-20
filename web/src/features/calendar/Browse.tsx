import { useMemo, useRef } from 'react';
import { BREAKPOINTS, cohortLabel, useMediaQuery } from '../../state';
import {
  Button,
  Chip,
  cx,
  EmptyState,
  Icon,
  IconButton,
  Menu,
  SegmentedControl,
  glyph,
  useScrollFade,
  type MenuItem,
} from '../../ui';
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

/** On a phone, the band's buttons sit on the bar: New event, and the rest in a ⋯ menu. */
export interface PhoneTools {
  /** signed in */
  onCustomise?: () => void;
  onSubscribe: () => void;
  /** reps */
  onAddDate?: () => void;
  onAddMine: () => void;
}

/**
 * The bar under the calendar's band (docs/design/deskmates/screens/calendar-*): List or Month, whose dates (the
 * student's year or every year), and in the month, its arrows and Today. On a phone (`tools`), List | Month shares
 * its row with New event and a ⋯ menu that holds whose dates, Customise and Subscribe.
 */
export function CalendarBar({ view, tools }: { view: CalendarView; tools?: PhoneTools }) {
  const { year, cohortYear, setAllYears } = view;
  const more: MenuItem[] = tools
    ? [
        ...(year
          ? [
              {
                id: 'cohort',
                label: cohortYear ? 'Show all years' : `Show only ${cohortLabel(year)}`,
                icon: <Icon glyph={glyph.calendar} />,
                onSelect: () => setAllYears(!!cohortYear),
              },
            ]
          : []),
        ...(tools.onCustomise
          ? [
              {
                id: 'customise',
                label: 'Customise',
                icon: <Icon glyph={glyph.settings} />,
                onSelect: tools.onCustomise,
              },
            ]
          : []),
        { id: 'subscribe', label: 'Subscribe', icon: <Icon glyph={glyph.link} />, onSelect: tools.onSubscribe },
        ...(tools.onAddDate
          ? [{ id: 'date', label: 'Programme date', icon: <Icon glyph={glyph.plus} />, onSelect: tools.onAddDate }]
          : []),
      ]
    : [];
  return (
    <div className={cx('cal-bar', tools && 'cal-bar--phone')} data-hub="calendar-bar">
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
      {year && !tools ? (
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
      {tools ? (
        <div className="cal-bar__tools">
          <Button
            variant="primary"
            leadingIcon={<Icon glyph={glyph.plus} />}
            onClick={tools.onAddMine}
            data-hub="calendar-mine-add"
          >
            New event
          </Button>
          <Menu
            align="end"
            label="More calendar options"
            items={more}
            trigger={<IconButton icon={<Icon glyph={glyph.more} />} label="More" data-hub="calendar-more" />}
          />
        </div>
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
      {/* On a phone the month's grid comes first, its colour key and filters under it. */}
      {phone && view.mode === 'month' ? null : <Filters view={view} />}
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
          <MonthPanel
            view={view}
            today={today}
            compact={phone}
            onAdd={onAddMine}
            underGrid={phone ? <Filters view={view} /> : undefined}
          />
        )}
      </div>
    </section>
  );
}

function Filters({ view }: { view: CalendarView }) {
  const { signedIn, showsPlan, types, toggleType, clearTypes } = view;
  // On phones the chips scroll in one row: its cut edge fades while there is more to see.
  const typesRef = useRef<HTMLDivElement>(null);
  useScrollFade(typesRef);
  return (
    <div className="cal-filters">
      <div ref={typesRef} className="cal-filters__types" role="group" aria-label="Event types (also the colour key)">
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
        {showsPlan ? (
          <Chip
            size="sm"
            selected={types.has('plan')}
            onChange={() => toggleType('plan')}
            className="cal-typechip cal-typechip--plan"
            data-hub="calendar-filter-plan"
          >
            <span className="cal-swatch cal-swatch--plan" aria-hidden="true" />
            Your plan
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
    if (types.size === 1 && types.has('plan')) {
      title = 'Nothing planned ahead';
      body = 'Give the cards on your boards a due date, or plan a module’s revision, and they show here.';
      action = (
        <Button size="sm" variant="primary" to="/board">
          Open your boards
        </Button>
      );
    } else if (types.size === 1 && types.has('mine')) {
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
