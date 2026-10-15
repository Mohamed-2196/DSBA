// What notebook a note belongs to (a module's notebook or one of the student's own), and any lesson it is about.
import { PlayCircle, X } from '@phosphor-icons/react';
import { Button, IconButton, Select } from '../../ui';
import { lessonHref } from '../modules/public';
import { useNotebooks } from './api';
import { lessonLabel, type NoteDoc } from './draft';
import { useLessonPlace } from './lessonPlace';

export function PlacePicker({ doc, disabled, onChange }: { doc: NoteDoc; disabled: boolean; onChange: (patch: Partial<NoteDoc>) => void }) {
  const notebooks = useNotebooks();
  const currentBook = notebooks.data?.items.find((b) => b.id === doc.notebookId);
  const place = useLessonPlace(currentBook?.moduleId ?? null, doc.lessonId);
  const options = (notebooks.data?.items ?? []).map((b) => ({ value: b.id, label: b.title }));

  return (
    <div className="notes-place">
      <Select
        label="Notebook"
        className="notes-place__module"
        value={doc.notebookId}
        disabled={disabled}
        onChange={(e) => onChange({ notebookId: e.target.value, lessonId: null })}
        options={options.length ? options : [{ value: doc.notebookId, label: 'Notebook' }]}
        data-hub="note-notebook"
      />
      {doc.lessonId && currentBook?.moduleId ? (
        <p className="notes-place__lesson">
          <PlayCircle aria-hidden="true" />
          <span>{lessonLabel(place)}</span>
          <Button variant="ghost" size="sm" to={lessonHref(currentBook.moduleId, doc.lessonId)}>
            Open the lesson
          </Button>
          {disabled ? null : <IconButton size="sm" icon={X} label="Not about this lesson" tooltip onClick={() => onChange({ lessonId: null })} />}
        </p>
      ) : null}
    </div>
  );
}
