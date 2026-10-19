// Pictures and files added to a note: chosen, pasted or dropped. Each one is checked before it travels, a big photo
// is made smaller first (a note's pictures don't need more than PICTURE_MAX pixels a side), and it uploads with its
// progress shown; once it is in, `place` puts it where it goes (free on the page, or in the text). Failures say why.
import { useCallback, useState } from 'react';
import { checkUpload, progressPercent, uploadErrorMessage, uploadFile } from '../../api/uploads';
import { useToast } from '../../state';
import { ALT_MAX } from './pictures/geometry';

/** The longest side a picture keeps; bigger ones are scaled down before they upload. */
export const PICTURE_MAX = 2400;
const PICTURE = /^image\/(png|jpeg|webp|gif)$/;

/** Whether a file is a picture a note shows (the others are files to open). */
export const isPicture = (file: Pick<File, 'type'>): boolean => PICTURE.test(file.type);

export interface PendingUpload {
  id: string;
  name: string;
  /** 0-100 */
  percent: number;
  cancel: () => void;
}

/** A file that is in: its upload, name and size, and for a picture its own size and the description its name gives. */
export interface Uploaded {
  upload: string;
  name: string;
  size: number;
  picture: { width: number; height: number; alt: string } | null;
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
    return {
      file: new File([blob], file.name, { type: file.type, lastModified: file.lastModified }),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    bitmap.close();
  }
}

/** The description a picture's file name gives it ('whiteboard_week-4.jpg': 'whiteboard week 4'), and none for the
 *  names pasted screenshots get. */
export function altFromName(name: string): string {
  const alt = name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return /^(image|screenshot|clipboard)$/i.test(alt) ? '' : alt.slice(0, ALT_MAX);
}

export function useNoteUploads() {
  const { push } = useToast();
  const [pending, setPending] = useState<PendingUpload[]>([]);

  const update = (id: string, patch: Partial<PendingUpload>) =>
    setPending((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const drop = (id: string) => setPending((list) => list.filter((p) => p.id !== id));

  const add = useCallback(
    async (files: readonly File[], place: (done: Uploaded) => void) => {
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
          const picture = isPicture(original) ? await preparePicture(original).catch(() => null) : null;
          const file = picture?.file ?? original;
          const out = await uploadFile('note_file', file, {
            signal: abort.signal,
            onProgress: (p) => update(id, { percent: progressPercent(p) }),
          });
          place({
            upload: out.uploadId,
            name: original.name,
            size: file.size,
            picture: picture ? { width: picture.width, height: picture.height, alt: altFromName(original.name) } : null,
          });
        } catch (e) {
          if (!abort.signal.aborted)
            push({
              title: `${original.name || 'That file'} wasn’t added`,
              body: uploadErrorMessage(e, 'note_file'),
              tone: 'alert',
            });
        } finally {
          drop(id);
        }
      }
    },
    [push],
  );

  return { pending, add };
}
