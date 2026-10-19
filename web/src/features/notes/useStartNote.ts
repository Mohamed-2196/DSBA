// Starting a note: made on the server when the student presses (in a notebook, or a module's, about a lesson or not),
// then opened to write in. A note that couldn't be started says why where they pressed.
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useToast } from '../../state';
import { useCreateNote } from './api';
import { EMPTY_DOC } from './draft';

/** Where a new note goes and what it is about: a notebook (or else the module's notebook, or else the student's own),
 *  and a module and one of its lessons. */
export interface NotePlace {
  notebookId?: string | null;
  moduleId?: string;
  lessonId?: string;
}

export function useStartNote() {
  const create = useCreateNote();
  const navigate = useNavigate();
  const { push } = useToast();
  const start = (place: NotePlace = {}) => {
    if (create.isPending) return;
    create.mutate(
      {
        title: '',
        doc: EMPTY_DOC,
        paper: 'lined',
        sheets: 1,
        notebookId: place.notebookId ?? null,
        moduleId: place.moduleId ?? null,
        lessonId: place.lessonId ?? null,
      },
      {
        onSuccess: (note) => navigate(`/notes/${note.id}`, { state: { fresh: true } }),
        onError: (e) => push({ title: 'The note wasn’t started', body: errorMessage(e), tone: 'alert' }),
      },
    );
  };
  return { start, starting: create.isPending };
}
