// Where a note's pictures and files are read from: the writer's own note files (/notes/files/{id}), or, in a copy
// shared with a module, that copy's (/shared-notes/{id}/files/{uploadId}). The text's pictures and files and the free
// pictures read it from here, so the same views draw both.
import { createContext, useContext } from 'react';
import { noteFileHref } from './api';

export type FileHref = (uploadId: string, download?: boolean) => string;

export const NoteFilesContext = createContext<FileHref>(noteFileHref);

export const useFileHref = (): FileHref => useContext(NoteFilesContext);
