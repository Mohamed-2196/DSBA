// Uploading a file straight to the bucket, for every purpose: library files, pictures in forum posts and the
// newsletter, and screenshots in bug reports.
// The pipeline, its limits, accepted types and messages.
//   1. POST /api/v1/uploads { purpose, fileName, contentType, sizeBytes } -> a presigned POST (PresignedUpload)
//   2. POST a form to its url: every entry of `fields` first, then the file as `file` (XHR for progress; no cookies)
//   3. POST /api/v1/uploads/{id}/complete -> the API checks what arrived (size, type, first bytes) -> UploadOut
// The allowlists and limits mirror api/app/services/uploads.py and the API's settings (DSBA_MAX_UPLOAD_MB,
// DSBA_MAX_IMAGE_MB). The checks here only save a wasted upload: the API has the last word.
import { api, call } from './client';
import { ApiError, errorMessage, isApiError } from './errors';
import type { PresignedUpload, UploadCreate, UploadOut } from './types';

/** What an upload is for: a library file, a picture in a forum post or the newsletter, or a bug report's screenshot. */
export type UploadPurpose = UploadCreate['purpose'];

export interface UploadRules {
  /** Allowed extensions (lower case, without the dot) and the content type declared for each. */
  types: Readonly<Record<string, string>>;
  /** The size limit, in MB (binary, as the API counts it). */
  maxMb: number;
  /** `accept` for the file picker. */
  accept: string;
  /** One line under a drop zone or a picker: what can be sent, and how big. */
  summary: string;
  /** What to send instead, after a refusal: "Use a PDF, … file." */
  allowed: string;
  /** The first sentence when the type is refused. */
  refused: string;
  /** What is being sent, in a sentence: 'file', 'image'. */
  noun: string;
  /** What to do about a file that is too big. */
  smaller: string;
}

const PDF = 'application/pdf';
const JPEG = 'image/jpeg';
const PNG = 'image/png';
const WEBP = 'image/webp';

const LIBRARY_TYPES: Readonly<Record<string, string>> = {
  pdf: PDF,
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ipynb: 'application/x-ipynb+json',
  r: 'text/x-r',
  txt: 'text/plain',
  csv: 'text/csv',
  // Pictures (decision D9): a photo of handwritten notes or a whiteboard, a scanned page.
  jpg: JPEG,
  jpeg: JPEG,
  png: PNG,
  webp: WEBP,
};

const IMAGE_TYPES: Readonly<Record<string, string>> = { png: PNG, jpg: JPEG, jpeg: JPEG, webp: WEBP, gif: 'image/gif' };
const PICTURE_TYPES: Readonly<Record<string, string>> = { png: PNG, jpg: JPEG, jpeg: JPEG, webp: WEBP };
const BOARD_TYPES: Readonly<Record<string, string>> = { ...LIBRARY_TYPES, gif: 'image/gif' };

/** The picker lists extensions, plus the picture types so phones offer their photos and camera. */
function acceptFor(types: Readonly<Record<string, string>>, mime: readonly string[]): string {
  const exts = Object.keys(types).flatMap((ext) => (ext === 'r' ? ['.r', '.R'] : [`.${ext}`]));
  return [...exts, ...mime].join(',');
}

export const UPLOAD_RULES: Readonly<Record<UploadPurpose, UploadRules>> = {
  library: {
    types: LIBRARY_TYPES,
    maxMb: 50,
    accept: acceptFor(LIBRARY_TYPES, [JPEG, PNG, WEBP]),
    summary: 'PDF, Word, Excel, PowerPoint, Jupyter notebook, R script, text or CSV file, or a JPG, PNG or WebP picture. Up to 50 MB.',
    allowed: 'Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file, or a JPG, PNG or WebP picture.',
    refused: 'This type of file can’t be added to the library.',
    noun: 'file',
    smaller: 'Compress it or split it into parts.',
  },
  forum_image: {
    types: IMAGE_TYPES,
    maxMb: 8,
    accept: [PNG, JPEG, WEBP, 'image/gif'].join(','),
    summary: 'PNG, JPEG, WebP or GIF, up to 8 MB.',
    allowed: 'Use a PNG, JPEG, WebP or GIF image.',
    refused: 'That file type can’t be attached.',
    noun: 'image',
    smaller: 'Save a smaller copy and try again.',
  },
  newsletter_image: {
    types: PICTURE_TYPES,
    maxMb: 8,
    accept: [PNG, JPEG, WEBP].join(','),
    summary: 'PNG, JPEG or WebP, up to 8 MB.',
    allowed: 'Use a PNG, JPEG or WebP image.',
    refused: 'That file type can’t go in the newsletter.',
    noun: 'picture',
    smaller: 'Save a smaller copy and try again.',
  },
  bug_screenshot: {
    types: PICTURE_TYPES,
    maxMb: 8,
    accept: [PNG, JPEG, WEBP].join(','),
    summary: 'PNG, JPEG or WebP, up to 8 MB.',
    allowed: 'Use a PNG, JPEG or WebP image.',
    refused: 'That file type can’t be attached.',
    noun: 'screenshot',
    smaller: 'Save a smaller copy and try again.',
  },
  board: {
    types: BOARD_TYPES,
    maxMb: 50,
    accept: acceptFor(BOARD_TYPES, [JPEG, PNG, WEBP, 'image/gif']),
    summary: 'Files and pictures up to 50 MB.',
    allowed: 'Use a PDF, Word, Excel, PowerPoint, notebook (.ipynb), R script, text or CSV file, or a picture.',
    refused: 'This type of file can’t be attached to a card.',
    noun: 'file',
    smaller: 'Compress it or choose a smaller file.',
  },
};

export function maxUploadBytes(purpose: UploadPurpose): number {
  return UPLOAD_RULES[purpose].maxMb * 1024 * 1024;
}

// ── Names, types and sizes ────────────────────────────────────────────────────

/** A file name's extension, lower case, as the API reads it: 'Week 3.PDF' -> 'pdf'; null without one ('.pdf', 'notes'). */
export function fileExtension(name: string | null | undefined): string | null {
  const s = (name ?? '').trim();
  const dot = s.lastIndexOf('.');
  if (dot <= 0 || !s.slice(0, dot).trim()) return null;
  const ext = s.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : null;
}

/** The content type to declare for a file name (from its extension: browsers often leave notebooks and R scripts
 *  blank), or null when the purpose doesn't take that kind of file. */
export function uploadContentType(purpose: UploadPurpose, fileName: string): string | null {
  const ext = fileExtension(fileName);
  return ext ? (UPLOAD_RULES[purpose].types[ext] ?? null) : null;
}

/** '0 KB', '412 KB', '3.4 MB', '23 MB' (binary units, as file managers show them); '' when unknown. */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** A quick check before anything is sent: null when the file can go, else what is wrong (in words). */
export function checkUpload(purpose: UploadPurpose, file: Pick<File, 'name' | 'size'>, fileName: string = file.name): string | null {
  const rules = UPLOAD_RULES[purpose];
  if (!uploadContentType(purpose, fileName)) return `${rules.refused} ${rules.allowed}`;
  if (file.size <= 0) return 'That file is empty. Choose another one.';
  if (file.size > maxUploadBytes(purpose)) {
    return `That ${rules.noun} is ${formatSize(file.size)}, over the ${rules.maxMb} MB limit. ${rules.smaller}`;
  }
  return null;
}

// ── Progress ──────────────────────────────────────────────────────────────────

export interface UploadProgress {
  /** bytes of the file sent so far */
  loaded: number;
  /** the file's size */
  total: number;
}

/** 0–100. */
export function progressPercent({ loaded, total }: UploadProgress): number {
  return total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : 0;
}

/** 'Uploading… 42% (2.1 MB of 5.0 MB)'. Sizes only once bytes have moved: never '0% (1 KB of 1 KB)' (UX review UX-12). */
export function progressText(p: UploadProgress): string {
  const pct = progressPercent(p);
  return p.loaded > 0 ? `Uploading… ${pct}% (${formatSize(p.loaded)} of ${formatSize(p.total)})` : `Uploading… ${pct}%`;
}

// ── Errors ────────────────────────────────────────────────────────────────────

const abortedError = () => new ApiError({ status: 0, code: 'aborted', message: 'Upload cancelled.' });

function tooLarge(purpose: UploadPurpose, status = 422): ApiError {
  const rules = UPLOAD_RULES[purpose];
  return new ApiError({ status, code: 'too_large', message: `That ${rules.noun} is over the ${rules.maxMb} MB limit. ${rules.smaller}` });
}

/** The bucket refused or failed the POST. S3 and MinIO say why in XML:
 *  <Error><Code>EntityTooLarge</Code><Message>…</Message></Error>. */
export function bucketError(status: number, body: string, purpose: UploadPurpose): ApiError {
  const code = /<Code>\s*([^<]*?)\s*<\/Code>/i.exec(body)?.[1] ?? '';
  const failed = (message: string) => new ApiError({ status, code: 'upload_failed', message });
  switch (code) {
    case 'EntityTooLarge':
      return tooLarge(purpose, status);
    case 'EntityTooSmall':
      return failed('That file is empty. Choose another one.');
    case 'RequestTimeout':
      return failed('The upload took too long. Try again, on a faster connection if you can.');
    case 'SlowDown':
    case 'ServiceUnavailable':
    case 'InternalError':
      return failed('File storage is busy. Try again in a moment.');
    default:
      break;
  }
  if (status === 403 || code === 'AccessDenied' || code === 'InvalidPolicyDocument' || code === 'ExpiredToken') {
    // The presigned form lives 5 minutes and pins the file's name, type and size.
    return new ApiError({ status, code: 'upload_refused', message: 'The upload was refused, perhaps because it took too long. Try again.' });
  }
  return failed('The file couldn’t be uploaded. Try again in a moment.');
}

/** 'a minute', '12 minutes', 'an hour'. */
export function waitLabel(seconds: number): string {
  const m = Math.max(1, Math.ceil(seconds / 60));
  if (m >= 55) return 'an hour';
  return m === 1 ? 'a minute' : `${m} minutes`;
}

/** What to tell the person when an upload failed. The API's messages are written to be shown as they are (they say
 *  what to do); these are the fallbacks, and the words for failures that never reached the API. */
export function uploadErrorMessage(e: unknown, purpose: UploadPurpose): string {
  if (!isApiError(e)) return 'Something went wrong. Try again.';
  const rules = UPLOAD_RULES[purpose];
  switch (e.code) {
    case 'aborted':
      return 'Upload cancelled.';
    case 'unsupported_type':
      return e.message || `${rules.refused} ${rules.allowed}`;
    case 'too_large':
      return e.message || tooLarge(purpose).message;
    case 'mismatch':
      return e.message || `This ${rules.noun} isn’t what its name says. Save or export it again, or choose another one.`;
    case 'not_uploaded':
      return e.message || 'The file didn’t arrive. Try again.';
    case 'too_many_pending':
      return e.message || 'You have 10 files waiting for review. Share more once a student rep has looked at them.';
    case 'rate_limited':
      return e.message || (e.retryAfter ? `You’ve uploaded a lot in the last hour. Try again in ${waitLabel(e.retryAfter)}.` : 'You’ve uploaded a lot in the last hour. Try again later.');
    case 'unauthenticated':
      return 'You were signed out. Sign in again, then try again.';
    case 'forbidden':
      return e.message || `Your account can’t upload ${rules.noun}s right now.`;
    case 'upload_refused':
    case 'upload_failed':
      return e.message || 'The file couldn’t be uploaded. Try again in a moment.';
    default:
      return errorMessage(e);
  }
}

/** Whether sending the same file again can help (a dropped connection can; a wrong type, a file that is too big,
 *  or contents that don't match the name can't). */
export function canRetryUpload(e: unknown): boolean {
  if (!isApiError(e)) return true;
  return !['unsupported_type', 'too_large', 'mismatch', 'invalid_input', 'too_many_pending', 'forbidden'].includes(e.code);
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** POST the file to the bucket with the presigned form: every entry of `fields` first, then the file as `file`.
 *  A plain cross-origin request: no cookies go to the bucket. */
function postToBucket(
  target: PresignedUpload,
  file: File,
  purpose: UploadPurpose,
  onProgress?: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const form = new FormData();
    for (const [name, value] of Object.entries(target.fields)) form.append(name, value);
    form.append('file', file);

    const xhr = new XMLHttpRequest();
    const onAbort = () => xhr.abort();
    const done = () => signal?.removeEventListener('abort', onAbort);
    xhr.open('POST', target.url);
    xhr.withCredentials = false;
    xhr.upload.onprogress = (e) => {
      // The body is the form: scale to the file, so the bar ends with the file and not with the form's fields.
      if (e.lengthComputable && e.total > 0) onProgress?.({ loaded: Math.round((Math.min(e.loaded, e.total) / e.total) * file.size), total: file.size });
    };
    xhr.onload = () => {
      done();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.({ loaded: file.size, total: file.size });
        resolve();
      } else {
        reject(bucketError(xhr.status, typeof xhr.responseText === 'string' ? xhr.responseText : '', purpose));
      }
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError({ status: 0, code: 'upload_failed', message: 'The upload stopped. Check your connection and try again.' }));
    };
    xhr.onabort = () => {
      done();
      reject(abortedError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    onProgress?.({ loaded: 0, total: file.size });
    xhr.send(form);
  });
}

export interface UploadOptions {
  /** Bytes sent so far (from 0 to the file's size). */
  onProgress?: (p: UploadProgress) => void;
  /** The file has arrived; the API is checking it. */
  onChecking?: () => void;
  /** Cancels the upload: it then rejects with an ApiError whose code is 'aborted'. */
  signal?: AbortSignal;
  /** The name to declare, when it isn't the file's own (a pasted picture: 'image' -> 'image.png'). */
  fileName?: string;
}

/**
 * Send one file: presign, upload with progress, then let the API check what arrived. Resolves to the checked
 * upload (`uploadId`, and `mediaUrl` for a forum picture). Rejects with an ApiError: show it with
 * uploadErrorMessage(e, purpose).
 */
export async function uploadFile(purpose: UploadPurpose, file: File, { onProgress, onChecking, signal, fileName = file.name }: UploadOptions = {}): Promise<UploadOut> {
  const contentType = uploadContentType(purpose, fileName) ?? (file.type || 'application/octet-stream');
  try {
    const target = await call(api.POST('/api/v1/uploads', { body: { purpose, fileName, contentType, sizeBytes: file.size }, signal }));
    if (file.size > target.maxBytes) throw tooLarge(purpose);
    await postToBucket(target, file, purpose, onProgress, signal);
    onChecking?.();
    return await call(api.POST('/api/v1/uploads/{upload_id}/complete', { params: { path: { upload_id: target.uploadId } }, signal }));
  } catch (e) {
    // A cancelled request fails like a lost connection: say what really happened.
    if (signal?.aborted) throw abortedError();
    throw e;
  }
}
