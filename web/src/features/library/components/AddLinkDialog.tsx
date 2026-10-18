// "Add a link" (library managers): a resource kept on another site (the VLE, a publisher, the University), listed in
// the library like a file and opening that site. Published at once. Google Drive and Docs are refused: the library
// keeps its own copy of those files.
import { useId, useRef, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import { useToast } from '../../../state';
import { useModules } from '../../../state/modules';
import { Button, Modal, TextField } from '../../../ui';
import { useCreateLink } from '../api';
import {
  checkValues,
  emptyValues,
  errorsFromApi,
  linkProblem,
  toLinkBody,
  type ItemFormErrors,
  type ItemFormValues,
} from '../itemForm';
import type { CohortYear, LibraryItem } from '../types';
import { ItemFields } from './ItemFields';
import './UploadDialog.css';

export function AddLinkDialog({
  open,
  onClose,
  moduleId,
  year,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  moduleId?: string | null;
  year?: CohortYear | null;
  onAdded?: (item: LibraryItem) => void;
}) {
  const uid = useId().replace(/:/g, '');
  const { getModule } = useModules();
  const create = useCreateLink();
  const { push } = useToast();
  const [url, setUrl] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [values, setValues] = useState<ItemFormValues>(() => ({
    ...emptyValues({ moduleId, year }),
    kind: 'course-materials',
  }));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const change = (patch: Partial<ItemFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof ItemFormValues)[]) delete next[k];
      return next;
    });
  };
  const focusFirstProblem = () =>
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const badUrl = linkProblem(url);
    const fieldErrors = checkValues(values);
    setUrlError(badUrl);
    setErrors(fieldErrors);
    if (badUrl || Object.keys(fieldErrors).length) return focusFirstProblem();
    create.mutate(toLinkBody(url, values, getModule), {
      onSuccess: (item) => {
        push({ tone: 'success', title: 'Link added. Students see it in the library now.' });
        onAdded?.(item);
        onClose();
      },
      onError: (err) => {
        if (isApiError(err) && err.code === 'invalid_input') {
          const mapped = errorsFromApi(err.fields);
          const forUrl = err.fields.url ?? null;
          if (forUrl || Object.keys(mapped).length) {
            setUrlError(forUrl);
            setErrors(mapped);
            focusFirstProblem();
            return;
          }
        }
        setError(errorMessage(err));
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={create.isPending ? () => undefined : onClose}
      title="Add a link"
      description="A page on another site, listed in the library like a file. It opens that site."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`link-${uid}`} loading={create.isPending} data-hub="link-add">
            Add the link
          </Button>
        </>
      }
    >
      <form ref={formRef} id={`link-${uid}`} className="lib-upload" onSubmit={submit} noValidate>
        <TextField
          label="Link"
          required
          type="url"
          inputMode="url"
          value={url}
          maxLength={2000}
          onChange={(e) => {
            setUrl(e.target.value);
            setUrlError(null);
          }}
          error={urlError ?? undefined}
          hint="An https:// address. Not Google Drive or Docs: upload those files instead."
          placeholder="https://"
          disabled={create.isPending}
          data-hub="link-url"
        />
        <ItemFields values={values} errors={errors} onChange={change} disabled={create.isPending} />
        {error ? (
          <p className="lib-upload__error lib-upload__error--form" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
