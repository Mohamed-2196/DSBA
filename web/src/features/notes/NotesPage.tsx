// /notes: student's notebooks and notes, last edited first, with search, notebook filtering, and creation.
import { Book, DotsThree, FilePdf, Folder, FolderPlus, MagnifyingGlass, NotePencil, PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Notebook, NoteSummary } from '../../api/types';
import { Gate, useAuth } from '../../auth';
import { moduleLabel } from '../../lib/modules';
import { useDebouncedValue, useQueryParam } from '../../state';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Modal,
  Page,
  PageHeader,
  Panel,
  QueryError,
  SearchField,
  Select,
  Skeleton,
  TextField,
  cx,
  timeAgo,
} from '../../ui';
import { remainingCount } from '../../api/paging';
import { formatSize } from '../../api/uploads';
import { useCreateNotebook, useDeleteNotebook, useNotebooks, useNotes, useRenameNotebook } from './api';
import { draftIds, lessonLabel, noteLabel, plainExcerpt } from './draft';
import { useLessonPlace } from './lessonPlace';
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
          {note.onPdf ? (
            <Badge tone="neutral" size="sm">
              <FilePdf aria-hidden="true" /> PDF
            </Badge>
          ) : null}
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

function NotebookDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { modules } = useModules();
  const createBook = useCreateNotebook();
  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !moduleId) return;
    createBook.mutate(
      { title: title.trim(), moduleId: moduleId || undefined },
      {
        onSuccess: () => {
          setTitle('');
          setModuleId('');
          onClose();
        },
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="New notebook">
      <form onSubmit={submit} className="notes-dialog-form">
        <TextField label="Notebook title" placeholder="e.g. Exam Revision" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <Select
          label="Module (optional)"
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          options={[{ value: '', label: 'Personal (no module)' }, ...modules.map((m) => ({ value: m.id, label: moduleLabel(m) }))]}
        />
        <div className="notes-notice__actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-16)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={createBook.isPending} disabled={!title.trim() && !moduleId}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RenameDialog({ notebook, onClose }: { notebook: Notebook | null; onClose: () => void }) {
  const renameBook = useRenameNotebook();
  const [title, setTitle] = useState(notebook?.title ?? '');

  if (!notebook) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    renameBook.mutate({ id: notebook.id, title: title.trim() }, { onSuccess: onClose });
  };

  return (
    <Modal open={!!notebook} onClose={onClose} title="Rename notebook">
      <form onSubmit={submit} className="notes-dialog-form">
        <TextField label="New title" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        <div className="notes-notice__actions" style={{ justifyContent: 'flex-end', marginTop: 'var(--sp-16)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={renameBook.isPending} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NotesList() {
  const { me } = useAuth();
  const { getModule } = useModules();
  const notebooksQuery = useNotebooks();
  const deleteBook = useDeleteNotebook();

  const [q, setQ] = useQueryParam('q');
  const [selectedNotebookId, setSelectedNotebookId] = useQueryParam('notebook');
  const [text, setText] = useState(q ?? '');
  const search = useDebouncedValue(text.trim(), 250);

  const [newBookOpen, setNewBookOpen] = useState(false);
  const [renamingBook, setRenamingBook] = useState<Notebook | null>(null);
  const [deletingBook, setDeletingBook] = useState<Notebook | null>(null);

  const filters = { q: search, notebookId: selectedNotebookId || null };
  const notes = useNotes(filters);
  const readOnly = me?.status === 'suspended';

  const [unsent] = useState(() => new Set(draftIds()));
  const items = notes.data?.pages.flatMap((p) => p.items) ?? [];
  const total = notes.data?.pages[0]?.total ?? 0;
  const filtered = !!search || !!selectedNotebookId;
  const more = remainingCount(notes.data?.pages);

  const onSearch = (value: string) => {
    setText(value);
    setQ(value.trim() || null, { replace: true });
  };

  const notebooks = notebooksQuery.data?.items ?? [];
  const storage = notebooksQuery.data?.storage;
  const storagePercent = storage ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100)) : 0;

  return (
    <Page width="default">
      <PageHeader
        title="Notebooks"
        description="Your notes, handwriting, formulas and PDF annotations. Kept private to you."
        actions={
          readOnly ? null : (
            <div style={{ display: 'flex', gap: 'var(--sp-8)' }}>
              <Button leadingIcon={FolderPlus} onClick={() => setNewBookOpen(true)} data-hub="new-notebook">
                New notebook
              </Button>
              <Button
                variant="primary"
                leadingIcon={Plus}
                to={selectedNotebookId ? `/notes/new?notebook=${encodeURIComponent(selectedNotebookId)}` : '/notes/new'}
                data-hub="note-new"
              >
                New note
              </Button>
            </div>
          )
        }
      />

      {readOnly ? (
        <p className="notes-notice" role="note">
          Your account is suspended. You can read your notes, but not change them.
        </p>
      ) : null}

      <div className="notes-layout">
        {/* ── Left Pane: Notebooks Sidebar ── */}
        <aside className="notebooks-sidebar" aria-label="Notebooks">
          <div className="notebooks-sidebar__head">
            <h3 className="notebooks-sidebar__title">Notebooks</h3>
            {readOnly ? null : <IconButton icon={Plus} label="New notebook" size="sm" onClick={() => setNewBookOpen(true)} tooltip />}
          </div>
          <ul className="notebooks-sidebar__list">
            <li>
              <button
                type="button"
                className={cx('notebook-item', !selectedNotebookId && 'is-active')}
                onClick={() => setSelectedNotebookId(null, { replace: true })}
              >
                <span className="notebook-item__name">
                  <Book aria-hidden="true" />
                  All notes
                </span>
              </button>
            </li>
            {notebooks.map((b) => {
              const mod = b.moduleId ? getModule(b.moduleId) : null;
              const isSelected = selectedNotebookId === b.id;
              const isCustom = !b.moduleId && b.title !== 'My notebook';
              return (
                <li key={b.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={cx('notebook-item', isSelected && 'is-active')}
                    onClick={() => setSelectedNotebookId(b.id, { replace: true })}
                  >
                    <span className="notebook-item__name">
                      <Folder aria-hidden="true" />
                      {mod ? (mod.unitCode ?? mod.shortName) : b.title}
                    </span>
                    <span className="notebook-item__count">{b.noteCount}</span>
                  </button>
                  {isCustom && !readOnly ? (
                    <Menu
                      align="end"
                      label="Notebook options"
                      items={[
                        { id: 'rename', label: 'Rename', icon: PencilSimple, onSelect: () => setRenamingBook(b) },
                        { id: 'delete', label: 'Delete notebook', icon: Trash, danger: true, onSelect: () => setDeletingBook(b) },
                      ]}
                      trigger={<IconButton icon={DotsThree} label="Options" size="sm" />}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {storage ? (
            <div className="notebooks-storage">
              <div>
                Storage: {formatSize(storage.usedBytes)} of {formatSize(storage.limitBytes)}
              </div>
              <div className="notebooks-storage__meter">
                <div className="notebooks-storage__fill" style={{ width: `${storagePercent}%` }} />
              </div>
            </div>
          ) : null}
        </aside>

        {/* ── Main Notes List ── */}
        <section aria-label="Notes in notebook">
          <div className="notes-filters">
            <SearchField
              className="notes-filters__search"
              label="Search your notes"
              placeholder="Search your notes"
              value={text}
              onValueChange={onSearch}
              onClear={() => onSearch('')}
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
                <EmptyState icon={MagnifyingGlass} illustration="search" title="No notes match" body="Try other words, or another notebook." />
              ) : (
                <EmptyState
                  icon={NotePencil}
                  illustration="no-notes"
                  title="No notes yet"
                  body="Type with rich text, write with stylus ink, or annotate past papers."
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
        </section>
      </div>

      <NotebookDialog open={newBookOpen} onClose={() => setNewBookOpen(false)} />
      <RenameDialog notebook={renamingBook} onClose={() => setRenamingBook(null)} />
      <ConfirmDialog
        open={!!deletingBook}
        title={`Delete “${deletingBook?.title}”?`}
        body="This will delete the notebook and all notes in it. It cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={deleteBook.isPending}
        onConfirm={() => {
          if (!deletingBook) return;
          deleteBook.mutate(deletingBook.id, {
            onSuccess: () => {
              if (selectedNotebookId === deletingBook.id) setSelectedNotebookId(null);
              setDeletingBook(null);
            },
          });
        }}
        onClose={() => setDeletingBook(null)}
      />
    </Page>
  );
}

export default function NotesPage() {
  return (
    <Gate title="Notes" description="Your own notes, saved as you type." signedIn>
      <NotesList />
    </Gate>
  );
}
