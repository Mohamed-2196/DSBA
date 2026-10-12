// The issue's own details in the editor: title, number, date, address, standfirst, summary and editors.
import { LIMITS, editorNames, type FieldErrors, type IssueDraft } from '../lib/draft';
import { TextBox, TextInput } from './fields';

type Details = Pick<IssueDraft, 'title' | 'number' | 'date' | 'slug' | 'dek' | 'summary' | 'editors'>;

export interface DetailsEditorProps {
  draft: IssueDraft;
  errors: FieldErrors;
  /** the issue is out: its address is in links people have shared */
  published: boolean;
  onChange: (patch: Partial<Details>) => void;
}

export function DetailsEditor({ draft, errors, published, onChange }: DetailsEditorProps) {
  const names = editorNames(draft.editors).length;
  return (
    <div className="nl-ed-grid">
      <TextInput path="title" errors={errors} label="Title" required max={LIMITS.title} value={draft.title} onValue={(title) => onChange({ title })} className="nl-ed-wide" />
      <TextInput path="number" errors={errors} label="Issue number" required inputMode="numeric" value={draft.number} onValue={(number) => onChange({ number })} />
      <TextInput path="date" errors={errors} label="Date" type="date" required hint="The day it comes out." value={draft.date} onValue={(date) => onChange({ date })} />
      <TextInput
        path="slug"
        errors={errors}
        label="Address"
        required
        max={LIMITS.slug}
        autoComplete="off"
        hint={published ? 'Changing it breaks links people have shared.' : `/newsletter/${draft.slug.trim() || '…'}`}
        value={draft.slug}
        onValue={(slug) => onChange({ slug: slug.toLowerCase() })}
        className="nl-ed-wide"
      />
      <TextBox path="dek" errors={errors} label="Standfirst" rows={2} max={LIMITS.standfirst} hint="One sentence under the title." value={draft.dek} onValue={(dek) => onChange({ dek })} className="nl-ed-wide" />
      <TextBox
        path="summary"
        errors={errors}
        label="Summary"
        rows={3}
        max={LIMITS.standfirst}
        hint="Shown on the newsletter page and on Home."
        value={draft.summary}
        onValue={(summary) => onChange({ summary })}
        className="nl-ed-wide"
      />
      <TextInput
        path="editors"
        errors={errors}
        label="Editors"
        hint={`Names, separated by commas: ${names} of ${LIMITS.editors}.`}
        autoComplete="off"
        value={draft.editors}
        onValue={(editors) => onChange({ editors })}
        className="nl-ed-wide"
      />
    </div>
  );
}
