import { useId, useRef, useState, type FormEvent } from 'react';
import { errorMessage, isApiError } from '../../../api/errors';
import { useModules } from '../../../state/modules';
import { Button, Modal } from '../../../ui';
import { useDeleteItem, useUpdateItem } from '../api';
import { checkValues, errorsFromApi, toUpdateBody, valuesFromItem, type ItemFormErrors, type ItemFormValues } from '../itemForm';
import type { LibraryItem } from '../types';
import { ItemFields } from './ItemFields';
import './UploadDialog.css';

/** "Edit details" for an item: its uploader while it waits for review, moderators always. */
export function EditItemDialog({ item, open, onClose, onSaved }: { item: LibraryItem; open: boolean; onClose: () => void; onSaved?: (item: LibraryItem) => void }) {
  const uid = useId().replace(/:/g, '');
  const { getModule } = useModules();
  const update = useUpdateItem();
  const [values, setValues] = useState<ItemFormValues>(() => valuesFromItem(item));
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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const fieldErrors = checkValues(values);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    update.mutate(
      { id: item.id, body: toUpdateBody(values, getModule) },
      {
        onSuccess: (saved) => {
          onSaved?.(saved);
          onClose();
        },
        onError: (err) => {
          if (isApiError(err) && err.code === 'invalid_input') {
            const mapped = errorsFromApi(err.fields);
            if (Object.keys(mapped).length) {
              setErrors(mapped);
              return;
            }
          }
          setError(errorMessage(err));
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit details"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={`edit-${uid}`} loading={update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form ref={formRef} id={`edit-${uid}`} className="lib-upload" onSubmit={submit} noValidate>
        <ItemFields values={values} errors={errors} onChange={change} disabled={update.isPending} />
        {error ? (
          <p className="lib-upload__error lib-upload__error--form" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}

/** "Delete this file?" confirmation. */
export function DeleteItemDialog({ item, open, onClose, onDeleted }: { item: LibraryItem; open: boolean; onClose: () => void; onDeleted?: () => void }) {
  const remove = useDeleteItem();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item.status === 'published' ? 'Delete this file?' : 'Delete this upload?'}
      description={
        item.source === 'link'
          ? 'The link is removed from the library. The folder it points to isn’t touched. This can’t be undone.'
          : 'The file is removed from the library and from storage. This can’t be undone.'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            data-autofocus
            onClick={() =>
              remove.mutate(
                { id: item.id },
                {
                  onSuccess: () => {
                    onClose();
                    onDeleted?.();
                  },
                  onError: (e) => setError(errorMessage(e)),
                },
              )
            }
          >
            Delete
          </Button>
        </>
      }
    >
      <p className="lib-confirm__name">“{item.title}”</p>
      {error ? (
        <p className="lib-upload__error lib-upload__error--form" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
