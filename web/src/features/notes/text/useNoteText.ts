// The note's typed text: a TipTap editor (ProseMirror) with headings, lists, checklists, formulas, code, quotes,
// links, pictures and files. Markdown shortcuts work as they are typed: '# ' a heading, '- ' a list, '[ ] ' a
// checklist, '$x$' a formula, '$$ ' a formula on its own line. The note's document also holds the pictures free on its
// pages, beside the text (pictures/document.ts): the editor only ever gets and gives the text.
//
// Undo and redo go through the note's timeline (useTimeline), so they take back handwriting too: the editor's own
// shortcuts call it.
import { Extension } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import type { RichDoc } from '../draft';
import { textOf } from '../pictures/document';
import { BlockIds, idsTr } from './blockIds';
import { joinFormulaLines } from './mathText';
import { BlockMath, InlineMath, NoteFile, NotePicture } from './nodes';

/** Where files were dropped: on screen, and the place in the text there. */
export interface TextDrop {
  x: number;
  y: number;
  at: number | null;
}

export interface NoteTextOptions {
  /** the note's document when the editor is made (it starts with its text), and later the text from elsewhere (a new
   *  `content`: what the editor gave stays as it is) */
  doc: RichDoc;
  readOnly: boolean;
  onChange: (doc: RichDoc, text: string) => void;
  /** the text as plain text when the editor opens */
  onReady: (text: string) => void;
  /** files pasted (`drop` null) or dropped into the text */
  onFiles: (files: File[], drop: TextDrop | null) => void;
  /** the note's undo and redo (text and handwriting together) */
  onUndo: () => void;
  onRedo: () => void;
}

const plainOf = (editor: Editor) => editor.getText({ blockSeparator: '\n' });

/** The editor's history keeps more steps than the note's timeline, so the timeline never points at one it lost. */
const HISTORY_DEPTH = 500;

export function useNoteText({
  doc,
  readOnly,
  onChange,
  onReady,
  onFiles,
  onUndo,
  onRedo,
}: NoteTextOptions): Editor | null {
  // the text the editor holds now: a different one coming in (the other version, after a conflict) replaces it
  const emitted = useRef<unknown>(doc.content);
  const handlers = useRef({ onChange, onReady, onFiles, onUndo, onRedo });
  useEffect(() => {
    handlers.current = { onChange, onReady, onFiles, onUndo, onRedo };
  });

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            protocols: ['https', 'http', 'mailto'],
            HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
          },
          undoRedo: { depth: HISTORY_DEPTH },
          dropcursor: { color: '#1558f0', width: 2 },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Type here, or pick the pen and write by hand' }),
        InlineMath,
        BlockMath,
        NotePicture,
        NoteFile,
        BlockIds,
        Extension.create({
          name: 'noteHistoryKeys',
          priority: 1000,
          addKeyboardShortcuts: () => ({
            'Mod-z': () => {
              handlers.current.onUndo();
              return true;
            },
            'Shift-Mod-z': () => {
              handlers.current.onRedo();
              return true;
            },
            'Mod-y': () => {
              handlers.current.onRedo();
              return true;
            },
          }),
        }),
        Extension.create({
          name: 'noteBlockKeys',
          // Tab on a selected picture or file goes to its toolbar (Escape there comes back)
          addKeyboardShortcuts() {
            return {
              Tab: ({ editor: e }) => {
                const sel = e.state.selection;
                if (!(sel instanceof NodeSelection) || !['image', 'attachment'].includes(sel.node.type.name))
                  return false;
                const dom = e.view.nodeDOM(sel.from);
                const first =
                  dom instanceof HTMLElement
                    ? dom.querySelector<HTMLElement>('.nb-blockbar button:not(:disabled), .nb-blockbar a')
                    : null;
                if (!first) return false;
                first.focus();
                return true;
              },
            };
          },
        }),
      ],
      content: Array.isArray(doc.content) && doc.content.length ? textOf(doc) : null,
      editable: !readOnly,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class: 'nb-text',
          'aria-label': 'Typed notes',
          'data-hub': 'note-text',
          spellcheck: 'true',
          dir: 'auto',
        },
        // a formula pasted over several lines ($$ … $$) is set as one
        transformPastedText: (text) => joinFormulaLines(text),
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.length) return false;
          handlers.current.onFiles(files, null);
          return true;
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.length) return false;
          event.preventDefault();
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          handlers.current.onFiles(files, { x: event.clientX, y: event.clientY, at: at ? at.pos : null });
          return true;
        },
      },
      onCreate: ({ editor: e }) => {
        // a text written before blocks had ids gets them now (and is saved with them): not a step to undo
        const ids = idsTr(e.state);
        if (ids && e.isEditable) e.view.dispatch(ids.setMeta('addToHistory', false));
        handlers.current.onReady(plainOf(e));
      },
      onUpdate: ({ editor: e }) => {
        const json = e.getJSON() as RichDoc;
        emitted.current = json.content;
        handlers.current.onChange(json, plainOf(e));
      },
    },
    // One editor per note: the editor component is keyed by note.
    [],
  );

  // A text from elsewhere (the other version, loaded after a conflict): shown as it is.
  useEffect(() => {
    if (!editor || doc.content === emitted.current) return;
    emitted.current = doc.content;
    editor.commands.setContent(Array.isArray(doc.content) && doc.content.length ? textOf(doc) : '', {
      emitUpdate: false,
    });
  }, [editor, doc]);

  // Only the student's own changes count as an update: switching between reading and writing isn't one.
  useEffect(() => {
    if (editor && editor.isEditable === readOnly) editor.setEditable(!readOnly, false);
  }, [editor, readOnly]);

  return editor;
}
