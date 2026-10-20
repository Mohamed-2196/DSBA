// /notes: the student's notebooks and notes, last edited first, with search, a notebook, a module's notes (from every
// notebook) or one lesson's (?notebook=, ?module=, or ?module=&lesson= from a lesson page), and creation.
import { lazy, Suspense, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { errorMessage } from '../../api/errors';
import type { Notebook, NoteSummary, StorageUse } from '../../api/types';
import { Gate, useAuth } from '../../auth';
import { moduleLabel } from '../../lib/modules';
import { useDebouncedValue, useMediaQuery, useQueryParam, useSetQueryParams, useToast, useYear } from '../../state';
import { useModules } from '../../state/modules';
import {
  Badge,
  Button,
  DocThumb,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Modal,
  type MenuItem,
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
  Icon,
  glyph,
} from '../../ui';
import { remainingCount } from '../../api/paging';
import {
  checkUpload,
  fileExtension,
  formatSize,
  progressPercent,
  uploadErrorMessage,
  uploadFile,
} from '../../api/uploads';
import {
  NOTES_PAGE,
  useCreateNote,
  useCreateNotebook,
  useDeleteNotebook,
  useNotebooks,
  useNotes,
  useRenameNotebook,
} from './api';
import { EMPTY_DOC, draftIds, labelParts, lessonLabel } from './draft';
import { TITLE_MAX } from './limits';
import { useLessonPlace } from './lessonPlace';
import { MathLine } from './MathLine';
import { firstOwnNotebook } from './notebooks';
import { nearlyFull, type Budget } from './storage';
import { lineParts } from './text/mathText';
import { useStartNote } from './useStartNote';
import './NotesPage.css';

function NoteRow({ note, unsent }: { note: NoteSummary; unsent: boolean }) {
  const { getModule } = useModules();
  const module = getModule(note.moduleId);
  const place = useLessonPlace(note.moduleId, note.lessonId);
  const excerpt = lineParts(note.excerpt, 160);

  return (
    <li className="notes-row">
      <Link to={`/notes/${note.id}`} className="notes-row__link" data-hub="note-row">
        <DocThumb tone={note.onPdf ? 'paper' : 'note'} className="notes-row__doc" />
        <span className="notes-row__title" dir="auto">
          <MathLine parts={labelParts(note)} />
        </span>
        {excerpt.length && note.title.trim() ? (
          <span className="notes-row__excerpt" dir="auto">
            <MathLine parts={excerpt} />
          </span>
        ) : null}
        <span className="notes-row__meta">
          {module ? (
            <span className={cx('notes-row__code', module.unitCode && 'u-code')} title={moduleLabel(module)}>
              {module.unitCode ?? module.shortName}
            </span>
          ) : null}
          {module && note.lessonId ? <span>{lessonLabel(place)}</span> : null}
          {note.onPdf ? (
            <Badge tone="neutral" size="sm">
              On a PDF
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

/**
 * A note written over a PDF of the student's own (lecture slides, a worksheet): `pick` opens the file picker, then the
 * PDF uploads and the note opens to write on. `input` is the hidden file field to render once.
 */
function usePdfNote(notebookId: string | null) {
  const navigate = useNavigate();
  const create = useCreateNote();
  const { push } = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [percent, setPercent] = useState<number | null>(null);

  const start = async (file: File) => {
    const problem = fileExtension(file.name) === 'pdf' ? checkUpload('note_file', file) : 'Choose a PDF file.';
    if (problem) {
      push({ title: `${file.name} wasn’t added`, body: problem, tone: 'alert' });
      return;
    }
    setPercent(0);
    try {
      const out = await uploadFile('note_file', file, { onProgress: (p) => setPercent(progressPercent(p)) });
      const note = await create.mutateAsync({
        title: file.name
          .replace(/\.pdf$/i, '')
          .trim()
          .slice(0, TITLE_MAX),
        doc: EMPTY_DOC,
        paper: 'lined',
        sheets: 0,
        pdfUploadId: out.uploadId,
        ...(notebookId ? { notebookId } : {}),
      });
      navigate(`/notes/${note.id}`);
    } catch (e) {
      push({ title: `${file.name} wasn’t added`, body: uploadErrorMessage(e, 'note_file'), tone: 'alert' });
    } finally {
      setPercent(null);
    }
  };

  const input = (
    <input
      ref={ref}
      type="file"
      accept="application/pdf,.pdf"
      hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void start(file);
      }}
      data-hub="note-pdf-input"
    />
  );
  return {
    input,
    pick: () => ref.current?.click(),
    percent,
    label: percent !== null ? `Uploading ${percent}%` : 'Write on a PDF',
  };
}

/** How much of one of the notebooks' two budgets is used, and what makes room. */
function StorageMeter({ label, used, limit, room }: Budget) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="notebooks-storage__item">
      <p>
        {label}: {formatSize(used)} of {formatSize(limit)}
      </p>
      <div
        className="notebooks-storage__meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={percent >= 90 ? 'notebooks-storage__fill is-nearly-full' : 'notebooks-storage__fill'}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="notebooks-storage__room">{room}</p>
    </div>
  );
}

/** The notebooks' storage, once a budget is nearly used up (storage.ts). */
function StorageRoom({ storage }: { storage: StorageUse }) {
  const budgets = nearlyFull(storage);
  if (!budgets.length) return null;
  return (
    <div className="notebooks-storage" data-hub="notes-storage">
      {budgets.map((b) => (
        <StorageMeter key={b.label} {...b} />
      ))}
    </div>
  );
}

/** Narrower than this, the notebooks are a picker above the notes instead of a pane beside them. */
const NARROW = '(max-width: 767px)';

function NotebookDialog({ onClose }: { onClose: () => void }) {
  const { modules } = useModules();
  const createBook = useCreateNotebook();
  const [title, setTitle] = useState('');
  const [moduleId, setModuleId] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() && !moduleId) return;
    createBook.mutate({ title: title.trim(), moduleId: moduleId || undefined }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title="New notebook">
      <form onSubmit={submit} className="notes-dialog-form">
        <TextField
          label="Notebook title"
          placeholder="e.g. Exam revision"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={createBook.error ? errorMessage(createBook.error) : undefined}
          autoFocus
        />
        <Select
          label="Module (optional)"
          value={moduleId}
          onChange={(e) => setModuleId(e.target.value)}
          options={[
            { value: '', label: 'Personal (no module)' },
            ...modules.map((m) => ({ value: m.id, label: moduleLabel(m) })),
          ]}
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

/** Renaming one notebook: mounted for it alone (its key is the notebook), so the field opens with its title. */
function RenameDialog({ notebook, onClose }: { notebook: Notebook; onClose: () => void }) {
  const renameBook = useRenameNotebook();
  const [title, setTitle] = useState(notebook.title);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    renameBook.mutate({ id: notebook.id, title: title.trim() }, { onSuccess: onClose });
  };

  return (
    <Modal open onClose={onClose} title="Rename notebook">
      <form onSubmit={submit} className="notes-dialog-form">
        <TextField
          label="New title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={renameBook.error ? errorMessage(renameBook.error) : undefined}
          autoFocus
        />
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

/** Every note of a module as one print (the editor's code: loaded when it is asked for). */
const PrintModule = lazy(() => import('./print/PrintModule').then((m) => ({ default: m.PrintModule })));

function NotesList() {
  const { me } = useAuth();
  const { getModule, getModulesForYear } = useModules();
  const { year } = useYear();
  const notebooksQuery = useNotebooks();
  const deleteBook = useDeleteNotebook();

  const [q, setQ] = useQueryParam('q');
  const [selectedNotebookId, setSelectedNotebookId] = useQueryParam('notebook');
  const [moduleId] = useQueryParam('module');
  const [lessonId] = useQueryParam('lesson');
  const startNote = useStartNote();
  const [text, setText] = useState(q ?? '');
  const search = useDebouncedValue(text.trim(), 250);

  const [newBookOpen, setNewBookOpen] = useState(false);
  const [renamingBook, setRenamingBook] = useState<Notebook | null>(null);
  const [deletingBook, setDeletingBook] = useState<Notebook | null>(null);

  // one lesson's notes (from a lesson page's "See all"), a module's, or one notebook's
  const lesson = moduleId && lessonId ? { moduleId, lessonId } : null;
  const filters = {
    q: search,
    notebookId: selectedNotebookId || null,
    moduleId: moduleId || null,
    lessonId: lesson?.lessonId ?? null,
  };
  const lessonPlace = useLessonPlace(lesson?.moduleId ?? null, lesson?.lessonId ?? null);
  const lessonModule = lesson ? getModule(lesson.moduleId) : null;
  const setParams = useSetQueryParams();
  const showAll = () => setParams({ module: null, lesson: null }, { replace: true });
  const pickModule = (id: string | null) => setParams({ module: id, lesson: null }, { replace: true });
  const notes = useNotes(filters);
  const [printing, setPrinting] = useState(false);
  const printModule = moduleId && !lesson ? getModule(moduleId) : null;
  const readOnly = me?.status === 'suspended';

  const [unsent] = useState(() => new Set(draftIds()));
  const items = notes.data?.pages.flatMap((p) => p.items) ?? [];
  const total = notes.data?.pages[0]?.total ?? 0;
  const filtered = !!search || !!selectedNotebookId || !!moduleId;
  const more = remainingCount(notes.data?.pages);

  const onSearch = (value: string) => {
    setText(value);
    setQ(value.trim() || null, { replace: true });
  };

  // Nothing written yet: the empty state is the page (no filters or pickers with nothing to act on).
  const nothingYet = !!notes.data && total === 0 && !filtered && !lesson;
  const newNote = () => startNote.start(lesson ?? { notebookId: selectedNotebookId, moduleId: moduleId ?? undefined });
  const pdf = usePdfNote(selectedNotebookId || null);

  const notebooks = notebooksQuery.data?.items ?? [];
  const storage = notebooksQuery.data?.storage;
  const ownFirst = firstOwnNotebook(notebooks);
  const narrow = useMediaQuery(NARROW);
  const bookName = (b: Notebook) => {
    const mod = b.moduleId ? getModule(b.moduleId) : null;
    return mod ? (mod.unitCode ?? mod.shortName) : b.title;
  };
  // a module's notebook and the first of the student's own are kept: only the others can be renamed or deleted
  const bookOptions = (b: Notebook): MenuItem[] =>
    !readOnly && !b.moduleId && b.id !== ownFirst?.id
      ? [
          { id: 'rename', label: 'Rename', icon: <Icon glyph={glyph.edit} />, onSelect: () => setRenamingBook(b) },
          {
            id: 'delete',
            label: 'Delete notebook',
            icon: <Icon glyph={glyph.trash} />,
            danger: true,
            onSelect: () => setDeletingBook(b),
          },
        ]
      : [];
  const booksError = notebooksQuery.isError ? (
    <QueryError
      error={notebooksQuery.error}
      title="Your notebooks didn’t load"
      size="sm"
      panel={false}
      onRetry={() => void notebooksQuery.refetch()}
      retrying={notebooksQuery.isFetching}
    />
  ) : null;
  const selectedBook = notebooks.find((b) => b.id === selectedNotebookId) ?? null;
  // the modules to filter by: the student's year's, and any other their notebooks are for
  const filterModules = [...getModulesForYear(year)];
  for (const id of [moduleId, ...notebooks.map((b) => b.moduleId)]) {
    const m = getModule(id);
    if (m && !filterModules.some((x) => x.id === m.id)) filterModules.push(m);
  }
  const moduleOptions = filterModules.map((m) => ({ value: m.id, label: moduleLabel(m) }));
  const selectedOptions = selectedBook ? bookOptions(selectedBook) : [];

  return (
    <Page width="default">
      {pdf.input}
      <PageHeader
        section="notebook"
        title="Notebook"
        description="Your notes, handwriting, formulas and PDF annotations. Kept private to you."
        actions={
          readOnly || nothingYet ? null : (
            <div className="notes-new">
              {narrow ? null : (
                <>
                  <Button
                    leadingIcon={<Icon glyph={glyph.folder} />}
                    onClick={() => setNewBookOpen(true)}
                    data-hub="new-notebook"
                  >
                    New notebook
                  </Button>
                  <Button
                    leadingIcon={<Icon glyph={glyph.page} />}
                    onClick={pdf.pick}
                    loading={pdf.percent !== null}
                    data-hub="note-from-pdf"
                  >
                    {pdf.label}
                  </Button>
                </>
              )}
              <Button
                variant="primary"
                leadingIcon={<Icon glyph={glyph.plus} />}
                onClick={newNote}
                loading={startNote.starting}
                data-hub="note-new"
              >
                New note
              </Button>
              {narrow ? (
                <Menu
                  align="end"
                  label="More ways to add"
                  items={[
                    {
                      id: 'pdf',
                      label: pdf.label,
                      icon: <Icon glyph={glyph.page} />,
                      onSelect: pdf.pick,
                      disabled: pdf.percent !== null,
                    },
                    {
                      id: 'notebook',
                      label: 'New notebook',
                      icon: <Icon glyph={glyph.folder} />,
                      onSelect: () => setNewBookOpen(true),
                    },
                  ]}
                  trigger={
                    <IconButton icon={<Icon glyph={glyph.more} />} label="More ways to add" data-hub="notes-more" />
                  }
                />
              ) : null}
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
        {narrow ? null : (
          <aside className="notebooks-sidebar" aria-label="Notebooks">
            <div className="notebooks-sidebar__head">
              <h3 className="notebooks-sidebar__title">Notebooks</h3>
              {readOnly ? null : (
                <IconButton
                  icon={<Icon glyph={glyph.plus} />}
                  label="New notebook"
                  size="sm"
                  onClick={() => setNewBookOpen(true)}
                  tooltip
                />
              )}
            </div>
            <ul className="notebooks-sidebar__list">
              <li>
                <button
                  type="button"
                  className={cx('notebook-item', !selectedNotebookId && 'is-active')}
                  onClick={() => setSelectedNotebookId(null, { replace: true })}
                >
                  <span className="notebook-item__name">
                    <Icon glyph={glyph.notebook} />
                    All notes
                  </span>
                </button>
              </li>
              {notebooks.map((b) => {
                const options = bookOptions(b);
                return (
                  <li key={b.id} className="notebooks-sidebar__book">
                    <button
                      type="button"
                      className={cx('notebook-item', selectedNotebookId === b.id && 'is-active')}
                      onClick={() => setSelectedNotebookId(b.id, { replace: true })}
                    >
                      <span className="notebook-item__name">
                        <Icon glyph={glyph.folder} />
                        {bookName(b)}
                      </span>
                      <span className="notebook-item__count">{b.noteCount}</span>
                    </button>
                    {options.length ? (
                      <Menu
                        align="end"
                        label="Notebook options"
                        items={options}
                        trigger={<IconButton icon={<Icon glyph={glyph.more} />} label="Options" size="sm" />}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {booksError}
            {storage ? <StorageRoom storage={storage} /> : null}
          </aside>
        )}

        <section className="notes-section" aria-label="Notes in notebook">
          {narrow && !nothingYet ? (
            <>
              <div className="notes-picker" data-hub="notebook-picker">
                <Select
                  className="notes-picker__select"
                  label="Notebook"
                  value={selectedBook?.id ?? ''}
                  onChange={(e) => setSelectedNotebookId(e.target.value || null, { replace: true })}
                  options={[
                    { value: '', label: 'All notebooks' },
                    ...notebooks.map((b) => ({ value: b.id, label: `${bookName(b)} (${b.noteCount})` })),
                  ]}
                />
                {selectedBook && selectedOptions.length ? (
                  <Menu
                    align="end"
                    label="Notebook options"
                    items={selectedOptions}
                    trigger={
                      <IconButton icon={<Icon glyph={glyph.more} />} label={`Options for ${bookName(selectedBook)}`} />
                    }
                  />
                ) : null}
              </div>
              {booksError}
              {storage ? <StorageRoom storage={storage} /> : null}
            </>
          ) : null}
          {lesson ? (
            <p className="notes-lesson-filter" data-hub="notes-lesson-filter">
              <span>
                Your notes on {lessonModule ? `${moduleLabel(lessonModule)}, ` : ''}
                {lessonLabel(lessonPlace).toLowerCase()}
              </span>
              <Button size="sm" variant="ghost" onClick={showAll}>
                Show all notes
              </Button>
            </p>
          ) : null}
          {nothingYet ? null : (
            <div className="notes-filters">
              <SearchField
                className="notes-filters__search"
                label="Search your notes"
                placeholder="Search your notes"
                value={text}
                onValueChange={onSearch}
                onClear={() => onSearch('')}
              />
              {lesson ? null : (
                <Select
                  className="notes-filters__module"
                  label="Module"
                  // On a phone the two pickers stack: each says what it picks (ST-79).
                  hideLabel={!narrow}
                  value={moduleId ?? ''}
                  onChange={(e) => pickModule(e.target.value || null)}
                  options={[{ value: '', label: 'All modules' }, ...moduleOptions]}
                  data-hub="notes-module-filter"
                />
              )}
              {printModule && total > 0 ? (
                <Button
                  leadingIcon={<Icon glyph={glyph.print} />}
                  onClick={() => setPrinting(true)}
                  className="notes-filters__print"
                  data-hub="notes-print-all"
                >
                  Print all
                </Button>
              ) : null}
            </div>
          )}

          {notes.isPending ? (
            <Panel padding="none" aria-busy="true">
              <div className="notes-skeleton">
                <Skeleton lines={2} />
                <Skeleton lines={2} />
                <Skeleton lines={2} />
              </div>
            </Panel>
          ) : notes.isError ? (
            <QueryError
              error={notes.error}
              title="Your notes didn’t load"
              onRetry={() => void notes.refetch()}
              retrying={notes.isFetching}
            />
          ) : items.length === 0 ? (
            <Panel>
              {filtered ? (
                <EmptyState mate="jot" title="No notes match" body="Try other words, or another notebook." />
              ) : (
                <EmptyState
                  mate="jot"
                  title="No notes yet"
                  body="Type with rich text, write with stylus ink, or annotate past papers."
                  action={
                    readOnly ? null : (
                      <>
                        <Button
                          variant="primary"
                          leadingIcon={<Icon glyph={glyph.plus} />}
                          onClick={newNote}
                          loading={startNote.starting}
                          data-hub="note-new"
                        >
                          Write your first note
                        </Button>
                        <Button
                          leadingIcon={<Icon glyph={glyph.page} />}
                          onClick={pdf.pick}
                          loading={pdf.percent !== null}
                        >
                          {pdf.label}
                        </Button>
                      </>
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
                    Show {Math.min(more, NOTES_PAGE)} more
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {newBookOpen ? <NotebookDialog onClose={() => setNewBookOpen(false)} /> : null}
      {renamingBook ? (
        <RenameDialog key={renamingBook.id} notebook={renamingBook} onClose={() => setRenamingBook(null)} />
      ) : null}
      <ConfirmDialog
        open={!!deletingBook}
        title={`Delete “${deletingBook?.title ?? ''}”?`}
        body="The notebook and every note in it are deleted. This can’t be undone."
        confirmLabel="Delete"
        tone="danger"
        busy={deleteBook.isPending}
        error={deleteBook.error ? errorMessage(deleteBook.error) : null}
        onConfirm={() => {
          if (!deletingBook) return;
          deleteBook.mutate(deletingBook.id, {
            onSuccess: () => {
              if (selectedNotebookId === deletingBook.id) setSelectedNotebookId(null);
              setDeletingBook(null);
            },
          });
        }}
        onClose={() => {
          deleteBook.reset();
          setDeletingBook(null);
        }}
      />
      {printing && printModule ? (
        <Suspense fallback={null}>
          <PrintModule
            moduleId={printModule.id}
            title={`${printModule.unitCode || printModule.shortName} notes`}
            onDone={() => setPrinting(false)}
          />
        </Suspense>
      ) : null}
    </Page>
  );
}

export default function NotesPage() {
  return (
    <Gate title="Notebook" description="Your own notes, saved as you type." signedIn>
      <NotesList />
    </Gate>
  );
}
