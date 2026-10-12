// What sits beside a section's text in the editor: nothing, one of the app's pictures (with its description and
// caption), a typographic card, or a few numbers. One at a time, as the reader shows it.
import { useId } from 'react';
import { Plus, TextAa } from '@phosphor-icons/react';
import { Button, SegmentedControl, Switch, cx } from '../../../ui';
import { LIMITS, blankStat, controlId, fieldPath, moveByKey, removeByKey, updateByKey, type Beside, type FieldErrors, type SectionDraft } from '../lib/draft';
import { safeImageSrc } from '../lib/links';
import { ItemTools, MARKUP_HINT, TextBox, TextInput } from './fields';
import { pictureChoices, type AppPicture } from './pictures';

const BESIDE: { value: Beside; label: string }[] = [
  { value: 'none', label: 'Nothing' },
  { value: 'figure', label: 'Picture' },
  { value: 'card', label: 'Card' },
  { value: 'stats', label: 'Numbers' },
];

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
          const src = safeImageSrc(p.src);
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
          <p className="nl-ed-note">For now an issue uses the Hub’s own pictures. Pictures uploaded in the forum can’t be shown here.</p>
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
