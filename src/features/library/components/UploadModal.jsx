import { useId, useRef, useState } from 'react';
import { CloudArrowUp, FileText, X } from '@phosphor-icons/react';
import { Button, IconButton, Modal, Select, TextField, cx } from '../../../ui';
import { useToast } from '../../../state';
import { getModule, getModulesForYear, moduleLabel } from '../../../data/modules.js';
import { FORMATS, KINDS, UPLOAD_ACCEPT, formatFromName, formatSize } from '../data/kinds.js';
import './UploadModal.css';

const MAX_MB = 50;
const titleFromName = (name) => name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Mock upload: drag and drop (or choose) a file, pick its module and type, send it for review.
 * Nothing is uploaded; the toast confirms what would happen. Give it a new `key` each time it opens
 * so it starts empty.
 */
export function UploadModal({ open, onClose, defaultModule, defaultYear }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const uid = useId().replace(/:/g, '');
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [moduleId, setModuleId] = useState(() => defaultModule || getModulesForYear(defaultYear || null)[0]?.id || '');
  const [kind, setKind] = useState('notes');
  const [title, setTitle] = useState('');

  const accept = (f) => {
    if (!f) return;
    const format = formatFromName(f.name);
    if (!format) {
      setError('Upload a PDF, Word, Excel, PowerPoint, notebook or R file.');
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is larger than ${MAX_MB} MB. Compress it or split it into parts.`);
      return;
    }
    setError(null);
    setFile({ name: f.name, sizeKB: f.size / 1024, format });
    setTitle((t) => t || titleFromName(f.name));
  };

  const submit = (e) => {
    e?.preventDefault();
    if (!file) {
      setError('Choose a file to upload.');
      return;
    }
    const m = getModule(moduleId);
    const name = title.trim() || titleFromName(file.name);
    onClose?.();
    toast.push({
      title: 'Upload sent for review',
      body: `${name} will appear in ${m ? (m.unitCode || m.name) : 'the library'} once a moderator approves it.`,
      tone: 'success',
    });
  };

  const years = [1, 2, 3];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload a file"
      description="Share notes, past papers or guides with your year. A moderator checks every upload before it appears."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={`upload-${uid}`} data-pulse="upload-submit">Send for review</Button>
        </>
      }
    >
      <form id={`upload-${uid}`} className="lib-upload" onSubmit={submit} noValidate>
        {file ? (
          <div className="lib-upload__file">
            <span className="lib-upload__fmt" aria-hidden="true">{FORMATS[file.format].ext.toUpperCase()}</span>
            <span className="lib-upload__file-text">
              <span className="lib-upload__file-name">{file.name}</span>
              <span className="lib-upload__file-meta">{FORMATS[file.format].name}, {formatSize(file.sizeKB)}</span>
            </span>
            <IconButton label="Remove file" icon={X} size="sm" onClick={() => setFile(null)} />
          </div>
        ) : (
          <div
            className={cx('lib-upload__drop', dragging && 'is-dragging', error && !file && 'has-error')}
            data-pulse="upload-dropzone"
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
              if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              accept(e.dataTransfer.files?.[0]);
            }}
          >
            <CloudArrowUp className="lib-upload__icon" weight="duotone" aria-hidden="true" />
            <p className="lib-upload__lead">Drag a file here</p>
            <p className="lib-upload__or">or</p>
            <Button size="sm" leadingIcon={FileText} onClick={() => inputRef.current?.click()} data-autofocus>
              Choose a file
            </Button>
            <p className="lib-upload__hint">PDF, Word, Excel, PowerPoint, Jupyter notebooks and R scripts, up to {MAX_MB} MB</p>
            <input
              ref={inputRef}
              type="file"
              accept={UPLOAD_ACCEPT}
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Choose a file to upload"
              onChange={(e) => {
                accept(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        )}
        {error ? <p className="lib-upload__error" role="alert">{error}</p> : null}

        <div className="lib-upload__fields">
          <Select label="Module" value={moduleId} onChange={(e) => setModuleId(e.target.value)} required>
            {years.map((y) => (
              <optgroup key={y} label={`Year ${y}`}>
                {getModulesForYear(y).map((m) => (
                  <option key={m.id} value={m.id}>{moduleLabel(m)}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value)} options={KINDS.map((k) => ({ value: k.id, label: k.label }))} required />
        </div>
        <TextField
          label="Title"
          hint="Shown in the library. Include the chapter or year if it helps people find it."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter 4 notes"
        />
      </form>
    </Modal>
  );
}
