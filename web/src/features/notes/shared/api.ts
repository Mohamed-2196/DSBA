// Notes shared with a module (IDEA-29): a copy of one of a student's notes that the module's students read.
//   PUT    /api/v1/notes/{id}/share                          share the note's copy, or copy it again ({ credited })
//   DELETE /api/v1/shared-notes/{id}                         stop sharing it (its writer)
//   GET    /api/v1/shared-notes?moduleId=                    a module's shared notes, the newest first (anyone)
//   GET    /api/v1/shared-notes/{id}                         one to read (hidden ones: its writer and moderators)
//   GET    /api/v1/shared-notes/{id}/files/{uploadId}        a picture or file it shows (a redirect)
//   POST   /api/v1/shared-notes/{id}/hide | /show            moderators (library.manage)
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { API_ORIGIN, api, call } from '../../../api/client';
import type { Note, SharedNote } from '../../../api/types';
import { noteKeys } from '../api';

export const sharedKeys = {
  all: ['shared-notes'] as const,
  module: (moduleId: string, limit: number) => ['shared-notes', 'module', moduleId, limit] as const,
  one: (id: string) => ['shared-notes', 'one', id] as const,
};

/** Where a shared note's picture or file is read from (a redirect to a short-lived link). */
export const sharedFileHref =
  (shareId: string) =>
  (uploadId: string, download = false): string =>
    `${API_ORIGIN}/api/v1/shared-notes/${encodeURIComponent(shareId)}/files/${encodeURIComponent(uploadId)}${
      download ? '?download=true' : ''
    }`;

export function useSharedNote(id: string) {
  return useQuery({
    queryKey: sharedKeys.one(id),
    queryFn: ({ signal }) =>
      call(api.GET('/api/v1/shared-notes/{share_id}', { params: { path: { share_id: id } }, signal })),
  });
}

/** A module's shared notes, the newest first ({ items, total }). */
export function useModuleSharedNotes(moduleId: string, { limit, enabled }: { limit: number; enabled: boolean }) {
  return useQuery({
    queryKey: sharedKeys.module(moduleId, limit),
    queryFn: ({ signal }) => call(api.GET('/api/v1/shared-notes', { params: { query: { moduleId, limit } }, signal })),
    enabled,
    staleTime: 60_000,
  });
}

/** The note in the editor's cache with its shared copy as it is now (null: not shared). */
function withShare(qc: QueryClient, noteId: string, copy: SharedNote | null): void {
  qc.setQueryData<Note>(noteKeys.one(noteId), (n) =>
    n
      ? {
          ...n,
          share: copy
            ? {
                id: copy.id,
                moduleId: copy.moduleId,
                credited: copy.credited,
                hidden: copy.hidden,
                sharedAt: copy.sharedAt,
                updatedAt: copy.updatedAt,
                upToDate: true,
              }
            : null,
        }
      : n,
  );
}

function sharedChanged(qc: QueryClient, copy: SharedNote | { id: string }): void {
  if ('title' in copy) qc.setQueryData(sharedKeys.one(copy.id), copy);
  else qc.removeQueries({ queryKey: sharedKeys.one(copy.id) });
  void qc.invalidateQueries({ queryKey: [...sharedKeys.all, 'module'] });
}

export function useShareNote(noteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (credited: boolean) =>
      call(api.PUT('/api/v1/notes/{note_id}/share', { params: { path: { note_id: noteId } }, body: { credited } })),
    onSuccess: (copy) => {
      withShare(qc, noteId, copy);
      sharedChanged(qc, copy);
    },
  });
}

/** Stop sharing (`noteId`: the note it was copied from, when the editor has it open). */
export function useUnshare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; noteId?: string }) =>
      call(api.DELETE('/api/v1/shared-notes/{share_id}', { params: { path: { share_id: id } } })),
    onSuccess: (_, { id, noteId }) => {
      if (noteId) withShare(qc, noteId, null);
      sharedChanged(qc, { id });
    },
  });
}

/** Hide it from the module (with a reason its writer reads), or show it again: moderators. */
export function useModerateShared(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ hide, reason }: { hide: boolean; reason?: string }) =>
      hide
        ? call(
            api.POST('/api/v1/shared-notes/{share_id}/hide', {
              params: { path: { share_id: id } },
              body: { reason: reason ?? '' },
            }),
          )
        : call(api.POST('/api/v1/shared-notes/{share_id}/show', { params: { path: { share_id: id } } })),
    onSuccess: (copy) => sharedChanged(qc, copy),
  });
}
