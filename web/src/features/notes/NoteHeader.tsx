// The editor's header (docs/design/deskmates/screens/notebook-*): back to the notes and the module the note is about,
// the note's title at display size (it wraps on a phone), and one line that says exactly where the note is kept and
// whether it is saved there ("Saved in ST2133 Statistics"), what it is about (a module and a lesson) and what it is
// written on (a library PDF, with a way back to it). The notebook's name is a menu that moves the note to another one;
// the module is a menu that sets it (a note in a module's notebook goes to the new module's: the server says). On the
// right: the pages, Print or save as PDF, full screen, and the rest in a menu (paper, delete).
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Note } from '../../api/types';
import { moduleLabel } from '../../lib/modules';
import { useAuth } from '../../auth';
import { BREAKPOINTS, useMediaQuery, useYear } from '../../state';
import { useModules } from '../../state/modules';
import { Button, Icon, IconButton, Menu, Spinner, cx, glyph, type MenuItem } from '../../ui';
import { lessonHref } from '../modules/public';
import { noteFileHref, useNotebooks } from './api';
import { lessonLabel, type NoteDoc, type Paper } from './draft';
import { useLessonPlace } from './lessonPlace';
import { TITLE_MAX } from './limits';
import { ShareNote } from './shared/ShareNote';
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
  /** in the lesson panel: its own actions instead of the way back, the pages and full screen */
  panel: ReactNode | null;
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
    icon = <Icon glyph={glyph.notebook} />;
    words = <>Read only, in {notebook}</>;
  } else if (opening) {
    icon = <Spinner size={14} />;
    words = <>Opening your handwriting, in {notebook}</>;
  } else if (state === 'saved') {
    icon = <Icon glyph={glyph.check} />;
    words = <>Saved in {notebook}</>;
  } else if (state === 'saving' || state === 'unsaved') {
    icon = <Spinner size={14} />;
    words = <>Saving to {notebook}</>;
  } else if (state === 'offline') {
    icon = <Icon glyph={glyph.offline} />;
    words = <>Offline: kept on this device until it can be saved to {notebook}</>;
  } else if (state === 'conflict') {
    icon = <Icon glyph={glyph.warning} />;
    words = <>Changed in another tab or on another device. Choose a version below</>;
  } else {
    icon = <Icon glyph={glyph.warning} />;
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
  panel,
}: NoteHeaderProps) {
  const notebooks = useNotebooks();
  const { featureOn } = useAuth();
  const phone = useMediaQuery(BREAKPOINTS.mobile);
  const sharing = !!note && !readOnly && featureOn('notes.share');
  const books = notebooks.data?.items ?? [];
  const book = books.find((b) => b.id === doc.notebookId);
  const bookName = book ? book.title : 'your notebook';
  const place = useLessonPlace(doc.moduleId, doc.lessonId);
  const pdf = note?.pdf ?? null;
  const { getModule, getModulesForYear } = useModules();
  const { year } = useYear();
  const module = getModule(doc.moduleId);

  /** The note about `moduleId`: its lesson stays only while the module does. */
  const about = (moduleId: string | null): Partial<NoteDoc> => ({
    moduleId,
    lessonId: moduleId === doc.moduleId ? doc.lessonId : null,
  });
  const notebookItems: MenuItem[] = [
    { heading: 'Move it to' },
    ...books.map((b) => ({
      id: b.id,
      label: b.title,
      icon: <Icon glyph={glyph.notebook} />,
      hint: b.id === doc.notebookId ? 'Here now' : undefined,
      disabled: b.id === doc.notebookId,
      // a module's notebook holds that module's notes
      onSelect: () => onChange({ notebookId: b.id, ...about(b.moduleId ?? doc.moduleId) }),
    })),
  ];
  // the student's year's modules (and the note's own, when it is another year's)
  const choices = [...getModulesForYear(year)];
  if (module && !choices.some((m) => m.id === module.id)) choices.unshift(module);
  const moduleItems: MenuItem[] = [
    { heading: 'What it’s about' },
    ...choices.map(
      (m): MenuItem => ({
        id: `module-${m.id}`,
        label: moduleLabel(m),
        hint: m.id === doc.moduleId ? 'Chosen' : undefined,
        onSelect: () => onChange(about(m.id)),
      }),
    ),
    { divider: true },
    {
      id: 'module-none',
      label: 'No module',
      hint: doc.moduleId ? undefined : 'Chosen',
      onSelect: () => onChange(about(null)),
    },
  ];
  const moduleName = module ? (module.unitCode ?? module.shortName) : 'No module';
  const notebook = readOnly ? (
    <strong>{bookName}</strong>
  ) : (
    <Menu
      label="Notebooks"
      items={notebookItems}
      trigger={
        <button type="button" className="nb-saved__book" data-hub="note-notebook">
          {bookName}
          <Icon glyph={glyph.chevronDown} />
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
    { id: 'export', label: 'Print or save as PDF', icon: glyph.print, onSelect: onExport },
    ...(readOnly
      ? []
      : [
          { divider: true } as MenuItem,
          { id: 'delete', label: 'Delete note', icon: <Icon glyph={glyph.trash} />, danger: true, onSelect: onDelete },
        ]),
  ];

  return (
    <header className="nb-header" data-hub="notebook-header">
      <div className="nb-header__row">
        {panel ? null : (
          <nav className="nb-crumbs" aria-label="Breadcrumb">
            <Link to="/notes" className="nb-back" onClick={onBack}>
              <Icon glyph={glyph.chevronLeft} />
              <span>Notebook</span>
            </Link>
            {module ? (
              <span className="nb-crumbs__module">
                <span aria-hidden="true">/</span> {moduleLabel(module)}
              </span>
            ) : null}
          </nav>
        )}
        <div className="nb-header__actions">
          {panel ? (
            <Menu
              align="end"
              label="Note"
              items={moreItems}
              trigger={<IconButton icon={<Icon glyph={glyph.more} />} label="More" tooltip data-hub="note-more" />}
            />
          ) : null}
          {panel ?? (
            <>
              {sharing && note ? (
                <ShareNote note={note} saved={state === 'saved'} moduleId={doc.moduleId} compact={phone} />
              ) : null}
              <IconButton
                icon={<Icon glyph={glyph.page} />}
                label={pagesShown ? 'Hide pages' : 'Pages'}
                toggle
                active={pagesShown}
                onClick={onPages}
                tooltip
                data-hub="note-pages"
              />
              <Button
                size="sm"
                onClick={onExport}
                disabled={exporting}
                className="nb-header__wide"
                data-hub="note-export"
              >
                Print or save as PDF
              </Button>
              <IconButton
                icon={full ? glyph.collapse : glyph.expand}
                label={full ? 'Leave full screen' : 'Full screen'}
                onClick={onFull}
                tooltip
                data-hub="note-full"
              />
              <Menu
                align="end"
                label="Note"
                items={moreItems}
                trigger={<IconButton icon={<Icon glyph={glyph.more} />} label="More" tooltip data-hub="note-more" />}
              />
            </>
          )}
        </div>
      </div>
      <textarea
        className="nb-title"
        aria-label="Title"
        placeholder="Untitled note"
        value={doc.title}
        maxLength={TITLE_MAX}
        readOnly={readOnly}
        rows={1}
        dir="auto"
        // one line of words: Enter goes nowhere, and a pasted line break becomes a space
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.preventDefault();
        }}
        onChange={(e) => onChange({ title: e.target.value.replace(/[\r\n]+/g, ' ') })}
        data-hub="note-title"
      />
      <div className="nb-header__where">
        <SavedWhere state={state} opening={opening} readOnly={readOnly} notebook={notebook} />
        {readOnly ? (
          module ? (
            <span className="nb-where__chip nb-where__module">{moduleName}</span>
          ) : null
        ) : (
          <Menu
            label="Module"
            items={moduleItems}
            trigger={
              <button
                type="button"
                className={cx('nb-where__chip nb-where__module', !module && 'is-unset')}
                aria-label={
                  module ? `Module: ${moduleLabel(module)}. Change it` : 'Choose the module this note is about'
                }
                data-hub="note-module"
              >
                {module ? moduleName : 'Add a module'}
                <Icon glyph={glyph.chevronDown} />
              </button>
            }
          />
        )}
        {doc.lessonId && doc.moduleId ? (
          <span className="nb-where__chip">
            <Icon glyph={glyph.video} />
            <Link to={lessonHref(doc.moduleId, doc.lessonId)}>About {lowerFirst(lessonLabel(place))}</Link>
            {readOnly ? null : (
              <button
                type="button"
                className="nb-where__remove"
                onClick={() => onChange({ lessonId: null })}
                aria-label="Not about this lesson"
                title="Not about this lesson"
              >
                <Icon glyph={glyph.close} />
              </button>
            )}
          </span>
        ) : null}
        {pdf ? (
          <span className="nb-where__chip">
            <Icon glyph={glyph.page} />
            {pdf.available && pdf.slug ? (
              <Link to={`/library/${encodeURIComponent(pdf.slug)}`} title="Open the original in the library">
                Written on {pdf.title}
              </Link>
            ) : pdf.available && pdf.uploadId ? (
              <a href={noteFileHref(pdf.uploadId)} target="_blank" rel="noopener noreferrer" title="Open the original">
                Written on {pdf.title} <Icon glyph={glyph.external} />
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
