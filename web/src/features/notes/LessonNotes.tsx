// "Your notes" on a lesson page: the student's notes about this lesson, a quick add, and a way into the full editor.
// Shown to signed-in students while notes are on.
import { NotePencil, Plus } from '@phosphor-icons/react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { Button, QueryError, Skeleton, TextArea, timeAgo } from '../../ui';
import { useCreateNote, useLessonNotes } from './api';
import { noteLabel } from './draft';
import { BODY_MAX } from './limits';
import './Notes.css';

export interface LessonNotesProps {
  moduleId: string;
  lessonId: string;
}

export function LessonNotes({ moduleId, lessonId }: LessonNotesProps) {
  const { me, featureOn } = useAuth();
  const on = !!me && !me.needsProfile && featureOn('notes');
  const notes = useLessonNotes(moduleId, lessonId, { enabled: on });
  const create = useCreateNote();
  const [text, setText] = useState('');
  if (!on) return null;
  const readOnly = me?.status === 'suspended';
  const place = `module=${encodeURIComponent(moduleId)}&lesson=${encodeURIComponent(lessonId)}`;

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    create.mutate({ title: '', body: text, moduleId, lessonId }, { onSuccess: () => setText('') });
  };

  const items = notes.data?.items ?? [];
  const total = notes.data?.total ?? 0;
  return (
    <section className="notes-lesson" aria-labelledby="notes-lesson-title" data-hub="lesson-notes">
      <div className="notes-lesson__head">
        <h3 id="notes-lesson-title" className="notes-lesson__title">
          <NotePencil aria-hidden="true" />
          Your notes
        </h3>
        {total > items.length ? (
          <Link to={`/notes?module=${encodeURIComponent(moduleId)}`} className="notes-lesson__all">
            See all {total}
          </Link>
        ) : null}
      </div>
      {notes.isPending ? (
        <Skeleton lines={2} />
      ) : notes.isError ? (
        <QueryError error={notes.error} title="Your notes didn’t load" size="sm" panel={false} onRetry={() => void notes.refetch()} retrying={notes.isFetching} />
      ) : items.length ? (
        <ul className="notes-lesson__list">
          {items.map((n) => (
            <li key={n.id}>
              <Link to={`/notes/${n.id}`} dir="auto">
                {noteLabel(n)}
              </Link>
              <span className="notes-lesson__when">{timeAgo(n.updatedAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-lesson__empty">Nothing yet. Notes you write here stay with this lesson, and only you see them.</p>
      )}
      {readOnly ? null : (
        <form className="notes-lesson__add" onSubmit={onAdd}>
          <TextArea
            label="Quick note"
            hideLabel
            placeholder="A quick note about this lesson"
            rows={2}
            value={text}
            maxLength={BODY_MAX}
            dir="auto"
            onChange={(e) => setText(e.target.value)}
            error={create.error ? create.error.message : undefined}
            data-hub="lesson-note-text"
          />
          <div className="notes-lesson__actions">
            <Button type="submit" size="sm" variant="primary" leadingIcon={Plus} loading={create.isPending} disabled={!text.trim()}>
              Add note
            </Button>
            <Button size="sm" variant="ghost" to={`/notes/new?${place}`}>
              Write a longer one
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
