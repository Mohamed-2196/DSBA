// Every API failure arrives as { error: { code, message, fields?, retryAfter? } } (api/app/core/errors.py).
import type { ErrorDetail } from './schema';

/** The codes the API answers with (api/app/schemas/common.py ErrorCode), and those the web app makes itself when
 *  the request never got an answer: 'network', 'aborted', and the bucket refusing or failing an upload. Branch on
 *  these, never on messages: a typo in a code is a type error (code quality review CQ-10). */
export type ApiErrorCode = ErrorDetail['code'] | 'network' | 'aborted' | 'upload_refused' | 'upload_failed';

export interface ApiErrorInit {
  status: number;
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string> | null;
  retryAfter?: number | null;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
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
  error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> | null; retryAfter?: number | null };
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

/** The request never reached the API (offline, DNS, the server down behind the proxy). */
export const NETWORK_MESSAGE = 'Couldn’t reach the Hub. Check your connection and try again.';
/** The API failed, or the app did: not something the person can fix by checking their Wi-Fi (UX review UX-10). */
export const SERVER_MESSAGE = 'Something went wrong on our side. Try again in a minute.';

/** True when the request never got an answer, so the connection is the likely cause. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.code === 'network';
}

/**
 * A message fit to show a person after an action failed, whatever was thrown: the API's own message (it says what
 * to do: "Try another title."), the connection message when there was no answer, and `fallback` for anything else
 * (a bug of ours: its text is not for people). The one helper for every area (code quality review CQ-5).
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.code === 'network') return NETWORK_MESSAGE;
  if (e.code === 'internal') return SERVER_MESSAGE;
  return e.message || fallback;
}

/**
 * What to say under "… didn't load" (UX-10): blame the connection only when there was no answer. A refusal the
 * person can act on (403, 404, 429) keeps the API's message; a server failure or a bug of ours says so.
 */
export function loadProblem(e: unknown): string {
  if (!(e instanceof ApiError)) return SERVER_MESSAGE;
  if (e.code === 'network') return NETWORK_MESSAGE;
  if (e.status >= 500 || e.code === 'internal' || e.code === 'error' || !e.message) return SERVER_MESSAGE;
  return e.message;
}
