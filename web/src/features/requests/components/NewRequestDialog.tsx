// "New request": a kind, a title, details and an optional module -> POST /requests. While the title is typed,
// similar requests show under it, so a student can say "me too" instead of asking again. While requests close
// themselves (requests.autoclose), a paper request can name its file (kind, exam year, zone) and a date request the
// unconfirmed date it asks about.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../api/errors';
import type { RequestCreate } from '../../../api/types';
import { useAuth } from '../../../auth';
import { formatShort, parseDay } from '../../../lib/dates';
import { moduleLabel } from '../../../lib/modules';
import { dayKeyFromToday, useCalendarEvents } from '../../calendar/public';
import { LIBRARY_EXAM_KINDS, LIBRARY_KINDS } from '../../library/public';
import { useDebouncedValue, useToast } from '../../../state';
import { useModulesOptional } from '../../../state/modules';
import { Badge, Button, Modal, Select, TextArea, TextField } from '../../../ui';
import { SIMILAR_MIN, useCreateRequest, useSimilarRequests } from '../api';
import { examYears, KINDS, requestPath, statusOf } from '../labels';
import type { RequestKind } from '../types';

const TITLE_MAX = 140;
const DETAILS_MAX = 2000;

export interface NewRequestDialogProps {
  open: boolean;
  onClose: () => void;
  /** the kind to start with (the library's "Ask for it" link asks for a paper) */
  kind?: RequestKind | null;
}

function Similar({ title }: { title: string }) {
  const q = useDebouncedValue(title, 350);
  const similar = useSimilarRequests(q);
  const hits = q.trim().length >= SIMILAR_MIN ? (similar.data ?? []) : [];
  if (!hits.length) return null;
  return (
    <div className="req-similar" aria-live="polite">
      <p className="req-similar__h">Similar requests. If one is what you want, say “me too” there instead.</p>
      <ul role="list">
        {hits.map((h) => (
          <li key={h.id}>
            <Link to={requestPath(h.id)} target="_blank" rel="noopener" dir="auto">
              {h.title}
            </Link>
            <Badge tone={statusOf(h.status).tone} size="sm">
              {statusOf(h.status).label}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

type WantedKind = NonNullable<RequestCreate['wantedKind']>;
type Zone = NonNullable<RequestCreate['zone']>;

/** The unconfirmed dates of the next six months, soonest first. */
function useUnconfirmedDates(enabled: boolean) {
  const q = useCalendarEvents({ from: dayKeyFromToday(), to: dayKeyFromToday(183) }, { enabled });
  return useMemo(() => (q.data ?? []).filter((e) => e.sample), [q.data]);
}

export function NewRequestDialog({ open, onClose, kind: initialKind = null }: NewRequestDialogProps) {
  const [kind, setKind] = useState<RequestKind>(initialKind ?? 'paper');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [wantedKind, setWantedKind] = useState<WantedKind | ''>('');
  const [examYear, setExamYear] = useState('');
  const [zone, setZone] = useState<Zone | ''>('');
  const [eventId, setEventId] = useState('');
  const { featureOn } = useAuth();
  const autoclose = featureOn('requests.autoclose');
  const names = autoclose && kind === 'paper';
  const asksDate = autoclose && kind === 'event' && featureOn('calendar');
  const dates = useUnconfirmedDates(open && asksDate);
  const examKind = !!wantedKind && LIBRARY_EXAM_KINDS.has(wantedKind);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCreateRequest();
  const modules = useModulesOptional();
  const { push } = useToast();
  const navigate = useNavigate();

  const close = () => {
    if (create.isPending) return;
    onClose();
    setTitle('');
    setDetails('');
    setModuleId('');
    setWantedKind('');
    setExamYear('');
    setZone('');
    setEventId('');
    setErrors({});
  };

  const submit = () => {
    if (title.trim().length < 5) {
      setErrors({
        title: 'Make the title a little longer (at least 5 characters).',
      });
      return;
    }
    if (names && wantedKind && !moduleId) {
      setErrors({ moduleId: 'Pick the module the file is for.' });
      return;
    }
    const body: RequestCreate = {
      kind,
      title: title.trim(),
      details: details.trim(),
      moduleId: moduleId || null,
      wantedKind: names && wantedKind ? wantedKind : null,
      examYear: names && examKind && examYear ? Number(examYear) : null,
      zone: names && examKind && zone ? zone : null,
      eventId: asksDate && eventId ? eventId : null,
    };
    create.mutate(body, {
      onSuccess: (made) => {
        close();
        push({
          title: 'Request sent',
          body: 'The reps will see it. You’ll get a notification when they answer.',
          tone: 'success',
        });
        navigate(requestPath(made.id));
      },
      onError: (e) => {
        if (e instanceof ApiError && Object.keys(e.fields).length) {
          setErrors(e.fields);
          return;
        }
        setErrors({
          form: errorMessage(e, 'Your request wasn’t sent. Try again.'),
        });
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Ask for something"
      description="Everyone can see requests. Other students can say “me too”, and the reps answer here."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={create.isPending} data-hub="request-send">
            Send request
          </Button>
        </>
      }
    >
      <form
        className="req-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <Select
          label="What do you need?"
          value={kind}
          onChange={(e) => setKind(KINDS.find((k) => k.value === e.target.value)?.value ?? 'other')}
          options={KINDS.map((k) => ({ value: k.value, label: k.label }))}
          hint={KINDS.find((k) => k.value === kind)?.hint}
          error={errors.kind}
          data-autofocus
        />
        <TextField
          label="Title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) setErrors({});
          }}
          error={errors.title}
          hint="Say what you need in a few words, like “ST2133 past papers from 2019”."
          required
          dir="auto"
          data-hub="request-title"
        />
        <Similar title={title} />
        <TextArea
          label="Details"
          rows={4}
          value={details}
          maxLength={DETAILS_MAX}
          onChange={(e) => setDetails(e.target.value)}
          error={errors.details}
          hint="Optional. Anything that helps the reps find it."
          dir="auto"
        />
        {modules ? (
          <Select
            label="Module"
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            placeholder="No module"
            options={modules.modules.map((m) => ({
              value: m.id,
              label: moduleLabel(m),
            }))}
            error={errors.moduleId}
          />
        ) : null}
        {names ? (
          <fieldset className="req-form__wants">
            <legend>Which file?</legend>
            <p className="req-form__wants-hint">
              Optional. Name it and its module, and you’ll hear when it’s in the library.
            </p>
            <Select
              label="Type of file"
              value={wantedKind}
              onChange={(e) => setWantedKind(LIBRARY_KINDS.find((k) => k.id === e.target.value)?.id ?? '')}
              placeholder="Any file"
              options={LIBRARY_KINDS.map((k) => ({ value: k.id, label: k.label }))}
              error={errors.wantedKind}
              data-hub="request-wanted-kind"
            />
            {examKind ? (
              <div className="req-form__pair">
                <Select
                  label="Exam year"
                  value={examYear}
                  onChange={(e) => setExamYear(e.target.value)}
                  placeholder="Any year"
                  options={examYears().map((y) => ({ value: String(y), label: String(y) }))}
                  error={errors.examYear}
                />
                <Select
                  label="Zone"
                  value={zone}
                  onChange={(e) => setZone(e.target.value === 'A' || e.target.value === 'B' ? e.target.value : '')}
                  placeholder="Any zone"
                  options={[
                    { value: 'A', label: 'Zone A' },
                    { value: 'B', label: 'Zone B' },
                  ]}
                  error={errors.zone}
                />
              </div>
            ) : null}
          </fieldset>
        ) : null}
        {asksDate && dates.length ? (
          <Select
            label="Which date?"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="Not one of these"
            options={dates.map((d) => ({ value: d.id, label: `${formatShort(parseDay(d.date))} · ${d.title}` }))}
            hint="Asking whether a date is right? Pick it, and your request closes when a rep confirms it."
            error={errors.eventId}
            data-hub="request-event"
          />
        ) : null}
        {errors.form ? (
          <p className="req-form__error" role="alert">
            {errors.form}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
