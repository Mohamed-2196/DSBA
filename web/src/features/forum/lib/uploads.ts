// Pictures in posts, sent with the app's one upload pipeline (src/api/uploads.ts, purpose 'forum_image'): the
// browser uploads straight to the bucket with progress, the API checks what arrived, and the answer's mediaUrl
// ('/api/v1/media/<id>') goes into the markdown. Limits, accepted types and messages are the shared ones.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isApiError } from '../../../api/errors';
import { UPLOAD_RULES, canRetryUpload, checkUpload, fileExtension, progressPercent, uploadContentType, uploadErrorMessage, uploadFile } from '../../../api/uploads';
import { isMediaPath } from '../../../ui/safeHref';
import { altFromFileName } from './editing';

const PURPOSE = 'forum_image';
const RULES = UPLOAD_RULES[PURPOSE];

export type UploadPhase = 'uploading' | 'done' | 'error';

export interface ImageUpload {
  /** local id */
  key: string;
  fileName: string;
  size: number;
  /** a local preview (object URL), when the file is a picture we can show */
  previewUrl: string | null;
  /** a starting description for the picture */
  alt: string;
  phase: UploadPhase;
  /** 0–100 while uploading */
  progress: number;
  /** '/api/v1/media/<id>' once done */
  mediaUrl: string | null;
  error: string | null;
  /** whether trying the same file again can help */
  retryable: boolean;
}

/**
 * The name to declare for a picture. The API checks that the extension matches what the file is, so a picture
 * whose name doesn't say gets one that does: 'image' → 'image.png' (a pasted screenshot), 'photo.png' → 'photo.jpg'
 * (a JPEG). A file that isn't a picture the forum takes keeps its name, so the check before sending refuses it.
 */
export function uploadName(file: Pick<File, 'name' | 'type'>): string {
  const name = file.name.trim() || 'image';
  const ext = fileExtension(name);
  if (ext && RULES.types[ext] === file.type) return name;
  const fits = Object.keys(RULES.types).find((e) => RULES.types[e] === file.type);
  if (!fits) return name;
  const stem = ext ? name.slice(0, -(ext.length + 1)).trim() : name;
  return `${stem || 'image'}.${fits}`;
}

let seq = 0;

/** A finished upload, ready to go into the text. */
export interface UploadedImage {
  key: string;
  mediaUrl: string;
  alt: string;
}

/**
 * The pictures being attached to one post. `start(file)` uploads it; `onUploaded(image)` runs when it is ready to go
 * into the text. `remove(key)` cancels an upload in progress (or forgets a finished one) and frees its preview.
 */
export function useImageUploads(onUploaded: (image: UploadedImage) => void) {
  const [items, setItems] = useState<ImageUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const files = useRef(new Map<string, File>());
  const previews = useRef(new Map<string, string>());
  const onUploadedRef = useRef(onUploaded);
  useEffect(() => {
    onUploadedRef.current = onUploaded;
  });

  const update = useCallback((key: string, patch: Partial<ImageUpload>) => {
    setItems((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));
  }, []);

  const run = useCallback(
    (key: string, file: File) => {
      const controller = new AbortController();
      controllers.current.set(key, controller);
      update(key, { phase: 'uploading', progress: 0, error: null, retryable: false });
      uploadFile(PURPOSE, file, {
        fileName: uploadName(file),
        signal: controller.signal,
        onProgress: (p) => update(key, { progress: progressPercent(p) }),
      })
        .then(({ mediaUrl }) => {
          if (controller.signal.aborted) return;
          // Only a picture the API serves can go into a post (ui/safeHref.ts isMediaPath).
          if (!isMediaPath(mediaUrl)) throw new ApiError({ status: 0, code: 'upload_failed', message: 'The image was uploaded but can’t be shown. Try another file.' });
          update(key, { phase: 'done', progress: 100, mediaUrl });
          onUploadedRef.current({ key, mediaUrl, alt: altFromFileName(file.name || 'image') });
        })
        .catch((e: unknown) => {
          // Cancelled here (removed, or the composer went away): nothing to tell.
          if (controller.signal.aborted || (isApiError(e) && e.code === 'aborted')) return;
          update(key, { phase: 'error', error: uploadErrorMessage(e, PURPOSE), retryable: canRetryUpload(e) });
        })
        .finally(() => {
          if (controllers.current.get(key) === controller) controllers.current.delete(key);
        });
    },
    [update],
  );

  /** Upload a file; when it can't be attached, its card says why. */
  const start = useCallback(
    (file: File) => {
      seq += 1;
      const key = `img${seq}`;
      const name = uploadName(file);
      const previewUrl = uploadContentType(PURPOSE, name) ? URL.createObjectURL(file) : null;
      if (previewUrl) previews.current.set(key, previewUrl);
      files.current.set(key, file);
      const problem = checkUpload(PURPOSE, file, name);
      const item: ImageUpload = {
        key,
        fileName: file.name || name,
        size: file.size,
        previewUrl,
        alt: altFromFileName(file.name || 'image'),
        phase: problem ? 'error' : 'uploading',
        progress: 0,
        mediaUrl: null,
        error: problem,
        retryable: false,
      };
      setItems((list) => [...list, item]);
      if (!problem) run(key, file);
    },
    [run],
  );

  const retry = useCallback(
    (key: string) => {
      const file = files.current.get(key);
      if (file && !checkUpload(PURPOSE, file, uploadName(file))) run(key, file);
    },
    [run],
  );

  const remove = useCallback((key: string) => {
    controllers.current.get(key)?.abort();
    controllers.current.delete(key);
    files.current.delete(key);
    const url = previews.current.get(key);
    if (url) URL.revokeObjectURL(url);
    previews.current.delete(key);
    setItems((list) => list.filter((u) => u.key !== key));
  }, []);

  /** Forget everything (after posting). */
  const reset = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
    files.current.clear();
    for (const url of previews.current.values()) URL.revokeObjectURL(url);
    previews.current.clear();
    setItems([]);
  }, []);

  // Cancel uploads and free the previews when the composer goes away.
  useEffect(() => {
    const ctrls = controllers.current;
    const urls = previews.current;
    return () => {
      for (const c of ctrls.values()) c.abort();
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const busy = items.some((u) => u.phase === 'uploading');
  return { items, start, retry, remove, reset, busy };
}
