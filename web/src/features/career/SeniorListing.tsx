// Your account: a Year 3 student (account at least 30 days old) lists themselves as a senior who answers questions (career.seniors), picks topics,
// writes a line about what they did, pauses or leaves. Name, cohort and badge are shown; never contact details.
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '../../api/errors';
import type { MySenior } from '../../api/types';
import { useToast } from '../../state';
import { Button, Chip, ConfirmDialog, Panel, QueryError, Skeleton, Switch, TextField } from '../../ui';
import { useMySenior, useRemoveSenior, useSaveSenior } from './api';
import { TOPICS, notEligible, type SeniorTopic } from './lib/seniors';
import './SeniorListing.css';

const NOTE_MAX = 140;

function ListingForm({ mine }: { mine: MySenior }) {
  const { push } = useToast();
  const save = useSaveSenior();
  const remove = useRemoveSenior();
  const [topics, setTopics] = useState<SeniorTopic[]>(mine.topics);
  const [note, setNote] = useState(mine.note);
  const [paused, setPaused] = useState(mine.paused);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setTopics(mine.topics);
    setNote(mine.note);
    setPaused(mine.paused);
  }, [mine]);

  const toggle = (id: SeniorTopic, on: boolean) => {
    setTopics((t) => (on ? [...t, id] : t.filter((x) => x !== id)));
    setError(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!topics.length) {
      setError('Pick at least one topic.');
      return;
    }
    save.mutate(
      { topics, note: note.trim(), paused },
      {
        onSuccess: (saved) =>
          push({
            tone: 'success',
            title: saved.paused ? 'Listing paused' : mine.listed ? 'Listing saved' : 'You’re listed',
            body: saved.paused
              ? 'Nobody can ask you until you turn it back on.'
              : 'Students can ask you from Career Navigator.',
          }),
        onError: (err) => push({ tone: 'alert', title: 'Your listing wasn’t saved', body: errorMessage(err) }),
      },
    );
  };

  return (
    <form className="senior-form" onSubmit={submit} noValidate data-hub="senior-listing">
      <fieldset className="senior-form__topics">
        <legend className="senior-form__legend">What you can answer</legend>
        <div className="senior-form__chips">
          {TOPICS.map((t) => (
            <Chip key={t.id} selected={topics.includes(t.id)} onChange={(on) => toggle(t.id, on)}>
              {t.label}
            </Chip>
          ))}
        </div>
        {error ? (
          <p className="senior-form__error" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
      <TextField
        label="A line about you (optional)"
        hint="What you did, like an internship or an MSc offer. No phone numbers or emails: students ask you in the forum."
        value={note}
        maxLength={NOTE_MAX}
        onChange={(e) => setNote(e.target.value)}
        placeholder="I did NBB’s summer internship in Year 2."
      />
      {mine.listed ? (
        <Switch
          label="Pause my listing"
          description="You stay signed up, but nobody can ask you until you turn it back on."
          checked={paused}
          onChange={setPaused}
        />
      ) : null}
      <div className="senior-form__actions">
        <Button type="submit" variant="primary" loading={save.isPending}>
          {mine.listed ? 'Save' : 'List me as a senior'}
        </Button>
        {mine.listed ? (
          <Button variant="ghost" onClick={() => setLeaving(true)}>
            Take me off the list
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Take yourself off the list?"
        body="Students won’t see you in Career Navigator. Threads you were asked in stay."
        confirmLabel="Take me off"
        tone="danger"
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setLeaving(false);
              push({ tone: 'success', title: 'You’re off the list' });
            },
            onError: (err) => push({ tone: 'alert', title: 'Something went wrong', body: errorMessage(err) }),
          })
        }
      />
    </form>
  );
}

/** The listing form, for Year 3 students while seniors are switched on (the account page decides when to show it). */
export function SeniorListing() {
  const mine = useMySenior(true);
  return (
    <Panel>
      {mine.isPending ? (
        <Skeleton lines={3} />
      ) : mine.isError ? (
        <QueryError error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.data.eligible ? (
        <ListingForm mine={mine.data} />
      ) : (
        <p className="senior-form__note">{notEligible(mine.data)}</p>
      )}
    </Panel>
  );
}
