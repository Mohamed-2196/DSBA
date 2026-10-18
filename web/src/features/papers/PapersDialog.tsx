// "Your modules": the modules a student sits (their option or electives, and modules from other years) and their
// exam zone, picked once.
import { useEffect, useId, useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { RTC_NOTE, ZONES, zoneLabel, type Zone } from '../../lib/exams';
import { moduleLabel } from '../../lib/modules';
import { cohortLabel, YEARS, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Modal } from '../../ui';
import { CHOICES, NOT_ON_HUB, pickOnly, picksSummary, togglePick } from './papers';
import { usePapers } from './usePapers';
import './Papers.css';

export interface PapersDialogProps {
  open: boolean;
  onClose: () => void;
  /** after a save */
  onSaved?: () => void;
}

type ZoneChoice = Zone | 'unsure';

/** One option of a group: a radio (pick one) or a checkbox (pick any). */
function Option({
  type,
  name,
  checked,
  onChange,
  title,
  hint,
}: {
  type: 'radio' | 'checkbox';
  name?: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  hint?: string;
}) {
  return (
    <label className="papers-check">
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>
        <span className="papers-check__title">{title}</span>
        {hint ? <span className="papers-check__hint">{hint}</span> : null}
      </span>
    </label>
  );
}

export function PapersDialog({ open, onClose, onSaved }: PapersDialogProps) {
  const { me } = useAuth();
  const { modules, getModule } = useModules();
  const current = usePapers();
  const groupName = useId();
  const [picks, setPicks] = useState<string[]>(current.picks);
  const [zone, setZone] = useState<ZoneChoice>(current.zone ?? 'unsure');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPicks(current.picks);
    setZone(current.zone ?? 'unsure');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh copy each time it opens
  }, [open]);

  const home = current.home;
  const choice = home ? CHOICES[home] : undefined;
  const name = (id: string) => NOT_ON_HUB[id] ?? (moduleLabel(getModule(id)) || id);
  const others = YEARS.filter((y) => y !== home);
  const chosen = choice?.ids.find((id) => picks.includes(id)) ?? null;

  const save = async () => {
    setError(null);
    try {
      await current.save({ papers: picks, zone: zone === 'unsure' ? null : zone });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Your modules weren’t saved. Try again.'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your modules"
      description={`Pick the modules you sit. Home’s countdown, your modules and the calendar show only these. ${
        me ? 'Saved on your account, and only you see them.' : 'Saved in this browser.'
      }`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={current.saving} data-hub="papers-save">
            Save
          </Button>
        </>
      }
    >
      <div className="papers" data-hub="papers-dialog">
        {!home ? (
          <p className="papers__note">Choose your year first. Then you can pick your option or electives here.</p>
        ) : null}
        {home && choice?.pick === 1 ? (
          <fieldset className="papers__group">
            <legend>{choice.label}</legend>
            {choice.ids.map((id) => (
              <Option
                key={id}
                type="radio"
                name={`${groupName}-option`}
                checked={chosen === id}
                onChange={() => setPicks((p) => pickOnly(p, id, choice))}
                title={name(id)}
                hint={NOT_ON_HUB[id] ? 'No module page on the Hub' : undefined}
              />
            ))}
            <Option
              type="radio"
              name={`${groupName}-option`}
              checked={chosen === null}
              onChange={() => setPicks((p) => pickOnly(p, null, choice))}
              title="Not decided yet"
            />
          </fieldset>
        ) : null}
        {home && choice && choice.pick > 1 ? (
          <fieldset className="papers__group">
            <legend>
              {choice.label} <span className="papers__count">(pick {choice.pick})</span>
            </legend>
            {choice.ids.map((id) => (
              <Option
                key={id}
                type="checkbox"
                checked={picks.includes(id)}
                onChange={() => setPicks((p) => togglePick(p, id, choice))}
                title={name(id)}
                hint={NOT_ON_HUB[id] ? 'No module page on the Hub' : undefined}
              />
            ))}
          </fieldset>
        ) : null}
        {home && !choice ? <p className="papers__note">Every {cohortLabel(home)} module is compulsory.</p> : null}
        <fieldset className="papers__group">
          <legend>Modules from other years</legend>
          <p className="papers__note">A resit, or a module you sit early.</p>
          {others.map((y: CohortYear) => (
            <div key={y} className="papers__year">
              <h3 className="papers__year-name">{cohortLabel(y)}</h3>
              {modules
                .filter((m) => m.year === y)
                .map((m) => (
                  <Option
                    key={m.id}
                    type="checkbox"
                    checked={picks.includes(m.id)}
                    onChange={() => setPicks((p) => togglePick(p, m.id))}
                    title={moduleLabel(m)}
                  />
                ))}
            </div>
          ))}
        </fieldset>
        <fieldset className="papers__group" data-hub="papers-zone">
          <legend>Your exam zone</legend>
          <p className="papers__note">
            Your exam timetable says which zone you sit. Its paper comes first in past papers. {RTC_NOTE}
          </p>
          <div className="papers__zones">
            {ZONES.map((z) => (
              <Option
                key={z}
                type="radio"
                name={`${groupName}-zone`}
                checked={zone === z}
                onChange={() => setZone(z)}
                title={zoneLabel(z)}
              />
            ))}
            <Option
              type="radio"
              name={`${groupName}-zone`}
              checked={zone === 'unsure'}
              onChange={() => setZone('unsure')}
              title="Not sure"
            />
          </div>
        </fieldset>
        {error ? (
          <p className="papers__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** "Your modules: Year 2, option not picked" and a button to change them. */
export function PapersButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { home, picks, papers } = usePapers();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className={className}
        onClick={() => setOpen(true)}
        data-hub="papers-open"
        aria-haspopup="dialog"
      >
        Your modules: {picksSummary(home, picks, papers)}
      </Button>
      <PapersDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
