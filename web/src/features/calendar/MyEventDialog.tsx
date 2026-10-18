import { useId, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../api/errors';
import { Button, cx, Modal, Select, Switch, TextArea, TextField } from '../../ui';
import type { DayKey } from '../../lib/dates';
import { useCreateMyEvent, useEditMyOccurrence, useUpdateMyEvent } from './api';
import {
  ALL_DAY_REMINDERS,
  clock,
  COLOUR_LABELS,
  COLOURS,
  lastRepeat,
  occurrenceDays,
  REMINDERS,
  repeats,
} from './mine';
import { ScopeChoice } from './ScopeChoice';
import type { ChangeScope, PersonalColour, PersonalEvent, PersonalInput, Reminder, Repeat } from './types';

export interface MyEventDialogProps {
  open: boolean;
  /** The event to edit; null to add one. */
  event: PersonalEvent | null;
  /** The day it was opened on ('YYYY-MM-DD'): the day a new event starts on, or the day of a repeat the student
   *  opened (a change can then cover that day only, or it and the later ones). */
  day: DayKey;
  onClose: () => void;
  /** `day`: the day of the saved event to show, the one that now holds the day the dialog was opened on. */
  onSaved: (event: PersonalEvent, created: boolean, day: DayKey) => void;
}

interface FormState {
  title: string;
  allDay: boolean;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  place: string;
  notes: string;
  colour: PersonalColour;
  repeat: Repeat;
  repeatUntil: string;
  /** '' = no reminder */
  remind: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

/**
 * The form for `e` (null: a new event on `day`). A change from one day of a repeat starts on that day; one from it
 * on keeps the repeat's last day, so the later events end where the repeat did.
 */
function formFor(e: PersonalEvent | null, day: DayKey, scope: ChangeScope): FormState {
  return {
    title: e?.title ?? '',
    allDay: e ? !e.startTime : false,
    date: e && scope === 'all' ? e.date : day,
    endDate: e?.endDate ?? '',
    startTime: clock(e?.startTime) ?? '',
    endTime: clock(e?.endTime) ?? '',
    place: e?.place ?? '',
    notes: e?.notes ?? '',
    colour: e?.colour ?? 'violet',
    repeat: e?.repeat ?? 'none',
    repeatUntil: e && scope === 'following' ? (e.repeatUntil ?? lastRepeat(e)) : (e?.repeatUntil ?? ''),
    remind: e?.remind != null ? String(e.remind) : '',
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'none', label: 'Doesn’t repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
];
const REMINDER_VALUES: readonly Reminder[] = [0, 10, 30, 60, 1440];
const toReminder = (v: string): Reminder | null => REMINDER_VALUES.find((r) => String(r) === v) ?? null;
const isRepeat = (v: string): v is Repeat => v === 'none' || v === 'daily' || v === 'weekly';

function validate(f: FormState, repeat: Repeat): FieldErrors {
  const errors: FieldErrors = {};
  const title = f.title.trim();
  if (!title) errors.title = 'Give the event a title.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!DATE_RE.test(f.date)) errors.date = 'Choose the day.';
  if (f.allDay && repeat === 'none' && f.endDate && f.endDate < f.date)
    errors.endDate = 'The last day can’t be before the first.';
  if (!f.allDay && !TIME_RE.test(f.startTime)) errors.startTime = 'Choose when it starts, or make it all day.';
  if (!f.allDay && f.endTime && f.endTime <= f.startTime) errors.endTime = 'The end has to be after the start.';
  if (repeat !== 'none' && f.repeatUntil && f.repeatUntil < f.date)
    errors.repeatUntil = 'The repeat can’t end before the first day.';
  if (f.place.trim().length > 120) errors.place = 'Keep the place under 120 characters.';
  if (f.notes.trim().length > 2000) errors.notes = 'Keep the notes under 2,000 characters.';
  return errors;
}

// API field names (camelCase on the wire) → form fields.
const API_FIELDS: Record<string, keyof FormState> = {
  title: 'title',
  date: 'date',
  endDate: 'endDate',
  startTime: 'startTime',
  endTime: 'endTime',
  place: 'place',
  notes: 'notes',
  colour: 'colour',
  repeat: 'repeat',
  repeatUntil: 'repeatUntil',
  remind: 'remind',
};

/**
 * Add an event to the student's own calendar, or edit one. Only they see it. Opened from one day of a repeat, it
 * asks what the change covers: that day, it and the later ones, or all of them. The page mounts a fresh dialog (a
 * new `key`) each time it opens. data-hub="calendar-mine-form".
 */
export function MyEventDialog({ open, event, day, onClose, onSaved }: MyEventDialogProps) {
  const uid = useId().replace(/:/g, '');
  const create = useCreateMyEvent();
  const update = useUpdateMyEvent();
  const editDay = useEditMyOccurrence();
  const repeating = !!event && repeats(event);
  const [scope, setScope] = useState<ChangeScope>(repeating ? 'one' : 'all');
  const [form, setForm] = useState<FormState>(() => formFor(event, day, repeating ? 'one' : 'all'));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending || editDay.isPending;
  // a change to one day makes that day an event of its own: it doesn't repeat
  const repeat: Repeat = scope === 'one' ? 'none' : form.repeat;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /** Another scope: the day (and a repeat's last day) follow it; whatever else was typed stays. */
  const pickScope = (next: ChangeScope) => {
    if (!event) return;
    const fresh = formFor(event, day, next);
    setScope(next);
    setForm((f) => ({ ...f, date: fresh.date, repeatUntil: fresh.repeatUntil }));
    setErrors({});
    setFormError(null);
  };

  const reminders = form.allDay ? ALL_DAY_REMINDERS : REMINDERS;
  const setAllDay = (allDay: boolean) => {
    setForm((f) => {
      // an all-day event offers reminders on the day or the day before, at 9:00
      const remind =
        allDay && f.remind && !ALL_DAY_REMINDERS.some((r) => String(r.value) === f.remind) ? '0' : f.remind;
      return { ...f, allDay, remind };
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form, repeat);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: PersonalInput = {
      title: form.title.trim(),
      date: form.date,
      endDate: form.allDay && repeat === 'none' && form.endDate ? form.endDate : null,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay || !form.endTime ? null : form.endTime,
      place: form.place.trim() || null,
      notes: form.notes.trim() || null,
      colour: form.colour,
      repeat,
      repeatUntil: repeat !== 'none' && form.repeatUntil ? form.repeatUntil : null,
      remind: toReminder(form.remind),
    };
    const fail = (err: unknown) => {
      if (isApiError(err) && Object.keys(err.fields).length) {
        const mapped: FieldErrors = {};
        for (const [k, msg] of Object.entries(err.fields)) {
          const field = API_FIELDS[k];
          if (field) mapped[field] = msg;
        }
        setErrors(mapped);
        if (!Object.keys(mapped).length) setFormError(err.message);
      } else setFormError(errorMessage(err, 'The event wasn’t saved. Try again.'));
    };
    if (!event) create.mutate(body, { onSuccess: (saved) => onSaved(saved, true, saved.date), onError: fail });
    else if (scope === 'all' || !repeating) {
      // the day it was opened on while the event is still on it, else its first day
      const shown = (saved: PersonalEvent): DayKey => {
        const days = occurrenceDays(saved);
        return days.includes(day) ? day : (days[0] ?? saved.date);
      };
      update.mutate(
        { id: event.id, patch: body },
        { onSuccess: (saved) => onSaved(saved, false, shown(saved)), onError: fail },
      );
    } else
      editDay.mutate(
        { id: event.id, day, scope, patch: body },
        { onSuccess: (saved) => onSaved(saved, false, saved.date), onError: fail },
      );
  };

  const span = form.allDay && repeat === 'none'; // an all-day event can run over several days
  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={event ? 'Edit your event' : 'New event'}
      description="Only you see it, on your calendar and in your private calendar link."
      size="md"
      className="cal-form-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form={`cal-mine-${uid}`}
            loading={saving}
            data-hub="calendar-mine-save"
          >
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <form id={`cal-mine-${uid}`} className="cal-form" onSubmit={submit} noValidate data-hub="calendar-mine-form">
        {event && repeating ? (
          <ScopeChoice
            legend="Change"
            value={scope}
            onChange={pickScope}
            event={event}
            day={day}
            disabled={saving}
            autoFocus
            className="cal-form__wide"
          />
        ) : null}
        <TextField
          label="Title"
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          placeholder="Study group, gym, dentist"
          className="cal-form__wide"
          data-autofocus
        />
        <Switch checked={form.allDay} onChange={setAllDay} label="All day" className="cal-form__wide" />
        <div className={cx('cal-form__wide', 'cal-form__when', !form.allDay && 'has-times')}>
          <TextField
            label={span ? 'First day' : 'Day'}
            type="date"
            required
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            error={errors.date}
            className="cal-form__day"
          />
          {span ? (
            <TextField
              label="Last day"
              type="date"
              value={form.endDate}
              min={form.date || undefined}
              onChange={(e) => set('endDate', e.target.value)}
              error={errors.endDate}
              hint="Only for more than one day."
            />
          ) : form.allDay ? null : (
            <>
              <TextField
                label="Starts"
                type="time"
                required
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                error={errors.startTime}
                className="cal-form__time"
              />
              <TextField
                label="Ends"
                type="time"
                value={form.endTime}
                min={form.startTime || undefined}
                onChange={(e) => set('endTime', e.target.value)}
                error={errors.endTime}
                className="cal-form__time"
              />
            </>
          )}
        </div>
        {scope === 'one' ? null : (
          <>
            <Select
              label="Repeat"
              value={form.repeat}
              onChange={(e) => {
                if (isRepeat(e.target.value)) set('repeat', e.target.value);
              }}
              options={REPEATS}
              error={errors.repeat}
            />
            {form.repeat !== 'none' ? (
              <TextField
                label="Until"
                type="date"
                value={form.repeatUntil}
                min={form.date || undefined}
                onChange={(e) => set('repeatUntil', e.target.value)}
                error={errors.repeatUntil}
                hint="Leave it empty to repeat for a year."
              />
            ) : null}
          </>
        )}
        <TextField
          label="Place"
          value={form.place}
          onChange={(e) => set('place', e.target.value)}
          error={errors.place}
          placeholder="Room 4, block B"
        />
        <Select
          label="Reminder"
          value={form.remind}
          onChange={(e) => set('remind', e.target.value)}
          options={reminders.map((r) => ({ value: r.value == null ? '' : String(r.value), label: r.label }))}
          error={errors.remind}
        />
        <fieldset className="cal-form__wide cal-colours">
          <legend className="cal-colours__legend">Colour</legend>
          <div className="cal-colours__list">
            {COLOURS.map((c) => (
              <label key={c} className={cx('cal-colours__item', `cal-colour--${c}`, form.colour === c && 'is-picked')}>
                <input
                  type="radio"
                  name={`cal-colour-${uid}`}
                  value={c}
                  checked={form.colour === c}
                  onChange={() => set('colour', c)}
                  className="visually-hidden"
                />
                <span className="cal-colours__swatch" aria-hidden="true" />
                <span className="cal-colours__name">{COLOUR_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          label="Notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          error={errors.notes}
          rows={3}
          className="cal-form__wide"
        />
        {formError ? (
          <p className="cal-form__error cal-form__wide" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
