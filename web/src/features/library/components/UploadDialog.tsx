import { CheckCircle, CloudArrowUp, FileText, Info, X } from '@phosphor-icons/react';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { isApiError } from '../../../api/errors';
import { useAuth } from '../../../auth';
import { useModules } from '../../../state/modules';
import { Button, IconButton, Modal, cx } from '../../../ui';
import { itemPath, useCreateItem } from '../api';
import { checkValues, emptyValues, errorsFromApi, toCreateBody, type ItemFormErrors, type ItemFormValues } from '../itemForm';
import { UPLOAD_ACCEPT, UPLOAD_LIMITS, extensionOf, formatSize, titleFromFileName } from '../kinds';
import { checkFile, sendFile, uploadErrorMessage, type SendProgress } from '../upload';
import type { CohortYear, LibraryItem } from '../types';
import { ItemFields } from './ItemFields';
import './UploadDialog.css';

type Phase = 'form' | 'sending' | 'checking' | 'saving' | 'done';

export interface UploadDialogProps {
  open: boolean;
  onClose: () => void;
  /** Start with this module chosen (a module page, or the library filtered to one). */
  defaultModuleId?: string | null;
  defaultYear?: CohortYear | null;
}

/**
 * "Upload a file": choose or drop a file, describe it, send it. The file goes straight to storage (with
 * progress), then becomes a library item: waiting for a student rep's review, or published at once when a rep
 * uploads it. Give it a new `key` each time it opens so it starts empty.
 */
export function UploadDialog({ open, onClose, defaultModuleId, defaultYear }: UploadDialogProps) {
  const uid = useId().replace(/:/g, '');
  const navigate = useNavigate();
  const { isModerator } = useAuth();
  const { getModule } = useModules();
  const createItem = useCreateItem();

  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [values, setValues] = useState<ItemFormValues>(() => emptyValues({ moduleId: defaultModuleId, year: defaultYear }));
  const [errors, setErrors] = useState<ItemFormErrors>({});
  const [phase, setPhase] = useState<Phase>('form');
  const [progress, setProgress] = useState<SendProgress>({ loaded: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  // Once the file has arrived and been checked, a retry only re-sends the details.
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [created, setCreated] = useState<LibraryItem | null>(null);

  const busy = phase === 'sending' || phase === 'checking' || phase === 'saving';

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (phase === 'done') doneRef.current?.focus();
  }, [phase]);
  // On a phone the form is taller than the screen: bring a new error into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const choose = (f: File | null | undefined) => {
    if (!f) return;
    const problem = checkFile(f);
    setError(null);
    if (problem) {
      setFileError(problem);
      return;
    }
    setFileError(null);
    setFile(f);
    setUploadId(null);
    setValues((v) => (v.title.trim() ? v : { ...v, title: titleFromFileName(f.name) }));
  };

  const change = (patch: Partial<ItemFormValues>) => {
    setValues((v) => ({ ...v, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof ItemFormValues)[]) delete next[k];
      return next;
    });
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const reset = () => {
    setFile(null);
    setFileError(null);
    setValues(emptyValues({ moduleId: values.module && values.module !== 'none' ? values.module : defaultModuleId, year: defaultYear }));
    setErrors({});
    setError(null);
    setUploadId(null);
    setCreated(null);
    setProgress({ loaded: 0, total: 0 });
    setPhase('form');
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setError(null);
    const fieldErrors = checkValues(values);
    setErrors(fieldErrors);
    if (!file) setFileError('Choose a file to upload.');
    if (!file || Object.keys(fieldErrors).length) {
      // Take keyboard and screen reader users to the first thing to fix.
      requestAnimationFrame(() => {
        const form = formRef.current;
        (form?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? form?.querySelector<HTMLElement>('[data-autofocus]'))?.focus();
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let id = uploadId;
      if (!id) {
        setPhase('sending');
        setProgress({ loaded: 0, total: file.size });
        const upload = await sendFile(file, { signal: controller.signal, onProgress: setProgress, onChecking: () => setPhase('checking') });
        id = upload.uploadId;
        setUploadId(id);
      }
      setPhase('saving');
      const item = await createItem.mutateAsync(toCreateBody(id, values, getModule));
      setCreated(item);
      setPhase('done');
    } catch (err) {
      setPhase('form');
      if (isApiError(err)) {
        if (err.code === 'aborted') return;
        if (err.code === 'mismatch' || err.code === 'not_uploaded') setUploadId(null);
        if (err.code === 'invalid_input' && Object.keys(err.fields).length) {
          const mapped = errorsFromApi(err.fields);
          if (Object.keys(mapped).length) {
            setErrors(mapped);
            return;
          }
        }
      }
      setError(uploadErrorMessage(err));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 1) setFileError('Drop one file at a time.');
    else choose(files[0]);
  };

  const pct = progress.total ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const ext = file ? extensionOf(file.name) : null;
  const published = created?.status === 'published';

  let footer;
  if (phase === 'done') {
    footer = (
      <>
        <Button variant="ghost" onClick={reset}>
          Upload another
        </Button>
        {published && created ? (
          <Button
            onClick={() => {
              onClose();
              navigate(itemPath(created));
            }}
          >
            Open it
          </Button>
        ) : (
          <Button
            onClick={() => {
              onClose();
              navigate('/library?mine=1');
            }}
          >
            See your uploads
          </Button>
        )}
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button variant="ghost" onClick={close}>
          {phase === 'sending' ? 'Cancel upload' : 'Cancel'}
        </Button>
        <Button variant="primary" type="submit" form={`upload-${uid}`} loading={busy} data-hub="upload-submit">
          {isModerator ? 'Upload and publish' : 'Send for review'}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={open}
      // While a file is on its way, only "Cancel upload" stops it (not a stray tap outside the dialog).
      onClose={busy ? () => undefined : close}
      title="Upload a file"
      description={
        phase === 'done'
          ? undefined
          : isModerator
            ? 'Share notes, past papers or guides. As a student rep, your uploads are published straight away.'
            : 'Share notes, past papers or guides with other students. A student rep checks every upload before it appears.'
      }
      size="md"
      footer={footer}
    >
      {phase === 'done' && created ? (
        <div className="lib-upload__done" role="status">
          <CheckCircle className="lib-upload__done-icon" weight="duotone" aria-hidden="true" />
          <h3 ref={doneRef} tabIndex={-1} className="lib-upload__done-title">
            {published ? 'Published' : 'Sent for review'}
          </h3>
          {published ? (
            <p>“{created.title}” is in the library now.</p>
          ) : (
            <>
              <p>
                A student rep checks every upload before it’s public. Until then “{created.title}” is in <strong>Your uploads</strong>, marked{' '}
                <em>Waiting for review</em>, and only you and the reps can see it.
              </p>
              <p>You’ll get a notification when it has been reviewed.</p>
            </>
          )}
        </div>
      ) : (
        <form ref={formRef} id={`upload-${uid}`} className="lib-upload" onSubmit={submit} noValidate>
          {file ? (
            <div className="lib-upload__file">
              <span className="lib-upload__fmt" aria-hidden="true">
                {ext ?? 'FILE'}
              </span>
              <span className="lib-upload__file-text">
                <span className="lib-upload__file-name">{file.name}</span>
                <span className="lib-upload__file-meta">{formatSize(file.size)}</span>
              </span>
              {busy ? null : <IconButton label="Remove file" icon={X} size="sm" onClick={() => { setFile(null); setUploadId(null); }} />}
            </div>
          ) : (
            <div
              className={cx('lib-upload__drop', dragging && 'is-dragging', fileError && 'has-error')}
              data-hub="upload-dropzone"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                setDragging(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
              }}
              onDrop={onDrop}
            >
              <CloudArrowUp className="lib-upload__icon" weight="duotone" aria-hidden="true" />
              <p className="lib-upload__lead">Drag a file here</p>
              <p className="lib-upload__or">or</p>
              <Button size="sm" leadingIcon={FileText} onClick={() => inputRef.current?.click()} data-autofocus>
                Choose a file
              </Button>
              <p className="lib-upload__hint">{UPLOAD_LIMITS}</p>
              <input
                ref={inputRef}
                type="file"
                accept={UPLOAD_ACCEPT}
                className="visually-hidden"
                tabIndex={-1}
                aria-label="Choose a file to upload"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          )}
          {fileError ? (
            <p className="lib-upload__error" role="alert">
              {fileError}
            </p>
          ) : null}
          {error ? (
            <p ref={errorRef} className="lib-upload__error lib-upload__error--form" role="alert">
              {error}
            </p>
          ) : null}

          {busy ? (
            <div className="lib-upload__progress">
              {/* Screen readers hear each step once; the bar carries the percentage. */}
              <span className="visually-hidden" role="status">
                {phase === 'sending' ? 'Uploading the file' : phase === 'checking' ? 'Checking the file' : 'Adding it to the library'}
              </span>
              <div
                className="lib-upload__bar"
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase === 'sending' ? pct : 100}
              >
                <span style={{ width: `${phase === 'sending' ? pct : 100}%` }} />
              </div>
              <p className="lib-upload__progress-text" aria-hidden="true">
                {phase === 'sending'
                  ? `Uploading… ${pct}% (${formatSize(progress.loaded)} of ${formatSize(progress.total)})`
                  : phase === 'checking'
                    ? 'Checking the file…'
                    : 'Adding it to the library…'}
              </p>
            </div>
          ) : null}

          <ItemFields values={values} errors={errors} onChange={change} disabled={busy} />

          <p className="lib-upload__rights">
            <Info aria-hidden="true" weight="bold" />
            <span>
              Only share what you’re allowed to share: your own work, or material the course lets students pass on. Leave out anyone’s
              personal details.
            </span>
          </p>

        </form>
      )}
    </Modal>
  );
}
