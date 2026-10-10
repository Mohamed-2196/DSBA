// Pictures in posts: the browser uploads straight to the bucket.
//   1. POST /api/v1/uploads { purpose: 'forum_image', fileName, contentType, sizeBytes } -> PresignedUpload
//   2. POST a multipart form to its url: every entry of `fields` first, then the file as `file` (no cookies)
//   3. POST /api/v1/uploads/{id}/complete -> { mediaUrl: '/api/v1/media/<id>' }, ready to go into the markdown
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, call } from '../../../api/client';
import { ApiError } from '../../../api/errors';
import type { PresignedUpload } from '../../../api/types';
import { altFromFileName } from './editing';
import { isMediaPath } from './links';

export const IMAGE_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',');
/** The API's limit (DSBA_MAX_IMAGE_MB); the server has the last word. */
export const MAX_IMAGE_MB = 8;

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
  /** 0..1 while uploading */
  progress: number;
  /** '/api/v1/media/<id>' once done */
  mediaUrl: string | null;
  error: string | null;
  /** whether trying the same file again can help */
  retryable: boolean;
}

class UploadFailed extends Error {}

/** What went wrong, in words a student can act on. */
function uploadErrorMessage(e: unknown): string {
  if (e instanceof UploadFailed) return e.message;
  if (e instanceof ApiError) {
    switch (e.code) {
      case 'unsupported_type':
        return e.message || "That file type can't be attached. Use a PNG, JPEG, WebP or GIF image.";
      case 'too_large':
        return e.message || `That image is too big. The limit is ${MAX_IMAGE_MB} MB.`;
      case 'rate_limited':
        return e.retryAfter
          ? `You've uploaded a lot of images. Try again in ${Math.max(1, Math.ceil(e.retryAfter / 60))} min.`
          : e.message || "You've uploaded a lot of images. Try again later.";
      case 'not_uploaded':
      case 'mismatch':
        return e.message || "The image didn't arrive in one piece. Try again.";
      default:
        return e.message || "The image couldn't be uploaded. Try again.";
    }
  }
  return "The image couldn't be uploaded. Try again.";
}

/** Trying the same file again can't fix a wrong type or a file that is too big. */
function isRetryable(e: unknown): boolean {
  return !(e instanceof ApiError && (e.code === 'unsupported_type' || e.code === 'too_large' || e.code === 'invalid_input'));
}

const EXTENSIONS: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'image/gif': ['gif'],
};

/** The file's name with an extension that matches its type (the API checks they agree): 'image' -> 'image.png'. */
export function uploadName(file: File): string {
  const name = (file.name || 'image').trim() || 'image';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const allowed = EXTENSIONS[file.type] ?? [];
  if (allowed.includes(ext)) return name;
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return `${stem || 'image'}.${allowed[0] ?? 'png'}`;
}

/** Checks the browser can do without asking the server. */
export function checkImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "That file type can't be attached. Use a PNG, JPEG, WebP or GIF image.";
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `That image is too big. The limit is ${MAX_IMAGE_MB} MB.`;
  return null;
}

/** POST the file to the bucket with the presigned form, reporting progress. Plain request: no cookies. */
function postToBucket(target: PresignedUpload, file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(target.fields)) form.append(k, v);
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', target.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else if (xhr.status === 400 && /EntityTooLarge/i.test(xhr.responseText)) reject(new UploadFailed(`That image is too big. The limit is ${MAX_IMAGE_MB} MB.`));
      else reject(new UploadFailed("The upload didn't go through. Try again."));
    };
    xhr.onerror = () => reject(new UploadFailed("The upload didn't go through. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

async function uploadImage(file: File, onProgress: (fraction: number) => void, signal: AbortSignal): Promise<string> {
  const target = await call(
    api.POST('/api/v1/uploads', {
      body: { purpose: 'forum_image', fileName: uploadName(file), contentType: file.type, sizeBytes: file.size },
      signal,
    }),
  );
  await postToBucket(target, file, onProgress, signal);
  const done = await call(api.POST('/api/v1/uploads/{upload_id}/complete', { params: { path: { upload_id: target.uploadId } }, signal }));
  if (!isMediaPath(done.mediaUrl)) throw new UploadFailed("The image was uploaded but can't be shown. Try another file.");
  return done.mediaUrl;
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
      uploadImage(file, (progress) => update(key, { progress }), controller.signal)
        .then((mediaUrl) => {
          if (controller.signal.aborted) return;
          update(key, { phase: 'done', progress: 1, mediaUrl });
          onUploadedRef.current({ key, mediaUrl, alt: altFromFileName(file.name || 'image') });
        })
        .catch((e: unknown) => {
          if (controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return;
          update(key, { phase: 'error', error: uploadErrorMessage(e), retryable: isRetryable(e) });
        })
        .finally(() => {
          if (controllers.current.get(key) === controller) controllers.current.delete(key);
        });
    },
    [update],
  );

  /** Upload a file; returns false (and shows the problem) when it can't be attached. */
  const start = useCallback(
    (file: File) => {
      seq += 1;
      const key = `img${seq}`;
      const previewUrl = IMAGE_TYPES.includes(file.type) ? URL.createObjectURL(file) : null;
      if (previewUrl) previews.current.set(key, previewUrl);
      files.current.set(key, file);
      const problem = checkImageFile(file);
      const item: ImageUpload = {
        key,
        fileName: file.name || 'image',
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
      if (file && !checkImageFile(file)) run(key, file);
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

/** '157 KB', '2.4 MB' */
export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
