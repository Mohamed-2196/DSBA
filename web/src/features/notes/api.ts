// Notes from the API (TanStack Query). Every note is its writer's alone.
//   GET    /api/v1/notes            your notes, last edited first: ?q (title and body), ?module_id, ?lesson_id
//   POST   /api/v1/notes            a new note
//   GET    /api/v1/notes/{id}       one note, with its whole body
//   PUT    /api/v1/notes/{id}       save the whole note, with the version it was loaded at (409 note_changed: saved
//                                  since, in another tab)
//   DELETE /api/v1/notes/{id}
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { nextOffset } from '../../api/paging';
import type { Note, NoteCreate, NoteUpdate } from '../../api/types';

export const NOTES_KEY = ['notes'] as const;
const PAGE = 20;

export interface NoteFilters {
  q?: string;
  moduleId?: string | null;
  lessonId?: string | null;
}

export const noteKeys = {
  all: NOTES_KEY,
  lists: [...NOTES_KEY, 'list'] as const,
  list: (f: NoteFilters) => [...NOTES_KEY, 'list', { q: f.q ?? '', moduleId: f.moduleId ?? null, lessonId: f.lessonId ?? null }] as const,
  one: (id: string) => [...NOTES_KEY, 'one', id] as const,
};

const listQuery = (f: NoteFilters, limit: number, offset: number) =>
  call(
    api.GET('/api/v1/notes', {
      params: {
        query: {
          q: f.q || undefined,
          module_id: f.moduleId ?? undefined,
          lesson_id: f.lessonId ?? undefined,
          limit,
          offset,
        },
      },
    }),
  );

/** Your notes, a page at a time, last edited first. */
export function useNotes(filters: NoteFilters, { enabled = true }: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    queryKey: noteKeys.list(filters),
    queryFn: ({ pageParam }) => listQuery(filters, PAGE, pageParam),
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

export const fetchNote = (id: string): Promise<Note> => call(api.GET('/api/v1/notes/{note_id}', { params: { path: { note_id: id } } }));
export const createNote = (body: NoteCreate): Promise<Note> => call(api.POST('/api/v1/notes', { body }));
export const saveNote = (id: string, body: NoteUpdate): Promise<Note> => call(api.PUT('/api/v1/notes/{note_id}', { params: { path: { note_id: id } }, body }));

export function useNote(id: string | null) {
  return useQuery({
    queryKey: noteKeys.one(id ?? ''),
    queryFn: () => fetchNote(id ?? ''),
    enabled: id !== null,
    // The editor decides when to read the note again (a save answers with it): never behind its back.
    staleTime: Infinity,
  });
}

/** After a save: the note's cache entry is the saved note, and the lists are read again. */
export function noteSaved(qc: QueryClient, note: Note): void {
  qc.setQueryData(noteKeys.one(note.id), note);
  void qc.invalidateQueries({ queryKey: noteKeys.lists });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: createNote, onSuccess: (note) => noteSaved(qc, note) });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => call(api.DELETE('/api/v1/notes/{note_id}', { params: { path: { note_id: id } } })),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: noteKeys.one(id) });
      void qc.invalidateQueries({ queryKey: noteKeys.lists });
    },
  });
}
