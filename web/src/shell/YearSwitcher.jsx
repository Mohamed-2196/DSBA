import { CaretUpDown } from '@phosphor-icons/react';
import { COHORTS, YEARS, useYear } from '../state';
import { Menu, SegmentedControl, cx } from '../ui';
import './YearSwitcher.css';

/**
 * Year 1/2/3 switcher in cohort colours.
 * Full: a segmented control (rail, More drawer). Compact: a "Y2" pill that opens a menu (icon rail, mobile top bar).
 */
export function YearSwitcher({ compact = false, menuSide = 'right', className, hookId = 'year-switcher' }) {
  const { year, setYear } = useYear();
  if (compact) {
    return (
      <Menu
        side={menuSide}
        align={menuSide === 'right' ? 'start' : 'end'}
        label="Choose your year"
        items={[
          { heading: 'Show modules for' },
          ...YEARS.map((y) => ({
            id: `y${y}`,
            label: COHORTS[y].label,
            icon: <span className={`yr-dot yr-dot--y${y}`} />,
            hint: y === year ? 'Current' : undefined,
            onSelect: () => setYear(y),
          })),
        ]}
        trigger={
          <button
            type="button"
            className={cx('yr-compact', year && `yr-compact--y${year}`, className)}
            aria-label={year ? `${COHORTS[year].label}. Change year` : 'Choose your year'}
            data-hub={hookId}
          >
            <span>{year ? COHORTS[year].short : 'Year'}</span>
            <CaretUpDown aria-hidden="true" weight="bold" className="yr-compact__caret" />
          </button>
        }
      />
    );
  }
  return (
    <div className={cx('yr', className)} data-hub={hookId}>
      <span className="yr__label" aria-hidden="true">Year</span>
      <SegmentedControl
        label="Your year"
        className="yr__seg"
        fullWidth
        value={year}
        onChange={setYear}
        options={YEARS.map((y) => ({ value: y, label: String(y), ariaLabel: COHORTS[y].label, color: COHORTS[y].color, onColor: COHORTS[y].on }))}
      />
    </div>
  );
}
