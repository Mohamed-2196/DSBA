import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import type { CalendarEventSaved, ModuleSummary } from '../../api/types';
import { errorMessage, isApiError, placeFieldErrors, unplacedMessage } from '../../api/errors';
import { resitSitting } from '../../lib/exams';
import { moduleLabel } from '../../lib/modules';
import { cohortLabel, normalizeYear, YEARS, type CohortYear } from '../../state';
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
  /** What a new event starts with (Career Navigator's editor: a careers date for one employer). */
  preset?: Partial<Pick<FormState, 'type' | 'employerId' | 'title'>>;
  /** Employers offered for a careers date: passed from the caller to keep dependencies acyclic. */
  employers?: readonly { id: string; name: string }[];
  onClose: () => void;
  /** `told`: what an edit told students (none for a new event). */
  onSaved: (event: CalendarEvent, created: boolean, told?: DateNotice) => void;
}

/** What an edit told students: sent (with how many), limit (told today already) or none. */
export type DateNotice = Pick<CalendarEventSaved, 'notice' | 'told'>;

/** The dates whose changes students are told about. */
const TOLD_TYPES: ReadonlySet<EventType> = new Set(['exam', 'mock', 'deadline']);

interface FormState {
  title: string;
  type: EventType;
  date: string;
  endDate: string;
  year: string; // '' = every cohort
  /** The cohort was picked in this form (or an event being edited has one of its own): picking a module then
   *  leaves it alone. Until then the cohort follows the module (student test ST-2). */
  yearPicked: boolean;
  moduleId: string; // '' = none
  time: string;
  place: string;
  /** an exam's length and rules (exams and mocks) */
  duration: string;
  rules: string;
  /** where the date comes from, and when it was last checked against it */
  source: string;
  checkedOn: string;
  /** a careers date's employer ('' = none) */
  employerId: string;
  sample: boolean;
  /** an exam's resit sitting: for the year after the module's and those resitting it */
  resit: boolean;
  /** The sitting was picked in this form (or the event is being edited): a new date then leaves it alone. Until
   *  then it follows the date (the October sitting is the resits). */
  resitPicked: boolean;
  /** Tell the cohort about a new date, time or place, or a confirmation (editing an exam, mock or deadline). */
  tell: boolean;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

type ModuleLookup = (id: string | null | undefined) => ModuleSummary | null;

/** An event's own cohort: one that isn't simply its module's year. */
const hasOwnCohort = (e: CalendarEvent, getModule: ModuleLookup): boolean => {
  const module = getModule(e.moduleId);
  return module ? module.year !== e.year : e.year != null;
};

const fromEvent = (e: CalendarEvent | null, getModule: ModuleLookup, defaultDate = ''): FormState => ({
  title: e?.title ?? '',
  type: e?.type ?? 'exam',
  date: e?.date ?? defaultDate,
  endDate: e?.endDate ?? '',
  year: e?.year ? String(e.year) : '',
  yearPicked: e ? hasOwnCohort(e, getModule) : false,
  moduleId: e?.moduleId ?? '',
  time: e?.time ?? '',
  place: e?.place ?? '',
  duration: e?.duration ?? '',
  rules: e?.rules ?? '',
  source: e?.source ?? '',
  checkedOn: e?.checkedOn ?? '',
  employerId: e?.employerId ?? '',
  sample: e?.sample ?? false,
  resit: e ? e.resit : resitSitting(defaultDate),
  resitPicked: !!e,
  tell: true,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whom an exam's sitting counts down for, under the choice. */
function sittingHint(resit: boolean, year: CohortYear | null): string {
  if (!resit) return year ? `Counts down for ${cohortLabel(year)}.` : 'Counts down for every cohort.';
  const next = year && year < 3 ? `${cohortLabel(normalizeYear(year + 1))} and ` : '';
  return `For students retaking it: ${next}anyone who says they’re resitting the module. ${year ? `${cohortLabel(year)} doesn’t count down to it.` : ''}`.trim();
}
const toYear = (v: string): CohortYear | null => (v ? normalizeYear(Number(v)) : null);

function validate(f: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const title = f.title.trim();
  if (title.length < 3) errors.title = 'Give the date a title of at least 3 characters.';
  else if (title.length > 160) errors.title = 'Keep the title under 160 characters.';
  if (!DATE_RE.test(f.date)) errors.date = 'Choose the date.';
  if (f.endDate && !DATE_RE.test(f.endDate)) errors.endDate = 'Choose an end date, or leave it empty.';
  else if (f.endDate && f.date && f.endDate < f.date) errors.endDate = 'The end date can’t be before the start date.';
  if (f.time.trim().length > 40) errors.time = 'Keep the time under 40 characters.';
  if (f.place.trim().length > 120) errors.place = 'Keep the place under 120 characters.';
  if (f.duration.trim().length > 40) errors.duration = 'Keep the length under 40 characters.';
  if (f.rules.trim().length > 300) errors.rules = 'Keep the rules under 300 characters.';
  if (f.source.trim().length > 300) errors.source = 'Keep the source under 300 characters.';
  if (f.checkedOn && !DATE_RE.test(f.checkedOn)) errors.checkedOn = 'Choose the day it was checked, or leave it empty.';
  if (f.type === 'careers' && !f.source.trim())
    errors.source = 'Add where this date comes from. Careers dates show only with their source.';
  return errors;
}

// The form's fields, named as the API names them in its errors.
const API_FIELDS: readonly (keyof FormState)[] = [
  'title',
  'type',
  'date',
  'endDate',
  'year',
  'moduleId',
  'time',
  'place',
  'duration',
  'rules',
  'source',
  'checkedOn',
  'employerId',
];

const EXAM_TYPES: ReadonlySet<EventType> = new Set(['exam', 'mock']);

/** Moderators: add a programme date to the calendar, or edit one. */
export function EventFormDialog({
  open,
  event,
  defaultDate,
  preset,
  employers = [],
  onClose,
  onSaved,
}: EventFormDialogProps) {
  const uid = useId().replace(/:/g, '');
  const { modules, getModule } = useModules();
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const [form, setForm] = useState<FormState>(() => ({
    ...fromEvent(event, getModule, defaultDate),
    ...(event ? {} : preset),
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  // A fresh form every time the dialog opens (or opens on another event).
  useEffect(() => {
    if (!open) return;
    setForm({ ...fromEvent(event, getModule, defaultDate), ...(event ? {} : preset) });
    setErrors({});
    setFormError(null);
    // `preset` is read when the dialog opens: a new object on every render of the caller must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event, defaultDate, getModule]);

  // A cohort picked here narrows the modules to its own; until then every module is offered.
  const year = toYear(form.year);
  const narrowTo = form.yearPicked ? year : null;
  const moduleOptions = useMemo(
    () =>
      modules
        .filter((m) => !narrowTo || m.year === narrowTo)
        .map((m) => ({ value: m.id, label: `${moduleLabel(m)} (Year ${m.year})` })),
    [modules, narrowTo],
  );
  const module = getModule(form.moduleId);
  const yearHint =
    module && !form.yearPicked ? 'From the module. Pick “Every cohort” if it’s for everyone.' : undefined;

  /** The cohort, picked by the rep: a year that isn't the module's own drops the module. */
  const pickYear = (value: string) => {
    const y = toYear(value);
    setForm((f) => ({
      ...f,
      year: value,
      yearPicked: true,
      moduleId: y && getModule(f.moduleId)?.year !== y ? '' : f.moduleId,
    }));
    if (errors.year) setErrors((e) => ({ ...e, year: undefined }));
  };
  /** The module: until a cohort is picked, the event is for the module's year (student test ST-2). */
  const pickModule = (id: string) => {
    const picked = getModule(id);
    setForm((f) => ({ ...f, moduleId: id, year: f.yearPicked ? f.year : picked ? String(picked.year) : '' }));
    if (errors.moduleId) setErrors((e) => ({ ...e, moduleId: undefined }));
  };

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
      duration: (EXAM_TYPES.has(form.type) && form.duration.trim()) || null,
      rules: (EXAM_TYPES.has(form.type) && form.rules.trim()) || null,
      source: form.source.trim() || null,
      checkedOn: form.checkedOn || null,
      employerId: (form.type === 'careers' && form.employerId) || null,
      sample: form.sample,
      resit: form.type === 'exam' && form.resit,
    };
    const fail = (err: unknown) => {
      if (isApiError(err) && Object.keys(err.fields).length) {
        const placed = placeFieldErrors(err.fields, API_FIELDS);
        setErrors(placed.fields);
        setFormError(unplacedMessage(err, placed));
      } else setFormError(errorMessage(err, 'The date wasn’t saved. Try again.'));
    };
    const tellable = TOLD_TYPES.has(form.type);
    if (event) {
      const patch = { ...body, notify: tellable && form.tell };
      update.mutate({ id: event.id, patch }, { onSuccess: (saved) => onSaved(saved, false, saved), onError: fail });
    } else {
      // 409 retry: another date took the same id at the same moment. Once more, without bothering the rep.
      const created = (saved: CalendarEvent) => onSaved(saved, true);
      create.mutate(body, {
        onSuccess: created,
        onError: (err) =>
          isApiError(err) && err.code === 'retry'
            ? create.mutate(body, { onSuccess: created, onError: fail })
            : fail(err),
      });
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={event ? 'Edit programme date' : 'New programme date'}
      description={
        event
          ? 'Changes show on everyone’s calendar and in the calendar feed.'
          : 'It shows on the calendar of the cohort you choose, and in the calendar feed.'
      }
      size="md"
      className="cal-form-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`cal-form-${uid}`} loading={saving} data-hub="calendar-save">
            {event ? 'Save changes' : 'Add date'}
          </Button>
        </>
      }
    >
      <form id={`cal-form-${uid}`} className="cal-form" onSubmit={submit} noValidate>
        <TextField
          label="Title"
          required
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          error={errors.title}
          placeholder="ST2133 Distribution Theory mock exam"
          className="cal-form__wide"
          data-autofocus
        />
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
          onChange={(e) => pickYear(e.target.value)}
          options={[
            { value: '', label: 'Every cohort' },
            ...YEARS.map((y) => ({ value: String(y), label: cohortLabel(y) })),
          ]}
          error={errors.year}
          hint={yearHint}
        />
        <TextField
          label="Date"
          type="date"
          required
          value={form.date}
          onChange={(e) => {
            const date = e.target.value;
            setForm((f) => ({ ...f, date, resit: f.resitPicked ? f.resit : resitSitting(date) }));
            if (errors.date) setErrors((x) => ({ ...x, date: undefined }));
          }}
          error={errors.date}
        />
        <TextField
          label="End date"
          type="date"
          value={form.endDate}
          min={form.date || undefined}
          onChange={(e) => set('endDate', e.target.value)}
          error={errors.endDate}
          hint="Only for something longer than a day."
        />
        <Select
          label="Module"
          value={form.moduleId}
          onChange={(e) => pickModule(e.target.value)}
          options={[{ value: '', label: 'No module' }, ...moduleOptions]}
          error={errors.moduleId}
          className="cal-form__wide"
        />
        <TextField
          label="Time"
          value={form.time}
          onChange={(e) => set('time', e.target.value)}
          error={errors.time}
          placeholder="12:30 PM"
          hint="As the organiser published it."
        />
        <TextField
          label="Place"
          value={form.place}
          onChange={(e) => set('place', e.target.value)}
          error={errors.place}
          placeholder="Auditorium"
        />
        {form.type === 'exam' ? (
          <Select
            label="Sitting"
            value={form.resit ? 'resit' : 'main'}
            onChange={(e) => setForm((f) => ({ ...f, resit: e.target.value === 'resit', resitPicked: true }))}
            options={[
              { value: 'main', label: 'Main sitting' },
              { value: 'resit', label: 'Resit' },
            ]}
            hint={sittingHint(form.resit, module?.year ?? year)}
            data-hub="calendar-sitting"
          />
        ) : null}
        {EXAM_TYPES.has(form.type) ? (
          <>
            <TextField
              label="Length"
              value={form.duration}
              onChange={(e) => set('duration', e.target.value)}
              error={errors.duration}
              placeholder="3 hours"
            />
            <TextField
              label="Rules"
              value={form.rules}
              onChange={(e) => set('rules', e.target.value)}
              error={errors.rules}
              placeholder="Bring your student ID. Casio fx-83 or fx-85 only."
              hint="What to bring, and which calculators."
              className="cal-form__wide"
            />
          </>
        ) : null}
        {form.type === 'careers' ? (
          <Select
            label="Employer"
            value={form.employerId}
            onChange={(e) => set('employerId', e.target.value)}
            options={[{ value: '', label: 'No employer' }, ...employers.map((m) => ({ value: m.id, label: m.name }))]}
            error={errors.employerId}
            hint="Its card in Career Navigator says when applications open or close. Set an end date for a window; without one, the date is the closing day."
            className="cal-form__wide"
          />
        ) : null}
        <TextField
          label="Source"
          required={form.type === 'careers'}
          value={form.source}
          onChange={(e) => set('source', e.target.value)}
          error={errors.source}
          placeholder="UoL October 2026 exam timetable"
          hint="Where the date comes from: a name or a link. Students see it."
          className="cal-form__wide"
        />
        <TextField
          label="Checked on"
          type="date"
          value={form.checkedOn}
          onChange={(e) => set('checkedOn', e.target.value)}
          error={errors.checkedOn}
          hint="When you last checked it against the source."
        />
        <label className="cal-form__check cal-form__wide">
          <input type="checkbox" checked={form.sample} onChange={(e) => set('sample', e.target.checked)} />
          <span>
            <span className="cal-form__check-title">Not confirmed yet</span>
            <span className="cal-form__check-hint">Students see it marked as not confirmed until you untick this.</span>
          </span>
        </label>
        {event && TOLD_TYPES.has(form.type) ? (
          <label className="cal-form__check cal-form__wide">
            <input
              type="checkbox"
              checked={form.tell}
              onChange={(e) => set('tell', e.target.checked)}
              data-hub="calendar-tell"
            />
            <span>
              <span className="cal-form__check-title">
                Tell {form.type === 'exam' && form.resit ? 'those it’s for' : year ? cohortLabel(year) : 'every cohort'}
              </span>
              <span className="cal-form__check-hint">
                If the date, time or place changes, or you confirm it, they get a notification. At most once a day for
                each event.
              </span>
            </span>
          </label>
        ) : null}
        {formError ? (
          <p className="cal-form__error cal-form__wide" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
