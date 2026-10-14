// What the student is writing to her, for the card and the full page alike: the words, the files in the tray (with a
// line about any left out), and which question is being edited. Pictures are let go of when they leave the tray
// without being sent, and all of them when the chat goes away.
import { useCallback, useEffect, useState } from 'react';
import { addFiles, release, releaseAll, type Attachment } from './files';
import type { Message } from './types';
import type { Chat } from './useChat';

export interface Draft {
  text: string;
  setText: (text: string) => void;
  files: Attachment[];
  /** a line about anything that could not be attached */
  fileNote: string | null;
  /** the question being edited (sending replaces it and what came after it), or null */
  editing: number | null;
  attach: (list: FileList | null) => void;
  removeFile: (file: Attachment) => void;
  /** send what is written; false when there is nothing to send or she is still answering */
  submit: () => boolean;
  /** put a question back in the box to edit it */
  edit: (message: Message) => void;
  cancelEdit: () => void;
  /** empty the box, the tray and the edit */
  reset: () => void;
}

export function useDraft(send: Chat['send']): Draft {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  // Leaving for good: let go of every picture, sent or still in the tray.
  useEffect(() => releaseAll, []);

  const attach = useCallback(
    (list: FileList | null) => {
      const picked = Array.from(list ?? []);
      if (!picked.length) return;
      const added = addFiles(files, picked);
      setFiles(added.list);
      setFileNote(added.note);
    },
    [files],
  );
  const removeFile = useCallback((file: Attachment) => {
    release(file);
    setFiles((list) => list.filter((f) => f !== file));
    setFileNote(null);
  }, []);
  const reset = useCallback(() => {
    setText('');
    setEditing(null);
    setFiles((list) => {
      list.forEach(release);
      return [];
    });
    setFileNote(null);
  }, []);
  const submit = () => {
    const words = text.trim();
    if (!words && !files.length) return false;
    if (!send({ text: words, attachments: files, edit: editing })) return false; // she is still answering
    setText('');
    setEditing(null);
    setFiles([]); // the pictures now belong to the message
    setFileNote(null);
    return true;
  };
  const edit = useCallback((message: Message) => {
    if (message.from !== 'me' || !message.text) return;
    setText(message.text);
    setEditing(message.id);
  }, []);
  const cancelEdit = useCallback(() => {
    setEditing(null);
    setText('');
  }, []);

  return { text, setText, files, fileNote, editing, attach, removeFile, submit, edit, cancelEdit, reset };
}
