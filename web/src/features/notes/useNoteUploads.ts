// Pictures and files added to a note: chosen, pasted or dropped. Each one is checked before it travels, a big photo
// is made smaller first (a note's pictures don't need more than PICTURE_MAX pixels a side), it uploads with its
// progress shown, and it goes into the text where it was dropped or where the cursor is. Failures say why.
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { checkUpload, progressPercent, uploadErrorMessage, uploadFile } from '../../api/uploads';
import { useToast } from '../../state';
import { TEXT_WIDTH } from './surface/layout';
import { startWidth } from './text/picture';

/** The longest side a picture keeps; bigger ones are scaled down before they upload. */
export const PICTURE_MAX = 2400;
const PICTURE = /^image\/(png|jpeg|webp|gif)$/;

export interface PendingUpload {
  id: string;
  name: string;
  /** 0-100 */
  percent: number;
  cancel: () => void;
}

interface Measured {
  file: File;
  width: number;
  height: number;
}

/** A picture's size, made smaller (same type) when a side is over PICTURE_MAX. GIFs are left as they are (they may
 *  move). Turned photos come out the right way up (the browser applies their orientation). */
async function preparePicture(file: File): Promise<Measured> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = bitmap;
    const scale = PICTURE_MAX / Math.max(width, height);
    if (scale >= 1 || file.type === 'image/gif') return { file, width, height };
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, file.type, 0.88));
    if (!blob || blob.size >= file.size) return { file, width, height };
    return { file: new File([blob], file.name, { type: file.type, lastModified: file.lastModified }), width: canvas.width, height: canvas.height };
  } finally {
    bitmap.close();
  }
}

export function useNoteUploads(editor: Editor | null) {
  const { push } = useToast();
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const update = (id: string, patch: Partial<PendingUpload>) => setPending((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const drop = (id: string) => setPending((list) => list.filter((p) => p.id !== id));

  const add = useCallback(
    async (files: readonly File[], at: number | null = null) => {
      for (const original of files) {
        const problem = checkUpload('note_file', original);
        if (problem) {
          push({ title: `${original.name || 'That file'} wasn’t added`, body: problem, tone: 'alert' });
          continue;
        }
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const abort = new AbortController();
        setPending((list) => [...list, { id, name: original.name, percent: 0, cancel: () => abort.abort() }]);
        try {
          const picture = PICTURE.test(original.type) ? await preparePicture(original).catch(() => null) : null;
          const file = picture?.file ?? original;
          const out = await uploadFile('note_file', file, { signal: abort.signal, onProgress: (p) => update(id, { percent: progressPercent(p) }) });
          const ed = editorRef.current;
          if (!ed || ed.isDestroyed) continue;
          const place = at !== null && at <= ed.state.doc.content.size ? at : null;
          if (picture) {
            const alt = original.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim();
            ed.chain()
              .focus()
              .insertNotePicture({ upload: out.uploadId, alt: alt === 'image' ? '' : alt, ratio: picture.width / Math.max(1, picture.height), width: startWidth(picture.width, TEXT_WIDTH) }, place)
              .run();
          } else {
            ed.chain().focus().insertNoteFile({ upload: out.uploadId, name: original.name, size: file.size }, place).run();
          }
        } catch (e) {
          if (!abort.signal.aborted) push({ title: `${original.name || 'That file'} wasn’t added`, body: uploadErrorMessage(e, 'note_file'), tone: 'alert' });
        } finally {
          drop(id);
        }
      }
    },
    [push],
  );

  return { pending, add };
}
