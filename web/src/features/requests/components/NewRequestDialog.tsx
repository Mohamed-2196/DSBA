// "New request": a kind, a title, details and an optional module -> POST /requests. While the title is typed,
// similar requests show under it, so a student can say "me too" instead of asking again.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage } from '../../../api/errors';
import type { RequestCreate } from '../../../api/types';
import { moduleLabel } from '../../../lib/modules';
import { useDebouncedValue, useToast } from '../../../state';
import { useModulesOptional } from '../../../state/modules';
import { Badge, Button, Modal, Select, TextArea, TextField } from '../../../ui';
import { SIMILAR_MIN, useCreateRequest, useSimilarRequests } from '../api';
import { KINDS, requestPath, statusOf } from '../labels';
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

export function NewRequestDialog({ open, onClose, kind: initialKind = null }: NewRequestDialogProps) {
  const [kind, setKind] = useState<RequestKind>(initialKind ?? 'paper');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [moduleId, setModuleId] = useState('');
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
    setErrors({});
  };

  const submit = () => {
    if (title.trim().length < 5) {
      setErrors({
        title: 'Make the title a little longer (at least 5 characters).',
      });
      return;
    }
    const body: RequestCreate = {
      kind,
      title: title.trim(),
      details: details.trim(),
      moduleId: moduleId || null,
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
        {errors.form ? (
          <p className="req-form__error" role="alert">
            {errors.form}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
