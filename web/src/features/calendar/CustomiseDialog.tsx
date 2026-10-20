import { useMemo } from 'react';
import { errorMessage } from '../../api/errors';
import { cohortLabel } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Chip, cx, Modal } from '../../ui';
import { formatShortYear, parseDay } from '../../lib/dates';
import { usePapers } from '../papers/public';
import { EVENT_TYPES, TYPE_ORDER, typeLabel } from './eventMeta';
import type { CalendarEvent } from './types';
import type { MyCalendar } from './useMyCalendar';

export interface CustomiseDialogProps {
  open: boolean;
  onClose: () => void;
  my: MyCalendar;
  /** every programme date, hidden ones included: names what is hidden */
  programme: readonly CalendarEvent[];
  /** pick the papers whose dates they follow (the page opens its dialog) */
  onPapers: () => void;
}

/**
 * What is on the student's own calendar: the modules they follow (their papers), the types of programme date
 * they keep, and the dates and modules they hid, each with "Show again". Saved as they go.
 * data-hub="calendar-customise".
 */
export function CustomiseDialog({ open, onClose, my, programme, onPapers }: CustomiseDialogProps) {
  const { getModule } = useModules();
  const { year, papers } = usePapers();
  const prefs = my.prefs;
  const hiddenTypes = new Set(prefs?.hiddenTypes ?? []);
  const hiddenDates = useMemo(() => {
    const ids = new Set(prefs?.hiddenEvents ?? []);
    return programme.filter((e) => ids.has(e.id));
  }, [prefs, programme]);
  const hiddenModules = (prefs?.hiddenModules ?? []).map((id) => getModule(id)).filter((m) => m !== null);
  const following = papers
    ? `${papers.size} ${papers.size === 1 ? 'paper' : 'papers'} you picked`
    : year
      ? `every ${cohortLabel(year)} module`
      : 'every module (pick your year first)';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customise your calendar"
      description="Only your calendar changes: your list, month, Home and private link. Everyone else’s stays as it is."
      size="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="cal-customise" data-hub="calendar-customise">
        <section className="cal-customise__section" aria-labelledby="cal-cust-modules">
          <h3 id="cal-cust-modules" className="cal-customise__h">
            Modules you follow
          </h3>
          <p className="cal-customise__line">Dates of {following}, and the dates for your whole year.</p>
          {year ? (
            <Button size="sm" onClick={onPapers} data-hub="calendar-papers">
              Change your papers
            </Button>
          ) : null}
        </section>

        <section className="cal-customise__section" aria-labelledby="cal-cust-types">
          <h3 id="cal-cust-types" className="cal-customise__h">
            Types of date you keep
          </h3>
          <p className="cal-customise__line">
            Turn a type off to hide all its dates.
            {my.hasBoards
              ? ' Your plan is the cards on your boards that have a day: off until you turn it on, and only you see it.'
              : ''}
          </p>
          <div className="cal-customise__types" role="group" aria-label="Types of date on your calendar">
            {TYPE_ORDER.map((type) => (
              <Chip
                key={type}
                size="sm"
                selected={!hiddenTypes.has(type)}
                onChange={(on) => my.setHidden('hiddenTypes', type, !on)}
                color={EVENT_TYPES[type].color}
                className={cx('cal-typechip', `cal-typechip--${type}`)}
                disabled={!prefs}
              >
                {typeLabel(type)}
              </Chip>
            ))}
            {my.hasBoards ? (
              <Chip
                size="sm"
                selected={!!prefs?.showPlan}
                onChange={my.setShowPlan}
                className="cal-typechip cal-typechip--plan"
                disabled={!prefs}
                data-hub="calendar-show-plan"
              >
                Your plan
              </Chip>
            ) : null}
          </div>
        </section>

        <section className="cal-customise__section" aria-labelledby="cal-cust-hidden">
          <h3 id="cal-cust-hidden" className="cal-customise__h">
            Hidden
          </h3>
          {hiddenModules.length || hiddenDates.length ? (
            <ul role="list" className="cal-customise__hidden" data-hub="calendar-hidden">
              {hiddenModules.map((m) => (
                <li key={m.id}>
                  <span className="cal-customise__what">
                    <span className="cal-customise__name">All {m.unitCode || m.shortName} dates</span>
                    <span className="cal-customise__meta">{m.name}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => my.setHidden('hiddenModules', m.id, false)}>
                    Show again
                  </Button>
                </li>
              ))}
              {hiddenDates.map((e) => (
                <li key={e.id}>
                  <span className="cal-customise__what">
                    <span className="cal-customise__name">{e.title}</span>
                    <span className="cal-customise__meta">
                      {typeLabel(e.type)}, {formatShortYear(parseDay(e.date))}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => my.setHidden('hiddenEvents', e.id, false)}>
                    Show again
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cal-customise__line">Nothing hidden. To hide a date, open it and choose “Hide this date”.</p>
          )}
        </section>
        {my.saveError ? (
          <p className="cal-form__error" role="alert">
            {errorMessage(my.saveError, 'That change wasn’t saved. Try again.')}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
