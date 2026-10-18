// The editor's header: back to the notes, the note's title, and one line that says exactly where the note is kept
// and whether it is saved there ("Saved in ST2133 Statistics"), what it is about (a lesson) and what it is written
// on (a library PDF, with a way back to it). The notebook's name is a menu that moves the note to another one.
// On the right: the pages, export, full screen, and the rest in a menu (paper, delete).
import {
  ArrowLeft,
  ArrowSquareOut,
  ArrowsIn,
  ArrowsOut,
  CaretDown,
  CheckCircle,
  CloudSlash,
  DotsThree,
  FilePdf,
  Notebook as NotebookIcon,
  PlayCircle,
  Printer,
  SquaresFour,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../api/types';
import { IconButton, Menu, Spinner, cx, type MenuItem } from '../../ui';
import { lessonHref } from '../modules/public';
import { noteFileHref, useNotebooks } from './api';
import { lessonLabel, type NoteDoc, type Paper } from './draft';
import { useLessonPlace } from './lessonPlace';
import { TITLE_MAX } from './limits';
import type { SaveState } from './useNoteEditor';

const PAPERS: { value: Paper; label: string }[] = [
  { value: 'lined', label: 'Lined' },
  { value: 'grid', label: 'Squared' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'blank', label: 'Plain' },
];

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1);

interface NoteHeaderProps {
  doc: NoteDoc;
  note: Note | undefined;
  state: SaveState;
  /** the handwriting is still being read */
  opening: boolean;
  readOnly: boolean;
  onChange: (patch: Partial<NoteDoc>) => void;
  onBack: () => void;
  pagesShown: boolean;
  onPages: () => void;
  onExport: () => void;
  exporting: boolean;
  full: boolean;
  onFull: () => void;
  onDelete: () => void;
}

function SavedWhere({
  state,
  opening,
  readOnly,
  notebook,
}: {
  state: SaveState;
  opening: boolean;
  readOnly: boolean;
  notebook: ReactNode;
}) {
  let icon: ReactNode;
  let words: ReactNode;
  if (readOnly) {
    icon = <NotebookIcon aria-hidden="true" />;
    words = <>Read only, in {notebook}</>;
  } else if (opening) {
    icon = <Spinner size={14} />;
    words = <>Opening your handwriting, in {notebook}</>;
  } else if (state === 'saved') {
    icon = <CheckCircle aria-hidden="true" weight="fill" />;
    words = <>Saved in {notebook}</>;
  } else if (state === 'saving' || state === 'unsaved') {
    icon = <Spinner size={14} />;
    words = <>Saving to {notebook}</>;
  } else if (state === 'offline') {
    icon = <CloudSlash aria-hidden="true" />;
    words = <>Offline: kept on this device until it can be saved to {notebook}</>;
  } else if (state === 'conflict') {
    icon = <WarningCircle aria-hidden="true" weight="fill" />;
    words = <>Changed in another tab or on another device. Choose a version below</>;
  } else {
    icon = <WarningCircle aria-hidden="true" weight="fill" />;
    words = <>Not saved to {notebook}. Kept on this device</>;
  }
  return (
    <span className={cx('nb-saved', `is-${readOnly ? 'saved' : opening ? 'saving' : state}`)} data-hub="note-status">
      {icon}
      <span role="status" aria-live="polite">
        {words}
      </span>
    </span>
  );
}

export function NoteHeader({
  doc,
  note,
  state,
  opening,
  readOnly,
  onChange,
  onBack,
  pagesShown,
  onPages,
  onExport,
  exporting,
  full,
  onFull,
  onDelete,
}: NoteHeaderProps) {
  const notebooks = useNotebooks();
  const books = notebooks.data?.items ?? [];
  const book = books.find((b) => b.id === doc.notebookId);
  const bookName = book ? book.title : 'your notebook';
  const place = useLessonPlace(book?.moduleId ?? null, doc.lessonId);
  const pdf = note?.pdf ?? null;

  const notebookItems: MenuItem[] = [
    { heading: 'Move it to' },
    ...books.map((b) => ({
      id: b.id,
      label: b.title,
      icon: NotebookIcon,
      hint: b.id === doc.notebookId ? 'Here now' : undefined,
      disabled: b.id === doc.notebookId,
      onSelect: () => onChange({ notebookId: b.id, lessonId: null }),
    })),
  ];
  const notebook = readOnly ? (
    <strong>{bookName}</strong>
  ) : (
    <Menu
      label="Notebooks"
      items={notebookItems}
      trigger={
        <button type="button" className="nb-saved__book" data-hub="note-notebook">
          {bookName}
          <CaretDown aria-hidden="true" />
        </button>
      }
    />
  );

  const moreItems: MenuItem[] = [
    ...(doc.sheets > 0 || !pdf
      ? [
          { heading: 'Paper' } as MenuItem,
          ...PAPERS.map(
            (p): MenuItem => ({
              id: `paper-${p.value}`,
              label: p.label,
              hint: doc.paper === p.value ? 'Chosen' : undefined,
              onSelect: () => onChange({ paper: p.value }),
              disabled: readOnly,
            }),
          ),
          { divider: true } as MenuItem,
        ]
      : []),
    { id: 'export', label: 'Print or save as PDF', icon: Printer, onSelect: onExport },
    ...(readOnly
      ? []
      : [
          { divider: true } as MenuItem,
          { id: 'delete', label: 'Delete note', icon: Trash, danger: true, onSelect: onDelete },
        ]),
  ];

  return (
    <header className="nb-header" data-hub="notebook-header">
      <div className="nb-header__row">
        <Link to="/notes" className="nb-back" onClick={onBack} aria-label="All notes" title="All notes">
          <ArrowLeft aria-hidden="true" />
          <span>Notes</span>
        </Link>
        <input
          className="nb-title"
          aria-label="Title"
          placeholder="Untitled note"
          value={doc.title}
          maxLength={TITLE_MAX}
          readOnly={readOnly}
          dir="auto"
          onChange={(e) => onChange({ title: e.target.value })}
          data-hub="note-title"
        />
        <div className="nb-header__actions">
          <IconButton
            icon={SquaresFour}
            label={pagesShown ? 'Hide pages' : 'Pages'}
            toggle
            active={pagesShown}
            onClick={onPages}
            tooltip
            data-hub="note-pages"
          />
          <IconButton
            icon={Printer}
            label="Print or save as PDF"
            onClick={onExport}
            tooltip
            disabled={exporting}
            className="nb-header__wide"
            data-hub="note-export"
          />
          <IconButton
            icon={full ? ArrowsIn : ArrowsOut}
            label={full ? 'Leave full screen' : 'Full screen'}
            onClick={onFull}
            tooltip
            data-hub="note-full"
          />
          <Menu
            align="end"
            label="Note"
            items={moreItems}
            trigger={<IconButton icon={DotsThree} label="More" tooltip data-hub="note-more" />}
          />
        </div>
      </div>
      <div className="nb-header__where">
        <SavedWhere state={state} opening={opening} readOnly={readOnly} notebook={notebook} />
        {doc.lessonId && book?.moduleId ? (
          <span className="nb-where__chip">
            <PlayCircle aria-hidden="true" />
            <Link to={lessonHref(book.moduleId, doc.lessonId)}>About {lowerFirst(lessonLabel(place))}</Link>
            {readOnly ? null : (
              <button
                type="button"
                className="nb-where__remove"
                onClick={() => onChange({ lessonId: null })}
                aria-label="Not about this lesson"
                title="Not about this lesson"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </span>
        ) : null}
        {pdf ? (
          <span className="nb-where__chip">
            <FilePdf aria-hidden="true" />
            {pdf.available && pdf.slug ? (
              <Link to={`/library/${encodeURIComponent(pdf.slug)}`} title="Open the original in the library">
                Written on {pdf.title}
              </Link>
            ) : pdf.available && pdf.uploadId ? (
              <a href={noteFileHref(pdf.uploadId)} target="_blank" rel="noopener noreferrer" title="Open the original">
                Written on {pdf.title} <ArrowSquareOut aria-hidden="true" />
              </a>
            ) : (
              <span>Written on {pdf.title || 'a PDF'}, which isn’t available any more</span>
            )}
          </span>
        ) : null}
      </div>
    </header>
  );
}
