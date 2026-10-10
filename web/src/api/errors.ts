// Every API failure arrives as { error: { code, message, fields?, retryAfter? } } (api/app/core/errors.py).

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string> | null;
  retryAfter?: number | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  readonly retryAfter: number | null;

  constructor({ status, code, message, fields, retryAfter, cause }: ApiErrorInit) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields ?? {};
    this.retryAfter = retryAfter ?? null;
  }

  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> | null; retryAfter?: number | null };
}

export function toApiError(response: Response, body: unknown): ApiError {
  const e = (body as ErrorBody | undefined)?.error;
  return new ApiError({
    status: response.status,
    code: e?.code ?? (response.status >= 500 ? 'internal' : 'error'),
    message: e?.message ?? (response.status >= 500 ? 'Something went wrong on our side.' : 'Request failed.'),
    fields: e?.fields ?? null,
    retryAfter: e?.retryAfter ?? null,
  });
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

/** A message fit to show a person, whatever was thrown. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiError) return e.message;
  return fallback;
}
