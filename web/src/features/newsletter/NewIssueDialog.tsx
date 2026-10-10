import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage, isApiError } from '../../api/errors';
import { useAuth } from '../../auth';
import { Button, Modal, TextField } from '../../ui';
import { useCreateIssue } from './api';
import { isoDay, slugify } from './lib/text';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Moderators: start a new issue (a draft) and go straight to its editor. */
export function NewIssueDialog({ open, nextNumber, onClose }: { open: boolean; nextNumber: number; onClose: () => void }) {
  const uid = useId().replace(/:/g, '');
  const navigate = useNavigate();
  const { me } = useAuth();
  const create = useCreateIssue();
  const [title, setTitle] = useState('');
  const [number, setNumber] = useState(String(nextNumber));
  const [date, setDate] = useState(isoDay());
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setNumber(String(nextNumber));
    setDate(isoDay());
    setSlug('');
    setSlugTouched(false);
    setErrors({});
    setFormError(null);
  }, [open, nextNumber]);

  const address = slugTouched ? slug : slugify(title);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    const n = Number(number);
    if (!title.trim()) found.title = 'Give the issue a title.';
    if (!Number.isInteger(n) || n < 0) found.number = 'Use a whole number, like 2.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = 'Choose the date it comes out.';
    if (!SLUG_RE.test(address)) found.slug = 'Use lowercase letters, numbers and hyphens, like launch-edition.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    create.mutate(
      {
        slug: address,
        number: n,
        title: title.trim(),
        date,
        dek: '',
        summary: '',
        editors: me?.displayName ? [me.displayName] : [],
        cover: { tone: 'navy', lines: [] },
        sections: [],
      },
      {
        onSuccess: (issue) => {
          onClose();
          navigate(`/newsletter/${issue.slug}/edit`);
        },
        onError: (err) => {
          if (isApiError(err) && err.code === 'slug_taken') setErrors({ slug: 'Another issue already uses this address. Choose another.' });
          else if (isApiError(err) && Object.keys(err.fields).length) setErrors(err.fields);
          else setFormError(errorMessage(err, 'The issue wasn’t created. Try again.'));
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={create.isPending ? () => undefined : onClose}
      title="Start a new issue"
      description="It starts as a draft: only student reps see it until you publish it."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`nl-new-${uid}`} loading={create.isPending} data-hub="issue-create">
            Create draft
          </Button>
        </>
      }
    >
      <form id={`nl-new-${uid}`} className="nl-form" onSubmit={submit} noValidate>
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} placeholder="The October session" className="nl-form__wide" data-autofocus />
        <TextField label="Issue number" required inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} error={errors.number} />
        <TextField label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} hint="The day it comes out." />
        <TextField
          label="Address"
          required
          value={address}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
          error={errors.slug}
          hint={`/newsletter/${address || '…'}`}
          className="nl-form__wide"
        />
        {formError ? (
          <p className="nl-form__error nl-form__wide" role="alert">
            {formError}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
