// /notes: the student's notes, last edited first, with search over titles and bodies and a module filter. Notes with
// changes still on this device say so: opening one sends them.
import { MagnifyingGlass, NotePencil, Plus } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NoteSummary } from '../../api/types';
import { Gate, useAuth } from '../../auth';
import { moduleLabel } from '../../lib/modules';
import { useDebouncedValue, useQueryParam } from '../../state';
import { useModules } from '../../state/modules';
import { Badge, Button, EmptyState, Page, PageHeader, Panel, QueryError, SearchField, Select, Skeleton, timeAgo } from '../../ui';
import { remainingCount } from '../../api/paging';
import { useNotes } from './api';
import { useLessonPlace } from './lessonPlace';
import { NEW_NOTE, draftIds, lessonLabel, noteLabel, plainExcerpt, readDraft } from './draft';
import './Notes.css';

function NoteRow({ note, unsent }: { note: NoteSummary; unsent: boolean }) {
  const { getModule } = useModules();
  const module = getModule(note.moduleId);
  const place = useLessonPlace(note.moduleId, note.lessonId);
  const excerpt = plainExcerpt(note.excerpt);
  return (
    <li className="notes-row">
      <Link to={`/notes/${note.id}`} className="notes-row__link" data-hub="note-row">
        <span className="notes-row__title" dir="auto">
          {noteLabel(note)}
        </span>
        {excerpt && note.title.trim() ? (
          <span className="notes-row__excerpt" dir="auto">
            {excerpt}
          </span>
        ) : null}
        <span className="notes-row__meta">
          {module ? <span>{moduleLabel(module)}</span> : null}
          {module && note.lessonId ? <span>{lessonLabel(place)}</span> : null}
          <span>Edited {timeAgo(note.updatedAt)}</span>
          {unsent ? (
            <Badge tone="alert" size="sm">
              Not saved yet
            </Badge>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function NotesList() {
  const { me } = useAuth();
  const { modules } = useModules();
  const [q, setQ] = useQueryParam('q');
  const [moduleId, setModuleId] = useQueryParam('module');
  const [text, setText] = useState(q ?? '');
  const search = useDebouncedValue(text.trim(), 250);
  const filters = { q: search, moduleId: moduleId || null };
  const notes = useNotes(filters);
  const readOnly = me?.status === 'suspended';
  // Read once per visit: the editor removes a copy when the server has it.
  const [unsent] = useState(() => new Set(draftIds()));
  const newDraft = useMemo(() => (unsent.has(NEW_NOTE) ? readDraft(null) : null), [unsent]);
  const items = notes.data?.pages.flatMap((p) => p.items) ?? [];
  const total = notes.data?.pages[0]?.total ?? 0;
  const filtered = !!(search || moduleId);
  const more = remainingCount(notes.data?.pages);

  const onSearch = (value: string) => {
    setText(value);
    setQ(value.trim() || null, { replace: true });
  };

  return (
    <Page width="default">
      <PageHeader
        title="Notes"
        description="Your own notes, saved as you type. Only you can see them."
        actions={
          readOnly ? null : (
            <Button variant="primary" leadingIcon={Plus} to="/notes/new" data-hub="note-new">
              New note
            </Button>
          )
        }
      />
      {readOnly ? (
        <p className="notes-notice" role="note">
          Your account is suspended. You can read your notes, but not change them.
        </p>
      ) : null}
      {newDraft ? (
        <p className="notes-notice">
          A new note you started isn’t saved yet. <Link to="/notes/new">Open it to save it</Link>.
        </p>
      ) : null}
      <div className="notes-filters">
        <SearchField className="notes-filters__search" label="Search your notes" placeholder="Search your notes" value={text} onValueChange={onSearch} onClear={() => onSearch('')} />
        <Select
          label="Module"
          hideLabel
          className="notes-filters__module"
          value={moduleId ?? ''}
          onChange={(e) => setModuleId(e.target.value || null, { replace: true })}
          options={[{ value: '', label: 'All modules' }, ...modules.map((m) => ({ value: m.id, label: moduleLabel(m) }))]}
        />
      </div>
      {notes.isPending ? (
        <Panel padding="none" aria-busy="true">
          <div className="notes-skeleton">
            <Skeleton lines={2} />
            <Skeleton lines={2} />
            <Skeleton lines={2} />
          </div>
        </Panel>
      ) : notes.isError ? (
        <QueryError error={notes.error} title="Your notes didn’t load" onRetry={() => void notes.refetch()} retrying={notes.isFetching} />
      ) : items.length === 0 ? (
        <Panel>
          {filtered ? (
            <EmptyState icon={MagnifyingGlass} title="No notes match" body="Try other words, or another module." />
          ) : (
            <EmptyState
              icon={NotePencil}
              title="No notes yet"
              body="Write down what you learn, with formulas, and find it again here."
              action={
                readOnly ? null : (
                  <Button variant="primary" leadingIcon={Plus} to="/notes/new">
                    Write your first note
                  </Button>
                )
              }
            />
          )}
        </Panel>
      ) : (
        <>
          <p className="notes-count" aria-live="polite">
            {total === 1 ? '1 note' : `${total} notes`}
          </p>
          <Panel padding="none">
            <ul className="notes-list" data-hub="notes-list">
              {items.map((n) => (
                <NoteRow key={n.id} note={n} unsent={unsent.has(n.id)} />
              ))}
            </ul>
          </Panel>
          {more > 0 ? (
            <div className="notes-more">
              <Button onClick={() => void notes.fetchNextPage()} loading={notes.isFetchingNextPage}>
                Show {Math.min(more, 20)} more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}

/** Notes are for signed-in people only: guests see a sign-in prompt. */
export default function NotesPage() {
  return (
    <Gate title="Notes" description="Your own notes, saved as you type." signedIn>
      <NotesList />
    </Gate>
  );
}
