// The notebook from the API (TanStack Query). Every notebook, note and file is its writer's alone.
//   GET    /api/v1/notebooks                 your notebooks, and how much of your storage they use
//   POST   /api/v1/notebooks                 a notebook of your own ({ title }) or a module's ({ moduleId })
//   PATCH  /api/v1/notebooks/{id}            rename it
//   DELETE /api/v1/notebooks/{id}            it and every note in it
//   GET    /api/v1/notes                     your notes, last edited first: ?q, ?notebook_id, ?module_id, ?lesson_id
//   POST   /api/v1/notes                     a new note (in a notebook, a module's notebook, or your own)
//   POST   /api/v1/notes/annotate            your note written over a library PDF (made, or the one you have)
//   GET    /api/v1/notes/{id}                one note: its text, the PDF it is written over, the sheets with ink
//   PUT    /api/v1/notes/{id}                save its text and settings, with the version loaded (409 note_changed)
//   POST   /api/v1/notes/{id}/pages          add, delete or move a page of paper in one go (its ink and pictures go
//                                            along), with the version loaded
//   GET    /api/v1/notes/{id}/ink/{sheet}    one sheet's ink
//   PUT    /api/v1/notes/{id}/ink/{sheet}    save one sheet's ink, with its version (409 ink_changed)
//   DELETE /api/v1/notes/{id}
//   GET    /api/v1/notes/files/{uploadId}    one of your note's pictures or files (a redirect; ?download=true)
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { API_ORIGIN, api, call } from '../../api/client';
import { nextOffset } from '../../api/paging';
import type {
  InkSave,
  InkSheet,
  Note,
  NoteCreate,
  NoteUpdate,
  Notebook,
  NotebookCreate,
  PageChange,
} from '../../api/types';

export const NOTES_KEY = ['notes'] as const;
/** Notes in a page of the list. */
export const NOTES_PAGE = 30;

export interface NoteFilters {
  q?: string;
  notebookId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
}

export const noteKeys = {
  all: NOTES_KEY,
  notebooks: [...NOTES_KEY, 'notebooks'] as const,
  lists: [...NOTES_KEY, 'list'] as const,
  list: (f: NoteFilters) =>
    [
      ...NOTES_KEY,
      'list',
      { q: f.q ?? '', notebookId: f.notebookId ?? null, moduleId: f.moduleId ?? null, lessonId: f.lessonId ?? null },
    ] as const,
  one: (id: string) => [...NOTES_KEY, 'one', id] as const,
};

const listQuery = (f: NoteFilters, limit: number, offset: number) =>
  call(
    api.GET('/api/v1/notes', {
      params: {
        query: {
          q: f.q || undefined,
          notebook_id: f.notebookId ?? undefined,
          module_id: f.moduleId ?? undefined,
          lesson_id: f.lessonId ?? undefined,
          limit,
          offset,
        },
      },
    }),
  );

/** Your notebooks, the one changed last first, with your storage. */
export function useNotebooks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: noteKeys.notebooks, queryFn: () => call(api.GET('/api/v1/notebooks')), enabled });
}

/** Your notes, a page at a time, last edited first. */
export function useNotes(filters: NoteFilters, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: noteKeys.list(filters),
    queryFn: ({ pageParam }) => listQuery(filters, NOTES_PAGE, pageParam),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** One lesson's notes (the lesson page's "Your notes"): the five last edited, and how many there are. */
export function useLessonNotes(moduleId: string, lessonId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const filters = { moduleId, lessonId };
  return useQuery({ queryKey: [...noteKeys.list(filters), 'first'], queryFn: () => listQuery(filters, 5, 0), enabled });
}

/** A module's notes, from every notebook (a module page's "Your notes"): the `limit` last edited, and how many there
 *  are. Off for guests and while notes are off: pass `enabled`. */
export function useModuleNotes(
  moduleId: string,
  { limit = 5, enabled = true }: { limit?: number; enabled?: boolean } = {},
) {
  const filters = { moduleId };
  return useQuery({
    queryKey: [...noteKeys.list(filters), 'first', limit],
    queryFn: () => listQuery(filters, limit, 0),
    enabled,
  });
}

export const fetchNote = (id: string): Promise<Note> =>
  call(api.GET('/api/v1/notes/{note_id}', { params: { path: { note_id: id } } }));
export const createNote = (body: NoteCreate): Promise<Note> => call(api.POST('/api/v1/notes', { body }));
export const saveNote = (id: string, body: NoteUpdate): Promise<Note> =>
  call(api.PUT('/api/v1/notes/{note_id}', { params: { path: { note_id: id } }, body }));
export const changePages = (id: string, body: PageChange): Promise<Note> =>
  call(api.POST('/api/v1/notes/{note_id}/pages', { params: { path: { note_id: id } }, body }));
export const fetchInk = (id: string, sheet: number): Promise<InkSheet> =>
  call(api.GET('/api/v1/notes/{note_id}/ink/{sheet}', { params: { path: { note_id: id, sheet } } }));
export const saveInk = (id: string, sheet: number, body: InkSave): Promise<InkSheet> =>
  call(api.PUT('/api/v1/notes/{note_id}/ink/{sheet}', { params: { path: { note_id: id, sheet } }, body }));

export function useNote(id: string | null) {
  return useQuery({
    queryKey: noteKeys.one(id ?? ''),
    queryFn: () => fetchNote(id ?? ''),
    enabled: id !== null,
    // The editor decides when to read the note again (a save answers with it): never behind its back. Once it is
    // closed it isn't kept: opening it again reads it again (it may have been saved elsewhere since).
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** After a change: the lists and notebooks are read again. */
export function notesChanged(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: noteKeys.lists });
  void qc.invalidateQueries({ queryKey: noteKeys.notebooks });
}

/** After an autosave (the text, or a sheet's ink): the lists and the room used are out of date, and are read again
 *  where they are shown next, not at every save. */
export function notesTouched(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: noteKeys.lists, refetchType: 'none' });
  void qc.invalidateQueries({ queryKey: noteKeys.notebooks, refetchType: 'none' });
}

/** A note the server answered with: its cache entry is the saved note (its ink kept as the editor has it). A new
 *  note is listed at once; an autosave (`quietly`) only marks the lists out of date. */
export function noteSaved(qc: QueryClient, note: Note, { quietly = false }: { quietly?: boolean } = {}): void {
  qc.setQueryData(noteKeys.one(note.id), note);
  if (quietly) notesTouched(qc);
  else notesChanged(qc);
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createNote, onSuccess: (note) => noteSaved(qc, note) });
}

export function useAnnotate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (libraryItemId: string) => call(api.POST('/api/v1/notes/annotate', { body: { libraryItemId } })),
    onSuccess: (note) => noteSaved(qc, note),
  });
}

export const deleteNote = (id: string): Promise<unknown> =>
  call(api.DELETE('/api/v1/notes/{note_id}', { params: { path: { note_id: id } } }));

/** A note that is gone: out of the cache and the lists. */
export function discardNote(qc: QueryClient, id: string): void {
  qc.removeQueries({ queryKey: noteKeys.one(id) });
  notesChanged(qc);
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: (_, id) => discardNote(qc, id),
  });
}

export function useCreateNotebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotebookCreate): Promise<Notebook> => call(api.POST('/api/v1/notebooks', { body })),
    onSuccess: () => notesChanged(qc),
  });
}

export function useRenameNotebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }): Promise<Notebook> =>
      call(api.PATCH('/api/v1/notebooks/{notebook_id}', { params: { path: { notebook_id: id } }, body: { title } })),
    onSuccess: () => notesChanged(qc),
  });
}

export function useDeleteNotebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/notebooks/{notebook_id}', { params: { path: { notebook_id: id } } })),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...NOTES_KEY, 'one'] });
      notesChanged(qc);
    },
  });
}

/** Where a note's picture or file is read from (a redirect to a short-lived link; only its owner gets one). */
export const noteFileHref = (uploadId: string, download = false): string =>
  `${API_ORIGIN}/api/v1/notes/files/${encodeURIComponent(uploadId)}${download ? '?download=true' : ''}`;
