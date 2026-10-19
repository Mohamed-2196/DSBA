// Notes beside a lesson's video (ST-44): the lesson's notes, and the notebook's editor on one of them, in a panel
// beside the playing video on a laptop or tablet and a sheet under it on a phone. The note opens in its text (the
// pages are a tap away), knows its module and lesson, and takes the video's time at the cursor ("▶ 4:05"), which
// takes the video back there when tapped. A lesson without notes opens a new one at once; a new note left empty is
// deleted when the student leaves it (NotePage's NoteDesk), and the server never lists one (ST-37).
import { ArrowLeft, ArrowSquareOut, NotePencil, Plus, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import { useAuth } from '../../auth';
import { Button, IconButton, QueryError, Skeleton, timeAgo } from '../../ui';
import { notesChanged, useCreateNote, useLessonNotes } from './api';
import { EMPTY_DOC, labelParts } from './draft';
import { MathLine } from './MathLine';
import './LessonNotes.css';

const NoteWorkspace = lazy(() => import('./NotePage').then((m) => ({ default: m.NoteWorkspace })));

/** The lesson's video, as the panel uses it: its time now, and going to a time. */
export interface LessonVideo {
  /** whether the player tells its time (a YouTube video, playing or paused) */
  ready: boolean;
  /** the time it is at, in whole seconds */
  now: () => number | null;
  /** go to a time and play */
  seek: (seconds: number) => void;
}

export interface LessonNotePanelProps {
  moduleId: string;
  lessonId: string;
  video: LessonVideo;
  onClose: () => void;
}

/** The phone's keyboard covers the bottom of the screen: the sheet sits above it. */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  return inset;
}

export function LessonNotePanel({ moduleId, lessonId, video, onClose }: LessonNotePanelProps) {
  const { me } = useAuth();
  const readOnly = me?.status === 'suspended';
  const notes = useLessonNotes(moduleId, lessonId);
  const create = useCreateNote();
  const [open, setOpen] = useState<{ id: string; fresh: boolean } | null>(null);
  const started = useRef(false);
  const inset = useKeyboardInset();
  const panelRef = useRef<HTMLElement>(null);

  const start = () => {
    if (create.isPending || readOnly) return;
    // the promise, not mutate's callbacks: those are lost when the panel's first render is redone (React's checks)
    create
      .mutateAsync({ title: '', doc: EMPTY_DOC, paper: 'lined', sheets: 1, moduleId, lessonId })
      .then((note) => setOpen({ id: note.id, fresh: true }))
      .catch(() => undefined); // create.error says why
  };

  // A lesson without notes: a new one, ready to type in.
  const items = notes.data?.items ?? [];
  const none = notes.isSuccess && items.length === 0;
  useEffect(() => {
    if (!none || started.current || open || readOnly) return;
    started.current = true;
    start();
  });

  // Closed: the lesson's "Your notes" under the video shows what was written here.
  const qc = useQueryClient();
  useEffect(() => () => notesChanged(qc), [qc]);

  // The panel takes the focus when it opens, and Escape closes it (from anywhere in it but the text).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Back to the lesson's notes: read again, with what was just written.
  const back = () => {
    setOpen(null);
    void notes.refetch();
  };

  const close = <IconButton icon={X} label="Close the notes" onClick={onClose} tooltip data-hub="lesson-note-close" />;

  let body;
  if (open) {
    body = (
      <Suspense fallback={<PanelSkeleton />}>
        <NoteWorkspace
          key={open.id}
          noteId={open.id}
          readOnly={readOnly}
          fresh={open.fresh}
          panel={{
            video,
            actions: (
              <>
                <IconButton
                  icon={ArrowLeft}
                  label="This lesson’s notes"
                  onClick={back}
                  tooltip
                  data-hub="lesson-note-list"
                />
                <IconButton
                  icon={ArrowSquareOut}
                  label="Open in Notes"
                  to={`/notes/${open.id}`}
                  tooltip
                  data-hub="lesson-note-full"
                />
                {close}
              </>
            ),
          }}
        />
      </Suspense>
    );
  } else {
    body = (
      <div className="lnp-list">
        <div className="lnp-list__head">
          <h2 className="lnp-list__title">
            <NotePencil aria-hidden="true" />
            Notes on this lesson
          </h2>
          {close}
        </div>
        {notes.isPending || (none && !started.current) || create.isPending ? (
          <Skeleton lines={3} />
        ) : notes.isError ? (
          <QueryError
            error={notes.error}
            title="Your notes didn’t load"
            size="sm"
            panel={false}
            onRetry={() => void notes.refetch()}
            retrying={notes.isFetching}
          />
        ) : (
          <>
            {items.length ? (
              <ul className="lnp-list__items">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="lnp-list__item"
                      onClick={() => setOpen({ id: n.id, fresh: false })}
                      data-hub="lesson-note-open"
                    >
                      <span className="lnp-list__label" dir="auto">
                        <MathLine parts={labelParts(n)} />
                      </span>
                      <span className="lnp-list__when">Edited {timeAgo(n.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {create.isError ? (
              <p className="lnp-list__error" role="alert">
                The note wasn’t started. {errorMessage(create.error)}
              </p>
            ) : null}
            {readOnly ? null : (
              <Button
                variant="primary"
                leadingIcon={Plus}
                onClick={start}
                loading={create.isPending}
                data-hub="lesson-note-new"
              >
                New note
              </Button>
            )}
            {notes.data && notes.data.total > items.length ? (
              <Link
                to={`/notes?module=${encodeURIComponent(moduleId)}&lesson=${encodeURIComponent(lessonId)}`}
                className="lnp-list__all"
              >
                All {notes.data.total} notes on this lesson
              </Link>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <aside
      ref={panelRef}
      className="lnp"
      aria-label="Notes beside the video"
      tabIndex={-1}
      style={inset ? { bottom: inset } : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        const t = e.target;
        if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        onClose();
      }}
      data-hub="lesson-note-panel"
    >
      {body}
    </aside>
  );
}

function PanelSkeleton() {
  return (
    <div className="lnp-list" aria-busy="true">
      <Skeleton height={44} />
      <Skeleton lines={4} />
    </div>
  );
}
