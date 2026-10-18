// The cover in the issue editor: its colour, an illustration or type alone, and the cover lines that point to the
// stories, beside a live thumbnail of the cover.
import { Plus } from '@phosphor-icons/react';
import { Button, SegmentedControl, Select } from '../../../ui';
import { IssueCover } from '../components/IssueCover';
import {
  LIMITS,
  blankCoverLine,
  controlId,
  fieldPath,
  moveByKey,
  previewOf,
  removeByKey,
  updateByKey,
  type FieldErrors,
  type IssueDraft,
} from '../lib/draft';
import { plainText, sectionLabel } from '../lib/text';
import { ItemTools, TextBox, TextInput } from './fields';
import { PicturePicker } from './BesideEditor';
import { useOfferedPictures } from '../api';
import { pictureChoices } from './pictures';

type Cover = IssueDraft['cover'];

const TONES: { value: Cover['tone']; label: string }[] = [
  { value: 'navy', label: 'Navy' },
  { value: 'paper', label: 'Paper' },
];

export interface CoverEditorProps {
  draft: IssueDraft;
  errors: FieldErrors;
  onChange: (fn: (cover: Cover) => Cover) => void;
  onFocus: (path: string) => void;
}

export function CoverEditor({ draft, errors, onChange, onFocus }: CoverEditorProps) {
  const { cover } = draft;
  const offered = useOfferedPictures().data ?? [];
  const lines = cover.lines;
  const preview = previewOf(draft);
  const stories = draft.sections.map((s) => ({
    value: s.id,
    label: plainText(sectionLabel({ label: s.label, title: s.title || 'Untitled section' })),
  }));
  const shown = cover.art ? LIMITS.coverLinesWithArt : LIMITS.coverLines;
  const setLines = (fn: (l: Cover['lines']) => Cover['lines']) => onChange((c) => ({ ...c, lines: fn(c.lines) }));
  const add = () => {
    const line = blankCoverLine(draft);
    setLines((l) => [...l, line]);
    onFocus(fieldPath.line(line.key, 'text'));
  };
  const linesError = errors['cover.lines'];

  return (
    <div className="nl-ed-cover">
      <div className="nl-ed-cover__top">
        <div className="nl-ed-cover__thumb" aria-hidden="true">
          <IssueCover
            issue={{
              number: Number(draft.number) || 0,
              title: draft.title || 'Untitled',
              date: /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : '',
              cover: preview.cover,
              sections: preview.sections,
            }}
            decorative
          />
        </div>
        <div className="nl-ed-cover__fields">
          <SegmentedControl
            label="Colour"
            size="sm"
            options={TONES}
            value={cover.tone}
            onChange={(tone) => onChange((c) => ({ ...c, tone }))}
          />
          <PicturePicker
            name="cover-art"
            label="Illustration"
            choices={pictureChoices(offered, cover.art ? { src: cover.art, width: 3, height: 4 } : null, {
              cover: true,
            })}
            value={cover.art}
            onChoose={(p) => onChange((c) => ({ ...c, art: p ? p.src : null }))}
            none="Type only"
            error={errors['cover.art']}
          />
          {cover.art ? (
            <TextBox
              path="cover.artAlt"
              errors={errors}
              label="Description"
              rows={2}
              max={LIMITS.artAlt}
              hint={
                cover.artAlt?.trim()
                  ? 'Read out to people who can’t see the illustration.'
                  : 'Describe the illustration for people who can’t see it: what it shows, and any words on it.'
              }
              value={cover.artAlt}
              onValue={(artAlt) => onChange((c) => ({ ...c, artAlt }))}
            />
          ) : null}
        </div>
      </div>

      <div className="nl-ed-lines">
        <p className="ui-field__label">Cover lines</p>
        <p className="nl-ed-note">
          Each line points to a story; the story’s label is printed beside it. A cover shows {shown} lines
          {cover.art ? ' over an illustration' : ''}.
          {lines.length ? '' : ' With none, it lists the first five stories by name.'}
        </p>
        {lines.length ? (
          <ol className="nl-ed-lines__list" aria-label="Cover lines">
            {lines.map((line, i) => (
              <li key={line.key} className={i >= shown ? 'nl-ed-line is-hidden' : 'nl-ed-line'}>
                <Select
                  id={controlId(fieldPath.line(line.key, 'section'))}
                  label="Story"
                  value={line.section}
                  onChange={(e) => {
                    const section = e.target.value;
                    setLines((l) => updateByKey(l, line.key, (x) => ({ ...x, section })));
                  }}
                  options={
                    stories.some((s) => s.value === line.section)
                      ? stories
                      : [{ value: line.section, label: 'Choose a story' }, ...stories]
                  }
                  error={errors[fieldPath.line(line.key, 'section')]}
                  className="nl-ed-line__story"
                />
                <TextInput
                  path={fieldPath.line(line.key, 'text')}
                  errors={errors}
                  label="Line"
                  max={LIMITS.coverText}
                  hint={i >= shown ? 'Not shown: too many lines for this cover.' : undefined}
                  value={line.text}
                  onValue={(text) => setLines((l) => updateByKey(l, line.key, (x) => ({ ...x, text })))}
                  className="nl-ed-line__text"
                />
                <ItemTools
                  name={`cover line ${i + 1}`}
                  first={i === 0}
                  last={i === lines.length - 1}
                  onMove={(dir) => setLines((l) => moveByKey(l, line.key, dir))}
                  onRemove={() => setLines((l) => removeByKey(l, line.key))}
                  className="nl-ed-line__tools"
                />
              </li>
            ))}
          </ol>
        ) : null}
        {linesError ? (
          <p className="nl-ed-error" tabIndex={-1}>
            {linesError}
          </p>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          leadingIcon={Plus}
          onClick={add}
          disabled={lines.length >= LIMITS.coverLines || !draft.sections.length}
          className="nl-ed-start"
        >
          Add a cover line
        </Button>
      </div>
    </div>
  );
}
