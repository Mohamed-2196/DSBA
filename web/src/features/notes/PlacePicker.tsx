// What a note is about: no module, a module, or one of its lessons (a lesson comes from the lesson page's "Your
// notes"; here it can be opened or let go).
import { PlayCircle, X } from '@phosphor-icons/react';
import { moduleLabel } from '../../lib/modules';
import { useModules } from '../../state/modules';
import { Button, IconButton, Select } from '../../ui';
import { lessonHref } from '../modules/public';
import { lessonLabel, type NoteDoc } from './draft';
import { useLessonPlace } from './lessonPlace';

export function PlacePicker({ doc, disabled, onChange }: { doc: NoteDoc; disabled: boolean; onChange: (patch: Partial<NoteDoc>) => void }) {
  const { modules } = useModules();
  const place = useLessonPlace(doc.moduleId, doc.lessonId);
  return (
    <div className="notes-place">
      <Select
        label="Module"
        className="notes-place__module"
        value={doc.moduleId ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ moduleId: e.target.value || null, lessonId: null })}
        options={[{ value: '', label: 'No module' }, ...modules.map((m) => ({ value: m.id, label: moduleLabel(m) }))]}
        data-hub="note-module"
      />
      {doc.lessonId && doc.moduleId ? (
        <p className="notes-place__lesson">
          <PlayCircle aria-hidden="true" />
          <span>{lessonLabel(place)}</span>
          <Button variant="ghost" size="sm" to={lessonHref(doc.moduleId, doc.lessonId)}>
            Open the lesson
          </Button>
          {disabled ? null : <IconButton size="sm" icon={X} label="Not about this lesson" tooltip onClick={() => onChange({ lessonId: null })} />}
        </p>
      ) : null}
    </div>
  );
}
