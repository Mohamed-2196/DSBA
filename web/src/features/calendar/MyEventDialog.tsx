import { useEffect, useId, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../api/errors';
import { Button, cx, Modal, Select, Switch, TextArea, TextField } from '../../ui';
import { useCreateMyEvent, useUpdateMyEvent } from './api';
import { ALL_DAY_REMINDERS, clock, COLOUR_LABELS, COLOURS, REMINDERS } from './mine';
import type { PersonalColour, PersonalEvent, PersonalInput, Reminder, Repeat } from './types';

export interface MyEventDialogProps {
  open: boolean;
  /** The event to edit; null to add one. */
  event: PersonalEvent | null;
  /** The day a new event starts on ('YYYY-MM-DD'). */
  defaultDate: string;
  onClose: () => void;
  onSaved: (event: PersonalEvent, created: boolean) => void;
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

const fromEvent = (e: PersonalEvent | null, defaultDate: string): FormState => ({
  title: e?.title ?? '',
  allDay: e ? !e.startTime : false,
  date: e?.date ?? defaultDate,
  endDate: e?.endDate ?? '',
  startTime: clock(e?.startTime) ?? '',
  endTime: clock(e?.endTime) ?? '',
  place: e?.place ?? '',
  notes: e?.notes ?? '',
  colour: e?.colour ?? 'violet',
  repeat: e?.repeat ?? 'none',
  repeatUntil: e?.repeatUntil ?? '',
  remind: e?.remind != null ? String(e.remind) : '',
});

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

function validate(f: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const title = f.title.trim();
  if (!title) errors.title = 'Give the event a title.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!DATE_RE.test(f.date)) errors.date = 'Choose the day.';
  if (f.allDay && f.endDate && f.endDate < f.date) errors.endDate = 'The last day can’t be before the first.';
  if (!f.allDay && !TIME_RE.test(f.startTime)) errors.startTime = 'Choose when it starts, or make it all day.';
  if (!f.allDay && f.endTime && f.endTime <= f.startTime) errors.endTime = 'The end has to be after the start.';
  if (f.repeat !== 'none' && f.repeatUntil && f.repeatUntil < f.date) errors.repeatUntil = 'The repeat can’t end before the first day.';
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

/** Add an event to the student's own calendar, or edit one. Only they see it. */
export function MyEventDialog({ open, event, defaultDate, onClose, onSaved }: MyEventDialogProps) {
  const uid = useId().replace(/:/g, '');
  const create = useCreateMyEvent();
  const update = useUpdateMyEvent();
  const [form, setForm] = useState<FormState>(() => fromEvent(event, defaultDate));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    setForm(fromEvent(event, defaultDate));
    setErrors({});
    setFormError(null);
  }, [open, event, defaultDate]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const reminders = form.allDay ? ALL_DAY_REMINDERS : REMINDERS;
  const setAllDay = (allDay: boolean) => {
    setForm((f) => {
      // an all-day event offers reminders on the day or the day before, at 9:00
      const remind = allDay && f.remind && !ALL_DAY_REMINDERS.some((r) => String(r.value) === f.remind) ? '0' : f.remind;
      return { ...f, allDay, remind };
    });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: PersonalInput = {
      title: form.title.trim(),
      date: form.date,
      endDate: form.allDay && form.repeat === 'none' && form.endDate ? form.endDate : null,
      startTime: form.allDay ? null : form.startTime,
      endTime: form.allDay || !form.endTime ? null : form.endTime,
      place: form.place.trim() || null,
      notes: form.notes.trim() || null,
      colour: form.colour,
      repeat: form.repeat,
      repeatUntil: form.repeat !== 'none' && form.repeatUntil ? form.repeatUntil : null,
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
    if (event) update.mutate({ id: event.id, patch: body }, { onSuccess: (saved) => onSaved(saved, false), onError: fail });
    else create.mutate(body, { onSuccess: (saved) => onSaved(saved, true), onError: fail });
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={event ? 'Edit your event' : 'New event'}
      description={event?.repeat && event.repeat !== 'none' ? 'Only you see it. Changes apply to every repeat.' : 'Only you see it, on your calendar and in your private calendar link.'}
      size="md"
      className="cal-form-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`cal-mine-${uid}`} loading={saving} data-hub="calendar-mine-save">
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <form id={`cal-mine-${uid}`} className="cal-form" onSubmit={submit} noValidate data-hub="calendar-mine-form">
        <TextField label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="Study group, gym, dentist" className="cal-form__wide" data-autofocus />
        <Switch checked={form.allDay} onChange={setAllDay} label="All day" className="cal-form__wide" />
        <TextField label={form.allDay && form.repeat === 'none' ? 'First day' : 'Day'} type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        {form.allDay ? (
          form.repeat === 'none' ? (
            <TextField label="Last day" type="date" value={form.endDate} min={form.date || undefined} onChange={(e) => set('endDate', e.target.value)} error={errors.endDate} hint="Only for something longer than a day." />
          ) : null
        ) : (
          <div className="cal-form__times">
            <TextField label="Starts" type="time" required value={form.startTime} onChange={(e) => set('startTime', e.target.value)} error={errors.startTime} />
            <TextField label="Ends" type="time" value={form.endTime} min={form.startTime || undefined} onChange={(e) => set('endTime', e.target.value)} error={errors.endTime} />
          </div>
        )}
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
          <TextField label="Until" type="date" value={form.repeatUntil} min={form.date || undefined} onChange={(e) => set('repeatUntil', e.target.value)} error={errors.repeatUntil} hint="Leave it empty to repeat for a year." />
        ) : null}
        <TextField label="Place" value={form.place} onChange={(e) => set('place', e.target.value)} error={errors.place} placeholder="Room 4, block B" />
        <Select label="Reminder" value={form.remind} onChange={(e) => set('remind', e.target.value)} options={reminders.map((r) => ({ value: r.value == null ? '' : String(r.value), label: r.label }))} error={errors.remind} />
        <fieldset className="cal-form__wide cal-colours">
          <legend className="cal-colours__legend">Colour</legend>
          <div className="cal-colours__list">
            {COLOURS.map((c) => (
              <label key={c} className={cx('cal-colours__item', `cal-colour--${c}`, form.colour === c && 'is-picked')}>
                <input type="radio" name={`cal-colour-${uid}`} value={c} checked={form.colour === c} onChange={() => set('colour', c)} className="visually-hidden" />
                <span className="cal-colours__swatch" aria-hidden="true" />
                <span className="cal-colours__name">{COLOUR_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} error={errors.notes} rows={3} className="cal-form__wide" />
        {formError ? (
          <p className="cal-form__error cal-form__wide" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
