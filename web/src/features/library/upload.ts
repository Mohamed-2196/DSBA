// Uploading a file to the library: the browser sends it straight to the bucket with a presigned POST
// (POST /uploads), shows progress, then the API checks what arrived (POST /uploads/{id}/complete). The upload is
// turned into a library item afterwards (POST /library/items, see api.ts useCreateItem).
import { api, call } from '../../api/client';
import { ApiError, isApiError } from '../../api/errors';
import type { PresignedUpload, UploadOut } from '../../api/types';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, formatSize, uploadTypeFor } from './kinds';

export interface SendProgress {
  loaded: number;
  total: number;
}

const ACCEPTED = 'Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file.';

/** A quick check before anything is sent: null when the file can go, else what is wrong. */
export function checkFile(file: File): string | null {
  if (!uploadTypeFor(file)) return `This type of file can’t be added to the library. ${ACCEPTED}`;
  if (file.size === 0) return 'That file is empty. Choose another one.';
  if (file.size > MAX_UPLOAD_BYTES) {
    return `That file is ${formatSize(file.size)}, over the ${MAX_UPLOAD_MB} MB limit. Compress it or split it into parts.`;
  }
  return null;
}

const tooLarge = (maxBytes: number) =>
  new ApiError({ status: 422, code: 'too_large', message: `That file is over the ${Math.round(maxBytes / 1024 / 1024)} MB limit. Compress it or split it into parts.` });
const aborted = () => new ApiError({ status: 0, code: 'aborted', message: 'Upload cancelled.' });

/** S3 answers errors in XML: <Error><Code>EntityTooLarge</Code>…</Error>. */
function bucketError(status: number, body: string, maxBytes: number): ApiError {
  const code = /<Code>([^<]+)<\/Code>/.exec(body)?.[1] ?? '';
  if (code === 'EntityTooLarge') return tooLarge(maxBytes);
  if (code === 'AccessDenied' || code === 'InvalidPolicyDocument' || status === 403) {
    return new ApiError({ status, code: 'upload_refused', message: 'The upload was refused, perhaps because it took too long. Try again.' });
  }
  return new ApiError({ status, code: 'upload_failed', message: 'The file could not be uploaded. Try again in a moment.' });
}

/** POST the file to the bucket: every entry of `fields` first, then the file as `file`. No cookies go there. */
function postToBucket(p: PresignedUpload, file: File, onProgress?: (p: SendProgress) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(p.fields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', p.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.({ loaded: Math.min(e.loaded, file.size), total: file.size });
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size });
        resolve();
      } else {
        reject(bucketError(xhr.status, typeof xhr.responseText === 'string' ? xhr.responseText : '', p.maxBytes));
      }
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError({ status: 0, code: 'network', message: 'The upload stopped. Check your connection and try again.' }));
    };
    xhr.onabort = () => {
      done();
      reject(aborted());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    onProgress?.({ loaded: 0, total: file.size });
    xhr.send(form);
  });
}

/**
 * Send one file: presign, upload with progress, then let the API check the stored object.
 * Resolves to the checked upload, ready to become a library item. Rejects with an ApiError.
 */
export async function sendFile(
  file: File,
  { onProgress, onChecking, signal }: { onProgress?: (p: SendProgress) => void; onChecking?: () => void; signal?: AbortSignal } = {},
): Promise<UploadOut> {
  const contentType = uploadTypeFor(file) ?? (file.type || 'application/octet-stream');
  const presigned = await call(
    api.POST('/api/v1/uploads', { body: { purpose: 'library', fileName: file.name, contentType, sizeBytes: file.size }, signal }),
  );
  if (file.size > presigned.maxBytes) throw tooLarge(presigned.maxBytes);
  await postToBucket(presigned, file, onProgress, signal);
  onChecking?.();
  return call(api.POST('/api/v1/uploads/{upload_id}/complete', { params: { path: { upload_id: presigned.uploadId } }, signal }));
}

/** 'a minute', '12 minutes', 'an hour'. */
function waitLabel(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m >= 55) return 'an hour';
  return m === 1 ? 'a minute' : `${m} minutes`;
}

/** What to tell the student when an upload fails (the API's messages are written to be shown as they are). */
export function uploadErrorMessage(e: unknown): string {
  if (!isApiError(e)) return 'Something went wrong. Try again.';
  switch (e.code) {
    case 'unsupported_type':
      return e.message || `This type of file can’t be added to the library. ${ACCEPTED}`;
    case 'too_large':
      return e.message || `That file is over the ${MAX_UPLOAD_MB} MB limit. Compress it or split it into parts.`;
    case 'mismatch':
      return e.message || 'This file doesn’t match what was declared. Choose the file again.';
    case 'not_uploaded':
      return e.message || 'The file didn’t arrive. Try again.';
    case 'rate_limited':
      return e.retryAfter ? `You’ve uploaded a lot in the last hour. Try again in ${waitLabel(e.retryAfter)}.` : e.message;
    case 'unauthenticated':
      return 'You were signed out. Sign in again, then retry.';
    default:
      return e.message || 'Something went wrong. Try again.';
  }
}
