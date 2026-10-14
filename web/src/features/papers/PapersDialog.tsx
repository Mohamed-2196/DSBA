// Pick your papers once: your option or electives, papers from other years, and your zone.
import { useEffect, useState } from 'react';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { cohortLabel, YEARS, type CohortYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Modal, SegmentedControl } from '../../ui';
import { moduleLabel } from '../../lib/modules';
import { CHOICES, NOT_ON_HUB, togglePick, ZONE_LABELS, type Zone } from './papers';
import { usePapers } from './usePapers';
import './Papers.css';

export interface PapersDialogProps {
  open: boolean;
  onClose: () => void;
  /** after a save */
  onSaved?: () => void;
}

type ZoneChoice = Zone | 'none';

function Check({ checked, onChange, title, hint }: { checked: boolean; onChange: () => void; title: string; hint?: string }) {
  return (
    <label className="papers-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
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
  const [picks, setPicks] = useState<string[]>(current.picks);
  const [zone, setZone] = useState<ZoneChoice>(current.zone ?? 'none');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPicks(current.picks);
    setZone(current.zone ?? 'none');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh copy each time it opens
  }, [open]);

  const home = current.home;
  const choice = home ? CHOICES[home] : undefined;
  const name = (id: string) => NOT_ON_HUB[id] ?? (moduleLabel(getModule(id)) || id);
  const others = YEARS.filter((y) => y !== home);

  const save = async () => {
    setError(null);
    try {
      await current.save({ papers: picks, zone: zone === 'none' ? null : zone });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(errorMessage(e, 'Your papers weren’t saved. Try again.'));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your papers"
      description={
        me
          ? 'The countdown, your modules and the calendar follow them. Saved on your account, and only you see them.'
          : 'The countdown, your modules and the calendar follow them. Saved in this browser.'
      }
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
        {!home ? <p className="papers__note">Choose your year first. Then you can pick your option or electives here.</p> : null}
        {home && choice ? (
          <fieldset className="papers__group">
            <legend>
              {choice.label} <span className="papers__count">(you take {choice.pick === 1 ? 'one' : choice.pick})</span>
            </legend>
            {choice.ids.map((id) => (
              <Check key={id} checked={picks.includes(id)} onChange={() => setPicks((p) => togglePick(p, id, choice))} title={name(id)} hint={NOT_ON_HUB[id] ? 'No module page on the Hub' : undefined} />
            ))}
          </fieldset>
        ) : null}
        {home && !choice ? <p className="papers__note">Every {cohortLabel(home)} module is compulsory.</p> : null}
        <fieldset className="papers__group">
          <legend>Papers from other years</legend>
          <p className="papers__note">A resit, or a paper you sit early.</p>
          {others.map((y: CohortYear) => (
            <div key={y} className="papers__year">
              <h3 className="papers__year-name">{cohortLabel(y)}</h3>
              {modules
                .filter((m) => m.year === y)
                .map((m) => (
                  <Check key={m.id} checked={picks.includes(m.id)} onChange={() => setPicks((p) => togglePick(p, m.id))} title={moduleLabel(m)} />
                ))}
            </div>
          ))}
        </fieldset>
        <SegmentedControl<ZoneChoice>
          label="Your zone"
          size="sm"
          value={zone}
          onChange={setZone}
          options={[{ value: 'none', label: 'Not set' }, ...(Object.entries(ZONE_LABELS) as [Zone, string][]).map(([value, label]) => ({ value, label }))]}
        />
        <p className="papers__note">Your zone’s papers come first in the library.</p>
        {error ? (
          <p className="papers__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** "Your papers: 5 papers" and a button to change them. */
export function PapersButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { year, papers } = usePapers();
  return (
    <>
      <Button size="sm" variant="ghost" className={className} onClick={() => setOpen(true)} data-hub="papers-open" aria-haspopup="dialog">
        Your papers: {papers ? `${papers.size} ${papers.size === 1 ? 'paper' : 'papers'}` : year ? `every ${cohortLabel(year)} module` : 'not set'}
      </Button>
      <PapersDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
