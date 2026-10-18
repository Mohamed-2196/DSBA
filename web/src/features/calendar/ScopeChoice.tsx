import { useId } from 'react';
import { cx } from '../../ui';
import { formatShort, parseDay, type DayKey } from '../../lib/dates';
import { repeatLabel } from './mine';
import type { ChangeScope, PersonalEvent } from './types';

export interface ScopeChoiceProps {
  /** what the choice is for: 'Change', 'Delete' */
  legend: string;
  value: ChangeScope;
  onChange: (scope: ChangeScope) => void;
  /** the repeating event, and the day of it the student opened */
  event: Pick<PersonalEvent, 'repeat' | 'repeatUntil'>;
  day: DayKey;
  disabled?: boolean;
  /** the picked choice takes the dialog's first focus, so the question is heard before the form */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Which days of a repeat a change or a deletion covers: the day the student opened, it and the later ones, or all of
 * them. Each choice says its days. data-hub="calendar-scope".
 */
export function ScopeChoice({
  legend,
  value,
  onChange,
  event,
  day,
  disabled = false,
  autoFocus = false,
  className,
}: ScopeChoiceProps) {
  const name = `cal-scope-${useId().replace(/:/g, '')}`;
  const when = formatShort(parseDay(day));
  const choices: { value: ChangeScope; label: string; hint: string }[] = [
    { value: 'one', label: 'This event', hint: when },
    { value: 'following', label: 'This and following events', hint: `From ${when}` },
    { value: 'all', label: 'All events', hint: repeatLabel(event) ?? '' },
  ];
  return (
    <fieldset className={cx('cal-scope', className)} data-hub="calendar-scope" disabled={disabled}>
      <legend className="cal-scope__legend">{legend}</legend>
      <div className="cal-scope__list">
        {choices.map((c) => (
          <label key={c.value} className={cx('cal-scope__item', value === c.value && 'is-picked')}>
            <input
              type="radio"
              name={name}
              value={c.value}
              checked={value === c.value}
              onChange={() => onChange(c.value)}
              className="cal-scope__radio"
              data-autofocus={autoFocus && value === c.value ? true : undefined}
            />
            <span className="cal-scope__text">
              <span className="cal-scope__label">{c.label}</span>
              <span className="cal-scope__hint">{c.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
