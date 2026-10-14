// The note's typed text: a TipTap editor (ProseMirror) with headings, lists, checklists, formulas, code, quotes,
// links, pictures and files. Markdown shortcuts work as they are typed: '# ' a heading, '- ' a list, '[ ] ' a
// checklist, '$x$' a formula, '$$ ' a formula on its own line.
import { Placeholder } from '@tiptap/extensions';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef } from 'react';
import type { RichDoc } from '../draft';
import { BlockMath, InlineMath, NoteFile, NotePicture } from './nodes';

export interface NoteTextOptions {
  doc: RichDoc | null;
  readOnly: boolean;
  onChange: (doc: RichDoc, text: string) => void;
  /** the text as plain text when the editor opens */
  onReady: (text: string) => void;
  /** files pasted or dropped into the text */
  onFiles: (files: File[]) => void;
}

const plainOf = (editor: Editor) => editor.getText({ blockSeparator: '\n' });

export function useNoteText({ doc, readOnly, onChange, onReady, onFiles }: NoteTextOptions): Editor | null {
  const emitted = useRef<RichDoc | null>(null);
  const handlers = useRef({ onChange, onReady, onFiles });
  useEffect(() => {
    handlers.current = { onChange, onReady, onFiles };
  });

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true, protocols: ['https', 'http', 'mailto'], HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Type here, or pick the pen and write by hand' }),
        InlineMath,
        BlockMath,
        NotePicture,
        NoteFile,
      ],
      content: doc && Array.isArray(doc.content) && doc.content.length ? doc : null,
      editable: !readOnly,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: { class: 'nb-text', 'aria-label': 'Typed notes', 'data-hub': 'note-text', spellcheck: 'true', dir: 'auto' },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (!files.length) return false;
          handlers.current.onFiles(files);
          return true;
        },
        handleDrop: (_view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (!files.length) return false;
          event.preventDefault();
          handlers.current.onFiles(files);
          return true;
        },
      },
      onCreate: ({ editor: e }) => {
        emitted.current = doc;
        handlers.current.onReady(plainOf(e));
      },
      onUpdate: ({ editor: e }) => {
        const json = e.getJSON() as RichDoc;
        emitted.current = json;
        handlers.current.onChange(json, plainOf(e));
      },
    },
    // One editor per note: the editor component is keyed by note.
    [],
  );

  // A document from elsewhere (the other version, loaded after a conflict): shown as it is.
  useEffect(() => {
    if (!editor || !doc || doc === emitted.current) return;
    emitted.current = doc;
    editor.commands.setContent(Array.isArray(doc.content) && doc.content.length ? doc : '', { emitUpdate: false });
  }, [editor, doc]);

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  return editor;
}
