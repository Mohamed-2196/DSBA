import { afterEach, describe, expect, it, vi } from 'vitest';

// The API client captures fetch when it is created, needs an origin outside a browser and reads the CSRF cookie:
// set them up before it loads.
const net = vi.hoisted(() => {
  vi.stubEnv('VITE_API_ORIGIN', 'http://hub.test');
  const state = {
    requests: [] as { method: string; path: string; body: unknown }[],
    answer: (method: string, path: string): Response => new Response(JSON.stringify({ method, path }), { status: 500 }),
  };
  Object.assign(globalThis, {
    document: { cookie: 'dsba_csrf=test-token' },
    fetch: async (input: Request) => {
      const path = new URL(input.url, 'http://hub.test').pathname;
      const text = input.method === 'GET' ? '' : await input.text();
      state.requests.push({ method: input.method, path, body: text ? (JSON.parse(text) as unknown) : null });
      return state.answer(input.method, path);
    },
  });
  return state;
});

import { ApiError, NETWORK_MESSAGE } from './errors';
import {
  UPLOAD_RULES,
  bucketError,
  canRetryUpload,
  checkUpload,
  fileExtension,
  formatSize,
  maxUploadBytes,
  progressPercent,
  progressText,
  uploadContentType,
  uploadErrorMessage,
  uploadFile,
  waitLabel,
} from './uploads';

const MB = 1024 * 1024;
const fileOf = (name: string, size: number, type = '') => ({ name, size, type });

describe('file names and types', () => {
  it('reads the extension as the API does', () => {
    expect(fileExtension('Week 3 notes.PDF')).toBe('pdf');
    expect(fileExtension('model.final.ipynb')).toBe('ipynb');
    expect(fileExtension('script.R')).toBe('r');
    expect(fileExtension('.pdf')).toBeNull();
    expect(fileExtension('notes')).toBeNull();
    expect(fileExtension('notes.')).toBeNull();
    expect(fileExtension(null)).toBeNull();
  });

  it('declares the allowlist type, whatever the browser says', () => {
    expect(uploadContentType('library', 'nb.ipynb')).toBe('application/x-ipynb+json');
    expect(uploadContentType('library', 'analysis.R')).toBe('text/x-r');
    expect(uploadContentType('library', 'board.JPEG')).toBe('image/jpeg');
    expect(uploadContentType('library', 'scan.webp')).toBe('image/webp');
    expect(uploadContentType('library', 'meme.gif')).toBeNull();
    expect(uploadContentType('library', 'setup.exe')).toBeNull();
    expect(uploadContentType('forum_image', 'meme.gif')).toBe('image/gif');
    expect(uploadContentType('forum_image', 'notes.pdf')).toBeNull();
  });

  it('lets the library picker offer pictures (D9)', () => {
    const accept = UPLOAD_RULES.library.accept.split(',');
    expect(accept).toEqual(
      expect.arrayContaining(['.pdf', '.R', '.r', '.jpg', '.jpeg', '.png', '.webp', 'image/jpeg']),
    );
    expect(accept).not.toContain('.gif');
    expect(UPLOAD_RULES.library.summary).toContain('JPG, PNG or WebP');
    expect(UPLOAD_RULES.library.summary).toContain('50 MB');
  });

  it('knows each purpose’s limit', () => {
    expect(maxUploadBytes('library')).toBe(50 * MB);
    expect(maxUploadBytes('forum_image')).toBe(8 * MB);
  });
});

describe('formatSize', () => {
  it.each([
    [0, '0 KB'],
    [1, '1 KB'],
    [412 * 1024, '412 KB'],
    [999 * 1024, '999 KB'],
    [1000 * 1024, '1.0 MB'],
    [3.4 * MB, '3.4 MB'],
    [23.4 * MB, '23 MB'],
  ])('%s bytes is %s', (bytes, label) => {
    expect(formatSize(bytes)).toBe(label);
  });

  it('says nothing for an unknown size', () => {
    expect(formatSize(null)).toBe('');
    expect(formatSize(undefined)).toBe('');
    expect(formatSize(Number.NaN)).toBe('');
  });
});

describe('checkUpload', () => {
  it('takes what the API takes', () => {
    expect(checkUpload('library', fileOf('ST2133 notes.pdf', 1200))).toBeNull();
    expect(checkUpload('library', fileOf('whiteboard.jpg', 3 * MB))).toBeNull();
    expect(checkUpload('forum_image', fileOf('graph.png', 2 * MB))).toBeNull();
  });

  it('refuses other types, saying what to use', () => {
    expect(checkUpload('library', fileOf('setup.exe', 1000))).toBe(
      `This type of file can’t be added to the library. ${UPLOAD_RULES.library.allowed}`,
    );
    expect(checkUpload('forum_image', fileOf('notes.pdf', 1000))).toBe(
      'That file type can’t be attached. Use a PNG, JPEG, WebP or GIF image.',
    );
  });

  it('refuses empty and oversized files', () => {
    expect(checkUpload('library', fileOf('empty.csv', 0))).toBe('That file is empty. Choose another one.');
    expect(checkUpload('library', fileOf('big.pdf', 51 * MB))).toBe(
      'That file is 51 MB, over the 50 MB limit. Compress it or split it into parts.',
    );
    expect(checkUpload('forum_image', fileOf('photo.jpg', 9 * MB))).toContain('over the 8 MB limit');
  });

  it('checks the name to be declared when one is given', () => {
    expect(checkUpload('forum_image', fileOf('image', 1000), 'image.png')).toBeNull();
  });
});

describe('progress', () => {
  it('shows sizes only once bytes have moved (UX-12)', () => {
    expect(progressText({ loaded: 0, total: 1024 })).toBe('Uploading… 0%');
    expect(progressText({ loaded: 2.1 * MB, total: 5 * MB })).toBe('Uploading… 42% (2.1 MB of 5.0 MB)');
  });

  it('stays between 0 and 100', () => {
    expect(progressPercent({ loaded: 0, total: 0 })).toBe(0);
    expect(progressPercent({ loaded: 20, total: 10 })).toBe(100);
  });
});

describe('bucketError', () => {
  const xml = (code: string) =>
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>No.</Message></Error>`;

  it('reads S3’s XML', () => {
    const e = bucketError(400, xml('EntityTooLarge'), 'library');
    expect([e.code, e.message]).toEqual([
      'too_large',
      'That file is over the 50 MB limit. Compress it or split it into parts.',
    ]);
    expect(bucketError(400, xml('RequestTimeout'), 'library').message).toContain('took too long');
    expect(bucketError(503, xml('SlowDown'), 'forum_image').message).toBe(
      'File storage is busy. Try again in a moment.',
    );
  });

  it('treats a refused policy as an expired form', () => {
    expect(bucketError(403, xml('AccessDenied'), 'library').code).toBe('upload_refused');
    expect(bucketError(403, '', 'library').code).toBe('upload_refused');
  });

  it('falls back to a plain failure', () => {
    const e = bucketError(500, 'Bad gateway', 'library');
    expect([e.code, e.message]).toEqual(['upload_failed', 'The file couldn’t be uploaded. Try again in a moment.']);
  });
});

describe('uploadErrorMessage', () => {
  const err = (code: ApiError['code'], message = '', extra: Partial<{ status: number; retryAfter: number }> = {}) =>
    new ApiError({ status: extra.status ?? 409, code, message, retryAfter: extra.retryAfter });

  it('shows the API’s own words', () => {
    const pending = 'You have 10 files waiting for review. Share more once a student rep has looked at them.';
    expect(uploadErrorMessage(err('too_many_pending', pending), 'library')).toBe(pending);
    const mismatch =
      "This isn't a real .pdf file: what's inside doesn't match its name. Save or export it again, or choose another file.";
    expect(uploadErrorMessage(err('mismatch', mismatch, { status: 422 }), 'library')).toBe(mismatch);
    expect(
      uploadErrorMessage(
        err('forbidden', 'Your account is suspended. Contact a student rep.', { status: 403 }),
        'library',
      ),
    ).toBe('Your account is suspended. Contact a student rep.');
  });

  it('has words when the API gave none', () => {
    expect(uploadErrorMessage(err('rate_limited', '', { status: 429, retryAfter: 700 }), 'library')).toBe(
      'You’ve uploaded a lot in the last hour. Try again in 12 minutes.',
    );
    expect(uploadErrorMessage(err('too_large', '', { status: 422 }), 'forum_image')).toBe(
      'That image is over the 8 MB limit. Save a smaller copy and try again.',
    );
    expect(uploadErrorMessage(err('unsupported_type', '', { status: 422 }), 'library')).toContain(
      'can’t be added to the library',
    );
  });

  it('blames the connection only when there was no answer', () => {
    expect(uploadErrorMessage(new ApiError({ status: 0, code: 'network', message: 'x' }), 'library')).toBe(
      NETWORK_MESSAGE,
    );
    expect(
      uploadErrorMessage(
        new ApiError({ status: 500, code: 'internal', message: 'Something went wrong on our side.' }),
        'library',
      ),
    ).toBe('Something went wrong on our side. Try again in a minute.');
    expect(uploadErrorMessage(new Error('boom'), 'library')).toBe('Something went wrong. Try again.');
  });

  it('knows what a retry can fix', () => {
    expect(canRetryUpload(err('upload_failed', 'x', { status: 0 }))).toBe(true);
    expect(canRetryUpload(err('too_large', 'x', { status: 422 }))).toBe(false);
    expect(canRetryUpload(err('mismatch', 'x', { status: 422 }))).toBe(false);
    expect(canRetryUpload(err('too_many_pending', 'x'))).toBe(false);
  });

  it('says how long to wait', () => {
    expect(waitLabel(30)).toBe('a minute');
    expect(waitLabel(600)).toBe('10 minutes');
    expect(waitLabel(3500)).toBe('an hour');
  });
});

// ── The whole pipeline, with a stand-in bucket ──────────────────────────────────

type Script = { status: number; body?: string; progress?: number[] } | 'network-error' | 'hang';

class FakeXhr {
  static script: Script = { status: 204 };
  static last: FakeXhr | null = null;
  status = 0;
  responseText = '';
  withCredentials = true;
  method = '';
  url = '';
  sent: FormData | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
    FakeXhr.last = this;
  }

  abort() {
    this.onabort?.();
  }

  send(body: FormData) {
    this.sent = body;
    const script = FakeXhr.script;
    setTimeout(() => {
      if (script === 'hang') return;
      if (script === 'network-error') {
        this.onerror?.();
        return;
      }
      for (const loaded of script.progress ?? [])
        this.upload.onprogress?.({ lengthComputable: true, loaded, total: 2000 });
      this.status = script.status;
      this.responseText = script.body ?? '';
      this.onload?.();
    }, 0);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const UPLOAD_ID = '6f1c2b0e-8d2a-4a8f-9f62-0d6c2c1f9a11';

function serveUploads({ presign = 201, complete = 200 }: { presign?: number; complete?: number } = {}) {
  net.answer = (method, path) => {
    if (method === 'POST' && path === '/api/v1/uploads') {
      if (presign !== 201)
        return json(presign, { error: { code: 'too_many_pending', message: 'You have 10 files waiting for review.' } });
      return json(201, {
        uploadId: UPLOAD_ID,
        url: 'https://bucket.test/dsba-hub',
        fields: { key: `incoming/${UPLOAD_ID}`, 'Content-Type': 'x', policy: 'p' },
        expiresIn: 300,
        maxBytes: 1000,
      });
    }
    if (method === 'POST' && path === `/api/v1/uploads/${UPLOAD_ID}/complete`) {
      if (complete !== 200)
        return json(complete, { error: { code: 'mismatch', message: 'This isn’t a real .pdf file.' } });
      return json(200, {
        uploadId: UPLOAD_ID,
        status: 'uploaded',
        fileName: 'nb.ipynb',
        contentType: 'application/x-ipynb+json',
        sizeBytes: 1000,
        mediaUrl: null,
      });
    }
    return json(404, { error: { code: 'not_found', message: 'No.' } });
  };
}

describe('uploadFile', () => {
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  afterEach(() => {
    net.requests = [];
    FakeXhr.script = { status: 204 };
    FakeXhr.last = null;
  });

  it('presigns with the declared type, posts the form, then has the API check it', async () => {
    serveUploads();
    FakeXhr.script = { status: 204, progress: [0, 1000, 2000] };
    const seen: number[] = [];
    let checking = false;
    const file = new File(['x'.repeat(1000)], 'nb.ipynb', { type: '' });
    const out = await uploadFile('library', file, {
      onProgress: (p) => seen.push(p.loaded),
      onChecking: () => (checking = true),
    });

    expect(out.uploadId).toBe(UPLOAD_ID);
    expect(checking).toBe(true);
    expect(net.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /api/v1/uploads',
      `POST /api/v1/uploads/${UPLOAD_ID}/complete`,
    ]);
    expect(net.requests[0].body).toEqual({
      purpose: 'library',
      fileName: 'nb.ipynb',
      contentType: 'application/x-ipynb+json',
      sizeBytes: 1000,
    });

    const xhr = FakeXhr.last;
    expect([xhr?.method, xhr?.url, xhr?.withCredentials]).toEqual(['POST', 'https://bucket.test/dsba-hub', false]);
    expect([...(xhr?.sent?.keys() ?? [])]).toEqual(['key', 'Content-Type', 'policy', 'file']); // the file comes last
    expect(seen).toEqual([0, 0, 500, 1000, 1000]); // scaled to the file, ending at its size
  });

  it('declares a renamed picture under its new name', async () => {
    serveUploads();
    await uploadFile('forum_image', new File(['x'.repeat(1000)], 'image', { type: 'image/png' }), {
      fileName: 'image.png',
    });
    expect(net.requests[0].body).toMatchObject({
      purpose: 'forum_image',
      fileName: 'image.png',
      contentType: 'image/png',
    });
  });

  it('passes the API’s refusals on', async () => {
    serveUploads({ presign: 409 });
    const e = await uploadFile('library', new File(['x'], 'a.pdf')).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).code).toBe('too_many_pending');
    expect(FakeXhr.last).toBeNull(); // nothing was sent to the bucket
  });

  it('reports a bucket refusal and a lost connection', async () => {
    serveUploads();
    FakeXhr.script = { status: 403, body: '<Error><Code>AccessDenied</Code></Error>' };
    await expect(uploadFile('library', new File(['x'], 'a.pdf'))).rejects.toMatchObject({ code: 'upload_refused' });
    FakeXhr.script = 'network-error';
    await expect(uploadFile('library', new File(['x'], 'a.pdf'))).rejects.toMatchObject({ code: 'upload_failed' });
  });

  it('says a contents check failed', async () => {
    serveUploads({ complete: 422 });
    await expect(uploadFile('library', new File(['<html>'], 'a.pdf'))).rejects.toMatchObject({ code: 'mismatch' });
  });

  it('stops when cancelled', async () => {
    serveUploads();
    FakeXhr.script = 'hang';
    const controller = new AbortController();
    const pending = uploadFile('library', new File(['x'], 'a.pdf'), { signal: controller.signal });
    await vi.waitFor(() => expect(FakeXhr.last?.sent).toBeTruthy());
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'aborted' });
    expect(net.requests.map((r) => r.path)).toEqual(['/api/v1/uploads']); // never completed
  });
});
