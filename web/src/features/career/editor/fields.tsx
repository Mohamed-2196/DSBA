// The Career Navigator editor's own inputs: lists of ids picked from the document, short text lists, "close this gap"
// steps, checklist links, logos and module pickers. Each is a labelled field with its error, like the design
// system's.
import { useId, useRef, useState, type ReactNode } from 'react';
import type { CareerChecklistItem, CareerLogo } from '../../../api/types';
import {
  progressText,
  uploadErrorMessage,
  uploadFile,
  UPLOAD_RULES,
  checkUpload,
  type UploadProgress,
} from '../../../api/uploads';
import { Button, Field, glyph, Icon, IconButton, Select, TextArea, TextField } from '../../../ui';
import type { SelectOption } from '../../../ui/Field';
import type { CloseStep } from '../lib/links';
import type { LogoKind } from '../lib/logos';
import { LogoSlot } from '../LogoSlot';
import { useModuleOptions } from './hooks';
import { useEditor } from './state';

interface PickListProps {
  label: string;
  hint?: ReactNode;
  value: readonly string[];
  options: SelectOption[];
  onChange: (next: string[]) => void;
  error?: string;
  /** the select's first line: 'Add a track' */
  addLabel: string;
  max?: number;
}

/** Ids picked from a list, in order (the first matters most): chips to remove, a select to add one. */
export function PickList({ label, hint, value, options, onChange, error, addLabel, max = 30 }: PickListProps) {
  const labelOf = new Map(options.map((o) => [String(o.value), o.label]));
  const left = options.filter((o) => !value.includes(String(o.value)));
  return (
    <Field label={label} hint={hint} error={error}>
      {(fid, describedBy) => (
        <div className="cedit-pick">
          {value.length ? (
            <ol role="list" className="cedit-pick__chips" aria-label={label}>
              {value.map((id) => (
                <li key={id} className="cedit-chip">
                  <span className="cedit-chip__text">{labelOf.get(id) ?? id}</span>
                  <IconButton
                    size="sm"
                    icon={<Icon glyph={glyph.close} />}
                    label={`Remove ${typeof labelOf.get(id) === 'string' ? String(labelOf.get(id)) : id}`}
                    onClick={() => onChange(value.filter((x) => x !== id))}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {value.length < max && left.length ? (
            <select
              id={fid}
              aria-describedby={describedBy}
              className="cedit-pick__add ui-control__input"
              value=""
              onChange={(e) => {
                if (e.target.value) onChange([...value, e.target.value]);
              }}
            >
              <option value="">{addLabel}</option>
              {left.map((o) => (
                <option key={String(o.value)} value={String(o.value)}>
                  {typeof o.label === 'string' ? o.label : String(o.value)}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}
    </Field>
  );
}

/** Short words in order (a role's tools): chips to remove, a field to add one. */
export function WordList({
  label,
  hint,
  value,
  onChange,
  error,
  max = 20,
}: {
  label: string;
  hint?: ReactNode;
  value: readonly string[];
  onChange: (next: string[]) => void;
  error?: string;
  max?: number;
}) {
  const [text, setText] = useState('');
  const add = () => {
    const word = text.trim();
    if (word && !value.includes(word)) onChange([...value, word]);
    setText('');
  };
  return (
    <Field label={label} hint={hint} error={error}>
      {(fid, describedBy) => (
        <div className="cedit-pick">
          {value.length ? (
            <ol role="list" className="cedit-pick__chips" aria-label={label}>
              {value.map((w) => (
                <li key={w} className="cedit-chip">
                  <span className="cedit-chip__text">{w}</span>
                  <IconButton
                    size="sm"
                    icon={<Icon glyph={glyph.close} />}
                    label={`Remove ${w}`}
                    onClick={() => onChange(value.filter((x) => x !== w))}
                  />
                </li>
              ))}
            </ol>
          ) : null}
          {value.length < max ? (
            <div className="cedit-pick__row">
              <input
                id={fid}
                aria-describedby={describedBy}
                className="ui-control__input cedit-pick__add"
                value={text}
                maxLength={60}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<Icon glyph={glyph.plus} />}
                onClick={add}
                disabled={!text.trim()}
              >
                Add
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </Field>
  );
}

type StepKind = CloseStep['kind'];
const STEP_KINDS: { value: StepKind; label: string }[] = [
  { value: 'lesson', label: 'A lesson in a module' },
  { value: 'file', label: 'A file in the library' },
  { value: 'cert', label: 'A certificate on this page' },
  { value: 'forum', label: 'A page of the hub (the forum)' },
  { value: 'opps', label: 'The opportunities at the top' },
];

/** A blank step of a kind, keeping what can carry over (the text, the module). */
function stepOf(kind: StepKind, prev: CloseStep | null, firstCert: string, firstModule: string): CloseStep {
  const text = prev?.text ?? '';
  const module = prev && 'module' in prev ? prev.module : firstModule;
  switch (kind) {
    case 'lesson':
      return { kind, module, chapter: '', text };
    case 'file':
      return { kind, module, file: '', text };
    case 'cert':
      return { kind, cert: firstCert, text };
    case 'forum':
      return { kind, to: '/forum/new?title=', text };
    case 'opps':
      return { kind, text };
  }
}

/** What to do about a skill DSBA doesn't teach far enough: none, or one step. `path` is where its errors are. */
export function StepField({
  legend,
  value,
  onChange,
  path,
  noneLabel = 'No step',
}: {
  legend: string;
  value: CloseStep | null;
  onChange: (next: CloseStep | null) => void;
  path: string;
  noneLabel?: string;
}) {
  const { doc, err } = useEditor();
  const modules = useModuleOptions();
  const certs = doc.certs.map((c) => ({ value: c.id, label: c.short || c.name }));
  const firstModule = String(modules[0]?.value ?? '');
  return (
    <fieldset className="cedit-group">
      <legend className="cedit-group__legend">{legend}</legend>
      <Select
        label="Kind"
        value={value?.kind ?? ''}
        onChange={(e) =>
          onChange(
            e.target.value ? stepOf(e.target.value as StepKind, value, certs[0]?.value ?? '', firstModule) : null,
          )
        }
        options={[{ value: '', label: noneLabel }, ...STEP_KINDS]}
      />
      {value ? (
        <div className="cedit-grid">
          {value.kind === 'lesson' || value.kind === 'file' ? (
            <Select
              label="Module"
              value={value.module}
              onChange={(e) => onChange({ ...value, module: e.target.value })}
              options={modules}
              error={err(`${path}.module`)}
            />
          ) : null}
          {value.kind === 'lesson' ? (
            <TextField
              label="Chapter"
              hint="The start of the chapter’s title. The link opens its first lesson."
              value={value.chapter}
              onChange={(e) => onChange({ ...value, chapter: e.target.value })}
              error={err(`${path}.chapter`)}
              maxLength={160}
              required
            />
          ) : null}
          {value.kind === 'file' ? (
            <TextField
              label="Library file"
              hint="The file’s address in the library (the end of its link)."
              value={value.file}
              onChange={(e) => onChange({ ...value, file: e.target.value })}
              error={err(`${path}.file`)}
              maxLength={160}
              required
            />
          ) : null}
          {value.kind === 'cert' ? (
            <Select
              label="Certificate"
              value={value.cert}
              onChange={(e) => onChange({ ...value, cert: e.target.value })}
              options={certs}
              error={err(`${path}.cert`)}
            />
          ) : null}
          {value.kind === 'forum' ? (
            <TextField
              label="Page of the hub"
              hint="Starts with /, like /forum/new?title=How do I start with SQL"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              error={err(`${path}.to`)}
              maxLength={500}
              required
            />
          ) : null}
          <TextArea
            label="What it says"
            rows={2}
            value={value.text}
            onChange={(e) => onChange({ ...value, text: e.target.value })}
            error={err(`${path}.text`)}
            maxLength={600}
            required
            className="cedit-grid__wide"
          />
        </div>
      ) : null}
    </fieldset>
  );
}

type Link = NonNullable<CareerChecklistItem['link']>;

/** A checklist item's link: none, a lesson, a certificate on the page or a page of the hub. */
export function ChecklistLinkField({
  value,
  onChange,
  path,
}: {
  value: Link | null;
  onChange: (next: Link | null) => void;
  path: string;
}) {
  const { doc, err } = useEditor();
  const modules = useModuleOptions();
  const label = value?.label ?? '';
  const pick = (kind: string) => {
    if (kind === 'lesson') onChange({ kind, module: String(modules[0]?.value ?? ''), chapter: '', label });
    else if (kind === 'cert') onChange({ kind, cert: doc.certs[0]?.id ?? '', label });
    else if (kind === 'forum') onChange({ kind, to: '/forum/new?title=', label });
    else onChange(null);
  };
  return (
    <fieldset className="cedit-group">
      <legend className="cedit-group__legend">Link</legend>
      <Select
        label="Goes to"
        value={value?.kind ?? ''}
        onChange={(e) => pick(e.target.value)}
        options={[
          { value: '', label: 'No link' },
          { value: 'lesson', label: 'A lesson in a module' },
          { value: 'cert', label: 'A certificate on this page' },
          { value: 'forum', label: 'A page of the hub' },
        ]}
      />
      {value ? (
        <div className="cedit-grid">
          {value.kind === 'lesson' ? (
            <>
              <Select
                label="Module"
                value={value.module}
                onChange={(e) => onChange({ ...value, module: e.target.value })}
                options={modules}
                error={err(`${path}.module`)}
              />
              <TextField
                label="Chapter"
                hint="The start of the chapter’s title."
                value={value.chapter}
                onChange={(e) => onChange({ ...value, chapter: e.target.value })}
                error={err(`${path}.chapter`)}
                maxLength={160}
                required
              />
            </>
          ) : null}
          {value.kind === 'cert' ? (
            <Select
              label="Certificate"
              value={value.cert}
              onChange={(e) => onChange({ ...value, cert: e.target.value })}
              options={doc.certs.map((c) => ({ value: c.id, label: c.short || c.name }))}
              error={err(`${path}.cert`)}
            />
          ) : null}
          {value.kind === 'forum' ? (
            <TextField
              label="Page of the hub"
              hint="Starts with /"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              error={err(`${path}.to`)}
              maxLength={500}
              required
            />
          ) : null}
          <TextField
            label="Link text"
            value={value.label}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            error={err(`${path}.label`)}
            maxLength={60}
            required
          />
        </div>
      ) : null}
    </fieldset>
  );
}

/**
 * An employer's or a certificate's logo: the organisation's own file, uploaded here, with who gave permission. Until
 * one is uploaded the page shows the bundled file if there is one, else the initials.
 */
export function LogoField({
  kind,
  id,
  mono,
  logo,
  onChange,
  path,
}: {
  kind: LogoKind;
  id: string;
  mono: string;
  logo: CareerLogo | null | undefined;
  onChange: (next: CareerLogo | null) => void;
  path: string;
}) {
  const { err } = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const hintId = useId();
  const rules = UPLOAD_RULES.career_logo;

  const send = async (file: File) => {
    setProblem(null);
    const refused = checkUpload('career_logo', file);
    if (refused) {
      setProblem(refused);
      return;
    }
    try {
      const up = await uploadFile('career_logo', file, { onProgress: setProgress });
      onChange({ uploadId: up.uploadId, permission: logo?.permission ?? '' });
    } catch (e) {
      setProblem(uploadErrorMessage(e, 'career_logo'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <fieldset className="cedit-group cedit-logo">
      <legend className="cedit-group__legend">Logo</legend>
      <div className="cedit-logo__row">
        <LogoSlot kind={kind} id={id} logo={logo} mono={mono} key={logo?.uploadId ?? 'bundled'} />
        <div className="cedit-logo__text">
          <p className="cedit-logo__state">
            {logo
              ? 'Uploaded logo.'
              : 'No uploaded logo: the page shows the bundled file if there is one, else the initials.'}
          </p>
          <p id={hintId} className="cedit__note">
            Only the organisation’s own logo file, used with its permission. Never draw, trace or recolour one.{' '}
            {rules.summary}
          </p>
          <div className="cedit-logo__actions">
            <input
              ref={input}
              type="file"
              accept={rules.accept}
              className="visually-hidden"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void send(file);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Icon glyph={glyph.upload} />}
              onClick={() => input.current?.click()}
              loading={progress !== null}
              aria-describedby={hintId}
            >
              {logo ? 'Upload another' : 'Upload the logo'}
            </Button>
            {logo ? (
              <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
                Remove the uploaded logo
              </Button>
            ) : null}
          </div>
          {progress ? (
            <p className="cedit__note" aria-live="polite">
              {progressText(progress)}
            </p>
          ) : null}
          {problem ? (
            <p className="cedit__error" role="alert">
              {problem}
            </p>
          ) : null}
        </div>
      </div>
      {logo ? (
        <TextField
          label="Permission"
          hint="Who agreed to the hub showing this logo, and when. No email addresses or phone numbers."
          value={logo.permission}
          onChange={(e) => onChange({ ...logo, permission: e.target.value })}
          error={err(`${path}.permission`)}
          maxLength={600}
          required
        />
      ) : null}
    </fieldset>
  );
}
