// What sits beside a section's text in the editor: nothing, one of the app's pictures (with its description and
// caption), a typographic card, or a few numbers. One at a time, as the reader shows it.
import { useId, useRef, useState } from 'react';
import { Plus, TextAa, UploadSimple } from '@phosphor-icons/react';
import { Button, SegmentedControl, Switch, cx } from '../../../ui';
import { UPLOAD_RULES, checkUpload, progressText, uploadErrorMessage, uploadFile, type UploadProgress } from '../../../api/uploads';
import { LIMITS, blankStat, controlId, fieldPath, moveByKey, removeByKey, updateByKey, type Beside, type FieldErrors, type SectionDraft } from '../lib/draft';
import { pictureSrc } from '../../../api/pictures';
import { ItemTools, MARKUP_HINT, TextBox, TextInput } from './fields';
import { pictureChoices, type AppPicture } from './pictures';

const BESIDE: { value: Beside; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'figure', label: 'Picture' },
  { value: 'card', label: 'Card' },
  { value: 'stats', label: 'Numbers' },
];

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      URL.revokeObjectURL(url);
      resolve({ width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1200, height: 900 });
    };
    img.src = url;
  });
}

export interface PicturePickerProps {
  /** the radio group's name, unique on the page */
  name: string;
  label: string;
  choices: AppPicture[];
  value: string | null;
  onChoose: (picture: AppPicture | null) => void;
  /** offer "no picture" first, with this label */
  none?: string;
  /** the id of the first option, so a failed save can focus the group */
  id?: string;
  error?: string;
}

/** Pictures as radio cards with a thumbnail each (and "none" when the picture is optional). */
export function PicturePicker({ name, label, choices, value, onChoose, none, id, error }: PicturePickerProps) {
  const errorId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = checkUpload('newsletter_image', file);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploadError(null);
    setUploading(true);
    setProgress(null);
    try {
      const [dims, out] = await Promise.all([
        readImageDimensions(file),
        uploadFile('newsletter_image', file, { onProgress: setProgress }),
      ]);
      const src = out.mediaUrl ?? `/api/v1/media/${out.uploadId}`;
      onChoose({ src, label: file.name, width: dims.width, height: dims.height });
    } catch (err) {
      setUploadError(uploadErrorMessage(err, 'newsletter_image'));
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <fieldset className={cx('nl-ed-pictures', error && 'has-error')} aria-describedby={error ? errorId : undefined}>
      <legend className="ui-field__label">{label}</legend>
      <div className="nl-ed-pictures__grid">
        {none !== undefined ? (
          <label className="nl-ed-picture nl-ed-picture--none">
            <input type="radio" name={name} className="nl-ed-picture__input" checked={!value} onChange={() => onChoose(null)} id={id} aria-invalid={error ? true : undefined} />
            <span className="nl-ed-picture__thumb" aria-hidden="true">
              <TextAa weight="duotone" />
            </span>
            <span className="nl-ed-picture__label">{none}</span>
          </label>
        ) : null}
        {choices.map((p, i) => {
          const src = pictureSrc(p.src);
          return (
            <label key={p.src} className="nl-ed-picture">
              <input
                type="radio"
                name={name}
                className="nl-ed-picture__input"
                checked={value === p.src}
                onChange={() => onChoose(p)}
                id={none === undefined && i === 0 ? id : undefined}
                aria-invalid={error ? true : undefined}
              />
              <span className="nl-ed-picture__thumb">{src ? <img src={src} alt="" width={p.width} height={p.height} loading="lazy" decoding="async" /> : null}</span>
              <span className="nl-ed-picture__label">{p.label}</span>
            </label>
          );
        })}
      </div>
      <div className="nl-ed-pictures__action">
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_RULES.newsletter_image.accept}
          style={{ display: 'none' }}
          onChange={(e) => void pickFile(e.target.files?.[0])}
          disabled={uploading}
        />
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={UploadSimple}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (progress ? progressText(progress) : 'Uploading…') : 'Upload picture'}
        </Button>
        {uploadError ? (
          <p className="nl-ed-error" tabIndex={-1}>
            {uploadError}
          </p>
        ) : null}
      </div>
      {error ? (
        <p id={errorId} className="nl-ed-error" tabIndex={-1}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export interface BesideEditorProps {
  section: SectionDraft;
  errors: FieldErrors;
  onChange: (fn: (s: SectionDraft) => SectionDraft) => void;
}

export function BesideEditor({ section: s, errors, onChange }: BesideEditorProps) {
  const path = (field: string) => fieldPath.section(s.key, field);
  const setFigure = (patch: Partial<SectionDraft['figure']>) => onChange((x) => ({ ...x, figure: { ...x.figure, ...patch } }));
  const setCard = (patch: Partial<SectionDraft['card']>) => onChange((x) => ({ ...x, card: { ...x.card, ...patch } }));
  const setStats = (patch: Partial<SectionDraft['stats']>) => onChange((x) => ({ ...x, stats: { ...x.stats, ...patch } }));
  const setItems = (fn: (items: SectionDraft['stats']['items']) => SectionDraft['stats']['items']) => onChange((x) => ({ ...x, stats: { ...x.stats, items: fn(x.stats.items) } }));
  const itemsError = errors[path('stats.items')];

  return (
    <div className="nl-ed-beside">
      <SegmentedControl
        label="Beside the text"
        size="sm"
        className="nl-ed-beside__choice"
        options={BESIDE}
        value={s.beside}
        onChange={(beside) => onChange((x) => ({ ...x, beside }))}
      />

      {s.beside === 'figure' ? (
        <div className="nl-ed-stack">
          <PicturePicker
            name={`figure-${s.key}`}
            label="Picture"
            choices={pictureChoices(s.figure)}
            value={s.figure.src || null}
            onChoose={(p) => setFigure(p ? { src: p.src, width: p.width, height: p.height } : { src: '', width: 0, height: 0 })}
            id={controlId(path('figure.src'))}
            error={errors[path('figure.src')]}
          />
          <p className="nl-ed-note">{UPLOAD_RULES.newsletter_image.summary}</p>
          <TextBox
            path={path('figure.alt')}
            errors={errors}
            label="Description"
            rows={2}
            max={LIMITS.alt}
            hint={s.figure.alt.trim() ? 'Read out to people who can’t see the picture.' : 'Describe the picture for people who can’t see it: what it shows, and any words on it.'}
            value={s.figure.alt}
            onValue={(alt) => setFigure({ alt })}
          />
          <TextInput path={path('figure.caption')} errors={errors} label="Caption" max={LIMITS.short} hint="A line under the picture (optional)." value={s.figure.caption} onValue={(caption) => setFigure({ caption })} />
        </div>
      ) : null}

      {s.beside === 'card' ? (
        <div className="nl-ed-stack">
          <TextInput path={path('card.kicker')} errors={errors} label="Line above" max={LIMITS.label} placeholder="Student Council 2026/27" value={s.card.kicker} onValue={(kicker) => setCard({ kicker })} />
          <TextInput path={path('card.title')} errors={errors} label="Big words" max={LIMITS.line} hint="Set very large, on a highlight." placeholder="Vote" value={s.card.title} onValue={(title) => setCard({ title })} />
          <TextBox path={path('card.text')} errors={errors} label="Line below" rows={2} max={LIMITS.short} hint={MARKUP_HINT} value={s.card.text} onValue={(text) => setCard({ text })} />
          <Switch checked={s.card.wide} onChange={(wide) => setCard({ wide })} label="Wide" description="Takes a picture’s wider column beside the text." className="nl-ed-switch" />
        </div>
      ) : null}

      {s.beside === 'stats' ? (
        <div className="nl-ed-stack">
          <TextInput path={path('stats.title')} errors={errors} label="Title" max={LIMITS.line} placeholder="DSBA Hub in numbers" value={s.stats.title} onValue={(title) => setStats({ title })} />
          <ol className="nl-ed-stats" aria-label="Numbers">
            {s.stats.items.map((item, i) => (
              <li key={item.key} className="nl-ed-stat">
                <TextInput
                  path={fieldPath.stat(s.key, item.key, 'value')}
                  errors={errors}
                  label="Number"
                  max={LIMITS.statValue}
                  placeholder="16"
                  value={item.value}
                  onValue={(value) => setItems((items) => updateByKey(items, item.key, (x) => ({ ...x, value })))}
                  className="nl-ed-stat__value"
                />
                <TextInput
                  path={fieldPath.stat(s.key, item.key, 'label')}
                  errors={errors}
                  label="What it counts"
                  max={LIMITS.line}
                  placeholder="modules"
                  value={item.label}
                  onValue={(label) => setItems((items) => updateByKey(items, item.key, (x) => ({ ...x, label })))}
                  className="nl-ed-stat__label"
                />
                <ItemTools
                  name={`number ${i + 1}`}
                  first={i === 0}
                  last={i === s.stats.items.length - 1}
                  onMove={(dir) => setItems((items) => moveByKey(items, item.key, dir))}
                  onRemove={() => setItems((items) => removeByKey(items, item.key))}
                  className="nl-ed-stat__tools"
                />
              </li>
            ))}
          </ol>
          {itemsError ? (
            <p className="nl-ed-error" tabIndex={-1}>
              {itemsError}
            </p>
          ) : null}
          <Button size="sm" variant="ghost" leadingIcon={Plus} disabled={s.stats.items.length >= LIMITS.stats} onClick={() => setItems((items) => [...items, blankStat()])} className="nl-ed-start">
            Add a number
          </Button>
          <TextInput path={path('stats.foot')} errors={errors} label="Note under the numbers" max={LIMITS.short} hint="Optional." value={s.stats.foot} onValue={(foot) => setStats({ foot })} />
          <Switch checked={s.stats.wide} onChange={(wide) => setStats({ wide })} label="Wide" description="Takes a picture’s wider column, with the numbers two by two." className="nl-ed-switch" />
        </div>
      ) : null}
    </div>
  );
}
