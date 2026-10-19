// Notes the notes and lessons a student opens, for "Carry on" (the library's file page notes its own). Mounted once by
// the shell: it reads the address, and names what is open from the caches the pages fill anyway.
import { useQuery } from '@tanstack/react-query';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuth } from '../../auth';
import { findLesson, lessonHref, lessonName, moduleDetailQuery } from '../modules/public';
import { useNote } from '../notes/public';
import { useRecordVisit } from './useRecent';

function NoteVisit({ id }: { id: string }) {
  const note = useNote(id);
  const n = note.data;
  const title = n ? n.title.trim() || (n.pdf ? `Notes on ${n.pdf.title}` : n.excerpt.trim().slice(0, 80)) : '';
  useRecordVisit(
    n && title
      ? {
          kind: 'note',
          id: n.id,
          path: `/notes/${n.id}`,
          title,
          moduleId: n.moduleId,
          onItem: n.pdf?.libraryItemId ?? null,
        }
      : null,
  );
  return null;
}

function LessonVisit({ moduleId, lessonId }: { moduleId: string; lessonId: string }) {
  const module = useQuery(moduleDetailQuery(moduleId));
  const at = findLesson(module.data, lessonId);
  const chapter = at ? module.data?.chapters[at.c] : undefined;
  const code = module.data ? module.data.unitCode || module.data.shortName : null;
  useRecordVisit(
    at && chapter
      ? {
          kind: 'lesson',
          id: lessonId,
          path: lessonHref(moduleId, lessonId),
          title: `${code ? `${code} · ` : ''}${lessonName(chapter, at.v)}`,
          moduleId,
          onItem: null,
        }
      : null,
  );
  return null;
}

export function VisitRecorder() {
  const { pathname } = useLocation();
  const { status, featureOn } = useAuth();
  const note = matchPath('/notes/:noteId', pathname);
  const lesson = matchPath('/modules/:moduleId/lessons/:lessonId', pathname);
  if (note?.params.noteId && status === 'signed-in' && featureOn('notes'))
    return <NoteVisit key={note.params.noteId} id={note.params.noteId} />;
  if (lesson?.params.moduleId && lesson.params.lessonId)
    return <LessonVisit key={pathname} moduleId={lesson.params.moduleId} lessonId={lesson.params.lessonId} />;
  return null;
}
