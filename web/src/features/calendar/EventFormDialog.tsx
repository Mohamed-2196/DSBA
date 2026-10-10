import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../api/errors';
import { YEARS, moduleLabel, type CohortYear } from '../../lib/modules';
import { useModules } from '../../state/modules';
import { Button, Modal, Select, TextField } from '../../ui';
import { useCreateEvent, useUpdateEvent } from './api';
import { EVENT_TYPES, isEventType, TYPE_ORDER } from './eventMeta';
import type { CalendarEvent, EventInput, EventType } from './types';

export interface EventFormDialogProps {
  open: boolean;
  /** The event to edit; null to add one. */
  event: CalendarEvent | null;
  /** A date to start a new event on ('YYYY-MM-DD'). */
  defaultDate?: string;
  onClose: () => void;
  onSaved: (event: CalendarEvent, created: boolean) => void;
}

interface FormState {
  title: string;
  type: EventType;
  date: string;
  endDate: string;
  year: string; // '' = every cohort
  moduleId: string; // '' = none
  time: string;
  place: string;
  sample: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

const fromEvent = (e: CalendarEvent | null, defaultDate = ''): FormState => ({
  title: e?.title ?? '',
  type: e?.type ?? 'exam',
  date: e?.date ?? defaultDate,
  endDate: e?.endDate ?? '',
  year: e?.year ? String(e.year) : '',
  moduleId: e?.moduleId ?? '',
  time: e?.time ?? '',
  place: e?.place ?? '',
  sample: e?.sample ?? false,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const toYear = (v: string): CohortYear | null => (v === '1' || v === '2' || v === '3' ? (Number(v) as CohortYear) : null);

function validate(f: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const title = f.title.trim();
  if (title.length < 3) errors.title = 'Give the event a title of at least 3 characters.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!DATE_RE.test(f.date)) errors.date = 'Choose the date.';
  if (f.endDate && !DATE_RE.test(f.endDate)) errors.endDate = 'Choose an end date, or leave it empty.';
  else if (f.endDate && f.date && f.endDate < f.date) errors.endDate = 'The end date can’t be before the start date.';
  if (f.time.trim().length > 40) errors.time = 'Keep the time under 40 characters.';
  if (f.place.trim().length > 120) errors.place = 'Keep the place under 120 characters.';
  return errors;
}

// API field names (camelCase on the wire) → form fields.
const API_FIELDS: Record<string, keyof FormState> = {
  title: 'title',
  type: 'type',
  date: 'date',
  endDate: 'endDate',
  end_date: 'endDate',
  year: 'year',
  moduleId: 'moduleId',
  module_id: 'moduleId',
  time: 'time',
  place: 'place',
};

/** Moderators: add an event to the calendar, or edit one. */
export function EventFormDialog({ open, event, defaultDate, onClose, onSaved }: EventFormDialogProps) {
  const uid = useId().replace(/:/g, '');
  const { modules } = useModules();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const [form, setForm] = useState<FormState>(() => fromEvent(event, defaultDate));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  // A fresh form every time the dialog opens (or opens on another event).
  useEffect(() => {
    if (!open) return;
    setForm(fromEvent(event, defaultDate));
    setErrors({});
    setFormError(null);
  }, [open, event, defaultDate]);

  const year = toYear(form.year);
  const moduleOptions = useMemo(
    () => modules.filter((m) => !year || m.year === year).map((m) => ({ value: m.id, label: `${moduleLabel(m)} (Year ${m.year})` })),
    [modules, year],
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    const body: EventInput = {
      title: form.title.trim(),
      type: form.type,
      date: form.date,
      endDate: form.endDate || null,
      year: toYear(form.year),
      moduleId: form.moduleId || null,
      time: form.time.trim() || null,
      place: form.place.trim() || null,
      sample: form.sample,
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
      title={event ? 'Edit event' : 'Add an event'}
      description={event ? 'Changes show on everyone’s calendar and in the calendar feed.' : 'It shows on the calendar of the cohort you choose, and in the calendar feed.'}
      size="md"
      className="cal-form-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`cal-form-${uid}`} loading={saving} data-hub="calendar-save">
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <form id={`cal-form-${uid}`} className="cal-form" onSubmit={submit} noValidate>
        <TextField label="Title" required value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="ST2133 Distribution Theory mock exam" className="cal-form__wide" data-autofocus />
        <Select
          label="Type"
          value={form.type}
          onChange={(e) => {
            if (isEventType(e.target.value)) set('type', e.target.value);
          }}
          options={TYPE_ORDER.map((t) => ({ value: t, label: EVENT_TYPES[t].label }))}
          error={errors.type}
        />
        <Select
          label="Cohort"
          value={form.year}
          onChange={(e) => {
            const next = e.target.value;
            set('year', next);
            const y = toYear(next);
            if (y && form.moduleId && modules.find((m) => m.id === form.moduleId)?.year !== y) set('moduleId', '');
          }}
          options={[{ value: '', label: 'Every cohort' }, ...YEARS.map((y) => ({ value: String(y), label: `Year ${y}` }))]}
          error={errors.year}
        />
        <TextField label="Date" type="date" required value={form.date} onChange={(e) => set('date', e.target.value)} error={errors.date} />
        <TextField label="End date" type="date" value={form.endDate} min={form.date || undefined} onChange={(e) => set('endDate', e.target.value)} error={errors.endDate} hint="Only for something longer than a day." />
        <Select
          label="Module"
          value={form.moduleId}
          onChange={(e) => set('moduleId', e.target.value)}
          options={[{ value: '', label: 'No module' }, ...moduleOptions]}
          error={errors.moduleId}
          className="cal-form__wide"
        />
        <TextField label="Time" value={form.time} onChange={(e) => set('time', e.target.value)} error={errors.time} placeholder="12:30 PM" hint="As the organiser published it." />
        <TextField label="Place" value={form.place} onChange={(e) => set('place', e.target.value)} error={errors.place} placeholder="Auditorium" />
        <label className="cal-form__check cal-form__wide">
          <input type="checkbox" checked={form.sample} onChange={(e) => set('sample', e.target.checked)} />
          <span>
            <span className="cal-form__check-title">Not confirmed yet</span>
            <span className="cal-form__check-hint">Students see it marked as a sample date until you untick this.</span>
          </span>
        </label>
        {formError ? (
          <p className="cal-form__error cal-form__wide" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
