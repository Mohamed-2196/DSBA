// Above the month: its name, the arrows, "Today", whose events (the student's year or every year) and the type
// chips, which are also the colour key.
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cohortColor, cohortLabel, cohortOnColor } from '../../state';
import { Button, Chip, cx, IconButton, SegmentedControl } from '../../ui';
import { addMonths, monthTitle } from './dates';
import { EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
import type { CalendarView } from './useCalendarView';

export const MONTH_TITLE_ID = 'cal-month-title';

export function CalendarToolbar({ view }: { view: CalendarView }) {
  const { month, year, cohortYear, goMonth, goToday, isCurrentMonth, setAllYears } = view;
  const before = addMonths(month, -1);
  const after = addMonths(month, 1);
  return (
    <div className="cal-toolbar">
      <div className="cal-toolbar__nav">
        <h2 id={MONTH_TITLE_ID} className="cal-toolbar__title" aria-live="polite">
          {monthTitle(month)}
        </h2>
        <div className="cal-toolbar__arrows">
          <IconButton label={`Previous month, ${monthTitle(before)}`} icon={CaretLeft} variant="secondary" size="sm" onClick={() => goMonth(before)} />
          <IconButton label={`Next month, ${monthTitle(after)}`} icon={CaretRight} variant="secondary" size="sm" onClick={() => goMonth(after)} />
        </div>
        <Button size="sm" variant="ghost" onClick={goToday} disabled={isCurrentMonth} className="cal-toolbar__today">
          Today
        </Button>
      </div>
      {year ? (
        <SegmentedControl
          label="Whose events"
          size="sm"
          options={[
            { value: 'mine', label: cohortLabel(year), color: cohortColor(year), onColor: cohortOnColor(year) },
            { value: 'all', label: 'All years' },
          ]}
          value={cohortYear ? 'mine' : 'all'}
          onChange={(v) => setAllYears(v === 'all')}
        />
      ) : null}
    </div>
  );
}

export function TypeFilter({ view }: { view: CalendarView }) {
  const { types, typeCounts, toggleType, clearTypes } = view;
  return (
    <div className="cal-types" role="group" aria-label="Event types (also the colour key)">
      {TYPE_ORDER.map((type) => (
        <Chip
          key={type}
          size="sm"
          selected={types.has(type)}
          onChange={() => toggleType(type)}
          color={EVENT_TYPES[type].color}
          count={typeCounts[type] ?? 0}
          className={cx('cal-typechip', `cal-typechip--${type}`, !typeCounts[type] && 'is-empty')}
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
  );
}
